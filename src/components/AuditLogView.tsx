import { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  User, 
  Calendar, 
  Activity, 
  Tag, 
  Clock, 
  ArrowUpDown, 
  CheckCircle, 
  AlertCircle,
  FileText,
  Package,
  Briefcase,
  Users as UsersIcon,
  ShieldAlert,
  HelpCircle,
  TrendingDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';
import { SystemLog } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

const ACTION_DESCRIPTIONS: { [key: string]: { label: string, color: string } } = {
  'create': { label: 'Creación', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'update': { label: 'Modificación', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  'delete': { label: 'Eliminación', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  'adjust': { label: 'Ajuste de Stock', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

const ENTITY_METADATA: { [key: string]: { label: string, icon: any, color: string } } = {
  'inventory': { label: 'Inventario', icon: Package, color: 'text-amber-600 bg-amber-50' },
  'document': { label: 'Documentos', icon: FileText, color: 'text-blue-600 bg-blue-50' },
  'project': { label: 'Operaciones/Proyectos', icon: Briefcase, color: 'text-indigo-600 bg-indigo-50' },
  'crm': { label: 'CRM / Clientes', icon: UsersIcon, color: 'text-emerald-600 bg-emerald-50' },
  'hr': { label: 'Recursos Humanos', icon: User, color: 'text-purple-600 bg-purple-50' },
};

export default function AuditLogView() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering & Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    if (!user) return;

    const path = 'systemLogs';
    const q = query(collection(db, path), where('ownerId', '==', user.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const fetchedLogs = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
          } as SystemLog;
        });

        // Client-side sorting by date to ensure perfect compatibility to timestamp formatting
        fetchedLogs.sort((a, b) => {
          const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
          const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
          return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });

        setLogs(fetchedLogs);
        setLoading(false);
      } catch (err) {
        console.error("Error processing system logs:", err);
        setLoading(false);
      }
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return unsubscribe;
  }, [user, sortOrder]);

  const filteredLogs = logs.filter(log => {
    // Search match
    const descriptionMatch = log.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const emailMatch = log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase());
    const nameMatch = log.userName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSearch = descriptionMatch || emailMatch || nameMatch;

    // Action match
    const matchesAction = selectedAction === 'all' || log.action === selectedAction;

    // Entity match
    const matchesEntity = selectedEntity === 'all' || log.entityType === selectedEntity;

    return matchesSearch && matchesAction && matchesEntity;
  });

  // Calculate high level summaries
  const totalLogs = logs.length;
  const recentAdjustments = logs.filter(l => l.action === 'adjust').length;
  const topContributor = logs.reduce((acc, current) => {
    const email = current.userEmail || 'Desconocido';
    acc[email] = (acc[email] || 0) + 1;
    return acc;
  }, {} as { [key: string]: number });

  const topUser = Object.entries(topContributor).sort((a, b) => {
    const countA = Number(a[1]) || 0;
    const countB = Number(b[1]) || 0;
    return countB - countA;
  })[0]?.[0] || 'N/A';

  const formatLogDate = (createdAt: any) => {
    if (!createdAt) return 'N/A';
    const dateObj = createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt);
    return dateObj.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="space-y-6 font-sans text-left">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center border border-indigo-100">
              <History size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">Registro de Auditoría</h2>
              <p className="text-xs text-slate-450 mt-1 font-medium">Historial de auditoría centralizado para el cumplimiento normativo e interno.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200">
            Nivel: Alta Seguridad
          </span>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black">
            <Activity size={22} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Registros</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">{totalLogs}</h3>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-black">
            <TrendingDown size={22} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ajustes de Inventario</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">{recentAdjustments}</h3>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black">
            <User size={22} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Usuario Más Activo</p>
            <h3 className="text-sm font-black text-slate-900 mt-1 truncate max-w-[180px]" title={topUser}>{topUser}</h3>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por usuario o descripción del cambio..." 
              className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-sans font-medium"
            />
          </div>

          {/* Action Filter */}
          <div className="w-full md:w-48 relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none font-sans font-bold text-slate-700"
            >
              <option value="all">Todas las Acciones</option>
              <option value="create">Creaciones</option>
              <option value="update">Modificaciones</option>
              <option value="delete">Eliminaciones</option>
              <option value="adjust">Ajustes Stock</option>
            </select>
          </div>

          {/* Entity Filter */}
          <div className="w-full md:w-48 relative">
            <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none font-sans font-bold text-slate-700"
            >
              <option value="all">Todas las Secciones</option>
              <option value="inventory">Inventario</option>
              <option value="document">Documentos</option>
              <option value="project">Operaciones</option>
              <option value="crm">CRM</option>
              <option value="hr">Recursos Humanos</option>
            </select>
          </div>

          {/* Sort Order Toggle */}
          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="h-10 px-4 bg-slate-100 hover:bg-slate-150 border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-slate-700 transition-colors cursor-pointer shrink-0"
            title="Invertir Orden Temporal"
          >
            <ArrowUpDown size={14} />
            <span>{sortOrder === 'desc' ? 'Recientes Primero' : 'Antiguos Primero'}</span>
          </button>
        </div>
      </div>

      {/* Main Logs Ledger Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Cargando registros de auditoría...</p>
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="overflow-x-auto min-w-full">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="p-4 px-6 text-left">Usuario (Modificado por)</th>
                  <th className="p-4 text-center w-32">Acción</th>
                  <th className="p-4 text-left w-44">Área / Registro</th>
                  <th className="p-4 text-left">Detalles del Cambio</th>
                  <th className="p-4 text-right pr-6 w-44">Fecha y Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredLogs.map((log) => {
                  const actionStyle = ACTION_DESCRIPTIONS[log.action] || { label: log.action, color: 'bg-slate-50 text-slate-700' };
                  const entityMeta = ENTITY_METADATA[log.entityType] || { label: log.entityType, icon: HelpCircle, color: 'text-slate-600 bg-slate-50' };
                  const EntityIcon = entityMeta.icon;

                  return (
                    <motion.tr 
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-slate-50/50"
                    >
                      {/* User Column */}
                      <td className="p-4 px-6 text-left">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-slate-150 rounded-full flex items-center justify-center text-slate-600 shrink-0 border border-slate-200 font-semibold uppercase text-[10px]">
                            {log.userName ? log.userName.substring(0, 2) : log.userEmail?.substring(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 leading-none truncate max-w-[150px]">
                              {log.userName || 'Usuario'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium leading-none mt-1 truncate max-w-[150px]">
                              {log.userEmail}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Action Column */}
                      <td className="p-4 text-center shrink-0">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${actionStyle.color} tracking-wide whitespace-nowrap`}>
                          {actionStyle.label}
                        </span>
                      </td>

                      {/* Area/Entity Column */}
                      <td className="p-4 text-left shrink-0">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${entityMeta.color} shrink-0`}>
                            <EntityIcon size={13} />
                          </div>
                          <span className="font-bold text-slate-800 text-[11px] whitespace-nowrap">{entityMeta.label}</span>
                        </div>
                      </td>

                      {/* Details Column */}
                      <td className="p-4 text-left max-w-[320px] lg:max-w-[450px]">
                        <p className="text-slate-900 font-medium text-xs leading-relaxed whitespace-pre-line">
                          {log.description}
                        </p>
                        {log.entityId && (
                          <span className="inline-block mt-1 font-mono text-[9px] text-slate-350 bg-slate-50 rounded border border-slate-100 px-1 font-bold">
                            REF: {log.entityId}
                          </span>
                        )}
                      </td>

                      {/* Timestamp Column */}
                      <td className="p-4 text-right pr-6 shrink-0">
                        <div className="flex items-center justify-end gap-1.5 text-slate-450">
                          <Clock size={12} />
                          <span className="font-mono text-[10px] font-black">{formatLogDate(log.createdAt)}</span>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center">
            <ShieldAlert size={40} className="mx-auto text-slate-300 mb-3 opacity-60" />
            <h4 className="text-sm font-bold text-slate-800">No se encontraron registros de auditoría</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Prueba ajustando los filtros de búsqueda o realiza algún cambio en el inventario, documentos u operaciones.</p>
          </div>
        )}
      </div>
    </div>
  );
}
