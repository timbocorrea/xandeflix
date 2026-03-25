import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableHighlight, Image, ImageBackground, Dimensions } from 'react-native';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Info, Star, Calendar, Clock } from 'lucide-react';
import { Media } from '../types';

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
  if (!media) return null;

  return (
    <View style={styles.container}>
      {/* Hero Background */}
      <View style={[styles.heroBackground, { pointerEvents: 'none' } as any]}>
        <AnimatePresence mode="wait">
          <motion.div
            key={media.id}
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
                source={{ uri: media.backdrop }} 
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

      <View style={styles.heroInfo}>
        <AnimatePresence mode="wait">
          <motion.div
            key={media.id}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Text style={styles.heroTitle} numberOfLines={2}>{media.title}</Text>
            
            <View style={styles.metaContainer}>
              <View style={styles.metaItem}>
                <Star size={18} color="#EAB308" fill="#EAB308" />
                <Text style={styles.metaText}>{media.rating}</Text>
              </View>
              <View style={styles.metaItem}>
                <Calendar size={18} color="#D1D5DB" />
                <Text style={styles.metaText}>{media.year}</Text>
              </View>
              <View style={styles.metaItem}>
                <Clock size={18} color="#D1D5DB" />
                <Text style={styles.metaText}>{media.duration}</Text>
              </View>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{media.category}</Text>
              </View>
            </View>

            <Text style={styles.description} numberOfLines={3}>
              {media.description}
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
                  <Play size={24} color="black" fill="black" />
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
                  <Info size={24} color="white" />
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
    height: SCREEN_HEIGHT * 0.75,
    justifyContent: 'flex-end',
    paddingBottom: 60,
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
  heroInfo: {
    maxWidth: 900,
    marginLeft: 20,
    zIndex: 10,
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
