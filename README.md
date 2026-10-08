# Wander

Walk through an endless landscape drawn in coloured text, at 60 frames per second, in your terminal.

## Run

Needs Node 25 or newer. There is nothing to install.

```bash
node src/main.ts
```

`--seed 42` (or any word) brings the same world back; the seed is shown in the status bar. `--name Elowen` sets the name above your figure; without it, your login name is used.

The map is drawn as coloured glyphs on black. Grass is blades that lean with the wind and part around you as you walk; the view is lit around you and fades to black at the edges.

Wander is made for [Ghostty](https://ghostty.org). Ghostty reports when keys are held and released, so movement is smooth. Other terminals work too, but movement follows ordinary key repeat.

## Keys

| Key | Does |
|---|---|
| W A S D or arrows | Move; hold two for a diagonal |
| Shift, held | Run |
| T, held | Time-lapse: the clock and the weather run 20× faster |
| H | Show or hide the status bar |
| Q, Esc, Ctrl-C | Quit |

## Develop

```bash
node --test
```

```bash
node src/main.ts --bench --size 200x60
```

The bench walks a fixed route at 10:00 in the rain and prints milliseconds and bytes per frame.

Everything tunable lives in `src/config.ts`:

- speeds;
- day length;
- weather;
- the terrain recipe;
- each biome's characters and colours.

The design is in `docs/superpowers/specs/2026-10-08-wander-design.md`.
