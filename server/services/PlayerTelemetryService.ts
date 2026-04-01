import { supabase } from '../lib/supabase.js';
import type { AuthSession } from './AuthSessionService.js';

export interface PlayerTelemetryPayload {
  mediaId?: string;
  mediaTitle?: string;
  mediaCategory?: string;
  mediaType?: string;
  streamHost?: string;
  strategy?: string;
  sessionSeconds?: number;
  watchSeconds?: number;
  bufferSeconds?: number;
  bufferEventCount?: number;
  stallRecoveryCount?: number;
  errorRecoveryCount?: number;
  endedRecoveryCount?: number;
  manualRetryCount?: number;
  qualityFallbackCount?: number;
  fatalErrorCount?: number;
  sampled?: boolean;
  exitReason?: string;
}

interface NormalizedTelemetryPayload {
  mediaId: string;
  mediaTitle: string;
  mediaCategory: string;
  mediaType: string;
  streamHost: string;
  strategy: string;
  sessionSeconds: number;
  watchSeconds: number;
  bufferSeconds: number;
  bufferEventCount: number;
  stallRecoveryCount: number;
  errorRecoveryCount: number;
  endedRecoveryCount: number;
  manualRetryCount: number;
  qualityFallbackCount: number;
  fatalErrorCount: number;
  sampled: boolean;
  exitReason: string;
}

interface TelemetryOverview {
  reportCount: number;
  affectedChannels: number;
  sampledReports: number;
  watchSeconds: number;
  bufferSeconds: number;
  bufferEventCount: number;
  stallRecoveryCount: number;
  errorRecoveryCount: number;
  endedRecoveryCount: number;
  manualRetryCount: number;
  qualityFallbackCount: number;
  fatalErrorCount: number;
}

interface TelemetryChannelSummary {
  key: string;
  mediaId: string;
  mediaTitle: string;
  mediaCategory: string;
  streamHost: string;
  sessions: number;
  sampledReports: number;
  watchSeconds: number;
  bufferSeconds: number;
  bufferEventCount: number;
  stallRecoveryCount: number;
  errorRecoveryCount: number;
  endedRecoveryCount: number;
  manualRetryCount: number;
  qualityFallbackCount: number;
  fatalErrorCount: number;
  problemScore: number;
}

const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 24 * 14;
const MAX_TEXT_LENGTH = 160;
const MAX_EXIT_REASON_LENGTH = 48;

function clampNumber(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function sanitizeText(value: unknown, fallback = '', maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function buildProblemScore(channel: TelemetryChannelSummary): number {
  return (
    channel.fatalErrorCount * 8 +
    channel.stallRecoveryCount * 5 +
    channel.errorRecoveryCount * 4 +
    channel.endedRecoveryCount * 2 +
    channel.qualityFallbackCount * 2 +
    channel.manualRetryCount * 2 +
    channel.bufferEventCount * 0.3 +
    channel.bufferSeconds / 30
  );
}

export class PlayerTelemetryService {
  private static enabled = process.env.PLAYER_TELEMETRY_ENABLED !== 'false';

  private static normalize(payload: PlayerTelemetryPayload): NormalizedTelemetryPayload | null {
    const mediaType = sanitizeText(payload.mediaType, 'live', 24).toLowerCase();
    if (mediaType !== 'live') {
      return null;
    }

    const mediaId = sanitizeText(payload.mediaId, '', 120);
    const mediaTitle = sanitizeText(payload.mediaTitle, 'Canal desconhecido');

    if (!mediaId && !mediaTitle) {
      return null;
    }

    return {
      mediaId: mediaId || mediaTitle.toLowerCase().replace(/\s+/g, '-'),
      mediaTitle,
      mediaCategory: sanitizeText(payload.mediaCategory, ''),
      mediaType,
      streamHost: sanitizeText(payload.streamHost, '', 120),
      strategy: sanitizeText(payload.strategy, 'unknown', 24).toLowerCase(),
      sessionSeconds: clampNumber(payload.sessionSeconds, 0, 24 * 60 * 60),
      watchSeconds: clampNumber(payload.watchSeconds, 0, 24 * 60 * 60),
      bufferSeconds: clampNumber(payload.bufferSeconds, 0, 24 * 60 * 60),
      bufferEventCount: clampNumber(payload.bufferEventCount, 0, 1000),
      stallRecoveryCount: clampNumber(payload.stallRecoveryCount, 0, 100),
      errorRecoveryCount: clampNumber(payload.errorRecoveryCount, 0, 100),
      endedRecoveryCount: clampNumber(payload.endedRecoveryCount, 0, 100),
      manualRetryCount: clampNumber(payload.manualRetryCount, 0, 100),
      qualityFallbackCount: clampNumber(payload.qualityFallbackCount, 0, 100),
      fatalErrorCount: clampNumber(payload.fatalErrorCount, 0, 100),
      sampled: Boolean(payload.sampled),
      exitReason: sanitizeText(payload.exitReason, 'unknown', MAX_EXIT_REASON_LENGTH).toLowerCase(),
    };
  }

  private static shouldPersist(payload: NormalizedTelemetryPayload): boolean {
    return (
      payload.sampled ||
      payload.bufferSeconds >= 10 ||
      payload.bufferEventCount > 0 ||
      payload.stallRecoveryCount > 0 ||
      payload.errorRecoveryCount > 0 ||
      payload.endedRecoveryCount > 0 ||
      payload.manualRetryCount > 0 ||
      payload.qualityFallbackCount > 0 ||
      payload.fatalErrorCount > 0
    );
  }

  public static async record(payload: PlayerTelemetryPayload, session: AuthSession | null): Promise<{ stored: boolean; reason?: string }> {
    if (!this.enabled) {
      return { stored: false, reason: 'disabled' };
    }

    const normalized = this.normalize(payload);
    if (!normalized) {
      return { stored: false, reason: 'ignored' };
    }

    if (!this.shouldPersist(normalized)) {
      return { stored: false, reason: 'healthy_unsampled' };
    }

    if (!supabase) {
      console.log('[TELEMETRY] Supabase indisponivel. Evento resumido:', normalized);
      return { stored: false, reason: 'supabase_unavailable' };
    }

    const { error } = await supabase
      .from('player_telemetry_reports')
      .insert({
        user_id: session?.userId || null,
        session_role: session?.role || 'anonymous',
        media_id: normalized.mediaId,
        media_title: normalized.mediaTitle,
        media_category: normalized.mediaCategory,
        media_type: normalized.mediaType,
        stream_host: normalized.streamHost,
        strategy: normalized.strategy,
        session_seconds: normalized.sessionSeconds,
        watch_seconds: normalized.watchSeconds,
        buffer_seconds: normalized.bufferSeconds,
        buffer_event_count: normalized.bufferEventCount,
        stall_recovery_count: normalized.stallRecoveryCount,
        error_recovery_count: normalized.errorRecoveryCount,
        ended_recovery_count: normalized.endedRecoveryCount,
        manual_retry_count: normalized.manualRetryCount,
        quality_fallback_count: normalized.qualityFallbackCount,
        fatal_error_count: normalized.fatalErrorCount,
        sampled: normalized.sampled,
        exit_reason: normalized.exitReason,
        created_at: new Date().toISOString(),
      });

    if (error) {
      throw error;
    }

    return { stored: true };
  }

  public static async getSummary(windowHours = DEFAULT_WINDOW_HOURS): Promise<{
    enabled: boolean;
    windowHours: number;
    storage: 'supabase' | 'unavailable';
    overview: TelemetryOverview;
    channels: TelemetryChannelSummary[];
  }> {
    const safeWindowHours = Math.round(clampNumber(windowHours, 1, MAX_WINDOW_HOURS));
    const overview: TelemetryOverview = {
      reportCount: 0,
      affectedChannels: 0,
      sampledReports: 0,
      watchSeconds: 0,
      bufferSeconds: 0,
      bufferEventCount: 0,
      stallRecoveryCount: 0,
      errorRecoveryCount: 0,
      endedRecoveryCount: 0,
      manualRetryCount: 0,
      qualityFallbackCount: 0,
      fatalErrorCount: 0,
    };

    if (!this.enabled || !supabase) {
      return {
        enabled: this.enabled,
        windowHours: safeWindowHours,
        storage: 'unavailable',
        overview,
        channels: [],
      };
    }

    const since = new Date(Date.now() - safeWindowHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('player_telemetry_reports')
      .select(
        'media_id, media_title, media_category, stream_host, session_seconds, watch_seconds, buffer_seconds, buffer_event_count, stall_recovery_count, error_recovery_count, ended_recovery_count, manual_retry_count, quality_fallback_count, fatal_error_count, sampled',
      )
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      throw error;
    }

    const channels = new Map<string, TelemetryChannelSummary>();

    for (const row of data || []) {
      const key = sanitizeText(row.media_id, sanitizeText(row.media_title, 'canal-desconhecido'));
      const current = channels.get(key) || {
        key,
        mediaId: sanitizeText(row.media_id, ''),
        mediaTitle: sanitizeText(row.media_title, 'Canal desconhecido'),
        mediaCategory: sanitizeText(row.media_category, ''),
        streamHost: sanitizeText(row.stream_host, ''),
        sessions: 0,
        sampledReports: 0,
        watchSeconds: 0,
        bufferSeconds: 0,
        bufferEventCount: 0,
        stallRecoveryCount: 0,
        errorRecoveryCount: 0,
        endedRecoveryCount: 0,
        manualRetryCount: 0,
        qualityFallbackCount: 0,
        fatalErrorCount: 0,
        problemScore: 0,
      };

      current.sessions += 1;
      current.sampledReports += row.sampled ? 1 : 0;
      current.watchSeconds += clampNumber(row.watch_seconds, 0, 24 * 60 * 60);
      current.bufferSeconds += clampNumber(row.buffer_seconds, 0, 24 * 60 * 60);
      current.bufferEventCount += clampNumber(row.buffer_event_count, 0, 1000);
      current.stallRecoveryCount += clampNumber(row.stall_recovery_count, 0, 100);
      current.errorRecoveryCount += clampNumber(row.error_recovery_count, 0, 100);
      current.endedRecoveryCount += clampNumber(row.ended_recovery_count, 0, 100);
      current.manualRetryCount += clampNumber(row.manual_retry_count, 0, 100);
      current.qualityFallbackCount += clampNumber(row.quality_fallback_count, 0, 100);
      current.fatalErrorCount += clampNumber(row.fatal_error_count, 0, 100);
      current.problemScore = buildProblemScore(current);

      channels.set(key, current);
    }

    const channelList = [...channels.values()].sort((a, b) => b.problemScore - a.problemScore || b.sessions - a.sessions).slice(0, 12);

    for (const channel of channels.values()) {
      overview.reportCount += channel.sessions;
      overview.affectedChannels += 1;
      overview.sampledReports += channel.sampledReports;
      overview.watchSeconds += channel.watchSeconds;
      overview.bufferSeconds += channel.bufferSeconds;
      overview.bufferEventCount += channel.bufferEventCount;
      overview.stallRecoveryCount += channel.stallRecoveryCount;
      overview.errorRecoveryCount += channel.errorRecoveryCount;
      overview.endedRecoveryCount += channel.endedRecoveryCount;
      overview.manualRetryCount += channel.manualRetryCount;
      overview.qualityFallbackCount += channel.qualityFallbackCount;
      overview.fatalErrorCount += channel.fatalErrorCount;
    }

    return {
      enabled: this.enabled,
      windowHours: safeWindowHours,
      storage: 'supabase',
      overview,
      channels: channelList,
    };
  }
}
