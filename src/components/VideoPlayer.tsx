import React, { useEffect, useRef } from 'react';
import mpegts from 'mpegts.js';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { X, Play, ExternalLink, Layout, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VideoPlayerProps {
  url: string;
  mediaType: string;
  onClose: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
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
  onClose,
  isMinimized = false,
  onToggleMinimize
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [diagnostic, setDiagnostic] = React.useState<any>(null);
  const [diagnosing, setDiagnosing] = React.useState(false);
  const [strategy, setStrategy] = React.useState<'mpegts' | 'hls' | 'native'>(() => detectStrategy(url));
  const authToken = localStorage.getItem('xandeflix_auth_token') || '';

  const runDiagnostic = async () => {
    setDiagnosing(true);
    try {
      const response = await fetch(`/api/diagnostic?url=${encodeURIComponent(url)}`, {
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

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      destroyPlayer();
    };
  }, []);

  function destroyPlayer() {
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

    const video = videoRef.current;
    if (!video) return;

    console.log(`[Player] Strategy: ${strategy} for ${url.substring(0, 80)}...`);

    if (strategy === 'mpegts') {
      initMpegTs(video);
    } else if (strategy === 'hls') {
      initHls(video);
    } else {
      initNative(video);
    }

    // Keyboard handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [url, strategy]);

  // ── mpegts.js for raw MPEG-TS streams ──
  function initMpegTs(video: HTMLVideoElement) {
    if (!mpegts.isSupported()) {
      console.warn('[Player] mpegts.js not supported, falling back to HLS');
      setStrategy('hls');
      return;
    }

    // Web Workers can't resolve relative URLs, so we need absolute
    const absoluteUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

    const player = mpegts.createPlayer({
      type: 'mpegts',
      isLive: mediaType === 'live',
      url: absoluteUrl,
    }, {
      enableWorker: true,
      enableStashBuffer: true,
      stashInitialSize: 1024 * 128, // 128KB initial buffer
      liveBufferLatencyChasing: mediaType === 'live',
      liveBufferLatencyMaxLatency: 10, // More forgiving latency (10s)
      liveBufferLatencyMinRemain: 1, // Minimum 1s stay in buffer
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 60,
      autoCleanupMinBackwardDuration: 30,
    });

    player.attachMediaElement(video);
    player.load();
    const playResult = player.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => { /* autoplay blocked, user will click */ });
    }

    player.on(mpegts.Events.ERROR, (errorType: any, errorDetail: any, errorInfo: any) => {
      console.error('[mpegts] Error:', errorType, errorDetail, errorInfo);
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
    video.addEventListener('error', () => {
      console.error('[mpegts] Video element error');
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

      const player = videojs(vjsVideo, {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: true,
        preload: 'auto',
        html5: {
          vhs: {
            overrideNative: true,
            enableLowInitialPlaylist: true,
            fastStart: true,
          },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false,
        },
        sources: [{ src: url, type: 'application/x-mpegURL' }],
      }, () => {
        setLoading(false);
      });

      player.on('waiting', () => setLoading(true));
      player.on('playing', () => setLoading(false));
      player.on('error', () => {
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
    video.src = url;
    video.autoplay = true;
    video.controls = true;

    const onPlaying = () => setLoading(false);
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onError = () => {
      console.error('[Native] Video element error');
      setError('O vídeo não pôde ser carregado. O servidor ou formato é incompatível.');
      setLoading(false);
      runDiagnostic();
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    video.load();
    video.play().catch(() => { /* autoplay blocked */ });

    // Store cleanup reference
    playerRef.current = {
      destroy: () => {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('canplay', onCanPlay);
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
        width: isMinimized ? (window.innerWidth < 768 ? 240 : 480) : '100vw',
        height: isMinimized ? (window.innerWidth < 768 ? 135 : 270) : '100vh',
        bottom: isMinimized ? 30 : 0,
        right: isMinimized ? 30 : 0,
        top: isMinimized ? 'auto' : 0,
        left: isMinimized ? 'auto' : 0,
        borderRadius: isMinimized ? 20 : 0,
        aspectRatio: isMinimized ? '16/9' : 'auto'
      }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={`fixed z-[100] bg-black flex items-center justify-center overflow-hidden shadow-2xl ${
        isMinimized ? 'border-2 border-white/20' : ''
      }`}
    >
      <div className="absolute top-4 right-4 z-[110] flex gap-3">
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
        <button 
          onClick={onClose}
          className="p-3 backdrop-blur-xl bg-black/40 hover:bg-red-500/20 border border-white/10 rounded-2xl transition-all duration-300 group shadow-lg"
          title="Fechar"
        >
          <X className="text-white w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

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
                setStrategy(detectStrategy(url));
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
