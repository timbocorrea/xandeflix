import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';

const shouldUseStrictMode = import.meta.env.DEV && !Capacitor.isNativePlatform();
const app = <App />;

createRoot(document.getElementById('root')!).render(
  shouldUseStrictMode ? <StrictMode>{app}</StrictMode> : app,
);
