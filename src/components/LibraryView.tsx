import { useState, useEffect, useRef } from 'react';
import { 
  FileText, Upload, Download, Eye, Trash2, Search, 
  Filter, Plus, File, Image as ImageIcon, FileCode,
  AlertCircle, CheckSquare, Square
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploadQueue, setUploadQueue] = useState<{file: File, status: 'pending' | 'uploading' | 'complete' | 'error', progress: number}[]>([]);

  const [formData, setFormData] = useState({
    docType: DOCUMENT_TYPES[0],
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
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files).map(file => ({
      file,
      status: 'pending' as const,
      progress: 0
    }));

    setUploadQueue(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processUpload = async () => {
    if (!user || uploadQueue.length === 0 || uploading) return;

    setUploading(true);
    const queue = [...uploadQueue];

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== 'pending') continue;

      const currentFile = queue[i].file;
      queue[i].status = 'uploading';
      queue[i].progress = 10;
      setUploadQueue([...queue]);

      try {
        if (currentFile.size > 700000) {
          throw new Error("Archivo muy pesado (máx 700KB)");
        }

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(currentFile);
        });

        queue[i].progress = 50;
        setUploadQueue([...queue]);

        const counterId = `${user.uid}_${formData.docType.toLowerCase().replace(/\s+/g, '_')}`;
        const counterRef = doc(db, 'folioCounters', counterId);

        await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let nextFolio = 1;
          
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
            name: currentFile.name.split('.')[0],
            docType: formData.docType,
            fileName: currentFile.name,
            fileType: currentFile.type,
            fileData: base64,
            folio: nextFolio,
            ownerId: user.uid,
            createdAt: serverTimestamp()
          });
        });

        queue[i].status = 'complete';
        queue[i].progress = 100;
        setUploadQueue([...queue]);
      } catch (error) {
        console.error("Error processing file:", error);
        queue[i].status = 'error';
        setUploadQueue([...queue]);
      }
    }

    setUploading(false);
    if (queue.every(q => q.status === 'complete')) {
      setTimeout(() => {
        setIsModalOpen(false);
        setUploadQueue([]);
      }, 1500);
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

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`¿Seguro que deseas eliminar ${selectedIds.length} archivos?`)) {
      try {
        for (const id of selectedIds) {
          await deleteDoc(doc(db, 'library', id));
        }
        setSelectedIds([]);
      } catch (error) {
        console.error("Error in bulk delete:", error);
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(i => i.id));
    }
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
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 bg-rose-50 text-rose-600 px-4 py-2 rounded-lg hover:bg-rose-100 transition-all font-medium border border-rose-200 shadow-sm"
            >
              <Trash2 size={20} />
              <span>Eliminar ({selectedIds.length})</span>
            </button>
          )}
          <button
            onClick={() => {
              setUploadQueue([]);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-all font-medium shadow-sm w-fit"
          >
            <Upload size={20} />
            <span>Subir Archivo</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-2 px-2 shrink-0">
          <button 
            onClick={toggleSelectAll}
            className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-500"
            title="Seleccionar Todo"
          >
            {selectedIds.length > 0 && selectedIds.length === filteredItems.length ? (
              <CheckSquare size={20} className="text-primary" />
            ) : (
              <Square size={20} />
            )}
          </button>
        </div>
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
              className={`bg-white rounded-xl border transition-all overflow-hidden flex flex-col ${selectedIds.includes(item.id) ? 'border-primary ring-2 ring-primary/10' : 'border-slate-200 shadow-sm hover:shadow-md'}`}
            >
              <div className="h-32 bg-slate-50 flex items-center justify-center border-b border-slate-100 relative group">
                <button 
                  onClick={() => toggleSelect(item.id)}
                  className="absolute top-2 left-2 z-10 p-1 bg-white/90 rounded border border-slate-200 shadow-sm"
                >
                  {selectedIds.includes(item.id) ? (
                    <CheckSquare size={16} className="text-primary" />
                  ) : (
                    <Square size={16} className="text-slate-400" />
                  )}
                </button>
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
                    onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}
                    className="p-2 bg-white rounded-full hover:bg-slate-100 transition-colors"
                  >
                    <Eye size={18} className="text-slate-700" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                    className="p-2 bg-white rounded-full hover:bg-slate-100 transition-colors"
                  >
                    <Download size={18} className="text-slate-700" />
                  </button>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col" onClick={() => toggleSelect(item.id)}>
                <div className="flex items-start justify-between gap-2 cursor-pointer">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate" title={item.name}>{item.name}</h3>
                    <p className="text-xs text-slate-500 truncate">{item.fileName}</p>
                  </div>
                  <div className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                    #{item.folio.toString().padStart(4, '0')}
                  </div>
                </div>
                
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                    {item.docType}
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.fileName); }}
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

      {/* Bulk Upload Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !uploading && setIsModalOpen(false)} 
        title="Subir a la Biblioteca"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tipo de Documento para el lote
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
              Archivos (Máx 700KB por archivo)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors bg-slate-50"
            >
              <div className="space-y-1 text-center">
                <Upload className="mx-auto h-12 w-12 text-slate-400" />
                <div className="flex text-sm text-slate-600 justify-center">
                  <span className="font-medium text-primary">Seleccionar archivos</span>
                </div>
                <p className="text-xs text-slate-500">
                  Soporta selección de múltiples archivos simultáneamente
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {uploadQueue.length > 0 && (
            <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
              {uploadQueue.map((q, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3 bg-white">
                  <div className="flex items-center gap-3 min-w-0">
                    {getFileIcon(q.file.type)}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{q.file.name}</p>
                      <p className="text-[10px] text-slate-500">{(q.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {q.status === 'uploading' && (
                      <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-300" 
                          style={{ width: `${q.progress}%` }}
                        />
                      </div>
                    )}
                    {q.status === 'complete' && <span className="text-[10px] text-emerald-600 font-bold">✓</span>}
                    {q.status === 'error' && <span className="text-[10px] text-rose-600 font-bold">Error</span>}
                    {q.status === 'pending' && !uploading && (
                      <button 
                        onClick={() => setUploadQueue(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

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
              type="button"
              onClick={processUpload}
              disabled={uploading || uploadQueue.length === 0 || uploadQueue.every(q => q.status === 'complete')}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {uploading ? 'Subiendo...' : 'Subir Lote'}
            </button>
          </div>
        </div>
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
