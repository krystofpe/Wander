# Measurements

All on this machine (RTX 4070, Chromium 152 on the GPU through ANGLE/Vulkan, headless), on the final code.

## Bench (`bench.json`)

`npm run bench -- --seconds 30`: four scenes (golden hour in the pine forest, a storm at dusk on the meadow, a
night camp by the fire, a fast walk that streams chunks in quickly), 30 s each, at 1920×1080 and 3840×2160.
Every run: 60 fps, frame interval p50 16.7 ms and p99 16.8 ms; one frame late (33 ms) in 14 400. GPU time per
frame (timer queries) p50 3–12 ms, p99 under 18 ms; CPU p50 0.2 ms.

## Fast soak (`fast-48h.json`)

`npm run soak -- --speed 16 --hours 48 --every 30`: 48 in-world hours, no errors. JS heap (after a collection)
23.4–26.4 MB with no upward trend, ending at 24.9 MB; GPU textures 48 (52.16 MB), buffers 11, framebuffers 16,
constant; frame interval p50 16.7 / p99 16.8 ms in every sample.

## Two real hours at normal speed (`normal-2h.json`)

`npm run soak -- --minutes 122 --every 60 --hidden 20`: 122 minutes at speed 1, 48.4 in-world hours, 2.8 km, no
errors.

- **Hidden for the first 20 minutes** (the document reports `hidden` and animation frames wait, as in a minimised
  window): 9 frames drawn, yet he walked on 370 m and 477 footsteps sounded. The worker clock keeps his life and
  the sound going.
- **Frame interval**, once shown: p50 16.7 / p99 16.8 ms in every minute. (The one interval of 1 200 102 ms in the
  file is the gap over the hidden 20 minutes, the first frame after showing; the probe no longer counts pauses
  over a second as frames.)
- **GPU**: 48 textures (52.16 MB), 11 buffers, 16 framebuffers in every sample.
- **JS heap**: 20.9 → 27.1 MB through the first hour while the bounded caches fill as he walks into new places
  (plant stamps ≤ 1 200 entries, halved when full; spots ≤ 257; stretches ≤ 4 097; plucked notes ≤ 40 buffers; log
  ≤ 500), then a band of 26.2–28.2 MB through the second hour, dropping when the stamp cache evicts (minute 101).

## End to end (`check.txt`)

`npm run check`, through the real `npm start` server and a headless page: offline (`mind: local`), saving,
reopening the same road, three hours away (6.7 km walked on, the clock 72 world hours on, the places logged),
Claude through the real SDK against a stand-in Messages API (`mind: claude`, the request's model, output format and
beta header checked), and a slow (60 s), failing (500) and refused (401) API, each answered by his own voice while
the page kept 60 fps. 13/13.

## Motion (`motion-slits.png`)

`npm run motion`: 240 frames exactly 1/60 s apart across a biome border at speed 4, slit-scans at four heights
(sky, the tree line, his feet, the foreground). Every layer draws clean straight diagonals at its own slope: no
steps, kinks or popping.

## npm start (`npm-start-fullscreen.png`)

`npm start` on this desktop (Hyprland, 2560×1440): Chromium in app mode, which the compositor reports as
fullscreen, unattended, in a storm over the ruins. Closing the window stops the server; the road was saved three
seconds before.
