// Composing hand-drawn sprite frames from hand-drawn parts: each part is rows of characters placed at a column,
// drawn at an offset (a 1 px bob, a step). Later parts paint over earlier ones; '.' in a part is clear.

/** A part: for each row, segments [first column, characters]. */
export type Part = Readonly<Record<number, readonly (readonly [number, string])[]>>;

export type Placed = { readonly part: Part; readonly dx?: number; readonly dy?: number };

export function compose(w: number, h: number, parts: readonly (Part | Placed)[]): string[] {
  const grid: string[][] = Array.from({ length: h }, () => new Array<string>(w).fill('.'));
  for (const p of parts) {
    const part = 'part' in p ? (p.part as Part) : (p as Part);
    const dx = 'part' in p ? (p.dx ?? 0) : 0;
    const dy = 'part' in p ? (p.dy ?? 0) : 0;
    for (const [rowKey, segs] of Object.entries(part)) {
      const y = Number(rowKey) + dy;
      if (y < 0 || y >= h) continue;
      for (const [x0, chars] of segs) {
        for (let i = 0; i < chars.length; i++) {
          const x = x0 + i + dx;
          if (x < 0 || x >= w || chars[i] === '.') continue;
          grid[y][x] = chars[i];
        }
      }
    }
  }
  return grid.map((r) => r.join(''));
}

/** A part from a block of rows starting at (x0, y0): convenient for drawing a whole shape at once. */
export function block(x0: number, y0: number, rows: readonly string[]): Part {
  const out: Record<number, (readonly [number, string])[]> = {};
  rows.forEach((r, i) => {
    out[y0 + i] = [[x0, r]];
  });
  return out;
}

/** A straight line of one character from (x0, y0) to (x1, y1), as a part. */
export function stroke(x0: number, y0: number, x1: number, y1: number, ch: string, top?: string): Part {
  const out: Record<number, (readonly [number, string])[]> = {};
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    const c = i === 0 && top !== undefined ? top : ch;
    out[y] = [...(out[y] ?? []), [x, c]];
  }
  return out;
}
