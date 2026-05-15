import { useState, useEffect, FormEvent, useRef } from 'react';
import { Clock, CheckCircle2, AlertCircle, Plus, Edit2, Trash2, ListChecks, FileText, ShieldAlert, ChevronRight, Save, Flame, HelpCircle, Upload, File, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, ProjectTask, RiskPreventionRecord, ProjectDocument } from '../types';
import Modal from './ui/Modal';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

interface OperationsViewProps {
  autoOpen?: boolean;
  onModalHandled?: () => void;
}

export default function OperationsView({ autoOpen, onModalHandled }: OperationsViewProps) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [riskRecords, setRiskRecords] = useState<RiskPreventionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectRisks = riskRecords.filter(r => r.projectId === selectedProjectId);

  useEffect(() => {
    if (!user) return;

    // Listen to Projects
    const qProjects = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
    const unsubProjects = onSnapshot(qProjects, (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
    });

    // Listen to Risk Records
    const qRisks = query(collection(db, 'riskRecords'), where('ownerId', '==', user.uid));
    const unsubRisks = onSnapshot(qRisks, (snap) => {
      setRiskRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as RiskPreventionRecord)));
    });

    setLoading(false);
    return () => {
      unsubProjects();
      unsubRisks();
    };
  }, [user]);

  useEffect(() => {
    if (autoOpen) {
      setIsModalOpen(true);
      onModalHandled?.();
    }
  }, [autoOpen, onModalHandled]);

  const [formProject, setFormProject] = useState<Partial<Project>>({
    name: '',
    location: '',
    clientResponsible: '',
    status: 'active',
    progress: 0,
    startDate: new Date().toISOString().split('T')[0],
    deadline: '',
    description: '',
    tasks: [],
    documents: []
  });

  const [newTask, setNewTask] = useState<Partial<ProjectTask>>({
    title: '',
    description: '',
    status: 'pending',
    dueDate: ''
  });

  const [newRisk, setNewRisk] = useState<Partial<RiskPreventionRecord>>({
    type: 'talk',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleOpenEdit = (project: Project) => {
    setEditingProject(project);
    setFormProject(project);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
    setFormProject({
      name: '',
      location: '',
      clientResponsible: '',
      status: 'active',
      progress: 0,
      startDate: new Date().toISOString().split('T')[0],
      deadline: '',
      description: '',
      tasks: [],
      documents: []
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingProject) {
        const docRef = doc(db, 'projects', editingProject.id);
        await updateDoc(docRef, { ...formProject, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'projects'), {
          ...formProject,
          ownerId: user.uid,
          tasks: [],
          documents: [],
          createdAt: serverTimestamp()
        });
      }
      handleCloseModal();
    } catch (error) {
      console.error(error);
      alert("Error al guardar el proyecto");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Está seguro de eliminar este proyecto?')) {
      try {
        await deleteDoc(doc(db, 'projects', id));
      } catch (error) {
        console.error(error);
      }
    }
  };

  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !newTask.title || !user) return;

    const taskToAdd: ProjectTask = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTask.title,
      description: newTask.description,
      status: 'pending',
      dueDate: newTask.dueDate
    };

    const projectRef = doc(db, 'projects', selectedProjectId);
    const updatedTasks = [...(selectedProject?.tasks || []), taskToAdd];
    await updateDoc(projectRef, { tasks: updatedTasks });

    setNewTask({ title: '', description: '', status: 'pending', dueDate: '' });
  };

  const toggleTaskStatus = async (projectId: string, taskId: string) => {
    const p = projects.find(proj => proj.id === projectId);
    if (!p) return;

    const updatedTasks = (p.tasks || []).map(t => {
      if (t.id !== taskId) return t;
      const nextStatus: ProjectTask['status'] = 
        t.status === 'pending' ? 'in-progress' : 
        t.status === 'in-progress' ? 'completed' : 'pending';
      return { ...t, status: nextStatus };
    });
    
    const completedCount = updatedTasks.filter(t => t.status === 'completed').length;
    const progress = updatedTasks.length > 0 ? Math.round((completedCount / updatedTasks.length) * 100) : p.progress;
    
    const projectRef = doc(db, 'projects', projectId);
    await updateDoc(projectRef, { tasks: updatedTasks, progress });
  };

  const deleteTask = async (projectId: string, taskId: string) => {
    const p = projects.find(proj => proj.id === projectId);
    if (!p) return;
    const updatedTasks = (p.tasks || []).filter(t => t.id !== taskId);
    const projectRef = doc(db, 'projects', projectId);
    await updateDoc(projectRef, { tasks: updatedTasks });
  };

  const handleAddRisk = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !newRisk.description || !user) return;

    const riskToAdd = {
      type: newRisk.type as any,
      description: newRisk.description,
      date: newRisk.date || new Date().toISOString().split('T')[0],
      projectId: selectedProjectId,
      ownerId: user.uid,
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'riskRecords'), riskToAdd);
    setNewRisk({ type: 'talk', description: '', date: new Date().toISOString().split('T')[0] });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProjectId) return;

    const newDoc: ProjectDocument = {
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: file.name.split('.').pop() || 'file',
      uploadDate: new Date().toLocaleDateString(),
      size: (file.size / (1024 * 1024)).toFixed(2) + ' MB'
    };

    const projectRef = doc(db, 'projects', selectedProjectId);
    const updatedDocs = [...(selectedProject?.documents || []), newDoc];
    await updateDoc(projectRef, { documents: updatedDocs });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Proyectos y Operaciones</h2>
          <p className="text-slate-500 mt-1">Seguimiento riguroso de tiempos, hitos y entregables de ingeniería.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus size={18} />
          Nuevo Proyecto
        </button>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        title={editingProject ? "Editar Proyecto" : "Crear Nuevo Proyecto"}
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="space-y-4 font-sans">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre del Proyecto</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={formProject.name}
                onChange={e => setFormProject({...formProject, name: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ubicación / Faena</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={formProject.location}
                  onChange={e => setFormProject({...formProject, location: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Responsable Cliente</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={formProject.clientResponsible}
                  onChange={e => setFormProject({...formProject, clientResponsible: e.target.value})}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Inicio</label>
                <input 
                  required
                  type="date" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={formProject.startDate}
                  onChange={e => setFormProject({...formProject, startDate: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Límite</label>
                <input 
                  required
                  type="date" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={formProject.deadline}
                  onChange={e => setFormProject({...formProject, deadline: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción del Proyecto</label>
              <textarea 
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={formProject.description}
                onChange={e => setFormProject({...formProject, description: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Estado</label>
                <select 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                  value={formProject.status}
                  onChange={e => setFormProject({...formProject, status: e.target.value as any})}
                >
                  <option value="active">Activo</option>
                  <option value="delayed">Demorado</option>
                  <option value="completed">Completado</option>
                  <option value="on-hold">En Espera</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Progreso (%)</label>
                <input 
                  required
                  type="number" 
                  max="100"
                  min="0"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono"
                  value={formProject.progress}
                  onChange={e => setFormProject({...formProject, progress: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-white py-2.5 rounded-lg font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all mt-2"
          >
            {editingProject ? 'Guardar Cambios' : 'Iniciar Proyecto'}
          </button>
        </form>
      </Modal>

      {/* Task Management Modal */}
      <Modal 
        isOpen={isTaskModalOpen} 
        onClose={() => setIsTaskModalOpen(false)} 
        title={`Tareas: ${selectedProject?.name}`}
      >
        <div className="space-y-6 font-sans text-left">
          <form onSubmit={handleAddTask} className="flex gap-2">
            <input 
              type="text" 
              placeholder="Nueva tarea..."
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
              value={newTask.title}
              onChange={e => setNewTask({...newTask, title: e.target.value})}
              required
            />
            <button className="p-2 bg-primary text-white rounded-lg hover:opacity-90">
              <Plus size={20} />
            </button>
          </form>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {selectedProject?.tasks?.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <ListChecks className="mx-auto mb-2 opacity-20" size={48} />
                <p className="text-sm">No hay tareas creadas aún.</p>
              </div>
            )}
            {selectedProject?.tasks?.map(task => (
              <div key={task.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 group">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => toggleTaskStatus(selectedProject.id, task.id)}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors
                      ${task.status === 'completed' ? 'bg-emerald-500 border-emerald-500 text-white' : 
                        task.status === 'in-progress' ? 'bg-amber-100 border-amber-300 text-amber-600' : 'bg-white border-slate-300'}
                    `}
                  >
                    {task.status === 'completed' && <CheckCircle2 size={12} strokeWidth={3} />}
                    {task.status === 'in-progress' && <Clock size={12} strokeWidth={3} />}
                  </button>
                  <span className={`text-sm font-medium ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {task.title}
                  </span>
                </div>
                <button 
                  onClick={() => deleteTask(selectedProject.id, task.id)}
                  className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          
          <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            <span>Completado: {selectedProject?.tasks?.filter(t => t.status === 'completed').length || 0} / {selectedProject?.tasks?.length || 0}</span>
            <span className="text-primary">{selectedProject?.progress}% Total</span>
          </div>
        </div>
      </Modal>

      {/* Risk Prevention Modal */}
      <Modal 
        isOpen={isRiskModalOpen} 
        onClose={() => setIsRiskModalOpen(false)} 
        title={`Reportes de Riesgo: ${selectedProject?.name}`}
      >
        <div className="space-y-6 font-sans text-left">
          <form onSubmit={handleAddRisk} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo de Registro</label>
                <select 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                  value={newRisk.type}
                  onChange={e => setNewRisk({...newRisk, type: e.target.value as any})}
                >
                  <option value="talk">Charla 5 min</option>
                  <option value="checklist">Checklist EPP</option>
                  <option value="accident">Incidente / Accidente</option>
                  <option value="epp">Entrega EPP</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha</label>
                <input 
                  type="date"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  value={newRisk.date}
                  onChange={e => setNewRisk({...newRisk, date: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Observaciones / Detalle</label>
              <textarea 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                rows={2}
                value={newRisk.description}
                onChange={e => setNewRisk({...newRisk, description: e.target.value})}
                placeholder="Describa el evento o charla..."
                required
              />
            </div>
            <button className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-2 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-800">
              <ShieldAlert size={14} />
              Registrar Reporte
            </button>
          </form>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {projectRisks.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <HelpCircle className="mx-auto mb-2 opacity-20" size={48} />
                <p className="text-sm">No hay reportes de riesgo registrados.</p>
              </div>
            )}
            {projectRisks.map(risk => (
              <div key={risk.id} className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${risk.type === 'accident' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {risk.type === 'talk' ? 'Charla 5 Min' : risk.type === 'accident' ? 'Incidente' : risk.type === 'checklist' ? 'Checklist' : 'EPP'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-400">{risk.date}</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed italic">"{risk.description}"</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Documentation Modal */}
      <Modal 
        isOpen={isDocModalOpen} 
        onClose={() => setIsDocModalOpen(false)} 
        title={`Documentación: ${selectedProject?.name}`}
      >
        <div className="space-y-6 font-sans text-left">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="p-8 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-slate-50 hover:border-primary/50 transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-colors">
              <Upload size={24} />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-700">Subir nuevo documento</p>
              <p className="text-xs text-slate-400 mt-1">Planos, EETT, Contratos, etc.</p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
            {selectedProject?.documents?.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <FileText className="mx-auto mb-2 opacity-20" size={48} />
                <p className="text-sm">Sin documentos cargados.</p>
              </div>
            )}
            {selectedProject?.documents?.map(doc => (
              <div key={doc.id} className="p-3 bg-white border border-slate-100 rounded-lg flex items-center justify-between hover:border-slate-200 transition-colors shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                    <File size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 leading-none">{doc.name}</p>
                    <p className="text-[10px] text-slate-400 mt-1 capitalize font-bold uppercase tracking-widest">{doc.type} • {doc.size}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-slate-300">{doc.uploadDate}</span>
                  <button className="p-1 hover:bg-slate-50 rounded text-slate-400">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-slate-200">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Proyectos...</p>
          </div>
        ) : projects.map((project, i) => (
          <motion.div 
            key={project.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden group"
          >
            <div className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center border
                    ${project.status === 'active' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                      project.status === 'delayed' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                      project.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-100'}
                  `}>
                    {project.status === 'active' && <Clock size={24} />}
                    {project.status === 'delayed' && <AlertCircle size={24} />}
                    {project.status === 'completed' && <CheckCircle2 size={24} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-slate-900 tracking-tight text-left">{project.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest
                        ${project.status === 'active' ? 'text-blue-600' : 
                          project.status === 'delayed' ? 'text-rose-600' : 
                          project.status === 'completed' ? 'text-emerald-600' : 'text-slate-500'}
                      `}>{project.status === 'active' ? 'Activo' : project.status === 'completed' ? 'Completado' : project.status === 'delayed' ? 'Demorado' : 'En Pausa'}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Resp: {project.clientResponsible}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleOpenEdit(project)}
                    className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-all"
                    title="Editar"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(project.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    title="Eliminar"
                  >
                    <Trash2 size={18} />
                  </button>
                  <div className="w-px h-6 bg-slate-100 mx-2 hidden md:block" />
                  <div className="flex gap-4">
                    <div className="md:text-right px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 leading-none">Ubicación</p>
                      <p className="font-bold text-xs text-slate-700">{project.location}</p>
                    </div>
                    <div className="md:text-right px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 leading-none">Deadline</p>
                      <p className="font-mono text-xs font-bold text-slate-700">{project.deadline}</p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-600 mb-6 line-clamp-2 text-left">{project.description}</p>

              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Progreso del Proyecto</span>
                  <span className="font-mono font-bold text-primary">{project.progress}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${project.progress}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className={`h-full rounded-full shadow-inner ${project.progress === 100 ? 'bg-emerald-500' : project.status === 'delayed' ? 'bg-rose-500' : 'bg-primary'}`}
                  />
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-50 flex flex-wrap gap-4 md:gap-8">
                 <button 
                  onClick={() => { setSelectedProjectId(project.id); setIsTaskModalOpen(true); }}
                  className="text-xs font-bold text-primary uppercase tracking-widest hover:underline flex items-center gap-2"
                 >
                   <ListChecks size={14} />
                   Gestionar Tareas ({project.tasks?.length || 0})
                 </button>
                 <button 
                  onClick={() => { setSelectedProjectId(project.id); setIsDocModalOpen(true); }}
                  className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors flex items-center gap-2"
                 >
                   <FileText size={14} />
                   Documentación ({project.documents?.length || 0})
                 </button>
                 <button 
                  onClick={() => { setSelectedProjectId(project.id); setIsRiskModalOpen(true); }}
                  className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-rose-600 transition-colors flex items-center gap-2"
                 >
                   <ShieldAlert size={14} />
                   Riesgos ({riskRecords.filter(r => r.projectId === project.id).length})
                 </button>
                 
                 <div className="ml-auto flex -space-x-2">
                   {[1,2,3].map(n => (
                     <div key={n} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                       {String.fromCharCode(64 + n)}
                     </div>
                   ))}
                   <div className="w-8 h-8 rounded-full border-2 border-white bg-primary text-white flex items-center justify-center text-[10px] font-bold">
                     +2
                   </div>
                 </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      
      {projects.length === 0 && (
        <div className="text-center py-24 bg-white rounded-2xl border-2 border-dashed border-slate-200">
           <AlertCircle className="mx-auto mb-4 text-slate-300" size={64} />
           <h3 className="text-xl font-bold text-slate-900 text-center">No hay proyectos activos</h3>
           <p className="text-slate-500 mt-2 max-w-sm mx-auto text-center">Comience creando su primer proyecto de ingeniería para realizar el seguimiento.</p>
           <button 
            onClick={() => setIsModalOpen(true)}
            className="mt-6 inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all mx-auto"
           >
             <Plus size={20} />
             Nuevo Proyecto
           </button>
        </div>
      )}
    </div>
  );
}
