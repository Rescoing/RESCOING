import { useState, useEffect, FormEvent } from 'react';
import { Search, Plus, Mail, Phone, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { Contact } from '../types';
import Modal from './ui/Modal';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

interface CRMViewProps {
  autoOpen?: boolean;
  onModalHandled?: () => void;
}

export default function CRMView({ autoOpen, onModalHandled }: CRMViewProps) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'contacts'),
      where('ownerId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      setContacts(docs);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (autoOpen) {
      setIsModalOpen(true);
      onModalHandled?.();
    }
  }, [autoOpen, onModalHandled]);
  const [newContact, setNewContact] = useState<Partial<Contact>>({
    name: '',
    company: '',
    rutEmpresa: '',
    rutContacto: '',
    phone: '',
    address: '',
    email: '',
    status: 'lead'
  });

  const generateFolio = () => {
    const count = contacts.length + 1;
    return `CLI-${String(count).padStart(4, '0')}`;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const contactToAdd = {
        ...newContact,
        ownerId: user.uid,
        folio: generateFolio(),
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'contacts'), contactToAdd);
      
      setIsModalOpen(false);
      setNewContact({ name: '', company: '', rutEmpresa: '', rutContacto: '', phone: '', address: '', email: '', status: 'lead' });
    } catch (error) {
      console.error("Error adding contact:", error);
      alert("Error al guardar el contacto");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Gestión de Clientes (CRM)</h2>
          <p className="text-slate-500 mt-1">Administra tus contactos y oportunidades de negocio estratégicas.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus size={18} />
          Nuevo Cliente
        </button>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Registrar Nuevo Cliente"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Folio Automático: <span className="text-primary font-mono">{generateFolio()}</span></label>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre Completo Contacto</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newContact.name}
                onChange={e => setNewContact({...newContact, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">RUT Contacto</label>
              <input 
                required
                type="text" 
                placeholder="12.345.678-9"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newContact.rutContacto}
                onChange={e => setNewContact({...newContact, rutContacto: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Teléfono Contacto</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newContact.phone}
                onChange={e => setNewContact({...newContact, phone: e.target.value})}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Empresa / Razón Social</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newContact.company}
                onChange={e => setNewContact({...newContact, company: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">RUT Empresa</label>
              <input 
                required
                type="text" 
                placeholder="76.543.210-K"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newContact.rutEmpresa}
                onChange={e => setNewContact({...newContact, rutEmpresa: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Estado</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                value={newContact.status}
                onChange={e => setNewContact({...newContact, status: e.target.value as any})}
              >
                <option value="lead">Lead</option>
                <option value="opportunity">Oportunidad</option>
                <option value="customer">Cliente</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Correo Electrónico</label>
              <input 
                required
                type="email" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newContact.email}
                onChange={e => setNewContact({...newContact, email: e.target.value})}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Dirección Empresa</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newContact.address}
                onChange={e => setNewContact({...newContact, address: e.target.value})}
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-white py-2.5 rounded-lg font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all mt-2"
          >
            Guardar Contacto
          </button>
        </form>
      </Modal>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Contactos...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white border border-dashed border-slate-200 rounded-2xl">
            <p className="text-slate-400 text-sm">No hay contactos registrados aún.</p>
          </div>
        ) : contacts.map((contact, i) => (
          <motion.div 
            key={contact.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-primary/30 transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-primary font-mono uppercase tracking-widest mb-1">{contact.folio}</span>
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-primary font-bold text-xl border border-slate-100">
                  {contact.name.charAt(0)}
                </div>
              </div>
              <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border
                ${contact.status === 'customer' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                  contact.status === 'opportunity' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-600 border-slate-100'}
              `}>
                {contact.status}
              </div>
            </div>
            
            <h3 className="font-bold text-lg text-slate-900 group-hover:text-primary transition-colors">{contact.name}</h3>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{contact.company}</p>
            <p className="text-[10px] font-bold text-slate-500 mb-4 tracking-tighter">RUT: {contact.rutEmpresa}</p>
            
            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Mail size={14} className="text-slate-400" />
                {contact.email}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone size={14} className="text-slate-400" />
                {contact.phone}
              </div>
            </div>
            
            <div className="flex gap-2 pt-4 border-t border-slate-50">
              <button className="flex-1 py-2 rounded bg-slate-50 text-slate-700 text-xs font-bold hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-1.5 ring-1 ring-inset ring-slate-100 hover:ring-primary">
                Ver Perfil
                <ExternalLink size={12} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
