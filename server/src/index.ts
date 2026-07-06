import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { loadEnv } from './env.js';
import { createApp } from './app.js';

const env = loadEnv();
const { app } = createApp(env);
const port = Number(env.NODE_ENV === 'production' ? env.PORT : env.API_PORT);
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, '../../web/dist');

if (existsSync(webDist)) {
  app.get('*', async (c) => {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api')) return c.notFound();
    const indexPath = join(webDist, 'index.html');
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf8'));
    }
    return c.text('Not found', 404);
  });
}

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientWs: WebSocket, _req: unknown, guid: string) => {
  const upstream = new WebSocket(`wss://relay.pishock.com/${guid}`);

  upstream.on('open', () => {
    clientWs.on('message', (data: RawData) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
    });
    upstream.on('message', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
    });
  });

  upstream.on('error', () => clientWs.close());
  upstream.on('close', () => clientWs.close());
  clientWs.on('close', () => upstream.close());
  clientWs.on('error', () => upstream.close());
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && !url.pathname.startsWith('/api') && existsSync(webDist)) {
    const filePath = join(webDist, url.pathname === '/' ? 'index.html' : url.pathname);
    if (existsSync(filePath) && !filePath.includes('..')) {
      const content = readFileSync(filePath);
      const ext = filePath.split('.').pop() || '';
      const types: Record<string, string> = {
        html: 'text/html',
        js: 'application/javascript',
        css: 'text/css',
        json: 'application/json',
        png: 'image/png',
        svg: 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(content);
      return;
    }
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    const response = await app.fetch(
      new Request(url.toString(), { method: req.method, headers, body }),
      {}
    );
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const match = url.pathname.match(/^\/api\/login-relay\/([^/]+)$/);
  if (!match) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, match[1]);
  });
});

server.listen(port, () => {
  console.log(`PiShock server listening on http://localhost:${port}`);
  console.log(`Login relay WS: ws://localhost:${port}/api/login-relay/{guid}`);
});
