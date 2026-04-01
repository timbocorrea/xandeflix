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

      // 2. Fetch the actual M3U content
      setPlaylistStatus('loading_playlist');
      setPlaylistSource(playlistUrl || 'URL padrão do sistema');

      const fetchUrl = authToken
        ? '/api/playlist'
        : (playlistUrl ? `/api/playlist?url=${encodeURIComponent(playlistUrl)}` : '/api/playlist');

      console.log(`[Playlist] Buscando playlist em: ${fetchUrl}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: authToken ? { 'x-auth-token': authToken } : undefined,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMsg = errorBody.error || errorBody.message || `HTTP ${response.status}`;
        console.error(`[Playlist] Erro ao carregar playlist: ${errorMsg}`, errorBody);
        
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        setAllCategories(data);
        setIsUsingMock(false);
        setPlaylistStatus('success');
        setPlaylistSource(playlistUrl || 'URL do servidor');
        console.log(`[Playlist] ✅ Carregado com sucesso: ${data.length} categorias de "${playlistUrl || 'URL padrão'}"`);
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
