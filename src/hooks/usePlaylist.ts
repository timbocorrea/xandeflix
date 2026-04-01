import { useCallback, useState } from 'react';
import { useStore } from '../store/useStore';
import { MOCK_CATEGORIES } from '../mock/data';
import { buildPlaylistCacheScope, getPlaylistCache, savePlaylistCache } from '../lib/localCache';

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
      setLoading(false);
      setPlaylistStatus('idle');
      return;
    }

    try {
      if (!authToken) {
        throw new Error('Sessao ausente ou expirada.');
      }

      setPlaylistStatus('loading_user_info');
      const meResponse = await fetch('/api/auth/me', {
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

      const cached = await getPlaylistCache(cacheScope);
      const CACHE_EXPIRATION_MS = 12 * 60 * 60 * 1000;

      if (cached && Date.now() - cached.timestamp < CACHE_EXPIRATION_MS) {
        console.log(
          `[Playlist] Cache (IndexedDB) valido encontrado: ${cached.data.length} categorias de ${new Date(cached.timestamp).toLocaleTimeString()}.`,
        );
        setAllCategories(cached.data);
        setIsUsingMock(false);
        setPlaylistStatus('success');
        setPlaylistSource(describePlaylistSource(playlistUrl));
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
        const response = await fetch(fetchUrl, {
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

      const parsedCategories = await new Promise<any[]>((resolve, reject) => {
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

      if (parsedCategories.length > 0) {
        await savePlaylistCache(parsedCategories, cacheScope);

        setAllCategories(parsedCategories);
        setIsUsingMock(false);
        setPlaylistStatus('success');
        console.log(
          `[Playlist] Processado em background: ${parsedCategories.length} categorias (cache atualizado).`,
        );
      } else if (!hasData) {
        console.warn('[Playlist] Resposta vazia ou invalida. Usando dados MOCK.');
        setAllCategories(MOCK_CATEGORIES);
        setIsUsingMock(true);
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
        setPlaylistStatus('mock_fallback');
      } else {
        setPlaylistStatus(errorStatus);
      }
    } finally {
      setLoading(false);
    }
  }, [setAdultAccessSettings, setAllCategories, setIsUsingMock]);

  return { fetchPlaylist, loading, playlistStatus, playlistError, playlistSource };
};
