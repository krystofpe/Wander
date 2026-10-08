// Turns the difference between two frames into the fewest escape sequences we can cheaply find.
import type { Frame } from './frame.ts';

const glyphCache = new Map<number, string>();
function glyphText(codePoint: number): string {
  let s = glyphCache.get(codePoint);
  if (s === undefined) {
    s = String.fromCodePoint(codePoint);
    glyphCache.set(codePoint, s);
  }
  return s;
}

const rgb = (c: number): string => `${c >> 16};${(c >> 8) & 255};${c & 255}`;

/**
 * Escape sequences that turn a screen showing `prev` into `next`. With no `prev`, or one of another
 * size, it clears the screen and draws everything. Assumes auto-wrap is off. Pure.
 */
export function diffFrames(prev: Frame | null, next: Frame): string {
  const old = prev !== null && prev.width === next.width && prev.height === next.height ? prev : null;
  const out: string[] = old === null ? ['\x1b[2J'] : [];
  const w = next.width;
  const n = w * next.height;
  let cursor = -1; // the cell the terminal's cursor is on, or -1 when unknown
  let fg = -1; // the colours the terminal is currently drawing with, or -1 when unknown
  let bg = -1;
  for (let i = 0; i < n; i++) {
    const g = next.glyph[i];
    const f = next.fg[i];
    const b = next.bg[i];
    if (old !== null && old.glyph[i] === g && old.fg[i] === f && old.bg[i] === b) continue;
    if (i !== cursor) out.push(`\x1b[${Math.floor(i / w) + 1};${(i % w) + 1}H`);
    if (f !== fg && b !== bg) out.push(`\x1b[38;2;${rgb(f)};48;2;${rgb(b)}m`);
    else if (f !== fg) out.push(`\x1b[38;2;${rgb(f)}m`);
    else if (b !== bg) out.push(`\x1b[48;2;${rgb(b)}m`);
    fg = f;
    bg = b;
    out.push(glyphText(g));
    // With auto-wrap off, the cursor stays on the last column, so the next row needs a move.
    cursor = (i + 1) % w === 0 ? -1 : i + 1;
  }
  return out.join('');
}
