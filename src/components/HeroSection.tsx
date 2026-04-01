import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableHighlight, ImageBackground, useWindowDimensions } from 'react-native';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Info, Star, Calendar, Clock, Loader2 } from 'lucide-react';
import { Media } from '../types';
import { useTMDB } from '../hooks/useTMDB';

interface HeroSectionProps {
  media: Media | null;
  onPlay: (media: Media) => void;
  isAutoRotating: boolean;
  focusedId: string | null;
  onFocus: (id: string) => void;
  onInfo?: (media: Media) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = React.memo(({ 
  media, 
  onPlay, 
  isAutoRotating, 
  onAutoRotate, 
  focusedId, 
  onFocus,
  onInfo
}) => {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1180;

  const [bgError, setBgError] = useState(false);
  
  const { data: tmdbData, loading: tmdbLoading } = useTMDB(media?.title, media?.type);

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

  useEffect(() => { setBgError(false); }, [media?.id]);

  if (!displayData) return null;

  const fallbackBg = `https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=1920&auto=format&fit=crop`;

  // Responsive scale values
  const heroHeight   = isMobile ? height * 0.58 : isTablet ? height * 0.72 : height * 1.15;
  const paddingBot   = isMobile ? 28  : isTablet ? 60  : 180;
  const paddingH     = isMobile ? 16  : isTablet ? 28  : 20;
  const titleSize    = isMobile ? 30  : isTablet ? 48  : 72;
  const titleLH      = isMobile ? 34  : isTablet ? 52  : 76;
  const metaFS       = isMobile ? 13  : 18;
  const metaIcon     = isMobile ? 14  : 18;
  const btnPH        = isMobile ? 20  : 40;
  const btnPV        = isMobile ? 11  : 14;
  const btnFS        = isMobile ? 15  : 20;

  return (
    <View style={{ height: heroHeight, justifyContent: 'flex-end', paddingBottom: paddingBot }}>

      {/* ── Background ── */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={displayData.id}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1.0 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1.2, ease: 'easeInOut' }, scale: { duration: 8, ease: 'linear' } }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <ImageBackground
              source={{ uri: bgError ? fallbackBg : displayData.backdrop }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              onError={() => setBgError(true)}
            >
              {isMobile ? (
                // Mobile: bottom-dominant gradient keeps image visible at top
                <View style={{
                  position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                  pointerEvents: 'none',
                  // @ts-ignore
                  backgroundImage: 'linear-gradient(to bottom, rgba(5,5,5,0.1) 0%, rgba(5,5,5,0.55) 50%, rgba(5,5,5,0.98) 100%)'
                }} />
              ) : (
                <>
                  {/* Desktop: left + bottom gradient */}
                  <View style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0, width: '65%',
                    pointerEvents: 'none', zIndex: 1,
                    // @ts-ignore
                    backgroundImage: 'linear-gradient(to right, rgba(5,5,5,1) 0%, rgba(5,5,5,0.85) 45%, rgba(5,5,5,0) 100%)'
                  }} />
                  <View style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
                    pointerEvents: 'none', zIndex: 2,
                    // @ts-ignore
                    backgroundImage: 'linear-gradient(to top, rgba(5,5,5,1) 0%, rgba(5,5,5,0) 100%)'
                  }} />
                </>
              )}
            </ImageBackground>
          </motion.div>
        </AnimatePresence>
      </View>

      {/* ── Content ── */}
      <View style={{ position: 'relative', maxWidth: isMobile ? '100%' : 900, paddingHorizontal: paddingH, zIndex: 10 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={displayData.id}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 }}
          >
            {/* Title */}
            <Text
              numberOfLines={2}
              style={{
                fontSize: titleSize,
                fontWeight: '900',
                color: 'white',
                marginBottom: isMobile ? 10 : 16,
                fontFamily: 'Outfit',
                letterSpacing: isMobile ? -1 : -2,
                lineHeight: titleLH,
                maxWidth: isMobile ? '95%' : '80%',
              }}
            >
              {displayData.title}
            </Text>

            {/* Meta badges */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: isMobile ? 10 : 24, flexWrap: 'wrap' as any }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: isMobile ? 12 : 20 }}>
                <span><Star size={metaIcon} color="#EAB308" fill="#EAB308" /></span>
                <Text style={{ color: '#D1D5DB', fontSize: metaFS, marginLeft: 5 }}>{displayData.rating}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: isMobile ? 12 : 20 }}>
                <span><Calendar size={metaIcon} color="#D1D5DB" /></span>
                <Text style={{ color: '#D1D5DB', fontSize: metaFS, marginLeft: 5 }}>{displayData.year}</Text>
              </View>
              {!isMobile && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 20 }}>
                  <span><Clock size={metaIcon} color="#D1D5DB" /></span>
                  <Text style={{ color: '#D1D5DB', fontSize: metaFS, marginLeft: 5 }}>{displayData.duration}</Text>
                </View>
              )}
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#6B7280', borderRadius: 4 }}>
                <Text style={{ color: 'white', fontSize: isMobile ? 11 : 14, textTransform: 'uppercase' }}>
                  {displayData.category}
                </Text>
              </View>
              {tmdbLoading && (
                <View style={{ marginLeft: 10 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <Loader2 size={14} color="rgba(255,255,255,0.4)" />
                  </motion.div>
                </View>
              )}
            </View>

            {/* Description */}
            {isMobile ? (
              displayData.description ? (
                <Text numberOfLines={2} style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 18, marginBottom: 16, maxWidth: '95%' }}>
                  {displayData.description}
                </Text>
              ) : null
            ) : (
              <Text numberOfLines={3} style={{ fontSize: isTablet ? 17 : 20, color: '#D1D5DB', lineHeight: isTablet ? 26 : 30, marginBottom: 32, maxWidth: 700 }}>
                {displayData.description}
              </Text>
            )}

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' as any, gap: isMobile ? 10 : 16 } as any}>
              <TouchableHighlight
                onFocus={() => onFocus('hero-play')}
                onPress={() => onPlay(media)}
                // @ts-ignore
                onClick={() => onPlay(media)}
                underlayColor="#f3f4f6"
                style={{
                  backgroundColor: 'white',
                  paddingHorizontal: btnPH,
                  paddingVertical: btnPV,
                  borderRadius: 8,
                  ...(focusedId === 'hero-play' ? { borderWidth: 3, borderColor: '#E50914' } : {}),
                }}
                // @ts-ignore
                className="cursor-pointer"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <span><Play size={isMobile ? 18 : 24} color="black" fill="black" /></span>
                  <Text style={{ color: 'black', fontSize: btnFS, fontWeight: 'bold', marginLeft: isMobile ? 8 : 12 }}>
                    Assistir Agora
                  </Text>
                </View>
              </TouchableHighlight>

              {!isMobile && (
                <TouchableHighlight
                  onFocus={() => onFocus('hero-info')}
                  onPress={() => onInfo?.(media)}
                  // @ts-ignore
                  onClick={() => onInfo?.(media)}
                  underlayColor="rgba(255,255,255,0.3)"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    paddingHorizontal: 32,
                    paddingVertical: btnPV,
                    borderRadius: 8,
                    ...(focusedId === 'hero-info' ? { borderWidth: 3, borderColor: '#E50914' } : {}),
                  }}
                  // @ts-ignore
                  className="cursor-pointer"
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <span><Info size={24} color="white" /></span>
                    <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold', marginLeft: 12 }}>
                      Mais Informações
                    </Text>
                  </View>
                </TouchableHighlight>
              )}
            </View>
          </motion.div>
        </AnimatePresence>
      </View>
    </View>
  );
});
