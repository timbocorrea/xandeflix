import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableHighlight, Image, ImageBackground, Dimensions, ScrollView, FlatList } from 'react-native';
import { motion } from 'motion/react';
import { Play, ArrowLeft, Star, Loader2, ListPlus, Share2 } from 'lucide-react';
import { Media } from '../types';
import { useTMDB } from '../hooks/useTMDB';
import { useStore } from '../store/useStore';
import { CategoryRow } from './CategoryRow';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MediaDetailsPageProps {
  media: Media;
  onClose: () => void;
  onPlay: (media: Media) => void;
  onSelectMedia?: (media: Media) => void;
}

export const MediaDetailsPage: React.FC<MediaDetailsPageProps> = ({ 
  media, 
  onClose, 
  onPlay,
  onSelectMedia
}) => {
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  useEffect(() => {
    if (media.seasons && media.seasons.length > 0) {
      setSelectedSeason(media.seasons[0].seasonNumber);
    } else {
      setSelectedSeason(null);
    }
  }, [media]);

  const allCategories = useStore(state => state.allCategories);
  const playbackProgress = useStore(state => state.playbackProgress);
  const { data: tmdbData, loading: tmdbLoading } = useTMDB(media.title, media.type);

  const relatedCategory = useMemo(() => {
    // Busca a categoria que contém o conteúdo atual
    const category = allCategories.find(c => c.title === media.category);
    if (!category) return null;
    
    // Remove o filme/série selecionado da lista e seleciona alguns aleatoriamente
    let relatedItems = category.items.filter(item => item.id !== media.id);
    for (let i = relatedItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [relatedItems[i], relatedItems[j]] = [relatedItems[j], relatedItems[i]];
    }
    
    return {
      ...category,
      id: 'related',
      title: 'Títulos Semelhantes',
      items: relatedItems.slice(0, 15) // Limita a 15 itens no carrossel
    };
  }, [allCategories, media]);

  const displayData = useMemo(() => {
    if (!tmdbData) return media;
    return {
      ...media,
      description: tmdbData.description || media.description,
      year: tmdbData.year || media.year,
      rating: tmdbData.rating || media.rating,
      backdrop: tmdbData.backdrop || media.backdrop,
      thumbnail: tmdbData.thumbnail || media.thumbnail,
    };
  }, [media, tmdbData]);

  const fallbackBg = `https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=1920&auto=format&fit=crop`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5000,
        backgroundColor: '#050505',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Full-screen backdrop image */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '70vh',
        overflow: 'hidden',
      }}>
        <motion.div
          initial={{ scale: 1.1 }}
          animate={{ scale: 1.0 }}
          transition={{ duration: 10, ease: 'linear' }}
          style={{ width: '100%', height: '100%' }}
        >
          <ImageBackground
            source={{ uri: displayData.backdrop || fallbackBg }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </motion.div>
        {/* Gradient overlays */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(to bottom, rgba(5,5,5,0.3) 0%, rgba(5,5,5,0) 30%, rgba(5,5,5,0.7) 70%, #050505 100%)',
        }} />
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(to right, rgba(5,5,5,0.9) 0%, rgba(5,5,5,0.4) 40%, rgba(5,5,5,0) 70%)',
        }} />
      </div>

      {/* Back button */}
      <View style={styles.topBar}>
        <TouchableHighlight
          onPress={onClose}
          style={styles.backButton}
          underlayColor="rgba(255,255,255,0.1)"
        >
          <View style={styles.backInner}>
            <View style={styles.iconWrap}><ArrowLeft size={24} color="white" /></View>
            <Text style={styles.backText}>Voltar</Text>
          </View>
        </TouchableHighlight>
        <Text style={styles.topLogo}>XANDEFLIX</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1, zIndex: 2 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Spacer to push content below the backdrop */}
        <View style={{ height: SCREEN_HEIGHT * 0.35 }} />

        {/* Main Content */}
        <View style={styles.contentContainer}>
          <View style={styles.mainRow}>
            {/* Poster */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <View style={styles.posterWrap}>
                <Image
                  source={{ uri: displayData.thumbnail }}
                  style={styles.poster}
                  resizeMode="contain"
                />
              </View>
            </motion.div>

            {/* Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              style={{ flex: 1 }}
            >
              <Text style={styles.title}>{media.title}</Text>

              {/* Meta badges */}
              <View style={styles.metaRow}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{media.type === 'movie' ? 'FILME' : 'SÉRIE'}</Text>
                </View>
                <View style={styles.metaItem}>
                  <View style={styles.iconWrap}><Star size={16} color="#EAB308" fill="#EAB308" /></View>
                  <Text style={styles.ratingVal}>{displayData.rating}</Text>
                </View>
                <Text style={styles.metaSep}>•</Text>
                <Text style={styles.metaText}>{displayData.year}</Text>
                <Text style={styles.metaSep}>•</Text>
                <Text style={styles.metaText}>{media.duration || 'VOD'}</Text>
                <Text style={styles.metaSep}>•</Text>
                <Text style={styles.metaText}>{media.category}</Text>
              </View>

              {/* Actions */}
              <View style={styles.actionRow}>
                {(!media.seasons || media.seasons.length === 0) && (
                  <TouchableHighlight
                    onPress={() => onPlay(media)}
                    style={styles.playBtn}
                    underlayColor="#B80710"
                  >
                    <View style={styles.playBtnInner}>
                      <View style={styles.iconWrap}><Play size={22} color="white" fill="white" /></View>
                      <Text style={styles.playBtnText}>Assistir Agora</Text>
                    </View>
                  </TouchableHighlight>
                )}

                <TouchableHighlight
                  onPress={() => {}}
                  style={styles.circleBtn}
                  underlayColor="rgba(255,255,255,0.15)"
                >
                  <View style={styles.iconWrap}><ListPlus size={22} color="white" /></View>
                </TouchableHighlight>

                <TouchableHighlight
                  onPress={() => {}}
                  style={styles.circleBtn}
                  underlayColor="rgba(255,255,255,0.15)"
                >
                  <View style={styles.iconWrap}><Share2 size={22} color="white" /></View>
                </TouchableHighlight>
              </View>

              {/* Synopsis */}
              <View style={styles.synopsisBlock}>
                <Text style={styles.sectionLabel}>Sinopse</Text>
                {tmdbLoading ? (
                  <View style={styles.loaderRow}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                      <Loader2 color="#E50914" size={22} />
                    </motion.div>
                    <Text style={styles.loaderText}>Buscando informações...</Text>
                  </View>
                ) : (
                  <Text style={styles.synopsisText}>
                    {displayData.description || 'Nenhuma sinopse disponível para este título.'}
                  </Text>
                )}
              </View>
            </motion.div>
          </View>
        </View>

        {/* Seasons & Episodes */}
        {media.seasons && media.seasons.length > 0 && selectedSeason !== null && (
          <View style={styles.seasonsContainer}>
             <View style={styles.seasonTabs}>
               <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                 {media.seasons.map(season => (
                   <TouchableHighlight
                     key={season.seasonNumber}
                     onPress={() => setSelectedSeason(season.seasonNumber)}
                     underlayColor="transparent"
                     style={[
                       styles.seasonTab,
                       selectedSeason === season.seasonNumber && styles.seasonTabActive
                     ]}
                   >
                     <Text style={[
                       styles.seasonTabText,
                       selectedSeason === season.seasonNumber && styles.seasonTabTextActive
                     ]}>
                       Temporada {season.seasonNumber}
                     </Text>
                   </TouchableHighlight>
                 ))}
               </ScrollView>
             </View>
             
             <View style={styles.episodesGrid}>
               {media.seasons.find(s => s.seasonNumber === selectedSeason)?.episodes.map((ep, idx) => {
                 const progress = playbackProgress[ep.id];
                 const percentComplete = progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : 0;
                 const isWatched = percentComplete > 90;

                 return (
                 <TouchableHighlight
                   key={ep.id}
                   onPress={() => onPlay({ 
                     ...media,
                     videoUrl: ep.videoUrl,
                     title: `${media.title} - ${ep.title}`,
                     currentEpisode: ep,
                     currentSeasonNumber: selectedSeason,
                   })}
                   underlayColor="rgba(255,255,255,0.1)"
                   style={styles.episodeCard}
                 >
                   <View style={[styles.episodeInner, { overflow: 'hidden' }]}>
                     <View style={[styles.episodeIndex, isWatched && { opacity: 0.5 }]}>
                       <Text style={styles.episodeIndexText}>{idx + 1}</Text>
                     </View>
                     <View style={styles.episodeInfo}>
                       <Text style={[styles.episodeTitle, isWatched && { color: '#9CA3AF' }]}>{ep.title}</Text>
                       <Text style={styles.episodeSubtitle}>
                         Episódio {ep.episodeNumber} {isWatched ? '• Assistido' : ''}
                       </Text>
                     </View>
                     <View style={[styles.episodePlayIcon, isWatched && { opacity: 0.5 }]}>
                       <Play size={20} color={isWatched ? "#9CA3AF" : "white"} />
                     </View>
                     {percentComplete > 0 && !isWatched && (
                       <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.1)' }}>
                         <View style={{ height: '100%', backgroundColor: '#E50914', width: `${Math.min(100, percentComplete)}%` }} />
                       </View>
                     )}
                   </View>
                 </TouchableHighlight>
                 );
               })}
             </View>
          </View>
        )}

        {/* Related Content */}
        {relatedCategory && relatedCategory.items.length > 0 && (
          <View style={styles.relatedSection}>
            <CategoryRow 
              category={relatedCategory}
              rowIndex={999}
              focusedId={null}
              onMediaFocus={() => {}}
              onMediaPress={(m) => onSelectMedia && onSelectMedia(m)}
            />
          </View>
        )}

        {/* Extra bottom spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </motion.div>
  );
};

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingTop: 30,
    paddingBottom: 20,
    zIndex: 100,
  },
  backButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    fontFamily: 'Outfit',
  },
  topLogo: {
    fontSize: 32,
    fontWeight: '900',
    color: '#E50914',
    fontStyle: 'italic',
    letterSpacing: -2,
    fontFamily: 'Outfit',
  },
  scrollContent: {
    paddingHorizontal: 80,
  },
  contentContainer: {
    zIndex: 10,
  },
  mainRow: {
    flexDirection: 'row',
  } as any,
  posterWrap: {
    width: 260,
    height: 390,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 50,
  } as any,
  poster: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 56,
    fontWeight: '900',
    color: 'white',
    fontFamily: 'Outfit',
    letterSpacing: -2,
    lineHeight: 60,
    marginBottom: 20,
    maxWidth: '90%',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
    flexWrap: 'wrap',
  } as any,
  typeBadge: {
    backgroundColor: '#E50914',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 16,
  },
  typeBadgeText: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  ratingVal: {
    color: '#EAB308',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  metaSep: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 18,
    marginHorizontal: 10,
  },
  metaText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 36,
  } as any,
  playBtn: {
    backgroundColor: '#E50914',
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 8,
    marginRight: 16,
  },
  playBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  } as any,
  playBtnText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 10,
    fontFamily: 'Outfit',
  },
  circleBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  synopsisBlock: {
    maxWidth: 700,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
    fontFamily: 'Outfit',
  },
  synopsisText: {
    fontSize: 19,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 30,
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  } as any,
  loaderText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
    marginLeft: 12,
  },
  relatedSection: {
    marginTop: 60,
    marginBottom: 20,
  } as any,
  seasonsContainer: {
    marginTop: 50,
    width: '100%',
  },
  seasonTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 30,
    paddingBottom: 2,
  } as any,
  seasonTab: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginRight: 10,
  },
  seasonTabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#E50914',
  },
  seasonTabText: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 'bold',
  },
  seasonTabTextActive: {
    color: 'white',
  },
  episodesGrid: {
    flexDirection: 'column',
    gap: 12,
    maxWidth: 800,
  } as any,
  episodeCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  episodeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  } as any,
  episodeIndex: {
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeIndexText: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: 'bold',
    fontFamily: 'Outfit',
  },
  episodeInfo: {
    flex: 1,
    marginLeft: 10,
  },
  episodeTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  episodePlayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
