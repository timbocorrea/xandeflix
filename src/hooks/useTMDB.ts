import { useState, useEffect } from 'react';
import { cleanMediaTitle } from '../lib/titleCleaner';

interface TMDBData {
  description: string;
  thumbnail: string;
  backdrop: string;
  year: number;
  rating: string;
}

// Memory cache to avoid repeated requests for the same raw title
const tmdbCache = new Map<string, TMDBData | null>();

/**
 * Custom hook to fetch rich metadata from TMDB via our local backend API.
 * Optimized with title cleaning and local caching.
 * 
 * @param title The RAW media title from the IPTV list
 * @param type The type of media (movie or series)
 */
export const useTMDB = (title: string | undefined, type: string | undefined) => {
  const [data, setData] = useState<TMDBData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!title || !type || type === 'live') {
      setData(null);
      setLoading(false);
      return;
    }

    // 1. Check Cache first
    const cacheKey = `${type}:${title}`;
    if (tmdbCache.has(cacheKey)) {
      setData(tmdbCache.get(cacheKey) || null);
      setLoading(false);
      return;
    }

    const fetchMetadata = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // 2. Clean title and get year
        const { cleanTitle, year } = cleanMediaTitle(title);
        
        let apiUrl = `/api/metadata?title=${encodeURIComponent(cleanTitle)}&type=${type}`;
        if (year) {
          apiUrl += `&year=${year}`;
        }

        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          throw new Error('Failed to fetch metadata');
        }
        
        const metadata = await response.json();
        const result = metadata || null;
        
        // 3. Save to Cache
        tmdbCache.set(cacheKey, result);
        setData(result);
      } catch (err: any) {
        console.warn(`[useTMDB] Error for "${title}":`, err.message);
        setError(err.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    // Debounce to improve UI performance
    const timeout = setTimeout(fetchMetadata, 450);
    return () => clearTimeout(timeout);
  }, [title, type]);

  return { data, loading, error };
};
