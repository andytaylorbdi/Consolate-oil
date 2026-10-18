import React from 'react';
import { useApp } from '../../context/AppContext';
import { Home, BarChart3, FolderKanban, MoreHorizontal } from 'lucide-react';
import { TabType } from '../../types';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, previewMode } = useApp();

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
  };

  const navItems = [
    {
      id: 'accueil' as TabType,
      label: 'Accueil',
      icon: Home,
    },
    {
      id: 'distribution' as TabType,
      label: 'Distribution',
      icon: BarChart3,
    },
    {
      id: 'gestion' as TabType,
      label: 'Gestion',
      icon: FolderKanban,
    },
    {
      id: 'plus' as TabType,
      label: 'Plus',
      icon: MoreHorizontal,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]">
      <div className={`mx-auto grid grid-cols-4 items-center h-16 px-1 transition-all duration-150 ${previewMode === 'mobile' ? 'max-w-md' : 'max-w-2xl'}`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`min-h-[48px] min-w-[48px] flex flex-col items-center justify-center relative transition-colors duration-150 py-1 ${
                isActive
                  ? 'text-amber-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 text-amber-600 stroke-[2.2]' : 'stroke-[1.8]'
                  }`}
                />
                {isActive && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-amber-500 rounded-full" />
                )}
              </div>
              <span className={`text-[11px] tracking-tight mt-1 ${isActive ? 'font-bold text-amber-700' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
