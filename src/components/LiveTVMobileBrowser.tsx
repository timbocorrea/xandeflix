import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableHighlight, Image, TextInput } from 'react-native';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Play, Radio, Search } from 'lucide-react';
import { Category, Media } from '../types';
import { VideoPlayer } from './VideoPlayer';

interface LiveTVMobileBrowserProps {
  categories: Category[];
  activeMedia: Media | null;
  activeVideoUrl: string | null;
  layout: any;
  onSelectChannel: (media: Media) => void;
  onClosePlayer: () => void;
  showEmbeddedPlayer?: boolean;
}

export const LiveTVMobileBrowser: React.FC<LiveTVMobileBrowserProps> = ({
  categories,
  activeMedia,
  activeVideoUrl,
  layout,
  onSelectChannel,
  onClosePlayer,
  showEmbeddedPlayer = true,
}) => {
  const liveCategories = useMemo(
    () => categories.filter((category) => category.type === 'live' && category.items.length > 0),
    [categories]
  );
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (liveCategories.length === 0) {
      setExpandedCategoryId(null);
      return;
    }

    setExpandedCategoryId((current) => {
      if (current && liveCategories.some((category) => category.id === current)) {
        return current;
      }

      return liveCategories[0].id;
    });
  }, [liveCategories]);

  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return liveCategories;
    }

    return liveCategories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => item.title.toLowerCase().includes(query)),
      }))
      .filter((category) => category.items.length > 0);
  }, [liveCategories, searchQuery]);

  useEffect(() => {
    if (filteredCategories.length === 0) {
      setExpandedCategoryId(null);
      return;
    }

    setExpandedCategoryId((current) => {
      if (current && filteredCategories.some((category) => category.id === current)) {
        return current;
      }

      return filteredCategories[0].id;
    });
  }, [filteredCategories]);

  const playerHeight = Math.round(layout.width * 9 / 16);
  const hasActivePlayer = !!activeMedia && !!activeVideoUrl;
  const topSpacing = showEmbeddedPlayer || !hasActivePlayer ? layout.topHeaderPadding + 16 : 16;

  if (liveCategories.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Radio size={44} color="rgba(229,9,20,0.75)" />
        <Text style={styles.emptyTitle}>Nenhum canal ao vivo disponível</Text>
        <Text style={styles.emptyDescription}>
          As categorias liberadas para este usuário não possuem canais para reprodução.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topSpacing }]}>
      {showEmbeddedPlayer && hasActivePlayer ? (
        <View style={styles.playerBlock}>
          <View style={styles.playerHeader}>
            <View>
              <Text style={styles.playerEyebrow}>Canais ao vivo</Text>
              <Text style={styles.playerTitle}>{activeMedia.title}</Text>
            </View>
            <View style={styles.playingBadge}>
              <View style={styles.playingDot} />
              <Text style={styles.playingBadgeText}>Reproduzindo</Text>
            </View>
          </View>

          <View style={[styles.playerFrame, { height: playerHeight }]}>
            <VideoPlayer
              key={`mobile-live-${activeVideoUrl}`}
              url={activeVideoUrl}
              mediaType="live"
              media={activeMedia}
              onClose={onClosePlayer}
              isBrowseMode={true}
              showChannelSidebar={false}
              channelBrowserCategories={liveCategories}
            />
          </View>
        </View>
      ) : !hasActivePlayer ? (
        <View style={styles.introCard}>
          <View style={styles.introIconWrap}>
            <Radio size={22} color="#E50914" />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Selecione uma categoria para ver os canais</Text>
            <Text style={styles.introDescription}>
              Ao tocar em um canal, o player será aberto no topo e a lista continuará disponível logo abaixo.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.listBlock, { paddingBottom: layout.bottomNavigationHeight + 18 }]}>
        <View style={styles.searchShell}>
          <Search size={18} color="rgba(255,255,255,0.45)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar canal nesta lista..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredCategories.length === 0 ? (
            <View style={styles.noSearchResults}>
              <Text style={styles.noSearchResultsTitle}>Nenhum canal encontrado</Text>
              <Text style={styles.noSearchResultsText}>
                Ajuste a busca para localizar outro canal dentro das categorias liberadas.
              </Text>
            </View>
          ) : (
            filteredCategories.map((category) => {
              const isExpanded = expandedCategoryId === category.id;

              return (
                <View key={category.id} style={styles.categoryCard}>
                  <TouchableHighlight
                    onPress={() => setExpandedCategoryId(isExpanded ? null : category.id)}
                    underlayColor="rgba(255,255,255,0.06)"
                    style={styles.categoryButton}
                  >
                    <View style={styles.categoryButtonInner}>
                      <View style={styles.categoryTitleBlock}>
                        <Text style={styles.categoryTitle}>{category.title}</Text>
                        <Text style={styles.categoryMeta}>
                          {category.items.length} canal{category.items.length === 1 ? '' : 'ais'}
                        </Text>
                      </View>
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.18 }}
                        style={{ display: 'flex' }}
                      >
                        <ChevronDown size={18} color="rgba(255,255,255,0.72)" />
                      </motion.div>
                    </View>
                  </TouchableHighlight>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        style={{ overflow: 'hidden' }}
                      >
                        <View style={styles.channelList}>
                          {category.items.map((channel) => {
                            const isPlaying = activeMedia?.id === channel.id;

                            return (
                              <TouchableHighlight
                                key={channel.id}
                                onPress={() => onSelectChannel(channel)}
                                underlayColor="rgba(255,255,255,0.05)"
                                style={[
                                  styles.channelButton,
                                  isPlaying && styles.channelButtonActive,
                                ]}
                              >
                                <View style={styles.channelButtonInner}>
                                  <View style={styles.thumbnailWrap}>
                                    <Image source={{ uri: channel.thumbnail }} style={styles.thumbnail} />
                                  </View>
                                  <View style={styles.channelInfo}>
                                    <Text
                                      style={[
                                        styles.channelTitle,
                                        isPlaying && styles.channelTitleActive,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {channel.title}
                                    </Text>
                                    <Text style={styles.channelSubtitle} numberOfLines={1}>
                                      {isPlaying ? 'Em reprodução agora' : 'Toque para abrir no player'}
                                    </Text>
                                  </View>
                                  <View style={[styles.playPill, isPlaying && styles.playPillActive]}>
                                    {isPlaying ? (
                                      <Text style={styles.playPillTextActive}>AO VIVO</Text>
                                    ) : (
                                      <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
                                    )}
                                  </View>
                                </View>
                              </TouchableHighlight>
                            );
                          })}
                        </View>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 18,
  },
  playerBlock: {
    gap: 12,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  playerEyebrow: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: 'Outfit',
  },
  playerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
    fontFamily: 'Outfit',
  },
  playingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(229,9,20,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.35)',
  },
  playingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E50914',
  },
  playingBadgeText: {
    color: '#FECACA',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: 'Outfit',
  },
  playerFrame: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    boxShadow: '0 22px 50px rgba(0,0,0,0.4)',
  } as any,
  playerFallback: {
    flex: 1,
    backgroundColor: '#000',
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  introIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229,9,20,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.25)',
  },
  introCopy: {
    flex: 1,
  },
  introTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
  introDescription: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    fontFamily: 'Outfit',
  },
  listBlock: {
    flex: 1,
    minHeight: 0,
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    color: 'white',
    fontSize: 14,
    fontFamily: 'Outfit',
    padding: 0,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    gap: 12,
  },
  categoryCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  categoryButton: {
    borderRadius: 18,
  },
  categoryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  categoryTitleBlock: {
    flex: 1,
  },
  categoryTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
  categoryMeta: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Outfit',
  },
  channelList: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 8,
  },
  channelButton: {
    borderRadius: 14,
  },
  channelButtonActive: {
    backgroundColor: 'rgba(229,9,20,0.16)',
  },
  channelButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  thumbnailWrap: {
    width: 58,
    height: 58,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  channelInfo: {
    flex: 1,
    gap: 3,
  },
  channelTitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  channelTitleActive: {
    color: 'white',
  },
  channelSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontFamily: 'Outfit',
  },
  playPill: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  playPillActive: {
    paddingHorizontal: 10,
    backgroundColor: '#E50914',
  },
  playPillTextActive: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    fontFamily: 'Outfit',
  },
  noSearchResults: {
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  noSearchResultsTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: 'Outfit',
  },
  noSearchResultsText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    fontFamily: 'Outfit',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  emptyTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: 'Outfit',
  },
  emptyDescription: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: 'Outfit',
  },
});

export default LiveTVMobileBrowser;
