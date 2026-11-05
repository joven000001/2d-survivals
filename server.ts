process.env.DISABLE_HMR = 'true';
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const isTsxLoaded =
  process.execArgv.some((a) => a.includes('tsx')) ||
  Boolean(process.env.NODE_OPTIONS?.includes('tsx'));

if (!isTsxLoaded) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 0);
}

async function startServer() {
  const [{ createServer }, express, path, { fileURLToPath }] = await Promise.all([
    import('node:http'),
    import('express').then((m) => m.default),
    import('node:path').then((m) => m.default),
    import('node:url'),
  ]);
  const { setupAuthRoutes, setupMultiplayerWebSocket } = await import('./server/index');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app = express();
  const port = Number(process.env.PORT === '8080' ? 3000 : (process.env.PORT || 3000));
  const host = process.env.HOST || '0.0.0.0';
  const isProduction = process.env.NODE_ENV === 'production';

  const httpServer = createServer(app);

  app.use(express.json({ limit: '1mb' }));
  setupAuthRoutes(app);
  setupMultiplayerWebSocket(httpServer);

  if (!isProduction) {
    process.env.DISABLE_HMR = 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host, port, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(port, host, () => {
    console.log(`Pixel Frontier running at http://${host}:${port}`);
  });
}

startServer();
