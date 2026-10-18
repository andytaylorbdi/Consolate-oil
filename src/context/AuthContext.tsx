import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types/api.ts';
import { api, setAuthToken } from '../services/api.ts';

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  verifyAdminPin: (pin: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const res = await api.auth.me();
      if (res.success && res.data?.user) {
        setCurrentUser(res.data.user);
      } else {
        setCurrentUser(null);
        setAuthToken(null);
      }
    } catch {
      setCurrentUser(null);
      setAuthToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    if (res.success && res.data?.user) {
      if ((res.data as any).token) {
        setAuthToken((res.data as any).token);
      }
      setCurrentUser(res.data.user);
      return { success: true };
    }
    return { success: false, error: res.error?.message || 'Identifiants invalides.' };
  };

  const logout = async () => {
    await api.auth.logout();
    setAuthToken(null);
    setCurrentUser(null);
  };

  const verifyAdminPin = async (pin: string): Promise<boolean> => {
    const res = await api.auth.verifyPin(pin);
    return res.success;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        login,
        logout,
        refreshUser,
        verifyAdminPin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
