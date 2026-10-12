# Wisp journey prototype

Branch: `feat/wisp-dream-journey` · 2026-10-11

The accepted direction is two endless journeys: a wanderer in a physical wilderness and a cute wisp in its dreamlike counterpart. The wisp is a quiet guardian with its own life. Their paths occasionally cross; neither needs to explain the bond.

## Implemented

- Four procedural dream realms: scattered stars, a faint dust sea, distant lights, and the quiet between. Seeded scenery scrolls endlessly through bounded nearby cells. Realm transitions blend over roughly 34 seconds.
- Hand-shaped pixel sprites: 17 × 19 in the dream and a compact 9 × 12 beside the campfire, with four palette shades, curious eyes, an animated ribbon, blink, play, and rest. The resting ribbon trails behind the body; it does not encircle the face. Pointer attention and a click shimmer are optional.
- Every dream element uses whole-pixel drawing: sparse stars, broken dust clouds, distant glimmers, and concentric light clusters. Both views enlarge the native art with nearest-neighbour sampling at Wander's integer pixel scale.
- Separate persistent birth time and memories. Time away advances the dream journey. Preview parameters never overwrite wisp memory.
- Occasional deterministic camp crossings (roughly 42% of eligible nights). Crossings require the real wanderer to be camping. Both pages share the same decision; his existing wake/sleep behaviour remains.
- The dream page embeds the existing road renderer, muted, without its mode-switch listener. This reuses its exact simulation and save semantics. Behind an opaque dream canvas it paints once a second; during a crossing it returns to full animation. The dream fades away to reveal his actual fire, then returns after the visit.
- A shared procedural wisp painter draws the guardian at the fire, where it also supplies a soft surface light. Mushroom portals are retained only in legacy mode.
- A shared crossing choreography lets it approach the dream opening, disappear through it, emerge from a stationary portal on the road, and drift in an eased arc toward the fire. Departure reverses the journey. The compact pixel portal reuses the original Diablo-inspired violet rim and two blue spiral arms: a point grows into a slit, then widens, closing in reverse. The dream doorway is 21 × 33 native pixels and the road doorway 13 × 21, with restrained light; both use the same painter. Its rim follows the local dream palette (moss tones at camp), while a small amber glimmer on the dream side suggests the distant fire and cool light on the road side suggests the dream beyond. On a one-hour day the opening takes eighteen seconds and travel twenty-four; both views use the same phase progress, with no simultaneous copies of the spirit.
- Optional quiet audio, memories, full screen, keyboard navigation, and a static-site build.

## Design references

- [Scratch in Baldur's Gate 3](https://bg3.wiki/wiki/Scratch): small affectionate behaviours and relationships. The proposal borrows the emotional approach, not the character design.
- [Skyrim wisps](https://elderscrolls.fandom.com/wiki/Wispmother_(Skyrim)) and [Oblivion will-o-the-wisps](https://www.pcgamer.com/games/the-elder-scrolls/oblivion-will-o-the-wisps/): elusive magical light. Wander's wisp is an original, gentle reinterpretation.
- [Book of Travels](https://store.steampowered.com/app/1152340/Book_of_Travels/): a fairytale journey without an overarching destination.
- [flOw](https://thatgamecompany.com/flow/): sparse environments and expressive organic movement.
- [Spirit City](https://store.steampowered.com/app/2113850/Spirit_City_Lofi_Sessions/): background ambience and spirit companionship.

These are creative references, not evidence that this design will retain attention or feel cute. Those qualities need observation and user feedback.

## Review

Run `npm run creature -- --offline`. Preview a crossing with `npm run creature -- --offline --visit --speed 6`. The old hollow remains at `/creature/?hollow=1`.

Run `npm run wisp:check` for isolated browser checks and pictures. Unit tests cover continuous realm boundaries, deterministic occasional crossings, camp restrictions, malformed saves and once-per-night memory. `npm run site:check` checks the built experience under a GitHub Pages-style path.

## Limits of this experiment

The guardian's protection is expressed through presence and illumination; it does not yet alter weather or events. Dreams do not yet echo the wanderer's biome or weather. Audio is a restrained tonal bed. Wisp memory is browser-local, including on the local server. This branch is not published.

Camp companionship now includes one brief open-palm greeting during waking visits. The guardian settles above the palm, then returns beside the fire; sleeping visits bring it closer with a dimmer light. These gestures follow visit progress, without changing his simulation or save. The dream scenery now follows a cosmic-void direction: layered sparse star fields, faint broken dust clouds, rare distant lights, and deep quiet darkness. Scenery scrolls slowly at three depths, without physical obstacles or floating islands.

The wisp occasionally slows and looks toward a faint light that awakens nearby, following it a little before continuing. Crossings and resting take priority. After returning from camp, a tiny amber spark accompanies it and fades over 150 seconds; its timestamp is stored with the journey so reopening does not restart the glow. Older version-one saves load with no ember.

The wisp body and ribbon now share an eight-pose drifting cycle, using the wanderer’s usual walking cadence (PACE.base / FRAME_M, about 5.9 pose changes per second). Resting uses two poses with the same 1600/1300 ms timing as his sitting animation. Canvas position and scene rendering still update each display frame.
