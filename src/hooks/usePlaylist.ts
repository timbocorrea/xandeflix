import { useCallback, useState } from 'react';
import { useStore } from '../store/useStore';
import { MOCK_CATEGORIES } from '../mock/data';

export const usePlaylist = () => {
  const [loading, setLoading] = useState(false);
  const { setAllCategories, setIsUsingMock } = useStore();

  const fetchPlaylist = useCallback(async () => {
    setLoading(true);
    const userId = localStorage.getItem('xandeflix_user_id');
    let playlistUrl = localStorage.getItem('xandeflix_playlist_url') || '';

    try {
      // 1. Refresh user info to get the latest playlist URL from admin changes
      if (userId) {
        console.log('[SESSION] Refreshing user data for ID:', userId);
        const meResponse = await fetch(`/api/auth/me?id=${userId}`);
        if (meResponse.ok) {
          const userData = await meResponse.json();
          if (userData.playlistUrl) {
            playlistUrl = userData.playlistUrl;
            localStorage.setItem('xandeflix_playlist_url', playlistUrl);
          }
        }
      }

      console.log('[API] Fetching playlist for URL:', playlistUrl.substring(0, 50) + '...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      // 2. Fetch the actual M3U content (now with the correct URL)
      const fetchUrl = playlistUrl ? `/api/playlist?url=${encodeURIComponent(playlistUrl)}` : '/api/playlist';
      const response = await fetch(fetchUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        setAllCategories(data);
        setIsUsingMock(false);
      } else {
        console.warn('[API] Empty playlist, using mock data');
        setAllCategories(MOCK_CATEGORIES);
        setIsUsingMock(true);
      }
    } catch (error) {
      console.error('[API] Error fetching playlist:', error);
      setAllCategories(MOCK_CATEGORIES);
      setIsUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, [setAllCategories, setIsUsingMock]);

  return { fetchPlaylist, loading };
};
