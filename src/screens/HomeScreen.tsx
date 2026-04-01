import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { View, StyleSheet, ScrollView, Animated, Dimensions, TouchableHighlight, Text, TextInput } from 'react-native';
import { RotateCcw, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Common types & Stores
import { Category, Media } from '../types';
import { useStore } from '../store/useStore';

// Custom Hooks
import { usePlaylist } from '../hooks/usePlaylist';
import { useMediaFilter } from '../hooks/useMediaFilter';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

// Components
import { SideMenu } from '../components/SideMenu';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { SettingsModal } from '../components/SettingsModal';
import { HeroSection } from '../components/HeroSection';
import { CategoryRow } from '../components/CategoryRow';
import { VideoPlayer, type VideoPlayerHandle } from '../components/VideoPlayer';
import LoadingScreen from '../components/LoadingScreen';
const MediaDetailsPage = lazy(() =>
  import('../components/MediaDetailsModal').then((module) => ({ default: module.MediaDetailsPage })),
);
const CategoryGridView = lazy(() =>
  import('../components/CategoryGridView').then((module) => ({ default: module.CategoryGridView })),
);
const LiveTVGrid = lazy(() =>
  import('../components/LiveTVGrid').then((module) => ({ default: module.LiveTVGrid })),
);
const LiveTVMobileBrowser = lazy(() =>
  import('../components/LiveTVMobileBrowser').then((module) => ({ default: module.LiveTVMobileBrowser })),
);

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const HOME_HISTORY_MARKER = '__xandeflixHomeNav';

type PlayerHistoryState = {
  mediaId: string;
  videoUrl: string;
  type: 'live' | 'movie' | 'series';
  title: string;
  displayMode: 'inline' | 'fullscreen';
  isMinimized: boolean;
  currentEpisodeId: string | null;
  currentSeasonNumber: number | null;
};

type HomeHistorySnapshot = {
  activeFilter: string;
  isSettingsVisible: boolean;
  detailsMediaId: string | null;
  gridCategoryId: string | null;
  player: PlayerHistoryState | null;
};

const CategoryRowSkeleton = ({ layout }: { layout: any; key?: any }) => {
  const cardWidth = layout.isMobile ? 148 : layout.isTablet ? 180 : 220;
  const cardHeight = Math.round(cardWidth * 1.5);
  const cardGap = layout.isMobile ? 14 : layout.isTablet ? 18 : 24;

  return (
    <View style={{ marginBottom: 44, opacity: 0.3 }}>
      <View style={{ width: 300, height: 32, backgroundColor: '#333', borderRadius: 8, marginBottom: 24, marginLeft: 4 }} />
      <View style={{ flexDirection: 'row' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View 
            key={i} 
            style={{ 
              width: cardWidth, 
              height: cardHeight, 
              backgroundColor: '#222', 
              borderRadius: 12, 
              marginRight: cardGap 
            }} 
          />
        ))}
      </View>
    </View>
  );
};

const HomeScreen: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  // Global Store State
  const { 
    allCategories, 
    activeFilter, 
    searchQuery,
    selectedMedia, 
    setSelectedMedia, 
    isSettingsVisible, 
    setIsSettingsVisible, 
    hiddenCategoryIds, 
    setHiddenCategoryIds,
    isUsingMock 
  } = useStore();
  const setActiveFilter = useStore((state) => state.setActiveFilter);
  const setSearchQuery = useStore((state) => state.setSearchQuery);
  const setIsAdminMode = useStore((state) => state.setIsAdminMode);

  // Custom Hooks for Data & Filtering
  const { fetchPlaylist, loading, playlistStatus, playlistError, playlistSource } = usePlaylist();
  const { filteredCategories } = useMediaFilter();
  const layout = useResponsiveLayout();
  const isSearchMode = activeFilter === 'search';
  const isSearchIdle = isSearchMode && !searchQuery.trim();
  const isMobileLiveBrowser = activeFilter === 'live' && layout.isCompact;
  const useInlineCatalogPlayback = activeFilter === 'movie' || activeFilter === 'series';

  // Local UI State
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<'live' | 'movie' | 'series' | null>(null);
  const [playingMedia, setPlayingMedia] = useState<Media | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [isPlayerMinimized, setIsPlayerMinimized] = useState(false);
  const [detailsMedia, setDetailsMedia] = useState<Media | null>(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [gridCategory, setGridCategory] = useState<Category | null>(null);
  const [isDetachedToPiP, setIsDetachedToPiP] = useState(false);
  const [isPictureInPictureActive, setIsPictureInPictureActive] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden
  );
  
  const scrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<any>(null);
  const activePlayerRef = useRef<VideoPlayerHandle | null>(null);
  
  // Initial Data Fetch
  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (activeFilter !== 'search') {
      return;
    }

    const focusTimer = setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 50);

    return () => clearTimeout(focusTimer);
  }, [activeFilter]);

  const liveChannelCategories = useMemo(
    () => allCategories.filter((category) => category.type === 'live' && category.items.length > 0),
    [allCategories]
  );

  // isBrowsing: player docked at top, content browser below
  const isBrowsing = !!activeVideoUrl && isPlayerMinimized;
  const hasVisiblePinnedPlayer = !!activeVideoUrl && !isDetachedToPiP && (isBrowsing || isMobileLiveBrowser);
  const isPinnedPlayerLayout = !isDetachedToPiP && (isBrowsing || isMobileLiveBrowser);
  const shouldRenderPinnedPlayer = !!activeVideoUrl && (isBrowsing || isMobileLiveBrowser || isDetachedToPiP);

  const closeActivePlayer = useCallback(() => {
    setIsDetachedToPiP(false);
    setIsPictureInPictureActive(false);
    setActiveVideoUrl(null);
    setPlayingMedia(null);
    setVideoType(null);
    setIsPlayerMinimized(false);

    try {
      if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) {}
  }, []);

  const handlePictureInPictureChange = useCallback((isActive: boolean) => {
    setIsPictureInPictureActive(isActive);

    if (!isActive) {
      setIsDetachedToPiP(false);
    }
  }, []);

  const detachPlaybackToPiP = useCallback(async () => {
    if (!activeVideoUrl) {
      return false;
    }

    setIsPlayerMinimized(true);

    if (isPictureInPictureActive) {
      setIsDetachedToPiP(true);
      return true;
    }

    const enteredPiP = (await activePlayerRef.current?.enterPictureInPicture()) ?? false;
    setIsDetachedToPiP(enteredPiP);
    return enteredPiP;
  }, [activeVideoUrl, isPictureInPictureActive]);

  // Handle play action
  const handlePlay = useCallback(async (media: Media) => {
    // Don't enter fullscreen if already in browse mode — stay in browse layout
    if (!isBrowsing) {
      try {
        if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (e) {
        console.warn('Could not auto-enter fullscreen:', e);
      }
    }
    
    setIsDetachedToPiP(false);
    setPlayingMedia(media);
    setActiveVideoUrl(media.videoUrl);
    setVideoType(media.type);
    // When already browsing, stay in browse mode. Otherwise open fullscreen
    if (!isBrowsing) {
      setIsPlayerMinimized(false);
    }
    setIsAutoRotating(false);
    setIsDetailsVisible(false);
  }, [isBrowsing]);

  const resolvePlayableMedia = useCallback((media: Media): Media | null => {
    if (media.videoUrl) {
      return media;
    }

    const firstSeason = media.seasons?.[0];
    const firstEpisode = firstSeason?.episodes?.[0];

    if (!firstSeason || !firstEpisode) {
      return null;
    }

    return {
      ...media,
      videoUrl: firstEpisode.videoUrl,
      title: `${media.title} - ${firstEpisode.title}`,
      currentEpisode: firstEpisode,
      currentSeasonNumber: firstSeason.seasonNumber,
    };
  }, []);

  const handleInlineLivePlay = useCallback((media: Media) => {
    try {
      if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) {}

    setIsDetachedToPiP(false);
    setPlayingMedia(media);
    setActiveVideoUrl(media.videoUrl);
    setVideoType(media.type);
    setIsPlayerMinimized(false);
    setIsAutoRotating(false);
    setIsDetailsVisible(false);
  }, []);

  const handleInlineCatalogPlay = useCallback((media: Media) => {
    const playableMedia = resolvePlayableMedia(media);

    if (!playableMedia) {
      setDetailsMedia(media);
      setIsDetailsVisible(true);
      return;
    }

    try {
      if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) {}

    setIsDetachedToPiP(false);
    setPlayingMedia(playableMedia);
    setActiveVideoUrl(playableMedia.videoUrl);
    setVideoType(playableMedia.type);
    setIsPlayerMinimized(true);
    setIsAutoRotating(false);
    setIsDetailsVisible(false);
  }, [resolvePlayableMedia]);

  const handleMediaPress = useCallback((media: Media) => {
    if (media.type === 'movie' || media.type === 'series') {
      if (useInlineCatalogPlayback) {
        handleInlineCatalogPlay(media);
        return;
      }

      if (isBrowsing) {
        // In browse mode, tap goes straight to player (no detail modal)
        const playableMedia = resolvePlayableMedia(media);
        if (playableMedia) {
          handlePlay(playableMedia);
        } else {
          setDetailsMedia(media);
          setIsDetailsVisible(true);
        }
      } else {
        setDetailsMedia(media);
        setIsDetailsVisible(true);
      }
    } else {
      handlePlay(media);
    }
  }, [handleInlineCatalogPlay, handlePlay, isBrowsing, resolvePlayableMedia, useInlineCatalogPlayback]);

  const handleToggleMinimize = useCallback(() => {
    const goingToMinimize = !isPlayerMinimized;
    // If minimizing → exit fullscreen so the layout is visible
    if (goingToMinimize) {
      try {
        if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (e) {}
    } else {
      // Restoring fullscreen
      try {
        if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen();
        }
      } catch (e) {}
    }
    setIsPlayerMinimized(goingToMinimize);
  }, [isPlayerMinimized]);

  // Handle media selection/auto-rotation
  // Build a pool of diverse items for the hero slideshow
  const [heroPool, setHeroPool] = useState<Media[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (allCategories.length === 0) return;
    
    const useLiveHeroPool = activeFilter === 'live';
    let sourceCats = allCategories.filter((cat) => {
      const titleUpper = cat.title.toUpperCase();
      const isAdult = titleUpper.includes('18+') || titleUpper.includes('+18') || titleUpper.includes('ADULT') || titleUpper.includes('XXX') || titleUpper.includes('HOT');
      if (isAdult) return false;
      return useLiveHeroPool ? cat.type === 'live' : cat.type !== 'live';
    });
    
    // For specific tabs, further filter by the active type
    if (
      activeFilter !== 'home' &&
      activeFilter !== 'all' &&
      activeFilter !== 'search' &&
      activeFilter !== 'mylist' &&
      activeFilter !== 'live'
    ) {
      sourceCats = sourceCats.filter(cat => cat.type === activeFilter);
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
    if (
      !isAutoRotating ||
      heroPool.length === 0 ||
      !isPageVisible ||
      isSearchMode ||
      isDetailsVisible ||
      !!activeVideoUrl
    ) {
      return;
    }

    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % heroPool.length);
    }, 8000); // 8 seconds per slide (Netflix-like pacing)

    return () => clearInterval(interval);
  }, [isAutoRotating, heroPool, isPageVisible, isSearchMode, isDetailsVisible, activeVideoUrl]);

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
  const handleMenuSelect = useCallback(async (filter: string) => {
    if (filter === 'admin') {
      setIsAdminMode(true);
      return;
    }

    if (filter === 'settings' || filter === 'profile') {
      setIsSettingsVisible(true);
      return;
    }

    if (filter !== 'search') {
      setSearchQuery('');
    }

    if (filter !== activeFilter && activeVideoUrl) {
      await detachPlaybackToPiP();
    }

    setActiveFilter(filter);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [activeFilter, activeVideoUrl, detachPlaybackToPiP, setActiveFilter, setIsAdminMode, setIsSettingsVisible, setSearchQuery]);

  const handleSaveSettings = useCallback((url: string, newHiddenIds: string[]) => {
    setHiddenCategoryIds(newHiddenIds);
  }, [setHiddenCategoryIds]);

  const handleSeeAll = useCallback((category: Category) => {
    setGridCategory(category);
  }, []);

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

  const searchResultsCount = useMemo(
    () => filteredCategories.reduce((total, category) => total + category.items.length, 0),
    [filteredCategories]
  );

  // Browse mode player dimensions
  const browsePlayerHeight = layout.isMobile
    ? Math.round(layout.width * 9 / 16)   // 16:9 ratio
    : layout.isTablet
    ? Math.round(layout.width * 0.4 * 9 / 16)
    : Math.round(layout.width * 0.35 * 9 / 16);
  const pinnedPlayerHeight = isMobileLiveBrowser
    ? Math.round(layout.width * 9 / 16)
    : browsePlayerHeight;
  const hideHeroSection =
    (activeFilter === 'live' && layout.isDesktop) ||
    (!isDetachedToPiP && isBrowsing && useInlineCatalogPlayback);
  const mediaLookup = useMemo(() => {
    const map = new Map<string, Media>();

    allCategories.forEach((category) => {
      category.items.forEach((item) => {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      });
    });

    return map;
  }, [allCategories]);
  const categoryLookup = useMemo(
    () => new Map(allCategories.map((category) => [category.id, category])),
    [allCategories]
  );
  const historyReadyRef = useRef(false);
  const historyDepthRef = useRef(0);
  const lastSnapshotKeyRef = useRef<string | null>(null);
  const isApplyingHistoryRef = useRef(false);

  const buildPlayerHistoryState = useCallback((): PlayerHistoryState | null => {
    if (!playingMedia || !activeVideoUrl || !videoType) {
      return null;
    }

    return {
      mediaId: playingMedia.id,
      videoUrl: activeVideoUrl,
      type: videoType,
      title: playingMedia.title,
      displayMode: isBrowsing || isMobileLiveBrowser ? 'inline' : 'fullscreen',
      isMinimized: isPlayerMinimized,
      currentEpisodeId: playingMedia.currentEpisode?.id ?? null,
      currentSeasonNumber: playingMedia.currentSeasonNumber ?? null,
    };
  }, [activeVideoUrl, isBrowsing, isMobileLiveBrowser, isPlayerMinimized, playingMedia, videoType]);

  const resolveHistoryPlayer = useCallback((playerState: PlayerHistoryState | null): Media | null => {
    if (!playerState) {
      return null;
    }

    const baseMedia = mediaLookup.get(playerState.mediaId);
    if (!baseMedia) {
      return null;
    }

    const resolvedMedia: Media = {
      ...baseMedia,
      title: playerState.title || baseMedia.title,
      videoUrl: playerState.videoUrl || baseMedia.videoUrl,
    };

    if (!playerState.currentEpisodeId || !baseMedia.seasons?.length) {
      return resolvedMedia;
    }

    const resolvedEpisode = baseMedia.seasons
      .flatMap((season) => season.episodes)
      .find((episode) => episode.id === playerState.currentEpisodeId);

    if (!resolvedEpisode) {
      return resolvedMedia;
    }

    return {
      ...resolvedMedia,
      currentEpisode: resolvedEpisode,
      currentSeasonNumber: playerState.currentSeasonNumber ?? resolvedEpisode.seasonNumber,
      videoUrl: playerState.videoUrl || resolvedEpisode.videoUrl,
      title: playerState.title || `${baseMedia.title} - ${resolvedEpisode.title}`,
    };
  }, [mediaLookup]);

  const navigationSnapshot = useMemo<HomeHistorySnapshot>(() => ({
    activeFilter,
    isSettingsVisible,
    detailsMediaId: isDetailsVisible ? detailsMedia?.id ?? null : null,
    gridCategoryId: gridCategory?.id ?? null,
    player: buildPlayerHistoryState(),
  }), [
    activeFilter,
    buildPlayerHistoryState,
    detailsMedia?.id,
    gridCategory?.id,
    isDetailsVisible,
    isSettingsVisible,
  ]);

  const restoreSnapshot = useCallback((snapshot: HomeHistorySnapshot) => {
    isApplyingHistoryRef.current = true;

    const restoredDetailsMedia = snapshot.detailsMediaId ? mediaLookup.get(snapshot.detailsMediaId) ?? null : null;
    const restoredGridCategory = snapshot.gridCategoryId ? categoryLookup.get(snapshot.gridCategoryId) ?? null : null;
    const restoredPlayerMedia = resolveHistoryPlayer(snapshot.player);

    setActiveFilter(snapshot.activeFilter);
    setIsSettingsVisible(snapshot.isSettingsVisible);
    setDetailsMedia(restoredDetailsMedia);
    setIsDetailsVisible(!!restoredDetailsMedia);
    setGridCategory(restoredGridCategory);
    setPlayingMedia(restoredPlayerMedia);
    setActiveVideoUrl(snapshot.player?.videoUrl ?? null);
    setVideoType(snapshot.player?.type ?? null);
    setIsPlayerMinimized(snapshot.player?.isMinimized ?? false);
    setIsDetachedToPiP(false);
    setIsPictureInPictureActive(false);

    if (!snapshot.player || snapshot.player.displayMode === 'inline') {
      try {
        if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (e) {}
    }

    window.setTimeout(() => {
      isApplyingHistoryRef.current = false;
      lastSnapshotKeyRef.current = JSON.stringify(snapshot);
    }, 0);
  }, [
    categoryLookup,
    mediaLookup,
    resolveHistoryPlayer,
    setActiveFilter,
    setIsSettingsVisible,
  ]);

  const navigateBackInApp = useCallback((fallbackAction: () => void) => {
    if (typeof window !== 'undefined' && historyDepthRef.current > 0) {
      window.history.back();
      return;
    }

    fallbackAction();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    if (isPinnedPlayerLayout) {
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      window.scrollTo({ top: 0, behavior: 'auto' });
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [isPinnedPlayerLayout]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const snapshotKey = JSON.stringify(navigationSnapshot);

    if (!historyReadyRef.current) {
      window.history.replaceState({ [HOME_HISTORY_MARKER]: true, snapshot: navigationSnapshot }, '', window.location.href);
      historyReadyRef.current = true;
      historyDepthRef.current = 0;
      lastSnapshotKeyRef.current = snapshotKey;
      return;
    }

    if (isApplyingHistoryRef.current || snapshotKey === lastSnapshotKeyRef.current) {
      return;
    }

    window.history.pushState({ [HOME_HISTORY_MARKER]: true, snapshot: navigationSnapshot }, '', window.location.href);
    historyDepthRef.current += 1;
    lastSnapshotKeyRef.current = snapshotKey;
  }, [navigationSnapshot]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePopState = (event: PopStateEvent) => {
      const nextState = event.state;

      if (!nextState?.[HOME_HISTORY_MARKER]) {
        return;
      }

      historyDepthRef.current = Math.max(0, historyDepthRef.current - 1);
      restoreSnapshot(nextState.snapshot as HomeHistorySnapshot);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [restoreSnapshot]);

  return (
    <View
      style={[
        styles.container,
        isPinnedPlayerLayout && {
          flexDirection: 'column',
          height: layout.height,
          overflow: 'hidden',
        },
      ]}
    >
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

      {(isMobileLiveBrowser || !activeVideoUrl || isPlayerMinimized) && (
        layout.isCompact ? (
          <MobileBottomNav
            onSelect={handleMenuSelect}
            activeId={isSettingsVisible ? 'settings' : activeFilter}
          />
        ) : (
          <SideMenu
            onSelect={handleMenuSelect}
            activeId={isSettingsVisible ? 'settings' : activeFilter}
            onLogout={onLogout}
          />
        )
      )}
      
      {/* ── Browse-while-playing: docked player at top ── */}
      {shouldRenderPinnedPlayer && activeVideoUrl && (
        <View
          style={
            isDetachedToPiP
              ? {
                  position: 'fixed',
                  top: -200,
                  left: -200,
                  width: 1,
                  height: 1,
                  opacity: 0,
                  overflow: 'hidden',
                  pointerEvents: 'none' as any,
                }
              : {
                  width: '100%',
                  height: pinnedPlayerHeight,
                  backgroundColor: '#000',
                  borderBottom: '1px solid rgba(255,255,255,0.08)' as any,
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 50,
                  marginTop: layout.isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
                  marginLeft: layout.isCompact ? 0 : layout.sideRailWidth,
                }
          }
        >
          {/* Inline player — no fullscreen controls */}
          <VideoPlayer
            ref={activePlayerRef}
            key={`pinned-${activeVideoUrl}`}
            url={activeVideoUrl}
            mediaType={videoType || 'live'}
            media={playingMedia}
            nextEpisode={nextEpisode}
            onPlayNextEpisode={nextEpisode ? () => handlePlay(nextEpisode) : undefined}
            onClose={() => navigateBackInApp(closeActivePlayer)}
            isMinimized={false}
            onToggleMinimize={isMobileLiveBrowser ? undefined : handleToggleMinimize}
            isBrowseMode={true}
            showChannelSidebar={!isMobileLiveBrowser}
            channelBrowserCategories={playingMedia?.type === 'live' ? liveChannelCategories : undefined}
            onPictureInPictureChange={handlePictureInPictureChange}
          />
        </View>
      )}

      {isMobileLiveBrowser ? (
        <Suspense fallback={<View style={{ flex: 1, backgroundColor: '#050505' }} />}>
          <LiveTVMobileBrowser
            categories={filteredCategories}
            activeMedia={playingMedia?.type === 'live' ? playingMedia : null}
            activeVideoUrl={playingMedia?.type === 'live' ? activeVideoUrl : null}
            layout={layout}
            onSelectChannel={handleInlineLivePlay}
            onClosePlayer={() => navigateBackInApp(closeActivePlayer)}
            showEmbeddedPlayer={false}
          />
        </Suspense>
      ) : (
      <ScrollView 
        ref={scrollRef}
        style={styles.scrollView}
        scrollEnabled={activeFilter !== 'live'}
        contentContainerStyle={[
          styles.scrollContent,
          layout.isCompact && styles.scrollContentCompact,
          {
            paddingLeft: layout.isDesktop ? layout.sideRailWidth : layout.horizontalPadding,
            paddingRight: layout.horizontalPadding,
            paddingBottom: activeFilter === 'live' && layout.isDesktop ? 0 : layout.bottomNavigationHeight + (layout.isDesktop ? 100 : 28),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!isSearchMode ? (
          loading && allCategories.length === 0 ? (
            <View style={{ height: 400, backgroundColor: '#111', borderRadius: 20, marginBottom: 40, opacity: 0.3 }} />
          ) : hideHeroSection ? (
            null // Hide hero on live desktop view as we have the split column layout
          ) : (
            <HeroSection 
              media={selectedMedia}
              onPlay={handleMediaPress}
              isAutoRotating={isAutoRotating}
              onAutoRotate={() => setIsAutoRotating(true)}
              focusedId={focusedId}
              onFocus={handleInteractiveFocus}
            />
          )
        ) : (
          <View
            style={[
              styles.searchIntro,
              layout.isCompact && styles.searchIntroCompact,
              { marginTop: layout.isMobile ? 132 : layout.isTablet ? 146 : 154 },
            ]}
          >
            <Text style={[styles.searchIntroTitle, layout.isCompact && styles.searchIntroTitleCompact]}>
              Busca Global
            </Text>
            <Text style={[styles.searchIntroSubtitle, layout.isCompact && styles.searchIntroSubtitleCompact]}>
              {isSearchIdle
                ? 'Digite no campo de busca para encontrar filmes, series e canais.'
                : `${searchResultsCount} resultado${searchResultsCount === 1 ? '' : 's'} encontrado${searchResultsCount === 1 ? '' : 's'} para "${searchQuery}".`}
            </Text>
          </View>
        )}

        {/* Dynamic Media Rows or Live TV Grid */}
        <View
          style={[
            styles.categoriesContainer,
            (isSearchMode || activeFilter === 'live') && styles.searchCategoriesContainer,
            layout.isCompact && styles.categoriesContainerCompact,
            activeFilter === 'live' && layout.isDesktop && { marginTop: 0, paddingTop: 0, paddingBottom: 0 }
          ]}
        >
          {loading && allCategories.length === 0 ? (
            // Show Skeletons on initial load
            [1, 2, 3].map((i) => (
              <CategoryRowSkeleton key={i} layout={layout} />
            ))
          ) : activeFilter === 'live' && layout.isDesktop ? (
            <Suspense fallback={<View style={{ height: 400, flex: 1, backgroundColor: '#111', borderRadius: 20 }} />}>
              <LiveTVGrid 
                categories={allCategories} 
                layout={layout}
                onPlayFull={handleMediaPress}
              />
            </Suspense>
          ) : isSearchIdle ? (
            <View style={[styles.emptyContainer, layout.isCompact && styles.emptyContainerCompact]}>
              <Text style={[styles.emptyText, layout.isCompact && styles.emptyTextCompact]}>
                Digite algo para comecar a busca.
              </Text>
            </View>
          ) : isSearchMode && filteredCategories.length === 0 ? (
            <View style={[styles.emptyContainer, layout.isCompact && styles.emptyContainerCompact]}>
              <Text style={[styles.emptyText, layout.isCompact && styles.emptyTextCompact]}>
                Nenhum resultado encontrado para sua busca.
              </Text>
            </View>
          ) : filteredCategories.length === 0 ? (
            <View style={[styles.emptyContainer, layout.isCompact && styles.emptyContainerCompact]}>
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
                onSeeAll={handleSeeAll}
              />
            ))
          )}
        </View>
      </ScrollView>
      )}

      {/* Header Branding - Overlays the ScrollView */}
      {!hasVisiblePinnedPlayer && !isMobileLiveBrowser && (
        <View
          style={[
            styles.header,
            layout.isCompact && styles.headerCompact,
            {
              height: layout.isCompact ? (isSearchMode ? 172 : 118) : 120,
              paddingTop: layout.topHeaderPadding,
              paddingLeft: layout.isDesktop ? layout.sideRailWidth : layout.horizontalPadding,
              paddingRight: layout.horizontalPadding,
              pointerEvents: 'none' as any,
            },
          ]}
        >
        <Text
          style={[
            styles.logo,
            layout.isCompact && styles.logoCompact,
            activeFilter === 'live' && layout.isDesktop && { opacity: 0, height: 0, width: 0, overflow: 'hidden' },
            { fontSize: layout.isMobile ? 30 : layout.isTablet ? 40 : 56 },
          ]}
        >
          XANDEFLIX
        </Text>

        <View
          style={[
            styles.headerRight,
            layout.isCompact && styles.headerRightCompact,
            { pointerEvents: 'auto' as any },
          ]}>
          {isSearchMode && (
            <View style={[styles.searchBar, layout.isCompact && styles.searchBarCompact]}>
              <View style={styles.searchIconWrap}>
                <Search size={18} color="rgba(255,255,255,0.45)" />
              </View>
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Buscar filmes, series e canais..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery ? (
                <TouchableHighlight
                  onPress={() => setSearchQuery('')}
                  underlayColor="rgba(255,255,255,0.08)"
                  style={styles.clearSearchButton}
                >
                  <View style={styles.clearSearchButtonInner}>
                    <X size={16} color="rgba(255,255,255,0.8)" />
                  </View>
                </TouchableHighlight>
              ) : null}
            </View>
          )}

        {/* Playlist Status Feedback */}
        {(isUsingMock || playlistError) && (
          <View style={[styles.mockControls, layout.isCompact && styles.mockControlsCompact]}>
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
          <View style={[styles.mockControls, layout.isCompact && styles.mockControlsCompact]}>
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
      </View>
      )}

      {/* Overlays */}
      <AnimatePresence>
        {isDetailsVisible && detailsMedia && (
          <Suspense fallback={null}>
            <MediaDetailsPage
              key={detailsMedia.id}
              media={detailsMedia}
              onClose={() => navigateBackInApp(() => {
                setIsDetailsVisible(false);
                setDetailsMedia(null);
              })}
              onPlay={handlePlay}
              onSelectMedia={setDetailsMedia}
            />
          </Suspense>
        )}
      </AnimatePresence>



      {/* ── Fullscreen player overlay ── */}
      <AnimatePresence>
        {activeVideoUrl && !isBrowsing && !isMobileLiveBrowser && (
          <Suspense fallback={null}>
            <VideoPlayer 
              ref={activePlayerRef}
              key={activeVideoUrl}
              url={activeVideoUrl} 
              mediaType={videoType || 'live'}
              media={playingMedia}
              nextEpisode={nextEpisode}
              onPlayNextEpisode={nextEpisode ? () => handlePlay(nextEpisode) : undefined}
              onClose={() => navigateBackInApp(closeActivePlayer)}
              isMinimized={false}
              onToggleMinimize={handleToggleMinimize}
              channelBrowserCategories={playingMedia?.type === 'live' ? liveChannelCategories : undefined}
              onPictureInPictureChange={handlePictureInPictureChange}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gridCategory && (
          <Suspense fallback={null}>
            <CategoryGridView 
              category={gridCategory}
              onClose={() => navigateBackInApp(() => setGridCategory(null))}
              onSelectMedia={(media) => {
                setGridCategory(null);
                handleMediaPress(media);
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <SettingsModal
        isVisible={isSettingsVisible}
        onClose={() => navigateBackInApp(() => setIsSettingsVisible(false))}
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
    minHeight: 0,
  },
  scrollContent: {
    paddingLeft: 120, // Space for SideMenu
    paddingRight: 60,
    paddingTop: 0,
    paddingBottom: 100,
  },
  scrollContentCompact: {
    paddingBottom: 28,
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 100,
    backgroundColor: 'transparent',
  } as any,
  headerCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 14,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 12,
    paddingRight: 40,
  },
  headerRightCompact: {
    width: '100%',
    alignItems: 'stretch',
    paddingRight: 0,
    gap: 10,
  },
  logo: {
    fontSize: 56,
    fontWeight: '900',
    color: '#E50914',
    fontStyle: 'italic',
    letterSpacing: -3,
    fontFamily: 'Outfit',
  },
  logoCompact: {
    letterSpacing: -1.5,
  },
  mockControls: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12,
    flexWrap: 'wrap',
    paddingRight: 40,
  },
  mockControlsCompact: {
    width: '100%',
    gap: 10,
    paddingRight: 0,
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
  searchBar: {
    width: 440,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7,7,7,0.9)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
  },
  searchBarCompact: {
    width: '100%',
    minHeight: 50,
  },
  searchIconWrap: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: 'white',
    fontSize: 16,
    fontFamily: 'Outfit',
    paddingHorizontal: 8,
  },
  clearSearchButton: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  clearSearchButtonInner: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIntro: {
    marginTop: 154,
    paddingBottom: 20,
  },
  searchIntroCompact: {
    paddingBottom: 12,
  },
  searchIntroTitle: {
    color: 'white',
    fontSize: 34,
    fontWeight: '900',
    fontFamily: 'Outfit',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  searchIntroTitleCompact: {
    fontSize: 24,
    letterSpacing: 1,
  },
  searchIntroSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    marginTop: 10,
    fontFamily: 'Outfit',
  },
  searchIntroSubtitleCompact: {
    fontSize: 14,
    lineHeight: 21,
  },
  categoriesContainer: {
    marginTop: 36,
    zIndex: 20,
    overflow: 'visible',
  },
  categoriesContainerCompact: {
    marginTop: 20,
  },
  searchCategoriesContainer: {
    marginTop: 12,
  },
  emptyContainer: {
    padding: 100, 
    alignItems: 'center',
  },
  emptyContainerCompact: {
    paddingHorizontal: 16,
    paddingVertical: 56,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)', 
    fontSize: 24, 
    fontWeight: 'bold',
    fontFamily: 'Outfit',
  },
  emptyTextCompact: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 26,
  },
});

export default HomeScreen;
