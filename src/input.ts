// Keyboard: raw terminal text → key events → held keys → what you want to do.
import { LEGACY_FIRST_HOLD_MS, LEGACY_REPEAT_HOLD_MS } from './config.ts';

export type KeyType = 'press' | 'repeat' | 'release';
export type KeyEvent = { readonly key: string; readonly type: KeyType; readonly shift: boolean };
export type Intent = { readonly dx: number; readonly dy: number; readonly run: boolean; readonly fastTime: boolean };
export type Action = 'quit' | 'toggleHud';
export type Detection = 'supported' | 'unsupported' | 'waiting';

const ARROWS: Readonly<Record<string, string>> = { A: 'up', B: 'down', C: 'right', D: 'left' };

/** Splits terminal text into key events. An unfinished escape sequence at the end comes back as `rest`. Pure. */
export function parseKeys(text: string): { events: KeyEvent[]; rest: string } {
  const events: KeyEvent[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\x1b') {
      const next = text[i + 1];
      if (next === undefined || next === '\x1b') {
        events.push({ key: 'escape', type: 'press', shift: false });
        i += 1;
      } else if (next === '[') {
        // CSI: parameter bytes, intermediate bytes, then one final byte.
        let j = i + 2;
        while (j < text.length && text.charCodeAt(j) >= 0x30 && text.charCodeAt(j) <= 0x3f) j++;
        while (j < text.length && text.charCodeAt(j) >= 0x20 && text.charCodeAt(j) <= 0x2f) j++;
        if (j >= text.length) return { events, rest: text.slice(i) };
        csi(text.slice(i + 2, j), text[j], events);
        i = j + 1;
      } else if (next === 'O' && i + 2 < text.length) {
        const key = ARROWS[text[i + 2]]; // arrows in application cursor mode
        if (key !== undefined) events.push({ key, type: 'press', shift: false });
        i += 3;
      } else {
        i += 2; // Alt+key: ignored, so it never counts as Esc
      }
      continue;
    }
    if (ch === '\x03') events.push({ key: 'ctrl-c', type: 'press', shift: false });
    else if (ch === '\x1a') events.push({ key: 'ctrl-z', type: 'press', shift: false });
    else {
      const lower = ch.toLowerCase();
      events.push({ key: lower, type: 'press', shift: ch !== lower });
    }
    i += 1;
  }
  return { events, rest: '' };
}

/** One CSI sequence: kitty `CSI code[:alts];mods[:event]u`, or arrows `CSI [1;mods[:event]]A..D`. */
function csi(params: string, final: string, events: KeyEvent[]): void {
  if (params.startsWith('?') || params.startsWith('>') || params.startsWith('<')) return; // query replies, not keys
  const fields = params.split(';');
  const [modText = '1', eventText = '1'] = (fields[1] ?? '').split(':');
  const bits = (Math.max(1, Number(modText) || 1) - 1) & ~(64 | 128); // caps lock and num lock don't count
  const type: KeyType = eventText === '2' ? 'repeat' : eventText === '3' ? 'release' : 'press';
  const shift = (bits & 1) !== 0;
  if (final !== 'u') {
    const arrow = ARROWS[final];
    if (arrow !== undefined) events.push({ key: arrow, type, shift });
    return;
  }
  const code = Number((fields[0] ?? '').split(':')[0]);
  let key: string;
  if (code === 27) key = 'escape';
  else if (code === 57441 || code === 57447) key = 'shift';
  else if (Number.isInteger(code) && code >= 32 && code < 57344) key = String.fromCodePoint(code).toLowerCase();
  else return;
  if ((bits & 4) !== 0) {
    if (key === 'c') key = 'ctrl-c';
    else if (key === 'z') key = 'ctrl-z';
    else return; // other Ctrl combinations mean nothing here
  }
  events.push({ key, type, shift });
}

/** Physical keys → logical keys. */
const LOGICAL: Readonly<Record<string, string>> = {
  w: 'up',
  up: 'up',
  s: 'down',
  down: 'down',
  a: 'left',
  left: 'left',
  d: 'right',
  right: 'right',
  t: 'time',
  h: 'hud',
  shift: 'shift',
};
const MOVES = new Set(['up', 'down', 'left', 'right']);

/** Which keys are held, and the one-shot actions waiting to be handled. */
export class InputState {
  readonly kitty: boolean;
  /** Logical key → time (ms) until which it counts as held. */
  private readonly held = new Map<string, number>();
  private readonly actions: Action[] = [];
  private pending = '';

  constructor(kitty: boolean) {
    this.kitty = kitty;
  }

  feed(text: string, now: number): void {
    const { events, rest } = parseKeys(this.pending + text);
    this.pending = rest;
    for (const event of events) this.apply(event, now);
  }

  intent(now: number): Intent {
    const on = (key: string): number => (this.isHeld(key, now) ? 1 : 0);
    return {
      dx: on('right') - on('left'),
      dy: on('down') - on('up'),
      run: this.isHeld('shift', now),
      fastTime: this.isHeld('time', now),
    };
  }

  takeActions(): Action[] {
    return this.actions.splice(0);
  }

  private apply(event: KeyEvent, now: number): void {
    if (event.key === 'q' || event.key === 'escape' || event.key === 'ctrl-c') {
      if (event.type === 'press') this.actions.push('quit');
      return;
    }
    const key = LOGICAL[event.key];
    if (key === undefined) return;
    if (key === 'hud' && event.type === 'press' && !this.isHeld('hud', now)) this.actions.push('toggleHud');
    if (event.type === 'release') this.held.delete(key);
    else this.hold(key, now);
    if (MOVES.has(key)) {
      // Shift on a movement key means run; a movement key without it means walk.
      if (event.shift && event.type !== 'release') this.held.set('shift', this.kitty ? Infinity : (this.held.get(key) ?? now));
      else if (!event.shift) this.held.delete('shift');
    }
  }

  private hold(key: string, now: number): void {
    if (this.kitty) {
      this.held.set(key, Infinity);
      return;
    }
    // No release events: guess generously after the first press, then from each auto-repeat.
    const extra = this.isHeld(key, now) ? LEGACY_REPEAT_HOLD_MS : LEGACY_FIRST_HOLD_MS;
    this.held.set(key, Math.max(this.held.get(key) ?? 0, now + extra));
  }

  private isHeld(key: string, now: number): boolean {
    const until = this.held.get(key);
    return until !== undefined && until > now;
  }
}

/** Reads the replies to `CSI ?u` + `CSI c` (see terminal.ts). The kitty reply must come first. Pure. */
export function readDetection(text: string): Detection {
  const kitty = text.search(/\x1b\[\?\d+u/);
  const attributes = text.search(/\x1b\[\?[\d;]*c/);
  if (kitty !== -1 && (attributes === -1 || kitty < attributes)) return 'supported';
  return attributes !== -1 ? 'unsupported' : 'waiting';
}
