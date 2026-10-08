# Wander dark look: design spec

2026-10-08 · Approved in chat in two sections; this document records it. It builds on `2026-10-08-wander-design.md`, which stays the authority for everything it does not change.

The look changes to match a reference screenshot: black backgrounds with coloured glyphs, grass drawn as blades that lean with the wind and bend away as you walk through, a lit radius around you that fades to black at the screen edges, and a small figure with a name instead of the `@`.

## 1. Intent

**Asked for:** make Wander look like the screenshot of an ASCII game's "grass physics test".

**Chosen in the conversation:**

| Question | Answer |
|---|---|
| Which parts of the screenshot | All four: dark glyph style, living grass blades, lit radius always, a figure with a name |
| Approach | Restyle in place; the old look retires |
| Stays out | Structures (walls, objects) and other players |
| Stays in | Biomes, water animation, surf, rivers, rain and snow, day cycle, weather, status bar, keys, bench targets |

**Done means:**

1. In Ghostty, the map is black with coloured glyphs; grassland and swamp are blades that ripple with gusts and part around you as you walk, closing again behind you within about a second.
2. The view is bright around you and near black at the screen edges, day and night; at night the lantern still glows around you.
3. You are a three-row figure with your name above it, and it walks.
4. `node --test` passes, and `--bench` still meets the targets of the base spec §7.

## 2. What you see

### Background and colours

- Every map cell's background is black (`COLORS.ground = 0x000000`). The status bar keeps its own dark bar.
- Each biome keeps its glyphs and gets a foreground colour tuned for black. Starting values, to be tuned by eye in `config.ts`:

| Biome | Glyphs | Foreground |
|---|---|---|
| Deep ocean | `≈ ~` | `0x2f5aa8` |
| Ocean | `~ ≈` | `0x4a8be0` |
| Shallows | `~ ·` | `0x8fe3e3` |
| River | `~ ≈` | `0x9fd4ff` |
| Lake | `~ ≈` | `0x8cc8f0` |
| Beach | `. : ·` | `0xe3cf93` |
| Grassland | blades | `0x62d45e` |
| Forest | `♣ ♠` | `0x4db35a` |
| Swamp | blades | `0x9cb064` |
| Desert | `. · :` | `0xe6c070` |
| Tundra | `. ' ·` | `0xcfd9cf` |
| Hills | `∩ n` | `0xb49a5a` |
| Mountains | `▲ ^` | `0xc8c4bf` |
| Snowy peaks | `▲ ^` | `0xffffff` |

- Every non-blade land cell's brightness is jittered by its variant: `0.85 + 0.3 · (variant >> 2) / 63`, multiplied with the slope shade. Terrain reads as speckled texture rather than flat colour. Water keeps its wave brightness.
- Surf still brightens the foreground towards white; there is no background to mix.
- Rain and snow drops, water glyph animation, river bands, tree sway in forest, cloud shadows and the sunlight tint are unchanged.

### Blades

Grassland and swamp cells (`blades: true` in the biome table) are blades.

**Lean.** Each blade has a lean vector in world units (x east, y south):

- Wind part, horizontal only: `GRASS.windLean · windX · windStrength · (0.5 + 0.5 · gust)`, where `gust` is the interpolated gust strength at the cell (0..1). With `windLean = 0.6` the wind alone never flattens a blade.
- Bend part: the sum over your recent trail (§3) of a push away from each sample, so blades part around you and close behind you.
- The lean vector is `leanX = windLean + bendX`, `leanY = bendY`.

**Glyph.** `bladeGlyph(leanX, leanY, variant)`:

- One blade in four (`(variant & 3) === 0`) is short: `'` upright, `.` when flattened.
- Otherwise, with `m = hypot(leanX, leanY)` and a per-blade threshold `t = GRASS.leanThreshold · (0.7 + 0.6 · variant / 255)` so blades don't all flip at once:
  - `m ≥ GRASS.flatThreshold` → `,` (flattened);
  - `leanX > t` → `/` (top pushed east);
  - `leanX < −t` → `\`;
  - otherwise `|`.

The six glyphs live in `BLADES` in config.

**Brightness.** `(0.8 + 0.35 · ((variant >> 2) & 63) / 63) · (1 + 0.15 · gust) · (1 + 0.25 · min(1, m))`. Blades with `variant ≥ 248` (about 3%) are tips: drawn in `COLORS.tip` with brightness further multiplied by `0.7 + 0.3 · sin(5 · realTime + variant)`, so they twinkle.

### Lit radius

Light falls off with elliptical distance from your exact position to the cell centre, scaled by the view: `e = hypot(dx / halfWidth, dy / halfHeight)` with `halfWidth = cols / 2` and `halfHeight = mapRows · ASPECT / 2`, both in world units. The multiplier is 1 for `e ≤ VIGNETTE.inner`, then falls with `smoothstep(inner, 1, e)` to `VIGNETTE.edge` at the edge and beyond. Starting values: `inner = 0.45`, `edge = 0.06`.

The vignette multiplies the sunlight and cloud light; the lantern is added afterwards, as today, so at night you still see a warm circle around you.

### Figure and name

- You are three rows tall and three columns wide, centred on your cell, which is the torso:

  ```
   o
  /|\
  / \
  ```

- While your speed is above 1 world unit per second the legs alternate between `/ \` and `| |`: frame `floor(realTime / FIGURE.stepTime) % 2` picks `stand` or `walk`, with `stepTime = 0.15` s. Standing still always shows `stand`.
- Spaces in the figure are transparent: the terrain shows through.
- The figure is drawn in `COLORS.player` on black, after the terrain and before the status bar.
- Your name is drawn in `COLORS.name` one row above the head, centred on your column and clipped at the screen edges.
- The name comes from `--name`. Without it, the operating system's login name is used, and `you` if that cannot be read. Names are trimmed and cut to 16 characters; an empty name becomes `you`.

## 3. How it's built

### Units

| Unit | Job | Depends on |
|---|---|---|
| `grass.ts` (new) | <ul><li>`class Trail`: `push(x, y, t)`, `bendAt(x, y, t): [bx, by]`, `bounds(t)`.</li><li>`windLean(amb, gust): number`.</li><li>`bladeGlyph(leanX, leanY, variant): number`, pure.</li></ul> | config |
| `ambient.ts` | adds `vignette(dx, dy, halfWidth, halfHeight): number`, pure | config |
| `render.ts` | `new Renderer(name)`; `render(frame, world, atm, amb, player, trail, hud)`; black backgrounds, blades, vignette, figure and name | grass, ambient, world, config |
| `game.ts` | `Game` owns a `Trail` and feeds it each step; `GameOptions.name`; `Options.name`; `--name`; `cleanName(text)` | grass |
| `main.ts` | fills the default name from `os.userInfo().username` | game |
| `config.ts` | biome table without `bg`, with `blades`; `GRASS`, `BLADES`, `VIGNETTE`, `FIGURE`; `COLORS.ground`, `COLORS.name`, `COLORS.tip` | nothing |

### Trail

- `push(x, y, t)` stores a sample unless the last one is younger than `GRASS.sampleEvery = 0.05` s. It drops samples older than `GRASS.trailAge = 1.5` s and keeps at most `GRASS.maxSamples = 32`.
- `bendAt(x, y, t)`: for each sample with distance `d < GRASS.bendRadius = 3` and age `a = t − sampleTime`, the weight is `(1 − d / bendRadius)² · exp(−a / GRASS.bendTime)` with `bendTime = 0.6` s, and the push is the weight times the unit vector from the sample to the cell. A cell within 0.001 of a sample is pushed south. The result is the sum; it is not clamped.
- `bounds(t)` returns the samples' bounding box grown by `bendRadius`, or `null` when there are no samples. The renderer calls `bendAt` only for blade cells inside it.

### Each frame

```
update: atm.step → stepPlayer → trail.push(player.x, player.y, atm.realTime)
draw:   renderer.render(frame, world, atm, amb, player, trail, hud)
          terrain (black backgrounds; blades use windLean + trail.bendAt)
          light = sunlight × cloud × vignette, then + lantern
          figure (3×3, frame by speed and realTime) and name
          status bar
        → diffFrames → one write
```

### Config additions

```ts
GRASS = { leanThreshold: 0.3, flatThreshold: 0.8, windLean: 0.6, bendRadius: 3, bendTime: 0.6, trailAge: 1.5, sampleEvery: 0.05, maxSamples: 32 }
BLADES = { upright: '|', right: '/', left: '\\', flat: ',', short: "'", shortFlat: '.' }   // stored as code points
VIGNETTE = { inner: 0.45, edge: 0.06 }
FIGURE = { stand: [' o ', '/|\\', '/ \\'], walk: [' o ', '/|\\', '| |'], stepTime: 0.15 }
COLORS adds ground: 0x000000, name: 0xffffff, tip: 0xeaffe0
BiomeDef: `bg` removed, `blades: boolean` added (true for Grassland and Swamp; `sways` stays true only for Forest)
```

## 4. Options

`node src/main.ts [--seed N] [--name TEXT]`. `--bench` accepts `--name` too but the bench uses `you`. Exit codes are unchanged: 1 no terminal, 2 bad arguments.

## 5. Testing

Tests are written first, with `node:test`.

| File | Checks |
|---|---|
| `grass.test.ts` (new) | <ul><li>`bladeGlyph`: upright, `/` for east lean, `\` for west lean, `,` when flattened; short blades give `'` and `.`.</li><li>`windLean` follows the sign of `windX` and is below the flat threshold at full wind.</li><li>`Trail`: a fresh sample pushes a nearby cell away from it; the push fades with age; it is zero beyond the radius and beyond the trail age; samples are capped at `maxSamples`; `bounds` is null when empty.</li></ul> |
| `ambient.test.ts` | `vignette` is 1 at the centre, equals the edge level at the edge, and never increases outward. |
| `render.test.ts` | <ul><li>Every map cell's background is black.</li><li>The figure's three rows and the name appear around the centre; every cell still has a glyph.</li><li>After walking east through grassland, a cell just behind you shows a bent glyph while a far cell is upright; the test passes an `Ambient` with zero wind, since `render` takes the snapshot separately from the `Atmosphere`.</li><li>Screen edges are darker than the centre at noon.</li><li>Existing checks adapt: the torso `|` replaces `@` at the centre; night is still darker than noon and the lantern still lights your surroundings.</li></ul> |
| `game.test.ts` | `--name` parses; `cleanName` trims, truncates and falls back; `update` feeds the trail. |
| `bench.test.ts` | unchanged |

## 6. Performance

Constant black backgrounds shrink the diff output, since background codes never change. The trail sum runs only for blade cells inside the trail's bounding box, at most 32 samples each. Bench targets from the base spec §7 stay in force and are re-measured.

## 7. Out of scope

- walls, objects, other players and anything else from the screenshot's world
- blades for forest and other biomes
- a `--style` switch back to the old look (it stays in git history)

## 8. Risks

| Risk | Handling |
|---|---|
| Sparse glyphs like `.` and `·` on black make beach, desert and tundra hard to read | Colours and glyphs are in one table; brighten or swap by eye in the Ghostty playtest. |
| The vignette's inner radius hides the lantern at tiny windows | Below 40 columns the map isn't drawn anyway; at 40 the inner radius is 9 units, about the lantern's 10. Tune `VIGNETTE.inner` if needed. |
| `/` `\` `|` blades flicker as gusts cross the threshold | Per-blade threshold jitter spreads the flips; `GRASS.leanThreshold` is the lever. |
