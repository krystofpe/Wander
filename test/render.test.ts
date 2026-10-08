import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Atmosphere } from '../src/ambient.ts';
import type { Ambient } from '../src/ambient.ts';
import { ASPECT, BLADES, Biome, COLORS, COLOR_BITS } from '../src/config.ts';
import { Frame } from '../src/frame.ts';
import { Trail } from '../src/grass.ts';
import { Renderer, quantize, viewOrigin } from '../src/render.ts';
import { World, cellOffset, findSpot } from '../src/world.ts';

function scene(startHour: number) {
  return {
    world: new World(1),
    atm: new Atmosphere(1, { startHour, forceFront: 0 }),
    player: { x: 40.5, y: 80.5, vx: 0, vy: 0 },
    trail: new Trail(),
  };
}

function averageForeground(frame: Frame, from = 0, to = frame.fg.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const c = frame.fg[i];
    sum += (c >> 16) + ((c >> 8) & 255) + (c & 255);
  }
  return sum / (to - from);
}

const BLADE_GLYPHS = new Set<number>(Object.values(BLADES));

/** A grassland cell with grassland two columns either side, whose eastern neighbour is a tall blade. */
function grassRun(world: World): { mx: number; my: number } {
  const near = findSpot(world, 0, 0, (b) => b === Biome.Grassland);
  for (let my = near.my - 32; my < near.my + 32; my++) {
    for (let mx = near.mx - 32; mx < near.mx + 32; mx++) {
      const grass = [-2, -1, 0, 1, 2].every((d) => world.biomeAt(mx + d, my) === Biome.Grassland);
      const tall = (world.chunkAt(mx + 1, my).variant[cellOffset(mx + 1, my)] & 3) !== 0;
      if (grass && tall) return { mx, my };
    }
  }
  throw new Error('no grassland run near the origin');
}

/** You on a grass run at noon, with the given wind. */
function onGrass(windX: number, windStrength: number) {
  const world = new World(1);
  const atm = new Atmosphere(1, { startHour: 12, forceFront: 0 });
  const spot = grassRun(world);
  const player = { x: spot.mx + 0.5, y: (spot.my + 0.5) * ASPECT, vx: 0, vy: 0 };
  const amb: Ambient = { ...atm.snapshot(), realTime: 0.1, windX, windY: 0, windStrength };
  return { world, atm, player, amb };
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
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(60, 20);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, trail, { fps: 60 });
  assert.equal(frame.glyph[(19 >> 1) * 60 + 30], '@'.codePointAt(0));
  assert.ok(frame.glyph.every((g) => g !== 0));
});

test('every map cell has a black background', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(60, 20);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, trail, { fps: 60 });
  for (let i = 0; i < 19 * 60; i++) assert.equal(frame.bg[i], COLORS.ground, `cell ${i}`);
  assert.equal(frame.bg[19 * 60], COLORS.hudBg);
});

test('the status bar shows position, time, fps and seed, and can be hidden', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(120, 20);
  const renderer = new Renderer();
  renderer.render(frame, world, atm, atm.snapshot(), player, trail, { fps: 57 });
  const bar = frame.rowText(19);
  assert.match(bar, /x 41 {2}y 81 │/);
  assert.match(bar, /12:00 afternoon/);
  assert.match(bar, /57 fps │ seed 1/);
  renderer.render(frame, world, atm, atm.snapshot(), player, trail, null);
  assert.ok(!frame.rowText(19).includes('fps'));
});

test('a window below 40×12 asks to be made bigger', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(30, 10);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, trail, { fps: 60 });
  assert.ok(frame.rowText(5).includes('Make the window bigger'));
});

test('night is darker than noon, and the lantern lights your surroundings', () => {
  const noon = scene(12);
  const night = scene(23);
  const a = new Frame(80, 24);
  const b = new Frame(80, 24);
  new Renderer().render(a, noon.world, noon.atm, noon.atm.snapshot(), noon.player, noon.trail, null);
  new Renderer().render(b, night.world, night.atm, night.atm.snapshot(), night.player, night.trail, null);
  assert.ok(averageForeground(b) < averageForeground(a) * 0.6);
  // Same world and spot in both scenes, so the night/noon ratio isolates the light.
  const ratio = (from: number, to: number): number => averageForeground(b, from, to) / averageForeground(a, from, to);
  const nearYou = ratio(12 * 80 + 36, 12 * 80 + 44);
  const farAway = ratio(0, 8);
  assert.ok(nearYou > farAway, `near ${nearYou} vs far ${farAway}`);
});

test('the screen edges are darker than the centre at noon', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(80, 24);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, trail, null);
  const corner = averageForeground(frame, 0, 8);
  const centre = averageForeground(frame, 12 * 80 + 36, 12 * 80 + 44);
  assert.ok(corner < centre * 0.5, `corner ${corner} vs centre ${centre}`);
});

test('blades bend away from your trail and stand farther off', () => {
  const { world, atm, player, amb } = onGrass(0, 0);
  const trail = new Trail();
  trail.push(player.x - 1, player.y, 0); // one step ago, one column west
  trail.push(player.x, player.y, 0.1);
  const frame = new Frame(60, 20);
  new Renderer().render(frame, world, atm, amb, player, trail, null);
  const row = 20 >> 1;
  const at = (col: number): number => frame.glyph[row * 60 + col];
  assert.ok(at(29) === BLADES.flat || at(29) === BLADES.shortFlat, 'the blade you just stepped off lies flat');
  assert.equal(at(31), BLADES.right, 'the blade ahead of you leans away');
  assert.ok(at(32) === BLADES.upright || at(32) === BLADES.short, 'two columns on, blades stand');
});

test('blades still show with an empty trail, without asking it to bend', () => {
  const { world, atm, player, amb } = onGrass(1, 1);
  class EmptyTrail extends Trail {
    bendAt(): [number, number] {
      throw new Error('bendAt must not be called with an empty trail');
    }
  }
  const frame = new Frame(60, 20);
  new Renderer().render(frame, world, atm, amb, player, new EmptyTrail(), null);
  const row = 20 >> 1;
  const at = (col: number): number => frame.glyph[row * 60 + col];
  assert.ok(at(31) === BLADES.upright || at(31) === BLADES.right, 'a tall blade stands or leans with the east wind');
  for (const col of [28, 29, 32]) assert.ok(BLADE_GLYPHS.has(at(col)), `column ${col}`);
});
