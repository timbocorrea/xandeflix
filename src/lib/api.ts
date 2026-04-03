import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { HttpOptions, HttpResponse } from '@capacitor/core';

const rawApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const rawPlaylistProxyFlag = String(import.meta.env.VITE_ENABLE_PLAYLIST_PROXY || '').trim();
const rawEpgProxyFlag = String(import.meta.env.VITE_ENABLE_EPG_PROXY || '').trim();
const rawMediaProxyFlag = String(import.meta.env.VITE_ENABLE_MEDIA_PROXY || '').trim();
const DEFAULT_REMOTE_TIMEOUT_MS = 60000;
const LOCAL_DEBUG_HOSTS = new Set(['127.0.0.1', 'localhost']);

const NATIVE_IPTV_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
};

const WEB_IPTV_HEADERS: Record<string, string> = {
  Accept: '*/*',
};

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

function getRuntimeOrigin(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return String(window.location.origin || '').trim().replace(/\/+$/, '');
}

function isUsbReverseRuntimeOrigin(origin: string): boolean {
  if (!origin) {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      LOCAL_DEBUG_HOSTS.has(parsed.hostname.toLowerCase()) &&
      Boolean(parsed.port)
    );
  } catch {
    return false;
  }
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  const normalized = new Headers(headers);
  const result: Record<string, string> = {};

  normalized.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

function isJsonContentType(headers: Record<string, string>): boolean {
  const contentType = headers['content-type'];
  return typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');
}

function resolveNativeRequestBody(
  body: BodyInit | null | undefined,
  headers: Record<string, string>,
): HttpOptions['data'] {
  if (body == null) {
    return undefined;
  }

  if (typeof body === 'string') {
    if (isJsonContentType(headers)) {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }

    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  throw new Error('Unsupported request body for native HTTP transport.');
}

function createFetchCompatibleResponse(nativeResponse: HttpResponse): Response {
  const headers = new Headers();

  Object.entries(nativeResponse.headers ?? {}).forEach(([key, value]) => {
    if (value != null) {
      headers.set(key, String(value));
    }
  });

  let body: BodyInit | null = null;

  if (nativeResponse.data != null) {
    if (typeof nativeResponse.data === 'string') {
      body = nativeResponse.data;
    } else {
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }

      body = JSON.stringify(nativeResponse.data);
    }
  }

  return new Response(body, {
    status: nativeResponse.status,
    headers,
  });
}

async function nativeFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = headersToRecord(init?.headers);
  const method = init?.method?.toUpperCase() || 'GET';

  const response = await CapacitorHttp.request({
    url: input,
    method,
    headers,
    data: resolveNativeRequestBody(init?.body, headers),
    responseType: 'text',
  });

  return createFetchCompatibleResponse(response);
}

export async function apiGetJson<T>(
  input: string,
  options?: {
    headers?: HeadersInit;
  },
): Promise<T> {
  if (isNativeApiBaseUrlMissing()) {
    throw new Error(
      'Aplicativo Android sem API configurada. Defina VITE_API_BASE_URL ou rode via ADB reverse em http://127.0.0.1:<porta>.',
    );
  }

  const targetUrl = buildApiUrl(input);
  const headers = headersToRecord(options?.headers);

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url: targetUrl,
      method: 'GET',
      headers,
      responseType: 'json',
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.data as T;
  }

  const response = await fetch(targetUrl, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getApiBaseUrl(): string {
  const runtimeOrigin = getRuntimeOrigin();

  if (Capacitor.isNativePlatform() && isUsbReverseRuntimeOrigin(runtimeOrigin)) {
    return runtimeOrigin;
  }

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
  return Capacitor.isNativePlatform() && !getApiBaseUrl();
}

export function buildApiUrl(path: string): string {
  const normalizedPath = normalizeApiPath(path);
  const apiBaseUrl = getApiBaseUrl();

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (apiBaseUrl) {
    return `${apiBaseUrl}${normalizedPath}`;
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
    headers?: HeadersInit;
    timeoutMs?: number;
  },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS;
  const customHeaders = headersToRecord(options?.headers);

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url: targetUrl,
      headers: {
        ...NATIVE_IPTV_HEADERS,
        ...customHeaders,
      },
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
      headers: {
        ...WEB_IPTV_HEADERS,
        ...customHeaders,
      },
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
      'Aplicativo Android sem API configurada. Defina VITE_API_BASE_URL ou rode via ADB reverse em http://127.0.0.1:<porta>.',
    );
  }

  const targetUrl = buildApiUrl(input);

  if (Capacitor.isNativePlatform()) {
    return nativeFetch(targetUrl, init);
  }

  return fetch(targetUrl, init);
}
