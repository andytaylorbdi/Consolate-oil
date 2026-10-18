import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { WorkerHome } from './components/worker/WorkerHome.tsx';

import { Header } from './components/common/Header.tsx';
import { BottomNav } from './components/common/BottomNav.tsx';
import { AdminAccueilTab } from './components/admin/AdminAccueilTab.tsx';
import { AdminDistributionTab } from './components/admin/AdminDistributionTab.tsx';
import { AdminGestionTab } from './components/admin/AdminGestionTab.tsx';
import { AdminPlusTab } from './components/admin/AdminPlusTab.tsx';

const AppRouter: React.FC = () => {
  const { currentUser, isLoading } = useAuth();
  const { activeTab, previewMode } = useApp();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-slate-500 font-medium text-sm">Chargement session...</div>
      </div>
    );
  }

  // Not logged in -> Show real Login Page
  if (!currentUser) {
    return <LoginPage />;
  }

  // Logged in as WORKER -> Route strictly to Worker Interface (Accueil / Focus / Historique)
  if (currentUser.role === 'WORKER') {
    return <WorkerHome />;
  }

  // Logged in as ADMIN -> Route to 4 Primary Admin Tabs: Accueil, Distribution, Gestion, Plus
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 w-full">
      {/* Sticky Mobile Header */}
      <Header />

      {/* Main Content Area */}
      <main
        className={`w-full mx-auto flex-1 px-3 sm:px-4 pt-3 pb-28 sm:pb-32 transition-all duration-150 ${
          previewMode === 'mobile' ? 'max-w-md' : 'max-w-2xl'
        }`}
      >
        {activeTab === 'accueil' && <AdminAccueilTab />}
        {activeTab === 'distribution' && <AdminDistributionTab />}
        {activeTab === 'gestion' && <AdminGestionTab />}
        {(activeTab === 'plus' || activeTab === 'historique') && <AdminPlusTab />}
      </main>

      {/* Bottom Tab Navigation */}
      <BottomNav />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppRouter />
      </AppProvider>
    </AuthProvider>
  );
}
