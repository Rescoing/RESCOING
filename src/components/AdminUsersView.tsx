import { useState, useEffect } from 'react';
import { 
  Users, UserCheck, UserMinus, Shield, 
  Search, Filter, CheckCircle, XCircle, Clock,
  MoreVertical, Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, onSnapshot, updateDoc, 
  doc, orderBy, where, getDocs, setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';
import Modal from './ui/Modal';

interface UserProfile {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'user';
  accessStatus: 'pending' | 'approved' | 'denied';
  permissions: {
    [key: string]: boolean;
  };
}

const MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'crm', label: 'CRM' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'operations', label: 'Operaciones' },
  { id: 'finance', label: 'Finanzas y Documentos' },
  { id: 'suppliers', label: 'Proveedores' },
  { id: 'hr', label: 'RRHH' },
  { id: 'library', label: 'Biblioteca' },
  { id: 'audit_log', label: 'Auditoría' },
];

export default function AdminUsersView() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    role: 'user' as const,
    accessStatus: 'approved' as const,
    permissions: MODULES.reduce((acc, m) => ({ ...acc, [m.id]: false }), {})
  });

  useEffect(() => {
    if (profile?.role !== 'admin') {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'users'),
      orderBy('email', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserProfile[];
      setUsers(newUsers);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleCreateUser = async () => {
    if (!newUser.email) return;
    try {
      // We use a query to check if email already exists
      const q = query(collection(db, 'users'), where('email', '==', newUser.email.toLowerCase()));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        alert("Este correo ya está registrado.");
        return;
      }

      // Create a document with a predictable ID based on email for invitation logic
      const invitationId = `invite_${newUser.email.toLowerCase()}`;
      await setDoc(doc(db, 'users', invitationId), {
        ...newUser,
        email: newUser.email.toLowerCase(),
        displayName: 'Usuario Invitado',
        photoURL: '',
        uid: invitationId, // Temporary ID
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setIsAddModalOpen(false);
      setNewUser({
        email: '',
        role: 'user',
        accessStatus: 'approved',
        permissions: MODULES.reduce((acc, m) => ({ ...acc, [m.id]: false }), {})
      });
    } catch (error) {
      console.error("Error creating invitation:", error);
    }
  };

  const handleUpdateUser = async (uid: string, data: Partial<UserProfile>) => {
    try {
      await updateDoc(doc(db, 'users', uid), data);
      if (selectedUser?.uid === uid) {
        setSelectedUser(prev => prev ? { ...prev, ...data } : null);
      }
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  const togglePermission = async (module: string) => {
    if (!selectedUser) return;
    const currentPermissions = selectedUser.permissions || {};
    const newPermissions = {
      ...currentPermissions,
      [module]: !currentPermissions[module]
    };
    await handleUpdateUser(selectedUser.uid, { permissions: newPermissions });
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (user.displayName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || user.accessStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle size={16} className="text-emerald-500" />;
      case 'denied': return <XCircle size={16} className="text-rose-500" />;
      default: return <Clock size={16} className="text-amber-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h2>
          <p className="text-slate-500">Administra accesos, roles y permisos del sistema</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-all font-medium shadow-sm w-fit"
          >
            <Users size={20} />
            <span>Agregar Usuario</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={18} />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all outline-none"
          >
            <option value="All">Todos los Estados</option>
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobados</option>
            <option value="denied">Denegados</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuario</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Acceso</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                          <Users size={16} />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900">{user.displayName || 'Sin nombre'}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(user.accessStatus)}
                      <span className="text-sm text-slate-700 capitalize">{user.accessStatus}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setSelectedUser(user)}
                      className="p-2 text-slate-400 hover:text-primary transition-colors"
                    >
                      <Settings size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Details Modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="Configuración de Usuario"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
            {selectedUser?.photoURL ? (
              <img src={selectedUser.photoURL} className="w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                <Users size={24} />
              </div>
            )}
            <div>
              <h3 className="font-bold text-slate-900">{selectedUser?.displayName}</h3>
              <p className="text-sm text-slate-500">{selectedUser?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Rol del Sistema</label>
              <div className="flex gap-2">
                <button
                  onClick={() => selectedUser && handleUpdateUser(selectedUser.uid, { role: 'user' })}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${selectedUser?.role === 'user' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  Usuario
                </button>
                <button
                  onClick={() => selectedUser && handleUpdateUser(selectedUser.uid, { role: 'admin' })}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${selectedUser?.role === 'admin' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  Admin
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Acceso</label>
              <div className="flex gap-2">
                <button
                  onClick={() => selectedUser && handleUpdateUser(selectedUser.uid, { accessStatus: 'approved' })}
                  className={`p-2 rounded-lg border flex-1 flex justify-center transition-all ${selectedUser?.accessStatus === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                  title="Aprobar"
                >
                  <UserCheck size={20} />
                </button>
                <button
                  onClick={() => selectedUser && handleUpdateUser(selectedUser.uid, { accessStatus: 'denied' })}
                  className={`p-2 rounded-lg border flex-1 flex justify-center transition-all ${selectedUser?.accessStatus === 'denied' ? 'bg-rose-50 text-rose-600 border-rose-200 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                  title="Denegar"
                >
                  <UserMinus size={20} />
                </button>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Shield size={16} />
              Permisos de Módulos
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {MODULES.map(module => (
                <button
                  key={module.id}
                  onClick={() => togglePermission(module.id)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-all flex items-center justify-between ${selectedUser?.permissions?.[module.id] ? 'bg-primary/5 border-primary/20 text-primary font-medium' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  <span>{module.label}</span>
                  {selectedUser?.permissions?.[module.id] && <CheckCircle size={14} />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setSelectedUser(null)}
              className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Invitar Nuevo Usuario"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser(p => ({ ...p, email: e.target.value }))}
              placeholder="correo@ejemplo.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser(p => ({ ...p, role: e.target.value as any }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estado Acceso</label>
              <select
                value={newUser.accessStatus}
                onChange={(e) => setNewUser(p => ({ ...p, accessStatus: e.target.value as any }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="approved">Aprobado</option>
                <option value="pending">Pendiente</option>
                <option value="denied">Denegado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Permisos de Módulos</label>
            <div className="grid grid-cols-2 gap-2">
              {MODULES.map(module => (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setNewUser(p => ({
                    ...p,
                    permissions: { ...p.permissions, [module.id]: !p.permissions[module.id] }
                  }))}
                  className={`px-3 py-2 rounded-lg border text-xs text-left flex items-center justify-between transition-all ${newUser.permissions[module.id] ? 'bg-primary/5 border-primary/20 text-primary font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                >
                  {module.label}
                  {newUser.permissions[module.id] && <CheckCircle size={14} />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateUser}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-bold"
            >
              Invitar Usuario
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
