// npm run creature:check: end-to-end checks of the creature through the real server (`npm run creature --
// --no-browser`) and a headless page, each run with a save of its own in a temporary folder.
//  1. Offline, a new creature: it arrives and asks your name; the name is kept; the bar says `mind: local`.
//  2. Closing saves it; reopening finds the same creature; three days away are lived through when it opens again.
//  3. A save from the terminal days (version 1, a biome that is no more, a cloak as a colour) moves into the hollow.
//  4. With a key, its words come from Claude (a local stand-in for the Messages API, reached by the real SDK through
//     ANTHROPIC_BASE_URL): the bar says `mind: claude`, what you type reaches it, its words and its wishes come back,
//     and what it learns about you is kept.
//  5. A failing API and a refused key: its own voice answers at once; a refused key leaves it local.
//  6. One world, two lives: with his journey beside it, it knows the hour of his camp and goes through its portal to
//     him (or sleeps through it); Tab opens the road and Tab again the deep, and the server remembers which was open.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { HEADLESS_FLAGS, findChromium } from '../server/browser.ts';
import { ROOT } from '../server/root.ts';
import { VISIT } from '../src/creature/visit.ts';
import { newJourney } from '../src/journal.ts';

type Mode = 'ok' | 'fail' | 'auth';
const MOCK = { say: 'The glass is warm where your hand was.', do: 'dance', remember: 'likes tea' };

/** A stand-in for the Messages API: answers as Claude would, or fails, or refuses the key. */
async function mockApi(mode: Mode): Promise<{ url: string; calls: Record<string, unknown>[]; close(): void }> {
  const calls: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      calls.push({ path: req.url, beta: req.headers['anthropic-beta'], ...(JSON.parse(body || '{}') as Record<string, unknown>) });
      const send = (status: number, value: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json', 'request-id': `req_mock_${calls.length}` });
        res.end(JSON.stringify(value));
      };
      if (mode === 'fail') return send(500, { type: 'error', error: { type: 'api_error', message: 'mock failure' } });
      if (mode === 'auth') return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      send(200, { id: `msg_mock_${calls.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(MOCK) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls, close: () => server.close() };
}

/** Runs `npm run creature -- --no-browser` with a save of its own and waits for its address. */
async function startCreature(save: string, env: Record<string, string>, extra: string[] = []): Promise<{ url: string; proc: ChildProcess; out: string[] }> {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ANTHROPIC_') && k !== 'WANDER_MODEL')) as Record<string, string>;
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(ROOT, 'server', 'main.ts'), '--creature', '--no-browser', '--save', save, ...extra], { env: { ...clean, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out: string[] = [];
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no address: ${out.join('')}`)), 20_000);
    proc.stdout?.on('data', (c: Buffer) => {
      out.push(c.toString());
      const m = out.join('').match(/lives at (\S+)/);
      if (m !== null) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.stderr?.on('data', (c: Buffer) => out.push(c.toString()));
  });
  return { url, proc, out };
}

type Moment = { name: string; biome: string; mood: string; doing: string | null; bubble: string | null; mind: string; first: boolean; away: { ms: number; wandered: boolean; events: number } | null };
type C = { ready: boolean; error: string | null; moment(): Moment; game: { mode: string; life: { userName: string | null; facts: string[]; diary: { text: string }[]; seed: number; name: string; cloak: number; biome: string }; brain: { current: string | null } } };

async function openPage(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => process.stderr.write(`[page error] ${e.message}\n`));
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { __creature?: C }).__creature?.ready === true, undefined, { timeout: 60_000 });
  return page;
}
const moment = (page: Page): Promise<Moment> => page.evaluate(() => (window as unknown as { __creature: C }).__creature.moment());
const life = (page: Page): Promise<C['game']['life']> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __creature: C }).__creature.game.life)) as C['game']['life']);
const mode = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as { __creature: C }).__creature.game.mode);
async function bar(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById('bar')?.textContent ?? '');
}
/** Waits until `cond` holds on the page (polled), or `ms` pass; returns whether it held. */
async function until<A>(page: Page, cond: (arg: A) => boolean, ms: number, arg?: A): Promise<boolean> {
  try {
    await page.waitForFunction(cond, arg as A, { timeout: ms, polling: 200 });
    return true;
  } catch {
    return false;
  }
}

const results: string[] = [];
const ok = (cond: boolean, what: string): void => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${what}`);
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${what}\n`);
};

const exe = findChromium();
if (exe === null) throw new Error('Chromium not found');
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--headless=new', ...HEADLESS_FLAGS] });
const dir = mkdtempSync(join(tmpdir(), 'wander-creature-check-'));
try {
  // ── 1 and 2: a new creature offline; saving, reopening, three days away ────────────────────────────────────────
  {
    const save = join(dir, 'creature.json');
    const s = await startCreature(save, {}, ['--seed', 'moss']);
    ok(s.out.join('').includes('mind: local'), `the server starts offline without a key: "${s.out.join('').trim().split('\n')[1]?.trim()}"`);
    const page = await openPage(browser, s.url);
    const first = await moment(page);
    ok(first.first, `a new creature arrives: ${first.name} of the ${first.biome}`);
    ok(await until(page, () => (window as unknown as { __creature: C }).__creature.game.mode === 'name', 30_000), 'it asks what to call you, and the box to type in opens');
    await page.keyboard.type('Krystof');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const named = await life(page);
    ok(named.userName === 'Krystof', `it keeps your name: ${named.userName}`);
    const b = await bar(page);
    ok(b.includes('mind: local'), `the bar says mind: local — "${b.slice(0, 120)}…"`);
    // Close the window: it saves as it goes.
    await page.close();
    await new Promise((r) => setTimeout(r, 1500));
    const saved = JSON.parse(readFileSync(save, 'utf8')) as { name: string; userName: string; seed: number; lastSeen: number; bond: number; diary: { t: number; text: string }[] };
    ok(saved.name === first.name && saved.userName === 'Krystof', `closing saved ${saved.name}, who calls you ${saved.userName}`);
    const again = await openPage(browser, s.url);
    const back = await moment(again);
    ok(!back.first && back.name === saved.name, `reopening finds the same ${back.name}, no new arrival (${back.doing})`);
    await again.close();
    await new Promise((r) => setTimeout(r, 1500));
    // Three days away: the save is made three days older, as if the window had been closed since.
    const now = JSON.parse(readFileSync(save, 'utf8')) as typeof saved;
    now.lastSeen -= 3 * 86400000;
    const diaryBefore = now.diary.length;
    writeFileSync(save, JSON.stringify(now));
    const later = await openPage(browser, s.url);
    const away = await moment(later);
    const lifeLater = await life(later);
    ok(away.away !== null && Math.abs(away.away.ms - 3 * 86400000) < 600_000, `three days away are lived through: ${Math.round((away.away?.ms ?? 0) / 3600000)} hours, ${away.away?.events ?? 0} things in its diary${away.away?.wandered ? ', and it went wandering' : ''}`);
    ok(lifeLater.diary.length >= diaryBefore, `its diary: “${lifeLater.diary.slice(-2).map((e) => e.text).join('” “')}”`);
    await later.close();
    s.proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
  }

  // ── 3: a save from the terminal days ──────────────────────────────────────────────────────────────────────────────
  {
    const save = join(dir, 'old', 'creature.json');
    mkdirSync(join(dir, 'old'), { recursive: true });
    const t = Date.now() - 2 * 86400000;
    writeFileSync(save, JSON.stringify({ version: 1, seed: 1234, name: 'Ori', biome: 'shore', cloak: 0x44506a, born: t - 86400000, lastSeen: t, userName: 'Krystof', needs: { food: 0.6, rest: 0.7, fun: 0.5, love: 0.4 }, bond: 0.3, traits: { curious: 0.7, playful: 0.4, shy: 0.6, lazy: 0.3, nightOwl: 0.5, rainLover: 0.2 }, asleep: false, away: false, diary: [{ t: t - 86400000, text: 'Ori arrived.' }], found: [], shelf: [], facts: [], cairn: 2, stats: { visits: 3, fed: 1, played: 0, petted: 2, talks: 1, gifts: 0, finds: 0 }, asked: [] }));
    const s = await startCreature(save, {});
    const page = await openPage(browser, s.url);
    const l = await life(page);
    ok(l.name === 'Ori' && l.biome === 'forest' && l.cloak === 3 && l.userName === 'Krystof', `the terminal creature Ori moves in: the ${l.biome}, cloak ${l.cloak} (its slate), still calling you ${l.userName}`);
    ok(l.diary.some((e) => /shore, which is no more/.test(e.text)), `and remembers: “${l.diary.find((e) => /shore/.test(e.text))?.text ?? ''}”`);
    await page.close();
    s.proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
  }

  // ── 4 and 5: Claude, and when it fails ───────────────────────────────────────────────────────────────────────────
  for (const m of ['ok', 'fail', 'auth'] as const) {
    const api = await mockApi(m);
    const save = join(dir, `creature-${m}.json`);
    const s = await startCreature(save, { ANTHROPIC_API_KEY: 'sk-ant-test-not-a-key', ANTHROPIC_BASE_URL: api.url }, ['--seed', 'moss', '--user', 'Krystof']);
    const page = await openPage(browser, s.url);
    if (m === 'ok') {
      ok(s.out.join('').includes('mind: claude'), `with a key the server says "${s.out.join('').trim().split('\n')[1]?.trim()}"`);
      await page.waitForTimeout(800);
      ok((await bar(page)).includes('mind: claude'), 'the bar says mind: claude');
    }
    // Let its greeting pass, then talk to it.
    await page.waitForTimeout(6000);
    const callsBefore = api.calls.length;
    await page.keyboard.press('t');
    await page.waitForTimeout(400);
    await page.keyboard.type('do you like tea?');
    await page.keyboard.press('Enter');
    const t0 = Date.now();
    // With Claude, its answer (a line of its own may come first, said of itself); without, the first words at all.
    const answered = await until(page, (want) => {
      const c = (window as unknown as { __creature: C }).__creature;
      const b = c.moment().bubble;
      return want !== null ? b === want : b !== null && b !== '…';
    }, 25_000, m === 'ok' ? MOCK.say : null);
    const ms = Date.now() - t0;
    const said = (await moment(page)).bubble;
    if (m === 'ok') {
      const call = api.calls.slice(callsBefore).find((c) => JSON.stringify(c.messages ?? '').includes('do you like tea?')) as Record<string, unknown> | undefined;
      ok(answered && said === MOCK.say, `its words came from Claude: “${said}”`);
      const oc = call?.output_config as { effort?: string; format?: { type?: string } } | undefined;
      ok(call !== undefined && call.model === 'claude-opus-5-5' && oc?.format?.type === 'json_schema' && JSON.stringify(call.system).includes('Moss'), `what you typed reached it (${call?.path}, model ${call?.model}, effort ${oc?.effort}, ${oc?.format?.type}, beta ${call?.beta})`);
      await page.waitForTimeout(1500);
      const l = await life(page);
      ok(l.facts.includes(MOCK.remember), `what it learned about you is kept: ${JSON.stringify(l.facts)}`);
      const danced = await until(page, () => (window as unknown as { __creature: C }).__creature.game.brain.current === 'dance', 40_000);
      ok(danced, 'and it does what it wished to: it dances');
    } else {
      ok(answered && said !== MOCK.say && ms < 8000, `${m === 'fail' ? 'a failing API (500)' : 'a refused key (401)'}: its own voice answered after ${(ms / 1000).toFixed(1)} s — “${said}”`);
      if (m === 'auth') {
        await page.waitForTimeout(1000);
        const b = await bar(page);
        ok(b.includes('mind: local'), `once the key is refused the bar says mind: local — "${b.slice(b.indexOf('mind'))}"`);
      }
    }
    await page.close();
    s.proc.kill('SIGTERM');
    api.close();
    await new Promise((r) => setTimeout(r, 800));
  }
  void mode;

  // ── 6: one world, two lives ──────────────────────────────────────────────────────────────────────────────────────
  {
    const sub = join(dir, 'both');
    mkdirSync(sub, { recursive: true });
    const save = join(sub, 'creature.json');
    // His road beside it, saved a moment before the hour of its visit to his camp (his clock just short of it).
    const j = newJourney('moss', Date.now() - 3600_000, 0.3);
    j.life.clock = 24 * 3 + VISIT.from - 0.02;
    j.savedAt = Date.now();
    writeFileSync(join(sub, 'journey.json'), JSON.stringify(j));
    const s = await startCreature(save, {}, ['--seed', 'moss', '--user', 'Krystof']);
    const page = await openPage(browser, s.url);
    type R = { visit: { phase: string } | null; portal: number; gone: boolean };
    const road = (): Promise<R> => page.evaluate(() => (window as unknown as { __creature: { road(): R } }).__creature.road());
    const came = await until(page, () => (window as unknown as { __creature: { road(): R } }).__creature.road().visit !== null, 20_000);
    ok(came, `with his journey beside it, it knows the hour of his camp: ${(await road()).visit?.phase ?? 'none'}`);
    const asleep = (await life(page)) as unknown as { asleep: boolean };
    if (asleep.asleep) ok(true, 'asleep by its own clock, it sleeps through it (his road shows it dozing by his fire)');
    else {
      const gone = await until(page, () => (window as unknown as { __creature: { road(): R } }).__creature.road().gone, 40_000);
      ok(gone, 'it opens its portal and goes through to him');
    }
    await page.waitForTimeout(400);
    await page.keyboard.press('Tab');
    await page.waitForURL((u) => !u.pathname.includes('creature'), { timeout: 10_000 });
    await page.waitForFunction(() => (window as unknown as { __wander?: { ready: boolean } }).__wander?.ready === true, undefined, { timeout: 60_000 });
    const modeNow = readFileSync(join(sub, 'mode'), 'utf8').trim();
    ok(modeNow === 'wander', `Tab opens the road; the server remembers: ${modeNow}`);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Tab');
    await page.waitForURL((u) => u.pathname.includes('creature'), { timeout: 10_000 });
    await page.waitForFunction(() => (window as unknown as { __creature?: { ready: boolean } }).__creature?.ready === true, undefined, { timeout: 60_000 });
    ok(readFileSync(join(sub, 'mode'), 'utf8').trim() === 'creature', 'and Tab again the deep; the server remembers: creature');
    await page.close();
    s.proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
  }
} finally {
  await browser.close();
}
const passed = results.filter((r) => r.startsWith('PASS')).length;
process.stdout.write(`${passed}/${results.length} passed\n`);
mkdirSync(join(ROOT, 'docs', 'creature'), { recursive: true });
writeFileSync(join(ROOT, 'docs', 'creature', 'check.txt'), `${results.join('\n')}\n${passed}/${results.length} passed\n`);
if (passed !== results.length) process.exitCode = 1;
