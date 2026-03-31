import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'react-native': 'react-native-web',
      },
    },
    build: {
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('mpegts.js') || id.includes('video.js') || id.includes('mux.js')) {
              return 'player-core';
            }

            if (id.includes('@supabase/supabase-js')) {
              return 'supabase';
            }

            if (id.includes('react-native-web') || id.includes('/react-native/') || id.includes('\\react-native\\')) {
              return 'native-web';
            }

            if (id.includes('motion') || id.includes('lucide-react')) {
              return 'ui-motion';
            }

            if (
              id.includes('/react/') ||
              id.includes('\\react\\') ||
              id.includes('/react-dom/') ||
              id.includes('\\react-dom\\') ||
              id.includes('react-router-dom')
            ) {
              return 'react-core';
            }

            return 'vendor';
          },
        },
      },
    },
    server: {
      watch: {
        ignored: ['**/users.json'],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
