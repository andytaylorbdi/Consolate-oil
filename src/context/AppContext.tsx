import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TabType } from '../types';

interface AppContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  plusSubSection: string | null;
  setPlusSubSection: (section: string | null) => void;
  previewMode: 'mobile' | 'responsive';
  setPreviewMode: (mode: 'mobile' | 'responsive') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<TabType>('accueil');
  const [plusSubSection, setPlusSubSection] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'responsive'>('mobile');

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        plusSubSection,
        setPlusSubSection,
        previewMode,
        setPreviewMode,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
