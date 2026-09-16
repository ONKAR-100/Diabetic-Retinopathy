import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children, requireDoctor = false }: 
  { children: React.ReactNode; requireDoctor?: boolean }) {
  const { isAuthenticated, isDoctor } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireDoctor && !isDoctor) return <Navigate to="/" replace />;
  return <>{children}</>;
}
