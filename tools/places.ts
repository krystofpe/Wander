// Where things are on a road: the middle of each biome's first stretch, the borders between them, landmarks.
// Pure (it only asks the world), so the tour and the tests can use it.
import { BIOME_IDS } from '../src/biomes.ts';
import type { BiomeId, LandmarkKind } from '../src/biomes.ts';
import { landmarksBetween, stretchesBetween } from '../src/world.ts';

/** The middle of the first stretch of every biome, searching up to `limit` metres. */
export function biomeCentres(seed: number, limit = 3e6): Map<BiomeId, number> {
  const out = new Map<BiomeId, number>();
  const step = 200000;
  for (let from = 0; from < limit && out.size < BIOME_IDS.length; from += step) {
    for (const s of stretchesBetween(seed, from, from + step)) {
      if (!out.has(s.biome) && s.start >= from) out.set(s.biome, (s.start + s.end) / 2);
    }
  }
  return out;
}

/** Borders (blend midpoints) between consecutive stretches, with the two biomes. */
export function borders(seed: number, from: number, to: number): { at: number; a: BiomeId; b: BiomeId }[] {
  const list = stretchesBetween(seed, from, to);
  const out: { at: number; a: BiomeId; b: BiomeId }[] = [];
  for (let i = 1; i < list.length; i++) out.push({ at: list[i].start, a: list[i - 1].biome, b: list[i].biome });
  return out;
}

/** The first landmark of every kind. */
export function firstLandmarks(seed: number, limit = 2e6): Map<LandmarkKind, number> {
  const out = new Map<LandmarkKind, number>();
  const step = 100000;
  for (let from = 0; from < limit; from += step) {
    for (const m of landmarksBetween(seed, from, from + step)) if (!out.has(m.kind)) out.set(m.kind, m.at);
    if (out.size >= 11) break;
  }
  return out;
}
