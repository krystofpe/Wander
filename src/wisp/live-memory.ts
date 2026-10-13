import { LIVE, LIVE_SEED, liveAt, liveEnv, stepAt } from '../live.ts';
import { VISIT } from '../creature/visit.ts';
import { boundVisit, keepMeeting, WISP_CROSSING } from './journey.ts';
import type { WispSave } from './journey.ts';

const DAY_MS = LIVE.day * 1000;
const START_MS = (VISIT.from + WISP_CROSSING.opening + WISP_CROSSING.travel - LIVE.sleep) / 24 * DAY_MS;
const END_MS = (VISIT.to + 24 - WISP_CROSSING.opening - WISP_CROSSING.travel - LIVE.sleep) / 24 * DAY_MS;

/** Recover real eligible meetings since adoption, even when no page rendered the visit.
 * One actual live-road sample per intersected night; the saved cursor prevents repeated replay. */
export function catchUpLiveMeetings(save: WispSave, now: number): boolean {
  const migrationFloor = save.lastNight === null ? save.bornAt : LIVE.epoch + (save.lastNight - 1) * DAY_MS + END_MS;
  const from = Math.max(save.bornAt, save.liveCheckedAt ?? migrationFloor, LIVE.epoch);
  if (!Number.isFinite(now) || now <= from) return false;
  const first = Math.max(0, Math.floor((from - LIVE.epoch - END_MS) / DAY_MS));
  const last = Math.floor((now - LIVE.epoch - START_MS) / DAY_MS);
  const env = liveEnv(LIVE_SEED);
  for (let k = first; k <= last; k++) {
    const start = LIVE.epoch + k * DAY_MS + START_MS;
    const end = LIVE.epoch + k * DAY_MS + END_MS;
    const sample = Math.max(from, start) + LIVE.tick * 1000;
    if (sample >= end || sample > now) continue;
    const road = liveAt(LIVE_SEED, stepAt(sample), env);
    keepMeeting(save, boundVisit(road));
  }
  save.liveCheckedAt = now;
  return true;
}

/** Convert the shared world's clock to its actual timeline, including frozen preview dates. */
export function liveTimeOf(clock: number): number {
  return LIVE.epoch + (clock - LIVE.sleep) / 24 * DAY_MS;
}
