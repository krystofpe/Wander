import { wispPose } from '../../src/wisp/motion.ts';

// Native-pixel primitives shared by the dream world and the road. No antialiased paths.
export function pixelLine(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  let x = Math.round(x0), y = Math.round(y0);
  const tx = Math.round(x1), ty = Math.round(y1);
  const dx = Math.abs(tx - x), dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    c.fillRect(x, y, 1, 1);
    if (x === tx && y === ty) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}

/** Flat concentric pixel clusters: the light itself stays on the sprite's grid. */
export function glow(c: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: string, alpha: number): void {
  x = Math.round(x); y = Math.round(y);
  for (let band = 4; band >= 1; band--) {
    const r = Math.max(1, Math.round(radius * band / 4));
    c.fillStyle = `rgba(${rgb},${alpha / 4})`;
    for (let row = -r; row <= r; row++) {
      const half = Math.floor(Math.sqrt(r * r - row * row));
      c.fillRect(x - half, y + row, half * 2 + 1, 1);
    }
  }
}

// A hand-shaped 17 by 19 sprite. Each character is one flat palette colour.
const BODY = [
  '........1........', '.......121.......', '.......232.......',
  '......23321......', '.....2333321.....', '....233333321....',
  '...23333333321...', '..2333333333321..', '.233333333333321.',
  '.233333333333321.', '23333333333333210', '23333333333333210',
  '23333333333333210', '23333333333332210', '.233333333332210.',
  '.223333333322110.', '..2223333221110..', '...22222211100...',
  '.....1111100.....',
];
const SMALL_BODY = [
  '....1....', '...232...', '...332...', '..233321.',
  '.2333321.', '233333210', '233333210', '233333210',
  '.2333220.', '.2232110.', '..21100..', '...110...',
];

export function drawWisp(c: CanvasRenderingContext2D, x: number, y: number, radius: number, t: number, rest = false, warm = 0, gaze = 0): void {
  const cx = Math.round(x), cy = Math.round(y);
  const pose = wispPose(t, rest);
  const palette = warm > 0.5 ? ['#705b50', '#a38763', '#dbc594', '#f6edcc'] : ['#345b66', '#548892', '#9bcfc7', '#e1efcf'];
  const small = radius <= 5;
  const body = small ? SMALL_BODY : BODY;
  glow(c, cx, cy, small ? 18 : 37, warm > 0.5 ? '216,175,106' : '105,179,168', small ? 0.09 : 0.18);
  // The ribbon and body share an eight-pose loop, matching his normal walking cadence.
  const length = small ? 10 : 24;
  let previous: [number, number] | null = null;
  for (let i = length; i >= 0; i--) {
    const k = i / length;
    // A short, continuous ribbon rests behind the body rather than encircling its face.
    const tx = cx - (small ? 2 : 5) - i;
    const ty = cy + (small ? 2 : 4) + Math.round(Math.sin(pose.ribbon - i * 0.14) * (1 + k * (rest ? 1 : 4)));
    const thick = Math.max(0, Math.round((1 - k) * (small ? 1 : 3)));
    c.fillStyle = palette[1];
    if (previous !== null) pixelLine(c, previous[0], previous[1], tx, ty);
    c.fillStyle = palette[1]; c.fillRect(tx, ty - thick, 1, thick * 2 + 1);
    if (thick > 1) { c.fillStyle = palette[2]; c.fillRect(tx, ty - thick + 1, 1, thick); }
    previous = [tx, ty];
  }
  const top = cy - (small ? 6 : 10) + pose.bob;
  for (let row = 0; row < body.length; row++) for (let col = 0; col < body[row].length; col++) {
    const index = body[row][col];
    if (index === '.') continue;
    c.fillStyle = palette[Number(index)];
    c.fillRect(cx - (small ? 4 : 8) + col, top + row, 1, 1);
  }
  c.fillStyle = '#25434c';
  const look = gaze > 0.4 ? 1 : gaze < -0.4 ? -1 : 0;
  const blink = rest || Math.floor(t / 0.17) % 40 === 39;
  for (const side of [-1, 1]) {
    const ex = cx + side * (small ? 2 : 3) + look;
    const ey = top + (small ? 6 : 10);
    c.fillRect(ex, ey, small ? 1 : 2, blink ? 1 : small ? 2 : 3);
    if (!blink && !small) { c.fillStyle = '#e1efcf'; c.fillRect(ex, ey, 1, 1); c.fillStyle = '#25434c'; }
  }
}

/** The original portal's two spiral arms, reduced to a doorway for a single wisp.
 * Opening grows from a point to a slit, then widens; closing reverses it. */
export function drawCrossing(c: CanvasRenderingContext2D, x: number, y: number, t: number, opening: number, small = false, realm = 0): void {
  const k = Math.max(0, Math.min(1, opening));
  if (k === 0) return;
  const cx = Math.round(x), cy = Math.round(y);
  const height = small ? 10 : 16;
  const ry = Math.max(1, Math.round(height * Math.min(1, k / 0.4)));
  const rx = Math.max(1, Math.round((small ? 6 : 10) * Math.max(0, (k - 0.4) / 0.6)));
  const turn = Math.floor(t * 8) / 8 * 2;
  c.save(); c.globalAlpha *= Math.min(1, k * 4);
  // The edge belongs to this world; the light within belongs to the other.
  const rims = [
    ['#243344', '#455a70', '#8196ad'],
    ['#342c42', '#655770', '#a397ad'],
    ['#293939', '#556765', '#a0ad96'],
    ['#242634', '#4b4c65', '#8b8caa'],
  ];
  const rim = small ? ['#303a30', '#59644d', '#9aa58a'] : rims[realm % rims.length];
  const light = small ? '143,196,184' : '222,168,92';
  glow(c, cx, cy, small ? 17 : 25, light, 0.07);
  const flicker = Math.floor(t * 6) % 5;

  for (let row = -ry; row <= ry; row++) for (let col = -rx; col <= rx; col++) {
    const r = Math.hypot(col / rx, row / ry);
    if (r > 1) continue;
    const a = Math.atan2(row, col);
    if (rx < 2) c.fillStyle = Math.abs(row / ry) < 0.55 ? (small ? '#a8c9bf' : '#d6b579') : rim[1];
    else if (r > 0.82) c.fillStyle = Math.sin(a - turn * 0.5) > 0.5 ? rim[2] : r > 0.94 ? rim[0] : rim[1];
    else {
      const arm = Math.sin(2 * a + 7 * r - turn);
      // A low pool of distant light, interrupted by dark silhouettes and quiet spiral arms.
      const lit = Math.max(0, 1 - Math.hypot(col / (rx * 0.75), (row - ry * 0.3) / (ry * 0.7)));
      const glimmer = Math.abs(col) <= 1 && row > ry * 0.05 && row < ry * (0.45 + flicker * 0.025);
      c.fillStyle = small
        ? glimmer ? '#b5d8c6' : lit > 0.5 ? '#658d80' : arm > 0.6 ? '#395b60' : arm > 0.1 ? '#263f46' : '#102127'
        : glimmer ? '#ead099' : lit > 0.5 ? '#9c7849' : lit > 0.15 ? '#534937' : arm > 0.6 ? rim[1] : '#171f21';
    }
    c.fillRect(cx + col, cy + row, 1, 1);
  }
  c.restore();
}

/**
 * A small grid of its own for the wisp and what goes with it, placed on the screen to the device pixel rather than to
 * the art pixel: its slow drift then glides, as the road's far layers do, instead of ticking an art pixel at a time.
 */
export class Sprite {
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  /** Where it was last placed, in device pixels: left, top and side. */
  box: [number, number, number] = [0, 0, 0];
  /** Art pixels from its centre to its edge. */
  readonly half: number;
  constructor(half: number) {
    this.half = half;
    this.canvas.width = this.canvas.height = half * 2;
    this.context = this.canvas.getContext('2d')!;
  }

  /** Paints it around its centre (cx, cy), then sets that centre at native (x, y) of a view whose top-left is at
   * (left, top) on `target`, `scale` device pixels to an art pixel. */
  place(target: CanvasRenderingContext2D, x: number, y: number, scale: number, left: number, top: number, alpha: number, paint: (c: CanvasRenderingContext2D, cx: number, cy: number) => void): void {
    const c = this.context;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    paint(c, this.half, this.half);
    const side = this.canvas.width * scale;
    this.box = [Math.round(left + (x - this.half) * scale), Math.round(top + (y - this.half) * scale), side];
    target.save();
    target.globalAlpha = alpha;
    target.imageSmoothingEnabled = false;
    target.drawImage(this.canvas, this.box[0], this.box[1], side, side);
    target.restore();
  }
}
