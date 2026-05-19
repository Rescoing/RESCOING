import { useState, useEffect } from 'react';
import { Briefcase, Package, TrendingUp, Layers, ChevronRight, Calendar, Download, Printer, FileDown } from 'lucide-react';
import { motion } from 'motion/react';
import Modal from './ui/Modal';
import { collection, query, where, getCountFromServer, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

interface DashboardViewProps {
  onQuickAction: (action: string) => void;
}

export default function DashboardView({ onQuickAction }: DashboardViewProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    projectsCount: 0,
    lowStockCount: 0,
    revenue: 0,
    expenses: 0,
    balance: 0
  });
  const [loading, setLoading] = useState(true);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportConfig, setReportConfig] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: 'general'
  });

  useEffect(() => {
    if (!user) return;

    let revenueVal = 0;
    let purExpensesVal = 0;
    let payrollVal = 0;

    const updateFinancials = () => {
      const expenses = purExpensesVal + payrollVal;
      setStats(prev => ({
        ...prev,
        revenue: revenueVal,
        expenses: expenses,
        balance: revenueVal - expenses
      }));
    };

    const unsubProjects = onSnapshot(query(collection(db, 'projects'), where('ownerId', '==', user.uid)), (snap) => {
      setStats(prev => ({ ...prev, projectsCount: snap.size }));
    });

    const unsubInventory = onSnapshot(query(collection(db, 'inventory'), where('ownerId', '==', user.uid)), (snap) => {
      setStats(prev => ({ ...prev, lowStockCount: snap.docs.filter(d => d.data().stock <= (d.data().minStock || 0)).length }));
    });

    const unsubInvoices = onSnapshot(query(collection(db, 'invoices'), where('ownerId', '==', user.uid)), (snap) => {
      revenueVal = snap.docs.reduce((sum, d) => sum + (d.data().totalAmount || 0), 0);
      updateFinancials();
    });

    const unsubPurchaseInvoices = onSnapshot(query(collection(db, 'purchaseInvoices'), where('ownerId', '==', user.uid)), (snap) => {
      purExpensesVal = snap.docs.reduce((sum, d) => sum + (d.data().totalAmount || 0), 0);
      updateFinancials();
    });

    const unsubPayrolls = onSnapshot(query(collection(db, 'payrolls'), where('ownerId', '==', user.uid)), (snap) => {
      payrollVal = snap.docs.reduce((sum, d) => sum + (d.data().netPay || 0), 0);
      updateFinancials();
    });

    setLoading(false);

    return () => {
      unsubProjects();
      unsubInventory();
      unsubInvoices();
      unsubPurchaseInvoices();
      unsubPayrolls();
    };
  }, [user]);

  const handleGenerateReport = () => {
    // Simulate report generation
    console.log('Generando reporte:', reportConfig);
    setIsReportModalOpen(false);
    alert(`Reporte ${reportConfig.type} generado desde ${reportConfig.startDate} hasta ${reportConfig.endDate}`);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Panel de Control
          </h1>
          <p className="text-slate-500 mt-1">Sincronizado recientemente • Vista de Administrador</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 group">
            <div className="flex items-center gap-2 px-3 py-1.5 border-r border-slate-100">
              <Calendar size={14} className="text-slate-400" />
              <input 
                type="date" 
                className="text-xs font-bold text-slate-600 focus:outline-none bg-transparent"
                value={reportConfig.startDate}
                onChange={e => setReportConfig({...reportConfig, startDate: e.target.value})}
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5">
              <input 
                type="date" 
                className="text-xs font-bold text-slate-600 focus:outline-none bg-transparent"
                value={reportConfig.endDate}
                onChange={e => setReportConfig({...reportConfig, endDate: e.target.value})}
              />
            </div>
          </div>
          <button 
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all"
          >
            <Download size={18} />
            Generar Reporte
          </button>
        </div>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Proyectos Activos', value: loading ? '...' : stats.projectsCount.toString(), icon: Briefcase, trend: '+2 nuevos', trendColor: 'text-emerald-600' },
          { label: 'Ingresos (Cta x Cobrar)', value: `$${stats.revenue.toLocaleString()}`, icon: TrendingUp, trend: 'Ventas Netas', trendColor: 'text-emerald-600' },
          { label: 'Gastos (Proveedores + RRHH)', value: `$${stats.expenses.toLocaleString()}`, icon: Package, trend: 'Cargos Reales', trendColor: 'text-rose-600' },
          { label: 'Balance Operativo', value: `$${stats.balance.toLocaleString()}`, icon: Layers, trend: stats.balance >= 0 ? 'Utilidad Bruta' : 'Déficit Temp.', trendColor: stats.balance >= 0 ? 'text-emerald-600' : 'text-rose-600' },
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"
          >
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide font-sans">{stat.label}</p>
            <h3 className="text-2xl font-bold mt-1 text-slate-900 font-mono">{stat.value}</h3>
            <p className={`text-xs mt-2 font-medium ${stat.trendColor}`}>{stat.trend}</p>
          </motion.div>
        ))}
      </div>

      <Modal 
        isOpen={isReportModalOpen} 
        onClose={() => setIsReportModalOpen(false)}
        title="Generador de Reportes Analíticos"
      >
        <div className="space-y-6 font-sans">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo de Reporte</label>
              <div className="grid grid-cols-3 gap-2">
                {['general', 'financial', 'operational'].map(type => (
                  <button
                    key={type}
                    onClick={() => setReportConfig({...reportConfig, type})}
                    className={`px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${reportConfig.type === type ? 'bg-primary border-primary text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Desde</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                value={reportConfig.startDate}
                onChange={e => setReportConfig({...reportConfig, startDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Hasta</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                value={reportConfig.endDate}
                onChange={e => setReportConfig({...reportConfig, endDate: e.target.value})}
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">Formato de Exportación</p>
            <div className="flex gap-4">
              <button className="flex-1 flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-primary/30 hover:shadow-sm transition-all text-slate-600">
                <FileDown size={20} className="text-rose-500" />
                <span className="text-[10px] font-bold">PDF</span>
              </button>
              <button className="flex-1 flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-primary/30 hover:shadow-sm transition-all text-slate-600">
                <Printer size={20} className="text-primary" />
                <span className="text-[10px] font-bold">IMPRIMIR</span>
              </button>
              <button className="flex-1 flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-primary/30 hover:shadow-sm transition-all text-slate-600">
                <Download size={20} className="text-emerald-500" />
                <span className="text-[10px] font-bold">XLSX</span>
              </button>
            </div>
          </div>

          <button 
            onClick={handleGenerateReport}
            className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            <Layers size={18} />
            Procesar Reporte de Ingeniería
          </button>
        </div>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
            <h4 className="font-bold text-slate-900">Actividad Reciente de Ingeniería</h4>
            <button className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">Auditar Log</button>
          </div>
          <div className="flex-1 p-5 space-y-4">
            {[
              { title: 'Actualización: Componentes Hidráulicos', meta: 'Proyecto Planta Beta • Hace 2 horas' },
              { title: 'Factura Emitida: INV-2024-001', meta: 'TechMining S.A. • Hace 4 horas' },
              { title: 'Nuevo Lead: Constructora Global', meta: 'CRM / Ventas • Hace 6 horas' },
            ].map((activity, i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 rounded-lg transition-colors px-2 -mx-2">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-primary border border-slate-200">
                  <Briefcase size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">{activity.title}</p>
                  <p className="text-xs text-slate-500">{activity.meta}</p>
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="p-5 border-b border-slate-100">
            <h4 className="font-bold text-slate-900">Accesos Rápidos</h4>
          </div>
          <div className="p-5 grid grid-cols-1 gap-3">
            {['Nuevo Proyecto', 'Registrar Venta', 'Pedido Compra', 'Ver Reportes'].map((action, i) => (
              <button 
                key={i} 
                onClick={() => onQuickAction(action)}
                className="w-full flex items-center justify-center p-3 text-sm font-bold rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-primary hover:text-white hover:border-primary transition-all uppercase tracking-widest text-[10px]"
              >
                {action}
              </button>
            ))}
          </div>
          <div className="mt-auto p-5 border-t border-slate-100">
            <div className="bg-slate-900 rounded-xl p-5 text-white shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <TrendingUp size={48} />
              </div>
              <p className="text-[10px] font-bold opacity-60 uppercase tracking-[0.2em] mb-2">Plan Corporativo</p>
              <p className="text-xs leading-relaxed">Soporte técnico premium activado. Acceso prioritario a ingenieros de campo.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
