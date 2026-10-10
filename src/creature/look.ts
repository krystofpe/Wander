// How the creature is drawn, shared by its sprite sheet (tools/art/sprites/creature.ts) and the page: the canvas, where
// its head is in each frame (so the eyes, drawn apart, sit in its face), where its hands hold things, and which
// glowing colour its eyes take for each mood. Pure.

/** The sheet's canvas: 24 × 26, facing right, its paws on the last row; `tall` from there to its ear tips. */
export const CREATURE = { w: 24, h: 26, foot: 25, tall: 25 } as const;

export const POSE_TAGS = ['stand', 'walk', 'sit', 'jump', 'wave', 'dig', 'eat', 'front', 'frontwave'] as const;
export type PoseTag = (typeof POSE_TAGS)[number];

/** Where its head (with its ears) is, frame by frame, from the standing head (dx, dy): the eyes move with it. */
export const HEAD: Readonly<Record<PoseTag, readonly (readonly [number, number])[]>> = {
  stand: [
    [0, 0],
    [0, 0],
  ],
  walk: [
    [0, 0],
    [0, -1],
    [0, 0],
    [0, -1],
  ],
  sit: [
    [-1, 0],
    [-1, 1],
  ],
  jump: [[0, -2]],
  wave: [
    [0, 0],
    [0, 0],
  ],
  dig: [
    [2, 6],
    [2, 7],
  ],
  eat: [
    [2, 5],
    [2, 6],
  ],
  front: [
    [0, 0],
    [0, 1],
  ],
  frontwave: [
    [0, 0],
    [0, 0],
  ],
};

/** The top-left of its eyes (a 5 × 3 sprite) with the head unmoved, in the dark band across its face. */
export const EYES_SIDE: readonly [number, number] = [13, 9];
export const EYES_FRONT: readonly [number, number] = [8, 9];

/** Where a held thing hangs (its centre), per pose, from the sprite's top-left: in its mouth, or in its front paws. */
export const HAND: Readonly<Record<PoseTag, readonly [number, number]>> = {
  stand: [22, 14],
  walk: [22, 14],
  sit: [21, 14],
  jump: [22, 12],
  wave: [22, 14],
  dig: [22, 21],
  eat: [22, 19],
  front: [12, 21],
  frontwave: [12, 21],
};
export const LANTERN: readonly [number, number] = [22, 20];

/**
 * The great tree (tools/art/sprites/hollow.ts): its foot `w` × `h` with the trunk `trunk` wide at its top, the
 * hollow's door (its centre from the left, its width and height), the peg its lantern hangs on, and the height of the
 * trunk's repeating segment. Drawn for the left edge.
 */
export const TREE = { w: 150, h: 100, trunk: 92, door: { x: 68, w: 21, h: 30 }, peg: [86, 79] as const, tile: 128 } as const;

/** Moods in the order of the palette's `mood` family (src/palette.ts). */
export const MOOD_EYES = ['content', 'joyful', 'calm', 'curious', 'sleepy', 'hungry', 'bored', 'lonely', 'grumpy', 'scared', 'love', 'sad'] as const;
export type EyeColour = (typeof MOOD_EYES)[number];

/** The eye shapes of the eyes sheet: open, shut (sleep, blink), happy (^ ^), wide (o o), cross (> <), tear (sad). */
export const EYE_SHAPES = ['open', 'shut', 'happy', 'wide', 'cross', 'tear'] as const;
export type EyeShape = (typeof EYE_SHAPES)[number];
