import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGURE_H, FIGURE_W, LANTERN_ON_GROUND, closed, figure, frameName, withEyes } from '../src/figure.ts';
import { OUTLINE } from '../src/kit.ts';
import type { Pose } from '../src/art.ts';

const NAMES = ['stand', 'breathe', 'walk1', 'walk2', 'walk3', 'sit', 'sleep', 'jump', 'wave1', 'wave2', 'dig1', 'dig2', 'eat1', 'eat2'];
const POSES: Pose[] = ['stand', 'walk', 'sit', 'sleep', 'jump', 'wave', 'dig', 'eat'];
const silhouette = (rows: readonly string[]): string[] => rows.map((r) => r.replace(/[^.]/g, '#'));

test('every frame fills the figure, outlined, with a face, and turns round as its mirror image', () => {
  for (const name of NAMES) {
    for (const lantern of [false, true]) {
      const right = figure(name, 1, lantern);
      const d = right.drawing;
      assert.equal(d.w, FIGURE_W, name);
      assert.equal(d.h, FIGURE_H, name);
      assert.ok(right.face !== null && right.face.w >= 9, `${name} has a face wide enough for two eyes`);
      // Nothing filled touches the transparent outside: the outline is in between.
      for (let y = 0; y < FIGURE_H; y++) {
        for (let x = 0; x < FIGURE_W; x++) {
          if (d.mat[y][x] === '.' || d.tone[y * FIGURE_W + x] === OUTLINE) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(d.mat[y + dy]?.[x + dx] ?? '.', '.', `${name} unoutlined at ${x},${y}`);
        }
      }
      const left = figure(name, -1, lantern);
      assert.deepEqual(silhouette(left.drawing.mat), silhouette(d.mat.map((r) => Array.from(r).reverse().join(''))), name);
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
    withEyes(f, eyes).mat.forEach((row, y) => Array.from(row).forEach((k, x) => 'egt'.includes(k) && out.push([x, y])));
    return out;
  };
  for (const eyes of ['• •', '•• ', ' ••', '° °', '. .', 'o o', '- -', '‿ ‿', '^ ^', '> <', '♥ ♥', '╥ ╥']) {
    const px = eyePixels(eyes);
    assert.ok(px.length >= 4, `${eyes} shows`);
    for (const [x, y] of px) assert.equal(f.drawing.mat[y][x], 'F', `${eyes} stays in the face`);
  }
  const meanX = (eyes: string): number => eyePixels(eyes).reduce((a, [x]) => a + x, 0) / eyePixels(eyes).length;
  assert.ok(meanX('•• ') < meanX('• •') && meanX('• •') < meanX(' ••'), 'looking left and right moves the eyes');
  assert.ok(closed('- -') && closed('‿ ‿') && !closed('• •') && !closed('♥ ♥'));
});
