// A distant train at the far hills' scale (about 3.6 px a metre), drawn by hand: a locomotive with a lamp in its
// nose, and a carriage with a row of windows that are dark by day and lit at night.
import { block, compose } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const W = 74;
const H = 12;

const windows = (from: number, to: number): string => {
  let s = '';
  for (let x = 0; x < W; x++) s += x < from || x > to ? '.' : (x - from) % 6 < 4 ? 'W' : 'O';
  return s;
};

const overlay = (base: string, top: string): string => [...base].map((c, i) => (top[i] !== '.' ? top[i] : c)).join('');

const CAR = compose(W, H, [
  block(0, 0, [
    '..' + 'H'.repeat(70) + '..',
    '.' + 'O'.repeat(72) + '.',
    '.' + 'O'.repeat(72) + '.',
    overlay('.' + 'O'.repeat(72) + '.', windows(4, 69)),
    overlay('.' + 'O'.repeat(72) + '.', windows(4, 69)),
    '.' + 'O'.repeat(72) + '.',
    '.' + 'O'.repeat(72) + '.',
    '.' + 'I'.repeat(72) + '.',
    '...' + 'S'.repeat(68) + '...',
    '...SZS..SZS' + '.'.repeat(50) + 'SZS..SZS...',
    '.'.repeat(W),
    '.'.repeat(W),
  ]),
]);

const LOCO = compose(W, H, [
  block(0, 0, [
    '.'.repeat(14) + 'H'.repeat(46) + '.'.repeat(14),
    '.'.repeat(8) + 'O'.repeat(58) + '.'.repeat(8),
    '.'.repeat(5) + 'O'.repeat(64) + '.....',
    overlay('...' + 'O'.repeat(68) + '...', '.'.repeat(58) + 'WWWW' + '.'.repeat(12)),
    overlay('..' + 'O'.repeat(70) + '..', '.'.repeat(58) + 'WWWW' + '.'.repeat(12)),
    '.' + 'O'.repeat(72) + '.',
    '.' + 'O'.repeat(71) + 'e.',
    '.' + 'I'.repeat(72) + '.',
    '...' + 'S'.repeat(68) + '...',
    '...SZS..SZS..SZS' + '.'.repeat(40) + 'SZS..SZS..SZS...',
    '.'.repeat(W),
    '.'.repeat(W),
  ]),
]);

export const SHEET: Sheet = {
  name: 'train',
  w: W,
  h: H,
  tags: [
    { name: 'loco', ms: 1000, frames: [LOCO] },
    { name: 'car', ms: 1000, frames: [CAR] },
  ],
};
