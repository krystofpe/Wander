# Wander: design spec

2026-10-08 · The design was approved in chat in three parts; this document records it.

Wander is a top-down terminal toy. You walk through an endless, generated landscape drawn in coloured text at 60 frames per second. There is no goal: the point is how it looks and how it feels to move.

## 1. Intent

**Asked for:** a terminal game with interactive movement through a landscape, text only, refreshing 60 times a second.

**Chosen in the conversation:**

| Question | Answer |
|---|---|
| Purpose | Explore and enjoy. A toy with no goal; the feeling is the point. |
| View | Top-down map |
| What makes it feel alive | Living water, day and night, weather |
| Left out | Villages, roads, ruins, landmarks |
| Approach | TypeScript on Node 25, no dependencies |

**My assumptions, approved with the design:** Ghostty is the main terminal. The world is endless and seeded. Nothing blocks movement. The project lives in `~/Projects/wander` as its own git repo.

**Done means:**

1. In a full-size Ghostty window on this Mac, the status bar shows a steady 60 FPS while you walk, run and swim, and holding a key moves you smoothly.
2. Every way of leaving leaves the terminal usable: normal screen, visible cursor, normal keyboard. That covers Q, Esc, Ctrl-C, a kill signal, a crash and closing the window.
3. `node --test` passes, and `--bench` meets the targets in §7.

## 2. What you see and do

### The world

The world is endless and generated from a seed. The seed is random unless `--seed <n>` is given. It is shown in the status bar, so a world can be revisited.

Three smooth noise fields decide the biome of every spot: height, moisture and temperature. Two more fields add rivers and lakes. Every character has its own foreground and background colour in 24-bit colour. Slopes are shaded as if lit from the north-west, so relief is visible.

| Biome | Glyphs | Colour | Speed |
|---|---|---|---|
| Deep ocean | `≈ ~` | dark navy | 0.45 (swimming) |
| Ocean | `~ ≈` | blue | 0.45 (swimming) |
| Shallows | `~ ·` | turquoise | 0.55 (wading) |
| River, lake | `~ ≈` | clear blue | 0.55 (wading) |
| Beach | `. : ·` | sand | 0.9 |
| Grassland | `, . ' "` | fresh green | 1.0 |
| Forest | `♣ ♠` | deep green | 0.6 |
| Swamp | `" , ~` | murky olive | 0.5 |
| Desert | `. · :` | ochre | 0.8 |
| Tundra | `. ' ·` | grey-green to white | 0.85 |
| Hills | `∩ n` | olive brown | 0.65 |
| Mountains | `▲ ^` | grey rock | 0.45 |
| Snowy peaks | `▲ ^` | white | 0.4 |

Speed multiplies walking speed. All glyphs are single-width. Glyphs and colours live in one table in `config.ts`, so a glyph that renders badly in some font can be swapped in one place.

### You

- You are an `@` at the centre of the screen. The camera is locked to you, and the map scrolls underneath.
- Walking speed is 12 columns or 6 rows per second (see "Tall characters" in §3). Shift doubles it.
- Movement has momentum. Velocity eases towards the target with a time constant of about 0.12 s, so you speed up, glide and coast to a stop instead of jumping a character at a time.
- Diagonal speed equals straight-line speed.
- Nothing blocks you. The biome underneath multiplies your speed (see the table above).

### Controls

| Key | Action |
|---|---|
| W A S D or arrow keys | Move; hold two for a diagonal |
| Shift, held | Run (×2) |
| T, held | Time-lapse: the clock and the weather run 20× faster |
| H | Show or hide the status bar |
| Q, Esc, Ctrl-C | Quit |

### Living water

- **Open water:** a wave pattern travels with the wind. The glyphs cycle through `~ ≈ -` and the brightness shimmers.
- **Rivers:** bands of light drift along each river's flow direction, so rivers visibly flow.
- **Surf:** water next to land brightens towards white in slow pulses.

### Day and night

- A full day lasts 8 minutes and starts at 08:00.
- The light changes smoothly through four phases: night (deep blue, dim), dawn (rose and orange), day (neutral, full brightness) and dusk (amber). It multiplies every colour on screen.
- A warm lantern glow surrounds you, reaching about 10 columns (5 rows). It fades in as daylight fades and flickers slightly. It falls off smoothly with distance from your exact position, not from your character cell.
- The status bar names the time of day: dawn 05–07, morning 07–12, afternoon 12–17, dusk 17–20, night 20–05.

### Weather

- **Wind:** direction and strength drift slowly over minutes. Wind drives the waves, cloud movement, gusts and the slant of rain.
- **Cloud shadows:** soft-edged shadows drift across the land with the wind. Their edges are computed from exact positions, so they glide rather than jump.
- **Gusts:** bands of wind ripple through grassland and forest. As a gust passes, grass and tree glyphs switch between variants and brighten slightly.
- **Rain and snow:**
  - Fronts are scheduled from the seed: 2–5 minutes of dry weather, then 30–90 s of rain, with a 10 s fade in and out. The first front arrives within 2 minutes.
  - Rain is drawn over the map as short-lived streaks: `/`, `|` or `\`, depending on the wind. Where it is cold, it falls as `*` and `·` snow instead.
  - The light dims while a front passes.

**Two clocks.** Game time drives the time of day, the weather fronts, the wind's drift and cloud movement, and T speeds it up (clouds race across in time-lapse). Real time drives waves, river flow, surf, gusts, rain streaks and the lantern flicker, so these keep their normal pace under T.

### Status bar

The status bar is one line at the bottom, shown or hidden with H:

`x 1204  y -388 │ Forest │ 07:42 morning │ Rain, wind ↘ │ 60 fps │ seed 81723`

The coordinates are your world position, rounded. The arrow points where the wind blows to.

### Terminals

Ghostty gets everything. Other terminals still run the game, with two differences:

- they ignore the tear-free frame marker;
- movement falls back to the operating system's key repeat (§4).

24-bit colour is assumed.

## 3. How it's built

The game is TypeScript with no dependencies. Node 25 runs it directly (`node src/main.ts`) and strips the types when loading. So the code uses only syntax Node can strip:

- no `enum`, no `namespace`, no constructor parameter properties;
- type-only imports use `import type`;
- relative imports name the `.ts` file.

```
wander/
  package.json      "type": "module"; scripts start, test, bench; no dependencies
  tsconfig.json     editor support only: strict, noEmit, erasableSyntaxOnly
  src/
    main.ts         arguments, the 60 Hz loop, bench mode
    terminal.ts     terminal setup, restore, resize
    input.ts        key parsing and held-key state
    noise.ts        seeded noise, fractal sums, hashing
    world.ts        terrain fields, biomes, chunk cache
    ambient.ts      clocks, light, wind, clouds, fronts, water animation
    player.ts       movement physics
    render.ts       frame buffer and building a frame
    screen.ts       frame diff → escape sequences
    config.ts       tunable constants and the biome table
  test/             one *.test.ts per module, plus a bench smoke test
```

### Units

| Unit | Job | Depends on |
|---|---|---|
| `noise.ts` | <ul><li>`makeNoise(seed)` returns 2D simplex noise with values in [−1, 1].</li><li>`fbm(...)` sums octaves.</li><li>`hash2(x, y, seed)` gives a stable 32-bit hash per cell.</li><li>`rng(seed)` is a small seeded PRNG.</li></ul> | nothing |
| `world.ts` | <ul><li>`classify(height, moisture, temperature)` returns the biome. It is a pure function.</li><li>`World` computes static cell data in 64×64 chunks and caches them. It can also prefetch chunks around the view within a time budget.</li></ul> | noise, config |
| `ambient.ts` | <ul><li>`ambientAt(gameTime, realTime)` gives the clock, light colour and intensity, wind, cloud cover and front state.</li><li>Per-position helpers give cloud shadow, gust strength, water animation and lantern light.</li><li>All of these are pure functions.</li></ul> | noise, config |
| `player.ts` | `stepPlayer(player, intent, terrainFactor, dt)` returns the new position and velocity. It is a pure function. | config |
| `input.ts` | <ul><li>`parseKeys(text)` turns raw text into key events. It is a pure function.</li><li>`InputState` tracks held keys and turns them into an intent: direction, run, fast time.</li><li>`InputState` also queues one-shot actions: toggle the status bar, quit.</li></ul> | nothing |
| `terminal.ts` | <ul><li>Enters full-screen mode and detects held-key support.</li><li>Restores everything on any exit path.</li><li>Reports the size and resizes.</li><li>It is the only unit that touches the real terminal.</li></ul> | nothing |
| `render.ts` | <ul><li>`Frame` holds three `Uint32Array`s per cell: glyph code point, foreground RGB and background RGB.</li><li>`renderFrame(...)` fills a frame from the world, ambient, player and status bar.</li></ul> | world, ambient, config |
| `screen.ts` | `diffFrames(previous, next)` returns one string of escape sequences. That string turns a screen showing `previous` into one showing `next`. It is a pure function. | render (the `Frame` type) |
| `main.ts` | Parses `--seed`, `--bench`, `--size` and `--frames`, then runs the loop. | everything |

### Each frame

```
input intent ─► player step (fixed 1/60 s) ─► world prefetch (≤ 3 ms)
             ─► ambientAt(gameTime, realTime) ─► renderFrame ─► diffFrames(previous, next)
             ─► one write: begin-sync + diff + end-sync ─► swap frames
```

### Timing

- The world advances in fixed steps of 1/60 s.
- Frame *n* is due at `start + n × 16.667 ms`, measured with `performance.now()`. The loop waits with `setTimeout` for the remaining time, so lateness never accumulates.
- If the loop falls behind, it runs up to 4 simulation steps and then renders once, so the world keeps its pace. If it is further behind than that, it skips ahead.
- The status bar counts the frames actually written in the last second.
- Node writes to a terminal synchronously on macOS, so a slow terminal slows the loop instead of letting output pile up.

### Tall characters

A character cell is about twice as tall as it is wide. So positions are kept in world units, and map cell `(mx, my)` covers world point `(mx, 2·my)`. One row therefore spans twice as much ground as one column. Lakes come out round, and movement at a constant world speed looks the same in every direction: 12 columns or 6 rows per second when walking.

## 4. Terminal and keyboard

`CSI` below stands for `ESC [`.

### Setup and restore

| Step | Sequence |
|---|---|
| Raw keyboard input | `process.stdin.setRawMode(true)` |
| Separate full screen | `CSI ?1049h` |
| Hide the cursor | `CSI ?25l` |
| Turn off auto-wrap, so writing the bottom-right cell never scrolls | `CSI ?7l` |
| Held-key reporting, only when detected | push flags 11 with `CSI >11u` (1 disambiguate + 2 event types + 8 all keys as escape codes) |
| Every frame | wrapped in `CSI ?2026h` … `CSI ?2026l` (synchronized output; terminals without it ignore it) |

Restore runs exactly once, whatever triggered it, and undoes setup in reverse order:

1. Pop the key flags (`CSI <u`).
2. Reset colours (`CSI 0m`).
3. Turn auto-wrap back on.
4. Show the cursor.
5. Leave the full screen.
6. Turn raw mode off.

Any of these triggers it: a normal quit, `SIGINT`, `SIGTERM`, `SIGHUP`, `uncaughtException`, `unhandledRejection` and `process.on('exit')`. After a crash, the error is printed once the terminal is restored, and the exit code is 1.

In raw mode, Ctrl-C and Ctrl-Z arrive as keys rather than signals. Ctrl-C quits; Ctrl-Z is ignored.

### Detecting held-key support

At start, the game sends two queries:

- `CSI ?u`, the kitty keyboard query;
- `CSI c`, primary device attributes, which every terminal answers.

The detector reads the replies, and they never reach the game:

| Replies | Result |
|---|---|
| A `CSI ?<flags>u` reply arrives before the `CSI ?…c` reply | Held-key reporting is supported. |
| Only the device-attributes reply arrives | Use the fallback. |
| Nothing arrives within 200 ms | Use the fallback. |

### Key events with held-key reporting

| Key | Sequence |
|---|---|
| Letters, Esc, Ctrl-C | `CSI <code>[:<alts>] [; <mods>[:<event>]] u`. `code` is the unshifted key: 119 is w, 27 is Esc, and Ctrl-C is 99 with ctrl. |
| Arrows | `CSI A/B/C/D`, or `CSI 1; <mods>[:<event>] A/B/C/D` |
| Shift on its own | codes 57441 (left Shift) and 57447 (right Shift) |

- `event` is 1 for press (the default when absent), 2 for repeat and 3 for release.
- `mods` is 1 plus these bits: shift 1, alt 2, ctrl 4, super 8, hyper 16, meta 32, caps lock 64, num lock 128. Caps lock and num lock are masked out.
- A key is held from its press until its release.
- Running is on while either Shift key is held, or while a movement key reports the shift bit.

### Fallback without held-key reporting

Keys arrive as plain bytes:

| Key | Bytes |
|---|---|
| A letter | the letter itself, e.g. `w` |
| A letter with Shift | the uppercase letter, e.g. `W` |
| An arrow | `ESC [ A` (and B, C, D) |
| An arrow with Shift | `ESC [ 1;2 A` (and B, C, D) |
| Ctrl-C | `0x03` |
| Esc | a lone `ESC` at the end of a read |

There are no release events, so how long a key counts as held is a guess:

- 550 ms after its first press, which is longer than the system's delay before auto-repeat starts;
- 120 ms after each repeat.

Movement is therefore a little hesitant at the start and stops about a tenth of a second late. That is accepted.

### Mapping keys to actions

`InputState.intent(now)` returns `{ dx, dy, run, fastTime }`, plus the queued one-shot actions `toggleHud` and `quit`. W and ↑, S and ↓ set `dy`; A and ←, D and → set `dx`. Opposite keys cancel out.

## 5. Generating the world

All values below are starting points, to be tuned by eye. Wavelengths are in world units, where 1 unit is 1 column.

| Field | Recipe |
|---|---|
| Height `e` | <ul><li>Continent noise (wavelength 1600) plus 5-octave detail (base wavelength 350).</li><li>Domain-warped (amplitude 60) for ragged coasts.</li><li>Sea level is 0.</li></ul> |
| Moisture `m` | 3 octaves, wavelength 600, mapped to 0–1 |
| Temperature `t` | 2 octaves, wavelength 1500, mapped to 0–1, then lowered with height |
| River | <ul><li>3 octaves (wavelength 400), warped.</li><li>A river runs where `\|river\| < width`, on land below the hills (height 0.02 to 0.55).</li><li>The width grows from 0.010 inland to 0.025 near the coast.</li></ul> |
| Lake | 2 octaves (wavelength 120). A lake forms where the value exceeds 0.55, height is between 0.04 and 0.4, and moisture is above 0.4. |

Biome rules, checked in order:

| Condition | Biome |
|---|---|
| e < −0.35 | Deep ocean |
| e < −0.08 | Ocean |
| e < 0 | Shallows |
| e < 0.04 | Beach |
| e ≥ 0.85, or e ≥ 0.7 and t < 0.3 | Snowy peaks |
| e ≥ 0.7 | Mountains |
| e ≥ 0.55 | Hills |
| t < 0.2 | Tundra |
| t > 0.65 and m < 0.3 | Desert |
| m > 0.75 and e < 0.2 | Swamp |
| m > 0.5 | Forest |
| otherwise | Grassland |

Rivers and lakes override land biomes below the hills.

**Static cell data** is computed once per cell and cached:

| Field | How it's computed |
|---|---|
| Biome | the rules above |
| Height | the height field |
| Glyph variant | from `hash2` |
| Slope shade | from the height difference to the neighbours, with light from the north-west |
| Water kind | none, sea, river or lake |
| River flow direction | the river-noise gradient turned 90°, which stays consistent along a river |
| Shore flag | set for water next to land |

**Chunks:**

- Chunks are 64×64 cells, kept in an LRU cache of 256 chunks.
- Each frame, chunks in a one-chunk ring around the view are generated ahead of time, nearest first, for at most 3 ms.
- If a chunk needed for drawing isn't ready, it is generated on the spot.
- At start, the view and its ring are generated before the first frame.

**Ambient fields:** cloud shadow and gust strength change slowly across space. They are computed on a coarse grid (every 4 columns × 2 rows) and interpolated. Everything else is computed per cell.

**Colour:** final colours are rounded to 32 levels per channel. Neighbouring characters then often share a colour code, and tiny shimmer changes don't cause redraws.

## 6. Drawing to the terminal

`diffFrames(previous, next)` walks the cells in order. For each cell whose glyph, foreground or background differs, it emits:

- a cursor move `CSI <row>;<col>H`, but only when the cell doesn't directly follow the last one written;
- a colour change, but only for colours that differ from the last ones written: `CSI 38;2;r;g;bm`, `CSI 48;2;r;g;bm`, or both in one sequence;
- the glyph, as UTF-8.

With no previous frame (the first frame, or after a resize), it clears the screen (`CSI 2J`) and writes every cell. Identical frames produce an empty string, and nothing is written. Each non-empty diff goes out in a single `process.stdout.write`, wrapped in the synchronized-output markers.

## 7. Performance

The cost to watch is how much output each frame produces. When the whole map shifts, every cell is redrawn. With 24-bit colour codes, that can approach 500 KB at 200×60 if no two cells share a colour code. Three tactics keep it down:

- colours are rounded (§5);
- colour codes are sent only when they change (§6);
- cursor moves are sent only at gaps (§6).

`node src/main.ts --bench [--size 200x60] [--frames 600]` measures this without a terminal. It runs a scripted walk (straight lines, turns, a stretch of running, some swimming) at 10:00 with a rain front active, which is the busiest case for output. The output goes to a byte counter. It prints:

- mean and 95th-percentile milliseconds per frame, with update, render and diff counted together;
- mean, 95th-percentile and maximum bytes per frame.

| Window | Build time, mean | Build time, p95 | Output, mean |
|---|---|---|---|
| 200×60 | ≤ 5 ms | ≤ 8 ms | ≤ 120 KB |
| 320×90 | ≤ 10 ms | ≤ 14 ms | reported |

The real check is the FPS figure in Ghostty's status bar. If the bench passes but Ghostty doesn't hold 60 FPS, the terminal side is the bottleneck. The levers then are coarser colour rounding or fewer animated cells.

## 8. Errors and edge cases

- **Restore on every exit path,** as described in §4.
- **Resize:** reallocate both frames, and drop the previous frame so the next diff is a full redraw.
- **Too small:** below 40×12, the screen shows a centred "Make the window bigger" message instead of the map. The world keeps running.
- **No terminal:** if stdout or stdin isn't a TTY and `--bench` isn't given, exit with code 1 and the message "wander needs a terminal".
- **Unknown key sequences** are ignored.
- **Terminal gone** (`EIO` or `EPIPE` on write, or `SIGHUP`): stop the loop and exit quietly.

## 9. Testing

Tests use `node --test` with `node:test` and `node:assert`, so there is nothing to install.

| File | Checks |
|---|---|
| `noise.test.ts` | <ul><li>The same seed gives the same values; different seeds differ.</li><li>Values stay in [−1, 1].</li><li>`hash2` is stable.</li></ul> |
| `world.test.ts` | <ul><li>Each `classify` rule from the table.</li><li>A cached chunk matches computing the same cells directly.</li><li>Every biome appears within a large sample of a fixed seed.</li></ul> |
| `input.test.ts` | <ul><li>Ghostty sequences for press, repeat and release of letters, arrows, Shift and Ctrl-C.</li><li>Fallback bytes and the fallback hold timeouts.</li><li>Handling of the detection replies.</li></ul> |
| `screen.test.ts` | <ul><li>Identical frames give an empty string.</li><li>One changed cell gives only a cursor move, a colour and a glyph.</li><li>Adjacent changed cells need no extra cursor move.</li><li>An unchanged colour isn't repeated.</li><li>With no previous frame: clear, then a full draw.</li></ul> |
| `player.test.ts` | <ul><li>Terrain factors slow you; nothing blocks you.</li><li>Diagonal speed equals straight speed.</li><li>Releasing the keys coasts you to a stop.</li></ul> |
| `ambient.test.ts` | <ul><li>Output is deterministic for given times.</li><li>The day cycle wraps.</li><li>Light is dimmest at night.</li><li>Fronts follow the seeded schedule.</li></ul> |
| `bench.test.ts` | `--bench --frames 60` runs as a subprocess without a terminal and prints its stats. |

## 10. Out of scope

- villages, roads, ruins and landmarks
- goals, score, enemies and saving
- sound and mouse input
- zoom and a minimap
- Windows

## 11. Risks

| Risk | Handling |
|---|---|
| Output volume limits FPS in large windows | Measured by `--bench` and the status bar. Coarser colour rounding and fewer animated cells are the levers. |
| A glyph renders double-width, or as emoji, in some font | All glyphs sit in one table in `config.ts`. |
| The fallback key repeat feels hesitant outside Ghostty | Accepted; Ghostty is the target. |
| Generating new terrain causes a hitch when you cross into it | Chunks are generated ahead of time in a ring, with a per-frame time budget. |
