import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/store/useAuthStore.js';

import Login from '../pages/Login.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Profile from '../pages/Profile.jsx';
import GroupInvite from '../pages/GroupInvite.jsx';
import { NotificationProvider } from '../features/notifications/components/NotificationProvider.jsx';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, initializeAuth, isLoading } = useAuthStore();

  useEffect(() => {
    // Silent check for HTTPOnly session cookie
    initializeAuth();
  }, [initializeAuth]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500"></div>
        <p className="text-slate-400 text-sm">Verifying session...</p>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, initializeAuth, isLoading } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500"></div>
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    const queryParams = new URLSearchParams(window.location.search);
    const redirect = queryParams.get('redirect') || '/';
    return <Navigate to={redirect} replace />;
  }

  return children;
};

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <NotificationProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/:userId?"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join/:chatId"
            element={<GroupInvite />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </NotificationProvider>
    </BrowserRouter>
  );
};
