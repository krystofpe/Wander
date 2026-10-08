import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Atmosphere } from '../src/ambient.ts';
import { COLOR_BITS } from '../src/config.ts';
import { Frame } from '../src/frame.ts';
import { Renderer, quantize, viewOrigin } from '../src/render.ts';
import { World } from '../src/world.ts';

function scene(startHour: number) {
  return {
    world: new World(1),
    atm: new Atmosphere(1, { startHour, forceFront: 0 }),
    player: { x: 40.5, y: 80.5, vx: 0, vy: 0 },
  };
}

function averageBackground(frame: Frame, from = 0, to = frame.bg.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const c = frame.bg[i];
    sum += (c >> 16) + ((c >> 8) & 255) + (c & 255);
  }
  return sum / (to - from);
}

test('quantize keeps the ends and rounds to 2^COLOR_BITS levels', () => {
  assert.equal(quantize(0), 0);
  assert.equal(quantize(255), 255);
  assert.equal(quantize(-4), 0);
  assert.equal(quantize(300), 255);
  const levels = new Set<number>();
  for (let c = 0; c < 256; c++) levels.add(quantize(c));
  assert.equal(levels.size, 1 << COLOR_BITS);
});

test('the view is centred on you', () => {
  assert.deepEqual(viewOrigin({ x: 100.7, y: 41, vx: 0, vy: 0 }, 60, 19), { left: 70, top: 11 });
});

test('you are drawn at the centre of the map, and every cell is filled', () => {
  const { world, atm, player } = scene(12);
  const frame = new Frame(60, 20);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, { fps: 60 });
  assert.equal(frame.glyph[(19 >> 1) * 60 + 30], '@'.codePointAt(0));
  assert.ok(frame.glyph.every((g) => g !== 0));
});

test('the status bar shows position, time, fps and seed, and can be hidden', () => {
  const { world, atm, player } = scene(12);
  const frame = new Frame(120, 20);
  const renderer = new Renderer();
  renderer.render(frame, world, atm, atm.snapshot(), player, { fps: 57 });
  const bar = frame.rowText(19);
  assert.match(bar, /x 41 {2}y 81 │/);
  assert.match(bar, /12:00 afternoon/);
  assert.match(bar, /57 fps │ seed 1/);
  renderer.render(frame, world, atm, atm.snapshot(), player, null);
  assert.ok(!frame.rowText(19).includes('fps'));
});

test('a window below 40×12 asks to be made bigger', () => {
  const { world, atm, player } = scene(12);
  const frame = new Frame(30, 10);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, { fps: 60 });
  assert.ok(frame.rowText(5).includes('Make the window bigger'));
});

test('night is darker than noon, and the lantern lights your surroundings', () => {
  const noon = scene(12);
  const night = scene(23);
  const a = new Frame(80, 24);
  const b = new Frame(80, 24);
  new Renderer().render(a, noon.world, noon.atm, noon.atm.snapshot(), noon.player, null);
  new Renderer().render(b, night.world, night.atm, night.atm.snapshot(), night.player, null);
  assert.ok(averageBackground(b) < averageBackground(a) * 0.6);
  // Same world and spot in both scenes, so the night/noon ratio isolates the light.
  const ratio = (from: number, to: number): number => averageBackground(b, from, to) / averageBackground(a, from, to);
  const nearYou = ratio(12 * 80 + 36, 12 * 80 + 44);
  const farAway = ratio(0, 8);
  assert.ok(nearYou > farAway, `near ${nearYou} vs far ${farAway}`);
});
