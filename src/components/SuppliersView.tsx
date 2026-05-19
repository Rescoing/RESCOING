import { useState, useEffect, FormEvent } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  Filter, 
  Star, 
  Mail, 
  Phone, 
  ExternalLink,
  MoreVertical,
  User,
  FileText,
  DollarSign,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  CheckCircle2,
  Clock,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Supplier, PurchaseInvoice } from '../types';
import Modal from './ui/Modal';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

export default function SuppliersView() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!user) return;

    const sq = query(collection(db, 'suppliers'), where('ownerId', '==', user.uid));
    const unsubscribeSuppliers = onSnapshot(sq, (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
    });

    const iq = query(collection(db, 'purchaseInvoices'), where('ownerId', '==', user.uid));
    const unsubscribeInvoices = onSnapshot(iq, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseInvoice)));
      setLoading(false);
    });

    return () => {
      unsubscribeSuppliers();
      unsubscribeInvoices();
    };
  }, [user]);

  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({
    name: '',
    rutEmpresa: '',
    address: '',
    website: '',
    contactName: '',
    phone: '',
    email: '',
    category: '',
    rating: 5
  });

  const [newInvoice, setNewInvoice] = useState<Partial<PurchaseInvoice>>({
    folio: '',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    netAmount: 0,
    iva: 0,
    totalAmount: 0,
    description: '',
    status: 'pending'
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await addDoc(collection(db, 'suppliers'), {
        ...newSupplier,
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setNewSupplier({ name: '', rutEmpresa: '', address: '', website: '', contactName: '', phone: '', email: '', category: '', rating: 5 });
    } catch (error) {
      console.error(error);
    }
  };

  const handleInvoiceSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !selectedSupplier) return;

    try {
      await addDoc(collection(db, 'purchaseInvoices'), {
        ...newInvoice,
        supplierId: selectedSupplier.id,
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsInvoiceModalOpen(false);
      setNewInvoice({ 
        folio: '', 
        date: new Date().toISOString().split('T')[0], 
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
        netAmount: 0, iva: 0, totalAmount: 0, description: '', status: 'pending' 
      });
    } catch (error) {
      console.error(error);
      alert('Error registrando factura');
    }
  };

  const markAsPaid = async (invoiceId: string) => {
    try {
      const docRef = doc(db, 'purchaseInvoices', invoiceId);
      await updateDoc(docRef, { 
        status: 'paid', 
        paymentDate: new Date().toISOString().split('T')[0], 
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      console.error(error);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.rutEmpresa.includes(searchTerm)
  );

  const upcomingPayments = invoices.filter(inv => {
    if (inv.status === 'paid') return false;
    const diff = new Date(inv.dueDate).getTime() - new Date().getTime();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000; // Next 7 days
  });

  const overdueInvoices = invoices.filter(inv => {
    if (inv.status === 'paid') return false;
    return new Date(inv.dueDate) < new Date();
  });

  return (
    <div className="space-y-8">
      <AnimatePresence mode="wait">
        {!selectedSupplier ? (
          <motion.div 
            key="directory"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Directorio de Proveedores</h2>
                <p className="text-slate-500 mt-1">Gestión de alianzas estratégicas y suministros industriales.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all"
              >
                <Plus size={18} />
                Nuevo Proveedor
              </button>
            </div>

            {(upcomingPayments.length > 0 || overdueInvoices.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {overdueInvoices.length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-center gap-4">
                    <div className="p-3 bg-rose-100 text-rose-600 rounded-lg">
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-rose-900">Facturas Vencidas</p>
                      <p className="text-xs text-rose-600 font-medium">Hay {overdueInvoices.length} documentos con pago atrasado.</p>
                    </div>
                  </div>
                )}
                {upcomingPayments.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-4">
                    <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
                      <Clock size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-amber-900">Próximos Pagos</p>
                      <p className="text-xs text-amber-600 font-medium">{upcomingPayments.length} facturas vencen en los próximos 7 días.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar por nombre, RUT o categoría..." 
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSuppliers.length > 0 ? filteredSuppliers.map((supplier, i) => (
                <motion.div 
                  key={supplier.id}
                  layoutId={supplier.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-primary/30 transition-all group cursor-pointer"
                  onClick={() => setSelectedSupplier(supplier)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col">
                      <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center text-primary border border-slate-100 group-hover:bg-primary group-hover:text-white transition-colors">
                        <Truck size={24} />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-400 mt-2 uppercase tracking-tighter">RUT: {supplier.rutEmpresa}</span>
                    </div>
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star 
                          key={i} 
                          size={14} 
                          className={i < supplier.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"} 
                        />
                      ))}
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-slate-900 text-lg mb-1">{supplier.name}</h3>
                  <span className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded-full mb-4 inline-block">
                    {supplier.category}
                  </span>

                  <div className="space-y-2 mt-4">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <User size={14} className="text-slate-400" />
                      <span className="font-semibold">{supplier.contactName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Phone size={14} className="text-slate-400" />
                      {supplier.phone}
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Facturas Pend.</span>
                      <span className="text-sm font-mono font-bold text-slate-900">
                        {invoices.filter(inv => inv.supplierId === supplier.id && inv.status !== 'paid').length}
                      </span>
                    </div>
                    <ArrowRight size={18} className="text-slate-300 group-hover:text-primary transition-colors" />
                  </div>
                </motion.div>
              )) : (
                <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
                  <p className="text-slate-400 font-sans">No se encontraron proveedores registrados.</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <button 
              onClick={() => setSelectedSupplier(null)}
              className="flex items-center gap-2 text-slate-500 hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest"
            >
              <ChevronLeft size={18} />
              Volver al Directorio
            </button>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="flex gap-6">
                  <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-primary border border-slate-100">
                    <Truck size={40} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900">{selectedSupplier.name}</h2>
                    <p className="text-slate-500 font-mono text-sm tracking-tighter">RUT: {selectedSupplier.rutEmpresa}</p>
                    <div className="flex gap-2 mt-2">
                       <span className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/5 px-3 py-1 rounded-full">
                        {selectedSupplier.category}
                      </span>
                      <div className="flex gap-1 items-center bg-amber-50 px-3 py-1 rounded-full">
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        <span className="text-[10px] font-bold text-amber-700">{selectedSupplier.rating}/5</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-l border-slate-100 pl-8">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Contacto Directo</p>
                    <p className="text-sm font-bold text-slate-900">{selectedSupplier.contactName}</p>
                    <p className="text-xs text-slate-500">{selectedSupplier.email}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Teléfono</p>
                    <p className="text-sm font-bold text-slate-900">{selectedSupplier.phone}</p>
                    <p className="text-xs text-slate-500">Compañía</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Dirección</p>
                    <p className="text-sm font-bold text-slate-900">{selectedSupplier.address}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Deuda Total</p>
                <h3 className="text-2xl font-bold text-slate-900">
                  ${invoices
                    .filter(inv => inv.supplierId === selectedSupplier.id && inv.status !== 'paid')
                    .reduce((sum, inv) => sum + inv.totalAmount, 0)
                    .toLocaleString()}
                </h3>
              </div>
              <div className="bg-white p-6 rounded-xl border border-rose-100 shadow-sm bg-rose-50/20">
                <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-4">Vencido</p>
                <h3 className="text-2xl font-bold text-rose-700">
                  ${invoices
                    .filter(inv => inv.supplierId === selectedSupplier.id && inv.status !== 'paid' && new Date(inv.dueDate) < new Date())
                    .reduce((sum, inv) => sum + inv.totalAmount, 0)
                    .toLocaleString()}
                </h3>
              </div>
              <div className="bg-white p-6 rounded-xl border border-emerald-100 shadow-sm bg-emerald-50/20">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-4">Pagado (Histórico)</p>
                <h3 className="text-2xl font-bold text-emerald-700">
                  ${invoices
                    .filter(inv => inv.supplierId === selectedSupplier.id && inv.status === 'paid')
                    .reduce((sum, inv) => sum + inv.totalAmount, 0)
                    .toLocaleString()}
                </h3>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <FileText size={18} className="text-primary" />
                  Facturas y Compras Recibidas
                </h3>
                <button 
                  onClick={() => setIsInvoiceModalOpen(true)}
                  className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all"
                >
                  <Plus size={14} />
                  Ingresar Factura
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Folio</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emisión</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimiento</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto Total</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invoices.filter(inv => inv.supplierId === selectedSupplier.id).length > 0 ? (
                      invoices
                        .filter(inv => inv.supplierId === selectedSupplier.id)
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map(inv => {
                          const isOverdue = inv.status !== 'paid' && new Date(inv.dueDate) < new Date();
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <span className="font-mono font-bold text-slate-900">#{inv.folio}</span>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600">{inv.date}</td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className={`text-sm font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-600'}`}>
                                    {inv.dueDate}
                                  </span>
                                  {isOverdue && (
                                    <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter">Atrasado</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-mono font-bold text-slate-900">${inv.totalAmount?.toLocaleString()}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded inline-flex items-center gap-1.5
                                  ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 
                                    isOverdue ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}
                                `}>
                                  {inv.status === 'paid' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                                  {inv.status === 'paid' ? 'Pagado' : isOverdue ? 'Vencido' : 'Pendiente'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {inv.status !== 'paid' && (
                                  <button 
                                    onClick={() => markAsPaid(inv.id)}
                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-100 shadow-sm"
                                    title="Marcar como pagado"
                                  >
                                    <DollarSign size={16} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                          No hay facturas registradas para este proveedor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Registro de Nuevo Proveedor"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4 font-sans">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 text-primary">Razón Social Empresa</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={newSupplier.name}
                  onChange={e => setNewSupplier({...newSupplier, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">RUT Empresa</label>
                <input 
                  required
                  type="text" 
                  placeholder="77.xxx.xxx-x"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={newSupplier.rutEmpresa}
                  onChange={e => setNewSupplier({...newSupplier, rutEmpresa: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Categoría</label>
                <input 
                  required
                  type="text" 
                  placeholder="Ej: Metales, Eléctrico"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={newSupplier.category}
                  onChange={e => setNewSupplier({...newSupplier, category: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Dirección Comercial</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={newSupplier.address}
                  onChange={e => setNewSupplier({...newSupplier, address: e.target.value})}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Página Web</label>
                <input 
                  type="text" 
                  placeholder="www.proveedor.cl"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={newSupplier.website}
                  onChange={e => setNewSupplier({...newSupplier, website: e.target.value})}
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">Información de Contacto Directo</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre Contacto</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                    value={newSupplier.contactName}
                    onChange={e => setNewSupplier({...newSupplier, contactName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Teléfono Directo</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                    value={newSupplier.phone}
                    onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Email</label>
                  <input 
                    required
                    type="email" 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                    value={newSupplier.email}
                    onChange={e => setNewSupplier({...newSupplier, email: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-opacity-90 active:scale-[0.98] transition-all"
          >
            Registrar Proveedor Estratégico
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        title="Registro de Factura de Compra"
      >
        <form onSubmit={handleInvoiceSubmit} className="space-y-4 font-sans">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Proveedor: <span className="text-primary">{selectedSupplier?.name}</span></p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Folio / N° Factura</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono"
                value={newInvoice.folio}
                onChange={e => setNewInvoice({...newInvoice, folio: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Emisión</label>
              <input 
                required
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newInvoice.date}
                onChange={e => setNewInvoice({...newInvoice, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Vencimiento</label>
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
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newInvoice.netAmount}
                onChange={e => {
                  const net = Number(e.target.value);
                  const iva = Math.round(net * 0.19);
                  setNewInvoice({...newInvoice, netAmount: net, iva, totalAmount: net + iva});
                }}
              />
            </div>
            <div className="col-span-2 p-3 bg-slate-50 rounded-lg flex justify-between items-center border border-slate-100">
               <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">IVA (19%)</p>
                  <p className="text-sm font-bold text-slate-600">${newInvoice.iva?.toLocaleString()}</p>
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-bold text-primary uppercase">Total a Pagar</p>
                  <p className="text-lg font-bold text-slate-900 font-mono">${newInvoice.totalAmount?.toLocaleString()}</p>
               </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción / Notas</label>
              <textarea 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm h-20 resize-none"
                value={newInvoice.description}
                onChange={e => setNewInvoice({...newInvoice, description: e.target.value})}
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <DollarSign size={18} />
            Ingresar Gasto / Proveedor
          </button>
        </form>
      </Modal>
    </div>
  );
}
