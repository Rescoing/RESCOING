import { useState, useEffect, FormEvent } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  DollarSign,
  Plus,
  Calendar,
  Download,
  Activity,
  FileCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ArrowRight,
  Bell,
  Search,
  Filter,
  FileText,
  Table as TableIcon,
  TrendingUp,
  Mail,
  Send,
  Loader2,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Invoice, FinanceProcess, FinanceTask, PurchaseInvoice, Payroll, Document } from '../types';
import Modal from './ui/Modal';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

type FinanceTab = 'billing' | 'flow' | 'reminders' | 'balance';

export default function FinanceView({ 
  autoOpen, 
  onModalHandled 
}: { autoOpen?: boolean; onModalHandled?: () => void }) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [processes, setProcesses] = useState<FinanceProcess[]>([]);
  const [tasks, setTasks] = useState<FinanceTask[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<FinanceTab>('billing');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [isProcessDetailModalOpen, setIsProcessDetailModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  
  const selectedProcess = processes.find(p => p.id === selectedProcessId);
  
  // Web3Forms automated payment alert state
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [selectedInvoiceForAlert, setSelectedInvoiceForAlert] = useState<Invoice | null>(null);
  const [alertSubject, setAlertSubject] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [alertSuccess, setAlertSuccess] = useState<boolean | null>(null);

  const openAlertModal = (invoice: Invoice) => {
    setSelectedInvoiceForAlert(invoice);
    setAlertSubject(`⚠️ ERP ALERTA DE PAGO: Documento pendiente de ${invoice.client}`);
    
    const msg = `Estimado(a) Cliente,

Junto con saludarle, nos contactamos del Departamento de Finanzas. Queremos recordarle de la siguiente alerta de pago en nuestro sistema:

Detalles de la factura:
- Cliente: ${invoice.client}
- Rut: ${invoice.rut || 'No especificado'}
- Folio SII: #${invoice.siiFolio || invoice.id.substring(0, 8).toUpperCase()}
- Estado del Documento: ${invoice.status === 'Vencido' ? '❌ VENCIDO' : '⚠️ PENDIENTE'}
- Fecha de Emisión: ${invoice.date}
- Fecha de Vencimiento: ${invoice.dueDate || 'Inmediato'}
- Monto Total a Pagar: $${invoice.totalAmount?.toLocaleString()}

Por favor, canalizar el pago correspondiente de manera oportuna. Si ya realizó la transferencia, agradeceremos ignorar esta alerta o enviarnos el comprobante de pago.

Atentamente,
Departamento de Cobranzas / ERP Rescoing`;
    setAlertMessage(msg);
    setAlertSuccess(null);
    setIsAlertModalOpen(true);
  };

  const handleSendPaymentAlert = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForAlert || !user) return;

    setIsSendingAlert(true);
    setAlertSuccess(null);

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          access_key: '62df9ff2-6eac-4e4b-97fc-c999cb5038c3',
          name: 'Notificaciones Cobranza ERP',
          email: 'notificaciones@escoing.com',
          to_email: 'rescoing@gmail.com',
          subject: alertSubject,
          message: alertMessage
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Save the alert state in invoice in Firestore
        const docRef = doc(db, 'invoices', selectedInvoiceForAlert.id);
        const alertTimestamp = new Date().toLocaleString('es-CL');
        await updateDoc(docRef, {
          emailAlertSent: true,
          emailAlertSentDate: alertTimestamp
        });

        // Also add a system log/notification
        await addDoc(collection(db, 'notifications'), {
          ownerId: user.uid,
          title: '📧 Alerta de Pago Enviada por Email',
          message: `Se ha enviado un aviso de cobro formal por la factura a "${selectedInvoiceForAlert.client}" ($${selectedInvoiceForAlert.totalAmount?.toLocaleString()}) a rescoing@gmail.com.`,
          type: 'info',
          read: false,
          createdAt: serverTimestamp()
        });

        setAlertSuccess(true);
        setTimeout(() => {
          setIsAlertModalOpen(false);
          setSelectedInvoiceForAlert(null);
        }, 1500);
      } else {
        setAlertSuccess(false);
      }
    } catch (err) {
      console.error("Error sending email via Web3Forms:", err);
      setAlertSuccess(false);
    } finally {
      setIsSendingAlert(false);
    }
  };
  
  useEffect(() => {
    if (!user) return;

    const qInvoices = query(collection(db, 'invoices'), where('ownerId', '==', user.uid));
    const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    }, (error) => console.error("Finance invoices error:", error));

    const qProcesses = query(collection(db, 'financeProcesses'), where('ownerId', '==', user.uid));
    const unsubProcesses = onSnapshot(qProcesses, (snapshot) => {
      setProcesses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinanceProcess)));
    }, (error) => console.error("Finance processes error:", error));

    const qTasks = query(collection(db, 'financeTasks'), where('ownerId', '==', user.uid));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinanceTask)));
      setLoading(false);
    }, (error) => {
      console.error("Finance tasks error:", error);
      setLoading(false);
    });

    const qPurchaseInvoices = query(collection(db, 'purchaseInvoices'), where('ownerId', '==', user.uid));
    const unsubPurchase = onSnapshot(qPurchaseInvoices, (snapshot) => {
      setPurchaseInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseInvoice)));
    });

    const qPayrolls = query(collection(db, 'payrolls'), where('ownerId', '==', user.uid));
    const unsubPayrolls = onSnapshot(qPayrolls, (snapshot) => {
      setPayrolls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payroll)));
    });

    const qDocuments = query(collection(db, 'documents'), where('ownerId', '==', user.uid));
    const unsubDocuments = onSnapshot(qDocuments, (snapshot) => {
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Document)));
    }, (error) => console.error("Finance documents error:", error));

    return () => {
      unsubInvoices();
      unsubProcesses();
      unsubTasks();
      unsubPurchase();
      unsubPayrolls();
      unsubDocuments();
    };
  }, [user]);

  const [dateFilter, setDateFilter] = useState({
    start: '',
    end: ''
  });

  useEffect(() => {
    if (autoOpen) {
      if (activeTab === 'billing') setIsModalOpen(true);
      if (activeTab === 'flow') setIsProcessModalOpen(true);
      onModalHandled?.();
    }
  }, [autoOpen, onModalHandled, activeTab]);

  const [newInvoice, setNewInvoice] = useState<Partial<Invoice>>({
    client: '',
    status: 'Pendiente',
    netAmount: 0,
    iva: 0,
    totalAmount: 0,
    paymentMethod: 'Transferencia',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    associatedDocIds: []
  });

  const [newProcess, setNewProcess] = useState<Partial<FinanceProcess>>({
    clientName: '',
    projectName: '',
    currentStage: 'quotation',
    totalValue: 0
  });

  const handleAmountChange = (val: string) => {
    const net = parseFloat(val) || 0;
    const iva = Math.round(net * 0.19);
    setNewInvoice({
      ...newInvoice,
      netAmount: net,
      iva: iva,
      totalAmount: net + iva
    });
  };

  const handleSubmitInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const docRef = await addDoc(collection(db, 'invoices'), {
        ...newInvoice,
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });

      // Update associated documents as linked
      if (newInvoice.associatedDocIds && newInvoice.associatedDocIds.length > 0) {
        for (const docId of newInvoice.associatedDocIds) {
          const documentRef = doc(db, 'documents', docId);
          await updateDoc(documentRef, {
            linkedInvoiceId: docRef.id,
            status: 'sent' // update its status to reflect it's processed/sent
          });
        }
      }

      setIsModalOpen(false);
      setNewInvoice({ 
        client: '', 
        status: 'Pendiente', 
        netAmount: 0, 
        iva: 0, 
        totalAmount: 0, 
        paymentMethod: 'Transferencia', 
        date: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        associatedDocIds: []
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateProcess = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await addDoc(collection(db, 'financeProcesses'), {
        ...newProcess,
        ownerId: user.uid,
        updatedAt: new Date().toLocaleDateString(),
        createdAt: serverTimestamp(),
        documents: { paymentStatusIds: [], invoiceIds: [] }
      });
      setIsProcessModalOpen(false);
    } catch (error) {
      console.error(error);
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'quotation': return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'po_received': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'payment_status': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'invoiced': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'paid': return 'bg-primary text-white border-primary';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'quotation': return 'Presupuesto Enviado';
      case 'po_received': return 'OC Recibida';
      case 'payment_status': return 'Estado de Pago';
      case 'invoiced': return 'Facturado';
      case 'paid': return 'Pago Recibido';
      default: return stage;
    }
  };

  const parseDate = (dateStr: string) => {
    // Intentar parsear formatos comunes en la app
    // "15 may 2026" o "15/05/2024"
    try {
      const parts = dateStr.split(' ');
      if (parts.length === 3) {
        const months: Record<string, number> = {
          'ene': 0, 'jan': 0,
          'feb': 1,
          'mar': 2,
          'abr': 3, 'apr': 3,
          'may': 4,
          'jun': 5,
          'jul': 6,
          'ago': 7, 'aug': 7,
          'sep': 8,
          'oct': 9,
          'nov': 10,
          'dic': 11, 'dec': 11
        };
        const day = parseInt(parts[0]);
        const month = months[parts[1].toLowerCase().substring(0, 3)];
        const year = parseInt(parts[2]);
        if (!isNaN(day) && month !== undefined && !isNaN(year)) {
          return new Date(year, month, day);
        }
      }
      return new Date(dateStr);
    } catch {
      return new Date();
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (!dateFilter.start && !dateFilter.end) return true;
    const invDate = parseDate(inv.date);
    if (dateFilter.start) {
      const start = new Date(dateFilter.start);
      if (invDate < start) return false;
    }
    if (dateFilter.end) {
      const end = new Date(dateFilter.end);
      end.setHours(23, 59, 59, 999);
      if (invDate > end) return false;
    }
    return true;
  });

  const handleDownloadXLSX = () => {
    const data = filteredInvoices.map(inv => ({
      Referencia: inv.id,
      Cliente: inv.client,
      'Medio de Pago': inv.paymentMethod || 'N/A',
      Estado: inv.status,
      Fecha: inv.date,
      Neto: inv.netAmount,
      IVA: inv.iva,
      Total: inv.totalAmount
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');
    XLSX.writeFile(workbook, `Reporte_Financiero_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF() as any;
    doc.setFontSize(20);
    doc.text('Reporte de Facturación', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Fecha de exportación: ${new Date().toLocaleString()}`, 14, 30);
    if (dateFilter.start || dateFilter.end) {
      doc.text(`Filtro: ${dateFilter.start || '...'} al ${dateFilter.end || '...'}`, 14, 35);
    }

    const tableData = filteredInvoices.map(inv => [
      inv.id,
      inv.client,
      inv.paymentMethod || '---',
      inv.status,
      inv.date,
      `$${inv.totalAmount.toLocaleString()}`
    ]);

    doc.autoTable({
      startY: 45,
      head: [['Referencia', 'Cliente', 'Medio Pago', 'Estado', 'Fecha', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`Reporte_Financiero_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const totalBilling = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'Pagado').reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalPending = invoices.filter(i => i.status === 'Pendiente').reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalOverdue = invoices.filter(i => i.status === 'Vencido').reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

  const overdueInvoices = invoices.filter(inv => {
    if (inv.status === 'Vencido') return true;
    if (inv.status === 'Pendiente' && inv.dueDate) {
      return new Date(inv.dueDate) < new Date();
    }
    return false;
  });

  // KPI Calculations
  const cashInflow = invoices
    .filter(i => i.status === 'Pagado')
    .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

  const paidPurchaseExpenses = purchaseInvoices
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.totalAmount || 0), 0);

  const paidPayrollExpenses = payrolls
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.netPay || 0), 0);

  const cashOutflow = paidPurchaseExpenses + paidPayrollExpenses;
  const operatingCashFlow = cashInflow - cashOutflow;

  // Receivables (Invoices pending / overdue)
  const accountsReceivable = invoices
    .filter(i => i.status !== 'Pagado')
    .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

  // Payables (Purchase invoices pending/overdue + draft/unpaid payrolls)
  const pendingPurchaseExpenses = purchaseInvoices
    .filter(p => p.status !== 'paid')
    .reduce((sum, p) => sum + (p.totalAmount || 0), 0);

  const pendingPayrollExpenses = payrolls
    .filter(p => p.status !== 'paid')
    .reduce((sum, p) => sum + (p.netPay || 0), 0);

  const accountsPayable = pendingPurchaseExpenses + pendingPayrollExpenses;

  // Collection efficiency
  const collectionRate = totalBilling > 0 ? (cashInflow / totalBilling) * 100 : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm font-sans">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Control Financiero</h2>
          <p className="text-slate-500 mt-1">Gestión integral desde el presupuesto hasta el recaudo final.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === 'billing' && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all"
            >
              <Plus size={18} />
              Emitir Factura
            </button>
          )}
          {activeTab === 'flow' && (
            <button 
              onClick={() => setIsProcessModalOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all"
            >
              <Activity size={18} />
              Iniciar Seguimiento
            </button>
          )}
          <button 
            onClick={() => setIsFilterModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium"
          >
            <Calendar size={18} />
            {dateFilter.start || dateFilter.end ? 'Filtrado' : 'Filtrar Fechas'}
          </button>
        </div>
      </div>

      {/* Finance KPIs Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
        {/* Operating Cash Flow KPI Card */}
        <div className={`p-5 bg-white rounded-2xl border shadow-sm transition-all hover:shadow-md ${operatingCashFlow >= 0 ? 'border-emerald-100 hover:border-emerald-200' : 'border-rose-100 hover:border-rose-200'}`}>
          <div className="flex justify-between items-start gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest block mb-1">Flujo de Caja Real</span>
              <h3 className={`text-2xl font-black font-mono tracking-tight ${operatingCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ${operatingCashFlow.toLocaleString()}
              </h3>
            </div>
            <span className={`p-2 rounded-xl shrink-0 ${operatingCashFlow >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <TrendingUp size={16} />
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-3.5 flex items-center gap-1">
            <span className="font-bold text-emerald-600">${cashInflow.toLocaleString()} rec.</span>
            <span>v/s</span>
            <span className="font-bold text-rose-500">${cashOutflow.toLocaleString()} pag.</span>
          </p>
        </div>

        {/* Cash Inflow KPI Card */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md hover:border-slate-300">
          <div className="flex justify-between items-start gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest block mb-1">Efectivo Recaudado</span>
              <h3 className="text-2xl font-black font-mono tracking-tight text-slate-900">
                ${cashInflow.toLocaleString()}
              </h3>
            </div>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
              <ArrowUpRight size={16} />
            </span>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              <span>Eficiencia de Cobro</span>
              <span className="text-emerald-600 font-black">{collectionRate.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all" 
                style={{ width: `${Math.min(100, collectionRate)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Accounts Receivable KPI Card */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md hover:border-slate-300">
          <div className="flex justify-between items-start gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest block mb-1">Cuentas por Cobrar</span>
              <h3 className="text-2xl font-black font-mono tracking-tight text-amber-600">
                ${accountsReceivable.toLocaleString()}
              </h3>
            </div>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-xl shrink-0">
              <Clock size={16} />
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-3.5">
            <span className="font-bold text-slate-700">{invoices.filter(i => i.status !== 'Pagado').length}</span> documentos vigentes o vencidos
          </p>
        </div>

        {/* Accounts Payable KPI Card */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md hover:border-slate-300">
          <div className="flex justify-between items-start gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest block mb-1">Cuentas por Pagar</span>
              <h3 className="text-2xl font-black font-mono tracking-tight text-slate-800">
                ${accountsPayable.toLocaleString()}
              </h3>
            </div>
            <span className="p-2 bg-slate-100 text-slate-600 rounded-xl shrink-0">
              <ArrowDownLeft size={16} />
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-3.5 flex flex-wrap items-center gap-1">
            <span className="font-bold text-slate-700">${pendingPurchaseExpenses.toLocaleString()} prov.</span>
            <span>+</span>
            <span className="font-bold text-slate-700">${pendingPayrollExpenses.toLocaleString()} nóminas</span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-8">
        {[
          { id: 'billing', label: 'Facturación / Invoices', icon: FileCheck },
          { id: 'flow', label: 'Seguimiento de Flujo', icon: Activity },
          { id: 'reminders', label: 'Remanentes y Cobranza', icon: Bell },
          { id: 'balance', label: 'Balance Real (Gasto v/s Ingreso)', icon: TrendingUp },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as FinanceTab)}
            className={`pb-4 text-sm font-bold uppercase tracking-widest flex items-center gap-2 transition-all relative
              ${activeTab === tab.id ? 'text-primary' : 'text-slate-400 hover:text-slate-600'}
            `}
          >
            <tab.icon size={16} />
            {tab.label}
            {activeTab === tab.id && (
              <motion.div 
                layoutId="finance-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'billing' && (
          <motion.div 
            key="billing"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 font-mono">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-slate-300">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Total Facturado</p>
                  <div className="p-1 px-2 rounded-full bg-slate-50 text-slate-600 border border-slate-100 flex items-center gap-1">
                    <FileText size={12} />
                    <span className="text-[10px] font-bold">{invoices.length} Docs</span>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-slate-900">${totalBilling.toLocaleString()}</h3>
              </div>
              
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-slate-300">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Pendiente (Vigente)</p>
                  <div className="p-1 px-2 rounded-full bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-1">
                    <Clock size={12} />
                    <span className="text-[10px] font-bold">{invoices.filter(i => i.status === 'Pendiente').length} Pend.</span>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-slate-900">${totalPending.toLocaleString()}</h3>
              </div>

              <div className="bg-white p-6 rounded-xl border border-rose-200 shadow-sm transition-all hover:border-rose-300 bg-rose-50/10">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest font-sans underline decoration-rose-200 underline-offset-4">Vencido (Overdue)</p>
                  <div className="p-1 px-2 rounded-full bg-rose-100 text-rose-600 border border-rose-200 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    <span className="text-[10px] font-bold">{overdueInvoices.length} Venc.</span>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-rose-600">${overdueInvoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0).toLocaleString()}</h3>
              </div>
  
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-lg ring-1 ring-primary/5">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest font-sans">Recaudado (Pagado)</p>
                  <div className="p-1.5 rounded-lg bg-emerald-500 text-white shadow-sm">
                    <CheckCircle2 size={16} />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-primary">${totalPaid.toLocaleString()}</h3>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-900">Estado de Facturación</h3>
                  <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-500 uppercase tracking-widest">{invoices.length} Docs</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Buscar factura..." className="pl-9 pr-4 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-primary/20 outline-none" />
                  </div>
                  <button className="p-2 text-slate-400 hover:text-slate-600"><Filter size={18} /></button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <th className="px-6 py-4">Referencia</th>
                      <th className="px-6 py-4">Cliente Corporativo</th>
                      <th className="px-6 py-4">Medio de Pago</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4">Alerta Email</th>
                      <th className="px-6 py-4">Emisión</th>
                      <th className="px-6 py-4 text-right">Importe Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 font-mono font-medium text-slate-500">{inv.id}</td>
                        <td className="px-6 py-4 font-bold text-slate-900">
                          <div>{inv.client}</div>
                          {inv.associatedDocIds && inv.associatedDocIds.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {inv.associatedDocIds.map(docId => {
                                const foundDoc = documents.find(d => d.id === docId);
                                if (!foundDoc) return null;
                                const label = foundDoc.type === 'quotation' ? 'COT' :
                                              foundDoc.type === 'purchase_order' ? 'OC' :
                                              foundDoc.type === 'sales_note' ? 'NV' : 'EP';
                                const dTheme = foundDoc.type === 'quotation' ? 'bg-blue-50 text-blue-700 border-blue-105/40' :
                                               foundDoc.type === 'purchase_order' ? 'bg-amber-50 text-amber-700 border-amber-105/40' :
                                               foundDoc.type === 'sales_note' ? 'bg-purple-50 text-purple-700 border-purple-105/40' : 'bg-emerald-50 text-emerald-700 border-emerald-105/40';
                                return (
                                  <span key={docId} className={`px-1 rounded text-[8px] font-black uppercase tracking-wider border ${dTheme}`} title={`${foundDoc.type}: ${foundDoc.folio}`}>
                                    {label}: {foundDoc.folio}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-medium">{inv.paymentMethod || '---'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border
                            ${inv.status === 'Pagado' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                              inv.status === 'Pendiente' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-rose-50 text-rose-700 border-rose-100'}
                          `}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {inv.status === 'Pagado' ? (
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Completado</span>
                          ) : inv.emailAlertSent ? (
                            <div className="flex flex-col" title={`Enviado el ${inv.emailAlertSentDate}`}>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 w-fit inline-flex items-center gap-1">
                                <Check size={8} className="stroke-[3]" />
                                <span>Enviado</span>
                              </span>
                              <span className="text-[8px] text-indigo-505 font-medium font-mono mt-0.5">{inv.emailAlertSentDate}</span>
                            </div>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-50 text-slate-500 border border-slate-200 w-fit">
                              Sin Enviar
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-medium">{inv.date}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <div className="flex flex-col items-end">
                              <span className="font-mono font-bold text-slate-900">${inv.totalAmount?.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline cursor-pointer">PDF</button>
                              {inv.status !== 'Pagado' && (
                                <button 
                                  onClick={() => openAlertModal(inv)}
                                  className="text-[9px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-200 border border-transparent font-black px-1.5 py-0.5 rounded inline-flex items-center gap-1 transition-all cursor-pointer"
                                  title="Enviar Alerta de Pago a rescoing@gmail.com"
                                >
                                  <Mail size={10} />
                                  <span>Alerta</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'flow' && (
          <motion.div 
            key="flow"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Pendientes de OC', count: processes.filter(p => p.currentStage === 'quotation').length, color: 'blue' },
                { label: 'OCs por cobrar EP', count: processes.filter(p => p.currentStage === 'po_received').length, color: 'amber' },
                { label: 'EPs por Facturar', count: processes.filter(p => p.currentStage === 'payment_status').length, color: 'indigo' },
                { label: 'Cuentas por Cobrar', count: processes.filter(p => p.currentStage === 'invoiced').length, color: 'rose' },
              ].map(stat => (
                <div key={stat.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.count}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h3 className="font-bold text-slate-900">Pipeline de Proyectos (Financial Cycle)</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {processes.length === 0 && (
                  <div className="p-12 text-center text-slate-400">
                    <Activity size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="text-sm font-medium">No hay ciclos activos para seguimiento.</p>
                    <button onClick={() => setIsProcessModalOpen(true)} className="text-primary font-bold text-xs uppercase tracking-widest mt-2 hover:underline">Iniciar Primer Seguimiento</button>
                  </div>
                )}
                {processes.map(process => (
                  <div 
                    key={process.id} 
                    onClick={() => { setSelectedProcessId(process.id); setIsProcessDetailModalOpen(true); }}
                    className="p-6 hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div className="space-y-1 min-w-[240px]">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-slate-400">{process.id}</span>
                          <h4 className="font-bold text-slate-900">{process.clientName}</h4>
                        </div>
                        <p className="text-sm text-slate-500">{process.projectName || 'Venta Directa'}</p>
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-2">
                          <span>Total: ${process.totalValue.toLocaleString()}</span>
                          <span>•</span>
                          <span>Act: {process.updatedAt}</span>
                        </div>
                      </div>

                      <div className="flex-1 max-w-2xl px-4">
                        <div className="relative">
                          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-slate-100 rounded-full" />
                          <div className="relative flex justify-between">
                            {['quotation', 'po_received', 'payment_status', 'invoiced', 'paid'].map((stage, idx) => {
                              const stages = ['quotation', 'po_received', 'payment_status', 'invoiced', 'paid'];
                              const currentIdx = stages.indexOf(process.currentStage);
                              const isCompleted = idx < currentIdx;
                              const isActive = idx === currentIdx;
                              
                              return (
                                <div key={stage} className="flex flex-col items-center gap-2 relative z-10">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all
                                    ${isCompleted ? 'bg-primary border-primary text-white' : 
                                      isActive ? 'bg-white border-primary text-primary shadow-lg ring-4 ring-primary/10' : 
                                      'bg-white border-slate-200 text-slate-300'}
                                  `}>
                                    {isCompleted ? <CheckCircle2 size={16} /> : 
                                     isActive ? <Clock size={16} /> : 
                                     <ArrowRight size={14} />}
                                  </div>
                                  <span className={`text-[9px] font-bold uppercase tracking-wider absolute -bottom-6 w-20 text-center
                                    ${isActive ? 'text-primary' : 'text-slate-400'}
                                  `}>
                                    {getStageLabel(stage).split(' ')[0]}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pl-4">
                        <button className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all">
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'reminders' && (
          <motion.div 
            key="reminders"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <AlertTriangle size={18} className="text-rose-500" />
                    Documentos Vencidos (Recupero)
                  </h3>
                  <span className="bg-rose-50 text-rose-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border border-rose-100">
                    {overdueInvoices.length} Documentos Críticos
                  </span>
                </div>
                
                <div className="space-y-4">
                  {overdueInvoices.length === 0 && (
                    <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                      <CheckCircle2 size={48} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">No hay documentos vencidos pendientes.</p>
                    </div>
                  )}
                  {overdueInvoices.map(inv => (
                    <div key={inv.id} className="p-4 bg-rose-50/30 border border-rose-100 rounded-xl flex items-center justify-between group hover:bg-rose-50 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-rose-100 text-rose-600">
                          <FileText size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900">{inv.client}</p>
                            <span className="text-[10px] font-mono text-slate-400">#{inv.id.substring(0,6)}</span>
                          </div>
                          <p className="text-xs text-rose-600 font-bold uppercase tracking-widest">Venció: {inv.dueDate || inv.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs font-mono font-bold text-slate-900">${inv.totalAmount?.toLocaleString()}</p>
                          {inv.emailAlertSent ? (
                            <span className="text-[8px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 block uppercase tracking-wider mt-0.5 whitespace-nowrap" title={`Alerta de Pago enviado por Email el ${inv.emailAlertSentDate}`}>
                              📧 Alerta Enviada
                            </span>
                          ) : (
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{inv.status}</p>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <button 
                            onClick={() => openAlertModal(inv)}
                            className="p-2 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-lg text-indigo-600 transition-all shadow-sm cursor-pointer flex items-center justify-center"
                            title="Enviar Alerta de Pago a rescoing@gmail.com"
                          >
                            <Mail size={16} />
                          </button>
                          <button 
                            onClick={async () => {
                              if (!user) return;
                              const docRef = doc(db, 'invoices', inv.id);
                              await updateDoc(docRef, { status: 'Pagado', updatedAt: serverTimestamp() });
                            }}
                            className="p-2 bg-white border border-slate-200 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm cursor-pointer flex items-center justify-center"
                            title="Marcar como pagado"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-bold text-slate-900 mb-6">Resumen de Antigüedad de Deuda</h3>
                <div className="space-y-4">
                  {[
                    { label: '0-30 días', amount: '$45,200', pct: 60, color: 'emerald' },
                    { label: '31-60 días', amount: '$12,800', pct: 25, color: 'amber' },
                    { label: '61-90 días', amount: '$5,400', pct: 10, color: 'rose' },
                    { label: '+90 días', amount: '$2,100', pct: 5, color: 'slate' },
                  ].map(stat => (
                    <div key={stat.label} className="space-y-2">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-slate-400">{stat.label}</span>
                        <span className="text-slate-900">{stat.amount}</span>
                      </div>
                      <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                        <motion.div 
                          className={`h-full bg-${stat.color}-500`}
                          initial={{ width: 0 }}
                          animate={{ width: `${stat.pct}%` }}
                          transition={{ duration: 1 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <AlertTriangle size={64} className="text-primary" />
                </div>
                <h4 className="text-primary font-bold text-sm mb-2 flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Atención Requerida
                </h4>
                <p className="text-xs text-primary/80 font-medium leading-relaxed">
                  Hay {overdueInvoices.length} facturas vencidas que requieren atención inmediata. Se recomienda iniciar gestión de cobranza y actualizar estados de pago.
                </p>
                <button 
                  onClick={() => setActiveTab('billing')}
                  className="mt-4 w-full bg-primary text-white py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm hover:opacity-90"
                >
                  Gestionar Vencidos
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h4 className="font-bold text-slate-900 text-sm mb-4">Contactos de Cobranza (Top)</h4>
                <div className="space-y-4">
                  {[
                    { name: 'Andrea Valdés', company: 'MiningCorp', phone: '+56 9 8234 1122' },
                    { name: 'Roberto Letelier', company: 'Paso Ancho Ltda', phone: '+56 9 7711 0044' },
                  ].map(c => (
                    <div key={c.name} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                        {c.name[0]}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{c.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase">{c.company}</p>
                        <p className="text-[10px] text-primary font-mono">{c.phone}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'balance' && (
          <motion.div 
            key="balance"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
              <div className="bg-emerald-50 p-8 rounded-2xl border border-emerald-100 shadow-sm">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-4">Ingresos Totales (Ventas)</p>
                <h3 className="text-3xl font-black text-emerald-900">${totalBilling.toLocaleString()}</h3>
                <div className="mt-4 pt-4 border-t border-emerald-200/50 flex justify-between text-[11px] font-bold text-emerald-700">
                  <span>Facturado Neto</span>
                  <span>${invoices.reduce((sum, inv) => sum + (inv.netAmount || 0), 0).toLocaleString()}</span>
                </div>
              </div>
              
              <div className="bg-rose-50 p-8 rounded-2xl border border-rose-100 shadow-sm text-right">
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-[0.2em] mb-4">Gastos Consolidados</p>
                <h3 className="text-3xl font-black text-rose-900">
                  ${(purchaseInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0) + payrolls.reduce((sum, p) => sum + (p.netPay || 0), 0)).toLocaleString()}
                </h3>
                <div className="mt-4 pt-4 border-t border-rose-200/50 space-y-1">
                  <div className="flex justify-between text-[11px] font-bold text-rose-700">
                    <span>Proveedores</span>
                    <span>${purchaseInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold text-rose-700">
                    <span>Nómina / RRHH</span>
                    <span>${payrolls.reduce((sum, p) => sum + (p.netPay || 0), 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-2xl shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                  <Activity size={80} className="text-white" />
                </div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Resultado Operacional (Utilidad)</p>
                <h3 className="text-3xl font-black text-white relative z-10">
                  ${(totalBilling - (purchaseInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0) + payrolls.reduce((sum, p) => sum + (p.netPay || 0), 0))).toLocaleString()}
                </h3>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary transform origin-left" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <ArrowDownLeft size={18} className="text-rose-500" />
                    Mayores Gastos por Proveedor
                  </h4>
                </div>
                <div className="p-6 space-y-4">
                  {purchaseInvoices.length > 0 ? (
                    Object.entries(
                      purchaseInvoices.reduce((acc, inv) => {
                        acc[inv.supplierId] = (acc[inv.supplierId] || 0) + (inv.totalAmount || 0);
                        return acc;
                      }, {} as Record<string, number>)
                    )
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 5)
                    .map(([supplierId, total], i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
                            {i + 1}
                          </div>
                          <span className="text-sm font-bold text-slate-700">Proveedor ID: {supplierId.substring(0, 8)}</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900">${total.toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 italic text-center py-8">Sin registros de compras aún.</p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <ArrowUpRight size={18} className="text-emerald-500" />
                    Mayores Proyectos por Facturación
                  </h4>
                </div>
                <div className="p-6 space-y-4">
                  {invoices.length > 0 ? (
                     Object.entries(
                      invoices.reduce((acc, inv) => {
                        acc[inv.client] = (acc[inv.client] || 0) + (inv.totalAmount || 0);
                        return acc;
                      }, {} as Record<string, number>)
                    )
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 5)
                    .map(([client, total], i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                            {i + 1}
                          </div>
                          <span className="text-sm font-bold text-slate-700">{client}</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900">${total.toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 italic text-center py-8">Sin registros de facturación aún.</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Web3Forms Payment Alert Modal */}
      <Modal
        isOpen={isAlertModalOpen}
        onClose={() => !isSendingAlert && setIsAlertModalOpen(false)}
        title="Enviar Alerta de Pago Automatizada"
      >
        <form onSubmit={handleSendPaymentAlert} className="space-y-4 font-sans text-left">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 flex items-center gap-3.5">
            <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl">
              <Mail size={22} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Servicio Integrado</p>
              <h4 className="text-sm font-black text-slate-800">Web3Forms Mail Gateway</h4>
            </div>
            <div className="ml-auto bg-indigo-100 text-indigo-850 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-indigo-200 tracking-wider">
              En Línea
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-1.5">Destinatario (Email del Sistema)</label>
              <input 
                type="text"
                disabled
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-bold text-xs focus:outline-none"
                value="rescoing@gmail.com" 
              />
              <p className="text-[10px] text-slate-400 font-medium italic mt-1">Configurado por directiva para alertas de pago corporativas.</p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-1.5">Asunto del Correo</label>
              <input 
                type="text"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                value={alertSubject} 
                onChange={e => setAlertSubject(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-1.5">Cuerpo del Mensaje (Editable)</label>
              <textarea 
                rows={11}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono leading-relaxed"
                value={alertMessage} 
                onChange={e => setAlertMessage(e.target.value)}
              />
            </div>
          </div>

          {alertSuccess === true && (
            <div className="p-3 bg-emerald-50 text-emerald-805 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
              <Check className="text-emerald-600 stroke-[3]" size={16} />
              <span>¡Alerta de pago enviada a rescoing@gmail.com exitosamente!</span>
            </div>
          )}

          {alertSuccess === false && (
            <div className="p-3 bg-rose-50 text-rose-805 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="text-rose-600" size={16} />
              <span>Ocurrió un error al enviar el correo. Por favor, reintenta.</span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              disabled={isSendingAlert}
              onClick={() => setIsAlertModalOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSendingAlert || alertSuccess === true}
              className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all uppercase tracking-wider cursor-pointer flex items-center gap-2"
            >
              {isSendingAlert ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : alertSuccess === true ? (
                <>
                  <Check className="stroke-[3]" size={14} />
                  <span>Enviado</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Enviar Alerta de Pago</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Invoice Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Generar Nueva Factura"
      >
        <form onSubmit={handleSubmitInvoice} className="space-y-4 font-sans">
          <div className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-sans">Documentos Asociados a Vincular (OC, NV, EP, Cotización)</label>
              <p className="text-[10px] text-slate-405 mb-2 leading-snug">Vincule uno o más documentos mercantiles para rellenar los datos de facturación automáticamente.</p>
              <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1 border border-slate-200 rounded-lg p-2 bg-slate-50">
                {documents.filter(d => d.type !== 'invoice').length === 0 ? (
                  <p className="text-slate-400 italic text-[11px] py-3 text-center">No hay otros documentos mercantiles registrados en el ERP</p>
                ) : (
                  documents.filter(d => d.type !== 'invoice').map(docItem => {
                    const isChecked = newInvoice.associatedDocIds?.includes(docItem.id) || false;
                    const docLabel = docItem.type === 'quotation' ? 'COT' :
                                     docItem.type === 'purchase_order' ? 'OC' :
                                     docItem.type === 'sales_note' ? 'NV' : 'EP';
                    const docTheme = docItem.type === 'quotation' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                     docItem.type === 'purchase_order' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                     docItem.type === 'sales_note' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100';
                    return (
                      <button
                        type="button"
                        key={docItem.id} 
                        onClick={() => {
                          const currentIds = newInvoice.associatedDocIds || [];
                          let newIds = [];
                          if (isChecked) {
                            newIds = currentIds.filter(id => id !== docItem.id);
                          } else {
                            newIds = [...currentIds, docItem.id];
                          }
                          
                          // Auto completion logic
                          const selectedDocs = documents.filter(d => newIds.includes(d.id));
                          
                          let fillClient = newInvoice.client || '';
                          if (selectedDocs.length > 0) {
                            fillClient = selectedDocs[0].clientName;
                          }
                          
                          // Recalculate sum
                          const totalNet = selectedDocs.reduce((sum, d) => sum + (d.netAmount || 0), 0);
                          const totalIva = Math.round(totalNet * 0.19);
                          const totalSum = totalNet + totalIva;

                          setNewInvoice({
                            ...newInvoice,
                            associatedDocIds: newIds,
                            client: fillClient,
                            netAmount: totalNet,
                            iva: totalIva,
                            totalAmount: totalSum
                          });
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                          isChecked ? 'bg-indigo-50 border-indigo-250 text-indigo-900 shadow-sm' : 'bg-white border-slate-150 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            readOnly
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                          />
                          <div>
                            <span className={`inline-block font-black font-mono text-[9px] uppercase px-1.5 py-0.5 rounded border ${docTheme} mr-2`}>
                              {docLabel}
                            </span>
                            <span className="font-bold text-slate-800 font-mono text-xs">{docItem.folio}</span>
                            <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">{docItem.clientName}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold font-mono text-xs text-slate-700">${docItem.totalAmount?.toLocaleString()}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cliente Corporativo</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newInvoice.client}
                onChange={e => setNewInvoice({...newInvoice, client: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha de Emisión</label>
              <input 
                required
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newInvoice.date}
                onChange={e => setNewInvoice({...newInvoice, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha de Vencimiento</label>
              <input 
                required
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newInvoice.dueDate}
                onChange={e => setNewInvoice({...newInvoice, dueDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Monto Neto ($)</label>
              <input 
                required
                type="number" 
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono"
                value={newInvoice.netAmount}
                onChange={e => handleAmountChange(e.target.value)}
              />
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">IVA (19%)</span>
              <span className="text-sm font-mono font-bold text-slate-600">${newInvoice.iva?.toLocaleString()}</span>
            </div>
            <div className="bg-primary/5 p-3 rounded-lg border border-primary/20 flex justify-between items-center text-primary">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Total Facturado</span>
              <span className="text-lg font-mono font-bold">${newInvoice.totalAmount?.toLocaleString()}</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Medio de Pago</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                value={newInvoice.paymentMethod}
                onChange={e => setNewInvoice({...newInvoice, paymentMethod: e.target.value as any})}
              >
                <option value="Transferencia">Transferencia</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Estado de Pago</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                value={newInvoice.status}
                onChange={e => setNewInvoice({...newInvoice, status: e.target.value as any})}
              >
                <option value="Pendiente">Pendiente</option>
                <option value="Pagado">Pagado</option>
                <option value="Vencido">Vencido</option>
              </select>
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-white py-2.5 rounded-lg font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all mt-2"
          >
            Emitir Factura
          </button>
        </form>
      </Modal>

      {/* Process Modal */}
      <Modal 
        isOpen={isProcessModalOpen} 
        onClose={() => setIsProcessModalOpen(false)} 
        title="Iniciar Seguimiento de Flujo"
      >
        <form onSubmit={handleCreateProcess} className="space-y-4 font-sans text-left">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cliente</label>
            <input 
              required
              type="text" 
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              value={newProcess.clientName}
              onChange={e => setNewProcess({...newProcess, clientName: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Proyecto / Referencia</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              value={newProcess.projectName}
              onChange={e => setNewProcess({...newProcess, projectName: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Monto Total Estimado ($)</label>
            <input 
              required
              type="number" 
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono"
              value={newProcess.totalValue}
              onChange={e => setNewProcess({...newProcess, totalValue: parseFloat(e.target.value) || 0})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Etapa Inicial</label>
            <select 
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
              value={newProcess.currentStage}
              onChange={e => setNewProcess({...newProcess, currentStage: e.target.value as any})}
            >
              <option value="quotation">Presupuesto</option>
              <option value="po_received">OC Recibida</option>
              <option value="payment_status">Estado de Pago</option>
              <option value="invoiced">Facturado</option>
            </select>
          </div>
          <button 
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all mt-2"
          >
            Iniciar Pipeline
          </button>
        </form>
      </Modal>

      {/* Process Detail Modal */}
      <Modal 
        isOpen={isProcessDetailModalOpen} 
        onClose={() => setIsProcessDetailModalOpen(false)} 
        title={`Detalle de Seguimiento: ${selectedProcess?.id}`}
      >
        <div className="space-y-6 font-sans text-left">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cliente / Proyecto</p>
            <h4 className="font-bold text-slate-900">{selectedProcess?.clientName}</h4>
            <p className="text-sm text-slate-500">{selectedProcess?.projectName}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Documentos del Ciclo</h5>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400">
                      <FileText size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Cotización</p>
                      <p className="text-[10px] text-slate-400 font-mono">{selectedProcess?.documents.quotationId || 'Pendiente'}</p>
                    </div>
                  </div>
                  {selectedProcess?.documents.quotationId && <CheckCircle2 size={14} className="text-emerald-500" />}
                </div>

                <div className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400">
                      <TableIcon size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Orden de Compra</p>
                      <p className="text-[10px] text-slate-400 font-mono">{selectedProcess?.documents.poId || 'Pendiente de Recepción'}</p>
                    </div>
                  </div>
                  {selectedProcess?.documents.poId && <CheckCircle2 size={14} className="text-emerald-500" />}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Estados de Pago ({selectedProcess?.documents.paymentStatusIds.length})</p>
                  {selectedProcess?.documents.paymentStatusIds.length === 0 ? (
                    <p className="text-[10px] text-slate-300 italic pl-1">No hay estados de pago registrados.</p>
                  ) : (
                    selectedProcess?.documents.paymentStatusIds.map((ep, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg">
                        <span className="text-xs font-mono font-bold text-slate-600">{ep}</span>
                        <CheckCircle2 size={14} className="text-slate-200" />
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Facturas Emitidas ({selectedProcess?.documents.invoiceIds.length})</p>
                  {selectedProcess?.documents.invoiceIds.length === 0 ? (
                    <p className="text-[10px] text-slate-300 italic pl-1">Sin facturas asociadas aún.</p>
                  ) : (
                    selectedProcess?.documents.invoiceIds.map((inv, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg">
                        <span className="text-xs font-mono font-bold text-slate-600">{inv}</span>
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Acciones de Flujo</h5>
              
              <div className="space-y-3">
                <button 
                  onClick={async () => {
                    const stages: any[] = ['quotation', 'po_received', 'payment_status', 'invoiced', 'paid'];
                    const currentIdx = stages.indexOf(selectedProcess?.currentStage);
                    if (currentIdx < stages.length - 1 && selectedProcessId) {
                      const docRef = doc(db, 'financeProcesses', selectedProcessId);
                      await updateDoc(docRef, { 
                        currentStage: stages[currentIdx + 1], 
                        updatedAt: new Date().toLocaleDateString() 
                      });
                    }
                  }}
                  className="w-full flex items-center justify-between p-4 bg-primary text-white rounded-xl shadow-sm hover:opacity-90 transition-all group"
                >
                  <div className="text-left">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Siguiente hito</p>
                    <p className="text-sm font-bold">Avanzar Etapa</p>
                  </div>
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Vincular OC / Documento</label>
                    <div className="flex gap-2">
                       <input 
                        type="text" 
                        placeholder="Ej: OC-99221" 
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (!val || !selectedProcessId || !selectedProcess) return;
                            const docRef = doc(db, 'financeProcesses', selectedProcessId);
                            await updateDoc(docRef, { 
                              documents: { ...selectedProcess.documents, poId: val }, 
                              updatedAt: new Date().toLocaleDateString() 
                            });
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                    <button className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-slate-50">
                        Generar Recordatorio
                    </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Filter Modal */}
      <Modal 
        isOpen={isFilterModalOpen} 
        onClose={() => setIsFilterModalOpen(false)} 
        title="Filtrar por Rango de Fechas"
      >
        <div className="space-y-4 font-sans text-left">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Desde</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={dateFilter.start}
                onChange={e => setDateFilter({...dateFilter, start: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Hasta</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={dateFilter.end}
                onChange={e => setDateFilter({...dateFilter, end: e.target.value})}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button 
              onClick={() => { setDateFilter({ start: '', end: '' }); setIsFilterModalOpen(false); }}
              className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-widest hover:bg-slate-50"
            >
              Limpiar
            </button>
            <button 
              onClick={() => setIsFilterModalOpen(false)}
              className="flex-1 bg-primary text-white py-2 rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm hover:opacity-90"
            >
              Aplicar Filtro
            </button>
          </div>
        </div>
      </Modal>

      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col md:flex-row items-center justify-center gap-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Exportar Reporte Mensual:</p>
          <div className="flex gap-3">
            <button 
              onClick={handleDownloadXLSX}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm hover:opacity-90 transition-all"
            >
              <TableIcon size={14} />
              Excel (XLSX)
            </button>
            <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm hover:opacity-90 transition-all"
            >
              <FileText size={14} />
              PDF Document
            </button>
          </div>
      </div>
    </div>
  );
}
