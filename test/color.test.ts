import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightOf, toPalette } from '../src/palette.ts';
import { CLOAKS } from '../src/config.ts';
import { fromHsl, ramp, toHsl } from '../src/color.ts';

test('colours survive a trip through hue, saturation and lightness', () => {
  for (const c of [0x000000, 0xffffff, 0xff0000, 0x00ff00, 0x0000ff, 0x3a3470, 0x6a5a3a, 0x808080]) {
    const back = fromHsl(...toHsl(c));
    for (const shift of [16, 8, 0]) assert.ok(Math.abs(((back >> shift) & 255) - ((c >> shift) & 255)) <= 1, c.toString(16));
  }
});

test('a cloak ramp runs dark to light, its shadows cooler and its highlight warmer', () => {
  const lightness = (c: number): number => toHsl(c)[2];
  /** How far a hue is from `to`, in degrees round the wheel. */
  const away = (h: number, to: number): number => Math.abs(((h - to + 540) % 360) - 180);
  for (const cloak of CLOAKS) {
    const r = ramp(cloak);
    assert.equal(r.base, cloak);
    assert.ok(lightness(r.dark) < lightness(r.shadow) && lightness(r.shadow) < lightness(r.base) && lightness(r.base) < lightness(r.light), cloak.toString(16));
    const h = toHsl(cloak)[0];
    assert.ok(away(toHsl(r.shadow)[0], 240) <= away(h, 240) + 1, `${cloak.toString(16)} shadow leans blue`);
    assert.ok(away(toHsl(r.light)[0], 50) <= away(h, 50) + 1, `${cloak.toString(16)} highlight leans yellow`);
  }
});

test('the forest turns to violet at night, in quarters; other biomes keep their colours', () => {
  const teal = 0x165768;
  assert.equal(toPalette('forest', teal, false, 0), teal, 'by day as drawn');
  assert.equal(toPalette('forest', teal, false, 1), 0x484ab4, 'by night its violet');
  const dusk = toPalette('forest', teal, false, 0.5);
  assert.ok(dusk !== teal && dusk !== 0x484ab4, 'half way at dusk');
  assert.equal(toPalette('forest', teal, false, 0.49), dusk, 'in whole quarters');
  const meadow = toPalette('meadow', 0x4a8a34, false, 0);
  assert.equal(toPalette('meadow', 0x4a8a34, false, 1), meadow);
  assert.equal(nightOf(1), 0);
  assert.equal(nightOf(0), 1);
});
