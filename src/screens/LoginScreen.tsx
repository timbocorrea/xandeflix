import React, { useState } from 'react';
import { View, Text, TextInput, TouchableHighlight, StyleSheet, ActivityIndicator } from 'react-native';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store/useStore';

interface LoginScreenProps {
  onLoginSuccess: (playlistUrl?: string, userId?: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setIsAdminMode } = useStore();

  const handleLogin = async () => {
    if (!identifier.trim()) {
      setError('Informe seu ID de acesso.');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), token: password })
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Credenciais inválidas.');
        setLoading(false);
        return;
      }

      if (result.type === 'admin') {
        setIsAdminMode(true);
        onLoginSuccess();
      } else if (result.type === 'user') {
        setIsAdminMode(false);
        onLoginSuccess(result.data?.playlistUrl, result.data?.id);
      }
    } catch (err) {
      setError('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = identifier.toLowerCase() === 'admin';

  return (
    <View style={styles.container}>
      {/* Background Effect */}
      <div 
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'radial-gradient(ellipse at 30% 20%, rgba(229,9,20,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(229,9,20,0.05) 0%, transparent 50%)',
          pointerEvents: 'none',
        }} 
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ width: '100%', maxWidth: 440, zIndex: 10 }}
      >
        {/* Logo */}
        <Text style={styles.logo}>XANDEFLIX</Text>
        <Text style={styles.subtitle}>Streaming Premium</Text>

        {/* Login Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.desc}>
            {isAdmin ? 'Acesso administrativo ao painel de controle.' : 'Insira seu ID de acesso para começar a assistir.'}
          </Text>

          {/* Identifier Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>ID DE ACESSO</Text>
            <TextInput
              style={styles.input}
              placeholder="Seu ID ou 'admin'"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={identifier}
              onChangeText={(text) => { setIdentifier(text); setError(null); }}
              autoCapitalize="none"
              // @ts-ignore
              autoComplete="username"
            />
          </View>

          {/* Password Field */}
          <AnimatePresence>
            {identifier.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{isAdmin ? 'CHAVE MESTRA' : 'SENHA'}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={isAdmin ? 'Senha do administrador' : 'Sua senha de acesso'}
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    // @ts-ignore
                    autoComplete="current-password"
                  />
                </View>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </motion.div>
          )}

          {/* Submit */}
          <TouchableHighlight
            onPress={handleLogin}
            underlayColor="#B80710"
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
          >
            <View style={styles.buttonInner}>
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.buttonText}>
                  {isAdmin ? 'Acessar Painel' : 'Começar a Assistir'}
                </Text>
              )}
            </View>
          </TouchableHighlight>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Xandeflix Premium © 2026</Text>
      </motion.div>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#050505',
    padding: 20,
  },
  logo: {
    fontSize: 56,
    fontWeight: '900',
    color: '#E50914',
    fontStyle: 'italic',
    letterSpacing: -3,
    fontFamily: 'Outfit',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 48,
    fontFamily: 'Outfit',
  },
  card: {
    backgroundColor: '#0d0d0d',
    borderRadius: 16,
    padding: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: 'white',
    marginBottom: 8,
    fontFamily: 'Outfit',
  },
  desc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 32,
    lineHeight: 22,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
    marginBottom: 8,
    fontFamily: 'Outfit',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: 'white',
    fontSize: 16,
    fontFamily: 'Outfit',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#E50914',
    borderRadius: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonInner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Outfit',
  },
  footer: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 32,
    letterSpacing: 1,
  },
});
