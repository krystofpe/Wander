# Wander, the wanderer: implementation plan

> Steps use checkbox (`- [ ]`) syntax for tracking. Progress, open problems and visual flaws live in `docs/superpowers/progress-wanderer.md`; read it first after any restart.

**Goal:** turn the terminal creature diorama into an endless, ambient pixel-art journey in the browser, as specified in `docs/superpowers/specs/2026-10-10-wander-wanderer-design.md`, backed by `docs/research/wanderer-research.md`.

**Architecture:** pure, shared modules in `src/` (world, sky, brain, voice, palette, chunk painters' inputs) that run in Node tests and in the browser; a WebGL2 renderer and Web Audio in `web/`; a small Node server in `server/` that serves the page with types stripped, keeps the journey file and makes the Claude calls; headless-Chromium tools in `tools/` that give eyes (shots, tour, motion, bench, soak).

**Tech stack:** Node ≥ 25 (`module.stripTypeScriptTypes`), TypeScript with only erasable syntax, WebGL2, Web Audio, `node:test`. Runtime dependency `@anthropic-ai/sdk` (server, lazy). Dev dependency `playwright-core` driving the system Chromium (`/usr/lib/chromium/chromium`, headless with `--use-angle=vulkan`).

**Working directory:** `~/Projects/Wander`, branch `feat/wanderer` (cut from `main` = the old `feat/creature`).

## Global constraints

- Only TypeScript syntax Node can strip: no `enum`, no `namespace`, no parameter properties; type-only imports use `import type`; relative imports end in `.ts` (the browser fetches them as JavaScript by MIME type).
- `src/` modules never touch the DOM, WebGL, Node built-ins or the network, so tests run them as they are.
- Every random decision in the world is a hash of integer coordinates and the seed (`noise.ts`); no `Math.random` and no `Math.sin` in generation.
- One native pixel size everywhere (`640×360` grown to fit, scaled by a whole number). Nothing is scaled or rotated except by whole pixels.
- No allocation in the frame loop; GPU resources are created at start and on resize only, through the counting registry in `web/gl.ts`.
- `npm test` stays green after every task. The test reporter prints colour codes; strip them with `sed -E 's/\x1b\[[0-9;]*m//g'` before grepping.
- After every visual change: render shots, open them, judge them against the research and the brief (silhouettes, palette, depth, motivated light, nothing muddy, noisy, flat or busy; would I leave it running for hours?), note before and after in the progress file.
- Small commits (`feat: …`, `fix: …`), ending with the co-author trailer; push `feat/wanderer` at each milestone.

## Milestones

### M1. Research, spec, plan
- [x] Eight research areas → `docs/research/wanderer-research.md`.
- [x] Spec and this plan.
- [ ] Commit both, push.

### M2. Eyes first
- [ ] `server/server.ts` (static files, `.ts` stripped and cached by mtime, path guard, JSON API stubs) with `test/server.test.ts`: serves a stripped module with a JavaScript MIME type, refuses paths outside `src/ web/ assets/`, round-trips the journey API with a fake store.
- [ ] `server/browser.ts`: find Chromium; launch flags for app mode (`--app --start-fullscreen --autoplay-policy=no-user-gesture-required`) and for headless GPU rendering (flags from R: Engineering).
- [ ] `server/main.ts` and `npm start`: start the server, open Chromium, exit cleanly with it.
- [ ] `web/index.html`, `web/main.ts`, `web/gl.ts`: a WebGL2 canvas sized in device pixels (`ResizeObserver` with `device-pixel-content-box`), the integer scale and grown native size, a counting resource registry, a loop driven by rAF timestamps.
- [ ] `tools/shot.ts` (`npm run shot -- --seed S --at D --hour H --weather W --size WxH --out F.png`): headless Chromium on the GPU, the frozen mode, waits for the page's "ready" flag, saves the canvas.
- [ ] Check: a shot of the empty canvas at 1920×1080 and 3840×2160 comes out with the right size and the GPU renderer named in the log.

### M3. Vertical slice: him walking forever under a graded sky, already beautiful
- [ ] `src/palette.ts`: roles, Oklab conversion, ramps from the research recipe, daylight palettes for two biomes, time keys by sun elevation, building palette rows (tests: rows are deterministic; night darkens without going muddy, measured as lightness and chroma ranges; haze moves far rows toward the fog colour).
- [ ] `web/layers.ts`: ring textures per layer (R8 role + R8 flags, per-column biome blend), chunk scheduling (ahead of need, at most one per frame), release by overwriting; `src/paint/*.ts` pure chunk painters (tests: the same chunk paints the same bytes; chunk edges join; painting a chunk never allocates after warm-up).
- [ ] Painters for the sky, two ridge layers, hills, and the playfield ground; trees for one biome.
- [ ] `web/render.ts`: native passes per layer, the full-resolution composite with antialiased point sampling and per-layer fractional offsets, the final pass (dither, vignette, grain).
- [ ] The wanderer: an 8-frame walk drawn in Aseprite (`art/wanderer.aseprite` → `assets/sprites.png` + `.json` by `npm run art`), drawn as a float-positioned sprite; the camera locks to him.
- [ ] `src/walker.ts`: position, pace (slope, ground), stride-synced animation (tests: planted foot travel equals ground travel within a pixel).
- [ ] Look, judge, fix, repeat until the slice is beautiful at dawn, noon, dusk and night.

### M4. Clear out the old
- [ ] Delete the terminal renderer, terminal I/O and the Tamagotchi (`terminal`, `input`, `screen`, `frame`, `render`, `game`, `creature`, `scene`, `scenery`, `surround`, `backdrop`, `figure`, `kit`, `art`, `sprites`, `speech`, `visitor`, old `config`, `save`, `color`, `palette`, `main`, `mind` after its port) and their tests; old `art/*.aseprite` except what is reused; `tools/export-art.lua` rewritten for PNG atlases.

### M5. The fourteen biomes
- [ ] Biome palettes (14) and per-biome keys; `src/place.ts` species and props per biome with jittered-grid placement, groves and the spots for the brain (tests: deterministic; spots only where they fit: no seat in swamp water).
- [ ] Painters: pines, birches, broadleaf and autumn trees (space colonisation crowns), dead trees, spruce, cacti, shrubs, reeds, grass and flowers, rocks (facets), stones, walls and ruins (modules), power and telegraph lines (parabolic sag), rail line, boardwalks, fences, paths and roads, mesas, the sea, lakes and rivers.
- [ ] Look at every biome and every blend at four hours; fix.

### M6. Light and air
- [ ] Time keys for every biome; night; rim light; local light rings with flicker; emissive masks; bloom chain; fog sheets; valley mist; god rays; heat shimmer; the sky's stars, moon with phase and halo, Milky Way, aurora, shooting stars; clouds lit by the glow.
- [ ] Look at every hour in every biome; fix.

### M7. Weather
- [ ] Rain and snow in three depth planes, splashes, wet ground and puddles, lightning, wind on grass, trees, smoke and the coat, leaves.

### M8. His life
- [ ] Poses in Aseprite: look around, back turned, sit (several seat heights), smoke (standing, sitting), make fire, lie, sleep, pack up; the fire and smoke sprites.
- [ ] `src/walker.ts` + `src/brain.ts` integrated: stops at spots, sits where it fits, shelters, camps from dusk to dawn (tests: a simulated night always ends in a camp at a camp spot when one exists; he never sits in water).

### M9. Landmarks and life
- [ ] The eleven landmarks (sprites and their lights: one lit window, the mast's red light, the lighthouse beam, the train's windows), framed on their layers; animals (birds and flocks, deer, fox, bats, fireflies, a fish, an owl).

### M10. Thoughts
- [ ] `server/mind.ts` (port of the old `mind.ts`: prompt, structured reply, fallbacks, quiet after failures) with the rate limit (tests with a fake API: at most one call per window; a hanging call times out; failures fall back; `mind()` reports `claude` only when credentials work).
- [ ] The page asks ahead and shows thoughts with the chosen font, fading; never more than one; local lines whenever Claude is not there in time.

### M11. Sound
- [ ] Audio engine (one context, buses, limiter, worker clock), noise buffers, wind, rain, thunder, waves, fire, steps per ground, lighter and exhale, birds, crickets, owls, train, music; crossfades by biome, weather and hour; M toggles.

### M12. Saving and options
- [ ] `src/journal.ts` and `server/journey.ts` (tests: save and load round-trip; atomic write; catch-up moves him on by the time away, capped, and logs the places passed; a new road keeps a backup).
- [ ] Options from the command line and the URL; the bar (H), the log (L), sound (M), full screen (F).

### M13. Tools and polish
- [ ] `npm run tour` (every biome, blend, hour, weather, pose, landmark; 1080p and 4K; contact sheet) and `npm run motion` (frames 1/60 s apart, diffs for shimmer).
- [ ] In-page bench and `npm run bench` at 1080p and 4K; fix anything over budget.
- [ ] Iterate on the tour until every image is beautiful.

### M14. Proof and hand-over
- [ ] Soak at high speed for 48 in-world hours and at normal speed for 2 real hours in the background, sampling heap, GPU resources and frame time every minute.
- [ ] A 30-minute sped-up watch that logs biomes, sunset, camp, rain or fog, sit and smoke, and the sound layers.
- [ ] README rewritten with the best tour images; `docs/CREDITS.md`.
- [ ] Final review of the whole diff against `main`; fix the findings.
- [ ] Draft pull request with tour images.
