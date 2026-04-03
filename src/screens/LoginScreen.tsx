import React, { useState } from 'react';
import { View, Text, TextInput, TouchableHighlight, StyleSheet, ActivityIndicator } from 'react-native';
import { motion, AnimatePresence } from 'motion/react';
import { authenticateWithSupabase, type SessionSnapshot } from '../lib/auth';

interface LoginScreenProps {
  onLoginSuccess: (snapshot: SessionSnapshot) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!identifier.trim()) {
      setError('Informe seu email ou ID de acesso.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const snapshot = await authenticateWithSupabase(identifier, password);
      onLoginSuccess(snapshot);
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel autenticar no Supabase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(229,9,20,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(229,9,20,0.05) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ width: '100%', maxWidth: 440, zIndex: 10 }}
      >
        <Text style={styles.logo}>XANDEFLIX</Text>
        <Text style={styles.subtitle}>Streaming Premium</Text>

        <View style={styles.card}>
          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.desc}>
            Use seu email ou ID de acesso. No primeiro login por ID, a conta do Supabase sera vinculada automaticamente.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>EMAIL OU ID DE ACESSO</Text>
            <TextInput
              style={styles.input}
              placeholder="Seu email ou ID"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={identifier}
              onChangeText={(text) => {
                setIdentifier(text);
                setError(null);
              }}
              autoCapitalize="none"
              onSubmitEditing={handleLogin}
              // @ts-ignore
              autoComplete="username"
            />
          </View>

          <AnimatePresence>
            {identifier.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>SENHA</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Sua senha de acesso"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    onSubmitEditing={handleLogin}
                    // @ts-ignore
                    autoComplete="current-password"
                  />
                </View>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </motion.div>
          )}

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
                <Text style={styles.buttonText}>Comecar a Assistir</Text>
              )}
            </View>
          </TouchableHighlight>
        </View>

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
