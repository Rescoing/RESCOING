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
  ArrowRight,
  Bell,
  Eye,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { Supplier, PurchaseInvoice, PaymentNotice } from '../types';
import Modal from './ui/Modal';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

export default function SuppliersView() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [notices, setNotices] = useState<PaymentNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'directory' | 'allInvoices'>('directory');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
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
    });

    const nq = query(collection(db, 'paymentNotices'), where('ownerId', '==', user.uid));
    const unsubscribeNotices = onSnapshot(nq, (snapshot) => {
      setNotices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentNotice)));
      setLoading(false);
    });

    return () => {
      unsubscribeSuppliers();
      unsubscribeInvoices();
      unsubscribeNotices();
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

  const [newNotice, setNewNotice] = useState<Partial<PaymentNotice>>({
    plannedPaymentDate: new Date().toISOString().split('T')[0],
    notes: '',
    status: 'sent'
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

  const handleNoticeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !selectedSupplier || !selectedInvoice) return;

    try {
      const noticeRef = await addDoc(collection(db, 'paymentNotices'), {
        ...newNotice,
        invoiceId: selectedInvoice.id,
        supplierId: selectedSupplier.id,
        amount: selectedInvoice.totalAmount,
        noticeDate: new Date().toISOString().split('T')[0],
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'purchaseInvoices', selectedInvoice.id), {
        paymentNoticeId: noticeRef.id
      });

      // 1. Create a System Notification
      await addDoc(collection(db, 'notifications'), {
        ownerId: user.uid,
        title: '📆 Aviso de Pago Programado',
        message: `Se ha programado un aviso de pago para el proveedor "${selectedSupplier.name}" (Folio Factura #${selectedInvoice.folio}) por un monto de $${selectedInvoice.totalAmount?.toLocaleString()} para el ${newNotice.plannedPaymentDate}. Notas: ${newNotice.notes || 'Ninguna'}.`,
        type: 'warning',
        read: false,
        createdAt: serverTimestamp()
      });

      // 2. Dispatch email notification to rescoing@gmail.com dynamically
      const emailMessage = `
Aviso de Pago Programado (ERP Rescoing)

Detalles del compromiso de pago:
- Proveedor: ${selectedSupplier.name}
- RUT de Empresa: ${selectedSupplier.rutEmpresa || 'No registrado'}
- Factura Folio: #${selectedInvoice.folio}
- Monto del Documento: $${selectedInvoice.totalAmount?.toLocaleString()}
- Fecha Programada de Pago: ${newNotice.plannedPaymentDate}
- Comentarios adjuntos: ${newNotice.notes || 'Sin comentarios'}

Notificación automática emitida por el Sistema ERP.
      `;

      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          access_key: '62df9ff2-6eac-4e4b-97fc-c999cb5038c3',
          name: 'Notificaciones ERP',
          email: user?.email || 'rescoing@gmail.com', // Aligning SPF/DMARC with registered account
          to_email: 'rescoing@gmail.com',
          subject: `📆 ERP AVISO DE PAGO: ${selectedSupplier.name} ($${selectedInvoice.totalAmount?.toLocaleString()})`,
          message: emailMessage
        })
      })
      .then(res => res.json())
      .then(data => console.log('Web3Forms dispatch success:', data))
      .catch(err => console.warn('Web3Forms dispatch error/offline:', err));

      setIsNoticeModalOpen(false);
      setNewNotice({ plannedPaymentDate: new Date().toISOString().split('T')[0], notes: '', status: 'sent' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'paymentNotices/purchaseInvoices');
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

  const updateInvoiceStatus = async (invoiceId: string, newStatus: 'pending' | 'paid' | 'overdue') => {
    try {
      const docRef = doc(db, 'purchaseInvoices', invoiceId);
      const updates: any = { status: newStatus, updatedAt: serverTimestamp() };
      
      if (newStatus === 'paid') {
        updates.paymentDate = new Date().toISOString().split('T')[0];
      } else {
        updates.paymentDate = null;
      }
      
      await updateDoc(docRef, updates);
    } catch (error) {
      console.error(error);
      alert('Error al actualizar el estado');
    }
  };

  const confirmPaymentWithNotice = async (invoiceId: string, noticeId: string) => {
    try {
      const invoiceRef = doc(db, 'purchaseInvoices', invoiceId);
      const noticeRef = doc(db, 'paymentNotices', noticeId);
      const paymentDate = new Date().toISOString().split('T')[0];

      await updateDoc(invoiceRef, {
        status: 'paid',
        paymentDate: paymentDate,
        updatedAt: serverTimestamp()
      });

      await updateDoc(noticeRef, {
        status: 'confirmed',
        updatedAt: serverTimestamp()
      });

    } catch (error) {
      console.error(error);
      alert('Error al confirmar el pago');
    }
  };

  const deleteInvoice = async (invoiceId: string) => {
    if (!confirm('¿Está seguro de eliminar esta factura?')) return;
    try {
      await deleteDoc(doc(db, 'purchaseInvoices', invoiceId));
    } catch (error) {
      console.error(error);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.rutEmpresa.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredInvoices = invoices.filter(inv => {
    const supplier = suppliers.find(s => s.id === inv.supplierId);
    return supplier?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           inv.folio.toLowerCase().includes(searchTerm.toLowerCase());
  });

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-2">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => { setActiveTab('directory'); setSelectedSupplier(null); }}
            className={`px-6 py-2.5 rounded-lg transition-all text-sm font-bold flex items-center gap-2 ${activeTab === 'directory' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Truck size={16} />
            Directorio de Proveedores
          </button>
          <button 
            onClick={() => setActiveTab('allInvoices')}
            className={`px-6 py-2.5 rounded-lg transition-all text-sm font-bold flex items-center gap-2 ${activeTab === 'allInvoices' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FileText size={16} />
            Gestión Global de Facturas
            {(overdueInvoices.length > 0) && (
              <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">
                {overdueInvoices.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'directory' ? (
          !selectedSupplier ? (
            <motion.div 
              key="directory"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900">Proveedores</h2>
                  <p className="text-slate-500 mt-1">Alianzas estratégicas y suministros industriales.</p>
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
                    <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-center gap-4 text-left">
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
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-4 text-left">
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
                                  {inv.paymentDate && (
                                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter bg-emerald-50 px-1 rounded w-fit">Pagado: {inv.paymentDate}</span>
                                  )}
                                  {isOverdue && !inv.paymentDate && (
                                    <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter">Atrasado</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-mono font-bold text-slate-900">${inv.totalAmount?.toLocaleString()}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded inline-flex items-center gap-1.5
                                    ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 
                                      isOverdue ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}
                                  `}>
                                    {inv.status === 'paid' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                                    {inv.status === 'paid' ? 'Pagado' : isOverdue ? 'Vencido' : 'Pendiente'}
                                  </span>
                                  {inv.paymentNoticeId && (
                                    <span className="text-[9px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded text-center border border-indigo-100">
                                      Aviso Enviado
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => { setSelectedInvoice(inv); setIsDetailModalOpen(true); }}
                                    className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                                    title="Ver Detalle Completo"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  {inv.status !== 'paid' && !inv.paymentNoticeId && (
                                    <button 
                                      onClick={() => { setSelectedInvoice(inv); setIsNoticeModalOpen(true); }}
                                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100 shadow-sm"
                                      title="Programar Aviso de Pago"
                                    >
                                      <Bell size={16} />
                                    </button>
                                  )}

                                   {inv.status !== 'paid' && (
                                    <button 
                                      onClick={() => inv.paymentNoticeId ? confirmPaymentWithNotice(inv.id, inv.paymentNoticeId) : markAsPaid(inv.id)}
                                      className={`p-2 rounded-lg transition-all border border-transparent shadow-sm ${inv.paymentNoticeId ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-100 font-bold' : 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-100'}`}
                                      title={inv.paymentNoticeId ? "Confirmar Pago de Aviso Programado" : "Confirmar Pago Ejecutado"}
                                    >
                                      <CheckCircle2 size={16} />
                                    </button>
                                  )}

                                  <button 
                                    onClick={() => deleteInvoice(inv.id)}
                                    className="p-2 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Eliminar Registro"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
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
        )
      ) : (
        <motion.div
          key="allInvoices"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          className="space-y-6 text-left"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">Administración de Compras</h2>
              <p className="text-slate-500 mt-1">Control centralizado de facturas recibidas y compromisos de pago.</p>
            </div>
          </div>

          {/* Alertas de Vencimiento Destacadas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white border-2 border-rose-100 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2">
                <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                  <AlertTriangle size={20} />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Pagos Vencidos</span>
                <p className="text-3xl font-black text-slate-900 font-mono">
                  ${overdueInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0).toLocaleString()}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-bold text-rose-600 px-2 py-0.5 bg-rose-50 rounded-full">
                    {overdueInvoices.length} Facturas críticas
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-amber-100 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                  <Clock size={20} />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Próximos 7 días</span>
                <p className="text-3xl font-black text-slate-900 font-mono">
                  ${upcomingPayments.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0).toLocaleString()}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-bold text-amber-600 px-2 py-0.5 bg-amber-50 rounded-full">
                    {upcomingPayments.length} Compromisos
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-indigo-100 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                  <Bell size={20} />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Avisos Pendientes</span>
                <p className="text-3xl font-black text-slate-900 font-mono">
                  ${invoices
                    .filter(inv => inv.paymentNoticeId && inv.status !== 'paid')
                    .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
                    .toLocaleString()}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-bold text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded-full">
                    {invoices.filter(inv => inv.paymentNoticeId && inv.status !== 'paid').length} Avisos por pagar
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-emerald-100 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                  <CheckCircle2 size={20} />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Pagado este mes</span>
                <p className="text-3xl font-black text-slate-900 font-mono">
                  ${invoices
                    .filter(inv => inv.status === 'paid' && inv.paymentDate?.startsWith(new Date().toISOString().slice(0, 7)))
                    .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
                    .toLocaleString()}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-bold text-emerald-600 px-2 py-0.5 bg-emerald-50 rounded-full">
                    Historial Mensual
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar por folio o proveedor..." 
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Proveedor</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Folio</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimiento</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto Total</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado / Pago</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredInvoices.length > 0 ? (
                      filteredInvoices
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map(inv => {
                          const supplier = suppliers.find(s => s.id === inv.supplierId);
                          const isOverdue = inv.status !== 'paid' && new Date(inv.dueDate) < new Date();
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-900 text-sm">{supplier?.name || 'Desconocido'}</span>
                                  <span className="text-[10px] font-mono text-slate-400">{supplier?.rutEmpresa}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-mono font-bold text-slate-900 text-sm">#{inv.folio}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className={`text-sm font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-600'}`}>
                                    {inv.dueDate}
                                  </span>
                                  {inv.paymentDate && (
                                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter bg-emerald-50 px-1 rounded w-fit">Pagado: {inv.paymentDate}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-mono font-bold text-slate-900 text-sm">${inv.totalAmount?.toLocaleString()}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded inline-flex items-center gap-1.5 w-fit
                                    ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 
                                      isOverdue ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}
                                  `}>
                                    {inv.status === 'paid' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                                    {inv.status === 'paid' ? 'Pagado' : isOverdue ? 'Vencido' : 'Pendiente'}
                                  </span>
                                  {inv.paymentNoticeId && (
                                    <span className="text-[9px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded text-center border border-indigo-100">
                                      Aviso Enviado
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => { setSelectedInvoice(inv); setIsDetailModalOpen(true); }}
                                    className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                                    title="Detalle"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  
                                  <div className="flex items-center gap-1">
                                    <div className="relative group/status px-2 py-1 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-1">
                                      <select 
                                        className="text-[10px] font-bold bg-transparent border-none appearance-none cursor-pointer focus:outline-none pr-4"
                                        value={inv.status}
                                        onChange={(e) => updateInvoiceStatus(inv.id, e.target.value as any)}
                                      >
                                        <option value="pending">PENDIENTE</option>
                                        <option value="paid">PAGADO</option>
                                      </select>
                                      <Clock size={10} className="absolute right-2 text-slate-400 pointer-events-none" />
                                    </div>

                                    {inv.paymentNoticeId && inv.status !== 'paid' && (
                                      <button 
                                        onClick={() => confirmPaymentWithNotice(inv.id, inv.paymentNoticeId!)}
                                        className="p-2 text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm"
                                        title="Confirmar Pago de Aviso"
                                      >
                                        <CheckCircle2 size={16} />
                                      </button>
                                    )}
                                  </div>

                                  <button 
                                    onClick={() => deleteInvoice(inv.id)}
                                    className="p-2 text-slate-200 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                          No hay registros de compras disponibles.
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

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Detalle de Factura de Compra"
      >
        {selectedInvoice && (
          <div className="space-y-6 font-sans">
            <div className="grid grid-cols-2 gap-6 pb-6 border-b border-slate-100">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Folio Documento</p>
                <p className="text-xl font-bold text-slate-900 font-mono">#{selectedInvoice.folio}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Estado Actual</p>
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded inline-flex items-center gap-1.5
                  ${selectedInvoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}
                `}>
                  {selectedInvoice.status === 'paid' ? 'DOCUMENTO PAGADO' : 'PENDIENTE DE PAGO'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Emisión</p>
                <p className="text-sm font-bold text-slate-900">{selectedInvoice.date}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Vencimiento</p>
                <p className="text-sm font-bold text-slate-900">{selectedInvoice.dueDate}</p>
              </div>
              {selectedInvoice.paymentDate && (
                <div className="col-span-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Fecha de Pago Real</p>
                  <p className="text-sm font-bold text-emerald-900">{selectedInvoice.paymentDate}</p>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-6 rounded-xl space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Monto Neto</span>
                <span className="font-bold text-slate-900 font-mono">${(selectedInvoice.netAmount || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">IVA (19%)</span>
                <span className="font-bold text-slate-900 font-mono">${(selectedInvoice.iva || 0).toLocaleString()}</span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-xs font-black text-primary uppercase tracking-widest">Total a Pagar</span>
                <span className="text-2xl font-black text-slate-900 font-mono">${(selectedInvoice.totalAmount || 0).toLocaleString()}</span>
              </div>
            </div>

            {selectedInvoice.description && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Glosa / Descripción</p>
                <div className="p-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 italic leading-relaxed">
                  {selectedInvoice.description}
                </div>
              </div>
            )}

            {selectedInvoice.paymentNoticeId && (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-3">
                <Bell size={18} className="text-indigo-600 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-indigo-900 uppercase tracking-widest">Aviso de Pago Registrado</p>
                  <p className="text-xs text-indigo-700 mt-1">
                    Existe un compromiso de pago activo para este documento.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold text-sm shadow-sm hover:bg-slate-800 transition-all"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isNoticeModalOpen}
        onClose={() => setIsNoticeModalOpen(false)}
        title="Programar Aviso de Pago"
      >
        <form onSubmit={handleNoticeSubmit} className="space-y-4 font-sans text-left">
          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl mb-4">
            <h4 className="text-xs font-black text-indigo-700 uppercase tracking-widest mb-1">Detalle del Documento</h4>
            <p className="text-sm font-bold text-slate-800">Folio: #{selectedInvoice?.folio}</p>
            <p className="text-sm font-bold text-slate-800">Monto: ${selectedInvoice?.totalAmount.toLocaleString()}</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Programada de Pago</label>
            <input 
              required
              type="date" 
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm"
              value={newNotice.plannedPaymentDate}
              onChange={e => setNewNotice({...newNotice, plannedPaymentDate: e.target.value})}
            />
            <p className="text-[10px] text-slate-400 mt-1">Esta fecha se notificará al proveedor como compromiso de pago.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Notas / Comentarios Adjuntos</label>
            <textarea 
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm h-24 resize-none"
              placeholder="Ej: Pago se realizará vía transferencia electrónica..."
              value={newNotice.notes}
              onChange={e => setNewNotice({...newNotice, notes: e.target.value})}
            />
          </div>

          <button 
            type="submit"
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Bell size={18} />
            Confirmar Aviso de Pago
          </button>
        </form>
      </Modal>
    </div>
  );
}
