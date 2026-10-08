/** One screen of cells: a code point plus foreground and background colours (0xRRGGBB) per cell. */
export class Frame {
  readonly width: number;
  readonly height: number;
  readonly glyph: Uint32Array;
  readonly fg: Uint32Array;
  readonly bg: Uint32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.glyph = new Uint32Array(width * height);
    this.fg = new Uint32Array(width * height);
    this.bg = new Uint32Array(width * height);
  }

  set(col: number, row: number, glyph: number, fg: number, bg: number): void {
    const i = row * this.width + col;
    this.glyph[i] = glyph;
    this.fg[i] = fg;
    this.bg[i] = bg;
  }

  /** Writes `text` starting at (col, row), clipped at the right edge. */
  text(col: number, row: number, text: string, fg: number, bg: number): void {
    let c = col;
    for (const ch of text) {
      if (c >= this.width) break;
      if (c >= 0) this.set(c, row, ch.codePointAt(0) ?? 32, fg, bg);
      c++;
    }
  }

  /** The glyphs of one row as a string, for tests and debugging. */
  rowText(row: number): string {
    return String.fromCodePoint(...this.glyph.subarray(row * this.width, (row + 1) * this.width));
  }
}
