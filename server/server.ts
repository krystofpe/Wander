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
  /** The page is alive (it calls this every few seconds). */
  beat?(): void;
  /** The creature (`npm run creature`): its saved life as written, or null for a new one. */
  loadCreature?(): Promise<unknown>;
  saveCreature?(life: unknown): Promise<void>;
  /** Its words from Claude for a moment, or null (no credentials, too soon, failure); and whose words they are. */
  creatureSay?(request: unknown): Promise<unknown>;
  creatureMind?(): { mind: 'claude' | 'local'; model: string | null };
  /** The mode you are in, so the next start opens it (the pages say when you switch). */
  setMode?(mode: string): Promise<void>;
  /** It came through its portal and sat by his fire (his page says so): its save keeps the visit. */
  creatureVisit?(request: unknown): Promise<boolean>;
};

export type Running = {
  readonly url: string;
  readonly server: Server;
  /** Pages listening on the event stream. */
  listeners(): number;
  /** Sends an event to every page listening (`save`: save the road now). */
  tell(event: string): void;
  close(): Promise<void>;
};

const LIMIT = 1 << 20;

const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

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
  /** Open event streams to pages (server-sent events), so the server can ask a page to save before it stops. */
  const streams = new Set<ServerResponse>();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    // Only this machine's own pages: the Host must be the loopback address (no DNS rebinding), and a request that
    // says where it comes from must come from here (no other web page writing the road or spending thoughts).
    const origin = req.headers.origin;
    if (!LOCAL.test(req.headers.host ?? '') || (origin !== undefined && origin !== 'null' && !LOCAL_ORIGIN.test(origin))) return send(res, 403, MIME['.txt'], 'forbidden');
    const handle = async (): Promise<void> => {
      if (route === 'GET /' || route === 'GET /index.html') return serveFile(root, 'web/index.html', res);
      if (route === 'GET /creature' || route === 'GET /creature/') return serveFile(root, 'web/creature/index.html', res);
      if (route === 'GET /api/creature' && api.loadCreature !== undefined) return json(res, 200, { life: await api.loadCreature(), ...(api.creatureMind?.() ?? { mind: 'local', model: null }) });
      if ((route === 'PUT /api/creature' || route === 'POST /api/creature') && api.saveCreature !== undefined) {
        await api.saveCreature(JSON.parse(await body(req)));
        return json(res, 200, { ok: true });
      }
      if (route === 'POST /api/creature/visit' && api.creatureVisit !== undefined) {
        return json(res, 200, { kept: await api.creatureVisit(JSON.parse(await body(req))) });
      }
      if (route === 'POST /api/creature/say' && api.creatureSay !== undefined) {
        const reply = await api.creatureSay(JSON.parse(await body(req)));
        return json(res, 200, { reply, ...(api.creatureMind?.() ?? { mind: 'local', model: null }) });
      }
      if (route === 'GET /api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': listening\n\n');
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }
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
      if (route === 'POST /api/mode' && api.setMode !== undefined) {
        const m = (JSON.parse(await body(req)) as { mode?: unknown }).mode;
        await api.setMode(typeof m === 'string' ? m : 'wander');
        return json(res, 200, { ok: true });
      }
      if (route === 'POST /api/beat') {
        api.beat?.();
        return json(res, 200, { ok: true });
      }
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
        listeners: () => streams.size,
        tell: (event) => {
          for (const r of streams) r.write(`event: ${event}\ndata: \n\n`);
        },
        close: () =>
          new Promise<void>((done) => {
            for (const r of streams) r.end();
            streams.clear();
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
