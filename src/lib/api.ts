import { Capacitor } from '@capacitor/core';

const rawApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

function normalizeApiPath(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function getApiBaseUrl(): string {
  return rawApiBaseUrl;
}

export function isNativeApiBaseUrlMissing(): boolean {
  return Capacitor.isNativePlatform() && !rawApiBaseUrl;
}

export function buildApiUrl(path: string): string {
  const normalizedPath = normalizeApiPath(path);

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (rawApiBaseUrl) {
    return `${rawApiBaseUrl}${normalizedPath}`;
  }

  return normalizedPath;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isNativeApiBaseUrlMissing()) {
    throw new Error(
      'Aplicativo Android sem API configurada. Defina VITE_API_BASE_URL e gere um novo build.',
    );
  }

  return fetch(buildApiUrl(input), init);
}
