import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileText, Upload, Download, Eye, Trash2, Search, 
  Filter, Plus, File, Image as ImageIcon, FileCode,
  AlertCircle, CheckSquare, Square, Folder, FolderPlus, 
  ChevronRight, ChevronDown, ArrowRight, CornerDownRight, HelpCircle, 
  CloudLightning, RotateCw, ZoomIn, ZoomOut, Check, Info, FolderOpen,
  Tag, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, where, onSnapshot, addDoc, 
  updateDoc, deleteDoc, doc, serverTimestamp, 
  runTransaction
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';
import Modal from './ui/Modal';
import { DocumentPreviewViewer } from './DocumentPreviewSystem';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { compressFileGzip, compressImageUsingCanvas, decompressFileGzip } from '../lib/compression';

interface LibraryItem {
  id: string;
  name: string;
  docType: string;
  fileName: string;
  fileType: string;
  fileData: string;
  isCompressed?: boolean;
  folio: number;
  ownerId: string;
  createdAt: any;
  isFolder?: boolean;
  folderId?: string | null;
  uploadedBy?: string;
  uploaderEmail?: string;
  tags?: string[];
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

const PRESET_TAGS = [
  'Proyecto Centenario',
  'Proyecto Mirador',
  'Proyecto Vespucio',
  'Estructural',
  'Eléctrico',
  'Sanitario',
  'Cálculo',
  'Presupuesto',
  'As-Built',
  'Aprobado',
  'Borrador',
  'Legal'
];

export default function LibraryView() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersMap, setUsersMap] = useState<Record<string, { displayName: string; email: string }>>({});

  useEffect(() => {
    if (!user) return;
    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const uMap: Record<string, { displayName: string; email: string }> = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        uMap[docSnap.id] = {
          displayName: data.displayName || '',
          email: data.email || ''
        };
      });
      setUsersMap(uMap);
    }, (error) => {
      console.error("Error fetching users for uploader mapping:", error);
    });
    return () => unsubscribeUsers();
  }, [user]);

  const getUploaderInfo = (item: LibraryItem) => {
    if (item.uploadedBy) {
      return item.uploadedBy;
    }
    const mappedUser = usersMap[item.ownerId];
    if (mappedUser) {
      return mappedUser.displayName || mappedUser.email;
    }
    return item.ownerId === user?.uid 
      ? (profile?.displayName || user?.displayName || user?.email || 'Tú') 
      : 'Administrador';
  };
  
  // Modals status
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  
  // Tagging system states
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [itemToTag, setItemToTag] = useState<LibraryItem | null>(null);
  const [currentEditingTags, setCurrentEditingTags] = useState<string[]>([]);
  const [newCustomTag, setNewCustomTag] = useState('');
  const [selectedUploadTags, setSelectedUploadTags] = useState<string[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [uploading, setUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploadQueue, setUploadQueue] = useState<{
    file: File;
    status: 'pending' | 'uploading' | 'complete' | 'error';
    progress: number;
    errorMsg?: string;
  }[]>([]);
  
  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderSearchTerm, setFolderSearchTerm] = useState('');
  
  const toggleExpand = (id: string) => {
    setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };
  
  // Move item variables
  const [itemToMove, setItemToMove] = useState<LibraryItem | null>(null);

  const [formData, setFormData] = useState({
    docType: DOCUMENT_TYPES[0],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'library')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LibraryItem[];
      
      // Sort items: oldest to newest or newest to oldest, keeping consistent
      newItems.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      
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
        let base64 = '';
        let isCompressed = false;

        if (currentFile.size > 700000) {
          queue[i].progress = 15;
          setUploadQueue([...queue]);
          
          if (currentFile.type.startsWith('image/') && !currentFile.type.includes('gif') && !currentFile.type.includes('svg')) {
            try {
              const res = await compressImageUsingCanvas(currentFile);
              base64 = res.base64;
              isCompressed = false; // Canvas output is normal image base64, no decompression needed
            } catch (err) {
              console.warn("Canvas image compression failed, falling back to gzip", err);
              const res = await compressFileGzip(currentFile);
              base64 = res.base64;
              isCompressed = true;
            }
          } else {
            const res = await compressFileGzip(currentFile);
            base64 = res.base64;
            isCompressed = true;
          }
        } else {
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(currentFile);
          });
        }

        queue[i].progress = 50;
        setUploadQueue([...queue]);

        const normalizedDocType = formData.docType
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9_-]/g, "_");
        const counterId = `${user.uid}_${normalizedDocType}`;
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
            fileType: currentFile.type || getFileTypeByName(currentFile.name),
            fileData: base64,
            isCompressed: isCompressed,
            folio: nextFolio,
            ownerId: user.uid,
            uploadedBy: profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Administrador',
            uploaderEmail: user.email || '',
            isFolder: false,
            folderId: currentFolderId, // save at current folder level
            createdAt: serverTimestamp(),
            tags: selectedUploadTags
          });
        });

        queue[i].status = 'complete';
        queue[i].progress = 100;
        setUploadQueue([...queue]);
      } catch (error: any) {
        console.error("Error processing file:", error);
        queue[i].status = 'error';
        queue[i].errorMsg = error instanceof Error ? error.message : String(error);
        setUploadQueue([...queue]);
        
        if (error && (error?.code === 'permission-denied' || error?.message?.includes('permission'))) {
          try {
            handleFirestoreError(error, OperationType.WRITE, `library_${currentFile.name}`);
          } catch (e) {
            console.error("Intercepted permissions error:", e);
          }
        }
      }
    }

    setUploading(false);
    if (queue.every(q => q.status === 'complete')) {
      setTimeout(() => {
        setIsModalOpen(false);
        setUploadQueue([]);
        setSelectedUploadTags([]);
      }, 1000);
    }
  };

  const getFileTypeByName = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '')) return 'image/' + ext;
    if (['xlsx', 'xls'].includes(ext || '')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === 'csv') return 'text/csv';
    if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === 'doc') return 'application/msword';
    return 'text/plain';
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newFolderName.trim()) return;

    try {
      await addDoc(collection(db, 'library'), {
        name: newFolderName.trim(),
        docType: 'Carpeta',
        fileName: 'folder',
        fileType: 'folder',
        fileData: '',
        folio: 0,
        isFolder: true,
        folderId: currentFolderId, // supports nested folders
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });
      setNewFolderName('');
      setIsFolderModalOpen(false);
    } catch (e) {
      console.error("Error creating folder:", e);
    }
  };

  const handleMoveItem = async (targetFolderId: string | null) => {
    if (!itemToMove) return;
    try {
      await updateDoc(doc(db, 'library', itemToMove.id), {
        folderId: targetFolderId
      });
      setIsMoveModalOpen(false);
      setItemToMove(null);
    } catch (e) {
      console.error("Error moving item:", e);
    }
  };

  const handleDelete = async (id: string, name: string, isFolder?: boolean) => {
    const typeLabel = isFolder ? 'la carpeta y TODO su contenido' : `el archivo "${name}"`;
    if (window.confirm(`¿Seguro que deseas eliminar ${typeLabel}?`)) {
      try {
        if (isFolder) {
          // Deleting folder recursively
          await recursiveDeleteFolder(id);
        } else {
          await deleteDoc(doc(db, 'library', id));
        }
      } catch (error) {
        console.error("Error deleting item:", error);
      }
    }
  };

  const recursiveDeleteFolder = async (folderId: string) => {
    // Delete folder itself
    await deleteDoc(doc(db, 'library', folderId));
    
    // Find nested children files and folders
    const children = items.filter(item => item.folderId === folderId);
    for (const child of children) {
      if (child.isFolder) {
        await recursiveDeleteFolder(child.id);
      } else {
        await deleteDoc(doc(db, 'library', child.id));
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`¿Seguro que deseas eliminar los ${selectedIds.length} elementos seleccionados? (Eliminar carpetas borrará su contenido recursivamente)`)) {
      try {
        for (const id of selectedIds) {
          const item = items.find(i => i.id === id);
          if (item) {
            if (item.isFolder) {
              await recursiveDeleteFolder(item.id);
            } else {
              await deleteDoc(doc(db, 'library', id));
            }
          }
        }
        setSelectedIds([]);
      } catch (error) {
        console.error("Error in bulk delete:", error);
      }
    }
  };

   const handleDownload = async (item: LibraryItem) => {
    if (item.isFolder) return;
    let dataUrl = item.fileData;
    if (item.isCompressed) {
      try {
        dataUrl = await decompressFileGzip(item.fileData, item.fileType);
      } catch (err) {
        console.error("Error decompressing file for download:", err);
      }
    }
    const link = document.createElement('a');
    link.href = dataUrl;
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

  const handleSaveTags = async () => {
    if (!itemToTag) return;
    try {
      await updateDoc(doc(db, 'library', itemToTag.id), {
        tags: currentEditingTags
      });
      setIsTagModalOpen(false);
      setItemToTag(null);
    } catch (error) {
      console.error("Error saving tags:", error);
      alert("Error al actualizar las etiquetas. Por favor, reintenta.");
    }
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTag = newCustomTag.trim();
    if (!cleanTag) return;
    if (!currentEditingTags.includes(cleanTag)) {
      setCurrentEditingTags(prev => [...prev, cleanTag]);
    }
    setNewCustomTag('');
  };

  const tagsWithCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      if (!item.isFolder && item.tags && Array.isArray(item.tags)) {
        item.tags.forEach(t => {
          const clean = t.trim();
          if (clean) {
            counts[clean] = (counts[clean] || 0) + 1;
          }
        });
      }
    });
    return counts;
  }, [items]);

  const toggleSelectAll = () => {
    if (selectedIds.length === displayedFilesAndFolders.length && displayedFilesAndFolders.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayedFilesAndFolders.map(i => i.id));
    }
  };

  // Traverses parents to construct breadcrumb navigation
  const getFolderPath = (folderId: string | null): LibraryItem[] => {
    const path: LibraryItem[] = [];
    let currentId = folderId;
    while (currentId) {
      const folder = items.find(item => item.id === currentId && item.isFolder);
      if (folder) {
        path.unshift(folder);
        currentId = folder.folderId || null;
      } else {
        break;
      }
    }
    return path;
  };

  const breadcrumbs = getFolderPath(currentFolderId);

  // Filter list by current directory level
  const displayedFilesAndFolders = items.filter(item => {
    // Check if item is in the current folder scope
    const matchesFolder = item.folderId === currentFolderId;
    
    // Tag filter: item must have ALL selected filter tags
    const matchesTags = selectedFilterTags.length === 0 || 
                        (!item.isFolder && item.tags && selectedFilterTags.every(t => item.tags?.includes(t)));
    
    // Search terms (if searching, bypass folder scopes to find matches globally)
    if (searchTerm) {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            item.fileName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'All' || item.docType === filterType;
      return matchesSearch && matchesType && matchesTags;
    }
    
    const matchesType = filterType === 'All' || item.docType === filterType || item.isFolder;
    return matchesFolder && matchesType && matchesTags;
  });

  // Split into Folders first, then Files
  const displayedFolders = displayedFilesAndFolders.filter(item => item.isFolder);
  const displayedFiles = displayedFilesAndFolders.filter(item => !item.isFolder);

  const getFileIcon = (fileType: string, fileName: string = '') => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (fileType.includes('folder')) return <Folder size={24} className="text-amber-500 fill-amber-300" />;
    if (fileType.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return <ImageIcon size={22} className="text-blue-500" />;
    if (fileType.includes('pdf') || ext === 'pdf') return <FileText size={22} className="text-rose-500" />;
    if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv') || ['xlsx', 'xls', 'csv'].includes(ext)) {
      return <FileText size={22} className="text-emerald-500" />;
    }
    if (fileType.includes('word') || fileType.includes('officedocument.wordprocessingml') || fileType.includes('msword') || ['docx', 'doc'].includes(ext)) {
      return <FileText size={22} className="text-blue-600 font-bold" />;
    }
    return <File size={22} className="text-slate-500" />;
  };

  // Get only folders that are not the active moving item itself (to prevent cyclic move)
  const getAvailableMoveDestinationFolders = (currentItem: LibraryItem | null) => {
    if (!currentItem) return [];
    // Can move to any folder except itself or children folders
    const isChildOf = (folderId: string, potentialParentId: string): boolean => {
      let current = items.find(i => i.id === folderId);
      while (current) {
        if (current.folderId === potentialParentId) return true;
        current = items.find(i => i.id === current.folderId);
      }
      return false;
    };
    
    return items.filter(item => 
      item.isFolder && 
      item.id !== currentItem.id && 
      !isChildOf(item.id, currentItem.id)
    );
  };

  const allFolders = items.filter(item => item.isFolder);
  const rootFolders = allFolders.filter(item => item.folderId === null);

  const filteredRootFolders = rootFolders.filter(f => {
    if (!folderSearchTerm) return true;
    const matchesSelf = f.name.toLowerCase().includes(folderSearchTerm.toLowerCase());
    const hasMatchingDescendant = (folderId: string): boolean => {
      const children = allFolders.filter(c => c.folderId === folderId);
      return children.some(c => c.name.toLowerCase().includes(folderSearchTerm.toLowerCase()) || hasMatchingDescendant(c.id));
    };
    return matchesSelf || hasMatchingDescendant(f.id);
  });

  return (
    <div className="space-y-6">
      {/* Upper header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Biblioteca Corporativa</h2>
          <p className="text-sm font-medium text-slate-500">Gestión de carpetas jerárquicas, contratos, planos y lectura de planillas online</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Cloud Connection Button */}
          <button
            onClick={() => setIsCloudModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-xl hover:from-blue-100 hover:to-indigo-100 transition-all font-bold shadow-sm cursor-pointer"
          >
            <CloudLightning size={18} />
            <span>Enlazar Drive / OneDrive</span>
          </button>

          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 bg-rose-50 text-rose-600 px-4 py-2 rounded-xl hover:bg-rose-100 transition-all font-bold border border-rose-200 shadow-sm cursor-pointer"
            >
              <Trash2 size={18} />
              <span>Eliminar Selección ({selectedIds.length})</span>
            </button>
          )}

          <button
            onClick={() => setIsFolderModalOpen(true)}
            className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-3.5 py-2 rounded-xl hover:bg-slate-50 transition-all font-bold shadow-sm cursor-pointer hover:border-amber-400"
          >
            <FolderPlus size={18} className="text-amber-500" />
            <span>Nueva Carpeta</span>
          </button>

          <button
            onClick={() => {
              setUploadQueue([]);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary/95 transition-all font-bold shadow-md shadow-primary/10 cursor-pointer"
          >
            <Upload size={18} />
            <span>Subir Archivo</span>
          </button>
        </div>
      </div>

      {/* Breadcrumbs Trails */}
      <div className="bg-slate-100/80 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-1 text-xs">
        <button 
          onClick={() => { setCurrentFolderId(null); setSearchTerm(''); }}
          className="flex items-center gap-1.5 text-slate-500 hover:text-primary transition-colors font-bold cursor-pointer"
        >
          <FolderOpen size={16} className="text-slate-400 shrink-0" />
          <span>Biblioteca Raíz</span>
        </button>
        
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.id}>
            <ChevronRight size={14} className="text-slate-400 mx-1 shrink-0" />
            <button
              onClick={() => { setCurrentFolderId(crumb.id); setSearchTerm(''); }}
              className={`hover:text-primary transition-colors font-bold cursor-pointer ${index === breadcrumbs.length - 1 ? 'text-slate-900 border-b border-slate-300 pb-0.5' : 'text-slate-500'}`}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}

        {searchTerm && (
          <>
            <ChevronRight size={14} className="text-slate-400 mx-1 shrink-0" />
            <span className="text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-lg">Búsqueda: "{searchTerm}"</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left pane: Tree view and Tags Filters */}
        <div className="lg:col-span-3 space-y-5">
          {/* Tree View Card */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-150 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Folder size={14} className="text-slate-400" />
                <span>Jerarquía de Carpetas</span>
              </h3>
            </div>
            
            <button
              onClick={() => setIsFolderModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-100 py-2.5 px-3 rounded-xl transition-all text-xs font-bold shadow-sm cursor-pointer"
            >
              <FolderPlus size={15} className="text-amber-500" />
              <span>Nueva subcarpeta aquí</span>
            </button>
            
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input 
                type="text"
                placeholder="Filtrar carpetas..."
                value={folderSearchTerm}
                onChange={(e) => setFolderSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all outline-none"
              />
            </div>

            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pt-1">
              <div 
                onClick={() => { setCurrentFolderId(null); setSearchTerm(''); }}
                className={`flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-black cursor-pointer transition-all ${currentFolderId === null ? 'bg-primary/10 text-primary' : 'text-slate-800 hover:bg-slate-50'}`}
              >
                <FolderOpen size={16} className={currentFolderId === null ? 'text-primary' : 'text-slate-400'} />
                <span>Biblioteca Raíz (/)</span>
                <span className="ml-auto bg-slate-100 text-slate-550 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold">
                  {items.filter(i => i.folderId === null).length}
                </span>
              </div>

              <div className="mt-2 border-l border-slate-100 pl-1 ml-2.5 space-y-1">
                {filteredRootFolders.map(folder => (
                  <FolderTreeNode
                    key={folder.id}
                    folder={folder}
                    depth={0}
                    allFolders={allFolders}
                    currentFolderId={currentFolderId}
                    setCurrentFolderId={(id: string | null) => { setCurrentFolderId(id); setSearchTerm(''); }}
                    expandedFolders={expandedFolders}
                    toggleExpand={toggleExpand}
                    items={items}
                  />
                ))}
                {allFolders.length > 0 && filteredRootFolders.length === 0 && folderSearchTerm && (
                  <p className="text-[10px] text-slate-400 italic text-center py-4">Ningún directorio coincide</p>
                )}
              </div>
            </div>
          </div>

          {/* Tags / Projects Filter sidebar card */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-150 space-y-3.5">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Tag size={13} className="text-indigo-500" />
                <span>Proyectos y Etiquetas</span>
              </h3>
              {selectedFilterTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFilterTags([])}
                  className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer"
                >
                  Limpiar ({selectedFilterTags.length})
                </button>
              )}
            </div>

            {Object.keys(tagsWithCounts).length === 0 ? (
              <p className="text-[11px] text-slate-400 italic leading-relaxed py-1 text-center">
                Ninguna etiqueta asignada aún. Haz clic en <strong>Etiquetar</strong> para clasificar archivos.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-medium">Clasificación de archivos:</p>
                <div className="flex flex-col gap-1.5 pt-1">
                  {Object.entries(tagsWithCounts).map(([tag, count]) => {
                    const isSelected = selectedFilterTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setSelectedFilterTags(prev => 
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                          );
                        }}
                        className={`flex items-center justify-between w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white font-bold shadow-sm shadow-indigo-150 hover:bg-indigo-700'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Tag size={12} className={isSelected ? 'text-white' : 'text-slate-400'} />
                          <span className="truncate">{tag}</span>
                        </div>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-indigo-700 text-indigo-100 font-bold' : 'bg-slate-200 text-slate-650 font-bold'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Filters & Files Grid */}
        <div className="lg:col-span-9 space-y-6">
          {/* Filters & Search */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-150 flex flex-col md:flex-row items-center gap-4">
            <div className="flex items-center gap-2 px-1 shrink-0">
              <button 
                onClick={toggleSelectAll}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Seleccionar todo en este nivel"
              >
                {selectedIds.length > 0 && selectedIds.length === displayedFilesAndFolders.length ? (
                  <CheckSquare size={20} className="text-primary" />
                ) : (
                  <Square size={20} />
                )}
              </button>
            </div>
            
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar documentos o archivos en este nivel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all text-sm block"
              />
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Filter className="text-slate-400 shrink-0" size={18} />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full md:w-auto border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all outline-none"
              >
                <option value="All">Todos los Documentos</option>
                {DOCUMENT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Elements Grid (Folders and Files combined) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {displayedFilesAndFolders.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col ${selectedIds.includes(item.id) ? 'border-primary ring-2 ring-primary/10' : 'border-slate-150 shadow-sm hover:shadow-md'}`}
                >
                  {/* Card visual stage */}
                  <div 
                    onClick={item.isFolder ? () => setCurrentFolderId(item.id) : () => setPreviewItem(item)}
                    className="h-32 bg-slate-50 flex items-center justify-center border-b border-slate-100 relative group cursor-pointer"
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(item.id);
                      }}
                      className="absolute top-3 left-3 z-10 p-1.5 bg-white rounded-lg border border-slate-100 shadow-sm cursor-pointer"
                    >
                      {selectedIds.includes(item.id) ? (
                        <CheckSquare size={16} className="text-primary" />
                      ) : (
                        <Square size={16} className="text-slate-400" />
                      )}
                    </button>
                    
                    {item.isFolder ? (
                      <div className="flex flex-col items-center justify-center gap-2 mt-4">
                        <Folder size={48} className="text-amber-400 fill-amber-200/85 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carpeta</span>
                      </div>
                    ) : item.fileType.includes('image') ? (
                      <img 
                        src={item.fileData} 
                        alt={item.name} 
                        className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-slate-400 flex flex-col items-center justify-center gap-1.5 mt-4">
                        {getFileIcon(item.fileType, item.fileName)}
                        <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 mt-1">
                          {item.fileName.split('.').pop()}
                        </span>
                      </div>
                    )}
                    
                    {/* Visual quick overlays */}
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                      {item.isFolder ? (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentFolderId(item.id);
                          }}
                          className="p-2 bg-white rounded-xl hover:bg-slate-50 transition-colors shadow-lg font-bold text-xs flex items-center gap-1.5 text-slate-800 cursor-pointer"
                        >
                          <FolderOpen size={16} className="text-amber-500" />
                          <span>Abrir</span>
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewItem(item);
                            }}
                            className="p-2 bg-white rounded-xl hover:bg-slate-50 transition-colors shadow-lg font-bold text-xs flex items-center gap-1.5 text-slate-800 cursor-pointer"
                          >
                            <Eye size={16} className="text-slate-600" />
                            <span>Ver Online</span>
                          </button>
                          
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(item);
                            }}
                            className="p-2 bg-white rounded-xl hover:bg-slate-50 transition-colors shadow-lg text-slate-800 cursor-pointer"
                            title="Descargar"
                          >
                            <Download size={16} />
                          </button>
                        </>
                      )}

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemToMove(item);
                          setIsMoveModalOpen(true);
                        }}
                        className="p-2 bg-white rounded-xl hover:bg-slate-100 text-indigo-600 font-bold transition-colors shadow-lg cursor-pointer"
                        title="Mover de carpeta"
                      >
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Card info block */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 
                            onClick={item.isFolder ? () => setCurrentFolderId(item.id) : () => setPreviewItem(item)}
                            className="font-black text-slate-800 leading-snug truncate cursor-pointer hover:text-primary transition-colors hover:underline"
                            title={item.name}
                          >
                            {item.name}
                          </h3>
                          <p className="text-xs text-slate-450 mt-0.5 truncate">{item.isFolder ? 'Directorio de archivos' : item.fileName}</p>
                          
                          {/* Rich Uploader Badge with initial avatar */}
                          {!item.isFolder && (
                            <div className="mt-2.5 flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100 max-w-fit">
                              <div className="w-4.5 h-4.5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-black text-slate-600 shrink-0">
                                {getUploaderInfo(item).charAt(0).toUpperCase()}
                              </div>
                              <span className="text-[10px] text-slate-500 font-bold truncate max-w-[140px]" title={getUploaderInfo(item)}>
                                {getUploaderInfo(item)}
                              </span>
                            </div>
                          )}

                          {/* Rich Tags Rendering */}
                          {!item.isFolder && item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {item.tags.map((tag) => (
                                <span 
                                  key={tag} 
                                  className="text-[9px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md flex items-center gap-1 max-w-[150px] truncate"
                                  title={tag}
                                >
                                  <Tag size={8} className="shrink-0 text-indigo-500" />
                                  <span className="truncate">{tag}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {item.folio > 0 && (
                          <div className="bg-primary/10 text-primary text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 font-mono">
                            #{item.folio.toString().padStart(4, '0')}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${item.isFolder ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-100 text-slate-600'}`}>
                          {item.docType}
                        </span>
                        
                        {!item.isFolder && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToTag(item);
                              setCurrentEditingTags(item.tags || []);
                              setIsTagModalOpen(true);
                            }}
                            className="p-1 px-1.5 hover:bg-slate-100 text-slate-500 hover:text-primary transition-all rounded-lg border border-slate-150 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                            title="Gestionar etiquetas"
                          >
                            <Tag size={10} className="text-slate-400" />
                            <span>Etiquetar</span>
                          </button>
                        )}
                      </div>
                      
                      <button 
                        onClick={() => handleDelete(item.id, item.name, item.isFolder)}
                        className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-slate-50 transition-colors rounded-lg cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {displayedFilesAndFolders.length === 0 && !loading && (
            <div className="text-center py-24 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <Folder size={48} className="mx-auto text-slate-300 mb-4 animate-bounce" />
              <h3 className="text-base font-black text-slate-900">No hay elementos en este directorio</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">Sube archivos o genera nuevas carpetas directamente aquí dentro para organizarlos jerárquicamente.</p>
            </div>
          )}
        </div>
      </div>

      {/* Folders Create Modal */}
      <Modal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title={currentFolderId ? "Crear Nueva Subcarpeta" : "Crear Nueva Carpeta Independiente"}
      >
        <form onSubmit={handleCreateFolder} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre de la Carpeta</label>
            <input 
              required
              autoFocus
              type="text" 
              placeholder="Ej: Contratos de Proveedores, Planos de Obra..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/10 text-sm"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
            />
          </div>
          
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-50">
            <button
              type="button"
              onClick={() => setIsFolderModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/95 transition-all shadow-md shadow-primary/10"
            >
              Crear Carpeta
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !uploading && setIsModalOpen(false)} 
        title="Subir Archivos a la Biblioteca"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Tipo de Documento para el lote
            </label>
            <select
              value={formData.docType}
              onChange={(e) => setFormData(prev => ({ ...prev, docType: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/10"
            >
              {DOCUMENT_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Seleccionar Archivos (Archivos de más de 700KB se comprimirán automáticamente)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 flex justify-center px-6 pt-6 pb-6 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer hover:border-primary transition-colors bg-slate-50 hover:bg-slate-100/50"
            >
              <div className="space-y-2 text-center">
                <Upload className="mx-auto h-12 w-12 text-slate-400" />
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-primary">Buscar en tu dispositivo</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Soporta selección de múltiples archivos (.pdf, .xlsx, .csv, imágenes, etc.)
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
            <div className="max-h-60 overflow-y-auto border border-slate-150 rounded-xl divide-y divide-slate-100 bg-white">
              {uploadQueue.map((q, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3 bg-white">
                  <div className="flex items-center gap-3 min-w-0">
                    {getFileIcon(q.file.type, q.file.name)}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{q.file.name}</p>
                      <p className="text-[10px] text-slate-400">{(q.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {q.status === 'uploading' && (
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-300" 
                          style={{ width: `${q.progress}%` }}
                        />
                      </div>
                    )}
                    {q.status === 'complete' && <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">✓ Listo</span>}
                    {q.status === 'error' && (
                      <span 
                        className="text-xs text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full cursor-help"
                        title={q.errorMsg || "Error al subir"}
                      >
                        {q.errorMsg ? `Error: ${q.errorMsg}` : "Error"}
                      </span>
                    )}
                    {q.status === 'pending' && !uploading && (
                      <button 
                        onClick={() => setUploadQueue(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tags Selection for upload */}
          <div className="space-y-2 border-t pt-4">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Tag size={13} className="text-slate-400" />
              <span>Etiquetas de Proyecto o Tipo para el Lote</span>
            </span>
            <p className="text-[10px] text-slate-400 leading-normal">Selecciona las etiquetas correspondientes que se asociarán a cada archivo al subirse:</p>
            
            <div className="flex flex-wrap gap-1.5 pt-1 max-h-36 overflow-y-auto">
              {PRESET_TAGS.map((tag) => {
                const isSelected = selectedUploadTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setSelectedUploadTags(prev => 
                        prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                      );
                    }}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer select-none ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-705 hover:bg-slate-100'
                    }`}
                  >
                    <Tag size={10} className={isSelected ? 'text-white' : 'text-slate-450'} />
                    <span>{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-3 border-t border-slate-50">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={uploading}
              className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={processUpload}
              disabled={uploading || uploadQueue.length === 0 || uploadQueue.every(q => q.status === 'complete')}
              className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-all font-medium flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {uploading ? 'Subiendo...' : 'Subir Lote'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Move Destination Selector Modal */}
      <Modal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        title={`Organizar y Mover: ${itemToMove?.name}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Selecciona la carpeta de destino donde deseas reubicar este elemento:</p>
          
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-inner">
            {/* Raiz Option */}
            <button
              onClick={() => handleMoveItem(null)}
              className="w-full text-left p-3.5 hover:bg-slate-50 transition-colors flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer"
            >
              <FolderOpen size={16} className="text-primary shrink-0" />
              <span>[ Biblioteca Raíz (/) ]</span>
              {itemToMove?.folderId === null && <Check size={14} className="text-primary ml-auto shrink-0" />}
            </button>

            {getAvailableMoveDestinationFolders(itemToMove).length > 0 ? (
              getSortedFoldersListWithDepth(getAvailableMoveDestinationFolders(itemToMove)).map(({ folder, depth }) => (
                <button
                  key={folder.id}
                  onClick={() => handleMoveItem(folder.id)}
                  className="w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center text-xs text-slate-700 font-bold cursor-pointer"
                  style={{ paddingLeft: `${(depth + 1) * 16}px` }}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <CornerDownRight size={12} className="text-slate-350 shrink-0" />
                    <Folder size={15} className="text-amber-500 fill-amber-100 shrink-0 select-none" />
                    <span className="truncate">{folder.name}</span>
                  </div>
                  {itemToMove?.folderId === folder.id && <Check size={14} className="text-primary ml-auto shrink-0" />}
                </button>
              ))
            ) : (
              <div className="p-5 text-center text-slate-400 text-xs italic">
                No hay más carpetas jerárquicas creadas para mover.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-50">
            <button
              onClick={() => setIsMoveModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* Manage and Edit tags Interactive Modal */}
      <Modal
        isOpen={isTagModalOpen}
        onClose={() => {
          setIsTagModalOpen(false);
          setItemToTag(null);
        }}
        title={itemToTag ? `Clasificar Documento: ${itemToTag.name}` : "Clasificar Documento"}
      >
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl text-xs text-indigo-950 leading-relaxed font-semibold">
            Organiza este documento técnico asignándole proyectos o especialidades para facilitar su búsqueda y control.
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Etiquetas del Documento
            </label>
            
            {currentEditingTags.length === 0 ? (
              <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl border border-slate-100 text-center font-medium">
                Sin etiquetas asignadas. Selecciona etiquetas frecuentes de abajo o crea una a medida.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-150 rounded-xl max-h-24 overflow-y-auto">
                {currentEditingTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-bold bg-indigo-55 bg-indigo-50 text-indigo-700 border border-indigo-150 px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                  >
                    <Tag size={9} className="text-indigo-500 shrink-0" />
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => setCurrentEditingTags(prev => prev.filter(t => t !== tag))}
                      className="hover:bg-indigo-200 hover:text-indigo-900 rounded-full p-0.5 cursor-pointer text-indigo-500 transition-colors shrink-0"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleAddCustomTag} className="space-y-1.5 pt-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
              Crear etiqueta a medida
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej: Proyecto Central, Municipalidad..."
                value={newCustomTag}
                onChange={(e) => setNewCustomTag(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/10 text-xs font-semibold"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shrink-0"
              >
                Agregar
              </button>
            </div>
          </form>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Sugerencias de Proyectos y Especialidades
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pt-0.5">
              {PRESET_TAGS.map((tag) => {
                const isSelected = currentEditingTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setCurrentEditingTags(prev => prev.filter(t => t !== tag));
                      } else {
                        setCurrentEditingTags(prev => [...prev, tag]);
                      }
                    }}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer select-none ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-100'
                        : 'bg-slate-50 border-slate-200 text-slate-705 hover:bg-slate-100'
                    }`}
                  >
                    <Tag size={10} className={isSelected ? 'text-white' : 'text-slate-400'} />
                    <span>{tag}</span>
                    {isSelected && <span className="text-[8px] font-black ml-0.5">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-50">
            <button
              type="button"
              onClick={() => {
                setIsTagModalOpen(false);
                setItemToTag(null);
              }}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveTags}
              className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/95 transition-all shadow-md shadow-primary/15 cursor-pointer"
            >
              Guardar Clasificación
            </button>
          </div>
        </div>
      </Modal>

      {/* Cloud Service Info Connection Modal */}
      <Modal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        title="Vincular con Servicios de Nube"
      >
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-150 p-4 rounded-xl flex gap-3">
            <Info size={22} className="text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-indigo-950">
              <span className="font-bold block">¿Es posible enlazar Google Drive u OneDrive?</span>
              <p className="mt-1 font-medium">¡Sí, por supuesto! El sistema posee capacidades para enlazarse de forma interactiva con proveedores en la nube externos. Esto te permite importar y sincronizar archivos sin duplicar el almacenamiento.</p>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Formatos Disponibles para Integración:</span>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="border border-slate-200 p-4 rounded-2xl bg-slate-50 hover:border-blue-400 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm">G</div>
                    <span className="font-bold text-sm text-slate-800">Google Drive API</span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-2 leading-relaxed">Conecta de forma directa mediante la autenticación segura de Google OAuth. Permite navegar por capetas en vivo y seleccionar documentos.</p>
                </div>
                <button
                  type="button"
                  onClick={() => alert("Para enlazar Google Drive del corporativo, contacta al soporte técnico para registrar tus credenciales de Google OAuth Client en los secretos de la aplicación.")}
                  className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-[11px] transition-all"
                >
                  Configurar Google Drive
                </button>
              </div>

              <div className="border border-slate-200 p-4 rounded-2xl bg-slate-50 hover:border-indigo-400 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center font-bold text-indigo-600 text-sm">M</div>
                    <span className="font-bold text-sm text-slate-800">Microsoft Sharepoint / OneDrive</span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-2 leading-relaxed">Sincroniza directorios corporativos locales de Office 365 con la biblioteca ERP mediante Microsoft Graph REST Service API.</p>
                </div>
                <button
                  type="button"
                  onClick={() => alert("Para registrar Microsoft Graph Client en tu entorno, debes registrar tus claves secretas de Azure Active Directory (AAD) en la sección Configuración del panel.")}
                  className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-[11px] transition-all"
                >
                  Configurar OneDrive
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150">
            <p className="text-[10px] text-slate-400 leading-snug font-medium">Nota: El ERP cumple con normas de seguridad cifrada. Las conexiones OAuth son directas y nunca guardan ni registran tu clave de acceso personal del proveedor de nube.</p>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-50">
            <button
              onClick={() => setIsCloudModalOpen(false)}
              className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/95 transition-all shadow-md"
            >
              Entendido
            </button>
          </div>
        </div>
      </Modal>

      {/* Complete Online Preview Interactive Modal (No download required) */}
      <Modal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.name || 'Visor Online de Documentos'}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b pb-3.5">
            <div>
              <p className="text-xs font-bold text-slate-850">{previewItem?.fileName}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  {previewItem?.docType} • Folio #{previewItem?.folio.toString().padStart(4, '0')}
                </span>
                {previewItem && (
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex items-center gap-1.5 border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Subido por: <strong className="text-slate-800">{getUploaderInfo(previewItem)}</strong></span>
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => previewItem && handleDownload(previewItem)}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl px-3.5 py-1.5 text-xs font-bold text-slate-700 transition-colors shrink-0"
            >
              <Download size={14} />
              <span>Descargar Localmente</span>
            </button>
          </div>
          
          <div className="bg-slate-100 rounded-2xl min-h-[400px] flex items-center justify-center overflow-hidden p-3 border border-slate-250 relative">
            <VisorDocumento item={previewItem} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Visual and interactive document engine
function VisorDocumento({ item }: { item: LibraryItem | null }) {
  return <DocumentPreviewViewer item={item} />;
}

interface FolderTreeNodeProps {
  key?: string;
  folder: LibraryItem;
  depth: number;
  allFolders: LibraryItem[];
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  expandedFolders: Record<string, boolean>;
  toggleExpand: (id: string) => void;
  items: LibraryItem[];
}

function FolderTreeNode({
  folder,
  depth,
  allFolders,
  currentFolderId,
  setCurrentFolderId,
  expandedFolders,
  toggleExpand,
  items
}: FolderTreeNodeProps) {
  const isExpanded = !!expandedFolders[folder.id];
  const isSelected = currentFolderId === folder.id;
  const subFolders = allFolders.filter(f => f.folderId === folder.id);
  const directFiles = items.filter(item => !item.isFolder && item.folderId === folder.id);

  return (
    <div className="space-y-1">
      <div 
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
          isSelected 
            ? 'bg-primary/10 text-primary font-black shadow-none font-bold' 
            : 'text-slate-700 hover:bg-slate-50'
        }`}
        style={{ paddingLeft: `${Math.max(8, depth * 12)}px` }}
      >
        {/* Expand/Collapse arrow */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(folder.id);
          }}
          className="p-0.5 hover:bg-slate-200/65 rounded transition-colors text-slate-400 cursor-pointer"
        >
          {subFolders.length > 0 ? (
            isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <div className="w-3" />
          )}
        </button>

        <div 
          onClick={() => setCurrentFolderId(folder.id)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          {isExpanded ? (
            <FolderOpen size={14} className={isSelected ? 'text-primary' : 'text-amber-500'} />
          ) : (
            <Folder size={14} className={isSelected ? 'text-primary' : 'text-amber-400'} />
          )}
          <span className="truncate select-none">{folder.name}</span>
          <span className="ml-auto text-[9px] text-slate-400 font-mono font-bold bg-slate-100 px-1 rounded-md">
            {directFiles.length}
          </span>
        </div>
      </div>

      {isExpanded && subFolders.length > 0 && (
        <div className="space-y-0.5">
          {subFolders.map(subFolder => (
            <FolderTreeNode
              key={subFolder.id}
              folder={subFolder}
              depth={depth + 1}
              allFolders={allFolders}
              currentFolderId={currentFolderId}
              setCurrentFolderId={setCurrentFolderId}
              expandedFolders={expandedFolders}
              toggleExpand={toggleExpand}
              items={items}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Flat sorted nested folder with depth indicator for Move modal dropdown tree representation
function getSortedFoldersListWithDepth(
  availableFolders: LibraryItem[],
  parentId: string | null = null,
  depth = 0
): Array<{ folder: LibraryItem; depth: number }> {
  let list: Array<{ folder: LibraryItem; depth: number }> = [];
  const levelFolders = availableFolders.filter(f => f.folderId === parentId);
  for (const folder of levelFolders) {
    list.push({ folder, depth });
    const subList = getSortedFoldersListWithDepth(availableFolders, folder.id, depth + 1);
    list = list.concat(subList);
  }
  return list;
}
