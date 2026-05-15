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
  User
} from 'lucide-react';
import { motion } from 'motion/react';
import { Supplier } from '../types';
import Modal from './ui/Modal';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

export default function SuppliersView() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'suppliers'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
      setLoading(false);
    });

    return unsubscribe;
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

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.rutEmpresa.includes(searchTerm)
  );

  return (
    <div className="space-y-8">
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
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors text-sm font-medium">
          <Filter size={18} />
          Filtrar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSuppliers.length > 0 ? filteredSuppliers.map((supplier, i) => (
          <motion.div 
            key={supplier.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-primary/30 transition-all group"
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
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Mail size={14} className="text-slate-400" />
                {supplier.email}
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-50 flex gap-2">
              <button className="flex-1 bg-slate-900 text-white py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors">
                Detalles
              </button>
              {supplier.website && (
                <a 
                  href={supplier.website.startsWith('http') ? supplier.website : `https://${supplier.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-slate-400 hover:text-primary hover:border-primary/30 transition-colors flex items-center justify-center"
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          </motion.div>
        )) : (
          <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
            <p className="text-slate-400 font-sans">No se encontraron proveedores registrados con esos criterios.</p>
          </div>
        )}
      </div>

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
    </div>
  );
}
