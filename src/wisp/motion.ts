import { loopFrame, PACE, WALK_FRAMES, walkFrame } from '../walker.ts';

/** Eight drifting poses at his normal walking cadence; two quiet resting poses. */
export function wispPose(t: number, rest = false): { frame: number; bob: number; ribbon: number } {
  const frame = rest ? loopFrame([1600, 1300], t) : walkFrame(t * PACE.base);
  return {
    frame,
    bob: rest ? 1 : [0, 0, 1, 1, 0, 0, -1, -1][frame],
    ribbon: frame * Math.PI * 2 / (rest ? 2 : WALK_FRAMES),
  };
}
