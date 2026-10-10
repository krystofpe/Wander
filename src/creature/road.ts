// His road, as the creature's page knows it: his journey as last saved, and his clock moved on from it, for the
// hour of its nightly visit to his camp (src/creature/visit.ts). On the published page the live road is followed
// instead (src/live.ts). Pure.
import { hourOfDay } from '../sky.ts';

/** His journey as the creature knows it: his road's seed, where he was at the last save, and when; his clock then. */
export type Saved = { readonly seed: number; readonly at: number; readonly savedAt: number; readonly clock?: number };

/**
 * His clock (world hours) at `ms`, from his journey's clock moved on: `daySec` real seconds to his day (an hour unless
 * his road was opened with --day).
 */
export function clockAt(journey: Saved, ms: number, daySec = 3600): number {
  return (journey.clock ?? 12) + ((ms - journey.savedAt) / 1000) * (24 / daySec);
}

/** His hour of the day at `ms`, from his journey. */
export function hourAt(journey: Saved, ms: number, daySec = 3600): number {
  return hourOfDay(clockAt(journey, ms, daySec));
}
