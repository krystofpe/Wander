import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { INK, NAMES, PALETTE, extent, frames, grounded, mirrored, paintPixels, pixels, slice, snowCapped } from '../src/sprites.ts';

const art = new URL('../art/', import.meta.url);
const ALPHABET = '.123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-/:;<=>?@^_~';
const data = JSON.parse(readFileSync(new URL('../src/sprites.json', import.meta.url), 'utf8')) as {
  sprites: Record<string, { w: number; h: number; order: string[]; frames: Record<string, string[]> }>;
};

test('sprites.json holds every sheet in art/, exported in the palette of art/palette.gpl', () => {
  const sheets = readdirSync(art).filter((f) => f.endsWith('.aseprite')).map((f) => f.replace(/\.aseprite$/, '')).sort();
  assert.deepEqual(Object.keys(data.sprites).sort(), sheets, 'run `npm run art` after changing art/');
  const gpl = readFileSync(new URL('palette.gpl', art), 'utf8')
    .split('\n')
    .flatMap((line) => {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      return m === null ? [] : [{ rgb: (+m[1] << 16) | (+m[2] << 8) | +m[3], name: m[4].trim() }];
    });
  assert.deepEqual(NAMES, gpl.map((c) => c.name));
  assert.deepEqual(PALETTE.slice(1), gpl.slice(1).map((c) => c.rgb));
  // The names the game draws by are where the palette says they are.
  const named: Record<string, string> = { night: 'night', teal0: 'teal-0', grey1: 'grey-1', hollow: 'hollow', ember: 'ember', cloak: 'cloak outline', boot: 'boot outline', face: 'face', metal: 'metal outline', eye: 'eye', tint: 'tint', pale: 'pale', stone4: 'stone-4' };
  for (const [key, name] of Object.entries(named)) assert.equal(NAMES[INK[key as keyof typeof INK]], name, key);
});

test('every frame is its sheet\'s size, in the alphabet, and decodes', () => {
  for (const [sheet, s] of Object.entries(data.sprites)) {
    assert.deepEqual(frames(sheet), s.order);
    for (const name of s.order) {
      const rows = s.frames[name];
      assert.equal(rows.length, s.h, `${sheet}/${name}`);
      for (const row of rows) assert.ok(row.length === s.w && Array.from(row).every((ch) => ALPHABET.includes(ch)), `${sheet}/${name}`);
      const p = pixels(sheet, name);
      assert.ok(p.px.some((k) => k !== 0), `${sheet}/${name} has something drawn`);
      assert.ok(p.px.every((k) => k < PALETTE.length), `${sheet}/${name} stays in the palette`);
    }
  }
});

test('the game finds every frame it asks for', () => {
  for (const name of ['canopy-big', 'canopy-small', 'bark-big', 'bark-small', 'roots-big', 'roots-small', 'span']) assert.ok(frames('forest-frame').includes(name), name);
  for (const tier of ['1', '2', '3']) for (const v of 'abc') assert.ok(frames('forest-far').includes(`far-${tier}${v}`));
  for (const name of ['heavy', 'light']) assert.ok(frames('forest-corner').includes(name));
  for (const kind of ['butterfly', 'moth', 'bird', 'firefly', 'frog']) for (const f of [1, 2]) assert.ok(frames('critters').includes(`${kind}${f}`));
  const door = slice('shelter-forest', 'door');
  assert.ok(door !== undefined && slice('shelter-forest', 'smoke') !== undefined, 'the shelter marks its doorway and its embers');
  // The doorway is the dark of the hollow.
  const shelter = pixels('shelter-forest', 'shelter');
  const mid = (door.y + door.h - 2) * shelter.w + door.x + (door.w >> 1);
  assert.equal(shelter.px[mid], INK.hollow);
});

test('frames are cut down to stand on the ground, turned round, painted, and snowed on', () => {
  const p = grounded(pixels('glowshroom', 'small'));
  assert.equal(p.h % 2, 0, 'a whole number of cells');
  assert.ok(p.px.subarray((p.h - 1) * p.w).some((k) => k !== 0), 'it stands on its bottom row');
  const m = mirrored(p);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) assert.equal(m.px[y * p.w + x], p.px[y * p.w + p.w - 1 - x]);
  const s = paintPixels(p);
  assert.equal(s.w, p.w);
  assert.equal(s.h, p.h / 2);
  // Mushroom caps glow; their stems do not.
  assert.ok(s.glow.some((g) => g === 1) && s.glow.some((g, i) => g === 0 && s.rgb[i] >= 0));
  assert.deepEqual(extent(pixels('forest-frame', 'bark-big')).h, 8, 'bark repeats every eight pixels');
  const snowy = snowCapped(pixels('bush-forest', 'bush-a'));
  assert.ok(snowy.px.some((k) => k === INK.stone4), 'snow lies on top');
  const embers = snowCapped(pixels('shelter-forest', 'shelter'));
  assert.ok(embers.px.some((k) => k === INK.ember), 'embers are not snowed out');
});
