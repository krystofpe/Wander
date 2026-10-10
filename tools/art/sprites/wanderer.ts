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

// ── Sitting, kneeling, lying ───────────────────────────────────────────────

/** The torso above the waist, the near arm resting forward. Rows 15–22 (shifted when sitting). */
const TORSO_SIT: Part = block(10, 15, [
  'odllllllllo..',
  'odmmmmmlllo..',
  'odmmmmdlllo..',
  'odmmmmmdllo..',
  'odmmmmmdlllo.',
  'odmmmmmmdllo.',
  'oddmmmmmmdllo',
  'oddmmmmmmmdlo',
]);

/** The torso above the waist with the forearm raised to the hood (smoking). */
const TORSO_SIT_SMOKE: Part = block(10, 15, [
  'odllllllllo..',
  'odmmmmmmllo..',
  'odmmmmmmllo..',
  'odmmmmmdllo..',
  'odmmmmmdlmo..',
  'odmmmmmmdmo..',
  'oddmmmmmmmo..',
  'oddmmmmmmmmo.',
]);

/**
 * Sitting on a seat `s` px high (0 on the ground with the knees up, about 5 on a log, about 10 on a rock or a stump),
 * the pack on or off, smoking (an ember stage) or not, eyes open or shut. His hips rest on the seat's top and the hood
 * stands 18 px above it, as a sitting body does.
 */
function sitFrame(s: number, pack: boolean, ember: string | null, hood: Part = HOOD): string[] {
  const hip = 34 - s;
  const dy = hip - 21;
  const parts: (Part | Placed)[] = [];
  // The stick leans on the seat beside him.
  parts.push(stroke(27, 35 - 26, 25, 35, 'k', 'K'));
  if (pack) parts.push({ part: PACK, dy });
  parts.push({ part: ember === null ? TORSO_SIT : TORSO_SIT_SMOKE, dy });
  // The lap: the coat over the thighs, reaching forward to the knee.
  if (s >= 3) {
    parts.push(block(9, hip - 1, ['.oddmmmmmmmmmo.', 'oddmmmmmmmmmmmo', 'oodddddddddddo.']));
    // Shins straight down from the knee to the ground, the far one a little behind and darker; boots.
    for (let y = hip + 1; y <= 33; y++) parts.push(block(19, y, ['oodo']));
    parts.push(block(19, 34, ['bbBB.']), block(19, 35, ['bbbbb']));
  } else {
    // On the ground: knees drawn up, the coat spread behind on the ground.
    parts.push(block(7, hip - 2, ['...oddmmmmmmmmo.', '..oddmmmmmmmmmmo', 'oodddmmmmmmmmmmo', 'oooodddddddddoo.']));
    parts.push(block(18, hip - 5, ['..oo.', '.odmo', 'odmmo', 'odmo.']));
    parts.push(block(21, 31, ['do.', 'do.', 'odo']), block(21, 34, ['bbBB.']), block(21, 35, ['bbbbb']));
  }
  parts.push({ part: hood, dy });
  if (ember === null) parts.push(block(20, hip - 3, ['dd']));
  else {
    parts.push({ part: ARM_RAISED, dy });
    parts.push(block(21, 12 + dy, [`c${ember}`]));
  }
  return compose(W, H, parts);
}

/** The pack set down on the ground behind him at camp. */
const PACK_DOWN: Part = block(1, 27, ['..ssss..', '.srrrrs.', '.qqqqqq.', 'prrrrrq.', 'prrqrrq.', 'pqqqqqq.', 'prrrrrq.', 'pqrrrqq.', '.pppppp.']);

/** Kneeling at the fire: reaching to it (0), striking a match (1), blowing on it with the hood bowed (2). */
function kneelFrame(stage: number): string[] {
  const dy = 9;
  const lean = stage === 2 ? 2 : 1;
  const parts: (Part | Placed)[] = [PACK_DOWN, stroke(4, 33, 9, 22, 'k', 'K')];
  // The far shin flat on the ground, the near foot planted with the knee up.
  parts.push(block(8, 34, ['oooooo.']), block(7, 35, ['bbbbbbb']));
  parts.push({ part: TORSO_SIT, dx: lean, dy });
  parts.push(block(9 + lean, 29, ['.oddmmmmmmmmo.', 'oddmmmmmmmmmmo', 'oodddddddddoo.']));
  parts.push(block(19, 27, ['.oo.', 'odmo', 'odmo', 'odo.', '.do.', '.do.', 'bbBB', 'bbbb']));
  parts.push({ part: stage === 2 ? HOOD_SHUT : HOOD, dx: lean + (stage === 2 ? 1 : 0), dy: dy + (stage === 2 ? 2 : 0) });
  // The arm reaching down and forward to the fire.
  const hand = stage === 0 ? [25, 31] : stage === 1 ? [24, 29] : [23, 30];
  parts.push(stroke(18 + lean, 25, hand[0], hand[1], 'l'), block(hand[0], hand[1], ['dd']));
  if (stage === 1) parts.push(block(hand[0] + 2, hand[1] - 1, ['*']));
  return compose(W, H, parts);
}

/** Lying on his side by the fire, the hood toward it, the pack under his head; `shut` closes the eyes. */
function lieFrame(breath: number, shut: boolean): string[] {
  const eyes = shut ? 'hh' : 'ee';
  return compose(W, H, [
    block(19, 32, ['..qqrrrrq.', '.prrrrrrrq', 'ppqqqqqqqp']),
    // The coat over his side rises on the breath; its last row, hidden under the rows below at rest, fills the gap.
    block(2, 27 - breath, [
      '...................ooo.....',
      '..........ooooooo.odmmo....',
      '.......oooddmmmmmooddmmmo..',
      '.......oddmmmmmmmmmddmmmo..',
    ]),
    block(2, 30, [
      '...bboddmmmmmmmmmmmmmdmhhhmo',
      '..bBBoddmmmmmmmmmmmmmmdh' + eyes + 'hmo',
      '..bbbooddddddddddddddddohhhmo',
    ]),
    block(1, 33, ['...........................']),
  ]);
}

/** His back to us, looking out at the view: hood from behind, the pack whole, the stick at his side. */
function backFrame(breath: number): string[] {
  return compose(W, H, [
    stroke(22, 9, 22, 35, 'k', 'K'),
    // The hood rises on the breath; its last row, hidden behind the bedroll at rest, keeps it on his shoulders.
    block(10, 3 - breath, ['...ooo....', '..odmmo...', '.odmmmmo..', '.odmlmmmo.', 'odmlllmmo.', 'odmmllmmmo', 'odmmmmmmmo', 'odmmmmmmmo', 'odmmmmmmmo', 'odmmmmmmmo']),
    block(9, 12, ['.sssssssss.', 'srrrrrrrrs.', 'qqqqqqqqqq.']),
    block(8, 15, [
      'odlppppppldo',
      'odmprrrrpmdo',
      'odmprrrrpmdo',
      'odmprqqrpmdo',
      'odmprrrrpmmo',
      'odmprrrrpmmo',
      'odmppppppmmo',
      'odmmmmmmmmmo',
      'odmmmmmmmmmo',
      'oddmmmmmmmmo',
      'oddmmmmmmmmmo',
      'oddmmmmmmmmmo',
      'oddmmmmmmmmmmo',
      'oddmmmmmmmmmmo',
      'oddmmmmmmmmmmo',
      'ooddddddddddoo',
    ]),
    block(11, 31, ['oo...oo', 'oo...oo', 'oo...oo', 'bbb..bbb', 'bbb..bbb']),
    block(21, 20, ['dd', 'dd']),
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
    { name: 'back', ms: [1800, 1500], frames: [backFrame(0), backFrame(1)] },
    { name: 'sit0', ms: [1600, 1300], frames: [sitFrame(0, false, null), sitFrame(0, false, null, HOOD_BACK)] },
    { name: 'sit5', ms: [1600, 1300], frames: [sitFrame(5, true, null), sitFrame(5, true, null, HOOD_BACK)] },
    { name: 'sit10', ms: [1600, 1300], frames: [sitFrame(10, true, null), sitFrame(10, true, null, HOOD_BACK)] },
    { name: 'sitsmoke0', ms: 600, frames: ['x', 'X', '*'].map((e) => sitFrame(0, false, e)) },
    { name: 'sitsmoke5', ms: 600, frames: ['x', 'X', '*'].map((e) => sitFrame(5, true, e)) },
    { name: 'sitsmoke10', ms: 600, frames: ['x', 'X', '*'].map((e) => sitFrame(10, true, e)) },
    { name: 'kneel', ms: [900, 700, 1100], frames: [0, 1, 2].map(kneelFrame) },
    { name: 'lie', ms: [2200, 2200], frames: [lieFrame(0, false), lieFrame(1, false)] },
    { name: 'sleep', ms: [2600, 2600], frames: [lieFrame(0, true), lieFrame(1, true)] },
  ],
  points: { ember: [22, 12], feet: [14, 35] },
};
