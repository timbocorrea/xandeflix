export type PlayerTelemetryExitReason =
  | 'close'
  | 'channel_switch'
  | 'manual_retry'
  | 'fatal_error'
  | 'unmount';

export interface PlayerTelemetryReport {
  authToken?: string;
  mediaId: string;
  mediaTitle: string;
  mediaCategory?: string;
  mediaType: string;
  streamHost?: string;
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
  exitReason: PlayerTelemetryExitReason;
}

export function sendPlayerTelemetryReport(report: PlayerTelemetryReport): void {
  if (typeof window === 'undefined') return;

  const { authToken, ...payload } = report;

  void fetch('/api/player-telemetry', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { 'x-auth-token': authToken } : {}),
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((error) => {
    console.warn('[Telemetry] Falha ao enviar resumo do player:', error);
  });
}
