import { useState, FormEvent, useEffect, ChangeEvent } from 'react';
import { X, Save, Building2, Upload, User, Shield, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './FirebaseProvider';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { profile, updateCompanySettings, updateAccountSettings } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'account'>('company');
  const [successMessage, setSuccessMessage] = useState('');

  const [companyData, setCompanyData] = useState({
    companyName: '',
    companyRut: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyWebsite: '',
    companyLogo: ''
  });

  const [accountData, setAccountData] = useState({
    displayName: '',
    photoURL: '',
    email: ''
  });

  useEffect(() => {
    if (profile && isOpen) {
      setCompanyData({
        companyName: profile.companyName || '',
        companyRut: profile.companyRut || '',
        companyAddress: profile.companyAddress || '',
        companyPhone: profile.companyPhone || '',
        companyEmail: profile.companyEmail || '',
        companyWebsite: profile.companyWebsite || '',
        companyLogo: profile.companyLogo || ''
      });
      setAccountData({
        displayName: profile.displayName || '',
        photoURL: profile.photoURL || '',
        email: profile.email || ''
      });
    }
  }, [profile, isOpen]);

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('El logo no debe exceder los 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setCompanyData(prev => ({ ...prev, companyLogo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('La foto de perfil no debe exceder los 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAccountData(prev => ({ ...prev, photoURL: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMessage('');
    try {
      if (activeTab === 'company') {
        if (profile?.role !== 'admin') {
          alert('Solo los administradores pueden guardar configuraciones corporativas');
          return;
        }
        await updateCompanySettings(companyData);
      } else {
        if (profile?.role !== 'admin') {
          alert('Solo los administradores pueden guardar esta configuración en Firestore');
          return;
        }
        await updateAccountSettings(accountData);
      }
      setSuccessMessage('Configuración guardada exitosamente en Firestore');
      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 1500);
    } catch (error) {
      console.error(error);
      alert('Error al guardar los cambios en Firestore');
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AnimatePresence>
      {isOpen && (
        <div id="settings-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden font-sans"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  {activeTab === 'company' ? <Building2 size={22} /> : <User size={22} />}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 tracking-tight">
                    {activeTab === 'company' ? 'Configuración de la Empresa' : 'Datos del Administrador'}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {activeTab === 'company' ? 'Colección settings / company' : 'Colección settings / account'}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-100 px-6 bg-white gap-2">
              <button
                type="button"
                onClick={() => { setActiveTab('company'); setSuccessMessage(''); }}
                className={`py-4 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === 'company' 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Building2 size={16} />
                Empresa
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('account'); setSuccessMessage(''); }}
                className={`py-4 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === 'account' 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <User size={16} />
                Mi Cuenta
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8">
              {/* Tabs Content */}
              {activeTab === 'company' ? (
                /* Tab COMPANY settings */
                <div className="space-y-6">
                  {!isAdmin && (
                    <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-center gap-3 text-sm">
                      <Shield size={18} className="shrink-0" />
                      <span>Solo los administradores autorizados pueden modificar la información empresarial global.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nombre de la Empresa</label>
                        <input
                          type="text"
                          disabled={!isAdmin}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-bold disabled:bg-slate-50 disabled:text-slate-400"
                          value={companyData.companyName}
                          onChange={(e) => setCompanyData({ ...companyData, companyName: e.target.value })}
                          placeholder="Ej: RESCOING INGENIERIA LTDA"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">RUT Empresa</label>
                        <input
                          type="text"
                          disabled={!isAdmin}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-mono disabled:bg-slate-50 disabled:text-slate-400"
                          value={companyData.companyRut}
                          onChange={(e) => setCompanyData({ ...companyData, companyRut: e.target.value })}
                          placeholder="Ej: 76.123.456-7"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Dirección Matriz</label>
                        <input
                          type="text"
                          disabled={!isAdmin}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400"
                          value={companyData.companyAddress}
                          onChange={(e) => setCompanyData({ ...companyData, companyAddress: e.target.value })}
                          placeholder="Ej: Av. Principal 1234, Santiago"
                        />
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Correo Corporativo</label>
                        <input
                          type="email"
                          disabled={!isAdmin}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400"
                          value={companyData.companyEmail}
                          onChange={(e) => setCompanyData({ ...companyData, companyEmail: e.target.value })}
                          placeholder="info@empresa.cl"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Teléfono de Contacto</label>
                        <input
                          type="text"
                          disabled={!isAdmin}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400"
                          value={companyData.companyPhone}
                          onChange={(e) => setCompanyData({ ...companyData, companyPhone: e.target.value })}
                          placeholder="+56 9 ..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Sitio Web</label>
                        <input
                          type="text"
                          disabled={!isAdmin}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400"
                          value={companyData.companyWebsite}
                          onChange={(e) => setCompanyData({ ...companyData, companyWebsite: e.target.value })}
                          placeholder="www.empresa.cl"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Logo de la Empresa</label>
                    <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <div className="relative group">
                        <div className="w-24 h-24 rounded-xl border-2 border-white shadow-md overflow-hidden bg-white flex items-center justify-center">
                          {companyData.companyLogo ? (
                            <img src={companyData.companyLogo} alt="Logo preview" className="w-full h-full object-contain" />
                          ) : (
                            <ImageIcon size={32} className="text-slate-200" />
                          )}
                        </div>
                        {companyData.companyLogo && isAdmin && (
                          <button 
                            type="button"
                            onClick={() => setCompanyData({ ...companyData, companyLogo: '' })}
                            className="absolute -top-2 -right-2 p-1 bg-rose-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                      
                      {isAdmin ? (
                        <div className="flex-1 space-y-2">
                          <label className="inline-flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer transition-all shadow-sm">
                            <Upload size={14} />
                            Subir Imagen
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*"
                              onChange={handleLogoUpload}
                            />
                          </label>
                          <p className="text-[10px] text-slate-400 px-1 italic">JPG, PNG o SVG. Máx 2MB. Se recomienda fondo transparente.</p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">No tienes permisos para modificar el logo.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Tab PERSONAL settings */
                <div className="space-y-6">
                  {!isAdmin && (
                    <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-center gap-3 text-sm">
                      <Shield size={18} className="shrink-0" />
                      <span>Solo los administradores pueden guardar la configuración de su cuenta en la colección 'settings' de Firestore.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nombre Completo del Administrador</label>
                        <input
                          type="text"
                          disabled={!isAdmin}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-bold disabled:bg-slate-50 disabled:text-slate-400"
                          value={accountData.displayName}
                          onChange={(e) => setAccountData({ ...accountData, displayName: e.target.value })}
                          placeholder="Nombre para mostrar"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Correo Electrónico (No modificable)</label>
                        <input
                          type="email"
                          disabled
                          className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed outline-none text-sm font-semibold"
                          value={accountData.email}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Foto de Perfil</label>
                      <div className="flex flex-col items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <div className="w-24 h-24 rounded-full border-2 border-white shadow-md overflow-hidden bg-white flex items-center justify-center">
                          {accountData.photoURL ? (
                            <img src={accountData.photoURL} alt="Avatar preview" className="w-[100%] h-[100%] object-cover" />
                          ) : (
                            <User size={40} className="text-slate-300" />
                          )}
                        </div>
                        
                        {isAdmin ? (
                          <div className="text-center space-y-2">
                            <label className="inline-flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer transition-all shadow-sm">
                              <Upload size={14} />
                              Cambiar Foto
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleAvatarUpload}
                              />
                            </label>
                            <p className="text-[10px] text-slate-400 italic">Máx 2MB</p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">No tienes permisos para modificar tu foto.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Status or Success messages */}
              {successMessage && (
                <div className="mt-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-center text-xs font-bold">
                  {successMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                {isAdmin && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 bg-primary text-white px-8 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <Save size={16} />
                    {loading ? 'Guardando...' : 'Guardar en Firestore'}
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
