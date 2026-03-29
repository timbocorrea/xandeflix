import axios from 'axios';

/**
 * Service to interact with The Movie Database (TMDB) API
 * Provides metadata fetching and title cleaning for IPTV content.
 */
export class TMDBService {
  private static get API_KEY() { return process.env.TMDB_API_KEY || ''; }
  private static BASE_URL = 'https://api.themoviedb.org/3';

  /**
   * Cleans raw IPTV titles by removing common tags, quality markers, and language indicators
   */
  private static cleanTitle(rawTitle: string): string {
    let clean = rawTitle;

    // 1. Remove bracketed/parenthesized tags like |PT|, [4K], (2023)
    clean = clean.replace(/\|[^|]+\|/g, ' '); 
    clean = clean.replace(/\[[^\]]+\]/g, ' ');
    clean = clean.replace(/\([^)]+\)/g, ' ');
    
    // 2. Remove common noise keywords (quality, source, audio, etc)
    const keywords = [
      'fhd', 'hd', 'uhd', '4k', '8k', 'sd', 'h264', 'h265', 'hevc', 
      'dublado', 'legendado', 'dub', 'leg', 'dual', 'dual audio',
      'netflix', 'amazon', 'disney+', 'hbo', 'globoplay', 'apple tv',
      'ts', 'tc', 'cam', 'dvdrip', 'brrip', 'web-dl', 'bluray', 'hdtv',
      'completo', 'teaser', 'trailer', 'estreia', 'estréia',
      'serie', 'série', 'filme', 'novela', 'documentario', 'documentário'
    ];
    
    keywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      clean = clean.replace(regex, ' ');
    });

    // 3. Remove standard season/episode noise if it's there (for better series matching)
    clean = clean.replace(/\bS\d{1,2}E\d{1,2}\b/i, ' '); 
    clean = clean.replace(/\bT\d{1,2}E\d{1,2}\b/i, ' ');

    // 4. Final Cleanup: replace redundant spaces and trim
    clean = clean.replace(/\s+/g, ' ').trim();
    
    return clean;
  }

  private static cache = new Map<string, any>();

  /**
   * Searches for a movie or TV show on TMDB using a raw IPTV title
   */
  public static async searchMedia(rawTitle: string, type: 'movie' | 'series') {
    if (!this.API_KEY || this.API_KEY === 'sua_chave_da_api_v3_aqui') {
      // Discreetly log if the API key is missing or still a placeholder
      if (process.env.NODE_ENV === 'development' && !this.API_KEY) {
        console.warn('[TMDB] TMDB_API_KEY is not configured.');
      }
      return null;
    }

    const title = this.cleanTitle(rawTitle);
    if (!title || title.length < 2) return null;

    const cacheKey = `${type}_${title}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
    
    try {
      const response = await axios.get(`${this.BASE_URL}${endpoint}`, {
        params: {
          api_key: this.API_KEY,
          query: title,
          language: 'pt-BR',
          include_adult: false,
        },
        timeout: 5000 // Quick timeout to not slow down playlist parsing too much
      });

      const result = response.data.results?.[0];
      if (!result) {
         this.cache.set(cacheKey, null);
         return null;
      }

      // Map TMDB fields to our Media interface
      const enrichedResult = {
        description: result.overview || 'Sinopse não disponível.',
        thumbnail: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : '',
        backdrop: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : '',
        year: parseInt((result.release_date || result.first_air_date || '2024').substring(0, 4)),
        rating: result.vote_average ? result.vote_average.toFixed(1) : '0.0'
      };

      if (this.cache.size > 1000) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey as string);
      }
      this.cache.set(cacheKey, enrichedResult);
      return enrichedResult;
    } catch (error: any) {
      if (this.cache.size > 1000) this.cache.clear();
      this.cache.set(cacheKey, null); // cache negative results to protect rate limits
      // Log errors discretely
      console.log(`[TMDB] Could not fetch metadata for "${title}": ${error.message}`);
      return null;
    }
  }
}
