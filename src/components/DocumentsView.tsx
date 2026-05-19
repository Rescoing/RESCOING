import { useState, Dispatch, SetStateAction, FormEvent, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileCheck,
  ShoppingCart,
  Ticket,
  ChevronRight,
  User,
  Calculator,
  Link as LinkIcon,
  Trash2,
  Edit2,
  Save
} from 'lucide-react';
import { motion } from 'motion/react';
import { Document, Contact } from '../types';
import Modal from './ui/Modal';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

const DOCUMENT_TYPES = [
  { id: 'quotation', label: 'Cotización', icon: FileText, prefix: 'COT' },
  { id: 'purchase_order', label: 'Orden de Compra', icon: ShoppingCart, prefix: 'OC' },
  { id: 'sales_note', label: 'Nota de Venta', icon: Ticket, prefix: 'NV' },
  { id: 'invoice', label: 'Factura (SII)', icon: FileCheck, prefix: 'FAC' },
  { id: 'payment_status', label: 'Estado de Pago', icon: CheckCircle2, prefix: 'EP' },
];

export default function DocumentsView({ contacts }: { contacts: Contact[] }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Document['type']>('quotation');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [rutLookup, setRutLookup] = useState('');
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);

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

  const [newDoc, setNewDoc] = useState<Partial<Document>>({
    clientId: '',
    clientName: '',
    projectId: '',
    projectType: '',
    items: [],
    netAmount: 0,
    iva: 0,
    totalAmount: 0,
    status: 'draft',
    paymentMethod: 'transfer',
    siiFolio: '',
    notes: ''
  });

  const [availableItems, setAvailableItems] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'inventory'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAvailableItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, [user]);

  const addItem = (type: 'material' | 'labor' | 'transfer' | 'other') => {
    const newItem = {
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

  const updateItem = (id: string, updates: any) => {
    setNewDoc(prev => {
      const items = (prev.items || []).map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, ...updates };
          updatedItem.total = updatedItem.quantity * updatedItem.price;
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

  useEffect(() => {
    if (rutLookup) {
      const contact = contacts.find(c => c.rutEmpresa === rutLookup || c.rutContacto === rutLookup);
      if (contact) {
        setNewDoc(prev => ({
          ...prev,
          clientId: contact.id,
          clientName: contact.company
        }));
      }
    }
  }, [rutLookup, contacts]);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingDoc) {
        await updateDoc(doc(db, 'documents', editingDoc.id), {
          clientId: newDoc.clientId || '',
          clientName: newDoc.clientName || '',
          projectId: newDoc.projectId || '',
          projectType: newDoc.projectType || '',
          items: newDoc.items || [],
          netAmount: newDoc.netAmount || 0,
          iva: newDoc.iva || 0,
          totalAmount: newDoc.totalAmount || 0,
          status: newDoc.status || 'draft',
          paymentMethod: newDoc.paymentMethod || 'transfer',
          siiFolio: newDoc.siiFolio || '',
          notes: newDoc.notes || '',
          linkedDocId: newDoc.linkedDocId || '',
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'documents'), {
          type: activeTab,
          folio: generateFolio(activeTab),
          clientId: newDoc.clientId || '',
          clientName: newDoc.clientName || '',
          projectId: newDoc.projectId || '',
          projectType: newDoc.projectType || '',
          items: newDoc.items || [],
          date: new Date().toLocaleDateString('es-ES'),
          netAmount: newDoc.netAmount || 0,
          iva: newDoc.iva || 0,
          totalAmount: newDoc.totalAmount || 0,
          status: activeTab === 'payment_status' ? 'paid' : 'draft',
          paymentMethod: newDoc.paymentMethod || 'transfer',
          siiFolio: newDoc.siiFolio || '',
          notes: newDoc.notes || '',
          linkedDocId: newDoc.linkedDocId || '',
          ownerId: user.uid,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingDoc(null);
      resetForm();
    } catch (error) {
      console.error(error);
    }
  };

  const resetForm = () => {
    setNewDoc({ 
      clientId: '', 
      clientName: '', 
      projectId: '',
      projectType: '',
      items: [],
      netAmount: 0, 
      iva: 0, 
      totalAmount: 0, 
      status: 'draft',
      notes: '',
      siiFolio: '',
      paymentMethod: 'transfer',
      linkedDocId: ''
    });
    setRutLookup('');
  };

  const startEditing = (doc: Document) => {
    setEditingDoc(doc);
    setNewDoc({ ...doc });
    setIsModalOpen(true);
  };

  const filteredDocs = documents.filter(d => 
    d.type === activeTab && 
    (d.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || d.folio.includes(searchTerm))
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Módulo de Documentos</h2>
          <p className="text-slate-500 mt-1">Gestión integral de toda la documentación mercantil de RESCOING.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus size={18} />
          Nuevo {DOCUMENT_TYPES.find(t => t.id === activeTab)?.label}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {DOCUMENT_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => setActiveTab(type.id as any)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-all relative
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
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por cliente o folio..." 
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Folio</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {filteredDocs.length > 0 ? filteredDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-mono font-bold text-primary">{doc.folio}</span>
                      {doc.siiFolio && <span className="text-[10px] text-slate-400">SII: {doc.siiFolio}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900">{doc.clientName}</td>
                  <td className="px-6 py-4 text-slate-500">{doc.date}</td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-900">${doc.totalAmount?.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                      ${doc.status === 'draft' ? 'bg-slate-100 text-slate-600' : 
                        doc.status === 'sent' ? 'bg-blue-50 text-blue-600' :
                        doc.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 
                        'bg-rose-50 text-rose-600'}
                    `}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={() => startEditing(doc)}
                        className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-400 hover:text-primary"
                        title="Editar Documento"
                       >
                        <Edit2 size={16} />
                      </button>
                       <button className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-400 hover:text-slate-600" title="Descargar PDF">
                        <Download size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No hay documentos de este tipo registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingDoc(null); }} 
        title={editingDoc ? `Editar ${DOCUMENT_TYPES.find(t => t.id === activeTab)?.label}` : `Generar ${DOCUMENT_TYPES.find(t => t.id === activeTab)?.label}`}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{editingDoc ? 'Folio Actual' : 'Folio Automático'}</span>
              <span className="text-sm font-mono font-bold text-primary">{editingDoc ? editingDoc.folio : generateFolio(activeTab)}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Estado del Documento</label>
                <select 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                  value={newDoc.status}
                  onChange={e => setNewDoc({...newDoc, status: e.target.value as any})}
                >
                  <option value="draft">Borrador</option>
                  <option value="sent">Enviado</option>
                  <option value="approved">Aprobado / Emitido</option>
                  <option value="paid">Pagado</option>
                  <option value="pending">Pendiente de Pago</option>
                  <option value="rejected">Rechazado</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo de Proyecto</label>
                <input 
                  type="text" 
                  placeholder="Ej: Instalación Eléctrica, Mantención, etc."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={newDoc.projectType}
                  onChange={e => setNewDoc({...newDoc, projectType: e.target.value})}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <User size={12} className="text-primary" />
                  RUT de Búsqueda (Empresa o Contacto)
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="76.xxx.xxx-x"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                    value={rutLookup}
                    onChange={e => setRutLookup(e.target.value)}
                  />
                  <div className="px-3 py-2 bg-slate-100 rounded-lg text-slate-400 border border-slate-200">
                    <Search size={18} />
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre del Cliente (Identificado)</label>
                <input 
                  readOnly
                  type="text" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-slate-500 text-sm font-semibold"
                  value={newDoc.clientName}
                  placeholder="Se completará al ingresar RUT..."
                />
              </div>
            </div>

            {activeTab !== 'quotation' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Calculator size={12} className="text-primary" />
                  Vincular Documento Previo (Flujo de Trabajo)
                </label>
                <select 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                  value={newDoc.linkedDocId}
                  onChange={e => {
                    const linked = documents.find(d => d.id === e.target.value);
                    if (linked) {
                      setNewDoc({
                        ...newDoc,
                        linkedDocId: linked.id,
                        clientId: linked.clientId,
                        clientName: linked.clientName,
                        projectType: linked.projectType || newDoc.projectType,
                        items: [...(linked.items || [])],
                        netAmount: linked.netAmount,
                        iva: linked.iva,
                        totalAmount: linked.totalAmount
                      });
                    } else {
                      setNewDoc({...newDoc, linkedDocId: ''});
                    }
                  }}
                >
                  <option value="">Ninguno - Ingreso Manual</option>
                  {documents.filter(d => 
                    (newDoc.clientId ? d.clientId === newDoc.clientId : true) && 
                    d.type !== activeTab
                  ).map(d => (
                    <option key={d.id} value={d.id}>{d.folio} ({DOCUMENT_TYPES.find(t => t.id === d.type)?.label}) - ${d.totalAmount.toLocaleString()}</option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-400 italic">Al vincular, se heredarán los datos y conceptos del documento anterior.</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desglose de Conceptos</h4>
                <div className="flex gap-2">
                  <button type="button" onClick={() => addItem('material')} className="px-2 py-1 bg-primary/10 text-primary rounded text-[10px] font-bold hover:bg-primary/20 flex items-center gap-1">
                    <Plus size={10} /> Material
                  </button>
                  <button type="button" onClick={() => addItem('labor')} className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-[10px] font-bold hover:bg-amber-200 flex items-center gap-1">
                    <Plus size={10} /> Mano Obra
                  </button>
                  <button type="button" onClick={() => addItem('transfer')} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] font-bold hover:bg-blue-200 flex items-center gap-1">
                    <Plus size={10} /> Traslado
                  </button>
                  <button type="button" onClick={() => addItem('other')} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-[10px] font-bold hover:bg-slate-200 flex items-center gap-1">
                    <Plus size={10} /> Otros
                  </button>
                </div>
              </div>

              <div className="space-y-2 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                {newDoc.items?.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded border border-slate-100 shadow-sm">
                    <div className="col-span-3">
                      {item.type === 'material' ? (
                        <select 
                          className="w-full text-xs p-1 border rounded"
                          value={item.refId}
                          onChange={e => {
                            const inv = availableItems.find(i => i.id === e.target.value);
                            updateItem(item.id, { 
                              refId: e.target.value, 
                              description: inv?.name || '',
                              price: inv?.netPrice || 0
                            });
                          }}
                        >
                          <option value="">Seleccionar Material...</option>
                          {availableItems.map(i => (
                            <option key={i.id} value={i.id}>{i.name} ({i.stock} {i.unit})</option>
                          ))}
                        </select>
                      ) : (
                        <input 
                          type="text" 
                          placeholder="Descripción..."
                          className="w-full text-xs p-1 border rounded"
                          value={item.description}
                          onChange={e => updateItem(item.id, { description: e.target.value })}
                        />
                      )}
                    </div>
                    <div className="col-span-2 text-center">
                      <span className={`text-[8px] font-bold px-1 rounded uppercase ${
                        item.type === 'material' ? 'bg-primary/10 text-primary' :
                        item.type === 'labor' ? 'bg-amber-100 text-amber-700' :
                        item.type === 'transfer' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {item.type}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <input 
                        type="number" 
                        placeholder="Cant."
                        className="w-full text-xs p-1 border rounded font-mono"
                        value={item.quantity}
                        onChange={e => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="col-span-2">
                      <input 
                        type="number" 
                        placeholder="Precio"
                        className="w-full text-xs p-1 border rounded font-mono"
                        value={item.price}
                        onChange={e => updateItem(item.id, { price: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="col-span-2 font-mono text-[10px] font-bold text-slate-900 text-right pr-2">
                      ${item.total.toLocaleString()}
                    </div>
                    <div className="col-span-1 text-right">
                      <button type="button" onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {(!newDoc.items || newDoc.items.length === 0) && (
                  <div className="text-center py-4 text-slate-400 text-[10px] font-bold uppercase tracking-widest italic">
                    Agregue materiales o servicios para calcular el total
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Monto Neto</label>
                <input 
                  required
                  type="number" 
                  className="w-full px-2 py-1.5 rounded border border-slate-200 focus:ring-2 focus:ring-primary/20 text-xs font-mono font-bold"
                  value={newDoc.netAmount}
                  onChange={e => handleNetAmountChange(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">IVA (19%)</label>
                <input 
                  readOnly
                  type="text" 
                  className="w-full px-2 py-1.5 rounded border border-slate-100 bg-white/50 text-xs font-mono font-bold text-slate-500"
                  value={`$${newDoc.iva?.toLocaleString()}`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-primary">Total</label>
                <input 
                  readOnly
                  type="text" 
                  className="w-full px-2 py-1.5 rounded border border-primary/20 bg-primary/5 text-xs font-mono font-bold text-primary"
                  value={`$${newDoc.totalAmount?.toLocaleString()}`}
                />
              </div>
            </div>

            {activeTab === 'invoice' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <FileCheck size={12} className="text-primary" />
                  Folio SII (Factura Real Emitida)
                </label>
                <input 
                  type="text" 
                  placeholder="Ingrese folio del portal SII para registro"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono"
                  value={newDoc.siiFolio}
                  onChange={e => setNewDoc({...newDoc, siiFolio: e.target.value})}
                />
              </div>
            )}

            {activeTab === 'payment_status' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  Medio de Pago Utilizado
                </label>
                <select 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                  value={newDoc.paymentMethod}
                  onChange={e => setNewDoc({...newDoc, paymentMethod: e.target.value as any})}
                >
                  <option value="transfer">Transferencia Electrónica</option>
                  <option value="check">Cheque Nominativo</option>
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta Débito/Crédito</option>
                </select>
              </div>
            )}
          </div>
          
          <button 
            type="submit"
            className="w-full bg-primary text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {editingDoc ? <Save size={18} /> : <Plus size={18} />}
            {editingDoc ? 'Actualizar Documento' : 'Confirmar Registro de Documento'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
