# Wander real world: design spec

2026-10-08 · Approved in chat after a spike that drew central Prague from real data; this document records the design. It builds on `2026-10-08-wander-design.md`, which stays the authority for everything it does not change.

With `--place` or `--at`, Wander draws a real place instead of a generated one: elevation from the Terrarium tiles, land cover and water from OpenStreetMap, at 3 m per column, loaded ahead of you as you walk and cached on disk. Everything else, the sky, weather, movement, keys and status bar, stays as it is.

## 1. Intent

**Asked for:** make the landscape from actual map data.

**Chosen in the conversation:**

| Question | Answer |
|---|---|
| Scale | 3 m per column, 6 m per row; adjustable with `--scale` |
| Buildings and roads | Drawn: buildings, built-up land, roads by class, railways |
| Generated world | Stays, and stays the default; `--bench` keeps using it |
| Where you start | Exactly at the place, even if that is water |
| Data | Terrarium elevation tiles (AWS Open Data) and OpenStreetMap through Overpass; Nominatim for place names |

**Assumptions, approved with the design:** no account or API key is needed; the public Overpass and Nominatim servers are used politely (a user agent, one Nominatim request per start, small Overpass regions); no dependencies, so the PNG decoder is written here; a flat projection around the start place is accurate enough for a walk.

**Done means:**

1. `node src/main.ts --place Prague` shows the Vltava, Letná and the Old Town within a few seconds on a normal connection, and walking a kilometre in any direction keeps the map arriving ahead of you while the status bar holds about 60 fps.
2. With the network off, the game still starts: cached areas draw, the rest is fog, and the status bar says `offline`.
3. `node --test` passes with no network; the bench targets of the base spec §7 still hold on the generated world.

## 2. What you see and do

### Modes

- Without `--place` or `--at`: the generated world, unchanged.
- With either: the real world. The sky, weather, movement, keys and status bar behave as before. The weather seed is `--seed` if given, else a hash of the place's coordinates, so a revisited place has the same fronts.

### Scale and start

- One column is `scale` metres, 3 by default; one row is `scale · ASPECT` metres. A 200×60 window shows 600 m × 360 m.
- The place is the origin: map cell (0, 0) is centred on it, and you start on that cell, even if it is water.

### Biomes

Five biomes join the table after Snowy peaks, in this order:

| Id | Biome | Glyphs | Colour | Speed |
|---|---|---|---|---|
| 14 | Field | `" ,` | ochre on olive (`fg 0xd2c070`, `bg 0x6e6a2a`) | 0.9 |
| 15 | Town | `. ·` | warm grey (`fg 0x8a8378`, `bg 0x55504a`) | 1.0 |
| 16 | Building | `# ▪` | grey (`fg 0x9a9aa0`, `bg 0x3a3a40`) | 0.6 |
| 17 | Road | `·` | light grey (`fg 0xc8c8c8`, `bg 0x5e5e62`) | 1.0 |
| 18 | Railway | `+ =` | brown-grey (`fg 0xb0a890`, `bg 0x3c3836`) | 0.8 |

Town is built-up land between buildings. None of these ever appears in the generated world; `GENERATED_BIOMES = 14` names how many biomes it uses. All five have `water: None`, `sways: false`.

### Status bar

In the real world the status bar replaces `x`/`y` with your latitude and longitude to four decimals, and the seed with the place name and the attribution the data licence requires:

`Prague · © OpenStreetMap │ 50.0881,14.4139 │ Grassland │ 07:42 morning │ Rain, wind ↘ │ 60 fps`

The place, the attribution and the loading state come first, so they survive a narrow window.

`· loading` is appended after the coordinates while fetches are in flight; while any fetch has failed and waits for its retry, `· offline` when the latest failure was a lost connection or `· server busy` when the server answered with an error, timed out, or sent unreadable data.

### Fog

A chunk whose data has not arrived is drawn as fog: every cell `·` in `COLORS.fogFg = 0x3a3f46` on `COLORS.fogBg = 0x14171b`, with no light, weather or drops. It is redrawn as terrain on the frame after its data lands.

## 3. Coordinates

`Projection` (in `geo.ts`) is pure and fixed at start: origin `(lat0, lon0)` and `scale` metres per world unit.

- World point `(x, y)` in units is `x · scale` metres east and `y · scale` metres south of the origin.
- `lat = lat0 − (y · scale) / M`, `lon = lon0 + (x · scale) / (M · cos lat0)`, with `M = 111320` metres per degree.
- The inverse: `x = (lon − lon0) · M · cos lat0 / scale`, `y = (lat0 − lat) · M / scale`.
- Map cell `(mx, my)` is centred on world point `(mx + 0.5, (my + 0.5) · ASPECT)`.

Web Mercator, also in `geo.ts`, with 256-pixel tiles at zoom `z`: `px = (lon + 180) / 360 · 256 · 2^z`, `py = (1 − ln(tan φ + sec φ) / π) / 2 · 256 · 2^z`; the inverse `lon = px / (256 · 2^z) · 360 − 180`, `lat = atan(sinh(π · (1 − 2 py / (256 · 2^z))))`. A tile is `(floor(px / 256), floor(py / 256))`, and `tileBounds(z, tx, ty)` gives its south, west, north and east edges.

## 4. Data

| Source | What | Where | Unit |
|---|---|---|---|
| Terrarium tiles | Elevation, about 12 m per pixel at zoom 13 | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png` | one PNG tile per zoom-13 tile |
| Overpass | Land cover, water, buildings, roads, railways | `POST https://overpass-api.de/api/interpreter`, then `overpass.private.coffee` and `overpass.kumi.systems` on failure | one query per zoom-14 tile, the *region* |
| Nominatim | Place name → coordinates | `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=…` | one request per start |

- Terrarium pixels decode as `elevation = R · 256 + G + B / 256 − 32768` metres. Tiles are 8-bit RGB or RGBA PNGs, decoded by `png.ts`: zlib inflate from `node:zlib`, then the five PNG filters (none, sub, up, average, Paeth).
- Elevation at a point is sampled bilinearly between pixel centres inside its tile; at a tile edge the sample clamps to the tile. A missing tile makes the chunk fog, never zero.
- The Overpass query for a region's bounds `(s, w, n, e)` is:

  ```
  [out:json][timeout:180];
  (
    way["natural"="water"](s,w,n,e);
    relation["natural"="water"](s,w,n,e);
    way["waterway"~"^(river|canal|stream)$"](s,w,n,e);
    way["landuse"~"^(forest|grass|meadow|farmland|orchard|vineyard|cemetery|allotments|residential|industrial|commercial|retail)$"](s,w,n,e);
    relation["landuse"~"^(forest|residential|industrial)$"](s,w,n,e);
    way["natural"~"^(wood|scrub|grassland|heath)$"](s,w,n,e);
    way["leisure"~"^(park|garden|pitch)$"](s,w,n,e);
    relation["leisure"="park"](s,w,n,e);
    way["building"](s,w,n,e);
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian)$"](s,w,n,e);
    way["railway"~"^(rail|light_rail|tram)$"](s,w,n,e);
  );
  out geom;
  ```

  `out geom` returns each way's coordinates and each relation member's coordinates. The `timeout` is the client's fetch timeout in seconds, so an abandoned query doesn't keep running against the address's quota. A reply with a `remark` (Overpass reports a timed-out or out-of-memory query as HTTP 200 with a remark and partial data) counts as a failed fetch and is never cached.
- Every request sends `User-Agent: wander/0.1 (terminal landscape toy)`.
- **Cache.** Responses are stored as files under `$XDG_CACHE_HOME/wander` or `~/.cache/wander`: `terrarium/13/{x}/{y}.png`, `osm/14/{x}/{y}.json`, `places/{hash of the query}.json`. A cached file is used without any request, so cached areas work offline.
- **Retries.** A failed, non-2xx or slower-than-20-second fetch is retried after 5 s, then 15 s, then every 60 s, and each Overpass retry moves to the next instance in the list, since the public servers throttle an address after heavy queries. At most four fetches are in flight at once, and at most one Overpass query among them.

## 5. From data to cells

### Features

Each Overpass element becomes zero or more features:

- A closed way (first and last coordinates equal, at least four points) with an area tag is a **polygon** with one ring. A relation contributes one polygon per `outer` member; its `inner` members are holes of that polygon.
- A way tagged `highway`, `railway` or `waterway` is a **line** with a width in cells; so is an open way with an area tag, treated as a line of width 1.

| Tags | Cover | Width (cells) |
|---|---|---|
| `natural=water` polygon | Water; `water=river`, `canal` or `stream` → River, otherwise Lake | — |
| `waterway=river` or `canal` line | River | 2 |
| `waterway=stream` line | River | 1 |
| `highway=motorway`, `trunk` | Road | 5 |
| `highway=primary` | Road | 4 |
| `highway=secondary` | Road | 3 |
| `highway=tertiary`, `residential`, `living_street`, `pedestrian` | Road | 2 |
| `highway=unclassified`, `service` | Road | 1 |
| any road with `bridge=yes` | Bridge | as its class |
| `railway=rail`, `light_rail`, `tram` | Railway | 1 |
| `building=*` | Building | — |
| `landuse=residential`, `industrial`, `commercial`, `retail` | Town | — |
| `landuse=forest`, `natural=wood` | Forest | — |
| `landuse=farmland`, `orchard`, `vineyard` | Field | — |
| `landuse=grass`, `meadow`, `cemetery`, `allotments`; `natural=grassland`, `scrub`, `heath`; `leisure=park`, `garden`, `pitch` | Grass | — |

### Cover raster

Each region is rasterised once, when its data arrives, into a **cover raster** in cell coordinates covering the region's bounds: a `Uint8Array` of cover codes plus `Float32Array`s `flowX`, `flowY`.

- Cover codes, highest paints over lower: `None 0, Grass 1, Field 2, Forest 3, Town 4, Building 5, Railway 6, Road 7, Water 8, Bridge 9`. Water is split by kind in a second array (`River` or `Lake`) so the chunk can pick the biome.
- Polygons fill by even-odd scanline on cell centres, so holes work.
- Lines paint every cell whose centre lies within `width / 2` cells of the segment.
- Rivers flow: each waterway segment also paints its unit direction into `flowX`/`flowY` for cells within 8 cells of it, so river cells from polygons pick up the flow of the mapped centreline. Where none is mapped the flow is 0.

### Cell classification

For map cell `(mx, my)` with centre `(lat, lon)`, elevation `e` metres (bilinear), latitude temperature `t = clamp01(clamp01(1.1 − |lat| / 75) − e / 4000)` and steepness `s = |∇e|` from the elevation differences to the neighbouring cell centres (east–west over `2 · scale` metres, north–south over `2 · scale · ASPECT`):

1. Cover `Water` → River or Lake by its kind; `Bridge` → Road; `Road` → Road; `Railway` → Railway; `Building` → Building; `Town` → Town; `Forest` → Forest; `Field` → Field; `Grass` → Grassland.
2. No cover and `e < −0.5` → sea: Shallows above −5 m, Ocean above −50 m, Deep ocean below.
3. No cover: `t < 0.15` or `e > 2500` → Snowy peaks; `s > 0.45` → Mountains; `s > 0.2` → Hills; `t < 0.25` → Tundra; otherwise Grassland.

The chunk stores `height = e` (metres), `temperature = t`, `variant = hash2(mx, my, seed) & 0xff`, `shade` from the slope lit from the north-west as in the generated world but with `REAL.relief = 3` multiplying the dimensionless slope, 1 for water, roads and railways; `flowX`/`flowY` for River cells from the raster; `shore = 1` for sea cells with a non-sea 4-neighbour.

## 6. Chunks and loading

- `world.ts` gains `type ChunkSource` with the surface the renderer and game use: `seed`, `generated`, `chunk`, `chunkAt`, `biomeAt`, `temperatureAt`, `prefetch`. `World` satisfies it. `Chunk` gains `ready: boolean`; generated chunks are always ready.
- `RealWorld` (in `realworld.ts`) implements `ChunkSource`:
  - A chunk needs the regions and elevation tiles that its cells touch (a chunk on a region border needs both). Building a chunk whose inputs are present yields a ready chunk. Otherwise it yields a fog chunk (`ready: false`, all cells Grassland, shade 1) and starts the missing fetches.
  - A fog chunk is rebuilt on the next access once its inputs are present, so the renderer, which reads chunks every frame, shows terrain on the frame after data lands.
  - `prefetch(left, top, cols, rows, budgetMs)` grows the view by one chunk on every side plus `REAL.lookahead = 100` cells (300 m at the default scale), starts fetches for every region and tile it touches that is missing and not in flight (never more than `REAL.maxInFlight = 4` at once; fetches due for retry are started when their time comes), then builds missing ready chunks nearest the centre first until the budget is spent, exactly like the generated world. Regions load strictly nearest first: only the nearest region the last prefetch found missing may start a fetch, whoever asks for it, and only one region fetch runs at a time. An input already on disk loads at once, outside the fetch slots and that order, so cached areas draw while a slow fetch is still running.
  - `status()` returns `{ loading, offline, busy }`: fetches in flight, and, while any fetch has failed and waits for its retry, whether the latest failure was a lost connection (`offline`) or a server problem (`busy`).
- Elevation tiles and regions arrive independently; chunk readiness waits for both.

## 7. Options and command line

```
node src/main.ts [--seed N] [--place TEXT | --at LAT,LON] [--scale METRES]
```

- `--place TEXT` resolves through Nominatim; the first result's coordinates and display name are used. No result → exit 2 with `place not found: TEXT`. A network failure while resolving → exit 2 with the error.
- `--at LAT,LON` takes two numbers, latitude in −85…85, longitude in −180…180; otherwise exit 2 with `--at must look like 50.088,14.414`. The place name is then the coordinates.
- Both given → exit 2 with `use --place or --at, not both`.
- `--scale METRES` is a positive number, default 3; otherwise exit 2 with `--scale must be a positive number of metres`.
- `--bench` ignores `--place`, `--at` and `--scale`.
- `Options` gains `place: string | null`, `at: { lat, lon } | null`, `scale: number`.
- `Game` takes the world to play in: `GameOptions.world?: ChunkSource` and `GameOptions.place?: { name: string; projection: Projection }`. With a real world you start at cell (0, 0). Each frame the game passes the renderer a `Hud` of `{ fps, place: { name, projection, loading, offline } | null }`.

## 8. Modules

| Unit | Job | Depends on |
|---|---|---|
| `geo.ts` (new) | `class Projection { constructor(lat0, lon0, scale); toLatLon(x, y); toWorld(lat, lon) }`; `mercator(lat, lon, z)`, `unmercator(px, py, z)`, `tileBounds(z, tx, ty)`, `tileKey(z, tx, ty)`. Pure. | nothing |
| `png.ts` (new) | `decodePng(bytes): { width, height, channels, data }` for 8-bit greyscale, RGB and RGBA. Pure. | `node:zlib` |
| `osm.ts` (new) | `overpassQuery(bounds)`; `parseFeatures(json): Feature[]`; `rasterise(features, projection, cellRect): CoverRaster`; the `Cover` codes and widths. Pure. | geo, config |
| `net.ts` (new) | `class Net { constructor(cacheDir, fetcher?, now?); get(url, cacheFile, init?): Promise<Uint8Array>; inFlight }` and `defaultCacheDir()`. The only module that touches the network and the cache directory. The fetcher is injectable for tests. | `node:fs`, `node:path`, `node:os` |
| `place.ts` (new) | `resolvePlace(text, net): Promise<{ lat, lon, name }>` through Nominatim, cached. | net |
| `realworld.ts` (new) | `class RealWorld implements ChunkSource`: regions, tiles, retries, chunk assembly, `status()`. | geo, png, osm, net, world, config |
| `world.ts` | `ChunkSource`, `Chunk.ready` | — |
| `config.ts` | the five biomes, `GENERATED_BIOMES`, `REAL = { scale, elevationZoom, regionZoom, lookahead, maxInFlight, retryMs, relief, userAgent, terrariumUrl, overpassUrl, nominatimUrl, roadWidths, snowline… }`, `COLORS.fogFg`, `COLORS.fogBg` | — |
| `render.ts` | fog for unready chunks; status bar with latitude, longitude, place, attribution, loading and offline | world (`ChunkSource`) |
| `game.ts` | `--place`, `--at`, `--scale`; `GameOptions.world` and `place`; start cell (0, 0); `Hud.place` | realworld (type only), geo |
| `main.ts` | resolves the place, builds `RealWorld` with `Net`, starts the game | place, net, realworld |

Fetching is the only asynchronous part. `RealWorld` keeps every promise internal and exposes the synchronous `ChunkSource` surface, so the game loop, renderer and tests stay synchronous.

## 9. Testing

Tests use `node:test`, run offline, and never touch the real network or the real cache directory (tests pass a temporary directory and a fake fetcher).

| File | Checks |
|---|---|
| `geo.test.ts` | Projection round trip; 1 unit east is `scale` metres at the origin's latitude; Mercator and tile maths against known values (Prague's centre at zoom 13 is tile 4424, 2775); `tileBounds` contains the tile's centre. |
| `png.test.ts` | A PNG built in the test with `node:zlib` using every filter type decodes to the original pixels, for RGB and RGBA; a 16-bit PNG is rejected with a clear error. |
| `osm.test.ts` | The query names every tag family; a closed way becomes a polygon and an open one a line; a relation's outer and inner members fill with a hole; cover priority (a road paints over grass, water over a road, a bridge over water); road widths by class; river flow is painted around a waterway; a building inside residential land is Building, the land around it Town. |
| `net.test.ts` | A cached file is returned without calling the fetcher; a fetch writes the cache; a non-2xx response throws; `inFlight` rises and falls. |
| `place.test.ts` | A fake Nominatim reply resolves to coordinates and a name; an empty reply throws `place not found`. |
| `realworld.test.ts` | With a fake fetcher serving a synthetic tile (a sloped plane with a dip below sea level) and a synthetic region (a river polygon, a forest, a road), the first chunk is fog and starts the fetches; after the promises settle the same chunk is ready with River, Forest, Road and Grassland where expected, sea in the dip, shore flags on it, and slopes shaded; a failing fetcher sets `offline`, retries at 5 s, 15 s and 60 s with a fake clock, and recovers; `prefetch` starts no more than four fetches at once; a chunk on a region border needs both regions. |
| `render.test.ts` | A fog chunk draws fog with no drops; the real-world status bar shows latitude, longitude, the place name, `© OpenStreetMap`, and `loading` or `offline` when set. |
| `game.test.ts` | `--place`, `--at` and `--scale` parse and validate, with the three error messages; a game with a `world` option starts on cell (0, 0); the weather seed derives from the coordinates. |
| `world.test.ts` | The "every biome appears" test covers the first `GENERATED_BIOMES` biomes only. |
| `bench.test.ts` | unchanged |

## 10. Performance

- Rasterising a region (about 512 × 256 cells at the default scale) takes under 100 ms; it runs once per region, when its data arrives, inside the prefetch budget.
- Building a chunk from rasters and tiles costs about the same as generating one today.
- The frame cost is unchanged: the renderer reads chunks exactly as before. Bench targets of the base spec §7 stay in force on the generated world.
- A region's Overpass response in a dense city centre is a few megabytes; the zoom-14 region size keeps each query within Overpass's limits and the download under a few seconds.

## 11. Out of scope

- Coastline tracing: the sea is where elevation is below zero; a tidal estuary may read as land.
- Real time of day or real weather.
- Other players, names on the map, labels.
- Changing the scale while playing.

## 12. Risks

| Risk | Handling |
|---|---|
| Overpass is slow, rate-limits, or refuses a query | Small regions, 180 s query timeout, retries with backoff, fog meanwhile, `offline` in the status bar; everything cached once it arrives. |
| Terrarium's 30 m source looks smooth at 3 m | Accepted; `--scale 12` gives the map-like look of the spike. |
| The flat projection drifts far from the origin | A few percent at 200 km; restart with a new `--at` for a new area. |
| A place name resolves somewhere unexpected | The status bar shows the resolved name and coordinates; `--at` pins the exact spot. |
| Licence | OpenStreetMap data is ODbL: the status bar and README carry the attribution. Terrarium tiles are open data from Mapzen and Nextzen on AWS, credited in the README. |
