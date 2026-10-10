// npm run site:check -- [--out DIR] [--size WxH] [--also MS]
// Checks the published page as GitHub Pages will serve it: the built files (npm run site) under /Wander/ on a plain
// static server, nothing else. That it starts with no server behind it and asks for nothing that is not there; that
// the wanderer it shows is the one live.ts computes for that step (so the same for everyone); that the hour turns
// without a jump; that the page tells how to hear it; that it loads Google Analytics. Writes pictures of a few moments
// to DIR.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { HEADLESS_FLAGS, findChromium } from '../server/browser.ts';
import { LIVE, LIVE_SEED, liveAt, liveEnv, msOfStep } from '../src/live.ts';
import { ROOT, flags } from './headless.ts';

const f = flags(process.argv.slice(2));
const dist = join(ROOT, 'dist');
const out = f.get('out') ?? join(ROOT, 'site-check');
const [w, h] = (f.get('size') ?? '1600x900').split('x').map(Number);
mkdirSync(out, { recursive: true });

// GitHub Pages: a project site under /Wander/, files as they are, the usual types, 404 for anything else.
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain' };
const asked: string[] = [];
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  asked.push(`${req.method} ${url.pathname}`);
  let path = url.pathname;
  if (!path.startsWith('/Wander/')) return void res.writeHead(404).end();
  path = path.slice('/Wander/'.length) || 'index.html';
  const file = join(dist, normalize(path));
  try {
    if (!file.startsWith(dist) || !statSync(file).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/Wander/`;

const exe = findChromium();
if (exe === null) throw new Error('Chromium not found; set WANDER_CHROMIUM');
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--headless=new', ...HEADLESS_FLAGS] });
const lines: string[] = [];
const say = (s: string): void => {
  lines.push(s);
  process.stdout.write(`${s}\n`);
};
let failed = false;
const check = (ok: boolean, what: string): void => {
  say(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};

type Live = { step: number; at: number; stage: string; clock: number; drawnAt: number; waiting: boolean | null };
type W = { ready: boolean; error: string | null; liveStep(): Live; moment(): Record<string, unknown> };
const errors: string[] = [];
// Google Analytics answers with nothing here, so checking the page counts no visits and needs no network.
const GOOGLE = /^https:\/\/[^/]*(googletagmanager|google-analytics)\.com\//;
const tags: string[] = [];
async function openAt(query: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.route(GOOGLE, (route) => {
    tags.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${base}${query}`);
  await page.waitForFunction(() => {
    const x = (window as unknown as { __wander?: W }).__wander;
    return x !== undefined && (x.ready || x.error !== null);
  }, undefined, { timeout: 60000, polling: 100 });
  return page;
}
const liveOf = (page: Page): Promise<Live> => page.evaluate(() => (window as unknown as { __wander: W }).__wander.liveStep());
const env = liveEnv(LIVE_SEED);

try {
  // 1. Now, as anyone opening the page sees it.
  const t0 = performance.now();
  const now = await openAt('');
  say(`opened ${base} in ${Math.round(performance.now() - t0)} ms`);
  await now.waitForTimeout(2500);
  const a = await liveOf(now);
  const node = liveAt(LIVE_SEED, a.step, env);
  check(Math.abs(node.at - a.at) < 1e-9 && node.stage === a.stage, `the page is where live.ts puts him at step ${a.step}: ${a.at.toFixed(3)} m, ${a.stage} (live.ts: ${node.at.toFixed(3)} m, ${node.stage})`);
  // A second visitor a few seconds later finds him where the first one, watching all along, sees him.
  const second = await openAt('');
  await second.waitForTimeout(1500);
  const [b1, b2] = await Promise.all([liveOf(now), liveOf(second)]);
  const same = b1.step === b2.step ? Math.abs(b1.at - b2.at) < 1e-9 && b1.stage === b2.stage : Math.abs(b1.step - b2.step) <= 2;
  check(same, `two visitors agree: steps ${b1.step} and ${b2.step}, ${b1.at.toFixed(3)} and ${b2.at.toFixed(3)} m`);
  // A browser that holds the sound until the page is touched is told to click; one that lets it play (headless
  // Chromium does) is told the key.
  const hint = await now.evaluate(() => document.getElementById('hint')?.textContent ?? '');
  const hintShown = await now.evaluate(() => document.getElementById('hint')?.classList.contains('shown') ?? false);
  check(hintShown && hint.startsWith(a.waiting === true ? 'click for sound' : 'M sound'), `the hint shows (sound ${a.waiting === true ? 'held' : 'playing'}): "${hint}"`);
  await now.mouse.click(w / 2, h / 2);
  await now.waitForTimeout(1200);
  const after = await liveOf(now);
  check(after.waiting === false, 'a click lets the sound play');
  writeFileSync(join(out, 'now.png'), await now.screenshot());
  await second.close();
  await now.close();

  // 2. The turn of an hour, at 20 times speed from a minute before it: no jump where one hour's walk meets the next camp.
  const hour = 41;
  const before = msOfStep(hour * 7200) - 60_000;
  const turn = await openAt(`?now=${before}&speed=20`);
  const samples: { step: number; drawn: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const s = await liveOf(turn);
    samples.push({ step: s.step, drawn: s.drawnAt });
    await turn.waitForTimeout(80);
  }
  let worst = 0;
  for (let i = 1; i < samples.length; i++) worst = Math.max(worst, Math.abs(samples[i].drawn - samples[i - 1].drawn));
  const crossed = samples[0].step < hour * 7200 && samples[samples.length - 1].step > hour * 7200;
  check(crossed && worst < 0.01, `the hour turns (steps ${samples[0].step} → ${samples[samples.length - 1].step}) with him still by the fire: largest move between samples ${worst.toFixed(4)} m`);
  await turn.close();

  // 3. Pictures of an hour, everyone's: asleep, walking in the morning, the afternoon, dusk at camp, night by the fire.
  const day = 4321;
  for (const [name, minute] of [['asleep', 5], ['morning', 18], ['afternoon', 33], ['camp', 47], ['night', 56]] as const) {
    const page = await openAt(`?now=${msOfStep(day * 7200) + minute * 60_000}&speed=0.0001`);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => (window as unknown as { __wander: W }).__wander.moment());
    say(`  ${name} (:${String(minute).padStart(2, '0')}): day ${m.day} ${m.hour}h, ${m.biome}, ${m.weather}, ${m.stage}${m.fire ? `, fire ${m.fire}` : ''}`);
    writeFileSync(join(out, `${name}.png`), await page.screenshot());
    await page.close();
  }

  if (f.has('also')) {
    const page = await openAt(`?now=${f.get('also')}&speed=0.0001`);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => (window as unknown as { __wander: W }).__wander.moment());
    say(`  also: day ${m.day} ${m.hour}h, ${m.biome}, ${m.weather}, ${m.stage}, smoking ${m.smoking}`);
    writeFileSync(join(out, 'also.png'), await page.screenshot());
    await page.close();
  }

  const ga = tags.find((u) => u.startsWith('https://www.googletagmanager.com/gtag/js?id=G-'));
  check(ga !== undefined, `the page loads Google Analytics${ga !== undefined ? ` (${new URL(ga).searchParams.get('id')})` : ''}`);
  const strange = asked.filter((r) => !r.startsWith('GET /Wander/'));
  check(strange.length === 0, `asked only for its own files${strange.length > 0 ? `; also: ${[...new Set(strange)].join(', ')}` : ''}`);
  const missing = errors.filter((e) => !/AudioContext was not allowed to start/.test(e));
  check(missing.length === 0, `no errors on the page${missing.length > 0 ? `: ${missing.slice(0, 5).join(' | ')}` : ''}`);
  say(`the live road: "${LIVE.word}", from ${new Date(LIVE.epoch).toISOString()}`);
} finally {
  await browser.close();
  server.close();
}
writeFileSync(join(out, 'check.txt'), `${lines.join('\n')}\n`);
if (failed) process.exitCode = 1;
