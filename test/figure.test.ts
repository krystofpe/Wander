import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGURE_H, FIGURE_W, LANTERN_ON_GROUND, closed, figure, frameName, withEyes } from '../src/figure.ts';
import { INK } from '../src/sprites.ts';
import type { Pixels } from '../src/sprites.ts';
import type { Pose } from '../src/art.ts';

const NAMES = ['stand', 'breathe', 'walk1', 'walk2', 'walk3', 'sit', 'sleep', 'jump', 'wave1', 'wave2', 'dig1', 'dig2', 'eat1', 'eat2'];
const POSES: Pose[] = ['stand', 'walk', 'sit', 'sleep', 'jump', 'wave', 'dig', 'eat'];
const silhouette = (p: Pixels): string[] => Array.from({ length: p.h }, (_, y) => Array.from(p.px.subarray(y * p.w, (y + 1) * p.w), (k) => (k === 0 ? '.' : '#')).join(''));
const flip = (rows: string[]): string[] => rows.map((r) => Array.from(r).reverse().join(''));
const OUTLINES: ReadonlySet<number> = new Set([INK.cloak, INK.boot, INK.metal]);

test('every frame fills the figure, outlined, with a face, and turns round as its mirror image', () => {
  for (const name of NAMES) {
    for (const lantern of [false, true]) {
      const right = figure(name, 1, lantern);
      const p = right.pixels;
      assert.equal(p.w, FIGURE_W, name);
      assert.equal(p.h, FIGURE_H, name);
      assert.ok(right.face !== null && right.face.w >= 9, `${name} has a face wide enough for two eyes`);
      // Nothing filled touches the transparent outside: the outline is in between.
      const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.px[y * p.w + x]);
      for (let y = 0; y < FIGURE_H; y++) {
        for (let x = 0; x < FIGURE_W; x++) {
          if (at(x, y) === 0 || OUTLINES.has(at(x, y))) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(at(x + dx, y + dy), 0, `${name} unoutlined at ${x},${y}`);
        }
      }
      const left = figure(name, -1, lantern);
      assert.deepEqual(silhouette(left.pixels), flip(silhouette(p)), name);
    }
  }
  assert.ok(figure('stand', 1, true).lamp !== null, 'the lantern hangs from its hand');
  assert.equal(figure('stand', 1, false).lamp, null);
  assert.ok(LANTERN_ON_GROUND.lamp !== null);
});

test('every pose has a frame, and walking keeps pace with its stride', () => {
  for (const pose of POSES) for (const t of [0, 0.4, 1.7, 2.9]) assert.ok(NAMES.includes(frameName(pose, t, 0)), pose);
  assert.deepEqual([0, 1, 2, 3, 4].map((s) => frameName('walk', 0, s)), ['walk1', 'walk2', 'walk3', 'walk2', 'walk1']);
  assert.equal(frameName('walk', 0, -1), 'walk2', 'walking left steps through the same cycle');
});

test('eyes are drawn inside the face, follow the gaze, and every expression has a shape', () => {
  const f = figure('stand', 1, false);
  const eyePixels = (eyes: string): [number, number][] => {
    const out: [number, number][] = [];
    const p = withEyes(f, eyes);
    p.px.forEach((k, i) => (k === INK.eye || k === INK.glint || k === INK.tear) && out.push([i % p.w, Math.floor(i / p.w)]));
    return out;
  };
  for (const eyes of ['• •', '•• ', ' ••', '° °', '. .', 'o o', '- -', '‿ ‿', '^ ^', '> <', '♥ ♥', '╥ ╥']) {
    const px = eyePixels(eyes);
    assert.ok(px.length >= 4, `${eyes} shows`);
    for (const [x, y] of px) assert.equal(f.pixels.px[y * f.pixels.w + x], INK.face, `${eyes} stays in the face`);
  }
  const meanX = (eyes: string): number => eyePixels(eyes).reduce((a, [x]) => a + x, 0) / eyePixels(eyes).length;
  assert.ok(meanX('•• ') < meanX('• •') && meanX('• •') < meanX(' ••'), 'looking left and right moves the eyes');
  assert.ok(closed('- -') && closed('‿ ‿') && !closed('• •') && !closed('♥ ♥'));
});
