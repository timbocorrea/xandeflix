import { useCallback, useState } from 'react';
import { useStore } from '../store/useStore';
import { MOCK_CATEGORIES } from '../mock/data';

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

export const usePlaylist = () => {
  const [loading, setLoading] = useState(false);
  const [playlistStatus, setPlaylistStatus] = useState<PlaylistStatus>('idle');
  const [playlistError, setPlaylistError] = useState<PlaylistError | null>(null);
  const [playlistSource, setPlaylistSource] = useState<string>('');
  const { setAllCategories, setIsUsingMock, setAdultAccessSettings } = useStore();

  const fetchPlaylist = useCallback(async () => {
    const hasData = useStore.getState().allCategories.length > 0;
    
    // Only show global loader if we don't have any data yet
    if (!hasData) setLoading(true);
    setPlaylistError(null);
    
    const authToken = localStorage.getItem('xandeflix_auth_token') || '';
    const authRole = localStorage.getItem('xandeflix_auth_role') || '';
    let playlistUrl = localStorage.getItem('xandeflix_playlist_url') || '';

    if (authRole === 'admin') {
      setLoading(false);
      setPlaylistStatus('idle');
      return;
    }

    try {
      // 1. Refresh user info to get the latest playlist URL
      if (authToken) {
        setPlaylistStatus('loading_user_info');
        const meResponse = await fetch('/api/auth/me', {
          headers: { 'x-auth-token': authToken }
        });
        if (meResponse.ok) {
          const userData = await meResponse.json();
          setAdultAccessSettings(userData.adultAccess);
          if (userData.playlistUrl) {
            playlistUrl = userData.playlistUrl;
            localStorage.setItem('xandeflix_playlist_url', playlistUrl);
            console.log(`[Playlist] Playlist URL do usuário: ${playlistUrl}`);
          } else {
            console.warn('[Playlist] Usuário autenticado mas sem playlist URL configurada.');
          }
        } else {
          console.error('[Playlist] Falha ao buscar dados do usuário:', meResponse.status);
          setPlaylistError({
            status: 'error_auth',
            message: 'Não foi possível verificar sua conta.',
            details: `Servidor respondeu com status ${meResponse.status}`,
          });
        }
      }

      // 2. Fetch the actual M3U content directly from the provider (Client-side)
      setPlaylistStatus('loading_playlist');
      setPlaylistSource(playlistUrl || 'URL padrão');

      if (!playlistUrl) {
         throw new Error('Nenhuma URL de playlist configurada.');
      }

      const fetchUrl = `/api/proxy-playlist?url=${encodeURIComponent(playlistUrl)}`;
      console.log(`[Playlist] Buscando conteúdo através do proxy: ${fetchUrl}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          'x-auth-token': authToken
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Erro ao baixar lista: HTTP ${response.status}`);
      }
      
      const m3uRawText = await response.text();
      
      // 3. Parse content client-side using a BACKGROUND WORKER (to keep UI thread at 60fps)
      console.log(`[Playlist] Conteúdo baixado. Delegando processamento para o Web Worker...`);
      
      const parsedCategories = await new Promise<any[]>((resolve, reject) => {
        const worker = new Worker(new URL('../workers/m3u.worker.ts', import.meta.url), { type: 'module' });
        
        worker.onmessage = (e) => {
          if (e.data.success) {
            resolve(e.data.data);
          } else {
            console.error(`[Playlist] Falha no processamento pelo worker:`, e.data.error);
            reject(new Error(e.data.error || 'Erro no worker de parsing'));
          }
          worker.terminate();
        };

        worker.onerror = (err) => {
          console.error(`[Playlist] Erro crítico no worker:`, err);
          reject(new Error('Falha catastrófica no worker de processamento'));
          worker.terminate();
        };

        worker.postMessage({ m3uText: m3uRawText });
      });
      
      if (parsedCategories.length > 0) {
        setAllCategories(parsedCategories);
        setIsUsingMock(false);
        setPlaylistStatus('success');
        console.log(`[Playlist] ✅ Processado em Background: ${parsedCategories.length} categorias.`);
      } else if (!hasData) {
        console.warn('[Playlist] Resposta vazia ou inválida. Usando dados MOCK.');
        setAllCategories(MOCK_CATEGORIES);
        setIsUsingMock(true);
        setPlaylistStatus('mock_fallback');
        setPlaylistError({
          status: 'mock_fallback',
          message: 'A lista de canais retornou vazia.',
          details: 'O servidor processou a requisição, mas a lista M3U não contém conteúdo válido.',
          playlistUrl,
        });
      }
    } catch (error: any) {
      console.error('[Playlist] Erro ao buscar playlist:', error);
      
      const errorMessage = error.name === 'AbortError'
        ? 'A requisição excedeu o tempo limite (60s).'
        : (error.message || 'Erro desconhecido');

      setPlaylistError({
        status: 'error_playlist',
        message: `Falha ao carregar a lista IPTV.`,
        details: errorMessage,
        playlistUrl,
      });

      if (!hasData) {
        setAllCategories(MOCK_CATEGORIES);
        setIsUsingMock(true);
        setPlaylistStatus('mock_fallback');
      }
    } finally {
      setLoading(false);
    }
  }, [setAdultAccessSettings, setAllCategories, setIsUsingMock]);

  return { fetchPlaylist, loading, playlistStatus, playlistError, playlistSource };
};
