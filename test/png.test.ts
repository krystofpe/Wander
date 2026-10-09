import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeIndexedPng } from '../src/png.ts';
import { SHEET } from '../tools/art/sprites/wanderer.ts';
import { LEGEND } from '../tools/art/legend.ts';

test('the atlas decodes to the roles that were drawn', async () => {
  const buf = readFileSync(new URL('../assets/atlas.png', import.meta.url));
  const atlas = await decodeIndexedPng(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const meta = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8')) as { sheets: Record<string, Record<string, number[][]>> };
  const [x, y, w, h] = meta.sheets.wanderer.walk[3];
  const drawn = SHEET.tags[0].frames[3];
  assert.equal(w, SHEET.w);
  assert.equal(h, SHEET.h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) assert.equal(atlas.indices[(y + j) * atlas.w + x + i], LEGEND[drawn[j][i]], `pixel ${i},${j}`);
});
