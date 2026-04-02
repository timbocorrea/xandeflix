import { Capacitor, CapacitorHttp } from '@capacitor/core';

const rawApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const rawPlaylistProxyFlag = String(import.meta.env.VITE_ENABLE_PLAYLIST_PROXY || '').trim();
const rawEpgProxyFlag = String(import.meta.env.VITE_ENABLE_EPG_PROXY || '').trim();
const rawMediaProxyFlag = String(import.meta.env.VITE_ENABLE_MEDIA_PROXY || '').trim();

function parseBooleanEnv(value: string, fallback: boolean): boolean {
  if (!value) return fallback;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeApiPath(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function getApiBaseUrl(): string {
  return rawApiBaseUrl;
}

export function isPlaylistProxyEnabled(): boolean {
  return parseBooleanEnv(rawPlaylistProxyFlag, !Capacitor.isNativePlatform());
}

export function isEpgProxyEnabled(): boolean {
  return parseBooleanEnv(rawEpgProxyFlag, !Capacitor.isNativePlatform());
}

export function isMediaProxyEnabled(): boolean {
  return parseBooleanEnv(rawMediaProxyFlag, false);
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

export function buildMediaProxyUrl(
  targetUrl: string,
  authToken: string,
  options?: {
    rootUrl?: string;
    parentUrl?: string;
  },
): string {
  const params = new URLSearchParams({
    url: targetUrl,
    token: authToken,
  });

  if (options?.rootUrl) {
    params.set('root', options.rootUrl);
  }

  if (options?.parentUrl) {
    params.set('parent', options.parentUrl);
  }

  const isHls = targetUrl.includes('.m3u8') || targetUrl.includes('output=hls');
  const dummyExt = isHls ? 'stream.m3u8' : 'stream.mp4';

  return buildApiUrl(`/api/proxy-media/${dummyExt}?${params.toString()}`);
}

export async function fetchRemoteText(
  targetUrl: string,
  options?: {
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<string> {
  const headers = options?.headers;
  const timeoutMs = options?.timeoutMs ?? 60000;

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url: targetUrl,
      headers,
      responseType: 'text',
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }

    return typeof response.data === 'string' ? response.data : String(response.data ?? '');
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isNativeApiBaseUrlMissing()) {
    throw new Error(
      'Aplicativo Android sem API configurada. Defina VITE_API_BASE_URL e gere um novo build.',
    );
  }

  return fetch(buildApiUrl(input), init);
}
