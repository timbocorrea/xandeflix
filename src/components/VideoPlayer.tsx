import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { ExternalLink, LoaderCircle, X } from 'lucide-react';
import type { Category, Media } from '../types';
import { useStore } from '../store/useStore';
import {
  NativeVideoPlayer,
  type NativeVideoPlayerEvent,
  type NativeVideoPlayerExitEvent,
  type NativeVideoPlayerResult,
} from '../lib/nativeVideoPlayer';
import { sendPlayerTelemetryReport, type PlayerTelemetryExitReason } from '../lib/playerTelemetry';

interface VideoPlayerProps {
  url: string;
  mediaType: string;
  media?: Media | null;
  onClose: () => void;
  nextEpisode?: Media | null;
  onPlayNextEpisode?: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  isPreview?: boolean;
  isBrowseMode?: boolean;
  showChannelSidebar?: boolean;
  channelBrowserCategories?: Category[];
  onPictureInPictureChange?: (isActive: boolean) => void;
}

export interface VideoPlayerHandle {
  enterPictureInPicture: () => Promise<boolean>;
}

type NativePlayerState = 'opening' | 'ready' | 'error';

function extractStreamHost(targetUrl: string): string {
  try {
    return new URL(targetUrl).host.toLowerCase();
  } catch {
    return '';
  }
}

function readResultNumber(result: NativeVideoPlayerResult | null | undefined): number {
  const rawValue = result?.value;
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}

export const VideoPlayer = React.forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  (
    {
      url,
      mediaType,
      media = null,
      onClose,
      isBrowseMode = false,
      onPictureInPictureChange,
    },
    ref,
  ) => {
    const isNativePlatform = Capacitor.isNativePlatform();
    const isLiveStream = (media?.type || mediaType) === 'live';
    const playbackProgress = useStore((state) => state.playbackProgress);
    const watchHistory = useStore((state) => state.watchHistory);
    const savePlaybackProgress = useStore((state) => state.savePlaybackProgress);

    const [playerState, setPlayerState] = useState<NativePlayerState>(
      isNativePlatform ? 'opening' : 'error',
    );
    const [error, setError] = useState<string | null>(
      isNativePlatform ? null : 'O player nativo esta disponivel apenas no app Android/Capacitor.',
    );

    const listenerHandlesRef = useRef<PluginListenerHandle[]>([]);
    const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const openedPlayerRef = useRef(false);
    const handledExitRef = useRef(false);
    const lastKnownTimeRef = useRef(0);
    const durationRef = useRef(0);
    const sessionStartedAtRef = useRef(Date.now());

    const resumePosition = React.useMemo(() => {
      if (isLiveStream) {
        return 0;
      }

      const fromMediaEntry = media?.id ? playbackProgress[media.id]?.currentTime : undefined;
      const fromUrlEntry = playbackProgress[url]?.currentTime;
      return Math.max(0, fromMediaEntry ?? watchHistory[url] ?? fromUrlEntry ?? 0);
    }, [isLiveStream, media?.id, playbackProgress, url, watchHistory]);

    const clearProgressPolling = useCallback(() => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }, []);

    const removeListeners = useCallback(() => {
      const handles = listenerHandlesRef.current.splice(0);
      handles.forEach((handle) => {
        void handle.remove();
      });
    }, []);

    const persistProgress = useCallback(
      (currentTime: number, duration?: number) => {
        if (isLiveStream) {
          return;
        }

        const safeCurrentTime = Math.max(0, Math.floor(currentTime));
        const safeDuration =
          typeof duration === 'number' && duration > 0
            ? Math.floor(duration)
            : Math.max(0, Math.floor(durationRef.current));

        lastKnownTimeRef.current = safeCurrentTime;
        durationRef.current = safeDuration;

        savePlaybackProgress({
          mediaId: media?.id,
          url,
          currentTime: safeCurrentTime,
          duration: safeDuration,
        });
      },
      [isLiveStream, media?.id, savePlaybackProgress, url],
    );

    const syncProgressFromNativePlayer = useCallback(async () => {
      if (!openedPlayerRef.current || isLiveStream) {
        return;
      }

      try {
        const [currentTimeResult, durationResult] = await Promise.all([
          NativeVideoPlayer.getCurrentTime(),
          NativeVideoPlayer.getDuration(),
        ]);

        persistProgress(
          readResultNumber(currentTimeResult),
          readResultNumber(durationResult),
        );
      } catch (syncError) {
        console.warn('[NativePlayer] Falha ao sincronizar o progresso:', syncError);
      }
    }, [isLiveStream, persistProgress]);

    const restoreSystemUi = useCallback(async () => {
      if (!isNativePlatform) {
        return;
      }

      try {
        await ScreenOrientation.unlock();
      } catch (orientationError) {
        console.warn('[NativePlayer] Falha ao liberar orientacao:', orientationError);
      }

      try {
        await StatusBar.show();
      } catch (statusBarError) {
        console.warn('[NativePlayer] Falha ao restaurar a status bar:', statusBarError);
      }

      onPictureInPictureChange?.(false);
    }, [isNativePlatform, onPictureInPictureChange]);

    const prepareSystemUi = useCallback(async () => {
      if (!isNativePlatform) {
        return;
      }

      try {
        await ScreenOrientation.lock({ orientation: 'landscape' });
      } catch (orientationError) {
        console.warn('[NativePlayer] Falha ao travar orientacao:', orientationError);
      }

      try {
        await StatusBar.hide();
      } catch (statusBarError) {
        console.warn('[NativePlayer] Falha ao ocultar a status bar:', statusBarError);
      }

      onPictureInPictureChange?.(false);
    }, [isNativePlatform, onPictureInPictureChange]);

    const flushTelemetry = useCallback(
      (exitReason: PlayerTelemetryExitReason, currentTime = lastKnownTimeRef.current) => {
        const sessionSeconds = Math.max(
          1,
          Math.round((Date.now() - sessionStartedAtRef.current) / 1000),
        );

        sendPlayerTelemetryReport({
          mediaId: media?.id || url,
          mediaTitle: media?.title || 'Midia sem titulo',
          mediaCategory: media?.category || '',
          mediaType: media?.type || mediaType,
          streamHost: extractStreamHost(url),
          strategy: 'native-player',
          sessionSeconds,
          watchSeconds: isLiveStream ? sessionSeconds : Math.max(0, Math.round(currentTime)),
          bufferSeconds: 0,
          bufferEventCount: 0,
          stallRecoveryCount: 0,
          errorRecoveryCount: 0,
          endedRecoveryCount: exitReason === 'unmount' ? 0 : 0,
          manualRetryCount: 0,
          qualityFallbackCount: 0,
          fatalErrorCount: exitReason === 'fatal_error' ? 1 : 0,
          sampled: true,
          exitReason,
        });
      },
      [isLiveStream, media?.category, media?.id, media?.title, media?.type, mediaType, url],
    );

    const handlePlayerEvent = useCallback(
      (event: NativeVideoPlayerEvent) => {
        setPlayerState('ready');

        if (!isLiveStream) {
          persistProgress(event.currentTime);
        }
      },
      [isLiveStream, persistProgress],
    );

    const handlePlayerExit = useCallback(
      async (event: NativeVideoPlayerExitEvent) => {
        if (handledExitRef.current) {
          return;
        }

        handledExitRef.current = true;
        openedPlayerRef.current = false;
        clearProgressPolling();
        removeListeners();

        persistProgress(event.currentTime, durationRef.current);
        flushTelemetry(event.dismiss ? 'close' : 'unmount', event.currentTime);
        await restoreSystemUi();
        onClose();
      },
      [clearProgressPolling, flushTelemetry, onClose, persistProgress, removeListeners, restoreSystemUi],
    );

    const closeNativePlayer = useCallback(async () => {
      if (!openedPlayerRef.current) {
        onClose();
        return;
      }

      try {
        await NativeVideoPlayer.exitPlayer();
      } catch (closeError) {
        console.warn('[NativePlayer] Falha ao fechar o player nativo:', closeError);
        handledExitRef.current = true;
        openedPlayerRef.current = false;
        clearProgressPolling();
        removeListeners();
        await syncProgressFromNativePlayer();
        flushTelemetry('close');
        await restoreSystemUi();
        onClose();
      }
    }, [
      clearProgressPolling,
      flushTelemetry,
      onClose,
      removeListeners,
      restoreSystemUi,
      syncProgressFromNativePlayer,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        enterPictureInPicture: async () => false,
      }),
      [],
    );

    useEffect(() => {
      if (!isNativePlatform) {
        return;
      }

      let cancelled = false;

      const setupNativePlayer = async () => {
        handledExitRef.current = false;
        openedPlayerRef.current = false;
        sessionStartedAtRef.current = Date.now();
        lastKnownTimeRef.current = Math.floor(resumePosition);
        durationRef.current = 0;
        setError(null);
        setPlayerState('opening');

        try {
          listenerHandlesRef.current = [
            await NativeVideoPlayer.addListener('playerReady', handlePlayerEvent),
            await NativeVideoPlayer.addListener('playerPlay', handlePlayerEvent),
            await NativeVideoPlayer.addListener('playerPause', handlePlayerEvent),
            await NativeVideoPlayer.addListener('playerEnded', handlePlayerEvent),
            await NativeVideoPlayer.addListener('playerExit', (event) => {
              void handlePlayerExit(event);
            }),
          ];

          await prepareSystemUi();

          const result = await NativeVideoPlayer.initPlayer({
            url,
            title: media?.title || 'Xandeflix',
            smallTitle: media?.category || '',
            artwork: media?.thumbnail || media?.backdrop || '',
            chromecast: false,
            displayMode: 'landscape',
            startAtSec: !isLiveStream && resumePosition > 5 ? Math.floor(resumePosition) : 0,
          });

          if (cancelled) {
            return;
          }

          if (!result.result) {
            throw new Error(result.message || 'Falha ao abrir o player nativo.');
          }

          openedPlayerRef.current = true;
          setPlayerState('ready');

          if (!isLiveStream) {
            progressIntervalRef.current = setInterval(() => {
              void syncProgressFromNativePlayer();
            }, 5000);
          }
        } catch (playerError) {
          if (cancelled) {
            return;
          }

          console.error('[NativePlayer] Falha ao iniciar o player nativo:', playerError);
          removeListeners();
          clearProgressPolling();
          await restoreSystemUi();
          setPlayerState('error');
          setError(normalizeErrorMessage(playerError, 'Falha ao abrir o player nativo.'));
          flushTelemetry('fatal_error');
        }
      };

      void setupNativePlayer();

      return () => {
        cancelled = true;
        clearProgressPolling();
        removeListeners();

        if (!openedPlayerRef.current || handledExitRef.current) {
          return;
        }

        handledExitRef.current = true;
        openedPlayerRef.current = false;

        void syncProgressFromNativePlayer()
          .catch(() => {})
          .finally(() => {
            flushTelemetry('unmount');
            void restoreSystemUi();
            void NativeVideoPlayer.exitPlayer().catch(() => {});
          });
      };
    }, [
      clearProgressPolling,
      flushTelemetry,
      handlePlayerEvent,
      handlePlayerExit,
      isLiveStream,
      isNativePlatform,
      media?.backdrop,
      media?.category,
      media?.thumbnail,
      media?.title,
      prepareSystemUi,
      removeListeners,
      restoreSystemUi,
      resumePosition,
      syncProgressFromNativePlayer,
      url,
    ]);

    if (isNativePlatform) {
      if (error) {
        return (
          <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/90 px-6 text-white">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl">
              <div className="mb-3 text-xs font-black uppercase tracking-[0.3em] text-red-500">
                Player Nativo
              </div>
              <h2 className="text-2xl font-black tracking-tight">
                {media?.title || 'Falha na reproducao'}
              </h2>
              <p className="mt-3 text-sm text-white/70">{error}</p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                  }}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  <X className="mr-2 h-4 w-4" />
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-500"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir URL
                </button>
              </div>
            </div>
          </div>
        );
      }

      if (isBrowseMode) {
        return (
          <div className="flex h-full w-full items-center justify-between gap-4 bg-black px-4 text-white">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-red-500">
                Android Native Player
              </div>
              <div className="mt-1 truncate text-lg font-bold">
                {media?.title || 'Abrindo reproducao...'}
              </div>
              <div className="mt-1 text-sm text-white/55">
                {playerState === 'opening'
                  ? 'Carregando o player nativo sobre o Android.'
                  : 'Reproducao controlada pelo ExoPlayer nativo.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void closeNativePlayer();
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-white transition hover:bg-white/10"
            >
              {playerState === 'opening' ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Fechar
            </button>
          </div>
        );
      }

      return null;
    }

    return (
      <div
        className={
          isBrowseMode
            ? 'flex h-full w-full items-center justify-between gap-4 bg-black px-4 text-white'
            : 'fixed inset-0 z-[1600] flex items-center justify-center bg-black/90 px-6 text-white'
        }
      >
        <div className={isBrowseMode ? 'min-w-0' : 'w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl'}>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-red-500">
            Android Native Player
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight">
            {media?.title || 'Player nativo indisponivel'}
          </div>
          <p className="mt-3 text-sm text-white/70">
            O fluxo de reproducao foi migrado para o player nativo do Android. Para testar o video,
            use o build Capacitor no dispositivo.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
              }}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-white transition hover:bg-white/10"
            >
              <X className="mr-2 h-4 w-4" />
              Fechar
            </button>
            <button
              type="button"
              onClick={() => {
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-500"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir URL
            </button>
          </div>
        </div>
      </div>
    );
  },
);

VideoPlayer.displayName = 'VideoPlayer';
