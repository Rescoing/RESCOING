import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, Settings, Mail, Lock, User as UserIcon, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from './FirebaseProvider';

type AuthMode = 'login' | 'register' | 'method-select';

export default function LoginView() {
  const { login, loginWithEmail, registerWithEmail } = useAuth();
  const [mode, setMode] = useState<AuthMode>('method-select');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password, name);
      }
    } catch (err: any) {
      setError(err.message || 'Error en la autenticación');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login();
    } catch (err: any) {
      setError(err.message || 'Error con Google Auth');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 md:p-10"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center font-bold text-white shadow-lg mb-4 ring-4 ring-primary/10">
            <Settings size={32} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">RESCOING</h1>
          <p className="text-[11px] font-bold text-primary uppercase tracking-[0.2em]">SISTEMA DE GESTIÓN CORPORATIVA</p>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'method-select' ? (
            <motion.div 
              key="method-select"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="text-center mb-6">
                <h2 className="text-lg font-bold text-slate-800">Bienvenido al Sistema</h2>
                <p className="text-sm text-slate-500 mt-1">Elige tu método de ingreso preferido</p>
              </div>

              <button 
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 py-3.5 rounded-xl font-bold text-slate-700 shadow-sm hover:border-primary/30 hover:bg-slate-50 transition-all active:scale-[0.98]"
              >
                <img 
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                  alt="Google" 
                  className="w-5 h-5"
                />
                Continuar con Google
              </button>

              <button 
                onClick={() => setMode('login')}
                className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition-all active:scale-[0.98]"
              >
                <Mail size={18} />
                Ingresar con Correo
              </button>

              <div className="text-center pt-4">
                <p className="text-sm text-slate-500">
                  ¿No tienes una cuenta asignada?{' '}
                  <button 
                    onClick={() => setMode('register')}
                    className="text-primary font-bold hover:underline"
                  >
                    Regístrate aquí
                  </button>
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.form 
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleEmailAuth} 
              className="space-y-4"
            >
              <button 
                type="button"
                onClick={() => { setMode('method-select'); setError(''); }}
                className="flex items-center gap-2 text-sm text-slate-500 font-bold hover:text-primary transition-colors mb-4"
              >
                <ArrowLeft size={16} /> Volver
              </button>

              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">
                  {mode === 'login' ? 'Iniciar Sesión' : 'Registro de Usuario'}
                </h2>
                <p className="text-sm text-slate-500">
                  {mode === 'login' 
                    ? 'Ingresa tus credenciales autorizadas' 
                    : 'Configura tu acceso para el correo autorizado'}
                </p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg font-bold border border-red-100 mb-4 animate-shake">
                  {error}
                </div>
              )}

              {mode === 'register' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1 uppercase tracking-wider">
                    <UserIcon size={12} /> Nombre Completo
                  </label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1 uppercase tracking-wider">
                  <Mail size={12} /> Correo Electrónico
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1 uppercase tracking-wider">
                  <Lock size={12} /> Contraseña
                </label>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                />
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-[0.98] mt-6 shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {loading ? 'Procesando...' : mode === 'login' ? 'Ingresar Ahora' : 'Confirmar Registro'}
                <ArrowRight size={18} />
              </button>

              <div className="text-center mt-4">
                <button 
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="text-sm text-slate-500 hover:text-primary transition-colors"
                >
                  {mode === 'login' 
                    ? '¿Aún no has configurado tu acceso? Regístrate' 
                    : '¿Ya tienes acceso? Inicia sesión aquí'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-10 pt-8 border-t border-slate-100">
          <p className="text-[10px] text-center text-slate-400 font-bold leading-relaxed uppercase tracking-widest">
            Seguridad Corporativa Rescoing
          </p>
        </div>
      </motion.div>
    </div>
  );
}
