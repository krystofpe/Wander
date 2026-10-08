# Wander, reworked: a creature in a diorama

2026-10-08 · Asked for in one message; the choices below were made without a back-and-forth and are listed so they can be overruled.

Wander stops being a landscape you walk through and becomes a small living scene in your terminal. A hooded figure lives in it, in the spirit of a Tamagotchi or the Flipper Zero dolphin. It goes about its own life, and now and then it turns to the one beyond the glass: you.

## 1. Intent

**Asked for:**

- a terminal game in which a mysterious figure lives its life in a biome, room or scene;
- it sometimes interacts with the user who started the game;
- everything drawn in ASCII art;
- behaviour driven by "its own AI", so that it is unpredictable.

**Chosen here:**

| Question | Answer |
|---|---|
| The figure | A small hooded wanderer whose face is darkness. Only its eyes show, and they glow. Their shape and colour carry its mood. It carries a lantern at night. |
| The view | A side-on diorama: sky, a distant ridge, ground, props and the creature, in coloured text. |
| Biomes | Forest, meadow, shore, tundra, desert and swamp, each with its own palette, ridge, plants, home, critters, food and finds. Chosen from the seed, or with `--biome`. |
| Time | The real local clock. Day and night, the moon's phase and the season are today's. The creature ages in real days. |
| Persistence | The creature is saved, and life goes on while the game is closed. The next start catches up on the time away, and it remembers how long you were gone. |
| "Its own AI" | Two layers. A **brain** always runs locally: needs, a seeded personality, a utility score for every activity and a weighted random pick, so it acts with reason but never on a script. An optional **voice** is Claude: with Anthropic credentials and the SDK installed, its words come from Claude, and so do its answers when you talk to it. Claude may also choose what it does next. Without either, a local phrase generator speaks for it. |
| Gentle | It never dies. Neglected, it gets lonely, and after days alone it goes wandering, then comes back when you return. |
| Old code | The walking world (`world`, `realworld`, `osm`, `net`, `png`, `geo`, `place`, `player`) is removed on this branch and stays on `feat/real-world`. The engine is kept: frame buffer, screen diff, terminal restore, seeded noise and the sunlight table. |

**Done means:**

1. `node src/main.ts` opens a scene with a creature that visibly lives (it walks, sits, eats, plays, sleeps and reacts) with no input at all.
2. Feeding, playing, petting, talking and the journal all work from the keyboard, and the mouse can pet it.
3. Quitting and restarting keeps the same creature and catches up on the time in between.
4. Without credentials everything works and the status bar says `mind: local`. With them it says `mind: claude`, and replies come from Claude.
5. The terminal is restored on every exit path, as before.
6. `node --test` passes.

## 2. What you see

```
          *            .                ◑          ·
   .           ·                *
  ▲▲▲     ▲▲▲▲▲▲      ▲▲▲          ▲▲▲▲▲      ▲▲▲▲▲▲▲
,  %%&%%     ,     .      /\     ╭──────────────────╮   ,
 %&%%&%%&%   '       ,   /  \    │ The moon is thin │
%%&%%%&%%&%     /^\     /____\   │ tonight.         │
 %&%%&%&%%     /• •\¤   | __ |   ╰─────┬────────────╯
   %%|%%  ,    |   |    ||  ||         ╵      .   ,(~~~~~~)
     |     .   /___\  ,       .    '       ,    (~~~~~~~~~)
Ulo · 3 days · content │ food ■■■■· rest ■■■·· fun ■■··· bond ■■■■· │ 21:14 night · clear │ mind: local
F feed  P play  E pet  T talk  J journal  H hide  Q quit
```

- **Sky:** a colour gradient by hour, the sun on an arc by day, the moon in today's phase by night, twinkling stars, drifting clouds, rain or snow, and a lightning flash in storms. Tundra nights get an aurora.
- **Ridge:** one or two layers of distant mountains, hills, dunes or sea, hazier further back.
- **Ground:** biome texture glyphs; grass sways in the wind. Props stand at different depths and are drawn back to front: trees, pines, bushes with berries, rocks, a pond, cacti, reeds and the creature's home.
- **Seasons** follow the date: autumn leaves turn orange and fall, winter brings snow on the ground and snow instead of rain, spring has flowers.
- **Light:** every colour is multiplied by the sunlight for the hour, and dimmed by cloud and rain. At night the creature's lantern casts a warm pool of light. Its eyes, the lantern, stars, fireflies and the moon glow on their own.

## 3. The creature

### Body

A sprite 7 columns wide and 4 rows tall, mirrored when it faces left. Poses are stand, walk (two frames), sit, sleep, jump, wave, dig and eat. The face is three cells of darkness with two glowing eyes:

| Eyes | Meaning | Eyes | Meaning |
|---|---|---|---|
| `• •` | looking at you | `•• ` / ` ••` | glancing left / right |
| `° °` | looking up | `. .` | looking down |
| `^ ^` | happy | `- -` | asleep |
| `‿ ‿` | sleepy, content | `o o` | surprised |
| `╥ ╥` | sad | `> <` | annoyed |
| `♥ ♥` | love | `? ?` | puzzled |

Eye colour follows mood: warm yellow when content, pink in love, blue when sad, red-orange when grumpy, cyan when curious, dim amber when sleepy. While the mouse moves over the window, the eyes follow the pointer.

### Life (saved)

| Field | What it is |
|---|---|
| name | from the seed, or `--name` when it is born |
| biome | where it lives |
| born | epoch ms; its age in days is shown |
| needs | food, rest, fun and love, each 0–1 where 1 is satisfied |
| bond | 0–1, how much it trusts you |
| traits | seeded once: curious, playful, shy, lazy, night owl, rain lover (0–1 each) |
| diary | notable moments with timestamps, shown in the journal |
| found / shelf | things it has found; things it gave you |
| facts | what it knows about you, from questions and talk |
| your name | asked at the first meeting; otherwise your login name |

**Needs** drain in world time. While awake, food empties in about 6 h, rest in 16 h, fun in 3 h and love in 5 h. Asleep, they drain at 40% speed while rest refills in about 6 h. It feeds and amuses itself partly (foraging up to 60%, playing alone up to 55%). Only you fill love fully, and you raise bond.

**Mood** comes from the lowest need, the time of day and recent events (petted, fed, startled). Mood names: joyful, content, calm, curious, sleepy, hungry, bored, lonely, grumpy, scared.

### Brain

Every activity has a utility score from needs, traits, time, weather, what is in the scene and how recently it was done. The brain picks the next activity at random, weighted by `exp(score / temperature)`. Now and then (8% of picks) it follows a whim and picks any possible activity. Cooldowns stop the social ones from repeating too often.

| Activity | Drawn by |
|---|---|
| idle, stroll, sit | always possible; laziness, curiosity |
| forage | hunger; walks to the biome's food source |
| eat | food you dropped |
| drink | the pond or sea |
| chase | a toy you threw, or a critter |
| play | hop and spin alone when bored |
| nap, sleep | low rest; night (shifted by the night-owl trait). It sleeps at home, and its closed eyes show in the dark doorway. |
| shelter / rain dance | rain, against or with the rain-lover trait |
| stargaze | clear nights |
| ponder | curiosity; a thought bubble |
| dig | curiosity; sometimes finds something |
| hum | contentment; music notes |
| stack | adds a stone to its cairn, which stays between visits |
| visit | low love and high bond: it comes to the front, looks at you and speaks |
| knock | you have been idle or away from the window for a long time: it taps on the glass |
| gift | it holds a find and trusts you: it brings it to the front and offers it (E takes it) |
| ask | curiosity and bond: it asks a yes/no question and remembers the answer |
| hide | shyness, low bond, or a fright (thunder, petting too much) |
| wander off | rare; it leaves the scene for a few minutes and comes back with a find and a story |

Each activity is a short script (a generator stepped every frame): walk somewhere, take a pose for a while, change needs, say something. A user action or a change in the world interrupts the script. Food landing, a toy, rain starting, a petting or being spoken to all trigger a fresh pick, with the new thing in the scores.

### Voice

Speech appears in a bubble above it. Lines come from:

- **Claude**, when available, for the moments that matter: answering you, greeting you on return, visiting, offering a gift, asking a question, and an occasional thought. The request carries the creature's personality, needs, mood, bond, the time, weather, recent diary entries, facts about you and the last few exchanges. The reply is structured JSON: `{say, do, remember}`.
  - `do` names an activity, which the brain then runs next.
  - `remember` stores a fact about you.
  - Spontaneous Claude lines are rate-limited (at most one per 150 s) and are only requested while you are present (input in the last 5 minutes, window focused).
- **The local voice** otherwise, and whenever Claude fails or times out. It uses templated lines per situation and mood, filled with names, times and items. Talking to it locally uses keyword intents (greeting, food, play, sleep, come, dance, name, who are you, `my name is …`, and a cryptic default). A few Czech greetings are understood.

The model is `claude-opus-5-5` at `low` effort with the server-side refusal fallback. `WANDER_MODEL` changes the model.

## 4. You

| Key | Does |
|---|---|
| F | Drop food near it; it decides whether it wants it |
| P | Throw a glowing toy; it may chase it |
| E or Space | Pet it; accept a gift; wake it (it may be grumpy) |
| T or Enter | Talk: type a line, Enter sends, Esc cancels |
| Y / N | Answer its question |
| J | Journal: age, traits, mood, diary, finds, gifts, what it knows about you |
| H | Hide or show the status bar and hints |
| Q, Esc, Ctrl-C | Quit (it is saved) |
| Mouse | Its eyes follow the pointer; clicking it pets it; clicking the ground makes it go and look (more often the closer you are) |

The terminal reports focus. When you come back to the window after a while, it notices.

**First meeting:** a wisp of light drifts in and becomes the figure. It looks at you and asks what to call you, and the talk prompt opens.

## 5. Time away

On start, the time since the last save (up to 14 days) is simulated in 15-minute steps:

- it sleeps at night, so rest refills;
- needs drain;
- it forages and amuses itself;
- rare events (finds, storms, shooting stars) go into the diary.

After more than 2 days without you, with love low, it has gone wandering: the scene starts empty, and it walks in a few seconds later. The greeting depends on how long you were gone and on the bond.

## 6. How it's built

TypeScript on Node 25, run directly. The SDK `@anthropic-ai/sdk` is the only dependency. It is imported lazily, so the game runs without `npm install`; you only need it for the Claude voice.

```
src/
  main.ts       arguments, the 30 Hz loop, saving on every exit path
  game.ts       options, modes (live, intro, talk, question, journal), input → actions, the bench
  creature.ts   Life: needs, traits, mood, names, diary
  brain.ts      activities, scores, weighted pick, scripts, interrupts
  speech.ts     local lines, templates, local talk replies, questions
  mind.ts       the Claude voice: prompts, structured replies, rate limit, fallback
  scene.ts      biome layout, food, toy, critters, particles
  sky.ts        clock, sunlight, sky colours, moon phase, season, weather, wind
  art.ts        sprites (creature poses, props, homes, critters) and drawing them
  render.ts     the frame: sky, ridge, ground, props, creature, weather, light, bubble, status bar, journal
  color.ts      blending, scaling and rounding colours
  save.ts       load and save (atomic), catching up on time away
  input.ts      keys, text entry, SGR mouse, focus events
  terminal.ts   full screen, mouse and focus reporting, restore
  frame.ts, screen.ts, noise.ts   unchanged from Wander
  config.ts     every tunable: rates, brain, palettes, biomes, AI
```

**Two clocks**, as before:

- *World time* drives the hour, weather, needs and age. It is the real clock, or runs faster with `--speed N` for demos.
- *Real time* drives animation: walking, particles, waves, twinkles. A creature at `--speed 600` still walks at its normal pace.

**Weather** is a pure function of world time and seed. Time is cut into 25-minute slots, and each slot gets cloud cover and a chance of rain or snow from a hash; the biome sets that chance. It fades between slots. Restarting shows the same weather.

**Frames:** 30 per second. Frames are diffed as before, and colours are rounded to 32 levels. The scenery's own motion (grass, stars, water, the lantern's flicker) steps at 8 Hz. Clouds have four density levels and drift in half-second steps. The creature, particles and rain move every frame. Together this keeps a quiet scene to about 25–60 KB of output per second.

**Claude requests** go out one at a time, in order. A volunteered line is skipped while another request is out, and an answer to you waits its turn. The history is plain text (no thinking blocks), so trimming it from the front is safe.

**Save file:** `$XDG_DATA_HOME/wander/creature.json` (default `~/.local/share/wander/`), or `--save PATH`. It is written atomically (temp file and rename) every 60 s and on exit. `--new` starts a new creature and keeps the old file as `.bak`.

**Options:** `--biome NAME`, `--name NAME` (new creature only), `--speed N`, `--offline` (never call Claude), `--seed N` (for a new creature), `--save PATH`, `--new`, `--bench [--size WxH] [--frames N]`.
