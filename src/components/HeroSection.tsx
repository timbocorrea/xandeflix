import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableHighlight, Image, ImageBackground, Dimensions } from 'react-native';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Info, Star, Calendar, Clock, Loader2 } from 'lucide-react';
import { Media } from '../types';
import { useTMDB } from '../hooks/useTMDB';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface HeroSectionProps {
  media: Media | null;
  onPlay: (media: Media) => void;
  isAutoRotating: boolean;
  onAutoRotate: () => void;
  focusedId: string | null;
  onFocus: (id: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = React.memo(({ 
  media, 
  onPlay, 
  isAutoRotating, 
  onAutoRotate, 
  focusedId, 
  onFocus 
}) => {
  const [bgError, setBgError] = useState(false);
  
  // Use TMDB Hook to enrich content
  const { data: tmdbData, loading: tmdbLoading } = useTMDB(
    media?.title, 
    media?.type
  );

  // Compute final display properties: prioritizing rich TMDB data over raw playlist info
  const displayData = useMemo(() => {
    if (!media) return null;
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

  // Reset error state when media changes
  useEffect(() => {
    setBgError(false);
  }, [media?.id]);

  if (!displayData) return null;

  const fallbackBg = `https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=1920&auto=format&fit=crop`;

  return (
    <View style={styles.container}>
      {/* Hero Background with Ken Burns effect */}
      <View style={styles.heroBackground}>
        <AnimatePresence mode="wait">
          <motion.div
            key={displayData.id}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1.0 }}
            exit={{ opacity: 0 }}
            transition={{ 
              opacity: { duration: 1.2, ease: 'easeInOut' },
              scale: { duration: 8, ease: 'linear' }  
            }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <View 
              style={[styles.backdrop, { position: 'relative', width: '100%', height: '100%' }]}
              className="relative w-full h-full"
            >
              <ImageBackground 
                source={{ uri: bgError ? fallbackBg : displayData.backdrop }} 
                style={styles.backdrop}
                resizeMode="cover"
                onError={() => setBgError(true)}
              >
                {/* Horizontal gradient for text contrast */}
                <View 
                  style={{
                    position: 'absolute',
                    top: 0, bottom: 0, left: 0,
                    width: '60%',
                    pointerEvents: 'none',
                    zIndex: 1,
                    // @ts-ignore
                    backgroundImage: 'linear-gradient(to right, rgba(5,5,5,1) 0%, rgba(5,5,5,0.85) 40%, rgba(5,5,5,0) 100%)'
                  }}
                />
                {/* Bottom gradient to blend into page */}
                <View 
                  style={{
                    position: 'absolute',
                    bottom: 0, left: 0, right: 0,
                    height: '40%',
                    pointerEvents: 'none',
                    zIndex: 2,
                    // @ts-ignore
                    backgroundImage: 'linear-gradient(to top, rgba(5,5,5,1) 0%, rgba(5,5,5,0) 100%)'
                  }}
                />
              </ImageBackground>
            </View>
          </motion.div>
        </AnimatePresence>
      </View>

      <View style={styles.heroInfo}>
        <AnimatePresence mode="wait">
          <motion.div
            key={displayData.id}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ 
              duration: 0.7, 
              ease: [0.25, 0.46, 0.45, 0.94],
              delay: 0.3  
            }}
          >
            <Text style={styles.heroTitle} numberOfLines={2}>{displayData.title}</Text>
            
            <View style={styles.metaContainer}>
              <View style={styles.metaItem}>
                <span><Star size={18} color="#EAB308" fill="#EAB308" /></span>
                <Text style={styles.metaText}>{displayData.rating}</Text>
              </View>
              <View style={styles.metaItem}>
                <span><Calendar size={18} color="#D1D5DB" /></span>
                <Text style={styles.metaText}>{displayData.year}</Text>
              </View>
              <View style={styles.metaItem}>
                <span><Clock size={18} color="#D1D5DB" /></span>
                <Text style={styles.metaText}>{displayData.duration}</Text>
              </View>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{displayData.category}</Text>
              </View>
              
              {tmdbLoading && (
                <View style={{ marginLeft: 15 }}>
                   <motion.div
                     animate={{ rotate: 360 }}
                     transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                   >
                     <Loader2 size={16} color="rgba(255,255,255,0.4)" />
                   </motion.div>
                </View>
              )}
            </View>

            <Text style={styles.description} numberOfLines={3}>
              {displayData.description}
            </Text>

            <View style={styles.buttonContainer}>
              <TouchableHighlight
                onFocus={() => onFocus('hero-play')}
                onPress={() => onPlay(media)}
                // @ts-ignore - for web compatibility
                onClick={() => onPlay(media)}
                underlayColor="#f3f4f6"
                style={[
                  styles.playButton,
                  focusedId === 'hero-play' && styles.buttonFocused
                ]}
                // @ts-ignore - for web compatibility
                className="cursor-pointer"
              >
                <View style={styles.buttonInner}>
                  <span><Play size={24} color="black" fill="black" /></span>
                  <Text style={styles.playButtonText}>Assistir Agora</Text>
                </View>
              </TouchableHighlight>

              <TouchableHighlight
                onFocus={() => onFocus('hero-info')}
                underlayColor="rgba(255,255,255,0.3)"
                style={[
                  styles.infoButton,
                  focusedId === 'hero-info' && styles.buttonFocused
                ]}
                // @ts-ignore - for web compatibility
                className="cursor-pointer"
              >
                <View style={styles.buttonInner}>
                  <span><Info size={24} color="white" /></span>
                  <Text style={styles.infoButtonText}>Mais Informações</Text>
                </View>
              </TouchableHighlight>
            </View>
          </motion.div>
        </AnimatePresence>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: SCREEN_HEIGHT * 0.95,
    justifyContent: 'flex-end',
    paddingBottom: 140,
  },
  heroBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  backdrop: {
    width: '100%',
    height: '100%',
    backgroundPosition: 'center',
  } as any,
  heroInfo: {
    position: 'relative',
    maxWidth: 900,
    marginLeft: 20,
    zIndex: 10,
  },
  heroTitle: {
    fontSize: 72,
    fontWeight: '900',
    color: 'white',
    marginBottom: 16,
    fontFamily: 'Outfit',
    letterSpacing: -2,
    lineHeight: 72,
    maxWidth: '80%',
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
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 8,
    marginRight: 16,
  },
  infoButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButtonText: {
    color: 'black',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  infoButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  buttonFocused: {
    transform: 'scale(1.05)' as any,
    borderWidth: 3,
    borderColor: '#E50914',
  },
});
