# Wander, the wanderer: progress

The brief is `~/wander-ambient-prompt.md`. Read this file first after a restart, then carry on from "Next".

## Definition of done

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | `main` is the old `feat/creature`; only `main` and `feat/wanderer` exist locally and on origin | partly: main fast-forwarded to cc5acf5 and pushed; branch deletion blocked by the permission classifier, left to the owner | see "Branch cleanup" |
| 2 | Research doc with real sources; spec shows how they shaped choices | in progress | |
| 3 | `npm start` full screen, unattended; 30 min shows 3 biomes blend, sunset, night camp with fire, rain or fog, sit and smoke; sound follows | | |
| 4 | Tour at 1080p and 4K, every biome/blend/hour/weather beautiful; docs/tour committed; README shows the best | | |
| 5 | Smooth motion: no shimmer, jitter or popping | | |
| 6 | Steady 60 fps at 1080p and 4K, in-page bench p50/p99 | | |
| 7 | Soaks: 48 in-world h at speed; 2 real h at normal speed in background; heap/GPU/frame time flat | | |
| 8 | Same seed + distance → same place (tested) | | |
| 9 | Close and reopen continues; time away moves him on | | |
| 10 | Offline works (`mind: local`); with a key, Claude thoughts and `mind: claude`; slow API never blocks | | |
| 11 | Terminal and Tamagotchi code gone; `npm test` green; README rewritten; docs/CREDITS.md | | |
| 12 | Final review of the whole diff against main, findings fixed | | |
| 13 | Draft PR from feat/wanderer into main | | |

## Branch cleanup (2026-10-09)

- Checks passed: tree clean except `.claude/`; `main` and `feat/real-world` are ancestors of `feat/creature`.
- `git fetch` showed two more remote branches the brief did not mention: `origin/feat/first-version` (an ancestor of main, nothing to lose) and `origin/feat/dark-look` (7 commits found nowhere else: an abandoned "dark look" direction from 2026-10-08). Those commits are kept as the annotated tag `archive/dark-look`, pushed to origin.
- `main` fast-forwarded to `cc5acf5` (the old `feat/creature`) and pushed. `feat/wanderer` cut from it.
- Deleting branches (`git branch -d`, `git push origin --delete`) was refused twice by Claude Code's auto-mode permission classifier ("Git Destructive"), even for exactly the two branches the brief names. Per its instructions it is not retried any other way. Left for the owner:

  ```bash
  git branch -d feat/creature feat/real-world
  git push origin --delete feat/creature feat/real-world feat/first-version feat/dark-look
  git fetch --prune && git branch -a
  ```

## Done

- Branch cleanup as far as permitted (above).
- M1: research (8 areas, 3.8k lines, 371 source lines), spec, plan: committed and pushed.
- Pure core with tests: world (stretches, climate-picked biomes, blends, ground, landmarks), sky (warped clock,
  sun/moon, weather), brain, local voice, options, palette (roles, Oklab grading by elevation, haze), noise
  (SquirrelNoise5, lattice noise). Old terminal and Tamagotchi code deleted.
- M2 eyes: server (stripped TS, journey/thought API), headless GPU session (playwright-core, `--use-angle=vulkan`),
  `npm run shot`, `npm run sheet` (contact sheets at native 1:1), `npm run motion` (frames 1/60 s apart, slit-scans).
- M3 slice: renderer (ring textures, chunk streaming, palette rows, native resolve per layer, full-res composite with
  per-layer fractional offsets and d7samurai sampling, smooth HD sky with pixel sun, moon in phase and stars, final
  pass with vignette, grain and dither); painters for land (per-biome landforms and crowns), tree layers, playfield,
  foreground; plants (conifers, space-colonisation crowns, L-system dead trees, cacti, bushes, tufts, reeds, rocks);
  the wanderer drawn by hand in parts (8-frame walk, stand, look, smoke), Aseprite pipeline (art:draw → art), indexed
  atlas decoded in the browser.

## Next

- Commit the vertical slice; then clouds and fog sheets; the brain + walker in the page (stops, sit, smoke, camp).

## Open problems

- Branch deletion needs the owner (above).
- No `ANTHROPIC_API_KEY` in this environment: the Claude path is tested against a local mock of the Messages API through the real SDK (`ANTHROPIC_BASE_URL`).

## Visual flaws still to fix

Log of looks (before → after):

- 2026-10-10 first frame: stacked horizontal stripes, noisy dithered sky, speckled ground, no value structure →
  per-biome landforms, Ferrari-banded sky (later replaced), banded ground plane.
- Hours sheet 1: far mountain brightest and flattest (haze σ≈0.2 → 98% fog), night land lighter than sky, banded glow
  lobe drew a giant ellipse, forest unlit at golden hour → σ≈0.05, darker night fog, smooth full-res sky (research:
  edgeless light at full res), sun-aware haze, stronger warm key light.
- Pine sheet: even wall of same-sized pines → groves and clearings, varied sizes; dotted crown rims removed; land rim
  softened.

Still open:
- Tree-layer banks still read as stripes in open biomes (meadow, desert, coast, stones, pass); land rim lines stack.
- Meadow oaks look like lollipops (crowns too small and round).
- Coast: the sea is a thin band. Swamp: no water yet.
- Pass: the ridged zig-zags repeat like a pattern; rocks look like boxes.
- Night may be too dark to read in the forest; check against the research (two stops under day).
- He is small and dark; rim light not yet visible; pack still boxy.
- No clouds yet; the noon sky is bland.
