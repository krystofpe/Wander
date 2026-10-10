// How the creature is drawn, shared by its sprite sheet (tools/art/sprites/creature.ts) and the page: the canvas, where
// its head is in each frame (so the eyes, drawn apart, sit in its face), where its hands hold things, and which
// glowing colour its eyes take for each mood. Pure.

/** The sheet's canvas: 24 × 26, facing right, its hem on the last row; `tall` from there to the top of its dome. */
export const CREATURE = { w: 24, h: 26, foot: 25, tall: 23 } as const;

export const POSE_TAGS = ['stand', 'walk', 'sit', 'jump', 'wave', 'dig', 'eat', 'front', 'frontwave'] as const;
export type PoseTag = (typeof POSE_TAGS)[number];

/** Where its mask is, frame by frame, from the standing mask (dx, dy): the eyes move with it. */
export const HEAD: Readonly<Record<PoseTag, readonly (readonly [number, number])[]>> = {
  stand: [
    [0, 0],
    [0, 1],
  ],
  walk: [
    [0, 0],
    [0, -1],
    [0, -1],
    [0, 0],
  ],
  sit: [
    [0, 4],
    [0, 4],
  ],
  jump: [[0, -2]],
  wave: [
    [0, 0],
    [0, 0],
  ],
  dig: [
    [2, 4],
    [2, 5],
  ],
  eat: [
    [0, 0],
    [0, 1],
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

/** The top-left of its eyes (a 5 × 3 sprite) with the mask unmoved, in its eye holes: side on, and facing you. */
export const EYES_SIDE: readonly [number, number] = [12, 9];
export const EYES_FRONT: readonly [number, number] = [9, 9];

/** Where a held thing hangs (its centre), per pose, from the sprite's top-left: in its hand of shadow; the lantern lower. */
export const HAND: Readonly<Record<PoseTag, readonly [number, number]>> = {
  stand: [19, 19],
  walk: [19, 19],
  sit: [19, 21],
  jump: [19, 17],
  wave: [19, 19],
  dig: [21, 23],
  eat: [15, 16],
  front: [12, 20],
  frontwave: [12, 20],
};
export const LANTERN: readonly [number, number] = [19, 22];

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
