import localforage from 'localforage';
import { Category } from '../types';

// Configuração do Banco IndexedDB
localforage.config({
  name: 'Xandeflix',
  storeName: 'playlist_cache',
  description: 'Cache persistente das categorias e itens da playlist IPTV'
});

export interface PlaylistCacheData {
  data: Category[];
  timestamp: number;
}

const CACHE_KEY = 'xandeflix_active_playlist';

/**
 * Salva as categorias processadas no cache persistente
 */
export async function savePlaylistCache(data: Category[]): Promise<void> {
  try {
    const cacheObject: PlaylistCacheData = {
      data,
      timestamp: Date.now()
    };
    await localforage.setItem(CACHE_KEY, cacheObject);
    console.log('[Cache] Playlist salva no IndexedDB com sucesso.');
  } catch (err) {
    console.error('[Cache] Falha ao salvar no IndexedDB:', err);
  }
}

/**
 * Recupera os dados do cache, se existirem
 */
export async function getPlaylistCache(): Promise<PlaylistCacheData | null> {
  try {
    return await localforage.getItem<PlaylistCacheData>(CACHE_KEY);
  } catch (err) {
    console.error('[Cache] Falha ao ler do IndexedDB:', err);
    return null;
  }
}

/**
 * Remove o cache atual, forçando uma nova sincronização com o provedor
 */
export async function clearPlaylistCache(): Promise<void> {
  try {
    await localforage.removeItem(CACHE_KEY);
    console.log('[Cache] Cache de playlist limpo.');
  } catch (err) {
    console.error('[Cache] Falha ao limpar IndexedDB:', err);
  }
}
