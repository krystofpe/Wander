import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_M, PACE, WALK_FRAMES, walkFrame } from '../src/walker.ts';
import { wispPose } from '../src/wisp/motion.ts';

test('the wisp has the same eight-pose cycle and normal cadence as his walk', () => {
  const duration = FRAME_M / PACE.base;
  const frames = new Set<number>();
  for (let i = 0; i < WALK_FRAMES; i++) {
    const t = (i + 0.5) * duration;
    const pose = wispPose(t);
    frames.add(pose.frame);
    assert.equal(pose.frame, walkFrame(t * PACE.base));
    assert.deepEqual(wispPose(t + WALK_FRAMES * duration), pose);
  }
  assert.equal(frames.size, 8);
  assert.deepEqual(wispPose(0.01), wispPose(duration - 0.01));
});
test('resting uses his slower two-frame sitting cadence', () => {
  assert.equal(wispPose(0, true).frame, 0);
  assert.equal(wispPose(1.599, true).frame, 0);
  assert.equal(wispPose(1.6, true).frame, 1);
  assert.equal(wispPose(2.899, true).frame, 1);
  assert.equal(wispPose(2.9, true).frame, 0);
});
