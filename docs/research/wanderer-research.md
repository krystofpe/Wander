# Wander, the wanderer: research

2026-10-09 to 10 · Done before the design, for the brief "an endless, ambient pixel-art journey in high definition" (`docs/superpowers/specs/2026-10-10-wander-wanderer-design.md` cites it). Eight areas were researched in parallel by research agents that searched the web and then read primary sources:

- GDC talks, often transcribed from the original video when no transcript existed (Kemenczy's KRZ scenography, Ferrari's 8-bit talk);
- developer posts and code (Ferrari's Living Worlds scene files, Farnell's Pure Data patches, Generative.fm's source, SquirrelNoise5, Godot and Unity docs);
- art tutorials (Slynyrd's Pixelblog, saint11's tutorial GIFs read frame by frame);
- papers (GPU Gems, Jimenez, Gjøl, Runions, Jarzynski and Olano, the Night Rendering paper);
- standards and MDN.

Some findings were also tested on this machine: headless WebGL2 on the RTX 4070, Node's type stripping.

Every finding gives what the sources say, the sources actually read (URLs), and a line **Wander will:** saying what this project does with it. Numbers marked *derived*, *computed* or *my choice* are the researcher's own arithmetic or judgement, not a source's. Each section ends with the sources that could not be reached; the shared web-search budget ran out near the end of several sections, and the gaps are listed rather than papered over.

## Contents

1. [Art direction and composition](#art-direction-and-composition)
2. [Pixel art craft](#pixel-art-craft)
3. [Light and time of day](#light-and-time-of-day)
4. [Depth: parallax, haze, fog and rays](#depth-parallax-haze-fog-and-rays)
5. [HD with pixel art](#hd-with-pixel-art)
6. [Procedural generation](#procedural-generation)
7. [Sound](#sound)
8. [Engineering](#engineering)

## What the design takes from it

The decisions that shape Wander, each with the findings behind it (section § finding). Where sections disagreed, the choice and the reason are given here.

| Decision | From |
|---|---|
| **Native resolution 640×360**, scaled by a whole number (3× at 1080p, 4× at 1440p, 6× at 4K). On screens that are not 16:9 the native view grows by whole pixels instead of adding bars (this overrules the brief's "letterboxed": two sections found that bars waste a second monitor and that Godot, Unity and Owlboy grow the view; bars remain only for leftovers of a few screen pixels). | Pixel craft §24, HD §4–5 |
| **Indexed art: every pixel stores a colour role, never RGB.** A palette texture maps role × biome × depth × time to a colour, built on the CPU in Oklab. Day to night, biome blends, haze per depth, colour cycling and lit windows are all palette changes, so every cluster stays one flat colour and multiplying (mud) never happens. | Light §2–3, Pixel craft §2, Depth §11, Procgen §15, Art §6 |
| **Each parallax layer is resolved at native resolution into its own buffer at a whole-pixel offset, then composited at full resolution with its own fractional offset** through antialiased point sampling (d7samurai). Far layers glide instead of ticking; the wanderer is a float-positioned sprite, so the camera can lock to him without a sawtooth. | HD §6–10, Depth §5, Pixel craft §26 |
| **One depth number z per layer** drives parallax (1/z), drawn scale, baseline height, haze (1 − e^(−σ(z−1))), colour count, rain size. 8 depth slots, the sky, clouds and one sparse foreground slot. | Depth §1–2, §7, §10 |
| **Surface light at native resolution, light in the air at full resolution.** Fire, ember and windows light the art in 3–4 stepped rings at texel centres, flickering in 10 Hz steps. Bloom (from an emissive mask only), fog sheets, valley mist, god rays (GPU Gems 3 radial blur on a small mask), rain, grain and vignette are full resolution, dithered with triangular blue noise. No chromatic aberration, no CRT, no depth-of-field blur. | HD §11–21, Light §5–7, Depth §12–17 |
| **The sun's elevation drives every light**, from a warped clock that gives the evening golden hour, dusk and blue hour minutes of real time in a one-hour day; sky colours are hand-keyed by elevation (teal by day, violet by night), not a physical model. | Light §1, §9–12, Art §4 |
| **Night is a blue-violet shift with silhouettes against a lighter sky**; warm practical lights (his eyes, the ember, the fire, someone's window) stay warm and are the only warmth. | Light §20–23, Art §9, §12, §21 |
| **Composition:** walk line near y≈295, the wanderer left of centre facing right with the road ahead, 45–55% sky (up to ~75% in "Monk" stretches), at most one landmark in view, foreground silhouettes rare and brief. He is 32 px tall, readable as a flat silhouette (hood point, pack hump, stick), with no face: one dark value and two warm eye pixels. | Art §11–12, §14, §20–21, Pixel craft §15 |
| **Walk cycle: 8 frames at about 170 ms each**, 1 px triangle-wave bob, coat hem lagging a frame, no foot sliding (ground speed = stride). Coat, smoke and fire follow saint11's and Slynyrd's recipes; ambient loops have co-prime periods and random phases so nothing lines up over hours. | Pixel craft §18–23 |
| **Procedural art uses noise only to place hand-made clusters**, with silhouettes first, flat-plane shading from one light, detail at edges, no orphan pixels, and a clean-up pass; dithering only in sky and haze, one Bayer 4×4 pattern anchored to each layer. | Pixel craft §9–17, §27–28, Procgen §16–22 |
| **The road is pure functions of seed and distance**: counter-based hashing (SquirrelNoise5), unbounded lattice noise (the old permutation noise repeats every 256 cells), stretches from jittered cells (5–20 min), biomes from four slow climate fields (temperature, moisture, altitude, human trace) with neighbour rules, warped smoothstep blends, heights blended (never frequencies), each far layer reading the road where it will pass him. | Procgen §1–15 |
| **Placement** by jittered grids with density thinning and grove masks; landmarks on spaced cells, biome-filtered and framed. | Procgen §26–27, Art §2 |
| **Sound is synthesised** with native Web Audio nodes (Farnell's recipes for wind, rain, fire, steps, lighter and breath, crickets, owls, a distant train), layered by biome, weather and hour with slow crossfades, scheduled ahead from a worker-driven clock; music after Eno and Generative.fm (incommensurable loops, a note every few seconds, one generated reverb); mixed quietly with a limiter that only catches accidents. Any recording must be CC0. | Sound §1–25 |
| **Thoughts** are rare (every 3–5 minutes), short (two lines at most), in the world beside him, never on top of busy art; set in a researched free font (see the spec for the final pick between m5x7 and Alegreya Italic). | Art §22–23 |
| **Engineering**: headless Chromium renders on the RTX 4070 only with `--use-angle=vulkan` (SwiftShader otherwise, ~1.5 s per 4K frame), launched from `/usr/lib/chromium/chromium` itself; playwright-core drives it. A Wander-like 4K frame costs ~1.3 ms of GPU time, so the budget is light. GPU memory has no API: the app counts its own textures, which matched `nvidia-smi` to the MiB, and textures are allocated once and reused. The world clock runs off `performance.now()` (rAF stops in hidden pages; the monitor runs at 144 Hz). `npm start` uses a dedicated profile directory, anti-throttling and crash-recovery flags, a wake lock, and a server watchdog. | Engineering §1–24 |

---

## Art direction and composition

**How this was researched.** These are primary sources wherever I could reach them. Two GDC talks have no published transcript, so I transcribed them locally from the original video with Whisper (small.en):

- Tamas Kemenczy, *Scenography of Kentucky Route Zero* (GDC 2014)
- Mark Ferrari, *8 Bit & '8 Bitish' Graphics – Outside the Box* (GDC 2016)

Quotes from these two are marked *(auto-transcribed)* and may contain small word errors. Some sources are quoted second-hand from search snippets or other people's writing; those are marked *(secondary)*.

Sibling reports cover nearby ground, and I point to them instead of repeating them:

- `05-hd-pixel.md`: the sub-pixel camera, bloom, banding and the order of operations.
- `02-pixel-craft.md`: palettes, ramps and the figure's pixel craft.

---

### A. How the references build mood

#### 1. Kentucky Route Zero: light directs the scene; the scenery stays put
- **Finding.** Kemenczy built KRZ's sets on the theatre designer Adolphe Appia's ideas. Appia used electric light "not to recreate naturalism, but … as a cinematic flourish or to suggest a mood or a shift in time or to direct the spectator's eye throughout the stage."
- Kemenczy also borrows Pamela Howard's idea of a *unified setting*: "dramatic changes of time or location can be made with minimum movement within the scene by shifting focus in the scene instead of shifting the scenery itself … blocking, choreography and lighting become the devices for cinematic changes."
- **How they built it.** Lighting cues are "an animation in Unity that scripts lighting changes with animation curves". The player's position scrubs that animation, "parameterized as a zero to one value" (e.g. going up a hill) *(auto-transcribed)*.
- **Sources:**
  - https://archive.org/details/GDC2014Kemenczy (video, transcribed)
  - https://gdcvault.com/play/1021134/Scenography-of-Kentucky-Route
  - https://www.inverse.com/gaming/video-games-drama-final-fantasy-kentucky-route-zero
- **Wander will:**
  - Author all lighting as curves over two parameters: time of day `t∈[0,1)` and progress through the current biome segment `p∈[0,1]`.
  - Stage the big moments with light, not props.
    - When he **sits to smoke**, the ambient drops about 20–30% over 3–5 s and the ember becomes the brightest point.
    - When he **makes camp**, the fire's pool of light becomes the whole scene.
    - At **dusk**, the sun-glow narrows onto the next landmark.

#### 2. Kentucky Route Zero: one emblem per stage, and a lot of empty space
- **Finding.** Howard's unified setting uses "one visual metaphor or emblem in the scene around which everything happens."
  - Props stop being naturalistic set dressing and become "emblematic or expressive of inner states and emotional themes".
  - Once illusionistic scenery is stripped away, "we have a lot of negative space and empty space" *(auto-transcribed)*.
- KRZ's first emblem is a theme gas station, "this giant horse buried to its neck". Its Art Deco and Googie promise of the future clashes with the raw inside, which makes it "anachronistic and sort of tragic".
- **Sources:**
  - https://archive.org/details/GDC2014Kemenczy
  - https://invalidmemory.wordpress.com/2018/04/26/the-scenographic-south/
- **Wander will:**
  - Build each biome segment (about 1–3 minutes of walking) around one landmark. Examples: a dead oak; a pylon on the salt flat; a standing stone; a rail signal; a chimney in the ruins.
  - Place the landmark on a mid-ground layer, as the darkest or lightest mass of that layer.
  - Keep everything else generic and quiet.
  - Never show two landmarks on screen at once. Leave whole screens empty between them.

#### 3. Kentucky Route Zero: no faces at a distance, one continuous take, hard edges
- **No faces.** Characters were first drawn with detailed faces, "and then when we actually started bringing that material into Unity, we just realized that their faces weren't even visible. It was just like a bunch of flickering pixels." They were cut.
- **Slow cinema.** Kemenczy cites slow cinema and Michael Snow's *Wavelength*: "the recording of the passage of time becomes like an important thing of itself, and it kind of puts you in this more reflective state". Time "is not truncated or sped up"; the viewer becomes "like a witness".
- **Flat, theatrical sets.** Sets are flat cutouts with forced perspective and faked shadows. "Our sunset is just like this wiggly disk being lowered in the air."
- **No anti-aliasing,** because "those razor-thin lines … are just like really evocative." *(all auto-transcribed)*
- **Sources:**
  - https://archive.org/details/GDC2014Kemenczy
  - https://www.blog.radiator.debacle.us/2013/01/kentucky-route-zero-act-1-by-jake.html (Robert Yang: "Every single detail, from the framerate of an animation to the fadeout distance of highway sounds, is carefully and precisely considered")
- **Wander will:**
  - Give the wanderer no facial pixels: the hood opening is one flat dark value with two eye pixels.
  - Run as one unbroken take: no cuts, no camera jumps, no fade-to-black time skips. Sleep happens on screen while the sky keeps turning.
  - Draw the sun and moon as flat discs lowered along an arc.
  - Keep every edge in the native layer aliased (hard-edged, not smoothed).

#### 4. Alto: one light, colour keyframes per time of day, a glow that picks out silhouettes
- **Finding.** Harry Nesbitt's own description of Alto's lighting:
  - "The colour/shading of all objects is determined by a single light source, which moves as part of the rotating sky plane. The precise colours for dawn, day, dusk and night can all be adjusted."
  - Stars, clouds and lights are also keyed to the time of day. His prototype clock ran at "2 in-game minutes per second".
- **The rig** (from his Unity forum replies):
  - The sky is "a rectangle mesh comprising of 6 vertices", which gives three colour stops.
  - An ambient colour tints the whole scene: "white-ish during daytime, orange at sunset, blue at night".
  - The "sun glow" is "a radial gradient placed behind the sun and landscape to subtly pick out the mountain silhouette during the day and create that warm glow on the horizon".
  - "fog colour, fog density, sun flare, star brightness etc" are blended per time of day.
  - Sky, sun and stars use a shader "that ignores the ambient colour".
  - The colour schemes are predefined for each weather condition and blended in real time *(secondary: his Dribbble "Dynamic Lighting System" description, seen only as a search snippet)*.
- **Sources:**
  - https://discussions.unity.com/t/2d-day-night-cycle-and-weather-system-a-la-altos-adventure/611522
  - http://www.harrynesbitt.com/blog/experimenting-with-unity/
- **Wander will:**
  - Use a keyframe table of about 9 stops: deep night, pre-dawn blue, sunrise, morning, noon, golden hour, sunset, dusk blue, night.
  - Each stop holds: sky top/mid/horizon (3 or more stops); an ambient tint multiplied into all lit layers; fog colour and density; sun-glow colour and radius; star alpha; light direction.
  - Blend the stops by `t`, then add a weather offset.
  - Place a radial sun-glow (or moon-glow) behind the far ridge layers so ridgelines get a lit edge.
  - Exempt the sky, sun, moon, stars, eyes, ember, lantern and fire from the ambient tint.

#### 5. Alto: the landscape is the protagonist, cut to its essence; zen mode drops the "game"
- **Finding.** Nesbitt on the art:
  - "the game's environments ARE the main character, with Alto and the gang being secondary."
  - "how far can you simplify a form until you're left only with its essence"
  - "by only showing an 'impression' of reality, the player's mind can do all the hard work of filling in the blanks."
- **Biomes.** Odyssey's biomes "transition seamlessly into one another" (Eli Cymet).
- **Zen mode.** The aim was to "strip out anything that made it feel like a traditional game".
- **Sources:**
  - https://www.gamedeveloper.com/business/road-to-the-igf-team-alto-s-i-alto-s-odyssey-i-
  - https://www.cgmagonline.com/interviews/interview-with-the-team-behind-altos-odyssey
  - https://thesweetsetup.com/quick-qa-team-alto-makers-altos-odyssey/
  - https://design-milk.com/altos-adventure-keeps-simple/
- **Wander will:**
  - Treat the land as the main character; the figure is a scale reference and a point of warmth.
  - Build every biome element from 3–6 flat shapes before adding detail.
  - Show no score, UI, counters or prompts. The only text is the rare thought.

#### 6. Mark Ferrari: one painting at every hour, by changing only the palette
- **The original idea.** Ferrari's *Seize the Day* scenes "put these pictures up on screen 24 hours, and any time you looked at your screen it was the same time of day in the picture that it was outside your actual windows. And all done with palette shifting." For an X-Men game, one picture became a valley, then clouds, then a city, each at sunset and night, "I did not change the picture. I just changed the palette."
- **His method:**
  1. Paint the scene for one time, usually morning, lit from the left: "for me, left is just sort of inherently east."
  2. First block out a flat map of where the light will "climb down" over the day.
  3. Fill each highlight with a gradient of about five palette entries that look identical in the morning but split apart later.
  4. Re-render the same file stop by stop, through to evening.
- *(auto-transcribed)*
- **Sources:**
  - https://www.youtube.com/watch?v=aMcJ1Jvtef0
  - https://www.gdcvault.com/play/1023586/8-Bit-8-Bitish-Graphics
  - Ian Gilman, Ferrari and Joe Huckaby later rebuilt the same scenes as the *Living Worlds* app.
- **Wander will:**
  - Shade the native layer through a palette lookup. Sprites and tiles store ramp indices, not RGB. A lookup texture of (ramp index × time stop) per biome gives the colour, blended between neighbouring time stops.
  - Morning sun from the left, behind him as he walks right; sunset ahead of him on the right. Every evening he walks into the sunset.
  - Offer an optional real-clock mode, as *Seize the Day* had.

#### 7. Mark Ferrari: few colours per object, many in the sky
- **Colours per object.** "Pretty much everything except the sky is three to seven colors for whatever the structure is." The minimum is one highlight, one "turning edge" and one shadow-side colour; the most he uses is "three highlight colors … three shadow side, and one still turning color."
  - The turning edge is the band where neither direct nor bounced light lands: "usually actually the darkest part of an object."
  - He orders each ramp highlight → turning edge → shadow, so a gradient fill shades an object automatically.
- **The sky.** "For sky, I use 16 to 32 colors max … If you really want to hide dither, the way to do it is a long gradient where the difference between this color and the next … is so subtle that people don't see it."
- **Cycling.** He reserves about half the palette for colour-cycling ramps, used nowhere else.
- **Production scale.** On Thimbleweed Park they replaced hand-placed dither with "bands of color" so the work could scale to hundreds of backgrounds. *(auto-transcribed)*
- **Source:** https://www.youtube.com/watch?v=aMcJ1Jvtef0
- **Wander will:**
  - Give every procedural material one ramp of 3–7 entries, ordered highlight → turning edge (darkest) → bounce/shadow side.
  - Draw the sky as a separate 16–32-step gradient, dithered in the native layer or smooth in the full-resolution layer.
  - Keep cycling ramps (water, fire, rain, snow, mist) out of static art.
  - Use banded rather than dithered shading on generated shapes.
  - This fits the 16-colour forest reference rule (see `02-pixel-craft.md` §A).

#### 8. Mark Ferrari: colour-cycling recipes for water, mist, snow and fire
Ferrari's techniques *(auto-transcribed)*:
- **Waterfall speed.** Control it "with the length, not the speed of the gradient": short gradient segments at the lip, long ones lower down. That way the fall "pours slowly over the lip and then picks up speed."
- **No seams.** Bridge the joins between gradient segments with half-and-half colours, so there is never "this knife edge line where things flash".
- **Transparency without alpha.** Fill a checkerboard with the same cycling pattern, offset, which gives "one pattern transparently over another".
- **No mass flashing.** Use "clown color" stencils so neighbouring cells start at different points in the gradient and "the overall mass doesn't just flash at you".
- **Wavering edges.** For fish, coral, pond reflections and flames, add "a one to two pixel outline … filled with gradients that are half the color of the image that's wavering and half the color of the background".
- **Flames.** Give the yellow, orange and red gradients different lengths and speeds so "there isn't anything synced up to flash."
- **Snow and rain.** Use a ~7-colour gradient, all tuned to the background colour "except for one palette position that is tuned to a snow color."

Huckaby's HTML5 engine added "BlendShift", which fades between palette steps for smooth in-betweens.

- **Sources:**
  - https://www.youtube.com/watch?v=aMcJ1Jvtef0
  - http://www.effectgames.com/effect/article-Old_School_Color_Cycling_with_HTML5.html
  - https://80.lv/articles/color-cycling-from-the-90s-returns-with-html5
- **Wander will:**
  - Do campfire flicker, river and waterfall flow, rain, snow, heat shimmer on mesas and salt flats, and wavering swamp reflections as ramp rotation in the palette-lookup shader, with BlendShift-style interpolation, not as sprite frames.
  - Give every cycling ramp its own length and period (e.g. 7, 9, 11 steps), so nothing ever pulses in unison over hours.

#### 9. Mark Ferrari: three contrasts, sky first, and skylight in the shadows
- **Three contrasts.** "Contrast between light and dark … contrast between saturated and unsaturated color … warm colors and cool colors." "Even if you're doing an underwater scene that's almost entirely blues, greens and purples, there ought to be a little red and orange in it someplace."
- **Paint the sky first.** "The sky and the light in the background tells me everything I need to know about what color everything else is going to be."
- **Colour in shadows.** The colour in a shadow is "that blue skylight that is filling any light you see in a shadow." *(auto-transcribed)*
- **Source:** https://www.youtube.com/watch?v=aMcJ1Jvtef0
- **Wander will:**
  - Derive each biome's ramps from its sky keyframes: shadow sides take the sky-top colour; lit sides take the sun or glow colour.
  - Keep the world cold and muted, with one small warm accent on screen at a time: the eyes, the ember, the lantern or the fire. This matches the existing "only lantern and eyes warm" rule.

#### 10. Superbrothers (Sword & Sworcery): active negative space, a thin mysterious figure, frames weighted in time
- **Space and figure.** Craig D. Adams: "expansive landscapes with all this active negative space, some of them just fields of solid color, and there's a real sense of mystery"; characters are "not only pixelated but elongated and mysterious."
- **Influences.** "Wind Waker, Mike Mignola's Hellboy, Cezanne's still lifes, Klimt, Hokusai and Hiroshige's landscapes… anything that would help me find the kinds of colors, shapes & compositions that'd 'pop' in pixels."
- **Construction.** Each environment is "basically just paintings, 512×512 or 1024×512", with "a zillion entities" (shrubs, particles, twinkles, clouds) layered on top. "Sound and visuals are inextricably linked."
- **Simplicity.** On McCloud: "the simpler an image gets, while retaining the most information, the more universal it becomes." On Prince of Persia's animation: "each one feels properly weighted in time. There are no wasted frames."
- **Real moon.** S&S also syncs the moon's phase to the real-world clock.
- **Sources:**
  - https://cdm.link/inside-handheld-game-art-the-art-style-and-making-of-swords-sworcery-superbrothers-pixel-cinema/
  - https://cdm.link/inside-handheld-game-art-the-art-style-and-making-of-swords-sworcery-superbrothers-pixel-cinema-2/
  - https://www.killscreen.com/profile-craig-adams/
  - https://en.wikipedia.org/wiki/Superbrothers:_Sword_%26_Sworcery_EP
- **Wander will:**
  - Keep the hooded figure taller than wide (about 1:3.5 including the coat).
  - Let flat fields of sky, fog and water carry whole screens.
  - Look at Hiroshige's landscapes for the shapes of the coast, dune and mountain-pass biomes.
  - Give every animation a few weighted frames rather than many even ones.
  - Use the real moon phase for the night sky.

#### 11. Caspar David Friedrich: the figure seen from behind
- **Finding.** In Friedrich's Rückenfigur (a figure shown from behind), "we are facing in the same direction as the Rückenfiguren. This simple connection invites us to share their experience".
- The back carries "attitude, intent, mood, emotion and awe—even if, or especially if, that information is vague."
- The wanderer is "at once a conduit through which the viewer enters the representation and … a gatekeeper", whose world "remains an unknowable mystery to him, shrouded in fog."
- *Wanderer above the Sea of Fog* places him centrally, "wrapped in a dark green overcoat," gripping "a walking stick". The fog commingles "with the horizon … indistinguishable from the cloud-filled sky."
- **Sources:**
  - https://brooksriley.substack.com/p/about-face
  - https://germanhistorydocs.org/en/from-vormaerz-to-prussian-dominance-1815-1866/caspar-david-friedrich-wanderer-above-a-sea-of-fog-c-1818
  - https://en.wikipedia.org/wiki/Wanderer_above_the_Sea_of_Fog
- **Wander will:**
  - Add a rare "looks out" idle. He stops, turns his back three-quarters to the camera and faces into the scene toward the moon, the sea of fog or a far ridge. He holds it for 8–20 s; the camera eases him toward centre frame.
  - Use this only at vistas: plateau edge, mountain pass, coast, the moon rising.
  - On the mountain pass, set up the *Wanderer* staging deliberately: a crest in the foreground, fog filling the valleys below, far ridges coming through it.

#### 12. Caspar David Friedrich: a huge sky, a tiny low figure, and dark land under a lighter night sky
- ***The Monk by the Sea*.**
  - The sky takes "about three quarters of the picture".
  - The monk is "tiny" and "meager", set so low that he does not oversee the landscape as Friedrich's other back-turned figures do *(secondary for that comparison)*.
  - There is no repoussoir (no framing foreground element), and the picture is a "flat foreground, void of greenery, and a dark sea."
  - Friedrich painted two ships on the horizon and then removed them.
  - Kleist: "it is as if one's eyelids had been cut away"; Brentano complained of "the loneliness of the setting and the lack of consolation."
- ***Two Men Contemplating the Moon*.**
  - The picture is "almost monochromatic in shades of brown and grey, depicting nightfall", with dark foregrounds against a lighter pastel sky.
  - The sky holds "the sickle of the waxing moon and the evening star".
- **Sources:**
  - https://en.wikipedia.org/wiki/The_Monk_by_the_Sea
  - https://en.wikipedia.org/wiki/Two_Men_Contemplating_the_Moon
  - (the Met's catalogue page was rate-limited)
- **Wander will:**
  - Have a "Monk" composition mode for the salt flat, coast, tundra and plateau: horizon at y≈250–270 of 360, so sky is 70–75% of the frame. The figure's feet sit close to the horizon line, small (≤32 px), with nothing else on screen.
  - Generate these stretches by removing props, not adding them.
  - Keep the sky at least 2 value steps lighter than the land at night. Silhouettes read as dark against light; violet and grey night skies, never black.
  - Put a crescent and one bright "evening star" in the dusk sky.

#### 13. Lo-fi walking streams: built to stay on for hours
- **Finding.** The Lofi Girl animation is a short loop: a girl studying, "occasionally glancing at her cat sitting on the windowsill". The view out the window has "the sky changing to match the time of day".
- One stream had been "running since 22 February 2020"; people keep it on "in the background while you get work done, do chores, whatever."
- The artist (Juan Pablo Machado) dropped a lying-down pose because "it was too long to animate". The format runs on tiny periodic motions and a world that follows real time.
- **Source:** https://en.wikipedia.org/wiki/Lofi_Girl
- **Wander will:**
  - Hold to a background-viewing contract: no element may demand attention.
  - Motion is slow and small: leaves, coat hem, smoke, water, stars.
  - No flashes, no sudden loud events, no screen-wide brightness change faster than about 10 s.
  - Day length is either the real clock or a long cycle (around 40–60 min) so the light changes perceptibly but never hurries.

---

### B. Composition for a side-scrolling landscape

#### 14. Group values into a few masses; full contrast only at the point of interest
- **Finding.** Howard Pyle's rule, as quoted by James Gurney: "Put your white against white, middle tones (groups) against grays, black against black, then black and white where you want your center of interest."
- Gurney calls merging neighbouring shapes of similar value "shapewelding". Massing values means "you can tell at a glance what's going on, and it reads from across the room"; without it a picture becomes "spotty and haphazard".
- **Sources:**
  - https://gurneyjourney.blogspot.com/2007/10/shape-welding.html
  - https://gurneyjourney.blogspot.com/2019/12/why-should-i-mass-values.html
- **Wander will:**
  - Design every frame as 3–4 value masses:
    - sky (lightest)
    - far land welded into the sky
    - near land (darkest)
    - the figure's accent
  - Check screenshots by posterising to 4 grey levels. If the figure or the landmark disappears, the frame fails.
  - The point where the darkest dark touches the lightest light is reserved for the wanderer (his dark hood against fog or sky; his eyes in the dark).
  - Rain, snow, water highlights and sparkles must never become the whitest thing on screen (see finding 19).

#### 15. Atmospheric perspective: each layer of air lifts the darks and drains the colour
- **Finding.** Gurney's "wedding veil" model: "each parcel of air introduces a fixed amount of additional scattered light". His example: if each layer makes black 50% lighter, values go #10 → #5 → #2.5 → #1.25 toward the sky value. "The dark colors in the extreme distance are lightened and cooled."
- Slynyrd adds: "far objects become less saturated and contain less colors", and "the closer an object is to the vertical position of the horizon, the more distant it appears."
- **Sources:**
  - https://gurneyjourney.blogspot.com/2013/07/atmospheric-distance-and-value.html
  - https://www.slynyrd.com/blog/2018/11/16/pixelblog-11-landscape-pixeling
- **Wander will:**
  - Mix each parallax layer `k` (0 = the walk layer) toward the current fog/sky-horizon colour by `1 − a^k`, starting from a≈0.6. That is geometric, not linear; tune it per biome and per fog density.
  - Cut ramp length with distance: near 5–7 colours, mid 3–5, far 2–3, farthest 1 flat silhouette.
  - Put far layers' baselines closer to the horizon line.
  - (Per-layer hue shift: see `02-pixel-craft.md` §27.)

#### 16. One pixel grid; slow far layers will visibly step
- **The 1:1 rule.** Kingdom is "a 1:1 pixel game, so that means we will never have rotated blocky pixels". Rotations and physics done in code stay short and fast so "your eyes interpret the whole motion, and not the weird patterns introduced by the aliasing."
- **The cost.** Because it renders "at the resolution of the sprite's pixels", "slow moving objects are affected by 'parallax jiggles'"; players noticed "stepping" clouds. Kingdom ran at about 400×250.
- **Integer speeds.** Slynyrd: "pixel perfect movement is movement that only moves in increments of pixel units"; loop speeds must divide the loop width.
- **Glue.** Kingdom's developer says that with rough pieces "the engine glues it together with lighting and FX".
- **Sources:**
  - TIGSource Kingdom devlog, https://forums.tigsource.com/index.php?topic=40539.40 and .80 (live site behind Cloudflare; read via the Internet Archive snapshots of 2024-03-12 and 2025-08-15)
  - https://www.slynyrd.com/blog/2019/11/12/pixelblog-23-parallax-scrolling
  - https://cliqist.com/2014/05/19/thomas-van-den-berg-discusses-the-new-kingdom/
  - https://80.lv/articles/kingdom-how-2-guys-created-a-side-scrolling-strategy/
- **Wander will:**
  - Keep every shape on the 640×360 grid with one pixel size.
  - Not accept stepping on far layers, which move at 1–5 px/s at walking pace and would visibly tick. They get a sub-pixel offset applied at upscale time (method in `05-hd-pixel.md` §C).
  - Let the full-resolution atmosphere layer act as the "glue" between procedurally assembled pieces.

#### 17. Kingdom: water reflections and the shape of a night
- **The reflection recipe,** from noio (Thomas van den Berg) himself:
  1. Fetch part of the screen and flip it upside down.
  2. Run it through a displacement map whose red/green channels hold UV offsets.
  3. Scroll the map for motion. Use two maps at different detail, scrolled at different speeds, with the offsets added.
  4. Stretch the lookup so "waves closer to the camera look bigger" (perspective correction).
  5. Darken it, because otherwise "the reflection is as bright as the scene". He then added "rolling" sparkles but worried it "looks too 'hi-fi' for a pixelart game".
- **Music and silence.** The composer "decided at which time of day [tracks] should play, and which weather conditions should accompany them… This … gave us periods of silence." The landscape came from "Holland is flat with a lot of water."
- **Sources:**
  - TIGSource devlog reply #26 (30 Jan 2015), https://forums.tigsource.com/index.php?topic=40539.20 (read via the Internet Archive snapshot of 2024-03-12)
  - https://www.gamedeveloper.com/audio/dev-interview-thomas-van-den-berg
- **Wander will:**
  - Give coast, swamp, lake and rail-embankment ditches a reflection band under the walk line, 30–60 px tall, built this way.
  - Round the displacement to whole native pixels so ripples stay on the grid.
  - Darken the reflection 25–40% and tint it toward the sky-top colour.
  - Allow sparkles only at golden hour and from the moon, at most a few pixels.
  - Unresolved: I found no primary source on how Kingdom chose its night colours.

#### 18. INSIDE: fog and silhouettes as the whole style; bright things show through the fog
- **Fog.** Playdead: "Fog turned out to be very central to our artstyle. Many of the initial scenes in the game were literally just fog + silhouettes … Simple linear fog!" The one trick: "We clamp the fog to a max-value to enable bright objects to 'bleed through'" (headlights, spotlights).
- **Bloom.** "If bloom calculated with a certain intensity, we need to show source pixel with the same intensity."
- **Banding.** "Almost always dither any 8bit write", using triangular-distribution noise.
- **Source:** *Low Complexity, High Fidelity: INSIDE Rendering* (GDC 2016), https://github.com/playdeadgames/publications/blob/master/INSIDE/rendering_inside_gdc2016.pdf
- **Wander will:**
  - Make fog plus silhouettes the default look of the forest, the swamp and pre-dawn.
  - Clamp fog per pixel, so emissive pixels (eyes, ember, lantern, fire, a distant window in the ruins) always bleed through even the densest fog.
  - Keep the figure findable in any weather this way.
  - (Banding and order of operations: `05-hd-pixel.md` §F.)

#### 19. INSIDE: turn effects down 90%
- **The rule.** The feedback on almost all of INSIDE's effects was "Turn it down 90%". On rain: "Turn it down till it feels uncomfortable … Now you wouldn't notice most of the time unless you looked in the shade, or under a lamp."
- "Waterfalls, splashes and rain shouldn't be the whitest thing on screen. That smoke, dust can't be opaque grey."
- **Matching colours.** Smoke is coloured by picking "the color of the background on the lit side, and the background on the shaded side".
- **Fewer details.** "De-detail the details"; "Your work is only as good as its worst detail". A rainbow lens flare was removed because "people asked where the colours came from".
- **Source:** Playdead, *Turn It Down 90% – INSIDE VFX*, https://github.com/playdeadgames/publications/blob/master/INSIDE/turn_it_down_90pct.pptx (slide text and speaker notes read)
- **Wander will:**
  - Colour cigarette smoke, campfire smoke, mist puffs, dust and snow with two colours taken from the background behind them (lit side and shade side), never neutral grey.
  - Hold rain and snow to a few pixels of contrast, visible mainly near the fire or against dark masses.
  - Keep all particles far below the brightness of the eyes.
  - Allow no chromatic or rainbow lens flares; any flare takes the sun-glow colour.

#### 20. Wander's default frame (a synthesis)
- **Finding.** This combines findings 2, 10, 12, 14 and 15, plus KRZ's proscenium distance: "you're kind of far away, like as a theater goer, like watching a stage" *(auto-transcribed)*.
- **Wander will use these default proportions (640×360):**

  | Element | Position |
  |---|---|
  | Walk line (feet) | y≈292–300 |
  | Ground strip or reflection band below | 60–68 px |
  | Wanderer while walking | x≈200–250 (left of centre), facing right; about 60% of the frame is the road ahead |
  | Wanderer when sitting, camping or looking out | eased to centre over 4–6 s |
  | Sky, normal biomes | 45–55% of the frame |
  | Sky, "Monk" mode | 70–75% |
  | Sky, closed forest | 10–25% |
  | Parallax planes | 4–6: sky, 1–2 far silhouettes, 1 mid with the landmark, the walk layer, an occasional foreground |

  - Draw foreground elements (dark grass, trunks, fence posts) as pure near-black silhouettes that pass quickly, at most about 15% of screen width at once.
  - At most one landmark in view.

---

### C. A small figure in a big land

#### 21. Keeping a ~32 px wanderer readable and findable
- **Evidence:**
  - KRZ removed faces because at that distance they became "flickering pixels" (finding 3).
  - Limbo's boy is a black silhouette whose only sign of personality is "his tiny blinking white eyes". Jensen: "It was supposed to feel this loneliness".
  - INSIDE's boy is the one coloured element in a near-monochrome world *(secondary)*.
  - Pyle keeps maximum contrast for the point of interest (finding 14).
  - Ferrari keeps one warm accent in a cool scene (finding 9).
  - Alto's sun-glow sits behind silhouettes to pick out their edges (finding 4).
  - INSIDE lets bright things bleed through fog (finding 18).
- **Sources:**
  - https://www.gamedeveloper.com/business/hanging-in-limbo
  - Limbo eyes and INSIDE colour from search snippets only *(secondary)*
  - plus the sources above
- **Wander will:**
  - **Size:** 32 px tall standing (about 9% of the screen); never above 36 px.
  - **Silhouette:** it must read at 1× as a single flat fill. It needs three clear notches:
    - the peaked hood
    - the pack's hump, 3–4 px behind the shoulders
    - the stick held forward on a diagonal, 6–8 px beyond the body
  - The coat flares at the hem.
  - **Values on the figure:** 2–3 plus the eyes:
    - coat near-black
    - one cool mid-tone for folds
    - a 1 px rim on the side facing the brightest sky
  - **Rim:** the rim faces left in the morning and right in the evening, coloured with the sky-horizon keyframe.
  - **Eyes:** 2 single warm pixels, 1 px apart. At night they are at least 3 value steps brighter than anything within 16 px. They go into an emissive mask that fog cannot cover; the full-resolution layer adds a 2–3 native-pixel bloom.
  - **Ember:** the cigarette ember is one more warm pixel that brightens on each drag (every 6–10 s).
  - **Backdrop:** he should stand mostly against far layers welded into the sky, so tall near-dark shapes pass behind him only briefly; when they do, the rim and eyes carry him.
  - (Pixel-level figure construction: `02-pixel-craft.md` §15, §21, §22.)

---

### D. Typography for floating thoughts

#### 22. How the reference games set ambient text
- **Sword & Sworcery.** Its "thoughts" are read from other characters' minds after the hero finds the Megatome. The lines are pithy and tweetable, in "a mix of evocative, mythic prose and internet dialect circa 2011", swinging "poetic to sardonic and silly in the same sentence".
- **Kentucky Route Zero.** Kemenczy cites Howard on "the shape of the words and how they get incorporated onto the stage itself". From KRZ's VR experiment: constantly re-focusing between text and scene at different depths "is really fatiguing", and text over a busy background made "your eye … fight to try and resolve that. So we had to just put like a dark box behind it" *(auto-transcribed)*.
  - Jake Elliott cites Saul Bass's title sequences. In KRZ, the word "Zero" gets a passing cloud shader *(secondary: the Boing Boing article returned 403)*.
- **Sources:**
  - https://en.wikipedia.org/wiki/Superbrothers:_Sword_%26_Sworcery_EP
  - https://www.capybaragames.com/games/superbrothers-sword-sworcery-ep
  - https://www.inverse.com/gaming/superbrothers-sword-sworcery-cult-classic-update-steam-deck
  - https://archive.org/details/GDC2014Kemenczy
- **Wander will:**
  - Keep thoughts rare: about one per 3–6 minutes, more around the fire, none while he sleeps.
  - Keep them short: at most ~40 characters on one line, two lines at most, lowercase, plain words, no exclamation marks.
  - Set them in the world at the figure's depth, not as a HUD: above and slightly ahead of him, over calm sky or fog, never over foliage.
  - Behind the text, darken a soft patch in the full-resolution layer by 15–25% (KRZ's dark box, made invisible).
  - Fade in about 1.5 s, hold 4–7 s, fade out about 2 s. Never more than one thought on screen.

#### 23. Font recommendation: m5x7 by Daniel Linssen, CC0, drawn at native resolution
- **The font.**
  - Licence: "Creative Commons Zero v1.0 Universal" ("attribution is appreciated but not required").
  - Metrics: average width +5 px, ascender +7, descender −2, x-height +5.
  - Format: TTF; the author says to use font sizes in multiples of 16.
  - Download: **https://managore.itch.io/m5x7**
- **Why this one.**
  - It is proportional and gently irregular, so it reads as handwriting-like prose rather than a terminal font.
  - Being pixel-native keeps the single pixel grid (finding 16).
  - It takes the scene's colour grading and fog like everything else.
- **Runner-up:** *monogram* by datagoblin (CC0, 5×8 monospace). It has an italic and ships as a ready PNG+JSON bitmap. https://datagoblin.itch.io/monogram
- **The high-resolution alternative,** if the owner wants a more literary, KRZ-like voice: **Alegreya Italic**, SIL OFL. Juan Pablo del Peral, HT Fonts; "a typeface originally intended for literature … a dynamic and varied rhythm". https://github.com/google/fonts/tree/main/ofl/alegreya
- **Sources:**
  - https://managore.itch.io/m5x7
  - https://datagoblin.itch.io/monogram
  - https://raw.githubusercontent.com/google/fonts/main/ofl/alegreya/DESCRIPTION.en_us.html
  - https://raw.githubusercontent.com/google/fonts/main/ofl/alegreya/METADATA.pb
- **Wander will:**
  - Pre-rasterise m5x7 once at size 16 with anti-aliasing off (Aseprite, or a BMFont export) into a 1-bit glyph atlas plus advance widths. Do not use Canvas `fillText` at runtime, which anti-aliases.
  - Draw glyphs into the 640×360 buffer at integer native positions with nearest sampling.
  - Colour: one palette colour, the sky-highlight of the current time stop, slightly cooled. Add a 1 px shadow one step darker than the local background below and right, only where the text crosses light sky.
  - Fade by stepping alpha in 4–5 steps (or a dithered dissolve), not smoothly.
  - Exclude text from bloom.
  - At 1080p (3×) a capital is 21 device pixels tall; at 4K (6×), 42.
  - If the Alegreya route is chosen instead:
    - Rasterise with Canvas2D at `devicePixelRatio`, or as an MSDF (multi-channel signed distance field) atlas.
    - Composite after the upscale, at about 2.3–2.6% of screen height (25–28 px at 1080p).
    - Never scale it with the pixel buffer.

---

### Sources I could not access (or used only second-hand)
- **Talks with no transcript.** Mark Ferrari's GDC 2016 talk and Kemenczy's GDC 2014 talk have no transcripts or slides online. I transcribed both from video with Whisper; minor wording errors are possible.
- **Kingdom.**
  - The live TIGSource Kingdom devlog is behind Cloudflare; I read the Internet Archive snapshots.
  - I found no primary art breakdown of Kingdom or Kingdom Two Crowns' night palette or lighting.
- **Blocked pages.**
  - Boing Boing (Craig Adams' "Less Talk More Rock"; Jake Elliott on typography): 403.
  - Smarthistory: 403.
  - TouchArcade's 2023 Sword & Sworcery interview: 403.
  - The Met's pages for *Two Men Contemplating the Moon* and the *Moonwatchers* catalogue: 429.
  - Harry Nesbitt's site partly failed TLS through the fetcher; I read it with curl.
- **Matt Nava, *The Art of Journey* (GDC 2013).** The Vault page says the talk is free, but its content is video only and I could not locate a copy to transcribe.
- **Not researched.** The session's shared web-search budget ran out before I reached Gris, Old Man's Journey, Eastward, The Last Night, Owlboy and Night in the Woods' text system. Treat these as gaps.
- **Second-hand only.** The Limbo eye detail, the INSIDE red shirt, the KRZ "Zero" shader and the Sword & Sworcery 140-character text limit come from search snippets, not primary sources.

---

## Pixel art craft

Research pass of 2026-10-09 on pixel-art craft for Wander: a browser game (WebGL2) at 640x360 native resolution, with a 30-36 px hooded wanderer and procedural scenery.

**How this was researched:**

- **Primary text sources:** Slynyrd's Pixelblog (posts 1, 2, 5, 6, 8, 11, 13, 15, 23, 25, 33, 47, 50, 52, 62), Derek Yu, cure's Pixel Joint tutorial, Pixel Parmesan (colour, dithering, anti-aliasing), Surma's Ditherpunk, the Unity Pixel Perfect docs and yal.cc.
- **saint11 (Pedro Medeiros):** his tutorials are 512x512 GIFs with the text drawn into the image. I downloaded 24 of them from `https://saint11.art/img/pixel-tutorials/<Name>.gif`, read their frames, and measured the walk GIF frame by frame. The GIF frame delays give his timings.
- **Lospec palettes:** pulled from Lospec's JSON (`https://lospec.com/palette-list/<slug>.json`). I measured each in OKLCH and scored it against the 16-colour teal forest reference image the owner supplied for the earlier forest diorama (measured on 2026-10-09).
- **Unread sources** are listed at the end.

---

### A. Palettes

#### 1. Keep the palette small: about 15-16 colours on screen per scene, a few per depth plane
- **What the sources say:**
  - Slynyrd builds three full parallax landscapes (sky, three depth planes, clouds) with at most 15 colours each.
  - The project's own forest reference measures exactly 16 colours.
  - cure gives the reasons for a limited count: cohesion, because repeated colours unify the piece, and control, because there are fewer relationships to manage when tuning.
  - Derek Yu advises beginners to start from an existing palette rather than theorising.
  - saint11 says to keep the colour count as low as possible (Vegetation 1) and warns against too many colours on details (Rock formations).
- **Sources:**
  - https://www.slynyrd.com/blog/2026/5/27/pixelblog-62-landscape-backgrounds
  - https://pixeljoint.com/forum/forum_posts.asp?TID=11299
  - https://derekyu.com/makegames/pixelart.html
  - https://saint11.art/img/pixel-tutorials/Vegetation.gif
  - https://saint11.art/img/pixel-tutorials/Rock.gif

**Wander will:**
- Cap each biome at 16-20 on-screen colours, plus the warm accent ramp (eyes, ember, fire).
- Give each depth plane 2-4 colours. The far plane gets 2.
- Have a palette-audit step in `npm run art` and in a debug overlay that counts the distinct colours in the composed native frame and fails above the cap.

#### 2. One master palette in OKLCH; biomes take subsets of it, not separate palettes
- **What the sources say:**
  - Pixel Parmesan: colour is relative. Chromatic adaptation lets the same absolute colour read as different materials under different light.
  - Pixel Parmesan's *gamut masking*: choose 2-3 "relative primaries" and keep every colour inside the shape they span. That makes a palette cohesive.
  - Pixel Parmesan's distribution rule: one dominant colour, a secondary, and an accent covering roughly 10-20% of the image. An accent is "intense relative to its surroundings".
  - Slynyrd's Mondo palette (128 colours, 9-swatch ramps, ramp hues 45 degrees apart) shows the master-palette approach: "because of the hue shift every colour is surrounded by colours that can work together".
- **Sources:**
  - https://pixelparmesan.com/blog/color-theory-for-pixel-artists-its-all-relative
  - https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes

**Wander will:**
- Define one master palette as named ramps in OKLCH, about 48-64 entries.
- Make each biome a gamut mask over it: an indexed subset of 16-20 entries.
- Blend biomes by interpolating index to colour (each palette index lerps in OKLab from biome A's colour to biome B's), never by mixing pixels. Every cluster stays one flat colour throughout the crossfade, and the on-screen colour count does not grow.
- Use the same mechanism for day to night: teal by day, violet by night.

#### 3. Lospec candidates, measured against the forest reference
The fit score is the mean OKLab distance from each of the 16 forest-reference colours to that palette's nearest colour. Lower is closer. A distance of about 0.02 is barely visible; 0.05 is a clear but same-family shift. "Cool" counts hues between 170 and 320 degrees.

| Palette (author, size) | Fit (mean / worst) | Character | Link |
|---|---|---|---|
| **Apollo** (AdamCYounis, 46) | **0.043** / 0.083 | Six 6-step ramps plus a 10-step cool grey ramp from #090a14; 13 darks; low chroma (mean C 0.078). Best fit and best structure. | https://lospec.com/palette-list/apollo |
| Waldgeist (Acid Burritos, 39) | 0.048 / 0.105 | Muted earthy forest browns, moss and slate; very low chroma (0.044). The most-downloaded "dark" palette. | https://lospec.com/palette-list/waldgeist |
| Lospec500 (collective, 42) | 0.048 / 0.073 | Balanced general-purpose palette, brighter. | https://lospec.com/palette-list/lospec500 |
| escape9 (magodellepercussioni, 9) | 0.050 / 0.108 | Nine colours, 8 of them cool teal/slate: a ready-made foggy forest sub-palette. | https://lospec.com/palette-list/escape9 |
| UnderNight 20 (yedamameday, 20) | 0.052 / 0.082 | Indigo-violet night ramps with mauve and moss: a night-biome candidate. | https://lospec.com/palette-list/undernight-20 |
| Resurrect 64 (Kerrie Lake, 64) | 0.053 / 0.113 | Strongly hue-shifted ramps. Its moss ramp rotates hue about -27 degrees per step. Saturated. | https://lospec.com/palette-list/resurrect-64 |
| Endesga 32 / 64 (ENDESGA) | 32: 0.055 / 0.110; 64: 0.049 / 0.094 | Saturated "game" palettes. Too bright for the mood without heavy restriction. | https://lospec.com/palette-list/endesga-32 , https://lospec.com/palette-list/endesga-64 |
| Sweetie 16 (GrafxKid, 16) | 0.062 / 0.124 | Cheerful; only one dark below L 0.35. | https://lospec.com/palette-list/sweetie-16 |
| Twilight 5 (Star, 5) | 0.076 / 0.194 | Dusk mood: navy, slate-blue and two rose tones. A good dusk-sky sub-palette. | https://lospec.com/palette-list/twilight-5 |
| Midnight Ablaze (Inkpendude, 7) | 0.173 / 0.280 | Seven crimson-to-black steps, no cool hues. Unusable as a world palette; usable as the **fire and ember ramp**. | https://lospec.com/palette-list/midnight-ablaze |

Hex codes:

- **Apollo:** #172038 #253a5e #3c5e8b #4f8fba #73bed3 #a4dddb | #19332d #25562e #468232 #75a743 #a8ca58 #d0da91 | #4d2b32 #7a4841 #ad7757 #c09473 #d7b594 #e7d5b3 | #341c27 #602c2c #884b2b #be772b #de9e41 #e8c170 | #241527 #411d31 #752438 #a53030 #cf573c #da863e | #1e1d39 #402751 #7a367b #a23e8c #c65197 #df84a5 | #090a14 #10141f #151d28 #202e37 #394a50 #577277 #819796 #a8b5b2 #c7cfcc #ebede9
- **escape9:** #230019 #1f2439 #19374b #396d7d #719797 #a2b8b1 #557b78 #3c5f66 #254351
- **UnderNight 20:** #6b9a71 #457a5f #244f55 #211729 #2b2441 #33315d #414776 #4d80ab #79b4d5 #a5d5df #e3ecd7 #fffef9 #e3c5cf #b79fbb #8e8bb6 #5f6791 #8d5180 #b67388 #e1ae98 #efdbb3
- **Waldgeist:** #a6884a #906c30 #825337 #83473d #66352e #562923 #612638 #46332c #323230 #3e4055 #382d35 #323b42 #1f2d36 #141f25 #0b1016 #245273 #4e7499 #5e7e8b #798a92 #879ea3 #e3ddd1 #bdbbae #af9e94 #907c75 #a29f7e #969372 #78735d #696353 #4f493b #212528 #595c55 #4b4e4f #57562a #675f30 #727234 #73804b #5f7b53 #3b6d62 #32534a
- **Twilight 5:** #fbbbad #ee8695 #4a7a96 #333f58 #292831
- **Midnight Ablaze:** #ff8274 #d53c6a #7c183c #460e2b #31051e #1f0510 #130208
- **Sweetie 16:** #1a1c2c #5d275d #b13e53 #ef7d57 #ffcd75 #a7f070 #38b764 #257179 #29366f #3b5dc9 #41a6f6 #73eff7 #f4f4f4 #94b0c2 #566c86 #333c57
- **Endesga 32:** #be4a2f #d77643 #ead4aa #e4a672 #b86f50 #733e39 #3e2731 #a22633 #e43b44 #f77622 #feae34 #fee761 #63c74d #3e8948 #265c42 #193c3e #124e89 #0099db #2ce8f5 #ffffff #c0cbdc #8b9bb4 #5a6988 #3a4466 #262b44 #181425 #ff0044 #68386c #b55088 #f6757a #e8b796 #c28569
- **Lospec500:** #10121c #2c1e31 #6b2643 #ac2847 #ec273f #94493a #de5d3a #e98537 #f3a833 #4d3533 #6e4c30 #a26d3f #ce9248 #dab163 #e8d282 #f7f3b7 #1e4044 #006554 #26854c #5ab552 #9de64e #008b8b #62a477 #a6cb96 #d3eed3 #3e3b65 #3859b3 #3388de #36c5f4 #6dead6 #5e5b8c #8c78a5 #b0a7b8 #deceed #9a4d76 #c878af #cc99ff #fa6e79 #ffa2ac #ffd1d5 #f6e8e0 #ffffff
- **Resurrect 64:** #2e222f #3e3546 #625565 #966c6c #ab947a #694f62 #7f708a #9babb2 #c7dcd0 #ffffff #6e2727 #b33831 #ea4f36 #f57d4a #ae2334 #e83b3b #fb6b1d #f79617 #f9c22b #7a3045 #9e4539 #cd683d #e6904e #fbb954 #4c3e24 #676633 #a2a947 #d5e04b #fbff86 #165a4c #239063 #1ebc73 #91db69 #cddf6c #313638 #374e4a #547e64 #92a984 #b2ba90 #0b5e65 #0b8a8f #0eaf9b #30e1b9 #8ff8e2 #323353 #484a77 #4d65b4 #4d9be6 #8fd3ff #45293f #6b3e75 #905ea9 #a884f3 #eaaded #753c54 #a24b6f #cf657f #ed8099 #831c5d #c32454 #f04f78 #f68181 #fca790 #fdcbb0

**Sources:** the Lospec pages above. I measured them myself from Lospec's `.json` exports.

**Wander will:**
- Use **Apollo's structure** as the template for the master palette: 6-step ramps plus a long cool-neutral ramp that starts at a navy-black, not pure black.
- Keep the measured forest-reference colours as the forest subset.
- Borrow a night ramp from UnderNight 20, a fog/slate set from escape9, a dusk sky from Twilight 5, and the fire/ember ramp from Midnight Ablaze (re-tuned toward orange for the ember highlight).
- Not adopt any whole Lospec palette. None matches the reference closer than 0.043, and the bright ones (Endesga, Sweetie) contradict the melancholic brief.

#### 4. Name colours by role, not by hue
- **What the sources say:**
  - saint11 thinks of foliage in role layers: highlights, base, shadow, dirt.
  - saint11's parallax table sets each depth's role: close means high saturation, high contrast, bright, hot hue, many details. Far means low saturation, low contrast, darker, cold hue, few details, fading to the sky colour.
  - Pixel Parmesan: dominant, secondary, and accent at about 10-20%. The specular/highlight colour alone can swing the mood of a whole piece.
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Vegetation2.gif
  - https://saint11.art/img/pixel-tutorials/Parallax.gif
  - https://pixelparmesan.com/blog/color-theory-for-pixel-artists-its-all-relative

**Wander will:**
- Store palettes as role tables. Procedural code asks for roles, never hex values: `sky0..2, haze, far0..1, mid0..2, near0..3, foliage{hi,base,shadow}, bark{hi,base,shadow,crack}, stone{hi,base,shadow}, ground{lit,base,dark}, water{hi,base}, outline, accent{ember0..3, eye}`.
- Keep the warm accent far below Parmesan's 10-20%, well under 1% of pixels, to protect the "only his eyes and fire are warm" rule. The accent then reads by rarity rather than area.

### B. Ramps and hue shifting

#### 5. Ramp length and value spacing: 5-6 steps, about +0.10-0.13 OKLCH L per step, smaller steps at the ends
- **What the sources say:**
  - Slynyrd's Mondo ramps have 9 swatches. Brightness rises steadily, takes smaller steps near the top, and usually does not start at 0 unless black is needed.
  - Apollo's 6-step ramps, measured:
    - OKLCH L rises by +0.065 to +0.16 per step, about 0.11 on average.
    - Steps are largest in the middle (about 0.12-0.15) and smallest at the ends (about 0.07-0.10).
    - Ramps run from L 0.22-0.34 up to L 0.70-0.88.
    - Its neutral ramp starts at #090a14 (L 0.15), a navy-black, not #000.
  - The **forest reference's teal ramp is unusually tight**: eight steps from #082A34 to #20738A climb only +0.04 to +0.06 L each. That is half of Apollo's spacing, so neighbouring teals are hard to tell apart.
- **Sources:**
  - https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes
  - https://lospec.com/palette-list/apollo (measured)

**Wander will:**
- Give material ramps 5-6 steps with L spacing of at least 0.07 where two colours touch inside a cluster.
- Let atmospheric (far-plane) colours sit closer together on purpose. Close values read as haze.
- Darkest colour per biome: OKLCH L 0.14-0.18 with a blue-violet hue, never #000000.
- Add a check to the palette build: warn when two colours used together in one cluster differ by less than 0.05 L. For the dense dark teals of the reference, choose 4-5 of the 8 per material rather than all 8.

#### 6. Hue shifting: rotate the hue toward the light's colour as values rise, and toward the ambient/shadow colour as they fall
- **What the sources say:**
  - Slynyrd uses a 20-degree HSB hue shift per swatch across 9 swatches: "positive hue shift usually results in more natural colors, warming as they become brighter".
  - saint11 (Shading): change hue as well as brightness, moving it "towards the darker or lighter areas of the color wheel".
  - cure: bend highlights toward one colour and shadows toward a second, instead of straight ramps.
  - **Measured on Apollo:** every ramp rotates toward yellow (OKLCH h about 60-115) as it brightens. The blue ramp runs h 267 to 193 (about -15 degrees per step, accelerating toward the top). Green runs 177 to 115 (about -12 degrees per step). The red, brown and purple ramps run +10 to +30 degrees per step toward orange.
  - **Measured on the forest reference:** the teal ramp is a *straight ramp*. Hue wobbles within h 206-222 with no trend.
  - **Pixel Parmesan's caveat:** "hue shifting" is a shorthand. Under neutral light, hue stays nearly constant and saturation curves. The real driver is the colour of the light, which shifts the object's absolute colours.
- **Sources:**
  - https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes
  - https://saint11.art/img/pixel-tutorials/Shading.gif
  - https://pixeljoint.com/forum/forum_posts.asp?TID=11299
  - https://pixelparmesan.com/blog/color-theory-for-pixel-artists-its-all-relative

**Recipe (OKLCH, 6 steps, index 0 = darkest):**
- `L = [0.20, 0.31, 0.42, 0.54, 0.66, 0.78]`
- `C = [0.035, 0.052, 0.068, 0.080, 0.074, 0.058]`: chroma peaks at step 3 of 0-5 and drops about 0.02 at the top.
- `h = h_shadow + i * dh`, with `|dh|` = 8-15 degrees per step. The direction runs *from the ambient/shadow hue toward the key-light hue*.
- Example outputs:
  - "Teal, day": h 232 to 162, giving #031923 #063642 #0b585e #287d79 #5ea190 #97c3ac
  - "Violet, night": h 300 to 240, giving #181224 #2f2c49 #434a72 #576e9e #7195bf #96bdd9

**Wander will:**
- Generate ramps from this recipe. The light hue comes from the scene's light, not always yellow:
  - By day under overcast teal light, lights go toward cyan/sage (h about 160-190).
  - At night, lights go toward cold moon-blue (h about 240).
  - Shadows always go toward indigo/violet (h about 270-300), the ambient sky.
- Shift warm only near the fire and the eyes. This keeps warmth rare, as the mood brief demands.
- Keep the reference's straight teal ramp for the glow and haze, where a straight ramp reads as fog. Use shifted ramps for solid materials such as bark, stone and moss.

#### 7. Saturation peaks in the midtones and depends on hue
- **What the sources say:**
  - Slynyrd: saturation "peaks around the middle and never fully goes to 100, or 0". Decrease saturation at high brightness; darks keep more saturation than lights.
  - Pixel Parmesan: under neutral light, saturation peaks in the midtones. Each hue has a different value where it can be most saturated: yellow peaks high, red in the middle, blue low.
  - Apollo, measured: chroma peaks at step 4-5 of 6, then falls 0.02-0.05 on the top step.
- **Sources:**
  - https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes
  - https://pixelparmesan.com/blog/color-theory-for-pixel-artists-its-all-relative

**Wander will:**
- Clamp generated ramps to the sRGB gamut, with the chroma peak at 50-65% of the ramp.
- Put blue/violet ramps' chroma peak one step lower than green/yellow ramps.
- Keep the whole world's mean chroma low, around Apollo's 0.08 or below, so the saturated ember (C about 0.15+) is the most saturated thing on screen.

#### 8. Compress bands; flat planes are mostly one colour
- **What the sources say:**
  - saint11 (Shading):
    - Compress colour bands so the steps are harder to see.
    - Avoid gradients where possible; faces (planes) are "mostly one solid colour".
    - Shading concepts: key light, highlight, terminator, bounce light.
    - A projected shadow has a hard edge; a self-cast shadow has a soft edge.
  - Pixel Parmesan: fold core shadow, terminator, halftone and centre light into single shades to avoid banding and pillow shading.
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Shading.gif
  - https://pixelparmesan.com/blog/color-theory-for-pixel-artists-its-all-relative

**Wander will:**
- Shade procedural rocks and trunks as 2-3 flat planes: lit, base and shadow, with at most one bounce/rim colour on the backlit edge.
- Not shade them as smooth per-pixel gradients, which band and read as plastic.

### C. Clusters, lines and readable shapes

#### 9. Clusters over pixels: no orphans except deliberate accents
- **What the sources say:**
  - saint11 (Fundamentals 1):
    - Prefer few, large clusters.
    - Diagonal pixels do not connect well.
    - Orphan pixels (pixels not in a chunk) add noise.
    - Orphans are useful only for *strong details*.
    - When animating, keep track of clusters and avoid breaking them.
    - Repeating a pattern makes it easier to read; regular shapes are easier to recognise.
  - Slynyrd (Texture): orphan pixels "distract the eye and are usually avoided". Use a few simple clusters and "repeat these same clusters over and over but vary the pattern in which they are distributed". Leave empty areas where texture is implied.
  - cure: single pixels are "near-useless and meaningless if not touching pixels of the same color".
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Fundamentals.gif
  - https://www.slynyrd.com/blog/2018/2/15/pixelblog-2-texture
  - https://pixeljoint.com/forum/forum_posts.asp?TID=11299

**Wander will:**
- Run a **cluster clean-up pass** on every procedurally generated buffer:
  - Recolour any pixel whose 4 neighbours all have different palette indices to the majority neighbour.
  - Pixels tagged as intentional accents are exempt: eyes, spores, stars, embers.
  - Flag any same-colour region under 3 px, except tagged accents.
- Build textures from a small library of hand-drawn stamps (2x2 to 4x3 leaf blobs, grass tufts, bark grooves), scattered with variation. Never threshold raw per-pixel noise.

#### 10. Lines and curves: even step lengths, diagonal corners, no accidental 2x2 squares
- **What the sources say:**
  - saint11 (Fundamentals 2):
    - Regular straight lines have all steps the same length.
    - Irregular lines should repeat a pattern of *adjacent* numbers, e.g. 2,2,3,2,2,3.
    - For curves, each step is shorter than the previous until the "corner", then the steps grow again.
    - Line steps should always connect diagonally; side-by-side corners create a thicker point.
    - Pixels tend to form unintended big squares. Place colours in a brick-like pattern and "always look for imaginary squares".
  - cure: jaggies are any pixel breaking line flow. Fix them by adjusting segment lengths for uniform transitions.
  - Derek Yu: jaggies cannot be removed entirely, only minimised.
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Fundamentals2.gif
  - https://pixeljoint.com/forum/forum_posts.asp?TID=11299
  - https://derekyu.com/makegames/pixelart.html

**Wander will:**
- Rasterise ridgelines, branches and trunk edges with a step-pattern rasteriser: a Bresenham variant that limits run lengths to two adjacent integers per segment and changes run length monotonically along a curve.
- Make the clean-up pass also remove "L-corners", where a 1-px line has orthogonal neighbours at a turn.

#### 11. No pillow shading and no banding
- **What the sources say:**
  - cure: pillow shading "pays no attention to the light source, and conforms to the shape of the area rather than the form". Fix it by shading from the light direction.
  - cure: banding happens "when pixels line up" on the same rows or columns, making the grid evident. AA banding occurs when AA segments line up with the lines they buffer.
  - saint11 (Vegetation 1) explicitly marks a concentric pillow-shaded bush "AVOID".
- **Sources:**
  - https://pixeljoint.com/forum/forum_posts.asp?TID=11299
  - https://saint11.art/img/pixel-tutorials/Vegetation.gif

**Wander will:**
- Shade procedurally from a fixed light vector per scene (finding 22), never by distance-to-edge or erosion. Erosion-based shading is the procedural form of pillow shading.
- Offset the boundaries between ramp steps along a shape's contour by a per-row jitter of 0-1 px, so step edges do not stack in parallel bands.

#### 12. Foliage and canopies that read: silhouette, then light, then detail
- **What the sources say (saint11, Vegetation 1-3):**
  - Order of work: shape, then light, then detail.
  - Make a silhouette that is recognisable as a tree even without colour.
  - The light must show volume.
  - Warm light, cold shadow: "almost half of the gradient is light green".
  - Create resting areas for the eyes: **detailed borders, clear internal areas**.
  - Keep one leaf pattern for consistency. "Repeating patterns is a good way to avoid noise." Avoid orphan pixels. "Think in layers of foliage."
  - Each detail must be conscious: "don't throw random dots around". Big empty areas give focus to other areas.
  - Borders carry more detail and contrast.
  - Fade far vegetation toward the sky colour.
- **What the sources say (Slynyrd):**
  - Pixelblog 15: depict leafy texture with "just enough" clusters. "Too much variation will create displeasing noise." Allow negative space where inner branches show.
  - Pixelblog 62: grass clusters scale with depth. Near: thick blades. Mid: 1-2 px tall clusters. Far: no individual blades.
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Vegetation.gif
  - https://saint11.art/img/pixel-tutorials/Vegetation2.gif
  - https://saint11.art/img/pixel-tutorials/Vegetation3.gif
  - https://www.slynyrd.com/blog/2019/3/7/pixelblog-15-plant-life
  - https://www.slynyrd.com/blog/2026/5/27/pixelblog-62-landscape-backgrounds

**Wander will:**
- Build procedural canopies in three passes:
  1. **Silhouette**: union of 3-7 lobes with a scalloped edge, checked in 1-bit.
  2. **Light**: a lit cap on the light side and a shadow band underneath. The lit share is about 40-50% of the canopy.
  3. **Detail**: leaf stamps placed only within about 3-4 px of the silhouette edge and along lobe boundaries. Interiors stay flat.
- Use one leaf stamp family per species.
- Size leaf stamps by depth: near 3x2 to 4x3, mid 2x2, far none (flat silhouette).
- Give branches a few holes of negative space.

#### 13. What makes procedural pixel art look hand-made
This is a synthesis of findings 9-12 and of Slynyrd 2/15/62 and saint11 Vegetation/Rock:

- Consistent cluster *scale* per depth plane.
- Stamps (authored clusters) instead of per-pixel noise.
- Flat interiors with detail at edges.
- Silhouettes designed first.
- A small palette indexed by role.
- No orphans.
- A fixed light direction.
- Deliberate empty space.

Random per-pixel noise breaks every one of these rules at once.

- **Sources:**
  - https://www.slynyrd.com/blog/2018/2/15/pixelblog-2-texture
  - https://saint11.art/img/pixel-tutorials/Rock.gif
  - the sources of findings 9-12

**Wander will:**
- Treat noise functions only as *placement fields*: where a stamp goes and which lobe is bigger. Noise is never a colour source.
- Quantise any noise-driven colour choice with hysteresis, so boundaries make runs of at least 2-3 px.
- Have a test harness render every generator at 1x with a grayscale view and a cluster-size histogram. The share of 1-px clusters must stay under a threshold, for example 2% of non-accent pixels.

#### 14. Outlines: selective, darker than the darkest fill, and absent where light hits
- **What the sources say:**
  - saint11 (Outlines):
    - Outlines take space; avoid them at very low resolution.
    - Use them to separate shapes. An internal border can be lighter.
    - Selective outlining: a dark colour instead of black gives a softer outline. Remove the outline in lit areas for an even better effect, and use the outline to reinforce shading.
    - Pixel-perfect: start with a dirty line, then clean unwanted corners and fix 2 px lines.
  - Derek Yu: toward the light, use the lightest colours, or remove the outline where the sprite meets negative space. Use darker shadow colours, not black, for interior segmentation.
  - cure: sel-out is essentially AA against the background and only works where the background is known and consistent.
  - Pixel Parmesan: keep AA *inside* the sprite. If the background colour changes, exterior AA "may no longer read correctly".
  - Slynyrd (Rocks): small sprites get no outline.
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Outlines.gif
  - https://derekyu.com/makegames/pixelart.html
  - https://pixeljoint.com/forum/forum_posts.asp?TID=11299
  - https://pixelparmesan.com/blog/anti-aliasing-fundamentals-for-pixel-artists
  - https://www.slynyrd.com/blog/2019/1/22/pixelblog-13-rocks

**Wander will:**
- Give near-plane procedural objects (trunks, near rocks) a 1-px outline only on the shadow side and the bottom, in the plane's darkest role colour.
- Give mid and far planes no outlines; they separate by value.
- Do no exterior AA on anything that scrolls over changing backgrounds (all parallax layers and the wanderer). AA is interior only.
- Give the wanderer a dark navy outline (not black) that is dropped on the edge facing the scene's key light or glow.

#### 15. Darkness, silhouettes and backlight: the hooded figure's look
- **What the sources say:**
  - saint11 (Darkness), whose example is a hooded figure with a hidden face:
    - Blend dark areas into the background so the viewer completes them with imagination.
    - Order of work: general shape, light/shadow, strong light points, then a strong rim or back light.
    - "Shadows and silhouettes can be scarier than the real thing."
    - Each cluster must have a reason; avoid too much detail.
    - Keep the light direction always consistent.
    - On dark backgrounds use only one colour to keep a low contrast.
  - saint11 (Illumination):
    - Contre-jour backlight hides details and frames the object.
    - Make the background dark on the bright side of the central object.
    - Keep the backlight on the lit side "or the light will feel wrong".
  - saint11 (Character Design): the silhouette is "the prologue". Process: silhouette sketch, add details, animate.
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Darkness.gif
  - https://saint11.art/img/pixel-tutorials/IlluminationTechniques.gif
  - https://saint11.art/img/pixel-tutorials/Silhouette.gif

**Wander will:**
- Make the wanderer's hood interior the same index as the darkest scene colour, so the face merges into shadow, with only the two eye pixels in the warm accent.
- Give him a 1-px rim of the key-light colour on the side facing the glow, sun or moon. Mirror the rim when the light side changes; never rim both sides.
- Make his silhouette readable in 1-bit at 30-36 px: hood point, pack hump, stick and coat flare. Test it with a black-fill render.

### D. Dithering

#### 16. When to dither: skies and far haze only, in one pattern, never on the character
- **What the sources say:**
  - Pixel Parmesan:
    - "I would not recommend dithering for most character sprites, especially those that will need to be animated."
    - Dithering works for skies, clouds and large areas.
    - "The greater the contrast between the two colors you are blending, the more dithering steps you will need."
    - "Dithering is rarely, if ever, necessary in modern contexts."
  - saint11 (Fundamentals 1): "I avoid dither when I can"; dither can be useful for texture.
  - cure: patterns are 50/50 checkerboard, stylised, interlaced, or random. Avoid random, which is noise. Too much dither turns a transition into texture.
  - Derek Yu: dither works best on large uniform areas or rough textures.
- **Sources:**
  - https://pixelparmesan.com/blog/dithering-for-pixel-artists
  - https://saint11.art/img/pixel-tutorials/Fundamentals.gif
  - https://pixeljoint.com/forum/forum_posts.asp?TID=11299
  - https://derekyu.com/makegames/pixelart.html

**Wander will:**
- Dither only:
  - between *adjacent* sky-ramp colours;
  - in the haze or mist band between far planes;
  - optionally in the fade edge of fog veils.
- Use one ordered pattern project-wide. Dither bands are at least 6-8 native px tall, so the pattern reads as a transition, not texture.
- Never dither sprites, foliage or anything that animates frame by frame.

#### 17. Ordered (Bayer) dithering in the shader, anchored to the layer, not the screen
- **What the sources say:**
  - Surma: the Bayer level-0 matrix is `[[0,2],[3,1]]`. Higher levels follow `Bayer(n) = [[4B+0, 4B+2],[4B+3, 4B+1]]` with `B = Bayer(n-1)`. The 4x4 is therefore `[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] / 16`.
  - Bayer dithering is deterministic and per-pixel, so it is GPU-friendly. Error diffusion (Floyd-Steinberg) is sequential.
  - Bayer has a brightening bias, and thresholds should be computed in linear light, because sRGB 0.5 is not perceptual 50%.
  - Return of the Obra Dinn (via Zucconi): a screen-space dither pattern "moves erratically" (the shower-door effect) when the camera moves. Lucas Pope fixed it by pinning the pattern to the world (a sphere around the camera) rather than the screen.
- **Sources:**
  - https://surma.dev/things/ditherpunk/
  - https://www.alanzucconi.com/?p=10365 (secondary; Pope's TIGSource post returned 403)

**Wander will:**
- In the sky and fog shader, map a continuous value t (OKLab L or the gradient parameter) to two adjacent palette indices `i = floor(t*(n-1))` and `f = fract(...)`.
- Output `f > bayer4[(x_layer & 3) + 4*(y_layer & 3)] ? i+1 : i`, where `x_layer, y_layer` are *integer native-pixel coordinates in that layer's scrolled space*. The pattern then travels with its layer and does not crawl.
- Leave the sky layer, which does not scroll, in screen space.
- Never let gradient parameters drift every frame. Day/night changes update the palette, not t, so dither boundaries do not shimmer over long sessions.

### E. Animation

#### 18. Sub-pixel animation: motion smaller than one pixel through colour, not position
- **What the sources say (saint11, Subpixel):** the example figure is a long-coated, faceless figure with glowing eyes, very close to Wander's wanderer.
  - "You can't [move less than one pixel], but you can fake some very subtle movements."
  - Move part of the object first; too many steps make it look bent.
  - Create an extra pixel, then slide it through the line.
  - Move the interior after or before the silhouette.
  - Use a dark colour near borders.
  - Use line-breaking points (the kinks in a line) to convey movement.
  - Fade colours for an illusion of less than 1 px movement.
  - "Too many colors makes everything look blurry."
  - "Mostly move light, avoid moving shapes."
  - "The silhouette barely changes."
- **What the sources say (others):**
  - saint11 (Idle): "move the contents of the face/body after the silhouette has moved". With 6 frames, add secondary animation and lots of sub-pixel movement.
  - Pixel Parmesan: for small sprites, a whole-pixel shift is too much, so use colour shifts across frames.
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Subpixel.gif
  - https://saint11.art/img/pixel-tutorials/characterIdle.gif
  - https://pixelparmesan.com/blog/anti-aliasing-fundamentals-for-pixel-artists

**Wander will:**
- Animate breathing, the coat hem in light wind and the hood edge mostly through interior colour changes: a shadow fold shifts or a highlight pixel slides along an edge, with the silhouette fixed or moving at most 1 px.
- Cap sub-pixel tween colours at the existing ramp neighbours. No new colours are added for in-betweens.

#### 19. Coat in the wind: a travelling sine wave offset downwind, with lights and shadows moving away from the wind
- **What the sources say:**
  - saint11 (Fabric), again illustrated with a red-hooded, glowing-eyed figure:
    - Fabric in the wind moves in a sine-wave pattern, offset in the wind's direction.
    - Draw a line as a guide.
    - "Light and shadow should move away from the wind source."
    - Avoid too many folds; dark areas have less detail.
    - Move the cloth but respect the anatomy below.
    - Most fabric has soft shadows and no highlights.
    - Folds run parallel where tension is greater and perpendicular where it is less. Folds radiate from compression points and cast shadows on the fabric.
  - Slynyrd (Wind):
    - Flags: "flow points are 12 pixels apart, and they move 2 pixels a frame for a 6 frame loop".
    - Hair uses the same wave plus secondary motion.
    - Foliage sway: up-right 1, down 1, left 1, one wave per loop, at 0.2 s per frame.
    - Falling leaves are 2x2 particles moving 1 px per frame, with the top half dropped every other frame to flutter.
    - Wind reads best with leaves, debris or dust.
  - saint11 (Wind): "We can't see the air moving, so use dust, foliage and other particles."
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Fabric.gif
  - https://www.slynyrd.com/blog/2021/7/16/pixelblog-33-wind-effects
  - https://saint11.art/img/pixel-tutorials/Wind.gif

**Wander will:**
- Author coat-wind frames in Aseprite as a wave of 2-3 flow points travelling from the shoulders to the hem. Points sit about 6 px apart at this sprite scale; the hem moves 1 px per frame, in a 6-frame loop at about 120-160 ms per frame.
- Hold the shoulders fixed; only the lower half of the coat moves.
- Layer the coat wave over the walk cycle with a *different loop length* (finding 23).
- Pair strong wind with a few drifting 1-2 px leaves or dust motes, so the wind is visible in the world, not only on the coat.

#### 20. Smoke, embers and fire: animate one particle at a time, bright at the base, fade by palette steps
- **What the sources say:**
  - saint11 (Smoke):
    - "Animate a single particle, go back and do another until the smoke is done."
    - Focus on one element at a time.
    - "Avoid breaking the shape too much or it will look like noise."
    - The first frame of a puff can be a contrast frame.
  - saint11 (Fire):
    - Fire is about flow.
    - Each wave starts brighter at the bottom.
    - Start new waves every 2-3 frames.
    - Flame speed is higher in the middle.
    - The wave top fades in a pointy shape; bright colours come from the bottom.
    - Avoid breaking the shape too early.
    - "Ember flicks and moves slightly." Small moves.
  - saint11 (Motion Blur): lighter colours "bleed" over darker ones, and darker colours are used for fading.
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/SmokeSheet.gif
  - https://saint11.art/img/pixel-tutorials/Fire.gif
  - https://saint11.art/img/pixel-tutorials/MotionBlur.gif

**Wander will:**
- **Cigarette smoke:** a code-driven particle stream of single 1-px puffs that rise about 1 px per 120-200 ms.
  - Each puff drifts downwind on a slow sine, grows to a 2-3 px cluster, then fades by stepping down the haze ramp (palette steps, never alpha).
  - Puffs are emitted only after a drag and on the exhale.
- **Ember on the drag:** steps through 3 accent colours: dull red, orange, then pale yellow for 2-3 frames.
- **Campfire:** an authored 6-8 frame loop following saint11's rules, plus code-driven ember sparks of 1 px that rise with sideways jitter of 1 px.

#### 21. Walk cycle at 30-36 px: 8 frames, about 160-180 ms each, 1 px bob
- **What the sources say:**
  - saint11 (Walk):
    - 12 frames gives fluid animation (6 per leg). 6 frames is "useful in low resolution" (3 per leg).
    - Key frames are 1 contact (front foot touches the ground), 2 down (impact lowers torso and head), 3 down+ (lowest frame, widest arm swing), 4 prepare passing ("I added a head delay"), 5 passing, 6 up (highest point).
    - "Arms always move with the opposite leg; the leg on the ground always moves towards the back."
    - The GIF plays at 100 ms per frame.
    - **Measured**: the figure is about 41 native px tall; the head bob is 2 px peak-to-peak (pattern 0,0,+1,+1,0,-1 px per half-cycle).
  - Slynyrd 50:
    - 8 frames is "the optimum"; 4 frames captures the keys but feels lacking; 6 is a middle ground.
    - Poses: contact (lowest, limbs at extremes), down (foot flat, back foot lifts), passing (legs cross, tallest), swing.
    - The head traces "a triangle shaped wave" rather than a sine.
  - Slynyrd 8: an 8-frame run at 80 ms per frame. Dropping to 4 frames needs 160 ms per frame to keep the same speed, and too many frames "leach the energy".
  - Richard Williams' timing chart (via Monmouth University's summary) at 24 fps:
    - 12 frames per step (0.5 s) is a brisk, natural walk.
    - 16 frames per step (0.67 s) is a stroll.
    - 20 frames per step (0.83 s) is an elderly or tired walk.
  - Slynyrd 47: at tiny sizes "much of the expression comes through in the animation"; shifting 1-2 px reads as a head turn or posture change.
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Walk.gif
  - https://www.slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle
  - https://slynyrd.com/blog/2018/8/19/pixelblog-8-intro-to-animation
  - https://animation.monmouth.edu/instruct/?p=351 (secondary; the book itself was not read)
  - https://www.slynyrd.com/blog/2023/11/26/pixelblog-47-tiny-pixels

**Wander will:**
- **Frames:** author an 8-frame walk: contact, down, passing, up, then the same four for the other leg.
- **Timing:** about 170 ms per frame, a 1.36 s cycle or 0.68 s per step. That sits between Williams' "stroll" and "tired": an unhurried, weary pace.
- **Bob:** head and pack bob 1 px (down on frames 2/6, up on 4/8), following a triangle wave, not a sine.
- **Arms and stick:** the free arm swings 1-2 px. The walking stick plants on one contact frame per cycle, every second step.
- **Coat:** the hem lags the body by 1 frame (it reaches its extreme one frame after the legs).
- **No foot sliding:** world scroll per frame equals the planted foot's backward travel in sprite space, measured from the authored frames and stored in the atlas JSON as `stridePx`.
- **Speed and stride variety:** change speed by scaling frame duration ±15% together with scroll speed. Author a second "weary" cycle (shorter stride, deeper down pose, head lower) instead of stretching one cycle.
- Avoid going below 6 frames. Saint11's 6-frame layout (contact, down, down+, passing, up) is the fallback if 8 frames look too busy at 30-36 px.

#### 22. Idle, sit, smoke and sleep poses: small, uneven, offset motions
- **What the sources say:**
  - saint11 (Character Idle):
    - 2 frames: down 1 px with open arms and bent knees, then up 1 px; the character does not change mass.
    - 3 frames: the middle frame slows the fall and smooths the head by delaying the face.
    - 6 frames: secondary animation such as hair lag, plus sub-pixel movement.
    - Move the face/body contents *after* the silhouette moves.
    - "Vertical movement alone is boring": let horizontal compensate vertical.
    - Idles are the place for personality: blink, yawn, look around, scratch.
  - Slynyrd 52: an 8-frame idle where frames 1-4 run at 100 ms and frames 5-8 at 50 ms ("the illusion of gravity"). Head and torso rise 1 px while hands move up to 4 px. Cloth and hair make "small sub movements".
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/characterIdle.gif
  - https://www.slynyrd.com/blog/2024/9/26/pixelblog-52-idle-fighting-stance

**Wander will:**
- **Standing idle:** 4-6 frames with uneven holds, slow rise and quicker fall. The 1-px chest/pack rise leads; the hood follows 1 frame later. Breathing period is about 3-4 s (my choice, not from a source).
- **Look-around:** a rare one-shot. The hood turns 1 px, the eyes shift 1 px, it holds, and returns.
- **Sitting smoke:**
  - The hand rises in 3-4 frames with an ease-in, so the last step is the smallest.
  - Hold at the mouth while the ember brightens (finding 20).
  - Lower the hand in 2-3 frames, then exhale (smoke emission).
- **Lying and sleeping:** a 2-frame breathing loop of 1 px on the coat's upper edge, about 4-5 s per breath (my choice, not from a source). An eye-closed state removes the eye pixels.
- **Transitions:** every pose transition (stand to sit, sit to lie) is an authored one-shot of 3-6 frames. Poses never snap.

#### 23. Hours-long loops: layered loops of different lengths, started at random offsets
- **What the sources say (saint11, Seamless Looping):**
  - "Making animations with different durations confuses the eye and makes it harder to see when the loop starts over."
  - An animation can have more frames than its file has frames if parts are cloned with different timings.
  - "Avoid starting all loops on the same frame. I like to make the loops start at random frames."
- **Source:** https://saint11.art/img/pixel-tutorials/loop.gif

**Wander will:**
- Give every ambient loop a co-prime period (in ms or frames): coat wave, breathing, foliage sway, fire, water glints, firefly blinks.
- Start each instance at a random phase.
- Jitter its period by ±5-10% per instance. Nothing then lines up for a viewer leaving the game running for hours, and repetition is far harder to spot.

### F. Pixel-grid integrity

#### 24. One pixel size everywhere: integer scale only, and 640x360 is the right native resolution
- **What the sources say:**
  - Slynyrd 5: scale "only by whole number multiples" with "no anti-aliasing". An arbitrary 193.5% distorts the pixel units.
  - saint11 (Resizing): "scaling and rotating pixel art should always be avoided; to do it properly there's no easy escape, you need to redraw it". At lower resolutions you must choose which details matter.
  - Unity's Pixel Perfect Camera renders the scene into a texture at the reference resolution and upscales it, which gives "unaliased and unrotated pixels". Its "crop frame" letterboxes to keep integer scale.
- **Integer-scale arithmetic (my own):**

  | Native | 720p | 1080p | 1440p | 2160p |
  |---|---|---|---|---|
  | 640x360 | 2x | 3x | 4x | 6x |
  | 480x270 | not integer (2.67x) | 4x | not integer (5.33x) | 8x |

  So 480x270 needs letterboxing at 1440p, and 640x360 does not.
- **Sources:**
  - https://www.slynyrd.com/blog/2018/5/16/pixelblog-5-back-to-basics
  - https://saint11.art/img/pixel-tutorials/Resizing.gif
  - https://docs.unity3d.com/Packages/com.unity.2d.pixel-perfect@2.0/manual/index.html

**Wander will:**
- Render everything into a 640x360 RGBA framebuffer (or 8-bit indexed plus a palette LUT), then blit it with `NEAREST` filtering at `scale = floor(min(W/640, H/360))`.
- Use the leftover screen area to **extend the world** rather than add black bars: native width = `floor(W/scale)` and height = `floor(H/scale)`. A 1920x1200 screen then gets 640x400 native.
- Accept letterbox bars only for leftovers of a few screen pixels.
- Never scale or rotate a sprite on the GPU.
- Keep the wanderer at 30-36 px, so 8-10% of 360 rows.

#### 25. Sway and rotation without mixels: whole-pixel shears, pre-baked frames, or a pixel-art rotation at native resolution
- **What the sources say:**
  - Slynyrd (Wind): foliage sways by whole-pixel moves (1 px up-right, 1 down, 1 left) at 0.2 s per frame.
  - saint11 (Resizing): avoid rotation; redraw instead.
  - When rotation is unavoidable, pixel-art-aware algorithms keep clusters:
    - The RotSprite-like approach upscales with Scale2x (neighbour-similarity rules), rotates, then downsamples with nearest.
    - torcado's cleanEdge (GLSL, MIT licence) "prioritizes lines and edges" when rotating or scaling. It works best on clean lines and poorly on dithering.
  - Unity's pixel snapping snaps renderers to the world grid so sprites "move in pixel-by-pixel increments".
- **Sources:**
  - https://www.slynyrd.com/blog/2021/7/16/pixelblog-33-wind-effects
  - https://saint11.art/img/pixel-tutorials/Resizing.gif
  - https://godotshaders.com/shader/rotsprite-like-algorithm-for-cleaner-pixel-art-rotation
  - https://torcado.com/cleanEdge/
  - https://docs.unity3d.com/Packages/com.unity.2d.pixel-perfect@2.0/manual/index.html

**Wander will:**
- **Grass and reeds:** sway as a per-row shear computed in native pixels:

  ```
  dx(y) = round(A * w(y) * sin(t*ω + φ(x)))
  ```

  Here w(y) is 0 at the root and 1 at the tip, A is at most 1-2 px, and φ(x) is a travelling phase so gusts roll across the field.
  - The shear is applied in the native framebuffer pass (or the generator re-rasterises), so pixels only ever move by whole native pixels.
  - Rounding uses hysteresis so a blade does not flicker between two offsets.
- **Tree canopies:** whole-lobe 1-px offsets in a slow 3-4 pose cycle, as in Slynyrd's sway. No rotation.
- **Rare rotating objects** (a falling leaf, a swinging lantern): pre-bake rotation frames offline at native resolution with cleanEdge or RotSprite, then clean them up by hand in Aseprite if needed.
- **Vertices** of any geometry drawn into the native buffer are snapped to integer native coordinates in the vertex shader: `floor(pos + 0.5)`.

#### 26. Smooth slow scrolling at 3-6x without breaking the grid
- **What the sources say:**
  - yal.cc's smooth pixel-perfect camera:
    - Render the view **1 px wider and taller**.
    - Keep the camera's internal coordinates rounded so objects do not wobble.
    - When drawing the upscaled surface, offset it by the *fractional* camera position.
    - Caveat: parallax layers need their own surfaces to stay smooth.
  - Slynyrd 23 (pixel-perfect parallax):
    - Every layer moves an integer number of px per frame, e.g. the farthest at 1 px per frame and nearer layers at faster integer rates.
    - Loops repeat in a frame count equal to the canvas width.
    - Overlaid animations loop in a divisor of the total.
    - Balanced layers "without dominant points of interest help hide the repeating images".
- **Sources:**
  - https://yal.cc/gamemaker-smooth-pixel-perfect-camera/
  - https://www.slynyrd.com/blog/2019/11/12/pixelblog-23-parallax-scrolling

**Wander will:**
- Treat the scroll as the main motion, because the wanderer walks for hours.
- Compose each parallax plane at native resolution with integer offsets into a 1-px-oversized native buffer.
- Then present each plane with its *own* fractional offset times the scale, in whole screen pixels:
  - At 6x the far ridge then glides in 1/6-native-px screen steps instead of juddering 6 screen px every few hundred ms.
  - Pixels inside a layer keep a single size; only the layer's sub-native offset is fractional.
- Lock the near ground layer (the one the feet touch) to integer native pixels, so it stays in step with the foot plant (finding 21).
- Keep tileable far layers "balanced, without dominant points of interest" per Slynyrd, because they repeat for hours.

### G. Rendering procedural trees, rocks and grass

#### 27. A consistent light direction and atmospheric perspective by depth
- **What the sources say:**
  - Slynyrd 6:
    - Set the light source early. Top-right or top-left primary light is natural.
    - A clear atmosphere gives hard, crisp shadows; haze or cloud cover gives soft, diffuse shadows.
  - saint11 (Darkness): "keep the light direction always consistent". Find cast shadows with two lines from the light to the object's edges.
  - Slynyrd 62:
    - "The closest plane is the most saturated with strongest contrast…saturation reduces with each receding plane, while lightness increases" in daylight.
    - Hues shift toward the sky colour with distance.
    - Distant clouds are baked into the sky.
  - saint11 (Parallax):
    - Close: high saturation, high contrast, bright, hot, many details.
    - Far: low saturation, low contrast, darker, cold, few details, fading to the sky colour.
    - Saint11 marks his table with "there are exceptions". Note that he puts far planes *darker* while Slynyrd puts them *lighter* by day. Both converge on "toward the sky colour".
  - saint11 (Clouds):
    - Build clouds from groups of spheres with a flat base.
    - Flat colour for the base, hue-shift the shadows, low contrast.
    - With the sun behind, clouds get a bright outline.
    - Far clouds are faded; close clouds have strong contrast.
- **Sources:**
  - https://www.slynyrd.com/blog/2018/6/15/pixelblog-6-light-and-shadow
  - https://saint11.art/img/pixel-tutorials/Darkness.gif
  - https://www.slynyrd.com/blog/2026/5/27/pixelblog-62-landscape-backgrounds
  - https://saint11.art/img/pixel-tutorials/Parallax.gif
  - https://saint11.art/img/pixel-tutorials/CLouds.gif

**Wander will:**
- **One light vector per scene**, used by every generator (trees, rocks, ridges, the wanderer's rim): upper-left by default, or *backlight* in the forest, where the glow sits behind the trunks.
- Day and night change the palette (light hue, ambient hue), not the baked light direction. Re-baking shading from a moving sun would cause visible popping in clusters.
- **Each depth plane gets its palette** by moving the ramp toward the current sky/haze colour in OKLab:
  - The far plane gets about 60-75% of the way, with 2 colours.
  - Mid gets about 30-40%, with 3 colours.
  - Near gets 0%, with 4-5 colours.
  - In daylight the far plane is lighter; at night and under the forest canopy it is darker. Both follow "toward the sky colour".
- **Clouds:** flat-based sphere clusters. The farthest are baked into the sky gradient.

#### 28. Rocks and trunks: silhouette first, a few planes, cracks in the shadow colour
- **What the sources say:**
  - saint11 (Rock formations):
    - Start with the silhouette, add base shadows, add more layers with softer shadow, add highlight areas, add back light and reduce noise, then add crumbling parts.
    - Careful: avoid orphan pixels and noise, and don't use too many colours on details.
    - Sedimentary rock is layered and crumbly, with big soft highlights.
    - Metamorphic rock has strong highlights, breaks in larger chunks, and keeps large clean areas.
    - Igneous rock is rounded and porous, with soft highlights.
  - saint11 (Vegetation 2-3):
    - Trunks: define light and dark areas, add texture (cracks, lumps), add light points, and add a backlight of a different colour, one colour at a time.
    - Wood texture is "many almost parallel grooves".
    - Cracks use the shadow colour and do not appear in low-contrast areas.
    - Slimy plants fall in arches.
  - Slynyrd 13: tiny rocks get no outline. Rock colour must match the setting (a "palette swap might do the trick").
- **Sources:**
  - https://saint11.art/img/pixel-tutorials/Rock.gif
  - https://saint11.art/img/pixel-tutorials/Vegetation2.gif
  - https://saint11.art/img/pixel-tutorials/Vegetation3.gif
  - https://www.slynyrd.com/blog/2019/1/22/pixelblog-13-rocks

**Wander will:**
- **Rock generator:**
  1. A polygon silhouette with 5-9 facets.
  2. Each facet takes one flat ramp colour from its normal and the scene light (2-3 planes).
  3. Cracks go only inside shadow planes, in the shadow colour, as 1-px lines of 2-5 px.
  4. Lit planes stay clean. A 1-px backlight rim goes on the glow-facing edge.
- **Rocks per biome:** the same generator with a different stone ramp (palette swap), with facet styles per rock type.
- **Trunk generator:**
  - Bark grooves as near-parallel vertical 1-px runs, only in the base and shadow bands.
  - Lit band clean.
  - A rim in the backlight colour on the glow side.

---

#### Sources that could not be accessed, or were used only second-hand
- **saint11:** `https://saint11.org/blog/pixel-art-tutorials/` now redirects to `https://saint11.art/blog/pixel-art-tutorials/`. That page lists only GIFs, so all saint11 content above was read from the images themselves.
- **AdamCYounis, MortMort, Brandon James Greer:** their teaching is YouTube video with no text version found, so nothing of theirs was read. Apollo's ramp structure was measured from the palette itself; Lospec's Apollo page has no author description.
- **Lucas Pope's TIGSource dithering post:** HTTP 403. Alan Zucconi's summary was used instead.
- **Alx Preston (Hyper Light Drifter) interview on unwinnable.com:** HTTP 403.
- **Hollywood Reporter Blasphemous interview:** paywall redirect.
- **No text source found** for Eastward's or Owlboy's art pipelines.
- **Paul Robertson:** his advice ("strong and extreme key frames…if it doesn't have awesome keys, it'll still look shoddy"; animate hair and clothing for life) comes only via a Game Developer article: https://gamedeveloper.com/art/5-tips-for-making-great-animations-for-2d-games
- **Richard Williams' *Animator's Survival Kit*:** the book was not read. Its walk-timing chart comes via Monmouth University's teaching page.
- **Low-confidence sources, not relied on:** a "mixels" definition from community pages, and walk/idle timing numbers on sprite-ai.art (aggregator).
- **Web search** hit this session's budget near the end, so a planned search for a primary source on per-row grass shearing shaders was not made. Finding 25's shear recipe is my own synthesis from Slynyrd's whole-pixel sway rule.

---

## Light and time of day

Research for Wander's light, sky and day/night cycle. The target is a 640x360 indexed pixel-art world under a full-resolution atmosphere layer, in WebGL2, with one in-game day per real hour. Each finding gives a number, colour or formula, the source I actually read, and what Wander will do with it.

The two most useful sources are primary data I pulled and measured myself:
- **Mark Ferrari's own Living Worlds palette timelines.** These are the scene files behind Joseph Huckaby's HTML5 player at effectgames.com/demos/worlds. I parsed their keyframe times and measured the painted sky and shadow colours at each key.
- **The keyframe table of `skygrad`.** It is a small open-source library that stores hand-tuned sky colours per sun elevation and blends them in Oklab.

Other numbers marked "computed" come from my own scripts, run on the cited formulas.

### The plan in one paragraph

- **Sun elevation drives everything, not the clock.** The real hour is warped so twilight lasts much longer than it would in nature.
- **The world grades by palette, not by multiplying.** The art is indexed, and every palette index gets its own colour per time key, the way Ferrari did it. The keys are interpolated in Oklab and baked into a small "palette x time" texture.
- **The sky is hand-keyed.** Zenith and horizon colours plus a sun-glow lobe are set per sun elevation, not taken from a physical model.
- **Lights are quantized on the 640x360 grid.** Fire, lantern, ember and windows are computed at native resolution, cut into a few steps, and applied by raising pixels along their colour ramp, with flicker in 10 Hz steps.
- **Bloom, fog glow, rim and dithering live in the full-resolution atmosphere layer**, and stay subtle.
- **Night is a blue-violet shift with silhouettes against a lighter sky.** Detail drops, and a few warm practical lights stay warm.

---

### A. Time and the sun

**1. Twilight angles, and how short twilight really is in a one-hour day**
- **Civil twilight:** the sun is 0° to −6° below the horizon. Artificial light is not needed, the horizon is clear, and the brightest stars appear.
- **Nautical twilight:** −6° to −12°. Only the outlines of the ground can be told apart.
- **Astronomical twilight:** −12° to −18°. After that the sky is fully dark.
- **Blue hour:** the blue is strongest with the sun 4° to 8° below the horizon. It comes from ozone (Chappuis) absorption, not Rayleigh scattering, and lasts about 20 to 96 minutes.
- **Golden hour:** daylight is about 3500 K in golden hour, against about 5500 K at midday and about 2000 K at sunrise or sunset. Photographers usually define it as the sun between +6° and −4°. That convention is from photo-planning sites I could not open (403), so treat it as convention.
- **Computed:** I used the standard elevation formula `sin e = sin φ sin δ + cos φ cos δ cos H` at 50°N on the equinox. Over a 24 h day the sun spends:

  | Band | Minutes per 24 h | Real time in a 60-minute day |
  |---|---|---|
  | Below −18° (night) | 490 | 20.4 min |
  | −18° to −12° (astronomical) | 79 | 3.3 min |
  | −12° to −6° (nautical) | 76 | 3.2 min |
  | −6° to −4° (blue hour) | 25 | 1.0 min |
  | −4° to +6° (golden hour) | 125 | 5.2 min |
  | Above +6° (day) | 645 | 26.9 min |

  So with a one-hour day, each blue hour lasts about **31 seconds** and each golden hour about **2.6 minutes**. The most beautiful phases fly past.
- Sources: https://en.wikipedia.org/wiki/Twilight, https://en.wikipedia.org/wiki/Blue_hour, https://en.wikipedia.org/wiki/Golden_hour_(photography)

**Wander will:** compute one value, `sunElevation` in degrees, from a warped clock, and drive every light and colour from it. The 60 real minutes will be shared out by elevation band:

| Phase | Real minutes |
|---|---|
| Night | 17 |
| Dawn twilight (−18° to −6°) | 4 |
| Morning blue hour | 2 |
| Morning golden hour | 4 |
| Day | 18 |
| Evening golden hour | 6 |
| Evening blue hour | 4 |
| Dusk twilight | 5 |

The warp is a piecewise-linear map from the real minute to elevation, and it is monotonic within each half day. The evening gets more time than the morning, because the mood is melancholic.

**2. Mark Ferrari puts his palette keys where the light changes, not on the hour**
- **How the player works.** It treats the day as 0 to 86 399 seconds. Each frame, `setTimeOfDayPalette()` finds the nearest key before and after the current time, wrapping round midnight. It then fades all 256 colours with an integer RGB lerp, `c = a + (b − a)·t/T`, and colour-cycles the result. Each scene is one flat 640x480 image with one 256-colour palette and no layers.
- **Measured keyframe times:**
  - **January, "Winter Forest":** 37 keys, 36 different palettes.
    - 06:50 to 09:30: 17 keys, every 5 to 15 minutes.
    - 09:30 to 15:45: 5 keys, 60 to 90 minutes apart.
    - 15:45 to 18:05: 15 keys, every 5 minutes.
    - **A single night palette is held for 12¾ hours** (18:05 to 06:50).
  - **September, "Seascape":** 21 keys, 15 palettes.
    - Keys every 15 to 30 minutes from 06:15 to 07:45 and from 18:15 to 19:30.
    - Midday keys sit 1 to 2 hours apart.
    - Night is held from 19:30 to 06:15.
  - **April, "Deep Forest":** a sequence of 16 palettes, 15 seconds apart, at 07:30 (and reversed at 18:15). That is a fast four-minute "event" sweep, perhaps a beam of light, on top of the slow keys.
- Sources: http://www.effectgames.com/demos/worlds/ (I read `main.js`, `palette.js` and `scenes.js`, and parsed `cache/V26-01January-janclrscpt.js`, `V29-09September-SEPTCLRCUMSCPT.js` and `V30-04April-aprclrscpt.js`). Background on the technique, including BlendShift cycling: https://en.wikipedia.org/wiki/Color_cycling

**Wander will:** key its palettes by sun elevation, densely between +10° and −12° (about every 1° to 2°) and sparsely at noon and at deep night. Its key count will be of the same order as Ferrari's, about 20 to 36 keys per biome per day, mostly in twilight. It will also allow short palette "events", such as sun breaking through fog or a lightning flash, as quick key sequences.

---

### B. Grading the world without mud

**3. Multiplying by an ambient colour is the common baseline, and its limit is plain in Ferrari's data**
- **What Alto's Adventure does.** Harry Nesbitt tints the whole scene through Unity's ambient colour on "lit" shaders: "white-ish during daytime, orange at sunset, blue at night". The sky, sun and moon use separate unlit shaders with their own colours. He blends "fog colour, fog density, sun flare, star brightness etc for different times of day". His Dribbble post describes a rotating sky plane plus preset colour schemes (directional, ambient, fog) for dawn, day, dusk and night, per weather, blended in real time. Godot's `CanvasModulate` is the same idea: a base "ambient" colour that lights then add on top of.
- **Why that is not enough (measured from Ferrari's Winter Forest, in Oklab):**

  | Time | Sky | Tree trunks |
  |---|---|---|
  | Noon | `#8fb3e3`, L 0.76, chroma 0.08, hue 256° (blue) | `#2b1b17`, L 0.24, hue 35° (warm brown) |
  | 17:15 | `#c387ef`, L 0.72 (almost as bright), chroma 0.16 (doubled), hue 310° (violet) | `#07000b`, L 0.095, hue 318° (violet-black) |

  Between noon and dusk the sky keeps its brightness and gets more colourful, while the land falls into silhouette, and both turn violet. A single multiply darkens everything by the same factor and keeps the hues, which is the "muddy" look.
- Sources: https://discussions.unity.com/t/2d-day-night-cycle-and-weather-system-a-la-altos-adventure/611522 (Nesbitt's replies). https://dribbble.com/shots/1578755-Dynamic-Lighting-System would not render, so its description is quoted from the search snippet. https://docs.godotengine.org/en/stable/tutorials/2d/2d_lights_and_shadows.html. The Ferrari data as in finding 2.

**Wander will:** never darken the world with a plain RGB multiply. Each palette entry will get its own colour per key, so the sky and the land can move in opposite directions in value.

**4. Each palette index gets its own colour per time key, baked into a "palette x time" texture**
- This is Ferrari's method made general. It keeps pixel art coherent because every pixel on screen is always one of the frame's N palette colours.
- **The WebGL2 recipe:**
  - The art is an `R8` (or `R8UI`) index texture.
  - The palette over the day is a `N x K` RGBA8 texture: N palette entries, K time keys.
  - The shader looks up the index, then samples that row at `v = keyCoord(sunElevation)`. Either let `LINEAR` filtering run along the time axis only (store entries at texel centres and use a `NEAREST`-safe u), or pick two rows and `mix`.
- **Better: bake the in-between rows on the CPU in Oklab** (finding 7), for example 256 rows per day, and leave the GPU on `NEAREST` in u and `LINEAR` in v.
- Wander already has role ramps of five steps each (sky, glow, ground, foliage, earth, stone, water and accent in `src/palette.ts`). So `index = role*5 + step` gives 40 to 64 entries per biome, which is a tiny texture.
- Source: Ferrari and Huckaby's `palette.js` fade function and timeline code (finding 2).

**Wander will:** author its art as indexed, from Aseprite indexed mode, and grade through a per-biome palette-by-elevation texture. A biome's look per hour then becomes a hand-editable table of hex values, Ferrari-style. This is the main grading mechanism.

**5. Gradient maps for anything that is not indexed: particles, fog sprites, the glow layer**
- A gradient map takes a pixel's luma (`dot(rgb, vec3(0.2126, 0.7152, 0.0722))`) and uses it as u into a ramp texture. Several ramps are stored as rows of one atlas (for example 4 ramps of 64x1), and the row is chosen by v: `texture(gradient, vec2(luma, row))`. Phaser 4 ships the same thing as `FilterGradientMap`.
- To use this for time of day, interpolate v between the two neighbouring time-key rows.
- Sources: https://forum.defold.com/t/gradient-map-shader-sample-project/81188, https://docs.phaser.io/api-documentation/class/renderer-webgl-rendernodes-filtergradientmap (search summary only)

**Wander will:** colour non-indexed effects with luma-to-ramp gradient maps. There is one ramp row per time key and per layer kind (mist, smoke, rain, spores), so they always land on colours that belong to the current hour.

**6. A final 3D LUT per time key, kept subtle, for the full-resolution composite**
- **GPU Gems 2, ch. 24:** a 32x32x32 LUT is enough, and trilinear lookup is "typically sufficient for color processing". You must correct the sampling coordinate or the edges clamp: `coord = (N−1)/N · c + 1/(2N)`. Without this, 8-bit data on a 32³ LUT is effectively clamped to the range [4, 251]. For HDR input, put a 1D "shaper" (for example a log curve) in front of the LUT.
- **WebGL2** supports `gl.TEXTURE_3D` through `texImage3D`, so two LUTs can be bound and mixed: `mix(texture(lutA,c'), texture(lutB,c'), t)`.
- Sources: https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-24-using-lookup-tables-accelerate-color, https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/texImage3D

**Wander will:** use 16³ or 32³ LUTs only as the last unifying grade over the art, bloom and fog, with one LUT per macro phase (night, blue hour, golden hour, day, overcast). They are blended by elevation, with the half-texel correction. The palette texture (finding 4) does the heavy lifting. The LUT stays near identity, so the art's palette stays readable.

**7. Interpolate the keys in Oklab, not in RGB**
- Oklab predicts lightness, chroma and hue "well". When blending white to blue, CIELAB, CIELUV and HSV "all show hue shifts towards purple", but Oklab stays even.
- **The exact forward transform:**
  - First, from linear sRGB to LMS:
    - `l = 0.4122214708 r + 0.5363325363 g + 0.0514459929 b`
    - `m = 0.2119034982 r + 0.6806995451 g + 0.1073969566 b`
    - `s = 0.0883024619 r + 0.2817188376 g + 0.6299787005 b`
  - Then take the cube root of each.
  - Then:
    - `L = 0.2104542553 l' + 0.7936177850 m' − 0.0040720468 s'`
    - `a = 1.9779984951 l' − 2.4285922050 m' + 0.4505937099 s'`
    - `b = 0.0259040371 l' + 0.7827717662 m' − 0.8086757660 s'`
  - The inverse is in the same post.
- `skygrad` blends its sky keys in Oklab "so the midpoints between stops look right instead of going muddy the way naive RGB interpolation does".
- Ferrari's integer RGB lerp works only because his keys are 5 minutes apart. Wander's keys will be sparser.
- Sources: https://bottosson.github.io/posts/oklab/, https://thebuild.com/blog/skygrad-a-place-and-a-time-rendered-as-sky/

**Wander will:** bake every key-to-key interpolation (palette rows, sky stops, LUTs) in Oklab on the CPU at load, so the GPU only does lookups.

**8. Fog colour per depth from a ramp texture, with alpha for density (Firewatch)**
- Jane Ng's GDC 2015 Firewatch talk, as reconstructed by Harry Alisavakis: Firewatch "used color ramp textures to map the colors of the fog to the corresponding depth", with "varying opacity for the fog which was stored on the alpha channel of the texture". The lookup is `tex2D(_ColorRamp, float2(depth*fogAmount, 0))`.
- Firewatch's art is driven by "very distinct layers" of flat colour, and "the biggest chunk of colour is actually determined by the sky".
- Sources: https://halisavakis.com/my-take-on-shaders-firewatch-multi-colored-fog/, https://www.thumbsticks.com/gdc-2015-the-art-of-firewatch, https://hyphinett.itch.io/gradient-fog-for-unity. The talk itself, https://gdcvault.com/play/1022295/The-Art-of, I did not watch.

**Wander will:** give each parallax layer a depth value. Fog colour and opacity come from a two-dimensional ramp texture: u is depth (near to far), and v is the time key, interpolated. Far layers sink into the horizon colour of the sky key, and near layers keep their palette. This gives aerial perspective that changes with the hour without touching the sprites.

---

### C. Sky

**9. Physical sky models do not cover twilight cheaply, so hand-tune the keys**
- Bruneton evaluated eight clear-sky models.
  - **Preetham and Hosek-Wilkie** are O(1), with no precomputation, but are "limited to sun directions above the horizon". Used below it, Hosek "produces a pretty abrupt transition to a greenish color".
  - **Bruneton and Elek** handle the sun below the horizon, but need O(n⁶) precomputation and O(n⁴) memory.
  - **Accuracy order:** Preetham < O'Neal < Hosek < Nishita93 < Nishita96 < Haber < Bruneton/Elek.
- If a cheap physical check is ever wanted, the usual single-scattering constants are:
  - **Rayleigh:** β = (0.0058, 0.0135, 0.0331) per km, scale height 8 km, phase function `3/(16π)(1+μ²)`.
  - **Mie:** β = 0.003, scale height about 1.2 km, Henyey-Greenstein phase with g in [0, 1).
  - **Ozone absorption:** (0.00065, 0.00188, 0.00008), which "absorbs green/orange more than blue, creating purple twilight tones".
  - **Raymarch:** 24 view steps and 6 light steps, with a 250x64 transmittance LUT.
- Sources: https://ar5iv.labs.arxiv.org/html/1612.04336, https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/, https://cgg.mff.cuni.cz/projects/SkylightModelling/. The Hosek and Octane remark comes from an Octane forum post quoted in search results, which I did not open.

**Wander will:** use hand-tuned colour keys per sun elevation, as `skygrad` and Firewatch do, not a scattering model. A physical model is wrong exactly where the game is most beautiful (sun below 0°), it fights a stylized and muted palette, and at 640x360 a 3- to 7-stop gradient is all the sky needs. An offline single-scattering script with the constants above may be used once, as a sanity reference for the twilight hue order.

**10. Concrete sky key colours per sun elevation**
- **`skygrad` (hand-tuned, Oklab-blended).** Each anchor has 7 stops from zenith to horizon, at u = 0, .25, .5, .7, .85, .95 and 1; I list the zenith and horizon stops here. The sun glow lobe is given as strength, radius and tint.

  | Elevation | Zenith | Horizon | Sun glow (strength / radius / tint) |
  |---|---|---|---|
  | −18° (night) | `#050a14` | `#11213c` | none |
  | −12° (nautical) | `#070d1a` | `#22355b` | .12 / 24° / `#3a4a78` |
  | −6° (civil, blue hour) | `#0b1430` | `#7a5e6e` (mauve remnant) | .45 / 27° / `#b86a4e` |
  | −3° (just set) | `#16224e` | `#c98a52` | .70 / 30° / `#e88a3c` |
  | 0° (sunset) | `#1d3261` | `#f2b04e` (salmon band `#d3a276` at u .95) | .85 / 34° / `#ffb24a` |
  | +5° (golden) | `#2a4d86` | `#f0cb6f` | .60 / 30° / `#ffd27a` |
  | +15° | `#2f62ad` | `#dfdfd2` | .30 / 38° / `#f4e3b2` |
  | +40° | `#2a66c4` | `#d8e2ea` | .14 / 50° / `#e8eef5` |

  Its rule is that below −18° the floor anchor *is* the night sky: "dark blue-gray, never pure black".
- **Ferrari's painted skies, "Seascape" (vivid).** I measured the dominant colour in each band, zenith to horizon.

  | Time | Zenith | Horizon |
  |---|---|---|
  | Night | `#000017` | `#000023` |
  | 06:15 | `#2f3560` | `#3f3f6f` |
  | 07:00 | `#5560a5` | `#7a6fb5` |
  | 07:30 | `#7a8ae0` | `#c09af0` (lilac) |
  | Noon | `#2f95ef` | `#2fcfff` |
  | 18:15 sunset | `#835387` (mauve) | `#df7797` (rose) |
  | 18:45 dusk | `#1b006f` (violet) | `#275bf3` |

  At dusk, after sunset, Ferrari makes the **zenith violet and the horizon a brighter blue**.
- **Ferrari's "Winter Forest" sky glimpses:** 07:20 `#373783`, 08:00 `#4f6bcf`, noon `#8fb3e3`, 16:30 `#bfcbff`, 17:15 `#c387ef`, 17:30 `#6343af`, 17:50 `#2b175f`, night `#0b001f`.
- **Wander proposal (computed).** I took the `skygrad` anchors in Oklab LCh, cut the chroma to about 45 to 60%, turned day hues toward teal (h ≈ 212° to 232°) and night hues toward violet (h ≈ 285° to 288°), and kept warm horizons warm but at about 60% chroma.

  | Elevation | Zenith | Horizon |
  |---|---|---|
  | −18° | `#100f19` | `#242436` |
  | −12° | `#10101c` | `#36324b` |
  | −6° | `#131428` | `#736171` |
  | −3° | `#1c253f` | `#b18b6c` |
  | 0° | `#21364c` | `#d4ad79` |
  | +5° | `#2f5366` | `#d1c19c` |
  | +15° | `#386c79` | `#c6d4d5` |
  | +40° | `#2f7582` | `#c3d8db` |

  These sit near the forest reference violets (`#242852`, `#2A3B5E`) and teals (`#165768`, `#20738A`), and should be snapped to the biome palette when indexed.
- Sources: `skygrad` 1.0.0 source (`src/skygrad/palette.py`) from https://pypi.org/project/skygrad/ (repository https://github.com/Xof/skygrad); write-up at https://thebuild.com/blog/skygrad-a-place-and-a-time-rendered-as-sky/; Ferrari data as in finding 2.

**Wander will:** store sky keys as 5 to 7 stops plus a glow lobe per elevation anchor, starting from the Wander proposal above, and tune them by eye on a contact sheet across elevations. Night is never pure black. The sky is the brightest large area at night.

**11. Build the sky from additive parts: gradient, sun disc, sun halo, horizon halo**
- **Firewatch's sky shader** has four parts: a three-colour gradient (top, half, bottom); a sun disc (colour, size, falloff); a sun halo ("halo/haze/atmospheric scattering"); and a horizon halo controlled separately. "The parts simply get added together at the end". The controls are artist-facing ("color" and "tone") instead of a "Mie Scattering Factor".
- **Alto's sky** is a 6-vertex mesh whose vertex colours are set per horizontal pair. The sun glow is "a circular, vertex coloured mesh (alpha = 0 around the outside edge)" placed behind the landscape layers. The sun flare is an additive overlay plane, with a rainbow texture during light rain.
- Sources: https://blog.camposanto.com/post/112703721804/this-blog-post-is-an-in-detail-explanation-of-part, https://discussions.unity.com/t/2d-day-night-cycle-and-weather-system-a-la-altos-adventure/611522

**Wander will:** render the sky in the native-resolution pass as `gradient(stops) + glowLobe(sunPos, strength, radius, tint) + horizonHaze`. The sun or moon disc is a small hand-pixelled sprite, 6 to 10 px, deliberately larger than the real 0.5°. The glow lobe is placed behind the far parallax layers, as in Alto, so ridgelines cut into it. The glow can be banded into 3 or 4 rings to stay pixel-art.

**12. Belt of Venus, Earth's shadow, and clouds lit from below**
- **Belt of Venus:** a pink band about 10° to 20° above the horizon *opposite the sun* during twilight. As twilight goes on, it is "separated from the horizon by the dark band of Earth's shadow". It is more vivid in winter.
- **Afterglow:** with the sun 2° to 6° below the horizon (civil twilight), backscattered light, "possibly after being reflected off clouds", gives reddish to pinkish light and a "purple light" where red and blue overlap. The bright segment lasts until the end of nautical twilight.
- Sources: https://en.wikipedia.org/wiki/Belt_of_Venus, https://en.wikipedia.org/wiki/Afterglow

**Wander will:**
- **Earth's shadow and the belt:** between −1° and −8°, add a dusky blue-grey band (Earth's shadow) on the anti-sun horizon, topped by a muted pink stripe (the belt). This is cheap and very convincing, even in side view.
- **Clouds by elevation:**
  - Above +10°: cloud sprites take their top-edge pixels from the glow tint.
  - From +2° down to −6°: they take their *bottom* edges from the current glow tint (`#e88a3c` to `#b86a4e` in `skygrad`, muted for Wander), which is the "lit from below" look.
  - Below −8°: clouds become dark shapes against a lighter horizon.

---

### D. Fire, lanterns, ember, windows

**13. Light colours from blackbody temperature**
- **Mitchell Charity's blackbody table (10° observer):**

  | Temperature | Colour | Typical source |
  |---|---|---|
  | 1000 K | `#ff3800` | |
  | 1500 K | `#ff6d00` | |
  | 1800 K | `#ff7e00` | |
  | 1900 K | `#ff8300` | candle |
  | 2000 K | `#ff8912` | |
  | 2700 K | `#ffa957` | incandescent bulb |
  | 3500 K | `#ffc489` | |
  | 5500 K | `#ffece0` | |
  | 6500 K | `#fff9fd` | |
  | 10000 K | `#ccdbff` | |

- **FastLED presets:** Candle 1900 K `#FF9329`; Tungsten 40 W 2600 K `#FFC58F`; Tungsten 100 W 2850 K `#FFD6AA`; Overcast sky 7000 K `#C9E2FF`; Clear blue sky 20000 K `#409CFF`.
- **Tanner Helland's closed-form fit**, for T/100 ≤ 66:
  - R = 255
  - G = 99.4708025861·ln(T/100) − 161.1195681661
  - B = 0 if T/100 ≤ 19, otherwise 138.5177312231·ln(T/100 − 10) − 305.0447927307
  - Computed with it: 1800 K → `#ff7e00` and 1500 K → `#ff6c00`, which matches the table.
- Sources: http://www.vendian.org/mncharity/dir3/blackbody/UnstableURLs/bbr_color.html (fetched over HTTP; HTTPS refused), https://fastled.io/docs/d0/d89/group___color_enums_ga251e9e8dc2c7b981786b71706522b2a9.html, https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html

**Wander will:**
- **Campfire core:** 1500 to 1800 K (`#ff6d00` to `#ff7e00`), falling to 1200 K at the edge of the ring and in the embers.
- **Lantern:** 1900 K (`#ff8300`).
- **Cigarette ember:** 1000 to 1500 K (`#ff3800` to `#ff6d00`).
- **House windows:** 2700 K (`#ffa957`), so they read as "someone else's warmth".
- These hexes are light tints. In the palette world each light gets a short warm ramp, about 4 entries, desaturated toward the biome's darks at the low end. Warm colour stays rare: only lights and the creature's eyes use these ramps.

**14. Flicker in stepped 10 Hz patterns (Quake light styles)**
- Quake's `R_AnimateLight` does `i = (int)(cl.time*10)` and `value = (map[i % len] − 'a') * 22`, so each letter lasts 0.1 s and 'm' (264) is normal brightness.
- **The shipped patterns:**
  - FLICKER `"mmnmmommommnonmmonqnmmo"` and `"nmonqnmomnmomomno"`.
  - CANDLE `"mmmmmaaaaammmmmaaaaaabcdefgabcdefg"`.
  - GENTLE PULSE `"jklmnopqrstuvwxyzyxwvutsrqponmlkj"`.
- **Normalised to 'm' (computed):** FLICKER 1 is a 2.3 s loop of values {1.00, 1.08, 1.17, 1.33}, with a mean of 1.07. The light sits at its base level and pops *up* in short steps; it never dips below the base.
- Sources: https://github.com/id-Software/Quake/blob/master/qw-qc/world.qc, https://github.com/id-Software/Quake/blob/master/WinQuake/r_light.c

**Wander will:** flicker fire in 10 Hz steps, which matches pixel-art animation rates, rather than with smooth noise.
- **Campfire:** intensity = 1 + 0.08 × (pattern step) from a hand-written, Quake-style string. A slow 0.2 to 0.5 Hz value-noise swell (±5%) sits underneath. The *radius* also jitters by ±1 px on steps, so the stepped light rings "breathe".
- **Lantern:** half the amplitude.
- **Ember:** almost steady, except for an "inhale" every 20 to 40 s: ramp to 1.6× over about 1 s, then decay over about 2 s. On the inhale it lights only the hood-interior mask pixels and the face, within about 4 native px.

**15. Light on the pixel grid: compute at native resolution, cut into steps, apply as a ramp shift**
- **Godot's docs:** 2D lights are computed "at the Viewport's pixel resolution, not at the source texture's texel resolution". Nearest filtering alone will not pixelate lighting; use a custom shader with `floor()` to snap it to the pixel grid. `CanvasModulate` darkens the base, and lights blend by Add (the default), Subtract or Mix.
- **Banding:** the common idea is `floor(value*steps)/steps`, optionally with a smoothstep inside each step. Pixel Composer's 2D Light node: "Banding convert smooth light to discrete steps. The banding width depends on the Attenuation".
- **Ordered dithering to soften a band edge:** `c' = nearest(c + r·(M(x mod 4, y mod 4) − ½))`, with the 4x4 Bayer matrix `1/16·[0 8 2 10; 12 4 14 6; 3 11 1 9; 15 7 13 5]`.
- Sources: https://docs.godotengine.org/en/stable/tutorials/2d/2d_lights_and_shadows.html, https://godotshaders.com/shader/watercolor-light-shader/, https://docs.pixel-composer.com/nodes/filter/effect/light/2d_light.html, https://en.wikipedia.org/wiki/Ordered_dithering

**Wander will:**
- Accumulate every light into a 640x360 light buffer. The positions are snapped to whole native pixels, and the falloff is `1/(1 + (d/r)²)` clipped at the radius.
- Quantize the buffer to 3 or 4 levels, which gives the stepped rings around the campfire. A 2 px Bayer-dithered seam at each ring boundary is optional.
- Apply each light level as **+1, +2 or +3 steps along the pixel's own colour ramp**, plus a pull toward the light's warm ramp. It is not an RGB add.
- Lit pixels therefore stay inside the palette and keep their pixel clusters. The only full-resolution light is the glow in the atmosphere layer (finding 16).

**16. The atmosphere layer: soft bloom at low strength, and dithering of every gradient**
- **Bloom (Call of Duty: Advanced Warfare, Jorge Jimenez):** a downsample pyramid with a 3x3 tent upsample. Firefly suppression weights samples by `1/(1+luma)` and renormalizes. The blurred layer is added at a low weight, about **0.04**, "which means that only very bright pixels will bloom noticeably".
- **Banding (Mikkel Gjøl, Playdead, "Banding in Games"):** fog, falloffs and glow are where banding shows. The rules:
  - "Dither just before quantizing", meaning `c + noise/255` in the final shader.
  - Grain added after quantisation does not fix banding.
  - Use a triangular-PDF noise, and since GPUs round, the range should be [−1, 1) LSB.
  - High-pass (blue) noise is even less visible.
- Sources: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/ (page text; the full slides are a separate download), http://loopit.dk/banding_in_games.pdf

**Wander will:**
- Run bloom only on the full-resolution atmosphere layer. Sources are the fire, lantern, windows, moon and the sun near the horizon, through an emissive mask, not the whole frame. The bloom mix is about 0.03 to 0.06.
- Add triangular dither of ±1 LSB to every full-resolution gradient output: sky glow, fog, bloom, vignette.
- The native-resolution art layer gets no noise, because its colours are already exact palette entries.

**17. How far 2D lighting can go: Sea of Stars against Ori**
- **Sea of Stars:** "fully dynamic lighting of sprites including normal mapping, pixel depth writing and shadow receiving", "shadow casting sprites from multiple angles and punctual/directional light sources", "volumetric lighting", "screen-space indirect lighting", "animated height fog", and "pixel perfect rendering". The sun and moon positions drive shadow length.
- **Ori and the Will of the Wisps:** the artists hand-painted light and shadow. There was "a light direction map for each asset", about 30 000 maps for about 7 000 assets (roughly 4 per asset), because automated scripts gave "a 'very cheap [and] plasticky look'".
- Sources: http://nichegamer.com/the-messenger-prequel-rpg-sea-of-stars-enters-kickstarter-launches-2020-for-pc (quoting the Kickstarter), https://sabotagestudio.com/presskits/sea-of-stars, https://www.thegamer.com/ori-and-the-will-of-the-wisps-artists-hand-painted-30000-light-maps/

**Wander will:** not use generated normal maps. The wanderer, the campfire props and the house get 2 or 3 small **hand-drawn light masks** in Aseprite: "lit from the left", "lit from the right", and "rim from behind". They are blended by the direction to the dominant light (sun, moon or fire). The time of day adds a long ground shadow for the wanderer only: a dark 1 px strip whose length is `h/tan(elevation)`, clamped, and which fades out above about 35°.

---

### E. Rim light

**18. A 1 px rim on edges that face the light**
- The Godot "2D Rim Light" shader samples the sprite's alpha at ±thickness in the four directions, multiplies the samples, and inverts. That gives "an outline around the sprite", and it does not respond to the light's direction.
- The directional version I derived from it: a pixel is a lit edge when it is opaque and its neighbour *toward the light* is transparent. With `L` the 2D direction to the light in texels:

  ```glsl
  float a     = texture(spr, uv).a;
  float aToL  = texture(spr, uv + L * texel).a;          // one native pixel toward the light
  float rim   = a * (1.0 - aToL);                          // 1 on the lit silhouette edge
  rim *= backlight;                                        // 0..1: how much the light is behind the sprite
  color = mix(color, rimColor, rim * rimStrength);         // rimColor = sky glow tint / fire ramp top
  ```

- Sources: https://godotshaders.com/shader/2d-rim-light/ (the non-directional base). Limbo and Inside were not documented in anything I could read; Playdead's GDC Europe 2016 rendering talk is at https://gdcvault.com/play/1023002/Low-Complexity-High-Fidelity-INSIDE, video not watched.

**Wander will:**
- Apply this rim at native resolution, always exactly one pixel wide, to the wanderer, the creature and near-silhouette props.
- `backlight` rises when the sun or moon is low (elevation between −2° and +12°) and behind the wanderer relative to the camera. For side-on light it is used when the light is on the far side of the walking direction.
- The rim takes the current glow-lobe tint, for example `#e88a3c` muted, at sunset. The moon rim is pale `#8c81c1`-like violet.
- Near the campfire, `L` points to the fire and the rim takes the fire ramp's top colour. Its strength follows the quantized light level, so only pixels inside the ring get a rim.

---

### F. Night sky

**19. The moon: phase, earthshine, brightness and the 22° halo**
- **Phase:** the synodic month averages 29.53059 days. The illuminated fraction is `(1 − cos θ)/2`, where θ is the elongation. In the northern hemisphere a waxing moon has its dark side on the left.
- **Earthshine** is clearest on crescents: the waxing crescent after dusk in the west, the waning crescent before dawn in the east. It is "the old Moon in the new Moon's arms".
- **Brightness:** full moon is "much more" than quarter moon, even though only twice the area is lit (the opposition surge).
- **22° halo:**
  - Radius about 22°, "roughly the length of an outstretched hand at arm's length".
  - The inner edge is reddish and the outer edge bluish.
  - "The sky is darker inside the halo", because no light is refracted at angles under 22°.
  - It appears with thin cirrus or cirrostratus, often a few days before a storm front.
- Sources: https://en.wikipedia.org/wiki/Lunar_phase, https://en.wikipedia.org/wiki/Earthshine, https://en.wikipedia.org/wiki/Opposition_surge, https://en.wikipedia.org/wiki/22%C2%B0_halo

**Wander will:**
- **Moon disc:** draw it per pixel on a disc of about 9 to 13 px, using a sphere normal. For `n = (x, y, √(1−x²−y²))` and `Lsun = (sin φ, 0, −cos φ)` with φ from 0 (new) to π (full), a pixel is lit where `dot(n, Lsun) > 0`.
- **Terminator:** quantize it into the moon's 3-colour ramp.
- **Earthshine:** give the unlit part `(1 + cos φ)/2 × 0.12` of the lit colour, so it shows on crescents.
- **Moonlight:** scale world moonlight as `fraction²`, a stylized stand-in for the opposition surge.
- **Halo:** only when there is thin high cloud (`weather.cloud` between 0.2 and 0.5), draw a ring 1 to 2 px wide at a radius equal to 22° in sky pixels. The inside is slightly darkened, the inner edge pixel tinted warm and the outer one cool. It hints that weather is coming.

**20. Stars: real colours, twinkling that grows near the horizon, no twinkle on planets**
- **Charity's star colours by class:**

  | Class | Colour |
  |---|---|
  | O | `#9bb0ff` |
  | B | `#aabfff` |
  | A | `#cad7ff` |
  | F | `#f8f7ff` |
  | G | `#fff4ea` |
  | K | `#ffd2a1` |
  | M | `#ffcc6f` |

  Example stars: Sirius `#b5c7ff`, Vega `#b9c9ff`, Betelgeuse and Antares `#ffca8a`, Arcturus `#ffdfb5`, Aldebaran `#ffcc8a`. Class M is 76% of main-sequence stars, but bright naked-eye stars skew toward B, A and K.
- **Twinkling:** "much more pronounced near the horizon than near the zenith", because the path through the air is longer. Planets twinkle less because they are discs. Near the horizon Sirius "flashes rainbow colours", through "rapid, transient changes in the apparent colour".
- **Night Rendering (Jensen et al.):** a star's temperature is `T = 7000 K/(B−V + 0.56)`. Integrated starlight brightens the sky between the stars, and bright stars get flare lines.
- Sources: http://www.vendian.org/mncharity/dir3/starcolor/, https://en.wikipedia.org/wiki/Stellar_classification, https://en.wikipedia.org/wiki/Twinkling, https://en.wikipedia.org/wiki/Sirius, https://cseweb.ucsd.edu/~henrik/papers/night/night.pdf

**Wander will:**
- **Star field:** single native pixels, 150 to 300 visible at 640x360, with colours drawn from the class table. They are weighted toward white and blue-white, with 10 to 15% K/M orange, and desaturated about 40% for the muted look.
- **Twinkle:** brightness × `(1 + k·airmass·n(t))`, where `airmass ≈ 1/max(sin alt, 0.1)`. The noise is stepped at 6 to 10 Hz. Within 15° of the horizon, each channel gets its own noise phase, so low stars flicker in colour.
- **Bright stars and planets:** the 2 or 3 brightest get a 1 px "+" flare. One steady "planet" does not twinkle.
- **When they appear:** stars fade in from −6° (brightest first) to −15° (all), and are drawn behind the moon's glow lobe.

**21. The Milky Way: a 30° band with dust lanes, only on dark moonless nights**
- It is "some 30° wide", tilted 63° to the celestial equator, and brightest toward Sagittarius. It is best seen May to August from the north.
- Dark lanes such as the Great Rift and the Coalsack are interstellar dust.
- It needs a sky darker than about 20.2 mag/arcsec² and Bortle 4 or better. More than a third of humanity cannot see it.
- In procedural night skies the usual technique is to project the view direction onto a fixed axis for the band, modulate it with fBm, and subtract a turbulent fBm for the dust.
- Sources: https://en.wikipedia.org/wiki/Milky_Way; the procedural-technique summary is from search results, with no single shader read.

**Wander will:**
- **Band shape:** a diagonal band across the sky plane. Density is `exp(−(d/σ)²)` with σ about 13°, so the full width at half maximum is about 30°, times a 3-octave fBm.
- **Dust lane:** a second, narrower fBm "rift" is subtracted along the band's centre line, offset to one side.
- **Colour:** quantize to 3 levels of very low-contrast violet-grey (+2 to +6% lightness over the night sky), with a faint warm tint toward the bright end.
- **Visibility:** only when the sun is below −18°, the moon's illuminated fraction is under 0.3 or the moon is down, and the cloud cover is below 0.2. It is also hidden near the lit house. This makes it rare and earned.

**22. Aurora: green curtains, red tops, a blue or pink lower fringe, far north only**
- **Colours by height:**
  - Atomic oxygen at 557.7 nm (green) dominates at lower heights.
  - 630.0 nm (red) dominates at the highest altitudes and needs strong activity.
  - At the lowest altitudes nitrogen takes over, with 428 nm (blue) dominant.
- **Height and shape:** the main height is about 100 km, within 70 to 150 km. The forms run glows, patches, arcs, rays, coronas.
- **Behaviour:** substorms go "in a few minutes from quiet arcs ... to active displays", last 1 to 3 h, and then fade.
- **Where:** the auroral zone is about 6° wide and centred near 67° latitude, moving toward the equator during storms.
- Source: https://en.wikipedia.org/wiki/Aurora. I did not read a curtain-shader source; the well-known Shadertoy "Auroras" by nimitz was not fetched.

**Wander will:**
- **Where and how often:** only in the northern, tundra and taiga biomes, on clear dark nights (sun below −12°, cloud below 0.2, moon fraction under 0.5). There is about a 15% chance per qualifying night, so it stays a rare gift.
- **Shape:** 2 or 3 curtains. Each curtain's base height is `y0(x,t) = h + A·fbm(0.004·x + 0.01·t)`. Vertically there is a sharp lower edge (rising over 2 to 3 px) and a long fade upward over 30 to 60 px. Vertical "rays" come from a high-frequency 1D noise in x, which shimmers slowly.
- **Colour:** quantize by height into a muted 4-entry ramp: a faint violet-pink lower fringe, a teal-green body (spectral 557.7 nm desaturated toward the teal palette), and a dim red-violet top.
- **Lifecycle:** an envelope rises over about 3 minutes to a 1 to 2 minute peak, then decays. The aurora also lights snow and water with its green via the palette key.

**23. Shooting stars: brief, more toward dawn**
- Sporadic meteors "are generally more numerous before dawn than in the early evening", because the morning side of the Earth meets more meteoroids. Meteors enter at 11 to 72 km/s and are visible at about 80 to 120 km. Showers peak after midnight and best "slightly before dawn". Typical shower rates (ZHR) are about 60 to 75 per hour for the Quadrantids, Perseids and Geminids.
- I could not verify the background sporadic rate (often quoted as about 5 to 10 per hour under dark skies) or the typical duration (often quoted as well under 1 s). My web search budget ran out before I found a primary page for either.
- Sources: https://www.amsmeteors.org/faq/, https://en.wikipedia.org/wiki/Meteor_shower

**Wander will:**
- **Frequency:** spawn meteors as a Poisson process during astronomical night. The mean is about 1 per 3 real minutes in the evening, rising to about 1 per 1.5 minutes before dawn, with "shower nights" (Perseids in mid-August, Geminids in mid-December, by the real calendar) at 4 times the rate.
- **Look:** each lasts 0.3 to 0.8 s and travels 20 to 60 native px on a straight line. The head is 1 px, the tail fades over 6 to 15 px, and the colour is star-white with an occasional faint green or orange.
- **No sound or other reaction**, except that the creature may look up.

---

### G. Night that still reads

**24. Blue-shift the night, and drop texture but not edges**
- **Moonlight is warmer than sunlight**, being sunlight reflected off a surface "with an albedo larger at longer wavelengths". Yet films, CG and painters all blue-shift night, and the authors argue it is a real perceptual effect: rods take part in colour vision at mesopic levels.
- **The painters' data:** they measured scotopic regions of ten realist night paintings and found an average chromaticity of **(x, y) = (0.29, 0.28)**, σ = 0.03, south-west of white. They shift toward **(0.25, 0.25)**.
- **The shift formula:**
  - `s = 0` if log₁₀Y < −2; `s = 3((log₁₀Y+2)/2.6)² − 2((log₁₀Y+2)/2.6)³` up to log₁₀Y = 0.6; otherwise `s = 1`.
  - `x' = (1−s)x_b + s·x`, `y' = (1−s)y_b + s·y`, `Y' = 0.4468(1−s)V + sY`, where V is scotopic luminance.
  - The mesopic band runs from 0.01 to about 4 cd/m².
- **Converted (computed):** (0.29, 0.28) at Y = 0.05 is **`#413d4d`**, a muted blue-violet grey. (0.25, 0.25) at Y = 0.05 is **`#353f58`**.
- **Loss of detail:** "Painters simulate the loss of detail at night by retaining prominent edges, but dropping textures and other high frequency".
- **Scale:** full moon irradiance is 2.1·10⁻³ W/m² against sunlight's 1.3·10³ W/m², a ratio of about 1.6·10⁻⁶, or about 19 stops.
- **Purkinje effect:** peak sensitivity shifts from about 555 nm (cones) to about 507 nm (rods). At dusk the contrast reverses, "with the red petals appearing a dark red or black, and the leaves and blue petals appearing relatively bright".
- Sources: https://cseweb.ucsd.edu/~henrik/papers/night/ (PDF read: Jensen, Premoze, Shirley, Thompson, Ferwerda, Stark, "Night Rendering"), https://en.wikipedia.org/wiki/Purkinje_effect

**Wander will:**
- **Night palette rows:** build them by moving each entry's Oklab chroma and hue toward the painters' night chromaticity (`#413d4d` family, toward violet, matching the forest's violets) by about 70 to 85%, and lowering lightness on a curve rather than by one factor.
- **Purkinje:** reds, oranges and browns lose the most lightness (to near black), and teals and blue-greens keep the most. Emissive entries (fire, lantern, eyes, windows, spores) are excluded and stay warm or glowing.
- **Loss of detail:** night keys merge each texture ramp's middle steps (5 steps become about 3) but keep the darkest outline and edge pixels.

**25. Day for night: underexpose, keep practical lights warm, backlight the silhouettes**
- **The film technique:** underexpose by "about two stops" (one to three historically). Tungsten-balanced 3200 K stock renders artificial lights white while unlit areas look moonlit blue. Avoid visible bright sky, or darken it with graduated ND. Backlight to make a moonlight rim, filling faces a little so they do not go too dark. Glare on windows and headlights is often added in post. "Dusk for night" means shooting at dusk, when practical lights are already on.
- **Ferrari does the same in pixels.** In Winter Forest the trunks go to `#000000` at night and to `#07000b` violet-black at 17:15, while the sky keeps its colour (`#c387ef` at L 0.72). The scene reads entirely as silhouette against the sky.
- Sources: https://en.wikipedia.org/wiki/Day_for_night; Ferrari data as in finding 2.

**Wander will:**
- **Value budget at night (Oklab L):**
  - Sky 0.16 to 0.30.
  - Far layers 0.12 to 0.18, foggy.
  - Near land 0.05 to 0.12, almost silhouette.
  - The wanderer's outline at least 0.04 darker than whatever is behind it, plus the moon rim (finding 18).
  - Lights at the top end, 0.75 to 0.95, with bloom.
- **White balance:** a "night white point" of about 4000 K, applied in the palette rows, makes the 1900 K lantern read orange-warm without going red, and makes moonlit surfaces read blue-violet.
- **Lights stay lit at dusk:** the house windows switch on at about +2° sun elevation, so lit windows overlap with the last blue light, the "dusk for night" moment.

---

### Sources I could not access or found no primary information for

- **Harry Nesbitt's making-of post** (harrynesbitt.com) loaded only over plain HTTP and contained no lighting detail. His Dribbble "Dynamic Lighting System" post would not render; its description is known only from a search snippet. I found no primary source for Alto's *Odyssey* lighting (as opposed to *Adventure*).
- **The GDC Vault talks** were not watched: Jane Ng's "The Art of Firewatch" (2015), Mark Ferrari's "8-Bit & '8-Bitish' Graphics-Outside the Box" (2016), and Playdead's "Low Complexity, High Fidelity" (INSIDE, 2016). The 80.lv summary of the INSIDE talk had no technical content.
- **No primary technical sources found** for Hyper Light Drifter, Kingdom Two Crowns, Celeste or Dead Cells lighting. The Game Developer URL for the Dead Cells colour article returned only the site's navigation, and the gonintendo copy was truncated.
- **Blocked pages:** the Octopath Traveler II Unreal interview (HTTP 403), the timeanddate.com and PhotoPills twilight pages (403), the Shadertoy aurora shader (not fetched), and the INSIDE GDC slides.
- **The web-search budget ran out** partway through, so the sporadic meteor rate and duration (finding 23) and the "+6° to −4°" golden-hour convention (finding 1) are not verified against a primary source.

---

## Depth: parallax, haze, fog and rays

Scope: how Wander makes a 640x360 pixel-art side view read as deep. That covers parallax, atmospheric perspective, fog, haze, valley mist, god rays, the other depth cues, and weather placed at different depths. Each finding gives what was found, the sources I actually read, and a line on what Wander will do with it.

One idea runs through the whole section. **Give every layer one number, its depth `z`, and derive everything else from it.** That covers parallax speed, drawn scale, baseline height on screen, fog amount, palette, rain size and dither seed. The playfield, where the wanderer walks, sits at `z = 1`, the sky sits at infinity, and foreground layers have `z < 1`.

Working table used by the "Wander will" lines below. These are starting values to tune, not measured ones. Fog uses `F = 1 - exp(-sigma*(z-1))` with sigma = 0.12 for a clear day. The baseline column assumes the horizon at y=150 and the playfield ground at y=300 on the 360 px canvas.

| slot | role | z | parallax f = 1/z | drawn scale | baseline y | fog F (sigma 0.12) | colours |
|---|---|---|---|---|---|---|---|
| FG | passing silhouettes (fronds, trunks) | 0.6 | 1.67 | 1.67x | below frame | 0, darkened | 1-2 |
| L0 | playfield (walker, path, props) | 1 | 1.00 | 1x | 300 | 0 | full ramp |
| L1 | near trees / bushes | 1.4 | 0.71 | 0.71x | 257 | 0.05 | 5-6 |
| L2 | mid forest | 2 | 0.50 | 0.5x | 225 | 0.11 | 4-5 |
| L3 | far forest / hills | 3 | 0.33 | 0.33x | 200 | 0.21 | 4 |
| L4 | far hills | 5 | 0.20 | 0.2x | 180 | 0.38 | 3 |
| L5 | ridge | 8 | 0.125 | 0.125x | 169 | 0.57 | 3 |
| L6 | far ridge | 13 | 0.077 | - | 162 | 0.76 | 2 |
| L7 | mountains | 22 | 0.045 | - | 157 | 0.92 | 2 |
| L8 | clouds | 40 | 0.025, plus wind | - | sky | sky-tinted | 2-3 |
| SKY | gradient, sun, moon, stars | inf | 0 | - | - | is the fog | gradient |

---

### A. Parallax

**1. The parallax factor is `1/z`, measured from the camera in units of the camera-to-playfield distance.**
OpenClonk's write-up of its parallax and zoom code says it outright: an object with parallax factor `Par` sits at distance `1/Par` from the camera, while the landscape sits at distance 1, so the object is `1/Par - 1` behind it. If you count "depth behind the playfield" as `d`, then `f = 1/(1+d)`. The same post warns about a bug: with zoom you need the intercept theorem, otherwise off-centre objects drift while you zoom. The KSU course text adds that layers in front of the player scroll faster and, for the same reason, should be drawn larger. Both cues come from the same projection.
Sources: https://blog.openclonk.org/?p=159 ; https://textbooks.cs.ksu.edu/cis580/08-spritebatch-transforms/04-parallax-scrolling/
**Wander will:** store only `z` per layer and compute `f = 1/z` for horizontal scroll and `1/z` for vertical camera bob. Art for a layer is drawn at `1/z` scale: a 24 px tree on the playfield becomes about 8 px at z=3 and about 3 px at z=8. If speed and drawn size disagree, the eye reads the layer at the wrong depth.

**2. Shipped games: 4 layers is the floor, 8 is typical, "dozens" or "hundreds" at the top. Far factors fall off steeply, and one layer is fully static.**
The GameMaker parallax article ships 2 foreground layers, 1 midground, 1 VFX layer, 4 background skylines and 1 static layer. The code is `layer_x(layer, cam_x * w)`, so a weight of 1 means the layer is static on screen. Its weights `[-1, 0.7, 0.91, 0.96, 0.977, 0.985, 0.995, 1]` give apparent factors `1-w` of **2.0 (foreground), 0.3, 0.09, 0.04, 0.023, 0.015, 0.005, 0**. That is roughly `1/z` with z of about 3, 11, 25, 43, 67 and 200. The static layer bakes in sky, sun and the far skyline. Near layers are drawn at twice the viewport width so their repeats are less obvious. The "VFX layer" (shore and distant smoke) "add[s] some speed to the background while keeping the buildings themselves pretty slow, to emphasize scale". The Return devlog suggests about 4 layers to start. Tim Soret's thread says the final *The Last Night* has "dozens of parallaxing layers". Moon Studios calls Ori's look "a layered painterly look that has depth to it".
Sources: https://gamemaker.io/blog/creating-depth-and-immersion-parallax ; https://jesseeisenbart.itch.io/return-alpha/devlog/384936/return-devlog-02-creating-visual-depth-in-a-2d-pixel-world ; https://threadreaderapp.com/thread/976819508441681920.html ; https://airborn-studios.com/projects/ori
**Wander will:** use 8 depth slots plus the sky and one sparse foreground slot (the table above). The sky gradient, sun, moon and stars get factor 0 and move only with time of day. Clouds and fog sheets get a tiny parallax factor plus their own wind speed, so the picture keeps moving when the wanderer stops (the GameMaker "VFX layer" idea).

**3. Ori and Hollow Knight place flat art in real 3D under a perspective camera. A hand-scripted 2D system can copy that by taking every property from z.**
Unity's case study says Hollow Knight's levels were "2D assets layered in a 3D environment" and lit with "soft transparent shapes" rather than 3D lights. For Ori, the studio says the art team "worked directly in Unity to define the look and compose everything". In the Unity forum thread, users (not developers) report from the GDC talk that Ori uses "a perspective camera" and that "the depth they have is due to the Z depth of individual objects". In Moon Studios' own Q&A, Thomas Mahler says they "decided early on that we wanted a sprite-based approach to make the 3d characters integrate better with the 2d art". Wulverblade went the other way: it kept "2D orthographic cameras", because a perspective camera caused "too many problems", and scripted the parallax per layer.
Sources: https://unity.com/madewith/hollow-knight ; https://airborn-studios.com/projects/ori ; https://discussions.unity.com/t/ori-and-the-blind-forest-feature-question/562031 ; https://www.orithegame.com/qa-with-thomas-mahler-celebrating-8-years-of-ori-the-game/ ; https://wulverblade.com/faking-3d-perspective/
**Wander will:** render with an orthographic 2D compositor in WebGL2, where each layer is a native-resolution texture plus `z`. It will emulate the perspective camera by deriving offset, scale, baseline and fog from `z`, which keeps the pixel grid exact, and won't use a true 3D camera.

**4. Floors and water span many depths, so they need per-row parallax (line scroll or shear), not one factor.**
Wulverblade's rule for faking 3D in 2D: faces toward the camera translate by depth, side walls scale, and "floors and ceilings need to sheer". On the Mega Drive, line scrolling scrolls each scanline on its own. In Thunder Force IV's water, "the lines closer to the bottom scrolling faster" gives "a strong impression of depth". Games such as Dynamite Headdy and Yu Yu Hakusho use the same trick for floors.
Sources: https://wulverblade.com/faking-3d-perspective/ ; https://rasterscroll.com/mdgraphics/graphical-effects/line-scrolling/
**Wander will:** draw ground strips that recede (meadow floor, salt flat, shore, lake surfaces) with a per-row factor `f(y) = (y - y_horizon)/(y_ground1 - y_horizon)`. That value is 1 at the playfield ground row and 0 at the horizon, and is applied in the fragment shader as a per-row UV offset. Water reflections use the same rows.

**5. Pixel-perfect motion and slow layers: whole-pixel steps look clean but judder. Decide where sub-pixels are allowed.**
Slynyrd's parallax tutorial works strictly in whole pixels: "The pixels moved per frame must divide into the dimension of the canvas the motion runs along", and slow layers move "1 pixel per 2 frames". Unity's Pixel Perfect Camera offers two modes. "Upscale Render Texture" renders at the reference resolution and gives "unaliased and unrotated pixels". "Pixel Snapping" "prevents subpixel movement and make[s] Sprites appear to move in pixel-by-pixel increments". At a slow walk of about 18 px/s on the playfield, factors from the table give 0.8 px/s at z=22. A snapped far layer would therefore jump one pixel every ~75 frames, a visible tick.
Sources: https://www.slynyrd.com/blog/2019/11/12/pixelblog-23-parallax-scrolling ; https://docs.unity3d.com/Packages/com.unity.2d.pixel-perfect@5.0/manual/index.html
**Wander will:** render each layer at native 640x360 and composite at output resolution with an integer scale k. Offsets are rounded to output pixels, which are 1/k of a native pixel. Pixels stay square and undistorted while far layers glide instead of ticking. The playfield and the walker stay snapped to native pixels, because that is where the eye looks.

**6. Foreground silhouettes passing in front of the figure are the strongest single depth cue in motion. In an ambient game they must be rare, dark and brief.**
GameMaker recommends "overhanging tree branches or archways in the foreground (moving slightly faster than the player) ... acting like a 'window' into the world". KSU notes that layers in front scroll faster and must be larger. HD games such as Hollow Knight blur this layer. At native-resolution pixel art a blur isn't possible, so the usual substitute is a near-black silhouette with 1-2 colours. The owner's notes on the earlier forest diorama asked for "dark fronds right at the bottom edge".
Sources: https://gamemaker.io/blog/creating-depth-and-immersion-parallax ; https://textbooks.cs.ksu.edu/cis580/08-spritebatch-transforms/04-parallax-scrolling/
**Wander will:** keep one foreground slot at z of about 0.6 (f = 1.67) holding near-black fronds, trunks and grass tufts in the darkest palette index. These are anchored to the bottom and side edges and spaced every one to three screens. An object may cross the walker but never stay on it. With the camera following the walker, a foreground object at f = 1.67 crosses the screen at 1.67x the walk speed (about 30 px/s at an 18 px/s stroll), so a 40 px trunk clears a 16-24 px figure in about 2 s. When the walker stops, the foreground stops too, so a foreground object is never placed where the walker's rest spots are. No blur. They get the night violet shift like everything else.

### B. Atmospheric perspective

**7. The colour maths: lerp toward the fog colour by `1 - exp(-density * distance)`. Contrast drops automatically, and per-channel coefficients give the blue shift.**
Wikipedia's aerial perspective article says that with distance "the contrast between the object and its background decreases", details lose contrast, and colours "become less saturated and shift toward the background colour, which is usually bluish". That colour can be "reddish around sunrise or sunset". Inigo Quilez gives the shader: `fogAmount = 1.0 - exp(-t*b); col = mix(col, fogColor, fogAmount)` with fog colour `(0.5,0.6,0.7)`. For a physically richer version he splits it into per-channel extinction `exp(-d*be.rgb)` and in-scattering `exp(-d*bi.rgb)`. The lerp itself does the other jobs: contrast inside a layer scales by `(1-F)`, saturation falls if the fog colour is greyer, and luminance rises when the fog colour is lighter than the layer.
Sources: https://en.wikipedia.org/wiki/Aerial_perspective ; https://iquilezles.org/articles/fog/
**Wander will:** compute one `F(z) = 1 - exp(-sigma*(z - 1))` per layer, giving roughly 0.05, 0.11, 0.21, 0.38, 0.57, 0.76 and 0.92 across L1-L7. Sigma is a per-biome, per-time key: clear 0.12, forest 0.25, misty dawn 0.4, rain 0.5. Blue and red get slightly different sigmas (blue about 1.2x), so dark far shapes go blue while bright far peaks keep their warmth. At night the fog colour is dark violet, so far layers go darker and bluer instead of lighter.

**8. Haze glows toward the sun: fog colour depends on the view direction, not only on distance.**
Quilez's sun-aware fog mixes the bluish fog `(0.5,0.6,0.7)` toward a warm `(1.0,0.9,0.7)` by `pow(max(dot(rd, sunDir), 0), 8.0)`. Effectively, the fog shows where the sun is.
Source: https://iquilezles.org/articles/fog/
**Wander will:** in 2D, replace the view-direction dot product with the screen distance to the sun or moon: `glow = pow(saturate(1 - |p - sunScreenPos| / R), 8)` with R of about 0.7 of the screen width. The fog colour of every layer is lerped toward the sun's haze colour by that amount, so layers near the low dawn sun lighten and warm while the opposite side stays cold. This is the one place the cold palette may warm briefly, at dawn and dusk only.

**9. Firewatch: fog colour comes from an artist-painted gradient indexed by distance. Fog, sun and grading are driven together through time of day.**
The GDC 2015 talk "The Art of Firewatch" (Jane Ng) was summarised by Thumbsticks: the bold colours sit in "very distinct layers. Each layer adds to a feeling of depth and distance", and "the biggest chunk of colour is actually determined by the sky". Two engineers rebuilt the technique from the talk:
- Harry Alisavakis: "color ramp textures to map the colors of the fog to the corresponding depth, with varying opacity for the fog which was stored on the alpha channel". In shader terms, `fogCol = tex2D(_ColorRamp, float2(linearDepth, 0)); lerp(col, fogCol, fogCol.a * intensity)`.
- grrava: "apply fog as a post process effect and for each sample fetch the fog color from a gradient texture".

Campo Santo's own Q&A adds two details. A custom "interpolation manager" smoothly changes "our sun direction, the position of the visual sun disc (which is also the source of god rays), our two fog systems and our color correction post effect all at the same time". And "A lot of the color is from lighting + fog + color correction. Most of the rocks in the game actually has grey diffuse". Their sky shader is a 3-colour gradient (top, half, bottom) plus sun disc, sun halo and horizon halo, all exposed as colours rather than physical parameters.
Sources: https://www.thumbsticks.com/gdc-2015-the-art-of-firewatch ; https://halisavakis.com/my-take-on-shaders-firewatch-multi-colored-fog/ ; https://grrava.blogspot.com/2018/08/stylistic-fog-from-firewatch-with.html ; https://hyphinett.itch.io/gradient-fog-for-unity ; https://blog.camposanto.com/post/102893584324/i-asked-twitter-if-anyone-had-questions-about-the ; https://blog.camposanto.com/post/112703721804/this-blog-post-is-an-in-detail-explanation-of-part
**Wander will:** keep a fog ramp atlas per biome. Each row is one time-of-day key (night, pre-dawn, dawn, morning, day, dusk); across the row runs normalized depth (`log z` mapped to 0..1); RGB is fog colour and A is the fog amount multiplier. One `AtmosphereState` carries the sky gradient's 3 colours, sun and moon disc and halo, fog ramp row, sigma, mist density, ray strength and grade. It is interpolated as a whole between keys, the way Firewatch's interpolation manager is, so fog, sky, rays and palette never fall out of step.

**10. Pixel-art rules per plane: the nearest plane is most saturated and highest in contrast, each plane behind gets lighter, less saturated, bluer and has fewer colours. Forests can run the other way, toward the light.**
In Slynyrd's Pixelblog 62, each full background uses 15 colours. "The closest plane is the most saturated with strongest contrast between light and shadow. Therefore, saturation reduces with each receding plane, while lightness increases". The "closest grass plane is the warmest hue, and each receding plane shifts more towards blue". The sky colour is reused for the furthest mountains. In the desert, dark red shadows become "lighter violet tones on the distant dunes". The forest scene runs in reverse: greens "shift away from darker blue tints to warm yellow in the distance", because the depth of a forest is lit. Detail density per plane: the nearest has "thick apparent blades of vegetation", the next "only uses one, or two pixel tall clusters", and further planes show no blades at all. Pixelblog 11 adds that far objects "become less saturated and contain less colors", and that "the closer an object is to the vertical position of the horizon, the more distant it appears".
Sources: https://www.slynyrd.com/blog/2026/5/27/pixelblog-62-landscape-backgrounds ; https://www.slynyrd.com/blog/2018/11/16/pixelblog-11-landscape-pixeling
**Wander will:** give the colour column in the table the force of a rule: the playfield gets a full 5-6 step ramp, z of 2-3 gets 4, z of 5-8 gets 3, z of 13 and beyond gets 2, and the farthest ridge borrows the sky's colour. In the forest the fog target is the glow colour (the teal `#2698A5` core by day, violet at night) rather than sky blue. Depth therefore runs toward the backlit glow, matching the owner's teal forest reference and the Slynyrd forest note. Foliage detail per slot follows the blades, then 1-2 px clusters, then flat silhouette progression.

**11. Keep palettes clean: shift palettes per layer, and quantize any per-pixel fog back into the palette.**
Dan Fessler's "HD index painting" paints in smooth greyscale that "procedurally gets mapped to the indexed palette", with dither patterns ("usually no larger than 16x16") turning soft gradients into clean indexed pixels. Slynyrd's per-plane ramps (finding 10) show the same idea at authoring time, with a few flat colours per plane. Alto's Adventure, as a fan analysis describes it, separates foreground and background by "making the colour more 'pure' while creating a tint in the background", with "a limited colour palette in each individual area". (That is a secondary source; no first-hand Alto rendering source was found.)
Sources: http://danfessler.com/blog/hd-index-painting-in-photoshop ; https://www.slynyrd.com/blog/2026/5/27/pixelblog-62-landscape-backgrounds ; https://blogs.ulster.ac.uk/cormacmccann/?p=794
**Wander will:** author layer art as indexed images, with a palette index in R. Each frame, or every 250 ms, it computes a per-layer palette texture: `paletteRow[layer][i] = lerp(base[i], fogColor(z, t), F(z))` for every base colour. The layer shader then just looks colours up, so each layer stays flat and few-coloured, and day/night becomes palette animation. Where fog must vary inside a layer (height mist, the sun glow), F is quantized to 4 levels with one shared 4x4 Bayer pattern at native resolution and looked up in precomputed `palette x 4` rows. That avoids free per-pixel lerps that would invent off-palette colours.

### C. Fog, haze and valley mist

**12. Fog that doesn't look like a flat overlay means many thin sheets at their own depths, each drifting and parallaxing, rather than one screen-wide wash.**
The Godot "2D fog overlay" shader is the basic building block. It scrolls a noise texture (`uv = UV + speed*TIME`, default speed `(0.02, 0.01)` UV/s), remaps with `clamp(noise*2-1, 0, 1)` so the fog breaks into patches with clear gaps, and multiplies alpha by `density` (default 0.25). The shader is one layer, and its author notes that more layers would give more depth. Hollow Knight handled its light and atmosphere with "soft transparent shapes" placed among the layers. Fog cards in 3D tools follow the same principle: many soft planes placed among the geometry rather than a single post effect.
Sources: https://godotshaders.com/?p=6438 ; https://unity.com/madewith/hollow-knight
**Wander will:** draw 3-5 fog sheets per scene, each placed between two depth slots with its own `z`. Each sheet:
- scrolls at `1/z` plus its own wind speed;
- uses two noise octaves at different scales and speeds (the second at about 2.3x the frequency and 0.6x the speed) so the shapes evolve instead of sliding;
- is coloured with the fog ramp at its own depth, so near sheets are darker and more saturated and far sheets match the haze;
- has its alpha quantized to 3 levels with the shared Bayer pattern at native resolution.

A sheet only veils what lies behind it, because the layers drawn in front cover it. That gives the "each veil makes everything behind it hazier" effect the owner asked for in the earlier forest.

**13. Valley mist pools in the low ground between ridges and is densest just after sunrise. Model it as a height-fog band cut off by the next ridge's silhouette.**
Wikipedia: radiation fog forms "after sunset, in clear and calm conditions", "most often occurs over swampy terrain and in valleys where cold air flows in and collects at the bottom", and "is thickest shortly after sunrise", before the sun burns it off. Valley fog "can form more quickly and last longer", sometimes "for several days" in winter. Quilez gives analytic height fog for density that falls off exponentially with height: `fogAmount = (a/b) * exp(-ro.y*b) * (1 - exp(-t*rd.y*b)) / rd.y`.
Sources: https://en.wikipedia.org/wiki/Fog ; https://iquilezles.org/articles/fog/
**Wander will:** after each ridge or hill layer i (L3-L7), draw a mist band whose density is `m(y) = M_t * exp(-(y_base_i - y)/H)`. Here y is measured upward from that layer's valley floor, H is 6-14 native px (thicker for farther gaps) and `M_t` is the time-of-day density (peak about 30-60 min of game time after sunrise, near zero by midday, rising again after dusk on clear nights; also high in swamp and coast biomes). Layer i-1 is drawn on top, so its silhouette cuts the band and the mist appears to fill only the gaps between ridges. The band has a slow noise and wind drift, and its top edge is quantized to 3 dither levels.

**14. Banding: a full-resolution gradient layer needs triangular-noise dither added just before quantization, in the colour space where it is quantized.**
Mikkel Gjøl (Playdead, "Banding in Games") lists fog, lighting and alpha blending as the places banding shows up. His rules:
- dither "in whatever space the color will be quantized in", for example `srgb2lin(dither(lin2srgb(c)))`;
- use symmetric triangular noise `rnd.x + rnd.y - 1` at 1 LSB scale (`/255`), cross-faded to 1-LSB uniform noise near 0 and 1 to avoid clamping bias;
- vary the noise over time;
- give each blended layer a different seed;
- prefer premultiplied alpha, since multiplicative blending after the fact rescales the noise.

The INSIDE GDC 2016 abstract stresses that subtle art can be "saved from drowning in color-banding, by properly using dithering".
Sources: http://loopit.dk/banding_in_games.pdf ; https://gdcvault.com/play/1023002/Low-Complexity-High-Fidelity-INSIDE
**Wander will:** dither the full-resolution atmosphere layer (sky gradient, sun halo, god rays, broad haze glow) with time-varying triangular noise at plus or minus 1/255 in sRGB, in premultiplied alpha, with a unique seed per pass. Native-resolution layers aren't noise-dithered, because they use the ordered Bayer pattern from findings 11-13.

**15. Native resolution or full resolution: put fine structure on the pixel grid, and keep only broad, soft light at full resolution.**
Tim Soret's jam version of *The Last Night* was "rendered in 360*150 then upscaled x2", later "640x270". The team was "upgrading pixel art with lighting & post-processing". Kingdom's developer says rendering low-res art pairs with "realtime lights, reflections, and other shader-based effects". Unity's upscale path is there to keep pixels "unaliased and unrotated".
Sources: https://threadreaderapp.com/thread/976819508441681920.html ; https://80.lv/articles/kingdom-how-2-guys-created-a-side-scrolling-strategy/ ; https://docs.unity3d.com/Packages/com.unity.2d.pixel-perfect@5.0/manual/index.html
**Wander will:** use a split rule.
- **Native resolution, quantized:** layer colours, fog sheets, valley mist and rain. These have edges you can see, so they must sit on the grid.
- **Full resolution, smooth and dithered:** only things with no edges, such as sky gradients, halos, god rays and a very low-contrast (under 8% alpha) haze bloom near the glow. Nothing at full resolution may contain detail finer than about 8 native pixels, or it will read as mixed pixel sizes.

### D. God rays

**16. The reference method is GPU Gems 3, chapter 13: a radial blur from the sun's screen position over an occlusion mask.**
Kenny Mitchell's shader steps from each pixel toward `ScreenLightPos` in `NUM_SAMPLES` steps (`delta = (uv - lightPos) / NUM_SAMPLES * Density`). It accumulates `sample * illuminationDecay * Weight`, multiplies `illuminationDecay` by `Decay` each step, and scales the total by `Exposure`. What the parameters do:
- Density: higher means shorter but brighter shafts.
- Decay: in [0,1], the falloff.
- Weight: per-sample intensity.
- Exposure: overall level.

The occluders are rendered black in a pre-pass first, because sampling textured scene colour causes streaks. The chapter lists known problems: shafts can appear in front of foreground objects; there is "boundary flickering" when occluders cross the screen edge; and light sources off to the side need clamping or fading. It suggests downsampling to save bandwidth, and Fabien Sanglard's implementation says rendering the occlusion pass at half resolution "gives good results".
Sources: https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process ; https://fabiensanglard.net/lightScattering/index.php
**Wander will:** build the occlusion mask at 320x180 from the layers' alpha, with sky and sun as the bright source and every layer from L0 back to the canopy as black. It will blur radially from the sun's screen position (including just off-screen) with 48 samples. Untested starting values: Density 0.9, Decay 0.965, Weight 1/48, then Exposure tuned by eye. The result is tinted by the fog colour, multiplied by the current haze density (no haze means no rays), and added in the full-resolution layer. Ray strength fades in over dawn and fades out as the sun rises past about 25 degrees or leaves the frame by more than 15% of the width.

**17. Physical cues for rays: they are really parallel and only appear to fan out from the sun, they need haze and contrast, and they are warm at twilight.**
Wikipedia: crepuscular rays appear "when the Sun appears to be just above or below a layer of clouds, during the twilight period". They are "especially prominent when the contrast between light and dark is most obvious". They "are in fact almost parallel ... they appear to radiate outwards, due to a perspective effect". At low sun the light crosses "about 40 times more air than when the Sun is overhead", hence the warm colour. Anticrepuscular rays can appear opposite the sun.
Source: https://en.wikipedia.org/wiki/Crepuscular_rays
**Wander will:** tie rays to the dawn and dusk keys and to gaps in the occluders: tree canopies in the forest, ruins, ridge notches. Ray colour comes from the sun haze colour at that moment, so it is pale gold at dawn and cold and silver on misty mornings. On a few rare mornings, a faint anticrepuscular fan on the side away from the sun is a quiet reward for watching.

**18. A cheap stand-in: hand-placed, animated shaft quads. These suit fixed canopy gaps.**
The Godot "God Rays" canvas shader draws two layers of procedural noise rays in a rotated and skewed UV space, with screen blending. Its defaults are a useful starting point:
- angle -0.3, position -0.2;
- spread 0.5 (0 means parallel rays), cutoff 0.1, falloff 0.2, edge_fade 0.15;
- speed 1.0 (shimmer);
- ray1_density 8, ray2_density 30, ray2_intensity 0.3;
- colour (1.0, 0.9, 0.65, 0.8).

A "Pixelated God Rays" variant quantizes the output for pixel art.
Source: https://godotshaders.com/shader/god-rays/
**Wander will:** use authored shaft quads (two noise layers, slow shimmer, edge fade) for light through specific canopy holes in the forest's home-tree area and for interiors and ruins, where the radial pass gives no control. Each quad is anchored to its occluding layer's `z`, so it parallaxes with the gap that makes it. The global radial pass handles open landscapes at dawn.

### E. Depth cues beyond parallax

**19. Beyond about 30 m the brain gets little from motion. Wander's backdrop is "vista space", so a still frame must read deep on its own.**
Cutting and Vishton (1995) divide perceived space into personal space (arm's reach), action space (about 1-30 m) and vista space (beyond 30 m), weighting depth cues differently in each. The three-space split is quoted in the PMC review below. The commonly cited ranking puts occlusion, relative size, height in the visual field and aerial perspective as the cues that work at vista distances, while motion perspective weakens with distance. That ranking comes from the original chapter, which I could not open. Separately, the owner's loop-artist touchstones (mostly still frames) and the wanderer's frequent pauses mean parallax is absent much of the time.
Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC4584972 (original chapter not accessed)
**Wander will:** pass a still-frame depth checklist for every biome before tuning motion:
1. Occlusion: each layer overlaps the one behind it somewhere on screen.
2. Size: the same object class appears at at least 3 sizes in view, following `1/z`.
3. Height: baselines rise toward the horizon by `y_h + (y_g1 - y_h)/z`.
4. Aerial perspective: F rises steadily, with value steps of at least 8% luminance between neighbouring layers.
5. Detail: blades, then clusters, then flat shapes.
6. Edges: crisp at native resolution, softened only by using fewer, closer-valued colours far away, never by blur.

**20. A tiny figure reads against layered depth when it sits on the highest-contrast plane, picks up local light, and has open, quiet space around it.**
Craig Adams on Sword & Sworcery: "expansive landscapes with all this active negative space, some of them just fields of solid color, and there's a real sense of mystery". Its environments are "basically just paintings, 512x512 or 1024x512" with "a zillion entities" added on top. Tim Soret lights characters by scattering "invisible colored points" and tinting "character sprites by interpolating between the closest colors". Limbo relies on silhouettes and a greyscale value structure.
Sources: https://cdm.link/inside-handheld-game-art-the-art-style-and-making-of-swords-sworcery-superbrothers-pixel-cinema/ ; https://threadreaderapp.com/thread/976819508441681920.html ; https://en.wikipedia.org/wiki/Limbo_(video_game)
**Wander will:**
- Give the playfield (z=1) the full value range, while everything behind is held to a narrower, lighter (by day) or darker (by night) band. The wanderer's silhouette then always contrasts with whichever layer is directly behind it, usually a lit haze band or the forest glow.
- Tint the figure with the colour of the nearest light probe: sky colour, sun haze, lantern.
- Apply the playfield's own small fog (F of about 0.02, more in mist) to the figure too, so it doesn't look pasted on.
- Keep about 60% of the frame as quiet, low-detail fields (sky, far haze) so a 16-24 px figure is the focal point.

### F. Weather at depth

**21. Rain and snow at several depths: apply the same `1/z` to drop size, fall speed and parallax, and fog each plane like any layer.**
Rain physics from Wikipedia: drops range from 0.1 to 9 mm; drizzle (0.5 mm) lands at about 2 m/s and large drops (5 mm) at about 9 m/s. A shipped 2D and pixel-art rain asset (a product listing, not a primary source) uses 3 independent layers, foreground, midground and background, for "a natural sense of space and parallax". Under projection, a drop plane at depth z shows drops at `1/z` size, `1/z` screen fall speed and `1/z` horizontal parallax.
Source: https://en.wikipedia.org/wiki/Rain
**Wander will:** draw rain in 3 native-resolution planes.
- **Far (z of about 5):** 1x2 px drops, many, slow on screen, coloured almost entirely by fog at `F(5)`, drawn behind L4.
- **Mid (z of about 2):** 1x4-6 px, drawn between L2 and L1.
- **Near (z of about 0.8):** 1x10-14 px, sparse, slightly brighter, drawn in front of the playfield.

Wind slant is shared by all planes. Each plane's horizontal scroll uses its own `1/z`. Raising rain intensity also raises the fog sigma to 0.5 and lowers the far layers' contrast. That fall in visibility is itself a depth cue.

Snow uses the same planes at about 1/6-1/10 of the rain speed, with sinusoidal sway whose amplitude scales by `1/z`. That speed ratio is a design choice; I didn't verify a snowfall speed source. Splashes and settling happen only on the playfield.

**22. Mist rising from water happens when cold air passes over warmer water. It belongs to cold dawns, on lakes, rivers and coast.**
Wikipedia: "Sea smoke, also called steam fog or evaporation fog, is created by cold air passing over warmer water or moist land". It is convective and "can be very dense and deep". Radiation and valley fog favour "late autumn and winter" and calm, clear nights (finding 13).
Source: https://en.wikipedia.org/wiki/Fog
**Wander will:** spawn slow, rising, quantized wisps 4-12 px tall over water surfaces at every depth, scaled by `1/z` and coloured by the fog at their `z`, when the air is colder than the water. That condition covers cold-season and pre-dawn keys, swamp, coast and tundra lakes. The wisps fade out as the morning mist key falls. On calm nights they also give the water a soft haze band, which helps the reflection read as a separate depth.

### G. How the reference games fit

**23. Summary of what was verifiable about each named game, and the lesson Wander takes.**
- *Firewatch*: a depth-indexed fog ramp with alpha, two fog systems, and fog, sun, rays and grading interpolated together (finding 9).
- *Ori*: sprites in real 3D depth under a perspective camera, and "a layered painterly look" (finding 3, partly from forum reports).
- *Hollow Knight*: 2D assets in a 3D environment, light and atmosphere as soft transparent shapes (findings 3 and 12).
- *The Last Night*: low internal resolution (360x150, later 640x270), dozens of parallax layers, lighting and post on top of pixel art, characters tinted by nearby colour probes (findings 2, 15 and 20).
- *Sword & Sworcery*: painted 512 to 1024 px scenes, big flat colour fields, negative space (finding 20).
- *Limbo / INSIDE*: silhouettes, greyscale value structure, and dithering against banding (findings 14 and 20).
- *Alto's Adventure / Odyssey*: built from untextured 3D geometry with dynamic lighting and weather including fog. Harry Nesbitt (Unity forum) says "most assets ... are built from 3D geometry, with little to no texture work", and a fan analysis notes a pure foreground with a tinted background (finding 11).
- *Kingdom*: low-resolution art with realtime lights and reflections (finding 15).

Sources: https://discussions.unity.com/t/altos-adventure-available-feb-19th-for-ios/567636 ; https://gamedeveloper.com/business/road-to-the-igf-team-alto-s-i-alto-s-odyssey-i- ; plus those cited above.
**Wander will:** take its structure from Firewatch (one atmosphere state driving ramp-based fog per depth), its staging from Ori and Hollow Knight (many layers at true depths, light as soft shapes), its pixel discipline from The Last Night and Slynyrd (native-resolution layers, light and atmosphere on top), and its emptiness from Sword & Sworcery and the owner's melancholic brief (cold, muted, warmth only at the sun's edge at dawn and in the creature's own lights).

---

### Sources I could not access or found nothing in
- **GDC Vault video "The Art of Firewatch"** (https://gdcvault.com/play/1022295/The-Art-of): not watched. The fog ramp details come from three independent rebuilds that cite the talk (Alisavakis, grrava, Hyphinett) and from Campo Santo's own blog.
- **INSIDE rendering slides** (http://loopit.dk/rendering_inside.pdf): the file is over the 10 MB fetch limit, and the 80.lv summary page returned no body. Only the GDC abstract and Gjøl's separate banding deck were read.
- **Polycount Ori threads** and the **gamedev.net "2D background depth"** thread: HTTP 403. Mahler's quote that Ori places sprites "in 3D space so all scenes have a real perspective" appeared only in search snippets and isn't relied on.
- **Cutting and Vishton 1995 chapter PDF** (Cornell server refused the connection): only the three-space split was verified, through a PMC review.
- **Alto's Odyssey**: no first-hand technical source on its fog or layers. The Unity "made with" page returns 404, and interviews (Game Developer, The Next Web, MacStories audio) contain no rendering detail.
- **Owlboy, Eastward, Gris, Kingdom Two Crowns**: no primary technical breakdown of their layering or fog was found before the session's shared web-search budget ran out mid-research. The Kingdom (80.lv) and Hollow Knight (80.lv breakdown) pages read had almost no depth detail.
- **James Gurney's blog**: the "Atmospheric Perspective" label page has no posts, and the rules were taken from Slynyrd and Wikipedia instead.
- **Fabien Sanglard's god-ray page** gives the shader but no numeric parameter values. The values in finding 16 are untested starting points, not sourced.

---

## HD with pixel art

Scope: rendering pipeline, integer scaling and a smooth sub-pixel camera for a WebGL2 side-scroller whose world is pixel art at one native resolution. Over that sits a full-resolution layer of light and air. Each finding gives the evidence, the sources I actually read, and what Wander will do with it. Sources I could not open are listed at the end. Claims that only reached me through a search-result summary are marked *(unverified)*.

### The recommendation in one screen

* **Native resolution: 640x360.** That is 3x at 1080p, 4x at 1440p and 6x at 4K, all exact. On screens that are not 16:9, Wander shows more world instead of adding black bars.
* **One native render target per parallax layer**, each (W+2)x(H+2) and drawn at its own *integer* offset. One full-resolution composite pass then shifts each layer by its *own fractional* offset, using an "antialiased point sampling" filter. When a layer is grid-aligned this filter is exactly nearest-neighbour; otherwise it blends only one screen pixel per native edge.
* **Light on surfaces at native res; light in the air at full res.** Lantern falloff and per-hour palette shifts are computed once per native pixel. Bloom, fog, god rays, rain, grain and vignette are full res.
* **Bloom comes only from an emissive mask**, drawn by hand next to the art. It goes through a mip-chain or dual-filter blur at native resolution or below, then is upsampled smoothly and added at full res.
* **Final pass:** add bloom, grade with a 3D LUT, apply vignette and grain, then add triangular blue-noise dither of ±1 LSB just before the 8-bit write. All intermediate full-res buffers are RGBA16F.
* **Canvas sized in device pixels** with `ResizeObserver` and `device-pixel-content-box`, falling back to `round(css × devicePixelRatio)` on Safari. The integer scale is computed from device pixels.

---

### A. What shipped games do: native vs. full resolution

**1. HD-2D (Octopath Traveler, Triangle Strategy, Live A Live, DQ III HD-2D) has no native-resolution layer. Its sprites are point-sampled billboards in a 3D world, and every effect runs at output resolution.**
HD-2D places 2D pixel-art billboard sprites in fully 3D environments. It uses dynamic point lights (characters cast shadows), depth of field and tilt-shift for the "diorama" look, bloom, volumetric fog, particles and parallax. Octopath renders at 720p docked and 1024x576 portable, and Digital Foundry singled out its "extreme depth of field". At Unreal Fest East 2018, Acquire described it as "next-generation pixel art: classic dot art plus 3DCG processing". Characters carried dynamic lights that changed how their pixels read, and ambient environment light kept building shadows from going fully black. Developers said they first "went too far on the resolution and saturation, losing the appeal of pixel art" *(unverified: search summary of a Siliconera interview, page returned 403)*. The lesson for Wander: HD-2D blurs pixels on purpose (DoF) and lights them per screen pixel. Its in-focus plane stays crisp only because the sprite texels are large on screen.
Sources: https://en.wikipedia.org/wiki/HD-2D · https://automaton-media.com/devlog/report/20181023-78326 · https://nintendoeverything.com/octopath-traveler-technical-analysis/
**Wander will:** take HD-2D's *atmosphere* (bloom, fog, light shafts, cool/warm grading) but not its DoF blur on pixel layers. Depth comes from haze and colour (aerial perspective), never from blurring art. Saturation and contrast in the final grade stay restrained, following HD-2D's own warning.

**2. The Last Night (Tim Soret) began as low-res pixel art upscaled by an integer and grew its resolution. Its mood comes from lighting tricks, not from per-pixel smearing.**
Soret: "The whole thing was rendered in 360*150 then upscaled x2". The full game moved from 360x150 to 640x270, 3.2x the pixels. Its mood trick: "Invisible colored points are sprinkled around. Tint character sprites by interpolating between the closest colors." That gives one tint per sprite, so the sprite's pixels stay coherent. 4Gamer's E3 2017 report says the world is flat, pixel-art-textured polygons lit in 3D (a backlit dress gets translucent edges), with wet-surface reflections, fog and rain layered on top, and 4K support.
Sources: https://threadreaderapp.com/thread/976819508441681920.html · https://www.4gamer.net/games/385/G038505/20170616108/
**Wander will:** copy the "sprinkled invisible colour points" trick for the hooded creature. Sample an ambient-colour field at the creature's position, interpolating between nearby probes (a lantern, the night sky, mossy ground bounce), and tint the whole sprite by it. The creature then sits in the scene's light without per-pixel lighting on the sprite. This is cheap and fits the "only its lantern and eyes warm" mood.

**3. Other reference games: resolution and treatment.**
* Owlboy: base 640x360, Otus 39 px tall (Steam community statement, not the developer).
* Blasphemous: 640x360, "purist", avoided "fancy shaders or 3D elements" *(unverified)*.
* Hyper Light Drifter: 480x270 *(unverified)*.
* Celeste: 320x180 *(unverified)*.
* Stardew Valley: draws 4x-scaled sprites point-sampled into a target of window/zoom size, then scales that to the back buffer with *linear* filtering, so non-integer zoom works *(unverified; mod/forum description)*.
* Sea of Stars: "Full-on dynamic lighting. Our custom-made render pipeline…" (press kit). Claims of normal mapping, pixel-depth writing and sprite shadow casting are *(unverified)*.
* Noita: its glow shader can be toggled (F6) because of its full-res cost *(unverified)*.

Sources: https://steamcommunity.com/app/431730/discussions/0/3200369647710806615 · https://sabotagestudio.com/presskits/sea-of-stars
**Wander will:** treat 640x360 as proven ground for lush, detailed pixel worlds (Owlboy, Blasphemous). It will treat expensive full-res glows as something to budget, not assume (Noita).

---

### B. Native resolution and integer scaling

**4. Choose 640x360. It is the only candidate that hits 1080p, 1440p and 4K exactly.**
* 640x360: ×3 = 1920x1080, ×4 = 2560x1440, ×6 = 3840x2160 (×2 = 720p).
* 480x270: ×4 = 1080p and ×8 = 4K, but 1440p needs ×5.33. Integer ×5 gives 2400x1350 with 80 px bars left and right and 45 px top and bottom, or the native view grows to 512x288.

Godot's official docs recommend exactly this: "640×360 … scales to 1280×720, 1920×1080, 2560×1440, and 3840×2160 without any black bars when using integer scaling". They also say "Set the stretch scale mode to `integer`. This prevents uneven pixel scaling." A devlog notes that 480x270 "doesn't FEEL like a retro resolution unless the characters are enormous", and that 320x180 is "pretty claustrophobic".

Cost: 640x360 is 230,400 px per screen against 129,600, so 1.78x more art per screen. Benefit: on a 27" 1440p monitor one native pixel is about 0.93 mm (4 × 0.233 mm pitch). That is fine enough for a lush forest seen from across a desk.
Sources: https://docs.godotengine.org/en/stable/tutorials/rendering/multiple_resolutions.html · https://shweep.itch.io/the-machine-that-breathes/devlog/114161/resolving-resolutions
**Wander will:** use 640x360 native. The creature will be small, about 24–32 px tall against Otus's 39 px, so the scenery dominates ("scenery first"). Far parallax layers can be drawn with less detail to manage the extra art.

**5. Do not letterbox non-16:9 screens. Grow the native view instead, keeping the pixel size integer.**
Godot offers `keep` (bars) or `expand` (more world). Unity's Pixel Perfect Camera "Upscale Render Texture" renders at the reference resolution "or larger if the viewport has a wider or taller aspect ratio". For a side-scroller, extra width is free content. Formula: `scale = max(1, floor(min(devW/640, devH/360)))`, then `nativeW = ceil(devW/scale)` and `nativeH = ceil(devH/scale)`. Examples:
* 3440x1440 ultrawide: ×4, 860x360.
* 1920x1200: ×3, 640x400.
* MacBook 3024x1964: ×4, 756x491.

Extra *height* needs authored sky above and ground below.
Sources: https://docs.godotengine.org/en/stable/tutorials/rendering/multiple_resolutions.html · https://docs.unity.com/en-us/engine/6000.3/manual/unity2d/2d-urp/2d-pixelperfect/ref
**Wander will:** expand horizontally without limit. It will expand vertically up to about 400 native rows (layers authored with headroom), then center-crop with a dark matte. The composition is anchored to the horizon line, not the top of the screen.

---

### C. A smooth sub-pixel camera without shimmer or jitter

**6. The core technique: snap the camera to the integer grid, render one pixel larger, and shift the upscaled image by the fractional part.**
yal.cc (GameMaker): `camera_set_view_size(…, game_width + 1, game_height + 1)`, camera at `floor(x), floor(y)`, then `draw_surface_part(view_surf, frac(x), frac(y), game_width, game_height, 0, 0)` scaled to the screen. Entities stay on the grid and the view still glides. The article also warns that parallax backgrounds need *separate surfaces* to stay smooth. The engine alternatives show the trade-off:
* Godot's `snap_2d_transforms_to_pixel` gives "a crisper appearance at the cost of less smooth movement, especially when Camera2D smoothing is enabled". Godot says not to combine it with vertex snapping.
* Unity's Pixel Snapping "prevents sprites moving between pixels".
* Unity's Upscale Render Texture yields "unaliased and unrotated pixels".

Sources: https://yal.cc/gamemaker-smooth-pixel-perfect-camera/ · https://raw.githubusercontent.com/godotengine/godot/master/doc/classes/ProjectSettings.xml · https://docs.unity.com/en-us/engine/6000.3/manual/unity2d/2d-urp/2d-pixelperfect/ref · https://github.com/godotengine/godot-proposals/issues/6389
**Wander will:** keep `camX` as a float64 in JS, in native-pixel units. It splits `camX` into `n = floor(camX)` (used for drawing) and `f = camX − n` (used only in the full-res composite, as a shift of `f × scale` screen pixels). No world geometry is ever placed at a fractional native position inside a native buffer.

**7. Parallax: give each layer its own native buffer and its own fractional shift. A single shared grid makes slow far layers stutter.**
With one native buffer, a layer with parallax factor 0.1 at a walking pace of about 20 native px/s moves one native pixel every 0.5 s. That is a jump of 3–6 screen pixels at 2 Hz. Practitioners agree this breaks the illusion:
* Slynyrd: "I try to avoid slower than 1 pixel per frame, as the motion can look a bit jittery."
* A MonoGame thread: 1 px every 2–4 frames still sells it, "any movement smaller than that… the illusion of smooth movement is broken." Its fix: "draw your background to a RenderTarget2D and offset that thing by scrollOffset % 1".
* A GDevelop user at 640x360 saw layers at 0.2 px/frame "stumble from pixel to pixel".
* A post-mortem warns about layers "calculating their own camera offset and rounding independently".

The trade-off of per-layer shifts: pixels of different layers no longer share one grid, so a far pixel can peek out by a few screen pixels next to a near one. This is rarely noticed, especially since far layers are low-contrast haze.
Sources: https://www.slynyrd.com/blog/2019/11/12/pixelblog-23-parallax-scrolling · https://community.monogame.net/t/smooth-parallax-scrolling-for-low-res-2d-game/10741 · https://forum.gdevelop.io/t/parallax-pixel-art-not-smooth-640x360/68529 · https://bugnet.io/blog/how-to-debug-pixel-perfect-2d-rendering-issues · https://yal.cc/gamemaker-smooth-pixel-perfect-camera/
**Wander will:**
* For each layer *i*, compute `o_i = camX × p_i`, `n_i = floor(o_i)` and `f_i = o_i − n_i` in float64.
* Render the layer into an RGBA8 texture of (nativeW+2)x(nativeH+2), about 0.93 MB, drawn at integer offset `n_i − 1`, so the filter has a texel on both sides.
* Composite all layers in **one** full-res fragment shader that samples each layer with its own `f_i`. That is one pass, L texture fetches per pixel and no blend-unit overdraw.
* Sample static, pre-drawn strips straight from a wide REPEAT texture (WebGL2 allows non-power-of-two REPEAT), with no intermediate buffer.

**8. Upscale filter: "antialiased point sampling" (sharp-bilinear family). It is exactly nearest-neighbour when aligned and blends one screen pixel at a native-pixel edge when not.**
The shared idea (Casey Muratori, d7samurai, Themaister, CptPotato, mortarroad): use the hardware *bilinear* sampler but move the UV so interpolation happens only in the screen pixel that straddles a texel edge.
* d7samurai (HLSL, `tex` in texel units, bilinear sampler): `float2 pix = floor(p.tex) + min(frac(p.tex) / fwidth(p.tex), 1) - 0.5; return tex.Sample(s, pix / texSize);`
* Themaister's sharp-bilinear: `region_range = 0.5 - 0.5/scale; f = (center_dist - clamp(center_dist, -region_range, region_range)) * scale + 0.5;`
* CptPotato: "Integer scales will remain pixel-perfect while non-integer scales produce a softer, antialiased look."

Casey's Handmade Hero chat 018 shows why. Nearest-neighbour shimmers when panning by sub-texel amounts (54:54, 1:01:16), and bilinear smears (52:38). The fix is UV preconditioning (1:04:47–1:21:21). Unity frames the same choice: Point "keeps pixels sharp but can result in shimmering", Retro AA "can make the edges of pixels blurrier but reduces shimmer".
Sources: https://gist.github.com/d7samurai/9f17966ba6130a75d1bfb0f1894ed377 · https://raw.githubusercontent.com/libretro/glsl-shaders/master/interpolation/shaders/sharp-bilinear.glsl · https://raw.githubusercontent.com/CptPotato/GodotThings/master/SmoothPixelFiltering/README.md · https://raw.githubusercontent.com/CptPotato/GodotThings/master/SmoothPixelFiltering/SmoothPixel.shader · https://godotshaders.com/shader/sub-pixel-accurate-pixel-sprite-filtering/ · https://guide.handmadehero.org/chat/chat018 · https://handmade.network/forums/t/7164/p/22039
**Wander will:** sample every layer in the composite with the d7samurai formula. It uses `fwidth = 1.0/scale` as a uniform, since the scale is a known integer, and the layer textures use `LINEAR` filtering. At integer scale with `f_i × scale` a whole number, the output is bit-identical to nearest. Otherwise only one screen-pixel column per native edge is blended, which at 3x–6x reads as crisp. A debug toggle will quantize `f_i` to whole screen pixels (`round(f_i × scale)/scale`) for pure nearest output, to A/B test at 1080p, where the AA softening is most visible.

**9. The followed creature must not be snapped inside a moving layer, or it sawtooths by up to one native pixel.**
If the camera follows the creature smoothly while the creature is drawn at `round(x)` inside the foreground buffer, its screen position is `round(x) − camX`. That oscillates within ±0.5 native px, a 3–6 screen-pixel sawtooth on the one thing the eye tracks. yal.cc keeps entities on the integer grid *and* the camera integer for exactly this reason. Smooth scrolling then only works for the view as a whole.
Sources: https://yal.cc/gamemaker-smooth-pixel-perfect-camera/ · https://bugnet.io/blog/how-to-debug-pixel-perfect-2d-rendering-issues
**Wander will:** draw the creature (and any other moving sprite the camera tracks) as its own small native sprite quad in the full-res composite. Its float screen position `(x − camX) × scale` goes through the same AA point filter. With the camera locked to the creature it then stands rock-steady while the ground slides under it. Walk-cycle stride is set equal to ground speed so planted feet don't visibly skate (the slip stays under 1 native px).

**10. Time base: drive scrolling from the rAF timestamp, and never send large world coordinates or time to the GPU as float32.**
MDN: the rAF timestamp is "the end time of the previous frame's rendering". Always use it "otherwise, the animation will run faster on high refresh-rate screens" (60/75/120/144 Hz). Fixed-step simulation plus interpolation (`alpha = accumulator/dt`) removes the remainder stutter (Fiedler). An extra point that follows from float arithmetic rather than from a source: Wander runs for hours. At 20 native px/s, `camX` reaches about 720,000 after 10 hours. float32 resolves only about 0.06 px there and whole pixels past 2^24. A shader `time` uniform loses precision the same way.
Sources: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame · https://gafferongames.com/post/fix_your_timestep/
**Wander will:**
* Advance `camX` in float64 from rAF timestamps, with a fixed-step world and interpolated camera.
* Pass only `f_i` (fraction) and `n_i mod textureWidth` to shaders.
* Wrap every animated-shader time uniform to its own period in JS before upload.
* If the frame rate is capped to save power on a second monitor, skip frames *evenly* (every 2nd frame at 120/144 Hz), never irregularly.

---

### D. Bloom without smearing pixels

**11. Bloom only from an explicit emissive mask, not from a brightness threshold.**
Jorge Jimenez (CoD: Advanced Warfare, SIGGRAPH 2014) uses *no* threshold: "When using PBR the dynamic range is usually very high, so you don't need to threshold… the blurred bloom layer is set to a low value (say 0.04)". That only works with HDR. Wander's pixel art is LDR, so a pale moonlit trunk, white petals or sky would bloom as much as the lantern. ARM's bloom pipeline is "Threshold → Blur → Composite", and the mask replaces the threshold. Blooming only emissives also keeps the halo off ordinary pixel edges, so non-emissive art is never softened.
Sources: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/ · https://community.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_slides.pdf
**Wander will:** author an `emissive` layer in each `.aseprite` file (lantern, ember, lit windows, eyes, moon, fireflies), exported as a second PNG. It is drawn into a second colour attachment (WebGL2 `drawBuffers`/MRT) of each layer's native buffer, with a per-light intensity, so emissive brightness can exceed the LDR albedo. The emissive pixels themselves stay crisp in the colour layer; only the added glow is soft.

**12. Blur: a CoD-style mip chain (13-tap down with a Karis average on the first step, 3x3 tent up) or Bjørge's dual filter, run at native resolution or lower.**
* LearnOpenGL (implementing Jimenez): 5–6 mips, 13-tap downsample weights 0.5 centre + 0.125/0.0625/0.03125 rings, tent upsample `(4e + 2(b+d+f+h) + (a+c+g+i))/16` with additive blend, Karis weight `1/(1+luma)` on the first downsample against fireflies, final `mix(scene, bloom, 0.03–0.15)`, format `R11F_G11F_B10F`.
* Bjørge's "Dual filtering" (SIGGRAPH 2015): downsample = ½ centre + four ⅛ diagonal taps. It matched a 97x97 Gaussian (PSNR ≈ 49.8 dB, similar to Kawase), was stable where a naive `glGenerateMipmap` chain was not, and ARM reports "14 times performance improvement @ 1080p".
* WebGL2 can render to `RGBA16F`/`R11F_G11F_B10F` only with `EXT_color_buffer_float`, which is WebGL2-only and has been widely available since September 2021.

Sources: https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom · https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/ · https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/post-processing-effects-on-mobile-optimization-and-alternatives · https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float
**Wander will:** build bloom from a 640x360 emissive composite, through mips 320x180 → 160x90 → 80x45 → 40x23 → 20x12 (13-tap + Karis down, tent up, in `R11F_G11F_B10F` or `RGBA16F`). It upsamples to the screen with bilinear (bicubic if diamond artefacts show) and adds at full res. Bloom never touches full-res pixels before the final add. The cost is a few hundred thousand pixels, independent of 1080p or 4K.

**13. Bloom must move with its layer at sub-pixel precision, or halos hop one native pixel at a time.**
Bloom is low-frequency and tolerates low resolution, but its *position* must follow the smoothly shifted layer.
Sources: follows from findings 7 and 12; https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom
**Wander will:** build the bloom source by compositing each layer's emissive attachment into one native-sized (nativeW x nativeH) buffer with that layer's `f_i` applied through *bilinear* sampling, since smearing is fine for glow. The glow then slides smoothly with its layer.

---

### E. Atmosphere: what is pixel-safe

**14. Split light into "on surfaces" (native, one value per art pixel) and "in the air" (full res, smooth).**
HD-2D lights sprites per screen pixel, which makes a single art pixel non-uniform. Soret instead tints whole sprites (finding 2). A full-res smooth veil over crisp pixels doesn't blur edges, but a gradient can vary *within* one 6x6 native pixel.
Sources: https://en.wikipedia.org/wiki/HD-2D · https://threadreaderapp.com/thread/976819508441681920.html · https://automaton-media.com/devlog/report/20181023-78326
**Wander will:**
* Compute surface lighting at native res inside each layer pass: lantern falloff on the ground and trunks, ambient light per hour and the teal-day to violet-night palette ramp. It is sampled at native-pixel centres, so every art pixel stays one colour, ideally snapped to palette ramps (see finding 19).
* Compute air effects at full res: distance haze per layer, drifting fog wisps, god rays, bloom, rain and snow. They are drawn *between* layers in the composite shader (far layer → its haze → next layer …) so fog sits at a depth, not only on top.

**15. God rays: a radial blur from an occlusion mask (GPU Gems 3), at reduced resolution.**
Mitchell's post-process renders "occluding objects black and untextured" with the sky bright, then marches each pixel toward the light's screen position. Each step does `sample *= illuminationDecay * Weight; color += sample; illuminationDecay *= Decay;`, scaled by exposure and density. "Sampling may occur at a lower resolution."
Source: https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process
**Wander will:** derive the occlusion mask from the native layers' alpha, so canopy silhouettes block the sky and moon. It runs the radial blur at half screen resolution or at native, about 32–64 samples, upsamples bilinearly and adds before grading. Shafts move smoothly because the mask uses the same per-layer `f_i`.

**16. Heat shimmer and water wobble: shift whole native pixels per row (the SNES HDMA trick), never a free UV warp of the pixel layer.**
A UV distortion of the upscaled image cuts native pixels into irregular fragments and mixes neighbours, which is exactly the smear to avoid. The SNES did shimmer as per-scanline register changes: "Horizontal waves (water)" via BG scroll registers, "Vertical waves (fire)" via vertical scroll. Every row moves by whole pixels, so pixels stay pixels.
Source: https://sneslab.net/wiki/HDMA
**Wander will:** implement shimmer (above a campfire or ember) and water reflections as native-res row offsets. `row_offset = round(A · sin(y·k + t·ω))` with A ≤ 1–2 native px, applied in the layer pass over a masked region. A separate full-res refraction may distort only the *air* layer (fog and haze texture), never the art.

**17. Rain, snow and splashes at full res, sized in native pixels.**
At full res a 1-device-pixel streak is six times thinner relative to the art at 4K than at 1080p. *(No external source; follows from the integer-scale maths in finding 4.)*
**Wander will:** draw rain as full-res antialiased streaks whose width and length are given in native pixels × `scale`. Typically 1 native px wide at about 30–40% opacity, so the look matches at 1080p and 4K while the motion stays perfectly smooth. Splashes and snow flakes are native-res pixel sprites placed at float screen positions with the AA point filter (finding 8), so they read as pixel art but fall smoothly.

**18. Chromatic aberration and CRT: avoid. Vignette and grain: yes, but subtle and dithered.**
CA shifts R/G/B by sub-native-pixel amounts and fringes every pixel edge. CRT scanlines darken a fixed band through each fat pixel and moiré at non-matching scales. Both go against "effects must serve the pixel art". *(No primary source; inference from findings 8 and 21.)* Vignettes are dark smooth gradients, the case Gjøl identifies as most prone to banding.
Source: http://loopit.dk/banding_in_games.pdf
**Wander will:** ship no CA and no CRT. The vignette is a gentle radial falloff in the final pass, dithered. Grain is temporal, about 1–2 device px per grain (cell size `max(1, round(scale/3))` so it looks similar at 1080p and 4K), at low amplitude, and added before quantization (finding 21).

---

### F. Order of operations, grading, banding

**19. Grade at the end with a 3D LUT at full res. Keep art-directed palette shifts at native res.**
A per-pixel colour transform commutes with nearest upscaling, so grading native-then-upscale gives the same pixels as upscale-then-grade. Grading last also grades fog, bloom and rays consistently with the art. GPU Gems 2: a 32³ LUT (a 256x128-ish texture) with hardware trilinear interpolation, half-texel correction `coord·(N−1)/N + 0.5/N`, "independent of both the number of color operators applied and the underlying color transform complexity". WebGL2 supports 3D textures.
Source: https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-24-using-lookup-tables-accelerate-color
**Wander will:** keep a 32³ LUT per key hour (dawn, day, dusk, night, deep night) and blend between two by time of day in the final pass. The forest's identity, its 16-colour reference palette and teal by day / violet by night, is carried by native-res palette ramps in the layer pass. That keeps every art pixel on-palette. The final LUT stays gentle (contrast, split-toning, a cold overall bias) so it doesn't break the palette.

**20. The pipeline order.**
Assembled from findings 6–19:
1. **Native passes (per layer, far → near).** RGBA8 colour plus emissive MRT at (W+2)x(H+2), integer offsets. Contents: tiles, props, native palette ramp per hour, surface lighting at texel centres, row-shimmer.
2. **Bloom source.** Emissives composited with per-layer `f_i` at native size, then the mip-chain or dual-filter blur.
3. **God-ray mask.** From layer alpha at half or native resolution, then radial blur.
4. **Full-res composite into an RGBA16F scene buffer.** One shader: for each layer, AA-point-sample with `f_i`, then add that depth's haze or fog veil. Then the creature and float-positioned sprites, then rain and snow.
5. **Final pass to the 8-bit canvas.** Scene + bloom + rays, then LUT grade, vignette, grain, triangular blue-noise dither, write.
6. **Letterbox or matte**, if expand is capped.

Sources: as in findings 6–19.
**Wander will:** implement exactly this order, with every full-res intermediate in RGBA16F and only the canvas in 8-bit.

**21. Banding: dither once, at the very end, with triangular-PDF noise of ±1 LSB in the output colour space. Grain only hides banding if it is added before quantization.**
From Mikkel Gjøl (Playdead), "Banding in Games: A Noisy Rant":
* Gradients from fog, light falloff and glow band most, especially in darks.
* "Dither just before quantizing", "in whatever space the color will be quantized in".
* "Dithering after quantisation does not remove banding (e.g. LDR film-grain at end of frame)". Grain is fine "at time of tonemapping" while the signal is still high-precision.
* Use a *triangular* distribution (it avoids "noise modulation"). "GPUs round, so dither-range should be [-1;1[". "Blue noise is less noticeable".
* Near 0 and 1, clamping breaks symmetry, so "lerp to a 1LSB uniform-PDF noise at boundaries".

Sources: http://loopit.dk/banding_in_games.pdf · https://bartwronski.com/2016/10/30/dithering-in-games-mini-series/
**Wander will:** in the final pass, after grade, vignette and grain and on the sRGB-encoded value, add `(b1 + b2 − 1)/255` from a tiled 64x64 blue-noise texture (two channels make a triangular PDF), offset per frame. It fades to uniform ±0.5 LSB near black and white. On flat pixel-art colours this ±1/255 noise is invisible but kills banding in fog, rays and vignette. If purists object, multiply it by the atmosphere's coverage at that pixel.

---

### G. Browser: exact device pixels, DPR and fullscreen

**22. Size the canvas in device pixels with `ResizeObserver` and `device-pixel-content-box`. `innerWidth × devicePixelRatio` can be off by one.**
web.dev: browsers snap fractional CSS sizes differently (a `791.984px` element can become 791 or 792 device px), and fractional DPR from OS scaling or zoom makes the naive maths wrong. `devicePixelContentBoxSize` gives "an exact one-to-one mapping between canvas pixels and physical pixels", and the callback runs after layout and before paint. It works in Chrome/Edge 84+ and Firefox 108+; Safari has no support through 27.2 (caniuse). MDN warns that with non-integer DPR, "certain pixels may be drawn larger than others". webglfundamentals shows the fallback chain and `gl.viewport(0, 0, canvas.width, canvas.height)` after resizing.
Sources: https://web.dev/articles/device-pixel-content-box · https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserverEntry/devicePixelContentBoxSize · https://caniuse.com/mdn-api_resizeobserverentry_devicepixelcontentboxsize · https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html · https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look
**Wander will:**
* Use a full-viewport canvas (`position:fixed; inset:0; width:100vw; height:100vh`), observed with `{box:'device-pixel-content-box'}` and falling back to `content-box` × DPR, rounded.
* Set `canvas.width/height` to those device pixels and recompute `scale`, `nativeW/H` and the per-layer targets on every callback. The callback fires on zoom and DPR changes too.
* Never derive scale from CSS pixels.

**23. With a 1:1 canvas, the browser does no scaling. `image-rendering: pixelated` is only a safety net.**
MDN: `pixelated` scales "to the nearest integer multiple … then uses smooth interpolation" (the browser's own sharp-bilinear), while `crisp-edges` is pure nearest. With an exact device-pixel backing store Wander's own shader does all the scaling, so the property only matters during the frame between a resize and the next observer callback.
Source: https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering
**Wander will:** set `image-rendering: pixelated` on the canvas anyway, and do all upscaling in its own composite shader (findings 7–8).

**24. Fullscreen for a second monitor needs a user gesture; the Window Management API can pick the screen.**
`element.requestFullscreen({ navigationUI: "hide", screen })` returns a Promise, needs transient user activation, and fires `fullscreenchange`. The `screen` option takes a `ScreenDetailed` from `getScreenDetails()` (Chromium), which lets a click on monitor A open fullscreen on monitor B.
Source: https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
**Wander will:** show a single "Enter fullscreen" click target, request fullscreen on the `documentElement` with `navigationUI:"hide"`, and offer a screen picker where `getScreenDetails` exists. It lets the `ResizeObserver` (finding 22) handle the new device size, so 1080p, 1440p and 4K resolve to ×3, ×4 and ×6 automatically.

---

### Sources I could not access

* **unrealengine.com** returned 403 for every page tried: the Octopath HD-2D spotlight, the Octopath II developer interview and the Unreal Fest Europe 2019 talk page "The Fusion of Nostalgia and Novelty in the Development of Octopath Traveler". So HD-2D findings rest on Wikipedia, Automaton's Unreal Fest East 2018 report and Digital Foundry coverage.
* **Siliconera, Nintendo Life, Nintendo Wire and TechRaptor** (Children of Morta art article) returned 403. HD-2D "too much resolution/saturation" is quoted only via a search summary.
* **No CEDEC talk** on HD-2D DoF or bloom could be located.
* **t3ssel8r**: the "Crafting a Better Shader for Pixel Art Upscaling" video and Patreon notes (403) and his 3D camera-snapping videos were not readable as text. **Aarthificial**'s pixel-perfect camera video is also YouTube-only. The **Texel Splatting** paper (arXiv 2603.14587) cites t3ssel8r for grid snapping under orthographic projection but gives no detail.
* **Not found:** the "Manual texture filtering for pixel art" (Jasmine) article, Cole Cecil's upscaling post and Daniel Ludwig's smooth-scrolling write-up.
* **Khronos WebGL wiki** "HandlingHighDPI" returned 403.
* **Not verified from primary sources:** Eastward, Dead Cells (Thomas Vasseur's 3D-to-pixel article), Kingdom Two Crowns, Moonlighter, Unsighted, Noita and Sea of Stars internals.
* **Web search budget ran out** late in the session. Remaining gaps (HLD, Celeste and Blasphemous resolutions from primary sources; a "mixels" definition) were left marked *(unverified)* rather than chased further.

---

## Procedural generation

**Conventions used below.** Native frame is 640×360. `d` = distance along the road in native pixels of the walker's (ground) layer. I assume a walking speed of **v ≈ 20 px/s**, so the 640 px screen crosses in 32 s and 1 min of walking is about 1,200 px. Scale every length below if v changes. Each parallax layer `L` has a factor `f` (ground = 1; far ridges < 1; foreground > 1) and its own coordinate `u = d·f + screenX`. A finding marked *derived* is my own reasoning built on the cited sources, not something a source states.

---

### A. Determinism, hashing and chunk streaming

#### F1. Use counter-based (noise-based) RNG, never a stateful RNG
- Eiserloh's GDC 2017 talk argues that a **noise function `noise(position, seed)` should replace a stateful RNG**. It gives "unordered access, better reseeding, record/playback … lock-free parallelization" while being "smaller, faster, and easier to use".
- SquirrelNoise5 core, read from the npm port's source (constants exact):
  ```
  m = pos * 0xd2a80a3f; m += seed; m ^= m >>> 9;
  m += 0xa884f197;      m ^= m >>> 11;
  m *= 0x6c736f4b;      m ^= m >>> 13;
  m += 0xb79f3abb;      m ^= m >>> 15;
  m *= 0x1b56c4f5;      m ^= m >>> 17;      // all uint32
  ```
  The port also defines 2D/3D primes 198491317 and 6542989 (for `x + P1*y …`). It uses BigInt, which is slow. In TS, use `Math.imul(...)`, `(a + b) | 0` and `>>> 0` instead.
- JCGT "Hash Functions for GPU Rendering" (Jarzynski & Olano 2020) tested more than 100 hashes against TestU01. **`pcg` is "a good default choice" for a 1→1 hash** (30 BigCrush failures):
  ```
  uint pcg(uint v){ uint state = v*747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word; }
  ```
  For several inputs, **nest the hash** (`h(x ^ h(y))`). A linear combination `hash(aX+bY+cZ)` "greatly diminishes the quality … generates repeating patterns".
- Sources: https://gdcvault.com/play/1024365/Math-for-Game-Programmers-Noise (abstract only; members-only video) · https://registry.npmjs.org/squirrel-noise-5/-/squirrel-noise-5-1.5.0.tgz (`SquirrelNoise5.js`, read) · https://jcgt.org/published/0009/03/02/ (paper.pdf + supplementary.pdf, read)
- **Wander will:** route every random decision through `h = sq5(index, sq5(kind, sq5(chunkOrLayer, worldSeed)))` (nested, uint32, `Math.imul`). The existing `rng()` (mulberry32) in `src/noise.ts` stays only for drawing a single sprite from its own seed. The existing `hash2` (a murmur-style finalizer) is fine for 2 inputs.

#### F2. Math.sin hashes and transcendental functions break determinism
- ECMA-262 says `Math.sin` returns "an **implementation-approximated** Number value". It only *recommends* fdlibm ("recommended (but not specified by this standard)"). Different JS engines may therefore differ in the last bits. Basic IEEE-754 operations (+ − × ÷, sqrt) are exactly specified, so they do match.
- In JCGT the classic `fract(43757.5453*sin(dot(p, vec2(12.9898,78.233))))` ("trig") fails **140** BigCrush tests and is "obviously bad, with visible banding, linear artifacts, and repeated patterns". Deep-Fold's PixelPlanets shaders (used below for their pixel-art ideas) use exactly this `rand()`. Copy their ideas, not their hash.
- Sources: https://tc39.es/ecma262/multipage/numbers-and-dates.html (§21.3.2 Math, §21.3.2.30 Math.sin) · https://tc39.es/ecma262/multipage/overview.html (§4.4.1) · JCGT above
- **Wander will:** build the generator (`src/gen/**`) only from integer hashes and polynomial interpolation (smoothstep/quintic), which reproduce bit-for-bit across engines. Redistribution exponents become integer powers (`e*e*e`, not `Math.pow`). `Math.sin`/`cos`/`pow`/`exp` are allowed only in cosmetic, per-frame paths (sway, water) and never in anything that feeds a threshold or placement.

#### F3. Floating-point precision at large distances: chunk-relative coordinates
- The Godot docs give the single-precision step by distance from the origin: [2048;4096] ≈ 0.0002, [32768;65536] ≈ 0.0039, **> 262144 → > ~0.0313**. Doubles stay around 1e-10. Positions "snap to the nearest value that can be represented", which causes vibration. Shifting the origin is the standard alternative.
- MDN on WebGL: `mediump` float only guarantees 2^-10 relative precision, range ±2^14. Use `#ifdef GL_FRAGMENT_PRECISION_HIGH precision highp float`.
- *Derived:* at 20 px/s, `d` passes 262,144 px after **3.6 h** of walking, and 2^23 px (float32 step = 1 px) after about 4.9 days. JS numbers are doubles, so this is fine on the CPU, but **every value uploaded to the GPU is float32**.
- Repo note: `makeNoise` in `src/noise.ts` uses a 256-entry permutation (`i & 255`), so noise **repeats every 256 lattice cells**. A ground octave with λ = 16 px would repeat every 4,096 px (about 3.4 min).
- Sources: https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html · https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices · https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul
- **Wander will:** store the camera as `(chunkIndex: int, local: number)`. Upload only camera-relative floats (`u − cameraU`, within ±1024) to shaders. Shader-side noise (clouds, water) gets time and offsets wrapped modulo a tile period (e.g. 4096 px with tileable textures). 1D noise uses a **hash lattice**: `n(x)` = interpolate `sq5(floor(x/λ))`. Its period is 2^32 cells, so it never visibly repeats.

#### F4. Chunk streaming for an endless 1D world
- Tiny Wings (Kodeco tutorial) keeps 1000 keypoints but draws only the visible window, advancing `_fromKeyPointI` while `keyPoint[i+1].x < offsetX − winSize.width/8`. Eiserloh's unordered access is what lets any chunk be generated alone.
- *Derived design:* a chunk is **256 px of the layer's own coordinate `u`**. The visible area needs ⌈640/256⌉+1 = 4 chunks. Keep `[firstVisible − 1, lastVisible + 2]`. `generateChunk(layer, k)` is a pure function returning `{ heights: Int16Array(256), anchors: Placement[] }`. A placement belongs to the chunk that contains its **anchor x**. The renderer draws chunk k plus anchors from k±1 whose sprite crosses the edge, so the maximum sprite half-width must be ≤ 256.
- Chunk turnover is small: about 1 chunk per 12.8 s on the ground layer, 1 per 128 s at f = 0.1, and 1 per 9 s at f = 1.4. Generate in a Web Worker. Rasterise sprites into atlas pages cached in an **LRU keyed by `(species, variantSeed)`**, so a tree variant that recurs is drawn once.
- Sources: https://www.kodeco.com/2723-how-to-create-a-game-like-tiny-wings-with-cocos2d-2-x-part-1/page/2 · Eiserloh (F1)
- **Wander will:** use per-layer chunk rings of 256 px with a pure `generateChunk`, generate 2 chunks ahead in a Worker, release chunks one behind, and cache sprites in atlases by seed. Saving the game stores only `(worldSeed, d)`.

---

### B. 1D terrain

#### F5. fBm with a per-layer gain, and an analytic slope limit for walkable ground
- Red Blob: sum octaves with amplitudes 1, ½, ¼ … and divide by Σamplitudes.
- IQ: gain `G = 2^−H`. **H = 1 (G = 0.5) matches real mountain profiles** ("-9dB/octave … Yellow Noise"). Detune the lacunarity ("2.01, 1.99") so that "zeros and peaks … don't superpose exactly".
- *Derived slope bound:* for 1D value noise with smoothstep interpolation and lattice values in [−1, 1], `|n′| ≤ 1.5·2/λ = 3/λ` (smoothstep′ peaks at 1.5). An octave of amplitude `a` and wavelength `λ` therefore adds at most `3a/λ` of slope. With G = 0.5 and lacunarity 2, `a/λ` is constant, so **every octave adds the same maximum slope** and the bound grows linearly with the octave count. Walkable ground needs G < 0.5 and few octaves.
- Example ground layer: λ₀ = 1600 px, a₀ = 28 px, G = 0.35, 3 octaves. Bound = 3·28/1600·(1 + 0.7 + 0.49) ≈ **0.115**, gentler than 1:4.
- Example far ridge: λ₀ = 900, a₀ = 60, G = 0.5, 6 octaves. Bound ≈ 1.2, so it can be steep.
- Sources: https://www.redblobgames.com/maps/terrain-from-noise/ · https://iquilezles.org/articles/fbm/ · https://www.redblobgames.com/articles/noise/introduction.html
- **Wander will:** keep a per-layer table `{λ₀, a₀, G, octaves, lacunarity 1.99/2.01}`. Ground uses G 0.3–0.4 and 2–3 octaves. A unit test asserts that `max|h[i+1] − h[i]| ≤ 0.5` (a clean 1:2 step) on the ground layer over 10⁶ px for 20 seeds.

#### F6. Pixel-clean silhouettes come from low curvature
- Aseprite community rules: clean lines use integer ratios "1:0, 1:1, 1:2, 1:3, 1:4". Otherwise "distribute missing points" nearly equally, and curves need **monotonically changing segment lengths** (fix 1,1,3,2,4,4 to 1,1,2,3,4,4). Jaggies are uneven runs. Doubles and orphan pixels break the line.
- *Derived:* rounding a smooth, low-curvature `h(x)` per column gives monotonic run lengths automatically. Octaves with λ below about 16 px only add 1-px wobble, which reads as jaggies.
- Source: https://community.aseprite.org/t/how-do-i-make-straight-curved-lines-properly/10246
- **Wander will:** rasterise every ridgeline as `round(h(x))` per native column. Drop octaves with λ < 16 px from silhouettes and put that detail into texture or sprites instead. Run a cleanup pass that merges a lone 1-px run sitting between two longer runs going the same direction.

#### F7. Ridged and erosion-like noise for mountains and passes
- Red Blob: `ridgenoise = 2*(0.5 − abs(0.5 − noise))`. Multiply higher octaves by lower ones (`e1 * ridgenoise(2x)`) "to concentrate detail on peaks".
- libnoise RidgedMulti (Musgrave's code): each octave is offset, taken through abs, and squared. "Successive octaves are weighted based on feedback from previous octaves", so ridges get detail and valleys stay smooth. Recommended lacunarity is 1.5–3.5. Common Musgrave values are offset 1, gain 2.
- IQ derivative-damped fBm: `a += b*n.x/(1.0+dot(d,d))` with `d += n.yz` (accumulated derivative) and 15 octaves. This gives "erosion-like effects … flat areas as well as more rough areas". In 1D, `d` is the scalar dn/dx.
- Sources: Red Blob (F5) · http://libnoise.sourceforge.net/docs/classnoise_1_1module_1_1RidgedMulti.html · https://iquilezles.org/articles/morenoise/
- **Wander will:** use a ridged multifractal (5–6 octaves, offset 1, gain 2) for the far layers of the rocky-pass and plateau biomes, and derivative-damped fBm for the other far and mid layers, so slopes stay smooth and crests get detail.

#### F8. Redistribution and terraces give plateaus and mesas
- Red Blob: `pow(e, exponent)` with exponent > 1 "pushes middle values down into valleys". Terraces: `round(e*n)/n`, or smooth functions "for rounder terraces".
- *Derived smooth terrace:* `v = h·n; i = floor(v); f = v − i; h′ = (i + smoothstep(0.5−w, 0.5+w, f))/n`. In side view this gives **flat tops and steep risers**, which reads as mesas and buttes. Hash `i` to vary each step's width.
- Source: Red Blob (F5)
- **Wander will:** use terraces with n = 3–5 and w ≈ 0.08 on the far and mid layers of desert/mesa and high plateau. The ground layer is never terraced, because the risers would be unwalkable; the plateau ground uses e² redistribution instead.

#### F9. Domain warping in 1D
- IQ: `f(p + h(p))`. The canonical pattern is `q = (fbm(p), fbm(p + vec2(5.2,1.3))); return fbm(p + 4.0*q)`. Nesting it twice gives organic shapes. The offsets "don't have any special meaning".
- *Derived 1D form:* `h(x) = fbm(x + A·fbm(x/λw + 5.2))`. A warp with a consistent sign bias makes **asymmetric hills** (a long windward slope and a short slip face), which suits dunes. The warp stays monotonic, with no fold-over cliffs, while `A·max|fbm′| < 1`.
- Source: https://iquilezles.org/articles/warp/
- **Wander will:** use a biased warp for dunes (coast, desert) aligned with the stretch's prevailing wind (F28), and a mild warp for meadow and autumn hills. On the ground layer the warp stays within the monotonic bound.

#### F10. Keypoint-and-cosine hills as an authorable alternative (Tiny Wings)
- Keypoints have x-step `minDX=160 + rand(rangeDX=80)` and y-step `minDY=60 + rand(rangeDY=40)` with `sign *= -1` alternation. Between them, `y = ymid + ampl·cos(da·j)` with `da = π/hSegments` and a segment width of 10 px.
- *Derived:* the maximum slope of a cosine segment is `(π/2)·|Δy|/Δx`, so **Δx ≥ π·|Δy| guarantees a slope ≤ 0.5**. Keypoints on a jittered 1D grid with hashed heights keep random access.
- Source: Kodeco Tiny Wings (F4)
- **Wander will:** use keypoint-cosine ground (plus a small fBm) where rolling, readable hills are wanted (meadow, autumn hills, tundra), with Δx ≥ π·|Δy| enforced at generation time.

#### F11. Each parallax layer reads the world at its own "arrival distance"
- *Derived:* a feature at layer coordinate `u` is beside the walker (screen x = x_w) when `d = (u − x_w)/f`. Evaluate biome weights and macro fields at **`d_eff(u) = (u − x_w)/f`**. This is fixed per feature, so chunks can be cached, and **far layers preview the land ahead**: at f = 0.1 the right edge of the screen shows about 4,300 px (≈ 3.5 min) ahead, so the mountain pass rises in the distance before you reach it.
- At f = 0.05 one screen spans 12,800 px of `d`. Below f ≈ 0.05, widen the biome crossfade about 3× or drive the layer only from macro fields (F12), so it doesn't show several biomes at once.
- Alto's Odyssey (Harry Nesbitt): the background uses a "more muted color scheme to differentiate it", the foreground uses bold colours, and the aim is "signal over noise".
- Sources: https://www.dice.com/career-advice/altos-odyssey-winning-mobile-game · IQ fBm detuning (F5)
- **Wander will:** give every layer a seed, a vertical band (e.g. far-ridge peaks y ≈ 110–190, mid hills 170–235, tree line 200–260, ground 265–300 from the top), and generate it at `d_eff`. Layer seeds and detuned lacunarities differ, so ridgelines don't align.

---

### C. Biomes along distance

#### F12. Climate fields plus the nearest biome (Whittaker, Minecraft) make neighbours plausible
- Whittaker classifies biomes by mean annual temperature (y) and precipitation (x).
- Amit Patel's adapted table, from elevation zone 4 down to zone 1:
  - Zone 4: SNOW / TUNDRA / BARE / SCORCHED
  - Zone 3: TAIGA / SHRUBLAND / TEMPERATE DESERT
  - Zone 2: TEMPERATE RAIN FOREST / TEMPERATE DECIDUOUS FOREST / GRASSLAND / TEMPERATE DESERT
  - Zone 1: TROPICAL RAIN FOREST / TROPICAL SEASONAL FOREST / GRASSLAND / SUBTROPICAL DESERT
  - Elevation stands in for temperature. Red Blob uses two independent noise maps with different seeds.
- Minecraft 1.18+ uses six climate parameters. When a location falls outside every biome's interval, "the game uses the **closest biome interval in the 6D space**". Temperature therefore keeps frozen and desert biomes apart.
- *Derived for 1D:* use four very-low-frequency fields along `d`: **T (temperature), M (moisture), A (altitude/ruggedness), H (human trace)**, each a 2-octave fBm with λ ≈ 75 min (≈ 90,000 px). Each biome has a centroid in TMAH space:
  - pine (cool, wet, mid)
  - birch (mild, mid)
  - meadow (mild, mid-dry, low)
  - autumn hills (mild, mid, mid)
  - plateau (cold, dry, high)
  - rocky pass (cold, very high)
  - coast/dunes (mild, dry, low)
  - desert/mesa (hot, very dry)
  - tundra (very cold)
  - swamp (mild, very wet, low)
  - salt flat (hot, very dry, low, H high)
  - stones (cool, H mid)
  - ruins (H high)
  - rail embankment (H high, low A)

  Because M is continuous, swamp → desert has to pass through mid moisture (meadow or grassland).
- Sources: https://en.wikipedia.org/wiki/Biome · http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/ (read via curl; WebFetch failed on its certificate) · https://minecraft.wiki/w/World_generation · Red Blob (F5)
- **Wander will:** use TMAH macro fields as the single source of "where am I in the world". Far layers read them directly. Biome identity comes from them (F13).

#### F13. Stretches as jittered cells: duration control with random access
- *Derived:* boundaries `b_k = k·L + J·(2u_k − 1)`, with `u_k = sq5(k, seedB)/2³²`. Stretch lengths fall in `[L − 2J, L + 2J]`. **For 5–20 min, L = 12.5 min (15,000 px) and J = 3.75 min (4,500 px)**, which keeps J < L/2 so boundaries stay ordered. To find the stretch for a given `d`, take `k₀ = floor(d/L)` and test `k₀ − 1 … k₀ + 1`. This is O(1).
- Biome of stretch k: sample TMAH at the stretch centre, rank biomes by distance to their centroids, and pick among the 3 nearest with weight `exp(−dist²/σ²)` using `sq5(k)`. If the pick equals the *raw* pick of k−1 (computed the same way, so there's no chain), take the next candidate.
  - An adjacency table lists the allowed neighbours. A forbidden pair gets a short "bridge" stretch (e.g. meadow) or a 2× wider crossfade. Every rule here is local, so random access survives.
  - A Markov chain over biomes would need iteration from 0. 1D WFC is equivalent to a Markov chain (F24).
- Kate Compton's "10,000 bowls of oatmeal": mathematical uniqueness is not perceptual uniqueness. Players need "perceptual differentiation", and only highlighted pieces need to be memorable. So variety should come from distinct stretches and landmarks, not micro-noise.
- Sources: https://minecraft.wiki/w/Structure_set (same jitter-in-cell idea) · http://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator
- **Wander will:** implement `stretchAt(d) → {k, biome, b_k, b_{k+1}}` from jittered cells with climate-ranked, hash-chosen biomes and an adjacency table.

#### F14. Blending without visible borders
- KdotJPG (noiseposti.ng): a **normalized sparse convolution**. Kernel `max(0, r² − dx² − dy²)²` around jittered sample points, then multiply each weight by the reciprocal of the total so the weights sum to 1. Padding "establish[es] a minimum width for border transitions".
- Amit Patel: distort transitions. "Add Simplex or random noise to the elevation and moisture" or "sample nearby points using … noise to change the coordinate".
- *Derived 1D recipe:*
  - Warp first: `d′ = d + A·fbm(d/λ)` with A ≤ 0.5 min (600 px) and λ ≈ 2 min. A non-monotonic warp creates **interfingering patches** (a stand of birch inside the pine), which looks like a real ecotone.
  - Weights from the two nearby boundaries: `w_{k−1} = 1 − smoothstep(b_k − h, b_k + h, d′)`, `w_{k+1} = smoothstep(b_{k+1} − h, b_{k+1} + h, d′)`, `w_k = 1 − w_{k−1} − w_{k+1}`. This is a partition of unity as long as `h + A < minLength/2`.
  - Use a different h per channel:

    | Channel | h |
    |---|---|
    | Palette and sky | 1.5–2 min |
    | Terrain | 1 min |
    | Plant density | 40 s |
    | Discrete objects | none: chosen stochastically by weight (F26) |
    | Sound and weather tendencies | use the same weights |
- *Derived: blend outputs, never frequencies.* Use `h(d) = Σ w_i·h_i(d)`, where each `h_i` uses a shared lattice. Interpolating a wavelength inside `noise(d/λ(d))` makes a **chirp**: the local frequency becomes `1/λ + d·(1/λ)′`, so features squeeze and stretch through a transition. This gets worse the farther along `d` you are.
- Sources: https://noiseposti.ng/posts/2021-03-13-Fast-Biome-Blending-Without-Squareness.html · Amit Patel (F12)
- **Wander will:** give each channel its own crossfade width, warp boundaries for ecotones, blend heights and amplitudes only, and keep λ fixed per layer.

#### F15. Blend biome palettes in Oklab, on index-mapped sprites
- Björn Ottosson: HSV gradients are "quite uneven" because yellow, magenta and cyan look lighter. Oklab's L, C and h "should be perceived as orthogonal". The conversion is linear sRGB → M₁ → cube root → M₂.
- Source: https://bottosson.github.io/posts/oklab/
- **Wander will:**
  - Every procedural and hand-drawn sprite stores a **palette index (material + shade)**, not RGB.
  - Each biome defines ramps (e.g. 16 colours, matching the forest-reference rule).
  - Each layer has a 16×1 LUT texture, refreshed every ~0.5 s, built as the Oklab mix of biome ramps by that layer's weights at the camera `d_eff`. For a strict limited-palette feel, the mix can be stepped in 8 increments.
  - Sprites never need re-rasterising when the biome changes.

---

### D. Procedural pixel-art plants

#### F16. Space colonization for broadleaf and birch crowns
- Runions, Lane & Prusinkiewicz 2007:
  - Seed a crown envelope with N attraction points ("usually hundreds or thousands").
  - Each point influences its closest node within the radius of influence `d_i`.
  - New node `v′ = v + D·n̂`, with `n̂ = norm(Σ_s norm(s − v))`. Optional tropism: `ñ = norm(n̂ + g)`.
  - Remove a point when a node is closer than the kill distance `d_k`.
  - Their figures use `d_i = 8D, 17D, ∞`, `d_k = 2D` vs `20D`, and N = 375–12,000. "Decreasing N and increasing d_k yields crowns that are increasingly sparse", and small N gives irregular branches.
  - Limb radius follows the pipe model `rⁿ = r₁ⁿ + r₂ⁿ`, with n "usually between 2 and 3".
- Gentree (an Aseprite tree generator) exposes the same knobs an artist expects: trunk height, branch amount/fork/levels/spread, **leaf density (clump count)**, cluster size (radius), leaf shape, shading highlights and shadows with an offset and direction, and an outline option.
- Sources: http://algorithmicbotany.org/papers/colonization.egwnp2007.html (PDF read) · https://community.aseprite.org/t/gentree-procedural-tree-generator-for-aseprite/27983 · https://4b3c.itch.io/procedural-pixel-art-tree-generator/devlog/773435/my-pixel-art-tree-generator (line width by child count; leaves only on outer nodes)
- **Wander will:** use 2D space colonisation at native resolution for crowns 24–48 px wide:
  - N = 60–200, D = 2 px, `d_k` = 4 px, `d_i` = 16 px.
  - Tropism g = (0, +0.2), or (0, −0.15) for weeping birch.
  - Pipe exponent n = 2.5 with tip radius 0.5 px, so width = round(2r).
  - Draw branches with Bresenham (no AA). Put leaf clumps at the tips (F19).

#### F17. L-systems for dead trees, shrubs and reeds
- ABOP Fig. 1.24:
  - `F→F[+F]F[−F]F` (n = 5, δ = 25.7°)
  - `F→F[+F]F[−F][F]` (n = 5, δ = 20°)
  - `F→FF−[−F+F+F]+[+F−F−F]` (n = 4, δ = 22.5°)
  - `X→F[+X]F[−X]+X, F→FF` (n = 7, δ = 20°)
  - `X→F[+X][−X]FX, F→FF` (n = 7, δ = 25.7°)
  - `X→F−[[X]+X]+F[+FX]−X, F→FF` (n = 5, δ = 22.5°)
- Stochastic version: `F→F[+F]F[−F]F` (.33) | `F→F[+F]F` (.33) | `F→F[−F]F` (.34). This yields "different specimens of the same (albeit fictitious) plant species".
- *Derived:* the string grows by about 5ⁿ, so at sprite scale use n = 3–4 (125–625 segments) with a step of 2–3 px. Add a per-segment angle jitter of ±5° from the hash, and take thickness from the pipe model.
- Source: http://algorithmicbotany.org/papers/abop/abop-ch1.pdf (read)
- **Wander will:** use stochastic L-systems for dead trees (swamp, tundra, burnt forest), shrubs, reeds and bare winter branches. Each species is a small grammar plus δ, n and step.

#### F18. Rendering procedural shapes as pixel art: index maps, lit bands, a dithered seam, cleanup
- PixelPlanets (Deep-Fold, MIT):
  - Pixelise first: `uv = floor(UV*pixels)/pixels`.
  - Choose colour by thresholds on `distance(uv, light) + c*0.2`, at `light_border_1 = 0.52` and `light_border_2 = 0.62`, which gives 3–4 hard bands.
  - Dither only near a threshold, with a checkerboard `mod(x+y, 2/pixels) <= 1/pixels`.
- Dave Bollinger's pixel-sprite generator (zfedoran port):
  - The mask values are `-1 = always border, 0 = empty, 1 = random empty/body, 2 = random border/body`, mirrored.
  - A border is added around the body.
  - Brightness is `sin(u/ulen·π)·(1 − noise) + rand·noise`, so it fades towards the edges. Edges are multiplied by `edgeBrightness = 0.3`.
- Sources: https://github.com/Deep-Fold/PixelPlanets (shader source read) · https://github.com/zfedoran/pixel-sprite-generator (source read)
- **Wander will:**
  1. Rasterise every generated shape at native resolution into an **index image** with shade levels 0–3.
  2. Light from one fixed direction, with ~2 dithered pixels only along band seams.
  3. Remove orphans (pixels with no same-index 4-neighbour) and doubles on 1-px outlines.
  4. Colourise through the LUT (F15).
  5. Use Bollinger-style masks to make many variants of hand-drawn props (bushes, rocks, ruin chunks) from one authored template.

#### F19. Species recipes: conifer, birch, leaf clumps
*Derived; synthesised from F16–F18 and F6.*
- **Conifer:**
  - 4–8 tiers. Tier j has half-width `W·(1 − j/t)^0.9` ± 1 px jitter.
  - Inside a tier, row half-width is `w_j·(1 − y/h_j)^1.2`.
  - Jag only the bottom rows of each tier: tips droop 1 px.
  - Shade by column relative to the trunk: lit side, mid, shadow side. The bottom row of each tier is the darkest.
  - Snow variant: the top pixel of each tier row becomes a snow index.
  - Far conifers stay hand-drawn silhouettes.
- **Birch:**
  - Light trunk 2–3 px wide.
  - Dark dashes of 1–2 px every 3–6 px (hashed) on alternating sides, and a dark notch at each branch junction.
  - Sparse clumps with r = 2–4 px.
- **Leaf clumps:**
  - Circles of r = 3–7 px at branch tips, drawn back to front; back clumps are one shade darker.
  - Per-pixel shade comes from `dot((p − c)/r, L)` banded into 3 levels.
  - Rim pixels are removed by hash with p ≈ 0.3 so silhouettes aren't round.
- **Wander will:** describe each species as data (`{kind, tiers|grammar|colonisation params, ramp, sizes}`) and cache about 8–24 variants per species per biome as sprites.

---

### E. Rocks, grass, clouds, water

#### F20. Rocks: noise mask plus light-offset emboss
- PixelPlanets asteroid shader:
  - Shape: `n_step = step(0.2, fbm(uv*size) − distance(uv, 0.5))`.
  - Shading: sample `n2 = fbm(uv*size + lightOffset*0.5)` and take `noise_rel = (n2_step + n2) − (n_step + n)`. Above 0.05 is light; below −0.06 is dark. Use dither in the ±0.03–0.04 band.
  - Craters come from offset circle noise (one copy shifted toward the light makes the shadow).
- Kate Compton: "Humans seem to like perceiving evidence of process and forces."
- Sources: PixelPlanets `Planets/Asteroids/Asteroids.gdshader` (read) · Compton (F13)
- **Wander will:**
  - Generate rocks with this mask, stretched 1.4–2× wide and cut flat at a baseline buried 1–2 px into the ground. Use 3 tones and moss indices on up-facing pixels when the moisture weight is high.
  - Place rocks where the ground is **concave** (density ∝ max(0, −h″)), so they gather at the feet of slopes.

#### F21. Grass and wind: pixel-snapped sway with travelling gusts
- Godot Shaders "Wind with pixel snapping":
  - `windOffset = round((dir*px + strength*sin(speed*TIME + rowPhase*worldOffset)*px)*xRes)/xRes`, so the offset moves in **whole pixels**.
  - Above `windCutoff` there is no motion, and the effect is stronger farther from the base.
  - `worldOffset` makes "sprites at identical X coordinates" sway together.
- "2D Pixel perfect wind & sway": `pixelated_local_uv = floor(local_uv*size)/size; sway = max(0, 1 − uv.y − sway_height_start)*sin(TIME*speed)`.
- Sources: https://godotshaders.com/shader/wind-with-pixel-snapping/ · https://godotshaders.com/shader/2d-pixel-perfect-wind-sway-effect/
- **Wander will:**
  - Make tufts of 3–7 one-pixel blades, 3–8 px tall. Instance them, with the shader offset per row `dx = round(Amax·((y_base − y)/h)^1.5·gust(x, t))`.
  - The gust is a **travelling front**: `0.4 + 0.6·max(0, sin(2π(x − c·t)/Lg))³`, with c ≈ 60 px/s and Lg ≈ 300 px.
  - Amax is 2 px. Time is quantised to 8 fps.
  - Trees use the same gust field at 1 px, with crowns only.

#### F22. Clouds: thresholded fBm with a hard edge and light bands
- PixelPlanets `Clouds.gdshader`:
  - Pixelised uv. `c = fbm(uv*size + Σ_{9} circleNoise(...))`, where the circle noise adds puffiness.
  - Horizontal `stretch = 2`. Alpha is a hard `step(cloud_cover, c)`.
  - Colours: `c < cover + 0.03 → edge colour`, `d_light + c*0.2 > 0.52 → shade 2`, `> 0.62 → shade 3`, for 4 colours in total.
- Source: https://raw.githubusercontent.com/Deep-Fold/PixelPlanets/main/Planets/LandMasses/Clouds.gdshader
- **Wander will:**
  - Bake clouds on the CPU into cached sprites with the same recipe (hash-lattice fBm, F2).
  - Flatten cumulus bottoms by multiplying density by `smoothstep(base, base + 4 px, y)`. Stretch 2–3×.
  - Use the 4 bands lit from the sun or moon side.
  - Put them on cloud layers with f = 0.02–0.08 and a 1–4 px/s drift.
  - Raise cover for the overcast, melancholic default.

#### F23. Water: mirrored rows with integer ripple offsets, plus Ferrari colour cycling
- Godot Shaders "2D water with reflections":
  - Flip about the water level (`1.0 − SCREEN_UV.y − (level − 0.5)*2.0`).
  - A scrolling noise texture offsets x (`wave_distortion`).
  - Tint with `mix(COLOR, water_albedo, 0.35)`.
- Mark Ferrari colour cycling (Joe Huckaby's canvascycle):
  - An indexed 8-bit image, with palette ranges `(low, high, rate, reverse)` rotated over time.
  - Shift = `t_ms / (1000/(rate/280))` modulo the range size, so **rate/280 positions per second**.
  - Modes are forward, reverse, ping-pong and sine. "BlendShift" fades neighbours for smoothness, but that invents in-between colours.
  - Only pixels that reference cycled indices need updating.
  - Ferrari used it for "rain, snow, ocean waves, moving fog … waterfalls, streams, lakes".
- Sources: https://godotshaders.com/shader/2d-water-with-reflections · http://www.effectgames.com/effect/article-Old_School_Color_Cycling_with_HTML5.html · https://github.com/jhuckaby/canvascycle (`palette.js` read)
- **Wander will:**
  - Render the layers above the water into an offscreen 640×360 target. Water row y samples row `2·y₀ − y`, shifted by `dx(y) = round(A(y)·sin(ωt + k·y))`, with A rising from 0 to 2 px with depth.
  - Darken alternate rows by one index. Tint through the LUT.
  - Animate surface glints and waterfalls by **hard palette cycling** (no BlendShift, to keep the palette strict): glints use 4-colour ranges at rate 60–120 (0.2–0.4 shifts/s); waterfalls use a 6-colour ramp at rate ~1400 (5 shifts/s).

---

### F. Man-made props and ruins

#### F24. Modular hand-drawn pieces composed by edge matching
- Kingdom (Noio): "The map is built out of 'building blocks' that are randomly laid out side-by-side. These 'blocks' each contain a single item like a statue or other structure". Vegetation then follows ground type, and towers and walls avoid overlap. The developer notes that 1D generation is "much easier than in 2D or 3D".
- Spelunky (Kazemi's breakdown): guarantee the solution path first with typed room templates, then fill the rest with probabilistic obstacle chunks. Templates plus random variation.
- Noita: biomes come from Wang tiles (edge-matched) plus hand-made "pixel scenes" overlaid. Sean Barrett's herringbone Wang tiles hide the grid and allow "arbitrary order" generation.
- WFC (Maxim Gumin): the tiled model is adjacency constraints. "The overlapping model relates to the simple tiled model the same way higher order Markov chains relate to order one Markov chains". **In 1D, WFC reduces to a constrained Markov chain.**
- Sources: https://80.lv/articles/kingdom-how-2-guys-created-a-side-scrolling-strategy/ · http://tinysubversions.com/spelunkyGen/ · https://noita.wiki.gg/wiki/World_generation · http://nothings.org/gamedev/herringbone/ · https://github.com/mxgmn/WaveFunctionCollapse
- **Wander will:**
  - Build ruins, camps and the town-ruins biome from hand-drawn modules (wall, window, doorway, collapsed corner, chimney, fence, post). Each module has a left and right **socket** (height class 0–3 and material).
  - A ruin is a bounded sequence of 3–12 modules from its own anchor seed, generated by a socket-constrained Markov walk. It is local, so random access holds.
  - Decay:
    - The top edge is eroded by `H − round(4·fbm(x/6))`.
    - Bricks with hash > 0.85 are removed.
    - Vines hang from the top edge with hashed lengths.
    - Rubble collects at the base.
  - Each module also gets a flip, a palette tint and a Bollinger mask.

#### F25. Power lines with a sagging catenary
- Catenary `y = a·cosh(x/a)`. For equal-height ends, `a = (¼L² − h²)/(2h)` (L = curve length, h = sag) and `H = 2a·arcosh((h+a)/a)` (H = span). For small sag it approaches a parabola.
- Source: https://en.wikipedia.org/wiki/Catenary
- **Wander will:**
  - Poles every 56 ± 3 px (mid layer). Lean variants of ±3° and ±6° are drawn by hand.
  - Each wire between attachment points (x₀, y₀) and (x₁, y₁) is `y(t) = lerp(y₀, y₁, t) + 4s·t(1 − t)`. This parabola is indistinguishable from the catenary at s/span < 0.1. Sag s = 4–7 px, with wind adding ±0.5 px.
  - Rasterise one pixel per column and fill vertical gaps where `|dy/dx| > 1`, per the F6 rules.
  - On the salt flat, hashed broken spans hang from one pole down to the ground.

---

### G. Placing things

#### F26. Jittered grid with density thinning instead of Bridson
- Bridson 2007: Poisson-disk sampling in O(N). Candidates are drawn in the annulus r–2r around active samples, with a cell size of r/√n and **k = 30** tries. It is **sequential and order-dependent**, so it creates seams at chunk borders.
- Red Blob: blue noise can be made from local maxima of high-frequency noise within a radius R, with R varied per biome for density. Red Blob itself recommends "Poisson Disc or jittered grid instead".
- Minecraft `random_spread`: offset is random in `[0, spacing − separation − 1]`, so neighbours are at least `separation` apart. `triangular` takes the mean of two such draws to centre it.
- Sources: https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf · Red Blob (F5) · https://minecraft.wiki/w/Structure_set
- **Wander will:**
  - For each class (canopy tree, shrub, rock, tuft), use cell width c = minimum spacing:

    | Class | Min spacing c |
    |---|---|
    | Near trees | 10–16 px |
    | Shrubs | 6–8 px |
    | Rocks | 20 px |
    | Tufts | 3 px |

  - Candidate position: `x = k·c + u₁·(c − m)`.
  - Accept if `u₂ < Σ_b w_b(x)·ρ_{b,class}·grove(x)`, where `grove = smoothstep(0.35, 0.65, fbm(x/λg))` and λg = 400–900 px, which gives **groves and clearings**.
  - Pick the species with `u₃` over the cumulative `w_b·speciesWeight`, so transition zones intermix naturally. Flip, tint and scale come from `u₄`.
  - Every `u_i = sq5(...)` of `(layer, class, k, i)`, so the result is seamless across chunks.
  - Composition rule: a foreground occluder of width w at factor f_F hides the walker for `(w + 12)/(f_F·v)` s. Cap foreground density so that stays ≤ 2 s.

#### F27. Rare landmarks: spaced, biome-aware, and framed
- Minecraft structure sets use `spacing` (average gap), `separation` (minimum gap, so the maximum is 2·spacing − separation), `salt`, `frequency` (probability to try) and `exclusion_zone` (keep away from other structure sets).
- Kate Compton: background pieces need differentiation and "characterful" highlighted pieces need memorability.
- Proteus (Ed Key): islands can be seeded "for the current date" or from location, and either has "a chance of generating an especially 'wild' island". His own was a purple sea with a green evening sky. The soundtrack "may fall silent when the player is at the top of a hill and become sonically dense as they travel down it" and "layers additional sounds … when the player nears objects".
- Sources: https://minecraft.wiki/w/Structure_set · Compton (F13) · https://blog.playstation.com/archive/2013/10/08/proteus-coming-to-ps3-and-vita-in-october-with-geographically-generated-islands/ · https://en.wikipedia.org/wiki/Proteus_(video_game)
- **Wander will:**
  - **Landmark cells:**
    - Spacing S ≈ 6 min (7,200 px) and separation m ≈ 2 min (2,400 px), with a triangular offset and frequency 0.7, so on average one landmark every ~8–9 min.
    - Type comes from a weighted pick among types compatible with the biome weights at that `d`:
      - lighthouse: coast only
      - skeleton: desert or salt flat
      - house or chapel: forest or meadow
      - mast, car, rail: H high
    - If nothing fits, skip the cell. Check neighbour cells across all layers to keep m.
  - **Framing (derived):** a landmark at u_L (layer f_L) is centred at screen x_c when `D* = (u_L − x_c)/f_L`. At that moment, near layer f_F shows `u_F = D*·f_F + x_c`.
    - Clear tall props there within ±(landmark width·f_F/f_L/2 + 24 px), and set a framing tree or rock pair just outside.
    - Flatten the ground amplitude by 50% over ±200 px so the moment reads as a pause.
  - **Rare deviations:** about 3% of stretches get a "wild" palette shift that stays within the cold, muted mood. A "today" seed option is allowed. Biome and landmark weights are exposed to the sound system.

#### F28. Make the forces visible: shared wind and gravity cues
- Kate Compton: generators read as alive when they show "evidence of process and forces". The design methods she lists are distribution, parametric, tiles, grammars, constraints and simulations; Wander uses all except constraint solvers.
- Source: http://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator
- **Wander will:** give each stretch a hashed prevailing wind direction and strength, and drive all of these from it:
  - tree lean (±1–2 px at the crown)
  - dune slip faces (F9)
  - cloud drift (F22)
  - grass gust direction (F21)
  - snow placed on windward or upward-facing pixels

  Gravity cues follow the terrain: rocks gather in concavities (F20), dead trees cluster at swamp edges by moisture weight, and water sits in local minima of the ground (only where `h` has a minimum wider than 40 px).

---

### Sources I could not access, or that turned out thin
- **GDC Vault** (members-only): Eiserloh "Noise-Based RNG" (used the abstract and the SquirrelNoise5 source instead); McKendrick "Continuous World Generation in No Man's Sky" and Murray "Building Worlds Using Math(s)" (abstracts only); Ed Key's Proteus GDC Europe postmortem (only articles about it); Kate Compton's GDC talk "Practical Procedural Generation for Everyone" (used her essay instead).
- **Alto's Adventure terrain talk:** no technical primary source found, only press quotes on the muted background and minimalism.
- **"Sir Carma: Procedural pixel art trees"** could not be found. I substituted Runions 2007, ABOP ch. 1, the 4b3c devlog and Gentree.
- **Unreachable pages:**
  - extremelearning.com.au (Martin Roberts' R1 quasirandom sequence) returned 404.
  - gameprogrammer.com/fractal.html (1D midpoint displacement) returned 404, and web.archive.org is blocked.
  - The gamedev.net "Simple Clouds" article returned 403.
  - Shadertoy "Hash without Sine" returned 403, but JCGT evaluates it as `hashwithoutsine`.
  - An IQ article URL without the trailing slash 404s, and curl needs a browser user agent.
- **Thin sources:** the Terraria wiki lists generation passes without terrain formulas; Kingdom's water reflections are undocumented.
- **Not researched:** the web-search budget ran out before Tiny Glade, Townscaper talks, Dwarf Fortress and Starbound. WFC covers the Townscaper/Bad North principle at the level needed here.

---

## Sound

**How this was researched.** Wherever I could, I read primary sources:

- **Farnell.** The Pure Data patches from Andy Farnell's *Designing Sound*, which MIT Press hosts as the book's companion code. I downloaded the `.pd` files themselves and traced their object graphs, so the Farnell numbers below come from his patches, not from summaries.
- **Specs, docs and code.** The W3C Web Audio spec, MDN, the Chrome blog, and the source code of Tone.js and Generative.fm.
- **Practitioners.** Interviews with Paul Weir (*No Man's Sky*), Ben Babbitt (*Kentucky Route Zero*) and the *Alto's Odyssey* team.
- **Data.** Field-recording and acoustic data for the animals and the train.

Two Audiokinetic articles block automated readers (HTTP 403), so I read them through Wayback Machine copies fetched with curl.

**How to read the numbers.**

- A value marked *(source)* comes straight from the cited source.
- A value marked *(proposed)* is Wander's starting point, to be tuned by ear.

**Pd → Web Audio glossary.** Farnell's recipes are Pure Data graphs. They map to Web Audio like this:

| Pure Data | Web Audio equivalent |
|---|---|
| `noise~` | a looping white-noise `AudioBufferSourceNode` (see 2) |
| `bp~ f Q`, `vcf~` | `BiquadFilterNode` of type `bandpass` |
| `lop~`, `hip~` (one-pole) | a Biquad at Q≈0.707, or an exact one-pole `IIRFilterNode` (feedforward `[1-a]`, feedback `[1,-a]`) |
| `*~` with a signal on both inlets | a `GainNode` with the second signal connected into `.gain` |
| `clip~`, `max~`, powers | `WaveShaperNode` curves (see 5) |
| `vline~` envelopes | `AudioParam` automation |

The music findings sit beside the art research's mood notes in `01-art-direction.md`. They follow its rule: a cold, muted world in which only the lantern, the fire and the ember are warm.

---

### A. Engine: graph, buffers, node lifetime, timing

#### 1. One AudioContext, tuned for long playback, with a fixed bus graph
**Finding.** `new AudioContext({ latencyHint: "playback" })` makes the browser choose "a latency that will maximize playback time by minimizing power consumption at the expense of latency. Useful for non-interactive playback, such as playing music." The default, `"interactive"`, "is likely to require increased power consumption" (MDN).

That extra latency can be measured. `ctx.outputLatency` estimates the time between the graph handing over a buffer and the device playing it; it has been Baseline since 2025.

Autoplay:
- Chrome's rule: "If an `AudioContext` is created before the document receives a user gesture, it will be created in the 'suspended' state, and you will need to call `resume()`."
- For a kiosk-style launch, Chrome has the developer switch `--autoplay-policy=no-user-gesture-required` and the enterprise policies `AutoplayAllowed` / `AutoplayAllowlist`.

Proposed graph:

```
ambience layers ─→ ambienceBus ─┐
one-shot SFX    ─→ sfxBus ──────┼─→ masterGain ─→ limiter (DynamicsCompressor) ─→ destination
music voices    ─→ musicBus ────┘
each bus ─(send Gain)─→ ONE shared ConvolverNode ─→ masterGain
```

**Sources:**
- https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext
- https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency
- https://developer.chrome.com/blog/autoplay
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices

**Wander will:**
- Create one context with `latencyHint: "playback"` at boot.
- Call `resume()` whenever `ctx.state !== "running"`, both on `statechange` and on the first input. Launch the browser with the autoplay flag.
- Offset the sprite's footstep contact frames by `ctx.outputLatency` so feet and sound line up.
- Never create a second context.

#### 2. Make noise buffers once, loop them, and start each one at a random offset
**Finding.** Tone.js keeps all its noise in pre-generated looping buffers ("It uses looped noise buffers to save on performance"). Each buffer is `44100 * 5` samples × 2 channels (5 s stereo). The generators *(source)*:

- **White:** `Math.random()*2-1`.
- **Brown:** `lastOut = (lastOut + 0.02*white)/1.02`, then `*3.5` for gain.
- **Pink:** Paul Kellet's filter, then `*0.11`:
  - `b0=0.99886*b0+white*0.0555179`
  - `b1=0.99332*b1+white*0.0750759`
  - `b2=0.96900*b2+white*0.1538520`
  - `b3=0.86650*b3+white*0.3104856`
  - `b4=0.55000*b4+white*0.5329522`
  - `b5=-0.7616*b5-white*0.0168980`
  - `out=b0+…+b6+white*0.5362`, where `b6=white*0.115926`

Every start uses `start(time, Math.random()*(buffer.duration-0.001))`, so two noise layers never line up.

Costs and reuse:
- **Memory.** Paul Adenot (Mozilla) gives a buffer's memory as `length × channels × 4 bytes`. One 10 s stereo buffer at 48 kHz is 3.84 MB.
- **Reuse.** MDN: "the actual `AudioBuffer`s can be reused for multiple plays of the sound."

**Sources:**
- https://cdn.jsdelivr.net/npm/tone@14.7.77/Tone/source/Noise.ts (code read)
- https://padenot.github.io/web-audio-perf/
- https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode

**Wander will:**
- At boot, generate one 10 s stereo buffer each of white, pink and brown noise (≈11.5 MB in total at 48 kHz) *(proposed)*.
- Run every continuous layer from these buffers with `loop = true`, a random start offset, and a slightly different `playbackRate` per layer (0.97–1.03) *(proposed)*, so no two layers share a cycle.
- Have every event sound (drops, crackles, steps) borrow slices of the same buffers.

#### 3. One-shot nodes: fire and forget, but disconnect, cap voices and keep automation events few
**Finding.** On one-shot sources, MDN says: "An `AudioBufferSourceNode` can only be played once". The nodes "are very inexpensive to create" and can be used "in a 'fire and forget' manner … It will automatically be garbage-collected at an appropriate time, which won't be until sometime after the sound has finished playing."

The spec's lifetime rules (§1.5.3):
- An `AudioScheduledSourceNode` "is actively processing if and only if it is playing".
- Other nodes stop "when the input that was received from other actively processing AudioNode no longer affects the output". Tail-time counts here.

On automation:
- **Event lists.** Adenot warns: "If the application uses *a lot* of AudioParam events, non-Gecko based browsers can have performance issues."
- **Ramps to zero.** For `exponentialRampToValueAtTime`, "A RangeError exception MUST be thrown if this value is equal to 0."

**Sources:**
- https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
- https://webaudio.github.io/web-audio-api/ (§1.5.2–1.5.3 and the AudioParam section, read in full text)
- https://padenot.github.io/web-audio-perf/

**Wander will:**
- Build every event as `source → filter(s) → envelope Gain → bus`.
- In `source.onended`, call `disconnect()` on all three nodes and decrement a per-layer voice count.
- Cap voices per layer *(proposed)*: rain drops 24, fire crackles 8, bird syllables 6, music notes 12. Drop new events past the cap instead of stealing voices.
- Pre-allocate every `Float32Array` used by `setValueCurveAtTime` and every `WaveShaper` curve once.
- Fade to silence with `setTargetAtTime(0, t, τ)`, or ramp to `1e-4` and then `setValueAtTime(0)`. Never pass 0 to an exponential ramp.
- Never automate a continuous parameter more often than about 4 times per second from JS. Slow modulation comes from control signals instead (see 5).

#### 4. Scheduling: the two clocks, background-tab throttling, and why audio must not hang off requestAnimationFrame
**Finding.**

**Chris Wilson.** JS timers "can easily be skewed by tens of milliseconds or more". Use "a setTimeout timer that fires once every so often, and sets up Web Audio scheduling in the future". "A good place to start is probably 100ms of 'lookahead' time, with intervals set to 25ms."

**Tone.js defaults.** `clockSource: "worker"`, `lookAhead: 0.1`, `updateInterval: 0.05`. Its `Ticker` builds a Blob-URL Web Worker that runs a `setTimeout` loop and posts a tick message each time. It falls back to a main-thread `setTimeout`.

**Chrome 57.** In background tabs, "Each independent timer is run no more than once per second", and a time budget applies after 10 s. But "Pages playing audible audio are considered user-visible and exempted from background timer throttling", and "Silent audio streams do not grant exemptions."

**Chrome 88 intensive throttling** checks timers only "once per **minute**", and only when all of these hold:
- the page has been hidden for more than 5 minutes;
- the chain count is 5 or greater;
- the page has been silent for at least 30 seconds;
- WebRTC is not in use.

**Firefox.** It has "a minimum timeout of 1 second for inactive tabs", but "Firefox does not throttle inactive tabs if the tab contains an `AudioContext`."

**MDN on `requestAnimationFrame`.** Its calls "are paused in most browsers when running in background tabs or hidden `<iframe>`s".

**Sources:**
- https://web.dev/articles/audio-scheduling
- https://cdn.jsdelivr.net/npm/tone@14.7.77/Tone/core/clock/Ticker.ts
- https://cdn.jsdelivr.net/npm/tone@14.7.77/Tone/core/context/Context.ts
- https://developer.chrome.com/blog/background_tabs
- https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout
- https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame

**Wander will:**
- Run a dedicated audio scheduler on a Worker tick every 50 ms, kept separate from the render loop.
- Schedule ambient events (drops, birds, notes, crackles) 0.5–2 s ahead on `ctx.currentTime` *(proposed)*. Nothing rhythmic depends on 25 ms precision, and a 2 s window survives 1 s timer alignment.
- Predict footfalls from the walk cycle, which is deterministic. Schedule them 100–200 ms ahead, and drive the walk animation phase from the audio clock, as Wilson recommends for visuals.
- Never let the soundscape fall fully silent, so neither Chrome's exemption nor its intensive-throttling rule ever turns against it.
- Make everything continuous (wind, rain bed, insects, drones) run from looping sources and control signals inside the audio graph, so it keeps going even if every JS timer stops.

#### 5. Native nodes first; use AudioWorklet only where a recipe needs per-sample maths
**Finding.** Adenot's cost notes for nodes:

| Cost | Nodes and Adenot's wording |
|---|---|
| Near free | `GainNode` ("folded in before processing"); `StereoPannerNode` and equal-power panning ("Rather cheap") |
| Cheap | `BiquadFilterNode` ("relatively cheap (five multiplication and four additions per sample)"); `IIRFilterNode` ("rather cheap"); `DelayNode`; `OscillatorNode` ("after the initial cost, processing is essentially doing linear interpolation") |
| Moderate | `DynamicsCompressorNode` ("not too expensive"); `WaveShaperNode` (depends on oversampling) |
| Expensive | `AnalyserNode` (an FFT) |
| Very expensive | `ConvolverNode` ("Very expensive, and depending on the duration of the convolution impulse"); HRTF `PannerNode` ("**Very** expensive") |

Also: "k-rate is significantly cheaper", and `OfflineAudioContext` can pre-process audio so it doesn't have to be recomputed.

AudioWorklet:
- It runs off the main thread in 128-frame blocks. MDN says always check `.length` rather than assuming 128.
- Parameters are a-rate unless declared `"k-rate"`.
- MDN warns that "Chrome does not implement this algorithm in a manner that matches the current standard… you must always return `true` from `process()`", so a worklet node lives forever.

Two spec facts that shape the design:
- "If DelayNode is part of a cycle, then the value of the delayTime attribute is clamped to a minimum of one render quantum." That is 128 frames, so a feedback loop can't go above about 375 Hz at 48 kHz.
- An `AudioParam`'s computed value "is the sum of the paramIntrinsicValue" and its connected inputs. So any node can modulate any parameter at audio rate.
- `WaveShaperNode` curve values "are spread with equal spacing in the [-1; 1] range" with linear interpolation. That makes it a lookup table for control signals.

**Sources:**
- https://padenot.github.io/web-audio-perf/
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
- https://webaudio.github.io/web-audio-api/ (DelayNode, AudioParam computation, WaveShaperNode)

**Wander will:**
- Build first with native nodes only: Biquad, Gain, Delay, StereoPanner, Oscillator, WaveShaper, one Convolver.
- Generate slow random modulators as **control buffers**. These are 0.5 Hz and 3 Hz low-passed noise rendered once into `AudioBuffer`s; the spec allows rates down to 3000 Hz, which keeps them small. Loop them at incommensurable lengths such as 61 s, 89 s and 113 s *(proposed)*, the Eno trick of 18 applied to modulation, and connect them into `AudioParam`s through scaling `GainNode`s.
- Implement Farnell's nonlinearities as WaveShaper curves on those control signals: `x⁴`, `max(x−0.4,0)²`, cosine bell windows.
- Add a single AudioWorklet (`TextureProcessor`: drop/crackle/footstep-grain generator) only if profiling shows node churn, created once at boot.
- Never use HRTF panning or `AnalyserNode` in production.

#### 6. Layer ambience by biome, weather and hour as parameter-driven gains, crossfaded with `setTargetAtTime`
**Finding.** Paul Weir on *No Man's Sky*:
- "you need to pass as much information as practical from the game to the audio systems … what planet biome you're on, what the weather is doing, where you are relative to trees, water or buildings".
- His example is one control value, a "'storminess'" RTPC, combined with an indoors/outdoors flag.
- "I always know the upper and lower limits of any sound and so over time you reach a reasonably satisfactory equilibrium in the mix."

MDN on `setTargetAtTime`: each time constant moves 63.2% of the way to the target, 3τ reaches 95.0%, and "you could set `timeConstant` to one third of the desired duration."

**Sources:**
- https://www.audiokinetic.com/en/blog/behind-the-sound-of-no-mans-sky-a-qa-with-paul-weir-on-procedural-audio (read via a Wayback copy; originally on asoundeffect.com, which returned 403)
- https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime

**Wander will:**
- Expose one audio state object, rebuilt about every 250 ms from the simulation:
  - biome weights (sums to 1 across the two biomes being blended);
  - `hour`;
  - `wind 0–1`;
  - `rain 0–1`;
  - `storm 0–1`;
  - `temperatureC`;
  - `nearWater`;
  - `treeDensity`;
  - `camp: none|fire|sleep`.
- Give every layer a table of min/max gain and a curve per parameter, in Weir's style.
- Set each layer's target gain as the product of its curves.
- Apply targets with `setTargetAtTime(target, now, T/3)`, with T *(proposed)*:
  - biome crossfades 20 s;
  - weather 8–30 s;
  - dawn/dusk layer swaps 60–120 s;
  - "he sits down" ducks 3 s.
- Use equal-power curves (`cos`/`sin` of the blend) when exactly two layers trade places.

---

### B. Procedural ambience recipes

#### 7. Wind: Farnell's wind-speed model, delayed per object, feeding a body, whistles, branches and leaves
**Finding.** Read from the patches `wind0`–`wind4.pd`.

**The wind-speed control signal `w`, 0–1** *(source)*:
- `base = 0.25·(1 + sin(2π·0.1·t))`.
- `gust = 50 · LP0.5(LP0.5(noise)) · ((base+0.5)² − 0.125)`. LP0.5 is a 0.5 Hz one-pole low-pass, applied twice and DC-blocked.
- `squall = 20 · LP3(LP3(noise)) · (8·max(base − 0.4, 0))²`. Squalls appear only when the base wind is above 0.4.
- `w = clip(base + gust + squall, 0, 1)`.

**The 3 s delay line.** `w` is written into a 3000 ms delay line. Each sound object reads it at its own delay (0, 100, 300, 500, 900 or 3000 ms), so a gust audibly travels through the scene.

**Layers in `wind4.pd`** *(source)* (Pd pans of 0–1 mapped to −1…1):

| Layer | Delay | Graph | Pan |
|---|---|---|---|
| Body | 0 ms | white → BPF 800 Hz Q1 × (w+0.2) → one-zero filter `y=x−a·x[n−1]` with `a = clip(0.6·(w+0.2), 0, 0.99)` (brighter as the wind rises) → ×0.2 | centre |
| Whistle 1 ("doorways") | 100 ms | white → BPF 400 Hz Q40 ×2, × amplitude `A`, × sine of (30 + 200·A) Hz | +0.82 |
| Whistle 2 | 300 ms | white → BPF 200 Hz Q40 ×2, × amplitude `B`, × sine of (20 + 100·B) Hz | −0.94 |
| Branch / wire 1 | 500 ms | white → BPF centred 600+400·w, Q60, × (w+0.12)² × 1.2 | −0.44 |
| Branch / wire 2 | 900 ms | white → BPF centred 1000+1000·w, Q60, × w² × 2 | +0.28 |
| Leaves | 3000 ms | see below | +0.42 |

How the whistle amplitudes work:
- Whistle 1: `A = LP0.5(cos(2π·((clip(w,0.35,0.6)−0.35)·2 − 0.25)))`. That is a bell that is silent below w=0.35 and above w=0.6.
- Whistle 2: `B` is the same bell over w = 0.25–0.5, low-passed at 0.1 Hz instead.
- So each whistle "sings" only at its own band of wind speeds.

Leaves, step by step:
1. `L = LP0.07(w + 0.3)`, with a threshold `t = 1 − 0.4·L`.
2. Take the noise peaks above `t`: `(max(n,t) − t)·t`.
3. Band-limit them: HPF 200 Hz → LPF 4000 Hz.
4. Scale by `(L − 0.2)·0.8`.

The result is sparse ticks that thicken as the wind rises. The final mix is ×0.45.

**Sources:**
- https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical18.html
- `p18/wind0.pd`, `wind1.pd`, `wind2.pd`, `wind4.pd` from the same site (patches parsed)

**Wander will:**
- **Speed signal.** Build `w` natively:
  - a `ConstantSourceNode` carrying the weather-driven base;
  - plus the gust and squall control buffers (see 5) through `GainNode`s whose gains follow Farnell's base formulas;
  - into a WaveShaper clamp at 0–1;
  - then `DelayNode`s at 0.1, 0.3, 0.5, 0.9 and 3.0 s.
- **Slower swell.** Replace Farnell's fixed 0.1 Hz base with a weather target plus a 2–4 minute random walk *(proposed)*, so the wind never "breathes" on a regular 10 s period.
- **Forest first.** The forest (the primary biome) uses body + branches + leaves at full weight. Whistles appear only where there is something to whistle through: ruins, rail cuttings, the mountain pass, power lines on the salt flat.
- **Brightness.** Approximate the speed-dependent one-zero filter with a high-shelf whose gain rises with `w` (0 to +6 dB at 2 kHz) *(proposed)*.

#### 8. Rain: a filtered bed, a "boiling" layer, and individually scheduled drops whose sound depends on the surface
**Finding.**

**Farnell, close-up drops (`rain1.pd`, `cpraingen.pd`, `cpulse.pd`)** *(source)*:
- Each drop is a **parabolic pulse** `1−4(x−0.5)²` lasting 0.15–0.51 ms, with amplitude `√(width+0.1)`.
- Three generators are summed, ×0.2, then HPF 900 Hz.
- Each generator waits `exp(2.718 + (U·r + 7)/15) + 40` ms between drops, with r = 50, 60 or 70. That spans ≈64–1300 ms, a mean of ≈0.35 s, so about 3 drops/s per generator.

**Farnell, "noisy rain" (`spikerain.pd`)** *(source)*:
- Keep only the noise above a threshold `t` (0.004–0.054, set by a slider): `(max(n,t) − t)² · 3`, then HPF 2 kHz.
- A lower threshold gives heavier rain.

**Farnell, drops on water (`rain_on_water.pd`)** *(source)* — each drop is one sine:
- frequency `F·(t/D)^k`, rising sharply at the end, with F = 400–600 Hz, k = 2–12 and D up to ≈143 ms;
- amplitude `(1 − t/D)⁴`, smoothed by a 12 Hz low-pass, at a random level;
- then LPF 1 kHz, ×0.1.

**Farnell, drops on leaves (`rain_on_leaf.pd`)** *(source)*:
1. Gaussian noise → BPF 50 Hz Q0.4 → LPF 500 Hz gives `x`.
2. `x` drives an oscillator at `40 + 80x` Hz whose amplitude is `10x²`.
3. Only the peaks above 0.35 pass, then HPF 500 Hz twice.

The result is clustered ticks.

**Aleksandr Khilko (Wargaming), *Generating Rain With Pure Synthesis***:
- His research basis: "The sound of a bubble (or water drop) is a sine wave with a modulated pitch and duration of about 10-20 ms", and the sum of many is "a noise-like sound (pink noise, to be more precise)".
- His layers:
  1. light high-frequency boiling: white noise with randomly modulated gain, then two band-passes with a random LFO on one centre;
  2. low boiling: pink noise, the same random-LFO band-pass, moving "more than 100Hz";
  3. stereo noise: copies of pink noise hard-panned left and right;
  4. individual sine drops with a pitch envelope.
- One `Rain_intensity` parameter drives the filter settings and layer volumes.

**Sources:**
- https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical15.html
- The patches `p15/rain1.pd`, `cpraingen.pd`, `cpulse.pd`, `spikerain.pd`, `drops.pd`, `rain_on_water.pd`, `rain_on_leaf.pd` (parsed)
- https://www.audiokinetic.com/en/generating-rain-with-pure-synthesis/ (403 directly; read via a Wayback copy of blog.audiokinetic.com)

**Wander will:**
- **Bed.** Two decorrelated pink-noise sources panned −0.9 and +0.9 → HPF 400 Hz → LPF that opens from 3 kHz (drizzle) to 8 kHz (downpour). Gain ∝ `rain^0.7` *(proposed)*.
- **Boiling.** White noise → BPF 1.5–3 kHz at Q2, its centre jittered ±150 Hz by a 7 Hz random control buffer *(proposed)*.
- **Drops.** Schedule individual drops as a Poisson process: 3–8/s in drizzle, capped at 30/s in heavy rain, where the bed takes over *(proposed)*. Choose the drop type from the surface under each screen region:
  - Farnell pulse clicks (pre-rendered to 8 tiny buffers) on ground and rock;
  - leaf ticks under trees;
  - rising sine "plinks" on water and puddles;
  - low thuds (BPF 150–400 Hz) on his tarp when he camps *(proposed)*.
- **Pan.** Pan each drop by its x position on screen.

#### 9. Thunder: crack, rumble, a delayed sub-boom and a long resonant afterimage, rendered offline per strike
**Finding.** Farnell's `thunder4.pd` *(source)* has these parts:

| Part | Graph |
|---|---|
| Strikes (up to 4) | noise × a linear decay of `200·(1.4 − x)^5` ms (up to ≈1.1 s) → two BPFs at Q3, centred on `100 + 1200·x` Hz and half that |
| Rumble | random sample-and-hold noise → `rpole 0.99` → four low-passes, enveloped 50 ms up and 8 s down |
| Deep | noise → 4× LPF 80 Hz → ×12 → clip → HPF 15 Hz; starts after 1 s, 2 s attack, 20 s decay |
| Afterimage | BPF 333 Hz Q4 noise; 200 ms delay, 6 s decay |
| Echoes | a box of 24 delay units of up to 12 s |
| Distance | distance-set delay plus a 100 Hz-scale low-pass |

Farnell's own note: "First is a highly efficient castle thunder using only four subtractive bands, high crash, middle, mid-low rumble, sub-boom."

**Sources:**
- https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical17.html
- The patches `p17/thunder4.pd`, `strike-sound.pd`, `distance.pd` (parsed)
- https://padenot.github.io/web-audio-perf/ (offline rendering)

**Wander will:**
- On each lightning flash, render one 20–25 s stereo thunder in an `OfflineAudioContext`, using Farnell's four layers with random parameters. The render takes milliseconds, then plays as a single `AudioBufferSourceNode`.
- Delay it after the flash by distance ÷ 343 m/s (≈2.9 s per km).
- Map distance to a strike low-pass from 6 kHz (overhead) down to 400 Hz (far), and to level *(proposed)*.
- Feed it into the shared reverb send for the echoes rather than building 24 live delays.

#### 10. Coast waves: noise swells with their own slow brightness envelope, irregular periods, and backwash
**Finding.**
- **Basic recipe.** The basic synthetic surf is "amplitude modulation on a pink noise track" with an 11 s LFO, e.g. Nyquist `(mult *track* 0.5 (sum 1 (lfo (/ 1.0 11))))`. A better version also sweeps a low-pass cutoff with the wave, over roughly 0–3000 Hz.
- **Real wave periods.** Surf data gives:

  | Period | What it is |
  |---|---|
  | 1–5 s | local wind swell, "bumpy and disordered" |
  | 6–8 s | regional wind swell |
  | 10–12 s | ground swell taking effect |
  | 13 s and up | long-period swell |

  So a real coast has a dominant period with jitter, not a fixed LFO.
- **Backwash.** The retreating water over pebbles is the same texture as Farnell's gravel and spiky "differential" noise (see 12).

**Sources:**
- https://forum.audacityteam.org/t/synthetic-ocean-wave-sound/58776
- https://www.surfertoday.com/surfing/the-importance-of-swell-period-in-surfing (403 to WebFetch; read with curl)
- I could not open the planned primary demo, https://aatishb.com/experiments/oceansounds/ (404).

**Wander will:**
- Schedule each wave as an event rather than an LFO. Period = a dominant 9 s ±30% at the dunes, or 7 s in storm chop *(proposed)*.
- Shape each wave in three parts *(proposed)*:
  1. **Approach:** pink noise rising over 2–4 s with LPF 300 → 1500 Hz.
  2. **Break:** a 0.3–0.6 s peak with LPF to 3 kHz plus a short white-noise burst through HPF 2 kHz.
  3. **Hiss and backwash:** a 3–6 s decay with LPF falling to 600 Hz, plus a gravel-crackle layer on pebble shores.
- Overlap waves where the period jitter makes them meet.
- Add a constant low surf bed (brown noise, LPF 200 Hz) at −18 dB under the waves *(proposed)*.

#### 11. Campfire: Farnell's three-part fire (crackle, hiss, lapping), with crackles scheduled from JS
**Finding.** From `fire_generator.pd` *(source)*:

| Part | Graph |
|---|---|
| Crackles | noise → BPF Q1 with a random centre of 1500 + 500·U(0..29) Hz (1.5–16 kHz) × a squared linear decay over a random 0–29 ms. Triggered sporadically, whenever a 1 Hz low-passed noise level falls in a narrow 1 dB window |
| Hiss | noise → HPF 1000 Hz × `600·(10·LP1(noise))⁴`, i.e. occasional loud hiss flares |
| Lapping | noise → BPF 30 Hz Q5 → ×100 → HPF 25 Hz → clip ±0.9 → HPF 25 Hz → ×0.6, a low turbulent roar |

The mix is crackles ×0.2, hiss ×0.3, lapping ×0.6.

**Sources:**
- https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical11.html
- The patches `p11/fire_generator.pd`, `fire_crackling3.pd`, `fire_hissing3.pd`, `fire_lapping3.pd` (parsed)

**Wander will:**
- **Lapping.** Brown noise → BPF 30 Hz Q5 → Gain ×100 → WaveShaper soft-clip → HPF 25 Hz.
- **Hiss.** White noise → HPF 1 kHz → Gain, with the gain driven by a 1 Hz control buffer through a WaveShaper `x⁴` curve.
- **Crackles.** Scheduled in clustered bursts: a Poisson rate of 4/s that triples for 1–2 s at random *(proposed)*. Each one is a noise slice → BPF 1.5–12 kHz Q1 (capped below 16 kHz) → a squared decay over 3–29 ms.
- **Placement.** Pan the fire by its screen position and run it through the reverb send at a low level.
- **Burning down.** Over a night's camp, lower the crackle rate and lapping gain as the fire burns down, so the warmest sound in the world slowly dies *(proposed)*.

#### 12. Footsteps: Farnell's three-phase ground-reaction envelope driving a per-surface texture
**Finding.** From `foot2.pd` and `splitphase.pd` *(source)*.

**The step envelope.** Each step is a 0→1 ramp split into three overlapping phases, each shaped by a polynomial:
- heel, over 0–0.333 of the step;
- roll, over 0.125–0.875;
- ball/toe, over 0.667–1.0.

A walk-speed control sets the step rate.

**Surface textures** (read from the subpatches):

| Surface | Graph |
|---|---|
| Gravel | the ratio of two low-passed noises, `LP300(n)/LP2000(n)` → HPF 400 → squared, which gives sparse spikes → ×0.01 → clip → a Q3 resonant band-pass. The band-pass centre jumps randomly over 500–10 000 Hz (from 50 Hz low-passed noise ×50 000) and shifts up by 1000·force → HPF 200 → × force |
| Grass | the same spiky source high-passed at 2.5 kHz → a Q30 band-pass whose centre wanders over 2–10 kHz (`3400 + 23 800·LP16(noise)`) → HPF 900 ×0.3, plus a heel "thud": a sine at 30 + 600·force² Hz, clipped 0–0.5 |
| Snow | a low granular crunch (`LP110/LP900` noise × `LP50/LP70` noise × ((17·LP10(noise))² + 0.5)) → clip → HPF 300 → a band-pass at Q0.5 centred on 700 + 9000·force Hz, so the crunch brightens as weight comes on |
| Wood | a resonator bank at 95, 123, 134, 139, 154, 156, 189 and 201 Hz, Q 20–90 |
| Dirt | an 80 Hz-based oscillator thump plus low-passed noise |

**Cadence.** For adults, about 100 steps/min marks moderate-intensity walking.

**Sources:**
- https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical26.html
- The patches `p26/foot2.pd` and `splitphase.pd` (parsed)
- https://pubmed.ncbi.nlm.nih.gov/29858465/ (Tudor-Locke et al., walking cadence review; abstract and news coverage seen in search results, full text not read)

**Wander will:**
- **Timing.** The tired wanderer walks at 80–90 steps/min (≈0.7 s per step) *(proposed, below the 100 steps/min moderate-pace threshold)*. Each step's sound is scheduled from the predicted contact frame.
- **Envelope.** Each step gets one envelope Gain with a heel peak, a lower roll plateau and a ball peak, at Farnell's phase fractions of the ≈0.3 s contact time.
- **Source.** The shared noise buffers, with surface-specific Biquads:
  - grass: BPF 3–8 kHz, Q 4 to 8, randomised per step, plus a 60–200 Hz sine thud;
  - gravel: 2–3 short random-centre BPF bursts at Q3, between 0.5 and 8 kHz;
  - snow: BPF from 700 Hz to 4 kHz at Q0.5, swept by the envelope;
  - sand: the snow recipe with LPF 2.5 kHz and less spike *(proposed, no Farnell model)*;
  - wood: 3 of Farnell's resonators picked at random;
  - puddles: the water-drop plink from 8 plus a 60 ms noise splash.
- **Variation.** Randomise level ±2 dB and pitch ±5% per step, so no two steps are identical.

#### 13. Lighter, cigarette and exhale: Farnell's switch click and metal ping, plus a breath shaped like airflow
**Finding.** From Farnell *(source)*:
- **Simplest switch click (`switch001.pd`):** noise → BPF 5000 Hz Q12 × a squared envelope with a 1 ms attack and a 20 ms decay that starts after 2 ms.
- **"shortping":** two sines summed (e.g. 10 500 + 9453 Hz) × `(1 − t/50ms)⁴`, a bright metallic tick.

For breath, the synthetic-breathing patent US 5,730,140 connects "a noise generator … to a bandpass filter". In it:
- "The center frequency of this bandpass filter controls the perceived 'pitch' of the breathing sound."
- "The amplitude of noise generator 42 can be controlled by the rate of change of lung volume."

**Sources:**
- https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical19.html (patches `switch001.pd` and `shortping.pd`, read)
- https://patents.google.com/patent/US5730140A/en

**Wander will:**
- **The smoking ritual**, step by step *(proposed timings)*:
  1. Lid open: a click at BPF 3.5 kHz Q8, 15 ms, then a ping at 2.8 + 4.1 kHz, 60 ms.
  2. Flint wheel: about 40 ms of gravel-style spiky noise through HPF 2 kHz.
  3. Flame: noise → BPF 300 Hz Q1, 150 ms, the "fwump".
  4. Lid close: the click again, louder.
  5. Inhale: very quiet pink noise → BPF 2 kHz Q2, 1.2 s, with a sparse fire-crackle at 2/s for the burning tobacco.
  6. Exhale: pink noise → BPF that glides 900 → 600 Hz at Q0.8, plus HPF 250 Hz. The envelope follows airflow: 0.25 s rise, about 2.5 s half-cosine fall.
- **Mix.** Level −24 dBFS peak, panned to the figure, with the ambience ducked 2–3 dB around it *(proposed)*.
- **Warmth.** These are the closest, warmest sounds in the game. Keep them dry, apart from a small reverb send.

#### 14. Birds by day: FM sine syllables (swoop + chirp) assembled into songs, densest at dawn
**Finding.** Cornell's ECE 4760 birdsong lab reconstructs a cardinal song: "Cardinals and many other songbirds produce almost pure frequency-modulated tones." *(source)*

| Primitive | Length | Pitch |
|---|---|---|
| **swoop** | 130 ms | `f = −260·sin(−π·n/5720) + 1740` Hz, i.e. 1.74 → 2.0 → 1.74 kHz |
| **chirp** | 130 ms | `f = 1.53e-4·n² + 2000` Hz (n = samples at 44 kHz), 2 → 7 kHz |
| **silence** | 130 ms | — |

Each syllable has linear ramps of about 1000 samples (≈23 ms) in and out.

Farnell's bird practical models the syrinx as two "bronchus" channels with ring modulation and a two-formant trachea. Over one tweet, the patch's parameter tables span *(source, arrays read from the page)*:
- base 870–930 Hz;
- tracheal formants 3.06–3.57 kHz and 4.46–4.90 kHz;
- ring-mod depth 0.8–0.9.

**Sources:**
- https://people.ece.cornell.edu/land/courses/ece4760/labs/f2021/lab1birdsong/Birdsong_keypad.html
- https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical28.html

**Wander will:**
- Build each syllable from one `OscillatorNode` (sine) with `frequency.setValueCurveAtTime(curve, t, dur)` and a Gain envelope with 15–25 ms ramps.
- Draw curves from a small, pre-made library: swoop, up-chirp, down-slur, and trill.
  - A trill is a second oscillator at 25–60 Hz → Gain (100–400 Hz depth) → `frequency` *(proposed)*.
- Assemble songs from 3–8 syllables with 60–150 ms gaps. Each "species" has a fixed pitch range inside 2–7 kHz and repeats its song every 5–20 s *(proposed)*.
- Let 1–3 species exist at once, at different distances: farther means quieter and lower LPF.
- Peak density in the hour around sunrise, sparse by day, none at night.
- Silence birds in rain and storms.

#### 15. Crickets at night: Farnell's pulsed 4.5 kHz carriers, with the chirp rate following temperature
**Finding.** Farnell, `cricket_chirp.pd` *(source)*:
- **Chirp period:** a 1.43 Hz phasor (one chirp every ≈700 ms).
- **Chirp envelope:** parabolic, over the first 17% of the cycle (≈120 ms).
- **Pulses:** the chirp is amplitude-modulated by `cos²` of 40.6× the phasor, i.e. 58 Hz, giving pulses at 116 Hz.
- **Carrier:** `cos(3147×phase)` = 4.5 kHz, plus 0.3 × 9 kHz.
- **Output:** ×0.1.

Farnell, `cricket_scratch.pd` *(source)*:
- A 17 ms tick, counting mod 41, fires 7 rising impulses (amplitude (n+2)/9) and then 34 silent ticks. The period is 697 ms.
- Each impulse rings band-passes at 4500, 4550 and 4600 Hz (Q 1200, ×100) plus 9000 Hz (Q 500, ×42) → HPF 4 kHz.

Dolbear's law, where N = chirps per minute:
- Fahrenheit: `T_F = 50 + (N − 40)/4`.
- Celsius: `T_C = (N + 30)/7`.

It is tied to the snowy tree cricket (*Oecanthus fultoni*). Common field crickets track temperature less reliably.

**Sources:**
- https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical27.html
- The patches `p27/cricket_chirp.pd` and `cricket_scratch.pd` (parsed)
- https://en.wikipedia.org/wiki/Dolbear%27s_law

**Wander will:**
- Run 2–4 cricket voices, each a constant pair of `OscillatorNode`s at 4.2–4.8 kHz and twice that, ×0.3.
- Gate each pair with a **looping envelope buffer**: one chirp of Farnell's parabola × cos² pulse train, pre-rendered once.
- Set the chirp rate through that source's `playbackRate`. Compute it from the night's temperature with Dolbear's law, `N = 7·T_C − 30` (15 °C → 75/min; 25 °C → 145/min), so crickets slow down as the night cools.
- Detune voices so they drift in and out of phase.
- Only in meadow, forest edge and birch woods, on warm nights. None in rain, snow or tundra.
- Keep crickets 6–10 dB below the wind bed, because they sit in the ear's most sensitive band (see 23).

#### 16. Owls: an 800 Hz hoot with a vibrato tail, rare and far
**Finding.** Wild Echoes describes the tawny owl *(source)*:
- **Hoot:** "The main energy is around 800 Hz", with "the first harmonic at 1600Hz".
- **First note:** "rises from about 750 Hz to 850 Hz before falling back again".
- **Second note:** arrives "after a pause of 3-4 secs and is so brief it can be missed".
- **Third note:** "modulated", with clear vibrato.
- **Spacing:** "50 - 60 seconds of silence between calls".
- **"Ke-wick":** starts "at about 1.2kHz, descending rapidly to 1.0 kHz before sweeping up to 1.4kHz".

**Sources:**
- https://www.wildechoes.org/species/owls/tawny-owl

**Wander will:**
- Synthesise a hoot as a triangle oscillator → LPF 1.4 kHz, so a weak second harmonic remains. Use Wild Echoes' pitch contours and timings.
- On the last note, add vibrato at about 8 Hz, ±25 Hz depth *(proposed)*.
- Send it heavily to the reverb, pan it off-screen left or right, and cut it with distance LPF.
- Call at most once every 1–3 minutes, only in forest and birch woods after dusk. An occasional distant "ke-wick" answers.

#### 17. A distant train: a B-major-6th horn chord, Doppler by detune, and rail-joint clacks
**Finding.**
- **The horn.** The Nathan K5LA, the most-used North American horn, plays "a B major 6th chord (D-sharp, F-sharp, G-sharp, B, D-sharp)". Its bells 1, 2, 3A, 4A and 5 are tuned to **311, 370, 415, 490 and 622 Hz** *(source: Wikipedia's K bell table)*.
- **The crossing pattern.** "two long, one short, and one long".
- **The clacks.** On jointed track, "rails would be installed in roughly 39-foot sections", and "the famous clickety-clack of railroads was caused by each wheel passing over each joint". Welded rail "lack[s] clickety clacks".
- **Doppler.** Web Audio's `PannerNode` has no Doppler, so it must be applied by hand: `f' = f·c/(c − v_r)` with c = 343 m/s. At 25 m/s the pitch is +7.9% on approach and −6.8% going away, a drop of ≈2.5 semitones as it passes. (This is physics, worked out here.)

**Sources:**
- https://en.wikipedia.org/wiki/Nathan_Manufacturing (wikitext read: chord and bell frequency table)
- https://en.wikipedia.org/wiki/Train_horn
- https://practical.engineering/blog/2023/12/5/why-railroads-dont-need-expansion-joints

**Wander will:**
- At the rail embankment, and very rarely elsewhere (at most once per in-game night), play a train that is heard but never seen.
- **Rumble:** brown noise → LPF 150 Hz, a 40–60 s swell *(proposed)*.
- **Clacks:** doublets of low thumps through LPF 300 Hz. Their rate is speed ÷ 11.9 m, about 2 per second at 25 m/s.
- **Horn:** five sawtooth oscillators at the K5LA frequencies → LPF 900 Hz (distance) → a strong reverb send, sounding the long-long-short-long pattern.
- **Doppler:** a single `detune` automation of about −250 cents across the pass.
- Mix the horn about 12 dB below the wind bed. It should feel like a memory.

---

### C. Generative music that never audibly loops

#### 18. Eno's incommensurable loops, and how they map to code
**Finding.** Eno (1996) on *Music for Airports*: "One of the notes repeats every 23 1/2 seconds… The next lowest loop repeats every 25 7/8 seconds or something like that. The third one every 29 15/16 seconds or something … they all repeat in cycles that are called incommensurable — they are not likely to come back into sync again." He calls generative music "a set of rules and then lets them make the thing."

Tero Parviainen rebuilt *2/1* in the browser:
- **Notes:** seven samples from a D♭maj7(add9) chord.
- **Loops:**

  | Note | Loop (s) | Offset (s) |
  |---|---|---|
  | F4 | 19.7 | 4.0 |
  | A♭4 | 17.8 | 8.1 |
  | C5 | 21.3 | 5.6 |
  | D♭5 | 22.1 | 12.6 |
  | E♭5 | 18.4 | 9.2 |
  | F5 | 20.0 | 14.1 |
  | A♭5 | 17.7 | 3.1 |

- **Shared reverb:** each loop goes through one `ConvolverNode`.
- **Pitch:** `playbackRate = 2^(semitones/12)` re-pitches the nearest sample.

The overall density works out to ≈0.36 notes/s, one note every ≈2.8 s.

**Sources:**
- https://inmotionmagazine.com/eno1.html
- https://teropa.info/blog/2016/07/28/javascript-systems-music.html
- https://reverbmachine.com/blog/deconstructing-brian-eno-music-for-airports/ (search snippet only, not read)

**Wander will:**
- Give every note in the current pool its own loop length: 17–60 s, chosen as distinct non-integer values such as primes in tenths of a second *(proposed)*. The combined pattern then cannot recur within any night.
- Aim for an overall density of one note every 2–6 s *(proposed)*. Sparse is the point.

#### 19. Generative.fm's systems: per-note random repeat intervals, minute-scale LFOs gating probability, drones three octaves down
**Finding.** Read from Alex Bainter's source *(source)*:

| Piece | How it works |
|---|---|
| **Eno Machine** | `NOTES = toss(invert(major9th('Db'), 1), [3,4,5])`. Each note gets `scheduleRepeat` with an interval drawn from 20–60 s and a start delay of 0–40 s |
| **Lemniscate** | an A♯ minor-7th chord across octaves 2–6, each note repeating every 30–80 s, but only if `random <= probability`. The probability comes from a **1/480 Hz (8-minute) LFO**, which also crossfades the notes between a left-panned and a right-panned instrument |
| **Drones** | C4, G4 and E4 played **−36 semitones** (three octaves down), re-triggered every 40–60 s, through an `AutoFilter` (base 150 Hz, 4 octaves) whose sweep rate starts at `rng/10` Hz. That sweep rate is itself swept by a second LFO between `r/100` and `r/10` Hz. A third LFO at `rng/100` Hz swells one drone's gain |
| **Above the Rain** | samples at `playbackRate 0.25` with 4 s linear fade-in and fade-out, chained so each next note starts about 4 s before the current one ends (±2.5 s). A 15 % chance adds a trumpet note with a 5 s attack. Everything goes through `Tone.Reverb(15)`. The reverb is **pre-rendered into the instrument buffers offline** (`createPrerenderableSampler` and `createPrerenderableBuffers`) to save CPU |

Paul Weir describes *No Man's Sky*'s Pulse as "a glorified random file player". Each "instrument" is "an arbitrary collection of sounds, usually variations of a single type of sound" with playback logic: "how often the sound can play, its pitch, pan and volume".

**Sources:**
- https://github.com/generative-music/pieces-alex-bainter, specifically:
  - `packages/piece-eno-machine/src/piece.js`
  - `piece-lemniscate`
  - `piece-drones`
  - `piece-above-the-rain` (all read)
- https://docs.generative.fm/docs/introduction
- the Weir Q&A (finding 6)

**Wander will:**
- Model the music as Pulse-style **instruments**, each with:
  - a voice type (pluck, bell or pad);
  - a note pool (drawn from the hour's chord);
  - a per-note repeat range;
  - a play probability;
  - pan and gain ranges.
- Modulate each instrument's probability with LFOs of 5–12 minutes *(proposed)*, Lemniscate-style, so the music thins and thickens over a night.
- **Chords drift slowly with hour and biome** *(proposed)*:
  - night: low, minor or suspended, e.g. Dm(add9) with no third in the bass;
  - dawn: brighten toward a major 9th;
  - day: the sparsest;
  - storm: music recedes almost entirely and the weather becomes the music.
- Pre-render pads and bells through the reverb where possible, as Generative.fm does.

#### 20. Voices: Karplus-Strong plucks pre-computed in JS, Chowning FM bells, slow detuned pads
**Finding.**

**Karplus-Strong.** A noise burst circulates in a delay line whose "output … is fed through a filter. The gain of the filter must be less than 1 at all frequencies". The original filter is "averaging two adjacent samples", and pitch is set by the delay D = Fs/F0, with the averaging filter adding half a sample.

In Web Audio, a feedback `DelayNode` is clamped to at least 128 frames (finding 5), so KS above ≈375 Hz at 48 kHz cannot be built from native nodes.

**Chowning's FM bell** (US Patent 4,018,121, the original MUSIC V parameters):
- duration 15 s;
- carrier 200 Hz, modulator 280 Hz;
- index from 0 to a maximum of 10;
- amplitude envelope "has an exponential decay which … may terminate at a time of 15 seconds";
- "The index function is directly proportional to the amplitude envelope";
- ratio: carrier and modulator "related to one another by an irrational number", e.g. 1:√2.

**Sources:**
- https://en.wikipedia.org/wiki/Karplus%E2%80%93Strong_string_synthesis
- https://ccrma.stanford.edu/~jos/pasp/Karplus_Strong_Algorithm.html
- https://roberthenke.com/files_software/US4018121.pdf (patent PDF, read)
- the spec, DelayNode section

**Wander will:**
- **Plucks.** Compute KS in plain JS at boot into mono `AudioBuffer`s, about 3 s per note, for each pool note and 2 variants each:
  - `N = Fs/F0 − 0.5`;
  - the excitation is noise low-passed per variant (dark or bright);
  - `y[n] = x[n] + ρ·0.5·(y[n−N] + y[n−N−1])` with ρ = 0.996–0.999 *(proposed)*.
  
  At about 0.6 MB per note that is a few MB in total. Neighbouring pitches are reached with `playbackRate`.
- **Bells.** Two `OscillatorNode`s: modulator → Gain (index × fm) → carrier `frequency`. Ratio 1:1.4 (Chowning's 200:280). Imax 3–6 rather than 10, for softness. A 6–10 s exponential decay drives both the output gain and the index gain *(proposed)*.
- **Pads.** 2–3 triangle or sawtooth oscillators detuned ±4–7 cents → LPF 700–1400 Hz at Q 0.7 → Gain with a 4–8 s attack and an 8–12 s release *(proposed; Generative.fm's "Above the Rain" uses 4 s fades)*.
- **Murk.** Sometimes play plucks at `playbackRate` 0.5 for a slowed-down, tape-like murk (see 22).

#### 21. Reverb: one procedurally generated impulse response on one shared ConvolverNode
**Finding.** Tone.js `Reverb.generate()`:
1. Opens `new OfflineContext(2, decay + preDelay, sampleRate)`.
2. Plays stereo noise into a gain held at 0, which jumps to 1 at `preDelay`.
3. Applies `exponentialApproachValueAtTime(0, preDelay, decay)`.
4. Renders the result into `convolver.buffer`.

The defaults are `decay 1.5`, `preDelay 0.01`.

Two more facts:
- **Normalisation.** The spec normalises the impulse response by **RMS power**, not by peak. Its reference code uses `GainCalibration = 0.00125`, so wet loudness stays comparable across impulse-response lengths.
- **Cost.** Adenot calls convolution "Very expensive" and proportional to impulse-response length, and suggests "Cheaper reverb … using delay lines, all-pass and low-pass filters" as an alternative.

**Sources:**
- https://cdn.jsdelivr.net/npm/tone@14.7.77/Tone/effect/Reverb.ts
- https://webaudio.github.io/web-audio-api/ (ConvolverNode normalisation pseudo-code)
- https://padenot.github.io/web-audio-perf/

**Wander will:**
- Generate two impulse responses at boot in an `OfflineAudioContext` *(proposed)*:
  - **open land:** 4.5 s, pre-delay 20 ms, noise low-passed progressively from 8 kHz to 1.5 kHz over the tail, so it gets darker;
  - **forest:** 2.2 s, denser, low-passed at 5 kHz.
- Use one `ConvolverNode` per impulse response, both fed from the same send buses. Change spaces by crossfading the two convolvers' outputs over 10 s rather than swapping `buffer` mid-sound.
- Keep the wet signal in the sends, around −12 dB relative to dry.

#### 22. Lessons from the touchstone games for the music's behaviour
**Finding.**

**Alto's Odyssey.** Its soundtrack "wasn't set in a standard time signature. So while the ear may detect this beautiful musicality to the score, you never really memorize it". Players think the music reacts to them, "that's not really happening … it never feels repetitive, but instead feels responsive." Zen Mode has its own score, by Torin Borrowdale.

**Proteus** (David Kanaga):
- Every visual element "has its own sound and musical motif", for example "twinkled rain which adds a layer of floating toy piano over the natural sound of rainfall".
- The soundtrack shifts with location, season and time of day.

**Kentucky Route Zero** (Ben Babbitt):
- "it would be cool if you could encounter one of those folk songs but then you sort of move away from them, it would cross-fade into an ambient electronic version."
- On recordings: "we bounced them to a tape machine and slowed them all down so they're even more murky and narcotic."

**Sources:**
- https://thenextweb.com/news/how-altos-odyssey-transports-players-to-a-whole-new-world
- https://www.gamedeveloper.com/audio/the-sound-and-music-of-proteus-an-academic-case-study
- https://daily.bandcamp.com/high-scores/ben-babbitt-kentucky-route-zero-original-soundtrack-interview
- https://factmag.com/2016/08/23/kentucky-route-zero-ben-babbitt

**Wander will:**
- Keep the music unmetered: no grid, no bar lengths.
- Let the weather "play" the music, Proteus-style *(proposed)*:
  - in light rain, a pluck instrument's probability rises and its notes take on a soft, twinkling high register;
  - at the campfire, a pad note sits on the fire's root.
- Give a few rare landmarks (ruins, the standing stones) a fixed short motif.
  - The motif fades in as he approaches and dissolves into the generative bed as he walks away, KRZ-style.
  - It is played slowed down: `playbackRate` 0.5 plus LPF.

---

### D. Mixing and loudness for listening all night

#### 23. Quiet target loudness, a limiter that only catches accidents, and restraint at 2–5 kHz
**Finding.**

**Loudness references:**
- EBU R 128 normalises programme to −23 LUFS, with a maximum true peak of −1 dBTP.
- Streaming services sit louder: −14 LUFS for Spotify and YouTube, −16 LUFS for Apple Music.
- Weir: *No Man's Sky* is "mixed to the EBU R128 standard".

**The compressor's defaults would pump.** The spec's `DynamicsCompressorNode` defaults (threshold −24 dB, knee 30, ratio 12, attack 0.003 s, release 0.25 s) would compress a dense ambient bed constantly. MDN: it "lowers the volume of the loudest parts of a signal" to "help prevent clipping".

**Hearing.** "the human ear is most sensitive between 2 and 5 kHz, largely due to the resonance of the ear canal". On listener fatigue: "When the volume of music is higher, these artifacts become more apparent … cause listeners to 'tune out.'"

**Sources:**
- https://en.wikipedia.org/wiki/EBU_R_128 (the EBU PDFs returned 403)
- the spec's DynamicsCompressorOptions defaults
- https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode
- https://en.wikipedia.org/wiki/Equal-loudness_contour
- https://en.wikipedia.org/wiki/Listener_fatigue
- the Weir Q&A (finding 6)

**Wander will:**
- **Loudness target.** About −28 to −24 LUFS integrated *(proposed: R128 or quieter, for a room at night)*. Measure it in development by recording the output and running `ffmpeg -af ebur128` on 30-minute captures.
- **Limiter settings.** threshold −3 dBFS, knee 0, ratio 20, attack 0.003 s, release 0.25 s *(proposed)*.
- **Headroom.** Set the master gain so typical peaks sit near −12 dBFS and the limiter almost never acts.
- **Ear-sensitive band.** Keep crickets, rain sparkle and birdsong low and sparse. From 23:00 to 05:00, a −3 dB high-shelf above 5 kHz on the ambience bus *(proposed)*.
- **Volume key.** One volume key for the user, with 2 dB steps.

#### 24. Stereo position from the screen; distance as gain plus low-pass, never HRTF
**Finding.**
- **StereoPannerNode.** It uses "a low-cost equal-power panning algorithm" over −1…1, and was "introduced as a much simpler way to apply a simple panning effect than having to use a full `PannerNode`".
- **Distance models.** `PannerNode`'s inverse model is `refDistance / (refDistance + rolloffFactor · (max(d, refDistance) − refDistance))`; the exponential model is `pow(max(d, ref)/ref, −rolloff)`.
- **Cost.** Adenot: HRTF panning is "**Very** expensive" and can be "replaced … by a very short reverb and equal-power panner".
- **Farnell's distance model.** His thunder distance patch couples a delay with a low-pass, and his wind scene pans each object (constant-power `fcpan`).

**Sources:**
- https://developer.mozilla.org/en-US/docs/Web/API/StereoPannerNode
- https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/distanceModel
- https://padenot.github.io/web-audio-perf/
- Farnell practicals 17 and 18 (above)

**Wander will:**
- **Pan.** Each positioned source gets one StereoPanner with `pan = clamp((x − centre)/halfWidth, −1, 1) · 0.75` *(proposed: never hard-panned)*, updated with `setTargetAtTime(…, 0.1)` as the world scrolls.
- **Distance** is computed in JS as two values on a gain and a low-pass, with no `PannerNode` *(proposed)*:
  - gain from the inverse formula, with ref = 5 m and rolloff 1;
  - an LPF cutoff of `clamp(18 000·(5/d)^0.6, 500, 18 000)` Hz.
- **Off-screen sounds** (owls, train, thunder) get a slightly larger reverb send in place of HRTF.

---

### E. Recordings vs synthesis, and CC0 sources

#### 25. Synthesise first; if recordings are needed (e.g. a dawn chorus), use only CC0, not the Sonniss bundle
**Finding.** Weir's caution: "It's still a poor way to create realistic sounds. I'm not generally in favour of using it to create wind or rain effects … Wind can be cold, gentle, spooky, reassuring … it's a lot harder to do this with synthetic sound." *No Man's Sky* synthesises only "the creature vocals and background fauna".

| Source | Licence | What it means for Wander |
|---|---|---|
| **Kenney** | "all game assets on the asset pages are public domain licensed (CC0) … even in commercial projects. Attribution is not required" | Safe, but mostly UI and impact sounds, not nature. |
| **Freesound** | each sound carries its own licence: CC0, CC BY or CC BY-NC. The search has a licence filter, e.g. `https://freesound.org/search/?q=dawn+chorus&f=license%3A%22Creative+Commons+0%22`, which returned 125 CC0 dawn-chorus results | CC0 candidates are listed below this table. |
| **OpenGameArt** | licences are per asset (CC0, CC-BY, CC-BY-SA, GPL, OGA-BY): "Always check individual asset licenses" | Check every asset. |
| **Sonniss #GameAudioGDC** | royalty-free with no attribution, but **not CC0**: "Licensee may not distribute, publish, sub-license or otherwise supply the sound effects as sound effects to any other person", and using them to train AI is "expressly prohibited" | A browser build serves every audio file as a downloadable URL, so this is a real licence risk. |

CC0 candidates on Freesound, as returned by the CC0 filter (still to be re-checked on each page):

| Sound | Author | URL |
|---|---|---|
| "Bird ambience. Coniferous forest dawn chorus." | SamsterBirdies | https://freesound.org/people/SamsterBirdies/sounds/745273/ |
| "Dawn chorus - Hampshire countryside Springtime" | richwise | https://freesound.org/people/richwise/sounds/466242/ |
| "Forest at dawn with a light wind in the trees…" | felix.blume | https://freesound.org/people/felix.blume/sounds/328295/ |
| "SCOPS OWL - 1" | SamuelGremaud | https://freesound.org/people/SamuelGremaud/sounds/429185/ |

**Sources:**
- the Weir Q&A (finding 6)
- https://kenney.nl/support
- https://freesound.org/help/faq/
- the Freesound CC0 search above (read)
- https://opengameart.org/content/faq
- https://sonniss.com/gdc-bundle-license/

**Wander will:**
- Ship **synthesis only** in the first version.
- **Escape hatch.** If the synthetic dawn chorus fails the mood test, add at most 2–3 CC0 Freesound recordings, mixed under the synthetic birds as a distant bed, with LPF and a reverb send.
- **Record keeping.** Log each recording's URL, author and the licence shown on its page, in `docs/audio-credits.md`.
- **Never ship Sonniss or CC BY-NC files.**

---

### Suggested build order
1. **The engine:** the context and buses (1), noise buffers (2), the voice/lifetime helpers (3), the Worker scheduler (4), and the audio state object with layer tables (6).
2. **Wind and footsteps** (7, 12). He is always walking, and the forest wind is the hero sound.
3. **Rain and thunder** (8, 9), **fire** and **smoking** (11, 13).
4. **The night fauna** (15, 16), **the birds** (14), **the coast** (10), **the train** (17).
5. **The music:** the instrument model and voices (18–21), then the behaviours (22).
6. **Mix pass:** a 30-minute capture, loudness measurement and fatigue review (23, 24).

### Sources I could not access, or only partly
- **Audiokinetic blog** (both articles) and **asoundeffect.com**: HTTP 403 to automated fetches. I read both Audiokinetic articles in full through Wayback Machine copies (curl). The asoundeffect original was not read, since the Audiokinetic copy is the same interview.
- **EBU R 128 PDFs** (tech.ebu.ch, knowledgehub.ebu.ch): 403. I used the Wikipedia summary.
- **aatishb.com ocean-sounds demo**: 404.
- **Farnell's book text**: I read only the companion code and patches. His paper on procedural footsteps ("Marching onwards") could not be found online.
- **GDC Vault videos** (Paul Weir, *The Sound of No Man's Sky*) and **Todd Baker's *Alto's Odyssey* deep-dive video**: not watched. I used the written interviews instead.
- **Sword & Sworcery / Jim Guthrie**: no technical audio source found in the time available.
- **Reverb Machine's *Music for Airports* deconstruction**: seen only as a search snippet. Eno's own 1996 talk, which I did read, is the source used.

---

## Engineering

How to render Wander's 6-10 parallax layers and its post-processing chain in WebGL2, and keep one Chromium page stable for a whole night.

**Machine facts checked on 2026-10-09/10:** Node v26.7.0. Chromium 152.0.7977.82 (Arch). The real binary is `/usr/lib/chromium/chromium`; `/usr/bin/chromium` is an Arch launcher that adds the flags in `~/.config/chromium-flags.conf`, which here are `--ozone-platform=wayland` and `--load-extension=...omarchy extensions`. GPU: RTX 4070, driver 610.57.04. Hyprland 0.56.2. The monitor is HDMI-A-1 at **2560x1440 @ 143.912 Hz**, which is exactly 640x360 x 4. The app will see `requestAnimationFrame` at ~144 Hz, not 60.

The experiments were throwaway scripts in a scratch directory (not kept in the repository):
- `gl.html`: probes the WebGL renderer
- `bench.html` + `cdp-bench.mjs`: a 4K Wander-like pipeline benchmark
- `soak.html` + `soak.mjs`: texture pool, churn and leak runs, plus a garbage-collection run
- `probe*.mjs`: headless visibility and stall tests
- `crash.mjs`: context loss and GPU-crash recovery
- `mem.mjs`: the memory APIs
- `tsserve/`: the type-stripping server plus `node --test`
- `pp/`, `pw/`: puppeteer-core and playwright-core

### Results measured on this machine (summary)

| Experiment | Result |
|---|---|
| Headless renderer, no GPU flags | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)...))`: software rendering |
| `--headless=new --use-angle=vulkan` | `ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA NVIDIA GeForce RTX 4070 (0x00002786)), NVIDIA)` |
| `--headless=new --use-angle=gl`, or `--enable-gpu` alone | `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4070/PCIe/SSE2, OpenGL ES 3.2)` |
| `--ignore-gpu-blocklist` alone | still SwiftShader |
| Wander-like frame at 3840x2160 (8 layers x 400 instanced sprites into a 640x360 RGBA8 buffer, nearest upscale, 5 full-res RGBA16F ping-pong passes), Vulkan | GPU time p50 **1.3 ms**, p99 2.6 ms (timer queries). A 60 Hz-capped run measured 2.7 / 5.3 ms because the GPU clocks down at low load. |
| The same frame on SwiftShader | ~**1,500 ms per frame**: unusable for benchmarks or 4K screenshots |
| 4K PNG via CDP `Page.captureScreenshot` | 1.9 s / 12 MB; 0.8 s / 14 MB with `optimizeForSpeed: true` |
| 60 s soak, new 1024x512 RGBA8 chunk texture every 0.5 s | texture pool: GPU process **flat at 72 MiB**. Create + delete: **flat at 68 MiB**. Never delete: **96 → 314 MiB**, +2 MiB per texture, matching the app-side estimate exactly. |
| 60 s, 4,000 objects + closures allocated per frame | 1,811 JS heap drops (~30 minor GCs/s) vs 3 without allocation. Frame p99 16.8 ms in both runs, no dropped frames. |
| `measureUserAgentSpecificMemory()` | resolves in **19.0 s** by default; **12 ms** with `--enable-blink-features=ForceEagerMeasureMemory`. Counts "Canvas" = 14,745,600 B (the 2560x1440 drawing buffer) but **not** WebGL textures or FBOs. |
| GPU process crash (`chrome.gpuBenchmarking.crashGpuProcess()`) | context lost and **never restored** by default (WebGL gets blocked for the domain). Restored in ~1.0 s with `--disable-domain-blocking-for-3d-apis`. The 3rd crash in a short window is **permanent** unless `--disable-gpu-process-crash-limit` is also set. |
| Bare headless launch (only the GPU flag) | the page turns `hidden` **4.5-5.2 s** after start and rAF stops. Fixed by any of `--disable-extensions`, `--disable-default-apps` or `--disable-background-networking`. |

---

### A. Rendering many layers in WebGL2

**1. Use one context, one atlas, one static instanced-quad VAO, and one draw call per layer.**
- **Finding:**
  - Per-instance data goes in attributes: `vertexAttribDivisor(loc, 1)` plus `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, n)`.
  - Instance data is written into **one preallocated `Float32Array`** and uploaded with a single `bufferSubData(ARRAY_BUFFER, 0, inst, 0, n*STRIDE)` per frame.
  - The VAO is built once and never changed. MDN: "Drawing from static, unchanging VAOs is faster than mutating the same VAO for every draw call … browsers can cache the fetch limits."
  - `gl_VertexID` gives a full-screen triangle with no vertex buffer for the post-processing passes.
  - Measured: 3,200 sprites in 8 layers plus 5 full-res 4K passes cost 1.3 ms of GPU time on the 4070. Draw-call count is not the bottleneck at Wander's scale; full-resolution fill rate is.
- **Sources:**
  - https://webgl2fundamentals.org/webgl/lessons/webgl-instanced-drawing.html
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices ("Avoid changing VAO attachments")
  - local `bench.html`
- **Wander will:**
  - Use a single `SpriteBatch`: one VAO, one `DYNAMIC_DRAW` instance buffer sized for the worst case (e.g. 8,192 instances x 12 floats), one atlas texture (or very few), and one `drawArraysInstanced` per layer.
  - Not create a VAO per layer or per chunk.

**2. Create textures with `texStorage2D` and update them with `texSubImage2D`; keep a fixed-size pool for chunks.**
- **Finding:**
  - MDN: "prefer `texStorage` + `texSubImage` for textures in WebGL 2". With `texImage*`, "some drivers might unconditionally allocate the whole mip-chain (+30% memory!)".
  - Uploads can cause pipeline flushes: "Prefer doing uploads before starting drawing."
  - Measured over 60 s: a texture pool filled with `texSubImage2D` and create-then-`deleteTexture` both keep GPU-process memory flat. Forgetting `deleteTexture` grows it by exactly the texture size (2 MiB per 1024x512 RGBA8).
  - One 1024x512 RGBA8 `texSubImage2D` from a `Uint8Array` took at most 1.9 ms of main-thread time.
  - WebGL2 `UNPACK_ROW_LENGTH`, `UNPACK_SKIP_PIXELS` and `UNPACK_SKIP_ROWS` let you upload a sub-rectangle of a larger CPU buffer without copying it.
- **Sources:**
  - MDN best practices ("Use texStorage to create textures", "texImage/texSubImage uploads can cause pipeline flushes")
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/pixelStorei
  - local `soak.mjs`
- **Wander will:**
  - Give each layer a ring of N chunk textures, all `texStorage2D(TEXTURE_2D, 1, RGBA8, CHUNK_W, CHUNK_H)` at startup.
  - Reuse the slot of a released chunk via `texSubImage2D`, at the start of the frame before any draws.
  - Never call `createTexture` after startup, except to rebuild after a lost context.
  - Generate chunk pixels in a Worker into a **pool of ArrayBuffers that are transferred both ways** (zero-copy; the sender's buffer becomes detached: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects), so generation allocates nothing.

**3. Native buffer, upscale and post-processing chain: build the framebuffers once, ping-pong between two, use half-float.**
- **Finding:**
  - MDN: "Almost any change to an FBO's attachment bindings will invalidate its framebuffer completeness. Set up your hot framebuffers ahead of time." After a pass, `invalidateFramebuffer` the contents you no longer need.
  - Ping-pong means two textures, each with its own FBO, swapped every pass. The last pass binds `null` to draw to the canvas.
  - In WebGL2, rendering into float textures requires `EXT_color_buffer_float`. It makes R16F, RG16F, **RGBA16F**, R32F, RG32F, RGBA32F and **R11F_G11F_B10F** color-renderable; RGB16F is not.
  - Blending into 32-bit float targets additionally needs `EXT_float_blend`.
  - On this machine, headless with Vulkan exposes `EXT_color_buffer_float`, `EXT_color_buffer_half_float`, `EXT_float_blend`, `OES_texture_float_linear`, `EXT_disjoint_timer_query_webgl2`, `WEBGL_multi_draw`, `WEBGL_lose_context` and `WEBGL_debug_renderer_info`. `KHR_parallel_shader_compile` is **not** exposed.
  - Memory per full-resolution target:

    | Resolution | RGBA16F | RGBA8 or R11F_G11F_B10F |
    |---|---|---|
    | 2560x1440 | 29.5 MB | 14.7 MB |
    | 3840x2160 | 66 MB | 33 MB |
- **Sources:**
  - MDN best practices ("Avoid invalidating FBO attachment bindings", "Use invalidateFramebuffer")
  - https://webgl2fundamentals.org/webgl/lessons/webgl-image-processing-continued.html
  - https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/
  - https://registry.khronos.org/webgl/extensions/EXT_float_blend/
  - https://webgl2fundamentals.org/webgl/lessons/webgl2-whats-new.html
  - local `gl.html`
- **Wander will:**
  - Use a `native` FBO: 640x360 RGBA8, `NEAREST`.
  - Add one integer-scaled full-resolution pair `hdr[0]`/`hdr[1]`: RGBA16F if `EXT_color_buffer_float` is present, otherwise RGBA8. Optionally use R11F_G11F_B10F for the bloom mips to halve their memory.
  - Create all FBOs at startup and on resize, and check `checkFramebufferStatus` only then.
  - Have the post pipeline swap indices; it never re-attaches.
  - Downsample bloom into a half/quarter-resolution chain, not at full resolution.

**4. Keep every blocking call out of the frame loop.**
- **Finding:** MDN lists calls that each force a flush plus a round-trip to the GPU process:
  - `getError()`
  - `get*Parameter()`
  - `getShader/ProgramParameter` and the info logs
  - `checkFramebufferStatus()`
  - `getBufferSubData()`
  - `readPixels()` to CPU memory
  
  "The only errors a well-formed page generates are `OUT_OF_MEMORY` and `CONTEXT_LOST`."
  - Shader compile status should be checked only if linking fails.
  - Readback without a stall uses `readPixels` into a `PIXEL_PACK_BUFFER`, then `fenceSync`, then `getBufferSubData` a later frame.
  - Wander needs no readback, since screenshots come from CDP.
- **Source:** https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices ("Avoid blocking API calls in production", "Don't check shader compile status unless linking fails")
- **Wander will:**
  - Run a `debug` build flag that wraps `gl` and calls `getError` after each call. It is off in normal runs.
  - Look up uniforms and attributes once at startup.
  - Check link status only on failure.
  - Never call `getError`, `readPixels` or `get*Parameter` per frame. The only per-frame query is the non-blocking timer-query poll (finding 12).

**5. Colour handling for exact pixel-art palettes.**
- **Finding:**
  - The canvas drawing buffer is 8-bit with `drawingBufferColorSpace = "srgb"` by default. What the shader writes is shown as already-encoded sRGB; there is no automatic linear-to-sRGB conversion on the default framebuffer.
  - To upload palette bytes unchanged, use `createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })`, or `pixelStorei(UNPACK_COLORSPACE_CONVERSION_WEBGL, NONE)` with `UNPACK_PREMULTIPLY_ALPHA_WEBGL = false`. Otherwise the browser may colour-manage a PNG that carries gAMA/iCCP data.
  - `SRGB8_ALPHA8` textures decode to linear when sampled. Only use them if lighting is meant to be done in linear space.
  - MDN advises against `alpha:false` ("on some platforms … significant performance cost"); write alpha = 1.0 instead.
  - The context attribute `antialias` defaults to true, which allocates a multisampled drawing buffer. Pixel art doesn't need it.
- **Sources:**
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawingBufferColorSpace
  - https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
  - https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/pixelStorei
  - MDN best practices ("Avoid alpha:false")
  - Khronos public_webgl mailing-list threads from the search; the canonical wiki page was not accessible
- **Wander will:**
  - Create the context with `{ antialias:false, depth:false, stencil:false, premultipliedAlpha:true, preserveDrawingBuffer:false, powerPreference:'high-performance' }`.
  - Upload all art as RGBA8 with colour conversion disabled.
  - Keep the native buffer in "palette space" (sRGB bytes).
  - Do fog, grading and bloom in the RGBA16F chain, with the final pass writing sRGB-encoded output. Any linear-light math is an explicit decode/encode in the shader.
  - Close each `ImageBitmap` after upload with `bitmap.close()`.

**6. Atlas bleeding with nearest filtering.**
- **Finding:** Give every sprite at least a 1 px border by repeating its edge pixels, sample with `NEAREST`, use `CLAMP_TO_EDGE`, and don't mipmap the atlas. Insetting UVs by half a texel alone is not enough.
- **Source:** https://webgl2fundamentals.org/webgl/lessons/webgl-qna-how-to-prevent-texture-bleeding-with-a-texture-atlas.html
- **Wander will:** Have `npm run art` export atlases with 1 px edge padding (extrude) per frame. Sprite UVs come from the atlas JSON and are never computed at draw time.

**7. Put per-frame globals in a uniform buffer.**
- **Finding:**
  - A UBO replaces many `uniform*` calls with one `bufferSubData`, bound once with `bindBufferBase`/`bindBufferRange` to every program that declares the block.
  - Layout must follow std140: vec3 and vec4 align to 16 bytes, and array elements to 16 bytes.
  - `MAX_UNIFORM_BLOCK_SIZE` here is 65,536 bytes.
- **Sources:** https://webgl2fundamentals.org/webgl/lessons/webgl2-whats-new.html; local `gl.html` (maxUBO = 65536)
- **Wander will:**
  - Use one `Frame` UBO (time, camera x, palette/time-of-day blend, fog, wind, rain intensity, resolution), written from a preallocated `Float32Array` once per frame.
  - Have the post-processing passes keep only their few pass-specific uniforms.

**8. Handle context loss, and know that Chromium won't restore after a GPU crash unless told to.**
- **Finding:**
  - In `webglcontextlost`, `event.preventDefault()` is **required** or `webglcontextrestored` never fires. After a restore, every GL object is invalid and must be recreated.
  - Test hooks:
    - `gl.getExtension('WEBGL_lose_context').loseContext()` / `.restoreContext()`. Measured: restored after 500 ms, every time.
    - `chrome.gpuBenchmarking.crashGpuProcess()`, available with `--enable-gpu-benchmarking`. It kills the real GPU process.
  - Measured with real GPU crashes:
    - Default flags: the context is lost and **never restored**, because of per-domain 3D blocking. Chromium source: `kDisableDomainBlockingFor3DAPIs` "Disable the per-domain blocking for 3D APIs after GPU reset."
    - With `--disable-domain-blocking-for-3d-apis`: restored on NVIDIA in ~1.0 s.
    - The 3rd crash is permanent. `gpu_process_host.cc`: fallback crash limit `3` on Linux, one crash forgiven every `kForgiveGpuCrashMinutes = 5`, after which "disabling hardware acceleration or all GL".
    - With `--disable-gpu-process-crash-limit` as well: 4 of 4 crashes restored.
  - Chromium also limits a renderer process to 16 active contexts or 16x1024x1024 cumulative pixels and "the oldest context will be forcibly lost".
- **Sources:**
  - https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event
  - https://codereview.chromium.org/14217005/
  - Chromium `content/public/common/content_switches.cc` and `content/browser/gpu/gpu_process_host.cc` (main, fetched from chromium.googlesource.com)
  - local `crash.mjs`
  - Not accessible: the Khronos wiki https://wikis.khronos.org/webgl/HandlingContextLost (HTTP 403)
- **Wander will:**
  - Make every GPU resource come from a CPU-side description in a `GpuRegistry`: shader sources, texture specs, atlas `ImageBitmap`s kept or re-decodable, chunk pixel buffers regenerable from seed + chunk index.
  - On `webglcontextlost`: `preventDefault()`, set `lost = true`, skip GL work while the world clock keeps running.
  - On `webglcontextrestored`: `registry.rebuildAll()`.
  - Use exactly one WebGL context; no helper canvases with their own GL context.
  - Launch with `--disable-domain-blocking-for-3d-apis --disable-gpu-process-crash-limit`. Both are labelled "for tests" in Chromium, but they suit a single-purpose dedicated profile.
  - Add a CDP test that calls `crashGpuProcess()` and asserts the frame counter resumes.

### B. JS memory and GC

**9. Don't allocate per frame; the real all-night risk is memory that is retained and keeps growing.**
- **Finding:**
  - V8's young generation is a small semi-space nursery (at most 16 MiB). It is collected often by the parallel Scavenger, and the pause scales with survivors, not with allocations.
  - The major GC marks concurrently and compacts in parallel. Chrome schedules GC idle tasks in the spare time between frames ("Chrome can choose to run some of these idle tasks that the GC has created in the spare time before the next frame").
  - Measured: allocating 4,000 objects plus closures per frame caused ~30 scavenges per second, yet produced **no frame above 16.8 ms in 60 s** on this CPU. Short-lived garbage is a constant CPU tax and adds pause risk, not a guaranteed hitch.
  - What breaks an all-night run is growth: unbounded arrays, Maps keyed by chunk id that never delete, listeners added per chunk, closures captured by long-lived objects.
- **Sources:**
  - https://v8.dev/blog/trash-talk
  - https://v8.dev/blog/orinoco-parallel-scavenger
  - local `soak.mjs` (`alloc=1` vs `alloc=0`)
- **Wander will:**
  - In `frame()`, avoid object or array literals, `.map/.filter`, closures, template strings, `for..of` over fresh arrays, and destructuring into new objects.
  - Keep state in preallocated typed arrays and structs-of-arrays, with fixed-capacity pools for particles, rain drops and creatures, and ring buffers for stats.
  - Give each chunk an explicit `dispose()` that releases its texture slot, pool entries, listeners and Map keys, plus a `liveChunks` counter.
  - Test pure modules with `node --test` assertions that a 10,000-chunk walk leaves `liveChunks`, `pool.inUse` and `map.size` bounded.

**10. Measure JS memory with tools that actually work in Chromium 152.**
- **Finding:**
  - **`performance.memory`** is deprecated and non-standard, but still works.
    - Without `--enable-precise-memory-info`, values are "bucketized and updated less frequently" (Chromium source comment).
  - **`performance.measureUserAgentSpecificMemory()`** needs `crossOriginIsolated`, i.e. the headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
    - It resolves only at the next GC; Chrome forces one after ~20 s (measured 19.0 s).
    - `--enable-blink-features=ForceEagerMeasureMemory` makes it resolve in 12 ms.
    - Its breakdown types here are `JavaScript`, `DOM`, `Shared` and `Canvas`. Canvas covers only the drawing buffer; **WebGL textures are not counted**.
  - **CDP `Performance.getMetrics`** (enable first with `Performance.enable`). Chromium 152 returns:
    - counts: `JSHeapUsedSize, JSHeapTotalSize, Nodes, Documents, Frames, JSEventListeners, LayoutObjects, AudioHandlers, ArrayBufferContents, DetachedScriptStates`
    - timings: `LayoutCount, RecalcStyleCount, ScriptDuration, TaskDuration, ThreadTime`, and more
  - **CDP `Memory.getDOMCounters`** → `{documents, nodes, jsEventListeners}`. The Memory domain is experimental. `Memory.prepareForLeakDetection` and `getDOMCountersForLeakDetection` exist.
  - **CDP `HeapProfiler.collectGarbage`** should be called before reading heap size, so samples compare like with like.
  - **`PerformanceObserver({type:'long-animation-frame', buffered:true})`** (Chrome 123+) reports frames over 50 ms with script attribution.
- **Sources:**
  - https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory
  - https://web.dev/articles/monitor-total-page-memory-usage
  - https://developer.chrome.com/docs/web-platform/long-animation-frames
  - Chromium `content_switches.cc` (`kEnablePreciseMemoryInfo`)
  - Chromium 152's own protocol, read from `http://127.0.0.1:<port>/json/protocol`. The chromedevtools.github.io pages only returned SPA redirect stubs to WebFetch.
  - local `mem.mjs`
- **Wander will:**
  - Serve COOP/COEP headers always; everything is same-origin, so this costs nothing.
  - In the soak harness: `HeapProfiler.collectGarbage`, then read `Performance.getMetrics` (`JSHeapUsedSize`, `Nodes`, `JSEventListeners`, `ArrayBufferContents`) and `Memory.getDOMCounters` every 60 s, then assert a near-zero slope after a 10-minute warm-up.
  - In the page, sample `measureUserAgentSpecificMemory()` at random intervals (web.dev recommends Poisson-distributed sampling) for the heartbeat (finding 20).
  - Count long animation frames.

### C. GPU memory

**11. WebGL has no memory query, so keep your own registry and cross-check it against `nvidia-smi`.**
- **Finding:**
  - Neither the WebGL API nor Chrome's `chrome.gpuBenchmarking` exposes memory. The latter only has scroll/gesture helpers, `hasGpuProcess`, `crashGpuProcess`, `getGpuDriverBugWorkarounds` and `addSwapCompletionEventListener`.
  - `measureUserAgentSpecificMemory` skips textures (finding 10).
  - The recommended approach is greggman's `webgl-memory`: wrap `create*`/`delete*`/`texStorage*`/`bufferData`, estimate bytes, and expose them through `gl.getExtension('GMAN_webgl_memory').getMemoryInfo()` → `{memory:{buffer,texture,renderbuffer,drawingbuffer,total}, resources:{...counts}}`. Its numbers are estimates, best used to see whether counts climb.
  - MDN's "per-pixel VRAM budget" (from Google Maps): pick a maximum VRAM, divide by the maximized-window pixel count, and cap all caches at budget x current pixels.
  - On this host, `nvidia-smi --query-compute-apps=pid,used_memory --format=csv,noheader,nounits` lists Chromium's GPU process (type C+G). Find it with `pgrep -f "type=gpu-process.*<user-data-dir>"`.
  - Measured: the registry estimate and nvidia-smi growth matched to the MiB (+218 MiB for 109 leaked 2 MiB textures).
  - `WEBGL_debug_renderer_info` (`UNMASKED_RENDERER_WEBGL`) is exposed in Chromium 152. It tells you whether you are on the GPU or have fallen back to SwiftShader.
- **Sources:**
  - https://github.com/greggman/webgl-memory
  - MDN best practices ("Estimate a per-pixel VRAM Budget")
  - local `soak.mjs` and `gb.html`
- **Wander will:**
  - Wrap creation in `GpuRegistry`: `createTexture2D(w,h,fmt)`, `createBuffer(bytes)`, `createTarget(...)` and the matching `delete*`. It tracks `{textures, buffers, framebuffers, bytes}` using bytes-per-pixel RGBA8=4, RGBA16F=8, R11F_G11F_B10F=4, and adds the drawing buffer as w x h x 4.
  - Expose `window.__wander.stats()` to the harness.
  - Have the soak test assert both "registry counts constant after warm-up" and "nvidia-smi GPU-process MiB slope ≈ 0".
  - Log the renderer string at startup and after every restore. If it contains `SwiftShader`, report it as degraded (finding 20).

### D. Frame timing and hidden pages

**12. Measure frame time in the page with a ring buffer plus GPU timer queries, and expect 144 Hz.**
- **Finding:**
  - The rAF `timestamp` is the same for all callbacks in a frame and runs at the display rate: "on 144Hz screens, they fire ~144 times per second".
  - Store `ts - last` in a `Float32Array(4096)` ring buffer and compute p50/p99 on demand by sorting a copy (only when asked, not every frame).
  - GPU time comes from `EXT_disjoint_timer_query_webgl2`, which is available here on Vulkan and on ANGLE-GL:
    - `beginQuery(TIME_ELAPSED_EXT)` / `endQuery`
    - poll `QUERY_RESULT_AVAILABLE` on **older** queries in later frames (results "only become available … after control returns to the browser")
    - discard the result if `getParameter(GPU_DISJOINT_EXT)` is true
    - keep a small pool of 3-4 query objects
  - Caveats:
    - GPU time depends on power state: the 60 Hz-capped p50 was 2.7 ms, uncapped 1.3 ms.
    - One ANGLE-GL capped run reported an implausible 15 ms. Compare like with like, and prefer Vulkan for measurements.
  - Headless rAF is fixed at 60 Hz. For throughput tests, `--disable-gpu-vsync --disable-frame-rate-limit` uncaps it; then rAF deltas become meaningless (0.1 ms) and only timer queries count.
- **Sources:**
  - https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
  - https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
  - local `bench.html`, `cdp-bench.mjs`
  - `hyprctl monitors` (143.912 Hz)
- **Wander will:**
  - Drive all motion from time deltas, not frame counts.
  - Render on every rAF at ~144 Hz. Budget: about 6.9 ms of frame time, measured ~1.3-3 ms of GPU time for the full chain at 4K.
  - Keep `FrameStats` (CPU deltas plus GPU ms from timer queries, all preallocated) behind a debug overlay key, and report p50/p99/max over the last 4,096 frames in the heartbeat.

**13. Hidden pages stop rAF; base the world clock on wall time and clamp it on resume.**
- **Finding:**
  - "requestAnimationFrame will wait for the page to be visible."
  - Hidden-page timers are checked once per second. They drop to once per **minute** ("intensive throttling") when the page has been hidden for more than 5 minutes, the timer chain count is at least 5, the page has been silent for at least 30 s, and no WebRTC is active.
  - Opt-out flags:
    - `--disable-background-timer-throttling` ("Disable task throttling of timer tasks from background pages")
    - `--disable-renderer-backgrounding`
    - `--disable-backgrounding-occluded-windows`
  - Measured headless: with `--disable-background-timer-throttling`, a 100 ms `setInterval` kept running at 10 Hz while hidden, but **rAF stayed at 0** whatever the flags.
  - On Wayland, compositors stop frame callbacks or send the "suspended" state for windows on another workspace (Mutter, KWin; Chromium handles this in ozone/wayland), so rendering stalls even without the page being "hidden".
  - Chrome 133+ also freezes hidden, silent (>5 min), CPU-intensive pages when Energy Saver is on.
- **Sources:**
  - https://developer.chrome.com/blog/timer-throttling-in-chrome-88
  - https://developer.chrome.com/blog/freezing-on-energy-saver
  - https://chromium.googlesource.com/chromium/src/+/69f60ea35d33ea693ae1ed6f65659943348101d7
  - Chromium `content_switches.cc`
  - local `probe3.mjs`
- **Wander will:**
  - Define `worldTime = startWorldTime + (performance.now() - t0) * speed`; time of day, weather and the walk position all derive from it.
  - Clamp the simulation step per frame, e.g. `dt = min(rawDt, 100 ms)`. After a long gap, jump time of day forward but move the walker no more than a bounded distance, so the app never generates hundreds of chunks in one frame.
  - Never do essential work on `setInterval`.
  - Accept that a background soak test can't exercise rendering. Rendering soaks run with the page visible (finding 15).

### E. Headless Chromium for screenshots and benchmarks

**14. Exact headless WebGL2 flags for the RTX 4070.**
- **Finding:**
  - New headless (`--headless` = `--headless=new`; old headless is only in the separate `chrome-headless-shell` binary since Chrome 132) defaults to **SwiftShader** on Linux. Chromium source `chrome/browser/headless/headless_mode_init.cc`: if none of `--use-gl`, `--use-angle` or `--enable-gpu` is given, it appends `--use-angle=swiftshader-webgl`.
  - Measured:
    - **`--use-angle=vulkan`** → NVIDIA through ANGLE/Vulkan 1.4.341. `--enable-gpu`, `--ignore-gpu-blocklist` and `--enable-features=Vulkan` are not needed.
    - `--use-angle=gl` or `--enable-gpu` → NVIDIA through ANGLE/OpenGL ES 3.2.
    - `--ignore-gpu-blocklist` alone → still SwiftShader.
    - SwiftShader took ~1.5 s per 4K frame.
  - Recommended harness line:
    `/usr/lib/chromium/chromium --headless=new --use-angle=vulkan --disable-extensions --disable-default-apps --disable-background-networking --no-first-run --enable-precise-memory-info --enable-blink-features=ForceEagerMeasureMemory --user-data-dir=<tmp> --remote-debugging-port=0`
  - Add `--enable-gpu-benchmarking` for crash tests and `--disable-gpu-vsync --disable-frame-rate-limit` for throughput runs.
  - Use `/usr/lib/chromium/chromium`, not `/usr/bin/chromium`. The latter reads `~/.config/chromium-flags.conf` and loads the user's extensions.
- **Sources:**
  - https://developer.chrome.com/docs/chromium/headless
  - Chromium `chrome/browser/headless/headless_mode_init.cc`
  - local `gl.html` runs
- **Wander will:**
  - Put that exact argument list in `scripts/browser.ts`, shared by the screenshot, benchmark and soak scripts.
  - Assert that `UNMASKED_RENDERER_WEBGL` contains `NVIDIA` before benchmarking, failing loudly instead of quietly benchmarking SwiftShader.

**15. Headless gotcha: the page goes hidden ~5 s after startup unless default apps and extensions are disabled.**
- **Finding:**
  - With only the GPU flag, every run flipped `document.visibilityState` to `hidden` 4.5-5.2 s after launch, and rAF stopped. This was the same with `--disable-renderer-backgrounding` and `--disable-backgrounding-occluded-windows`.
  - Any one of `--disable-extensions`, `--disable-default-apps` or `--disable-background-networking` prevents it. The likely cause is a default or component app opening something that takes over the active window. Puppeteer and Playwright pass all three by default, which is why they don't hit it.
  - `Emulation.setFocusEmulationEnabled({enabled:true})` (experimental) keeps visibility `visible`, but frames still drop to ~1 Hz once content changes. Calling `Page.bringToFront` every 2 s also works around it. Neither is needed when the flags are set.
  - Verified: 3,620 frames in 60 s (60 Hz) with the flags.
- **Sources:** local `probe3.mjs` and `probe5.mjs`; Chromium 152 `/json/protocol` (`Emulation.setFocusEmulationEnabled`: "Enables or disables simulating a focused and active page"); the puppeteer-core 25.13.0 and playwright-core 1.64.0 launch args printed locally.
- **Wander will:** Always pass `--disable-extensions --disable-default-apps --disable-background-networking`, and also call `Emulation.setFocusEmulationEnabled` (cheap insurance).

**16. Capturing reliable PNGs of the WebGL canvas, and a 4K viewport.**
- **Finding:**
  - `Page.captureScreenshot` reads the compositor surface (`fromSurface` defaults to true), so it works with `preserveDrawingBuffer:false`. That avoids the canvas `toDataURL()` problem, where the call must happen in the same task as the draw or the buffer is already cleared.
  - Set the viewport with `Emulation.setDeviceMetricsOverride({width:3840, height:2160, deviceScaleFactor:1, mobile:false})`. In Playwright: `newPage({ viewport:{width:3840,height:2160}, deviceScaleFactor:1 })`.
  - Measured at 4K: 1.9 s and 12 MB per PNG; `optimizeForSpeed:true` gives 0.8 s and 14 MB.
- **Sources:** Chromium 152 `/json/protocol` (`Page.captureScreenshot` params: format, quality, clip, fromSurface, captureBeyondViewport, optimizeForSpeed); local `cdp-bench.mjs` and `shot-3840x2160.png`.
- **Wander will:**
  - Support `?seed=…&t=…&freeze=1` URL params. The page then renders deterministically at world time `t` (grain and rain seeded from `t`), stops advancing, and sets `window.__wander.ready = true`.
  - Have the screenshot script wait for `ready` and capture 2560x1440 (the user's monitor) and 3840x2160 with `deviceScaleFactor:1`.

**17. playwright-core vs puppeteer-core vs raw CDP.**
- **Finding:**
  - Both libraries drive `/usr/lib/chromium/chromium` 152 fine. Both default to SwiftShader in headless, so `args:['--use-angle=vulkan']` is required (user args override). Both reached 60 fps, NVIDIA and 4K screenshots here.
  - Install size: `playwright-core@1.64.0` = **14 MB, 1 package, no dependencies**; `puppeteer-core@25.13.0` = 32 MB, 23 packages.
  - Playwright warns about `executablePath`: "Playwright only works with the bundled Chromium … use at your own risk". `puppeteer-core` "will not download Chrome" and needs `executablePath`/`channel`. Puppeteer pins a Chrome version too.
  - Node 26 has a global `WebSocket`, so a dependency-free CDP client is ~40 lines (`Target.createTarget` → `Target.attachToTarget {flatten:true}` → send with `sessionId`), as used for every experiment here.
- **Sources:**
  - https://playwright.dev/docs/api/class-browsertype
  - https://playwright.dev/docs/browsers
  - https://pptr.dev/guides/installation
  - https://pptr.dev/guides/headless-modes
  - local `pw/test.mjs`, `pp/test.mjs`
- **Wander will:**
  - Use **playwright-core** as its one dev dependency: smallest, no transitive dependencies, `page.screenshot`, `page.evaluate`, and `page.context().newCDPSession(page)` when raw CDP calls (`Performance.getMetrics`, `HeapProfiler.collectGarbage`, `Memory.getDOMCounters`) are needed.
  - Keep the zero-dependency CDP client as the fallback if a Playwright/Chromium version mismatch ever breaks.
  - Minimal shape:
    ```ts
    import { chromium } from 'playwright-core';
    const browser = await chromium.launch({ executablePath: '/usr/lib/chromium/chromium', headless: true,
      args: ['--use-angle=vulkan', '--enable-precise-memory-info', '--enable-blink-features=ForceEagerMeasureMemory'] });
    const page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/?seed=7&t=43200&freeze=1`);
    await page.waitForFunction(() => (window as any).__wander?.ready === true);
    const renderer = await page.evaluate(() => (window as any).__wander.renderer); // must include 'NVIDIA'
    await page.screenshot({ path: 'shots/noon-4k.png' });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    await browser.close();
    ```

### F. Long-running stability (the real fullscreen app)

**18. Launch with a dedicated profile so the flags actually apply.**
- **Finding:**
  - On Linux, a second launch with the same profile finds `SingletonSocket`/`SingletonLock` in the profile directory and "send[s] a message to the first chrome browser process with the current directory and second process command line flags. The second process then exits." Browser-wide switches given to that second launch are not applied ("most command-line arguments are ignored if there's already a running instance").
  - `--ozone-platform-hint=auto` has been the default since Chrome 140, so Wayland is picked automatically. The user's flags file forces `--ozone-platform=wayland` anyway.
  - `--start-fullscreen`: "Specifies if the browser should start in fullscreen mode, like if the user had pressed F11 right after startup."
- **Sources:**
  - Chromium `chrome/browser/process_singleton_posix.cc` header comment
  - https://textslashplain.com/2022/06/15/chromium-startup/
  - https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md
  - https://www.phoronix.com/news/Chrome-Auto-Ozone-Platform
  - Chromium `content_switches.cc`
- **Wander will:**
  - Launch with:
    `/usr/lib/chromium/chromium --user-data-dir=$HOME/.local/share/wander/chromium --app=http://127.0.0.1:PORT/ --start-fullscreen --autoplay-policy=no-user-gesture-required --no-first-run --disable-extensions --disable-default-apps --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-domain-blocking-for-3d-apis --disable-gpu-process-crash-limit --ozone-platform=wayland`
  - Not pass `--use-angle=vulkan` to the visible, Wayland-backed app until it is verified there; that was tested only headless. The page logs the renderer it gets.

**19. Known sources of slow leaks, and a guard for each.**
- **Finding:**
  - Extra WebGL contexts evict older ones (the limits are 16 contexts or 16M pixels).
  - `AudioBufferSourceNode`s are single-use but "very inexpensive to create", and are garbage-collected after playback if not referenced. `AudioBuffer`s are reusable.
  - `ImageBitmap` should be released with `.close()`.
  - Detached DOM and listeners show up in `Memory.getDOMCounters` (`nodes`, `jsEventListeners`). The DevTools Memory panel has a "Detached elements" profile.
  - Unbounded logs, arrays and `console.log(obj)` with DevTools open retain objects.
  - `setInterval`s that are never cleared keep their closures alive.
- **Sources:**
  - https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
  - https://codereview.chromium.org/14217005/
  - https://developer.chrome.com/blog/new-in-devtools-130
  - CDP `Memory` domain (Chromium 152 protocol)
- **Wander will:**
  - Use one GL context, one AudioContext, and pre-decoded AudioBuffers with fire-and-forget source nodes.
  - Keep logs in fixed-size ring buffers, with no per-frame `console.*`.
  - Create all DOM once; the page is just a canvas plus an optional hidden overlay.
  - Start every timer from a single scheduler that is disposed with its owner.
  - Have the soak test assert that `nodes`, `jsEventListeners`, `AudioHandlers`, registry counts and the chunk count are constant after warm-up.

**20. Self-monitoring and a watchdog for all-night runs.**
- **Finding:**
  - Combining findings 8, 10, 11 and 12, Wander can detect its own degradation: permanent context loss (no `webglcontextrestored` within ~10 s), a SwiftShader renderer after a restore, or a growing heap or registry. Some failures are only fixable by restarting the browser: the GPU crash limit, domain blocking, a Wayland or GPU driver hang.
  - A page that has stopped heart-beating is detectable from outside.
- **Sources:** as findings 8, 10, 11 and 12; local `crash.mjs` shows that "lost and never restored" really happens without the flags.
- **Wander will:**
  - Have the page `POST /heartbeat` every 60 s with:
    - `{worldTime, frames, p50, p99, gpuP50, renderer, lost, liveChunks, registry, jsHeap, uasm?}`
  - Have the Node server append these to a JSONL log, kept bounded.
  - Run the launcher script (or a systemd `--user` service) as a supervisor. It kills and relaunches Chromium, with the same profile and the last world time and seed passed in the URL, if heartbeats stop for more than 3 minutes or report `lost` for more than 30 s or a SwiftShader renderer.
  - Have the page restore world time from `?t=` so a restart looks like a scene cut, not a reset.

**21. Keep the screen awake.**
- **Finding:**
  - `navigator.wakeLock.request('screen')` returns a `WakeLockSentinel`. It needs a secure context; `http://127.0.0.1` counts as one. It is controlled by the `screen-wake-lock` Permissions-Policy (default `self`).
  - The lock is **released automatically when the page is hidden** and must be re-requested on `visibilitychange` → `visible`.
  - Baseline since March 2025.
  - On Wayland, Chromium 146+ reportedly sets an idle inhibitor on normal windows, and Omarchy's idle service honours Wayland inhibitors. This comes from a vendor forum post, not a primary source.
- **Sources:**
  - https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
  - https://forum.cursor.com/t/wayland-cursor-holds-an-idle-inhibitor-and-blocks-the-screensaver-while-the-agents-window-is-open/172907 (secondary)
  - https://wayland.app/protocols/idle-inhibit-unstable-v1
- **Wander will:**
  - Request the screen wake lock on start and on every return to `visible`, catching and logging failures.
  - Treat a Hyprland idle-inhibit window rule for the Wander window as optional insurance. It belongs to the user's Hyprland config, so the omarchy skill should handle it, not this repo.
  - Check the first all-night run to confirm the screen never blanks.

### G. Node side

**22. `module.stripTypeScriptTypes` in Node 26: still there, only `strip` mode left, still warns on 26.7.**
- **Finding:**
  - Node v26.11.1 docs: `module.stripTypeScriptTypes(code[, options])` is **Stability 1.2 – Release candidate** (added v23.2.0/v22.13.0).
  - **v26.0.0 removed the `transform` and `sourceMap` options**. What is left is `mode: 'strip'` (the default) and `sourceUrl`.
  - `--experimental-transform-types` was removed in v26.0.0. Node's own type stripping for `.ts` files is **Stable (2)**.
  - Locally on v26.7.0, the first call prints `ExperimentalWarning: stripTypeScriptTypes is an experimental feature` (silence with `--disable-warning=ExperimentalWarning`). `{sourceMap:true}` throws, and `enum` throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.
  - Stripping replaces types with **spaces**, so line and column positions are unchanged and no source maps are needed for browser stack traces.
  - Unsupported syntax (error `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`): enums, namespaces with runtime code, parameter properties, import aliases, decorators. `.tsx` is unsupported.
- **Sources:** https://nodejs.org/api/module.html; https://nodejs.org/api/typescript.html; local `node -e` tests.
- **Wander will:**
  - Keep using `stripTypeScriptTypes(src, { mode: 'strip', sourceUrl })` in the dev server, cached by path + mtime.
  - Start the server with `--disable-warning=ExperimentalWarning`.
  - Use tsconfig `erasableSyntaxOnly` so `tsc --noEmit` rejects enums and the like at type-check time.

**23. Serving `.ts` to the browser: only the MIME type matters, and many MIME tables map `.ts` to video.**
- **Finding:**
  - Module scripts need a JavaScript MIME type; "you'll get a strict MIME type checking error" otherwise. The URL extension doesn't matter.
  - Verified: a page whose `main.ts` imports `./util.ts`, served as `text/javascript; charset=utf-8`, runs in Chromium 152, and `import.meta.url` still ends in `.ts`.
  - The same files served as `video/mp2t` (the common default MIME for `.ts`) are blocked.
  - Node requires explicit `.ts` extensions and `import type` for type-only imports. Without `type`, Node "will treat the import as a value import, which will result in a runtime error". The browser fails the same way, because stripping leaves the named import in place.
  - Recommended tsconfig per Node: `noEmit`, `target: esnext`, `module: nodenext`, `rewriteRelativeImportExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`. Node ignores tsconfig and `paths`; use `#` subpath imports instead.
  - `file://` doesn't work for modules (CORS), so the local server is mandatory.
- **Sources:** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules; https://nodejs.org/api/typescript.html; local `tsserve/`.
- **Wander will:**
  - Have the server map `.ts` → `text/javascript; charset=utf-8` explicitly and never use a generic MIME library.
  - Bind only to `127.0.0.1`, reject `..` paths, and send COOP/COEP plus `Cache-Control: no-cache`.
  - Write `.ts` in every specifier, and turn on `verbatimModuleSyntax` + `erasableSyntaxOnly` (+ `allowImportingTsExtensions` for `tsc --noEmit`) so a missing `import type` fails type-checking.

**24. `node --test` for pure TS modules shared between browser and Node.**
- **Finding:**
  - In Node 26, `node --test` finds `**/*.test.ts`, `**/test/**/*.ts` and similar files automatically, unless `--no-strip-types` is given. Verified on 26.7.0 with zero config: `test/util.test.ts` imports `../util.ts` and `import type`, and passes.
  - The runner is Stable.
  - `t.assert.snapshot` / `fileSnapshot` are stable (regenerate with `--test-update-snapshots`).
  - Mock timers cover `setTimeout/setInterval/Date` but are "1.0 – Early development", and don't cover `performance.now()`.
  - Coverage (`--experimental-test-coverage`) is still experimental.
- **Source:** https://nodejs.org/api/test.html; local `tsserve/test/util.test.ts`.
- **Wander will:**
  - Keep world generation, chunk lifecycle, palettes, the world clock, `FrameStats` and the GPU-registry byte maths in DOM-free modules that take an injected clock `{ now(): number }`. Tests drive that clock directly rather than relying on mock timers.
  - Snapshot-test the generator: a hash of chunk pixels for a fixed seed.
  - Add a "10,000 chunks walked → pools and Maps bounded" leak test.
  - Leave everything that needs GL to the playwright-core harness (screenshots, a 2-minute smoke benchmark, a multi-hour soak with `HeapProfiler.collectGarbage` + `Performance.getMetrics` + nvidia-smi sampling).

---

**Sources I could not access or that returned little:**
- **Khronos wiki** `HandlingContextLost`: HTTP 403, and the web.archive.org mirror is blocked for the fetch tool. Used MDN plus local tests instead.
- **chromedevtools.github.io/devtools-protocol/tot/** pages: only returned SPA redirect stubs. Used Chromium 152's own `/json/protocol` from the local browser, which is authoritative for this version.
- **peter.sh switch list:** too large to read. Read the switch comments directly from Chromium source (`content_switches.cc`, `gl_switches.cc`, `gpu_switches.cc`).
- **Docs with nothing on GPU/WebGL:** the Playwright and Puppeteer docs and developer.chrome.com/docs/chromium/headless don't mention it; the GPU behaviour above is from Chromium source and local runs.
- **Not verified:** which ANGLE backend the *visible* Wayland app uses. The page should log it on first launch.
