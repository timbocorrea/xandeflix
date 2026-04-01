import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableHighlight, Image, TextInput } from 'react-native';
import { X, Search, LayoutGrid, Star, Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { Category, Media } from '../types';
import { useTMDB } from '../hooks/useTMDB';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useStore } from '../store/useStore';

interface GridItemProps {
  item: Media;
  onPress: (media: Media) => void;
  index: number;
  cardWidth: number;
  isCompact: boolean;
}

const GridItem = React.memo(({ item, onPress, index, cardWidth, isCompact }: GridItemProps) => {
  const { data: tmdbData, loading: tmdbLoading } = useTMDB(item.title, item.type);
  const [imgError, setImgError] = useState(false);
  const favorites = useStore((state) => state.favorites);
  const isFavorite =
    favorites.includes(item.videoUrl || `media:${item.id}`) ||
    favorites.includes(item.id);

  // Strategy "Efeito Pulo": Hide unlisted items without covers (excluding live channels)
  const isLiveChannel = item.type === 'live';
  const hasNoCover = !item.thumbnail && !tmdbData?.thumbnail;
  
  if (!isLiveChannel && hasNoCover && !tmdbLoading) {
    return null;
  }

  const fallbackImg = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=400&auto=format&fit=crop';
  const targetImage = tmdbData?.thumbnail || item.thumbnail;
  const displayImage = imgError || !targetImage ? fallbackImg : targetImage;

  const displayMode = (tmdbData?.thumbnail || imgError || !targetImage) ? 'cover' : 'contain';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(0.5, index * 0.02) }}
      style={{ width: cardWidth }}
    >
      <TouchableHighlight
        onPress={() => onPress(item)}
        underlayColor="transparent"
        style={styles.cardContainer}
        className="media-card-transition group"
      >
        <View style={styles.cardInner}>
          <Image
            source={{ uri: displayImage }}
            style={styles.thumbnail}
            resizeMode={displayMode}
            onError={() => setImgError(true)}
          />
          {isFavorite && (
            <View style={styles.favoriteBadge}>
              <Heart size={13} color="#ffffff" fill="#E50914" />
            </View>
          )}
          <View style={styles.overlay}>
            <Text style={[styles.cardTitle, isCompact && styles.cardTitleCompact]} numberOfLines={2}>
              {item.title}
            </Text>
            {tmdbData?.rating && (
              <View style={styles.ratingBadge}>
                <Star size={10} color="#EAB308" fill="#EAB308" />
                <Text style={styles.ratingText}>{tmdbData.rating}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableHighlight>
    </motion.div>
  );
});

interface CategoryGridViewProps {
  category: Category;
  onClose: () => void;
  onSelectMedia: (media: Media) => void;
}

export const CategoryGridView: React.FC<CategoryGridViewProps> = ({ category, onClose, onSelectMedia }) => {
  const [search, setSearch] = useState('');
  const layout = useResponsiveLayout();

  const filteredItems = useMemo(() => {
    if (!search) return category.items;
    return category.items.filter((item) =>
      item.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [category.items, search]);

  const columns = layout.isMobile ? 2 : layout.isTablet ? 4 : 6;
  const gridGap = layout.isMobile ? 12 : 16;
  const contentPadding = layout.isMobile ? 16 : layout.isTablet ? 24 : 40;
  const availableWidth = layout.width - (layout.isDesktop ? 80 : 0) - (contentPadding * 2) - (gridGap * (columns - 1));
  const cardWidth = Math.max(layout.isMobile ? 136 : 148, Math.floor(availableWidth / columns));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        top: 0,
        left: layout.isDesktop ? 80 : 0,
        right: 0,
        bottom: 0,
        zIndex: 500,
        backgroundColor: '#050505',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <View
        style={[
          styles.header,
          layout.isCompact && styles.headerCompact,
          {
            paddingHorizontal: contentPadding,
            paddingTop: layout.isMobile ? 20 : 26,
          },
        ]}
      >
        <View style={[styles.headerTopRow, layout.isCompact && styles.headerTopRowCompact]}>
          <View style={styles.headerLeft}>
            <View>
              <LayoutGrid size={layout.isMobile ? 24 : 32} color="#E50914" />
            </View>
            <View style={{ marginLeft: layout.isMobile ? 12 : 16 }}>
              <Text style={[styles.categoryTitle, layout.isCompact && styles.categoryTitleCompact]}>
                {category.title}
              </Text>
              <Text style={[styles.categorySubtitle, layout.isCompact && styles.categorySubtitleCompact]}>
                {category.items.length} conteudos encontrados
              </Text>
            </View>
          </View>

          <TouchableHighlight
            onPress={onClose}
            underlayColor="rgba(255,255,255,0.1)"
            style={styles.closeButton}
          >
            <View style={styles.closeButtonInner}>
              <X size={layout.isMobile ? 24 : 32} color="white" />
            </View>
          </TouchableHighlight>
        </View>

        <View style={[styles.searchContainer, layout.isCompact && styles.searchContainerCompact]}>
          <View>
            <Search size={layout.isMobile ? 18 : 20} color="rgba(255,255,255,0.4)" />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar nesta categoria..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
      </View>

      <FlatList
        style={styles.gridRoot}
        contentContainerStyle={[styles.gridContent, { padding: contentPadding }]}
        data={filteredItems}
        renderItem={({ item, index }) => (
          <GridItem
            item={item}
            onPress={onSelectMedia}
            index={index}
            cardWidth={cardWidth}
            isCompact={layout.isCompact}
          />
        )}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        key={`grid-${columns}`}
        columnWrapperStyle={[styles.gridColumnWrapper, { gap: gridGap, marginBottom: gridGap }]}
        showsVerticalScrollIndicator
        initialNumToRender={layout.isMobile ? 10 : 18}
        maxToRenderPerBatch={layout.isMobile ? 8 : 12}
        windowSize={layout.isMobile ? 4 : 5}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhum conteudo combina com sua busca.</Text>
          </View>
        )}
        ListFooterComponent={() => <View style={{ height: layout.isMobile ? 120 : 100 }} />}
      />
    </motion.div>
  );
};

const styles = StyleSheet.create({
  header: {
    minHeight: 120,
    backgroundColor: '#050505',
    justifyContent: 'center',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerCompact: {
    minHeight: 0,
    paddingBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTopRowCompact: {
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: 'white',
    fontFamily: 'Outfit',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  categoryTitleCompact: {
    fontSize: 22,
    letterSpacing: 0.5,
  },
  categorySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  categorySubtitleCompact: {
    fontSize: 12,
    letterSpacing: 1.2,
  },
  searchContainer: {
    width: '100%',
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 18,
    paddingHorizontal: 16,
  },
  searchContainerCompact: {
    marginTop: 0,
    height: 48,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: 'white',
    fontSize: 16,
    paddingHorizontal: 16,
    fontFamily: 'Outfit',
  },
  closeButton: {
    padding: 12,
    borderRadius: 50,
  },
  closeButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridRoot: {
    flex: 1,
  },
  gridContent: {
    padding: 40,
  },
  gridColumnWrapper: {
    justifyContent: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  cardContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.05)',
  } as any,
  cardInner: {
    width: '100%',
    height: '100%',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  favoriteBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  cardTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Outfit',
  },
  cardTitleCompact: {
    fontSize: 12,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  ratingText: {
    color: '#EAB308',
    fontSize: 10,
    fontWeight: '900',
  },
  emptyContainer: {
    padding: 100,
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 18,
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
});
