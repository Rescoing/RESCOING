import { useState, useEffect, Dispatch, SetStateAction, FormEvent } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  DollarSign,
  Plus,
  Calendar,
  Download
} from 'lucide-react';
import { motion } from 'motion/react';
import { Invoice } from '../types';
import Modal from './ui/Modal';

interface FinanceViewProps {
  invoices: Invoice[];
  onAdd: Dispatch<SetStateAction<Invoice[]>>;
  autoOpen?: boolean;
  onModalHandled?: () => void;
}

export default function FinanceView({ invoices, onAdd, autoOpen, onModalHandled }: FinanceViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) {
      setIsModalOpen(true);
      onModalHandled?.();
    }
  }, [autoOpen, onModalHandled]);
  const [newInvoice, setNewInvoice] = useState<Partial<Invoice>>({
    client: '',
    status: 'Pendiente',
    netAmount: 0,
    iva: 0,
    totalAmount: 0,
    date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const invoiceToAdd: Invoice = {
      ...newInvoice as Invoice,
      id: `INV-2024-${Math.floor(Math.random() * 900 + 100)}`
    };
    onAdd(prev => [...prev, invoiceToAdd]);
    setIsModalOpen(false);
    setNewInvoice({ client: '', status: 'Pendiente', netAmount: 0, iva: 0, totalAmount: 0, date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm font-sans">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Gestión Financiera</h2>
          <p className="text-slate-500 mt-1">Análisis de flujos, facturación y proyecciones corporativas.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus size={18} />
            Nueva Factura
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium">
            <Calendar size={18} />
            Marzo 2024
          </button>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Generar Nueva Factura"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Ingresos Mensuales</p>
            <div className="p-1 px-2 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-1">
              <ArrowUpRight size={12} />
              <span className="text-[10px] font-bold">12.4%</span>
            </div>
          </div>
          <h3 className="text-3xl font-bold text-slate-900">$124,500.00</h3>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
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
          <h3 className="font-bold text-slate-900">Estado de Facturación</h3>
          <button className="text-xs font-bold text-primary uppercase tracking-widest hover:underline">Auditar Todo</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4">Referencia</th>
                <th className="px-6 py-4">Cliente Corporativo</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Emisión</th>
                <th className="px-6 py-4 text-right">Importe Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {invoices.map((inv, i) => (
                <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono font-medium text-slate-500">{inv.id}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{inv.client}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border
                      ${inv.status === 'Pagado' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                        inv.status === 'Pendiente' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-rose-50 text-rose-700 border-rose-100'}
                    `}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-medium">{inv.date}</td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">${inv.totalAmount?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
            <button className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-primary transition-colors">
              Ver Historial Completo de Transacciones
            </button>
        </div>
      </div>
    </div>
  );
}
