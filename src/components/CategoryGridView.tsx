import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableHighlight, Image, Dimensions, TextInput } from 'react-native';
import { X, Search, LayoutGrid, Play, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Category, Media } from '../types';
import { useTMDB } from '../hooks/useTMDB';

interface GridItemProps {
  item: Media;
  onPress: (media: Media) => void;
  index: number;
}

const GridItem = React.memo(({ item, onPress, index }: GridItemProps) => {
  const { data: tmdbData } = useTMDB(item.title, item.type);
  const [imgError, setImgError] = useState(false);

  const displayImage = imgError 
    ? 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=400&auto=format&fit=crop'
    : (tmdbData?.thumbnail || item.thumbnail);
  
  const displayMode = (tmdbData?.thumbnail || imgError) ? 'cover' : 'contain';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(0.5, index * 0.02) }}
      style={{ flex: 1, minWidth: '15.5%', margin: 8 }}
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
          <View style={styles.overlay}>
             <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
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
  
  const filteredItems = useMemo(() => {
    if (!search) return category.items;
    return category.items.filter(item => 
      item.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [category.items, search]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        top: 0,
        left: 80,
        right: 0,
        bottom: 0,
        zIndex: 500,
        backgroundColor: '#050505',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Grid Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View>
            <LayoutGrid size={32} color="#E50914" />
          </View>
          <View style={{ marginLeft: 16 }}>
            <Text style={styles.categoryTitle}>{category.title}</Text>
            <Text style={styles.categorySubtitle}>{category.items.length} conteúdos encontrados</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <View style={{ marginLeft: 16 }}>
            <Search size={20} color="rgba(255,255,255,0.4)" />
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

        <TouchableHighlight
          onPress={onClose}
          underlayColor="rgba(255,255,255,0.1)"
          style={styles.closeButton}
        >
          <View style={styles.closeButtonInner}>
            <X size={32} color="white" />
          </View>
        </TouchableHighlight>
      </View>

      {/* Grid Content */}
      <FlatList 
        style={styles.gridRoot}
        contentContainerStyle={styles.gridContent}
        data={filteredItems}
        renderItem={({ item, index }) => (
          <GridItem 
            item={item} 
            onPress={onSelectMedia} 
            index={index}
          />
        )}
        keyExtractor={(item) => item.id}
        numColumns={6}
        columnWrapperStyle={styles.gridColumnWrapper}
        showsVerticalScrollIndicator={true}
        removeClippedSubviews={true}
        initialNumToRender={18} // 3 rows
        maxToRenderPerBatch={12} // 2 rows
        windowSize={5}
        ListEmptyComponent={() => (
           <View style={styles.emptyContainer}>
             <Text style={styles.emptyText}>Nenhum conteúdo combina com sua busca.</Text>
           </View>
        )}
        ListFooterComponent={() => <View style={{ height: 100 }} />}
      />
    </motion.div>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 120,
    backgroundColor: '#050505',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
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
  categorySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  searchContainer: {
    width: 400,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
    width: (Dimensions.get('window').width - 400) / 6, // Approximate calculation for 6 cols minus sidebar/padding
    aspectRatio: 2/3,
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
  }
});
