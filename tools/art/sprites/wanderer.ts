// The wanderer, drawn by hand in parts and composed into frames. 32×36 canvas, facing right, feet on row 35,
// about 32 px tall: a peaked hood whose opening is darkness with two warm eyes, a long indigo coat, a pack with a
// bedroll, a walking stick. Legend in ../legend.ts.
import { block, compose, stroke } from '../compose.ts';
import type { Part, Placed } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const W = 32;
const H = 36;

// ── Parts ──────────────────────────────────────────────────────────────────

/** The hood, looking ahead. Rows 3–14. */
const HOOD: Part = block(10, 3, [
  '..ooo.......',
  '.odmmo......',
  '.odmlmoo....',
  'odmlllmmo...',
  'odmllllmmo..',
  'odmmlllmmmo.',
  'odmmmhhhhmmo',
  'odmmhhhhhhmo',
  'odmmhhehehmo',
  'odmmhhhhhhlo',
  'odmmmhhhhlo.',
  'odmmmmmmlLo.',
]);

/** Eyes shut: the opening all darkness. */
const HOOD_SHUT: Part = { ...HOOD, 11: [[10, 'odmmhhhhhhmo']] };

/** The hood turned a little back over the shoulder: the eyes at the opening's back edge. */
const HOOD_BACK: Part = { ...HOOD, 11: [[10, 'odmmehehhhmo']] };

/** The pack with its bedroll, behind his back. Rows 11–24. */
const PACK: Part = block(4, 11, [
  '..ssss..',
  '.srrrrs.',
  '.qqqqqq.',
  '..pppp..',
  '.prrrrq.',
  'prrrrrq.',
  'prrrrrq.',
  'prrqrrq.',
  'pqqqqqq.',
  'prrrrrq.',
  'prrrrrq.',
  'pqrrrqq.',
  '.pqqqqq.',
  '..pppp..',
]);

/** The torso, slim, the near arm forward with the hand at the stick. Rows 15–27. */
const TORSO_HOLD: Part = block(10, 15, [
  'odllllllllo..',
  'odmmmmmlllo..',
  'odmmmmdlllmo.',
  'odmmmmmdllmo.',
  'odmmmmmdllmo.',
  'odmmmmmmdllo.',
  'odmmmmmmmdlo.',
  'odmmmmmmmdo..',
  'odmmmmmmmmo..',
  'oddmmmmmmmo..',
  'oddmmmmmmmmo.',
  'oddmmmmmmmmo.',
  'oddmmmmmmmmmo',
]);

/** The torso with the forearm raised to the hood (smoking). */
const TORSO_SMOKE: Part = block(10, 15, [
  'odllllllllo..',
  'odmmmmmmllo..',
  'odmmmmmmllo..',
  'odmmmmmdllo..',
  'odmmmmmdlmo..',
  'odmmmmmmdmo..',
  'odmmmmmmmmo..',
  'odmmmmmmmmo..',
  'odmmmmmmmmo..',
  'oddmmmmmmmo..',
  'oddmmmmmmmmo.',
  'oddmmmmmmmmo.',
  'oddmmmmmmmmmo',
]);

/** The forearm raised: hand at the hood's opening, the cigarette between the fingers. */
const ARM_RAISED: Part = block(16, 12, [
  '....dd.',
  '...dlld',
  '..dlld.',
  '.dlld..',
]);

/** The coat below the waist: neutral, flared (contact) and narrow (passing). Rows 26–31. */
const SKIRT: Part = block(9, 26, ['.oddmmmmmmmmo..', '.oddmmmmmmmmmo.', 'oddmmmmmmmmmmo.', 'oddmmmmmmmmmmmo', 'oddmmmmmmmmmmmo', 'ooddddddddddoo.']);
const SKIRT_WIDE: Part = block(8, 26, ['..oddmmmmmmmmo...', '..oddmmmmmmmmmo..', '.oddmmmmmmmmmmmo.', '.oddmmmmmmmmmmmmo', 'oddmmmmmmmmmmmmmo', 'oodddddddddddddoo']);
const SKIRT_NARROW: Part = block(9, 26, ['.oddmmmmmmmmo.', '.oddmmmmmmmmo.', '.oddmmmmmmmmmo', '.oddmmmmmmmmmo', 'oddmmmmmmmmmmo', '.oodddddddddo.']);

/**
 * A leg below the coat: the shin from under the coat (it starts hidden, at row 28) to the ankle, and the boot.
 * `heel` is the boot's heel column relative to the body's centre (column 14), `lift` how far the foot is off the
 * ground; the boot tilts at contact (toe up) and at push-off (heel up). The far leg is darker, drawn behind.
 */
function leg(heel: number, lift: number, far: boolean, tilt: 'flat' | 'toeUp' | 'heelUp'): Part {
  const x = 14 + heel;
  const ankle = 33 - lift;
  const shin = far ? 'oo' : 'do';
  const hip = 14 + Math.round(heel * 0.3) + (far ? -1 : 0);
  const parts: Record<number, [number, string][]> = {};
  const add = (y: number, x0: number, str: string): void => {
    parts[y] = [...(parts[y] ?? []), [x0, str]];
  };
  for (let y = 28; y <= ankle; y++) {
    const t = (y - 28) / Math.max(1, ankle - 28);
    add(y, Math.round(hip + (x + 1 - hip) * t), shin);
  }
  const hi = far ? 'b' : 'B';
  if (tilt === 'heelUp') {
    add(ankle + 1, x + 1, `b${hi}`);
    add(ankle + 2, x + 2, 'bbb');
  } else if (tilt === 'toeUp') {
    add(ankle + 1, x, `bb${hi}b`);
    add(ankle + 2, x, 'bb');
  } else {
    add(ankle + 1, x + 1, `b${hi}`);
    add(ankle + 2, x, 'bbbb');
  }
  return parts;
}

/** The stick from its foot (x, y) up through the hand at (22, 21), to a length of 27 rows. */
function stick(footX: number, footY: number): Part {
  const hx = 22;
  const hy = 21;
  const k = (footX - hx) / (footY - hy);
  const topY = footY - 27;
  const topX = Math.round(hx + k * (topY - hy));
  return stroke(topX, topY, footX, footY, 'k', 'K');
}

/** The near hand over the stick (drawn last). */
const HAND: Part = block(21, 21, ['dd', 'd.']);

// ── The walk: 8 frames (contact, down, passing, up, then the other leg) ─────

type Pose = { readonly near: [number, number, 'flat' | 'toeUp' | 'heelUp']; readonly far: [number, number, 'flat' | 'toeUp' | 'heelUp']; readonly bob: number; readonly skirt: Part; readonly stick: [number, number] };

// The planted foot travels back 3–4 px a frame (14 px a step); the stick plants every second step.
const WALK: readonly Pose[] = [
  { near: [4, 0, 'toeUp'], far: [-10, 1, 'heelUp'], bob: 0, skirt: SKIRT_WIDE, stick: [27, 35] },
  { near: [1, 0, 'flat'], far: [-5, 2, 'flat'], bob: 1, skirt: SKIRT_WIDE, stick: [24, 35] },
  { near: [-3, 0, 'flat'], far: [0, 2, 'flat'], bob: 0, skirt: SKIRT, stick: [20, 35] },
  { near: [-6, 0, 'flat'], far: [4, 1, 'flat'], bob: -1, skirt: SKIRT_NARROW, stick: [17, 35] },
  { near: [-10, 1, 'heelUp'], far: [4, 0, 'toeUp'], bob: 0, skirt: SKIRT_WIDE, stick: [18, 33] },
  { near: [-5, 2, 'flat'], far: [1, 0, 'flat'], bob: 1, skirt: SKIRT_WIDE, stick: [22, 32] },
  { near: [0, 2, 'flat'], far: [-3, 0, 'flat'], bob: 0, skirt: SKIRT, stick: [26, 32] },
  { near: [4, 1, 'flat'], far: [-6, 0, 'flat'], bob: -1, skirt: SKIRT_NARROW, stick: [28, 34] },
];

function walkFrame(i: number): string[] {
  const p = WALK[i];
  const prev = WALK[(i + WALK.length - 1) % WALK.length];
  const upper: Placed[] = [
    { part: PACK, dy: p.bob },
    { part: TORSO_HOLD, dy: p.bob },
    { part: HOOD, dy: p.bob },
  ];
  return compose(W, H, [
    leg(p.far[0], p.far[1], true, p.far[2]),
    stick(p.stick[0], p.stick[1]),
    // The coat swings a frame behind the body.
    { part: p.skirt, dy: prev.bob },
    leg(p.near[0], p.near[1], false, p.near[2]),
    ...upper,
    { part: HAND, dy: p.bob },
  ]);
}

/** Standing still: four breaths (the chest and pack rise a pixel, the hood follows a frame later). */
function standFrame(i: number, hood: Part = HOOD): string[] {
  const chest = [0, 0, -1, -1][i];
  const head = [0, 0, 0, -1][i];
  return compose(W, H, [
    leg(-4, 0, true, 'flat'),
    stick(25, 35),
    SKIRT,
    leg(0, 0, false, 'flat'),
    { part: PACK, dy: chest },
    { part: TORSO_HOLD, dy: chest },
    { part: hood, dy: head },
    { part: HAND, dy: chest },
  ]);
}

/** Smoking where he stands: the hand comes up, the ember brightens on the drag, the hand goes down. */
function smokeFrame(stage: number): string[] {
  const ember = ['x', 'X', '*', '*', 'X'][stage];
  return compose(W, H, [
    leg(-4, 0, true, 'flat'),
    stick(25, 35),
    SKIRT,
    leg(0, 0, false, 'flat'),
    PACK,
    TORSO_SMOKE,
    HOOD,
    ARM_RAISED,
    block(21, 12, [`c${ember}`]),
  ]);
}

export const SHEET: Sheet = {
  name: 'wanderer',
  w: W,
  h: H,
  tags: [
    { name: 'walk', ms: 170, frames: WALK.map((_, i) => walkFrame(i)) },
    { name: 'stand', ms: [900, 700, 900, 700], frames: [0, 1, 2, 3].map((i) => standFrame(i)) },
    { name: 'look', ms: [1200, 2400], frames: [standFrame(0, HOOD), standFrame(0, HOOD_BACK)] },
    { name: 'smoke', ms: [600, 600, 900, 900, 600], frames: [0, 1, 2, 3, 4].map(smokeFrame) },
    { name: 'shut', ms: 1000, frames: [standFrame(0, HOOD_SHUT)] },
  ],
  points: { ember: [22, 12], feet: [14, 35] },
};
