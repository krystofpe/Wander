// npm run check: end-to-end checks through the real `npm start` server (run with --no-browser) and a headless page.
//  1. Offline: the bar says `mind: local` and his own voice speaks.
//  2. The road is saved, and reopening continues it; three hours away move him on and fill the log.
//  3. With a key, thoughts come from Claude (a local stand-in for the Messages API, reached by the real SDK through
//     ANTHROPIC_BASE_URL) and the bar says `mind: claude`.
//  4. A slow API, a failing one and a refused key never hold anything up: frames keep coming, his own voice answers.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { HEADLESS_FLAGS, findChromium } from '../server/browser.ts';
import { ROOT } from '../server/root.ts';

type Mode = 'ok' | 'slow' | 'fail' | 'auth';
const MOCK_THOUGHT = 'The road keeps its own counsel tonight.';

/** A stand-in for the Messages API: answers like Claude would, slowly, with a server error, or refusing the key. */
async function mockApi(mode: Mode): Promise<{ url: string; calls: Record<string, unknown>[]; close(): void }> {
  const calls: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      calls.push({ path: req.url, beta: req.headers['anthropic-beta'], ...(JSON.parse(body || '{}') as Record<string, unknown>) });
      const send = (status: number, value: unknown): void => {
        if (res.destroyed) return;
        res.writeHead(status, { 'content-type': 'application/json', 'request-id': `req_mock_${calls.length}` });
        res.end(JSON.stringify(value));
      };
      if (mode === 'fail') return send(500, { type: 'error', error: { type: 'api_error', message: 'mock failure' } });
      if (mode === 'auth') return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      const reply = { id: `msg_mock_${calls.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ thought: MOCK_THOUGHT }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
      if (mode === 'slow') setTimeout(() => send(200, reply), 60_000).unref();
      else send(200, reply);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls, close: () => server.close() };
}

/** Runs `npm start -- --no-browser` and waits for its address. */
async function startWander(save: string, env: Record<string, string>): Promise<{ url: string; proc: ChildProcess; out: string[] }> {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ANTHROPIC_') && k !== 'WANDER_MODEL')) as Record<string, string>;
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(ROOT, 'server', 'main.ts'), '--no-browser', '--save', save], { env: { ...clean, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out: string[] = [];
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no address: ${out.join('')}`)), 20_000);
    proc.stdout?.on('data', (c: Buffer) => {
      out.push(c.toString());
      const m = out.join('').match(/walking at (\S+)/);
      if (m !== null) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.stderr?.on('data', (c: Buffer) => out.push(c.toString()));
  });
  return { url, proc, out };
}

type W = { ready: boolean; frames: number; thoughts: string[]; life: { at: number; clock: number; log: unknown[] }; error: string | null };
const wander = (page: Page): Promise<W> => page.evaluate(() => (window as unknown as { __wander: W }).__wander);

async function openPage(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => process.stderr.write(`[page error] ${e.message}\n`));
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { __wander?: W }).__wander?.ready === true, undefined, { timeout: 60_000 });
  return page;
}

async function bar(page: Page): Promise<string> {
  await page.keyboard.press('h');
  await page.waitForTimeout(700);
  const text = await page.evaluate(() => document.getElementById('bar')?.textContent ?? '');
  await page.keyboard.press('h');
  return text;
}

const results: string[] = [];
const ok = (cond: boolean, what: string): void => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${what}`);
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${what}\n`);
};

const exe = findChromium();
if (exe === null) throw new Error('Chromium not found');
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--headless=new', ...HEADLESS_FLAGS] });
const dir = mkdtempSync(join(tmpdir(), 'wander-check-'));
try {
  // ── 1 and 2: offline, saving, reopening, time away ──────────────────────────────────────────────────────────────
  {
    const save = join(dir, 'journey.json');
    const w = await startWander(save, {});
    ok(w.out.join('').includes('mind: local'), `the server starts offline without a key: "${w.out.join('').trim().split('\n')[1]?.trim()}"`);
    const page = await openPage(browser, w.url);
    const b = await bar(page);
    ok(b.includes('mind: local'), `the bar says mind: local — "${b}"`);
    // Let it walk past one save (every 30 s), then close the page (it saves once more as it goes).
    await page.waitForTimeout(36_000);
    const before = await wander(page);
    await page.close();
    await new Promise((r) => setTimeout(r, 1500));
    const saved = JSON.parse(readFileSync(save, 'utf8')) as { word: string; savedAt: number; life: { at: number; clock: number; log: unknown[] } };
    ok(saved.life.at > 0 && Math.abs(saved.life.at - before.life.at) < 5, `closing saved the road "${saved.word}" at ${saved.life.at.toFixed(1)} m (the page was at ${before.life.at.toFixed(1)} m)`);
    // Reopen at once: the same road, from where he was.
    const again = await openPage(browser, w.url);
    const back = await wander(again);
    ok(Math.abs(back.life.at - saved.life.at) < 3, `reopening continues the same road from ${back.life.at.toFixed(1)} m`);
    await again.close();
    await new Promise((r) => setTimeout(r, 1500));
    // Three hours away: the save is made three hours older, as if the window had been closed since.
    const now = JSON.parse(readFileSync(save, 'utf8')) as { word: string; savedAt: number; life: { at: number; clock: number; log: unknown[] } };
    now.savedAt -= 3 * 3600_000;
    writeFileSync(save, JSON.stringify(now));
    const later = await openPage(browser, w.url);
    const moved = await wander(later);
    const walked = moved.life.at - now.life.at;
    ok(walked > 6000 && walked < 7000, `after three hours away he has walked on ${walked.toFixed(0)} m (0.62 m/s average, capped at 20 km), the clock ${(moved.life.clock - now.life.clock).toFixed(1)} world hours on, ${moved.life.log.length - now.life.log.length} places logged on the way`);
    // The bar and the log are refreshed twice a second.
    await later.waitForTimeout(1200);
    const word = await later.evaluate(() => document.getElementById('log')?.textContent ?? '');
    ok(word.includes(now.word), `the log of places names the same road (“${now.word}”)`);
    await later.close();
    w.proc.kill();
  }
  // ── 3 and 4: Claude, and an API that is slow, failing or refuses the key ───────────────────────────────────────
  for (const mode of ['ok', 'slow', 'fail', 'auth'] as const) {
    const api = await mockApi(mode);
    const w = await startWander(join(dir, `journey-${mode}.json`), { ANTHROPIC_API_KEY: 'sk-ant-test-not-a-key', ANTHROPIC_BASE_URL: api.url });
    // speed 30 brings his first thought within a few seconds.
    const page = await openPage(browser, `${w.url}?speed=30&seed=check-${mode}`);
    const b0 = await bar(page);
    const f0 = (await wander(page)).frames;
    const t0 = Date.now();
    await page.waitForFunction(() => (window as unknown as { __wander: W }).__wander.thoughts.length > 0, undefined, { timeout: 90_000 });
    const s = await wander(page);
    const seconds = (Date.now() - t0) / 1000;
    const fps = (s.frames - f0) / seconds;
    const b1 = await bar(page);
    const call = api.calls[0] as { model?: string; output_config?: unknown; beta?: unknown; path?: string } | undefined;
    if (mode === 'ok') {
      ok(w.out.join('').includes('mind: claude'), `with a key the server says "${w.out.join('').trim().split('\n')[1]?.trim()}"`);
      ok(b0.includes('mind: claude'), `the bar says mind: claude — "${b0}"`);
      ok(s.thoughts[0] === MOCK_THOUGHT, `his thought came from the API: "${s.thoughts[0]}" (request: ${call?.path} model ${call?.model}, output_config ${JSON.stringify(call?.output_config)?.slice(0, 60)}…, anthropic-beta: ${String(call?.beta)})`);
    } else {
      ok(s.thoughts[0] !== MOCK_THOUGHT && s.thoughts[0].length > 0, `${mode === 'slow' ? 'a slow API (60 s)' : mode === 'fail' ? 'a failing API (500)' : 'a refused key (401)'}: his own voice answered after ${seconds.toFixed(1)} s — "${s.thoughts[0]}"; frames kept coming at ${fps.toFixed(0)} fps meanwhile`);
      if (mode === 'auth') ok(b1.includes('mind: local'), `once the key is refused the bar says mind: local — "${b1}"`);
    }
    await page.close();
    w.proc.kill();
    api.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(ROOT, 'docs', 'soak', 'check.txt'), `${results.join('\n')}\n`);
process.stdout.write(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed\n`);
