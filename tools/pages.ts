// The published page as GitHub Pages serves it: the built files (npm run site) under /Wander/ on a plain static
// server, the usual types, 404 for anything else. For npm run site -- --serve, and for npm run site:check.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain' };

/** Serves `dist` under /Wander/ (a folder's index.html for its address, as Pages does); `asked` gets every request. */
export async function pagesServer(dist: string, port = 0, asked?: string[]): Promise<{ readonly base: string; close(): void }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    asked?.push(`${req.method} ${url.pathname}`);
    if (url.pathname === '/') return void res.writeHead(302, { location: '/Wander/' }).end();
    if (!url.pathname.startsWith('/Wander/')) return void res.writeHead(404).end();
    const path = url.pathname.slice('/Wander/'.length);
    const file = join(dist, normalize(path === '' || path.endsWith('/') ? `${path}index.html` : path));
    try {
      if (!file.startsWith(dist) || !statSync(file).isFile()) throw new Error('not a file');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/Wander/`, close: () => server.close() };
}
