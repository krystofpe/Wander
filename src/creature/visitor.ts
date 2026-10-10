// The visitor: now and then, in the dark, something tall walks through the glow at the end of the path,
// from one side to the other, and is gone. It keeps the world's clock, so it comes while the game is closed
// too; whoever is looking may see it. Only under the canopy.
import { BIOMES, VISITOR } from './config.ts';
import type { BiomeName } from './config.ts';
import { hash2 } from '../noise.ts';

/** How far across it is (0 … 1) and which way it walks. */
export type Visit = { readonly progress: number; readonly dir: 1 | -1 };

/** Whether it is crossing at world time `ms` (milliseconds) for a creature's seed, with the light as it is. */
export function visitAt(ms: number, seed: number, biome: BiomeName, daylight: number): Visit | null {
  if (!BIOMES[biome].canopy || daylight > 0.3) return null;
  const every = VISITOR.everyMin * 60000;
  const t = ms + (hash2(seed, 77, 0x715) % every);
  const n = Math.floor(t / every);
  const h = hash2(n, seed, 0x51717);
  if ((h % 1000) / 1000 >= VISITOR.chance) return null;
  const age = (t - n * every) / 1000;
  if (age >= VISITOR.crossSec) return null;
  return { progress: age / VISITOR.crossSec, dir: ((h >>> 12) & 1) === 1 ? 1 : -1 };
}
