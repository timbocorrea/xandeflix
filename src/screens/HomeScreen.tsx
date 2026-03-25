import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, Animated, Dimensions, TouchableHighlight, Text } from 'react-native';
import { RotateCcw } from 'lucide-react';

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

  // Custom Hooks for Data & Filtering
  const { fetchPlaylist, loading } = usePlaylist();
  const { filteredCategories } = useMediaFilter();

  // Local UI State
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<'live' | 'movie' | 'series' | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  
  const scrollRef = useRef<ScrollView>(null);

  // Initial Data Fetch
  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  // Handle media selection/auto-rotation
  useEffect(() => {
    if (allCategories.length > 0 && !selectedMedia) {
      const homeCat = allCategories.find(c => c.items.length > 0);
      if (homeCat) setSelectedMedia(homeCat.items[0]);
    }
  }, [allCategories, selectedMedia, setSelectedMedia]);

  // Auto-rotation logic
  useEffect(() => {
    if (!isAutoRotating || activeFilter !== 'home' || allCategories.length === 0) return;

    const interval = setInterval(() => {
      const firstItems = allCategories.flatMap(c => c.items).slice(0, 10);
      if (firstItems.length === 0) return;
      
      const currentIndex = firstItems.findIndex(m => m.id === selectedMedia?.id);
      const nextIndex = (currentIndex + 1) % firstItems.length;
      setSelectedMedia(firstItems[nextIndex]);
    }, 12000);

    return () => clearInterval(interval);
  }, [isAutoRotating, activeFilter, allCategories, selectedMedia, setSelectedMedia]);

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
  const handlePlay = useCallback((media: Media) => {
    setActiveVideoUrl(media.videoUrl);
    setVideoType(media.type);
  }, []);

  const handleMenuSelect = useCallback((filter: string) => {
    useStore.getState().setActiveFilter(filter);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const handleSaveSettings = useCallback((url: string, newHiddenIds: string[]) => {
    setHiddenCategoryIds(newHiddenIds);
  }, [setHiddenCategoryIds]);

  return (
    <View style={styles.container}>
      <SideMenu onSelect={handleMenuSelect} activeId={activeFilter} onLogout={onLogout} />
      
      <ScrollView 
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Branding */}
        <View style={styles.header}>
          <Text style={styles.logo}>XANDEFLIX</Text>
          {isUsingMock && (
            <View style={styles.mockControls}>
              <View style={styles.mockBadge}>
                <Text style={styles.mockBadgeText}>MODO DEMO: LISTA NÃO CARREGADA</Text>
              </View>
              <TouchableHighlight
                onPress={() => fetchPlaylist()}
                underlayColor="rgba(255,255,255,0.1)"
                style={styles.retryButton}
              >
                <View style={styles.retryInner}>
                  <RotateCcw size={14} color="white" />
                  <Text style={styles.retryText}>Tentar Novamente</Text>
                </View>
              </TouchableHighlight>
            </View>
          )}
        </View>

        {/* Cinematic Hero */}
        <HeroSection 
          media={selectedMedia}
          onPlay={handlePlay}
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
                onMediaPress={handlePlay}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Overlays */}
      {activeVideoUrl && (
        <VideoPlayer 
          key={activeVideoUrl}
          url={activeVideoUrl} 
          mediaType={videoType || 'live'}
          onClose={() => setActiveVideoUrl(null)} 
        />
      )}

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
    paddingBottom: 100,
  },
  header: {
    height: 120,
    paddingTop: 40,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    zIndex: 100,
  },
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
    marginTop: -80, // Negative overlap with hero for better flow
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
