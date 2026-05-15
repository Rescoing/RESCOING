import { useState, useEffect, Dispatch, SetStateAction, FormEvent } from 'react';
import { Clock, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { Project } from '../types';
import Modal from './ui/Modal';

interface OperationsViewProps {
  projects: Project[];
  onAdd: Dispatch<SetStateAction<Project[]>>;
  autoOpen?: boolean;
  onModalHandled?: () => void;
}

export default function OperationsView({ projects, onAdd, autoOpen, onModalHandled }: OperationsViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) {
      setIsModalOpen(true);
      onModalHandled?.();
    }
  }, [autoOpen, onModalHandled]);
  const [newProject, setNewProject] = useState<Partial<Project>>({
    name: '',
    location: '',
    clientResponsible: '',
    status: 'active',
    progress: 0,
    startDate: new Date().toISOString().split('T')[0],
    deadline: '',
    description: ''
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const projectToAdd: Project = {
      ...newProject as Project,
      id: Math.random().toString(36).substr(2, 9)
    };
    onAdd(prev => [...prev, projectToAdd]);
    setIsModalOpen(false);
    setNewProject({ 
      name: '', 
      location: '', 
      clientResponsible: '', 
      status: 'active', 
      progress: 0, 
      startDate: new Date().toISOString().split('T')[0], 
      deadline: '', 
      description: '' 
    });
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
        onClose={() => setIsModalOpen(false)} 
        title="Crear Nuevo Proyecto"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4 font-sans">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre del Proyecto</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newProject.name}
                onChange={e => setNewProject({...newProject, name: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ubicación / Faena</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={newProject.location}
                  onChange={e => setNewProject({...newProject, location: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Responsable Cliente</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={newProject.clientResponsible}
                  onChange={e => setNewProject({...newProject, clientResponsible: e.target.value})}
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
                  value={newProject.startDate}
                  onChange={e => setNewProject({...newProject, startDate: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Límite</label>
                <input 
                  required
                  type="date" 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={newProject.deadline}
                  onChange={e => setNewProject({...newProject, deadline: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción del Proyecto</label>
              <textarea 
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                value={newProject.description}
                onChange={e => setNewProject({...newProject, description: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Estado Initial</label>
                <select 
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-white"
                  value={newProject.status}
                  onChange={e => setNewProject({...newProject, status: e.target.value as any})}
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
                  value={newProject.progress}
                  onChange={e => setNewProject({...newProject, progress: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-white py-2.5 rounded-lg font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all mt-2"
          >
            Iniciar Proyecto
          </button>
        </form>
      </Modal>

      <div className="grid grid-cols-1 gap-6">
        {projects.map((project, i) => (
          <motion.div 
            key={project.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
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
                  <h3 className="font-bold text-xl text-slate-900 tracking-tight">{project.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest
                      ${project.status === 'active' ? 'text-blue-600' : 
                        project.status === 'delayed' ? 'text-rose-600' : 
                        project.status === 'completed' ? 'text-emerald-600' : 'text-slate-500'}
                    `}>{project.status}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsable: {project.clientResponsible}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="md:text-right px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Faena / Ubicación</p>
                  <p className="font-bold text-xs text-slate-700">{project.location}</p>
                </div>
                <div className="md:text-right px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Límite</p>
                  <p className="font-mono text-xs font-bold text-slate-700">{project.deadline}</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6 line-clamp-2">{project.description}</p>

            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Progreso de la Fase Actual</span>
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

            <div className="mt-8 pt-6 border-t border-slate-50 flex flex-wrap gap-6">
               <button className="text-xs font-bold text-primary uppercase tracking-widest hover:underline flex items-center gap-2">
                 Gestionar Tareas
                 <div className="w-4 h-px bg-primary/30"></div>
               </button>
               <button className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
                 Documentación
               </button>
               <button className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors ml-auto">
                 Reporte de Riesgos
               </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
