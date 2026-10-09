# Wander

A small hooded figure lives in your terminal. Its face is darkness; only its eyes glow. It lives in a hollow at the foot of a great tree, deep in a dim forest where the day never quite arrives, teal by day and violet by night: ferns and undergrowth thick on the ground, a pale glow far off between the trees, glowing mushrooms, mist, hares and a deer by day, bats, fireflies and an owl by night, and now and then a pair of eyes watching from the canopy. It is all drawn in pixel art, two square pixels to a terminal cell. Its eyes, its lantern and a few embers are the only warm lights. (A meadow, a tundra and a swamp exist too, with `--biome`.) It goes about its own life there: it forages, digs for treasures, stacks stones, chases butterflies, watches the stars, hides from the rain, and sleeps at night. Now and then it turns to you, the one beyond the glass.

## Run

Needs Node 25 or newer and a terminal with true colour. The scene is drawn for about 120 by 36 cells or more; it still works down to 50 by 16.

```bash
node src/main.ts
```

The first time, a wisp drifts in, becomes the figure, and asks what to call you. After that it is saved, and its life goes on while the game is closed: open it the next day and it will have slept, foraged and maybe found something, and it will know how long you were gone. Left alone for days, it gets lonely and goes wandering, and comes back when you do. It never dies.

Time is real: night falls when it is night where you are, the moon is in today's phase, and the season is today's.

## You and it

| Key | Does |
|---|---|
| F | Drop food near it; it decides whether it wants it |
| P | Throw a glowing toy; it may chase it |
| E or Space | Pet it, take a gift it offers, or wake it (it may grumble) |
| T or Enter | Talk to it: type, Enter sends, Esc cancels |
| Y / N | Answer when it asks you something |
| J | Its journal: diary, finds, gifts, what it knows about you |
| H | Hide or show the bars |
| Q, Esc, Ctrl-C | Leave (it is saved) |

With the mouse, its eyes follow the pointer, a click on it pets it, and a click on the ground makes it go and look. When you come back to the window after a while, it notices.

It comes to you too: to say hello, to bring you something it found, to ask you a question, or to tap on the glass when you have been away too long.

## Its own mind

Its behaviour is never scripted. A small brain runs all the time, with no network: it has needs (food, rest, fun, love), a personality fixed at birth (curious, playful, shy, lazy, night owl, rain lover), moods and a bond with you. Every activity scores itself from those, the time, the weather and what is in the scene, and the next one is picked at random, weighted by the scores. It acts for reasons, but you can never be sure what it will do next.

Its words can come from Claude. Install the SDK once and give it credentials:

```bash
npm install
export ANTHROPIC_API_KEY=...
node src/main.ts
```

The status bar then says `mind: claude`. Claude speaks for it when it greets you, visits, offers a gift, thinks aloud, and whenever you talk to it. Claude can also choose what it does next (ask it to dance), and remembers things you tell it. Without credentials, or with `--offline`, a local voice speaks instead and the bar says `mind: local`.

What goes to Anthropic: what you type to it, its name and personality, its needs and mood, the time and weather, recent diary lines, and the facts it remembers about you. Unprompted lines are asked for at most once every 150 seconds, and only while you are at the window. The model is `claude-opus-5-5`; `WANDER_MODEL=claude-haiku-5-5` (or any other) changes it.

## Options

| Option | Does |
|---|---|
| `--biome NAME` | `forest` (the default), `meadow`, `tundra` or `swamp`; for an existing creature, it moves |
| `--name NAME` | Names a new creature |
| `--seed N` | A new creature from this seed (any word works) |
| `--new` | Starts over; the old creature is kept as `creature.json.bak` |
| `--offline` | Never calls Claude |
| `--bell` | Rings the terminal bell when it taps on the glass while you are in another window |
| `--speed N` | The world runs N times faster (a day in under 2 minutes at 1000). Not saved. |
| `--hour H` | Starts at hour H of today. Not saved. |
| `--save PATH` | Uses another save file (and saves even with `--speed` or `--hour`) |

The save file is `~/.local/share/wander/creature.json` (or under `$XDG_DATA_HOME`).

Wander is made for [Ghostty](https://ghostty.org), and works in any terminal with 24-bit colour, mouse reporting and a font with box-drawing characters.

## Develop

```bash
node --test
node src/main.ts --bench --size 160x48
```

The bench draws a rainy night with the lantern lit and prints milliseconds and bytes per frame.

Everything tunable lives in `src/config.ts`: needs and how fast they drain, the brain's temperature and whims, cooldowns, the Claude settings, and each biome's ground, ridge, props, critters, finds and gloom. Each biome's palette is in `src/palette.ts`.

### Art

The creature and the forest are drawn by hand in [Aseprite](https://www.aseprite.org): the files in `art/` are the source, every one in indexed colour in the one palette of `art/palette.gpl`. Some of its colours are roles the game paints as it draws: the cloak, the mood in the eyes, embers that glow only at night, the colour of a critter or a find; colours named `glow …` are not darkened by the night. The four named `glow cycle 1` to `4` take four colours in turn, each a step behind the one before (colour cycling, as Mark Ferrari did it): pixels painted with them glint or shimmer with nothing moving, as the spots on the mushrooms do. Frames are named by their tags; slices mark anchors (the shelter's `door` and `smoke`). After changing a file, export it:

```bash
npm run art        # aseprite -b --script tools/export-art.lua
```

This writes `src/sprites.json`, which is all the game reads: it needs no Aseprite to run. `src/sprites.ts` loads it. The creature's frames are put together in `src/figure.ts`, props and shelters in `src/scenery.ts`, the glow, far trunks and forest floor in `src/backdrop.ts`, and the frame of trunks and canopy round the scene in `src/surround.ts`. The meadow, tundra and swamp are still drawn from shapes with the pixel kit in `src/kit.ts`.

The design is in `docs/superpowers/specs/2026-10-08-wander-creature-design.md`. The earlier Wander, a landscape you walk through (with real places from OpenStreetMap), is on the `feat/real-world` branch.
