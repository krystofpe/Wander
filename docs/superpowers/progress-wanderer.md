# Wander, the wanderer: progress

The brief is `~/wander-ambient-prompt.md`. Read this file first after a restart, then carry on from "Next".

## Definition of done

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | `main` is the old `feat/creature`; only `main` and `feat/wanderer` exist locally and on origin | partly: main fast-forwarded to cc5acf5 and pushed; branch deletion refused by the permission classifier, left to the owner | see "Branch cleanup" |
| 2 | Research doc with real sources; spec shows how they shaped choices | done | docs/research/wanderer-research.md; spec cites R: sections in its choices table |
| 3 | `npm start` full screen, unattended; 30 min shows 3 biomes blend, sunset, night camp with fire, rain or fog, sit and smoke; sound follows | done | docs/watch/ (README there); docs/soak/npm-start-fullscreen.png |
| 4 | Tour at 1080p and 4K, every biome/blend/hour/weather beautiful; docs/tour committed; README shows the best | done | docs/tour/ (155 frames, sheets), README gallery; looked at every sheet, fixed coast, swamp, plateau, stones, blends, fog, fox, deer |
| 5 | Smooth motion: no shimmer, jitter or popping | done | docs/soak/motion-slits.png: 240 frames 1/60 s apart across a border, clean diagonals |
| 6 | Steady 60 fps at 1080p and 4K, in-page bench p50/p99 | done | docs/soak/bench.json: 8 runs × 30 s, interval p50 16.7 / p99 16.8 ms, 1 late frame in 14 400 |
| 7 | Soaks: 48 in-world h at speed; 2 real h at normal speed in background; heap/GPU/frame time flat | fast done; 2 h running on the final code | docs/soak/fast-48h.json; docs/soak/normal-2h.json |
| 8 | Same seed + distance → same place (tested) | done | test/world.test.ts, test/landmarks.test.ts |
| 9 | Close and reopen continues; time away moves him on | done | `npm run check` (docs/soak/check.txt), test/journal.test.ts |
| 10 | Offline works (`mind: local`); with a key, Claude thoughts and `mind: claude`; slow API never blocks | done | `npm run check`: local, claude through the real SDK to a stand-in API, slow/500/401 fall back at 60 fps |
| 11 | Terminal and Tamagotchi code gone; `npm test` green; README rewritten; docs/CREDITS.md | done | 82 tests pass; README.md; docs/CREDITS.md |
| 12 | Final review of the whole diff against main, findings fixed | done | fresh-eye review, 19 findings, fixed in 437548e |
| 13 | Draft PR from feat/wanderer into main | done | https://github.com/krystofpe/Wander/pull/1 (draft) |

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
  pass with vignette, grain and dither); painters for land, tree layers, playfield, foreground; plants; the wanderer
  drawn by hand in parts; Aseprite pipeline; indexed atlas decoded in the browser.
- M4–M6 (5b86c6e, 41309f6): his life on the road (life.ts: stops, sitting and smoking, camp from dusk to dawn with a
  fire, lying, sleeping, packing), real light (fire and ember light rings with Quake flicker, bloom from emissive).
- M7 (1bf56b0): every biome reads as itself (rims only on crests, banks only under woods, lit faces, real sea).
- M8 (46ffc40): weather in the air: cumulus and overcast clouds catching the sunset, fog veils, rain and snow at
  three depths, lightning.
- M9 (7e0116b): `npm start` (server, Chromium app full screen, watchdog), the saved road with time away, thoughts
  from Claude (server, SDK, structured output, timeouts, fallback) or the local voice, the bar (H) and log (L).
- M10 (44297ce): sound, all synthesised (web/audio): wind body/trees/whistles/leaf ticks from one gust signal, rain
  bed/boil/drops by surface, waves, crickets by Dolbear's law, birds (FM syllable songs, dawn chorus), owl, a far
  train, thunder rendered per flash, footsteps by ground on the walk cycle's contacts, lighter/drag/exhale, the fire
  (lapping, hiss, crackles), generative music (incommensurable loops, KS plucks, FM bells, pads, drone, motifs).
  Worker clock keeps life and sound going in a hidden window. `npm run listen` records and measures it.
  Measured (15 s clips, EBU R128): birch dawn −33 LUFS, night meadow −32, coast −30, camp with fire −27,
  pine rain −23, pass in wind −24, coast storm −20 (peak −4.6 dBFS).

- M11 (59182b2): landmarks (11 kinds, each on the layer that suits its size; lit window, chimney smoke, mast lamp,
  lighthouse flash, a distant train with its sound), life (flock, bats, fireflies, deer, fox, fish, leaves), Milky
  Way, aurora, shooting stars; snow caps in planes; storm deck over the whole sky; night rim on him; finer fog dither.
- M12 (eabae55): `npm run tour` (147 frames: 14 biomes × 6 times, 12 blends, 16 weathers, 10 poses, 11 landmarks,
  7 life, 7 at 4K; JPEG q90 4:4:4 in docs/tour, PNG in tour-png/), `npm run bench`, `npm run soak`, `npm run watch`;
  swamp pools, stones/plateau flora, sparser crowns on hills, fox/deer readable, lighter fog.
- Bench (10 s per scene, first run): 1080p and 4K, 4 scenes, all 60 fps, interval p50 16.7 / p99 16.8 ms, 0 late.

## Next

1. Wait for the 2-hour soak (docs/soak/normal-2h.json) and the fast soak on the final code; commit them; put the
   numbers in the README and the PR.
2. The final report.

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
