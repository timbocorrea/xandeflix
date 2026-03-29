import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { motion } from 'motion/react';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const LoadingScreen: React.FC = () => {
  return (
    <View style={styles.container}>
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
        style={styles.logoContainer}
      >
        <Text style={styles.logoText}>XANDEFLIX</Text>
        <View style={styles.loaderBarContainer}>
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
            style={styles.loaderBar} 
          />
        </View>
      </motion.div>
      <Text style={styles.loadingMessage}>Carregando sua experiência cinematográfica...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1000,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 82,
    fontWeight: '900',
    color: '#E50914',
    fontStyle: 'italic',
    letterSpacing: -5,
    fontFamily: 'Outfit',
    textShadow: '0 0 20px rgba(229, 9, 20, 0.5)',
  } as any,
  loaderBarContainer: {
    width: 250,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 20,
    overflow: 'hidden',
  },
  loaderBar: {
    height: '100%',
    backgroundColor: '#E50914',
    boxShadow: '0 0 10px rgba(229, 9, 20, 0.8)',
  } as any,
  loadingMessage: {
    color: 'rgba(255,255,255,0.5)',
    marginTop: 30,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 1,
    fontFamily: 'Outfit',
  }
});

export default LoadingScreen;
