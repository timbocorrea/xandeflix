export default async function handler(req: any, res: any) {
  try {
    const { default: app } = await import('../server.ts');
    return app(req, res);
  } catch (error: any) {
    console.error('[VERCEL] Function bootstrap failed:', error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: 'Function bootstrap failed',
        message: error?.message || 'Unknown error',
        name: error?.name || 'Error',
      }));
    }
  }
}
