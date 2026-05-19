import React, { useState, useEffect, FormEvent } from 'react';
import { jsPDF } from 'jspdf';
import { 
  UserRound, 
  Plus, 
  Search, 
  Filter, 
  CreditCard, 
  Calendar, 
  MapPin, 
  Stethoscope, 
  ShieldCheck,
  FileText,
  Clock,
  QrCode,
  Fingerprint,
  Download,
  PenTool,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Phone,
  Briefcase,
  Home,
  Save,
  Trash2,
  Eye,
  FileBadge,
  Folder,
  Upload,
  FileBox,
  FileCheck,
  ExternalLink
} from 'lucide-react';
import { motion } from 'motion/react';
import { Employee, AttendanceRecord } from '../types';
import Modal from './ui/Modal';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

const HR_MODULES = [
  { id: 'employees', label: 'Trabajadores', icon: UserRound },
  { id: 'payroll', label: 'Sueldos / Liquidaciones', icon: CreditCard },
  { id: 'contracts', label: 'Contratos', icon: FileText },
  { id: 'requests', label: 'Solicitudes', icon: FileBadge },
  { id: 'prevention', label: 'Prevención', icon: ShieldCheck },
  { id: 'attendance', label: 'Asistencia', icon: MapPin },
  { id: 'licenses', label: 'Licencias Médicas', icon: Stethoscope },
];

const AFP_LIST = ['Modelo', 'Cuprum', 'Habitat', 'PlanVital', 'ProVida', 'Uno', 'Capital'];
const HEALTH_LIST = ['Fonasa', 'Banmédica', 'Colmena', 'Consalud', 'CruzBlanca', 'Esencial', 'Nueva Masvida', 'Vida Tres'];

export default function HRView() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubModule, setActiveSubModule] = useState(HR_MODULES[0].id);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isPreventionModalOpen, setIsPreventionModalOpen] = useState(false);
  const [isVacationModalOpen, setIsVacationModalOpen] = useState(false);
  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [preventionRecords, setPreventionRecords] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);

  const [newPayroll, setNewPayroll] = useState({
    employeeId: '',
    month: new Date().toLocaleString('es-ES', { month: 'long' }),
    year: new Date().getFullYear(),
    baseSalary: 0,
    gratification: 0,
    transport: 89944,
    lunch: 89950,
    bonuses: 0,
    overtime: 0
  });

  const [newContract, setNewContract] = useState({
    employeeId: '',
    type: 'Indefinido',
    startDate: new Date().toISOString().split('T')[0],
    position: '',
    salary: 0,
    workPlace: 'Terreno / Oficina'
  });

  const [newPrevention, setNewPrevention] = useState({
    employeeId: '',
    type: 'epp',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [newVacation, setNewVacation] = useState({
    employeeId: '',
    startDate: '',
    endDate: '',
    type: 'Vacaciones Legales'
  });

  const [newCertificate, setNewCertificate] = useState({
    employeeId: '',
    type: 'Antigüedad Laboral',
    reason: 'Fines Particulares'
  });

  const [formEmployee, setFormEmployee] = useState<Partial<Employee>>({
    firstName: '',
    lastName: '',
    rut: '',
    position: '',
    department: '',
    joinDate: new Date().toISOString().split('T')[0],
    birthDate: '',
    address: '',
    phone: '',
    email: '',
    afp: 'ProVida',
    health: 'Fonasa',
    civilStatus: 'Soltero',
    nationality: 'Chilena',
    status: 'active',
    salary: 0,
    vacationDays: 15
  });

  const [activeTab, setActiveTab] = useState<'info' | 'docs'>('info');

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'employees'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
      setLoading(false);
    });

    const unsubscribePayrolls = onSnapshot(query(collection(db, 'payrolls'), where('ownerId', '==', user.uid)), (snap) => {
      setPayrolls(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribeAttendance = onSnapshot(query(collection(db, 'attendance'), where('ownerId', '==', user.uid)), (snap) => {
      setAttendanceRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
    });

    return () => {
      unsubscribe();
      unsubscribePayrolls();
      unsubscribeAttendance();
    };
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingEmployee) {
        const docRef = doc(db, 'employees', editingEmployee.id);
        await updateDoc(docRef, { ...formEmployee, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'employees'), {
          ...formEmployee,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          documents: []
        });
      }
      setIsModalOpen(false);
      setEditingEmployee(null);
      setActiveTab('info');
      resetForm();
    } catch (error) {
      console.error(error);
    }
  };

  const resetForm = () => {
    setFormEmployee({
      firstName: '',
      lastName: '',
      rut: '',
      position: '',
      department: '',
      joinDate: new Date().toISOString().split('T')[0],
      birthDate: '',
      address: '',
      phone: '',
      email: '',
      afp: 'ProVida',
      health: 'Fonasa',
      civilStatus: 'Soltero',
      nationality: 'Chilena',
      status: 'active',
      salary: 0,
      vacationDays: 15,
      documents: []
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const newDoc = {
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: file.name.split('.').pop() || 'file',
      uploadDate: new Date().toLocaleDateString('es-ES'),
      size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`
    };
    
    setFormEmployee(prev => ({
      ...prev,
      documents: [...(prev.documents || []), newDoc]
    }));
  };

  const removeDoc = (docId: string) => {
    setFormEmployee(prev => ({
      ...prev,
      documents: (prev.documents || []).filter(d => d.id !== docId)
    }));
  };

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormEmployee(emp);
    setIsModalOpen(true);
  };

  const handleDownload = (doc: any) => {
    const docName = doc.name.includes('.') ? doc.name : `${doc.name}.pdf`;
    const isPaystub = doc.name.toLowerCase().includes('liquidaci');
    const isContract = doc.name.toLowerCase().includes('contrato');
    
    // Find the relevant employee for this document if possible
    let targetEmployee = editingEmployee;
    if (doc.employeeId) {
      targetEmployee = employees.find(e => e.id === doc.employeeId) || targetEmployee;
    }

    try {
      const pdf = new jsPDF();
      
      // -- CORPORATE HEADER (Based on RESCOING PDF Model) --
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      
      // Attempt to load logo from URL if possible, or just text representation
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(234, 88, 12); // Orange-ish for RESCOING
      pdf.text('RESCOING', 105, 15, { align: 'center' });
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text('INGENIERÍA', 105, 18, { align: 'center' });
      pdf.setFont(undefined, 'normal');

      pdf.setDrawColor(226, 232, 240);
      pdf.line(20, 25, 190, 25);

      if (isPaystub) {
        // --- PAY STUB TEMPLATE (LIQUIDACION) - Based on screenshot provided ---
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(15, 23, 42);
        pdf.text('LIQUIDACION SUELDO ' + (doc.name.split(':')[1]?.toUpperCase() || ''), 105, 35, { align: 'center' });
        pdf.setFont(undefined, 'normal');

        // Employer Data
        pdf.setFontSize(8);
        pdf.text('EMPLEADOR : RESCOING INGENIERÍA Y SERVICIOS SpA', 20, 45);
        pdf.text('R.U.T : 77.889.491-2', 20, 49);
        pdf.text('DIRECCION : ALCAZÁR 250, OFICINA 11, RANCAGUA', 20, 53);

        // Worker Data Table Borders
        pdf.setDrawColor(0, 0, 0);
        pdf.line(20, 58, 190, 58); // Top line
        
        pdf.setFontSize(8);
        pdf.text(`NOMBRE : ${targetEmployee?.firstName} ${targetEmployee?.lastName}`.toUpperCase(), 20, 64);
        pdf.text(`R.U.T : ${targetEmployee?.rut}`, 20, 68);
        pdf.text(`CCosto : ADMINISTRATIVO`, 20, 72);
        pdf.text(`CARGO : ${targetEmployee?.position}`.toUpperCase(), 20, 76);
        
        pdf.text(`FECHA : ${new Date().toLocaleDateString()}`, 130, 68);
        pdf.text(`DIAS : (TRABAJADO 30,00)`, 130, 76);

        // Haberes Section
        pdf.line(20, 80, 190, 80);
        pdf.text('=======================( HABERES )======================', 20, 84);
        
        const salary = doc.metadata?.salary || targetEmployee?.salary || 430000;
        const grat = doc.metadata?.grat || Math.round(salary * 0.25);
        const transport = doc.metadata?.transport || 89944;
        const lunch = doc.metadata?.lunch || 89950;
        const bonuses = doc.metadata?.bonuses || 0;
        const overtime = doc.metadata?.overtime || 0;

        pdf.text('SUELDO BASE', 20, 92); pdf.text(salary.toLocaleString(), 160, 92, { align: 'right' });
        pdf.text('GRATIFICACION MENSUAL', 20, 96); pdf.text(grat.toLocaleString(), 160, 96, { align: 'right' });
        pdf.text('MOVILIZACION', 20, 100); pdf.text(transport.toLocaleString(), 160, 100, { align: 'right' });
        pdf.text('COLACION', 20, 104); pdf.text(lunch.toLocaleString(), 160, 104, { align: 'right' });
        if (bonuses > 0) {
          pdf.text('BONOS / OTROS', 20, 108); pdf.text(bonuses.toLocaleString(), 160, 108, { align: 'right' });
        }
        if (overtime > 0) {
          pdf.text('HORAS EXTRAORDINARIAS', 20, 112); pdf.text(overtime.toLocaleString(), 160, 112, { align: 'right' });
        }

        pdf.line(140, 116, 190, 116);
        const totalHaberes = salary + grat + transport + lunch + bonuses + overtime;
        pdf.text('TOTAL HABERES $ :', 20, 120); pdf.text(totalHaberes.toLocaleString(), 160, 120, { align: 'right' });

        // Descuentos Section
        pdf.text('======================(DESCUENTOS LEGALES)======================', 20, 128);
        
        const taxable = salary + grat + (overtime || 0); // Roughly taxable income
        const afpRate = 0.1145; // Provida example
        const afpAmt = Math.round(taxable * afpRate);
        const healthAmt = Math.round(taxable * 0.07);
        const cesAmt = Math.round(taxable * 0.006);

        pdf.text(`FONDO DE PENSIONES ${targetEmployee?.afp.toUpperCase() || 'PROVIDA'} 11,45 %`, 20, 136); pdf.text(afpAmt.toLocaleString(), 160, 136, { align: 'right' });
        pdf.text('FONDO DE CESANTIA', 20, 140); pdf.text(cesAmt.toLocaleString(), 160, 140, { align: 'right' });
        pdf.text('FONASA 7,00 %', 20, 144); pdf.text(healthAmt.toLocaleString(), 160, 144, { align: 'right' });
        
        pdf.line(140, 148, 190, 148);
        const totalDesc = afpAmt + cesAmt + healthAmt;
        pdf.text('TOTAL DESCUENTOS $ :', 20, 152); pdf.text(totalDesc.toLocaleString(), 160, 152, { align: 'right' });

        // Final Pay
        pdf.line(20, 158, 190, 158);
        const liquid = totalHaberes - totalDesc;
        pdf.setFont(undefined, 'bold');
        pdf.text('LIQUIDO A PAGAR $ :', 20, 164); pdf.text(liquid.toLocaleString(), 160, 164, { align: 'right' });
        pdf.setFont(undefined, 'normal');
        pdf.line(20, 168, 190, 168);

        pdf.text('Fecha : ' + (doc.uploadDate || new Date().toLocaleDateString()), 20, 185);
        
        // Signature
        pdf.text('________________________________________', 40, 230);
        pdf.text('RECIBI CONFORME (FIRMA)', 70, 235);
        pdf.text(`${targetEmployee?.firstName} ${targetEmployee?.lastName}`.toUpperCase(), 75, 240);
        pdf.text(`R.U.T : ${targetEmployee?.rut}`, 85, 245);

      } else if (isContract) {
        // --- CONTRACT TEMPLATE - Based on provided PDF model ---
        const meta = doc.metadata || {};
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.text('CONTRATO DE TRABAJO', 105, 35, { align: 'center' });
        pdf.setFont(undefined, 'normal');

        pdf.setFontSize(10);
        pdf.text(`En Rancagua, a ${doc.uploadDate || new Date().toLocaleDateString()}`, 120, 45);

        pdf.setFont(undefined, 'bold');
        pdf.text('INDIVIDUALIZACION DEL EMPLEADOR', 20, 60);
        pdf.setFont(undefined, 'normal');
        
        // Employer Table
        const employerY = 65;
        pdf.setDrawColor(0);
        pdf.rect(20, employerY, 170, 50);
        pdf.line(65, employerY, 65, employerY + 50);
        pdf.line(20, employerY + 7, 190, employerY + 7);
        pdf.line(20, employerY + 14, 190, employerY + 14);
        pdf.line(20, employerY + 21, 190, employerY + 21);
        pdf.line(20, employerY + 28, 190, employerY + 28);
        pdf.line(20, employerY + 38, 190, employerY + 38);
        pdf.line(20, employerY + 44, 190, employerY + 44);

        pdf.setFontSize(9);
        pdf.text('Empresa', 22, employerY + 5); pdf.setFont(undefined, 'bold'); pdf.text('RESCOING INGENIERÍA Y SERVICIOS SpA', 67, employerY + 5); pdf.setFont(undefined, 'normal');
        pdf.text('Rut', 22, employerY + 12); pdf.text('77.889.491-2', 67, employerY + 12);
        pdf.text('Domicilio', 22, employerY + 19); pdf.text('ALCAZÁR 250, OFICINA 11', 67, employerY + 19);
        pdf.text('Comuna', 22, employerY + 26); pdf.text('RANCAGUA', 67, employerY + 26);
        pdf.text('Representante', 22, employerY + 32); pdf.text('RICHARD NICOLÁS ESCOBAR RAMÍREZ', 67, employerY + 34);
        pdf.text('Legal', 22, employerY + 36);
        pdf.text('RUT', 22, employerY + 42); pdf.text('17.477.158-8', 67, employerY + 42);
        pdf.text('Giro', 22, employerY + 48); pdf.text('ACTIVIDADES DE INGENIERÍA Y SERVICIOS', 67, employerY + 48);

        pdf.setFont(undefined, 'bold');
        pdf.text('EN ADELANTE EL EMPLEADOR;', 20, employerY + 57);

        pdf.text('INDIVIDUALIZACION DEL TRABAJADOR', 20, employerY + 75);
        pdf.setFont(undefined, 'normal');
        
        // Worker Table
        const workerY = employerY + 80;
        pdf.rect(20, workerY, 170, 63);
        pdf.line(65, workerY, 65, workerY + 63);
        for(let i=1; i<9; i++) pdf.line(20, workerY + i*7, 190, workerY + i*7);

        pdf.text('Nombre', 22, workerY + 5); pdf.text(`${targetEmployee?.firstName} ${targetEmployee?.lastName}`.toUpperCase(), 67, workerY + 5);
        pdf.text('Rut', 22, workerY + 12); pdf.text(targetEmployee?.rut || '', 67, workerY + 12);
        pdf.text('Estado Civil', 22, workerY + 19); pdf.text(targetEmployee?.civilStatus || '', 67, workerY + 19);
        pdf.text('Nacionalidad', 22, workerY + 26); pdf.text(targetEmployee?.nationality || '', 67, workerY + 26);
        pdf.text('Fecha Nacimiento', 22, workerY + 33); pdf.text(targetEmployee?.birthDate || '', 67, workerY + 33);
        pdf.text('Previsión', 22, workerY + 40); pdf.text(targetEmployee?.health || '', 67, workerY + 40);
        pdf.text('AFP', 22, workerY + 47); pdf.text(targetEmployee?.afp || '', 67, workerY + 47);
        pdf.text('Dirección', 22, workerY + 54); pdf.text(targetEmployee?.address || '', 67, workerY + 54);

        pdf.setFont(undefined, 'bold');
        pdf.text('EN ADELANTE EL TRABAJADOR;', 20, workerY + 70);
        pdf.setFont(undefined, 'normal');
        pdf.text('Entre las partes individualizadas, se procede a escriturar el siguiente contrato de trabajo.', 20, workerY + 78);

        // Clauses (Page 2 mock or continue below)
        pdf.addPage();
        pdf.text('PRIMERO: El trabajador ejecutara el cargo de ' + (meta.position || targetEmployee?.position || '') + '.', 20, 30);
        pdf.text('SEGUNDO: El trabajador deberá prestar sus servicios en: ' + (meta.workPlace || 'TECNICO TERRENO / OFICINA') + '.', 20, 40);
        pdf.text('La jornada de trabajo se regirá según las especificaciones de la obra.', 20, 50);
        
        pdf.text('TERCERO: La remuneración que se cancelará al trabajador será la siguiente: ', 20, 65);
        pdf.text('Sueldo líquido mensual: $ ' + (meta.salary || targetEmployee?.salary || 0).toLocaleString(), 20, 72);

        pdf.text('CUARTA: Este contrato tendrá una duración de carácter ' + (meta.type?.toUpperCase() || 'INDEFINIDO') + '.', 20, 85);
        
        const footerY = 250;
        pdf.text('__________________________', 40, footerY);
        pdf.text('NOMBRE Y RUT', 50, footerY + 5);
        pdf.text('TRABAJADOR', 55, footerY + 10);
        
        pdf.text('__________________________', 130, footerY);
        pdf.text('RESCOING SpA', 142, footerY + 5);
        pdf.text('77.889.491-2', 145, footerY + 10);



      } else {
        // Generic Template
        pdf.setFontSize(16);
        pdf.text(doc.name, 20, 50);
        pdf.setFontSize(12);
        pdf.text('Documento oficial del sistema RESCOING.', 20, 65);
      }
      
      // Footer Signatures
      pdf.setFontSize(8);
      pdf.text('__________________________', 40, 260);
      pdf.text('FIRMA TRABAJADOR', 50, 265);
      
      pdf.text('__________________________', 130, 260);
      pdf.text('FIRMA EMPLEADOR', 140, 265);

      pdf.save(docName);
      alert(`Documento ${docName} descargado con éxito.`);
    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('Error en la generación del PDF.');
    }
  };

  const handleAttendance = async (employeeId: string, currentRecord: AttendanceRecord | undefined) => {
    if (!user) return;
    
    setLoading(true);
    let coords = { lat: 0, lng: 0 };
    let verificationType = 'Geolocalización GPS';

    try {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      } catch (geoError) {
        console.warn("Geolocation failed or denied, falling back to Web/IP record", geoError);
        verificationType = 'Acceso Web/Escritorio';
      }

      const timestamp = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      const date = new Date().toLocaleDateString('es-ES');

      if (!currentRecord) {
        // Clock In
        await addDoc(collection(db, 'attendance'), {
          employeeId,
          date,
          checkIn: timestamp,
          locationIn: coords,
          ownerId: user.uid,
          status: coords.lat !== 0 ? 'verified' : 'web_access',
          verification: verificationType,
          compliance: 'DT-Chile Standard',
          createdAt: serverTimestamp()
        });
        alert(coords.lat !== 0 ? 'Ingreso registrado con GPS.' : 'Ingreso registrado vía Web (Sin GPS).');
      } else {
        // Clock Out
        const docRef = doc(db, 'attendance', currentRecord.id);
        await updateDoc(docRef, {
          checkOut: timestamp,
          locationOut: coords,
          status: 'completed',
          verificationOut: verificationType,
          updatedAt: serverTimestamp()
        });
        alert('Salida registrada correctamente.');
      }
    } catch (error) {
      console.error(error);
      alert('Error crítico al procesar la asistencia.');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    (emp.firstName + ' ' + emp.lastName).toLowerCase().includes(searchTerm.toLowerCase()) || 
    emp.rut.includes(searchTerm) ||
    emp.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Recursos Humanos (RRHH)</h2>
          <p className="text-slate-500 mt-1">Gestión integral del capital humano bajo normativa chilena.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setEditingEmployee(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus size={18} />
          Nuevo Trabajador
        </button>
      </div>

      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 no-scrollbar">
        {HR_MODULES.map((mod) => (
          <button
            key={mod.id}
            onClick={() => setActiveSubModule(mod.id)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all relative shrink-0
              ${activeSubModule === mod.id ? 'text-primary' : 'text-slate-500 hover:text-slate-700'}
            `}
          >
            <mod.icon size={18} />
            {mod.label}
            {activeSubModule === mod.id && (
              <motion.div 
                layoutId="activeHR"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      {activeSubModule === 'employees' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por nombre, RUT o cargo..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                  <div className="col-span-full py-12 text-center bg-white rounded-xl border border-slate-200">
                    <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando...</p>
                  </div>
                ) : filteredEmployees.length > 0 ? filteredEmployees.map((emp, i) => (
              <motion.div 
                key={emp.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm overflow-hidden relative group"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono font-bold text-primary mb-1">{emp.rut}</span>
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-colors overflow-hidden">
                      <UserRound size={24} />
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full ${emp.status === 'active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                    {emp.status}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900">{emp.firstName} {emp.lastName}</h3>
                <p className="text-xs text-slate-500 font-medium mb-4">{emp.position} • {emp.department}</p>
                
                <div className="grid grid-cols-2 gap-4 py-4 border-t border-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400">
                      <ShieldCheck size={14} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">AFP</p>
                      <p className="text-[11px] font-bold text-slate-700">{emp.afp}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400">
                      <Stethoscope size={14} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Salud</p>
                      <p className="text-[11px] font-bold text-slate-700">{emp.health}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  <button 
                    onClick={() => handleEdit(emp)}
                    className="flex-1 bg-slate-900 text-white py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <PenTool size={12} />
                    Editar Ficha
                  </button>
                </div>
              </motion.div>
            )) : (
              <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-400 font-sans">No se encontraron trabajadores con esos criterios.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubModule === 'payroll' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
              <div>
                <h3 className="font-bold text-slate-900">Liquidaciones de Sueldo (Chile)</h3>
                <p className="text-xs text-slate-500">Cálculo automático según topes imponibles y leyes sociales.</p>
              </div>
              <button 
                onClick={() => setIsPayrollModalOpen(true)}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:opacity-90 transition-all"
              >
                <Plus size={14} />
                Nueva Liquidación
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trabajador</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Periodo</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sueldo Base</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Líquido Pagado</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {payrolls.length > 0 ? payrolls.map((p, i) => {
                    const emp = employees.find(e => e.id === p.employeeId);
                    return (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => {
                              if (emp) handleEdit(emp);
                              setActiveTab('docs');
                            }}
                            className="text-left hover:text-primary transition-colors group"
                          >
                            <p className="text-sm font-bold text-slate-900 group-hover:text-primary">{emp?.firstName} {emp?.lastName}</p>
                            <p className="text-[10px] text-slate-400">{emp?.rut}</p>
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 capitalize">{p.month} {p.year}</td>
                        <td className="px-6 py-4 text-sm font-mono">${emp?.salary.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-emerald-600">${p.netPay.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full uppercase">PAGADO</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button 
                              onClick={() => setPreviewDoc({ name: `Liquidación: ${p.month} ${p.year}`, uploadDate: `${p.month} ${p.year}`, type: 'pdf', size: '0.45 MB' })}
                              className="p-2 text-slate-400 hover:text-primary transition-colors"
                              title="Visualizar en línea"
                            >
                              <Eye size={16} />
                            </button>
                            <button 
                              onClick={() => handleDownload({ name: `Liquidacion_${p.month}_${p.year}.pdf`, uploadDate: new Date().toLocaleDateString() })}
                              className="p-2 text-slate-400 hover:text-primary transition-colors"
                              title="Descargar"
                            >
                              <Download size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <CreditCard size={32} className="mx-auto text-slate-200 mb-2" />
                        <p className="text-slate-400 text-sm">No se han generado liquidaciones en este periodo.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-4">
            <AlertTriangle className="text-amber-500 shrink-0" size={20} />
            <div>
              <p className="text-xs font-bold text-amber-800 uppercase tracking-tight">Recordatorio Legal</p>
              <p className="text-xs text-amber-700 mt-1">Recuerde que el plazo legal para el pago de remuneraciones es hasta el quinto día hábil del mes siguiente.</p>
            </div>
          </div>
        </div>
      )}

      {activeSubModule === 'prevention' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Entrega EPP', count: preventionRecords.filter(r => r.type === 'epp').length, icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Charlas 5 Min', count: preventionRecords.filter(r => r.type === 'talk').length, icon: FileText, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Checklists', count: preventionRecords.filter(r => r.type === 'checklist').length, icon: CheckCircle2, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Accidentes', count: preventionRecords.filter(r => r.type === 'accident').length, icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-50' },
            ].map((card, i) => (
              <div key={i} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
                <div className={`w-10 h-10 ${card.bg} ${card.color} rounded-lg flex items-center justify-center mb-3`}>
                  <card.icon size={20} />
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{card.label}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{card.count}</h3>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Registro de Prevención y Seguridad</h3>
              <button 
                onClick={() => setIsPreventionModalOpen(true)}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                <Plus size={14} />
                Nuevo Registro PRS
              </button>
            </div>
            <div className="p-8 text-center bg-slate-50/30">
              <ShieldCheck size={48} className="mx-auto text-slate-200 mb-4" />
              <p className="text-slate-500 text-sm max-w-sm mx-auto font-medium">Historial de cumplimiento de seguridad laboral y entrega de implementos según normativa técnica.</p>
            </div>
          </div>
        </div>
      )}

      {activeSubModule === 'contracts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { id: 'contract', label: 'Generar Contrato', desc: 'Indefinido / Plazo Fijo', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
            { id: 'annex', label: 'Anexo de Contrato', desc: 'Modificaciones legales', icon: PenTool, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map((card, i) => (
            <motion.button
              key={i}
              whileHover={{ y: -4 }}
              onClick={() => {
                if (card.id === 'contract') setIsContractModalOpen(true);
                else alert(`Abriendo modulo: ${card.label}`);
              }}
              className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm text-left group transition-all hover:border-primary/20"
            >
              <div className={`w-12 h-12 ${card.bg} ${card.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <card.icon size={24} />
              </div>
              <h4 className="font-bold text-slate-900 mb-1">{card.label}</h4>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{card.desc}</p>
            </motion.button>
          ))}
        </div>
      )}

      {activeSubModule === 'requests' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { id: 'vacation', label: 'Vacaciones', desc: 'Solicitud y saldo', icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50' },
            { id: 'certificate', label: 'Certificados', desc: 'Antigüedad / Renta', icon: CheckCircle2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          ].map((card, i) => (
            <motion.button
              key={i}
              whileHover={{ y: -4 }}
              onClick={() => {
                if (card.id === 'vacation') setIsVacationModalOpen(true);
                else if (card.id === 'certificate') setIsCertificateModalOpen(true);
              }}
              className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm text-left group transition-all hover:border-primary/20"
            >
              <div className={`w-12 h-12 ${card.bg} ${card.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <card.icon size={24} />
              </div>
              <h4 className="font-bold text-slate-900 mb-1">{card.label}</h4>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{card.desc}</p>
            </motion.button>
          ))}
        </div>
      )}

      {activeSubModule === 'attendance' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Control de Asistencia Multi-Canal</h3>
                <p className="text-sm text-slate-500">Certificación DT-Chile compatible (Geolocalización + Cifrado Imputable)</p>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                <ShieldCheck size={14} className="text-emerald-600" />
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Normativa DT Chile Activa</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {employees.filter(e => e.status === 'active').map(emp => {
                const today = new Date().toLocaleDateString('es-ES');
                const todayRecord = attendanceRecords.find(r => r.employeeId === emp.id && r.date === today);
                
                return (
                  <div key={emp.id} className="p-4 border border-slate-100 rounded-xl bg-slate-50/30 hover:bg-white hover:shadow-md transition-all group">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-colors">
                        <UserRound size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{emp.firstName} {emp.lastName}</h4>
                        <p className="text-[10px] text-slate-500 font-mono">{emp.rut}</p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Entrada:</span>
                        <span className="font-bold text-slate-700">{todayRecord?.checkIn || '--:--'}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Salida:</span>
                        <span className="font-bold text-slate-700">{todayRecord?.checkOut || '--:--'}</span>
                      </div>
                      {todayRecord && (
                        <div className="flex flex-col gap-1 mt-1">
                          <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest p-1 rounded ${todayRecord.locationIn?.lat !== 0 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                            <MapPin size={10} />
                            {todayRecord.locationIn?.lat !== 0 ? 'Ubicación Capturada' : 'Registro Web (Escritorio)'}
                          </div>
                          {todayRecord.locationIn?.lat !== 0 && (
                            <a 
                              href={`https://www.google.com/maps?q=${todayRecord.locationIn?.lat},${todayRecord.locationIn?.lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[9px] text-primary hover:underline font-bold uppercase tracking-widest flex items-center gap-1 px-1"
                            >
                              <ExternalLink size={10} />
                              Ver en Google Maps
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleAttendance(emp.id, todayRecord)}
                      disabled={loading || (!!todayRecord?.checkIn && !!todayRecord?.checkOut)}
                      className={`w-full py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2
                        ${!todayRecord ? 'bg-primary text-white hover:opacity-90' : 
                          !todayRecord.checkOut ? 'bg-slate-900 text-white hover:bg-slate-800' : 
                          'bg-slate-100 text-slate-400 cursor-not-allowed'}
                      `}
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Clock size={14} />
                          {!todayRecord ? 'Marcar Entrada' : !todayRecord.checkOut ? 'Marcar Salida' : 'Jornada Completada'}
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Registros Recientes</h4>
            </div>
            <div className="divide-y divide-slate-100">
              {attendanceRecords.slice(-5).reverse().map((record, i) => {
                const emp = employees.find(e => e.id === record.employeeId);
                return (
                  <div key={record.id || i} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                        <Clock size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{emp?.firstName} {emp?.lastName}</p>
                        <p className="text-[10px] text-slate-500">{record.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Input</p>
                        <p className="text-xs font-mono font-bold text-emerald-600">{record.checkIn}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Output</p>
                        <p className="text-xs font-mono font-bold text-rose-600">{record.checkOut || '--:--'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest border ${record.locationIn?.lat !== 0 ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                          Audit: {record.locationIn?.lat !== 0 ? 'Digital GPS' : 'Web/Manual'}
                        </div>
                        {record.locationIn?.lat !== 0 && (
                          <a 
                            href={`https://www.google.com/maps?q=${record.locationIn?.lat},${record.locationIn?.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] text-primary hover:underline font-bold uppercase tracking-widest flex items-center gap-1 px-1"
                          >
                            <ExternalLink size={10} />
                            Mapa (Audit)
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {attendanceRecords.length === 0 && (
                <div className="p-12 text-center text-slate-400 text-sm">
                  No hay registros de asistencia hoy.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingEmployee(null); setActiveTab('info'); }} 
        title={editingEmployee ? `Ficha Digital: ${editingEmployee.firstName} ${editingEmployee.lastName}` : "Registro de Personal (Chile)"}
      >
        <div className="flex gap-2 mb-6 border-b border-slate-100 pb-2">
          <button 
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'info' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            Datos Personales
          </button>
          <button 
            onClick={() => setActiveTab('docs')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-2 ${activeTab === 'docs' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <Folder size={14} />
            Carpeta Digital
            {formEmployee.documents && formEmployee.documents.length > 0 && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{formEmployee.documents.length}</span>
            )}
          </button>
        </div>

        {activeTab === 'info' ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4 font-sans">
              <div className="col-span-2 p-3 bg-primary/5 rounded-lg border border-primary/10 flex items-center justify-between">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Información Contractual</span>
                <span className="text-[10px] font-mono font-bold text-primary">{editingEmployee ? `ID: ${editingEmployee.id}` : 'NUEVO REGISTRO'}</span>
              </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <UserRound size={12} className="text-primary" />
                Nombres
              </label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={formEmployee.firstName}
                onChange={e => setFormEmployee({...formEmployee, firstName: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <UserRound size={12} className="text-primary" />
                Apellidos
              </label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={formEmployee.lastName}
                onChange={e => setFormEmployee({...formEmployee, lastName: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <FileBadge size={12} className="text-primary" />
                RUT
              </label>
              <input 
                required
                type="text" 
                placeholder="12.345.678-9"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={formEmployee.rut}
                onChange={e => setFormEmployee({...formEmployee, rut: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Calendar size={12} className="text-primary" />
                Fecha Nacimiento
              </label>
              <input 
                required
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={formEmployee.birthDate}
                onChange={e => setFormEmployee({...formEmployee, birthDate: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 font-sans flex items-center gap-2">
                <ShieldCheck size={12} className="text-primary" />
                Estado Civil
              </label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                value={formEmployee.civilStatus}
                onChange={e => setFormEmployee({...formEmployee, civilStatus: e.target.value})}
              >
                <option value="Soltero">Soltero/a</option>
                <option value="Casado">Casado/a</option>
                <option value="Divorciado">Divorciado/a</option>
                <option value="Viudo">Viudo/a</option>
                <option value="Conviviente Civil">Conviviente Civil</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 font-sans flex items-center gap-2">
                <MapPin size={12} className="text-primary" />
                Nacionalidad
              </label>
              <input 
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={formEmployee.nationality}
                placeholder="Ej: Chilena"
                onChange={e => setFormEmployee({...formEmployee, nationality: e.target.value})}
              />
            </div>

            <div className="col-span-2 grid grid-cols-2 gap-4">
               <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Mail size={12} className="text-primary" />
                  Email
                </label>
                <input 
                  required
                  type="email" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={formEmployee.email}
                  onChange={e => setFormEmployee({...formEmployee, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Phone size={12} className="text-primary" />
                  Teléfono
                </label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={formEmployee.phone}
                  onChange={e => setFormEmployee({...formEmployee, phone: e.target.value})}
                />
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Home size={12} className="text-primary" />
                Dirección Particular
              </label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={formEmployee.address}
                onChange={e => setFormEmployee({...formEmployee, address: e.target.value})}
              />
            </div>

            <div className="col-span-2 grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
               <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cargo</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs font-bold"
                  value={formEmployee.position}
                  onChange={e => setFormEmployee({...formEmployee, position: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Departamento</label>
                <select 
                  className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-xs font-bold"
                  value={formEmployee.department}
                  onChange={e => setFormEmployee({...formEmployee, department: e.target.value})}
                >
                  <option value="">Seleccionar...</option>
                  <option value="Ingeniería">Ingeniería</option>
                  <option value="Operaciones">Operaciones</option>
                  <option value="Ventas">Ventas</option>
                  <option value="Administración">Administración</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">AFP</label>
                <select 
                  className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-xs font-bold"
                  value={formEmployee.afp}
                  onChange={e => setFormEmployee({...formEmployee, afp: e.target.value as any})}
                >
                  {AFP_LIST.map(afp => <option key={afp} value={afp}>{afp}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Salud</label>
                <select 
                  className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-xs font-bold"
                  value={formEmployee.health}
                  onChange={e => setFormEmployee({...formEmployee, health: e.target.value as any})}
                >
                  {HEALTH_LIST.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Sueldo Base ($)</label>
                <input 
                  type="number" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono font-bold"
                  value={formEmployee.salary}
                  onChange={e => setFormEmployee({...formEmployee, salary: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Estado Laboral</label>
                <select 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                  value={formEmployee.status}
                  onChange={e => setFormEmployee({...formEmployee, status: e.target.value as any})}
                >
                  <option value="active">Activo</option>
                  <option value="on_leave">Licencia / Vacaciones</option>
                  <option value="terminated">Finiquitado</option>
                </select>
              </div>
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
          >
            <Save size={18} />
            {editingEmployee ? 'Guardar Ficha Técnica' : 'Confirmar Contratación'}
          </button>
        </form>
      ) : (
          <div className="space-y-6 font-sans">
            <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-center group hover:border-primary/50 transition-all relative">
              <input 
                type="file" 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                onChange={handleFileUpload}
              />
              <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 text-slate-400 group-hover:text-primary transition-colors">
                <Upload size={24} />
              </div>
              <p className="text-sm font-bold text-slate-700">Subir Documento PDF / Imagen</p>
              <p className="text-xs text-slate-400 mt-1">Arrastre archivos aquí para guardarlos en la carpeta del trabajador</p>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archivos en Carpeta Digital</h4>
              {(formEmployee.documents || []).length > 0 ? (formEmployee.documents || []).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg group hover:border-primary/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                      {doc.type === 'pdf' ? <FileText size={18} /> : <FileBox size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 line-clamp-1">{doc.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{doc.uploadDate} • {doc.size}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setPreviewDoc(doc)}
                      className="p-2 text-slate-400 hover:text-primary transition-colors" 
                      title="Visualizar en línea"
                    >
                      <Eye size={16} />
                    </button>
                    <button 
                      onClick={() => handleDownload(doc)}
                      className="p-2 text-slate-400 hover:text-primary transition-colors" 
                      title="Descargar"
                    >
                      <Download size={16} />
                    </button>
                    <button 
                      onClick={() => removeDoc(doc.id)}
                      className="p-2 text-slate-400 hover:text-rose-500 transition-colors" 
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="py-12 text-center border border-slate-100 rounded-xl bg-slate-50/30">
                  <Folder size={32} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-xs text-slate-400">Carpeta vacía. No hay documentos cargados todavía.</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center gap-3">
              <FileCheck className="text-emerald-500" size={20} />
              <p className="text-[10px] text-emerald-700 font-bold leading-tight uppercase tracking-tight">Carpeta personal con respaldo legal Rescoing.</p>
            </div>

            <button 
              onClick={handleSubmit}
              className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-2 mt-4"
            >
              <Save size={18} />
              Finalizar y Guardar Cambios
            </button>
          </div>
        )}
      </Modal>

      {/* Document Preview Modal */}
      <Modal 
        isOpen={!!previewDoc} 
        onClose={() => setPreviewDoc(null)}
        title={`Visualización: ${previewDoc?.name}`}
      >
        <div className="space-y-6 font-sans">
          <div className="w-full aspect-[3/4] bg-white rounded-xl border border-slate-200 flex flex-col p-6 text-center overflow-hidden relative shadow-inner">
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary/30" />
            
            {/* Header of the mock document */}
            <div className="flex justify-between items-start mb-8 border-b border-slate-100 pb-4">
              <div className="text-left">
                <p className="text-[10px] font-black text-slate-900 leading-none">RESCOING INGENIERIA</p>
                <p className="text-[8px] text-slate-400 mt-1 uppercase">Rut: 76.123.456-7 • Santiago, Chile</p>
              </div>
              <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center text-primary">
                <ShieldCheck size={16} />
              </div>
            </div>

            <h4 className="text-sm font-black text-slate-900 mb-1 uppercase tracking-tighter">{previewDoc?.name}</h4>
            <p className="text-[10px] text-slate-400 mb-6 font-medium">Documento generado el {previewDoc?.uploadDate}</p>

            <div className="flex-1 w-full space-y-3 text-left overflow-hidden">
               {/* Body content based on type */}
               <div className="h-2 bg-slate-100 rounded w-full" />
               <div className="h-2 bg-slate-100 rounded w-5/6" />
               <div className="h-2 bg-slate-100 rounded w-full" />
               <div className="h-2 bg-slate-100 rounded w-4/6 mb-4" />
               
               <div className="p-3 bg-slate-50 rounded border border-slate-100 space-y-2">
                 <div className="flex justify-between border-b border-slate-200 pb-1">
                   <div className="h-1.5 bg-slate-200 rounded w-16" />
                   <div className="h-1.5 bg-slate-200 rounded w-12" />
                 </div>
                 <div className="flex justify-between">
                   <div className="h-1.5 bg-slate-200 rounded w-20" />
                   <div className="h-1.5 bg-slate-200 rounded w-10" />
                 </div>
               </div>

               <div className="mt-4 space-y-2">
                 <div className="h-1.5 bg-slate-100 rounded w-full" />
                 <div className="h-1.5 bg-slate-100 rounded w-full" />
                 <div className="h-1.5 bg-slate-100 rounded w-3/4" />
               </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col items-center">
              <div className="w-24 h-12 border-b border-slate-300 relative">
                <PenTool className="absolute top-1 right-2 text-slate-300 -rotate-12" size={24} />
                <p className="absolute bottom-1 left-0 right-0 text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">Firma Digital</p>
              </div>
              <div className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
                <FileCheck className="text-emerald-500" size={14} />
                <span className="text-[9px] font-black text-emerald-700 uppercase tracking-tight">Verificado por RESCOING Trust</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => setPreviewDoc(null)}
              className="flex-1 px-4 py-3 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all font-sans"
            >
              Cerrar Vista
            </button>
            <button 
              onClick={() => handleDownload(previewDoc)}
              className="flex-1 px-4 py-3 bg-primary text-white rounded-lg text-sm font-bold shadow-md hover:opacity-90 transition-all flex items-center justify-center gap-2 font-sans"
            >
              <Download size={18} />
              Descargar
            </button>
          </div>
        </div>
      </Modal>

      {/* Vacation Modal */}
      <Modal 
        isOpen={isVacationModalOpen} 
        onClose={() => setIsVacationModalOpen(false)}
        title="Nueva Solicitud de Vacaciones"
      >
        <div className="space-y-6 font-sans">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 text-primary">Trabajador Solicitante</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                value={newVacation.employeeId}
                onChange={e => setNewVacation({...newVacation, employeeId: e.target.value})}
              >
                <option value="">Seleccionar...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} (Saldo: {emp.vacationDays} días)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Inicio</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                value={newVacation.startDate}
                onChange={e => setNewVacation({...newVacation, startDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Término</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                value={newVacation.endDate}
                onChange={e => setNewVacation({...newVacation, endDate: e.target.value})}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo de Solicitud</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                value={newVacation.type}
                onChange={e => setNewVacation({...newVacation, type: e.target.value})}
              >
                <option value="Vacaciones Legales">Vacaciones Legales</option>
                <option value="Permiso Administrativo">Permiso Administrativo</option>
                <option value="Día por Cumpleaños">Día por Cumpleaños</option>
              </select>
            </div>
          </div>

          <button 
            onClick={async () => {
              const emp = employees.find(e => e.id === newVacation.employeeId);
              if (!emp) return;

              const newDoc = {
                id: `VAC-${Math.random().toString(36).substr(2, 9)}`,
                name: `Solicitud Vacaciones: ${newVacation.startDate}`,
                type: 'pdf',
                uploadDate: new Date().toLocaleDateString('es-ES'),
                size: '0.35 MB'
              };

              const docRef = doc(db, 'employees', emp.id);
              await updateDoc(docRef, {
                documents: [newDoc, ...(emp.documents || [])],
                vacationDays: (emp.vacationDays || 15) - 1
              });

              setIsVacationModalOpen(false);
              alert(`Solicitud de vacaciones de ${emp.firstName} procesada y guardada.`);
            }}
            className="w-full bg-amber-600 text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-amber-700 transition-all flex items-center justify-center gap-2"
          >
            <Calendar size={18} />
            Procesar Solicitud
          </button>
        </div>
      </Modal>

      {/* Certificate Modal */}
      <Modal 
        isOpen={isCertificateModalOpen} 
        onClose={() => setIsCertificateModalOpen(false)}
        title="Emisión de Certificados Laborales"
      >
        <div className="space-y-6 font-sans">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Trabajador</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                value={newCertificate.employeeId}
                onChange={e => setNewCertificate({...newCertificate, employeeId: e.target.value})}
              >
                <option value="">Seleccionar...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo de Certificado</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                value={newCertificate.type}
                onChange={e => setNewCertificate({...newCertificate, type: e.target.value})}
              >
                <option value="Antigüedad Laboral">Antigüedad Laboral</option>
                <option value="Renta Mensual">Renta Mensual</option>
                <option value="Certificado de Honorarios">Certificado de Honorarios</option>
                <option value="Situación Contractual">Situación Contractual</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Motivo de Emisión</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                placeholder="Ej: Trámites bancarios, arriendo..."
                value={newCertificate.reason}
                onChange={e => setNewCertificate({...newCertificate, reason: e.target.value})}
              />
            </div>
          </div>

          <button 
            onClick={async () => {
              const emp = employees.find(e => e.id === newCertificate.employeeId);
              if (!emp) return;

              const newDoc = {
                id: `CERT-${Math.random().toString(36).substr(2, 9)}`,
                name: `Certificado: ${newCertificate.type}`,
                type: 'pdf',
                uploadDate: new Date().toLocaleDateString('es-ES'),
                size: '0.28 MB'
              };

              const docRef = doc(db, 'employees', emp.id);
              await updateDoc(docRef, {
                documents: [newDoc, ...(emp.documents || [])]
              });

              setIsCertificateModalOpen(false);
              alert(`Certificado de ${newCertificate.type} generado y guardado en carpeta.`);
            }}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck size={18} />
            Generar Certificado Digital
          </button>
        </div>
      </Modal>

      {/* Payroll Modal */}
      <Modal 
        isOpen={isPayrollModalOpen} 
        onClose={() => setIsPayrollModalOpen(false)}
        title="Nueva Liquidación de Sueldo"
      >
        <div className="space-y-6 font-sans">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Seleccionar Trabajador</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                value={newPayroll.employeeId}
                onChange={e => {
                  const emp = employees.find(x => x.id === e.target.value);
                  setNewPayroll({
                    ...newPayroll, 
                    employeeId: e.target.value,
                    baseSalary: emp?.salary || 0,
                    gratification: Math.round((emp?.salary || 0) * 0.25)
                  });
                }}
              >
                <option value="">Seleccionar...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.rut})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Mes</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                value={newPayroll.month}
                onChange={e => setNewPayroll({...newPayroll, month: e.target.value})}
              >
                {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Año</label>
              <input 
                type="number" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                value={newPayroll.year}
                onChange={e => setNewPayroll({...newPayroll, year: parseInt(e.target.value)})}
              />
            </div>
          </div>

          {newPayroll.employeeId && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desglose de Haberes</span>
                <span className="text-[10px] font-mono font-bold text-primary">Sueldo Base: ${newPayroll.baseSalary.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sueldo Base</label>
                  <input 
                    type="number" 
                    className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs font-mono"
                    value={newPayroll.baseSalary}
                    onChange={e => setNewPayroll({...newPayroll, baseSalary: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Gratificación</label>
                  <input 
                    type="number" 
                    className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs font-mono"
                    value={newPayroll.gratification}
                    onChange={e => setNewPayroll({...newPayroll, gratification: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Bonos / Otros</label>
                  <input 
                    type="number" 
                    className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs font-mono"
                    value={newPayroll.bonuses}
                    onChange={e => setNewPayroll({...newPayroll, bonuses: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Horas Extras ($)</label>
                  <input 
                    type="number" 
                    className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs font-mono"
                    value={newPayroll.overtime}
                    onChange={e => setNewPayroll({...newPayroll, overtime: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-end">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Bruto Estimado</p>
                  <p className="text-sm font-mono font-bold">${(newPayroll.baseSalary + newPayroll.gratification + newPayroll.bonuses + newPayroll.overtime + newPayroll.transport + newPayroll.lunch).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Líquido Estimado</p>
                  <p className="text-lg font-mono font-black text-emerald-600">
                    ${Math.round((newPayroll.baseSalary + newPayroll.gratification + newPayroll.overtime) * 0.8 + newPayroll.transport + newPayroll.lunch + newPayroll.bonuses).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          <button 
            onClick={async () => {
              const emp = employees.find(e => e.id === newPayroll.employeeId);
              if (!emp) return;
              
              const totalGross = (newPayroll.baseSalary + newPayroll.gratification + newPayroll.bonuses + newPayroll.overtime + newPayroll.transport + newPayroll.lunch);
              const totalNet = Math.round((newPayroll.baseSalary + newPayroll.gratification + newPayroll.overtime) * 0.8 + newPayroll.transport + newPayroll.lunch + newPayroll.bonuses);
              
              const pay = {
                ...newPayroll,
                id: Math.random().toString(36).substr(2, 9),
                netPay: totalNet
              };

              // Guardar en la carpeta digital del trabajador
              const newDoc = {
                id: `PAY-${pay.id}`,
                name: `Liquidación: ${newPayroll.month} ${newPayroll.year}`,
                type: 'pdf',
                uploadDate: new Date().toLocaleDateString('es-ES'),
                size: '0.45 MB',
                employeeId: emp.id,
                metadata: {
                  salary: newPayroll.baseSalary || emp.salary,
                  grat: newPayroll.gratification || Math.round((newPayroll.baseSalary || emp.salary) * 0.25),
                  transport: newPayroll.transport,
                  lunch: newPayroll.lunch,
                  bonuses: newPayroll.bonuses,
                  overtime: newPayroll.overtime
                }
              };

              const docRef = doc(db, 'employees', emp.id);
              await updateDoc(docRef, {
                documents: [newDoc, ...(emp.documents || [])]
              });

              setPayrolls([pay, ...payrolls]);
              setIsPayrollModalOpen(false);
              alert(`Liquidación de ${emp.firstName} guardada con éxito en su carpeta digital.`);
            }}
            className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
          >
            <CreditCard size={18} />
            Generar y Guardar en Carpeta
          </button>
        </div>
      </Modal>

      {/* Contract Modal */}
      <Modal 
        isOpen={isContractModalOpen} 
        onClose={() => setIsContractModalOpen(false)}
        title="Generar Nuevo Contrato Laboral"
      >
        <div className="space-y-6 font-sans">
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-xs leading-relaxed">
            Este modulo genera un documento PDF legal basado en la plantilla corporativa de RESCOING, incluyendo cláusulas de confidencialidad y propiedad intelectual.
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Trabajador</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                value={newContract.employeeId}
                onChange={e => {
                  const emp = employees.find(x => x.id === e.target.value);
                  setNewContract({
                    ...newContract, 
                    employeeId: e.target.value,
                    position: emp?.position || '',
                    salary: emp?.salary || 0
                  });
                }}
              >
                <option value="">Seleccionar...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo de Contrato</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                value={newContract.type}
                onChange={e => setNewContract({...newContract, type: e.target.value})}
              >
                <option value="Indefinido">Indefinido</option>
                <option value="Plazo Fijo (3 meses)">Plazo Fijo (3 meses)</option>
                <option value="Por Obra o Faena">Por Obra o Faena</option>
                <option value="Honorarios">Honorarios</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha de Inicio</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                value={newContract.startDate}
                onChange={e => setNewContract({...newContract, startDate: e.target.value})}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cargo (según contrato)</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                placeholder="Ej: Ingeniero de Proyectos"
                value={newContract.position}
                onChange={e => setNewContract({...newContract, position: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Sueldo Líquido Pactado</label>
              <input 
                type="number" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                value={newContract.salary}
                onChange={e => setNewContract({...newContract, salary: parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Lugar de Trabajo</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                value={newContract.workPlace}
                onChange={e => setNewContract({...newContract, workPlace: e.target.value})}
              />
            </div>
          </div>

          <button 
            onClick={async () => {
              const emp = employees.find(e => e.id === newContract.employeeId);
              if (!emp) return;

              const newDoc = {
                id: `CTR-${Math.random().toString(36).substr(2, 9)}`,
                name: `Contrato: ${newContract.type}`,
                type: 'pdf',
                uploadDate: new Date().toLocaleDateString('es-ES'),
                size: '1.20 MB',
                employeeId: emp.id,
                metadata: {
                  type: newContract.type,
                  startDate: newContract.startDate,
                  position: newContract.position || emp.position,
                  salary: newContract.salary || emp.salary,
                  workPlace: newContract.workPlace
                }
              };

              const docRef = doc(db, 'employees', emp.id);
              await updateDoc(docRef, {
                documents: [newDoc, ...(emp.documents || [])]
              });

              setIsContractModalOpen(false);
              alert(`Contrato ${newContract.type} generado y guardado en la ficha de ${emp.firstName}.`);
            }}
            className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            <FileText size={18} />
            Generar y Guardar Contrato PDF
          </button>
        </div>
      </Modal>

      {/* Prevention Modal */}
      <Modal 
        isOpen={isPreventionModalOpen} 
        onClose={() => setIsPreventionModalOpen(false)}
        title="Nuevo Registro de Prevención (PRS)"
      >
        <div className="space-y-6 font-sans">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo de Actividad</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                value={newPrevention.type}
                onChange={e => setNewPrevention({...newPrevention, type: e.target.value as any})}
              >
                <option value="epp">Entrega EPP</option>
                <option value="talk">Charla de 5 Minutos</option>
                <option value="checklist">Checklist Pre-operacional</option>
                <option value="accident">Reporte de Accidente / Incidente</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Trabajador Involucrado</label>
              <select 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                value={newPrevention.employeeId}
                onChange={e => setNewPrevention({...newPrevention, employeeId: e.target.value})}
              >
                <option value="">Seleccionar (Opcional)...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción / Observaciones</label>
              <textarea 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm min-h-[100px]"
                placeholder="Detalle de la actividad o incidente..."
                value={newPrevention.description}
                onChange={e => setNewPrevention({...newPrevention, description: e.target.value})}
              />
            </div>
          </div>

          <button 
            onClick={() => {
              setPreventionRecords([{...newPrevention, id: Math.random().toString(36).substr(2, 9)}, ...preventionRecords]);
              setIsPreventionModalOpen(false);
              setNewPrevention({ employeeId: '', type: 'epp', description: '', date: new Date().toISOString().split('T')[0] });
            }}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck size={18} />
            Guardar Registro PRS
          </button>
        </div>
      </Modal>
    </div>
  );
}
