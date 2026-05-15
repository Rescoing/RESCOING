import { useState, useEffect, useRef } from 'react';
import { 
  FileText, Upload, Download, Eye, Trash2, Search, 
  Filter, Plus, File, Image as ImageIcon, FileCode,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, where, onSnapshot, addDoc, 
  updateDoc, deleteDoc, doc, serverTimestamp, 
  getDocs, limit, orderBy, runTransaction
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';
import Modal from './ui/Modal';

interface LibraryItem {
  id: string;
  name: string;
  docType: string;
  fileName: string;
  fileType: string;
  fileData: string;
  folio: number;
  ownerId: string;
  createdAt: any;
}

const DOCUMENT_TYPES = [
  'Contrato',
  'Plano',
  'Certificado',
  'Factura',
  'Guía de Despacho',
  'Informe',
  'Resolución',
  'Otro'
];

export default function LibraryView() {
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [uploading, setUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    docType: DOCUMENT_TYPES[0],
    fileName: '',
    fileType: '',
    fileData: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'library'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LibraryItem[];
      setItems(newItems);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching library:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit size for Firestore (base64 overhead means ~700KB max for 1MB total doc)
    if (file.size > 700000) {
      alert("El archivo es muy pesado para esta versión (máx 700KB).");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const base64 = loadEvent.target?.result as string;
      setFormData(prev => ({
        ...prev,
        fileName: file.name,
        fileType: file.type,
        fileData: base64,
        name: prev.name || file.name.split('.')[0]
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.fileData) return;

    setUploading(true);
    try {
      // Get next folio within a transaction to ensure no duplicates
      const counterId = `${user.uid}_${formData.docType.toLowerCase().replace(/\s+/g, '_')}`;
      const counterRef = doc(db, 'folioCounters', counterId);

      let nextFolio = 1;

      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        if (counterDoc.exists()) {
          nextFolio = counterDoc.data().lastFolio + 1;
          transaction.update(counterRef, { lastFolio: nextFolio });
        } else {
          transaction.set(counterRef, {
            ownerId: user.uid,
            docType: formData.docType,
            lastFolio: 1
          });
        }

        const newDocRef = doc(collection(db, 'library'));
        transaction.set(newDocRef, {
          ...formData,
          folio: nextFolio,
          ownerId: user.uid,
          createdAt: serverTimestamp()
        });
      });

      setIsModalOpen(false);
      setFormData({
        name: '',
        docType: DOCUMENT_TYPES[0],
        fileName: '',
        fileType: '',
        fileData: ''
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error al subir el archivo.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, fileName: string) => {
    if (window.confirm(`¿Seguro que deseas eliminar "${fileName}"?`)) {
      try {
        await deleteDoc(doc(db, 'library', id));
      } catch (error) {
        console.error("Error deleting file:", error);
      }
    }
  };

  const handleDownload = (item: LibraryItem) => {
    const link = document.createElement('a');
    link.href = item.fileData;
    link.download = item.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'All' || item.docType === filterType;
    return matchesSearch && matchesType;
  });

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <ImageIcon size={20} className="text-blue-500" />;
    if (fileType.includes('pdf')) return <FileText size={20} className="text-rose-500" />;
    if (fileType.includes('csv') || fileType.includes('sheet')) return <FileText size={20} className="text-emerald-500" />;
    return <File size={20} className="text-slate-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Biblioteca Digital</h2>
          <p className="text-slate-500">Gestión de documentos, planos y archivos corporativos</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-all font-medium shadow-sm w-fit"
        >
          <Upload size={20} />
          <span>Subir Archivo</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre o archivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={18} />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all outline-none"
          >
            <option value="All">Todos los Tipos</option>
            {DOCUMENT_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <AnimatePresence>
          {filteredItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
            >
              <div className="h-32 bg-slate-50 flex items-center justify-center border-b border-slate-100 relative group">
                {item.fileType.includes('image') ? (
                  <img 
                    src={item.fileData} 
                    alt={item.name} 
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <div className="text-slate-300">
                    {getFileIcon(item.fileType)}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button 
                    onClick={() => setPreviewItem(item)}
                    className="p-2 bg-white rounded-full hover:bg-slate-100 transition-colors"
                  >
                    <Eye size={18} className="text-slate-700" />
                  </button>
                  <button 
                    onClick={() => handleDownload(item)}
                    className="p-2 bg-white rounded-full hover:bg-slate-100 transition-colors"
                  >
                    <Download size={18} className="text-slate-700" />
                  </button>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate" title={item.name}>{item.name}</h3>
                    <p className="text-xs text-slate-500 truncate">{item.fileName}</p>
                  </div>
                  <div className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded">
                    #{item.folio.toString().padStart(4, '0')}
                  </div>
                </div>
                
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                    {item.docType}
                  </span>
                  <button 
                    onClick={() => handleDelete(item.id, item.fileName)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredItems.length === 0 && !loading && (
        <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <File size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900">No hay archivos en la biblioteca</h3>
          <p className="text-slate-500">Sube tus primeros documentos para comenzar</p>
        </div>
      )}

      {/* Upload Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !uploading && setIsModalOpen(false)} 
        title="Subir a la Biblioteca"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nombre descriptivo
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="Ej: Contrato de Arriendo 2024"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tipo de Documento
            </label>
            <select
              value={formData.docType}
              onChange={(e) => setFormData(prev => ({ ...prev, docType: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              {DOCUMENT_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Archivo (Máx 700KB)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors bg-slate-50"
            >
              <div className="space-y-1 text-center">
                {formData.fileName ? (
                  <div className="flex flex-col items-center">
                    {getFileIcon(formData.fileType)}
                    <p className="text-sm text-slate-700 font-medium mt-2">{formData.fileName}</p>
                    <p className="text-xs text-slate-500">Haga clic para cambiar</p>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-12 w-12 text-slate-400" />
                    <div className="flex text-sm text-slate-600">
                      <span>Subir un archivo</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Documentos, Imágenes, PDFs
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={uploading}
              className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={uploading || !formData.fileData}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {uploading ? 'Subiendo...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.name || 'Vista Previa'}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">{previewItem?.fileName}</p>
              <p className="text-xs text-slate-500">{previewItem?.docType} • Folio #{previewItem?.folio.toString().padStart(4, '0')}</p>
            </div>
            <button
              onClick={() => previewItem && handleDownload(previewItem)}
              className="flex items-center gap-2 text-primary hover:underline text-sm font-medium"
            >
              <Download size={16} />
              Descargar
            </button>
          </div>
          
          <div className="bg-slate-100 rounded-lg min-h-[300px] flex items-center justify-center overflow-auto max-h-[70vh]">
            {previewItem?.fileType.includes('image') ? (
              <img src={previewItem.fileData} alt={previewItem.name} className="max-w-full" />
            ) : previewItem?.fileType.includes('pdf') ? (
              <iframe src={previewItem.fileData} className="w-full h-[500px]" />
            ) : (
              <div className="text-center p-8">
                <AlertCircle size={48} className="mx-auto text-slate-400 mb-4" />
                <p className="text-slate-600">Este tipo de archivo no admite vista previa directa.</p>
                <p className="text-slate-500 text-sm mt-2">Por favor descárguelo para visualizarlo.</p>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
