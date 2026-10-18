import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api.ts';
import { Fuel, Smartphone, Monitor, LogOut } from 'lucide-react';

export const Header: React.FC = () => {
  const { previewMode, setPreviewMode } = useApp();
  const { currentUser, logout } = useAuth();
  const [activeSessionNumber, setActiveSessionNumber] = React.useState<string>('Session');

  React.useEffect(() => {
    let isMounted = true;
    api.admin.getSessions().then((res) => {
      if (isMounted && res.success && res.data?.sessions) {
        const active = res.data.sessions.find((s: any) => s.status === 'Active') || res.data.sessions[0];
        if (active) setActiveSessionNumber(active.number);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-sm">
      <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand & App Context */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Fuel className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-sm sm:text-base text-white">
                CONSOLATE OIL
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono-num">
                {currentUser?.role === 'ADMIN' ? 'ADMIN' : 'WORKER'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>{currentUser?.name}</span>
              <span>·</span>
              <span className="font-mono-num font-medium text-amber-400">
                {activeSessionNumber}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Device Mockup Toggle for previewing */}
          <button
            onClick={() => setPreviewMode(previewMode === 'mobile' ? 'responsive' : 'mobile')}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title={previewMode === 'mobile' ? 'Afficher en mode plein écran' : 'Afficher en format smartphone'}
            aria-label="Changer le mode d'affichage"
          >
            {previewMode === 'mobile' ? (
              <Monitor className="w-4 h-4" />
            ) : (
              <Smartphone className="w-4 h-4" />
            )}
          </button>

          {/* Real Logout button */}
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:text-white hover:bg-slate-700 transition-colors"
            title="Déconnexion"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Quitter</span>
          </button>
        </div>
      </div>
    </header>
  );
};
