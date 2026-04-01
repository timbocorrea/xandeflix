import React, { useState, useEffect, lazy, Suspense } from 'react';
import { LoginScreen } from './screens/LoginScreen';
import { useStore } from './store/useStore';

const HomeScreen = lazy(() => import('./screens/HomeScreen'));
const AdminPanel = lazy(() =>
  import('./screens/AdminPanel').then((module) => ({ default: module.AdminPanel })),
);

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const isAdminMode = useStore((state) => state.isAdminMode);
  const setIsAdminMode = useStore((state) => state.setIsAdminMode);
  const hydrateProfileState = useStore((state) => state.hydrateProfileState);
  const clearSessionState = useStore((state) => state.clearSessionState);
  const setAdultAccessSettings = useStore((state) => state.setAdultAccessSettings);

  useEffect(() => {
    let isMounted = true;

    const clearStoredSession = () => {
      localStorage.clear();
      sessionStorage.clear();
      setIsAdminMode(false);
      clearSessionState();
    };

    const restoreSession = async () => {
      const savedToken = localStorage.getItem('xandeflix_auth_token');
      if (!savedToken) {
        clearSessionState();
        if (isMounted) {
          setIsAuthenticated(false);
          setIsReady(true);
        }
        return;
      }

      try {
        const response = await fetch('/api/auth/session', {
          headers: { 'x-auth-token': savedToken }
        });

        if (!response.ok) {
          throw new Error('Invalid session');
        }

        const session = await response.json();
        const role = session.role === 'admin' ? 'admin' : 'user';

        localStorage.setItem('xandeflix_auth_role', role);
        setIsAdminMode(role === 'admin');

        if (role === 'user' && session.data) {
          if (session.data.playlistUrl) localStorage.setItem('xandeflix_playlist_url', session.data.playlistUrl);
          else localStorage.removeItem('xandeflix_playlist_url');

          if (session.data.id) localStorage.setItem('xandeflix_user_id', session.data.id);
          else localStorage.removeItem('xandeflix_user_id');

          setAdultAccessSettings(session.data.adultAccess);
          hydrateProfileState(session.data.id);
        } else {
          localStorage.removeItem('xandeflix_playlist_url');
          localStorage.removeItem('xandeflix_user_id');
          setAdultAccessSettings(null);
          clearSessionState();
        }

        if (isMounted) {
          setIsAuthenticated(true);
        }
      } catch {
        clearStoredSession();
        if (isMounted) {
          setIsAuthenticated(false);
        }
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [clearSessionState, hydrateProfileState, setAdultAccessSettings, setIsAdminMode]);

  const handleLoginSuccess = (playlistUrl?: string, userId?: string, authToken?: string, role?: 'admin' | 'user') => {
    if (playlistUrl) localStorage.setItem('xandeflix_playlist_url', playlistUrl);
    else localStorage.removeItem('xandeflix_playlist_url');

    if (userId) localStorage.setItem('xandeflix_user_id', userId);
    else localStorage.removeItem('xandeflix_user_id');

    if (authToken) localStorage.setItem('xandeflix_auth_token', authToken);
    if (role) {
      localStorage.setItem('xandeflix_auth_role', role);
      setIsAdminMode(role === 'admin');
    }

    if (role === 'user') {
      hydrateProfileState(userId);
    } else {
      localStorage.removeItem('xandeflix_playlist_url');
      localStorage.removeItem('xandeflix_user_id');
      clearSessionState();
    }
    
    localStorage.setItem('xandeflix_session', 'active');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
      localStorage.clear();
      sessionStorage.clear();
      setIsAdminMode(false);
      clearSessionState();
      setIsAuthenticated(false);
  };

  // When admin exits admin panel, check if there's a real user session
  const handleExitAdmin = () => {
    const role = localStorage.getItem('xandeflix_auth_role');
    if (role === 'user') {
      setIsAdminMode(false);
    } else {
      handleLogout();
    }
  };

  if (!isReady) return null;

  return (
    <div className="w-full h-full bg-[#050505]">
      <Suspense fallback={<div className="w-full h-full bg-[#050505]" />}>
        {!isAuthenticated ? (
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        ) : isAdminMode ? (
          <AdminPanel onExitAdmin={handleExitAdmin} />
        ) : (
          <HomeScreen onLogout={handleLogout} />
        )}
      </Suspense>
    </div>
  );
}
