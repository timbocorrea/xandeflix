import 'dotenv/config';
import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = String(process.env.CAPACITOR_DEV_SERVER_URL || '').trim().replace(/\/+$/, '');
const usesDevServer = devServerUrl.length > 0;
const isHttpsDevServer = devServerUrl.startsWith('https://');

const config: CapacitorConfig = {
  appId: 'com.xandeflix.app',
  appName: 'Xandeflix',
  webDir: 'dist',
  ...(usesDevServer
    ? {
        server: {
          // Development only: loads the app from a machine in the local network.
          url: devServerUrl,
          androidScheme: isHttpsDevServer ? 'https' : 'http',
          cleartext: !isHttpsDevServer,
        },
      }
    : {}),
};

export default config;
