# Credits

Everything you see and hear in Wander is made by this project, except what is listed here.

## Assets from outside

| Asset | Where it is | Author | Licence | Source |
|---|---|---|---|---|
| Alegreya Italic (the font of his thoughts) | `web/fonts/Alegreya-Italic.ttf`, licence text beside it in `web/fonts/Alegreya-OFL.txt` | Juan Pablo del Peral, Huerta Tipográfica (The Alegreya Project Authors) | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/alegreya |

That is the only outside asset. In particular:

- **Pixel art.** The wanderer, the fire, the animals, the train and the lamps are drawn by hand as character grids in `tools/art/sprites/` and built into Aseprite files (`art/*.aseprite`) and the atlas (`assets/atlas.png`, `assets/atlas.json`) by `npm run art:draw` and `npm run art`. The land, trees, rocks, clouds, water, landmarks and sky are generated in code (`src/paint/`, `web/shaders.ts`).
- **Sound.** There are no recordings. Every sound is synthesised at run time with the Web Audio API (`web/audio/`). Several recipes follow the published designs of Andy Farnell's *Designing Sound* (MIT Press), whose companion Pure Data patches were studied and reimplemented, not copied; the research document cites each one.
- **Words.** His local voice (`src/thoughts.ts`) is written for this project. With an Anthropic API key his thoughts come from Claude.

## Software

| Package | Used for | Licence |
|---|---|---|
| `@anthropic-ai/sdk` | the server's calls to Claude for his thoughts | MIT |
| `playwright-core` (development only) | driving headless Chromium for the shot, tour, motion, listen, watch, bench and soak tools | Apache-2.0 |

At run time Wander also uses Node.js and a Chromium-based browser installed on the machine; neither is distributed with it.

## Research

The design leans on many talks, articles, patches and papers. They are cited where they are used, in `docs/research/wanderer-research.md`.
