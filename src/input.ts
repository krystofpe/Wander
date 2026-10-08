// Keyboard, mouse and focus: raw terminal text → input events.

export type KeyName =
  | 'enter'
  | 'backspace'
  | 'escape'
  | 'tab'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'delete'
  | 'ctrl-c'
  | 'ctrl-u'
  | 'ctrl-w'
  | 'ctrl-z';

export type InputEvent =
  /** Printable text, one character (any script). */
  | { readonly type: 'char'; readonly ch: string }
  | { readonly type: 'key'; readonly key: KeyName }
  /** Mouse, 0-based cell. Button 0 left, 1 middle, 2 right; wheel events are dropped. */
  | { readonly type: 'mouse'; readonly col: number; readonly row: number; readonly button: number; readonly action: 'press' | 'release' | 'move' }
  | { readonly type: 'focus'; readonly on: boolean };

const ARROWS: Readonly<Record<string, KeyName>> = { A: 'up', B: 'down', C: 'right', D: 'left' };
const CONTROL: Readonly<Record<string, KeyName>> = {
  '\r': 'enter',
  '\n': 'enter',
  '\x7f': 'backspace',
  '\b': 'backspace',
  '\t': 'tab',
  '\x03': 'ctrl-c',
  '\x15': 'ctrl-u',
  '\x17': 'ctrl-w',
  '\x1a': 'ctrl-z',
};

/** Splits terminal text into events. An unfinished escape sequence at the end comes back as `rest`. Pure. */
export function parseInput(text: string): { events: InputEvent[]; rest: string } {
  const events: InputEvent[] = [];
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === '\x1b') {
      const next = chars[i + 1];
      if (next === undefined || next === '\x1b') {
        events.push({ type: 'key', key: 'escape' });
        i += 1;
      } else if (next === '[') {
        // CSI: parameter bytes, intermediate bytes, one final byte.
        let j = i + 2;
        while (j < chars.length && chars[j] >= '0' && chars[j] <= '?') j++;
        while (j < chars.length && chars[j] >= ' ' && chars[j] <= '/') j++;
        if (j >= chars.length) return { events, rest: chars.slice(i).join('') };
        csi(chars.slice(i + 2, j).join(''), chars[j], events);
        i = j + 1;
      } else if (next === 'O') {
        if (i + 2 >= chars.length) return { events, rest: chars.slice(i).join('') };
        const key = ARROWS[chars[i + 2]];
        if (key !== undefined) events.push({ type: 'key', key });
        i += 3;
      } else {
        i += 2; // Alt+key: ignored, so it never counts as Esc
      }
      continue;
    }
    const control = CONTROL[ch];
    if (control !== undefined) events.push({ type: 'key', key: control });
    else if (ch >= ' ') events.push({ type: 'char', ch });
    i += 1;
  }
  return { events, rest: '' };
}

function csi(params: string, final: string, events: InputEvent[]): void {
  if (params.startsWith('<') && (final === 'M' || final === 'm')) {
    // SGR mouse: CSI < b ; x ; y M (press or motion) / m (release).
    const [b, x, y] = params.slice(1).split(';').map(Number);
    if (![b, x, y].every(Number.isFinite) || (b & 64) !== 0) return;
    const action = final === 'm' ? 'release' : (b & 32) !== 0 ? 'move' : 'press';
    events.push({ type: 'mouse', col: x - 1, row: y - 1, button: b & 3, action });
    return;
  }
  if (params === '' && final === 'I') events.push({ type: 'focus', on: true });
  else if (params === '' && final === 'O') events.push({ type: 'focus', on: false });
  else if (final === '~' && params.split(';')[0] === '3') events.push({ type: 'key', key: 'delete' });
  else {
    const arrow = ARROWS[final];
    if (arrow !== undefined && !params.startsWith('?')) events.push({ type: 'key', key: arrow });
  }
}

/** Keeps the unfinished tail of one read for the next. */
export class InputParser {
  private pending = '';

  feed(text: string): InputEvent[] {
    const { events, rest } = parseInput(this.pending + text);
    this.pending = rest;
    return events;
  }
}
