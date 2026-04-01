import React from 'react';
import { View, Text, StyleSheet, TouchableHighlight, Image, FlatList, Pressable, Platform } from 'react-native';
import { Category, Media } from '../types';
import { useTMDB } from '../hooks/useTMDB';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useStore } from '../store/useStore';
import { ChevronLeft, ChevronRight, LayoutGrid, Heart } from 'lucide-react';

interface MediaItemProps {
  item: Media;
  rowIndex: number;
  index: number;
  isFocused: boolean;
  cardWidth: number;
  cardHeight: number;
  cardGap: number;
  isCompact: boolean;
  onFocus: (media: Media, id: string) => void;
  isAdultContent?: boolean;
  onPress: (media: Media) => void;
}

const MediaItem = React.memo(({
  item,
  rowIndex,
  index,
  isFocused,
  cardWidth,
  cardHeight,
  cardGap,
  isCompact,
  isAdultContent = false,
  onFocus,
  onPress,
}: MediaItemProps) => {
  const navId = `item-${rowIndex}-${index}`;
  const layout = useResponsiveLayout();
  const [brokenImageUri, setBrokenImageUri] = React.useState<string | null>(null);
  const { data: tmdbData, loading: tmdbLoading } = useTMDB(item.title, item.type);
  const [isHovered, setIsHovered] = React.useState(false);
  const playbackProgress = useStore((state) => state.playbackProgress);
  const favorites = useStore((state) => state.favorites);
  const toggleFavorite = useStore((state) => state.toggleFavorite);
  const isFavorite = favorites.includes(item.id);
  
  // Strategy "Efeito Pulo": Hide unlisted items without covers (excluding live channels)
  const isLiveChannel = item.type === 'live';
  const hasNoCover = !item.thumbnail && !tmdbData?.thumbnail;
  
  if (!isLiveChannel && hasNoCover && !tmdbLoading) {
    return null;
  }
  
  const showMetadata = isFocused || (isHovered && !layout.isMobile);

  // High-quality fallback if thumbnail domain (like xvbroker.click) is down
  const fallbackImg = `https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=400&auto=format&fit=crop`;
  const adultPlaceholderImg = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop`; // Abstract dark texture
  
  // Se for categoria adulta, NÃO CARREGA a imagem original no dashboard principal para não pesar (e proteger o usuário)
  const targetImage = isAdultContent ? null : (tmdbData?.thumbnail || item.thumbnail);
  const isBroken = targetImage && brokenImageUri === targetImage;
  const displayImage = isAdultContent ? adultPlaceholderImg : (isBroken ? fallbackImg : targetImage);
  
  // Use cover for beautiful 2:3 tmdb posters, but contain for random 16:9 IPTV logos to avoid heavy cropping 
  const displayMode = (tmdbData?.thumbnail || isBroken) ? 'cover' : 'contain';

  const progress = playbackProgress[item.id];
  const percentComplete = progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : 0;

  return (
    <TouchableHighlight
      onFocus={() => onFocus(item, navId)}
      onPress={() => onPress(item)}
      // @ts-ignore - Web only
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      underlayColor="transparent"
      style={[
        styles.cardContainer,
        {
          width: cardWidth,
          height: cardHeight,
          marginRight: cardGap,
        },
        (isFocused || isHovered) && styles.cardFocused
      ]}
      // @ts-ignore
      className={`media-card-transition ${isFocused || isHovered ? 'cardFocused' : 'cardContainer'}`}
    >
      <View style={styles.cardInner}>
        <Image 
          source={{ uri: displayImage }} 
          style={styles.thumbnail}
          resizeMode={displayMode}
          // @ts-ignore
          loading="lazy"
          onError={() => {
            if (targetImage) setBrokenImageUri(targetImage);
          }}
        />
        <View style={styles.placeholder} />
        
        {showMetadata && (
          <View style={styles.cardOverlay}>
            <View style={[styles.overlayInner, isCompact && styles.overlayInnerCompact]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Text style={[styles.cardTitle, isCompact && styles.cardTitleCompact, { flex: 1 }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Pressable 
                  // @ts-ignore
                  onPress={(e) => { 
                    e.stopPropagation(); 
                    toggleFavorite(item.id); 
                  }}
                  style={({ hovered }) => [
                    styles.favoriteButton,
                    hovered && { transform: 'scale(1.15)', backgroundColor: 'rgba(255,255,255,0.1)' }
                  ]}
                >
                  <Heart 
                    fill={isFavorite ? '#E50914' : 'transparent'} 
                    color={isFavorite ? '#E50914' : 'white'} 
                    size={isCompact ? 18 : 22} 
                    strokeWidth={isFavorite ? 0 : 2}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Progress Bar Indicator */}
        {percentComplete > 0 && (
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <View style={{ height: '100%', backgroundColor: '#E50914', width: `${Math.min(100, percentComplete)}%` }} />
          </View>
        )}
      </View>
    </TouchableHighlight>
  );
});

interface CategoryRowProps {
  category: Category;
  rowIndex: number;
  focusedId: string | null;
  onMediaFocus: (media: Media, id: string) => void;
  onMediaPress: (media: Media) => void;
  onSeeAll: (category: Category) => void;
}

export const CategoryRow: React.FC<CategoryRowProps> = React.memo(({ 
  category, 
  rowIndex, 
  focusedId, 
  onMediaFocus, 
  onMediaPress,
  onSeeAll
}) => {
  const flatListRef = React.useRef<FlatList>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const [scrollX, setScrollX] = React.useState(0);
  const layout = useResponsiveLayout();
  const cardWidth = layout.isMobile ? 148 : layout.isTablet ? 180 : 220;
  const cardHeight = Math.round(cardWidth * 1.5);
  const cardGap = layout.isMobile ? 14 : layout.isTablet ? 18 : 24;
  const scrollAmount = layout.isMobile ? cardWidth * 2.35 : layout.isTablet ? cardWidth * 2.8 : 800;
  const showNavButtons = layout.isDesktop && isHovered;

  const isAdultCategory = React.useMemo(() => {
    const titleUpper = category.title.toUpperCase();
    return titleUpper.includes('18+') || 
           titleUpper.includes('+18') || 
           titleUpper.includes('ADULT') || 
           titleUpper.includes('XXX') || 
           titleUpper.includes('HOT');
  }, [category.title]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!flatListRef.current) return;
    const newScrollX = direction === 'left' ? Math.max(0, scrollX - scrollAmount) : scrollX + scrollAmount;
    
    flatListRef.current.scrollToOffset({
      offset: newScrollX,
      animated: true
    });
    setScrollX(newScrollX);
  };

  // Refined auto-scroll logic for TV/Keyboard navigation
  React.useEffect(() => {
    if (focusedId && focusedId.startsWith(`item-${rowIndex}-`)) {
      const index = parseInt(focusedId.split('-')[2]);
      if (!isNaN(index) && flatListRef.current) {
        // On Web, browsers and TVs have native scrollIntoView logic. 
        // Programmatic scrollToIndex causes jumping when clicking with a mouse
        // because the smaller screen width might falsely flag it as a tablet/mobile.
        // We only enforce programmatic centering on native mobile/TV apps.
        if (Platform.OS !== 'web') {
          flatListRef.current.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.5 // Centers the item for TV remote navigation
          });
        }
      }
    }
  }, [focusedId, rowIndex]);

  return (
    <View 
      style={[styles.categoryRow, layout.isCompact && styles.categoryRowCompact]}
      // @ts-ignore - web only
      onMouseEnter={() => layout.isDesktop && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Pressable 
        onPress={() => onSeeAll(category)}
        style={({ hovered }) => [
          styles.titleContainer,
          layout.isCompact && styles.titleContainerCompact,
          hovered && { opacity: 1, transform: 'translateX(5px)' }
        ]}
      >
        <Text style={[styles.categoryTitle, layout.isCompact && styles.categoryTitleCompact]}>{category.title}</Text>
        <ChevronRight
          size={layout.isCompact ? 20 : 24}
          color="#E50914"
          style={{ marginLeft: 10, opacity: showNavButtons || layout.isCompact ? 1 : 0 }}
        />
      </Pressable>
      
      <View 
        style={styles.listWrapper}
        // @ts-ignore
        className="smooth-scroll-container"
      >
        <FlatList
          ref={flatListRef}
          horizontal
          data={category.items.slice(0, 20)}
          renderItem={({ item, index }) => (
            <MediaItem 
              item={item} 
              rowIndex={rowIndex} 
              index={index} 
              isFocused={focusedId === `item-${rowIndex}-${index}`}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              cardGap={cardGap}
              isCompact={layout.isCompact}
              isAdultContent={isAdultCategory}
              onFocus={onMediaFocus}
              onPress={onMediaPress}
            />
          )}
          ListFooterComponent={() => 
            category.items.length > 20 ? (
              <TouchableHighlight
                onFocus={() => onMediaFocus(category.items[0], `see-all-${rowIndex}`)}
                onPress={() => onSeeAll(category)}
                underlayColor="transparent"
                style={[
                  styles.seeAllCard,
                  {
                    width: cardWidth,
                    height: cardHeight,
                    marginRight: cardGap,
                  },
                  focusedId === `see-all-${rowIndex}` && styles.cardFocused
                ]}
                className="media-card-transition"
              >
                <View style={styles.seeAllInner}>
                   <LayoutGrid size={48} color="white" opacity={0.5} />
                   <Text style={styles.seeAllText}>VER TODOS</Text>
                   <Text style={styles.seeAllCount}>{category.items.length} itens</Text>
                </View>
              </TouchableHighlight>
            ) : null
          }
          keyExtractor={(item, idx) => `cat-${category.id}-item-${item.id}-${idx}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.flatListContent,
            layout.isCompact && styles.flatListContentCompact,
            { paddingRight: layout.isCompact ? 16 : 100 },
          ]}
          removeClippedSubviews={true}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={3}
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true
            });
          }}
          onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          // @ts-ignore
          className="carousel-flatlist"
        />

        {/* Carousel Navigation Arrows (Web only) */}
        {showNavButtons && scrollX > 10 && (
          <Pressable 
            style={[styles.navButton, styles.leftButton]}
            onPress={() => handleScroll('left')}
          >
            <ChevronLeft color="white" size={40} />
          </Pressable>
        )}

        {showNavButtons && category.items.length > 5 && (
          <Pressable 
            style={[styles.navButton, styles.rightButton]}
            onPress={() => handleScroll('right')}
          >
            <ChevronRight color="white" size={40} />
          </Pressable>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  categoryRow: {
    marginBottom: 44,
    paddingLeft: 4,
  },
  categoryRowCompact: {
    marginBottom: 28,
    paddingLeft: 0,
  },
  categoryTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: 'white',
    fontFamily: 'Outfit',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  categoryTitleCompact: {
    fontSize: 20,
    letterSpacing: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    // @ts-ignore
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  } as any,
  titleContainerCompact: {
    marginBottom: 16,
  },
  flatListContent: {
    paddingRight: 100,
    paddingVertical: 20,
  },
  flatListContentCompact: {
    paddingVertical: 12,
  },
  cardContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.05)',
    // @ts-ignore
    transition: 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
  } as any,
  cardFocused: {
    transform: 'scale(1.05) translateY(-5px)',
    zIndex: 10,
    borderColor: '#E50914',
    // @ts-ignore – web-only boxShadow
    boxShadow: '0 12px 30px rgba(229, 9, 20, 0.4)',
  } as any,
  cardInner: {
    width: '100%',
    height: '100%',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.02)',
    zIndex: -1,
  } as any,
  cardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  } as any,
  overlayInner: {
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  overlayInnerCompact: {
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  cardTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Outfit',
  },
  cardTitleCompact: {
    fontSize: 13,
  },
  listWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 45,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    // @ts-ignore
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
  } as any,
  leftButton: {
    left: 0,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  rightButton: {
    right: 0,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  seeAllCard: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  } as any,
  seeAllInner: {
    alignItems: 'center',
    gap: 12,
  },
  seeAllText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
    fontFamily: 'Outfit',
    letterSpacing: 1,
  },
  seeAllCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  favoriteButton: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    // @ts-ignore
    transition: 'all 0.2s ease',
  } as any,
});

//
