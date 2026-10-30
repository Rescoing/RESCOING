import { useState, useEffect, FormEvent } from 'react';
import { 
  Search, 
  Plus, 
  Mail, 
  Phone, 
  ExternalLink, 
  Building2, 
  User, 
  MapPin, 
  Calendar, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Briefcase, 
  Save, 
  X, 
  DollarSign, 
  Check, 
  Loader2,
  Share2,
  FileSpreadsheet,
  Eye,
  Download,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Contact, Document, Project } from '../types';
import Modal from './ui/Modal';
import DocumentOfficialModal from './DocumentOfficialModal';
import { generateDocumentPDF } from '../utils/documentPdf';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'customer' | 'opportunity' | 'lead'>('all');
  
  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<'ficha' | 'documentos' | 'proyectos' | 'editar'>('ficha');
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  
  // Commercial documents and projects linked to selected contact
  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  
  // Notes state inside profile
  const [notesDraft, setNotesDraft] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSavedSuccess, setNotesSavedSuccess] = useState(false);
  
  // Edit contact state
  const [editFormData, setEditFormData] = useState<Partial<Contact>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState('');

  // New contact state
  const [newContact, setNewContact] = useState<Partial<Contact>>({
    name: '',
    company: '',
    rutEmpresa: '',
    rutContacto: '',
    phone: '',
    address: '',
    email: '',
    status: 'lead',
    notes: ''
  });

  // Load contacts
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

      // Keep selectedContact in sync if currently viewed
      setSelectedContact(prev => {
        if (!prev) return null;
        const updated = docs.find(c => c.id === prev.id);
        return updated || null;
      });
    }, (error) => {
      console.error("CRM contacts error:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  // Load documents and projects for client relationship
  useEffect(() => {
    if (!user) return;

    const qDocs = query(collection(db, 'documents'), where('ownerId', '==', user.uid));
    const unsubDocs = onSnapshot(qDocs, (snap) => {
      setAllDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Document)));
    }, (err) => console.error("Documents fetch error:", err));

    const qProj = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
    const unsubProj = onSnapshot(qProj, (snap) => {
      setAllProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
    }, (err) => console.error("Projects fetch error:", err));

    return () => {
      unsubDocs();
      unsubProj();
    };
  }, [user]);

  useEffect(() => {
    if (autoOpen) {
      setIsModalOpen(true);
      onModalHandled?.();
    }
  }, [autoOpen, onModalHandled]);

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
      setNewContact({ 
        name: '', 
        company: '', 
        rutEmpresa: '', 
        rutContacto: '', 
        phone: '', 
        address: '', 
        email: '', 
        status: 'lead',
        notes: ''
      });
    } catch (error) {
      console.error("Error adding contact:", error);
      alert("Error al guardar el contacto");
    }
  };

  // Open profile modal
  const handleOpenProfile = (contact: Contact) => {
    setSelectedContact(contact);
    setNotesDraft(contact.notes || '');
    setEditFormData({
      name: contact.name,
      company: contact.company,
      rutEmpresa: contact.rutEmpresa,
      rutContacto: contact.rutContacto,
      phone: contact.phone,
      address: contact.address,
      email: contact.email,
      status: contact.status,
      notes: contact.notes || ''
    });
    setProfileTab('ficha');
    setEditSuccessMsg('');
    setIsProfileModalOpen(true);
  };

  // Update status directly from profile
  const handleUpdateStatus = async (newStatus: 'customer' | 'opportunity' | 'lead') => {
    if (!selectedContact) return;
    try {
      await updateDoc(doc(db, 'contacts', selectedContact.id), {
        status: newStatus
      });
      setSelectedContact(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (err) {
      console.error("Error updating contact status:", err);
    }
  };

  // Save notes in profile
  const handleSaveNotes = async () => {
    if (!selectedContact) return;
    setIsSavingNotes(true);
    try {
      await updateDoc(doc(db, 'contacts', selectedContact.id), {
        notes: notesDraft
      });
      setSelectedContact(prev => prev ? { ...prev, notes: notesDraft } : null);
      setNotesSavedSuccess(true);
      setTimeout(() => setNotesSavedSuccess(false), 2500);
    } catch (err) {
      console.error("Error saving notes:", err);
      alert("No se pudieron guardar las notas");
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Save edited contact
  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedContact) return;
    setIsSavingEdit(true);
    try {
      await updateDoc(doc(db, 'contacts', selectedContact.id), {
        ...editFormData,
        notes: notesDraft
      });
      setSelectedContact(prev => prev ? ({ ...prev, ...editFormData, notes: notesDraft } as Contact) : null);
      setEditSuccessMsg("¡Datos del cliente actualizados exitosamente!");
      setTimeout(() => setEditSuccessMsg(''), 3000);
    } catch (err) {
      console.error("Error updating contact:", err);
      alert("Error al actualizar datos del cliente");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete contact
  const handleDeleteContact = async () => {
    if (!selectedContact) return;
    const confirmDelete = window.confirm(
      `¿Está seguro de que desea eliminar a "${selectedContact.name}" (${selectedContact.company}) de la lista de clientes?`
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'contacts', selectedContact.id));
      setIsProfileModalOpen(false);
      setSelectedContact(null);
    } catch (err) {
      console.error("Error deleting contact:", err);
      alert("No se pudo eliminar el contacto.");
    }
  };

  // Filtered contacts
  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = 
      contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.rutEmpresa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.rutContacto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.folio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || contact.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Client related documents
  const clientDocuments = selectedContact ? allDocuments.filter(d => {
    if (d.clientId && d.clientId === selectedContact.id) return true;
    if (d.clientName && selectedContact.company && d.clientName.trim().toLowerCase() === selectedContact.company.trim().toLowerCase()) return true;
    if (d.clientName && selectedContact.name && d.clientName.trim().toLowerCase() === selectedContact.name.trim().toLowerCase()) return true;
    if (d.clientContact && selectedContact.name && d.clientContact.trim().toLowerCase() === selectedContact.name.trim().toLowerCase()) return true;
    
    // Also match by RUT digits
    const contactRutEmpresa = (selectedContact.rutEmpresa || '').replace(/[^0-9kK]/g, '').toLowerCase();
    const contactRutContacto = (selectedContact.rutContacto || '').replace(/[^0-9kK]/g, '').toLowerCase();
    const docRut = (d.clientRut || '').replace(/[^0-9kK]/g, '').toLowerCase();
    
    if (docRut && contactRutEmpresa && docRut === contactRutEmpresa) return true;
    if (docRut && contactRutContacto && docRut === contactRutContacto) return true;
    
    return false;
  }) : [];

  const totalDocumentsAmount = clientDocuments.reduce((sum, d) => sum + (d.totalAmount || 0), 0);

  // Client related projects
  const clientProjectsList = selectedContact ? allProjects.filter(p => 
    p.clientId === selectedContact.id ||
    p.clientResponsible?.toLowerCase() === selectedContact.name?.toLowerCase() ||
    (p.name && selectedContact.company && p.name.toLowerCase().includes(selectedContact.company.toLowerCase()))
  ) : [];

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Gestión de Clientes (CRM)</h2>
          <p className="text-slate-500 mt-1">Administra tus contactos y oportunidades de negocio estratégicas.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all w-fit"
        >
          <Plus size={18} />
          Nuevo Cliente
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative w-full md:w-96">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, empresa, RUT o folio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({contacts.length})
          </button>
          <button
            onClick={() => setStatusFilter('customer')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'customer'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            Clientes ({contacts.filter(c => c.status === 'customer').length})
          </button>
          <button
            onClick={() => setStatusFilter('opportunity')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'opportunity'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            Oportunidades ({contacts.filter(c => c.status === 'opportunity').length})
          </button>
          <button
            onClick={() => setStatusFilter('lead')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'lead'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            Leads ({contacts.filter(c => c.status === 'lead').length})
          </button>
        </div>
      </div>

      {/* Modal: New Contact */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Registrar Nuevo Cliente"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Folio Automático: <span className="text-primary font-mono">{generateFolio()}</span>
              </label>
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

      {/* Client Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Contactos...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white border border-dashed border-slate-200 rounded-2xl">
            <User size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-600 font-semibold text-sm">No se encontraron clientes o contactos</p>
            <p className="text-slate-400 text-xs mt-1">Prueba cambiando los filtros o registra un nuevo cliente.</p>
          </div>
        ) : filteredContacts.map((contact, i) => (
          <motion.div 
            key={contact.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-primary/40 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-amber-600 font-mono uppercase tracking-wider mb-2">
                    {contact.folio || `CLI-${contact.id.slice(0, 4)}`}
                  </span>
                  <div className="w-12 h-12 rounded-xl bg-orange-50/80 flex items-center justify-center text-amber-600 font-bold text-xl border border-orange-100/60 shadow-xs">
                    {contact.name?.charAt(0) || contact.company?.charAt(0) || 'C'}
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border
                  ${contact.status === 'customer' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                    contact.status === 'opportunity' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'}
                `}>
                  {contact.status === 'customer' ? 'Cliente' : contact.status === 'opportunity' ? 'Oportunidad' : 'Lead'}
                </div>
              </div>
              
              <h3 className="font-bold text-lg text-slate-900 group-hover:text-primary transition-colors leading-snug">
                {contact.name}
              </h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5 mb-2 truncate">
                {contact.company}
              </p>
              <p className="text-[11px] font-bold text-slate-500 mb-4 tracking-tight">
                RUT: <span className="font-mono">{contact.rutEmpresa || 'Sin registrar'}</span>
              </p>
              
              <div className="space-y-2 mb-6 text-sm text-slate-600">
                <div className="flex items-center gap-2.5 truncate">
                  <Mail size={15} className="text-slate-400 shrink-0" />
                  <span className="truncate">{contact.email || 'Sin correo'}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone size={15} className="text-slate-400 shrink-0" />
                  <span>{contact.phone || 'Sin teléfono'}</span>
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-100">
              <button 
                type="button"
                onClick={() => handleOpenProfile(contact)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-50 text-slate-700 text-xs font-bold hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-2 border border-slate-200/80 hover:border-primary shadow-2xs group/btn cursor-pointer"
              >
                <span>Ver Perfil</span>
                <ExternalLink size={13} className="text-slate-400 group-hover/btn:text-white transition-colors" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal: Client Profile & Management */}
      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        title="Perfil Integral del Cliente"
        maxWidth="max-w-4xl"
      >
        {selectedContact && (
          <div className="space-y-6">
            {/* Profile Header Bar */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 font-bold text-2xl flex items-center justify-center shrink-0 shadow-inner">
                  {selectedContact.name?.charAt(0) || selectedContact.company?.charAt(0) || 'C'}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs font-bold text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded">
                      {selectedContact.folio || `CLI-${selectedContact.id.slice(0, 4)}`}
                    </span>
                    <select
                      value={selectedContact.status}
                      onChange={(e) => handleUpdateStatus(e.target.value as any)}
                      className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border cursor-pointer focus:outline-none ${
                        selectedContact.status === 'customer' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                          : selectedContact.status === 'opportunity'
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-amber-50 text-amber-700 border-amber-300'
                      }`}
                    >
                      <option value="customer">Cliente</option>
                      <option value="opportunity">Oportunidad</option>
                      <option value="lead">Lead</option>
                    </select>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedContact.name}</h3>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{selectedContact.company}</p>
                </div>
              </div>

              {/* Quick Communication Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectedContact.email && (
                  <a
                    href={`mailto:${selectedContact.email}`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 border border-slate-200 hover:border-primary hover:text-primary rounded-xl text-xs font-semibold shadow-2xs transition-all"
                  >
                    <Mail size={14} />
                    <span>Correo</span>
                  </a>
                )}
                {selectedContact.phone && (
                  <a
                    href={`tel:${selectedContact.phone}`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 border border-slate-200 hover:border-primary hover:text-primary rounded-xl text-xs font-semibold shadow-2xs transition-all"
                  >
                    <Phone size={14} />
                    <span>Llamar</span>
                  </a>
                )}
                <button
                  onClick={() => setProfileTab('editar')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 border border-slate-200 hover:border-primary hover:text-primary rounded-xl text-xs font-semibold shadow-2xs transition-all"
                >
                  <Edit3 size={14} />
                  <span>Editar</span>
                </button>
                <button
                  onClick={handleDeleteContact}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-semibold shadow-2xs transition-all"
                  title="Eliminar cliente"
                >
                  <Trash2 size={14} />
                  <span>Eliminar</span>
                </button>
              </div>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setProfileTab('ficha')}
                className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold tracking-wide border-b-2 transition-all whitespace-nowrap ${
                  profileTab === 'ficha'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <User size={15} />
                <span>Ficha y Contacto</span>
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('documentos')}
                className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold tracking-wide border-b-2 transition-all whitespace-nowrap ${
                  profileTab === 'documentos'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <FileText size={15} />
                <span>Documentos Comerciales ({clientDocuments.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('proyectos')}
                className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold tracking-wide border-b-2 transition-all whitespace-nowrap ${
                  profileTab === 'proyectos'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Briefcase size={15} />
                <span>Proyectos ({clientProjectsList.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('editar')}
                className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold tracking-wide border-b-2 transition-all whitespace-nowrap ${
                  profileTab === 'editar'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Edit3 size={15} />
                <span>Editar Información</span>
              </button>
            </div>

            {/* Tab: Ficha y Contacto */}
            {profileTab === 'ficha' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Empresa Details Card */}
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 text-primary font-bold text-sm border-b border-slate-100 pb-2">
                      <Building2 size={16} />
                      <h4>Datos de la Empresa / Razón Social</h4>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">Razón Social</span>
                        <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedContact.company || 'Sin registrar'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">RUT Empresa</span>
                        <p className="font-mono font-bold text-slate-800 text-sm mt-0.5">{selectedContact.rutEmpresa || 'Sin registrar'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">Dirección Comercial</span>
                        <p className="text-slate-700 mt-0.5 flex items-start gap-1.5">
                          <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                          <span>{selectedContact.address || 'Sin dirección registrada'}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Contact Person Card */}
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 text-primary font-bold text-sm border-b border-slate-100 pb-2">
                      <User size={16} />
                      <h4>Representante / Contacto Principal</h4>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">Nombre Completo</span>
                        <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedContact.name || 'Sin registrar'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">RUT Contacto</span>
                        <p className="font-mono font-bold text-slate-800 text-sm mt-0.5">{selectedContact.rutContacto || 'Sin registrar'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">Correo Electrónico</span>
                        <a href={`mailto:${selectedContact.email}`} className="text-primary hover:underline font-medium block mt-0.5 truncate">
                          {selectedContact.email || 'Sin registrar'}
                        </a>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">Teléfono</span>
                        <a href={`tel:${selectedContact.phone}`} className="text-slate-800 font-medium block mt-0.5">
                          {selectedContact.phone || 'Sin registrar'}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Commercial Notes / Agreements */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2 text-primary font-bold text-sm">
                      <FileText size={16} />
                      <h4>Notas, Acuerdos y Condiciones Comerciales</h4>
                    </div>
                    {notesSavedSuccess && (
                      <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                        <Check size={14} /> ¡Notas guardadas!
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Anota acuerdos específicos de pago, lista de precios preferencial o requerimientos del cliente.
                  </p>
                  <textarea
                    rows={3}
                    placeholder="Escribe notas comerciales aquí..."
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-slate-50 focus:bg-white transition-all"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isSavingNotes ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      <span>Guardar Notas</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Documentos Comerciales */}
            {profileTab === 'documentos' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Historial Comercial</span>
                    <p className="text-sm font-semibold text-slate-800">
                      Documentos vinculados a {selectedContact.company || selectedContact.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Monto Total Documentado</span>
                    <span className="font-mono font-bold text-lg text-primary">${totalDocumentsAmount.toLocaleString()} CLP</span>
                  </div>
                </div>

                {clientDocuments.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-dashed border-slate-200 rounded-xl">
                    <FileSpreadsheet size={28} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-medium text-slate-600">Aún no hay documentos registrados para este cliente</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Crea cotizaciones, notas de venta o facturas desde el módulo de Finanzas y Documentos vinculando este cliente.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="px-4 py-3">Folio</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3">Fecha</th>
                          <th className="px-4 py-3 text-right">Monto Total</th>
                          <th className="px-4 py-3 text-center">Estado</th>
                          <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {clientDocuments.map((docItem) => {
                          const typeLabel = 
                            docItem.type === 'quotation' ? 'Cotización' :
                            docItem.type === 'purchase_order' ? 'Orden de Compra' :
                            docItem.type === 'sales_note' ? 'Nota de Venta' :
                            docItem.type === 'invoice' ? 'Factura' : 'Estado de Pago';
                          
                          return (
                            <tr key={docItem.id} className="hover:bg-slate-50/80 transition-colors group">
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => setViewingDoc(docItem)}
                                  className="font-mono font-bold text-primary hover:underline flex items-center gap-1.5 cursor-pointer text-left"
                                  title="Ver documento oficial"
                                >
                                  <span>{docItem.folio || docItem.id.slice(0, 8)}</span>
                                  <Eye size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-primary shrink-0" />
                                </button>
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-700">{typeLabel}</td>
                              <td className="px-4 py-3 text-slate-500">{docItem.date}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                                ${(docItem.totalAmount || 0).toLocaleString()} CLP
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  docItem.status === 'approved' || docItem.status === 'paid'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : docItem.status === 'rejected'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {docItem.status || 'Pendiente'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setViewingDoc(docItem)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border border-blue-200/80 text-[11px] font-bold transition-all shadow-2xs cursor-pointer group/btn"
                                    title="Visualizar documento oficial con desglose completo"
                                  >
                                    <Eye size={13} className="text-blue-600 group-hover/btn:scale-110 transition-transform" />
                                    <span>Ver</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => generateDocumentPDF(docItem)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 border border-amber-200/80 text-[11px] font-bold transition-all shadow-2xs cursor-pointer group/btn"
                                    title="Descargar documento en PDF"
                                  >
                                    <Download size={13} className="text-amber-600 group-hover/btn:scale-110 transition-transform" />
                                    <span>Descargar</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Proyectos */}
            {profileTab === 'proyectos' && (
              <div className="space-y-4">
                {clientProjectsList.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-dashed border-slate-200 rounded-xl">
                    <Briefcase size={28} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-medium text-slate-600">No hay proyectos activos vinculados a este cliente</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Puedes asignar este cliente como mandante al crear nuevos proyectos en el módulo de Operaciones.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {clientProjectsList.map((project) => (
                      <div key={project.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                        <div className="flex justify-between items-start">
                          <h5 className="font-bold text-slate-900 text-sm">{project.name}</h5>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            project.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                            project.status === 'delayed' ? 'bg-rose-50 text-rose-700' :
                            project.status === 'on-hold' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {project.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2">{project.description || 'Sin descripción'}</p>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                            <span>Progreso</span>
                            <span className="font-bold">{project.progress || 0}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-primary h-full rounded-full transition-all duration-300" 
                              style={{ width: `${project.progress || 0}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                          <span>Plazo: {project.deadline || 'No especificado'}</span>
                          <span>{project.tasks?.length || 0} tareas</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Editar Información */}
            {profileTab === 'editar' && (
              <form onSubmit={handleSaveEdit} className="space-y-4">
                {editSuccessMsg && (
                  <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200 flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    <span>{editSuccessMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Contacto</label>
                    <input
                      type="text"
                      required
                      value={editFormData.name || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">RUT Contacto</label>
                    <input
                      type="text"
                      required
                      value={editFormData.rutContacto || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, rutContacto: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Empresa / Razón Social</label>
                    <input
                      type="text"
                      required
                      value={editFormData.company || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">RUT Empresa</label>
                    <input
                      type="text"
                      required
                      value={editFormData.rutEmpresa || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, rutEmpresa: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      required
                      value={editFormData.email || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Teléfono</label>
                    <input
                      type="text"
                      required
                      value={editFormData.phone || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Dirección Comercial</label>
                    <input
                      type="text"
                      required
                      value={editFormData.address || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Estado</label>
                    <select
                      value={editFormData.status || 'lead'}
                      onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="lead">Lead</option>
                      <option value="opportunity">Oportunidad</option>
                      <option value="customer">Cliente</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setProfileTab('ficha')}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all flex items-center gap-2 shadow-xs disabled:opacity-50"
                  >
                    {isSavingEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    <span>Guardar Cambios</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>

      {/* Official Document Viewer Modal with PDF Download and Print */}
      <DocumentOfficialModal
        isOpen={Boolean(viewingDoc)}
        onClose={() => setViewingDoc(null)}
        document={viewingDoc}
      />
    </div>
  );
}
