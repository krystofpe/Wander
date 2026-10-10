// How the creature is drawn, shared by its sprite sheet (tools/art/sprites/creature.ts) and the page: the canvas, where
// its head is in each frame (so the eyes, drawn apart, sit in its face), where its hands hold things, and which
// glowing colour its eyes take for each mood. Pure.

/** The sheet's canvas: 24 × 26, facing right, its feet on the last row; `tall` from there to the mushroom on top. */
export const CREATURE = { w: 24, h: 26, foot: 25, tall: 25 } as const;

export const POSE_TAGS = ['stand', 'walk', 'sit', 'jump', 'wave', 'dig', 'eat', 'front', 'frontwave', 'curl'] as const;
export type PoseTag = (typeof POSE_TAGS)[number];

/** Where its face (with what grows on top) is, frame by frame, from the standing face (dx, dy): the eyes move with it. */
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
    [1, 2],
    [1, 3],
  ],
  eat: [
    [1, 3],
    [1, 4],
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
    [1, 4],
    [1, 4],
  ],
};

/** The top-left of its eyes (a 5 × 3 sprite) with the face unmoved, in its pale face above the blush. */
export const EYES_SIDE: readonly [number, number] = [14, 14];
export const EYES_FRONT: readonly [number, number] = [9, 14];

/** Where a held thing hangs (its centre), per pose, from the sprite's top-left: in its paws in front. */
export const HAND: Readonly<Record<PoseTag, readonly [number, number]>> = {
  stand: [21, 19],
  walk: [21, 19],
  sit: [21, 21],
  jump: [21, 16],
  wave: [21, 19],
  dig: [21, 22],
  eat: [21, 23],
  front: [12, 21],
  frontwave: [12, 21],
  curl: [21, 23],
};
export const LANTERN: readonly [number, number] = [22, 18];

/**
 * The great tree (tools/art/sprites/hollow.ts): its foot `w` × `h` with the trunk `trunk` wide at its top, the
 * hollow's door (its centre from the left, its width and height), the peg its lantern hangs on, and the height of the
 * trunk's repeating segment. Drawn for the left edge.
 */
export const TREE = { w: 150, h: 100, trunk: 92, door: { x: 68, w: 21, h: 30 }, peg: [86, 79] as const, tile: 128 } as const;

/**
 * Its stone in the hollow (tools/art/sprites/nest.ts), where it sleeps: the sprite `w` × `h` standing on its last row,
 * where on it it lies (its centre from the left, the width and height it takes up there), how high the stone's top
 * is above the ground (it sleeps up there), and where on the stone its lantern stands.
 */
export const NEST = { w: 60, h: 20, door: { x: 30, w: 26, h: 14 }, top: 15, peg: [12, 3] as const } as const;

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
