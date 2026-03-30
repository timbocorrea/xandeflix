import { useState, useEffect } from 'react';
import { Media } from '../types';

interface TMDBData {
  description: string;
  thumbnail: string;
  backdrop: string;
  year: number;
  rating: string;
}

/**
 * Custom hook to fetch rich metadata from TMDB via our local backend API.
 * 
 * @param title The media title to search for
 * @param type The type of media (movie or series)
 */
export const useTMDB = (title: string | undefined, type: string | undefined) => {
  const [data, setData] = useState<TMDBData | null>(null);
  const [loading, setLoading] = useState(type !== 'live');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!title || !type || type === 'live') {
      setData(null);
      setLoading(false);
      return;
    }

    const fetchMetadata = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/metadata?title=${encodeURIComponent(title)}&type=${type}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch metadata from our server');
        }
        
        const metadata = await response.json();
        
        if (metadata) {
          setData(metadata);
        } else {
          setData(null); // No results found on TMDB
        }
      } catch (err: any) {
        console.warn(`[useTMDB] Error for "${title}":`, err.message);
        setError(err.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    // Small debounce to avoid multiple requests when user is scrolling fast
    const timeout = setTimeout(() => {
      fetchMetadata();
    }, 400);

    return () => clearTimeout(timeout);
  }, [title, type]);

  return { data, loading, error };
};
