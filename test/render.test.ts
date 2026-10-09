import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOME_NAMES, COLORS } from '../src/config.ts';
import type { BiomeName } from '../src/config.ts';
import { Frame } from '../src/frame.ts';
import { Game } from '../src/game.ts';
import { newLife } from '../src/creature.ts';
import { rng } from '../src/noise.ts';
import { displayText, wrap } from '../src/render.ts';

function rendered(biome: BiomeName, hour: number, cols = 120, rows = 40): { game: Game; frame: Frame } {
  const now = new Date(2026, 9, 8, hour).getTime();
  const life = newLife(5, now - 86400000, { biome, name: 'Ulo' });
  life.userName = 'Tester';
  life.cairn = 3;
  const game = new Game(life, { cols, rows, now, random: rng(5), away: null });
  for (let i = 0; i < 30; i++) game.update(1 / 30);
  game.draw();
  return { game, frame: (game as unknown as { previous: Frame }).previous };
}

const brightness = (frame: Frame, rows: number): number => {
  let sum = 0;
  for (let i = 0; i < frame.width * rows; i++) {
    const c = frame.bg[i];
    sum += (c >> 16) + ((c >> 8) & 255) + (c & 255);
  }
  return sum / (frame.width * rows);
};

test('text is wrapped at spaces, and long words are split', () => {
  assert.deepEqual(wrap('the moon is thin tonight', 10), ['the moon', 'is thin', 'tonight']);
  assert.deepEqual(wrap('abcdefghijkl', 5), ['abcde', 'fghij', 'kl']);
  assert.deepEqual(wrap('   ', 5), []);
});

test('text for the screen keeps Czech and drops what takes two columns or none', () => {
  assert.equal(displayText('Kryštof 😀'), 'Kryštof ?');
  assert.equal(displayText('é​'), 'é');
  assert.equal(displayText('東'), '?');
});

test('every cell of every biome is drawn, by day and by night', () => {
  for (const biome of BIOME_NAMES) {
    for (const hour of [13, 23]) {
      const { frame } = rendered(biome, hour);
      assert.ok(frame.glyph.every((g) => g !== 0), `${biome} at ${hour}`);
    }
  }
});

test('night is darker than day', () => {
  const day = rendered('meadow', 12).frame;
  const night = rendered('meadow', 1).frame;
  assert.ok(brightness(night, 38) < brightness(day, 38) / 2);
});

test('the status bar names it and shows its needs; the hints follow', () => {
  const { frame } = rendered('forest', 13);
  const bar = frame.rowText(38);
  assert.match(bar, /^ Ulo, 1 day · /);
  assert.match(bar, /food [■·]{5}/);
  assert.match(bar, /mind: local/);
  assert.match(frame.rowText(39), /F feed {2}P play {2}E pet {2}T talk/);
});

test('its words appear in a bubble, and the journal over everything', () => {
  const { game } = rendered('swamp', 10);
  game.sayText('The sand remembers every step.');
  game.draw();
  const frame = (game as unknown as { previous: Frame }).previous;
  const text = Array.from({ length: frame.height }, (_, r) => frame.rowText(r)).join('\n');
  assert.match(text, /The sand remembers every step\./);
  assert.match(text, /╭─+╮/);
  game.mode = 'journal';
  game.draw();
  const after = (game as unknown as { previous: Frame }).previous;
  assert.match(Array.from({ length: after.height }, (_, r) => after.rowText(r)).join('\n'), /Ulo, of the swamp/);
});

test('a window too small says so', () => {
  const { frame } = rendered('meadow', 12, 30, 10);
  assert.match(frame.rowText(5), /Make the window bigger/);
});

test('the creature is drawn in half-block pixels, its eyes glowing in its dark face', () => {
  const { game } = rendered('meadow', 13);
  const g = game as unknown as { body: { x: number; z: number; pose: string; facing: number; lift: number; visible: boolean; inside: boolean; eyes: string | null }; geo: { col(x: number): number; footRow(z: number): number }; previous: Frame };
  Object.assign(g.body, { pose: 'sit', facing: 1, lift: 0, visible: true, inside: false, eyes: '• •' });
  game.draw();
  const frame = g.previous;
  const col = g.geo.col(g.body.x);
  const foot = g.geo.footRow(g.body.z);
  const cells: number[] = [];
  for (let r = foot - 13; r <= foot; r++) for (let c = col - 12; c < col + 12; c++) cells.push(r * frame.width + c);
  assert.ok(cells.some((i) => frame.glyph[i] === 0x2580), 'half blocks');
  assert.ok(cells.some((i) => frame.bg[i] === COLORS.face || frame.fg[i] === COLORS.face), 'its dark face');
  const glow = game.view().eyeGlow;
  assert.ok(cells.some((i) => frame.fg[i] === glow || frame.bg[i] === glow), 'its eyes in their glow colour');
});
