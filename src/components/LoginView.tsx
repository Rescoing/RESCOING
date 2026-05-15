import { motion } from 'motion/react';
import { LogIn, Settings } from 'lucide-react';
import { useAuth } from './FirebaseProvider';

export default function LoginView() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 md:p-10"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center font-bold text-white shadow-lg mb-4 ring-4 ring-primary/10">
            <Settings size={32} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">RESCOING</h1>
          <p className="text-[11px] font-bold text-primary uppercase tracking-[0.2em]">SISTEMA DE GESTIÓN CORPORATIVA</p>
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-800">Bienvenido al Sistema</h2>
            <p className="text-sm text-slate-500 mt-1">Ingresa con tu cuenta corporativa para continuar</p>
          </div>

          <button 
            onClick={login}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 py-4 rounded-xl font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all active:scale-[0.98]"
          >
            <img 
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
              alt="Google" 
              className="w-5 h-5"
            />
            Continuar con Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100"></span></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-300 font-bold tracking-widest">Seguridad Garantizada</span></div>
          </div>

          <p className="text-[10px] text-center text-slate-400 font-medium leading-relaxed">
            Al ingresar, aceptas los términos de uso y políticas de seguridad de la empresa.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
