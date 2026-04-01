import React, { useEffect, useRef } from 'react';
import mpegts from 'mpegts.js';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { X, Play, ExternalLink, Layout, Maximize2, Minimize2, SkipForward, Rewind, FastForward, Settings, Menu, Search, ChevronRight, ChevronLeft, PictureInPicture2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Media, Category } from '../types';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useStore } from '../store/useStore';

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
}

/**
 * Detects the best playback strategy based on the proxied URL.
 * - 'mpegts': raw MPEG-TS streams (most IPTV channels)
 * - 'hls': HLS playlists (.m3u8)
 * - 'native': MP4 / WebM that browsers handle natively
 */
function detectStrategy(proxyUrl: string): 'mpegts' | 'hls' | 'native' {
  const original = decodeURIComponent(proxyUrl.split('url=')[1] || '').toLowerCase();
  if (original.includes('.m3u8') || original.includes('output=hls')) return 'hls';
  if (original.includes('.mp4')) return 'native';
  // Everything else from IPTV panels (output=mpegts, .ts, etc.) → mpegts.js
  return 'mpegts';
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  url, 
  mediaType, 
  media = null,
  onClose,
  nextEpisode = null,
  onPlayNextEpisode,
  isMinimized = false,
  onToggleMinimize,
  isPreview = false,
  isBrowseMode = false,
  showChannelSidebar = true,
  channelBrowserCategories,
}) => {
  const layout = useResponsiveLayout();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [diagnostic, setDiagnostic] = React.useState<any>(null);
  const [diagnosing, setDiagnosing] = React.useState(false);
  const [activeVideoElement, setActiveVideoElement] = React.useState<HTMLVideoElement | null>(null);
  const [isPictureInPictureSupported, setIsPictureInPictureSupported] = React.useState(false);
  const [isInPictureInPicture, setIsInPictureInPicture] = React.useState(false);
  
  // Internal Source Override (for channel switching)
  const [internalUrl, setInternalUrl] = React.useState(url);
  const [internalMedia, setInternalMedia] = React.useState<Media | null>(media);

  // Sidebar State
  const { allCategories } = useStore();
  const sidebarCategories = React.useMemo(
    () =>
      (channelBrowserCategories && channelBrowserCategories.length > 0
        ? channelBrowserCategories
        : allCategories
      ).filter((category) => category.items.length > 0),
    [channelBrowserCategories, allCategories]
  );
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [channelSearchQuery, setChannelSearchQuery] = React.useState('');
  const [activeSidebarColumn, setActiveSidebarColumn] = React.useState<'categories' | 'items'>('categories');

  const [activeQualityIndex, setActiveQualityIndex] = React.useState(0);
  const qualities = internalMedia?.type === 'live' ? internalMedia.qualities || [] : [];
  const safeQualityIndex = qualities.length > 0 ? Math.min(activeQualityIndex, qualities.length - 1) : 0;
  const currentQuality = qualities[safeQualityIndex] || null;
  const hasQualities = qualities.length > 1;
  const streamUrl = currentQuality?.url || internalUrl;
  const minimizedWidth = layout.isMobile ? 240 : layout.isTablet ? 360 : 480;
  const minimizedHeight = Math.round(minimizedWidth * 9 / 16);
  const minimizedBottom = layout.isMobile ? layout.bottomNavigationHeight + 18 : 30;
  const controlSafeTop = layout.isMobile ? 'max(env(safe-area-inset-top, 0px), 10px)' : 'max(env(safe-area-inset-top, 0px), 16px)';
  const controlSafeRight = `max(env(safe-area-inset-right, 0px), ${layout.isMobile ? 10 : 16}px)`;
  
  const [strategy, setStrategy] = React.useState<'mpegts' | 'hls' | 'native'>(() => detectStrategy(streamUrl));
  const authToken = localStorage.getItem('xandeflix_auth_token') || '';

  // Update internal state when props change (initial load)
  useEffect(() => {
    setInternalUrl(url);
    setInternalMedia(media);
  }, [url, media]);

  const syncPictureInPictureState = React.useCallback((video: HTMLVideoElement | null) => {
    if (typeof document === 'undefined' || !video) {
      setIsPictureInPictureSupported(false);
      setIsInPictureInPicture(false);
      return;
    }

    const pipDocument = document as Document & {
      pictureInPictureEnabled?: boolean;
      pictureInPictureElement?: Element | null;
    };
    const pipVideo = video as HTMLVideoElement & {
      disablePictureInPicture?: boolean;
      webkitSupportsPresentationMode?: (mode: string) => boolean;
      webkitPresentationMode?: string;
    };

    const supportsStandardPiP =
      !!pipDocument.pictureInPictureEnabled &&
      typeof (video as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }).requestPictureInPicture === 'function' &&
      !pipVideo.disablePictureInPicture;
    const supportsWebkitPiP =
      typeof pipVideo.webkitSupportsPresentationMode === 'function' &&
      pipVideo.webkitSupportsPresentationMode('picture-in-picture');

    setIsPictureInPictureSupported(supportsStandardPiP || supportsWebkitPiP);
    setIsInPictureInPicture(
      pipDocument.pictureInPictureElement === video ||
      pipVideo.webkitPresentationMode === 'picture-in-picture'
    );
  }, []);

  const togglePictureInPicture = React.useCallback(async () => {
    if (!activeVideoElement || typeof document === 'undefined') {
      return;
    }

    const pipDocument = document as Document & {
      pictureInPictureEnabled?: boolean;
      pictureInPictureElement?: Element | null;
      exitPictureInPicture?: () => Promise<void>;
    };
    const pipVideo = activeVideoElement as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
      webkitSupportsPresentationMode?: (mode: string) => boolean;
      webkitSetPresentationMode?: (mode: string) => void;
      webkitPresentationMode?: string;
    };

    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
      }

      if (pipDocument.pictureInPictureElement && pipDocument.exitPictureInPicture) {
        await pipDocument.exitPictureInPicture();
        syncPictureInPictureState(activeVideoElement);
        return;
      }

      if (pipVideo.webkitPresentationMode === 'picture-in-picture' && pipVideo.webkitSetPresentationMode) {
        pipVideo.webkitSetPresentationMode('inline');
        syncPictureInPictureState(activeVideoElement);
        return;
      }

      await activeVideoElement.play().catch(() => {});

      if (typeof pipVideo.requestPictureInPicture === 'function' && pipDocument.pictureInPictureEnabled) {
        await pipVideo.requestPictureInPicture();
        syncPictureInPictureState(activeVideoElement);
        return;
      }

      if (
        typeof pipVideo.webkitSupportsPresentationMode === 'function' &&
        pipVideo.webkitSupportsPresentationMode('picture-in-picture') &&
        pipVideo.webkitSetPresentationMode
      ) {
        pipVideo.webkitSetPresentationMode('picture-in-picture');
        syncPictureInPictureState(activeVideoElement);
        return;
      }

      throw new Error('PiP nÃ£o suportado pelo navegador atual.');
    } catch (err) {
      console.error('[Player] Erro ao alternar PiP:', err);
      setError('NÃ£o foi possÃ­vel abrir o PiP neste dispositivo.');
      window.setTimeout(() => setError(null), 3000);
    }
  }, [activeVideoElement, syncPictureInPictureState]);

  useEffect(() => {
    setActiveQualityIndex(0);
    setShowQualityMenu(false);
  }, [internalMedia?.id]);

  // Set initial category when sidebar opens or categories load
  useEffect(() => {
    if (sidebarCategories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(sidebarCategories[0].id);
    }
  }, [sidebarCategories, selectedCategoryId]);

  useEffect(() => {
    if (!showChannelSidebar && isSidebarOpen) {
      setIsSidebarOpen(false);
    }
  }, [showChannelSidebar, isSidebarOpen]);

  useEffect(() => {
    syncPictureInPictureState(activeVideoElement);

    if (!activeVideoElement) {
      return;
    }

    const handlePiPStateChange = () => syncPictureInPictureState(activeVideoElement);

    activeVideoElement.addEventListener('enterpictureinpicture', handlePiPStateChange as EventListener);
    activeVideoElement.addEventListener('leavepictureinpicture', handlePiPStateChange as EventListener);
    activeVideoElement.addEventListener('webkitpresentationmodechanged', handlePiPStateChange as EventListener);

    return () => {
      activeVideoElement.removeEventListener('enterpictureinpicture', handlePiPStateChange as EventListener);
      activeVideoElement.removeEventListener('leavepictureinpicture', handlePiPStateChange as EventListener);
      activeVideoElement.removeEventListener('webkitpresentationmodechanged', handlePiPStateChange as EventListener);
    };
  }, [activeVideoElement, syncPictureInPictureState]);

  // Auto-update strategy if the stream URL changes due to quality switch
  useEffect(() => {
    setStrategy(detectStrategy(streamUrl));
  }, [streamUrl]);

  useEffect(() => {
    if (activeQualityIndex !== safeQualityIndex) {
      setActiveQualityIndex(safeQualityIndex);
    }
  }, [activeQualityIndex, safeQualityIndex]);

  const fallbackNextQuality = React.useCallback(() => {
    const nextQuality = qualities[safeQualityIndex + 1];
    if (hasQualities && nextQuality) {
      console.log(`[Player] Falha na reprodução. Tentando próxima qualidade: ${nextQuality.name}`);
      setActiveQualityIndex(prev => prev + 1);
      setError(`Sinal instável. Alternando qualidade...`);
      setTimeout(() => setError(null), 3000);
      return true;
    }
    return false;
  }, [hasQualities, qualities, safeQualityIndex]);

  const runDiagnostic = async () => {
    setDiagnosing(true);
    try {
      const response = await fetch(`/api/diagnostic?url=${encodeURIComponent(streamUrl)}`, {
        headers: authToken ? { 'x-auth-token': authToken } : undefined,
      });
      const data = await response.json();
      setDiagnostic(data);
    } catch (err) {
      setDiagnostic({ success: false, message: 'Não foi possível conectar ao servidor de diagnóstico.' });
    } finally {
      setDiagnosing(false);
    }
  };

  const [showCountdown, setShowCountdown] = React.useState(false);
  const [countdown, setCountdown] = React.useState(10);
  const [hasCancelled, setHasCancelled] = React.useState(false);
  
  const setPlaybackProgress = useStore((state) => state.setPlaybackProgress);
  const syncProgressToSupabase = useStore((state) => state.syncProgressToSupabase);
  const userId = localStorage.getItem('xandeflix_user_id');
  
  const progressId = media?.currentEpisode?.id || media?.id || encodeURIComponent(streamUrl);
  const initialSeekDone = useRef(false);
  const lastSavedTime = useRef(0);
  const lastSyncedTime = useRef(0);

  const [isIdle, setIsIdle] = React.useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showQualityMenu, setShowQualityMenu] = React.useState(false);

  const resetIdleTimer = React.useCallback(() => {
    setIsIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setIsIdle(true);
      setShowQualityMenu(false); // Hide menu when idle
    }, 5000);
  }, []);

  // Idle user detection for overlay controls
  useEffect(() => {
    resetIdleTimer();
    const handleActivity = () => resetIdleTimer();
    
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [resetIdleTimer]);

  // Poll video time to show Up Next 10 seconds BEFORE video ends
  useEffect(() => {
    const interval = setInterval(() => {
      let currentTime = 0;
      let duration = 0;

      if (strategy === 'hls' && playerRef.current) {
        currentTime = playerRef.current.currentTime() || 0;
        duration = playerRef.current.duration() || 0;
      } else if (videoRef.current) {
        currentTime = videoRef.current.currentTime || 0;
        duration = videoRef.current.duration || 0;
      }

      if (!duration || duration === Infinity) return;

      if (currentTime > 0 && duration > 0) {
        // Auto-resume from previous progress point on first load
      if (currentTime > 0 && duration > 0) {
        // Auto-resume from previous progress point on first load
        if (!initialSeekDone.current) {
          const allProgress = useStore.getState().playbackProgress;
          const savedProgress = allProgress[progressId];
          if (savedProgress && savedProgress.currentTime > 15 && savedProgress.currentTime < duration - 15) {
            if (strategy === 'hls' && playerRef.current && typeof playerRef.current.currentTime === 'function') {
              playerRef.current.currentTime(savedProgress.currentTime);
            } else if (videoRef.current) {
              videoRef.current.currentTime = savedProgress.currentTime;
            }
          }
          initialSeekDone.current = true;
        }

        // Save progress every 5 seconds to localStorage
        if (Math.abs(currentTime - lastSavedTime.current) > 5) {
          lastSavedTime.current = currentTime;
          setPlaybackProgress(progressId, currentTime, duration);
        }

        // Sync with Supabase every 60 seconds
        if (userId && Math.abs(currentTime - lastSyncedTime.current) > 60) {
          lastSyncedTime.current = currentTime;
          syncProgressToSupabase(userId, progressId, currentTime, duration);
        }
      }
      }

      if (!onPlayNextEpisode) return;
      const remaining = duration - currentTime;

      // Show countdown when 10 seconds or less remain
      if (remaining <= 10.5 && remaining > 0) {
        setShowCountdown(true);
        setCountdown(Math.max(1, Math.ceil(remaining)));
      } else {
        setShowCountdown(false);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [strategy, onPlayNextEpisode, userId, progressId, setPlaybackProgress, syncProgressToSupabase]);

  // Sync on Pause & Unmount
  useEffect(() => {
    const handleManualSync = () => {
      let currentTime = 0;
      let duration = 0;

      if (strategy === 'hls' && playerRef.current) {
        currentTime = playerRef.current.currentTime() || 0;
        duration = playerRef.current.duration() || 0;
      } else if (videoRef.current) {
        currentTime = videoRef.current.currentTime || 0;
        duration = videoRef.current.duration || 0;
      }

      if (userId && currentTime > 0 && duration > 0) {
        syncProgressToSupabase(userId, progressId, currentTime, duration);
        lastSyncedTime.current = currentTime;
      }
    };

    const videoElement = videoRef.current;
    
    // We can't easily attach to playerRef.current during first render, 
    // so we handle it inside the existing strategy-specific blocks or use this interval/event pattern
    const interval = setInterval(() => {
       const vjsPlayer = playerRef.current;
       if (strategy === 'hls' && vjsPlayer && typeof vjsPlayer.on === 'function') {
          vjsPlayer.on('pause', handleManualSync);
          clearInterval(interval);
       } else if (videoElement) {
          videoElement.addEventListener('pause', handleManualSync);
          clearInterval(interval);
       }
    }, 1000);

    return () => {
      // Final sync on unmount
      handleManualSync();
      clearInterval(interval);
      
      const vjsPlayer = playerRef.current;
      if (strategy === 'hls' && vjsPlayer && typeof vjsPlayer.off === 'function') {
        vjsPlayer.off('pause', handleManualSync);
      } else if (videoElement) {
        videoElement.removeEventListener('pause', handleManualSync);
      }
    };
  }, [progressId, userId, syncProgressToSupabase, strategy]);

  const skipTime = React.useCallback((amount: number) => {
    let currentTime = 0;
    let duration = 0;
    if (strategy === 'hls' && playerRef.current && typeof playerRef.current.currentTime === 'function') {
      currentTime = playerRef.current.currentTime() || 0;
      duration = playerRef.current.duration() || 0;
      if (duration && duration !== Infinity) {
         playerRef.current.currentTime(Math.min(duration, Math.max(0, currentTime + amount)));
      } else {
         playerRef.current.currentTime(Math.max(0, currentTime + amount));
      }
    } else if (videoRef.current) {
      currentTime = videoRef.current.currentTime || 0;
      duration = videoRef.current.duration || 0;
      if (duration && duration !== Infinity) {
         videoRef.current.currentTime = Math.min(duration, Math.max(0, currentTime + amount));
      } else {
         videoRef.current.currentTime = Math.max(0, currentTime + amount);
      }
    }
  }, [strategy]);

  const triggerNext = () => {
    if (onPlayNextEpisode) onPlayNextEpisode();
  };

  const goToAdjacentChannel = React.useCallback((direction: 1 | -1) => {
    if (!internalMedia || !sidebarCategories.length) return;

    // Find the category containing the current media
    const currentCategory = sidebarCategories.find(cat => 
      cat.items.some(item => item.id === internalMedia.id)
    );

    if (!currentCategory) return;

    const currentIndex = currentCategory.items.findIndex(item => item.id === internalMedia.id);
    if (currentIndex === -1) return;

    // Calculate next index with wrap-around
    let nextIndex = currentIndex + direction;
    if (nextIndex >= currentCategory.items.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = currentCategory.items.length - 1;

    const nextMedia = currentCategory.items[nextIndex];
    if (nextMedia) {
      setInternalUrl(nextMedia.videoUrl);
      setInternalMedia(nextMedia);
      setActiveQualityIndex(0);
      setLoading(true);
      setError(null);
    }
  }, [internalMedia, sidebarCategories]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      destroyPlayer();
    };
  }, []);

  function destroyPlayer() {
    setActiveVideoElement(null);
    setIsInPictureInPicture(false);
    setIsPictureInPictureSupported(false);
    if (playerRef.current) {
      try {
        if (playerRef.current.destroy) playerRef.current.destroy(); // mpegts
        else if (playerRef.current.dispose) playerRef.current.dispose(); // videojs
      } catch (e) { /* ignore */ }
      playerRef.current = null;
    }
  }

  // ── Main player initialization ──
  useEffect(() => {
    destroyPlayer();
    setLoading(true);
    setError(null);
    setShowCountdown(false);

    const video = videoRef.current;
    if (!video) return;

    console.log(`[Player] Strategy: ${strategy} for ${streamUrl.substring(0, 80)}...`);

    if (strategy === 'mpegts') {
      initMpegTs(video);
    } else if (strategy === 'hls') {
      initHls(video);
    } else {
      initNative(video);
    }
  }, [streamUrl, strategy, skipTime]);

  // ── Keyboard handler ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        if (isSidebarOpen) setIsSidebarOpen(false);
        else onClose();
      }
      else if (e.key === 'Backspace') onClose();
      else if (e.key === 'ArrowRight' && !isSidebarOpen) {
        if (internalMedia?.type === 'live') goToAdjacentChannel(1);
        else skipTime(10);
      }
      else if (e.key === 'ArrowLeft' && !isSidebarOpen) {
        if (internalMedia?.type === 'live') goToAdjacentChannel(-1);
        else skipTime(-10);
      }
      else if (showChannelSidebar && (e.key === 'm' || e.key === 'M')) setIsSidebarOpen(!isSidebarOpen);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen, skipTime, onClose, showChannelSidebar, internalMedia, goToAdjacentChannel]);

  // ── mpegts.js for raw MPEG-TS streams ──
  function initMpegTs(video: HTMLVideoElement) {
    if (!mpegts.isSupported()) {
      console.warn('[Player] mpegts.js not supported, falling back to HLS');
      setStrategy('hls');
      return;
    }

    // Web Workers can't resolve relative URLs, so we need absolute
    const absoluteUrl = streamUrl.startsWith('http') ? streamUrl : `${window.location.origin}${streamUrl}`;

    const player = mpegts.createPlayer({
      type: 'mpegts',
      isLive: mediaType === 'live',
      url: absoluteUrl,
    }, {
      enableWorker: true,
      enableStashBuffer: true,
      stashInitialSize: 1024 * 1024 * 3, // 3MB initial buffer to prevent freezing
      liveBufferLatencyChasing: false, // Don't chase latency to allow buffer accumulation
      liveBufferLatencyMaxLatency: 30, // Extremely forgiving latency (30s)
      liveBufferLatencyMinRemain: 5, // Minimum 5s stay in buffer
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 60,
      autoCleanupMinBackwardDuration: 30,
    });

    player.attachMediaElement(video);
    player.load();
    video.controls = !isPreview;
    setActiveVideoElement(video);
    const playResult = player.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => { /* autoplay blocked, user will click */ });
    }

    player.on(mpegts.Events.ERROR, (errorType: any, errorDetail: any, errorInfo: any) => {
      console.error('[mpegts] Error:', errorType, errorDetail, errorInfo);
      if (fallbackNextQuality()) return;
      // Try HLS as fallback
      if (strategy === 'mpegts') {
        console.log('[Player] mpegts failed, trying HLS fallback...');
        destroyPlayer();
        setStrategy('hls');
      }
    });

    player.on(mpegts.Events.LOADING_COMPLETE, () => {
      console.log('[mpegts] Loading complete');
    });

    video.addEventListener('playing', () => setLoading(false));
    video.addEventListener('waiting', () => setLoading(true));
    video.addEventListener('canplay', () => setLoading(false));
    video.addEventListener('ended', triggerNext);
    video.addEventListener('error', () => {
      console.error('[mpegts] Video element error');
      if (fallbackNextQuality()) return;
      if (strategy === 'mpegts') {
        destroyPlayer();
        setStrategy('hls');
      }
    });

    playerRef.current = player;
  }

  // ── Video.js for HLS (.m3u8) streams ──
  function initHls(video: HTMLVideoElement) {
    // Video.js needs a fresh element inside a container
    if (containerRef.current) {
      // Clear existing content and hide the shared <video>
      video.style.display = 'none';
      const vjsVideo = document.createElement('video');
      vjsVideo.className = 'video-js vjs-big-play-centered vjs-theme-city';
      vjsVideo.setAttribute('crossorigin', 'anonymous');
      containerRef.current.appendChild(vjsVideo);
      setActiveVideoElement(vjsVideo);

      const player = videojs(vjsVideo, {
        autoplay: true,
        controls: !isPreview,
        responsive: true,
        fluid: true,
        preload: 'auto',
        html5: {
          vhs: {
            overrideNative: true,
            enableLowInitialPlaylist: false, // Favor higher quality list if available
            fastStart: false, // Don't start too fast, build buffer first
            goalBufferLength: 15, // Force 15+ seconds of buffer ahead
            maxGoalBufferLength: 30, // Don't allow it to buffer more than 30s to save memory
          },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false,
        },
        sources: [{ src: streamUrl, type: 'application/x-mpegURL' }],
      }, () => {
        setLoading(false);
      });

      player.on('error', () => {
        if (fallbackNextQuality()) return;
      });

      player.on('waiting', () => setLoading(true));
      player.on('playing', () => setLoading(false));
      player.on('ended', triggerNext);
      player.on('error', () => {
        if (fallbackNextQuality()) return;
        const err = player.error();
        console.error('[VideoJS] Error:', err?.message);
        // Try native as last resort
        if (strategy === 'hls') {
          player.dispose();
          playerRef.current = null;
          if (containerRef.current) containerRef.current.innerHTML = '';
          video.style.display = '';
          setStrategy('native');
        }
      });

      playerRef.current = player;
    }
  }

  // ── Native <video> for MP4/WebM or last-resort ──
  function initNative(video: HTMLVideoElement) {
    video.style.display = '';
    video.src = streamUrl;
    video.autoplay = true;
    video.controls = !isPreview;
    setActiveVideoElement(video);

    const onPlaying = () => setLoading(false);
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onEnded = triggerNext;
    const onError = () => {
      console.error('[Native] Video element error');
      if (fallbackNextQuality()) return;
      setError('O vídeo não pôde ser carregado. O servidor ou formato é incompatível.');
      setLoading(false);
      runDiagnostic();
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    video.load();
    video.play().catch(() => { /* autoplay blocked */ });

    // Store cleanup reference
    playerRef.current = {
      destroy: () => {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('error', onError);
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }

  return (
    <motion.div
      key={url}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        width: isPreview || isBrowseMode ? '100%' : (isMinimized ? minimizedWidth : layout.width),
        height: isPreview || isBrowseMode ? '100%' : (isMinimized ? minimizedHeight : layout.height),
        borderRadius: isMinimized ? 20 : 0,
      }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={isPreview || isBrowseMode ? {} : {
        top: isMinimized ? 'auto' : 0,
        left: isMinimized ? 'auto' : 0,
        right: isMinimized ? `max(env(safe-area-inset-right, 0px), ${layout.isMobile ? 12 : 24}px)` : 0,
        bottom: isMinimized ? minimizedBottom : 0,
        aspectRatio: isMinimized ? '16 / 9' : 'auto',
      }}
      className={`${isPreview ? 'absolute inset-0' : isBrowseMode ? 'relative w-full h-full' : 'fixed z-[100]'} bg-black flex items-center justify-center overflow-hidden shadow-2xl ${
        isMinimized ? 'border-2 border-white/20' : ''
      } ${
        isIdle && !isPreview && !isBrowseMode ? 'cursor-none' : ''
      }`}
    >
      {!isPreview && (
        <div 
          className={`absolute z-[110] flex flex-wrap justify-end gap-3 transition-opacity duration-500 delay-100 ${
            isIdle && (!isMinimized && !isBrowseMode) ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        style={{
          top: controlSafeTop,
          right: controlSafeRight,
          left: layout.isMobile && !isMinimized ? 'max(env(safe-area-inset-left, 0px), 10px)' : 'auto',
        }}
      >
        {nextEpisode && onPlayNextEpisode && !isMinimized && (
          <button
            onClick={onPlayNextEpisode}
            className="px-4 py-3 backdrop-blur-xl bg-black/50 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 flex items-center gap-3 shadow-lg"
            title={`Próximo episódio: ${nextEpisode.currentEpisode?.title || nextEpisode.title}`}
          >
            <SkipForward className="text-white w-5 h-5" />
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/55">Próximo</div>
              <div className="text-sm text-white font-semibold max-w-48 truncate">
                {nextEpisode.currentEpisode?.title || nextEpisode.title}
              </div>
            </div>
          </button>
        )}
        
        {!isMinimized && (
          <>
            {isPictureInPictureSupported && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePictureInPicture();
                }}
                className={`p-3 backdrop-blur-xl border border-white/10 rounded-2xl transition-all duration-300 group shadow-lg ${
                  isInPictureInPicture ? 'bg-white/20 text-white' : 'bg-black/40 text-white hover:bg-white/10'
                }`}
                title={isInPictureInPicture ? 'Fechar PiP' : 'Abrir em PiP'}
              >
                <PictureInPicture2 className="w-6 h-6" />
              </button>
            )}
            {hasQualities && (
              <div className="relative">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQualityMenu(!showQualityMenu);
                  }}
                  className={`flex items-center gap-2 px-4 py-3 font-bold text-sm backdrop-blur-xl border border-white/10 rounded-2xl transition-all duration-300 shadow-lg ${
                    showQualityMenu ? 'bg-white/20 text-white' : 'bg-black/40 text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Alterar Qualidade de Vídeo"
                >
                  <Settings className={`w-5 h-5 transition-transform duration-300 ${showQualityMenu ? 'rotate-90' : ''}`} />
                  <span>{currentQuality?.name || 'AUTO'}</span>
                </button>

                <AnimatePresence>
                  {showQualityMenu && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-[110%] w-36 bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-[120] py-2"
                    >
                      {qualities.map((q, idx) => (
                        <button 
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveQualityIndex(idx);
                            setShowQualityMenu(false);
                          }}
                          className={`block w-full text-left px-5 py-3 text-sm transition-colors ${
                            idx === activeQualityIndex 
                              ? 'bg-[#E50914]/20 text-[#E50914] font-bold border-l-2 border-[#E50914]' 
                              : 'text-gray-300 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                          }`}
                        >
                          {q.name}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            <button 
              onClick={() => {
                if (internalMedia?.type === 'live') goToAdjacentChannel(-1);
                else skipTime(-10);
              }}
              className="p-3 backdrop-blur-xl bg-black/40 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 group shadow-lg"
              title={internalMedia?.type === 'live' ? "Canal Anterior" : "Voltar 10 segundos"}
            >
              {internalMedia?.type === 'live' ? (
                <ChevronLeft className="text-white w-6 h-6 group-hover:-translate-x-1 transition-transform" />
              ) : (
                <Rewind className="text-white w-6 h-6 group-hover:-translate-x-1 transition-transform" />
              )}
            </button>
            <button 
              onClick={() => {
                if (internalMedia?.type === 'live') goToAdjacentChannel(1);
                else skipTime(10);
              }}
              className="p-3 backdrop-blur-xl bg-black/40 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 group shadow-lg"
              title={internalMedia?.type === 'live' ? "Próximo Canal" : "Avançar 10 segundos"}
            >
              {internalMedia?.type === 'live' ? (
                <ChevronRight className="text-white w-6 h-6 group-hover:translate-x-1 transition-transform" />
              ) : (
                <FastForward className="text-white w-6 h-6 group-hover:translate-x-1 transition-transform" />
              )}
            </button>
          </>
        )}

        {onToggleMinimize && (
          <button 
            onClick={onToggleMinimize}
            className="p-3 backdrop-blur-xl bg-black/40 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 group shadow-lg"
            title={isMinimized ? "Maximizar" : "Navegar (Minimizar)"}
          >
            {isMinimized ? (
              <Maximize2 className="text-white w-6 h-6 group-hover:scale-110 transition-transform" />
            ) : (
              <Layout className="text-white w-6 h-6 group-hover:scale-110 transition-transform" />
            )}
          </button>
        )}

        {showChannelSidebar && (
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-3 backdrop-blur-xl border border-white/10 rounded-2xl transition-all duration-300 group shadow-lg ${
              isSidebarOpen ? 'bg-red-600 text-white' : 'bg-black/40 text-white hover:bg-white/10'
            }`}
            title="Lista de Canais"
          >
            <Menu className={`w-6 h-6 transition-transform duration-300 ${isSidebarOpen ? 'rotate-90' : ''}`} />
          </button>
        )}
        <button 
          onClick={onClose}
          className="p-3 backdrop-blur-xl bg-black/40 hover:bg-red-500/20 border border-white/10 rounded-2xl transition-all duration-300 group shadow-lg"
          title="Fechar"
        >
          <X className="text-white w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>
      )}

      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[105] bg-black/50">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white font-medium">Carregando conteúdo...</p>
          <p className="text-gray-500 text-sm mt-2">Modo: {strategy.toUpperCase()}</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[106] bg-black px-6 text-center">
          <div className="bg-red-600/20 p-6 rounded-full mb-6">
            <X className="text-red-600 w-12 h-12" />
          </div>
          <h3 className="text-white text-2xl font-bold mb-2">Ops! Algo deu errado</h3>
          <p className="text-gray-400 max-w-md mb-8">{error}</p>
          
          {diagnostic && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-8 text-left max-w-lg w-full font-mono text-xs overflow-auto max-h-48">
              <p className={diagnostic.success ? 'text-green-400' : 'text-red-400'}>
                Status: {diagnostic.status} {diagnostic.statusText}
              </p>
              <p className="text-gray-300 mt-1">Mensagem: {diagnostic.message}</p>
              {diagnostic.error && <p className="text-red-400 mt-1">Erro: {diagnostic.error}</p>}
              <p className="text-gray-500 mt-2">Duração: {diagnostic.duration}</p>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-4">
            <button 
              onClick={() => {
                setError(null);
                setLoading(true);
                setDiagnostic(null);
                setStrategy(detectStrategy(streamUrl));
              }}
              className="px-6 py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors"
            >
              Tentar Novamente
            </button>
            <button 
              onClick={runDiagnostic}
              disabled={diagnosing}
              className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {diagnosing ? 'Diagnosticando...' : 'Diagnosticar Problema'}
            </button>
            <button 
              onClick={() => {
                const originalUrl = decodeURIComponent(url.split('url=')[1] || url);
                window.open(originalUrl, '_blank');
              }}
              className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-5 h-5" />
              Link Direto
            </button>
            <button 
              onClick={onClose}
              className="px-6 py-3 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* Auto-Play Countdown Overlay */}
      {/* Channel Sidebar Menu */}
      <AnimatePresence>
        {showChannelSidebar && isSidebarOpen && (
          <>
            {/* Light backdrop (transparent, no blur to see content) */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="absolute inset-0 bg-black/10 z-[150]"
            />

            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute top-0 left-0 bottom-0 w-full max-w-[650px] bg-zinc-950/80 backdrop-blur-3xl border-r border-white/5 z-[160] flex flex-col shadow-[40px_0_100px_rgba(0,0,0,0.9)]"
              style={{
                paddingTop: layout.isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
                paddingBottom: layout.isMobile ? 'env(safe-area-inset-bottom, 0px)' : 0,
              }}
            >
              {/* Sidebar Header */}
              <div className="p-8 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                    <Layout className="text-red-600 w-6 h-6" />
                    GUIA DE CANAIS
                  </h2>
                  <p className="text-gray-500 text-xs mt-1 uppercase tracking-widest font-bold">Navegue pelas categorias e canais</p>
                </div>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-3 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="px-8 pb-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar canal, filme ou série..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-red-600/50 transition-colors font-medium"
                    value={channelSearchQuery}
                    onChange={(e) => {
                      setChannelSearchQuery(e.target.value);
                      if (e.target.value) setActiveSidebarColumn('items');
                    }}
                    onFocus={() => setActiveSidebarColumn('items')}
                    autoFocus
                  />
                </div>
              </div>

              {/* Two Column Content with Dynamic Widths */}
              <div className="flex-1 flex overflow-hidden border-t border-white/5">
                {/* Column 1: Categories */}
                <motion.div 
                  animate={{
                    width: layout.isMobile
                      ? (activeSidebarColumn === 'categories' ? '42%' : '32%')
                      : activeSidebarColumn === 'categories'
                        ? '45%'
                        : '25%'
                  }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="border-r border-white/5 bg-black/20 overflow-y-auto custom-scrollbar"
                  onMouseEnter={() => setActiveSidebarColumn('categories')}
                >
                  {sidebarCategories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategoryId(cat.id);
                        setActiveSidebarColumn('items');
                      }}
                      onMouseEnter={() => setSelectedCategoryId(cat.id)}
                      className={`w-full text-left px-8 py-5 transition-all relative flex items-center justify-between group ${
                        (selectedCategoryId === cat.id || (!selectedCategoryId && cat.id === sidebarCategories[0]?.id))
                          ? 'bg-red-600/10 text-white font-bold'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="truncate pr-2">{cat.title}</span>
                      {(selectedCategoryId === cat.id || (!selectedCategoryId && cat.id === sidebarCategories[0]?.id)) && (
                        <motion.div layoutId="activeCat" className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 shadow-[0_0_10px_rgba(229,9,20,0.5)]" />
                      )}
                      
                      {activeSidebarColumn === 'categories' && (
                        <ChevronRight className={`w-4 h-4 transition-transform ${selectedCategoryId === cat.id ? 'translate-x-0' : '-translate-x-2 opacity-0 group-hover:opacity-100'}`} />
                      )}
                    </button>
                  ))}
                </motion.div>

                {/* Column 2: Items */}
                <motion.div 
                  animate={{
                    width: layout.isMobile
                      ? (activeSidebarColumn === 'items' ? '68%' : '58%')
                      : activeSidebarColumn === 'items'
                        ? '75%'
                        : '55%'
                  }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="overflow-y-auto bg-black/40 custom-scrollbar"
                  onMouseEnter={() => setActiveSidebarColumn('items')}
                >
                  <div className="p-2">
                    {(() => {
                      const activeCat = sidebarCategories.find(c => c.id === (selectedCategoryId || sidebarCategories[0]?.id));
                      if (!activeCat) return null;

                      const filteredItems = activeCat.items.filter(item => 
                        item.title.toLowerCase().includes(channelSearchQuery.toLowerCase())
                      );

                      if (filteredItems.length === 0) {
                        return (
                          <div className="p-10 text-center text-gray-600">
                            <Search className="w-10 h-10 mx-auto mb-4 opacity-20" />
                            <p>Nenhum resultado encontrado</p>
                          </div>
                        );
                      }

                      return filteredItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setInternalUrl(item.videoUrl);
                            setInternalMedia(item);
                            setIsSidebarOpen(false);
                            setActiveQualityIndex(0); // Reset quality on channel change
                          }}
                          className={`w-full text-left p-4 rounded-xl transition-all flex items-center gap-4 group mb-1 ${
                            item.id === internalMedia?.id 
                              ? 'bg-red-600 shadow-xl' 
                              : 'hover:bg-white/10'
                          }`}
                        >
                          <div className="relative w-20 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-900 border border-white/5">
                            <img 
                              src={item.thumbnail} 
                              alt="" 
                              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${item.id === internalMedia?.id ? 'opacity-50' : ''}`}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-bold truncate ${item.id === internalMedia?.id ? 'text-white' : 'text-gray-200 group-hover:text-white'}`}>
                              {item.title}
                            </h4>
                            <p className={`text-[10px] uppercase tracking-wider font-medium ${item.id === internalMedia?.id ? 'text-white/70' : 'text-gray-500'}`}>
                              {item.type === 'live' ? '● AO VIVO' : item.type === 'movie' ? 'FILME' : 'SÉRIE'}
                            </p>
                          </div>
                          {item.id === internalMedia?.id && (
                            <div className="flex gap-0.5 items-end h-3 mb-1 pr-2">
                              {[1,2,3].map(i => (
                                <motion.div 
                                  key={i}
                                  animate={{ height: ['20%', '100%', '40%'] }}
                                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }}
                                  className="w-0.5 bg-white rounded-full"
                                />
                              ))}
                            </div>
                          )}
                        </button>
                      ));
                    })()}
                  </div>
                </motion.div>
              </div>

              {/* Sidebar Footer */}
              <div className="p-6 bg-black border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                  <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Sincronizado via Supabase</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                   <span className="bg-white/10 px-2 py-1 rounded text-[10px] font-black">M</span>
                   <span className="font-bold opacity-50 uppercase tracking-tighter">Atalho</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCountdown && nextEpisode && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="absolute bottom-12 right-12 z-[120] bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-start min-w-[320px] overflow-hidden"
          >
            <div className="text-gray-400 text-sm tracking-wider uppercase mb-1">Próximo episódio em {countdown}s</div>
            <div className="text-white text-xl font-bold mb-6 max-w-full truncate">{nextEpisode.currentEpisode?.title || nextEpisode.title}</div>
            
            <div className="flex gap-4 w-full relative z-10">
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-semibold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (onPlayNextEpisode) onPlayNextEpisode();
                }}
                className="flex-1 py-3 px-4 bg-white hover:bg-gray-200 text-black rounded-lg transition-colors font-semibold flex items-center justify-center gap-2 text-sm"
              >
                <Play className="w-4 h-4 fill-black" />
                Assistir
              </button>
            </div>
            
            {/* Progress bar */}
            <div 
              className="absolute bottom-0 left-0 h-1.5 bg-[#E50914]" 
              style={{ width: `${(countdown / 10) * 100}%`, transition: 'width 0.5s linear' }} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={containerRef} className="w-full h-full">
        <video
          ref={videoRef}
          className="w-full h-full"
          crossOrigin="anonymous"
          playsInline
        />
      </div>
    </motion.div>
  );
};

