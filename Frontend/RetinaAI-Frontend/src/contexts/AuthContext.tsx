import React, { createContext, useContext, useState, useCallback } from 'react';
import { User } from '../types';
import { apiLogin } from '../services/auth';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isDoctor: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('retinaai_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('retinaai_token')
  );

  const login = useCallback(async (username: string, password: string) => {
    const { access_token, user: userData } = await apiLogin(username, password);
    localStorage.setItem('retinaai_token', access_token);
    localStorage.setItem('retinaai_user', JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('retinaai_token');
    localStorage.removeItem('retinaai_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, isAuthenticated: !!token,
      login, logout, isDoctor: user?.role === 'doctor'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
