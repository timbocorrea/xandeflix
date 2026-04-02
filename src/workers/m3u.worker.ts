import { M3UParser } from '../lib/m3uParser';

function extractEpgUrl(m3uText: string): string | null {
  const firstNonEmptyLine = m3uText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstNonEmptyLine || !firstNonEmptyLine.toUpperCase().startsWith('#EXTM3U')) {
    return null;
  }

  const match = firstNonEmptyLine.match(/\burl-tvg=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  return (match?.[1] || match?.[2] || match?.[3] || '').trim() || null;
}

self.addEventListener('message', (e: MessageEvent<{ m3uText: string }>) => {
  try {
    const { m3uText } = e.data;
    if (!m3uText) {
      throw new Error('Nenhum texto de playlist fornecido para o worker');
    }

    console.log('[Worker] Iniciando parsing de playlist...');
    const startTime = performance.now();

    const categories = M3UParser.parse(m3uText);
    const epgUrl = extractEpgUrl(m3uText);

    const duration = performance.now() - startTime;
    console.log(`[Worker] Parsing concluido com sucesso em ${duration.toFixed(2)}ms.`);

    self.postMessage({ success: true, data: { categories, epgUrl } });
  } catch (err: any) {
    console.error('[Worker] Erro fatal durante o parsing:', err.message);
    self.postMessage({ success: false, error: err.message });
  }
});
