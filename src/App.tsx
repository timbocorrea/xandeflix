import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { LoginScreen } from './screens/LoginScreen';
import { getSessionSnapshot, signOutSupabaseSession, type SessionSnapshot } from './lib/auth';
import { supabase } from './lib/supabase';
import { useStore } from './store/useStore';

const HomeScreen = lazy(() => import('./screens/HomeScreen'));
const AdminPanel = lazy(() =>
  import('./screens/AdminPanel').then((module) => ({ default: module.AdminPanel })),
);

const LEGACY_AUTH_STORAGE_KEYS = [
  'xandeflix_auth_token',
  'xandeflix_auth_role',
  'xandeflix_user_id',
  'xandeflix_session',
] as const;

function clearLegacyAuthStorage() {
  LEGACY_AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));

  const sessionKeysToRemove: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith('xandeflix_')) {
      sessionKeysToRemove.push(key);
    }
  }

  sessionKeysToRemove.forEach((key) => sessionStorage.removeItem(key));
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [sessionRole, setSessionRole] = useState<'admin' | 'user' | null>(null);
  const isAdminMode = useStore((state) => state.isAdminMode);
  const setIsAdminMode = useStore((state) => state.setIsAdminMode);
  const hydrateProfileState = useStore((state) => state.hydrateProfileState);
  const clearSessionState = useStore((state) => state.clearSessionState);
  const setAdultAccessSettings = useStore((state) => state.setAdultAccessSettings);

  const resetSession = useCallback(() => {
    clearLegacyAuthStorage();
    setSessionRole(null);
    setIsAdminMode(false);
    setAdultAccessSettings(null);
    clearSessionState();
  }, [clearSessionState, setAdultAccessSettings, setIsAdminMode]);

  const applySessionSnapshot = useCallback(
    (snapshot: SessionSnapshot) => {
      clearLegacyAuthStorage();
      setSessionRole(snapshot.role);
      setIsAdminMode(snapshot.role === 'admin');

      if (snapshot.role === 'user' && snapshot.data) {
        setAdultAccessSettings(snapshot.data.adultAccess);
        hydrateProfileState(snapshot.data.id);
      } else {
        setAdultAccessSettings(null);
        clearSessionState();
      }
    },
    [clearSessionState, hydrateProfileState, setAdultAccessSettings, setIsAdminMode],
  );

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      const snapshot = await getSessionSnapshot();

      if (!isMounted) {
        return;
      }

      if (!snapshot) {
        resetSession();
      } else {
        applySessionSnapshot(snapshot);
      }

      setIsReady(true);
    };

    void restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      if (!session) {
        resetSession();
        setIsReady(true);
        return;
      }

      void getSessionSnapshot()
        .then((snapshot) => {
          if (!isMounted) {
            return;
          }

          if (!snapshot) {
            resetSession();
          } else {
            applySessionSnapshot(snapshot);
          }

          setIsReady(true);
        })
        .catch(() => {
          if (!isMounted) {
            return;
          }

          resetSession();
          setIsReady(true);
        });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [applySessionSnapshot, resetSession]);

  const handleLoginSuccess = useCallback(
    (snapshot: SessionSnapshot) => {
      applySessionSnapshot(snapshot);
      setIsReady(true);
    },
    [applySessionSnapshot],
  );

  const handleLogout = useCallback(() => {
    resetSession();
    setIsReady(true);
    void signOutSupabaseSession();
  }, [resetSession]);

  const handleExitAdmin = useCallback(() => {
    if (sessionRole === 'user') {
      setIsAdminMode(false);
      return;
    }

    handleLogout();
  }, [handleLogout, sessionRole, setIsAdminMode]);

  const isAuthenticated = sessionRole !== null;

  if (!isReady) {
    return null;
  }

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
