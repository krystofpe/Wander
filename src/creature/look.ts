// How the creature is drawn, shared by its sprite sheet (tools/art/sprites/creature.ts) and the page: the canvas, where
// its head is in each frame (so the eyes, drawn apart, sit in its face), where its hands hold things, and which
// glowing colour its eyes take for each mood. Pure.

/** The sheet's canvas: 24 × 26, facing right, feet on the last row. */
export const CREATURE = { w: 24, h: 26, foot: 25, tall: 23 } as const;

export const POSE_TAGS = ['stand', 'walk', 'sit', 'jump', 'wave', 'dig', 'eat', 'front', 'frontwave'] as const;
export type PoseTag = (typeof POSE_TAGS)[number];

/** Where its head is, frame by frame, from the standing head (dx, dy): the eyes move with it. */
export const HEAD: Readonly<Record<PoseTag, readonly (readonly [number, number])[]>> = {
  stand: [
    [0, 0],
    [0, 1],
  ],
  walk: [
    [0, 0],
    [1, -1],
    [0, 0],
    [1, -1],
  ],
  sit: [
    [0, 5],
    [0, 6],
  ],
  jump: [[0, -1]],
  wave: [
    [0, 0],
    [0, 0],
  ],
  dig: [
    [3, 4],
    [3, 5],
  ],
  eat: [
    [0, 1],
    [0, 0],
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

/** The top-left of its eyes (a 5 × 3 sprite) with the head unmoved: side on, and facing you. */
export const EYES_SIDE: readonly [number, number] = [11, 11];
export const EYES_FRONT: readonly [number, number] = [10, 11];

/** Where a held thing hangs (its centre), per pose, from the sprite's top-left; the lantern hangs lower. */
export const HAND: Readonly<Record<PoseTag, readonly [number, number]>> = {
  stand: [18, 19],
  walk: [18, 19],
  sit: [18, 21],
  jump: [18, 18],
  wave: [18, 19],
  dig: [21, 22],
  eat: [17, 15],
  front: [12, 19],
  frontwave: [12, 19],
};
export const LANTERN: readonly [number, number] = [19, 22];

/** Moods in the order of the palette's `mood` family (src/palette.ts). */
export const MOOD_EYES = ['content', 'joyful', 'calm', 'curious', 'sleepy', 'hungry', 'bored', 'lonely', 'grumpy', 'scared', 'love', 'sad'] as const;
export type EyeColour = (typeof MOOD_EYES)[number];

/** The eye shapes of the eyes sheet: open, shut (sleep, blink), happy (^ ^), wide (o o), cross (> <), tear (sad). */
export const EYE_SHAPES = ['open', 'shut', 'happy', 'wide', 'cross', 'tear'] as const;
export type EyeShape = (typeof EYE_SHAPES)[number];
