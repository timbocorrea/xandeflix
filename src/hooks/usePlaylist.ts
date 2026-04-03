import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Category } from '../types';
import { useStore } from '../store/useStore';
import {
  PLAYLIST_CACHE_SCHEMA_VERSION,
  buildPlaylistCacheScope,
  getPlaylistCache,
  savePlaylistCache,
} from '../lib/localCache';
import { parseXMLTV } from '../lib/epgParser';
import { upsertPlaylistCatalogSnapshot } from '../lib/playlistCatalogSnapshot';
import { fetchRemoteText } from '../lib/api';
import { getSessionSnapshot } from '../lib/auth';
import { M3UParser } from '../lib/m3uParser';

export type PlaylistStatus =
  | 'idle'
  | 'loading_user_info'
  | 'loading_playlist'
  | 'success'
  | 'error_auth'
  | 'error_no_content'
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

const WORKER_PARSE_TIMEOUT_MS = 90000;
const MAX_PLAYLIST_SYNC_BYTES = 20 * 1024 * 1024;
const PLAYLIST_FETCH_TIMEOUT_MS = 50000;
const PLAYLIST_FETCH_TOTAL_BUDGET_MS = 170000;
const MAX_PLAYLIST_TEXT_CHARS = 8_000_000;
const PLAYLIST_FLOW_WATCHDOG_TIMEOUT_MS = 200000;
const CACHE_IO_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function describePlaylistSource(playlistUrl: string): string {
  try {
    return new URL(playlistUrl).host;
  } catch {
    return 'Lista vinculada';
  }
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

function isProbablyM3U(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith('#EXTM3U') || trimmed.includes('#EXTINF');
}

function buildPlaylistUrlCandidates(playlistUrl: string): string[] {
  try {
    const parsed = new URL(playlistUrl);
    const output = (parsed.searchParams.get('output') || '').toLowerCase();

    const asTs = new URL(parsed.toString());
    asTs.searchParams.set('output', 'ts');

    const asMpegts = new URL(parsed.toString());
    asMpegts.searchParams.set('output', 'mpegts');

    const asHls = new URL(parsed.toString());
    asHls.searchParams.set('output', 'hls');

    if (output === 'mpegts') {
      return Array.from(new Set([playlistUrl, asTs.toString(), asHls.toString()]));
    }

    if (output === 'hls') {
      return Array.from(new Set([playlistUrl, asTs.toString(), asMpegts.toString()]));
    }

    if (output === 'ts') {
      return Array.from(new Set([playlistUrl, asMpegts.toString(), asHls.toString()]));
    }

    return [playlistUrl];
  } catch {
    return [playlistUrl];
  }
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
  try {
    return await parsePlaylistWithWorker(m3uText);
  } catch (error) {
    if (Capacitor.isNativePlatform()) {
      throw new Error(
        'Nao foi possivel processar a playlist neste dispositivo. Tente uma lista menor ou use a sincronizacao de catalogo.',
      );
    }

    console.warn('[Playlist] Worker indisponivel. Recuando para parsing local (web).', error);
    return parsePlaylistOnMainThread(m3uText);
  }
}

export const usePlaylist = () => {
  const [loading, setLoading] = useState(false);
  const [playlistStatus, setPlaylistStatus] = useState<PlaylistStatus>('idle');
  const [playlistError, setPlaylistError] = useState<PlaylistError | null>(null);
  const [playlistSource, setPlaylistSource] = useState<string>('');
  const activePlaylistLoadPromiseRef = useRef<Promise<void> | null>(null);
  const setAllCategories = useStore((state) => state.setAllCategories);
  const setIsUsingMock = useStore((state) => state.setIsUsingMock);
  const setAdultAccessSettings = useStore((state) => state.setAdultAccessSettings);
  const setEpgData = useStore((state) => state.setEpgData);

  useEffect(() => {
    return () => {
      activePlaylistLoadPromiseRef.current = null;
    };
  }, []);

  const setNoContentError = useCallback(
    (message: string, details: string, playlistUrl?: string) => {
      setAllCategories([]);
      setIsUsingMock(false);
      setEpgData(null);
      setPlaylistStatus('error_no_content');
      setPlaylistError({
        status: 'error_no_content',
        message,
        details,
        playlistUrl,
      });
    },
    [setAllCategories, setEpgData, setIsUsingMock],
  );

  const syncCatalogSnapshot = useCallback(
    async (userId: string, playlistUrl: string, epgUrl: string | null, categories: Category[]) => {
      try {
        await upsertPlaylistCatalogSnapshot({
          userId,
          playlistUrl,
          epgUrl,
          categories,
        });
      } catch (error) {
        console.warn('[Playlist] Falha ao sincronizar snapshot do catalogo no Supabase:', error);
      }
    },
    [],
  );

  const fetchPlaylistText = useCallback(
    async (playlistUrl: string) => {
      const candidates = buildPlaylistUrlCandidates(playlistUrl);
      let lastError: unknown = null;
      const startedAt = Date.now();

      for (let index = 0; index < candidates.length; index += 1) {
        const elapsedMs = Date.now() - startedAt;
        const remainingBudgetMs = PLAYLIST_FETCH_TOTAL_BUDGET_MS - elapsedMs;
        if (remainingBudgetMs <= 5000) {
          break;
        }

        const candidateTimeoutMs = Math.min(PLAYLIST_FETCH_TIMEOUT_MS, remainingBudgetMs);
        const candidateUrl = candidates[index];
        const isFallback = index > 0;

        console.log(
          `[Playlist] Download direto no dispositivo para ${describePlaylistSource(candidateUrl)}${isFallback ? ` (fallback ${index + 1}/${candidates.length})` : '...'}...`,
        );

        try {
          const text = await fetchRemoteText(candidateUrl, {
            timeoutMs: candidateTimeoutMs,
            preflightHead: false,
            maxContentLengthBytes: MAX_PLAYLIST_SYNC_BYTES,
            retryWithoutNativeHeaders: true,
          });

          if (isProbablyM3U(text)) {
            return text;
          }

          lastError = new Error(
            'Resposta recebida, mas o conteudo nao parece uma playlist M3U valida.',
          );
        } catch (error) {
          lastError = error;
        }
      }

      if (!lastError) {
        lastError = new Error(
          `Tempo limite excedido para baixar a playlist (${Math.round(
            PLAYLIST_FETCH_TOTAL_BUDGET_MS / 1000,
          )}s).`,
        );
      }

      throw lastError instanceof Error
        ? lastError
        : new Error('Nao foi possivel baixar a playlist vinculada a esta conta.');
    },
    [],
  );

  const hydrateEpgData = useCallback(
    async (epgUrl: string | null) => {
      if (!epgUrl) {
        setEpgData(null);
        return;
      }

      try {
        console.log(`[EPG] Download direto no dispositivo para ${describePlaylistSource(epgUrl)}...`);
        const xmlText = await fetchRemoteText(epgUrl, {
          timeoutMs: 60000,
        });

        setEpgData(parseXMLTV(xmlText));
      } catch (error) {
        console.warn('[EPG] Falha ao carregar a grade:', error);
        setEpgData(null);
      }
    },
    [setEpgData],
  );

  const fetchPlaylist = useCallback(async () => {
    if (activePlaylistLoadPromiseRef.current) {
      return activePlaylistLoadPromiseRef.current;
    }

    const run = async () => {
      const hasData = useStore.getState().allCategories.length > 0;

      if (!hasData) setLoading(true);
      setPlaylistError(null);

      let playlistUrl = '';
      let cacheScope = '';
      let hasValidatedUser = false;

      try {
        const sessionSnapshot = await getSessionSnapshot();
        if (!sessionSnapshot) {
          throw new Error('Sessao ausente ou expirada.');
        }

        if (sessionSnapshot.role === 'admin') {
          setEpgData(null);
          setLoading(false);
          setPlaylistStatus('idle');
          return;
        }

        setPlaylistStatus('loading_user_info');
        const userData = sessionSnapshot.data;
        if (!userData) {
          throw new Error('Perfil do usuario nao encontrado no Supabase.');
        }
        hasValidatedUser = true;
        setAdultAccessSettings(userData.adultAccess);

        if (!userData.playlistUrl) {
          setNoContentError(
            'Nao ha conteudo inserido para este usuario.',
            'Este usuario ainda nao possui uma playlist configurada. Entre em contato com o administrador.',
          );
          return;
        }

        playlistUrl = userData.playlistUrl;
        cacheScope = buildPlaylistCacheScope(userData.id || 'anonymous', playlistUrl);
        setEpgData(null);

        const cached = await withTimeout(
          getPlaylistCache(cacheScope),
          CACHE_IO_TIMEOUT_MS,
          'Tempo limite ao ler cache local da playlist.',
        ).catch((error) => {
          console.warn('[Cache] Leitura local demorou demais; seguindo sem cache.', error);
          return null;
        });
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
          void hydrateEpgData(cached.epgUrl || null);
          void syncCatalogSnapshot(userData.id, playlistUrl, cached.epgUrl || null, cached.data);
          setLoading(false);
          return;
        }

        setPlaylistStatus('loading_playlist');
        setPlaylistSource(describePlaylistSource(playlistUrl));

        let m3uRawText = await fetchPlaylistText(playlistUrl);

        if (m3uRawText.length > MAX_PLAYLIST_TEXT_CHARS) {
          throw new Error(
            `A playlist vinculada a esta conta e grande demais para processamento local (${Math.round(m3uRawText.length / 1024 / 1024)} MB de texto).`,
          );
        }

        console.log(
          Capacitor.isNativePlatform()
            ? '[Playlist] Conteudo baixado. Iniciando parsing em worker para Android...'
            : '[Playlist] Conteudo baixado. Iniciando parsing da playlist...',
        );

        const parsedPlaylist = await parsePlaylistText(m3uRawText);
        m3uRawText = '';

        if (parsedPlaylist.categories.length > 0) {
          void withTimeout(
            savePlaylistCache(parsedPlaylist.categories, cacheScope, parsedPlaylist.epgUrl),
            CACHE_IO_TIMEOUT_MS,
            'Tempo limite ao salvar cache local da playlist.',
          ).catch((error) => {
            console.warn('[Cache] Falha ao persistir cache local em tempo habil.', error);
          });
          void syncCatalogSnapshot(
            userData.id,
            playlistUrl,
            parsedPlaylist.epgUrl,
            parsedPlaylist.categories,
          );

          setAllCategories(parsedPlaylist.categories);
          setIsUsingMock(false);
          setPlaylistStatus('success');
          void hydrateEpgData(parsedPlaylist.epgUrl);
          console.log(
            `[Playlist] Processado com sucesso: ${parsedPlaylist.categories.length} categorias (cache atualizado).`,
          );
        } else {
          console.warn('[Playlist] Resposta vazia ou invalida para o usuario autenticado.');
          setNoContentError(
            'Nao ha conteudo inserido para este usuario.',
            'A playlist vinculada a esta conta esta vazia ou nao contem canais validos.',
            playlistUrl,
          );
          return;
        }
      } catch (error: any) {
        console.error('[Playlist] Erro ao buscar playlist:', error);

        const errorMessage =
          error.name === 'AbortError'
            ? `A requisicao excedeu o tempo limite (${Math.round(PLAYLIST_FETCH_TIMEOUT_MS / 1000)}s).`
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

        if (!hasData) {
          setAllCategories([]);
          setIsUsingMock(false);
          setEpgData(null);
          setPlaylistStatus(errorStatus);
        } else {
          setPlaylistStatus(errorStatus);
        }
      } finally {
        setLoading(false);
      }
    };

    activePlaylistLoadPromiseRef.current = withTimeout(
      run(),
      PLAYLIST_FLOW_WATCHDOG_TIMEOUT_MS,
      `Tempo limite geral ao carregar a playlist (${Math.round(
        PLAYLIST_FLOW_WATCHDOG_TIMEOUT_MS / 1000,
      )}s).`,
    )
      .catch((error) => {
        console.error('[Playlist] Watchdog do fluxo acionado:', error);
        setPlaylistStatus('error_playlist');
        setPlaylistError({
          status: 'error_playlist',
          message: 'Falha ao carregar a lista IPTV.',
          details: error instanceof Error ? error.message : 'Tempo limite geral do fluxo.',
        });
        setAllCategories([]);
        setIsUsingMock(false);
        setEpgData(null);
      })
      .finally(() => {
        setLoading(false);
        activePlaylistLoadPromiseRef.current = null;
      });

    return activePlaylistLoadPromiseRef.current;
  }, [
    fetchPlaylistText,
    hydrateEpgData,
    setAdultAccessSettings,
    setAllCategories,
    setEpgData,
    setIsUsingMock,
    setNoContentError,
    syncCatalogSnapshot,
  ]);

  return { fetchPlaylist, loading, playlistStatus, playlistError, playlistSource };
};
