import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableHighlight, TextInput, ImageBackground } from 'react-native';
import { motion } from 'motion/react';
import { Link, Play, ArrowRight } from 'lucide-react';

interface SetupScreenProps {
  onComplete: (url: string) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete }) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleStart = () => {
    if (!url.trim()) {
      setError('Por favor, insira uma URL válida.');
      return;
    }
    if (!url.startsWith('http')) {
      setError('A URL deve começar com http:// ou https://');
      return;
    }
    onComplete(url.trim());
  };

  const useDefault = () => {
    const DEFAULT_URL = 'http://dnsd1.space/get.php?username=952279118&password=823943744&type=m3u_plus&output=mpegts';
    onComplete(DEFAULT_URL);
  };

  return (
    <View style={styles.container}>
      <ImageBackground 
        source={{ uri: 'https://picsum.photos/seed/iptv/1920/1080?blur=10' }} 
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="w-full max-w-2xl px-8"
          >
            <View style={styles.logoContainer}>
              <Text style={styles.logo}>XANDEFLIX</Text>
              <Text style={styles.subtitle}>Sua experiência definitiva de IPTV</Text>
            </View>

            <View 
              style={styles.card}
              className="backdrop-blur-xl"
            >
              <Text style={styles.cardTitle}>Configuração Inicial</Text>
              <Text style={styles.cardDescription}>
                Para começar, insira a URL da sua lista M3U ou M3U8 fornecida pelo seu provedor.
              </Text>

              <View 
                style={styles.inputWrapper}
                className="flex flex-row items-center bg-black/30 rounded-xl border border-white/10 px-4 mb-3"
              >
                <Link size={20} color="rgba(255,255,255,0.4)" style={{ marginRight: 12 }} />
                <TextInput
                  style={styles.input}
                  // @ts-ignore
                  className="outline-none"
                  placeholder="http://seu-provedor.com/lista.m3u"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={url}
                  onChangeText={(text) => {
                    setUrl(text);
                    setError('');
                  }}
                  autoFocus
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.buttonGroup}>
                <TouchableHighlight
                  onPress={handleStart}
                  underlayColor="#b91c1c"
                  style={styles.primaryButton}
                >
                  <View style={styles.buttonInner}>
                    <Text style={styles.buttonText}>Carregar Lista</Text>
                    <ArrowRight size={20} color="white" style={{ marginLeft: 8 }} />
                  </View>
                </TouchableHighlight>

                <TouchableHighlight
                  onPress={useDefault}
                  underlayColor="rgba(255,255,255,0.1)"
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Usar Lista Padrão</Text>
                </TouchableHighlight>
              </View>
            </View>

            <Text style={styles.footer}>
              Suas configurações serão salvas localmente para o próximo acesso.
            </Text>
          </motion.div>
        </View>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  background: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 64,
    fontWeight: '900',
    color: '#E50914',
    fontFamily: 'Outfit',
    letterSpacing: -2,
    fontStyle: 'italic',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    marginTop: -8,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: 'rgba(26, 26, 26, 0.8)',
    borderRadius: 24,
    padding: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  cardDescription: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    height: 56,
    color: 'white',
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 16,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 16,
  },
  primaryButton: {
    flex: 2,
    backgroundColor: '#E50914',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
