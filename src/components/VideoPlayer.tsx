import React, { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'mux.js'; // Import mux.js for MPEG-TS support
import { X, Play, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

interface VideoPlayerProps {
  url: string;
  mediaType: string;
  onClose: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, mediaType, onClose }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [retryCount, setRetryCount] = React.useState(0);
  const [diagnostic, setDiagnostic] = React.useState<any>(null);
  const [diagnosing, setDiagnosing] = React.useState(false);
  const [useNative, setUseNative] = React.useState(false);

  const runDiagnostic = async () => {
    setDiagnosing(true);
    try {
      const response = await fetch(`/api/diagnostic?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      setDiagnostic(data);
    } catch (err) {
      setDiagnostic({ success: false, message: 'Não foi possível conectar ao servidor de diagnóstico.' });
    } finally {
      setDiagnosing(false);
    }
  };

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current && videoRef.current) {
      const videoElement = document.createElement('video');
      videoElement.className = 'video-js vjs-big-play-centered vjs-theme-city';
      videoElement.setAttribute('crossorigin', 'anonymous');
      videoRef.current.appendChild(videoElement);

      // Extract original URL to detect type more accurately
      const originalUrl = decodeURIComponent(url.split('url=')[1] || '').toLowerCase();
      
      let type = 'application/x-mpegURL'; // Default to HLS/M3U8
      
      if (retryCount === 0) {
        // First attempt: try to guess based on extension or media type
        if (originalUrl.includes('.mp4')) type = 'video/mp4';
        else if (originalUrl.includes('.mkv')) type = 'video/webm'; 
        else if (originalUrl.includes('.ts') || originalUrl.includes('output=ts')) {
          type = 'video/mp2t';
        } else if (originalUrl.includes('.m3u8')) {
          type = 'application/x-mpegURL';
        } else if (mediaType === 'movie' || mediaType === 'series') {
          type = 'video/mp4';
        }
      } else if (retryCount === 1) {
        // Second attempt: try MPEG-TS (very common for IPTV)
        type = 'video/mp2t';
      } else if (retryCount === 2) {
        // Third attempt: try HLS (fallback for everything)
        type = 'application/x-mpegURL';
      } else if (retryCount === 3) {
        // Fourth attempt: try MP4 (last resort)
        type = 'video/mp4';
      }

      console.log(`Initializing player (Attempt ${retryCount + 1}) with type:`, type);

      const player = playerRef.current = videojs(videoElement, {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: true,
        preload: 'auto',
        html5: {
          vhs: {
            overrideNative: true,
            enableLowInitialPlaylist: true,
            fastStart: true
          },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false
        },
        sources: [{
          src: url,
          type: type
        }]
      }, () => {
        setLoading(false);
      });

      player.on('waiting', () => setLoading(true));
      player.on('playing', () => setLoading(false));
      player.on('error', () => {
        const err = player.error();
        console.error('VideoJS Error:', err ? err.message : 'Unknown error');
        
        if (retryCount < 3) {
          // Try next fallback
          setRetryCount(prev => prev + 1);
          player.dispose();
          playerRef.current = null;
          if (videoRef.current) videoRef.current.innerHTML = '';
        } else {
          let message = 'O vídeo não pôde ser carregado (servidor ou formato incompatível).';
          if (err) {
            switch (err.code) {
              case 1: message = 'O carregamento foi abortado.'; break;
              case 2: message = 'Erro de rede. Verifique sua conexão.'; break;
              case 3: message = 'Erro ao decodificar o vídeo. Formato incompatível.'; break;
              case 4: message = 'O vídeo não pôde ser carregado (servidor ou formato incompatível).'; break;
            }
          }
          setError(message);
          setLoading(false);
          runDiagnostic(); // Automatically run diagnostic to show the real error
        }
      });

      // Handle Escape key to close
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [url, onClose, retryCount, mediaType]);

  // Dispose the player on unmount
  useEffect(() => {
    const player = playerRef.current;
    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, [playerRef]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden"
    >
      <button 
        onClick={onClose}
        className="absolute top-10 right-10 z-[110] p-4 backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 group"
      >
        <X className="text-white w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
      </button>

      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[105] bg-black/50">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white font-medium">Carregando conteúdo...</p>
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
              <div className="mt-2 pt-2 border-t border-white/5">
                <p className="text-gray-500">Headers de Resposta:</p>
                <pre className="text-gray-400 mt-1">{JSON.stringify(diagnostic.headers, null, 2)}</pre>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-4">
            <button 
              onClick={() => {
                setError(null);
                setRetryCount(0);
                setLoading(true);
                setDiagnostic(null);
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
                setUseNative(true);
                setError(null);
                setLoading(false);
              }}
              className="px-6 py-3 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 transition-colors"
            >
              Modo de Compatibilidade
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
            <a 
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              Abrir em Nova Aba
            </a>
          </div>
        </div>
      )}

      <div data-vjs-player className="w-full h-full">
        {useNative ? (
          <video 
            src={url} 
            controls 
            autoPlay 
            className="w-full h-full"
            onError={() => {
              console.error('Native Video Error');
              setError('Falha no Modo Nativo. O formato pode ser incompatível com o navegador.');
            }}
          />
        ) : (
          <div ref={videoRef} className="w-full h-full" />
        )}
      </div>
    </motion.div>
  );
};
