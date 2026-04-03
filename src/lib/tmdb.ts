import { cleanMediaTitle } from './titleCleaner';

export type TMDBMediaType = 'movie' | 'series';

export interface TMDBData {
  description: string;
  thumbnail: string;
  backdrop: string;
  year: number;
  rating: string;
}

export interface TMDBSearchResult {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
}

const rawTmdbApiKey = String(import.meta.env.VITE_TMDB_API_KEY || '').trim();
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const DEFAULT_TIMEOUT_MS = 5000;

function getTMDBApiKey(): string {
  return rawTmdbApiKey;
}

export function isTMDBConfigured(): boolean {
  return Boolean(getTMDBApiKey());
}

function buildTMDBEndpoint(type: TMDBMediaType): string {
  return type === 'movie' ? 'movie' : 'tv';
}

function buildSearchUrl(query: string, type: TMDBMediaType, year?: string): string {
  const url = new URL(`${TMDB_API_BASE}/search/${buildTMDBEndpoint(type)}`);
  url.searchParams.set('api_key', getTMDBApiKey());
  url.searchParams.set('query', query);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('include_adult', 'false');

  if (year) {
    url.searchParams.set(type === 'movie' ? 'year' : 'first_air_date_year', year);
  }

  return url.toString();
}

async function fetchTMDBJson<T>(url: string): Promise<T> {
  if (!isTMDBConfigured()) {
    throw new Error('TMDB nao configurado. Defina VITE_TMDB_API_KEY no .env.');
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`TMDB HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function mapTMDBSearchResult(result: any): TMDBSearchResult {
  return {
    id: Number(result?.id || 0),
    title: String(result?.title || result?.name || ''),
    overview: String(result?.overview || ''),
    poster_path: typeof result?.poster_path === 'string' ? result.poster_path : null,
    backdrop_path: typeof result?.backdrop_path === 'string' ? result.backdrop_path : null,
    release_date: typeof result?.release_date === 'string' ? result.release_date : undefined,
    first_air_date:
      typeof result?.first_air_date === 'string' ? result.first_air_date : undefined,
    vote_average:
      typeof result?.vote_average === 'number' ? result.vote_average : Number(result?.vote_average || 0),
  };
}

function buildPosterUrl(path: string | null, size: 'w500' | 'original'): string {
  if (!path) return '';
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export async function searchTMDB(query: string, type: TMDBMediaType): Promise<TMDBSearchResult[]> {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) {
    return [];
  }

  const payload = await fetchTMDBJson<{ results?: any[] }>(buildSearchUrl(cleanedQuery, type));
  return Array.isArray(payload.results) ? payload.results.map(mapTMDBSearchResult) : [];
}

export async function fetchTMDBMetadata(
  rawTitle: string,
  type: TMDBMediaType,
): Promise<TMDBData | null> {
  if (!rawTitle.trim()) {
    return null;
  }

  const { cleanTitle, year } = cleanMediaTitle(rawTitle);
  const normalizedTitle = cleanTitle.trim();
  if (!normalizedTitle) {
    return null;
  }

  const payload = await fetchTMDBJson<{ results?: any[] }>(
    buildSearchUrl(normalizedTitle, type, year),
  );
  const firstResult = Array.isArray(payload.results) ? payload.results[0] : null;

  if (!firstResult) {
    return null;
  }

  const mapped = mapTMDBSearchResult(firstResult);
  const releaseYear = Number(
    String(mapped.release_date || mapped.first_air_date || '0').slice(0, 4),
  );

  return {
    description: mapped.overview || 'Sinopse nao disponivel.',
    thumbnail: buildPosterUrl(mapped.poster_path, 'w500'),
    backdrop: buildPosterUrl(mapped.backdrop_path, 'original'),
    year: Number.isFinite(releaseYear) && releaseYear > 0 ? releaseYear : 0,
    rating: mapped.vote_average ? mapped.vote_average.toFixed(1) : '0.0',
  };
}
