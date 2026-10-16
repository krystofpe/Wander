import { rng } from '../../src/noise.ts';
import { dreamAt, noticeAt } from '../../src/wisp/journey.ts';
import { drawCrossing, drawWisp, glow, Sprite } from './paint.ts';
import type { wispCrossing } from '../../src/wisp/crossing.ts';

/** A native canvas of the dream's own, sized as asked. */
function surface(): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D; fit(w: number, h: number): void } {
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d')!;
  return { canvas, c, fit(w, h) { if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } else c.clearRect(0, 0, w, h); } };
}

const PALETTES = [
  ['#060a12', '#111d2d', '#243449', '#92a9b9'],
  ['#080912', '#1b182b', '#393044', '#b8a4ba'],
  ['#090c10', '#1b292b', '#354447', '#c4cdb5'],
  ['#030507', '#0b1019', '#1a2331', '#8295aa'],
];
/** How fast each layer drifts past, native pixels a second, far to near. */
const DRIFT = [0.16, 0.45, 1.05];

/**
 * Everything is painted in whole native pixels, including scenery, light and motes. Each drifting layer has a grid of
 * its own, moved on by whole art pixels and placed to the device pixel, and so has the wisp: at a pixel a second or
 * less they would otherwise tick (research: the sub-pixel offset at upscale).
 */
export class Dream {
  x = 0;
  y = 0;
  private readonly layers = DRIFT.map(() => surface());
  private readonly front = surface();
  readonly sprite = new Sprite(48);
  /** Paints a `w` by `h` native view onto `target` at (left, top), `scale` device pixels to an art pixel. */
  draw(target: CanvasRenderingContext2D, w: number, h: number, scale: number, left: number, top: number, seconds: number, seed: number, transition: ReturnType<typeof wispCrossing>, pointer: number | null, affection: number, ember = 0): void {
    const pull = transition.seam;
    const d = dreamAt(seconds, seed);
    target.save();
    target.imageSmoothingEnabled = false;
    target.beginPath(); target.rect(left, top, w * scale, h * scale); target.clip();
    target.fillStyle = '#030609'; target.fillRect(left, top, w * scale, h * scale);
    for (const [realm, alpha] of [[d.realm, 1 - d.blend], [d.next, d.blend]]) {
      if (alpha <= 0) continue;
      target.globalAlpha = alpha; target.fillStyle = PALETTES[realm][0]; target.fillRect(left, top, w * scale, h * scale);
    }
    target.globalAlpha = 1;
    for (let layer = 0; layer < DRIFT.length; layer++) {
      // One art pixel wider than the view, for the part of a pixel it has drifted past.
      const s = this.layers[layer];
      s.fit(w + 1, h);
      this.realm(s.c, w + 1, h, seconds, seed, d.realm, 1 - d.blend, layer);
      if (d.blend > 0) this.realm(s.c, w + 1, h, seconds, seed, d.next, d.blend, layer);
      const drift = seconds * DRIFT[layer];
      target.drawImage(s.canvas, left - Math.round((drift - Math.floor(drift)) * scale), top, (w + 1) * scale, h * scale);
    }
    const c = this.front.c;
    this.front.fit(w, h);
    const notice = noticeAt(seconds, seed);
    const attention = transition.approach === 0 && d.act !== 'rest' ? notice.strength : 0;
    const held = dreamAt(notice.start, seed);
    const dx = d.x + (held.x + (notice.x - held.x) * 0.25 - d.x) * attention;
    const dy = d.y + (held.y + (notice.y - held.y) * 0.25 - d.y) * attention;
    this.x = w * (dx + (0.76 - dx) * transition.approach);
    this.y = h * (dy + (0.49 - dy) * transition.approach);
    drawCrossing(c, w * 0.76, h * 0.49, seconds, pull, false, d.blend > 0.5 ? d.next : d.realm);
    if (attention > 0) {
      c.save(); c.globalAlpha = attention;
      const lx = Math.round(w * notice.x), ly = Math.round(h * notice.y);
      glow(c, lx, ly, 7, '180,200,217', 0.15);
      c.fillStyle = '#b0c3cd'; c.fillRect(lx, ly, 1, 1);
      c.restore();
    }
    target.drawImage(this.front.canvas, left, top, w * scale, h * scale);
    const gaze = pointer === null ? attention * Math.sign(notice.x * w - this.x) : Math.max(-1, Math.min(1, (pointer - this.x) / 40));
    this.sprite.place(target, this.x, this.y, scale, left, top, transition.spirit, (c, cx, cy) => {
      if (d.act === 'play' && transition.approach === 0 && attention === 0) {
        const a = (seconds % 110 - 48) * 0.38;
        const mx = cx + Math.round(Math.cos(a) * 28), my = cy + Math.round(Math.sin(a) * 20);
        glow(c, mx, my, 6, '210,242,205', 0.2);
        c.fillStyle = '#d3e9bd'; c.fillRect(mx, my, 1, 1);
      }
      drawWisp(c, cx, cy, 8, seconds, d.act === 'rest' && transition.approach === 0, pull * 0.35, gaze);
      if (ember > 0) {
        const ex = cx - 17 + Math.round(Math.sin(seconds * 0.7) * 3);
        const ey = cy + 9 + Math.round(Math.sin(seconds * 0.5 + 1) * 3);
        c.save(); c.globalAlpha = ember;
        glow(c, ex, ey, 6, '230,168,80', 0.17);
        c.fillStyle = '#dcb477'; c.fillRect(ex, ey, 1, 1);
        c.restore();
      }
      if (affection > 0) for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7 + seconds * 0.3;
        const x = cx + Math.round(Math.cos(a) * (18 + affection * 8)), y = cy + Math.round(Math.sin(a) * 19);
        glow(c, x, y, 3, '242,216,165', affection * 0.4);
        c.fillStyle = `rgba(242,216,165,${affection})`; c.fillRect(x, y, 1, 1);
      }
    });
    target.restore();
  }

  /** One drifting layer of a realm, moved on by whole art pixels. */
  private realm(c: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number, realm: number, alpha: number, layer: number): void {
    c.save(); c.globalAlpha = alpha;
    const palette = PALETTES[realm];
    // Bounded world cells keep every feature seeded and continuous as it drifts past.
    const cellWidth = 256;
    const offset = Math.floor(t * DRIFT[layer]), cell = Math.floor(offset / cellWidth);
    for (let j = cell - 1; j <= cell + Math.ceil(w / cellWidth) + 1; j++) {
      const random = rng((seed ^ Math.imul(j, 7919) ^ Math.imul(layer + 1, 104729) ^ Math.imul(realm + 1, 1237)) >>> 0);
      const origin = j * cellWidth - offset;
      // The dust sea has broad, broken clouds; the other realms only a trace.
      if (layer === 0 && realm !== 3) {
        const center = Math.round(origin + random() * cellWidth);
        const cy = Math.round(h * (0.25 + random() * 0.5));
        const width = realm === 1 ? 180 : 100;
        const height = realm === 1 ? 34 : 16;
        for (let band = 3; band >= 1; band--) {
          const rx = Math.round(width * band / 3), ry = Math.round(height * band / 3);
          c.fillStyle = palette[band === 1 ? 2 : 1];
          c.save(); c.globalAlpha *= realm === 1 ? 0.18 : 0.07;
          for (let row = -ry; row <= ry; row += 2) {
            const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (row / ry) ** 2)));
            const shift = Math.round(Math.sin(row * 0.11 + j) * 14);
            // Gaps and irregular ends keep it a soft pixel cloud rather than a solid ellipse.
            for (let col = -half; col <= half; col += 4) {
              if (Math.sin(col * 0.13 + row * 0.27 + j) > -0.55)
                c.fillRect(center + col + shift, cy + row, 3, 1);
            }
          }
          c.restore();
        }
      }
      const count = realm === 3 ? 3 : realm === 0 ? 13 : 7;
      for (let i = 0; i < count; i++) {
        const x = Math.round(origin + random() * cellWidth), y = Math.round(random() * h);
        const strength = random();
        const pulse = 0.8 + 0.2 * Math.sin(t * 0.22 + random() * Math.PI * 2);
        c.save(); c.globalAlpha *= (0.16 + strength * 0.42) * pulse;
        c.fillStyle = palette[3]; c.fillRect(x, y, 1, 1);
        if (layer === 0 && strength > 0.94 && realm !== 3) {
          glow(c, x, y, 5, realm === 2 ? '218,198,142' : '144,166,202', 0.12);
          c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3);
        }
        c.restore();
      }
      // Rare distant lights with short, fractured reflections of their glow.
      if (realm === 2 && layer === 0 && random() > 0.4) {
        const x = Math.round(origin + random() * cellWidth), y = Math.round(h * (0.2 + random() * 0.6));
        glow(c, x, y, 19, '195,184,129', 0.06);
        c.fillStyle = '#9caa93'; c.fillRect(x, y, 2, 1);
        c.fillStyle = '#515b54'; c.fillRect(x, y + 2, 1, 1);
        for (let dust = 0; dust < 8; dust++) {
          c.fillStyle = '#202d30';
          c.fillRect(x + Math.round((random() - 0.5) * 45), y + Math.round((random() - 0.5) * 14), 1, 1);
        }
      }
    }
    c.restore();
  }
}
