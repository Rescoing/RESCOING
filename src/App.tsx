/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  Settings, 
  FileText, 
  Menu, 
  X,
  TrendingUp,
  Briefcase,
  Layers,
  ChevronRight,
  LogOut,
  Truck,
  UserRound,
  FileCheck,
  ShoppingCart,
  Ticket,
  BarChart3,
  FolderOpen,
  Clock,
  XCircle,
  Shield,
  Bell,
  History,
  Scale
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Module, Item, Contact, Project, Invoice, Document, Supplier, Employee, FinanceProcess, FinanceTask, RiskPreventionRecord } from './types';
import CRMView from './components/CRMView';
import InventoryView from './components/InventoryView';
import OperationsView from './components/OperationsView';
import FinanceView from './components/FinanceView';
import DashboardView from './components/DashboardView';
import DocumentsView from './components/DocumentsView';
import SuppliersView from './components/SuppliersView';
import HRView from './components/HRView';
import LibraryView from './components/LibraryView';
import AdminUsersView from './components/AdminUsersView';
import AuditLogView from './components/AuditLogView';
import AccountingView from './components/AccountingView';
import { FirebaseProvider, useAuth } from './components/FirebaseProvider';
import InternalChatWidget from './components/InternalChatWidget';
import LoginView from './components/LoginView';
import SettingsModal from './components/SettingsModal';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from './lib/firebase';

export default function App() {
  return (
    <FirebaseProvider>
      <AppContent />
    </FirebaseProvider>
  );
}

function AppContent() {
  const { user, profile, loading, logout } = useAuth();
  const [activeModule, setActiveModule] = useState<Module>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Global Shared State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [autoOpenModal, setAutoOpenModal] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useEffect(() => {
    if (!user || (profile?.accessStatus !== 'approved' && profile?.role !== 'admin')) return;
    const q = query(collection(db, 'contacts'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
    }, (error) => {
      console.error("Contacts global listener error:", error);
    });
    return unsubscribe;
  }, [user, profile]);

  useEffect(() => {
    if (!user || (profile?.accessStatus !== 'approved' && profile?.role !== 'admin')) return;
    const q = query(collection(db, 'notifications'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      items.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setNotifications(items);
    }, (error) => {
      console.error("Notifications global listener error:", error);
    });
    return unsubscribe;
  }, [user, profile]);

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter(n => !n.read);
      for (const n of unread) {
        await updateDoc(doc(db, 'notifications', n.id), { read: true });
      }
    } catch (e) {
      console.error("Error marking all read:", e);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) {
      console.error("Error marking read:", e);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (e) {
      console.error("Error deleting notification:", e);
    }
  };

  const handleQuickAction = (action: string) => {
    setAutoOpenModal(true);
    if (action === 'Nuevo Proyecto') setActiveModule('operations');
    if (action === 'Registrar Venta') {
      setActiveModule('finance');
    }
    if (action === 'Pedido Compra') setActiveModule('inventory');
    if (action === 'Ver Reportes') {
      setActiveModule('finance');
      setAutoOpenModal(false);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'crm', label: 'CRM / Ventas', icon: Users },
    { id: 'inventory', label: 'Inventario', icon: Package },
    { id: 'operations', label: 'Operaciones', icon: Briefcase },
    { id: 'finance', label: 'Finanzas y Documentos', icon: BarChart3 },
    { id: 'accounting', label: 'Contabilidad SII', icon: Scale },
    { id: 'suppliers', label: 'Proveedores', icon: Truck },
    { id: 'hr', label: 'RRHH', icon: UserRound },
    { id: 'library', label: 'Biblioteca', icon: FolderOpen },
    { id: 'audit_log', label: 'Auditoría', icon: History },
  ];

  // Filter items by permission
  const finalNavItems = [
    ...navItems.filter(item => {
      // Admins see everything by default, but we can make it more granular if needed.
      // For now, let's ensure permissions are strictly checked for normal users.
      if (profile?.role === 'admin') return true;
      return profile?.permissions?.[item.id] === true;
    }),
    ...(profile?.role === 'admin' ? [{ id: 'admin_users', label: 'Usuarios', icon: Settings }] : [])
  ];

  const hasPermission = (moduleId: string) => {
    if (profile?.role === 'admin') return true;
    return profile?.permissions?.[moduleId] === true;
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Cargando ERP...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const isMasterAdmin = user?.email === 'rescoing@gmail.com';

  if (profile?.accessStatus !== 'approved' && profile?.role !== 'admin' && !isMasterAdmin) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center border border-slate-100"
        >
          <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 ${profile?.accessStatus === 'denied' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
            {profile?.accessStatus === 'denied' ? <XCircle size={40} /> : <Clock size={40} />}
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">
            {profile?.accessStatus === 'denied' ? 'Acceso Denegado' : 'Acceso en Espera'}
          </h2>
          <p className="text-slate-500 mb-8">
            {profile?.accessStatus === 'denied' 
              ? 'Tu acceso a la plataforma ha sido revocado por un administrador.' 
              : 'Un administrador debe aprobar tu cuenta para que puedas acceder al sistema.'}
          </p>
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all"
          >
            <LogOut size={18} />
            Cerrar Sesión
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 80 }}
        className="bg-white border-r border-slate-200 flex flex-col relative z-50 shrink-0"
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center font-bold text-white shadow-[0_4px_12px_rgba(240,113,6,0.25)] shrink-0 group shadow-lg overflow-hidden">
            {profile?.companyLogo ? (
              <img src={profile.companyLogo} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <motion.div
                animate={{ rotate: [0, 90, 180, 270, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="flex items-center justify-center"
              >
                <Settings size={22} strokeWidth={2.5} />
              </motion.div>
            )}
          </div>
          {isSidebarOpen && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col"
            >
              <span className="font-black text-xl tracking-tighter text-slate-900 leading-none truncate max-w-[140px]">
                {profile?.companyName || 'RESCOING'}
              </span>
              <span className="text-[10px] font-black text-primary tracking-[0.15em] uppercase mt-0.5">SISTEMA ERP</span>
            </motion.div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          <p className={`text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2 ${!isSidebarOpen && 'text-center'}`}>
            {isSidebarOpen ? 'Menu Principal' : '...'}
          </p>
          {finalNavItems.map((item) => {
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveModule(item.id as Module)}
                className={`w-full flex items-center gap-3 p-2 rounded-md transition-all relative group
                  ${isActive ? 'bg-slate-100 text-primary shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                `}
              >
                <item.icon size={20} className={isActive ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'} />
                {isSidebarOpen && <span className="font-medium text-sm">{item.label}</span>}
                {isActive && (
                  <motion.div 
                    layoutId="active-indicator"
                    className="absolute left-0 w-1 h-4 bg-primary rounded-r-full"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-6 border-t border-slate-100 flex flex-col gap-1">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
          >
            <Settings size={18} />
            {isSidebarOpen && <span className="font-medium text-sm">Configuración</span>}
          </button>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
          >
            <LogOut size={18} />
            {isSidebarOpen && <span className="font-medium text-sm">Cerrar Sesión</span>}
          </button>
        </div>

        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 shadow-sm hover:text-primary transition-colors"
        >
          {isSidebarOpen ? <X size={12} /> : <Menu size={12} />}
        </button>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between z-40">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">ERP</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-sm font-semibold text-slate-900">
              {finalNavItems.find(i => i.id === activeModule)?.label || 'Dashboard'}
            </span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="relative hidden md:block">
              <input 
                type="text" 
                placeholder="Buscar recursos..." 
                className="w-64 h-9 bg-slate-50 border border-slate-200 rounded-md px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans"
              />
            </div>

            {/* Notification Bell Component */}
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all relative flex items-center justify-center border border-slate-100 bg-slate-50 shadow-sm"
              >
                <Bell size={18} className="text-slate-600" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-500 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white px-0.5 animate-pulse">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              
              <AnimatePresence>
                {isNotificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-80 max-w-sm bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50 text-left min-w-[320px]"
                    >
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <span className="font-bold text-slate-800 text-sm">Avisos y Alertas ({notifications.filter(n => !n.read).length})</span>
                        {notifications.filter(n => !n.read).length > 0 && (
                          <button 
                            onClick={markAllAsRead}
                            className="text-xs text-primary hover:underline font-bold"
                          >
                            Marcar todo leído
                          </button>
                        )}
                      </div>
                      
                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                        {notifications.length > 0 ? (
                          notifications.map((notif) => (
                            <div 
                              key={notif.id} 
                              className={`p-4 hover:bg-slate-50 transition-colors flex gap-3 relative ${!notif.read ? 'bg-indigo-50/10' : ''}`}
                            >
                              {!notif.read && (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
                              )}
                              <div className="flex-1 pl-1">
                                <p className="text-xs font-bold text-slate-950 leading-normal">{notif.title}</p>
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap">{notif.message}</p>
                                <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                                  {notif.createdAt?.seconds ? new Date(notif.createdAt.seconds * 1000).toLocaleString() : 'Recién'}
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 shrink-0 justify-center">
                                {!notif.read && (
                                  <button 
                                    onClick={() => markAsRead(notif.id)}
                                    className="p-1 hover:bg-slate-200 rounded text-primary transition-colors-all"
                                    title="Marcar leído"
                                  >
                                    <FileCheck size={14} />
                                  </button>
                                )}
                                <button 
                                  onClick={() => deleteNotification(notif.id)}
                                  className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-rose-600 transition-colors-all"
                                  title="Eliminar"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center text-slate-400">
                            <Bell size={28} className="mx-auto mb-2 opacity-30" />
                            <p className="text-xs font-medium">No hay alertas en el sistema</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-3 pl-6 border-l border-slate-100">
              <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-slate-900">{profile?.displayName || user?.displayName || 'Usuario'}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user?.email}</span>
              </div>
              <div 
                onClick={() => setIsSettingsOpen(true)}
                className="w-9 h-9 rounded-full border border-slate-200 bg-slate-100 overflow-hidden ring-2 ring-white cursor-pointer hover:ring-primary/50 transition-all"
              >
                <img 
                  src={profile?.photoURL || user?.photoURL || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80"} 
                  alt="Profile"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-auto p-8 lg:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto h-full"
            >
              {activeModule === 'dashboard' && hasPermission('dashboard') && (
                <DashboardView 
                  onQuickAction={handleQuickAction}
                />
              )}
              {activeModule === 'crm' && hasPermission('crm') && (
                <CRMView autoOpen={autoOpenModal} onModalHandled={() => setAutoOpenModal(false)} />
              )}
              {activeModule === 'inventory' && hasPermission('inventory') && (
                <InventoryView autoOpen={autoOpenModal} onModalHandled={() => setAutoOpenModal(false)} />
              )}
              {activeModule === 'operations' && hasPermission('operations') && (
                <OperationsView 
                  autoOpen={autoOpenModal} 
                  onModalHandled={() => setAutoOpenModal(false)} 
                  contacts={contacts}
                />
              )}
              {activeModule === 'finance' && hasPermission('finance') && (
                <FinanceView 
                  autoOpen={autoOpenModal} 
                  onModalHandled={() => setAutoOpenModal(false)} 
                  contacts={contacts}
                />
              )}
              {activeModule === 'accounting' && hasPermission('accounting') && (
                <AccountingView />
              )}
              {activeModule === 'suppliers' && hasPermission('suppliers') && (
                <SuppliersView />
              )}
              {activeModule === 'hr' && hasPermission('hr') && (
                <HRView />
              )}
              {activeModule === 'library' && hasPermission('library') && (
                <LibraryView />
              )}
              {activeModule === 'audit_log' && hasPermission('audit_log') && (
                <AuditLogView />
              )}
              {activeModule === 'admin_users' && profile?.role === 'admin' && (
                <AdminUsersView />
              )}
              
              {/* Fallback for unauthorized access */}
              {activeModule !== 'admin_users' && !hasPermission(activeModule) && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <Shield size={48} className="mb-4 opacity-20" />
                  <p className="font-bold uppercase tracking-widest text-xs">Acceso Restringido</p>
                  <p className="text-sm mt-1">No tienes permisos para ver este módulo.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        <InternalChatWidget />
      </main>
    </div>
  );
}
