import { useState, FormEvent, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileCheck, 
  ShoppingCart, 
  Ticket, 
  User, 
  Calculator, 
  Link as LinkIcon, 
  Trash2, 
  Save, 
  Eye, 
  Printer, 
  Building2, 
  Landmark, 
  CreditCard, 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar,
  X
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';
import { Document, Contact, DocumentItem, DocumentBankDetails, DocumentCompanyInfo } from '../types';
import Modal from './ui/Modal';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

const DOCUMENT_TYPES = [
  { id: 'quotation', label: 'Cotización', icon: FileText, prefix: 'COT' },
  { id: 'sales_note', label: 'Nota de Venta', icon: Ticket, prefix: 'NV' },
  { id: 'purchase_order', label: 'Orden de Compra', icon: ShoppingCart, prefix: 'OC' },
  { id: 'payment_status', label: 'Estado de Pago', icon: CheckCircle2, prefix: 'EP' },
];

const CHILEAN_BANKS = [
  'Banco Santander',
  'Banco de Chile / Edwards',
  'Banco Estado',
  'Banco BCI / Mach',
  'Scotiabank Chile',
  'Banco Itaú',
  'Banco BICE',
  'Banco Security',
  'Banco Falabella',
  'Banco Ripley',
  'Banco Consorcio',
  'Tenpo Prepago'
];

interface DocumentsViewProps {
  contacts?: Contact[];
  hideHeader?: boolean;
  initialTab?: Document['type'];
}

export default function DocumentsView({ 
  contacts: propContacts = [], 
  hideHeader = false, 
  initialTab 
}: DocumentsViewProps) {
  const { user, profile } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Document['type']>(initialTab || 'quotation');
  
  // Real-time internal contacts list
  const [allContacts, setAllContacts] = useState<Contact[]>(propContacts);

  // Modals and wizard state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [rutLookup, setRutLookup] = useState('');
  const [matchedContact, setMatchedContact] = useState<Contact | null>(null);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);

  // Available inventory items
  const [availableItems, setAvailableItems] = useState<any[]>([]);

  // Default company info from settings / profile
  const defaultCompanyInfo: DocumentCompanyInfo = {
    name: profile?.companyName || 'RESCO INGENIERIA SPA',
    rut: profile?.companyRut || '77.497.082-7',
    giro: 'Servicios de Ingeniería Eléctrica y Montajes Industriales',
    address: profile?.companyAddress || "Av. Libertador Bernardo O'Higgins, Rancagua",
    phone: profile?.companyPhone || '+56 9 8884 2857',
    email: profile?.companyEmail || 'contacto@rescoingenieria.cl',
    website: profile?.companyWebsite || 'www.rescoingenieria.cl'
  };

  // Default bank details for receiving payments
  const defaultBankDetails: DocumentBankDetails = {
    bankName: 'Banco Santander',
    accountType: 'Cuenta Corriente',
    accountNumber: '78-99234-1',
    holderName: profile?.companyName || 'RESCO INGENIERIA SPA',
    holderRut: profile?.companyRut || '77.497.082-7',
    paymentEmail: profile?.companyEmail || 'pagos@rescoingenieria.cl',
    notes: 'Favor transferir e indicar el número de folio en el asunto del comprobante.'
  };

  const [newDoc, setNewDoc] = useState<Partial<Document>>({
    clientId: '',
    clientName: '',
    clientRut: '',
    clientAddress: '',
    clientPhone: '',
    clientEmail: '',
    clientContact: '',
    projectId: '',
    projectType: '',
    items: [],
    netAmount: 0,
    iva: 0,
    totalAmount: 0,
    status: 'draft',
    paymentMethod: 'transfer',
    siiFolio: '',
    notes: '',
    validityDays: 15,
    companyInfo: defaultCompanyInfo,
    bankDetails: defaultBankDetails
  });

  // Keep active tab synced if prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Load documents in real time
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'documents'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Document)));
      setLoading(false);
    }, (error) => {
      console.error("Documents snapshot error:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  // Load contacts in real time
  useEffect(() => {
    if (!user) return;
    const qContacts = query(collection(db, 'contacts'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(qContacts, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact));
      setAllContacts(docs);
    }, (err) => console.error("Contacts in DocumentsView error:", err));

    return unsub;
  }, [user]);

  // Update default company & bank details if profile changes
  useEffect(() => {
    if (profile) {
      setNewDoc(prev => ({
        ...prev,
        companyInfo: {
          name: profile.companyName || prev.companyInfo?.name || 'RESCO INGENIERIA SPA',
          rut: profile.companyRut || prev.companyInfo?.rut || '77.497.082-7',
          giro: prev.companyInfo?.giro || 'Servicios de Ingeniería Eléctrica y Montajes Industriales',
          address: profile.companyAddress || prev.companyInfo?.address || "Av. Libertador Bernardo O'Higgins, Rancagua",
          phone: profile.companyPhone || prev.companyInfo?.phone || '+56 9 8884 2857',
          email: profile.companyEmail || prev.companyInfo?.email || 'contacto@rescoingenieria.cl',
          website: profile.companyWebsite || prev.companyInfo?.website || 'www.rescoingenieria.cl'
        },
        bankDetails: {
          ...defaultBankDetails,
          ...prev.bankDetails,
          holderName: profile.companyName || defaultBankDetails.holderName,
          holderRut: profile.companyRut || defaultBankDetails.holderRut,
          paymentEmail: profile.companyEmail || defaultBankDetails.paymentEmail
        }
      }));
    }
  }, [profile]);

  // Load inventory
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'inventory'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAvailableItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, [user]);

  // Normalize Chilean RUT helper (strips dots, hyphens, spaces, uppercase)
  const cleanRut = (r: string) => {
    if (!r) return '';
    return r.replace(/[^0-9kK]/g, '').toUpperCase();
  };

  // Recognize client by RUT or direct selection
  useEffect(() => {
    if (!rutLookup.trim()) {
      setMatchedContact(null);
      return;
    }

    const cleanedSearch = cleanRut(rutLookup);
    if (cleanedSearch.length < 3) return;

    // Check by cleaned RUT in rutEmpresa or rutContacto
    const found = allContacts.find(c => {
      const cleanEmp = cleanRut(c.rutEmpresa);
      const cleanCont = cleanRut(c.rutContacto);
      return cleanEmp === cleanedSearch || cleanCont === cleanedSearch || cleanEmp.includes(cleanedSearch);
    });

    if (found) {
      setMatchedContact(found);
      setNewDoc(prev => ({
        ...prev,
        clientId: found.id,
        clientName: found.company || found.name,
        clientRut: found.rutEmpresa || found.rutContacto,
        clientAddress: found.address || '',
        clientPhone: found.phone || '',
        clientEmail: found.email || '',
        clientContact: found.name || ''
      }));
    } else {
      setMatchedContact(null);
    }
  }, [rutLookup, allContacts]);

  // Apply client from dropdown
  const handleSelectContact = (contactId: string) => {
    const contact = allContacts.find(c => c.id === contactId);
    if (contact) {
      setMatchedContact(contact);
      setRutLookup(contact.rutEmpresa || contact.rutContacto || '');
      setNewDoc(prev => ({
        ...prev,
        clientId: contact.id,
        clientName: contact.company || contact.name,
        clientRut: contact.rutEmpresa || contact.rutContacto,
        clientAddress: contact.address || '',
        clientPhone: contact.phone || '',
        clientEmail: contact.email || '',
        clientContact: contact.name || ''
      }));
    }
  };

  // Items manipulation
  const addItem = (type: 'material' | 'labor' | 'transfer' | 'other') => {
    const newItem: DocumentItem = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      description: '',
      quantity: 1,
      price: 0,
      total: 0
    };
    setNewDoc(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
  };

  const updateItem = (id: string, updates: Partial<DocumentItem>) => {
    setNewDoc(prev => {
      const items = (prev.items || []).map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, ...updates };
          updatedItem.total = (updatedItem.quantity || 0) * (updatedItem.price || 0);
          return updatedItem;
        }
        return item;
      });
      
      const netAmount = items.reduce((sum, item) => sum + item.total, 0);
      const iva = Math.round(netAmount * 0.19);
      const totalAmount = netAmount + iva;

      return {
        ...prev,
        items,
        netAmount,
        iva,
        totalAmount
      };
    });
  };

  const removeItem = (id: string) => {
    setNewDoc(prev => {
      const items = (prev.items || []).filter(item => item.id !== id);
      const netAmount = items.reduce((sum, item) => sum + item.total, 0);
      const iva = Math.round(netAmount * 0.19);
      const totalAmount = netAmount + iva;

      return {
        ...prev,
        items,
        netAmount,
        iva,
        totalAmount
      };
    });
  };

  const handleNetAmountChange = (net: number) => {
    const iva = Math.round(net * 0.19);
    const total = net + iva;
    setNewDoc(prev => ({
      ...prev,
      netAmount: net,
      iva,
      totalAmount: total
    }));
  };

  const generateFolio = (type: Document['type']) => {
    const typeInfo = DOCUMENT_TYPES.find(t => t.id === type);
    const count = documents.filter(d => d.type === type).length + 1;
    return `${typeInfo?.prefix}-${String(count).padStart(4, '0')}`;
  };

  const resetForm = () => {
    setCurrentStep(1);
    setRutLookup('');
    setMatchedContact(null);
    setNewDoc({ 
      clientId: '', 
      clientName: '', 
      clientRut: '',
      clientAddress: '',
      clientPhone: '',
      clientEmail: '',
      clientContact: '',
      projectId: '',
      projectType: '',
      items: [],
      netAmount: 0, 
      iva: 0, 
      totalAmount: 0, 
      status: 'draft',
      notes: '',
      validityDays: 15,
      siiFolio: '',
      paymentMethod: 'transfer',
      linkedDocId: '',
      companyInfo: defaultCompanyInfo,
      bankDetails: defaultBankDetails
    });
  };

  const handleOpenCreateModal = () => {
    setEditingDoc(null);
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (docItem: Document) => {
    setEditingDoc(docItem);
    setCurrentStep(1);
    setRutLookup(docItem.clientRut || '');
    setNewDoc({
      ...docItem,
      companyInfo: docItem.companyInfo || defaultCompanyInfo,
      bankDetails: docItem.bankDetails || defaultBankDetails
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;

    if (!newDoc.clientName?.trim()) {
      alert("Por favor identifique o ingrese el nombre del cliente.");
      setCurrentStep(1);
      return;
    }

    try {
      const documentPayload = {
        type: activeTab,
        folio: editingDoc ? editingDoc.folio : generateFolio(activeTab),
        clientId: newDoc.clientId || '',
        clientName: newDoc.clientName || '',
        clientRut: newDoc.clientRut || rutLookup || '',
        clientAddress: newDoc.clientAddress || '',
        clientPhone: newDoc.clientPhone || '',
        clientEmail: newDoc.clientEmail || '',
        clientContact: newDoc.clientContact || '',
        projectId: newDoc.projectId || '',
        projectType: newDoc.projectType || '',
        items: newDoc.items || [],
        date: editingDoc ? editingDoc.date : new Date().toLocaleDateString('es-ES'),
        netAmount: newDoc.netAmount || 0,
        iva: newDoc.iva || 0,
        totalAmount: newDoc.totalAmount || 0,
        status: newDoc.status || (activeTab === 'payment_status' ? 'paid' : 'draft'),
        paymentMethod: newDoc.paymentMethod || 'transfer',
        siiFolio: newDoc.siiFolio || '',
        notes: newDoc.notes || '',
        validityDays: newDoc.validityDays || 15,
        linkedDocId: newDoc.linkedDocId || '',
        companyInfo: newDoc.companyInfo || defaultCompanyInfo,
        bankDetails: newDoc.bankDetails || defaultBankDetails,
        ownerId: user.uid,
        updatedAt: serverTimestamp()
      };

      if (editingDoc) {
        await updateDoc(doc(db, 'documents', editingDoc.id), documentPayload);
      } else {
        await addDoc(collection(db, 'documents'), {
          ...documentPayload,
          createdAt: serverTimestamp()
        });
      }

      setIsModalOpen(false);
      setEditingDoc(null);
      resetForm();
    } catch (error) {
      console.error("Error saving document:", error);
      alert("Error al guardar el documento mercantil.");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Está seguro de eliminar este documento? Esta acción es irreversible.')) {
      try {
        await deleteDoc(doc(db, 'documents', id));
      } catch (error) {
        console.error("Error deleting document:", error);
        alert("Error al eliminar el documento");
      }
    }
  };

  // High quality PDF generation with Company Info and Bank Details
  const handleDownloadPDF = (docItem: Document) => {
    try {
      const pdf = new jsPDF();
      const comp = docItem.companyInfo || defaultCompanyInfo;
      const bank = docItem.bankDetails || defaultBankDetails;
      
      // Header: Company Logo & Identity
      pdf.setFillColor(15, 23, 42); // slate-900
      pdf.rect(0, 0, 210, 8, 'F');

      // Company info (Left)
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(15, 23, 42);
      pdf.text(comp.name.toUpperCase(), 15, 22);

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(100, 116, 139);
      pdf.text(comp.giro || 'Servicios Integrales de Ingeniería', 15, 27);
      pdf.text(`RUT: ${comp.rut} • ${comp.address}`, 15, 32);
      pdf.text(`Fono: ${comp.phone} • Email: ${comp.email}`, 15, 36);

      // Red Chilean SII Box (Right)
      const docTypeLabel = 
        docItem.type === 'quotation' ? 'COTIZACIÓN' :
        docItem.type === 'purchase_order' ? 'ORDEN DE COMPRA' :
        docItem.type === 'sales_note' ? 'NOTA DE VENTA' :
        docItem.type === 'invoice' ? 'FACTURA' : 'ESTADO DE PAGO';

      pdf.setDrawColor(225, 29, 72); // rose-600
      pdf.setLineWidth(0.8);
      pdf.rect(130, 14, 65, 26);
      
      pdf.setTextColor(225, 29, 72);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.text(`R.U.T.: ${comp.rut}`, 162.5, 20, { align: 'center' });
      pdf.setFontSize(10);
      pdf.text(docTypeLabel, 162.5, 26, { align: 'center' });
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text(`N° ${docItem.folio}`, 162.5, 34, { align: 'center' });

      // Client Data Section
      pdf.setFillColor(248, 250, 252); // slate-50
      pdf.rect(15, 46, 180, 26, 'F');
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.3);
      pdf.rect(15, 46, 180, 26);

      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("DATOS DEL CLIENTE / RECEPTOR", 20, 52);

      pdf.setFont("helvetica", "normal");
      pdf.text(`Razón Social:`, 20, 58);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${docItem.clientName}`, 42, 58);

      pdf.setFont("helvetica", "normal");
      pdf.text(`RUT Cliente:`, 20, 64);
      pdf.text(`${docItem.clientRut || docItem.clientId || 'Sin registrar'}`, 42, 64);

      pdf.text(`Dirección:`, 20, 69);
      pdf.text(`${docItem.clientAddress || 'Sin registrar'}`, 42, 69);

      pdf.text(`Fecha Emisión:`, 120, 58);
      pdf.text(`${docItem.date}`, 148, 58);

      pdf.text(`Contacto / Fono:`, 120, 64);
      pdf.text(`${docItem.clientContact || docItem.clientPhone || 'No informado'}`, 148, 64);

      pdf.text(`Proyecto:`, 120, 69);
      pdf.text(`${docItem.projectType || 'General'}`, 148, 69);

      // Items Table
      pdf.setFillColor(15, 23, 42);
      pdf.rect(15, 78, 180, 7, 'F');
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      pdf.text("DESCRIPCIÓN DEL ÍTEM O SERVICIO", 18, 83);
      pdf.text("CANT", 130, 83);
      pdf.text("P. UNITARIO", 150, 83);
      pdf.text("TOTAL", 180, 83);

      let currentY = 91;
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(30, 41, 59);

      (docItem.items || []).forEach((item) => {
        if (currentY > 230) {
          pdf.addPage();
          currentY = 25;
        }
        pdf.text(item.description || 'Ítem sin descripción', 18, currentY);
        pdf.text(String(item.quantity || 1), 132, currentY);
        pdf.text(`$${(item.price || 0).toLocaleString()}`, 150, currentY);
        pdf.text(`$${(item.total || 0).toLocaleString()}`, 180, currentY);
        
        pdf.setDrawColor(241, 245, 249);
        pdf.line(15, currentY + 2, 195, currentY + 2);
        currentY += 7;
      });

      // Totals Box (Right)
      currentY += 4;
      pdf.setFillColor(248, 250, 252);
      pdf.rect(125, currentY, 70, 24, 'F');
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(125, currentY, 70, 24);

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text("Subtotal Neto:", 130, currentY + 6);
      pdf.text(`$${(docItem.netAmount || 0).toLocaleString()}`, 188, currentY + 6, { align: 'right' });

      pdf.text("I.V.A. (19%):", 130, currentY + 12);
      pdf.text(`$${(docItem.iva || 0).toLocaleString()}`, 188, currentY + 12, { align: 'right' });

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(15, 23, 42);
      pdf.text("TOTAL GENERAL:", 130, currentY + 19);
      pdf.text(`$${(docItem.totalAmount || 0).toLocaleString()} CLP`, 188, currentY + 19, { align: 'right' });

      // Bank Payment Details Box (Left / Bottom)
      pdf.setFillColor(240, 253, 250); // emerald-50/teal
      pdf.rect(15, currentY, 105, 24, 'F');
      pdf.setDrawColor(16, 185, 129); // emerald-500
      pdf.setLineWidth(0.4);
      pdf.rect(15, currentY, 105, 24);

      pdf.setTextColor(6, 95, 70);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("DATOS PARA TRANSFERENCIA BANCARIA / PAGO", 18, currentY + 5);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text(`Banco: ${bank.bankName} • ${bank.accountType}`, 18, currentY + 10);
      pdf.text(`N° Cuenta: ${bank.accountNumber} • RUT: ${bank.holderRut}`, 18, currentY + 14);
      pdf.text(`Titular: ${bank.holderName}`, 18, currentY + 18);
      pdf.text(`Aviso Transferencia: ${bank.paymentEmail}`, 18, currentY + 22);

      // Signatures
      currentY += 34;
      if (currentY > 260) {
        pdf.addPage();
        currentY = 30;
      }
      pdf.setDrawColor(203, 213, 225);
      pdf.line(25, currentY + 15, 85, currentY + 15);
      pdf.line(125, currentY + 15, 185, currentY + 15);
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text("Firma Emisor / RESCOING", 35, currentY + 20);
      pdf.text("Aceptado y Conforme Cliente", 133, currentY + 20);

      pdf.save(`${docItem.type.toUpperCase()}_${docItem.folio}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("No se pudo generar el PDF del documento.");
    }
  };

  const filteredDocs = documents.filter(d => 
    d.type === activeTab && 
    (d.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     d.folio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     d.clientRut?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Módulo de Documentos</h2>
            <p className="text-slate-500 mt-1">Gestión integral de toda la documentación mercantil de RESCOING.</p>
          </div>
          <button 
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={18} />
            Nuevo {DOCUMENT_TYPES.find(t => t.id === activeTab)?.label}
          </button>
        </div>
      )}

      {/* Top Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {DOCUMENT_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => setActiveTab(type.id as any)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-all relative cursor-pointer
              ${activeTab === type.id ? 'text-primary' : 'text-slate-500 hover:text-slate-700'}
            `}
          >
            <type.icon size={18} />
            {type.label}
            {activeTab === type.id && (
              <motion.div 
                layoutId="activeTabDoc"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
              />
            )}
          </button>
        ))}
        {hideHeader && (
          <button 
            onClick={handleOpenCreateModal}
            className="ml-auto flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={15} />
            Nuevo {DOCUMENT_TYPES.find(t => t.id === activeTab)?.label}
          </button>
        )}
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por cliente, RUT o folio..." 
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="px-6 py-4">Folio</th>
                <th className="px-6 py-4">Cliente / Receptor</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    Cargando documentos...
                  </td>
                </tr>
              ) : filteredDocs.length > 0 ? filteredDocs.map((docItem) => (
                <tr key={docItem.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-slate-900">
                    {docItem.folio}
                    {docItem.siiFolio && (
                      <span className="block text-[9px] text-primary font-normal">SII: #{docItem.siiFolio}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-900 block">{docItem.clientName}</span>
                    <span className="text-[10px] text-slate-400 block font-mono">{docItem.clientRut || docItem.clientId}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{docItem.date}</td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-900">
                    ${(docItem.totalAmount || 0).toLocaleString()} CLP
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1
                      ${docItem.status === 'approved' || docItem.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        docItem.status === 'sent' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        docItem.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        docItem.status === 'rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-slate-100 text-slate-700 border border-slate-200'}
                    `}>
                      {docItem.status === 'approved' || docItem.status === 'paid' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                      {docItem.status === 'approved' ? 'Aprobado' :
                       docItem.status === 'paid' ? 'Pagado' :
                       docItem.status === 'sent' ? 'Enviado' :
                       docItem.status === 'pending' ? 'Pendiente' :
                       docItem.status === 'rejected' ? 'Rechazado' : 'Borrador'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button 
                        onClick={() => handleOpenEditModal(docItem)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
                        title="Editar Documento"
                      >
                        <Save size={15} />
                      </button>
                      <button 
                        onClick={() => setViewingDoc(docItem)}
                        className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-600 transition-colors"
                        title="Ver Documento Oficial"
                      >
                        <Eye size={15} />
                      </button>
                      <button 
                        onClick={() => handleDownloadPDF(docItem)}
                        className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors"
                        title="Descargar PDF"
                      >
                        <Download size={15} />
                      </button>
                      <button 
                        onClick={() => handleDelete(docItem.id)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-500 transition-colors"
                        title="Eliminar Documento"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No hay documentos de {DOCUMENT_TYPES.find(t => t.id === activeTab)?.label} registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* STEP-BY-STEP COMPREHENSIVE MODAL FOR DOCUMENT CREATION & EDITING */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingDoc(null); }} 
        title={editingDoc ? `Editar ${DOCUMENT_TYPES.find(t => t.id === activeTab)?.label} (${editingDoc.folio})` : `Generar ${DOCUMENT_TYPES.find(t => t.id === activeTab)?.label} Paso a Paso`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-6">
          {/* Step Indicator Bar */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex items-center justify-between">
            {[
              { num: 1, title: 'Emisor y Cliente', desc: 'Identificación y RUT' },
              { num: 2, title: 'Partidas y Conceptos', desc: 'Materiales y Servicios' },
              { num: 3, title: 'Datos de Pago y Cuenta', desc: 'Transferencia Bancaria' },
              { num: 4, title: 'Resumen y Emisión', desc: 'Confirmación Final' },
            ].map(step => (
              <button
                key={step.num}
                type="button"
                onClick={() => setCurrentStep(step.num as any)}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all text-left cursor-pointer ${
                  currentStep === step.num 
                    ? 'bg-primary text-white shadow-xs' 
                    : currentStep > step.num 
                    ? 'text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                  currentStep === step.num 
                    ? 'bg-white text-primary' 
                    : currentStep > step.num 
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {currentStep > step.num ? <Check size={12} strokeWidth={3} /> : step.num}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-bold leading-tight">{step.title}</p>
                  <p className={`text-[9px] ${currentStep === step.num ? 'text-white/80' : 'text-slate-400'}`}>{step.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* PASO 1: EMISOR Y CLIENTE */}
          {currentStep === 1 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {/* Box 1: Información de la Empresa Emisora */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2 text-primary font-bold text-xs">
                    <Building2 size={16} />
                    <span className="uppercase tracking-wider">Información de la Empresa Emisora</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                    Folio: {editingDoc ? editingDoc.folio : generateFolio(activeTab)}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Razón Social</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-bold text-slate-800 text-xs"
                      value={newDoc.companyInfo?.name || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        companyInfo: { ...newDoc.companyInfo!, name: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">RUT Empresa</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-mono font-bold text-slate-800 text-xs"
                      value={newDoc.companyInfo?.rut || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        companyInfo: { ...newDoc.companyInfo!, rut: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Giro Comercial</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 text-xs"
                      value={newDoc.companyInfo?.giro || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        companyInfo: { ...newDoc.companyInfo!, giro: e.target.value }
                      })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dirección Comercial</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 text-xs"
                      value={newDoc.companyInfo?.address || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        companyInfo: { ...newDoc.companyInfo!, address: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fono / Email</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 text-xs"
                      value={`${newDoc.companyInfo?.phone || ''} • ${newDoc.companyInfo?.email || ''}`}
                      onChange={e => {
                        const parts = e.target.value.split('•');
                        setNewDoc({
                          ...newDoc,
                          companyInfo: { 
                            ...newDoc.companyInfo!, 
                            phone: parts[0]?.trim() || '', 
                            email: parts[1]?.trim() || newDoc.companyInfo?.email || ''
                          }
                        });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Box 2: Identificación y Reconocimiento Automático del Cliente */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2 text-primary font-bold text-xs">
                    <User size={16} />
                    <span className="uppercase tracking-wider">Identificación del Cliente / Receptor</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {allContacts.length} clientes en CRM
                  </span>
                </div>

                {/* RUT Search Bar + Dropdown Selector */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>RUT Cliente (Reconocimiento Automático)</span>
                      <span className="text-[9px] text-primary lowercase">ej: 78.223.514-1 o 78223514-1</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Ingrese RUT del cliente..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono font-bold text-slate-900 bg-white"
                        value={rutLookup}
                        onChange={e => setRutLookup(e.target.value)}
                      />
                      <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      O Seleccionar Cliente Directamente
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                      value={newDoc.clientId || ''}
                      onChange={e => handleSelectContact(e.target.value)}
                    >
                      <option value="">-- Buscar o Seleccionar de la lista ({allContacts.length}) --</option>
                      {allContacts.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.company || c.name} ({c.rutEmpresa || c.rutContacto || 'Sin RUT'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Match Notification */}
                {matchedContact ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-bold">✓ Cliente Reconocido: </span>
                        <span>{matchedContact.company} ({matchedContact.name})</span>
                        <span className="font-mono ml-2 text-[11px] bg-emerald-100/70 px-1.5 py-0.5 rounded">
                          RUT: {matchedContact.rutEmpresa || matchedContact.rutContacto}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded">
                      CRM Conectado
                    </span>
                  </div>
                ) : rutLookup.trim().length > 3 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-800">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={18} className="text-amber-600 shrink-0" />
                      <span>RUT no registrado en CRM aún. Puedes ingresar los datos manualmente a continuación.</span>
                    </div>
                  </div>
                ) : null}

                {/* Client Editable Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre / Razón Social Receptor *</label>
                    <input 
                      required
                      type="text" 
                      placeholder="Nombre del cliente o empresa..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-bold text-slate-900 bg-white"
                      value={newDoc.clientName || ''}
                      onChange={e => setNewDoc({...newDoc, clientName: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Contacto Principal</label>
                    <input 
                      type="text" 
                      placeholder="Persona de contacto..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm text-slate-800 bg-white"
                      value={newDoc.clientContact || ''}
                      onChange={e => setNewDoc({...newDoc, clientContact: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Correo Electrónico Cliente</label>
                    <input 
                      type="email" 
                      placeholder="cliente@empresa.cl"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm text-slate-800 bg-white"
                      value={newDoc.clientEmail || ''}
                      onChange={e => setNewDoc({...newDoc, clientEmail: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Teléfono Cliente</label>
                    <input 
                      type="text" 
                      placeholder="+56 9 xxxx xxxx"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm text-slate-800 bg-white"
                      value={newDoc.clientPhone || ''}
                      onChange={e => setNewDoc({...newDoc, clientPhone: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dirección de Entrega / Facturación</label>
                    <input 
                      type="text" 
                      placeholder="Calle, número, comuna o faena..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm text-slate-800 bg-white"
                      value={newDoc.clientAddress || ''}
                      onChange={e => setNewDoc({...newDoc, clientAddress: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {/* Box 3: Document Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tipo de Proyecto / Asunto</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Montaje Tableros, Mantención..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                    value={newDoc.projectType || ''}
                    onChange={e => setNewDoc({...newDoc, projectType: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Estado del Documento</label>
                  <select 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                    value={newDoc.status || 'draft'}
                    onChange={e => setNewDoc({...newDoc, status: e.target.value as any})}
                  >
                    <option value="draft">Borrador</option>
                    <option value="sent">Enviado al Cliente</option>
                    <option value="approved">Aprobado / Emitido</option>
                    <option value="pending">Pendiente de Aprobación</option>
                    <option value="paid">Pagado</option>
                    <option value="rejected">Rechazado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Validez de la Oferta</label>
                  <select 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                    value={newDoc.validityDays || 15}
                    onChange={e => setNewDoc({...newDoc, validityDays: parseInt(e.target.value) || 15})}
                  >
                    <option value={7}>7 días corridos</option>
                    <option value={15}>15 días corridos</option>
                    <option value={30}>30 días corridos</option>
                    <option value={60}>60 días corridos</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {/* PASO 2: PARTIDAS Y DESGLOSE DE CONCEPTOS */}
          {currentStep === 2 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Conceptos y Partidas de la Cotización</h4>
                  <p className="text-[11px] text-slate-400">Agrega materiales de bodega, mano de obra, traslados u otros servicios.</p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button type="button" onClick={() => addItem('material')} className="px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 flex items-center gap-1 cursor-pointer">
                    <Plus size={12} /> + Material
                  </button>
                  <button type="button" onClick={() => addItem('labor')} className="px-2.5 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200 flex items-center gap-1 cursor-pointer">
                    <Plus size={12} /> + Mano de Obra
                  </button>
                  <button type="button" onClick={() => addItem('transfer')} className="px-2.5 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200 flex items-center gap-1 cursor-pointer">
                    <Plus size={12} /> + Traslado
                  </button>
                  <button type="button" onClick={() => addItem('other')} className="px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 flex items-center gap-1 cursor-pointer">
                    <Plus size={12} /> + Otros
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/60 max-h-[360px] overflow-y-auto">
                {newDoc.items?.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                    <div className="col-span-12 sm:col-span-4">
                      {item.type === 'material' ? (
                        <select 
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                          value={item.refId || ''}
                          onChange={e => {
                            const inv = availableItems.find(i => i.id === e.target.value);
                            updateItem(item.id, { 
                              refId: e.target.value, 
                              description: inv?.name || '',
                              price: inv?.netPrice || 0
                            });
                          }}
                        >
                          <option value="">Seleccionar Material de Inventario...</option>
                          {availableItems.map(i => (
                            <option key={i.id} value={i.id}>{i.name} (Stock: {i.stock} {i.unit})</option>
                          ))}
                        </select>
                      ) : (
                        <input 
                          type="text" 
                          placeholder="Descripción del ítem o partida..."
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                          value={item.description}
                          onChange={e => updateItem(item.id, { description: e.target.value })}
                        />
                      )}
                    </div>
                    
                    <div className="col-span-3 sm:col-span-2 text-center">
                      <span className={`text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-wider block ${
                        item.type === 'material' ? 'bg-primary/10 text-primary' :
                        item.type === 'labor' ? 'bg-amber-100 text-amber-700' :
                        item.type === 'transfer' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {item.type === 'material' ? 'Material' : item.type === 'labor' ? 'Mano Obra' : item.type === 'transfer' ? 'Traslado' : 'Otros'}
                      </span>
                    </div>

                    <div className="col-span-3 sm:col-span-2">
                      <input 
                        type="number" 
                        min="1"
                        placeholder="Cant."
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg font-mono text-center"
                        value={item.quantity}
                        onChange={e => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="col-span-3 sm:col-span-2">
                      <input 
                        type="number" 
                        min="0"
                        placeholder="P. Unit"
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg font-mono text-right"
                        value={item.price}
                        onChange={e => updateItem(item.id, { price: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1 font-mono text-xs font-bold text-slate-900 text-right">
                      ${(item.total || 0).toLocaleString()}
                    </div>

                    <div className="col-span-1 text-right">
                      <button 
                        type="button" 
                        onClick={() => removeItem(item.id)} 
                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                        title="Eliminar ítem"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                {(!newDoc.items || newDoc.items.length === 0) && (
                  <div className="text-center py-8 text-slate-400 text-xs italic">
                    Haz clic en los botones superiores para agregar materiales, mano de obra o traslados.
                  </div>
                )}
              </div>

              {/* Totals Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Monto Neto Afecto</label>
                  <input 
                    required
                    type="number" 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono font-bold bg-white text-slate-900"
                    value={newDoc.netAmount || 0}
                    onChange={e => handleNetAmountChange(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">IVA (19%)</label>
                  <div className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-slate-600">
                    ${(newDoc.iva || 0).toLocaleString()} CLP
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Total General</label>
                  <div className="px-3 py-2 rounded-lg border border-primary/20 bg-primary/10 text-xs font-mono font-bold text-primary">
                    ${(newDoc.totalAmount || 0).toLocaleString()} CLP
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* PASO 3: DATOS DE LA CUENTA PARA RECIBIR PAGOS Y CONDICIONES */}
          {currentStep === 3 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {/* Box: Datos Bancarios de la Cuenta */}
              <div className="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-200 space-y-4">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <Landmark size={18} className="text-emerald-600" />
                    <span className="uppercase tracking-wider">Datos de la Cuenta para Recepción de Pagos</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded">
                    Requerido para Clientes
                  </span>
                </div>
                <p className="text-xs text-emerald-700">
                  Esta información se imprimirá en la cotización o documento para que el cliente realice la transferencia electrónica correspondiente.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Institución Bancaria *</label>
                    <select
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500/20"
                      value={newDoc.bankDetails?.bankName || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        bankDetails: { ...newDoc.bankDetails!, bankName: e.target.value }
                      })}
                    >
                      {CHILEAN_BANKS.map(bank => (
                        <option key={bank} value={bank}>{bank}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Tipo de Cuenta *</label>
                    <select
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500/20"
                      value={newDoc.bankDetails?.accountType || 'Cuenta Corriente'}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        bankDetails: { ...newDoc.bankDetails!, accountType: e.target.value }
                      })}
                    >
                      <option value="Cuenta Corriente">Cuenta Corriente</option>
                      <option value="Cuenta Vista / RUT">Cuenta Vista / RUT</option>
                      <option value="Cuenta de Ahorro">Cuenta de Ahorro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Número de Cuenta *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: 78-99234-1"
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500/20"
                      value={newDoc.bankDetails?.accountNumber || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        bankDetails: { ...newDoc.bankDetails!, accountNumber: e.target.value }
                      })}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-1">RUT del Titular *</label>
                    <input
                      type="text"
                      required
                      placeholder="77.497.082-7"
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500/20"
                      value={newDoc.bankDetails?.holderRut || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        bankDetails: { ...newDoc.bankDetails!, holderRut: e.target.value }
                      })}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Nombre / Razón Social Titular *</label>
                    <input
                      type="text"
                      required
                      placeholder="RESCO INGENIERIA SPA"
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white text-sm font-bold focus:ring-2 focus:ring-emerald-500/20"
                      value={newDoc.bankDetails?.holderName || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        bankDetails: { ...newDoc.bankDetails!, holderName: e.target.value }
                      })}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Email para Enviar Comprobante *</label>
                    <input
                      type="email"
                      required
                      placeholder="pagos@rescoingenieria.cl"
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-emerald-500/20"
                      value={newDoc.bankDetails?.paymentEmail || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        bankDetails: { ...newDoc.bankDetails!, paymentEmail: e.target.value }
                      })}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-1">Instrucciones o Condiciones de Pago</label>
                    <input
                      type="text"
                      placeholder="Ej: Transferencia electrónica a 30 días, o 50% anticipo al confirmar orden."
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-emerald-500/20"
                      value={newDoc.bankDetails?.notes || ''}
                      onChange={e => setNewDoc({
                        ...newDoc,
                        bankDetails: { ...newDoc.bankDetails!, notes: e.target.value }
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* Notes and Commercial Conditions */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Observaciones Comerciales y Plazos de Entrega
                </label>
                <textarea
                  rows={3}
                  placeholder="Incluye plazos de entrega, garantías, alcance técnico o condiciones particulares..."
                  className="w-full p-3 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-primary/20"
                  value={newDoc.notes || ''}
                  onChange={e => setNewDoc({...newDoc, notes: e.target.value})}
                />
              </div>
            </motion.div>
          )}

          {/* PASO 4: RESUMEN Y CONFIRMACIÓN */}
          {currentStep === 4 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Revisión Final del Documento</span>
                    <h4 className="font-bold text-slate-900 text-base">{DOCUMENT_TYPES.find(t => t.id === activeTab)?.label} - {editingDoc ? editingDoc.folio : generateFolio(activeTab)}</h4>
                  </div>
                  <span className="font-mono text-base font-black text-primary">${(newDoc.totalAmount || 0).toLocaleString()} CLP</span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs bg-white p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Emisor:</span>
                    <p className="font-bold text-slate-800">{newDoc.companyInfo?.name}</p>
                    <p className="text-slate-500 text-[11px]">RUT: {newDoc.companyInfo?.rut}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Cliente Receptor:</span>
                    <p className="font-bold text-slate-800">{newDoc.clientName}</p>
                    <p className="text-slate-500 text-[11px]">RUT: {newDoc.clientRut || newDoc.clientId}</p>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs">
                  <span className="text-[9px] font-bold text-emerald-800 uppercase block mb-1">Cuenta para Pagos Configurada:</span>
                  <p className="font-semibold text-emerald-900">
                    {newDoc.bankDetails?.bankName} • {newDoc.bankDetails?.accountType} N° {newDoc.bankDetails?.accountNumber}
                  </p>
                  <p className="text-emerald-700 text-[11px]">
                    Titular: {newDoc.bankDetails?.holderName} (RUT: {newDoc.bankDetails?.holderRut}) • Envío a: {newDoc.bankDetails?.paymentEmail}
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-500 italic">
                * Al confirmar, el documento quedará registrado en el historial contable y estará disponible para visualización online e impresión oficial en PDF.
              </div>
            </motion.div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center pt-4 border-t border-slate-200">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((currentStep - 1) as any)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} /> Anterior
              </button>
            ) : <div />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setIsModalOpen(false); setEditingDoc(null); }}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancelar
              </button>

              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (currentStep === 1 && !newDoc.clientName?.trim()) {
                      alert("Por favor identifique o ingrese el cliente.");
                      return;
                    }
                    setCurrentStep((currentStep + 1) as any);
                  }}
                  className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  Siguiente <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Save size={16} />
                  <span>{editingDoc ? 'Guardar Cambios' : 'Confirmar y Emitir Documento'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ONLINE OFFICIAL DOCUMENT VIEWER */}
      <Modal
        isOpen={!!viewingDoc}
        onClose={() => setViewingDoc(null)}
        title={`Documento Oficial: ${viewingDoc?.folio}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-6 font-sans text-left">
          {viewingDoc && (
            <>
              {/* Actions Header Bar */}
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-2xs shrink-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                  Documento Comercial Oficial • RESCOING
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>Imprimir</span>
                  </button>
                  <button
                    onClick={() => handleDownloadPDF(viewingDoc)}
                    className="flex items-center gap-1.5 bg-primary hover:opacity-90 text-white rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Descargar PDF</span>
                  </button>
                </div>
              </div>

              {/* Fiscal Document Sheet */}
              <div className="bg-white border border-slate-300 rounded-2xl shadow-xl p-6 md:p-8 max-w-full overflow-x-auto print:border-none print:shadow-none font-sans custom-scrollbar">
                <div className="min-w-[640px] space-y-6">
                  {/* Ledger Header */}
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 leading-tight">
                        {viewingDoc.companyInfo?.name || 'RESCO INGENIERIA SPA'}
                      </h3>
                      <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-wider">
                        {viewingDoc.companyInfo?.giro || 'Servicios Integrales de Ingeniería • Obras Civiles • Electricidad'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {viewingDoc.companyInfo?.address} • {viewingDoc.companyInfo?.email}
                      </p>
                    </div>

                    {/* Standard Red Border Box (SII Chile style) */}
                    <div className="border-[3px] border-rose-600 px-6 py-4 text-center rounded-lg bg-rose-50/20 max-w-[240px] shrink-0">
                      <p className="text-xs font-black text-rose-600 tracking-wider">
                        R.U.T.: {viewingDoc.companyInfo?.rut || '77.497.082-7'}
                      </p>
                      <h4 className="text-xs font-black text-rose-700 uppercase my-1 leading-snug">
                        {viewingDoc.type === 'quotation' ? 'COTIZACIÓN' :
                         viewingDoc.type === 'purchase_order' ? 'ORDEN DE COMPRA' :
                         viewingDoc.type === 'sales_note' ? 'NOTA DE VENTA' :
                         viewingDoc.type === 'invoice' ? 'FACTURA ELECTRÓNICA' : 'ESTADO DE PAGO'}
                      </h4>
                      <p className="text-sm font-black text-rose-600 font-mono tracking-widest">{viewingDoc.folio}</p>
                      {viewingDoc.siiFolio && (
                        <p className="text-[9px] text-rose-500 font-bold mt-1 uppercase">SII Ref: #{viewingDoc.siiFolio}</p>
                      )}
                    </div>
                  </div>

                  {/* Client Metadata block */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="space-y-1.5">
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Cliente / Receptor:</span>
                        <span className="text-slate-900 font-bold text-sm leading-relaxed">{viewingDoc.clientName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">R.U.T. Cliente:</span>
                        <span className="text-slate-700 font-mono font-bold">{viewingDoc.clientRut || viewingDoc.clientId || 'Sin registrar'}</span>
                      </div>
                      {viewingDoc.clientAddress && (
                        <div>
                          <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Dirección:</span>
                          <span className="text-slate-600">{viewingDoc.clientAddress}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1.5 pl-6 border-l border-slate-200">
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Fecha de Emisión:</span>
                        <span className="text-slate-700 font-bold">{viewingDoc.date}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Validez de la Oferta:</span>
                        <span className="text-slate-700 font-medium">{viewingDoc.validityDays || 15} días corridos</span>
                      </div>
                      {viewingDoc.projectType && (
                        <div>
                          <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Proyecto:</span>
                          <span className="text-slate-800 font-bold">{viewingDoc.projectType}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items list Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          <th className="p-2.5 px-4 text-left">Descripción del Ítem o Servicio</th>
                          <th className="p-2.5 text-center w-20">Cantidad</th>
                          <th className="p-2.5 text-right w-36">Precio Unitario</th>
                          <th className="p-2.5 px-4 text-right w-36">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {viewingDoc.items?.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-3 px-4 text-left font-bold text-slate-900 leading-tight">
                              {item.description}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-500">
                              {item.quantity}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-600">
                              ${(item.price || 0).toLocaleString()}
                            </td>
                            <td className="p-3 px-4 text-right font-mono font-bold text-slate-900">
                              ${(item.total || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary & Bank Account Box */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start pt-2">
                    {/* Bank Details Box */}
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-xs space-y-1.5">
                      <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block mb-1">
                        Datos para Transferencia Electrónica de Fondos
                      </span>
                      <p className="text-emerald-950 font-bold">
                        Banco: <span className="font-normal">{viewingDoc.bankDetails?.bankName || defaultBankDetails.bankName}</span>
                      </p>
                      <p className="text-emerald-950 font-bold">
                        Tipo de Cuenta: <span className="font-normal">{viewingDoc.bankDetails?.accountType || defaultBankDetails.accountType}</span>
                      </p>
                      <p className="text-emerald-950 font-bold">
                        N° de Cuenta: <span className="font-mono font-bold text-emerald-900">{viewingDoc.bankDetails?.accountNumber || defaultBankDetails.accountNumber}</span>
                      </p>
                      <p className="text-emerald-950 font-bold">
                        Titular: <span className="font-normal">{viewingDoc.bankDetails?.holderName || defaultBankDetails.holderName}</span>
                      </p>
                      <p className="text-emerald-950 font-bold">
                        RUT Titular: <span className="font-mono font-bold text-emerald-900">{viewingDoc.bankDetails?.holderRut || defaultBankDetails.holderRut}</span>
                      </p>
                      <p className="text-emerald-950 font-bold">
                        Correo Comprobantes: <span className="font-medium text-emerald-800">{viewingDoc.bankDetails?.paymentEmail || defaultBankDetails.paymentEmail}</span>
                      </p>
                      {viewingDoc.bankDetails?.notes && (
                        <p className="text-[11px] text-emerald-700 italic pt-1 border-t border-emerald-200/60 mt-1">
                          Condiciones: {viewingDoc.bankDetails.notes}
                        </p>
                      )}
                    </div>

                    {/* Totals */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-semibold text-slate-700 space-y-2">
                      <div className="flex justify-between">
                        <span>Neto Afecto:</span>
                        <span className="font-mono font-bold text-slate-900">${(viewingDoc.netAmount || 0).toLocaleString()} CLP</span>
                      </div>
                      <div className="flex justify-between">
                        <span>I.V.A. (19%):</span>
                        <span className="font-mono font-bold text-slate-900">${(viewingDoc.iva || 0).toLocaleString()} CLP</span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-2">
                        <span>TOTAL GENERAL:</span>
                        <span className="font-mono text-primary">${(viewingDoc.totalAmount || 0).toLocaleString()} CLP</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures */}
                  <div className="pt-8 grid grid-cols-2 gap-12 text-center text-[10px] text-slate-400 font-medium">
                    <div className="space-y-1">
                      <div className="border-t border-slate-200 mx-auto w-40 mt-8" />
                      <p className="font-bold text-slate-700">Firma Emisor / RESCOING</p>
                      <p className="text-[8px] uppercase">Emitente Autorizado</p>
                    </div>
                    <div className="space-y-1">
                      <div className="border-t border-slate-200 mx-auto w-40 mt-8" />
                      <p className="font-bold text-slate-700">Aceptado y Conforme</p>
                      <p className="text-[8px] uppercase">Firma del Cliente Receptor</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
