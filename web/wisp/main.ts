import type { Life } from '../../src/life.ts';
import { seedOf } from '../../src/options.ts';
import { boundVisit, dreamAt, emberStrength, keepEmber, keepMeeting, newWisp, REALMS, reviveWisp } from '../../src/wisp/journey.ts';
import { modes } from '../modes.ts';
import { Dream } from './dream.ts';
import { wispCrossing } from '../../src/wisp/crossing.ts';

const q = new URLSearchParams(location.search);
const site = document.documentElement.hasAttribute('data-site');
const STORE = 'wander.wisp.v1';
const speedValue = Number(q.get('speed') ?? 1);
const speed = Number.isFinite(speedValue) && speedValue > 0 ? Math.min(speedValue, 1000) : 1;
const fixedValue = Number(q.get('t') ?? 0);
const fixed = q.has('t') && Number.isFinite(fixedValue) ? Math.max(0, fixedValue) : null;
const preview = q.has('visit');
const ephemeral = preview || fixed !== null || speed !== 1 || q.has('seed') || q.has('realm') || q.has('manual');
let stored: unknown = null;
try { stored = JSON.parse(localStorage.getItem(STORE) ?? 'null'); } catch { /* Storage is optional. */ }
const save = (!q.has('seed') ? reviveWisp(stored) : null) ?? newWisp(seedOf(q.get('seed') ?? 'little-light'), Date.now());
const started = performance.now();
const age = Math.max(0, (Date.now() - save.bornAt) / 1000);
const persist = (): void => {
  if (ephemeral) return;
  try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* Private browsing still has a journey. */ }
};
persist();
addEventListener('pagehide', persist);

document.body.className = 'dreaming';
document.body.style.cursor = 'none';
for (const id of ['bubble', 'bar', 'hints', 'journal', 'talk']) document.getElementById(id)?.remove();
const style = document.createElement('style');
style.textContent = `
body.dreaming { background:#030609; }
#scene { image-rendering:pixelated; z-index:1; }
#dream-road { position:fixed;inset:0;width:100%;height:100%;border:0;pointer-events:none; }
#dream-caption { position:fixed;left:5vw;bottom:7vh;z-index:3;font:italic 18px var(--thought-font);color:rgba(208,226,220,.58);letter-spacing:.05em;pointer-events:none;transition:opacity 2s; }
#dream-help { position:fixed;right:3vw;bottom:3vh;z-index:3;font:italic 14px var(--thought-font);color:rgba(208,226,220,.38);transition:opacity 1.2s;pointer-events:none; }
#dream-journal { position:fixed;inset:20% 25%;z-index:4;padding:32px;background:rgba(3,6,9,.94);font:italic 22px var(--thought-font);color:#b8ceca;line-height:1.7;white-space:pre-line;display:none; }
`;
document.head.appendChild(style);
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const context = canvas.getContext('2d');
if (context === null) throw new Error('The dreaming needs a canvas.');
const c = context;
const pixels = document.createElement('canvas');
const pixelContext = pixels.getContext('2d')!;
let pixelScale = 1, pixelLeft = 0, pixelTop = 0;
const caption = document.createElement('div'); caption.id = 'dream-caption'; document.body.appendChild(caption);
const help = document.createElement('div'); help.id = 'dream-help'; help.textContent = 'Tab · the road     M · sound     J · memories'; document.body.appendChild(help);
const journal = document.createElement('div'); journal.id = 'dream-journal'; document.body.appendChild(journal);

// Reuse the real road, including its saves and live clock, rather than inventing a second camp simulation.
const road = document.createElement('iframe');
road.id = 'dream-road'; road.title = 'The wanderer’s road'; road.tabIndex = -1; road.setAttribute('aria-hidden', 'true');
const roadUrl = new URL('../', location.href);
roadUrl.searchParams.set('dreaming', '1'); roadUrl.searchParams.set('mute', '1');
for (const key of ['visit', 'seed', 'speed', 'now', 'live', 'offline', 'manual']) if (q.has(key)) roadUrl.searchParams.set(key, q.get(key)!);
// Still images must not mutate the local road. The site already uses the shared unsaved road.
if (ephemeral && !preview && !q.has('speed')) roadUrl.searchParams.set('speed', '1.00001');
road.src = roadUrl.href; document.body.prepend(road);
type RoadWindow = Window & { __wander?: { ready: boolean; life: Life | null; error: string | null }; __wispRoadVisible?: boolean };
const dream = new Dream();
let pointer: number | null = null;
let affectionAt = -Infinity;
let hintUntil = started + 12000;
let showInfo = false;
let showJournal = false;
let muted = q.has('mute');
let volume = 0.035;
let audio: AudioContext | null = null;
let gain: GainNode | null = null;
const sound = (): void => {
  if (audio === null) {
    try {
      audio = new AudioContext(); gain = audio.createGain(); gain.gain.value = 0; gain.connect(audio.destination);
      for (const [hz, amount] of [[130.81, 0.5], [196, 0.18], [261.63, 0.07]]) {
        const oscillator = audio.createOscillator(); const voice = audio.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = hz; voice.gain.value = amount;
        oscillator.connect(voice); voice.connect(gain); oscillator.start();
      }
    } catch { return; }
  }
  void audio.resume().catch(() => {});
  gain?.gain.setTargetAtTime(muted ? 0 : volume, audio.currentTime, 1.5);
};
addEventListener('pointermove', e => { pointer = e.clientX; hintUntil = performance.now() + 4000; });
addEventListener('pointerout', () => { pointer = null; });
addEventListener('pointerdown', e => {
  sound();
  const ratio = devicePixelRatio;
  const x = (e.clientX * ratio - pixelLeft) / pixelScale;
  const y = (e.clientY * ratio - pixelTop) / pixelScale;
  if (Math.hypot(x - dream.x, y - dream.y) < 24) affectionAt = performance.now();
});
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  hintUntil = performance.now() + 5000;
  if (e.key.toLowerCase() === 'm') { muted = !muted; sound(); }
  if (e.key === '+' || e.key === '=') { volume = Math.min(0.12, volume + 0.01); sound(); }
  if (e.key === '-') { volume = Math.max(0, volume - 0.01); sound(); }
  if (e.key.toLowerCase() === 'h') showInfo = !showInfo;
  if (e.key === ' ') { e.preventDefault(); affectionAt = performance.now(); sound(); }
  if (e.key.toLowerCase() === 'j') {
    showJournal = !showJournal;
    journal.textContent = `A small light, still travelling.\n\n${save.meetings === 0 ? 'Somewhere, someone walks beneath another sky.' : `${save.meetings} ${save.meetings === 1 ? 'night' : 'nights'} beside his fire.\nThe warmth comes with me.`}\n\nJ · return to the dreaming`;
    journal.style.display = showJournal ? 'block' : 'none';
  }
  if (e.key === 'Escape') { showJournal = false; journal.style.display = 'none'; }
  if (e.key.toLowerCase() === 'f') {
    if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  }
});
addEventListener('visibilitychange', () => {
  if (audio !== null) gain?.gain.setTargetAtTime(document.hidden || muted ? 0 : volume, audio.currentTime, 1);
  if (document.hidden) persist();
});
modes('creature', site, () => showInfo || performance.now() < hintUntil);

const status = { ready: false, frames: 0, renderer: 'Canvas 2D · dreaming / WebGL · road', error: null as string | null, realm: '', act: '', crossing: null as string | null, seconds: 0, meetings: save.meetings };
(window as unknown as { __creature: typeof status }).__creature = status;
addEventListener('error', e => { status.error = e.message; });
function frame(now: number): void {
  try {
    const realmValue = Number(q.get('realm') ?? 0);
    const realmOffset = Number.isInteger(realmValue) && realmValue >= 0 && realmValue < REALMS.length ? realmValue * 240 : 0;
    const t = fixed ?? (ephemeral ? realmOffset : age) + (now - started) / 1000 * speed;
    const rw = road.contentWindow as RoadWindow | null;
    const life = rw?.__wander?.life;
    const visit = life !== null && life !== undefined ? boundVisit(life, preview) : null;
    const crossing = visit?.phase ?? null;
    const transition = wispCrossing(visit);
    if (rw !== null) rw.__wispRoadVisible = visit !== null;
    const pull = transition.seam;
    if (keepMeeting(save, visit)) persist();
    if (keepEmber(save, visit, Date.now())) persist();
    const d = dreamAt(t, save.seed);
    const w = innerWidth; const h = innerHeight; const ratio = devicePixelRatio;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
    pixelScale = Math.max(1, Math.floor(Math.min(canvas.width / 640, canvas.height / 360)));
    const nw = Math.min(1408, Math.ceil(canvas.width / pixelScale));
    const nh = Math.min(400, Math.ceil(canvas.height / pixelScale));
    pixelLeft = Math.floor((canvas.width - nw * pixelScale) / 2);
    pixelTop = Math.floor((canvas.height - nh * pixelScale) / 2);
    if (pixels.width !== nw || pixels.height !== nh) { pixels.width = nw; pixels.height = nh; }
    dream.draw(pixelContext, nw, nh, t, save.seed, transition, pointer === null ? null : (pointer * ratio - pixelLeft) / pixelScale, Math.max(0, 1 - (now - affectionAt) / 4000), emberStrength(save, Date.now()));
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#030609'; c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(pixels, pixelLeft, pixelTop, nw * pixelScale, nh * pixelScale);
    canvas.style.opacity = String(transition.dream);
    const chapter = t % 240;
    const thought = crossing === 'going' || crossing === 'closing' ? 'Until the next fire.' : crossing === 'opening' ? 'A warmth, somewhere.' : crossing === 'coming' ? 'There you are.' : crossing === 'with' ? 'I will keep the light.' : d.act === 'rest' ? 'Even a little light needs to dream.' : REALMS[d.blend > 0.5 ? d.next : d.realm];
    caption.textContent = showInfo ? `${thought} · ${d.act} · ${save.meetings} crossings` : thought;
    caption.style.opacity = showInfo || pull > 0 || crossing === 'with' || chapter < 14 || chapter > 230 ? '1' : '0';
    help.style.opacity = now < hintUntil ? '1' : '0';
    document.documentElement.style.setProperty('--px', `${Math.max(1.5, h / 360)}px`);
    Object.assign(status, { frames: status.frames + 1, ready: true, realm: REALMS[d.realm], act: d.act, crossing, seconds: t, meetings: save.meetings, transition });
    if (rw?.__wander?.error) status.error = rw.__wander.error;
  } catch (err) { status.error = String(err); console.error(err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
