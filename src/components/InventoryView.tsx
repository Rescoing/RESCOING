import React, { useState, useEffect, FormEvent, useRef, ChangeEvent } from 'react';
import { Search, Plus, Filter, MoreVertical, AlertTriangle, Trash2, Upload, Download, FileSpreadsheet, Edit, Package, Minus, Settings2, History, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { Item } from '../types';
import Modal from './ui/Modal';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';
import * as XLSX from 'xlsx';

interface InventoryViewProps {
  autoOpen?: boolean;
  onModalHandled?: () => void;
}

export default function InventoryView({ autoOpen, onModalHandled }: InventoryViewProps) {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isAdjustingStock, setIsAdjustingStock] = useState(false);
  const [adjustmentValue, setAdjustmentValue] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Movements state
  const [activeTab, setActiveTab] = useState<'catalog' | 'movements'>('catalog');
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [movementSearchTerm, setMovementSearchTerm] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<'all' | 'in' | 'out'>('all');

  useEffect(() => {
    if (!user) return;

    // Listen to movements in real-time
    const movementsQuery = query(
      collection(db, 'inventory_movements'),
      where('ownerId', '==', user.uid)
    );

    const unsubMovements = onSnapshot(movementsQuery, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      // Sort in-memory descending by timestamp
      docs.sort((a, b) => {
        const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      setMovements(docs);
      setLoadingMovements(false);
    }, (error) => {
      console.error("Inventory movements snapshot error:", error);
      setLoadingMovements(false);
    });

    return () => unsubMovements();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'inventory'),
      where('ownerId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Item[];
      setItems(docs);
      setLoading(false);
    }, (error) => {
      console.error("Inventory snapshot error:", error);
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
  const [newItem, setNewItem] = useState<Partial<Item>>({
    name: '',
    sku: '',
    category: '',
    stock: 0,
    minStock: 0,
    unit: 'pza',
    brand: '',
    model: '',
    manufacturer: '',
    description: '',
    location: '',
    netPrice: 0,
    iva: 0,
    totalPrice: 0
  });

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMovements = movements.filter(m => {
    const matchesSearch = !movementSearchTerm || 
      m.itemName?.toLowerCase().includes(movementSearchTerm.toLowerCase()) ||
      m.itemId?.toLowerCase().includes(movementSearchTerm.toLowerCase()) ||
      m.reason?.toLowerCase().includes(movementSearchTerm.toLowerCase());

    const matchesType = movementTypeFilter === 'all' || m.type === movementTypeFilter;

    return matchesSearch && matchesType;
  });

  const generateSKU = () => {
    const prefix = 'SKU';
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${datePart}-${randomPart}`;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const itemData = {
        ...newItem,
        sku: newItem.sku || generateSKU(),
        ownerId: user.uid,
        updatedAt: serverTimestamp(),
        stock: Number(newItem.stock) || 0,
        minStock: Number(newItem.minStock) || 0,
        netPrice: Number(newItem.netPrice) || 0,
        iva: Math.round((Number(newItem.netPrice) || 0) * 0.19),
        totalPrice: Math.round((Number(newItem.netPrice) || 0) * 1.19)
      };
      
      if (editingItem) {
        await updateDoc(doc(db, 'inventory', editingItem.id), itemData);
        await addDoc(collection(db, 'systemLogs'), {
          ownerId: user.uid,
          userEmail: user.email || '',
          userName: profile?.displayName || user.displayName || 'Usuario',
          action: 'update',
          entityType: 'inventory',
          entityId: editingItem.id,
          description: `Se modificó el artículo "${itemData.name}" (SKU: ${itemData.sku}) en el catálogo de inventario.`,
          createdAt: serverTimestamp()
        });
      } else {
        const docRef = await addDoc(collection(db, 'inventory'), {
          ...itemData,
          createdAt: serverTimestamp()
        });
        await addDoc(collection(db, 'systemLogs'), {
          ownerId: user.uid,
          userEmail: user.email || '',
          userName: profile?.displayName || user.displayName || 'Usuario',
          action: 'create',
          entityType: 'inventory',
          entityId: docRef.id,
          description: `Se creó el nuevo artículo "${itemData.name}" (SKU: ${itemData.sku}) con stock de ${itemData.stock} unidades.`,
          createdAt: serverTimestamp()
        });
      }
      
      setIsModalOpen(false);
      setEditingItem(null);
      setNewItem({ 
        name: '', sku: '', category: '', stock: 0, minStock: 0, unit: 'pza',
        brand: '', model: '', manufacturer: '', description: '', location: '',
        netPrice: 0, iva: 0, totalPrice: 0
      });
    } catch (error) {
      console.error("Error saving item:", error);
      alert("Error al guardar el artículo");
    }
  };

  const startEdit = (item: Item) => {
    setEditingItem(item);
    setNewItem({ ...item });
    setIsModalOpen(true);
  };

  const startAdjustment = (item: Item) => {
    setEditingItem(item);
    setAdjustmentValue(0);
    setAdjustmentReason('');
    setIsAdjustingStock(true);
  };

  const handleStockAdjustment = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem || !user) return;

    try {
      const newStock = editingItem.stock + adjustmentValue;
      if (newStock < 0) {
        alert("El stock resultante no puede ser negativo.");
        return;
      }

      await updateDoc(doc(db, 'inventory', editingItem.id), { 
        stock: newStock,
        lastAdjustmentReason: adjustmentReason,
        lastAdjustmentValue: adjustmentValue,
        updatedAt: serverTimestamp()
      });

      // Optionally log this movement to a separate collection 'inventory_movements'
      await addDoc(collection(db, 'inventory_movements'), {
        itemId: editingItem.id,
        itemName: editingItem.name,
        type: adjustmentValue > 0 ? 'in' : 'out',
        quantity: Math.abs(adjustmentValue),
        reason: adjustmentReason || 'Ajuste manual',
        ownerId: user.uid,
        timestamp: serverTimestamp()
      });

      // Write system auditory log entry
      await addDoc(collection(db, 'systemLogs'), {
        ownerId: user.uid,
        userEmail: user.email || '',
        userName: profile?.displayName || user.displayName || 'Usuario',
        action: 'adjust',
        entityType: 'inventory',
        entityId: editingItem.id,
        description: `Se ajustó el stock del artículo "${editingItem.name}" en ${adjustmentValue > 0 ? '+' : ''}${adjustmentValue} unidades. Razón: ${adjustmentReason || 'Ajuste manual'}. Stock resultante: ${newStock}.`,
        createdAt: serverTimestamp()
      });

      setIsAdjustingStock(false);
      setEditingItem(null);
    } catch (error) {
      console.error("Error adjusting stock:", error);
      alert("Error al ajustar el stock");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Eliminar este artículo?')) {
      const itemToDelete = items.find(item => item.id === id);
      await deleteDoc(doc(db, 'inventory', id));
      
      if (itemToDelete) {
        await addDoc(collection(db, 'systemLogs'), {
          ownerId: user?.uid || '',
          userEmail: user?.email || '',
          userName: profile?.displayName || user?.displayName || 'Usuario',
          action: 'delete',
          entityType: 'inventory',
          entityId: id,
          description: `Se eliminó el artículo "${itemToDelete.name}" (SKU: ${itemToDelete.sku || 'N/A'}) del inventario.`,
          createdAt: serverTimestamp()
        });
      }
    }
  };

  const updateStock = async (id: string, newStock: number) => {
    await updateDoc(doc(db, 'inventory', id), { stock: newStock });
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsBulkLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (data.length === 0) {
          alert("El archivo está vacío o no tiene el formato correcto.");
          setIsBulkLoading(false);
          return;
        }

        const batch = writeBatch(db);
        let count = 0;

        for (const row of data) {
          // Mapping columns (flexible with common names)
          const name = row.nombre || row.Nombre || row.name || row.Name;
          const skuFromRow = row.sku || row.SKU || row.codigo || row.Código;
          const category = row.categoria || row.Categoría || row.category || row.Category;
          const stock = parseInt(row.stock_inicial || row.stock || row.Stock) || 0;
          const minStock = parseInt(row.stock_minimo || row.min_stock || row.MinStock) || 0;
          const unit = row.unidad || row.Unit || 'pza';
          const brand = row.marca || row.Marca || row.brand || row.Brand || '';
          const model = row.modelo || row.Modelo || row.model || row.Model || '';
          const manufacturer = row.fabricante || row.Fabricante || row.manufacturer || '';
          const netPrice = parseFloat(row.precio_neto || row.net_price || row.price || 0);

          if (!name) continue; // Skip rows without name

          const newDocRef = doc(collection(db, 'inventory'));
          batch.set(newDocRef, {
            name,
            sku: skuFromRow || generateSKU(),
            category: category || 'Sin Categoría',
            stock,
            minStock,
            unit,
            brand,
            model,
            manufacturer,
            netPrice,
            iva: Math.round(netPrice * 0.19),
            totalPrice: Math.round(netPrice * 1.19),
            ownerId: user.uid,
            createdAt: serverTimestamp()
          });

          count++;
          // Firestore batch limit is 500
          if (count >= 499) break; 
        }

        await batch.commit();
        alert(`Se han cargado ${count} artículos exitosamente.`);
      } catch (error) {
        console.error("Bulk upload error:", error);
        alert("Error al procesar el archivo. Asegúrate de que sea un archivo Excel o CSV válido.");
      } finally {
        setIsBulkLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const template = [
      { 
        nombre: 'Ejemplo Tornillo 1/4', 
        sku: 'FIX-001', 
        categoria: 'Ferretería', 
        stock_inicial: 100, 
        stock_minimo: 20, 
        unidad: 'pza',
        marca: 'Standard',
        modelo: 'HEX-2024',
        fabricante: 'Ind. Metalúrgica',
        precio_neto: 1500
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "plantilla_inventario.xlsx");
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Inventario de Materiales</h2>
          <p className="text-slate-500 mt-1">Gestión centralizada de componentes y suministros críticos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleBulkUpload} 
            className="hidden" 
            accept=".xlsx, .xls, .csv"
          />
          
          <button 
            onClick={downloadTemplate}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:bg-slate-50 transition-all"
            title="Descargar plantilla Excel"
          >
            <Download size={18} />
            Plantilla
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isBulkLoading}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:bg-slate-200 transition-all disabled:opacity-50"
          >
            {isBulkLoading ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            ) : (
              <Upload size={18} />
            )}
            Carga Masiva
          </button>

          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus size={18} />
            Nuevo Artículo
          </button>
        </div>
      </div>

      {/* Navegación por Pestañas */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm tracking-tight transition-all duration-150 ${
            activeTab === 'catalog'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Package size={16} />
          <span>Catálogo de Materiales ({items.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm tracking-tight transition-all duration-150 ${
            activeTab === 'movements'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <History size={16} />
          <span>Historial de Movimientos ({movements.length})</span>
        </button>
      </div>

      <Modal 
        isOpen={isDetailModalOpen} 
        onClose={() => { setIsDetailModalOpen(false); setEditingItem(null); }} 
        title="Detalles del Artículo"
      >
        {editingItem && (
          <div className="space-y-6 font-sans">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded text-[10px] font-bold uppercase tracking-widest">{editingItem.category}</span>
                  <span className="font-mono text-xs font-bold text-slate-400">{editingItem.sku}</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900">{editingItem.name}</h3>
                {editingItem.description && <p className="text-sm text-slate-500 mt-2 italic">"{editingItem.description}"</p>}
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-1">Especificación Técnica</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Marca:</span>
                    <span className="font-semibold text-slate-900">{editingItem.brand || '---'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Modelo:</span>
                    <span className="font-semibold text-slate-900">{editingItem.model || '---'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Fabricante:</span>
                    <span className="font-semibold text-slate-900">{editingItem.manufacturer || '---'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-1">Valores y Precios</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Precio Neto:</span>
                    <span className="font-bold text-slate-900">${(editingItem.netPrice || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-[10px]">
                    <span className="text-slate-400">IVA (19%):</span>
                    <span className="font-medium text-slate-500">${(editingItem.iva || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-1 mt-1">
                    <span className="text-slate-600 font-bold">Total:</span>
                    <span className="font-bold text-primary">${(editingItem.totalPrice || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-1">Estado de Almacén</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Stock Disponible:</span>
                    <span className={`font-bold ${editingItem.stock <= editingItem.minStock ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {editingItem.stock} {editingItem.unit}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Stock Mínimo:</span>
                    <span className="font-semibold text-slate-900">{editingItem.minStock} {editingItem.unit}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Ubicación:</span>
                    <span className="font-semibold text-slate-900">{editingItem.location || 'No especificada'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => { setIsDetailModalOpen(false); startAdjustment(editingItem); }}
                className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-800"
              >
                Ajustar Stock
              </button>
              <button 
                onClick={() => { setIsDetailModalOpen(false); startEdit(editingItem); }}
                className="flex-1 bg-white border border-slate-200 text-slate-600 py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-50"
              >
                Editar Ficha
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
          setNewItem({ 
            name: '', sku: '', category: '', stock: 0, minStock: 0, unit: 'pza',
            brand: '', model: '', manufacturer: '', description: '', location: '',
            netPrice: 0, iva: 0, totalPrice: 0
          });
        }} 
        title={editingItem ? "Editar Artículo" : "Agregar Nuevo Artículo"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre del Artículo</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newItem.name}
                onChange={e => setNewItem({...newItem, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Precio Neto ($)</label>
              <input 
                required
                type="number" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono font-bold text-primary"
                value={newItem.netPrice}
                onChange={e => {
                  const net = parseFloat(e.target.value) || 0;
                  setNewItem({
                    ...newItem, 
                    netPrice: net,
                    iva: Math.round(net * 0.19),
                    totalPrice: Math.round(net * 1.19)
                  });
                }}
              />
            </div>
            <div className="flex gap-2 items-center pt-5">
               <div className="flex-1">
                 <span className="block text-[8px] font-bold text-slate-400 uppercase">IVA: ${(newItem.iva || 0).toLocaleString()}</span>
                 <span className="block text-[8px] font-bold text-slate-600 uppercase">Total: ${(newItem.totalPrice || 0).toLocaleString()}</span>
               </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">SKU / Código (Auto si vacío)</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm placeholder:text-slate-300"
                value={newItem.sku}
                placeholder="Auto-generar..."
                onChange={e => setNewItem({...newItem, sku: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Categoría</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newItem.category}
                onChange={e => setNewItem({...newItem, category: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Marca</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newItem.brand}
                onChange={e => setNewItem({...newItem, brand: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Modelo</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newItem.model}
                onChange={e => setNewItem({...newItem, model: e.target.value})}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fabricante</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newItem.manufacturer}
                onChange={e => setNewItem({...newItem, manufacturer: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Stock {editingItem ? 'Actual' : 'Inicial'}</label>
              <input 
                required
                type="number" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono"
                value={newItem.stock}
                onChange={e => setNewItem({...newItem, stock: parseInt(e.target.value) || 0})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Stock Mínimo</label>
              <input 
                required
                type="number" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono"
                value={newItem.minStock}
                onChange={e => setNewItem({...newItem, minStock: parseInt(e.target.value) || 0})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ubicación</label>
              <input 
                type="text" 
                placeholder="Ej: Pasillo 2, Estante B"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newItem.location}
                onChange={e => setNewItem({...newItem, location: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Unidad</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newItem.unit}
                onChange={e => setNewItem({...newItem, unit: e.target.value})}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción</label>
              <textarea 
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none"
                value={newItem.description}
                onChange={e => setNewItem({...newItem, description: e.target.value})}
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-white py-2.5 rounded-lg font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all mt-2"
          >
            {editingItem ? "Actualizar Artículo" : "Guardar Artículo"}
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={isAdjustingStock} 
        onClose={() => setIsAdjustingStock(false)} 
        title={`Ajuste de Stock: ${editingItem?.name}`}
      >
        <form onSubmit={handleStockAdjustment} className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-600">Stock Actual:</div>
            <div className="text-xl font-mono font-bold text-slate-900">{editingItem?.stock} {editingItem?.unit}</div>
          </div>
          
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cantidad a Ajustar</label>
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => setAdjustmentValue(prev => prev - 1)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
              >
                <Minus size={18} />
              </button>
              <input 
                required
                type="number" 
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-center font-mono font-bold text-lg"
                value={adjustmentValue}
                onChange={e => setAdjustmentValue(parseInt(e.target.value) || 0)}
              />
              <button 
                type="button"
                onClick={() => setAdjustmentValue(prev => prev + 1)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Usa valores negativos para rebajar stock (ej: consumo de propietario)</p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Motivo del Ajuste</label>
            <select 
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              value={adjustmentReason}
              onChange={e => setAdjustmentReason(e.target.value)}
              required
            >
              <option value="">Seleccionar motivo...</option>
              <option value="Consumo Propietario">Consumo Propietario</option>
              <option value="Ingreso de Compra">Ingreso de Compra</option>
              <option value="Devolución">Devolución</option>
              <option value="Merma o Daño">Merma o Daño</option>
              <option value="Ajuste de Inventario">Ajuste de Inventario</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex items-center justify-between">
            <div className="text-sm font-medium text-primary">Nuevo Stock Resultante:</div>
            <div className="text-xl font-mono font-bold text-primary">{(editingItem?.stock || 0) + adjustmentValue} {editingItem?.unit}</div>
          </div>

          <button 
            type="submit"
            className="w-full bg-primary text-white py-3 rounded-lg font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all mt-2"
          >
            Confirmar Ajuste
          </button>
        </form>
      </Modal>

      {activeTab === 'catalog' ? (
        <>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por nombre o SKU..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium text-sm">
              <Filter size={18} />
              Filtros Avanzados
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-left">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Artículo</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Categoría</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">Precio Neto</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Stock Actual</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Estado</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-20 text-center">
                        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Inventario...</p>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-20 text-center">
                        <p className="text-slate-400 text-sm">No hay artículos que coincidan con la búsqueda.</p>
                      </td>
                    </tr>
                  ) : filteredItems.map((item, i) => {
                    const isLowStock = item.stock <= item.minStock;
                    return (
                      <motion.tr 
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                        onClick={() => { setEditingItem(item); setIsDetailModalOpen(true); }}
                      >
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{item.name}</span>
                            {item.brand && <span className="text-[10px] text-slate-500 font-medium">{item.brand} {item.model}</span>}
                            <span className="text-[10px] text-slate-400 font-mono uppercase font-bold">{item.sku}</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-slate-600 font-medium">{item.category}</td>
                        <td className="p-4 text-right">
                          <span className="font-mono text-sm font-bold text-slate-900">${(item.netPrice || 0).toLocaleString()}</span>
                        </td>
                        <td className="p-4">
                          <span className="font-mono text-sm font-bold text-slate-700">{item.stock} {item.unit}</span>
                        </td>
                        <td className="p-4">
                          {isLowStock ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold border border-rose-100 uppercase tracking-wider">
                              <AlertTriangle size={10} />
                              Stock Bajo
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold border border-emerald-100 uppercase tracking-wider">
                              Nivel Óptimo
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); startAdjustment(item); }}
                              title="Gestionar Stock"
                              className="p-1.5 text-slate-400 hover:text-primary transition-colors bg-slate-50 rounded"
                            >
                              <Settings2 size={14} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); startEdit(item); }}
                              title="Editar Detalles"
                              className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors bg-slate-50 rounded"
                            >
                              <Edit size={14} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors bg-slate-50 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Listado de movimientos de inventario */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar movimiento por artículo o motivo..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans text-sm"
                value={movementSearchTerm}
                onChange={(e) => setMovementSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value as 'all' | 'in' | 'out')}
                className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-sm"
              >
                <option value="all">Todos los Movimientos</option>
                <option value="in">Ingresos (Stock +)</option>
                <option value="out">Egresos (Stock -)</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-left font-sans">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Artículo</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-center">Tipo</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">Cantidad</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Motivo de Ajuste</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">Fecha y Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                  {loadingMovements ? (
                    <tr>
                      <td colSpan={5} className="p-20 text-center">
                        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Movimientos...</p>
                      </td>
                    </tr>
                  ) : filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-20 text-center">
                        <p className="text-slate-400 text-sm">No se encontraron movimientos registrados.</p>
                      </td>
                    </tr>
                  ) : filteredMovements.map((movement, i) => {
                    const isIncoming = movement.type === 'in';
                    const dateObj = movement.timestamp?.seconds ? new Date(movement.timestamp.seconds * 1000) : new Date(movement.timestamp || 0);
                    const formattedDate = dateObj.toLocaleString('es-CL', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <motion.tr 
                        key={movement.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="p-4 font-bold text-slate-900">
                          {movement.itemName || 'Artículo Desconocido'}
                        </td>
                        <td className="p-4 text-center">
                          {isIncoming ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold border border-emerald-100 uppercase tracking-wider">
                              <ArrowUpRight size={12} className="text-emerald-600" />
                              Ingreso
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold border border-rose-100 uppercase tracking-wider">
                              <ArrowDownLeft size={12} className="text-rose-600" />
                              Egreso
                            </span>
                          )}
                        </td>
                        <td className={`p-4 text-right font-mono font-bold text-sm ${isIncoming ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isIncoming ? '+' : '-'}{movement.quantity}
                        </td>
                        <td className="p-4 text-slate-600 text-xs">
                          {movement.reason}
                        </td>
                        <td className="p-4 text-right text-slate-450 font-mono text-[11px]">
                          <div className="flex items-center justify-end gap-1">
                            <Clock size={11} className="text-slate-350" />
                            <span>{formattedDate}</span>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
