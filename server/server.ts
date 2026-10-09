// The small local server: the page, its TypeScript (types stripped, no bundler), the journey save and the thoughts.
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { extname, join, normalize, sep } from 'node:path';
import type { AddressInfo } from 'node:net';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** Folders under the project root the page may load from. */
const PUBLIC = ['src', 'web', 'assets'];

/** What the page's API needs from the rest of the server. */
export type Api = {
  /** The journey to continue (already caught up on the time away), or null for a new road. */
  loadJourney(): Promise<unknown>;
  saveJourney(journey: unknown): Promise<void>;
  /** A thought from Claude for this context, or null (no credentials, rate limit, failure). Never slow to fail. */
  thought(context: unknown): Promise<{ text: string } | null>;
  mind(): 'claude' | 'local';
};

export type Running = { readonly url: string; readonly server: Server; close(): Promise<void> };

const LIMIT = 1 << 20;

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > LIMIT) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, type: string, data: string | Buffer): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(data);
}

const json = (res: ServerResponse, status: number, value: unknown): void => send(res, status, MIME['.json'], JSON.stringify(value));

/** Stripped TypeScript, kept until the file changes. */
const stripped = new Map<string, { mtime: number; code: string }>();

async function serveFile(root: string, path: string, res: ServerResponse): Promise<void> {
  const rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '');
  const top = rel.split(sep)[0];
  if (rel.includes('..') || !PUBLIC.includes(top)) return send(res, 404, MIME['.txt'], 'not found');
  const file = join(root, rel);
  let info;
  try {
    info = await stat(file);
  } catch {
    return send(res, 404, MIME['.txt'], 'not found');
  }
  if (!info.isFile()) return send(res, 404, MIME['.txt'], 'not found');
  const ext = extname(file);
  if (ext === '.ts') {
    const cached = stripped.get(file);
    if (cached !== undefined && cached.mtime === info.mtimeMs) return send(res, 200, MIME['.ts'], cached.code);
    const code = stripTypeScriptTypes(await readFile(file, 'utf8'));
    stripped.set(file, { mtime: info.mtimeMs, code });
    return send(res, 200, MIME['.ts'], code);
  }
  return send(res, 200, MIME[ext] ?? 'application/octet-stream', await readFile(file));
}

/** Starts the server on 127.0.0.1 (port 0 picks a free one). */
export function startServer(root: string, api: Api, port = 0): Promise<Running> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    const handle = async (): Promise<void> => {
      if (route === 'GET /' || route === 'GET /index.html') return serveFile(root, 'web/index.html', res);
      if (route === 'GET /api/journey') return json(res, 200, { journey: await api.loadJourney(), mind: api.mind() });
      if (route === 'PUT /api/journey' || route === 'POST /api/journey') {
        await api.saveJourney(JSON.parse(await body(req)));
        return json(res, 200, { ok: true });
      }
      if (route === 'POST /api/thought') {
        const reply = await api.thought(JSON.parse(await body(req)));
        return json(res, 200, { thought: reply?.text ?? null, mind: api.mind() });
      }
      if (route === 'GET /api/mind') return json(res, 200, { mind: api.mind() });
      if (req.method === 'GET') return serveFile(root, url.pathname, res);
      return send(res, 405, MIME['.txt'], 'method not allowed');
    };
    handle().catch((err: unknown) => {
      if (!res.headersSent) json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      else res.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${p}/`,
        server,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
