import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import { WorkerDashboardData } from '../../types/api.ts';
import { Fuel, LogOut } from 'lucide-react';

import { WorkerBottomNav, WorkerTab } from './WorkerBottomNav.tsx';
import { WorkerAccueil } from './WorkerAccueil.tsx';
import { WorkerFocus } from './WorkerFocus.tsx';
import { WorkerHistorique } from './WorkerHistorique.tsx';

export const WorkerHome: React.FC = () => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkerTab>('accueil');
  const [dashboard, setDashboard] = useState<WorkerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Persistent liters input so switching tabs doesn't discard typed values
  const [litersInput, setLitersInput] = useState<string>('100');

  const fetchWorkerData = async () => {
    try {
      const res = await api.worker.getDashboard();
      if (res.success && res.data) {
        setDashboard(res.data);
        if (res.data.nextVehicle && litersInput === '100') {
          setLitersInput(res.data.nextVehicle.suggestedLiters.toString());
        }
      }
    } catch (err) {
      console.error('Failed to load worker dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkerData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="text-slate-500 font-medium text-sm flex items-center gap-2">
          <Fuel className="w-5 h-5 animate-pulse text-amber-500" />
          <span>Chargement du poste pompiste...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-24 flex flex-col">
      {/* Top Header Bar */}
      <header className="bg-slate-900 text-white p-3.5 sticky top-0 z-30 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Fuel className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white tracking-tight">
                  CONSOLATE OIL
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono-num">
                  POMPISTE
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[210px]">
                {dashboard?.currentLocation?.name || 'Dépôt Central'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:text-white hover:bg-slate-700 transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Quitter</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area: Accueil · Focus · Historique */}
      <main className="max-w-md mx-auto p-3.5 w-full flex-1">
        {activeTab === 'accueil' && (
          <WorkerAccueil
            dashboard={dashboard}
            onStartFocus={() => setActiveTab('focus')}
            onGoToHistorique={() => setActiveTab('historique')}
          />
        )}

        {activeTab === 'focus' && (
          <WorkerFocus
            dashboard={dashboard}
            litersInput={litersInput}
            setLitersInput={setLitersInput}
            onRefreshDashboard={fetchWorkerData}
          />
        )}

        {activeTab === 'historique' && (
          <WorkerHistorique
            dashboard={dashboard}
            onRefreshDashboard={fetchWorkerData}
          />
        )}
      </main>

      {/* Primary 3-Destination Navigation: Accueil · Focus · Historique */}
      <WorkerBottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};
