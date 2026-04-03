import { useCallback, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Category, Media, MediaType } from '../types';
import { useStore } from '../store/useStore';
import { MOCK_CATEGORIES } from '../mock/data';
import {
  PLAYLIST_CACHE_SCHEMA_VERSION,
  buildPlaylistCacheScope,
  getPlaylistCache,
  savePlaylistCache,
} from '../lib/localCache';
import { parseXMLTV } from '../lib/epgParser';
import {
  apiFetch,
  apiGetJson,
  fetchRemoteText,
  getApiBaseUrl,
  isEpgProxyEnabled,
  isPlaylistProxyEnabled,
} from '../lib/api';
import { M3UParser } from '../lib/m3uParser';

export type PlaylistStatus =
  | 'idle'
  | 'loading_user_info'
  | 'loading_playlist'
  | 'success'
  | 'error_auth'
  | 'error_playlist'
  | 'mock_fallback';

export interface PlaylistError {
  status: PlaylistStatus;
  message: string;
  details?: string;
  playlistUrl?: string;
}

interface WorkerParseResult {
  categories: Category[];
  epgUrl: string | null;
}

interface CompactPlaylistEpisode {
  t: string;
  u: string;
  s: number;
  e: number;
}

interface CompactPlaylistSeason {
  n: number;
  ep: CompactPlaylistEpisode[];
}

interface CompactPlaylistQuality {
  n: string;
  u: string;
}

interface CompactPlaylistMedia {
  t: string;
  u?: string;
  y?: string;
  l?: string;
  g?: string;
  n?: string;
  q?: CompactPlaylistQuality[];
  se?: CompactPlaylistSeason[];
}

interface CompactPlaylistCategory {
  i: string;
  t: string;
  y?: string;
  it: CompactPlaylistMedia[];
}

interface PlaylistBootstrapResponse {
  categories: CompactPlaylistCategory[];
  epgUrl: string | null;
  playlistUrl: string;
  cached?: boolean;
}

const WORKER_PARSE_TIMEOUT_MS = 30000;
let activePlaylistLoadPromise: Promise<void> | null = null;

function describePlaylistSource(playlistUrl: string): string {
  try {
    return new URL(playlistUrl).host;
  } catch {
    return 'Lista vinculada';
  }
}

function shouldUseServerPlaylistBootstrap(): boolean {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
      return false;
    }

    const hostname = new URL(apiBaseUrl).hostname.toLowerCase();
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

function buildInflatedMediaId(categoryId: string, index: number, title: string): string {
  const normalizedTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${categoryId || 'category'}-${index}-${normalizedTitle || 'item'}`;
}

function inflateBootstrapCategories(compactCategories: CompactPlaylistCategory[]): Category[] {
  return compactCategories.map((category) => ({
    id: category.i,
    title: category.t,
    type: category.y,
    items: category.it.map((item, index) => {
      const type = (item.y || category.y || MediaType.LIVE) as MediaType;
      const thumbnail = item.l || '';
      const inflatedItem: Media = {
        id: buildInflatedMediaId(category.i, index, item.t),
        title: item.t,
        description: `Conteudo da categoria ${category.t}`,
        thumbnail,
        backdrop: thumbnail,
        videoUrl: item.u || '',
        type,
        year: 2024,
        rating: '12+',
        duration: type === MediaType.LIVE ? 'Ao Vivo' : 'VOD',
        category: category.t,
        tvgId: item.g,
        tvgName: item.n,
      };

      if (item.q?.length) {
        inflatedItem.qualities = item.q.map((quality) => ({
          name: quality.n,
          url: quality.u,
        }));
      }

      if (item.se?.length) {
        inflatedItem.seasons = item.se.map((season) => ({
          seasonNumber: season.n,
          episodes: season.ep.map((episode, episodeIndex) => ({
            id: `${inflatedItem.id}-s${season.n}-e${episode.e || episodeIndex + 1}`,
            title: episode.t,
            videoUrl: episode.u,
            seasonNumber: episode.s,
            episodeNumber: episode.e,
          })),
        }));
      }

      return inflatedItem;
    }),
  }));
}

function extractEpgUrl(m3uText: string): string | null {
  let firstNonEmptyLine = '';
  let lineStart = 0;

  for (let index = 0; index <= m3uText.length; index += 1) {
    const isLineBreak =
      index === m3uText.length ||
      m3uText.charCodeAt(index) === 10 ||
      m3uText.charCodeAt(index) === 13;

    if (!isLineBreak) {
      continue;
    }

    const candidate = m3uText.slice(lineStart, index).trim();
    if (candidate) {
      firstNonEmptyLine = candidate;
      break;
    }

    if (m3uText.charCodeAt(index) === 13 && m3uText.charCodeAt(index + 1) === 10) {
      index += 1;
    }

    lineStart = index + 1;
  }

  if (!firstNonEmptyLine || !firstNonEmptyLine.toUpperCase().startsWith('#EXTM3U')) {
    return null;
  }

  const match = firstNonEmptyLine.match(/\burl-tvg=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  return (match?.[1] || match?.[2] || match?.[3] || '').trim() || null;
}

async function parsePlaylistOnMainThread(m3uText: string): Promise<WorkerParseResult> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  return {
    categories: M3UParser.parse(m3uText),
    epgUrl: extractEpgUrl(m3uText),
  };
}

async function parsePlaylistWithWorker(m3uText: string): Promise<WorkerParseResult> {
  return new Promise<WorkerParseResult>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/m3u.worker.ts', import.meta.url), {
      type: 'module',
    });
    const timeoutId = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('Tempo limite excedido no worker de parsing da playlist.'));
    }, WORKER_PARSE_TIMEOUT_MS);

    worker.onmessage = (e) => {
      window.clearTimeout(timeoutId);
      if (e.data.success) {
        resolve(e.data.data);
      } else {
        console.error('[Playlist] Falha no processamento pelo worker:', e.data.error);
        reject(new Error(e.data.error || 'Erro no worker de parsing'));
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      window.clearTimeout(timeoutId);
      console.error('[Playlist] Erro critico no worker:', err);
      reject(new Error('Falha catastrofica no worker de processamento'));
      worker.terminate();
    };

    worker.postMessage({ m3uText });
  });
}

async function parsePlaylistText(m3uText: string): Promise<WorkerParseResult> {
  if (Capacitor.isNativePlatform()) {
    return parsePlaylistOnMainThread(m3uText);
  }

  try {
    return await parsePlaylistWithWorker(m3uText);
  } catch (error) {
    console.warn('[Playlist] Worker indisponivel. Recuando para parsing local.', error);
    return parsePlaylistOnMainThread(m3uText);
  }
}

export const usePlaylist = () => {
  const [loading, setLoading] = useState(false);
  const [playlistStatus, setPlaylistStatus] = useState<PlaylistStatus>('idle');
  const [playlistError, setPlaylistError] = useState<PlaylistError | null>(null);
  const [playlistSource, setPlaylistSource] = useState<string>('');
  const setAllCategories = useStore((state) => state.setAllCategories);
  const setIsUsingMock = useStore((state) => state.setIsUsingMock);
  const setAdultAccessSettings = useStore((state) => state.setAdultAccessSettings);
  const setEpgData = useStore((state) => state.setEpgData);

  const fetchPlaylistText = useCallback(
    async (playlistUrl: string, authToken: string) => {
      if (!isPlaylistProxyEnabled()) {
        console.log(
          `[Playlist] BYOC direto no dispositivo para ${describePlaylistSource(playlistUrl)}...`,
        );
        return fetchRemoteText(playlistUrl, {
          timeoutMs: 60000,
        });
      }

      const response = await apiFetch(`/api/proxy-playlist?url=${encodeURIComponent(playlistUrl)}`, {
        headers: {
          'x-auth-token': authToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao baixar lista: HTTP ${response.status}`);
      }

      return response.text();
    },
    [],
  );

  const hydrateEpgData = useCallback(
    async (epgUrl: string | null, authToken: string) => {
      if (!epgUrl) {
        setEpgData(null);
        return;
      }

      try {
        let xmlText = '';

        if (!isEpgProxyEnabled()) {
          console.log(`[EPG] BYOC direto no dispositivo para ${describePlaylistSource(epgUrl)}...`);
          xmlText = await fetchRemoteText(epgUrl, {
            timeoutMs: 60000,
          });
        } else {
          const response = await apiFetch(`/api/proxy-playlist?url=${encodeURIComponent(epgUrl)}`, {
            headers: {
              'x-auth-token': authToken,
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          xmlText = await response.text();
        }

        setEpgData(parseXMLTV(xmlText));
      } catch (error) {
        console.warn('[EPG] Falha ao carregar a grade:', error);
        setEpgData(null);
      }
    },
    [setEpgData],
  );

  const fetchPlaylist = useCallback(async () => {
    if (activePlaylistLoadPromise) {
      return activePlaylistLoadPromise;
    }

    const run = async () => {
      const hasData = useStore.getState().allCategories.length > 0;

      if (!hasData) setLoading(true);
      setPlaylistError(null);

      const authToken = localStorage.getItem('xandeflix_auth_token') || '';
      const authRole = localStorage.getItem('xandeflix_auth_role') || '';
      let playlistUrl = '';
      let cacheScope = '';
      let hasValidatedUser = false;

      if (authRole === 'admin') {
        setEpgData(null);
        setLoading(false);
        setPlaylistStatus('idle');
        return;
      }

      try {
        if (!authToken) {
          throw new Error('Sessao ausente ou expirada.');
        }

        setPlaylistStatus('loading_user_info');
        const meResponse = await apiFetch('/api/auth/me', {
          headers: { 'x-auth-token': authToken },
        });

        if (!meResponse.ok) {
          throw new Error(`Servidor respondeu com status ${meResponse.status}`);
        }

        const userData = await meResponse.json();
        hasValidatedUser = true;
        setAdultAccessSettings(userData.adultAccess);

        if (!userData.playlistUrl) {
          throw new Error('Nenhuma URL de playlist configurada.');
        }

        playlistUrl = userData.playlistUrl;
        cacheScope = buildPlaylistCacheScope(userData.id || 'anonymous', playlistUrl);
        setEpgData(null);

        const cached = await getPlaylistCache(cacheScope);
        const CACHE_EXPIRATION_MS = 12 * 60 * 60 * 1000;
        const hasFreshCache =
          Boolean(cached) &&
          Date.now() - cached!.timestamp < CACHE_EXPIRATION_MS &&
          cached!.schemaVersion === PLAYLIST_CACHE_SCHEMA_VERSION;

        if (hasFreshCache && cached) {
          console.log(
            `[Playlist] Cache (IndexedDB) valido encontrado: ${cached.data.length} categorias de ${new Date(cached.timestamp).toLocaleTimeString()}.`,
          );
          setAllCategories(cached.data);
          setIsUsingMock(false);
          setPlaylistStatus('success');
          setPlaylistSource(describePlaylistSource(playlistUrl));
          void hydrateEpgData(cached.epgUrl || null, authToken);
          setLoading(false);
          return;
        }

        setPlaylistStatus('loading_playlist');
        setPlaylistSource(describePlaylistSource(playlistUrl));

        let parsedPlaylist: WorkerParseResult;

        if (shouldUseServerPlaylistBootstrap()) {
          console.log('[Playlist] Usando bootstrap processado no servidor local para reduzir memoria no Android...');
          const bootstrapData = await apiGetJson<PlaylistBootstrapResponse>('/api/playlist/bootstrap', {
            headers: { 'x-auth-token': authToken },
          });
          parsedPlaylist = {
            categories: inflateBootstrapCategories(bootstrapData.categories || []),
            epgUrl: bootstrapData.epgUrl || null,
          };

          if (bootstrapData.playlistUrl) {
            playlistUrl = bootstrapData.playlistUrl;
            setPlaylistSource(describePlaylistSource(playlistUrl));
          }
        } else {
          let m3uRawText = await fetchPlaylistText(playlistUrl, authToken);

          console.log(
            Capacitor.isNativePlatform()
              ? '[Playlist] Conteudo baixado. Iniciando parsing local otimizado para Android...'
              : '[Playlist] Conteudo baixado. Iniciando parsing da playlist...',
          );

          parsedPlaylist = await parsePlaylistText(m3uRawText);
          m3uRawText = '';
        }

        if (parsedPlaylist.categories.length > 0) {
          await savePlaylistCache(parsedPlaylist.categories, cacheScope, parsedPlaylist.epgUrl);

          setAllCategories(parsedPlaylist.categories);
          setIsUsingMock(false);
          setPlaylistStatus('success');
          void hydrateEpgData(parsedPlaylist.epgUrl, authToken);
          console.log(
            `[Playlist] Processado com sucesso: ${parsedPlaylist.categories.length} categorias (cache atualizado).`,
          );
        } else if (!hasData) {
          console.warn('[Playlist] Resposta vazia ou invalida. Usando dados MOCK.');
          setAllCategories(MOCK_CATEGORIES);
          setIsUsingMock(true);
          setEpgData(null);
          setPlaylistStatus('mock_fallback');
          setPlaylistError({
            status: 'mock_fallback',
            message: 'A lista de canais retornou vazia.',
            details: 'O servidor processou a requisicao, mas a lista M3U nao contem conteudo valido.',
            playlistUrl,
          });
        }
      } catch (error: any) {
        console.error('[Playlist] Erro ao buscar playlist:', error);

        const errorMessage =
          error.name === 'AbortError'
            ? 'A requisicao excedeu o tempo limite (60s).'
            : error.message || 'Erro desconhecido';
        const errorStatus: PlaylistStatus = hasValidatedUser ? 'error_playlist' : 'error_auth';

        setPlaylistError({
          status: errorStatus,
          message: hasValidatedUser
            ? 'Falha ao carregar a lista IPTV.'
            : 'Nao foi possivel verificar sua conta.',
          details: errorMessage,
          playlistUrl,
        });

        if (!hasData && hasValidatedUser) {
          setAllCategories(MOCK_CATEGORIES);
          setIsUsingMock(true);
          setEpgData(null);
          setPlaylistStatus('mock_fallback');
        } else {
          setPlaylistStatus(errorStatus);
        }
      } finally {
        setLoading(false);
      }
    };

    activePlaylistLoadPromise = run().finally(() => {
      activePlaylistLoadPromise = null;
    });

    return activePlaylistLoadPromise;
  }, [fetchPlaylistText, hydrateEpgData, setAdultAccessSettings, setAllCategories, setEpgData, setIsUsingMock]);

  return { fetchPlaylist, loading, playlistStatus, playlistError, playlistSource };
};
