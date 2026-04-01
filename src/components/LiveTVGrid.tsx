import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableHighlight, Image, Dimensions, FlatList, ListRenderItem } from 'react-native';
import { Radio, ChevronRight, Play, Maximize2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Category, Media } from '../types';
import { VideoPlayer } from './VideoPlayer';

interface LiveTVGridProps {
  categories: Category[];
  onPlayFull: (media: Media) => void;
  layout: any;
  externalMedia?: Media | null;
  isGlobalPlayerActive?: boolean;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const LiveTVGrid: React.FC<LiveTVGridProps> = ({ categories, onPlayFull, layout, externalMedia, isGlobalPlayerActive }) => {
  const liveCategories = useMemo(() => 
    categories.filter(c => c.type === 'live' && c.items.length > 0), 
    [categories]
  );

  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<Media | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Sincronizar com media externa (vindo de "minimizar" o player global)
  useEffect(() => {
    if (externalMedia) {
      setPreviewMedia(externalMedia);
      setSelectedMediaId(externalMedia.id);
      
      // Auto selecionar a categoria
      const catId = liveCategories.find(c => c.items.some(i => i.id === externalMedia.id))?.id;
      if (catId) setSelectedCatId(catId);
    }
  }, [externalMedia, liveCategories]);

  const currentCategory = useMemo(() => 
    liveCategories.find(c => c.id === selectedCatId),
    [liveCategories, selectedCatId]
  );

  const filteredItems = useMemo(() => {
    if (!currentCategory) return [];
    if (!searchQuery.trim()) return currentCategory.items;
    return currentCategory.items.filter(i => 
      i.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [currentCategory, searchQuery]);

  const openFullScreen = (media: Media) => {
    onPlayFull(media);
  };

  const handleMediaClick = (media: Media) => {
    if (selectedMediaId === media.id) {
      // Second click: Full screen
      openFullScreen(media);
    } else {
      // First click: Preview
      setSelectedMediaId(media.id);
      setPreviewMedia(media);
    }
  };

  if (liveCategories.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Nenhum canal ao vivo encontrado.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Groups Column */}
      <View style={styles.groupsColumn}>
        <View style={styles.columnHeader}>
          <Radio size={20} color="#E50914" />
          <Text style={styles.columnTitle}>GRUPOS</Text>
        </View>
        <FlatList
          data={liveCategories}
          keyExtractor={cat => cat.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          removeClippedSubviews={true}
          initialNumToRender={20}
          renderItem={({ item: cat }) => (
            <TouchableHighlight
              key={cat.id}
              onPress={() => {
                setSelectedCatId(cat.id);
                setSearchQuery('');
              }}
              underlayColor="rgba(255,255,255,0.05)"
              style={[
                styles.groupItem,
                selectedCatId === cat.id && styles.groupItemActive
              ]}
            >
              <View style={styles.groupItemInner}>
                <Text style={[styles.groupText, selectedCatId === cat.id && styles.groupTextActive]}>
                  {cat.title}
                </Text>
                <Text style={styles.itemCount}>{cat.items.length}</Text>
                {selectedCatId === cat.id && <ChevronRight size={16} color="#E50914" />}
              </View>
            </TouchableHighlight>
          )}
        />
      </View>

      {/* Channels Column */}
      <View style={styles.channelsColumn}>
        <View style={styles.columnHeader}>
          <View style={styles.searchContainer}>
            <Search size={16} color="rgba(255,255,255,0.4)" />
            <input 
              style={styles.searchInput}
              placeholder="Buscar canal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </View>
        </View>
        <FlatList
          data={filteredItems}
          keyExtractor={media => media.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          removeClippedSubviews={true}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          renderItem={({ item: media }) => (
            <TouchableHighlight
              key={media.id}
              onPress={() => handleMediaClick(media)}
              underlayColor="rgba(255,255,255,0.05)"
              style={[
                styles.channelItem,
                selectedMediaId === media.id && styles.channelItemActive
              ]}
            >
              <View style={styles.channelItemInner}>
                <View style={styles.itemThumbnailContainer}>
                  <Image source={{ uri: media.thumbnail }} style={styles.itemThumbnail} />
                  {selectedMediaId === media.id && (
                    <View style={styles.playingIndicator}>
                      <View style={styles.pulse} />
                    </View>
                  )}
                </View>
                <View style={styles.channelInfo}>
                  <Text style={[styles.channelTitle, selectedMediaId === media.id && styles.channelTitleActive]} numberOfLines={1}>
                    {media.title}
                  </Text>
                  <Text style={styles.channelSubtitle} numberOfLines={1}>
                    {media.category}
                  </Text>
                </View>
              </View>
            </TouchableHighlight>
          )}
        />
      </View>

      {/* Preview Player Section */}
      <View style={styles.playerSection}>
        <AnimatePresence mode="wait">
          {previewMedia && !isGlobalPlayerActive ? (
            <motion.div
              key={previewMedia.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <View style={styles.previewContainer}>
                <TouchableHighlight 
                  onPress={() => openFullScreen(previewMedia)}
                  style={styles.playerWrapper}
                >
                   <VideoPlayer 
                     url={previewMedia.videoUrl} 
                     mediaType="live"
                     media={previewMedia}
                     onClose={() => setPreviewMedia(null)}
                     isMinimized={false}
                     isPreview={true}
                   />
                </TouchableHighlight>
                {/* Floating info for a cleaner look when borderless */}
                <View style={styles.previewInfoFloating}>
                   <View style={{ flex: 1 }}>
                     <Text style={styles.previewTitleSmall}>{previewMedia.title}</Text>
                   </View>
                   <TouchableHighlight
                     onPress={() => openFullScreen(previewMedia)}
                     underlayColor="#B91C1C"
                     style={styles.fullScreenBtnSmall}
                   >
                     <View style={styles.fullScreenBtnInner}>
                       <Maximize2 size={16} color="white" />
                       <Text style={styles.fullScreenTextSmall}>TELA CHEIA</Text>
                     </View>
                   </TouchableHighlight>
                </View>
              </View>
            </motion.div>
          ) : (
            <View style={styles.playerPlaceholder}>
              <View style={styles.placeholderIconContainer}>
                <Radio size={64} color="rgba(255,255,255,0.05)" />
              </View>
              <Text style={styles.placeholderText}>Selecione um canal para visualizar</Text>
            </View>
          )}
        </AnimatePresence>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: SCREEN_HEIGHT,
    backgroundColor: 'transparent',
    gap: 1,
    overflow: 'hidden',
  },
  groupsColumn: {
    width: 260,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
  },
  channelsColumn: {
    width: 320,
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
  },
  playerSection: {
    flex: 1,
    padding: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  columnHeader: {
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: 10,
  },
  columnTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'Outfit',
  },
  groupItem: {
    paddingHorizontal: 16,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
  },
  groupItemActive: {
    backgroundColor: 'rgba(229,9,20,0.1)',
  },
  groupItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  groupText: {
    flex: 1,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit',
  },
  groupTextActive: {
    color: 'white',
  },
  itemCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: 'white',
    fontSize: 14,
    fontFamily: 'Outfit',
    outlineStyle: 'none',
  } as any,
  channelItem: {
    paddingHorizontal: 16,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 10,
  },
  channelItemActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  channelItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 16,
  },
  itemThumbnailContainer: {
    width: 48,
    aspectRatio: '1/1',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  itemThumbnail: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  channelInfo: {
    flex: 1,
    gap: 4,
  },
  channelTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  channelTitleActive: {
    color: '#3B82F6',
  },
  channelSubtitle: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontFamily: 'Outfit',
  },
  playingIndicator: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(229,9,20,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E50914',
    shadowColor: '#E50914',
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  previewContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  playerWrapper: {
    width: '100%',
    flex: 1,
    backgroundColor: '#000',
  },
  playerPlaceholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    backgroundColor: '#000',
  },
  placeholderIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.02)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 100,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 18,
  },
  previewInfoFloating: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(10px)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  } as any,
  previewTitleSmall: {
    fontSize: 18,
    fontWeight: '800',
    color: 'white',
    fontFamily: 'Outfit',
  },
  fullScreenBtnSmall: {
    backgroundColor: '#E50914',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  fullScreenTextSmall: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: 'Outfit',
  },
  fullScreenBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
