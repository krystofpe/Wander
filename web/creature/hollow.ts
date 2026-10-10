// The hollow on the screen: what the stage's sky and air leave for the sprites. Its home (the great tree with the
// hollow at its foot, or a turf shelter), the props, the cairn, food and the toy, the small lives, the little signs,
// and the creature: its pose, its cloak moved to its own colour, its eyes in the colour of its mood and looking where
// it looks, what it holds, its lantern at night; and its portal, when it goes to his camp at night. Everything on the ground
// layer is drawn back to front by depth. And the lights: its lantern, the lantern by the door, the toy, the glowing
// mushrooms, his cigarette.
import { BIOME_IDS } from '../../src/biomes.ts';
import { BIOMES } from '../../src/creature/config.ts';
import { PORTAL } from '../../src/creature/brain.ts';
import type { Game } from '../../src/creature/game.ts';
import { CREATURE, EYES_FRONT, EYES_SIDE, HAND, HEAD, LANTERN, MOOD_EYES, TREE } from '../../src/creature/look.ts';
import type { EyeShape, PoseTag } from '../../src/creature/look.ts';
import type { Prop } from '../../src/creature/scene.ts';
import { forestFocus } from '../../src/creature/scene.ts';
import { visitAt } from '../../src/creature/visitor.ts';
import { GROUND } from '../../src/layers.ts';
import { role } from '../../src/palette.ts';
import { rng } from '../../src/noise.ts';
import { eyesAt, eyesFade, owlTonight } from '../../src/creature/night.ts';
import { loopFrame } from '../../src/walker.ts';
import { biomeAt } from '../../src/world.ts';
import { paletteRow } from '../render.ts';
import type { Renderer } from '../render.ts';
import type { Atlas, SpriteBatch } from '../sprites.ts';
import type { Stage } from '../stage.ts';

const NEAR = GROUND - 1;
const MID = GROUND - 2;
const COAT = role('coat', 0);
const EYE = role('eye', 0);

/** Quake's flicker, as the wanderer's fire has it. */
const FLICKER = 'mmnmmommommnonmmonqnmmo';
const flicker = (time: number, offset: number): number => (FLICKER.charCodeAt(Math.floor(time * 10 + offset) % FLICKER.length) - 97) / 12;

/** The eyes as the terminal wrote them, read as a shape and where they look. */
function eyesOf(glyphs: string): { shape: EyeShape; dx: number; dy: number } {
  switch (glyphs) {
    case '^ ^':
      return { shape: 'happy', dx: 0, dy: 0 };
    case '- -':
    case '‿ ‿':
      return { shape: 'shut', dx: 0, dy: 0 };
    case 'o o':
      return { shape: 'wide', dx: 0, dy: 0 };
    case '> <':
      return { shape: 'cross', dx: 0, dy: 0 };
    case '╥ ╥':
      return { shape: 'tear', dx: 0, dy: 0 };
    case '•• ':
      return { shape: 'open', dx: -1, dy: 0 };
    case ' ••':
      return { shape: 'open', dx: 1, dy: 0 };
    case '° °':
      return { shape: 'open', dx: 0, dy: -1 };
    case '. .':
      return { shape: 'open', dx: 0, dy: 1 };
    default:
      return { shape: 'open', dx: 0, dy: 0 };
  }
}

type Item = { z: number; draw: () => void };

/** Undergrowth: a fern or a tuft, where it grows. */
type Growth = { readonly x: number; readonly z: number; readonly sheet: string; readonly tag: string; readonly flip: boolean };

/**
 * The undergrowth of its biome, the same for the same seed: thickest at the back and toward the sides, so the middle
 * stays open where it plays; never in its doorway, the pond or on the cairn.
 */
function undergrowth(game: Game): Growth[] {
  const def = BIOMES[game.place];
  const kinds: readonly (readonly [string, string])[] =
    game.place === 'deep' ? [['shrooms', 'a'], ['shrooms', 'b']]
    : game.place === 'forest' ? [['fern', 'a'], ['fern', 'b'], ['fern', 'a'], ['shrooms', 'a']]
    : game.place === 'swamp' ? [['reeds', 'a'], ['mushrooms', 'a'], ['fern', 'b']]
    : game.place === 'meadow' ? [['fern', 'a'], ['fern', 'b']]
    : [];
  if (kinds.length === 0) return [];
  const layout = game.scene.layout;
  const random = rng(game.life.seed ^ 0x9f0e);
  const out: Growth[] = [];
  const count = def.canopy ? 46 : 18;
  for (let tries = 0; out.length < count && tries < count * 8; tries++) {
    const x = 0.02 + random() * 0.96;
    const z = Math.pow(random(), 1.6);
    const side = Math.abs(x - 0.5) * 2;
    if (random() > 0.25 + 0.75 * Math.max(side, 1 - z)) continue;
    const door = game.geo.door(layout.home);
    if (Math.abs(x - door.x) < 0.07 && z < layout.home.z + 0.3) continue;
    const w = layout.water;
    if (w !== null && Math.abs(x - w.x) < 0.06 && Math.abs(z - w.z) < 0.3) continue;
    if (Math.abs(x - layout.cairn.x) < 0.03 && Math.abs(z - layout.cairn.z) < 0.15) continue;
    const [sheet, tag] = kinds[Math.floor(random() * kinds.length)];
    out.push({ x, z, sheet, tag, flip: random() < 0.5 });
  }
  return out;
}

export class Hollow {
  /** Where its head is on the native view (for its words), and whether it is to be seen. */
  headX = 0;
  headY = 0;
  private readonly items: Item[] = [];
  private growth: Growth[] | null = null;


  /** Draws it all for the view at road distance `at` on his road (`worldSeed`); `time` real seconds. */
  draw(r: Renderer, atlas: Atlas, stage: Stage, game: Game, worldSeed: number, at: number, time: number): void {
    const v = stage.view;
    const life = game.life;
    const geo = game.geo;
    const night = stage.grade.night;
    const seed = life.seed;
    const blend = biomeAt(worldSeed, at);
    const rows = (li: number): [number, number, number] => [paletteRow(li, BIOME_IDS.indexOf(blend.a)), paletteRow(li, BIOME_IDS.indexOf(blend.b)), blend.k];
    const [ga, gb, gk] = rows(GROUND);
    const ground = r.ground;
    const light = v.light;
    const addLight = (x: number, y: number, radius: number, strength: number): void => {
      if (light.count >= 6 || strength <= 0.01) return;
      const o = light.count * 4;
      light.lights[o] = x;
      light.lights[o + 1] = y;
      light.lights[o + 2] = radius;
      light.lights[o + 3] = strength;
      light.count++;
    };
    const sheets = atlas.sheets;
    const frameOf = (sheet: string, tag: string, t = time): readonly number[] => {
      const frames = sheets[sheet][tag];
      return frames.length === 1 ? frames[0] : frames[loopFrame(frames.map((f) => f[4]), t)];
    };
    const put = (batch: SpriteBatch, x: number, y: number, frame: readonly number[], flip = false, alpha = 1, swap?: readonly number[], rim = true): void => {
      batch.add(Math.round(x), Math.round(y), frame, ga, gb, gk, flip, alpha, swap, rim);
    };
    const items = this.items;
    items.length = 0;
    const later = (z: number, draw: () => void): void => {
      items.push({ z, draw });
    };

    // Its home.
    const home = game.scene.layout.home;
    // Gone up to his fire, it is not at home: no lantern by the door, its doorway lit by his fire far above.
    const inside = game.body.inside && game.body.visible;
    const dark = game.sky.daylight < 0.35;
    if (home.edge !== undefined) {
      const left = geo.leftOf(home);
      const flip = home.edge > 0;
      const foot = geo.footY(home.x, home.z);
      const lit = dark && inside;
      later(home.z, () => {
        const base = frameOf('hollow', lit ? 'lit' : 'base');
        // The trunk rises off the top of the screen: its segments make one shape, so none of them has a rim of its own.
        put(ground, left, foot - base[3], base, flip, 1, undefined, false);
        const tile = sheets.trunk.tile[0];
        const tx = flip ? left + base[2] - tile[2] : left;
        for (let y = foot - base[3] - tile[3]; y > -tile[3] - 60; y -= tile[3]) put(ground, tx, y, tile, flip, 1, undefined, false);
        // By day its lantern hangs dark on its peg; at night it carries it, or, at home, it is lit by the door.
        const peg = TREE.peg;
        const px = flip ? left + base[2] - 1 - peg[0] - 2 : left + peg[0];
        if (!dark) put(ground, px - 1, foot - base[3] + peg[1], sheets.carry.dark[0], flip);
        if (lit) addLight(px + 1, foot - base[3] + peg[1] + 4, 34, 0.75 * (0.85 + 0.15 * flicker(time, 3)));
      });
    } else {
      const foot = geo.footY(home.x, home.z);
      const frame = frameOf('shelter', home.variant === 1 ? 'snow' : 'turf');
      later(home.z, () => put(ground, geo.leftOf(home), foot - frame[3], frame, !game.scene.layout.homeLeft));
    }

    // The undergrowth.
    this.growth ??= undergrowth(game);
    // No rim of light: on fronds this small the night's cold edge reads as frost, not as shape.
    for (const g of this.growth) later(g.z - 0.01, () => {
      const f = sheets[g.sheet][g.tag][0];
      put(ground, geo.px(g.x) - f[2] / 2, geo.footY(g.x, g.z) - f[3], f, g.flip, 1, undefined, false);
    });

    // The props, the pond, the cairn.
    for (const p of game.scene.layout.props) {
      if (p.kind === 'home') continue;
      later(p.kind === 'pond' ? p.z - 0.3 : p.z, () => this.prop(r, atlas, game, p, put, frameOf, time, addLight, night));
    }
    if (life.cairn > 0) {
      const c = game.scene.layout.cairn;
      later(c.z, () => {
        const f = sheets.cairn[String(Math.min(9, life.cairn))][0];
        put(ground, geo.px(c.x) - f[2] / 2, geo.footY(c.x, c.z) - f[3], f);
      });
    }

    // Food and the toy.
    for (const f of game.scene.foods) {
      later(f.z, () => {
        const fr = sheets.food[f.kind.sprite][0];
        put(ground, geo.px(f.x) - 2, geo.footY(f.x, f.z) - 4 - f.h, fr);
      });
    }
    const toy = game.scene.toy;
    if (toy !== null) {
      later(toy.z, () => {
        const fr = frameOf('toy', 'glow');
        const x = geo.px(toy.x);
        const y = geo.footY(toy.x, toy.z) - 5 - toy.h;
        put(ground, x - 3, y, fr);
        addLight(x, y + 2, 22, 0.45 + 0.35 * night);
      });
    }

    // The small lives.
    for (const k of game.scene.critters) {
      const x = geo.px(k.x);
      const flip = k.vx < 0;
      switch (k.kind) {
        case 'deer': {
          // At the edge of the trees, behind: drawn with the near layer, smaller with the distance.
          const [na, nb, nk] = rows(NEAR);
          const moving = Math.sin(k.t * 0.35 + k.phase) > 0.55;
          const f = frameOf('deer', moving ? 'stand' : 'graze', k.t);
          r.batches[NEAR].add(Math.round(x - f[2] / 2), Math.round(geo.footY(k.x, 0) - f[3] - 6), f, na, nb, nk, !flip);
          break;
        }
        case 'hare':
        case 'frog': {
          later(k.z, () => {
            const moving = Math.sin(k.t * 1.7 + k.phase) > 0.2;
            const f = frameOf(k.kind, moving ? 'hop' : 'sit', k.t);
            put(ground, x - f[2] / 2, geo.footY(k.x, k.z) - f[3], f, flip);
          });
          break;
        }
        default: {
          // Flyers: birds and bats high up, butterflies, moths and fireflies low about the ground.
          const sheet = k.kind === 'butterfly' || k.kind === 'moth' ? k.kind : 'small';
          const tag = sheet === 'small' ? k.kind : 'fly';
          later(k.kind === 'bird' || k.kind === 'bat' ? -1 : k.z, () => {
            const f = frameOf(sheet, tag, k.t);
            put(ground, x - f[2] / 2, geo.footY(k.x, k.z) - k.y - f[3] / 2, f, flip);
          });
        }
      }
    }

    // Under the canopy, from dusk on, a pale glow far off between the trees at the end of the path; and now and then,
    // in the dark, the tall one walks through it.
    if (BIOMES[game.place].canopy) {
      const [ma, mb, mk] = rows(MID);
      const focus = geo.px(forestFocus(game.scene.layout.homeLeft));
      const base = geo.footY(0.5, 0) - 30;
      const dusk = Math.max(0, Math.min(1, (0.45 - game.sky.daylight) * 2.5));
      if (dusk > 0) {
        const g = sheets.glow.a[0];
        r.batches[MID].add(Math.round(focus - g[2] / 2), Math.round(base - g[3] + 6), g, ma, mb, mk, false, 0.55 * dusk);
      }
      const visit = visitAt(game.worldNow(), seed, game.place, game.sky.daylight);
      if (visit !== null) {
        const vx = focus + visit.dir * (visit.progress - 0.5) * 70;
        const f = frameOf('visitor', 'walk');
        const fade = Math.min(1, visit.progress * 8, (1 - visit.progress) * 8);
        r.batches[MID].add(Math.round(vx - f[2] / 2), Math.round(base - f[3]), f, ma, mb, mk, visit.dir < 0, 0.85 * fade);
      }
    }

    // At night under the canopy: the owl on the great tree, and now and then a pair of eyes watching from the trees.
    if (BIOMES[game.place].canopy && game.sky.daylight < 0.3) {
      const world = game.worldNow();
      const dark = Math.min(1, (0.3 - game.sky.daylight) * 8);
      // The owl comes on most nights to its place on the trunk.
      // (No owl in the deep: it keeps to the woods above.)
      const owl = game.place === 'deep' ? null : owlTonight(seed, world);
      if (home.edge !== undefined && owl !== null) {
        const left = geo.leftOf(home);
        const flip = home.edge > 0;
        const f = frameOf('owl', 'perch', time + owl.phase);
        const trunkEdge = flip ? left + home.sprite.w - TREE.trunk + 2 : left + TREE.trunk - 2;
        const ox = flip ? trunkEdge - f[2] + 3 : trunkEdge - 3;
        const oy = geo.footY(home.x, home.z) - TREE.h - 36 - Math.round(owl.height * 70);
        later(home.z + 0.0005, () => put(ground, ox, oy, f, flip, dark));
      }
      // Eyes in the dark between the trees: a pair now and then, watching a while, blinking, gone.
      const eyes = eyesAt(seed, world);
      if (eyes !== null) {
        const [na, nb, nk] = rows(NEAR);
        const lo = game.scene.layout.homeLeft ? 0.3 : 0.06;
        const ex = geo.px(lo + eyes.x * 0.62);
        const ey = geo.footY(0.5, 0) - 34 - Math.round(eyes.up * 60);
        r.batches[NEAR].add(Math.round(ex), Math.round(ey), sheets.eyes[eyes.blink ? 'shut' : 'open'][0], na, nb, nk, false, eyesFade(eyes.t) * dark, [-1, 0, EYE, role('mood', MOOD_EYES.indexOf('hungry'))]);
      }
    }

    // Its portal, when it goes to his camp at night and when it comes back: opening from a slit, turning, closing; while
    // it is gone, a faint shimmer where it went.
    const open = game.portal;
    if (open > 0 || game.gone) {
      const px = Math.round(geo.px(PORTAL.x)) + 6;
      const foot = Math.round(geo.footY(PORTAL.x, PORTAL.z));
      const sheet = sheets.portal;
      const frame = open >= 1 ? sheet.loop[Math.floor(time * 7) % sheet.loop.length] : open > 0 ? sheet.open[Math.min(sheet.open.length - 1, Math.floor(open * sheet.open.length))] : sheet.open[0];
      const alpha = open > 0 ? 1 : 0.35 + 0.15 * Math.sin(time * 1.3);
      later(PORTAL.z + 0.001, () => put(ground, px - (frame[2] >> 1), foot - frame[3] + 2, frame, false, alpha));
      addLight(px, foot - 16, 12 + 22 * open, 0.15 + 0.4 * open);
    }

    // The creature.
    this.creature(r, atlas, game, put, frameOf, time, addLight, later);

    // Back to front.
    items.sort((a, b) => a.z - b.z);
    for (const it of items) it.draw();

    // The little signs, over everything on the ground.
    for (const p of game.scene.particles) {
      const fr = p.kind === 'streak' ? sheets.streak.a[0] : sheets.signs[p.kind][0];
      const batch = p.kind === 'streak' ? r.batches[0] : ground;
      const alpha = Math.min(1, p.life * 2.5);
      if (p.kind === 'streak') {
        const [ca, cb, ck] = rows(0);
        batch.add(Math.round(p.x), Math.round(p.y), fr, ca, cb, ck, false, alpha);
      } else put(batch, p.x - 2, p.y - 2, fr, false, alpha);
    }
    void BIOMES;
  }

  private prop(
    r: Renderer,
    atlas: Atlas,
    game: Game,
    p: Prop,
    put: (b: SpriteBatch, x: number, y: number, f: readonly number[], flip?: boolean, alpha?: number) => void,
    frameOf: (sheet: string, tag: string, t?: number) => readonly number[],
    time: number,
    addLight: (x: number, y: number, radius: number, strength: number) => void,
    night: number,
  ): void {
    const geo = game.geo;
    const x = geo.px(p.x);
    const foot = geo.footY(p.x, p.z);
    const flip = p.variant % 2 === 1;
    const tag = p.kind === 'bush' ? 'berries' : p.kind === 'fern' || p.kind === 'shrooms' ? (p.variant % 4 < 2 ? 'a' : 'b') : 'a';
    const f = frameOf(p.kind, tag);
    put(r.ground, x - f[2] / 2, foot - f[3], f, flip);
    // The mushrooms glow, a little, in the dark.
    if (p.kind === 'shrooms') addLight(x, foot - 5, 14, 0.3 * night * (0.9 + 0.1 * Math.sin(time * 0.7 + p.variant)));
    void atlas;
  }

  private creature(
    r: Renderer,
    atlas: Atlas,
    game: Game,
    put: (b: SpriteBatch, x: number, y: number, f: readonly number[], flip?: boolean, alpha?: number, swap?: readonly number[]) => void,
    frameOf: (sheet: string, tag: string, t?: number) => readonly number[],
    time: number,
    addLight: (x: number, y: number, radius: number, strength: number) => void,
    later: (z: number, draw: () => void) => void,
  ): void {
    const b = game.body;
    const geo = game.geo;
    const life = game.life;
    const sheets = atlas.sheets;
    const glyphs = game.eyes();
    const colour = MOOD_EYES.indexOf(game.eyeColour(glyphs));
    const swap = [COAT, role(`cloak${life.cloak}`, 0) - COAT, EYE, role('mood', Math.max(0, colour))];
    if (!b.visible) return;
    if (b.inside) {
      // Only its eyes, in the dark of the doorway (none while it sleeps).
      const home = game.scene.layout.home;
      const door = geo.door(home);
      const dx = geo.px(door.x);
      const foot = geo.footY(door.x, door.z);
      this.headX = dx;
      this.headY = foot - (home.sprite.door?.h ?? 20);
      if (life.asleep) return;
      const eyes = eyesOf(glyphs);
      later(home.z + 0.001, () => put(r.ground, dx - 2 + eyes.dx, foot - 13 + eyes.dy, sheets.eyes[eyes.shape][0], false, 1, swap));
      return;
    }
    const front = b.gaze === 'center' && (b.pose === 'stand' || b.pose === 'wave');
    const tag: PoseTag = front ? (b.pose === 'wave' ? 'frontwave' : 'front') : b.pose === 'sleep' ? 'sit' : b.pose;
    const frames = sheets.creature[tag];
    const i = tag === 'walk' ? Math.floor(b.walked / 4) % frames.length : frames.length === 1 ? 0 : loopFrame(frames.map((f) => f[4]), time);
    const frame = frames[i];
    const flip = b.facing < 0 && !front;
    const cx = geo.px(b.x);
    const foot = geo.footY(b.x, b.z) - b.lift;
    const left = cx - CREATURE.w / 2;
    const top = foot - CREATURE.foot;
    const alpha = 1 - b.doorway;
    const mx = (x: number, w = 0): number => (flip ? CREATURE.w - x - w : x);
    this.headX = cx;
    this.headY = top + 3 + HEAD[tag][i][1];
    later(b.z, () => {
      put(r.ground, left, top, frame, flip, alpha, swap);
      // Its eyes, in its face.
      const [hx, hy] = HEAD[tag][i];
      const [ex, ey] = front ? EYES_FRONT : EYES_SIDE;
      const eyes = eyesOf(b.pose === 'sleep' ? '- -' : glyphs);
      // Where it looks is where on the screen: the shift comes after the turn.
      put(r.ground, left + mx(ex + hx, 5) + eyes.dx, top + ey + hy + eyes.dy, sheets.eyes[eyes.shape][0], flip, alpha, swap);
      // What it holds.
      if (b.holding !== null) {
        const [ix, iy] = HAND[tag];
        const kind = b.holding.kind;
        const f = sheets.food[kind]?.[0] ?? sheets.carry[kind]?.[0] ?? sheets.carry.find[0];
        put(r.ground, left + mx(ix, 0) - f[2] / 2, top + iy - f[3] / 2, f, flip, alpha);
      }
      // Its lantern, in the dark.
      const lantern = game.lantern();
      if (lantern !== null && b.holding === null) {
        const f = sheets.carry.lantern[0];
        const [lx, ly] = LANTERN;
        const swing = b.pose === 'walk' ? Math.round(Math.sin(b.walked * 0.4)) : 0;
        put(r.ground, left + mx(lx, 0) - 2 + swing, top + ly - 6, f, false, alpha);
        addLight(left + mx(lx, 0) + swing, top + ly - 2, 48, 0.85 * (0.85 + 0.15 * flicker(time, 0)));
      }
      // A sign above its head.
      if (b.icon !== null) {
        const sign = b.icon === '?' ? 'ask' : b.icon === '!' ? 'bang' : 'dots';
        put(r.ground, cx - 2, this.headY - 8, sheets.signs[sign][0]);
      }
    });
  }
}
