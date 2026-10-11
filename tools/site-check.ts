// npm run site:check -- [--out DIR] [--size WxH] [--also MS]
// Checks the published page as GitHub Pages will serve it: the built files (npm run site) under /Wander/ on a plain
// static server, nothing else. That it starts with no server behind it and asks for nothing that is not there; that
// the wanderer it shows is the one live.ts computes for that step (so the same for everyone); that the hour turns
// without a jump; that the page tells how to hear it; that both pages load Google Analytics. And the creature beside
// it: a creature of the visitor's own, kept in their browser, following the live road, gone up through its ring to his
// camp when the live road camps; Tab from one to the other and back, and the last one opens again. Writes pictures of
// a few moments to DIR.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page, Route } from 'playwright-core';
import { HEADLESS_FLAGS, findChromium } from '../server/browser.ts';
import { boundVisit } from '../src/wisp/journey.ts';
import type { Life, LifeEvent } from '../src/life.ts';
import { LIVE, LIVE_SEED, STEPS_PER_DAY, liveAt, liveEnv, msOfStep, stepLive } from '../src/live.ts';
import { ROOT, flags } from './headless.ts';
import { pagesServer } from './pages.ts';

const f = flags(process.argv.slice(2));
const dist = join(ROOT, 'dist');
const out = f.get('out') ?? join(ROOT, 'site-check');
const [w, h] = (f.get('size') ?? '1600x900').split('x').map(Number);
mkdirSync(out, { recursive: true });

// GitHub Pages: a project site under /Wander/, files as they are, the usual types, 404 for anything else.
const asked: string[] = [];
const server = await pagesServer(dist, 0, asked);
const base = server.base;

/** The first moment (ms) from the road's start when the creature sits with him at his camp on the live road. */
function visitMoment(): number | null {
  const env = liveEnv(LIVE_SEED);
  const events: LifeEvent[] = [];
  let l: Life = liveAt(LIVE_SEED, 0, env);
  for (let n = 1; n < 100 * STEPS_PER_DAY; n++) {
    l = stepLive(l, n, env, events);
    const v = boundVisit(l);
    if (v !== null && v.phase === 'with' && v.k > 0.3) return msOfStep(n);
  }
  return null;
}

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
// Google Analytics answers with nothing here, so checking the pages counts no visits and needs no network; which
// page asked is kept, so both are seen to load it.
const GOOGLE = /^https:\/\/[^/]*(googletagmanager|google-analytics)\.com\//;
const tags: { tag: string; page: string }[] = [];
const quiet = (route: Route): Promise<void> => {
  tags.push({ tag: route.request().url(), page: route.request().frame().url() });
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
};
async function openAt(query: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.route(GOOGLE, quiet);
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

type C = { ready: boolean; error: string | null; crossing: string | null; realm: string };
/** Waits for whichever page is there to be drawn: the road (`__wander`) or the creature's (`__creature`). */
async function drawn(page: Page, which: '__wander' | '__creature'): Promise<boolean> {
  try {
    await page.waitForFunction((k) => {
      const x = (window as unknown as Record<string, { ready: boolean; error: string | null } | undefined>)[k];
      return x !== undefined && (x.ready || x.error !== null);
    }, which, { timeout: 60000, polling: 100 });
    return await page.evaluate((k) => (window as unknown as Record<string, { error: string | null }>)[k].error === null, which);
  } catch {
    return false;
  }
}
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

  // 4. The creature: a visitor's own creature, born in their browser and kept there; on the live road; Tab between them.
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.route(GOOGLE, quiet);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}creature/`);
    check(await drawn(page, '__creature'), `the creature's page opens at ${base}creature/ with no server behind it`);
    await page.waitForTimeout(1500);
    const first = await page.evaluate(() => {
      const frame = document.getElementById('dream-road') as HTMLIFrameElement;
      return { seed: JSON.parse(localStorage.getItem('wander.wisp.v1') ?? '{}').seed, site: frame.contentDocument?.documentElement.hasAttribute('data-site'), kept: localStorage.getItem('wander.wisp.v1') !== null, mode: localStorage.getItem('wander.mode') };
    });
    check(first.site === true, 'the dreaming follows the actual live road');
    check(first.kept && first.mode === 'creature', 'the wisp is kept in this browser, and the dreaming is the mode last open');
    writeFileSync(join(out, 'dreaming.png'), await page.screenshot());
    // Tab: to the road and back again; then the road's address opens the creature, the mode last open.
    await page.keyboard.press('Tab');
    await page.waitForURL((u) => !u.pathname.includes('creature'), { timeout: 10000 });
    check(await drawn(page, '__wander') && (await page.evaluate(() => localStorage.getItem('wander.mode'))) === 'wander', `Tab opens the road: ${page.url()}`);
    await page.waitForTimeout(800);
    await page.keyboard.press('Tab');
    await page.waitForURL((u) => u.pathname.includes('creature'), { timeout: 10000 });
    check(await drawn(page, '__creature'), `and Tab again the creature: ${page.url()}`);
    const again = await page.evaluate(() => JSON.parse(localStorage.getItem('wander.wisp.v1') ?? '{}').seed);
    check(again === first.seed, `the same wisp, from this browser: ${again}`);
    await page.goto(base);
    await page.waitForURL((u) => u.pathname.includes('creature'), { timeout: 10000 });
    check(await drawn(page, '__creature'), `opening the road's address again opens the creature, the mode last open`);
    await ctx.close();
    // When the creature sits with him at his camp on the live road, it is gone up through its ring here.
    const ms = visitMoment();
    if (ms === null) check(false, 'the creature visits his camp within 100 hours of the live road');
    else {
      const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await p.route(GOOGLE, quiet);
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(`${base}?now=${ms}&speed=0.0001`);
      await drawn(p, '__wander');
      await p.waitForTimeout(1200);
      const there = await p.evaluate(() => (window as unknown as { __wander: { visit(): { phase: string } | null } }).__wander.visit());
      check(there !== null && there.phase === 'with', `on the road it sits by his fire at night, come up through its ring (${new Date(ms).toISOString()})`);
      writeFileSync(join(out, 'visit.png'), await p.screenshot());
      await p.goto(`${base}creature/?now=${ms}&speed=0.0001&seed=moss&user=Krystof`);
      await drawn(p, '__creature');
      await p.waitForTimeout(1200);
      await p.waitForFunction(() => (window as unknown as { __creature: C }).__creature?.crossing === 'with', undefined, { timeout: 15000 });
      const r = await p.evaluate(() => (window as unknown as { __creature: C }).__creature.crossing);
      check(r === 'with', 'the dreaming and road agree on the same crossing');
      await p.close();
    }
  }

  if (f.has('also')) {
    const page = await openAt(`?now=${f.get('also')}&speed=0.0001`);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => (window as unknown as { __wander: W }).__wander.moment());
    say(`  also: day ${m.day} ${m.hour}h, ${m.biome}, ${m.weather}, ${m.stage}, smoking ${m.smoking}`);
    writeFileSync(join(out, 'also.png'), await page.screenshot());
    await page.close();
  }

  const gaOn = (creature: boolean): string | undefined =>
    tags.find((t) => t.tag.startsWith('https://www.googletagmanager.com/gtag/js?id=G-') && new URL(t.page).pathname.includes('/creature') === creature)?.tag;
  const ga = gaOn(false);
  check(ga !== undefined, `the page loads Google Analytics${ga !== undefined ? ` (${new URL(ga).searchParams.get('id')})` : ''}`);
  check(gaOn(true) !== undefined, "and so does the creature's page");
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
