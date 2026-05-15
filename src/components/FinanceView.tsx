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
  Table as TableIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Invoice, FinanceProcess, FinanceTask } from '../types';
import Modal from './ui/Modal';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

type FinanceTab = 'billing' | 'flow' | 'reminders';

export default function FinanceView({ 
  autoOpen, 
  onModalHandled 
}: { autoOpen?: boolean; onModalHandled?: () => void }) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [processes, setProcesses] = useState<FinanceProcess[]>([]);
  const [tasks, setTasks] = useState<FinanceTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<FinanceTab>('billing');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [isProcessDetailModalOpen, setIsProcessDetailModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  
  const selectedProcess = processes.find(p => p.id === selectedProcessId);
  
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

    return () => {
      unsubInvoices();
      unsubProcesses();
      unsubTasks();
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
    date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
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
      await addDoc(collection(db, 'invoices'), {
        ...newInvoice,
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setNewInvoice({ client: '', status: 'Pendiente', netAmount: 0, iva: 0, totalAmount: 0, paymentMethod: 'Transferencia', date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) });
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

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-8">
        {[
          { id: 'billing', label: 'Facturación / Invoices', icon: FileCheck },
          { id: 'flow', label: 'Seguimiento de Flujo', icon: Activity },
          { id: 'reminders', label: 'Recordatorios y Cobranza', icon: Bell },
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-slate-300">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Facturado Mes</p>
                  <div className="p-1 px-2 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-1">
                    <ArrowUpRight size={12} />
                    <span className="text-[10px] font-bold">12.4%</span>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-slate-900">$124,500.00</h3>
              </div>
              
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-slate-300">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Gastos Operativos</p>
                  <div className="p-1 px-2 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center gap-1">
                    <ArrowDownLeft size={12} />
                    <span className="text-[10px] font-bold">2.1%</span>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-slate-900">$82,140.20</h3>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-lg ring-1 ring-primary/5">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest font-sans">Balance Neto</p>
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <DollarSign size={16} />
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-primary">$42,359.80</h3>
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
                      <th className="px-6 py-4">Emisión</th>
                      <th className="px-6 py-4 text-right">Importe Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 font-mono font-medium text-slate-500">{inv.id}</td>
                        <td className="px-6 py-4 font-bold text-slate-900">{inv.client}</td>
                        <td className="px-6 py-4 text-slate-500 font-medium">{inv.paymentMethod || '---'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border
                            ${inv.status === 'Pagado' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                              inv.status === 'Pendiente' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-rose-50 text-rose-700 border-rose-100'}
                          `}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-medium">{inv.date}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono font-bold text-slate-900">${inv.totalAmount?.toLocaleString()}</span>
                            <button className="text-[10px] font-bold text-primary uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">PDF</button>
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
                    <Bell size={18} className="text-primary" />
                    Próximas Gestiones de Cobro
                  </h3>
                  <button className="text-xs font-bold text-primary uppercase tracking-widest">Ver Calendario</button>
                </div>
                
                <div className="space-y-4">
                  {tasks.length === 0 && (
                    <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                      <Clock size={48} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">No hay tareas de seguimiento pendientes.</p>
                    </div>
                  )}
                  {tasks.map(task => (
                    <div key={task.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between group hover:border-primary/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg 
                          ${task.priority === 'high' ? 'bg-rose-100 text-rose-600' : 
                            task.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-600'}
                        `}>
                          {task.type === 'collection' ? <DollarSign size={18} /> : <Clock size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{task.title}</p>
                          <p className="text-xs text-slate-500 font-medium">{task.clientName} • Vence: {task.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border
                          ${task.priority === 'high' ? 'bg-rose-50 text-rose-700 border-rose-100' : 
                            task.priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-100 text-slate-600 border-slate-200'}
                        `}>
                          {task.priority}
                        </span>
                        <button className="p-2 bg-white border border-slate-200 rounded-lg text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-emerald-50">
                          <CheckCircle2 size={16} />
                        </button>
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
                  Hay 3 facturas vencidas que superan los 45 días sin confirmación de pago. Se recomienda iniciar gestión de cobranza telefónica inmediata.
                </p>
                <button className="mt-4 w-full bg-primary text-white py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm hover:opacity-90">Gestionar Vencidos</button>
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
      </AnimatePresence>

      {/* Invoice Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Generar Nueva Factura"
      >
        <form onSubmit={handleSubmitInvoice} className="space-y-4 font-sans">
          <div className="space-y-4 text-left">
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
