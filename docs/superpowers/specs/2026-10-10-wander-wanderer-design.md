# Wander, the wanderer: an endless walk through made-up lands

2026-10-10 · Asked for in one brief (`~/wander-ambient-prompt.md`). The choices below were made without a back-and-forth, after the research in `docs/research/wanderer-research.md` (cited as *R: section § finding*), and are listed so they can be overruled.

Wander stops being a creature in a terminal diorama and becomes an ambient journey in the browser. A lone hooded wanderer walks forever through pixel-art lands that are made up as he goes, while day turns to night and the land changes around him. Nobody plays it. It is something to look at, or to leave running for hours full screen on a second monitor.

## 1. Intent

**Asked for, in the owner's words (the source of truth):**

> "something which procedurally generates pixel art sceneries and lone wanderer roams these places, sometimes sits around, smoke a cigarette, it wanders, it has a day night cycle, he goes and he goes and environment slowly changes around him as he travels our makeshift worlds/biomes, lonely, just with his thoughts"
>
> "it should be high definition, the atmosphere and the visuals are essential"

Atmosphere and visuals come first; where there is a trade, it goes toward beauty and calm. The mood: Kentucky Route Zero, Alto's Odyssey in zen mode, Mark Ferrari's colour-cycled landscapes, Sword & Sworcery, Caspar David Friedrich, a lo-fi "walking at night" stream. Lonely, beautiful, a little melancholic, never cute.

**Chosen here** (the brief's own choices are marked *brief*; where research overruled one, the reason is given):

| Question | Answer | Why |
|---|---|---|
| Platform | A browser app in TypeScript and WebGL2. `npm start` runs a small Node server and opens Chromium in app mode, full screen, autoplay allowed; any modern browser works too. No bundler: the server strips types with `module.stripTypeScriptTypes`. | *brief*; R: Engineering |
| What goes | The terminal renderer, terminal I/O and the whole Tamagotchi (needs, bond, food, toys, petting, talk, journal, visitor, knocking, gifts, questions). He never looks at the viewer and does not know anyone is watching. | *brief* |
| What stays | `noise.ts` (plus unbounded 1D lattice noise: the old permutation noise repeats every 256 cells, R: Procgen §3); the pure sky (sun, moon, phase, season, weather slots, wind), reworked to run off the sun's elevation; the Claude-with-local-fallback pattern of `mind.ts`, moved to the server; one master palette with named colour roles; the Aseprite pipeline, now exporting PNG atlases and JSON. | *brief* |
| Native resolution | **640×360**, scaled by a whole number: 3× at 1080p, 4× at 1440p, 6× at 4K. On screens that are not 16:9 the native view grows by whole pixels (up to ~400 rows) instead of showing bars; bars remain only for a leftover of a few screen pixels. *Overrules the brief's letterbox:* two research sections found that growing the view is what Godot, Unity and Owlboy do and that bars waste a second monitor. 480×270 was rejected: it is not a whole multiple of 1440p. | R: HD §4–5, Pixel craft §24 |
| Colour | **Indexed art.** Every pixel of every layer and sprite stores a colour *role* (e.g. `leaf.lit`, `land.shadow`, `coat.base`), never RGB. A palette texture maps role × biome × depth × moment to a colour, built on the CPU in Oklab from each biome's daylight palette and the time-of-day keys. Day to night, biome blends, haze per depth, colour cycling, lit windows and blinking lights are palette changes. No multiply-by-dark (mud). | R: Light §2–3, Pixel craft §2, Depth §11, Procgen §15 |
| Layers | **10 parallax layers** at fixed depths `z` (clouds, 7 land layers from mountains to near trees, the playfield, a sparse foreground), plus the static sky. `z` alone sets parallax `1/z`, drawn scale, baseline height, haze, colour count and rain size. | R: Depth §1–2, §7, §10 |
| Smooth motion | Each layer is resolved at native resolution into its own buffer at a whole-pixel offset, then composited at full resolution with its own fractional offset through antialiased point sampling. The camera locks to the wanderer, who is a float-positioned sprite. World positions stay float64 in JS; only fractions reach the GPU. | R: HD §6–10, Pixel craft §26 |
| Light | Surface light at native resolution (fire, ember, windows, lightning in 3–4 stepped rings at texel centres, flickering in 10 Hz steps); light in the air at full resolution (bloom from an emissive mask, fog sheets, valley mist, god rays, rain, snow, heat shimmer by whole pixels, grain, vignette, triangular blue-noise dither). No chromatic aberration, CRT or depth-of-field blur. | R: HD §11–21, Light §5–7, Depth §12–17 |
| Time | A day lasts an hour by default (configurable), on a **warped clock**: the sun's elevation drives every light, and the evening golden hour, dusk and blue hour get minutes of real time instead of seconds. A real-clock mode follows local time with the natural sun. | R: Light §1 |
| The world | One-dimensional along distance, endless, deterministic: pure functions of seed and distance. Stretches of 5–20 minutes; **14 biomes** blending over minutes; rare landmarks; paths, roads, poles and fences that come and go. Generated in chunks into fixed ring textures, so memory and GPU memory stay flat. | *brief*; R: Procgen |
| The wanderer | The hooded figure carries over as a traveller: 32 px tall (9% of the screen), long coat, pack, stick, no face (one dark value, two warm eye pixels). Hand-drawn frame by frame: an 8-frame walk at ~170 ms with stride variation, look-around, sit, smoke, make fire, lie by the fire, sleep. | *brief*; R: Art §21, Pixel craft §15, §18–22 |
| His brain | No needs bars. Each act scores itself from the hour, the weather, how long he has walked, what is just ahead and how long since he last did it; the pick is random, weighted by `exp(score / T)`. | *brief* |
| His thoughts | Every 3–5 minutes, a short line fades in beside him and out again. From Claude through the server when it has credentials (at most one call per 3–5 minutes), otherwise from a local generator with hundreds of lines tied to place, hour, weather and the people he left. | *brief* |
| Sound | Synthesised with Web Audio (Farnell's recipes), layered by biome, weather and hour; soft generative music after Eno; no recordings unless CC0. | R: Sound |
| Saving | `~/.local/share/wander/journey.json`, written by the server: seed, distance, clock, his state, a log of places passed. Time away becomes distance (capped). | *brief* |
| UI | Only the scene. H: a small dim bar; L: the log of places; M: sound; F: full screen. (+ and − set the volume in 2 dB steps, as the sound research asked.) | *brief*; R: Sound §23 |
| Font | **Alegreya Italic** (SIL OFL 1.1) for his thoughts, drawn at full resolution and sized with the art (one art pixel in CSS pixels sets its size, so it is the same share of the screen at 1080p and 4K). *Chosen over the research's first pick, m5x7:* the brief asks for "a quiet, beautiful font" for lonely, literary lines and names Kentucky Route Zero; at 640×360 m5x7's 7-pixel capitals read as game UI, while a literary italic reads as a voice. The research kept Alegreya as the high-resolution alternative for exactly this. The text is not part of the pixel art, so the one-pixel-size rule is not broken. | R: Art §22–23 |
| Tour images | The committed tour (`docs/tour/`) is JPEG at quality 90 with full chroma (4:4:4); `npm run tour` writes the lossless PNGs beside it in `tour-png/` (ignored by git). Film grain and dither make a 1080p PNG about 2.3 MB and a 4K one about 9 MB, so ~150 PNGs would add over 400 MB to the repository; the JPEGs are ~0.4 MB at 1080p and keep the 3×3 pixel blocks clean. | — |

**Done means** (the brief's definition of done):

1. `main` is the old `feat/creature`, and only `main` and `feat/wanderer` exist locally and on origin.
2. `docs/research/wanderer-research.md` exists with real sources, and this spec shows how they shaped the choices.
3. `npm start` opens it full screen with nobody touching it. He walks through an endless world that keeps changing. In 30 minutes of watching (sped up to check) there are at least three biomes blending, a sunset, a night camp with a fire, rain or fog, and him stopping to sit and smoke. The sound changes with all of it.
4. Every biome, every blend, every time of day and every weather looks beautiful in the tour, at 1080p and at 4K. The final tour is in `docs/tour/` and committed, and the README shows the best of it.
5. Motion is smooth: no shimmer, jitter or popping as layers scroll, as chunks load, or as biomes and light change.
6. A steady 60 fps at 1920×1080 and 3840×2160 on the RTX 4070, measured by the in-page bench (frame time p50 and p99).
7. Soaks: at high speed at least 48 in-world hours with no errors; at normal speed at least 2 real hours in the background; JS heap, live GPU textures and buffers, and frame time sampled every minute, all flat.
8. The same seed and distance always give the same place (tested).
9. Closing and reopening continues the same road, and time away moves him on.
10. It works fully offline (`mind: local`). With `ANTHROPIC_API_KEY` set for the server, thoughts come from Claude and the bar says `mind: claude`. A slow or failing API never holds anything up on screen.
11. The terminal and Tamagotchi code is gone, `npm test` passes, the README is rewritten, and `docs/CREDITS.md` lists every outside asset with its licence.
12. A final review of the whole diff against `main`, with its findings fixed.
13. A draft pull request from `feat/wanderer` into `main` is open.

## 2. What you see

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ ·     ·         .            ✦                       ◐            ·     .    │  sky: hand-keyed gradient,
 │    .        ·        ~~~ cloud ~~~       .                 ·             ·   │  stars, moon, Milky Way,
 │         .       ___                                ~~cloud~~~                │  aurora, shooting stars
 │  ___/\_/   \___/   \__  mountains (z 22, palest)  ___/\___                   │
 │ /      ridges (z 13, 8) ___/\____     _/\__    __/        \___              │  7 land layers, each
 │ ░░░░░░░ mist in the valley ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    │  hazier and bluer the
 │  hills (z 5, 3)   ⌂ house, one lit window      ▲▲  ▲▲▲  far forest           │  further it is
 │   ▲▲▲  ▲  mid trees (z 2)   ▲▲▲▲      ▲   ▲▲     ▲▲▲▲▲   ▲▲                  │
 │ ▲▲▲▲▲▲   near trees (z 1.4)    ▲▲▲          ▲▲▲▲        ▲▲▲                  │
 │  ,,  ,   ▲     ,  ¡  , ,,   ,     ,,   ,   ,    ,   ,,   ,  ,   ,            │  playfield (z 1): ground,
 │ ─────────────────────/\──────────────────────────────────────────            │  props, him, fire,
 │                     /••\ ← him: 32 px, left of centre, facing the road ahead │  animals, water
 │ ▓▓▓ foreground (z 0.6), rare and brief                                      │
 └──────────────────────────────────────────────────────────────────────────────┘
```

**The frame** (R: Art §20, Depth table): the walk line sits near y≈296 of 360. While walking he stands about 38% from the left, facing right, so most of the frame is the road ahead; when he sits, camps or looks out, the camera eases him toward the centre over a few seconds. The sky fills 45–55% of the frame, up to ~75% on the plateau, salt flat and coast ("Monk" stretches, after Friedrich's *Monk by the Sea*), and less under the forests. At most one landmark is in view. Foreground silhouettes are rare, near-black and pass in under two seconds.

**Layers** (back to front; `z` is depth in units of the playfield distance, R: Depth §1):

| Layer | z | Parallax 1/z | Holds | Colours |
|---|---|---|---|---|
| Sky | ∞ | 0 | gradient, sun, moon, stars, Milky Way, aurora, shooting stars | 12–16 in dithered steps |
| Clouds | 40 | 0.025 + wind | 2–3 bands of pixel clouds that catch the sunset | 3–4 |
| Mountains | 22 | 0.045 | the farthest ridge, often snow-capped; borrows the sky's colour | 2 |
| Far ridge | 13 | 0.077 | ridges, mesas, sea horizon | 2 |
| Ridge | 8 | 0.125 | ridges, far tree lines, the lighthouse | 3 |
| Far hills | 5 | 0.2 | hills, tree lines, a train, a mast, a chapel on a hill | 3 |
| Hills | 3 | 0.33 | hills, forest, lakes, far houses | 4 |
| Mid | 2 | 0.5 | trees, rocks, ruins, water | 4–5 |
| Near | 1.4 | 0.71 | trees, bushes, walls | 5–6 |
| Playfield | 1 | 1 | ground, path, props, landmarks, fire, animals, water, **him** | full ramps |
| Foreground | 0.6 | 1.67 | grass tufts, fronds, a post, rarely | 1–2 |

Each layer's baseline is `y_h + (y_g − y_h)/z`, where the horizon `y_h` and ground `y_g` are blended from the biomes (a low horizon in "Monk" stretches). Its haze is `F = 1 − e^(−σ(z−1))` toward the fog colour at that depth, with σ from the biome, the weather and the hour (R: Depth §7–9).

**Subtle motion everywhere**, all with co-prime periods and random phases so nothing lines up over hours (R: Pixel craft §23): grass and reeds shear by whole pixels per row in travelling gusts; tree crowns sway by whole lobes; leaves fall in autumn and in wind; water reflects the sky and him with whole-pixel ripples; Ferrari colour cycling runs water, waterfalls, the sea's glints and lit windows' flicker; chimney smoke, cigarette smoke and fire smoke drift with the wind; birds cross in flocks by day, bats and fireflies at night; clouds and fog sheets drift even when he stops.

## 3. The world

**Units.** Distance along the road in metres (float64). On the playfield one metre is 18 native pixels, so he is about 1.8 m tall. He walks at about 1.1–1.3 m/s, 20–23 px/s.

**Determinism** (R: Procgen §1–3). Every random decision is a counter-based hash (SquirrelNoise5) of integer coordinates and the seed; noise is 1D lattice noise on hashed gradients, with no tables and no `Math.sin`, so it repeats nowhere and gives the same bits in every engine. The same seed and distance always give the same place.

**Stretches** (R: Procgen §13). The road is cut into stretches of 400–1200 m (about 6–17 minutes at walking pace): boundary `k` sits at `800·k` metres moved by up to ±200 m. Any distance finds its stretch directly.

**Which biome** (R: Procgen §12). Four slow climate fields along the road (temperature, moisture, altitude, human trace), each mapped through tanh to spread evenly, place every stretch in climate space; each biome has a centroid there. An even stretch picks among the three nearest biomes by weight; an odd stretch picks among the best that differ from both even neighbours and may sit next to them (never desert by tundra or swamp, never tundra by swamp). No chain, no look-back: any stretch is found in a few steps. Over long roads every biome comes up 4–12% of the time.

**Blending** (R: Procgen §14). A border is a smoothstep over ±120 m (about 3.5 minutes) around a boundary that wanders by ±35 m, so the two biomes interleave a little near it. Palette, sky, haze, sound and weather tendencies follow these weights; terrain blends over ±70 m; plant density over ±45 m; discrete things (which tree, which rock) are picked by weight, so a transition zone mixes species naturally. Heights are blended, never noise frequencies.

**Far layers look ahead** (R: Procgen §11). A column of a layer with parallax `f` reads the road at `d = (u − x_him)/f`, the distance at which it passes him. Far ridges therefore show the land to come: the mesas rise on the horizon minutes before the sand starts.

**The biomes** (14; colours in `palette.ts`):

| Biome | Ground he walks | Plants and props | Far land | Weather leans | Odd |
|---|---|---|---|---|---|
| Pine forest | needles, gentle hills | tall pines in groves, ferns, stumps, logs | dark ridges | fog, rain, mist at dawn | |
| Birch woods | grass | white birches, bracken, fallen trunks | low hills | rain, mist | |
| Open meadow | grass, flowers | lone trees, bushes, fence posts, hay | soft hills | wind, summer storms | |
| Autumn hills | leaves | oaks and maples in rust and gold, falling leaves, stone walls | rolling hills | fog, wind, rain | |
| High plateau | gravel, short grass | tussocks, cairns, boulders | wide flat mesas, big sky | wind, clear, snow | |
| Mountain pass | gravel, steep | rocks, cairns, stunted pines, snow patches | jagged ridged peaks | snow, fog, wind | |
| Coast and dunes | sand | marram grass, driftwood, fences, the sea beyond | sea horizon, headlands | fog, wind, storms | |
| Desert of mesas | sand | cacti, dead shrubs, bleached rocks | terraced mesas | clear, rare storms | |
| Snowy tundra | snow | dwarf spruce, snowdrifts, rocks | white low ridges | snow, wind | |
| Swamp | mud, boardwalks | dead trees in water, reeds, pools, mist | low tree lines | fog, rain | |
| Salt flat | salt crust | abandoned power lines, poles, a mirror of water after rain | far mesas | clear, heat shimmer | ✓ |
| Standing stones | moor grass | stones alone and in rows, heather, a rare circle | moorland | fog, rain | ✓ |
| Ruins of a town | gravel, broken road | ruined walls, empty windows, lamp posts, bus stops, ivy, trees growing through | broken skyline | rain, fog | ✓ |
| Rail embankment | gravel, sleepers | the line on a bank, telegraph poles and wires, signals | low hills | rain, wind | ✓ |

**Landmarks** (R: Procgen §27, Art §2). One cell per 800 m holds a landmark with chance 0.72, at least 400 m from the next; its kind is picked by weight from those that belong where it stands: a lone house with one lit window, a chapel, a lighthouse (coast only), a radio mast with a blinking red light, a rusted car, a bridge over a river, a distant train at night (rail, plateau, salt flat), a stone circle, a roadside shrine, a huge skeleton half in the ground (desert, salt flat, tundra, plateau), someone else's abandoned camp. About one every 15 minutes of walking. The ground flattens near one, tall props stand aside so it is framed, and it is never on screen with another. Some live on far layers (the lighthouse on a headland, the train crossing the far hills, the mast's light on a ridge), the rest on the playfield.

**Paths, roads and poles** come and go along their own slow noise: a dirt path in the woods and meadows, a cracked road in the ruins and on the salt flat, a gravel track, telephone poles with sagging wires (a parabola, R: Procgen §25), fences.

**Life** (rare and quiet): birds in flocks and alone, a deer at the edge of the trees, a fox crossing, fireflies on summer nights, bats at dusk, a fish jumping in a lake, an owl's call. Never more than one animal event at a time.

**Chunks.** Each layer is generated in chunks of 128 native px into a ring texture wide enough for the view plus margins (2048 px); chunks are painted on the CPU a little ahead of need, at most one per frame, and overwritten behind him. Textures are allocated once at start and never again, so memory and GPU memory stay flat however far he walks.

## 4. Light and time

**The clock.** World time runs at `speed × 24 h / dayLength` (default `dayLength` 60 minutes, `speed` 1). The sun's elevation comes from a warped clock (R: Light §1): in a one-hour day there are about 17 minutes of night, 4 of dawn twilight, 2 of morning blue hour, 4 of morning golden hour, 18 of day, 6 of evening golden hour, 4 of evening blue hour and 5 of dusk twilight. The bar shows the hour a clock would show for that light (sunrise 6:00, sunset 18:00). The real-clock mode follows local time with the natural sun. The moon turns once every 29.5 world days and rises later each day by its phase; the season follows the date.

**Palette keys** (R: Light §2–4, Art §4, §6). Each biome has a daylight palette of 30–60 roles, built from Oklab ramps after the research's recipe (5–6 steps, lightness +0.10–0.13 per step, chroma peaking in the middle, hue turning toward the light as it brightens and toward the ambient sky as it darkens; R: Pixel craft §5–7). Each role knows how much it faces the light. The palette at a moment is built from keys by sun elevation (dense through twilight, sparse at noon and deep night, like Ferrari's): each key has a key-light colour, an ambient sky colour, a night shift (toward the blue-violet of night paintings, `#413d4d`, with reds losing most), a lightness curve and a saturation. Lit roles take the key light (orange at golden hour), shadow roles take the ambient (violet at dusk), so at dusk the land falls to violet-black while lit edges glow and the sky keeps its brightness. Then each depth's haze. Biomes may tint their keys (the pine forest goes violet at night, the desert stays warmer in the evening).

**Sky** (R: Light §9–12). Hand-keyed zenith and horizon colours by elevation, plus a glow lobe around the sun or moon (strength, width, colour), muted teal by day and violet by night: −18° `#100f19`/`#242436` … 0° `#21364c`/`#d4ad79` … +40° `#2f7582`/`#c3d8db`. Drawn at native resolution in 12–16 steps with one Bayer 4×4 dither between neighbours; the sun and moon discs are pixel art, their halos and the glow lobe are smooth light at full resolution. Stars are single native pixels in real star colours, twinkling more near the horizon; the Milky Way is a dusty band on clear moonless nights away from towns; aurora curtains (green body, red tops) on clear nights in the cold biomes; a shooting star now and then, more before dawn. Clouds are lit from below by the glow after sunset.

**Night** (R: Light §20–23, Art §12). Night is readable: silhouettes against a sky a little lighter than the land, about two stops under day, edges kept and texture dropped. The warm lights are his eyes, the ember, the fire, someone's window, the mast's red light and the lighthouse: nothing else is warm.

**Local light** (R: Light §5–7). The fire (1500–1800 K, `#ff6d00`–`#ff7e00`) lights him and the ground around the camp in 3–4 stepped rings, flickering in 10 Hz steps after Quake's light styles; the ember (1000–1500 K) lights the inside of his hood a little and flares on each drag; windows glow 2700 K (`#ffa957`). A 1 px rim light on silhouettes faces the low sun, the moon or the fire (R: Light §14–15, Art §21).

**Weather** (from the old sky model, R: Depth §13, §21–22). Weather comes in 3-hour slots fading into each other, hashed from the seed and the world time; the biomes around him set the chances: clear, cloudy, overcast, fog, rain, snow, storm and wind. Rain falls in three depth planes (far, mid, near) with size and speed by `1/z`, splashing on the playfield; snow drifts the same way, slower; storms flash and the thunder follows; fog thickens the haze and draws 3–5 drifting sheets between layers; valley mist pools between ridges after a clear night and burns off by mid-morning; wind bends the grass, pulls the smoke and the coat, and carries leaves.

## 5. The wanderer

**Body** (R: Art §21, Pixel craft §15). 32 px tall standing, readable as a flat silhouette: peaked hood, the pack's hump with a bedroll, the stick held forward, the coat flaring at the hem. The coat is near-black indigo (the old creature's cloak hue, darkened), with one cool mid-tone for folds and a 1 px rim toward the brightest light. The hood opening is one flat dark value with two warm eye pixels that never go dark at night and that fog cannot cover. He faces right, the way he walks, and turns only to look back.

**Animations** (hand-drawn in Aseprite, frame by frame; R: Pixel craft §18–22):

| Pose | Frames | Notes |
|---|---|---|
| Walk | 8 (contact, down, passing, up × 2), ~170 ms | 1 px triangle-wave bob, coat hem a frame behind, stick planted every second step; a weary variant with a shorter stride. Frame time scales with his pace so the planted foot never slides. |
| Stand and look around | 6 + holds | breathing, hood turning to the view and back; sometimes he turns his back to look out (Friedrich's *Rückenfigur*) |
| Sit | 3 in, a breathing loop, 3 out | on a rock, log, wall, bench or bus stop: the seat sets his height |
| Smoke (standing or sitting) | hand up in 4, hold, down in 3, exhale | the ember steps through three warm colours on the drag; smoke rises in single-pixel puffs that drift downwind and fade by palette steps |
| Make fire | kneel, strike, blow, sit back | the fire is its own 8-frame sprite with sparks |
| Lie by the fire, sleep | 3 down, a slow 2-frame breathing loop | eyes closed: the eye pixels go dark |
| Pack up | stand, kick out the fire, shoulder the pack | the fire dies to embers and smoke |

**What he does** (the brain, `brain.ts`). Each time an act ends, and every few seconds while walking, every possible act scores itself and one is picked at random, weighted by `exp(score / 0.35)`:

| Act | Possible when | Drawn by |
|---|---|---|
| walk | always | fresh legs; less after a long walk |
| look at a view | a view (high ground, a landmark, the sea) is within 50 m, not in the last ~3 min | the view's quality, time since the last look, golden hour |
| sit (and usually smoke) | a seat that fits the place (rock, log, wall, bench, bus stop) within 70 m, no heavy rain, not in the last ~5 min | how long he has walked, the seat's quality |
| smoke standing | not in the last ~7 min, not in rain | time since the last smoke |
| shelter | rain heavier than 0.45 and a big tree, bridge or bus stop within 90 m | rain strength, storms |
| camp | dusk or night, he has not slept yet, a dry flat spot within 140 m | strongly; a per-night "night owl" draw lets him walk on into the dark first on some nights |

He walks slower uphill, in snow and sand and in strong headwind, and his pace wanders by a few percent. A camp lasts until dawn: make the fire, sit and smoke, lie down, sleep through part of the night (sometimes waking to sit up by the fire), and at first light pack up and walk on. While he sleeps the world goes still around the fire: the music thins, the wind drops a little, the animals keep away.

**His thoughts.** Every 3–5 minutes of his time (never while he sleeps), a thought fades in beside him over calm sky, holds a few seconds and fades out; never more than one, never over busy art (R: Art §22). They are lonely and quiet, specific to what is around him and the hour: memories of people and places he left (the same three people and two places for a whole road, fixed by its seed), small observations. Never addressed to the viewer; no clichés, exclamation marks or emoji. At most two short lines.

- **With credentials**, the browser asks the server for a thought and the server asks Claude (structured reply, the model and fallback of `mind.ts`), at most one call per 3–5 minutes so it stays cheap all night. The request carries the place, the hour, the weather, what he is doing, what is near, the day on the road, his people and his last few thoughts.
- **Otherwise**, and whenever Claude is slow, refuses or fails, the local generator (`thoughts.ts`) speaks: hundreds of lines in groups by place, hour, weather, act and landmark, with slots for his people, places and small habits. Nothing on screen ever waits for the network: the page asks ahead, and a thought that arrives late is simply used next time.

## 6. Sound

All synthesised with the Web Audio API from Farnell's recipes, behind one quiet bus (R: Sound §1–17, §23–24):

- **Ambience layers**, crossfaded slowly by the biome weights, the weather and the hour: wind (a wind-speed signal with gusts feeding a body, whistles and leaf ticks), rain (a bed, a boiling layer and scheduled drops whose sound depends on the ground), thunder after each flash, coast waves, crickets at night (slowing as the night cools), birds by day (densest at dawn), owls rarely, a distant train with the rail line.
- **His sounds**: footsteps synced to the walk cycle, by ground (grass, gravel, snow, sand, wood, mud, leaves, salt; puddles when wet); the lighter's click and a slow exhale; the fire's crackle, hiss and lapping while camping.
- **Music**: soft and sparse, after Eno and Generative.fm (R: Sound §18–22): a few voices (plucked strings computed once, FM bells, slow pads) playing from a modal note pool on loops of incommensurable lengths, about one note every few seconds, a drone far below, one generated reverb. The mode and density drift with the hour and the biome; it thins at night and when he sleeps.
- **Mix**: a limiter that only catches accidents; quiet target levels; sounds placed in stereo by their position on screen; far sounds filtered. Scheduled from a worker-driven clock half a second to two seconds ahead, never from the render loop, so it keeps going in a background window.
- `M` toggles sound. Any recording added later must be CC0 and listed in `docs/CREDITS.md`.

## 7. Rendering

**Per frame** (R: HD §20):

1. **Chunks.** At most one chunk is painted on the CPU into a reused byte buffer (role and flags per pixel) and uploaded into its layer's ring texture with `texSubImage2D`. Columns also carry the two biomes and the blend at that column.
2. **Palette.** The palette texture (roles × layer × biome rows) is rebuilt for the biomes in view when the moment has moved on enough (every few frames), in Oklab, and uploaded.
3. **Native passes**, one per layer, into its own `(W+2)×(H+2)` RGBA8 buffer at its integer offset: look up the role, mix the two biome rows by the column's blend, add surface light (stepped rings at texel centres), the rim, wind shear and water ripple by whole pixels; write the emissive mask to a second attachment.
4. **Sky** at native resolution into its own buffer.
5. **Composite** at full resolution into an RGBA16F scene buffer, back to front: sky, then each layer with its fractional offset through antialiased point sampling, with its haze sheet and fog after it; the reflection of what is behind in that layer's water; sprites (him, the fire, smoke, animals, particles) at float positions; rain and snow by depth plane.
6. **Bloom** from the emissive masks, in a small mip chain (native size and below), and **god rays** from a small occlusion mask at dawn and dusk.
7. **Final pass** to the canvas: scene + bloom + rays, a gentle grade, vignette, temporal grain, triangular blue-noise dither of ±1 LSB.

**Pixel rules.** One pixel size everywhere: nothing is scaled or rotated except by whole pixels; sway and shimmer move whole native pixels per row; dither only in the sky and haze; the full-resolution layer holds only things with no edges finer than ~8 native px, plus rain streaks sized in native pixels. Text is the one exception, drawn after the upscale in its own crisp layer.

**Budget.** About 13 full-resolution layer and sheet passes plus a few small passes: well inside an RTX 4070 at 4K. No allocation in the frame loop (preallocated typed arrays, pooled particles, reused uniform arrays); textures and framebuffers are created on start and on resize only, and counted.

## 8. Saving and time away

`$XDG_DATA_HOME/wander/journey.json` (default `~/.local/share/wander/journey.json`), written atomically by the server every 30 s, on `pagehide`, and when the server stops:

| Field | What |
|---|---|
| `version`, `seed` | the road |
| `distance` | metres walked |
| `clock` | world hours since the road began (the day on the road is `floor(clock/24) + 1`) |
| `moonStart`, `startedAt` | the moon's phase and the real date when the road began |
| `state` | what he is doing, his pace, cigarettes since the last landmark and its name, seconds since each act, his last thoughts, whether he has slept tonight |
| `log` | the places passed: each biome entered and each landmark, with distance, day and hour (the last 500) |
| `savedAt` | real time of the save |

**Time away.** On start the server catches up: the real time since `savedAt` advances the clock by the usual rate and the distance by an average pace that allows for rests, capped at 20 km, and the log gains the places passed in between. He wakes wherever that is, doing whatever fits the hour. `--new` (or `?new=1`) starts a new road and keeps the old file as `journey.json.bak`. Demos that bend time (`--speed`, `--hour`, frozen shots) are not saved unless a save path is given.

## 9. What you can do

By default there is only the scene.

| Key | Does |
|---|---|
| H | A small, dim bar: day N on the road, distance, the place's name, the time, the weather, `mind: claude` or `mind: local` |
| L | The log of places passed |
| M | Sound on or off |
| F | Full screen |

**Options**, on the command line (`npm start -- --seed moss --speed 20`) or as URL parameters (`?seed=moss&speed=20`):

| Option | Does |
|---|---|
| `seed` | a road from this seed (any word); continues the saved road if it has the same seed |
| `new` | starts a new road |
| `speed` | everything runs N times faster (not saved) |
| `day` | minutes of real time per world day (default 60) |
| `realclock` | follow the local time of day with the natural sun |
| `hour` | start at this hour (not saved) |
| `biome` | start in a stretch of this biome (the nearest one ahead on the road) |
| `offline` | never call Claude |
| `frozen`, `at`, `weather`, `pose`, `size` | screenshots: a fixed distance, hour and weather with time stopped, an optional pose, an exact canvas size |
| `bench` | run the in-page bench for N seconds and report frame times |

## 10. How it is built

TypeScript run directly by Node (≥ 25) on the server and served with types stripped to the browser; no bundler, no type checker beyond the tests. Runtime dependency: `@anthropic-ai/sdk`, loaded lazily on the server. Dev dependency: `playwright-core` (one 14 MB package, against puppeteer-core's 23) driving the system Chromium for screenshots, the tour, the bench and the soak (R: Engineering §9).

```
server/
  main.ts        npm start: options, journey file, Claude, the server, then Chromium full screen
  server.ts      the HTTP server: page, stripped TypeScript, assets, the journey and thought API
  journey.ts     load, save (atomic), catch up on time away, new road
  mind.ts        Claude thoughts: prompt, structured reply, rate limit, quiet after failures
  browser.ts     launching Chromium: app mode for npm start (with a watchdog), headless on the GPU for the tools
src/             shared, pure modules (run in Node tests and in the browser)
  noise.ts       hashing and noise
  sky.ts         the warped clock, sun, moon, season, weather, wind
  biomes.ts      the biome table and landmark homes
  world.ts       stretches, blends, ground, landmarks (pure functions of seed and distance)
  place.ts       what stands on each layer: species, props, spots for the brain (pure)
  brain.ts       what he does next
  walker.ts      his body: position, pace, pose and animation, the camp
  thoughts.ts    the local voice
  journal.ts     the journey's state and log, shared with the server
  options.ts     URL options
  palette.ts     roles, biome palettes, time keys, building palette rows (Oklab)
web/             the browser side
  index.html, style.css, fonts/
  main.ts        boot, the loop, saving, keys
  gl.ts          WebGL2 helpers and a registry of live GPU resources
  paint/*.ts     chunk painters per layer kind (pure: write roles into byte arrays)
  render.ts      the frame (passes above), shaders in shaders.ts
  sprites.ts     the atlas and sprite batches
  audio/*.ts     ambience, his sounds, music
  ui.ts          the bar, the log, the thoughts
  bench.ts       frame-time and resource sampling
art/             *.aseprite sources; exported by `npm run art` to assets/
tools/           npm run shot | tour | motion | bench | soak; the art exporter
```

**Chromium** (R: Engineering §1–9). The real binary is `/usr/lib/chromium/chromium` (`/usr/bin/chromium` is a launcher that adds the user's own flags and extensions). `npm start` runs it with `--app=URL --start-fullscreen --autoplay-policy=no-user-gesture-required`, a dedicated `--user-data-dir` (otherwise a running Chromium takes the launch and ignores the flags), `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows` and `--disable-domain-blocking-for-3d-apis --disable-gpu-process-crash-limit` (so a GPU-process crash restores the context instead of blocking WebGL for the site). The page asks for a screen wake lock whenever it is visible, recovers a lost WebGL context by rebuilding its resources, and the server relaunches Chromium if the page's heartbeat stops while the app was meant to be open. Headless tools add `--headless=new --use-angle=vulkan`: without it Chromium renders on SwiftShader at about 1.5 s a 4K frame.

**The clock** runs off `performance.now()`, never frame counts: the monitor runs at 144 Hz, and a hidden page gets no frames at all. After a pause the world catches up in clamped steps.

**Checking it with eyes.** `npm run shot` renders one frozen frame in headless Chromium on the GPU; `npm run tour` renders every biome, every blend, every hour and weather, every pose and every landmark at 1920×1080, a few at 3840×2160, and a contact sheet into `docs/tour/`; `npm run motion` captures frames 1/60 s apart to check the walk, the parallax and the camera for shimmer; `npm run bench` reports frame time p50 and p99; `npm run soak` runs for hours and samples the heap, live GPU resources and frame time every minute.

**Tests** (`npm test`, `node --test`): the world's determinism, stretches, neighbours, blends and landmarks; the sky and the warped clock; the brain's choices; the local voice; chunk painting is deterministic and chunk release keeps memory flat; the palette builder; saving, resuming and the time away; the thought rate limit and the Claude fallback (with a fake API); the server's routes.
