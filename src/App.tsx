import React, { useState, useEffect } from 'react';
import HomeScreen from './screens/HomeScreen';
import { SetupScreen } from './screens/SetupScreen';
import { AdminPanel } from './screens/AdminPanel';
import { useStore } from './store/useStore';

export default function App() {
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const savedUrl = localStorage.getItem('xandeflix_playlist_url');
    if (savedUrl) {
      setPlaylistUrl(savedUrl);
    }
    setIsReady(true);
  }, []);

  const handleSetupComplete = (url: string) => {
    localStorage.setItem('xandeflix_playlist_url', url);
    setPlaylistUrl(url);
  };

  const handleLogout = () => {
    localStorage.removeItem('xandeflix_playlist_url');
    setPlaylistUrl(null);
  };

  const { isAdminMode } = useStore();

  if (!isReady) return null;

  return (
    <div className="w-full h-full bg-[#050505]">
      {isAdminMode ? (
        <AdminPanel />
      ) : !playlistUrl ? (
        <SetupScreen onComplete={handleSetupComplete} />
      ) : (
        <HomeScreen onLogout={handleLogout} />
      )}
    </div>
  );
}
