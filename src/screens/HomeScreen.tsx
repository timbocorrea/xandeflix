import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  Image, 
  TouchableHighlight, 
  ScrollView,
  Dimensions,
  ImageBackground
} from 'react-native';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Info, Star, Calendar, Clock, RotateCcw } from 'lucide-react';
import { MOCK_CATEGORIES } from '../mock/data';
import { Media, Category } from '../types';
import { VideoPlayer } from '../components/VideoPlayer';
import { SideMenu } from '../components/SideMenu';
import { SettingsModal } from '../components/SettingsModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface HomeScreenProps {
  onLogout?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onLogout }) => {
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>('hero-play');
  const [loading, setLoading] = useState(true);
  const [isUsingMock, setIsUsingMock] = useState(false);
  const [activeFilter, setActiveFilter] = useState('home');
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('xandeflix_hidden_categories');
    return saved ? JSON.parse(saved) : [];
  });
  const [playlistUrl, setPlaylistUrl] = useState(() => {
    return localStorage.getItem('xandeflix_playlist_url') || '';
  });
  const scrollRef = useRef<ScrollView>(null);

  const fetchPlaylist = useCallback(async (url: string) => {
    if (!url) return;
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      console.log('Fetching playlist from:', url);
      const apiUrl = `/api/playlist?url=${encodeURIComponent(url)}`;
      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        setAllCategories(data);
        setIsUsingMock(false);
      } else {
        console.warn('Playlist is empty, using mock data');
        setAllCategories(MOCK_CATEGORIES);
        setIsUsingMock(true);
      }
    } catch (error) {
      console.error('Error fetching playlist:', error);
      setAllCategories(MOCK_CATEGORIES);
      setIsUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaylist(playlistUrl);
  }, [fetchPlaylist, playlistUrl]);

  // Auto-rotation logic for Hero section
  useEffect(() => {
    if (!isAutoRotating || activeVideoUrl || isSettingsVisible || filteredCategories.length === 0) return;

    const interval = setInterval(() => {
      // Pick a random category that has items
      const categoriesWithItems = filteredCategories.filter(cat => cat.items.length > 0);
      if (categoriesWithItems.length === 0) return;

      const randomCatIdx = Math.floor(Math.random() * categoriesWithItems.length);
      const category = categoriesWithItems[randomCatIdx];
      
      // Pick a random item from that category
      const randomItemIdx = Math.floor(Math.random() * category.items.length);
      const nextMedia = category.items[randomItemIdx];
      
      // Only update if it's different to trigger animation
      if (nextMedia.id !== selectedMedia?.id) {
        setSelectedMedia(nextMedia);
      }
    }, 10000); // Rotate every 10 seconds

    return () => clearInterval(interval);
  }, [isAutoRotating, activeVideoUrl, isSettingsVisible, filteredCategories, selectedMedia]);

  // Effect to handle filtering when dependencies change
  useEffect(() => {
    if (allCategories.length === 0) return;

    let result = [...allCategories];
    
    // Always filter by hidden IDs
    result = result.filter(cat => !hiddenCategoryIds.includes(cat.id));

    if (activeFilter === 'home') {
      result.sort((a, b) => {
        const order: { [key: string]: number } = { 'live': 1, 'movie': 2, 'series': 3 };
        const typeA = a.type || 'live';
        const typeB = b.type || 'live';
        return (order[typeA] || 99) - (order[typeB] || 99);
      });
    } else if (activeFilter !== 'all' && activeFilter !== 'settings' && activeFilter !== 'search' && activeFilter !== 'mylist') {
      // Filter by type if a specific type is selected (live, movies, series)
      const typeMap: { [key: string]: string } = { 'live': 'live', 'movies': 'movie', 'series': 'series' };
      const targetType = typeMap[activeFilter];
      if (targetType) {
        result = result.filter(cat => cat.type === targetType);
      }
    }

    setFilteredCategories(result);
    
    // Set initial selected media if none is selected or if current is no longer visible
    if (!selectedMedia && result.length > 0 && result[0].items.length > 0) {
      setSelectedMedia(result[0].items[0]);
    }
  }, [allCategories, hiddenCategoryIds, activeFilter]);

  const handleSaveSettings = (newUrl: string, newHiddenIds: string[]) => {
    // Check if URL changed to decide if we need to re-fetch
    if (newUrl !== playlistUrl) {
      setPlaylistUrl(newUrl);
      localStorage.setItem('xandeflix_playlist_url', newUrl);
    }

    setHiddenCategoryIds(newHiddenIds);
    localStorage.setItem('xandeflix_hidden_categories', JSON.stringify(newHiddenIds));
  };

  const handleMenuSelect = (id: string) => {
    if (id === 'settings') {
      setIsSettingsVisible(true);
      return;
    }
    
    setActiveFilter(id);
    setFocusedId('hero-play');
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleMediaFocus = useCallback((media: Media, id: string) => {
    setSelectedMedia(media);
    setFocusedId(id);
  }, []);

  const handlePlay = (media: Media) => {
    setActiveVideoUrl(media.videoUrl);
    setVideoType(media.type);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 32, fontWeight: 'bold', color: 'white' }}>Carregando XANDEFLIX...</Text>
        <Text style={{ color: '#6B7280', marginTop: 16 }}>Extraindo biblioteca M3U8...</Text>
      </View>
    );
  }

  if (!selectedMedia) return null;

  const renderMediaItem = ({ item, index, rowIndex }: { item: Media; index: number; rowIndex: number }) => {
    const navId = `${rowIndex}-${index}`;
    const isFocused = focusedId === navId;

    return (
      <TouchableHighlight
        onFocus={() => handleMediaFocus(item, navId)}
        onPress={() => handlePlay(item)}
        // @ts-ignore - for web compatibility
        onClick={() => handlePlay(item)}
        underlayColor="transparent"
        style={[
          styles.cardContainer,
          isFocused && styles.cardFocused
        ]}
        // @ts-ignore - for web compatibility
        className="cursor-pointer"
      >
        <View style={styles.cardInner}>
          <Image 
            source={{ uri: item.thumbnail }} 
            style={styles.thumbnail}
            resizeMode="cover"
          />
          {isFocused && (
            <View style={styles.cardOverlay}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            </View>
          )}
        </View>
      </TouchableHighlight>
    );
  };

  const renderCategoryRow = (category: Category, rowIndex: number) => (
    <View key={category.id} style={styles.categoryRow}>
      <Text style={styles.categoryTitle}>{category.title}</Text>
      <FlatList
        horizontal
        data={category.items}
        renderItem={(props) => renderMediaItem({ ...props, rowIndex })}
        keyExtractor={(item, idx) => `${category.id}-${item.id}-${idx}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.flatListContent}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <SideMenu onSelect={handleMenuSelect} activeId={activeFilter} onLogout={onLogout} />
      
      {/* Hero Background */}
      <View style={[styles.heroBackground, { pointerEvents: 'none' } as any]}>
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedMedia.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <View 
              style={[styles.backdrop, { position: 'relative', width: '100%', height: '100%' }]}
              className="relative w-full h-full"
            >
              <ImageBackground 
                source={{ uri: selectedMedia.backdrop }} 
                style={styles.backdrop}
                resizeMode="cover"
              >
                <View 
                  className="hero-gradient-overlay"
                />
              </ImageBackground>
            </View>
          </motion.div>
        </AnimatePresence>
      </View>

      <View 
        style={[styles.scrollView, styles.scrollContent]} 
        className="main-scrollview"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>XANDEFLIX</Text>
          {isUsingMock && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={styles.mockBadge}>
                <Text style={styles.mockBadgeText}>MODO DEMO: LISTA NÃO CARREGADA</Text>
              </View>
              <TouchableHighlight
                onPress={() => fetchPlaylist(playlistUrl)}
                underlayColor="rgba(255,255,255,0.1)"
                style={styles.retryButton}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <RotateCcw size={14} color="white" />
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>Tentar Novamente</Text>
                </View>
              </TouchableHighlight>
            </View>
          )}
        </View>

        <View 
          style={styles.heroInfo}
        >
          <AnimatePresence mode="wait">
            {selectedMedia && (
              <motion.div
                key={selectedMedia.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Text style={styles.heroTitle}>{selectedMedia.title}</Text>
                
                <View style={styles.metaContainer}>
                  <View style={styles.metaItem}>
                    <Star size={18} color="#EAB308" fill="#EAB308" />
                    <Text style={styles.metaText}>{selectedMedia.rating}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Calendar size={18} color="#D1D5DB" />
                    <Text style={styles.metaText}>{selectedMedia.year}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Clock size={18} color="#D1D5DB" />
                    <Text style={styles.metaText}>{selectedMedia.duration}</Text>
                  </View>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{selectedMedia.category}</Text>
                  </View>
                </View>

                <Text style={styles.description} numberOfLines={3}>
                  {selectedMedia.description}
                </Text>

                <View style={styles.buttonContainer}>
                  <TouchableHighlight
                    onFocus={() => {
                      setFocusedId('hero-play');
                      setIsAutoRotating(false);
                    }}
                    onBlur={() => setIsAutoRotating(true)}
                    onPress={() => handlePlay(selectedMedia)}
                    // @ts-ignore - for web compatibility
                    onClick={() => handlePlay(selectedMedia)}
                    underlayColor="#f3f4f6"
                    style={[
                      styles.playButton,
                      focusedId === 'hero-play' && styles.buttonFocused
                    ]}
                    // @ts-ignore - for web compatibility
                    className="cursor-pointer"
                  >
                    <View style={styles.buttonInner}>
                      <Play size={24} color="black" fill="black" />
                      <Text style={styles.playButtonText}>Assistir Agora</Text>
                    </View>
                  </TouchableHighlight>

                  <TouchableHighlight
                    onFocus={() => {
                      setFocusedId('hero-info');
                      setIsAutoRotating(false);
                    }}
                    onBlur={() => setIsAutoRotating(true)}
                    underlayColor="rgba(255,255,255,0.3)"
                    style={[
                      styles.infoButton,
                      focusedId === 'hero-info' && styles.buttonFocused
                    ]}
                    // @ts-ignore - for web compatibility
                    className="cursor-pointer"
                  >
                    <View style={styles.buttonInner}>
                      <Info size={24} color="white" />
                      <Text style={styles.infoButtonText}>Mais Informações</Text>
                    </View>
                  </TouchableHighlight>
                </View>
              </motion.div>
            )}
          </AnimatePresence>
        </View>

        {/* Categories */}
        <View style={styles.categoriesContainer}>
          {filteredCategories.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontSize: 20, opacity: 0.6 }}>
                Nenhum conteúdo encontrado nesta categoria.
              </Text>
            </View>
          ) : activeFilter === 'home' ? (
            <>
              {/* Live Section */}
              {filteredCategories.some(c => c.type === 'live') && (
                <View style={styles.sectionWrapper}>
                  <Text style={styles.sectionHeader}>Canais ao Vivo</Text>
                  {filteredCategories.filter(c => c.type === 'live').map((category, idx) => renderCategoryRow(category, idx))}
                </View>
              )}

              {/* Movies Section */}
              {filteredCategories.some(c => c.type === 'movie') && (
                <View style={styles.sectionWrapper}>
                  <Text style={styles.sectionHeader}>Filmes</Text>
                  {filteredCategories.filter(c => c.type === 'movie').map((category, idx) => renderCategoryRow(category, idx + 100))}
                </View>
              )}

              {/* Series Section */}
              {filteredCategories.some(c => c.type === 'series') && (
                <View style={styles.sectionWrapper}>
                  <Text style={styles.sectionHeader}>Séries</Text>
                  {filteredCategories.filter(c => c.type === 'series').map((category, idx) => renderCategoryRow(category, idx + 200))}
                </View>
              )}
            </>
          ) : (
            filteredCategories.map((category, rowIndex) => renderCategoryRow(category, rowIndex))
          )}
        </View>
      </View>

      {/* Video Player Overlay */}
      {activeVideoUrl && (
        <VideoPlayer 
          key={activeVideoUrl}
          url={activeVideoUrl} 
          mediaType={videoType || 'live'}
          onClose={() => setActiveVideoUrl(null)} 
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isVisible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        onSave={handleSaveSettings}
        currentUrl={playlistUrl}
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
  heroBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.8,
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
    height: '100%',
  },
  scrollContent: {
    paddingTop: 60,
    paddingLeft: 120, // Increased to account for collapsed SideMenu
    paddingRight: 60,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 40,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  mockBadge: {
    backgroundColor: '#EAB308',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  mockBadgeText: {
    color: 'black',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  retryButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  logo: {
    fontSize: 56,
    fontWeight: '900',
    color: '#E50914',
    fontStyle: 'italic',
    letterSpacing: -3,
    fontFamily: 'Outfit',
  },
  heroInfo: {
    maxWidth: 900,
    marginBottom: 80,
    marginTop: 40,
  },
  heroTitle: {
    fontSize: 84,
    fontWeight: '900',
    color: 'white',
    marginBottom: 16,
    fontFamily: 'Outfit',
    letterSpacing: -2,
    lineHeight: 84,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  metaText: {
    color: '#D1D5DB',
    fontSize: 18,
    marginLeft: 6,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#6B7280',
    borderRadius: 4,
  },
  categoryText: {
    color: 'white',
    fontSize: 14,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 20,
    color: '#D1D5DB',
    lineHeight: 30,
    marginBottom: 32,
  },
  buttonContainer: {
    flexDirection: 'row',
  },
  playButton: {
    backgroundColor: 'white',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 16,
  },
  infoButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButtonText: {
    color: 'black',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  infoButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  buttonFocused: {
    transform: 'scale(1.05)' as any,
    borderWidth: 3,
    borderColor: '#E50914',
  },
  categoriesContainer: {
    marginTop: 20,
  },
  sectionWrapper: {
    marginBottom: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 20,
  },
  sectionHeader: {
    fontSize: 38,
    fontWeight: '900',
    color: 'white',
    marginBottom: 32,
    paddingLeft: 8,
    textTransform: 'uppercase',
    letterSpacing: 4,
    fontFamily: 'Outfit',
    opacity: 0.9,
  },
  categoryRow: {
    marginBottom: 60,
  },
  categoryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 20,
    paddingLeft: 8,
    fontFamily: 'Inter',
    letterSpacing: 1,
  },
  flatListContent: {
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
  cardContainer: {
    width: 340,
    aspectRatio: 16 / 9,
    marginRight: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardFocused: {
    transform: 'scale(1.08)' as any,
    zIndex: 10,
    borderColor: '#E50914',
    borderWidth: 3,
    boxShadow: '0 0 20px #E50914' as any,
  },
  cardInner: {
    flex: 1,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
  },
  cardTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
