// The game without the terminal: options, the creature's life, input → actions, one step and one frame at a time.
import { Buffer } from 'node:buffer';
import { parseArgs } from 'node:util';
import { AI, BIOMES, BIOME_NAMES, BOND, COLORS, EYE_GLOW, FRAME_DT } from './config.ts';
import type { BiomeName } from './config.ts';
import { Brain, dry, headOf, newBody } from './brain.ts';
import type { Body, Ctx, DoName, Gaze, VoiceKind } from './brain.ts';
import {
  addDiary,
  ageDays,
  clamp01,
  drain,
  duration,
  isNightFor,
  moodEyes,
  moodOf,
  newLife,
  prettyName,
  remember,
  traitWords,
  warm,
} from './creature.ts';
import type { Feelings, Life, Mood } from './creature.ts';
import { Frame } from './frame.ts';
import type { InputEvent } from './input.ts';
import { situationText } from './mind.ts';
import type { Mind, Reply, Situation } from './mind.ts';
import { rng } from './noise.ts';
import { Renderer } from './render.ts';
import type { Segment, View } from './render.ts';
import type { Away } from './save.ts';
import { Geometry, Scene } from './scene.ts';
import { diffFrames } from './screen.ts';
import { flashAt, localHour, skyAt, weatherAt } from './sky.ts';
import type { Sky } from './sky.ts';
import { fill, line, localReply, moonWords, nextQuestion } from './speech.ts';
import type { LocalReply, Question, Topic, Vars } from './speech.ts';

// ── Options ────────────────────────────────────────────────────────────────

export type Options = {
  /** For a new creature; null for a random one. */
  readonly seed: number | null;
  readonly biome: BiomeName | null;
  readonly name: string | null;
  /** How much faster than real time the world runs. */
  readonly speed: number;
  /** Start at this hour of today instead of now. */
  readonly hour: number | null;
  readonly offline: boolean;
  readonly save: string | null;
  /** Start over with a new creature. */
  readonly fresh: boolean;
  readonly bell: boolean;
  readonly bench: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly frames: number;
};

export function parseOptions(argv: readonly string[]): Options {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      seed: { type: 'string' },
      biome: { type: 'string' },
      name: { type: 'string' },
      speed: { type: 'string', default: '1' },
      hour: { type: 'string' },
      offline: { type: 'boolean', default: false },
      save: { type: 'string' },
      new: { type: 'boolean', default: false },
      bell: { type: 'boolean', default: false },
      bench: { type: 'boolean', default: false },
      size: { type: 'string', default: '160x48' },
      frames: { type: 'string', default: '300' },
    },
  });
  const size = /^(\d+)x(\d+)$/.exec(values.size);
  if (size === null || Number(size[1]) < 1 || Number(size[2]) < 1) throw new Error(`--size must look like 160x48, not "${values.size}"`);
  const frames = Number(values.frames);
  if (!Number.isInteger(frames) || frames < 1) throw new Error(`--frames must be a positive whole number, not "${values.frames}"`);
  const speed = Number(values.speed);
  if (!Number.isFinite(speed) || speed <= 0 || speed > 100000) throw new Error(`--speed must be a positive number, not "${values.speed}"`);
  let hour: number | null = null;
  if (values.hour !== undefined) {
    hour = Number(values.hour);
    if (!Number.isFinite(hour) || hour < 0 || hour >= 24) throw new Error(`--hour must be between 0 and 24, not "${values.hour}"`);
  }
  let biome: BiomeName | null = null;
  if (values.biome !== undefined) {
    const b = values.biome.toLowerCase();
    if (!(BIOME_NAMES as readonly string[]).includes(b)) throw new Error(`--biome must be one of ${BIOME_NAMES.join(', ')}, not "${values.biome}"`);
    biome = b as BiomeName;
  }
  const name = values.name === undefined ? null : prettyName(values.name);
  if (name === '') throw new Error('--name needs letters');
  return {
    seed: values.seed === undefined ? null : seedFrom(values.seed),
    biome,
    name,
    speed,
    hour,
    offline: values.offline,
    save: values.save ?? null,
    fresh: values.new,
    bell: values.bell,
    bench: values.bench,
    cols: Number(size[1]),
    rows: Number(size[2]),
    frames,
  };
}

/** A whole number is used as is; any other text is hashed (FNV-1a), so `--seed hello` works too. */
export function seedFrom(text: string): number {
  if (/^\d+$/.test(text)) return Number(text) % 4294967296;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296);
}

/** Today at `hour`, local time. */
export function todayAt(hour: number, now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d.getTime();
}

// ── The game ───────────────────────────────────────────────────────────────

export type GameSetup = {
  readonly cols: number;
  readonly rows: number;
  /** World time at the start, epoch ms. */
  readonly now: number;
  readonly speed?: number;
  readonly mind?: Mind | null;
  readonly random?: () => number;
  /** What happened while you were away; null for a creature that was just born. */
  readonly away?: Away | null;
  /** Your login name, which it uses until it knows better. */
  readonly login?: string;
  readonly bell?: boolean;
  /** Play the first meeting. */
  readonly firstMeeting?: boolean;
  /** Not saved (a demo with --speed or --hour). */
  readonly ephemeral?: boolean;
};

export type Mode = 'live' | 'talk' | 'name' | 'journal';

/** Activities that the world (food landing, rain starting) does not interrupt. */
const ENGAGED: ReadonlySet<DoName> = new Set<DoName>([
  'eat', 'chase', 'visit', 'gift', 'ask', 'listen', 'petted', 'woken', 'arrive', 'return', 'greet', 'knock', 'startle', 'wander', 'sleep',
]);

const GAZE_EYES: Readonly<Record<Gaze, string>> = { center: '• •', left: '•• ', right: ' ••', up: '° °', down: '. .' };

const DOING: Readonly<Record<string, string>> = {
  idle: 'standing around, looking about',
  stroll: 'strolling',
  sit: 'sitting',
  nap: 'napping',
  sleep: 'asleep at home',
  forage: 'foraging',
  eat: 'eating',
  drink: 'drinking',
  chase: 'chasing the glowing toy they threw',
  critter: 'chasing a little creature',
  play: 'playing by yourself',
  stargaze: 'stargazing',
  shelter: 'sheltering at home',
  dance: 'dancing in the weather',
  ponder: 'pondering',
  dig: 'digging',
  hum: 'humming',
  stack: 'stacking stones on your cairn',
  visit: 'at the glass, looking at them',
  knock: 'tapping on the glass',
  gift: 'holding out a gift',
  ask: 'asking them something',
  hide: 'hiding',
  wander: 'wandering beyond the edge of your world',
  listen: 'at the glass, listening to them',
  greet: 'at the glass',
};

const READ_SEC_PER_WORD = 0.38;
const HINTS = ' F feed  P play  E pet  T talk  J journal  H hide  Q quit';

export class Game implements Ctx {
  readonly life: Life;
  readonly body: Body;
  readonly scene: Scene;
  readonly brain: Brain;
  readonly mind: Mind | null;
  readonly feelings: Feelings = { joy: 0, fright: 0, annoyance: 0 };
  readonly ephemeral: boolean;
  geo: Geometry;
  sky: Sky;
  mood: Mood;
  mode: Mode = 'live';
  showHud = true;
  quitRequested = false;
  /** Set when it wants the terminal bell rung; the loop clears it. */
  bellRequested = false;
  private cols: number;
  private rows: number;
  private worldMs: number;
  private real = 0;
  private readonly speed: number;
  private readonly rand: () => number;
  private readonly login: string;
  private readonly allowBell: boolean;
  private readonly away: Away | null;
  private bubbleState: { text: string; until: number } | null = null;
  private pending = 0;
  private lastInput = 0;
  private hasFocus = true;
  private blurredAt = -1;
  private mouse: { col: number; row: number; at: number } | null = null;
  private typed = '';
  private offerItem: string | null = null;
  private offerTaken = false;
  private question: Question | null = null;
  private answered = false;
  private kindTimes: number[] = [];
  private notice: { text: string; until: number } | null = null;
  private heard: { text: string; until: number } | null = null;
  private greetTopic: Topic = 'backSoon';
  private greetMoment = 'They are here with you. Greet them.';
  private pointedAt: { x: number; z: number } | null = null;
  private wasFlash = false;
  private wasWet: boolean;
  private landed = 0;
  private readonly renderer: Renderer;
  private frames: [Frame, Frame];
  private previous: Frame | null = null;

  constructor(life: Life, setup: GameSetup) {
    this.life = life;
    this.speed = setup.speed ?? 1;
    this.worldMs = setup.now;
    this.rand = setup.random ?? rng((life.seed ^ Math.floor(setup.now / 1000)) >>> 0);
    this.mind = setup.mind ?? null;
    this.login = prettyName(setup.login ?? '') || 'friend';
    this.allowBell = setup.bell ?? false;
    this.ephemeral = setup.ephemeral ?? false;
    this.away = setup.away ?? null;
    this.cols = setup.cols;
    this.rows = setup.rows;
    this.scene = new Scene(life.seed, life.biome, this.rand);
    this.geo = new Geometry(setup.cols, this.sceneRows());
    this.sky = skyAt(this.worldMs, life.seed, life.biome);
    this.wasWet = this.sky.weather.precip > 0.25;
    this.mood = moodOf(life.needs, this.feelings, life.traits, life.asleep);
    const start = dry({ scene: this.scene, geo: this.geo }, 0.3 + this.rand() * 0.4, 0.55 + this.rand() * 0.3);
    this.body = newBody(start.x, start.z);
    this.brain = new Brain(this);
    this.renderer = new Renderer(life.seed);
    this.frames = [new Frame(setup.cols, setup.rows), new Frame(setup.cols, setup.rows)];
    life.stats.visits++;
    this.begin(setup.firstMeeting ?? false);
  }

  private begin(first: boolean): void {
    const life = this.life;
    if (first) {
      this.brain.run('arrive');
      return;
    }
    if (life.away) {
      life.away = false;
      this.greetTopic = 'backDays';
      this.greetMoment = `They came back after ${duration(this.away?.ms ?? 0)} away. You had gone wandering, lonely, and you walk back in now. Greet them.`;
      this.brain.run('return');
      return;
    }
    if (life.asleep) {
      const door = this.geo.door(this.scene.layout.home);
      this.body.x = door.x;
      this.body.z = door.z;
      this.body.inside = true;
      this.brain.run('sleep');
      return;
    }
    const ms = this.away?.ms ?? 0;
    const hour = this.sky.hour;
    if (ms > 2 * 86400000) this.greetTopic = 'backDays';
    else if (ms > 3600000) this.greetTopic = 'backHours';
    else if (hour < 4.5) this.greetTopic = 'lateNight';
    else if (hour >= 5 && hour < 10 && ms > 4 * 3600000) this.greetTopic = 'morning';
    else this.greetTopic = 'backSoon';
    this.greetMoment = ms > 60000 ? `They just came back after being away for ${duration(ms)}. Greet them.` : 'They opened your window again. Greet them.';
    this.brain.run('greet');
  }

  // ── Ctx ──────────────────────────────────────────────────────────────────

  random(): number {
    return this.rand();
  }

  now(): number {
    return this.worldMs;
  }

  idleSec(): number {
    return this.real - this.lastInput;
  }

  focused(): boolean {
    return this.hasFocus;
  }

  talking(): boolean {
    return this.mode === 'talk' || this.mode === 'name';
  }

  say(topic: Topic, extra?: Vars): void {
    this.sayText(line(topic, this.vars(extra), this.rand));
  }

  sayText(text: string): void {
    const words = text.split(/\s+/).length;
    this.bubbleState = { text, until: this.real + Math.min(10, Math.max(2.5, 1.5 + words * READ_SEC_PER_WORD)) };
  }

  voice(kind: VoiceKind, fallback: Topic, extra?: Vars): void {
    const topic = kind === 'greet' ? this.greetTopic : fallback;
    const mind = this.liveMind();
    const may = mind !== null && (kind === 'greet' ? !mind.busy : mind.mayVolunteer(this.real));
    if (mind === null || !may) {
      this.say(topic, extra);
      return;
    }
    this.request(mind, this.momentFor(kind, this.vars(extra)), true, () => this.say(topic, extra));
  }

  speaking(): boolean {
    return this.bubbleState !== null || this.pending > 0;
  }

  diary(text: string): void {
    addDiary(this.life, this.worldMs, text);
  }

  offer(item: string): void {
    this.offerItem = item;
    this.offerTaken = false;
  }

  offerState(): 'none' | 'waiting' | 'taken' {
    if (this.offerItem === null) return 'none';
    return this.offerTaken ? 'taken' : 'waiting';
  }

  endOffer(): void {
    this.offerItem = null;
    this.offerTaken = false;
  }

  ask(): boolean {
    const q = nextQuestion(this.life.asked, this.rand);
    if (q === null) return false;
    this.question = q;
    this.answered = false;
    if (!this.life.asked.includes(q.id)) this.life.asked.push(q.id);
    this.bubbleState = { text: `${q.text} (y/n)`, until: this.real + 30 };
    return true;
  }

  questionState(): 'none' | 'waiting' | 'answered' {
    if (this.question === null) return 'none';
    return this.answered ? 'answered' : 'waiting';
  }

  endQuestion(): void {
    if (this.question !== null && !this.answered) this.bubbleState = null;
    this.question = null;
  }

  askName(): void {
    this.say('askName');
    this.mode = 'name';
    this.typed = '';
  }

  pointed(): { x: number; z: number } | null {
    return this.pointedAt;
  }

  bell(): void {
    if (this.allowBell && !this.hasFocus) this.bellRequested = true;
  }

  // ── Time ─────────────────────────────────────────────────────────────────

  /** One fixed step of `dt` real seconds. */
  update(dt: number): void {
    this.real += dt;
    const worldDt = dt * this.speed;
    this.worldMs += worldDt * 1000;
    this.fit();
    const life = this.life;
    this.sky = skyAt(this.worldMs, life.seed, life.biome);
    drain(life.needs, worldDt, life.asleep);
    const f = this.feelings;
    f.joy *= Math.exp(-dt / 90);
    f.fright *= Math.exp(-dt / 8);
    f.annoyance *= Math.exp(-dt / 40);
    this.mood = moodOf(life.needs, f, life.traits, life.asleep);
    this.watchWorld();
    this.brain.update(dt);
    const lantern = this.body.visible && !this.body.inside && this.sky.daylight < 0.35
      ? { col: this.geo.col(this.body.x) + this.body.facing * 3, row: this.geo.footRow(this.body.z) - 2 }
      : null;
    this.scene.update(dt, this.geo, this.sky, lantern);
    if (this.bubbleState !== null && this.real > this.bubbleState.until) this.bubbleState = null;
    if (this.notice !== null && this.real > this.notice.until) this.notice = null;
    if (this.heard !== null && this.real > this.heard.until) this.heard = null;
  }

  /** Reacts to the world: food landing, rain starting, lightning. */
  private watchWorld(): void {
    const awake = !this.life.asleep && this.body.visible;
    const engaged = this.brain.current !== null && ENGAGED.has(this.brain.current);
    const landed = this.scene.foods.filter((f) => f.h === 0 && f.vh === 0).length;
    if (landed > this.landed && awake && !engaged) this.brain.interrupt();
    this.landed = landed;
    const wet = this.sky.weather.precip > 0.25;
    if (wet && !this.wasWet && awake && !engaged) this.brain.interrupt();
    this.wasWet = wet;
    const flash = flashAt(this.real, this.life.seed, this.sky.weather);
    if (flash && !this.wasFlash && awake && !this.body.inside) {
      this.feelings.fright = clamp01(this.feelings.fright + 0.25 + 0.5 * this.life.traits.shy);
      if (!engaged) this.brain.run('startle');
    }
    this.wasFlash = flash;
  }

  // ── Input ────────────────────────────────────────────────────────────────

  handle(e: InputEvent): void {
    if (e.type === 'focus') {
      this.focusChange(e.on);
      return;
    }
    this.lastInput = this.real;
    if (e.type === 'mouse') {
      this.mouseEvent(e.col, e.row, e.button, e.action);
      return;
    }
    if (e.type === 'key' && e.key === 'ctrl-c') {
      this.quitRequested = true;
      return;
    }
    if (this.mode === 'talk' || this.mode === 'name') {
      this.typing(e);
      return;
    }
    if (this.mode === 'journal') {
      if (e.type === 'key' || ['j', 'q', ' '].includes(e.ch.toLowerCase())) this.mode = 'live';
      return;
    }
    if (e.type === 'key') {
      if (e.key === 'escape') this.quitRequested = true;
      else if (e.key === 'enter') this.startTalk();
      return;
    }
    switch (e.ch.toLowerCase()) {
      case 'q':
        this.quitRequested = true;
        break;
      case 'f':
        this.feed();
        break;
      case 'p':
        this.play();
        break;
      case 'e':
      case ' ':
        this.pet();
        break;
      case 't':
        this.startTalk();
        break;
      case 'j':
        this.mode = 'journal';
        break;
      case 'h':
        this.showHud = !this.showHud;
        break;
      case 'y':
        this.answer(true);
        break;
      case 'n':
        this.answer(false);
        break;
    }
  }

  private typing(e: InputEvent): void {
    if (e.type === 'char') {
      if (Array.from(this.typed).length < 200) this.typed += e.ch;
      return;
    }
    if (e.type !== 'key') return;
    switch (e.key) {
      case 'enter':
        if (this.mode === 'name') this.submitName(this.typed);
        else this.submitTalk(this.typed);
        this.typed = '';
        break;
      case 'escape':
        if (this.mode === 'name') this.submitName('');
        this.mode = 'live';
        this.typed = '';
        break;
      case 'backspace':
        this.typed = Array.from(this.typed).slice(0, -1).join('');
        break;
      case 'ctrl-u':
        this.typed = '';
        break;
      case 'ctrl-w':
        this.typed = this.typed.replace(/\s*\S+\s*$/u, '');
        break;
    }
  }

  private focusChange(on: boolean): void {
    if (!on) {
      this.hasFocus = false;
      this.blurredAt = this.real;
      return;
    }
    const gone = this.real - this.blurredAt;
    this.hasFocus = true;
    this.lastInput = this.real;
    const engaged = this.brain.current !== null && ENGAGED.has(this.brain.current);
    if (this.blurredAt >= 0 && gone > 120 && !this.life.asleep && this.body.visible && !engaged && this.mode === 'live') {
      this.greetTopic = 'focusBack';
      this.greetMoment = `They looked back at your window after ${duration(gone * 1000)}. Greet them.`;
      this.brain.run('greet');
    }
  }

  private mouseEvent(col: number, row: number, button: number, action: 'press' | 'release' | 'move'): void {
    this.mouse = { col, row, at: this.real };
    if (action !== 'press' || button !== 0) return;
    if (this.mode === 'journal') {
      this.mode = 'live';
      return;
    }
    if (this.mode !== 'live') return;
    if (this.hitsCreature(col, row)) {
      this.pet();
      return;
    }
    const engaged = this.brain.current !== null && ENGAGED.has(this.brain.current);
    if (row >= this.geo.horizon && row < this.geo.rows && this.body.visible && !this.life.asleep && !engaged) {
      this.pointedAt = { x: this.geo.x(col), z: this.geo.depthOf(row) };
      this.scene.emit({ glyph: '*', color: COLORS.spark, col, row, vc: 0, vr: -1, life: 0.6, glow: true });
      if (this.rand() < 0.4 + 0.6 * this.life.bond) this.brain.run('go');
      else this.body.gaze = col < this.geo.col(this.body.x) ? 'left' : 'right';
    }
  }

  private hitsCreature(col: number, row: number): boolean {
    const b = this.body;
    if (!b.visible) return false;
    if (b.inside) {
      const door = this.geo.door(this.scene.layout.home);
      return Math.abs(col - this.geo.col(door.x)) <= 2 && Math.abs(row - (this.geo.footRow(door.z) - 1)) <= 1;
    }
    const foot = this.geo.footRow(b.z) - Math.round(b.lift);
    return Math.abs(col - this.geo.col(b.x)) <= 3 && row <= foot && row >= foot - 3;
  }

  // ── What you do ──────────────────────────────────────────────────────────

  feed(): void {
    const b = this.body;
    if (!b.visible) {
      this.say1(`${this.life.name} is away, wandering.`);
      return;
    }
    let x = b.x + (this.rand() - 0.5) * 0.25;
    let z = Math.max(0.3, Math.min(1, b.z + (this.rand() - 0.5) * 0.3));
    if (b.inside) {
      const door = this.geo.door(this.scene.layout.home);
      x = door.x + (this.rand() - 0.5) * 0.1;
      z = Math.min(1, door.z + 0.2);
    }
    this.scene.dropFood(Math.max(0.05, Math.min(0.95, x)), z);
  }

  play(): void {
    if (!this.body.visible) {
      this.say1(`${this.life.name} is away, wandering.`);
      return;
    }
    this.scene.throwToy(this.body.x > 0.5);
    const engaged = this.brain.current !== null && ENGAGED.has(this.brain.current);
    if (!this.life.asleep && !engaged) this.brain.interrupt();
  }

  pet(): void {
    const life = this.life;
    if (this.offerItem !== null && !this.offerTaken) {
      this.takeGift(this.offerItem);
      return;
    }
    if (!this.body.visible) {
      this.say1(`Nobody's here. ${life.name} went wandering.`);
      return;
    }
    if (life.asleep) {
      this.brain.run('woken');
      return;
    }
    this.kindTimes = this.kindTimes.filter((t) => this.real - t < 60);
    this.kindTimes.push(this.real);
    if (this.kindTimes.length > BOND.perMinute) {
      this.feelings.annoyance = clamp01(this.feelings.annoyance + 0.3);
    } else {
      life.needs.love = clamp01(life.needs.love + 0.08);
      this.feelings.joy = clamp01(this.feelings.joy + 0.25);
      warm(life);
      life.stats.petted++;
    }
    this.brain.run('petted');
  }

  private takeGift(item: string): void {
    const life = this.life;
    this.offerTaken = true;
    const i = life.found.lastIndexOf(item);
    if (i >= 0) life.found.splice(i, 1);
    life.shelf.push({ t: this.worldMs, item });
    life.stats.gifts++;
    life.needs.love = clamp01(life.needs.love + 0.1);
    this.feelings.joy = clamp01(this.feelings.joy + 0.4);
    warm(life, 2);
    this.say('giftTaken');
    this.diary(`Gave ${this.userName()} ${item}.`);
  }

  startTalk(): void {
    this.mode = 'talk';
    this.typed = '';
    const current = this.brain.current;
    if (!this.life.asleep && this.body.visible && current !== 'gift' && current !== 'ask' && current !== 'arrive') this.brain.run('listen');
  }

  private submitTalk(text: string): void {
    this.mode = 'live';
    const said = text.trim();
    if (said === '') return;
    const life = this.life;
    this.heard = { text: said, until: this.real + 8 };
    life.stats.talks++;
    life.needs.love = clamp01(life.needs.love + 0.05);
    warm(life);
    if (!this.body.visible) {
      this.say1(`${life.name} is away and cannot hear you.`);
      return;
    }
    if (life.asleep) {
      this.brain.run('woken');
      return;
    }
    const local = localReply(said, this.vars(), this.replyContext(), this.rand);
    if (local.userName !== null) this.learnName(local.userName, false);
    const mind = this.liveMind();
    if (mind !== null) this.request(mind, `They type to you: "${said.slice(0, 300)}"`, false, () => this.applyLocal(local));
    else this.applyLocal(local);
  }

  private submitName(text: string): void {
    this.mode = 'live';
    const said = text.trim();
    if (said === '') {
      this.learnName(this.login, true);
      this.say('noName');
      return;
    }
    const local = localReply(said, this.vars(), this.replyContext(), this.rand);
    const words = said.split(/\s+/);
    this.learnName(local.userName ?? (words.length <= 2 ? said : words[0]), true);
    const mind = this.liveMind();
    const moment = `You have just met them for the first time and asked what to call them. They answered: "${said.slice(0, 100)}". Greet them by that name, and set "remember" to "name: <the name>".`;
    if (mind !== null) this.request(mind, moment, false, () => this.say('nameLearned'));
    else this.say('nameLearned');
  }

  private learnName(name: string, met: boolean): void {
    const clean = prettyName(name) || this.login;
    if (this.life.userName === clean) return;
    this.life.userName = clean;
    this.diary(met ? `Met ${clean}.` : `Learned to call them ${clean}.`);
  }

  private applyLocal(local: LocalReply): void {
    this.sayText(local.say);
    if (local.do !== null) this.wish(local.do);
  }

  private wish(name: string): void {
    const night = isNightFor(this.life.traits, this.sky.hour);
    const act = name === 'sleep' && !night ? 'nap' : name;
    if (['stroll', 'sit', 'nap', 'sleep', 'play', 'dance', 'dig', 'hum', 'stargaze', 'ponder', 'visit', 'hide', 'stack', 'wave', 'jump', 'spin', 'wander'].includes(act)) {
      this.brain.later(act as DoName);
    }
  }

  private answer(yes: boolean): void {
    const q = this.question;
    if (q === null || this.answered) return;
    this.answered = true;
    const life = this.life;
    remember(life, fill(yes ? q.yes : q.no, { date: new Date(this.worldMs).toISOString().slice(0, 10) }));
    life.needs.love = clamp01(life.needs.love + 0.04);
    this.feelings.joy = clamp01(this.feelings.joy + 0.1);
    warm(life);
    if (q.id === 'happy') this.sayText(yes ? 'Good. Me too, now.' : "Oh... I'll stay close, then.");
    else this.say(yes ? 'yes' : 'no');
  }

  /** A short message in the hint row. */
  private say1(text: string): void {
    this.notice = { text, until: this.real + 4 };
  }

  // ── Claude ───────────────────────────────────────────────────────────────

  private liveMind(): Mind | null {
    return this.mind !== null && !this.mind.disabled ? this.mind : null;
  }

  private request(mind: Mind, moment: string, volunteered: boolean, fallback: () => void): void {
    this.pending++;
    const situation = situationText(this.situation(moment));
    void mind.ask(this.life, situation, volunteered, this.real).then((reply) => {
      this.pending--;
      if (reply === null) fallback();
      else this.applyReply(reply);
    });
  }

  private applyReply(reply: Reply): void {
    if (reply.say !== '') this.sayText(reply.say);
    if (reply.remember !== null) {
      const name = /^name:\s*(.+)$/i.exec(reply.remember);
      if (name !== null) this.learnName(name[1], false);
      else remember(this.life, reply.remember);
    }
    if (reply.do !== null) this.wish(reply.do);
  }

  private momentFor(kind: VoiceKind, v: Vars): string {
    switch (kind) {
      case 'greet':
        return this.greetMoment;
      case 'visit':
        return 'You walked up to the glass because you missed them. Say something to them.';
      case 'thought':
        return 'A thought crosses your mind. Say it aloud.';
      case 'stargaze':
        return 'You sit under the night sky, looking up. Say what you see or feel.';
      case 'gift':
        return `You walk up to the glass holding ${v.item ?? 'something'}, which you found, to give it to them. Offer it.`;
      case 'return':
        return `You come back from wandering beyond the edge of your world, carrying ${v.item ?? 'something'}. Tell them about it.`;
      case 'knock':
        return 'They have not looked at you for a long while. You tap on the glass to get their attention.';
    }
  }

  situation(moment: string): Situation {
    const life = this.life;
    const d = new Date(this.worldMs);
    const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return {
      when: `${day}, ${this.clock()} (${this.sky.phase})`,
      weather: `Weather: ${this.sky.weather.name.toLowerCase()}; ${this.sky.season}; the moon is ${moonWords(this.sky.moon)}`,
      mood: this.mood,
      needs: life.needs,
      bond: life.bond,
      ageDays: ageDays(life, this.worldMs),
      doing: DOING[this.brain.current ?? 'idle'] ?? 'standing around',
      userName: life.userName,
      facts: life.facts.slice(-12),
      diary: life.diary.slice(-AI.diaryLines).map((e) => `${this.ago(e.t)}: ${e.text}`),
      moment,
    };
  }

  // ── Words ────────────────────────────────────────────────────────────────

  userName(): string {
    return this.life.userName ?? this.login;
  }

  private clock(): string {
    const h = localHour(this.worldMs);
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  }

  private ago(t: number): string {
    const ms = this.worldMs - t;
    return ms < 60000 ? 'just now' : `${duration(ms)} ago`;
  }

  vars(extra?: Vars): Vars {
    const life = this.life;
    return {
      name: life.name,
      user: this.userName(),
      time: this.clock(),
      weather: this.sky.weather.name.toLowerCase(),
      season: this.sky.season,
      moon: moonWords(this.sky.moon),
      forage: BIOMES[life.biome].forageFood,
      biome: BIOMES[life.biome].title.toLowerCase(),
      away: duration(this.away?.ms ?? 0),
      item: life.found[life.found.length - 1] ?? 'a smooth stone',
      ...extra,
    };
  }

  private replyContext(): Parameters<typeof localReply>[2] {
    const n = this.life.needs;
    return {
      mood: this.mood,
      hungry: n.food < 0.35,
      tired: n.rest < 0.3,
      bored: n.fun < 0.3,
      bond: this.life.bond,
      night: isNightFor(this.life.traits, this.sky.hour),
    };
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.frames = [new Frame(cols, rows), new Frame(cols, rows)];
    this.previous = null;
    this.fit();
  }

  private hudVisible(): boolean {
    return this.showHud || this.mode !== 'live';
  }

  private sceneRows(): number {
    return this.hudVisible() ? Math.max(1, this.rows - 2) : this.rows;
  }

  /** Keeps the geometry in step with the window and the status bar. */
  private fit(): void {
    const rows = this.sceneRows();
    if (this.geo.cols !== this.cols || this.geo.rows !== rows) this.geo = new Geometry(this.cols, rows);
  }

  /** The eyes it shows now: an action's, the mouse's pull, where it looks, or its mood's. */
  eyes(): string {
    const b = this.body;
    if (this.life.asleep) return '- -';
    if (b.eyes !== null) return b.eyes;
    let gaze = this.mouseGaze() ?? b.gaze;
    if (gaze === null && b.pose === 'walk') gaze = b.facing > 0 ? 'right' : 'left';
    return gaze === null ? moodEyes(this.mood) : GAZE_EYES[gaze];
  }

  private mouseGaze(): Gaze | null {
    const m = this.mouse;
    if (m === null || this.real - m.at > 4 || this.body.inside || !this.body.visible) return null;
    const head = headOf(this);
    const dx = m.col - head.col;
    const dy = (m.row - head.row - 1) * 2;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return 'center';
    if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? 'up' : 'down';
    return dx < 0 ? 'left' : 'right';
  }

  private eyeGlow(eyes: string): number {
    if (eyes.includes('♥')) return EYE_GLOW.love;
    if (eyes.includes('╥')) return EYE_GLOW.sad;
    return EYE_GLOW[this.mood] ?? EYE_GLOW.content;
  }

  /** Renders the next frame and returns the escape sequences that put it on screen ('' if nothing changed). */
  draw(): string {
    this.fit();
    const next = this.previous === this.frames[0] ? this.frames[1] : this.frames[0];
    this.renderer.render(next, this.view());
    const out = diffFrames(this.previous, next);
    this.previous = next;
    return out;
  }

  view(): View {
    const eyes = this.eyes();
    let bubble: View['bubble'] = null;
    if (this.bubbleState !== null) bubble = { text: this.bubbleState.text, kind: 'say' };
    else if (this.pending > 0 && !this.life.asleep) bubble = { text: '…', kind: 'think' };
    return {
      geo: this.geo,
      sky: this.sky,
      scene: this.scene,
      life: this.life,
      body: this.body,
      eyes,
      eyeGlow: this.eyeGlow(eyes),
      time: this.real,
      flash: flashAt(this.real, this.life.seed, this.sky.weather),
      bubble,
      hud: this.hudVisible() ? [this.statusBar(), this.hintBar()] : null,
      journal: this.mode === 'journal' ? this.journal() : null,
    };
  }

  private statusBar(): Segment[] {
    const life = this.life;
    const fg = COLORS.hudFg;
    const dim = COLORS.hudDim;
    const bar = (label: string, v: number): Segment => {
      const n = Math.round(clamp01(v) * 5);
      return { text: `${label} ${'■'.repeat(n)}${'·'.repeat(5 - n)} `, color: v < 0.25 ? 0xff8a6a : fg };
    };
    const days = ageDays(life, this.worldMs);
    const age = days === 0 ? 'newborn' : days === 1 ? '1 day' : `${days} days`;
    const mind = this.mind === null ? 'mind: local' : this.mind.disabled ? 'mind: local (no access)' : this.pending > 0 ? 'mind: claude …' : 'mind: claude';
    const weather = this.sky.weather.name.toLowerCase();
    // The least important parts go first when the window is narrow.
    const build = (level: number): Segment[] => [
      { text: ` ${life.name}`, color: COLORS.hudAccent },
      { text: `${level < 4 ? `, ${age}` : ''} · ${this.body.visible ? (life.asleep ? 'asleep' : this.mood) : 'away'}`, color: fg },
      { text: ' │ ', color: dim },
      bar('food', life.needs.food),
      bar('rest', life.needs.rest),
      bar('fun', life.needs.fun),
      bar('love', life.needs.love),
      ...(level < 2 ? [bar('bond', life.bond)] : []),
      { text: '│ ', color: dim },
      { text: level < 3 ? `${this.clock()} ${this.sky.phase}, ${weather}` : `${this.clock()} ${weather}`, color: fg },
      ...(level < 1 ? [{ text: ' │ ', color: dim }, { text: mind + (this.ephemeral ? ' · demo, not saved' : ''), color: dim }] : []),
    ];
    const width = (segments: Segment[]): number => segments.reduce((n, x) => n + Array.from(x.text).length, 0);
    for (let level = 0; level < 4; level++) {
      const segments = build(level);
      if (width(segments) <= this.cols) return segments;
    }
    return build(4);
  }

  private hintBar(): Segment[] {
    const accent = COLORS.hudAccent;
    const dim = COLORS.hudDim;
    if (this.mode === 'talk' || this.mode === 'name') {
      const label = this.mode === 'name' ? ' your name › ' : ' you › ';
      const room = Math.max(4, this.cols - label.length - 28);
      const chars = Array.from(this.typed);
      const shown = chars.length > room ? `…${chars.slice(chars.length - room + 1).join('')}` : this.typed;
      return [
        { text: label, color: accent },
        { text: `${shown}▏`, color: COLORS.hudFg },
        { text: '   Enter send · Esc cancel', color: dim },
      ];
    }
    if (this.mode === 'journal') return [{ text: ' J or Esc to close', color: dim }];
    if (this.notice !== null) return [{ text: ` ${this.notice.text}`, color: accent }];
    if (this.question !== null && !this.answered) return [{ text: ' Y yes   N no', color: accent }, { text: '   (it asked you something)', color: dim }];
    if (this.offerItem !== null && !this.offerTaken) return [{ text: ' E take it', color: accent }, { text: `   (it holds out ${this.offerItem})`, color: dim }];
    if (this.heard !== null) return [{ text: ' you › ', color: dim }, { text: this.heard.text, color: COLORS.hudFg }];
    return [{ text: this.life.asleep && this.body.inside ? HINTS.replace('E pet', 'E wake') : HINTS, color: dim }];
  }

  journal(): string[] {
    const life = this.life;
    const days = ageDays(life, this.worldMs);
    const bond = life.bond < 0.2 ? 'still strangers' : life.bond < 0.4 ? 'getting to know each other' : life.bond < 0.6 ? 'friends' : life.bond < 0.8 ? 'close' : 'inseparable';
    const diary = life.diary.slice(-8).map((e) => `  ${this.ago(e.t)} · ${e.text}`);
    const date = (t: number): string => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const s = life.stats;
    return [
      `${life.name}, of the ${BIOMES[life.biome].title.toLowerCase()}`,
      `${days === 0 ? 'Born today' : `${days} day${days === 1 ? '' : 's'} old`} · ${traitWords(life.traits)}`,
      `Mood: ${life.asleep ? 'asleep' : this.mood}. You are ${bond}.${life.cairn > 0 ? ` Its cairn has ${life.cairn} stone${life.cairn === 1 ? '' : 's'}.` : ''}`,
      '',
      'Diary',
      ...(diary.length > 0 ? diary : ['  Nothing yet.']),
      '',
      'It keeps',
      `  ${life.found.length > 0 ? life.found.join(', ') : 'nothing yet'}`,
      '',
      'It gave you',
      `  ${life.shelf.length > 0 ? life.shelf.slice(-8).map((g) => `${g.item} (${date(g.t)})`).join(', ') : 'nothing yet'}`,
      '',
      `What it knows about ${this.userName()}`,
      `  ${life.facts.length > 0 ? life.facts.slice(-8).join('; ') : 'nothing yet'}`,
      '',
      `Fed ${s.fed} · played ${s.played} · petted ${s.petted} · talked ${s.talks} · visits ${s.visits} · gifts ${s.gifts}`,
      `Its words come from ${this.mind === null || this.mind.disabled ? 'its own small mind' : `Claude (${this.mind.model})`}.`,
    ];
  }

  /** The life as it is now, ready to save. */
  snapshot(): Life {
    this.life.lastSeen = this.worldMs;
    return this.life;
  }
}

// ── The bench ──────────────────────────────────────────────────────────────

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const p95 = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))];

/** A busy scene: a rainy night with the lantern lit, a toy and food in play. Reports build time and output per frame. */
export function runBench(options: Options): string {
  const seed = options.seed ?? 1;
  const biome = options.biome ?? 'forest';
  // The first rainy evening hour from a fixed date, so every run is the same.
  let t = new Date(2026, 9, 8, 21, 0).getTime();
  for (let i = 0; i < 5000; i++) {
    const h = localHour(t);
    if (h >= 21 && h < 23 && weatherAt(t, seed, biome).precip > 0.5) break;
    t += 25 * 60000;
  }
  const life = newLife(seed, t, { biome });
  life.userName = 'Bench';
  life.traits.nightOwl = 1;
  const game = new Game(life, { cols: options.cols, rows: options.rows, now: t, random: rng(seed) });
  game.scene.throwToy(true);
  game.scene.dropFood(0.5, 0.7);
  const times: number[] = [];
  const sizes: number[] = [];
  for (let n = 0; n < options.frames; n++) {
    const t0 = performance.now();
    game.update(FRAME_DT);
    const out = game.draw();
    times.push(performance.now() - t0);
    sizes.push(Buffer.byteLength(out));
  }
  const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
  return [
    `wander bench · seed ${seed} · ${biome} · ${options.cols}×${options.rows} · ${options.frames} frames · ${game.sky.weather.name.toLowerCase()} at ${localHour(t).toFixed(1)}h`,
    `build  mean ${mean(times).toFixed(2)} ms · p95 ${p95(times).toFixed(2)} ms`,
    `output mean ${kb(mean(sizes))} · p95 ${kb(p95(sizes))} · max ${kb(Math.max(...sizes))}`,
  ].join('\n');
}
