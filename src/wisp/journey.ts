// A self-sufficient spirit's journey. No hunger, neglect, or attention timers.
import { unit } from '../noise.ts';
import { camping, VISIT, visitAt } from '../creature/visit.ts';
import type { Visit } from '../creature/visit.ts';

export const REALMS = ['The scattered stars', 'The dust sea', 'The distant lights', 'The quiet between'] as const;
export const REALM_SECONDS = 240;
/** Hours on his clock: eighteen seconds to open, twenty-four to travel on a one-hour day. */
export const WISP_CROSSING = { opening: 0.12, travel: 0.16 } as const;
export type WispSave = { version: 1; seed: number; bornAt: number; meetings: number; lastNight: number | null; emberAt: number | null; emberNight: number | null };

export function newWisp(seed: number, now: number): WispSave {
  return { version: 1, seed, bornAt: now, meetings: 0, lastNight: null, emberAt: null, emberNight: null };
}

export function reviveWisp(value: unknown): WispSave | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  if (s.version !== 1 || typeof s.seed !== 'number' || !Number.isSafeInteger(s.seed) || typeof s.bornAt !== 'number' || !Number.isFinite(s.bornAt) || typeof s.meetings !== 'number' || !Number.isSafeInteger(s.meetings) || s.meetings < 0) return null;
  if (s.lastNight !== null && (typeof s.lastNight !== 'number' || !Number.isSafeInteger(s.lastNight))) return null;
  const emberAt = s.emberAt ?? null, emberNight = s.emberNight ?? null;
  if (emberAt !== null && (typeof emberAt !== 'number' || !Number.isFinite(emberAt))) return null;
  if (emberNight !== null && (typeof emberNight !== 'number' || !Number.isSafeInteger(emberNight))) return null;
  return { version: 1, seed: s.seed as number, bornAt: s.bornAt as number, meetings: s.meetings as number, lastNight: s.lastNight as number | null, emberAt: emberAt as number | null, emberNight: emberNight as number | null };
}

/** Crossings are occasional, shared by both views, and happen only at an actual camp. */
export function boundVisit(road: { seed: number; clock: number; act: string; stage: string; fire: unknown }, preview = false): Visit | null {
  if (!camping(road)) return null;
  const v = visitAt(road.clock, road.seed);
  if (v === null || (!preview && unit(v.night, road.seed ^ 0x71bf) >= 0.42)) return null;
  let t = ((road.clock - VISIT.from) % 24 + 24) % 24;
  const span = (VISIT.to - VISIT.from + 24) % 24;
  const phases = [['opening', WISP_CROSSING.opening], ['coming', WISP_CROSSING.travel], ['with', span - 2 * (WISP_CROSSING.opening + WISP_CROSSING.travel)], ['going', WISP_CROSSING.travel], ['closing', WISP_CROSSING.opening]] as const;
  for (const [phase, length] of phases) {
    if (t < length) return { ...v, phase, k: t / length };
    t -= length;
  }
  return null;
}

export function keepMeeting(save: WispSave, visit: Visit | null): boolean {
  if (visit?.phase !== 'with' || save.lastNight === visit.night) return false;
  save.lastNight = visit.night;
  save.meetings++;
  return true;
}

export function dreamAt(seconds: number, seed: number): { realm: number; next: number; blend: number; act: 'drift' | 'play' | 'rest'; x: number; y: number } {
  const t = Math.max(0, seconds);
  const chapter = Math.floor(t / REALM_SECONDS);
  const progress = (t % REALM_SECONDS) / REALM_SECONDS;
  const blend = Math.max(0, (progress - 0.86) / 0.14);
  const cycle = t % 110;
  const act = cycle > 83 ? 'rest' : cycle > 48 && cycle < 67 ? 'play' : 'drift';
  const phase = unit(0, seed) * Math.PI * 2;
  return {
    realm: chapter % REALMS.length, next: (chapter + 1) % REALMS.length,
    blend: blend * blend * (3 - 2 * blend), act,
    x: 0.43 + Math.sin(t * 0.018 + phase) * 0.055,
    y: 0.49 + Math.sin(t * 0.039 + phase) * 0.04 + (act === 'play' ? Math.sin((cycle - 48) * 0.38) * Math.sin(Math.PI * (cycle - 48) / 19) * 0.035 : 0),
  };
}

/** A trace of the fire, renewed once on returning; its age survives closing the page. */
export function keepEmber(save: WispSave, visit: Visit | null, now: number): boolean {
  if (visit?.phase !== 'closing' || save.emberNight === visit.night) return false;
  save.emberAt = now; save.emberNight = visit.night;
  return true;
}
export function emberStrength(save: WispSave, now: number): number {
  if (save.emberAt === null) return 0;
  const k = Math.max(0, Math.min(1, (now - save.emberAt) / 150000));
  return (1 - k) * (1 - k);
}

/** A rare light awakens; the guardian slows, watches, and gently follows before drifting on. */
export function noticeAt(seconds: number, seed: number): { strength: number; x: number; y: number; start: number } {
  const cycle = Math.floor(Math.max(0, seconds) / 170);
  const start = cycle * 170 + 28 + unit(cycle, seed ^ 0x84bc) * 32;
  const k = (seconds - start) / 24;
  const realm = dreamAt(seconds, seed);
  const cycleAge = ((seconds % 110) + 110) % 110;
  const awake = Math.max(0, Math.min(1, (83 - cycleAge) / 5, cycleAge / 5));
  const strength = k > 0 && k < 1 && realm.realm !== 3 ? Math.sin(Math.PI * k) ** 2 * (1 - realm.blend) * awake : 0;
  const origin = dreamAt(start, seed);
  const side = unit(cycle, seed ^ 0xab32) > 0.5 ? 1 : -1;
  return { strength, x: origin.x + side * 0.105, y: origin.y - 0.07, start };
}
