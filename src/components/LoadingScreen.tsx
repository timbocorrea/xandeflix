import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { motion } from 'motion/react';

interface LoadingScreenProps {
  statusMessage?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ statusMessage }) => {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;

  // Responsive logo: scales from 36px (small phone) to 82px (desktop)
  const logoSize = Math.min(82, Math.max(36, width * 0.16));
  const barWidth = Math.min(250, width * 0.6);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#050505',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 1000,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ 
          opacity: [0.4, 1, 0.4],
          scale: [0.95, 1.05, 0.95],
        }}
        transition={{ 
          duration: 2, 
          repeat: Infinity,
          ease: "easeInOut" 
        }}
        style={{ alignItems: 'center', display: 'flex', flexDirection: 'column' }}
      >
        <Text
          style={{
            fontSize: logoSize,
            fontWeight: '900',
            color: '#E50914',
            fontStyle: 'italic',
            letterSpacing: -logoSize * 0.06,
            fontFamily: 'Outfit',
            textShadow: '0 0 20px rgba(229, 9, 20, 0.5)',
          } as any}
        >
          XANDEFLIX
        </Text>

        {/* Animated progress bar */}
        <View
          style={{
            width: barWidth,
            height: 3,
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: 2,
            marginTop: 20,
            overflow: 'hidden',
          }}
        >
          <motion.div
            animate={{ 
              width: ["0%", "40%", "80%", "100%"],
              opacity: [1, 1, 1, 0]
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity,
              ease: "circIn" 
            }}
            style={{
              height: '100%',
              backgroundColor: '#E50914',
              boxShadow: '0 0 10px rgba(229, 9, 20, 0.8)',
            } as any}
          />
        </View>
      </motion.div>

      <Text
        style={{
          color: 'rgba(255,255,255,0.45)',
          marginTop: 28,
          fontSize: isMobile ? 13 : 15,
          fontWeight: '500',
          letterSpacing: 0.8,
          fontFamily: 'Outfit',
          textAlign: 'center',
          paddingHorizontal: 32,
        }}
      >
        {statusMessage || 'Carregando sua experiência cinematográfica...'}
      </Text>
    </View>
  );
};

export default LoadingScreen;
