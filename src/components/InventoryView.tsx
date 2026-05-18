import React, { useState, useEffect, FormEvent, useRef, ChangeEvent } from 'react';
import { Search, Plus, Filter, MoreVertical, AlertTriangle, Trash2, Upload, Download, FileSpreadsheet } from 'lucide-react';
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
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    unit: 'pza'
  });

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      const itemToAdd = {
        ...newItem,
        sku: newItem.sku || generateSKU(),
        ownerId: user.uid,
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'inventory'), itemToAdd);
      
      setIsModalOpen(false);
      setNewItem({ name: '', sku: '', category: '', stock: 0, minStock: 0, unit: 'pza' });
    } catch (error) {
      console.error("Error adding item:", error);
      alert("Error al guardar el artículo");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Eliminar este artículo?')) {
      await deleteDoc(doc(db, 'inventory', id));
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

          if (!name) continue; // Skip rows without name

          const newDocRef = doc(collection(db, 'inventory'));
          batch.set(newDocRef, {
            name,
            sku: skuFromRow || generateSKU(),
            category: category || 'Sin Categoría',
            stock,
            minStock,
            unit,
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
        unidad: 'pza' 
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

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Agregar Nuevo Artículo"
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
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Stock Inicial</label>
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
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-white py-2.5 rounded-lg font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all mt-2"
          >
            Guardar Artículo
          </button>
        </form>
      </Modal>

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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Artículo</th>
                <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Categoría</th>
                <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Stock Actual</th>
                <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400">Estado</th>
                <th className="p-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-20 text-center">
                    <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Inventario...</p>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-20 text-center">
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
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{item.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono uppercase font-bold">{item.sku}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600 font-medium">{item.category}</td>
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
                          onClick={() => updateStock(item.id, item.stock + 1)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors bg-slate-50 rounded"
                        >
                          <Plus size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
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
    </div>
  );
}
