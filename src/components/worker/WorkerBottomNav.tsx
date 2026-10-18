import React from 'react';
import { Home, Zap, Clock } from 'lucide-react';

export type WorkerTab = 'accueil' | 'focus' | 'historique';

interface WorkerBottomNavProps {
  activeTab: WorkerTab;
  setActiveTab: (tab: WorkerTab) => void;
}

export const WorkerBottomNav: React.FC<WorkerBottomNavProps> = ({
  activeTab,
  setActiveTab,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg">
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-around">
        {/* 1. ACCUEIL */}
        <button
          onClick={() => setActiveTab('accueil')}
          className={`flex-1 py-1 flex flex-col items-center justify-center transition-colors relative ${
            activeTab === 'accueil'
              ? 'text-amber-600 font-bold'
              : 'text-slate-400 hover:text-slate-700 font-medium'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] tracking-tight">Accueil</span>
          {activeTab === 'accueil' && (
            <span className="absolute bottom-0 w-8 h-0.5 bg-amber-500 rounded-full" />
          )}
        </button>

        {/* 2. FOCUS (PRIMARY PROMINENT DESTINATION) */}
        <button
          onClick={() => setActiveTab('focus')}
          className="flex-1 py-1 flex flex-col items-center justify-center relative -top-3 group"
          title="Mode Focus - Distribution Immédiate"
        >
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-md transition-all active:scale-95 ${
              activeTab === 'focus'
                ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-100 shadow-amber-500/30'
                : 'bg-slate-900 text-amber-400 hover:bg-slate-800'
            }`}
          >
            <Zap className="w-6 h-6 stroke-[2.5]" />
          </div>
          <span
            className={`text-[11px] mt-1 tracking-tight font-extrabold ${
              activeTab === 'focus' ? 'text-amber-900' : 'text-slate-600'
            }`}
          >
            Focus
          </span>
        </button>

        {/* 3. HISTORIQUE */}
        <button
          onClick={() => setActiveTab('historique')}
          className={`flex-1 py-1 flex flex-col items-center justify-center transition-colors relative ${
            activeTab === 'historique'
              ? 'text-amber-600 font-bold'
              : 'text-slate-400 hover:text-slate-700 font-medium'
          }`}
        >
          <Clock className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] tracking-tight">Historique</span>
          {activeTab === 'historique' && (
            <span className="absolute bottom-0 w-8 h-0.5 bg-amber-500 rounded-full" />
          )}
        </button>
      </div>
    </nav>
  );
};
