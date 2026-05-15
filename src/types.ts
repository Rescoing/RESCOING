export type Module = 'dashboard' | 'crm' | 'inventory' | 'operations' | 'finance' | 'documents' | 'suppliers' | 'hr';

export interface Item {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  sku: string;
  minStock: number;
}

export interface Contact {
  id: string;
  folio: string;
  name: string;
  company: string;
  rutEmpresa: string;
  rutContacto: string;
  phone: string;
  address: string;
  email: string;
  status: 'customer' | 'opportunity' | 'lead';
}

export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  assignedTo?: string;
  dueDate?: string;
}

export interface ProjectDocument {
  id: string;
  name: string;
  type: string;
  uploadDate: string;
  size: string;
}

export interface Project {
  id: string;
  name: string;
  location: string;
  clientResponsible: string;
  status: 'active' | 'delayed' | 'completed' | 'on-hold';
  progress: number;
  startDate: string;
  deadline: string;
  description: string;
  tasks?: ProjectTask[];
  documents?: ProjectDocument[];
  ganttData?: any;
}

export interface Invoice {
  id: string;
  client: string;
  rut?: string;
  status: 'Pagado' | 'Pendiente' | 'Vencido';
  date: string;
  netAmount: number;
  iva: number;
  totalAmount: number;
  siiFolio?: string;
  paymentMethod?: 'Transferencia' | 'Efectivo' | 'Tarjeta' | 'Cheque';
}

export interface Document {
  id: string;
  type: 'quotation' | 'purchase_order' | 'sales_note' | 'invoice' | 'payment_status';
  folio: string;
  clientId: string;
  clientName: string;
  projectId?: string;
  date: string;
  netAmount: number;
  iva: number;
  totalAmount: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'paid' | 'pending';
  paymentMethod?: 'transfer' | 'check' | 'cash' | 'card';
  siiFolio?: string;
  notes?: string;
}

export interface FinanceTask {
  id: string;
  title: string;
  date: string;
  type: 'follow_up' | 'collection' | 'payment_reminder';
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'done';
  relatedDocId?: string;
  clientName: string;
}

export interface FinanceProcess {
  id: string;
  clientName: string;
  projectName?: string;
  currentStage: 'quotation' | 'po_received' | 'payment_status' | 'invoiced' | 'paid';
  updatedAt: string;
  totalValue: number;
  documents: {
    quotationId?: string;
    poId?: string;
    paymentStatusIds: string[];
    invoiceIds: string[];
  };
}

export interface Supplier {
  id: string;
  name: string;
  rutEmpresa: string;
  address: string;
  website: string;
  contactName: string;
  phone: string;
  email: string;
  category: string;
  rating: number;
}

export interface Employee {
  id: string;
  rut: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  joinDate: string;
  birthDate: string;
  address: string;
  phone: string;
  email: string;
  status: 'active' | 'on_leave' | 'terminated';
  afp: 'Modelo' | 'Cuprum' | 'Habitat' | 'PlanVital' | 'ProVida' | 'Uno' | 'Capital';
  health: 'Fonasa' | 'Banmédica' | 'Colmena' | 'Consalud' | 'CruzBlanca' | 'Esencial' | 'Nueva Masvida' | 'Vida Tres';
  civilStatus?: string;
  nationality?: string;
  vacationDays: number;
  salary: number;
  documents?: {
    id: string;
    name: string;
    type: string;
    uploadDate: string;
    size: string;
  }[];
}

export interface Payroll {
  id: string;
  employeeId: string;
  month: string;
  year: number;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netPay: number;
  status: 'draft' | 'paid';
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  location?: { lat: number; lng: number };
}

export interface RiskPreventionRecord {
  id: string;
  type: 'epp' | 'talk' | 'checklist' | 'accident';
  date: string;
  description: string;
  employeeId?: string;
  projectId?: string;
}
