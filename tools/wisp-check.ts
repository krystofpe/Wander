// Browser checks and review pictures, isolated from the user's saved lives.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { session } from './headless.ts';
import { noticeAt } from '../src/wisp/journey.ts';
import { seedOf } from '../src/options.ts';
import type { Frame } from 'playwright-core';

const out = 'work/wisp-preview';
mkdirSync(out, { recursive: true });
const s = await session();
const errors: string[] = [];
/** Lives the manual road on a quarter second at a time until its crossing is at `phase` (null: over), then `more`
 * seconds into it, or (for 'with') until that far through it. */
const until = (road: Frame, phase: string | null, more = 0, through = 0): Promise<void> => road.evaluate(([phase, more, through]) => {
  const w = (window as any).__wander;
  for (let i = 0; i < 100000 && (w.visit()?.phase ?? null) !== phase; i++) w.advance(0.25);
  for (let i = 0; i < more * 4; i++) w.advance(0.25);
  for (let i = 0; i < 100000 && w.visit()?.phase === phase && w.visit().k < through; i++) w.advance(0.25);
}, [phase, more, through] as const);
try {
  const page = await s.browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  // Moments in each realm when every drifting layer stands on a whole art pixel (t times each speed is whole).
  for (const [realm, t] of [100, 300, 500, 800].entries()) {
    await page.goto(`${s.server.url}creature/?seed=moss&t=${t}&mute=1`);
    await page.waitForFunction(() => (window as any).__creature?.ready && (document.querySelector('iframe') as HTMLIFrameElement)?.contentWindow && (document.querySelector('iframe') as HTMLIFrameElement).contentWindow!['__wander' as keyof Window]);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${out}/realm-${realm}.png` });
    const status = await page.evaluate(() => (window as any).__creature);
    assert.equal(status.error, null);
    assert.ok(status.realm.length > 0);
    const pixelBlocks = await page.evaluate(() => {
      // The wisp glides on a grid of its own (checked by eye in the pictures): its box is left out.
      const [bx, by, side] = (window as any).__creature.wispBox as [number, number, number];
      const canvas = document.getElementById('scene') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(1, Math.floor(Math.min(canvas.width / 640, canvas.height / 360)));
      const nw = Math.min(1408, Math.ceil(canvas.width / scale)), nh = Math.min(400, Math.ceil(canvas.height / scale));
      const left = Math.floor((canvas.width - nw * scale) / 2), top = Math.floor((canvas.height - nh * scale) / 2);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const px = left + x * scale, py = top + y * scale;
        if (px + scale > bx && px < bx + side && py + scale > by && py < by + side) continue;
        const base = (py * canvas.width + px) * 4;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          const other = base + (dy * canvas.width + dx) * 4;
          for (let ch = 0; ch < 4; ch++) if (data[base + ch] !== data[other + ch]) return false;
        }
      }
      return true;
    });
    assert.equal(pixelBlocks, true, 'every native pixel enlarges to a uniform block, without smoothing');
  }
  const noticingTime = noticeAt(20, seedOf('moss')).start + 12;
  await page.goto(`${s.server.url}creature/?seed=moss&t=${noticingTime}&mute=1`);
  await page.waitForFunction(() => (window as any).__creature?.ready);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${out}/noticing.png` });
  await page.goto(`${s.server.url}creature/?seed=moss&t=20&visit=1&manual=1&mute=1`);
  await page.waitForFunction(() => ((document.querySelector('iframe') as HTMLIFrameElement)?.contentWindow as any)?.__wander?.ready);
  const road = page.frames().find(f => f !== page.mainFrame())!;
  await until(road, 'opening', 6);
  await page.waitForFunction(() => (window as any).__creature.crossing === 'opening');
  await page.screenshot({ path: `${out}/approaching.png` });
  await until(road, 'coming', 4);
  await page.waitForFunction(() => (window as any).__creature.crossing === 'coming');
  await page.screenshot({ path: `${out}/arriving.png` });
  await until(road, 'with');
  await page.waitForFunction(() => (window as any).__creature.crossing === 'with');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/crossing.png` });
  assert.equal(await page.evaluate(() => (window as any).__creature.meetings), 1);
  await until(road, 'going', 3);
  await page.waitForFunction(() => (window as any).__creature.crossing === 'going');
  await page.screenshot({ path: `${out}/departing.png` });
  await until(road, 'closing', 4);
  await page.waitForFunction(() => (window as any).__creature.crossing === 'closing');
  await page.screenshot({ path: `${out}/returning.png` });
  await until(road, null);
  await page.waitForFunction(() => (window as any).__creature.crossing === null);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/camp-ember.png` });
  assert.equal(await page.evaluate(() => localStorage.getItem('wander.wisp.v1')), null, 'previews never save');
  await page.keyboard.press('j');
  assert.equal(await page.locator('#dream-journal').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await page.waitForURL(url => !url.pathname.includes('creature'));
  await page.waitForFunction(() => (window as any).__wander?.ready);
  await page.keyboard.press('Tab');
  await page.waitForURL('**/creature/');
  await page.waitForFunction(() => (window as any).__creature?.ready);
  const saved = await page.evaluate(() => localStorage.getItem('wander.wisp.v1'));
  assert.ok(saved);
  await page.reload();
  await page.waitForFunction(() => (window as any).__creature?.ready);
  assert.equal(await page.evaluate(() => localStorage.getItem('wander.wisp.v1')), saved);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/portrait.png` });
  await page.setViewportSize({ width: 3840, height: 2160 });
  const before = await page.evaluate(() => (window as any).__creature.frames);
  const began = performance.now();
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => (window as any).__creature.frames);
  console.log(`4K dreaming: ${Math.round((after - before) * 1000 / (performance.now() - began))} frames/sec over 2 seconds`);
  await page.screenshot({ path: `${out}/4k.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${s.server.url}creature/?seed=moon&t=20&visit=1&manual=1&mute=1`);
  await page.waitForFunction(() => ((document.querySelector('iframe') as HTMLIFrameElement)?.contentWindow as any)?.__wander?.ready);
  const greetingRoad = page.frames().find(f => f !== page.mainFrame())!;
  // The single greeting, in the middle of a waking visit.
  await until(greetingRoad, 'with', 0, 0.315);
  await page.waitForFunction(() => (window as any).__creature.crossing === 'with');
  assert.equal(await greetingRoad.evaluate(() => (window as any).__wander.visit().woke), true);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/greeting.png` });
  await page.goto(`${s.server.url}creature/?hollow=1&manual=1&seed=moss&mute=1`);
  await page.waitForFunction(() => (window as any).__creature?.ready);
  assert.ok(await page.evaluate(() => (window as any).__creature.game), 'the old hollow remains available');
  assert.deepEqual(errors, []);
  console.log(`PASS: four realms, crossing and return, preview isolation, memories, mode switching, persistence, portrait resize. Pictures: ${out}`);
} finally { await s.close(); }
