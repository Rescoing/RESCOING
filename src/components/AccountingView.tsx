/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ReactNode } from 'react';
import { 
  Plus, 
  Trash2, 
  FileSpreadsheet, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  BookOpen, 
  Layers, 
  HelpCircle,
  Calendar,
  Layers2,
  Bookmark,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calculator
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './FirebaseProvider';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { AccountingEntry, AccountingEntryItem, Invoice, PurchaseInvoice, AccountOption } from '../types';

// Default Chilean Standard Chart of Accounts (Plan de Cuentas)
const DEFAULT_ACCOUNTS: AccountOption[] = [
  // ACTIVO
  { code: '1-01-001', name: 'Caja', type: 'Activo' },
  { code: '1-01-002', name: 'Banco Estado / Principal', type: 'Activo' },
  { code: '1-01-003', name: 'Clientes Nacionales', type: 'Activo' },
  { code: '1-01-004', name: 'IVA Crédito Fiscal', type: 'Activo' },
  { code: '1-01-005', name: 'Mercaderías / Existencias', type: 'Activo' },
  { code: '1-01-006', name: 'PPM por Recuperar', type: 'Activo' },
  { code: '1-02-001', name: 'Maquinarias y Equipos', type: 'Activo' },
  { code: '1-02-002', name: 'Herramientas Operacionales', type: 'Activo' },
  // PASIVO
  { code: '2-01-001', name: 'Proveedores Nacionales', type: 'Pasivo' },
  { code: '2-01-002', name: 'IVA Débito Fiscal', type: 'Pasivo' },
  { code: '2-01-003', name: 'Retenciones de Impuestos', type: 'Pasivo' },
  { code: '2-01-004', name: 'Leyes Sociales por Pagar', type: 'Pasivo' },
  { code: '2-01-005', name: 'Acreedores Varios', type: 'Pasivo' },
  // PATRIMONIO
  { code: '3-01-001', name: 'Capital Social', type: 'Patrimonio' },
  { code: '3-01-002', name: 'Resultados Acumulados', type: 'Patrimonio' },
  // INGRESOS
  { code: '4-01-001', name: 'Ingresos por Ventas / Servicios', type: 'Ingreso' },
  { code: '4-01-002', name: 'Otros Ingresos No Operacionales', type: 'Ingreso' },
  // EGRESOS / GASTOS
  { code: '5-01-001', name: 'Costo de Ventas', type: 'Egreso' },
  { code: '5-01-002', name: 'Gastos de Administración', type: 'Egreso' },
  { code: '5-01-003', name: 'Sueldos y Remuneraciones', type: 'Egreso' },
  { code: '5-01-004', name: 'Pago PPM Mensual', type: 'Egreso' },
  { code: '5-01-005', name: 'Gastos de Oficina y Servicios Básicos', type: 'Egreso' },
  { code: '5-01-006', name: 'Patentes, Tasas y Permisos', type: 'Egreso' }
];

export default function AccountingView() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'libro_diario' | 'plan_cuentas' | 'balances' | 'f29' | 'f22'>('libro_diario');
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<Invoice[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Chart of accounts state
  const [chartOfAccounts, setChartOfAccounts] = useState<AccountOption[]>(DEFAULT_ACCOUNTS);
  const [newAccount, setNewAccount] = useState<{ code: string; name: string; type: AccountOption['type'] }>({
    code: '',
    name: '',
    type: 'Activo'
  });
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Journal Entry modal & form state
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryGlosa, setEntryGlosa] = useState('');
  const [refType, setRefType] = useState('');
  const [refFolio, setRefFolio] = useState('');
  const [newEntryItems, setNewEntryItems] = useState<AccountingEntryItem[]>([
    { accountCode: '1-01-001', accountName: 'Caja', debit: 0, credit: 0 },
    { accountCode: '4-01-001', accountName: 'Ingresos por Ventas / Servicios', debit: 0, credit: 0 }
  ]);

  // Formulario 29 Config / PPM Rate
  const [ppmRate, setPpmRate] = useState<number>(1.2); // Default Chilean PPM Rate is often ~1-1.5%

  // Formulario 22 (Annual Income / Operación Renta) Config
  const [f22Regime, setF22Regime] = useState<'D3' | 'D8' | '14A'>('D3'); // D3 = Propyme General (10%), D8 = Transparente (0%), 14A = Reg. General (27%)
  const [f22Year, setF22Year] = useState<number>(new Date().getFullYear()); // e.g. 2026/2027
  const [f22GastosRechazados, setF22GastosRechazados] = useState<number>(0);
  const [f22IngresosNoGravados, setF22IngresosNoGravados] = useState<number>(0);
  const [f22ManualPpm, setF22ManualPpm] = useState<number | null>(null);

  // Error/Success state
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Load from Firebase
  useEffect(() => {
    if (!user) return;

    // Fetch Accounting Entries
    const qEntries = query(collection(db, 'accountingEntries'), where('ownerId', '==', user.uid));
    const unsubEntries = onSnapshot(qEntries, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccountingEntry));
      // Sort by date then folio descending
      fetched.sort((a, b) => b.date.localeCompare(a.date) || b.folio - a.folio);
      setEntries(fetched);
    }, (err) => {
      console.error("Error fetching accounting entries:", err);
    });

    // Fetch Invoices (Sales)
    const qSales = query(collection(db, 'invoices'), where('ownerId', '==', user.uid));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      setSalesInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    });

    // Fetch PurchaseInvoices (Purchases)
    const qPurchases = query(collection(db, 'purchaseInvoices'), where('ownerId', '==', user.uid));
    const unsubPurchases = onSnapshot(qPurchases, (snapshot) => {
      setPurchaseInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseInvoice)));
      setLoading(false);
    });

    // Load custom accounts from localStorage if saved
    const savedChart = localStorage.getItem(`chartOfAccounts_${user.uid}`);
    if (savedChart) {
      try {
        setChartOfAccounts(JSON.parse(savedChart));
      } catch (e) {
        console.error(e);
      }
    }

    // Load PPM Rate from localStorage if saved
    const savedPpmRate = localStorage.getItem(`ppmRate_${user.uid}`);
    if (savedPpmRate) {
      const parsed = parseFloat(savedPpmRate);
      if (!isNaN(parsed)) {
        setPpmRate(parsed);
      }
    }

    // Load F22 states
    const savedF22Regime = localStorage.getItem(`f22Regime_${user.uid}`);
    if (savedF22Regime) {
      setF22Regime(savedF22Regime as any);
    }
    const savedF22Year = localStorage.getItem(`f22Year_${user.uid}`);
    if (savedF22Year) {
      setF22Year(parseInt(savedF22Year, 10));
    }
    const savedF22Gastos = localStorage.getItem(`f22Gastos_${user.uid}`);
    if (savedF22Gastos) {
      setF22GastosRechazados(parseInt(savedF22Gastos, 10) || 0);
    }
    const savedF22Ingresos = localStorage.getItem(`f22Ingresos_${user.uid}`);
    if (savedF22Ingresos) {
      setF22IngresosNoGravados(parseInt(savedF22Ingresos, 10) || 0);
    }
    const savedF22ManualPpm = localStorage.getItem(`f22ManualPpm_${user.uid}`);
    if (savedF22ManualPpm) {
      setF22ManualPpm(savedF22ManualPpm === 'null' ? null : parseInt(savedF22ManualPpm, 10));
    }

    return () => {
      unsubEntries();
      unsubSales();
      unsubPurchases();
    };
  }, [user]);

  // Handle adding an account row to the modal form
  const addEntryItemRow = () => {
    setNewEntryItems([
      ...newEntryItems,
      { accountCode: '1-01-002', accountName: 'Banco Estado / Principal', debit: 0, credit: 0 }
    ]);
  };

  // Handle removing an item row
  const removeEntryItemRow = (index: number) => {
    if (newEntryItems.length <= 2) {
      alert("Un asiento contable requiere al menos 2 cuentas para cumplir partida doble.");
      return;
    }
    setNewEntryItems(newEntryItems.filter((_, i) => i !== index));
  };

  // Handle value changes in the item row
  const handleItemFieldChange = (index: number, field: 'accountCode' | 'debit' | 'credit', value: any) => {
    const updated = [...newEntryItems];
    if (field === 'accountCode') {
      const matched = chartOfAccounts.find(a => a.code === value);
      updated[index].accountCode = value;
      updated[index].accountName = matched ? matched.name : '';
    } else {
      updated[index][field] = Number(value) || 0;
    }
    setNewEntryItems(updated);
  };

  const totalDebits = newEntryItems.reduce((sum, item) => sum + item.debit, 0);
  const totalCredits = newEntryItems.reduce((sum, item) => sum + item.credit, 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  // Add Custom Account
  const handleAddAccount = () => {
    if (!newAccount.code || !newAccount.name) {
      alert("Por favor rellene el código y nombre de la cuenta");
      return;
    }
    // Prevent duplicate codes
    if (chartOfAccounts.some(a => a.code === newAccount.code)) {
      alert("Ya existe una cuenta con este código");
      return;
    }
    const updated = [...chartOfAccounts, newAccount].sort((a, b) => a.code.localeCompare(b.code));
    setChartOfAccounts(updated);
    if (user) {
      localStorage.setItem(`chartOfAccounts_${user.uid}`, JSON.stringify(updated));
    }
    setNewAccount({ code: '', name: '', type: 'Activo' });
    setShowAccountModal(false);
  };

  // Reset entry form
  const resetEntryForm = () => {
    setEntryDate(new Date().toISOString().split('T')[0]);
    setEntryGlosa('');
    setRefType('');
    setRefFolio('');
    setNewEntryItems([
      { accountCode: '1-01-001', accountName: 'Caja', debit: 0, credit: 0 },
      { accountCode: '4-01-001', accountName: 'Ingresos por Ventas / Servicios', debit: 0, credit: 0 }
    ]);
    setErrorMsg('');
  };

  // Save entry to Firebase
  const handleSaveEntry = async () => {
    if (!user) return;
    if (!entryGlosa.trim()) {
      setErrorMsg("Debe ingresar la glosa explicativa del asiento.");
      return;
    }
    if (!isBalanced) {
      setErrorMsg(`La partida doble no cuadra. Débitos: $${totalDebits.toLocaleString()} v/s Créditos: $${totalCredits.toLocaleString()}`);
      return;
    }
    if (newEntryItems.some(item => item.debit === 0 && item.credit === 0)) {
      setErrorMsg("Todas las cuentas ingresadas deben tener un cargo (débito) o abono (crédito) mayor que cero.");
      return;
    }

    try {
      // Determine folio sequentially
      const nextFolio = entries.length > 0 ? Math.max(...entries.map(e => e.folio || 0)) + 1 : 1;
      
      const payload: Omit<AccountingEntry, 'id'> = {
        ownerId: user.uid,
        folio: nextFolio,
        date: entryDate,
        glosa: entryGlosa,
        items: newEntryItems,
        refType: refType || undefined,
        refFolio: refFolio || undefined,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'accountingEntries'), payload);
      setSuccessMsg("Asiento contable registrado con éxito.");
      setTimeout(() => setSuccessMsg(''), 4000);
      setShowEntryModal(false);
      resetEntryForm();
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Error al guardar asiento en la base de datos.");
    }
  };

  // Automated Asiento Generation from Sales Invoice
  const generateAutomatedSaleEntry = (inv: Invoice) => {
    setEntryDate(inv.date);
    setEntryGlosa(`Reconocimiento venta e IVA débito, FAC #${inv.siiFolio || inv.id.substring(0, 8).toUpperCase()}`);
    setRefType('Factura de Venta');
    setRefFolio(inv.siiFolio || inv.id.substring(0, 8).toUpperCase());
    setNewEntryItems([
      { accountCode: '1-01-003', accountName: 'Clientes Nacionales', debit: inv.totalAmount, credit: 0 },
      { accountCode: '2-01-002', accountName: 'IVA Débito Fiscal', debit: 0, credit: inv.iva },
      { accountCode: '4-01-001', accountName: 'Ingresos por Ventas / Servicios', debit: 0, credit: inv.netAmount }
    ]);
    setShowEntryModal(true);
  };

  // Automated Asiento Generation from Purchase Invoice
  const generateAutomatedPurchaseEntry = (inv: PurchaseInvoice) => {
    setEntryDate(inv.date);
    setEntryGlosa(`Reconocimiento de compra de mercaderías/gastos correlativos a ID ${inv.supplierId || 'Proveedor'}`);
    setRefType('Factura de Compra');
    setRefFolio(inv.folio || inv.id.substring(0, 8).toUpperCase());
    
    // Calculate estimated net/vat from total
    const total = inv.totalAmount || 0;
    const net = Math.round(total / 1.19);
    const iva = total - net;

    setNewEntryItems([
      { accountCode: '5-01-002', accountName: 'Gastos de Administración', debit: net, credit: 0 },
      { accountCode: '1-01-004', accountName: 'IVA Crédito Fiscal', debit: iva, credit: 0 },
      { accountCode: '2-01-001', accountName: 'Proveedores Nacionales', debit: 0, credit: total }
    ]);
    setShowEntryModal(true);
  };

  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm("¿Está seguro que desea eliminar este asiento contable? Se alterará el balance de forma inmediata.")) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'accountingEntries', id));
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el asiento contable.");
    }
  };

  // ---------------- BALANCE DE 8 COLUMNAS MATHS ----------------
  const calculateBalance8Columns = () => {
    // 1. Initialize map for keys
    const accountSumMap: Record<string, { debit: number; credit: number }> = {};
    chartOfAccounts.forEach(acc => {
      accountSumMap[acc.code] = { debit: 0, credit: 0 };
    });

    // 2. Accumulate all entry amounts
    entries.forEach(entry => {
      entry.items.forEach(item => {
        if (!accountSumMap[item.accountCode]) {
          // If custom account wasn't pre-loaded, add dynamically
          accountSumMap[item.accountCode] = { debit: 0, credit: 0 };
        }
        accountSumMap[item.accountCode].debit += item.debit || 0;
        accountSumMap[item.accountCode].credit += item.credit || 0;
      });
    });

    // 3. Map into the 8 Columns layout
    const rows = Object.entries(accountSumMap).map(([code, sums]) => {
      const accountDef = chartOfAccounts.find(a => a.code === code) || { name: 'Cuenta Desconocida', type: 'Activo' as const };
      
      const debit = sums.debit;
      const credit = sums.credit;
      
      // Saldos (Debtor OR Creditor)
      let saldoDeudor = 0;
      let saldoAcreedor = 0;
      if (debit >= credit) {
        saldoDeudor = debit - credit;
      } else {
        saldoAcreedor = credit - debit;
      }

      // Columns 5 to 8 depend on account category:
      // Types: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Egreso'
      let activo = 0;
      let pasivo = 0;
      let perdida = 0;
      let ganancia = 0;

      if (accountDef.type === 'Activo') {
        activo = saldoDeudor;
      } else if (accountDef.type === 'Pasivo' || accountDef.type === 'Patrimonio') {
        pasivo = saldoAcreedor;
      } else if (accountDef.type === 'Egreso') {
        perdida = saldoDeudor;
      } else if (accountDef.type === 'Ingreso') {
        ganancia = saldoAcreedor;
      }

      return {
        code,
        name: accountDef.name,
        type: accountDef.type,
        debit,
        credit,
        saldoDeudor,
        saldoAcreedor,
        activo,
        pasivo,
        perdida,
        ganancia
      };
    }).filter(row => row.debit > 0 || row.credit > 0); // Only keep accounts with activity

    // Totals
    const totalSumDebits = rows.reduce((s, r) => s + r.debit, 0);
    const totalSumCredits = rows.reduce((s, r) => s + r.credit, 0);
    const totalSumSDeudor = rows.reduce((s, r) => s + r.saldoDeudor, 0);
    const totalSumSAcreedor = rows.reduce((s, r) => s + r.saldoAcreedor, 0);
    const totalSumActivo = rows.reduce((s, r) => s + r.activo, 0);
    const totalSumPasivo = rows.reduce((s, r) => s + r.pasivo, 0);
    const totalSumPerdida = rows.reduce((s, r) => s + r.perdida, 0);
    const totalSumGanancia = rows.reduce((s, r) => s + r.ganancia, 0);

    // Difference checks (Utilidad o Pérdida del Ejercicio)
    const diffInventario = Math.abs(totalSumActivo - totalSumPasivo);
    const diffResultados = Math.abs(totalSumPerdida - totalSumGanancia);
    const balancedCheck = Math.abs(diffInventario - diffResultados) < 2; // tolerating minor rounding differences

    return {
      rows,
      totals: {
        debit: totalSumDebits,
        credit: totalSumCredits,
        saldoDeudor: totalSumSDeudor,
        saldoAcreedor: totalSumSAcreedor,
        activo: totalSumActivo,
        pasivo: totalSumPasivo,
        perdida: totalSumPerdida,
        ganancia: totalSumGanancia,
        diffInventario,
        diffResultados,
        balancedCheck,
        netResult: totalSumGanancia - totalSumPerdida // Positive = Profit, Negative = Loss
      }
    };
  };

  const balance8ColData = calculateBalance8Columns();

  // Export balance to Excel
  const handleExportBalanceExcel = () => {
    const data = balance8ColData.rows.map(r => ({
      'Código': r.code,
      'Cuenta': r.name,
      'Tipo': r.type,
      'S. Débitos': r.debit,
      'S. Créditos': r.credit,
      'Saldo Deudor': r.saldoDeudor,
      'Saldo Acreedor': r.saldoAcreedor,
      'Activos': r.activo,
      'Pasivos': r.pasivo,
      'Pérdidas': r.perdida,
      'Ganancias': r.ganancia
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Balance_8_Columnas');
    XLSX.writeFile(workbook, `Balance_8_Columnas_ChileanSII_${new Date().getFullYear()}.xlsx`);
  };

  // Export Libro Diario to structured Excel for SII electronic audits
  const handleExportDiarioExcel = () => {
    // Sort chronological entries to guarantee alignment with correlative numbering
    const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.folio - b.folio);

    const diarioRows = sortedEntries.flatMap(entry => {
      return entry.items.map(item => ({
        'Número de Asiento (Correlativo)': entry.folio,
        'Fecha de Contabilización (AAAA-MM-DD)': entry.date,
        'Glosa del Asiento (Concepto)': entry.glosa,
        'Código Cuenta Contable': item.accountCode,
        'Nombre Cuenta Contable': item.accountName,
        'Monto Débito (Debe) CLP': item.debit || 0,
        'Monto Crédito (Haber) CLP': item.credit || 0,
        'Documento de Referencia': entry.refType || 'Asiento General Diario',
        'Folio Referencia': entry.refFolio || 'S/N'
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(diarioRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Libro_Diario_Fisc_SII');

    // Make the columns visually perfectly spaced and readable
    const colWidths = [
      { wch: 15 }, // Número de Asiento
      { wch: 18 }, // Fecha de Contabilización
      { wch: 45 }, // Glosa del Asiento
      { wch: 15 }, // Código Cuenta Contable
      { wch: 25 }, // Nombre Cuenta Contable
      { wch: 16 }, // Monto Débito
      { wch: 16 }, // Monto Crédito
      { wch: 22 }, // Documento de Referencia
      { wch: 15 }  // Folio Referencia
    ];
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `Libro_Diario_Fiscalizacion_SII_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Export Libro Mayor to structured Excel for SII electronic audits
  const handleExportLedgerExcel = () => {
    // Sort chronological entries
    const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.folio - b.folio);

    // Collect all active and defined account codes
    const activeCodes = new Set<string>();
    sortedEntries.forEach(e => e.items.forEach(item => activeCodes.add(item.accountCode)));
    const allCodes = Array.from(new Set([...chartOfAccounts.map(a => a.code), ...Array.from(activeCodes)]));
    allCodes.sort(); // Alphanumeric sort

    const mayorRows: any[] = [];

    allCodes.forEach(code => {
      const accountDef = chartOfAccounts.find(a => a.code === code) || { name: 'Cuenta Auxiliar Directa', type: 'Activo' as const };
      
      const movements: { entry: AccountingEntry; item: AccountingEntryItem }[] = [];
      sortedEntries.forEach(entry => {
        entry.items.forEach(item => {
          if (item.accountCode === code) {
            movements.push({ entry, item });
          }
        });
      });

      // Show accounts even with zero balance if requested, but for audit reports we only include rows with transactions.
      if (movements.length === 0) return;

      let progressiveBalance = 0;

      movements.forEach(({ entry, item }) => {
        const debit = item.debit || 0;
        const credit = item.credit || 0;

        // Balance calculation depending on Account Type
        // Activos/Egresos increase on Debit and decrease on Credit.
        // Pasivos/Patrimonio/Ingresos increase on Credit and decrease on Debit.
        const isAssetOrExpense = accountDef.type === 'Activo' || accountDef.type === 'Egreso';
        if (isAssetOrExpense) {
          progressiveBalance += (debit - credit);
        } else {
          progressiveBalance += (credit - debit);
        }

        mayorRows.push({
          'Código Cuenta Contable': code,
          'Nombre Cuenta Contable': accountDef.name,
          'Tipo de Cuenta': accountDef.type,
          'Folio / Número de Asiento': entry.folio,
          'Fecha Movimiento (AAAA-MM-DD)': entry.date,
          'Glosa de Operación': entry.glosa,
          'Débito / Debe CLP': debit,
          'Crédito / Haber CLP': credit,
          'Saldo Acumulado CLP': progressiveBalance,
          'Doc. Referencia': entry.refType || 'Asiento General Mayor',
          'Folio Referencia': entry.refFolio || 'S/N'
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(mayorRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Libro_Mayor_Fisc_SII');

    const colWidths = [
      { wch: 15 }, // Código Cuenta Contable
      { wch: 25 }, // Nombre Cuenta Contable
      { wch: 15 }, // Tipo de Cuenta
      { wch: 15 }, // Folio / Número de Asiento
      { wch: 18 }, // Fecha Movimiento
      { wch: 45 }, // Glosa de Operación
      { wch: 16 }, // Débito / Debe
      { wch: 16 }, // Crédito / Haber
      { wch: 18 }, // Saldo Acumulado
      { wch: 22 }, // Doc. Referencia
      { wch: 15 }  // Folio Referencia
    ];
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `Libro_Mayor_Fiscalizacion_SII_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Export ledger entries to PDF
  const handleExportLedgerPDF = () => {
    try {
      const pdf = new jsPDF() as any;
      pdf.setFillColor(30, 41, 59); // slate-800
      pdf.rect(0, 0, 210, 35, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.setFont("helvetica", "bold");
      pdf.text("LIBRO DIARIO DE CONTABILIDAD", 15, 22);
      pdf.setFontSize(10);
      pdf.text(`R.U.T: 76.543.210-K - RESCOING Ingeniería - Año ${new Date().getFullYear()}`, 15, 29);
      
      let currentY = 48;
      entries.forEach((e) => {
        if (currentY > 250) {
          pdf.addPage();
          currentY = 20;
        }
        
        pdf.setFillColor(248, 250, 252); // slate-50
        pdf.rect(15, currentY, 180, 8, 'F');
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(30, 41, 59);
        pdf.text(`FOLIO CONTABLE #${e.folio} | Fecha: ${e.date} | Glosa: ${e.glosa}`, 17, currentY + 6);
        currentY += 12;

        e.items.forEach(item => {
          if (currentY > 260) {
            pdf.addPage();
            currentY = 20;
          }
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(71, 85, 105);
          
          if (item.debit > 0) {
            pdf.text(`${item.accountCode} - ${item.accountName}`, 20, currentY);
            pdf.text(`$${item.debit.toLocaleString()}`, 130, currentY);
            pdf.text("---", 170, currentY);
          } else {
            pdf.text(`    ${item.accountCode} - ${item.accountName}`, 25, currentY);
            pdf.text("---", 130, currentY);
            pdf.text(`$${item.credit.toLocaleString()}`, 170, currentY);
          }
          currentY += 7;
        });
        currentY += 5;
      });

      pdf.save(`Libro_Diario_OficialContabilidad_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error(err);
    }
  };

  // Formulario 29 calculations:
  // F29 represents sales debit tax, purchases credit tax, PPM tax withheld
  const f29SalesNet = salesInvoices.reduce((sum, s) => sum + (s.netAmount || 0), 0);
  const f29SalesIva = salesInvoices.reduce((sum, s) => sum + (s.iva || 0), 0);
  const f29SalesCount = salesInvoices.length;

  const f29PurchasesCount = purchaseInvoices.length;
  const f29PurchasesTotal = purchaseInvoices.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
  const f29PurchasesNet = Math.round(f29PurchasesTotal / 1.19);
  const f29PurchasesIva = f29PurchasesTotal - f29PurchasesNet;

  // PPM matches Net Revenue * PPM Rate
  const ppmTaxDue = Math.round(f29SalesNet * (ppmRate / 100));
  // Total to pay = VAT debit - VAT credit + PPM
  const netIvaLiability = f29SalesIva - f29PurchasesIva;
  const totalF29Pagar = netIvaLiability > 0 ? (netIvaLiability + ppmTaxDue) : ppmTaxDue;
  const remanenteIva = netIvaLiability < 0 ? Math.abs(netIvaLiability) : 0;

  // ---------------- FORMULARIO 22 (RENTA ANUAL) MATHS & OPERATIONS ----------------
  // 1. Base Financial Result from 8 Columns Balance
  const f22NetResultFinanciero = balance8ColData.totals.netResult;

  // 2. Adjustments for RLI (Renta Líquida Imponible)
  const f22Rli = f22NetResultFinanciero + f22GastosRechazados - f22IngresosNoGravados;
  const f22IsLoss = f22Rli < 0;
  const f22RliDetermined = f22IsLoss ? 0 : f22Rli;

  // 3. IDPC Rates: 14 D3 = 10%, 14 A = 27%, 14 D8 = 0%
  const f22IdpcRate = f22Regime === 'D3' ? 10 : (f22Regime === '14A' ? 27 : 0);
  const f22IdpcTax = f22IsLoss ? 0 : Math.round(f22RliDetermined * (f22IdpcRate / 100));

  // 4. PPM Credit (from accounting entries mapped on PPM '1-01-006' or '5-01-004' accounts)
  const f22ComputedPpm = entries.reduce((sum, entry) => {
    let entryPpm = 0;
    entry.items.forEach(item => {
      if (item.accountCode === '1-01-006' || item.accountCode === '5-01-004') {
        entryPpm += (item.debit || 0);
      }
    });
    return sum + entryPpm;
  }, 0);
  const f22PpmValue = f22ManualPpm !== null ? f22ManualPpm : f22ComputedPpm;

  // 5. Final Annual Balance (IDPC Tax minus PPM Credited)
  const f22FinalBalance = f22IdpcTax - f22PpmValue;
  const f22IsRefund = f22FinalBalance < 0;
  const f22FinalBalanceAbs = Math.abs(f22FinalBalance);

  // Persistence updates
  const updateF22Regime = (val: 'D3' | 'D8' | '14A') => {
    setF22Regime(val);
    if (user) localStorage.setItem(`f22Regime_${user.uid}`, val);
  };
  const updateF22Year = (val: number) => {
    setF22Year(val);
    if (user) localStorage.setItem(`f22Year_${user.uid}`, val.toString());
  };
  const updateF22Gastos = (val: number) => {
    setF22GastosRechazados(val);
    if (user) localStorage.setItem(`f22Gastos_${user.uid}`, val.toString());
  };
  const updateF22Ingresos = (val: number) => {
    setF22IngresosNoGravados(val);
    if (user) localStorage.setItem(`f22Ingresos_${user.uid}`, val.toString());
  };
  const updateF22ManualPpm = (val: number | null) => {
    setF22ManualPpm(val);
    if (user) localStorage.setItem(`f22ManualPpm_${user.uid}`, val === null ? 'null' : val.toString());
  };

  // Export F22 layout to Excel
  const handleExportF22Excel = () => {
    const f22Rows = [
      { 'Componente': 'Año Tributario', 'Código SII': 'A.T.', 'Descripción': 'Año Tributario de Declaración', 'Valor CLP / Detalle': f22Year },
      { 'Componente': 'Régimen Tributario', 'Código SII': 'Régimen', 'Descripción': 'Régimen de Tributación LIR', 'Valor CLP / Detalle': f22Regime === 'D3' ? '14 D3 Propyme General' : f22Regime === 'D8' ? '14 D8 Propyme Transparente' : '14 A Régimen General' },
      { 'Componente': 'Resultado Financiero', 'Código SII': '[770]', 'Descripción': 'Resultado Neto del Ejercicio según Balance de 8 Columnas', 'Valor CLP / Detalle': f22NetResultFinanciero },
      { 'Componente': 'Agregamientos', 'Código SII': '[211]', 'Descripción': 'Gastos Rechazados pagados (Art. 21 LIR)', 'Valor CLP / Detalle': f22GastosRechazados },
      { 'Componente': 'Deducciones', 'Código SII': '[212]', 'Descripción': 'Ingresos No Gravados o dividendos exentos percibidos', 'Valor CLP / Detalle': -f22IngresosNoGravados },
      { 'Componente': 'Renta Líquida Imponible', 'Código SII': '[1007]', 'Descripción': 'Renta Líquida Imponible (RLI) Determinada', 'Valor CLP / Detalle': f22RliDetermined },
      { 'Componente': 'Tasa Impuesto', 'Código SII': 'Tasa', 'Descripción': 'Tasa del Impuesto de Primera Categoría (IDPC)', 'Valor CLP / Detalle': `${f22IdpcRate}%` },
      { 'Componente': 'Impuesto Determinado', 'Código SII': '[109]', 'Descripción': 'Impuesto de Primera Categoría (IDPC)', 'Valor CLP / Detalle': f22IdpcTax },
      { 'Componente': 'Pagos Provisionales', 'Código SII': '[162]', 'Descripción': 'Crédito por PPM (Pagos Provisionales Mensuales) Pagado', 'Valor CLP / Detalle': f22PpmValue },
      { 'Componente': 'Resultado Declaración', 'Código SII': f22IsRefund ? '[101]' : '[95]', 'Descripción': f22IsRefund ? 'Devolución de Impuesto Solicitada favorable' : 'Impuesto de Primera Categoría a Pagar en Caja', 'Valor CLP / Detalle': f22FinalBalanceAbs }
    ];

    const worksheet = XLSX.utils.json_to_sheet(f22Rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'F22_Declaracion_SII_Renta');

    const colWidths = [
      { wch: 25 }, // Componente
      { wch: 15 }, // Código SII
      { wch: 55 }, // Descripción
      { wch: 25 }  // Valor CLP / Detalle
    ];
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `Formulario_22_Simulacion_Rent_SII_${f22Year}.xlsx`);
  };

  // Export F22 layout to PDF
  const handleExportF22PDF = () => {
    try {
      const pdf = new jsPDF();
      
      // Top header decoration banner
      pdf.setFillColor(30, 58, 138); // Navy blue
      pdf.rect(10, 10, 190, 8, "F");
      
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(255, 255, 255);
      pdf.text(`SERVICIO DE IMPUESTOS INTERNOS - FORMULARIO 22 SIMULADO - OPERACION RENTA ${f22Year}`, 15, 15);
      
      // Business profile
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(12);
      pdf.text(`PROYECCIÓN AL CIERRE DE AÑO Y CUMPLIMIENTO LIR ${f22Year}`, 15, 30);
      
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(71, 85, 105);
      pdf.text(`Régimen de Tributación: ${f22Regime === 'D3' ? '14 D3 Propyme General (Tasa 10%)' : f22Regime === 'D8' ? '14 D8 Propyme Transparente (Tasa 0% - Atribuido)' : '14 A Régimen General (Tasa 27%)'}`, 15, 36);
      pdf.text(`Fecha de emisión de simulación: ${new Date().toLocaleDateString('es-CL')}`, 15, 41);
      pdf.text(`Usuario registrado: ${user?.email || 'Contribuyente Autorizado'}`, 15, 46);
      
      pdf.line(10, 51, 200, 51);
      
      // Table values
      let currentY = 60;
      const drawRow = (code: string, desc: string, value: string, isHeader = false) => {
        if (isHeader) {
          pdf.setFillColor(241, 245, 249);
          pdf.rect(10, currentY - 5, 190, 7, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 41, 59);
        } else {
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(51, 65, 85);
        }
        
        pdf.setFontSize(8.5);
        pdf.text(code, 15, currentY);
        pdf.text(desc, 35, currentY);
        pdf.setFont("helvetica", "bold");
        pdf.text(value, 160, currentY, { align: "right" });
        
        pdf.setDrawColor(226, 232, 240);
        pdf.line(10, currentY + 2, 200, currentY + 2);
        currentY += 8;
      };
      
      drawRow("CODIGO", "COMPONENTE DE RENTA / AJUSTES LIR", "VALOR SIMULADO CLP", true);
      drawRow("[770]", "Resultado Financiero Inicial (del Balance de 8 Columnas)", `$${f22NetResultFinanciero.toLocaleString()}`);
      drawRow("[211]", "(+) Agregados: Gastos Rechazados pagados (Art. 21 LIR)", `$${f22GastosRechazados.toLocaleString()}`);
      drawRow("[212]", "(-) Deducciones: Ingresos No Gravados/Exentos percibidos", `-$${f22IngresosNoGravados.toLocaleString()}`);
      drawRow("[1007]", "RENTA LÍQUIDA IMPONIBLE (RLI) DETERMINADA", `$${f22RliDetermined.toLocaleString()}`, true);
      drawRow("TASA", "Tasa del Impuesto de Primera Categoría aplicada", `${f22IdpcRate}%`);
      drawRow("[109]", "IMPUESTO DE PRIMERA CATEGORÍA DE SEGUNDA/PRIMERA GENERACIÓN", `$${f22IdpcTax.toLocaleString()}`);
      drawRow("[162]", "(-) Crédito por PPM (Pagos Provisionales Mensuales) Pagado", `$${f22PpmValue.toLocaleString()}`);
      
      currentY += 5;
      pdf.setFillColor(243, 244, 246);
      pdf.rect(10, currentY - 6, 190, 12, "F");
      
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      if (f22IsRefund) {
        pdf.setTextColor(16, 124, 65);
        pdf.text("[101]", 15, currentY);
        pdf.text("SALDO FAVORABLE - DEVOLUCIÓN SOLICITADA", 35, currentY);
        pdf.text(`$${f22FinalBalanceAbs.toLocaleString()}`, 160, currentY, { align: "right" });
      } else {
        pdf.setTextColor(185, 28, 28);
        pdf.text("[95]", 15, currentY);
        pdf.text("SALDO DE IMPUESTO A PAGAR EN ARCAS FISCALES", 35, currentY);
        pdf.text(`$${f22FinalBalanceAbs.toLocaleString()}`, 160, currentY, { align: "right" });
      }
      
      currentY += 20;
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(148, 163, 184);
      pdf.text("Esta declaración es una proyección de cumplimiento mercantil y contable. Valida con tu clave tributaria en SII Chile.", 15, currentY);
      
      pdf.save(`Formulario_22_Simulado_SII_${f22Year}.pdf`);
    } catch (err) {
      console.error(err);
    }
  };

  // Monthly validation compliance counter
  const currentMonthStr = new Date().toISOString().substring(0, 7); // e.g. "2026-05"
  const entriesThisMonth = entries.filter(e => e.date && e.date.startsWith(currentMonthStr));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black text-primary bg-primary/10 px-2.5 py-1 rounded-full uppercase tracking-widest leading-none">SII Chile - Cumplimiento Mercantil</span>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 mt-2">Módulo de Contabilidad Tributaria</h2>
          <p className="text-slate-500 mt-1">Sistemas de balance oficial contable, Libro Diario, Libro Mayor y Formulario 29 mensual.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Compliance counter for current month */}
          <div className="flex items-center gap-2 bg-blue-50/50 border border-blue-100 px-4 py-2.5 rounded-lg text-sm font-semibold text-blue-700 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
            </span>
            <span>Asientos este Mes:</span>
            <span className="font-mono bg-white text-blue-900 px-2 py-0.5 rounded border border-blue-200/50 shadow-sm">{entriesThisMonth.length}</span>
          </div>

          <button 
            onClick={() => setActiveTab('balances')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
              activeTab === 'balances' 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Scale size={16} />
            <span>Balance: {balance8ColData.totals.netResult >= 0 ? `+ $${balance8ColData.totals.netResult.toLocaleString()}` : `- $${Math.abs(balance8ColData.totals.netResult).toLocaleString()}`}</span>
          </button>
          <button 
            onClick={() => setShowEntryModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={18} />
            Nuevo Asiento Contable
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {[
          { id: 'libro_diario', label: 'Libro Diario (Chronological)', icon: BookOpen },
          { id: 'plan_cuentas', label: 'Plan de Cuentas (Chilean COA)', icon: Layers2 },
          { id: 'balances', label: 'Balance de 8 Columnas (Official)', icon: Scale },
          { id: 'f29', label: 'Formulario 29 (F29 IVA)', icon: FileText },
          { id: 'f22', label: 'Formulario 22 (F22 Renta)', icon: Calculator },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-all relative cursor-pointer
              ${activeTab === tab.id ? 'text-primary' : 'text-slate-500 hover:text-slate-700'}
            `}
          >
            <tab.icon size={18} />
            {tab.label}
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTabAccounting"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      {/* Filter and Content */}
      <div className="space-y-6">
        {activeTab === 'libro_diario' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  placeholder="Buscar por glosa, código de cuenta, folio contable o fecha..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-slate-800"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                <button 
                  onClick={handleExportLedgerPDF}
                  className="flex items-center gap-2 border border-slate-200 bg-white text-slate-600 px-4 py-2.5 rounded-lg font-bold text-xs hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                  title="Exportar Libro Diario en PDF listo para impresión foliada"
                >
                  <Download size={14} />
                  Exportar PDF Diario
                </button>
                <button 
                  onClick={handleExportDiarioExcel}
                  className="flex items-center gap-2 border border-blue-200 bg-blue-50 text-blue-700 px-4 py-2.5 rounded-lg font-bold text-xs hover:bg-blue-100 transition-colors shadow-sm cursor-pointer"
                  title="Exportar Libro Diario en formato estructurado de auditoría SII"
                >
                  <FileSpreadsheet size={14} className="text-blue-600" />
                  Excel Libro Diario SII
                </button>
                <button 
                  onClick={handleExportLedgerExcel}
                  className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-lg font-bold text-xs hover:bg-emerald-100 transition-colors shadow-sm cursor-pointer"
                  title="Exportar Libro Mayor en formato estructurado de auditoría SII"
                >
                  <FileSpreadsheet size={14} className="text-emerald-600" />
                  Excel Libro Mayor SII
                </button>
              </div>
            </div>

            {/* Quick integration warnings or recommendations */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-slate-800">Sincronización Automática SII Chile</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">La plataforma detectará tus facturas aprobadas de venta y compras para que puedas generar los asientos correlativos oficiales del Libro Diario con un solo clic. Mira las acciones automáticas sugeridas abajo.</p>
              </div>
            </div>

            {/* Invoices needing journal entry mappings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sales pending mapping */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Ventas sin Registro Contable</h4>
                    <p className="text-[10px] text-slate-400">Reconoce las facturas emitidas por la empresa en el Libro Diario</p>
                  </div>
                  <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full">{salesInvoices.length} Docs</span>
                </div>
                
                <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                  {salesInvoices.map(inv => {
                    // Check if there is an entry with this invoice mapped
                    const isMapped = entries.some(e => e.refType === 'Factura de Venta' && e.refFolio === (inv.siiFolio || inv.id.substring(0, 8).toUpperCase()));
                    return (
                      <div key={inv.id} className="flex items-center justify-between pt-2">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-slate-800">{inv.client}</span>
                          <span className="text-[9px] text-slate-400 font-mono">Folio: {inv.siiFolio || inv.id.substring(0, 8).toUpperCase()} | {inv.date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-700">${inv.totalAmount?.toLocaleString()}</span>
                          {isMapped ? (
                            <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-black border border-emerald-100 uppercase tracking-wide">Contabilizado</span>
                          ) : (
                            <button 
                              onClick={() => generateAutomatedSaleEntry(inv)}
                              className="text-[9px] bg-primary text-white px-2 py-1 rounded font-black hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                            >
                              + Asiento
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {salesInvoices.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic text-center py-4">No hay facturas de venta pendientes de mapeo contable.</p>
                  )}
                </div>
              </div>

              {/* Purchases pending mapping */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Gastos / Compras sin Registro</h4>
                    <p className="text-[10px] text-slate-400">Declarar facturas de proveedores/compras en el Libro Diario</p>
                  </div>
                  <span className="text-xs bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-full">{purchaseInvoices.length} Docs</span>
                </div>
                
                <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                  {purchaseInvoices.map(inv => {
                    const mappedFolio = inv.folio || inv.id.substring(0, 8).toUpperCase();
                    const isMapped = entries.some(e => e.refType === 'Factura de Compra' && e.refFolio === mappedFolio);
                    return (
                      <div key={inv.id} className="flex items-center justify-between pt-2">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-slate-800">Proveedor ID: {inv.supplierId || 'S/N'}</span>
                          <span className="text-[9px] text-slate-400 font-mono">Folio: {mappedFolio} | {inv.date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-700">${inv.totalAmount?.toLocaleString()}</span>
                          {isMapped ? (
                            <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-black border border-emerald-100 uppercase tracking-wide">Contabilizado</span>
                          ) : (
                            <button 
                              onClick={() => generateAutomatedPurchaseEntry(inv)}
                              className="text-[9px] bg-slate-900 text-white px-2 py-1 rounded font-black hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                            >
                              + Asiento
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {purchaseInvoices.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic text-center py-4">No hay facturas de compras registradas en finanzas.</p>
                  )}
                </div>
              </div>
            </div>

            {/* List of of entries (Libro Diario) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden font-sans">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Registros Correlativos (Libro Diario)</h3>
                  <p className="text-[11px] text-slate-400">Orden de folios cronológicos autorizados por SII.</p>
                </div>
                <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-100 rounded-full py-0.5 px-2.5 font-bold uppercase tracking-wider">{entries.length} folios activos</span>
              </div>

              <div className="divide-y divide-slate-100 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 text-[10px] uppercase text-slate-400 font-black border-b border-slate-100">
                      <th className="px-6 py-3 w-28">Folio Contable</th>
                      <th className="px-6 py-3 w-32">Fecha</th>
                      <th className="px-6 py-3">Concepto / Glosa</th>
                      <th className="px-6 py-3 text-right">Cuenta y Partida Doble</th>
                      <th className="px-6 py-3 w-20 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {entries
                      .filter(e => {
                        const q = searchQuery.toLowerCase();
                        return (
                          e.glosa.toLowerCase().includes(q) ||
                          e.folio.toString().includes(q) ||
                          e.date.includes(q) ||
                          e.items.some(item => item.accountName.toLowerCase().includes(q) || item.accountCode.includes(q))
                        );
                      })
                      .map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50/55 transition-colors group">
                          <td className="px-6 py-4 font-mono font-bold text-slate-700">#{entry.folio}</td>
                          <td className="px-6 py-4 text-slate-500">{entry.date}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800">{entry.glosa}</span>
                              {entry.refType && (
                                <span className="text-[9px] text-slate-400 mt-0.5 font-semibold bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 w-fit">
                                  Ref: {entry.refType} #{entry.refFolio}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1 bg-slate-50/30 p-2 rounded-lg border border-slate-100">
                              {entry.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between font-mono text-[10px]">
                                  <span className={`${item.credit > 0 ? 'pl-4 text-slate-500' : 'font-bold text-slate-700'}`}>
                                    {item.accountCode} - {item.accountName}
                                  </span>
                                  <div className="flex gap-4">
                                    <span className="w-20 text-right text-emerald-600 font-bold">
                                      {item.debit > 0 ? `$${item.debit.toLocaleString()}` : ''}
                                    </span>
                                    <span className="w-20 text-right text-indigo-600 font-bold">
                                      {item.credit > 0 ? `$${item.credit.toLocaleString()}` : ''}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                              title="Eliminar asiento"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    {entries.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-400 italic">
                          No hay asientos contables registrados aún. Utilice la IA o presione "Nuevo Asiento Contable" para crear uno.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'plan_cuentas' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Plan de Cuentas Autorizado</h3>
                <p className="text-xs text-slate-400 mt-0.5">Cuentas que se verán reflejadas en tus asientos y balance de 8 columnas.</p>
              </div>
              <button
                onClick={() => setShowAccountModal(true)}
                className="flex items-center gap-2 bg-slate-900 text-white px-3.5 py-2 rounded-lg font-bold text-xs hover:opacity-90 transition-all cursor-pointer"
              >
                <Plus size={14} />
                Agregar Cuenta
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Egreso'].map(category => {
                const accountsOfCategory = chartOfAccounts.filter(a => a.type === category);
                return (
                  <div key={category} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{category}s</h4>
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {accountsOfCategory.length}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2 max-h-[400px] overflow-y-auto pr-1">
                        {accountsOfCategory.map(acc => (
                          <div key={acc.code} className="flex flex-col p-1.5 hover:bg-slate-50 rounded transition-colors text-[11px]">
                            <span className="font-mono text-slate-400 font-semibold">{acc.code}</span>
                            <span className="font-bold text-slate-700 truncate" title={acc.name}>{acc.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'balances' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">Balance General Tributario</h3>
                <p className="text-xs text-slate-400 mt-0.5">Calculadora automática de 8 columnas oficial exigida por SII Chile para determinar Capital Propio Tributario e IVA anual.</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleExportBalanceExcel}
                  className="flex items-center gap-2 border border-slate-200 bg-white text-slate-600 px-4 py-2.5 rounded-lg font-bold text-xs hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                >
                  <FileSpreadsheet size={14} />
                  Exportar a Excel
                </button>
              </div>
            </div>

            {/* Error or Balance indicators */}
            {!balance8ColData.totals.balancedCheck ? (
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <AlertTriangle className="shrink-0 text-amber-600 mt-0.5" size={16} />
                <p><strong>Aviso de Cuadratura:</strong> Existe un desfase de precisión decimal en la cuadratura contable. Por favor, revise que todos los asientos contables registrados tengan la suma de débito y crédito perfectamente balanceada.</p>
              </div>
            ) : (
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                <CheckCircle2 className="shrink-0 text-emerald-600 mt-0.5" size={16} />
                <p><strong>Balance Cuadrado:</strong> El sistema de partida doble es consistente. Las sumas del Inventario cuadran perfectamente con la diferencia de pérdidas y ganancias.</p>
              </div>
            )}

            {/* Balance 8 Columnas Grid Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden overflow-x-auto text-xs font-sans">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-200 font-extrabold text-[10px] uppercase text-center">
                    <th className="px-4 py-3 text-left border-r border-slate-200/80" colSpan={2}>Cuenta Contable</th>
                    <th className="px-2 py-3 border-r border-slate-200/80" colSpan={2}>Sumas</th>
                    <th className="px-2 py-3 border-r border-slate-200/80" colSpan={2}>Saldos</th>
                    <th className="px-2 py-3 border-r border-slate-200/80" colSpan={2}>Inventario</th>
                    <th className="px-2 py-3" colSpan={2}>Resultados</th>
                  </tr>
                  <tr className="bg-slate-50 text-[9px] uppercase font-black text-slate-500 border-b border-slate-200 text-center">
                    <th className="px-4 py-2 text-left w-24">Código</th>
                    <th className="px-4 py-2 text-left border-r border-slate-200/80">Descripción</th>
                    <th className="px-2 py-2 w-24 text-right">Débito</th>
                    <th className="px-2 py-2 w-24 text-right border-r border-slate-200/80">Crédito</th>
                    <th className="px-2 py-2 w-24 text-right">Deudor</th>
                    <th className="px-2 py-2 w-24 text-right border-r border-slate-200/80">Acreedor</th>
                    <th className="px-2 py-2 w-24 text-right">Activo</th>
                    <th className="px-2 py-2 w-24 text-right border-r border-slate-200/80">Pasivo</th>
                    <th className="px-2 py-2 w-24 text-right">Pérdida</th>
                    <th className="px-2 py-2 w-24 text-right">Ganancia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono font-medium text-slate-700">
                  {balance8ColData.rows.map(row => (
                    <tr key={row.code} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-bold text-slate-800 text-left">{row.code}</td>
                      <td className="px-4 py-2.5 text-left border-r border-slate-200/80 font-sans">{row.name}</td>
                      <td className="px-2 py-2.5 text-right font-medium">{row.debit > 0 ? `$${row.debit.toLocaleString()}` : '---'}</td>
                      <td className="px-2 py-2.5 text-right border-r border-slate-200/80">{row.credit > 0 ? `$${row.credit.toLocaleString()}` : '---'}</td>
                      <td className="px-2 py-2.5 text-right text-emerald-600">{row.saldoDeudor > 0 ? `$${row.saldoDeudor.toLocaleString()}` : '---'}</td>
                      <td className="px-2 py-2.5 text-right border-r border-slate-200/80 text-indigo-600">{row.saldoAcreedor > 0 ? `$${row.saldoAcreedor.toLocaleString()}` : '---'}</td>
                      <td className="px-2 py-2.5 text-right text-emerald-700 bg-emerald-50/10">{row.activo > 0 ? `$${row.activo.toLocaleString()}` : '---'}</td>
                      <td className="px-2 py-2.5 text-right border-r border-slate-200/80 bg-rose-50/10 text-rose-700">{row.pasivo > 0 ? `$${row.pasivo.toLocaleString()}` : '---'}</td>
                      <td className="px-2 py-2.5 text-right text-rose-600">{row.perdida > 0 ? `$${row.perdida.toLocaleString()}` : '---'}</td>
                      <td className="px-2 py-2.5 text-right text-emerald-800">{row.ganancia > 0 ? `$${row.ganancia.toLocaleString()}` : '---'}</td>
                    </tr>
                  ))}
                  
                  {/* Sums row */}
                  <tr className="bg-slate-100 font-black text-slate-800 text-right uppercase text-[10px]">
                    <td className="px-4 py-3 border-r border-slate-200/80 text-left font-sans" colSpan={2}>Sumas Subtotales</td>
                    <td className="px-2 py-3">${balance8ColData.totals.debit.toLocaleString()}</td>
                    <td className="px-2 py-3 border-r border-slate-200/80">${balance8ColData.totals.credit.toLocaleString()}</td>
                    <td className="px-2 py-3">${balance8ColData.totals.saldoDeudor.toLocaleString()}</td>
                    <td className="px-2 py-3 border-r border-slate-200/80">${balance8ColData.totals.saldoAcreedor.toLocaleString()}</td>
                    <td className="px-2 py-3 bg-emerald-55 font-bold">${balance8ColData.totals.activo.toLocaleString()}</td>
                    <td className="px-2 py-3 border-r border-slate-200/80 bg-rose-55 font-bold">${balance8ColData.totals.pasivo.toLocaleString()}</td>
                    <td className="px-2 py-3 font-semibold">${balance8ColData.totals.perdida.toLocaleString()}</td>
                    <td className="px-2 py-3 font-semibold">${balance8ColData.totals.ganancia.toLocaleString()}</td>
                  </tr>

                  {/* Profit or Loss difference adjustment */}
                  <tr className="bg-emerald-50 text-emerald-900 border-t border-slate-200 font-black text-right text-[10px]">
                    <td className="px-4 py-3 border-r border-slate-200 text-left font-sans text-emerald-800 font-black italic shadow-sm" colSpan={2}>
                      {balance8ColData.totals.netResult >= 0 ? 'UTILIDAD DEL EJERCICIO' : 'PÉRDIDA DEL EJERCICIO'}
                    </td>
                    <td className="px-2 py-3 text-slate-400 border-r border-slate-200" colSpan={2}>---</td>
                    <td className="px-2 py-3 text-slate-400 border-r border-slate-200 hover:outline-none" colSpan={2}>---</td>
                    {/* Inventario matching */}
                    <td className="px-2 py-3 text-slate-400 font-normal">
                      {balance8ColData.totals.netResult < 0 ? `$${Math.abs(balance8ColData.totals.netResult).toLocaleString()}` : '---'}
                    </td>
                    <td className="px-2 py-3 border-r border-emerald-200">
                      {balance8ColData.totals.netResult >= 0 ? `$${balance8ColData.totals.netResult.toLocaleString()}` : '---'}
                    </td>
                    {/* Resultados matching */}
                    <td className="px-2 py-3">
                      {balance8ColData.totals.netResult >= 0 ? `$${balance8ColData.totals.netResult.toLocaleString()}` : '---'}
                    </td>
                    <td className="px-2 py-3 text-slate-400">
                      {balance8ColData.totals.netResult < 0 ? `$${Math.abs(balance8ColData.totals.netResult).toLocaleString()}` : '---'}
                    </td>
                  </tr>

                  {/* Balanced totals */}
                  <tr className="bg-slate-900 text-white font-black text-right uppercase text-[10px] border-t-2 border-slate-950">
                    <td className="px-4 py-3 text-left font-sans" colSpan={2}>Saldos Cuadrados Totales</td>
                    <td className="px-2 py-3 text-slate-400">---</td>
                    <td className="px-2 py-3 text-slate-400 border-r border-slate-800">---</td>
                    <td className="px-2 py-3 text-slate-400">---</td>
                    <td className="px-2 py-3 text-slate-400 border-r border-slate-800">---</td>
                    
                    <td className="px-2 py-3" colSpan={2}>
                      ${Math.max(balance8ColData.totals.activo, balance8ColData.totals.pasivo).toLocaleString()}
                    </td>
                    <td className="px-2 py-3 border-l border-slate-800/80" colSpan={2}>
                      ${Math.max(balance8ColData.totals.perdida, balance8ColData.totals.ganancia).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'f29' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">Pre-Declaración Formulario 29 (Impuestos Mensuales)</h3>
                <p className="text-xs text-slate-400 mt-0.5 font-semibold">Simulador sincronizado de IVA débito (ventas), IVA crédito (compras) e Impuestos PPM mensuales de Chile.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500">Tasa PPM Ajustable:</span>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white px-2 py-1 w-24">
                  <input 
                    type="number" 
                    step="0.1" 
                    value={ppmRate}
                    onChange={e => {
                      const val = Number(e.target.value) || 0;
                      setPpmRate(val);
                      if (user) {
                        localStorage.setItem(`ppmRate_${user.uid}`, val.toString());
                      }
                    }}
                    className="w-full text-center text-xs font-mono font-bold focus:outline-none" 
                  />
                  <span className="text-xs font-bold text-slate-400">%</span>
                </div>
              </div>
            </div>

            {/* F29 Form-Like Box */}
            <div className="bg-slate-100 border-4 border-amber-950/20 p-6 rounded-3xl max-w-4xl mx-auto shadow-md space-y-6 font-sans">
              <div className="flex justify-between items-start border-b-2 border-slate-300 pb-4">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-black tracking-widest text-[#1e3a8a] leading-none uppercase">REPÚBLICA DE CHILE</h4>
                  <h3 className="text-sm font-black text-[#1e3a8a] leading-none uppercase">SERVICIO DE IMPUESTOS INTERNOS</h3>
                  <p className="text-[10px] text-slate-500 font-bold">Resumen de Declaración Mensual de Impuestos (F29)</p>
                </div>
                <div className="bg-[#1e3a8a] text-white px-4 py-2 rounded-xl text-center">
                  <h2 className="text-lg font-black leading-none">F29</h2>
                  <span className="text-[8px] uppercase tracking-widest font-black leading-none">Formulario</span>
                </div>
              </div>

              {/* Company Metadata Area */}
              <div className="grid grid-cols-2 gap-4 text-[10px] border-b border-slate-200 pb-4">
                <div>
                  <p><strong className="text-slate-500">R.U.T. Empresa:</strong> <span className="font-mono font-bold">76.543.210-K</span></p>
                  <p><strong className="text-slate-500">Razón Social:</strong> <span className="font-bold">RESCOING INGENIERÍA Eirl</span></p>
                </div>
                <div className="text-right">
                  <p><strong className="text-slate-500">Período Tributario:</strong> <span className="font-bold underline uppercase">Mayo 2026</span></p>
                  <p><strong className="text-slate-500">Moneda:</strong> <span className="font-bold">CLP ($)</span></p>
                </div>
              </div>

              {/* Sales Debit Section */}
              <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-slate-50 p-2 rounded">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-widest">I. IVA Débito Fiscal (Por Ventas)</span>
                  <span className="text-[10px] bg-[#1e3a8a]/10 text-[#1e3a8a] font-bold px-2 rounded-full font-mono">{f29SalesCount} Documentos</span>
                </div>
                <div className="grid grid-cols-12 gap-3 text-xs items-center">
                  <span className="col-span-1 font-bold text-slate-400 font-mono">[503]</span>
                  <span className="col-span-8 text-slate-600 font-semibold">Base Neto Facturado e ingresos por Ventas</span>
                  <span className="col-span-3 text-right font-mono font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    ${f29SalesNet.toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-3 text-xs items-center pt-1">
                  <span className="col-span-1 font-bold text-slate-400 font-mono">[538]</span>
                  <span className="col-span-8 text-[#1e3a8a] font-bold">Total IVA Débito Fiscal determinado (19%)</span>
                  <span className="col-span-3 text-right font-mono font-black text-[#1e3a8a] bg-[#1e3a8a]/5 px-2 py-1 rounded border border-[#1e3a8a]/10">
                    ${f29SalesIva.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Purchases Credit Section */}
              <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-slate-50 p-2 rounded">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-widest">II. IVA Crédito Fiscal (Por Compras y Gastos)</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 rounded-full font-mono">{f29PurchasesCount} Documentos</span>
                </div>
                <div className="grid grid-cols-12 gap-3 text-xs items-center">
                  <span className="col-span-1 font-bold text-slate-400 font-mono">[563]</span>
                  <span className="col-span-8 text-slate-600 font-semibold">Servicios y facturas recibidas de proveedores (Neto)</span>
                  <span className="col-span-3 text-right font-mono font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    ${f29PurchasesNet.toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-3 text-xs items-center pt-1">
                  <span className="col-span-1 font-bold text-slate-400 font-mono">[537]</span>
                  <span className="col-span-8 text-slate-800 font-bold">Total IVA Crédito Fiscal acreditado para deducir (19%)</span>
                  <span className="col-span-3 text-right font-mono font-black text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-100">
                    ${f29PurchasesIva.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Monthly Provisional Payments (PPM) */}
              <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-slate-50 p-2 rounded">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-widest">III. Pagos Provisionales Mensuales (PPM)</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 rounded-full font-mono">Tasa de PPM: {ppmRate}%</span>
                </div>
                <div className="grid grid-cols-12 gap-3 text-xs items-center">
                  <span className="col-span-1 font-bold text-slate-400 font-mono">[562]</span>
                  <span className="col-span-8 text-slate-600 font-semibold">Tasa PPM declarada e ingresos afectos</span>
                  <span className="col-span-3 text-right font-mono font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    {ppmRate}%
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-3 text-xs items-center pt-1">
                  <span className="col-span-1 font-bold text-slate-400 font-mono">[062]</span>
                  <span className="col-span-8 text-emerald-800 font-bold">Impuesto Provisional Determinado F29 (PPM) (Ahorro Anual)</span>
                  <span className="col-span-3 text-right font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                    ${ppmTaxDue.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Total calculations */}
              <div className="bg-[#1e3a8a] text-white p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-inner">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Resumen Tributario F29</h4>
                  <p className="text-[10px] text-white/50 mt-1">Saldos de impuestos determinados para pago inmediato en SII Chile.</p>
                </div>
                <div className="flex flex-col md:flex-row gap-6 font-mono text-right">
                  {remanenteIva > 0 ? (
                    <div>
                      <span className="text-[9px] uppercase font-black tracking-widest text-emerald-300">Remanente de IVA acumulado</span>
                      <h3 className="text-xl font-black">${remanenteIva.toLocaleString()}</h3>
                      <span className="text-[8px] text-emerald-200 font-sans block mt-0.5">Disponibles como crédito fiscal para próximo mes</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[9px] uppercase font-black tracking-widest text-rose-300">Total IVA a declarar a pagar</span>
                      <h3 className="text-xl font-black">${netIvaLiability.toLocaleString()}</h3>
                    </div>
                  )}
                  <div className="border-t md:border-t-0 md:border-l border-white/20 pt-2 md:pt-0 md:pl-6">
                    <span className="text-[9px] uppercase font-black tracking-widest text-teal-300">Total Formulario 29 a Pagar</span>
                    <h2 className="text-2xl font-black">${totalF29Pagar.toLocaleString()}</h2>
                    <span className="text-[8px] text-teal-200 font-sans block mt-0.5">Pago PPM + IVA determinado si existiese</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Formulario 22 (Operación Renta) Simulado */}
        {activeTab === 'f22' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-sm border border-indigo-950 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black tracking-widest uppercase bg-indigo-500/30 text-indigo-200 px-2.5 py-1 rounded-full border border-indigo-400/20">OPERACIÓN RENTA ANUAL</span>
                  <span className="text-[9px] font-black tracking-widest uppercase bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full border border-amber-400/20 font-mono">SII CHILE F22</span>
                </div>
                <h3 className="text-2xl font-black tracking-tight leading-none">Formulario 22 Simulado - Ley de la Renta</h3>
                <p className="text-xs text-indigo-200 leading-snug">Previsualiza y planifica el Impuesto a la Renta de tu empresa (LIR) sincronizando balance, ingresos y deducciones del ejercicio.</p>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <div>
                  <label className="text-[9px] font-bold text-indigo-300 uppercase block mb-1">Año Tributario</label>
                  <select 
                    value={f22Year}
                    onChange={e => updateF22Year(Number(e.target.value))}
                    className="bg-indigo-950/70 text-white border border-indigo-800 text-xs font-black rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
                  >
                    <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                    <option value={new Date().getFullYear() + 1}>{new Date().getFullYear() + 1}</option>
                    <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-indigo-300 uppercase block mb-1">Régimen SII</label>
                  <select 
                    value={f22Regime}
                    onChange={e => updateF22Regime(e.target.value as any)}
                    className="bg-indigo-950/70 text-white border border-indigo-800 text-xs font-black rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
                  >
                    <option value="D3">14 D3 Propyme General (Tasa 10%)</option>
                    <option value="D8">14 D8 Propyme Transparente (Tasa 0%)</option>
                    <option value="14A">14 A Régimen General (Tasa 27%)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario 22 table simulation */}
              <div className="lg:col-span-2 bg-[#fdfdfd] border border-slate-200/80 rounded-3xl shadow-sm p-6 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full blur-2xl -mr-6 -mt-6"></div>
                
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Esquema Analítico de Declaración F22</h4>
                    <p className="text-[10px] text-slate-400">Códigos oficiales vigentes homologados del SII Chile.</p>
                  </div>
                  <span className="text-[9px] bg-yellow-50 text-yellow-800 border border-yellow-100 font-bold px-2.5 py-1 rounded font-mono uppercase tracking-wide shadow-sm">Formulario Oficial F22</span>
                </div>

                <div className="space-y-2.5">
                  {/* Resultado Financiero */}
                  <div className="grid grid-cols-12 gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-800">
                    <span className="col-span-1 font-mono font-bold text-slate-400">[770]</span>
                    <div className="col-span-7 flex flex-col">
                      <span className="font-bold text-slate-800">Resultado Neto del Ejercicio (Financiero)</span>
                      <span className="text-[9px] text-slate-500 italic">Calculado del Balance de 8 Columnas anterior</span>
                    </div>
                    <span className="col-span-4 text-right font-mono font-bold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                      ${f22NetResultFinanciero.toLocaleString()}
                    </span>
                  </div>

                  {/* Agregamientos */}
                  <div className="grid grid-cols-12 gap-3 items-center bg-white p-3 rounded-xl border border-slate-200/60 text-xs text-slate-800">
                    <span className="col-span-1 font-mono font-bold text-slate-400">[211]</span>
                    <div className="col-span-7 flex flex-col">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        (+) Agregados: Gastos Rechazados pagados
                        <span className="text-[9px] text-amber-600 bg-amber-50 px-1 rounded font-normal">Art. 21 LIR</span>
                      </span>
                      <span className="text-[9px] text-slate-400">Gastos sin respaldo tributario o retiros asociados</span>
                    </div>
                    <div className="col-span-4 relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 font-mono text-[10px]">$</span>
                      <input 
                        type="number"
                        placeholder="0"
                        className="w-full text-right font-mono font-bold text-slate-800 bg-slate-50/50 border border-slate-200 pl-6 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                        value={f22GastosRechazados || ''}
                        onChange={e => updateF22Gastos(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </div>
                  </div>

                  {/* Deducciones */}
                  <div className="grid grid-cols-12 gap-3 items-center bg-white p-3 rounded-xl border border-slate-200/60 text-xs text-slate-800">
                    <span className="col-span-1 font-mono font-bold text-slate-400">[212]</span>
                    <div className="col-span-7 flex flex-col">
                      <span className="font-bold text-slate-800">(-) Deducciones: Ingresos No Gravados</span>
                      <span className="text-[9px] text-slate-450">Exenciones tributarias o dividendos exentos percibidos</span>
                    </div>
                    <div className="col-span-4 relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 font-mono text-[10px]">$</span>
                      <input 
                        type="number"
                        placeholder="0"
                        className="w-full text-right font-mono font-bold text-slate-800 bg-slate-50/50 border border-slate-200 pl-6 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                        value={f22IngresosNoGravados || ''}
                        onChange={e => updateF22Ingresos(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </div>
                  </div>

                  {/* Base Imponible / RLI */}
                  <div className="grid grid-cols-12 gap-3 items-center bg-indigo-50/40 p-3.5 rounded-xl border border-indigo-100 text-xs text-slate-800">
                    <span className="col-span-1 font-mono font-black text-indigo-700">[1007]</span>
                    <div className="col-span-7 flex flex-col">
                      <span className="font-extrabold text-indigo-950 uppercase tracking-wider text-[11px]">Renta Líquida Imponible (RLI)</span>
                      <span className="text-[9px] text-indigo-600/80 font-medium">Base para el cálculo del Impuesto de Primera Categoría (LIR)</span>
                    </div>
                    <div className="col-span-4 text-right">
                      {f22IsLoss ? (
                        <div className="flex flex-col text-right items-end">
                          <span className="text-rose-700 font-black font-sans uppercase tracking-[0.05em] text-[9px] bg-rose-50 px-2 py-0.5 rounded border border-rose-100 self-end">Pérdida Tributaria</span>
                          <span className="font-mono font-bold text-slate-500 text-xs mt-0.5">-${Math.abs(f22Rli).toLocaleString()}</span>
                        </div>
                      ) : (
                        <span className="font-mono font-black text-indigo-900 text-sm bg-white border border-indigo-200 px-3 py-1.5 rounded-lg shadow-sm">
                          ${f22RliDetermined.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tax factor / Tasa */}
                  <div className="grid grid-cols-12 gap-3 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs text-slate-800">
                    <span className="col-span-1 font-mono font-bold text-slate-400">Factor</span>
                    <div className="col-span-7 flex flex-col">
                      <span className="font-semibold text-slate-700">Tasa Impuesto s/ Régimen del Contribuyente</span>
                      <span className="text-[9px] text-slate-500 italic">Definido de forma oficial para el ejercicio legal correspondiente</span>
                    </div>
                    <span className="col-span-4 text-right font-mono font-black text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded-lg">
                      {f22IdpcRate}%
                    </span>
                  </div>

                  {/* IDPC Impuesto Determinado */}
                  <div className="grid grid-cols-12 gap-3 items-center bg-slate-100/60 p-3 rounded-xl border border-slate-100 text-xs text-slate-800">
                    <span className="col-span-1 font-mono font-black text-slate-700">[109]</span>
                    <div className="col-span-7 flex flex-col">
                      <span className="font-bold text-slate-800">Impuesto de Primera Categoría Determinado</span>
                      <span className="text-[9px] text-slate-500">Impuesto anual progresivo bruto de la empresa</span>
                    </div>
                    <span className="col-span-4 text-right font-mono font-black text-slate-900 bg-white border border-slate-250 px-3 py-1.5 rounded-lg shadow-sm">
                      ${f22IdpcTax.toLocaleString()}
                    </span>
                  </div>

                  {/* Créditos por PPM */}
                  <div className="grid grid-cols-12 gap-3 items-center bg-white p-3 rounded-xl border border-slate-200/60 text-xs text-slate-800">
                    <span className="col-span-1 font-mono font-bold text-slate-400">[162]</span>
                    <div className="col-span-7 flex flex-col">
                      <span className="font-bold text-slate-800 flex items-center gap-2">
                        (-) Crédito por PPM Pagado en Año Comercial
                        <span className="text-[9px] bg-teal-50 text-teal-800 border border-teal-100 px-1.5 rounded uppercase font-black tracking-wide">A favor</span>
                      </span>
                      <div className="flex flex-col gap-1 mt-1">
                        <span className="text-[9px] text-slate-500">
                          Mapeado en los folios del libro diario / mayor: <strong className="text-teal-700 font-mono font-bold">${f22ComputedPpm.toLocaleString()}</strong>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="checkbox" 
                            id="useManualPpmToggle"
                            checked={f22ManualPpm !== null}
                            onChange={e => updateF22ManualPpm(e.target.checked ? f22ComputedPpm : null)}
                            className="rounded border-slate-200 text-primary focus:ring-primary cursor-pointer w-3 h-3"
                          />
                          <label htmlFor="useManualPpmToggle" className="text-[9px] text-slate-500 select-none cursor-pointer">Personalizar crédito (Ingresar manual de tesorería)</label>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-4 relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 font-mono text-[10px]">$</span>
                      <input 
                        type="number"
                        placeholder="0"
                        className="w-full text-right font-mono font-bold text-slate-800 bg-slate-50/50 border border-slate-200 pl-6 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm disabled:opacity-50 disabled:bg-slate-100"
                        value={f22PpmValue || ''}
                        disabled={f22ManualPpm === null}
                        onChange={e => updateF22ManualPpm(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </div>
                  </div>
                </div>

                {/* Final calculated F22 output summary block */}
                {f22IsRefund ? (
                  <div className="bg-emerald-50 text-emerald-800 p-5 rounded-2xl border border-emerald-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
                    <div>
                      <span className="text-[9px] uppercase font-black tracking-widest text-emerald-600 font-mono">[101] Devolución Solicitada</span>
                      <h4 className="text-sm font-black text-emerald-950 mt-1 uppercase tracking-wide">Saldo a favor del contribuyente</h4>
                      <p className="text-[10px] text-emerald-600 mt-0.5">El total de PPM anticipados excede el impuesto determinado del año. Recibirás reembolso de tesorería.</p>
                    </div>
                    <div className="text-right font-mono sm:shrink-0">
                      <span className="text-[9px] text-emerald-650 block uppercase font-bold text-right">Monto a Devolver</span>
                      <span className="text-2xl font-black text-emerald-800">${f22FinalBalanceAbs.toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 text-amber-900 p-5 rounded-2xl border border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
                    <div>
                      <span className="text-[9px] uppercase font-black tracking-widest text-amber-700 font-mono">[95] Impuesto a Declarar</span>
                      <h4 className="text-sm font-black text-amber-950 mt-1 uppercase tracking-wide">Impuesto Neto a pagar en arcas fiscales</h4>
                      <p className="text-[10px] text-amber-600 mt-0.5">El impuesto de Primera Categoría (IDPC) excede tus depósitos provisionales (PPM).</p>
                    </div>
                    <div className="text-right font-mono sm:shrink-0">
                      <span className="text-[9px] text-amber-750 block uppercase font-bold text-right">Monto Líquido a Pagar</span>
                      <span className="text-2xl font-black text-amber-800">${f22FinalBalanceAbs.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons and checklist */}
              <div className="space-y-6">
                {/* Visual exports */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Respaldos de Operación Renta</h4>
                  <p className="text-[10px] text-slate-400">Descarga los cálculos oficiales en planillas para presentar, archivar o validar con tu asesor tributario.</p>
                  
                  <div className="space-y-2 font-sans">
                    <button 
                      onClick={handleExportF22PDF}
                      className="w-full flex items-center justify-center gap-2 border border-slate-200 bg-white text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                    >
                      <Download size={14} className="text-slate-500" />
                      Exportar Certificado PDF F22
                    </button>
                    <button 
                      onClick={handleExportF22Excel}
                      className="w-full flex items-center justify-center gap-2 border border-indigo-100 bg-indigo-50 text-indigo-700 px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-indigo-110 transition-colors shadow-sm cursor-pointer"
                    >
                      <FileSpreadsheet size={14} className="text-indigo-650" />
                      Planilla Excel F22 SII
                    </button>
                  </div>
                </div>

                {/* Audit checklist */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Auditoría Previa de Cumplimiento</h4>
                  
                  <div className="space-y-2.5 divide-y divide-slate-100 select-none">
                    <div className="flex items-start gap-2.5 pt-2">
                      {balance8ColData.totals.balancedCheck ? (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="text-[11px] font-bold text-slate-800 block leading-tight">Partida Doble del Ejercicio</span>
                        <p className="text-[9px] text-slate-450 leading-relaxed mt-0.5">
                          {balance8ColData.totals.balancedCheck 
                            ? 'Débitos y Créditos perfectamente balanceados. El resultado contable es de confianza.' 
                            : '¡Existe un descuadre en el balance! Corrige tus asientos en el Libro Diario para evitar rechazos del SII.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 pt-2.5">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[11px] font-bold text-slate-800 block leading-tight">Cobros con Boleta / Factura</span>
                        <p className="text-[9px] text-slate-450 leading-relaxed mt-0.5">Sincronizado con {salesInvoices.length} facturas de venta oficiales emitidas y declaradas.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 pt-2.5">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[11px] font-bold text-slate-800 block leading-tight">PPM Activo Acreditado</span>
                        <p className="text-[9px] text-slate-450 leading-relaxed mt-0.5">
                          Los registros de cuentas detectan ${f22ComputedPpm.toLocaleString()} en la cuenta de ahorro fiscal.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tax regime advice */}
                <div className="bg-blue-50/40 rounded-3xl p-5 border border-blue-100/80 space-y-2">
                  <div className="flex items-center gap-1.5 text-blue-800">
                    <HelpCircle size={15} />
                    <span className="text-xs font-black uppercase tracking-wider">Asesoría de Régimen</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {f22Regime === 'D3' && 'El Régimen 14 D3 (PROPYME) otorga una tasa de beneficio reducida del 10% para incentivar a las PyMEs chilenas. Las ganancias contables acumuladas determinan el crédito Global de los socios.'}
                    {f22Regime === 'D8' && 'Bajo el Régimen 14 D8 (PROPYME TRANSPARENTE) la sociedad comercial tributa con tasa 0%. Los socios declaran la RLI proporcional en su renta personal (Régimen de atribución).'}
                    {f22Regime === '14A' && 'El Régimen 14 A tributa con tasa general de 27% sobre base devengada. Los créditos acumulados de Primera Categoría otorgan una deducción del 65% o 100% en el Impuesto de Segunda Categoría.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- NEW ENTRY FORM MODAL ---------------- */}
      <AnimatePresence>
        {showEntryModal && (
          <Modal onClose={() => setShowEntryModal(false)}>
            <div className="p-6 space-y-6 max-w-4xl font-sans text-slate-800">
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase">Añadir Asiento Contable Diario</h3>
                  <p className="text-xs text-slate-400">Ingrese las cuentas de débito y crédito respetando la ecuación de partida doble.</p>
                </div>
              </div>

              {errorMsg && (
                <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-rose-700 font-bold text-xs">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Fecha Registro</label>
                  <input 
                    type="date"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
                    value={entryDate}
                    onChange={e => setEntryDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Documento de Referencia (Opcional)</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none bg-white"
                    value={refType}
                    onChange={e => setRefType(e.target.value)}
                  >
                    <option value="">Ninguno</option>
                    <option value="Factura de Venta">Factura de Venta (Sales)</option>
                    <option value="Factura de Compra">Factura de Compra (Expense)</option>
                    <option value="Nota de Crédito SII">Nota de Crédito SII</option>
                    <option value="Liquidación de Sueldo">Liquidación de Sueldo</option>
                    <option value="Boleta de Honorarios">Boleta de Honorarios</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Folio Documento (Opcional)</label>
                  <input 
                    type="text"
                    placeholder="Ejem: FOLIO-22904"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
                    value={refFolio}
                    onChange={e => setRefFolio(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Glosa Explicativa del Movimiento Contable</label>
                <input 
                  type="text"
                  placeholder="Ejem: Reconocimiento de pago servicios de ingeniería de mayo por transferencia"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none font-medium"
                  value={entryGlosa}
                  onChange={e => setEntryGlosa(e.target.value)}
                />
              </div>

              {/* Transactions grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b pb-1.5 border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Partida Doble (Cuentas)</span>
                  <button 
                    onClick={addEntryItemRow}
                    className="flex items-center gap-1.5 text-xs font-extrabold text-primary hover:underline cursor-pointer"
                  >
                    <Plus size={12} />
                    Añadir Fila de Cuenta
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {newEntryItems.map((item, idx) => (
                    <div key={idx} className="flex gap-3 items-center">
                      {/* Account selection */}
                      <div className="flex-1">
                        <select
                          className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
                          value={item.accountCode}
                          onChange={e => handleItemFieldChange(idx, 'accountCode', e.target.value)}
                        >
                          {chartOfAccounts.map(account => (
                            <option key={account.code} value={account.code}>
                              [{account.code}] {account.name} ({account.type})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* DEBIT (Debe) */}
                      <div className="w-32">
                        <input 
                          type="number"
                          placeholder="Débito (Debe) $"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-bold focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none text-right placeholder-slate-400"
                          value={item.debit || ''}
                          disabled={item.credit > 0}
                          onChange={e => handleItemFieldChange(idx, 'debit', e.target.value)}
                        />
                      </div>

                      {/* CREDIT (Haber) */}
                      <div className="w-32">
                        <input 
                          type="number"
                          placeholder="Crédito (Haber) $"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-bold focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none text-right placeholder-slate-400"
                          value={item.credit || ''}
                          disabled={item.debit > 0}
                          onChange={e => handleItemFieldChange(idx, 'credit', e.target.value)}
                        />
                      </div>

                      {/* Delete button */}
                      <button 
                        onClick={() => removeEntryItemRow(idx)}
                        className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balances matching totals summary */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center text-xs font-mono">
                <div>
                  <span className="text-[9px] uppercase font-black text-slate-400 block font-sans">Estatus del Asiento</span>
                  {isBalanced ? (
                    <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Partida Doble Cuadrada (Ok)
                    </span>
                  ) : (
                    <span className="text-rose-600 font-extrabold flex items-center gap-1">
                      <AlertTriangle size={12} />
                      Descuadrado por ${Math.abs(totalDebits - totalCredits).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block font-sans">Total Débito</span>
                    <span className="text-emerald-600 font-black">${totalDebits.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block font-sans">Total Crédito</span>
                    <span className="text-indigo-600 font-black">${totalCredits.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Form buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={() => setShowEntryModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-transparent font-bold px-4 py-2 rounded-lg text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveEntry}
                  className="bg-primary text-white border border-transparent font-black px-5 py-2 rounded-lg text-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                >
                  Guardar Asiento
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ---------------- COA CUSTOM NEW ACCOUNT MODAL ---------------- */}
      <AnimatePresence>
        {showAccountModal && (
          <Modal onClose={() => setShowAccountModal(false)}>
            <div className="p-6 space-y-4 font-sans text-slate-800">
              <h3 className="text-base font-black uppercase text-slate-900">Añadir Nueva Cuenta Contable</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Tipo de Cuenta</label>
                  <select
                    className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newAccount.type}
                    onChange={e => setNewAccount({ ...newAccount, type: e.target.value as any })}
                  >
                    <option value="Activo">Activo (Assets)</option>
                    <option value="Pasivo">Pasivo (Liabilities)</option>
                    <option value="Patrimonio">Patrimonio (Equity)</option>
                    <option value="Ingreso">Ingreso (Revenue)</option>
                    <option value="Egreso">Egreso / Gasto (Expenses)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Código de Cuenta (Ejem: 1-01-007)</label>
                  <input 
                    type="text"
                    placeholder="Ejemplo: 1-01-007"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary font-mono font-bold"
                    value={newAccount.code}
                    onChange={e => setNewAccount({ ...newAccount, code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Nombre Descriptivo</label>
                  <input 
                    type="text"
                    placeholder="Ejemplo: Cuenta Rut Empresa"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newAccount.name}
                    onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button 
                  onClick={() => setShowAccountModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs hover:text-slate-800 transition-colors font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleAddAccount}
                  className="bg-primary text-white hover:opacity-90 px-4 py-2 rounded-lg text-xs transition-colors font-black cursor-pointer"
                >
                  Confirmar Cuenta
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// Inline Beautiful Modal Component with backdrop-blur support
function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      
      {/* Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-4xl w-full relative z-10 overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        {children}
      </motion.div>
    </div>
  );
}
