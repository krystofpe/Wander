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

## Next

- Research (8 parallel agents) → docs/research/wanderer-research.md.

## Open problems

- Branch deletion needs the owner (above).
- No `ANTHROPIC_API_KEY` in this environment: the Claude path is tested against a local mock of the Messages API through the real SDK (`ANTHROPIC_BASE_URL`).

## Visual flaws still to fix

(none yet)
