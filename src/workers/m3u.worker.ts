import { M3UParser } from '../lib/m3uParser';

self.addEventListener('message', (e: MessageEvent<{ m3uText: string }>) => {
  try {
    const { m3uText } = e.data;
    if (!m3uText) {
       throw new Error('Nenhum texto de playlist fornecido para o worker');
    }

    console.log(`[Worker] Iniciando parsing de playlist...`);
    const startTime = performance.now();
    
    // Processamento pesado isolado em Background
    const categories = M3UParser.parse(m3uText);
    
    const duration = performance.now() - startTime;
    console.log(`[Worker] Parsing concluído com sucesso em ${duration.toFixed(2)}ms.`);

    self.postMessage({ success: true, data: categories });
  } catch (err: any) {
    console.error(`[Worker] Erro fatal durante o parsing:`, err.message);
    self.postMessage({ success: false, error: err.message });
  }
});
