/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
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
  BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Module, Item, Contact, Project, Invoice, Document, Supplier, Employee } from './types';
import CRMView from './components/CRMView';
import InventoryView from './components/InventoryView';
import OperationsView from './components/OperationsView';
import FinanceView from './components/FinanceView';
import DashboardView from './components/DashboardView';
import DocumentsView from './components/DocumentsView';
import SuppliersView from './components/SuppliersView';
import HRView from './components/HRView';

const initialItems: Item[] = [
  { id: '1', name: 'Perfil de Alumino 20x20', category: 'Estructural', stock: 150, unit: 'mts', sku: 'ALU-2020-S', minStock: 50 },
  { id: '2', name: 'Motor Paso a Paso NEMA 23', category: 'Electrónica', stock: 12, unit: 'pzs', sku: 'MOT-N23-H', minStock: 15 },
  { id: '3', name: 'Rodamiento Lineal 8mm', category: 'Mecánica', stock: 85, unit: 'pzs', sku: 'ROD-LIN-08', minStock: 20 },
];

const initialContacts: Contact[] = [
  { id: '1', folio: 'CLI-0001', name: 'Juan Pérez', company: 'Industrias Regias', rutEmpresa: '76.123.456-7', rutContacto: '12.345.678-9', phone: '+569 1234 5678', address: 'Av. Industrial 123, Quilicura', email: 'jperez@regias.com', status: 'customer' },
  { id: '2', folio: 'CLI-0002', name: 'María García', company: 'Logística del Norte', rutEmpresa: '77.234.567-8', rutContacto: '15.678.901-2', phone: '+569 8765 4321', address: 'Ruta 5 Norte Km 12', email: 'mgarcia@lognorte.cl', status: 'opportunity' },
  { id: '3', folio: 'CLI-0003', name: 'Roberto Sánchez', company: 'Minería Real', rutEmpresa: '78.345.678-9', rutContacto: '10.123.456-7', phone: '+569 1111 2222', address: 'Antofagasta 456', email: 'rsanchez@mreal.cl', status: 'lead' },
];

const initialProjects: Project[] = [
  { id: '1', name: 'Automatización Linea 4', location: 'Planta Quilicura', clientResponsible: 'Ing. Rodrigo Díaz', status: 'active', progress: 65, startDate: '10-01-2024', deadline: '20 May 2024', description: 'Renovación de sistema de control hidráulico.' },
  { id: '2', name: 'Instalación Sensores Planta 1', location: 'Maipú', clientResponsible: 'Ana Ortiz', status: 'delayed', progress: 30, startDate: '12-02-2024', deadline: '15 May 2024', description: 'Implementación de red de sensores IoT.' },
  { id: '3', name: 'Mantenimiento Preventivo C2', location: 'Calama', clientResponsible: 'Patricio Soto', status: 'completed', progress: 100, startDate: '01-03-2024', deadline: '10 May 2024', description: 'Servicio técnico trimestral de cabezales.' },
];

const initialInvoices: Invoice[] = [
  { id: 'INV-2024-001', client: 'TechMining S.A.', status: 'Pagado', date: '10 Mar 2024', netAmount: 10420, iva: 1980, totalAmount: 12400 },
  { id: 'INV-2024-002', client: 'Obras Civiles', status: 'Pendiente', date: '12 Mar 2024', netAmount: 7521, iva: 1429, totalAmount: 8950 },
  { id: 'INV-2024-003', client: 'Energía Solar MX', status: 'Vencido', date: '05 Mar 2024', netAmount: 18571, iva: 3529, totalAmount: 22100 },
];

export default function App() {
  const [activeModule, setActiveModule] = useState<Module>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Global Shared State
  const [items, setItems] = useState<Item[]>(initialItems);
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([
    {
      id: 'emp-01',
      firstName: 'Juan',
      lastName: 'Pérez',
      rut: '12.345.678-9',
      position: 'Ingeniero de Proyectos',
      department: 'Ingeniería',
      joinDate: '2023-01-15',
      birthDate: '1990-05-20',
      address: 'Av. Providencia 1234, Santiago',
      phone: '+569 8765 4321',
      email: 'jperez@rescoing.cl',
      afp: 'Habitat',
      health: 'Fonasa',
      civilStatus: 'Casado',
      nationality: 'Chilena',
      status: 'active',
      salary: 1250000,
      vacationDays: 15,
      documents: [
        { id: 'doc-1', name: 'Contrato Indefinido.pdf', type: 'pdf', uploadDate: '15/01/2023', size: '1.2 MB' },
        { id: 'doc-2', name: 'Certificado AFP.pdf', type: 'pdf', uploadDate: '10/05/2024', size: '0.4 MB' }
      ]
    }
  ]);
  const [autoOpenModal, setAutoOpenModal] = useState(false);

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
    { id: 'finance', label: 'Finanzas', icon: BarChart3 },
    { id: 'documents', label: 'Documentos', icon: FileText },
    { id: 'suppliers', label: 'Proveedores', icon: Truck },
    { id: 'hr', label: 'RRHH', icon: UserRound },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 80 }}
        className="bg-white border-r border-slate-200 flex flex-col relative z-50 shrink-0"
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center font-bold text-white shadow-[0_4px_12px_rgba(240,113,6,0.25)] shrink-0 group shadow-lg">
            <motion.div
              animate={{ rotate: [0, 90, 180, 270, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="flex items-center justify-center"
            >
              <Settings size={22} strokeWidth={2.5} />
            </motion.div>
          </div>
          {isSidebarOpen && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col"
            >
              <span className="font-black text-xl tracking-tighter text-slate-900 leading-none">RESCOING</span>
              <span className="text-[10px] font-black text-primary tracking-[0.15em] uppercase mt-0.5">INGENIERÍA CL</span>
            </motion.div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          <p className={`text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2 ${!isSidebarOpen && 'text-center'}`}>
            {isSidebarOpen ? 'Menu Principal' : '...'}
          </p>
          {navItems.map((item) => {
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
            className="w-full flex items-center gap-3 p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
          >
            <Settings size={18} />
            {isSidebarOpen && <span className="font-medium text-sm">Configuración</span>}
          </button>
          <button 
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
              {navItems.find(i => i.id === activeModule)?.label || 'Dashboard'}
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
            <div className="flex items-center gap-3 pl-6 border-l border-slate-100">
              <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-slate-900">Carlos Mendoza</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Director</span>
              </div>
              <div className="w-9 h-9 rounded-full border border-slate-200 bg-slate-100 overflow-hidden ring-2 ring-white">
                <img 
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80" 
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
              {activeModule === 'dashboard' && (
                <DashboardView 
                  projectsCount={projects.filter(p => p.status === 'active').length}
                  lowStockCount={items.filter(i => i.stock <= i.minStock).length}
                  revenue="$124,500.00"
                  onQuickAction={handleQuickAction}
                />
              )}
              {activeModule === 'crm' && (
                <CRMView contacts={contacts} onAdd={setContacts} autoOpen={autoOpenModal} onModalHandled={() => setAutoOpenModal(false)} />
              )}
              {activeModule === 'inventory' && (
                <InventoryView items={items} onAdd={setItems} autoOpen={autoOpenModal} onModalHandled={() => setAutoOpenModal(false)} />
              )}
              {activeModule === 'operations' && (
                <OperationsView projects={projects} onAdd={setProjects} autoOpen={autoOpenModal} onModalHandled={() => setAutoOpenModal(false)} />
              )}
              {activeModule === 'finance' && (
                <FinanceView invoices={invoices} onAdd={setInvoices} autoOpen={autoOpenModal} onModalHandled={() => setAutoOpenModal(false)} />
              )}
              {activeModule === 'documents' && (
                <DocumentsView documents={documents} onUpdate={setDocuments} contacts={contacts} />
              )}
              {activeModule === 'suppliers' && (
                <SuppliersView suppliers={suppliers} onUpdate={setSuppliers} />
              )}
              {activeModule === 'hr' && (
                <HRView employees={employees} onUpdate={setEmployees} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
