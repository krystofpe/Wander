// Headless Chromium on the GPU with the page served locally: shared by shot, tour, motion, bench and soak.
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { HEADLESS_FLAGS, findChromium } from '../server/browser.ts';
import { startServer } from '../server/server.ts';
import type { Api, Running } from '../server/server.ts';

import { ROOT } from '../server/root.ts';

export { ROOT };

/** A journey store that keeps nothing: the tools never touch the real save. */
export const NO_SAVE: Api = {
  loadJourney: async () => null,
  saveJourney: async () => {},
  thought: async () => null,
  mind: () => 'local',
};

export type Session = { readonly server: Running; readonly browser: Browser; close(): Promise<void> };

export async function session(api: Api = NO_SAVE): Promise<Session> {
  const exe = findChromium();
  if (exe === null) throw new Error('Chromium not found; set WANDER_CHROMIUM');
  const server = await startServer(ROOT, api);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--headless=new', ...HEADLESS_FLAGS] });
  return {
    server,
    browser,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}

export type Status = { ready: boolean; frames: number; renderer: string; error: string | null };

/** Opens the page at a size with these URL parameters and waits until it reports ready (or an error). */
export async function open(s: Session, w: number, h: number, query: URLSearchParams, log = false): Promise<{ page: Page; status: Status }> {
  const page = await s.browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (log || m.type() === 'error') process.stderr.write(`[page ${m.type()}] ${m.text()}\n`);
  });
  page.on('pageerror', (e) => process.stderr.write(`[page error] ${e.message}\n`));
  query.set('size', `${w}x${h}`);
  await page.goto(`${s.server.url}?${query.toString()}`);
  await page.waitForFunction(() => {
    const w = (window as unknown as { __wander?: Status }).__wander;
    return w !== undefined && (w.ready || w.error !== null);
  }, undefined, { timeout: 120000, polling: 100 });
  const status = (await page.evaluate(() => (window as unknown as { __wander: Status }).__wander)) as Status;
  if (status.error !== null) throw new Error(`the page failed: ${status.error}`);
  return { page, status };
}

/** Command-line flags as [name, value] pairs, for the tools' own options. */
export function flags(argv: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [name, inline] = a.slice(2).split('=', 2);
    if (inline !== undefined) out.set(name, inline);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out.set(name, argv[++i]);
    else out.set(name, '1');
  }
  return out;
}
