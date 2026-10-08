// Place names to coordinates through Nominatim, cached.
import { createHash } from 'node:crypto';
import { REAL } from './config.ts';
import type { Net } from './net.ts';

export type Place = { readonly lat: number; readonly lon: number; readonly name: string };
type Result = { readonly lat?: string; readonly lon?: string; readonly display_name?: string };

/** Resolves `text` to its first Nominatim result. Throws `place not found: …` when there is none. */
export async function resolvePlace(text: string, net: Net): Promise<Place> {
  const query = text.trim();
  const url = `${REAL.nominatimUrl}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const cacheFile = `places/${createHash('sha1').update(query.toLowerCase()).digest('hex').slice(0, 16)}.json`;
  const bytes = await net.get(url, cacheFile);
  let results: unknown = null;
  try {
    results = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    results = null;
  }
  const first = Array.isArray(results) ? (results[0] as Result | undefined) : undefined;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  if (first === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    net.forget(cacheFile);
    throw new Error(`place not found: ${query}`);
  }
  const name = (first.display_name ?? '').split(',')[0].trim();
  return { lat, lon, name: name.length > 0 ? name : query };
}
