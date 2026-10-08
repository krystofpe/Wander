// The network and the cache: the only module that fetches or touches the cache directory.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { REAL } from './config.ts';

export type FetchInit = {
  readonly method?: string;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Aborts the request when `Net`'s timeout passes. */
  readonly signal?: AbortSignal;
};
export type FetchResponse = { readonly ok: boolean; readonly status: number; bytes(): Promise<Uint8Array> };
/** What `Net` needs from `fetch`; tests pass a fake. */
export type Fetcher = (url: string, init: FetchInit) => Promise<FetchResponse>;

/** `$XDG_CACHE_HOME/wander`, or `~/.cache/wander`. */
export function defaultCacheDir(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const xdg = env.XDG_CACHE_HOME;
  const base = xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.cache');
  return join(base, 'wander');
}

const realFetcher: Fetcher = async (url, init) => {
  const res = await fetch(url, { method: init.method, body: init.body, headers: init.headers, signal: init.signal });
  return { ok: res.ok, status: res.status, bytes: async () => new Uint8Array(await res.arrayBuffer()) };
};

export class Net {
  readonly cacheDir: string;
  /** Fetches currently running. */
  inFlight = 0;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;

  constructor(cacheDir: string, fetcher: Fetcher = realFetcher, timeoutMs: number = REAL.fetchTimeoutMs) {
    this.cacheDir = cacheDir;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }

  /** The cached file if there is one; otherwise fetches, stores and returns it. Throws on a failed, timed-out or non-2xx fetch. */
  async get(url: string, cacheFile: string, init: FetchInit = {}): Promise<Uint8Array> {
    const path = join(this.cacheDir, cacheFile);
    if (existsSync(path)) return new Uint8Array(readFileSync(path));
    this.inFlight++;
    try {
      const res = await this.fetcher(url, {
        ...init,
        headers: { 'User-Agent': REAL.userAgent, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      const bytes = await res.bytes();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
      return bytes;
    } finally {
      this.inFlight--;
    }
  }

  /** Deletes a cached file, so the next `get` fetches it again. */
  forget(cacheFile: string): void {
    rmSync(join(this.cacheDir, cacheFile), { force: true });
  }
}
