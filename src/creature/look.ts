// How the creature is drawn, shared by its sprite sheet (tools/art/sprites/creature.ts) and the page: the canvas, where
// its head is in each frame (so the eyes, drawn apart, sit in its face), where its hands hold things, and which
// glowing colour its eyes take for each mood. Pure.

/** The sheet's canvas: 24 × 26, facing right, its feet on the last row; `tall` from there to the blades on its crown. */
export const CREATURE = { w: 24, h: 26, foot: 25, tall: 25 } as const;

export const POSE_TAGS = ['stand', 'walk', 'sit', 'jump', 'wave', 'dig', 'eat', 'front', 'frontwave', 'curl'] as const;
export type PoseTag = (typeof POSE_TAGS)[number];

/** Where its face (with the blades on its crown) is, frame by frame, from the standing face (dx, dy): the eyes move with it. */
export const HEAD: Readonly<Record<PoseTag, readonly (readonly [number, number])[]>> = {
  stand: [
    [0, 0],
    [0, 1],
  ],
  walk: [
    [0, 0],
    [0, -1],
    [0, 0],
    [0, -1],
  ],
  sit: [
    [0, 2],
    [0, 3],
  ],
  jump: [[0, -2]],
  wave: [
    [0, 0],
    [0, 0],
  ],
  dig: [
    [1, 3],
    [1, 4],
  ],
  eat: [
    [1, 4],
    [1, 5],
  ],
  front: [
    [0, 0],
    [0, 1],
  ],
  frontwave: [
    [0, 0],
    [0, 0],
  ],
  curl: [
    [2, 6],
    [2, 6],
  ],
};

/** The top-left of its eyes (a 5 × 3 sprite) with the face unmoved, above its smile. */
export const EYES_SIDE: readonly [number, number] = [13, 12];
export const EYES_FRONT: readonly [number, number] = [9, 12];

/** Where a held thing hangs (its centre), per pose, from the sprite's top-left: in the fork of a twig arm. */
export const HAND: Readonly<Record<PoseTag, readonly [number, number]>> = {
  stand: [22, 14],
  walk: [22, 14],
  sit: [22, 16],
  jump: [22, 10],
  wave: [22, 14],
  dig: [21, 20],
  eat: [21, 21],
  front: [22, 13],
  frontwave: [1, 13],
  curl: [21, 22],
};
export const LANTERN: readonly [number, number] = [22, 15];

/**
 * The great tree (tools/art/sprites/hollow.ts): its foot `w` × `h` with the trunk `trunk` wide at its top, the
 * hollow's door (its centre from the left, its width and height), the peg its lantern hangs on, and the height of the
 * trunk's repeating segment. Drawn for the left edge.
 */
export const TREE = { w: 150, h: 100, trunk: 92, door: { x: 68, w: 21, h: 30 }, peg: [86, 79] as const, tile: 128 } as const;

/**
 * The nest in the hollow (tools/art/sprites/nest.ts): its sprite `w` × `h` standing on its last row, the bowl it curls
 * up in (its centre from the left, its width and how high it shows), the giant mushroom's stem (its column at the
 * root), and where on the cap's rim its lantern hangs. Drawn with the toadstool on the right.
 */
export const NEST = { w: 64, h: 60, door: { x: 24, w: 24, h: 10 }, stem: 46, peg: [10, 24] as const } as const;

/**
 * The old trees framing the hollow at the sides of the view (tools/art/sprites/wood.ts): the trunk's width, its foot
 * (`footW` × `footH`, roots and all) and the height of its repeating segment. Drawn for the left edge.
 */
export const EDGE = { trunk: 64, footW: 150, footH: 96, tile: 112 } as const;

/** Moods in the order of the palette's `mood` family (src/palette.ts). */
export const MOOD_EYES = ['content', 'joyful', 'calm', 'curious', 'sleepy', 'hungry', 'bored', 'lonely', 'grumpy', 'scared', 'love', 'sad'] as const;
export type EyeColour = (typeof MOOD_EYES)[number];

/** The eye shapes of the eyes sheet: open, shut (sleep, blink), happy (^ ^), wide (o o), cross (> <), tear (sad). */
export const EYE_SHAPES = ['open', 'shut', 'happy', 'wide', 'cross', 'tear'] as const;
export type EyeShape = (typeof EYE_SHAPES)[number];
