import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASPECT, Biome, CHUNK_SIZE, REAL, Water } from '../src/config.ts';
import { Projection, TILE, tileBounds, tileOf, unmercator } from '../src/geo.ts';
import type { LatLon } from '../src/geo.ts';
import { Net } from '../src/net.ts';
import type { FetchInit, Fetcher } from '../src/net.ts';
import { Cover } from '../src/osm.ts';
import { RealWorld, cellTemperature, classifyCell } from '../src/realworld.ts';
import { encodePng } from './support/encode-png.ts';

const ORIGIN: LatLon = { lat: 50, lon: 14.4 };
const SCALE = 3;
const projection = new Projection(ORIGIN.lat, ORIGIN.lon, SCALE);
const at = (col: number, row: number): LatLon => projection.toLatLon(col, row * ASPECT);
const box = (c0: number, r0: number, c1: number, r1: number): LatLon[] => [at(c0, r0), at(c1 + 1, r0), at(c1 + 1, r1 + 1), at(c0, r1 + 1), at(c0, r0)];
const way = (tags: Record<string, string>, geometry: LatLon[]) => ({ type: 'way', tags, geometry });

/** Elevation in metres by place: a plane rising gently eastwards, with a dip below sea level at columns 72..108, rows 15..33. */
function elevationModel(lat: number, lon: number): number {
  const { x, y } = projection.toWorld(lat, lon);
  if (x >= 72 && x <= 108 && y >= 30 && y <= 66) return -10;
  return 300 + x * 0.3;
}

function terrariumTile(z: number, tx: number, ty: number): Uint8Array {
  const pixels = new Uint8Array(TILE * TILE * 3);
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const { lat, lon } = unmercator(tx * TILE + px + 0.5, ty * TILE + py + 0.5, z);
      const v = elevationModel(lat, lon) + 32768;
      const whole = Math.floor(v);
      const i = (py * TILE + px) * 3;
      pixels[i] = Math.floor(whole / 256);
      pixels[i + 1] = whole % 256;
      pixels[i + 2] = Math.round((v - whole) * 256) & 255;
    }
  }
  return encodePng(TILE, TILE, 3, pixels);
}

const region = {
  elements: [
    way({ natural: 'water', water: 'river' }, box(10, 0, 20, 40)),
    way({ waterway: 'river' }, [at(15.5, 0), at(15.5, 41)]),
    way({ landuse: 'forest' }, box(30, 0, 50, 40)),
    way({ highway: 'residential' }, [at(0, 10.5), at(60, 10.5)]),
  ],
};

type Mode = 'ok' | 'fail' | 'hang';
function fakeFetcher(log: { url: string; body: string }[], state: { mode: Mode }): Fetcher {
  return async (url: string, init: FetchInit) => {
    log.push({ url, body: init.body ?? '' });
    if (state.mode === 'hang') return new Promise(() => {});
    if (state.mode === 'fail') return { ok: false, status: 503, bytes: async () => new Uint8Array(0) };
    const tile = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
    if (tile !== null) return { ok: true, status: 200, bytes: async () => terrariumTile(Number(tile[1]), Number(tile[2]), Number(tile[3])) };
    if (url.endsWith('/api/interpreter')) return { ok: true, status: 200, bytes: async () => new TextEncoder().encode(JSON.stringify(region)) };
    return { ok: false, status: 404, bytes: async () => new Uint8Array(0) };
  };
}

const dirs: string[] = [];
function setup(mode: Mode = 'ok') {
  const dir = mkdtempSync(join(tmpdir(), 'wander-real-'));
  dirs.push(dir);
  const log: { url: string; body: string }[] = [];
  const state = { mode };
  const net = new Net(dir, fakeFetcher(log, state));
  const clock = { now: 0 };
  const world = new RealWorld(ORIGIN, SCALE, 1, net, () => clock.now);
  return { dir, log, state, net, clock, world };
}
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** Lets every running fetch finish and its data land. */
async function settle(net: Net): Promise<void> {
  for (let i = 0; i < 200 && net.inFlight > 0; i++) await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('cells classify from cover first, then sea depth, snow, slope and cold', () => {
  assert.equal(classifyCell(Cover.Water, Water.River, 100, 0.5, 0), Biome.River);
  assert.equal(classifyCell(Cover.Water, Water.Lake, 100, 0.5, 0), Biome.Lake);
  assert.equal(classifyCell(Cover.Bridge, Water.None, -3, 0.5, 0), Biome.Road);
  assert.equal(classifyCell(Cover.Building, Water.None, 100, 0.5, 0), Biome.Building);
  assert.equal(classifyCell(Cover.Town, Water.None, 100, 0.5, 0), Biome.Town);
  assert.equal(classifyCell(Cover.Railway, Water.None, 100, 0.5, 0), Biome.Railway);
  assert.equal(classifyCell(Cover.Field, Water.None, 100, 0.5, 0), Biome.Field);
  assert.equal(classifyCell(Cover.Forest, Water.None, 100, 0.5, 0), Biome.Forest);
  assert.equal(classifyCell(Cover.Grass, Water.None, 100, 0.5, 0), Biome.Grassland);
  assert.equal(classifyCell(Cover.None, Water.None, -1, 0.5, 0), Biome.Shallows);
  assert.equal(classifyCell(Cover.None, Water.None, -10, 0.5, 0), Biome.Ocean);
  assert.equal(classifyCell(Cover.None, Water.None, -100, 0.5, 0), Biome.DeepOcean);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.1, 0), Biome.SnowyPeaks);
  assert.equal(classifyCell(Cover.None, Water.None, 3000, 0.5, 0), Biome.SnowyPeaks);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.5, 0.5), Biome.Mountains);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.5, 0.3), Biome.Hills);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.2, 0), Biome.Tundra);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.5, 0), Biome.Grassland);
  assert.ok(cellTemperature(0, 0) > cellTemperature(50, 0) && cellTemperature(50, 0) > cellTemperature(50, 2000));
  assert.ok(cellTemperature(80, 0) < 0.05 && cellTemperature(85, 0) === 0, 'the poles are cold');
});

test('the first chunk is fog and starts the fetches; once the data lands it draws the map', async () => {
  const { net, world, log } = setup();
  const first = world.chunk(0, 0);
  assert.equal(first.ready, false);
  assert.equal(first.biome[0], Biome.Grassland, 'fog chunks read as grassland underfoot');
  assert.ok(net.inFlight > 0 && net.inFlight <= REAL.maxInFlight);
  assert.deepEqual(world.status(), { loading: net.inFlight, offline: false });
  await settle(net);
  assert.equal(net.inFlight, 0);
  assert.ok(log.some((l) => l.url.startsWith(REAL.terrariumUrl)) && log.some((l) => l.url.endsWith('/api/interpreter')));
  const chunk = world.chunk(0, 0);
  assert.equal(chunk.ready, true);
  assert.equal(world.generated, 1);
  assert.equal(world.biomeAt(15, 5), Biome.River);
  assert.ok(Math.abs(world.chunkAt(15, 5).flowY[5 * CHUNK_SIZE + 15] - 1) < 1e-6, 'the river flows south along its mapped centreline');
  assert.equal(world.biomeAt(40, 5), Biome.Forest);
  assert.equal(world.biomeAt(5, 10), Biome.Road);
  assert.equal(world.biomeAt(5, 3), Biome.Grassland);
  assert.ok(Math.abs(world.chunkAt(5, 3).height[3 * CHUNK_SIZE + 5] - (300 + 5.5 * 0.3)) < 0.5, 'elevation comes from the tile');
  assert.ok(world.temperatureAt(5, 3) > 0.3 && world.temperatureAt(5, 3) < 0.4);
  const land = world.chunkAt(5, 3).shade[3 * CHUNK_SIZE + 5];
  assert.ok(land !== 1 && land >= 0.55 && land <= 1.35, `land is shaded: ${land}`);
  assert.equal(world.chunkAt(5, 10).shade[10 * CHUNK_SIZE + 5], 1, 'roads are flat');
});

test('below sea level with no cover is sea, with shore flags where it meets land', async () => {
  const { net, world } = setup();
  world.chunk(1, 0);
  await settle(net);
  const chunk = world.chunk(1, 0);
  assert.equal(chunk.ready, true);
  assert.equal(world.biomeAt(90, 24), Biome.Ocean);
  assert.equal(world.biomeAt(66, 24), Biome.Grassland);
  const sea = new Set<number>([Biome.DeepOcean, Biome.Ocean, Biome.Shallows]);
  let shore = 0;
  for (let o = 0; o < CHUNK_SIZE * CHUNK_SIZE; o++) {
    if (chunk.shore[o] === 1) {
      shore++;
      assert.ok(sea.has(chunk.biome[o]), 'only sea cells are shore');
    }
  }
  assert.ok(shore > 0, 'the dip has a shore');
});

test('a failing fetch sets offline and retries after 5 s, 15 s and 60 s, then recovers', async () => {
  const { net, world, log, state, clock } = setup('fail');
  world.chunk(0, 0);
  await settle(net);
  const n = log.length;
  assert.ok(n > 0);
  assert.equal(world.status().offline, true);
  clock.now = 4999;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, n, 'no retry before 5 s');
  clock.now = 5001;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 2 * n, 'every input is retried after 5 s');
  clock.now = 5001 + 14999;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 2 * n, 'no retry before 15 more seconds');
  clock.now = 5001 + 15001;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 3 * n);
  clock.now += 59999;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 3 * n, 'then every 60 s');
  state.mode = 'ok';
  clock.now += 2;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 4 * n);
  assert.equal(world.chunk(0, 0).ready, true);
  assert.equal(world.status().offline, false);
});

test('a corrupt cached tile is forgotten and fetched again on the retry', async () => {
  const { dir, net, world, log, clock } = setup();
  const { tx, ty } = tileOf(ORIGIN.lat, ORIGIN.lon, REAL.elevationZoom);
  const file = join(dir, 'terrarium', String(REAL.elevationZoom), String(tx), `${ty}.png`);
  mkdirSync(join(dir, 'terrarium', String(REAL.elevationZoom), String(tx)), { recursive: true });
  writeFileSync(file, new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  world.chunk(0, 0);
  await settle(net);
  assert.equal(world.chunk(0, 0).ready, false, 'a tile that cannot be decoded counts as a failed fetch');
  assert.equal(existsSync(file), false, 'the corrupt file is forgotten');
  clock.now = 5001;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(world.chunk(0, 0).ready, true);
  assert.ok(statSync(file).size > 100, 'a fresh tile is cached');
  assert.equal(log.filter((l) => l.url.endsWith(`/${tx}/${ty}.png`)).length, 1);
});

test('prefetch never starts more than four fetches at once, and only one Overpass query among them', async () => {
  const { net, world, log } = setup('hang');
  world.prefetch(-600, -600, 1200, 1200, Infinity);
  assert.equal(net.inFlight, REAL.maxInFlight);
  assert.equal(log.length, REAL.maxInFlight);
  assert.equal(log.filter((l) => l.url.endsWith('/api/interpreter')).length, 1, 'Overpass answers concurrent queries with 504s, so regions load one at a time');
  world.prefetch(-600, -600, 1200, 1200, Infinity);
  assert.equal(log.length, REAL.maxInFlight, 'inputs already loading are not fetched twice');
});

test('a chunk on a region border needs both regions and draws both halves', async () => {
  const { net, world, log } = setup();
  const { tx, ty } = tileOf(ORIGIN.lat, ORIGIN.lon, REAL.regionZoom);
  const edge = projection.toWorld(ORIGIN.lat, tileBounds(REAL.regionZoom, tx, ty).east).x;
  const cx = Math.floor(edge / CHUNK_SIZE);
  // Regions load one at a time, so poll like the game's prefetch does, once per frame.
  for (let i = 0; i < 6 && !world.chunk(cx, 0).ready; i++) await settle(net);
  const bodies = new Set(log.filter((l) => l.url.endsWith('/api/interpreter')).map((l) => l.body));
  assert.ok(bodies.size >= 2 && bodies.size <= 4, `${bodies.size} regions were queried: at least the two either side of the edge`);
  const chunk = world.chunk(cx, 0);
  assert.equal(chunk.ready, true);
  assert.ok(chunk.biome.every((b) => b < 19), 'every cell has a biome');
});

test('each failed Overpass query moves to the next instance', async () => {
  const { net, world, log, state, clock } = setup('fail');
  world.chunk(0, 0);
  await settle(net);
  const first = log.filter((l) => l.url.endsWith('/api/interpreter')).map((l) => l.url);
  assert.deepEqual(first, [REAL.overpassUrls[0]]);
  clock.now = 5001;
  world.chunk(0, 0);
  await settle(net);
  const second = log.filter((l) => l.url.endsWith('/api/interpreter')).map((l) => l.url);
  assert.deepEqual(second, [REAL.overpassUrls[0], REAL.overpassUrls[1]]);
  state.mode = 'ok';
  clock.now = 5001 + 15001;
  for (let i = 0; i < 6 && !world.chunk(0, 0).ready; i++) await settle(net);
  assert.equal(world.chunk(0, 0).ready, true);
});
