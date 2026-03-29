import React, { useState, useEffect } from 'react';
import HomeScreen from './screens/HomeScreen';
import { AdminPanel } from './screens/AdminPanel';
import { LoginScreen } from './screens/LoginScreen';
import { useStore } from './store/useStore';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const { isAdminMode, setIsAdminMode } = useStore();

  useEffect(() => {
    const savedSession = localStorage.getItem('xandeflix_session');
    if (savedSession) {
      setIsAuthenticated(true);
    }
    setIsReady(true);
  }, []);

  const handleLoginSuccess = (playlistUrl?: string, userId?: string) => {
    if (playlistUrl) localStorage.setItem('xandeflix_playlist_url', playlistUrl);
    if (userId) localStorage.setItem('xandeflix_user_id', userId);
    
    localStorage.setItem('xandeflix_session', 'active');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('xandeflix_session');
    localStorage.removeItem('xandeflix_playlist_url');
    localStorage.removeItem('xandeflix_user_id');
    localStorage.removeItem('xandeflix_admin_mode');
    setIsAdminMode(false);
    setIsAuthenticated(false);
  };

  // When admin exits admin panel, check if there's a real user session
  const handleExitAdmin = () => {
    const hasUserSession = localStorage.getItem('xandeflix_user_id');
    if (hasUserSession) {
      // Admin also has a user session, go to home
      setIsAdminMode(false);
    } else {
      // Admin-only session, go back to login
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
