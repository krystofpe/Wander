# The creature, in the wanderer's art

The owner asked (2026-10-10) to rework `feat/creature`, the terminal diorama of a small hooded creature, in the style of the wanderer: in the browser on the wanderer's engine, alongside him on `main` (`npm start` the wanderer, `npm run creature` the creature), with everything the terminal creature had.

## What carries over unchanged, and what is new

| From `feat/creature` | Here |
|---|---|
| `creature.ts`: the life, needs, moods, traits, bond, diary, facts | `src/creature/life.ts`, as it was |
| `brain.ts`: activities and reactions as generator scripts, the weighted pick | `src/creature/brain.ts`; walking in native pixels instead of terminal columns, particles as sprites instead of glyphs |
| `scene.ts`: layout round its home, food, the toy, critters, particles | `src/creature/scene.ts`; a depth band below the walk line instead of terminal rows |
| `speech.ts`, `visitor.ts` | `src/creature/`, as they were |
| `sky.ts`: real local time, season, moon, the weather in slots per biome | `src/creature/sky.ts`; the light itself now comes from the wanderer's grading with the natural sun |
| `save.ts`: revive (old saves keep working, Ori from the shore moves to the forest), catch-up while away | `src/creature/save.ts` (pure) + `server/creature.ts` (the file) |
| `mind.ts`: Claude's words and choices, history, rate limit | `server/creature-mind.ts`, behind `POST /api/creature/say` |
| `game.ts`: input → actions, the bubble, offers, questions, talk, the journal | `web/creature/main.ts` + `web/creature/ui.ts` (DOM: bubble, bar, hints, journal, talk box) |
| Terminal drawing: `render.ts`, `backdrop.ts`, `scenery.ts`, `surround.ts`, `kit.ts`, `figure.ts`, art at two pixels a cell | Gone. The wanderer's renderer draws the far land, the trees, the ground, sky, weather, fog, light; new hand-drawn HD sprites draw the creature, its great tree and hollow, the props, food, toy, critters, icons |

## Decisions

- **The scene.** A fixed camera on the wanderer's world, at a stretch of the creature's biome (forest → pine, meadow, tundra, swamp) chosen from its seed, away from landmarks. The far layers, the trees and the ground are the wanderer's own; the creature lives on the ground layer's playfield, in a depth band from the walk line (back) to about 30 px below it (front, "at the glass"). Sprites are sorted by depth.
- **Its look.** About 20 px tall at 640×360 (he is 32): a round hooded figure, face darkness, two glowing eyes. Its cloak colour comes from its seed (six cloaks, as before); its eyes glow by mood (as before: warm content, bright joy, cyan curious, blue lonely, red grumpy, pink love…). Both by a per-sprite role swap in the sprite shader, so one sheet serves every creature and mood.
- **Time.** Real local time, as before, with the natural sun (the wanderer's real-clock mode); `--speed` and `--hour` for looking, not saved.
- **Its words.** Claude through the server when there are credentials (`claude-opus-5-5`, structured reply `{say, do, remember}`, server-side fallback), its own local voice otherwise; `mind: claude` or `mind: local` in the bar, as before.
- **Sound.** The wanderer's ambience and music for its biome, its own small steps. (The terminal creature had none.)
- **Saving.** The same file as before, `~/.local/share/wander/creature.json`, so a creature from the terminal days lives on.

## Steps

1. Engine: split the wanderer's stage into the sky and air (shared) and his drawing; a role swap per sprite.
2. Palette roles for cloaks, mood eyes and the creature's things; the art: the creature, the great tree, props, items, icons, critters.
3. The pure logic ported, with its tests.
4. The server: the creature's store, mind and routes; `npm run creature`.
5. The page: the hollow stage, input, the bubble and the bars, the journal, talking, sound.
6. Tools and proof: a tour of the hollow, an end-to-end check (save, reopen, time away, Claude through a stand-in API), the bench; README; a PR.
