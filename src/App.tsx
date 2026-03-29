import React, { useState, useEffect } from 'react';
import HomeScreen from './screens/HomeScreen';
import { AdminPanel } from './screens/AdminPanel';
import { LoginScreen } from './screens/LoginScreen';
import { useStore } from './store/useStore';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const isAdminMode = useStore((state) => state.isAdminMode);
  const setIsAdminMode = useStore((state) => state.setIsAdminMode);

  useEffect(() => {
    const savedToken = localStorage.getItem('xandeflix_auth_token');
    if (savedToken) {
      setIsAuthenticated(true);
    }
    setIsReady(true);
  }, []);

  const handleLoginSuccess = (playlistUrl?: string, userId?: string, authToken?: string, role?: 'admin' | 'user') => {
    if (playlistUrl) localStorage.setItem('xandeflix_playlist_url', playlistUrl);
    if (userId) localStorage.setItem('xandeflix_user_id', userId);
    if (authToken) localStorage.setItem('xandeflix_auth_token', authToken);
    if (role) localStorage.setItem('xandeflix_auth_role', role);
    
    localStorage.setItem('xandeflix_session', 'active');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('xandeflix_session');
    localStorage.removeItem('xandeflix_playlist_url');
    localStorage.removeItem('xandeflix_user_id');
    localStorage.removeItem('xandeflix_auth_token');
    localStorage.removeItem('xandeflix_auth_role');
    localStorage.removeItem('xandeflix_admin_mode');
    setIsAdminMode(false);
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
      {!isAuthenticated ? (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      ) : isAdminMode ? (
        <AdminPanel onExitAdmin={handleExitAdmin} />
      ) : (
        <HomeScreen onLogout={handleLogout} />
      )}
    </div>
  );
}
