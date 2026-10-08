// Geography: a flat projection around the start place, Web Mercator and tile maths. Pure.

/** Pixels per tile side. */
export const TILE = 256;
/** Metres per degree of latitude, and of longitude at the equator. */
export const METRES_PER_DEGREE = 111320;

export type LatLon = { readonly lat: number; readonly lon: number };
export type Bounds = { readonly south: number; readonly west: number; readonly north: number; readonly east: number };

/** Maps world units (x east, y south, `scale` metres each) around an origin to latitude and longitude, and back. */
export class Projection {
  readonly lat0: number;
  readonly lon0: number;
  readonly scale: number;
  private readonly cosLat0: number;

  constructor(lat0: number, lon0: number, scale: number) {
    this.lat0 = lat0;
    this.lon0 = lon0;
    this.scale = scale;
    this.cosLat0 = Math.cos((lat0 * Math.PI) / 180);
  }

  toLatLon(x: number, y: number): LatLon {
    return {
      lat: this.lat0 - (y * this.scale) / METRES_PER_DEGREE,
      lon: this.lon0 + (x * this.scale) / (METRES_PER_DEGREE * this.cosLat0),
    };
  }

  toWorld(lat: number, lon: number): { x: number; y: number } {
    return {
      x: ((lon - this.lon0) * METRES_PER_DEGREE * this.cosLat0) / this.scale,
      y: ((this.lat0 - lat) * METRES_PER_DEGREE) / this.scale,
    };
  }
}

/** Web Mercator pixel coordinates at zoom z, with 256-pixel tiles. */
export function mercator(lat: number, lon: number, z: number): { px: number; py: number } {
  const n = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { px: ((lon + 180) / 360) * n, py: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

export function unmercator(px: number, py: number, z: number): LatLon {
  const n = TILE * 2 ** z;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / n))) * 180) / Math.PI, lon: (px / n) * 360 - 180 };
}

export function tileOf(lat: number, lon: number, z: number): { tx: number; ty: number } {
  const { px, py } = mercator(lat, lon, z);
  return { tx: Math.floor(px / TILE), ty: Math.floor(py / TILE) };
}

export function tileBounds(z: number, tx: number, ty: number): Bounds {
  const nw = unmercator(tx * TILE, ty * TILE, z);
  const se = unmercator((tx + 1) * TILE, (ty + 1) * TILE, z);
  return { south: se.lat, west: nw.lon, north: nw.lat, east: se.lon };
}

export function tileKey(z: number, tx: number, ty: number): string {
  return `${z}/${tx}/${ty}`;
}
