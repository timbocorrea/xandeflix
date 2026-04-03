import { Capacitor, CapacitorHttp } from '@capacitor/core';

const DEFAULT_REMOTE_TIMEOUT_MS = 60000;

const NATIVE_IPTV_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
};

const WEB_IPTV_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14; SM-T220) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

function withRequestTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error(`Tempo limite excedido (${timeoutMs}ms).`));
    }, timeoutMs);

    promise
      .then((value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('tempo limite excedido')
  );
}

function parseContentLength(headers: Record<string, string> | undefined): number | null {
  if (!headers) {
    return null;
  }

  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === 'content-length',
  );
  if (!entry) {
    return null;
  }

  const parsed = Number(entry[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  const normalized = new Headers(headers);
  const result: Record<string, string> = {};

  normalized.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

export async function fetchRemoteText(
  targetUrl: string,
  options?: {
    headers?: HeadersInit;
    timeoutMs?: number;
    preflightHead?: boolean;
    maxContentLengthBytes?: number;
    retryWithoutNativeHeaders?: boolean;
  },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS;
  const customHeaders = headersToRecord(options?.headers);

  if (Capacitor.isNativePlatform()) {
    if (options?.preflightHead && options.maxContentLengthBytes) {
      try {
        const headResponse = await withRequestTimeout(
          CapacitorHttp.request({
            url: targetUrl,
            method: 'HEAD',
            headers: {
              ...NATIVE_IPTV_HEADERS,
              ...customHeaders,
            },
            connectTimeout: Math.min(timeoutMs, 10000),
            readTimeout: Math.min(timeoutMs, 10000),
          }),
          Math.min(timeoutMs, 10000),
        );

        const contentLength = parseContentLength(headResponse.headers as Record<string, string> | undefined);
        if (contentLength && contentLength > options.maxContentLengthBytes) {
          throw new Error(
            `A playlist vinculada a esta conta e grande demais para sincronizacao no dispositivo (${Math.round(contentLength / (1024 * 1024))} MB).`,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('grande demais')) {
          throw error;
        }
      }
    }

    const performNativeGet = (headers: Record<string, string>, attemptTimeoutMs: number) =>
      withRequestTimeout(
        CapacitorHttp.get({
          url: targetUrl,
          headers,
          responseType: 'text',
          connectTimeout: attemptTimeoutMs,
          readTimeout: attemptTimeoutMs,
        }),
        attemptTimeoutMs,
      );

    const shouldRetryWithoutNativeHeaders = options?.retryWithoutNativeHeaders !== false;
    const firstAttemptTimeoutMs = timeoutMs;

    let response;
    const firstAttemptStartedAt = Date.now();
    try {
      response = await performNativeGet({
        ...WEB_IPTV_HEADERS,
        ...customHeaders,
      }, firstAttemptTimeoutMs);
    } catch (initialError) {
      if (!shouldRetryWithoutNativeHeaders) {
        throw initialError;
      }

      // Se a tentativa principal ja estourou timeout, nao faz fallback curto
      // para evitar mascarar o erro real com 10000ms.
      if (isTimeoutError(initialError)) {
        throw initialError;
      }

      const elapsedMs = Date.now() - firstAttemptStartedAt;
      const remainingTimeoutMs = timeoutMs - elapsedMs;
      if (remainingTimeoutMs < 3000) {
        throw initialError;
      }

      response = await performNativeGet({
        ...NATIVE_IPTV_HEADERS,
        ...customHeaders,
      }, remainingTimeoutMs);
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }

    return typeof response.data === 'string' ? response.data : String(response.data ?? '');
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

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
    globalThis.clearTimeout(timeoutId);
  }
}
