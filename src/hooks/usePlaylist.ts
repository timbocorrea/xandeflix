import { useCallback, useState } from 'react';
import { useStore } from '../store/useStore';
import { MOCK_CATEGORIES } from '../mock/data';

export const usePlaylist = () => {
  const [loading, setLoading] = useState(false);
  const { setAllCategories, setIsUsingMock } = useStore();

  const fetchPlaylist = useCallback(async () => {
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      console.log('[API] Fetching centralized playlist...');
      const response = await fetch('/api/playlist', { signal: controller.signal });
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
