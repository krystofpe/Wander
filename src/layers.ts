// The parallax layers: their depths, and how a column of a layer maps to the road. One number, z (depth in
// units of the playfield's distance), sets each layer's scroll (1/z), drawn scale, baseline and haze
// (research: Depth §1–2, §7). Pure.

export type LayerKind = 'clouds' | 'land' | 'trees' | 'ground' | 'fore';

export type LayerDef = {
  readonly name: string;
  readonly z: number;
  readonly kind: LayerKind;
  /** Rows of its ring texture. */
  readonly height: number;
  /** Texture row of the screen's top row when the camera is level (vertical margin above the view). */
  readonly top: number;
};

/** Native pixels per metre on the playfield: he is about 1.8 m and 32 px. */
export const PX_PER_M = 18;

/** Native view height and the walk line (where his feet are) on screen. */
export const VIEW_H = 360;
export const WALK_Y = 296;

/** Furthest the camera rises or falls from level, native px (from the steepest ground). */
export const CAM_RANGE = 260;

/** Ring texture width (columns) for every layer, and chunk width. */
export const RING_W = 2048;
export const CHUNK_W = 128;

const margin = (z: number): number => Math.ceil(CAM_RANGE / z) + 8;

const layer = (name: string, z: number, kind: LayerKind): LayerDef => {
  const m = kind === 'ground' || kind === 'fore' ? CAM_RANGE + 8 : margin(z);
  // Room above the view for growing screens (up to ~400 rows) and below for camera travel.
  return { name, z, kind, height: VIEW_H + 48 + 2 * m, top: m + 48 };
};

/** Back to front. */
export const LAYERS: readonly LayerDef[] = [
  layer('clouds', 40, 'clouds'),
  layer('mountains', 22, 'land'),
  layer('farridge', 13, 'land'),
  layer('ridge', 8, 'land'),
  layer('farhills', 5, 'land'),
  layer('hills', 3, 'land'),
  layer('mid', 2, 'trees'),
  layer('near', 1.4, 'trees'),
  layer('ground', 1, 'ground'),
  layer('fore', 0.6, 'fore'),
];

export const GROUND = LAYERS.findIndex((l) => l.kind === 'ground');

/** Horizontal screen position of him, as a share of the native width, while walking. */
export const HIM_X = 0.38;

/**
 * The road distance a column of a layer belongs to: where that column passes his screen position. A layer
 * with parallax 1/z shows its column `u` at his x when the camera is at `u·z/PX_PER_M`.
 */
export function columnDistance(u: number, z: number): number {
  return (u * z) / PX_PER_M;
}

/** The layer column at his screen position when he is at distance d (fractional). */
export function columnAt(d: number, z: number): number {
  return (d * PX_PER_M) / z;
}

/** Where a layer's baseline sits on screen (native row) for horizon `yh`, from its depth. */
export function baseline(z: number, yh: number, yg: number = WALK_Y): number {
  return yh + (yg - yh) / z;
}
