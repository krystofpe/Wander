// The creature's life on the page, without the page: the world clock, its needs and moods, the brain, what you do
// (feed, play, pet, talk, answer, take a gift, click), its words (its own, or Claude's through the server), and what
// the page shows (its eyes, the bubble, the bar, the hints, the journal). From the terminal creature (feat/creature
// src/game.ts) as it was, with the terminal taken out: the page draws, listens and types.
import { AI, BIOMES, BOND } from './config.ts';
import type { PlaceName } from './config.ts';
import { Brain, dry, headOf, newBody } from './brain.ts';
import type { Body, Ctx, DoName, Gaze, VoiceKind } from './brain.ts';
import { addDiary, ageDays, clamp01, drain, duration, isNightFor, moodEyes, moodOf, prettyName, remember, traitWords, warm } from './life.ts';
import type { Feelings, Life, Mood } from './life.ts';
import { CREATURE, NEST } from './look.ts';
import type { EyeColour } from './look.ts';
import { situationText } from './mind.ts';
import { cameWhileAway, travellerCame } from './traveller.ts';
import type { Visit } from './visit.ts';
import type { Reply, Situation } from './mind.ts';
import { rng } from '../noise.ts';
import type { Away } from './save.ts';
import { Geometry, Scene } from './scene.ts';
import { localHour, skyAt, weatherWords } from './sky.ts';
import type { Sky, Weather } from './sky.ts';
import { flashAt } from '../sky.ts';
import { fill, line, localReply, moonWords, nextQuestion } from './speech.ts';
import type { LocalReply, Question, Topic, Vars } from './speech.ts';


/** Its words from Claude, through the server; the page's link to it. Null when there is no Claude at all. */
export interface MindLink {
  readonly model: string;
  /** Set when the credentials were refused: it stays local for the session. */
  readonly disabled: boolean;
  /** True while a request is out. */
  readonly busy: boolean;
  /** May it volunteer a line now? `nowSec` is the game's real clock. */
  mayVolunteer(nowSec: number): boolean;
  /** A reply, or null on any failure (the caller falls back to the local voice). */
  ask(life: Life, situation: string, volunteered: boolean, nowSec: number): Promise<Reply | null>;
}

export type GameSetup = {
  readonly geo: Geometry;
  /** World time at the start, epoch ms. */
  readonly now: number;
  readonly speed?: number;
  readonly mind?: MindLink | null;
  readonly random?: () => number;
  /** What happened while you were away; null for a creature that was just born. */
  readonly away?: Away | null;
  /** What to call you until it knows better. */
  readonly login?: string;
  /** Play the first meeting. */
  readonly firstMeeting?: boolean;
  /** Not saved (a look with --speed or --hour). */
  readonly ephemeral?: boolean;
  /** A fixed weather instead of its biome's own (pictures, checks). */
  readonly weather?: Weather | null;
  /** Where its scene is set: the hollow ('deep', the page), or its own biome (the default). */
  readonly place?: PlaceName;
};

export type Mode = 'live' | 'talk' | 'name' | 'journal';

/** A run of text in the bar or the hints: plain, dim, the accent, or a need running low. */
export type Segment = { readonly text: string; readonly tone?: 'dim' | 'accent' | 'low' };

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
  watch: 'watching something tall walk through the light at the end of the path',
  portal: 'gone through your portal to the traveller\'s camp, sitting by his fire',
  listen: 'at the glass, listening to them',
  greet: 'at the glass',
};

const READ_SEC_PER_WORD = 0.38;

/** Its eye colour for a mood (the palette's mood family). */
const MOOD_COLOUR: Readonly<Record<Mood, EyeColour>> = {
  joyful: 'joyful',
  content: 'content',
  calm: 'calm',
  curious: 'curious',
  sleepy: 'sleepy',
  hungry: 'hungry',
  bored: 'bored',
  lonely: 'lonely',
  grumpy: 'grumpy',
  scared: 'scared',
};

export class Game implements Ctx {
  readonly life: Life;
  readonly body: Body;
  readonly scene: Scene;
  readonly brain: Brain;
  readonly mind: MindLink | null;
  readonly feelings: Feelings = { joy: 0, fright: 0, annoyance: 0 };
  readonly ephemeral: boolean;
  geo: Geometry;
  sky: Sky;
  mood: Mood;
  mode: Mode = 'live';
  showHud = true;
  /** Set when it taps on the glass while you are in another window; the page clears it (a sound, the title). */
  knocked = false;
  /** Real seconds since it started. */
  real = 0;
  /** Where its scene is set (see GameSetup.place). */
  readonly place: PlaceName;
  /** Its visit to the traveller's camp tonight, if it is the hour (the page follows his road: src/creature/visit.ts). */
  hisNight: Visit | null = null;
  /** How open its portal is (0 shut … 1 open), and whether it has gone through. */
  portal = 0;
  gone = false;
  private worldMs: number;
  private readonly speed: number;
  private readonly rand: () => number;
  private readonly login: string;
  private readonly away: Away | null;
  private bubbleState: { text: string; until: number } | null = null;
  private pending = 0;
  private lastInput = 0;
  private hasFocus = true;
  private blurredAt = -1;
  private mouse: { x: number; y: number; at: number } | null = null;
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
  private blinkAt = 0;
  private blinkUntil = -1;
  private readonly fixedWeather: Weather | null;

  constructor(life: Life, setup: GameSetup) {
    this.life = life;
    this.speed = setup.speed ?? 1;
    this.worldMs = setup.now;
    this.rand = setup.random ?? rng((life.seed ^ Math.floor(setup.now / 1000)) >>> 0);
    this.mind = setup.mind ?? null;
    this.login = prettyName(setup.login ?? '') || 'friend';
    this.ephemeral = setup.ephemeral ?? false;
    this.away = setup.away ?? null;
    this.geo = setup.geo;
    this.fixedWeather = setup.weather ?? null;
    this.place = setup.place ?? life.biome;
    this.scene = new Scene(life.seed, this.place, this.rand);
    this.sky = this.skyNow();
    this.wasWet = this.sky.weather.precip > 0.25;
    this.mood = moodOf(life.needs, this.feelings, life.traits, life.asleep);
    const start = dry({ scene: this.scene, geo: this.geo }, 0.3 + this.rand() * 0.4, 0.45 + this.rand() * 0.4);
    this.body = newBody(start.x, start.z);
    this.brain = new Brain(this);
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
    // The traveller came by while you were away: it tells you first.
    if (cameWhileAway(life, this.worldMs - ms)) {
      this.greetTopic = 'travellerBack';
      this.greetMoment = 'While they were away you went through your portal to the camp of the traveller in the long coat, the one who walks the endless road, and sat by his fire. Greet them, and tell them.';
    }
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
    this.bubbleState = { text: q.text, until: this.real + 30 };
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
  }

  pointed(): { x: number; z: number } | null {
    return this.pointedAt;
  }

  bell(): void {
    if (!this.hasFocus) this.knocked = true;
  }

  visit(): Visit | null {
    return this.hisNight;
  }

  opening(k: number): void {
    this.portal = Math.max(0, Math.min(1, k));
  }

  through(gone: boolean): void {
    this.gone = gone;
    // Back from his fire: it keeps the visit (how the night went for him).
    if (!gone && this.hisNight !== null) travellerCame(this.life, this.worldMs, this.hisNight.woke ? 'woke' : 'slept');
  }

  // ── Time ─────────────────────────────────────────────────────────────────

  /** One step of `dt` real seconds. */
  update(dt: number): void {
    this.real += dt;
    const worldDt = dt * this.speed;
    this.worldMs += worldDt * 1000;
    const life = this.life;
    this.sky = this.skyNow();
    drain(life.needs, worldDt, life.asleep);
    const f = this.feelings;
    f.joy *= Math.exp(-dt / 90);
    f.fright *= Math.exp(-dt / 8);
    f.annoyance *= Math.exp(-dt / 40);
    this.mood = moodOf(life.needs, f, life.traits, life.asleep);
    this.watchWorld();
    this.brain.update(dt);
    this.scene.update(dt, this.geo, this.sky, this.lantern());
    if (this.bubbleState !== null && this.real > this.bubbleState.until) this.bubbleState = null;
    if (this.notice !== null && this.real > this.notice.until) this.notice = null;
    if (this.heard !== null && this.real > this.heard.until) this.heard = null;
    // Blinks: now and then, two in three chances taken.
    if (this.real >= this.blinkAt) {
      this.blinkAt = this.real + 3.7 * (0.6 + this.rand() * 0.8);
      if (this.rand() < 0.67) this.blinkUntil = this.real + 0.14;
    }
  }

  /** The sky now: its biome's own, or with the fixed weather. */
  private skyNow(): Sky {
    const sky = skyAt(this.worldMs, this.life.seed, this.place);
    return this.fixedWeather === null ? sky : { ...sky, weather: this.fixedWeather, wet: this.fixedWeather.precip };
  }

  /** Where its lantern hangs (native pixels) when it carries one: outside, in the dark. */
  lantern(): { x: number; y: number } | null {
    const b = this.body;
    if (!b.visible || b.inside || this.sky.daylight >= 0.35) return null;
    return { x: this.geo.px(b.x) + b.facing * 9, y: this.geo.footY(b.x, b.z) - 5 - b.lift };
  }

  /** The render weather's lightning, from the real clock (the same flash the page draws). */
  flash(): boolean {
    return flashAt(this.real, this.life.seed, this.sky.weather);
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
    const flash = this.flash();
    if (flash && !this.wasFlash && awake && !this.body.inside) {
      this.feelings.fright = clamp01(this.feelings.fright + 0.25 + 0.5 * this.life.traits.shy);
      if (!engaged) this.brain.run('startle');
    }
    this.wasFlash = flash;
  }

  // ── What you do ──────────────────────────────────────────────────────────

  /** Any key or click: you are here. */
  touched(): void {
    this.lastInput = this.real;
  }

  /** The window came into view or went out of it. */
  focus(on: boolean): void {
    if (!on) {
      this.hasFocus = false;
      this.blurredAt = this.real;
      return;
    }
    const gone = this.real - this.blurredAt;
    this.hasFocus = true;
    this.lastInput = this.real;
    this.knocked = false;
    const engaged = this.brain.current !== null && ENGAGED.has(this.brain.current);
    if (this.blurredAt >= 0 && gone > 120 && !this.life.asleep && this.body.visible && !engaged && this.mode === 'live') {
      this.greetTopic = 'focusBack';
      this.greetMoment = `They looked back at your window after ${duration(gone * 1000)}. Greet them.`;
      this.brain.run('greet');
    }
  }

  /** The mouse moved over the scene (native pixels): its eyes follow it for a while. */
  hover(x: number, y: number): void {
    this.mouse = { x, y, at: this.real };
  }

  /** A click on the scene (native pixels): on it, a pet; on the ground, it goes to look. */
  click(x: number, y: number): void {
    this.touched();
    this.mouse = { x, y, at: this.real };
    if (this.mode === 'journal') {
      this.mode = 'live';
      return;
    }
    if (this.mode !== 'live') return;
    if (this.hitsCreature(x, y)) {
      this.pet();
      return;
    }
    const engaged = this.brain.current !== null && ENGAGED.has(this.brain.current);
    const z = this.geo.depthOf(this.geo.x(x), y);
    if (z >= 0 && z <= 1 && this.body.visible && !this.life.asleep && !engaged) {
      this.pointedAt = { x: Math.max(0.03, Math.min(0.97, this.geo.x(x))), z };
      this.scene.emit({ kind: 'spark', x, y, vx: 0, vy: -6, life: 0.6 });
      if (this.rand() < 0.4 + 0.6 * this.life.bond) this.brain.run('go');
      else this.body.gaze = x < this.geo.px(this.body.x) ? 'left' : 'right';
    }
  }

  /** Is (x, y) on it (or, inside, on its doorway)? */
  hitsCreature(x: number, y: number): boolean {
    const b = this.body;
    if (!b.visible) return false;
    if (b.inside) {
      const home = this.scene.layout.home;
      const door = this.geo.door(home);
      const dw = home.sprite.door?.w ?? 10;
      const dh = home.sprite.door?.h ?? 12;
      // On its stone it lies on top.
      const foot = this.geo.footY(door.x, door.z) - (home.nest === true ? NEST.top : 0);
      return Math.abs(x - this.geo.px(door.x)) <= dw / 2 && y <= foot && y > foot - dh;
    }
    const foot = this.geo.footY(b.x, b.z) - b.lift;
    return Math.abs(x - this.geo.px(b.x)) <= CREATURE.w / 2 - 3 && y <= foot + 1 && y > foot - CREATURE.tall - 1;
  }

  feed(): void {
    this.touched();
    const b = this.body;
    if (!b.visible) {
      this.say1(`${this.life.name} is away, wandering.`);
      return;
    }
    let x = b.x + (this.rand() - 0.5) * 0.2;
    let z = Math.max(0.3, Math.min(1, b.z + (this.rand() - 0.5) * 0.4));
    if (b.inside) {
      const door = this.geo.door(this.scene.layout.home);
      x = door.x + (this.scene.layout.homeLeft ? 1 : -1) * (0.04 + this.rand() * 0.06);
      z = Math.min(1, door.z + 0.3);
    }
    this.scene.dropFood(Math.max(0.05, Math.min(0.95, x)), z);
  }

  play(): void {
    this.touched();
    if (!this.body.visible) {
      this.say1(`${this.life.name} is away, wandering.`);
      return;
    }
    this.scene.throwToy(this.body.x > 0.5);
    const engaged = this.brain.current !== null && ENGAGED.has(this.brain.current);
    if (!this.life.asleep && !engaged) this.brain.interrupt();
  }

  pet(): void {
    this.touched();
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

  /** You start typing to it (T or Enter): it comes to the glass to listen. */
  startTalk(): void {
    this.touched();
    this.mode = 'talk';
    const current = this.brain.current;
    if (!this.life.asleep && this.body.visible && current !== 'gift' && current !== 'ask' && current !== 'arrive') this.brain.run('listen');
  }

  /** What you typed, sent (Enter): words to it, or your name when it asked. */
  submit(text: string): void {
    this.touched();
    if (this.mode === 'name') this.submitName(text);
    else if (this.mode === 'talk') this.submitTalk(text);
  }

  /** Typing given up (Escape): when it asked your name, it takes the one it has. */
  cancel(): void {
    if (this.mode === 'name') this.submitName('');
    this.mode = 'live';
  }

  toggleJournal(): void {
    this.touched();
    this.mode = this.mode === 'journal' ? 'live' : this.mode === 'live' ? 'journal' : this.mode;
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

  /** Y or N, when it asked you something. */
  answer(yes: boolean): void {
    this.touched();
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

  /** A short message in the hints. */
  private say1(text: string): void {
    this.notice = { text, until: this.real + 4 };
  }

  // ── Claude ───────────────────────────────────────────────────────────────

  private liveMind(): MindLink | null {
    return this.mind !== null && !this.mind.disabled ? this.mind : null;
  }

  private request(mind: MindLink, moment: string, volunteered: boolean, fallback: () => void): void {
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
      weather: `Weather: ${weatherWords(this.sky.weather)}; ${this.sky.season}; the moon is ${moonWords(this.sky.moon)}`,
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

  clock(): string {
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
      weather: weatherWords(this.sky.weather),
      season: this.sky.season,
      moon: moonWords(this.sky.moon),
      forage: BIOMES[this.place].forageFood,
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

  // ── What the page shows ──────────────────────────────────────────────────

  /** The eyes it shows now, as the terminal wrote them: an action's, the mouse's pull, where it looks, or its mood's. */
  eyes(): string {
    const b = this.body;
    if (this.life.asleep) return '- -';
    if (b.eyes !== null) return b.eyes;
    if (this.real < this.blinkUntil) return '- -';
    let gaze = this.mouseGaze() ?? b.gaze;
    if (gaze === null && b.pose === 'walk') gaze = b.facing > 0 ? 'right' : 'left';
    return gaze === null ? moodEyes(this.mood) : GAZE_EYES[gaze];
  }

  private mouseGaze(): Gaze | null {
    const m = this.mouse;
    if (m === null || this.real - m.at > 4 || this.body.inside || !this.body.visible) return null;
    const head = headOf(this);
    const dx = m.x - head.x;
    const dy = m.y - (head.y + 9);
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return 'center';
    if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? 'up' : 'down';
    return dx < 0 ? 'left' : 'right';
  }

  /** The colour its eyes glow: love and sadness show over its mood. */
  eyeColour(eyes: string = this.eyes()): EyeColour {
    if (eyes.includes('♥')) return 'love';
    if (eyes.includes('╥')) return 'sad';
    return MOOD_COLOUR[this.mood];
  }

  /** What it says, or "…" while words are on their way. */
  bubble(): { text: string; kind: 'say' | 'think' } | null {
    if (this.bubbleState !== null) return { text: this.bubbleState.text, kind: 'say' };
    if (this.pending > 0 && !this.life.asleep) return { text: '…', kind: 'think' };
    return null;
  }

  /** The bar: its name and age, its state, its needs, the hour and the weather, whose words. */
  statusBar(): Segment[] {
    const life = this.life;
    const bar = (label: string, v: number): Segment => {
      const n = Math.round(clamp01(v) * 5);
      return { text: `${label} ${'■'.repeat(n)}${'·'.repeat(5 - n)}`, tone: v < 0.25 ? 'low' : undefined };
    };
    const days = ageDays(life, this.worldMs);
    const age = days === 0 ? 'newborn' : days === 1 ? '1 day' : `${days} days`;
    const mind = this.mind === null ? 'mind: local' : this.mind.disabled ? 'mind: local (no access)' : this.pending > 0 ? 'mind: claude …' : 'mind: claude';
    return [
      { text: life.name, tone: 'accent' },
      { text: `${age} · ${this.body.visible ? (life.asleep ? 'asleep' : this.mood) : 'away'}` },
      bar('food', life.needs.food),
      bar('rest', life.needs.rest),
      bar('fun', life.needs.fun),
      bar('love', life.needs.love),
      bar('bond', life.bond),
      { text: `${this.clock()} ${this.sky.phase}, ${weatherWords(this.sky.weather)}` },
      { text: mind + (this.ephemeral ? ' · a look, not saved' : ''), tone: 'dim' },
    ];
  }

  /** The hints: what you can do now, what it is waiting for, what you said. */
  hints(): Segment[] {
    if (this.mode === 'talk') return [{ text: 'say something · Enter send · Esc cancel', tone: 'dim' }];
    if (this.mode === 'name') return [{ text: 'your name · Enter send · Esc skip', tone: 'dim' }];
    if (this.mode === 'journal') return [{ text: 'J or Esc to close', tone: 'dim' }];
    if (this.notice !== null) return [{ text: this.notice.text, tone: 'accent' }];
    if (this.question !== null && !this.answered) return [{ text: 'Y yes · N no', tone: 'accent' }, { text: '(it asked you something)', tone: 'dim' }];
    if (this.offerItem !== null && !this.offerTaken) return [{ text: 'E take it', tone: 'accent' }, { text: `(it holds out ${this.offerItem})`, tone: 'dim' }];
    if (this.heard !== null) return [{ text: 'you ›', tone: 'dim' }, { text: this.heard.text }];
    const pet = this.life.asleep && this.body.inside ? 'E wake' : 'E pet';
    return [{ text: `F feed · P play · ${pet} · T talk · J journal · H bar · M sound`, tone: 'dim' }];
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

  /** The world's time now, epoch ms. */
  worldNow(): number {
    return this.worldMs;
  }

  /** The life as it is now, ready to save. */
  snapshot(): Life {
    this.life.lastSeen = this.worldMs;
    return this.life;
  }
}
