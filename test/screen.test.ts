import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Frame } from '../src/frame.ts';
import { diffFrames } from '../src/screen.ts';

const DOT = 46; // '.'
const RED = 0xff0000;
const BASE_FG = 0x112233;
const BASE_BG = 0x445566;
const SGR = '\x1b[38;2;255;0;0;48;2;68;85;102m';

function filled(width: number, height: number): Frame {
  const f = new Frame(width, height);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) f.set(c, r, DOT, BASE_FG, BASE_BG);
  return f;
}

test('Frame.text writes from a column and clips at the right edge', () => {
  const f = new Frame(5, 1);
  f.text(2, 0, 'abcdef', 1, 2);
  assert.equal(f.rowText(0), '\0\0abc');
});

test('identical frames produce nothing', () => {
  assert.equal(diffFrames(filled(5, 3), filled(5, 3)), '');
});

test('one changed cell sends a cursor move, its colours and its glyph', () => {
  const b = filled(5, 3);
  b.set(3, 1, 64, RED, BASE_BG);
  assert.equal(diffFrames(filled(5, 3), b), `\x1b[2;4H${SGR}@`);
});

test('adjacent changes share one cursor move and one colour code', () => {
  const b = filled(5, 3);
  b.set(1, 0, 65, RED, BASE_BG);
  b.set(2, 0, 66, RED, BASE_BG);
  assert.equal(diffFrames(filled(5, 3), b), `\x1b[1;2H${SGR}AB`);
});

test('only the colour that changed is sent again', () => {
  const b = filled(5, 3);
  b.set(0, 0, 65, RED, BASE_BG);
  b.set(1, 0, 66, RED, 0x000000);
  assert.equal(diffFrames(filled(5, 3), b), `\x1b[1;1H${SGR}A\x1b[48;2;0;0;0mB`);
});

test('after the last column the next change needs a cursor move', () => {
  const b = filled(5, 3);
  b.set(4, 0, 65, RED, BASE_BG);
  b.set(0, 1, 66, RED, BASE_BG);
  assert.equal(diffFrames(filled(5, 3), b), `\x1b[1;5H${SGR}A\x1b[2;1HB`);
});

test('no previous frame clears the screen and draws everything', () => {
  const out = diffFrames(null, filled(3, 2));
  assert.ok(out.startsWith('\x1b[2J\x1b[1;1H'));
  assert.equal((out.match(/\./g) ?? []).length, 6);
});

test('a size change redraws everything', () => {
  assert.ok(diffFrames(filled(3, 2), filled(4, 2)).startsWith('\x1b[2J'));
});

test('non-ASCII glyphs are written as text', () => {
  const b = filled(5, 3);
  b.set(0, 0, 0x2663, RED, BASE_BG);
  assert.ok(diffFrames(filled(5, 3), b).endsWith('♣'));
});
