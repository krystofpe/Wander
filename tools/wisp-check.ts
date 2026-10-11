// Browser checks and review pictures, isolated from the user's saved lives.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { session } from './headless.ts';
import { noticeAt } from '../src/wisp/journey.ts';
import { seedOf } from '../src/options.ts';

const out = 'work/wisp-preview';
mkdirSync(out, { recursive: true });
const s = await session();
const errors: string[] = [];
try {
  const page = await s.browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  for (let realm = 0; realm < 4; realm++) {
    await page.goto(`${s.server.url}creature/?seed=moss&t=${realm * 240 + 20}&mute=1`);
    await page.waitForFunction(() => (window as any).__creature?.ready && (document.querySelector('iframe') as HTMLIFrameElement)?.contentWindow && (document.querySelector('iframe') as HTMLIFrameElement).contentWindow!['__wander' as keyof Window]);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${out}/realm-${realm}.png` });
    const status = await page.evaluate(() => (window as any).__creature);
    assert.equal(status.error, null);
    assert.ok(status.realm.length > 0);
    const pixelBlocks = await page.evaluate(() => {
      const canvas = document.getElementById('scene') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(1, Math.floor(Math.min(canvas.width / 640, canvas.height / 360)));
      const nw = Math.min(1408, Math.ceil(canvas.width / scale)), nh = Math.min(400, Math.ceil(canvas.height / scale));
      const left = Math.floor((canvas.width - nw * scale) / 2), top = Math.floor((canvas.height - nh * scale) / 2);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const base = ((top + y * scale) * canvas.width + left + x * scale) * 4;
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
  await road.evaluate(() => { for (let i = 0; i < 156; i++) (window as any).__wander.advance(0.25); });
  await page.waitForFunction(() => (window as any).__creature.crossing === 'opening');
  await page.screenshot({ path: `${out}/approaching.png` });
  await road.evaluate(() => { for (let i = 0; i < 84; i++) (window as any).__wander.advance(0.25); });
  await page.waitForFunction(() => (window as any).__creature.crossing === 'coming');
  await page.screenshot({ path: `${out}/arriving.png` });
  await road.evaluate(() => { for (let i = 0; i < 120; i++) (window as any).__wander.advance(0.25); });
  await page.waitForFunction(() => (window as any).__creature.crossing === 'with');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/crossing.png` });
  assert.equal(await page.evaluate(() => (window as any).__creature.meetings), 1);
  await road.evaluate(() => { for (let i = 0; i < 2040; i++) (window as any).__wander.advance(0.25); });
  await page.waitForFunction(() => (window as any).__creature.crossing === 'going');
  await page.screenshot({ path: `${out}/departing.png` });
  await road.evaluate(() => { for (let i = 0; i < 84; i++) (window as any).__wander.advance(0.25); });
  await page.waitForFunction(() => (window as any).__creature.crossing === 'closing');
  await page.screenshot({ path: `${out}/returning.png` });
  await road.evaluate(() => { for (let i = 0; i < 60; i++) (window as any).__wander.advance(0.25); });
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
  // 244 seconds from the preview start: the single greeting, in the middle of a waking visit.
  await greetingRoad.evaluate(() => { for (let i = 0; i < 976; i++) (window as any).__wander.advance(0.25); });
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
