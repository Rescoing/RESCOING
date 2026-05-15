-- SCHEMA PARA SUPABASE - SISTEMA DE GESTIÓN CORPORATIVA (ERP)
-- Generado para: rescoing@gmail.com
-- Fecha: 15 de mayo de 2026

-- 1. EXTENSIONES Y LIMPIEZA (Opcional)
-- create extension if not exists "uuid-ossp";

-- 2. ENUMERACIONES (Custom Types)
CREATE TYPE invoice_status AS ENUM ('Pagado', 'Pendiente', 'Vencido');
CREATE TYPE payment_method AS ENUM ('Transferencia', 'Efectivo', 'Tarjeta', 'Cheque');
CREATE TYPE finance_stage AS ENUM ('quotation', 'po_received', 'payment_status', 'invoiced', 'paid');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE task_status AS ENUM ('pending', 'done', 'in_progress');

-- 3. TABLA: CRM (Contactos)
CREATE TABLE crm_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    company TEXT,
    position TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    status TEXT DEFAULT 'Activo',
    last_contact TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABLA: INVENTARIO
CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    category TEXT,
    stock INTEGER DEFAULT 0,
    unit TEXT,
    min_stock INTEGER DEFAULT 5,
    price DECIMAL(15,2),
    location TEXT,
    last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABLA: PROYECTOS (CORE)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    status TEXT DEFAULT 'En Progreso',
    client TEXT,
    manager TEXT,
    start_date DATE,
    deadline DATE,
    description TEXT,
    gantt_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TABLA: TAREAS DE PROYECTO
CREATE TABLE project_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status task_status DEFAULT 'pending',
    assigned_to TEXT,
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. TABLA: DOCUMENTOS DE PROYECTO
CREATE TABLE project_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_type TEXT,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    file_size TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. TABLA: FINANZAS - FACTURAS
CREATE TABLE invoices (
    id TEXT PRIMARY KEY, -- Formato INV-2024-XXX
    client TEXT NOT NULL,
    status invoice_status DEFAULT 'Pendiente',
    date DATE DEFAULT CURRENT_DATE,
    net_amount DECIMAL(15,2) DEFAULT 0,
    iva DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    payment_method payment_method DEFAULT 'Transferencia',
    sii_folio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. TABLA: FINANZAS - SEGUIMIENTO DE FLUJO (PIPELINE)
CREATE TABLE finance_processes (
    id TEXT PRIMARY KEY, -- PRC-XXX
    client_name TEXT NOT NULL,
    project_name TEXT,
    current_stage finance_stage DEFAULT 'quotation',
    total_value DECIMAL(15,2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- IDs de documentos relacionados guardados como JSONB para flexibilidad
    documents JSONB DEFAULT '{"quotationId": null, "poId": null, "paymentStatusIds": [], "invoiceIds": []}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. TABLA: RECORDATORIOS DE COBRANZA (TAREAS FINANCIERAS)
CREATE TABLE finance_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    due_date DATE,
    type TEXT, -- follow_up, collection, payment_reminder
    priority task_priority DEFAULT 'medium',
    status task_status DEFAULT 'pending',
    client_name TEXT,
    related_doc_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. TABLA: PREVENCIÓN DE RIESGOS
CREATE TABLE risk_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT, -- inspeccion, charla, incidente
    description TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. TABLA: RECURSOS HUMANOS
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    role TEXT,
    department TEXT,
    email TEXT UNIQUE,
    status TEXT DEFAULT 'Activo',
    join_date DATE,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. SEGURIDAD (RLS - Row Level Security)
-- Por defecto restringimos acceso a usuarios autenticados
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Crear políticas básicas (Acceso total para usuarios autenticados)
-- Nota: En producción deberías filtrar por user_id si quieres multi-tenancy
CREATE POLICY "Auth access only" ON crm_contacts FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth access only" ON inventory_items FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth access only" ON projects FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth access only" ON project_tasks FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth access only" ON project_documents FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth access only" ON invoices FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth access only" ON finance_processes FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth access only" ON finance_tasks FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth access only" ON risk_records FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth access only" ON employees FOR ALL TO authenticated USING (true);

-- 14. VISTAS ÚTILES
CREATE VIEW view_project_summary AS
SELECT 
    p.id, 
    p.name, 
    p.client,
    (SELECT count(*) FROM project_tasks t WHERE t.project_id = p.id) as total_tasks,
    (SELECT count(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'done') as finished_tasks,
    (SELECT count(*) FROM project_documents d WHERE d.project_id = p.id) as total_docs
FROM projects p;
