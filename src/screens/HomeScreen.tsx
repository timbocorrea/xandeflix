import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Animated, Dimensions, TouchableHighlight, Text } from 'react-native';
import { RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Common types & Stores
import { Category, Media } from '../types';
import { useStore } from '../store/useStore';

// Custom Hooks
import { usePlaylist } from '../hooks/usePlaylist';
import { useMediaFilter } from '../hooks/useMediaFilter';

// Components
import { SideMenu } from '../components/SideMenu';
import { SettingsModal } from '../components/SettingsModal';
import { VideoPlayer } from '../components/VideoPlayer';
import { HeroSection } from '../components/HeroSection';
import { CategoryRow } from '../components/CategoryRow';
import LoadingScreen from '../components/LoadingScreen';
import { MediaDetailsPage } from '../components/MediaDetailsModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const HomeScreen: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  // Global Store State
  const { 
    allCategories, 
    activeFilter, 
    selectedMedia, 
    setSelectedMedia, 
    isSettingsVisible, 
    setIsSettingsVisible, 
    hiddenCategoryIds, 
    setHiddenCategoryIds,
    isUsingMock 
  } = useStore();
  const setActiveFilter = useStore((state) => state.setActiveFilter);
  const setIsAdminMode = useStore((state) => state.setIsAdminMode);

  // Custom Hooks for Data & Filtering
  const { fetchPlaylist, loading, playlistStatus, playlistError, playlistSource } = usePlaylist();
  const { filteredCategories } = useMediaFilter();

  // Local UI State
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<'live' | 'movie' | 'series' | null>(null);
  const [playingMedia, setPlayingMedia] = useState<Media | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [isPlayerMinimized, setIsPlayerMinimized] = useState(false);
  const [detailsMedia, setDetailsMedia] = useState<Media | null>(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  
  const scrollRef = useRef<ScrollView>(null);
  
  // Initial Data Fetch
  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  // Handle play action
  const handlePlay = useCallback(async (media: Media) => {
    try {
      if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn('Could not auto-enter fullscreen:', e);
    }
    
    setPlayingMedia(media);
    setActiveVideoUrl(media.videoUrl);
    setVideoType(media.type);
    setIsPlayerMinimized(false); // Sempre abre em tela cheia ao clicar
    setIsAutoRotating(false);
    setIsDetailsVisible(false); // Close details if open
  }, []);

  const handleMediaPress = useCallback((media: Media) => {
    if (media.type === 'movie' || media.type === 'series') {
      setDetailsMedia(media);
      setIsDetailsVisible(true);
    } else {
      // Live content goes straight to player
      handlePlay(media);
    }
  }, [handlePlay]);

  const handleToggleMinimize = useCallback(() => {
    setIsPlayerMinimized(prev => !prev);
  }, []);

  // Handle media selection/auto-rotation
  // Build a pool of diverse items for the hero slideshow
  const [heroPool, setHeroPool] = useState<Media[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (allCategories.length === 0) return;
    
    // Filter source categories based on the current context
    let sourceCats = allCategories;
    
    // For specific tabs, only show content of that type in the slides
    if (activeFilter !== 'home' && activeFilter !== 'all' && activeFilter !== 'search' && activeFilter !== 'mylist') {
      sourceCats = allCategories.filter(cat => cat.type === activeFilter);
    }
    
    // Pick 1-2 items from each source category, preferring those with unique thumbnails
    const pool: Media[] = [];
    const seenThumbs = new Set<string>();
    
    // Priority 1: High quality unique posters
    for (const cat of sourceCats) {
      let added = 0;
      for (const item of cat.items) {
        if (added >= 2) break;
        if (item.thumbnail.includes('unsplash.com') || item.thumbnail.includes('picsum.photos')) continue;
        if (seenThumbs.has(item.thumbnail)) continue;
        seenThumbs.add(item.thumbnail);
        pool.push(item);
        added++;
        if (pool.length >= 15) break;
      }
      if (pool.length >= 15) break;
    }
    
    // Priority 2: Fill remains
    if (pool.length < 5) {
      for (const cat of sourceCats) {
        for (const item of cat.items) {
          if (pool.length >= 15) break;
          if (!pool.find(p => p.id === item.id)) {
            pool.push(item);
          }
        }
      }
    }
    
    // Shuffle for variety
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    
    const finalPool = pool.slice(0, 15);
    setHeroPool(finalPool);
    setHeroIndex(0);
  }, [allCategories, activeFilter]);

  // Auto-rotation with fade transition
  useEffect(() => {
    if (!isAutoRotating || heroPool.length === 0) return;

    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % heroPool.length);
    }, 8000); // 8 seconds per slide (Netflix-like pacing)

    return () => clearInterval(interval);
  }, [isAutoRotating, heroPool]);

  useEffect(() => {
    if (heroPool.length === 0) {
      setSelectedMedia(null);
      return;
    }

    const nextMedia = heroPool[heroIndex] || null;
    setSelectedMedia(nextMedia);
  }, [heroIndex, heroPool, setSelectedMedia]);

  /**
   * Focus Handlers
   */
  const handleMediaFocus = useCallback((media: Media, id: string) => {
    setFocusedId(id);
    setSelectedMedia(media);
    setIsAutoRotating(false);
  }, [setSelectedMedia]);

  const handleInteractiveFocus = useCallback((id: string) => {
    setFocusedId(id);
    setIsAutoRotating(false);
  }, []);

  /**
   * Action Handlers
   */
  const handleMenuSelect = useCallback((filter: string) => {
    if (filter === 'admin') {
      setIsAdminMode(true);
      return;
    }
    setActiveFilter(filter);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [setActiveFilter, setIsAdminMode]);

  const handleSaveSettings = useCallback((url: string, newHiddenIds: string[]) => {
    setHiddenCategoryIds(newHiddenIds);
  }, [setHiddenCategoryIds]);

  const nextEpisode = useMemo(() => {
    if (!playingMedia || playingMedia.type !== 'series' || !playingMedia.seasons?.length || !playingMedia.currentEpisode) {
      return null;
    }

    const seasonNumber = playingMedia.currentSeasonNumber ?? playingMedia.currentEpisode.seasonNumber;
    const seasonIndex = playingMedia.seasons.findIndex((season) => season.seasonNumber === seasonNumber);
    if (seasonIndex === -1) return null;

    const season = playingMedia.seasons[seasonIndex];
    const episodeIndex = season.episodes.findIndex((episode) => episode.id === playingMedia.currentEpisode?.id);
    if (episodeIndex === -1) return null;

    const directNextEpisode = season.episodes[episodeIndex + 1];
    if (directNextEpisode) {
      return {
        ...playingMedia,
        videoUrl: directNextEpisode.videoUrl,
        title: `${playingMedia.title.split(' - ')[0]} - ${directNextEpisode.title}`,
        currentEpisode: directNextEpisode,
        currentSeasonNumber: season.seasonNumber,
      };
    }

    const nextSeason = playingMedia.seasons[seasonIndex + 1];
    const firstEpisodeNextSeason = nextSeason?.episodes[0];
    if (!firstEpisodeNextSeason) return null;

    return {
      ...playingMedia,
      videoUrl: firstEpisodeNextSeason.videoUrl,
      title: `${playingMedia.title.split(' - ')[0]} - ${firstEpisodeNextSeason.title}`,
      currentEpisode: firstEpisodeNextSeason,
      currentSeasonNumber: nextSeason.seasonNumber,
    };
  }, [playingMedia]);

  return (
    <View style={styles.container}>
      {/* Loading State Overlay */}
      <AnimatePresence>
        {loading && allCategories.length === 0 && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              zIndex: 9999,
              backgroundColor: '#050505'
            }}
          >
            <LoadingScreen statusMessage={
              playlistStatus === 'loading_user_info' 
                ? 'Verificando sua conta...' 
                : playlistStatus === 'loading_playlist'
                ? `Buscando sua lista de canais...`
                : 'Carregando sua experiência cinematográfica...'
            } />
          </motion.div>
        )}
      </AnimatePresence>

      <SideMenu onSelect={handleMenuSelect} activeId={activeFilter} onLogout={onLogout} />
      
      <ScrollView 
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Cinematic Hero */}
        <HeroSection 
          media={selectedMedia}
          onPlay={handleMediaPress}
          isAutoRotating={isAutoRotating}
          onAutoRotate={() => setIsAutoRotating(true)}
          focusedId={focusedId}
          onFocus={handleInteractiveFocus}
        />

        {/* Dynamic Media Rows */}
        <View style={styles.categoriesContainer}>
          {filteredCategories.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Nenhum conteúdo encontrado nesta categoria.</Text>
            </View>
          ) : (
            filteredCategories.map((category, rowIndex) => (
              <CategoryRow 
                key={category.id}
                category={category}
                rowIndex={rowIndex}
                focusedId={focusedId}
                onMediaFocus={handleMediaFocus}
                onMediaPress={handleMediaPress}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Header Branding - Overlays the ScrollView */}
      <View style={styles.header}>
        <Text style={styles.logo}>XANDEFLIX</Text>
        
        {/* Playlist Status Feedback */}
        {(isUsingMock || playlistError) && (
          <View style={styles.mockControls}>
            {/* Error/Status Badge */}
            <View style={[
              styles.mockBadge, 
              playlistError?.status === 'error_playlist' || playlistError?.status === 'error_auth' 
                ? { backgroundColor: '#DC2626' } 
                : { backgroundColor: '#EAB308' }
            ]}>
              <Text style={styles.mockBadgeText}>
                {playlistError?.status === 'error_auth' 
                  ? '⚠ ERRO DE AUTENTICAÇÃO'
                  : playlistError?.status === 'error_playlist'
                  ? '⚠ LISTA NÃO CARREGADA'
                  : playlistError?.status === 'mock_fallback'
                  ? '⚠ LISTA VAZIA - MODO DEMO'
                  : 'MODO DEMO'}
              </Text>
            </View>

            {/* Error Details */}
            {playlistError && (
              <View style={styles.errorDetailsBox}>
                <Text style={styles.errorMsg}>{playlistError.message}</Text>
                {playlistError.details && (
                  <Text style={styles.errorDetails}>{playlistError.details}</Text>
                )}
                {playlistError.playlistUrl && (
                  <Text style={styles.errorUrl} numberOfLines={1}>
                    URL: {playlistError.playlistUrl.substring(0, 60)}...
                  </Text>
                )}
              </View>
            )}

            {/* Retry Button */}
            <TouchableHighlight
              onPress={() => fetchPlaylist()}
              underlayColor="rgba(255,255,255,0.1)"
              style={styles.retryButton}
            >
              <View style={styles.retryInner}>
                <span><RotateCcw size={14} color="white" /></span>
                <Text style={styles.retryText}>Tentar Novamente</Text>
              </View>
            </TouchableHighlight>
          </View>
        )}

        {/* Loading indicator in header */}
        {loading && !isUsingMock && (
          <View style={styles.mockControls}>
            <View style={[styles.mockBadge, { backgroundColor: '#3B82F6' }]}>
              <Text style={styles.mockBadgeText}>
                {playlistStatus === 'loading_user_info' 
                  ? '⏳ VERIFICANDO CONTA...'
                  : '⏳ CARREGANDO LISTA...'}
              </Text>
            </View>
            {playlistSource ? (
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Outfit' }} numberOfLines={1}>
                {playlistSource.substring(0, 50)}...
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {/* Overlays */}
      <AnimatePresence>
        {isDetailsVisible && detailsMedia && (
          <MediaDetailsPage
            key={detailsMedia.id}
            media={detailsMedia}
            onClose={() => setIsDetailsVisible(false)}
            onPlay={handlePlay}
            onSelectMedia={setDetailsMedia}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeVideoUrl && (
          <VideoPlayer 
            key={activeVideoUrl}
            url={activeVideoUrl} 
            mediaType={videoType || 'live'}
            media={playingMedia}
            nextEpisode={nextEpisode}
            onPlayNextEpisode={nextEpisode ? () => handlePlay(nextEpisode) : undefined}
            onClose={() => {
              setActiveVideoUrl(null);
              setPlayingMedia(null);
              try {
                if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
                  document.exitFullscreen().catch(() => {});
                }
              } catch (e) {}
            }}
            isMinimized={isPlayerMinimized}
            onToggleMinimize={handleToggleMinimize}
          />
        )}
      </AnimatePresence>

      <SettingsModal
        isVisible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        onSave={handleSaveSettings}
        currentUrl={""}
        onLogout={onLogout}
        allCategories={allCategories}
        hiddenCategoryIds={hiddenCategoryIds}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingLeft: 120, // Space for SideMenu
    paddingRight: 60,
    paddingTop: 0,
    paddingBottom: 100,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    paddingTop: 40,
    paddingLeft: 120, // Align with side menu icons
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    zIndex: 100,
    backgroundColor: 'transparent',
  } as any,
  logo: {
    fontSize: 56,
    fontWeight: '900',
    color: '#E50914',
    fontStyle: 'italic',
    letterSpacing: -3,
    fontFamily: 'Outfit',
  },
  mockControls: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12,
    flexWrap: 'wrap',
    paddingRight: 40,
  },
  mockBadge: {
    backgroundColor: '#EAB308',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  mockBadgeText: {
    color: 'black',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  errorDetailsBox: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 420,
  },
  errorMsg: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  errorDetails: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
    fontFamily: 'Outfit',
  },
  errorUrl: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  retryInner: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8,
  },
  retryText: {
    color: 'white', 
    fontSize: 14, 
    fontWeight: '900',
    fontFamily: 'Outfit',
  },
  categoriesContainer: {
    marginTop: 36,
    zIndex: 20,
  },
  emptyContainer: {
    padding: 100, 
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)', 
    fontSize: 24, 
    fontWeight: 'bold',
    fontFamily: 'Outfit',
  },
});

export default HomeScreen;
