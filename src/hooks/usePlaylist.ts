import { useCallback, useState } from 'react';
import { useStore } from '../store/useStore';
import { MOCK_CATEGORIES } from '../mock/data';

export const usePlaylist = () => {
  const [loading, setLoading] = useState(false);
  const { setAllCategories, setIsUsingMock } = useStore();

  const fetchPlaylist = useCallback(async () => {
    const hasData = useStore.getState().allCategories.length > 0;
    
    // Only show global loader if we don't have any data yet
    if (!hasData) setLoading(true);
    
    const authToken = localStorage.getItem('xandeflix_auth_token') || '';
    const authRole = localStorage.getItem('xandeflix_auth_role') || '';
    let playlistUrl = localStorage.getItem('xandeflix_playlist_url') || '';

    if (authRole === 'admin') {
      setLoading(false);
      return;
    }

    try {
      // 1. Refresh user info to get the latest playlist URL
      if (authToken) {
        const meResponse = await fetch('/api/auth/me', {
          headers: { 'x-auth-token': authToken }
        });
        if (meResponse.ok) {
          const userData = await meResponse.json();
          if (userData.playlistUrl) {
            playlistUrl = userData.playlistUrl;
            localStorage.setItem('xandeflix_playlist_url', playlistUrl);
          }
        }
      }

      // 2. Fetch the actual M3U content
      const fetchUrl = authToken
        ? '/api/playlist'
        : (playlistUrl ? `/api/playlist?url=${encodeURIComponent(playlistUrl)}` : '/api/playlist');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // Increased timeout for large lists

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: authToken ? { 'x-auth-token': authToken } : undefined,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        setAllCategories(data);
        setIsUsingMock(false);
      } else if (!hasData) {
        setAllCategories(MOCK_CATEGORIES);
        setIsUsingMock(true);
      }
    } catch (error) {
      console.error('[API] Error fetching playlist:', error);
      if (!hasData) {
        setAllCategories(MOCK_CATEGORIES);
        setIsUsingMock(true);
      }
    } finally {
      setLoading(false);
    }
  }, [setAllCategories, setIsUsingMock]);

  return { fetchPlaylist, loading };
};
