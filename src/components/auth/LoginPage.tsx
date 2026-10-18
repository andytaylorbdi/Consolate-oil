import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Fuel, Lock, Mail, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('pompiste@consolateoil.bi');
  const [password, setPassword] = useState('Worker123!');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    const result = await login(email, password);
    setIsSubmitting(false);

    if (!result.success) {
      setErrorMsg(result.error || 'Connexion échouée.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 p-6 text-white text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-3">
            <Fuel className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">CONSOLATE OIL</h1>
          <p className="text-xs text-slate-400 mt-1">
            Système Central de Distribution de Carburant
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-base font-bold text-slate-900">Connexion Sécurisée</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Identifiez-vous avec votre compte professionnel
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Adresse Email Professionnelle
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@consolateoil.bi"
                className="w-full h-12 pl-10 pr-4 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-4" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 pl-10 pr-4 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-4" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] disabled:opacity-50 mt-2"
          >
            {isSubmitting ? (
              <span>Vérification...</span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Accéder à la plateforme</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Quick Credential Switchers for Testing */}
          <div className="pt-4 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-400 block mb-2 font-medium">
              Comptes de test préconfigurés :
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setEmail('pompiste@consolateoil.bi');
                  setPassword('Worker123!');
                }}
                className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
              >
                <span className="font-bold text-slate-900 block text-[11px]">Pompiste (Worker)</span>
                <span className="text-[10px] text-slate-500">Focus Mode & Sorties</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('admin@consolateoil.bi');
                  setPassword('Admin123!');
                }}
                className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
              >
                <span className="font-bold text-slate-900 block text-[11px]">Directeur (Admin)</span>
                <span className="text-[10px] text-slate-500">Gestion & PIN (4589)</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
