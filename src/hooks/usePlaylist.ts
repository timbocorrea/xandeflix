import { useCallback, useState } from 'react';
import { Category } from '../types';
import { useStore } from '../store/useStore';
import { MOCK_CATEGORIES } from '../mock/data';
import {
  PLAYLIST_CACHE_SCHEMA_VERSION,
  buildPlaylistCacheScope,
  getPlaylistCache,
  savePlaylistCache,
} from '../lib/localCache';
import { parseXMLTV } from '../lib/epgParser';
import { apiFetch } from '../lib/api';

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

function describePlaylistSource(playlistUrl: string): string {
  try {
    return new URL(playlistUrl).host;
  } catch {
    return 'Lista vinculada';
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

  const hydrateEpgData = useCallback(
    async (epgUrl: string | null, authToken: string) => {
      if (!epgUrl) {
        setEpgData(null);
        return;
      }

      try {
        const response = await apiFetch(`/api/proxy-playlist?url=${encodeURIComponent(epgUrl)}`, {
          headers: {
            'x-auth-token': authToken,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const xmlText = await response.text();
        setEpgData(parseXMLTV(xmlText));
      } catch (error) {
        console.warn('[EPG] Falha ao carregar a grade:', error);
        setEpgData(null);
      }
    },
    [setEpgData],
  );

  const fetchPlaylist = useCallback(async () => {
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
        headers: { 'x-auth-token': authToken }
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

      const fetchUrl = '/api/proxy-playlist';
      console.log(
        `[Playlist] Buscando conteudo atraves do proxy para ${describePlaylistSource(playlistUrl)}...`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let m3uRawText = '';
      try {
        const response = await apiFetch(fetchUrl, {
          signal: controller.signal,
          headers: {
            'x-auth-token': authToken
          }
        });

        if (!response.ok) {
          throw new Error(`Erro ao baixar lista: HTTP ${response.status}`);
        }

        m3uRawText = await response.text();
      } finally {
        clearTimeout(timeoutId);
      }

      console.log('[Playlist] Conteudo baixado. Delegando processamento para o Web Worker...');

      const parsedPlaylist = await new Promise<WorkerParseResult>((resolve, reject) => {
        const worker = new Worker(new URL('../workers/m3u.worker.ts', import.meta.url), {
          type: 'module'
        });

        worker.onmessage = (e) => {
          if (e.data.success) {
            resolve(e.data.data);
          } else {
            console.error('[Playlist] Falha no processamento pelo worker:', e.data.error);
            reject(new Error(e.data.error || 'Erro no worker de parsing'));
          }
          worker.terminate();
        };

        worker.onerror = (err) => {
          console.error('[Playlist] Erro critico no worker:', err);
          reject(new Error('Falha catastrofica no worker de processamento'));
          worker.terminate();
        };

        worker.postMessage({ m3uText: m3uRawText });
      });

      if (parsedPlaylist.categories.length > 0) {
        await savePlaylistCache(parsedPlaylist.categories, cacheScope, parsedPlaylist.epgUrl);

        setAllCategories(parsedPlaylist.categories);
        setIsUsingMock(false);
        setPlaylistStatus('success');
        void hydrateEpgData(parsedPlaylist.epgUrl, authToken);
        console.log(
          `[Playlist] Processado em background: ${parsedPlaylist.categories.length} categorias (cache atualizado).`,
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
  }, [hydrateEpgData, setAdultAccessSettings, setAllCategories, setEpgData, setIsUsingMock]);

  return { fetchPlaylist, loading, playlistStatus, playlistError, playlistSource };
};
