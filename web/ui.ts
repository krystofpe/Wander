// The little there is besides the scene: his thought fading in beside him and out again, the dim bar (H) and the
// log of places (L). Plain DOM over the canvas, sized in the art's own pixels.

/** Splits a line into at most two lines near its middle. */
export function twoLines(text: string, width = 46): string {
  if (text.length <= width) return text;
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

export class Ui {
  private readonly thought = document.getElementById('thought') as HTMLDivElement;
  private readonly bar = document.getElementById('bar') as HTMLDivElement;
  private readonly log = document.getElementById('log') as HTMLDivElement;
  private readonly hint = document.getElementById('hint') as HTMLDivElement | null;
  private hideAt = 0;
  private lastPx = 0;
  private lastBar = '';
  private lastLog = '';
  barOn = false;
  logOn = false;

  /** CSS pixels per art pixel, so text scales with the art at 1080p and 4K alike. */
  setScale(cssPerArtPixel: number): void {
    if (cssPerArtPixel === this.lastPx) return;
    this.lastPx = cssPerArtPixel;
    document.documentElement.style.setProperty('--px', `${cssPerArtPixel}px`);
  }

  /** Shows a thought for `hold` seconds, fading in and out. */
  say(text: string, now: number, hold = 7, still = false): void {
    this.thought.textContent = twoLines(text);
    if (still) this.thought.style.transition = 'none';
    this.thought.classList.add('shown');
    this.hideAt = still ? Infinity : now + hold + 1.6;
  }

  /**
   * Keeps the thought beside him and up in the calm sky (never over the trees: research, Art §22), given his head and
   * the sky's lower edge in CSS pixels, and lets it go when its time is up.
   */
  place(headX: number, skyY: number, now: number): void {
    if (now > this.hideAt) this.thought.classList.remove('shown');
    const w = this.thought.offsetWidth;
    const h = this.thought.offsetHeight;
    const x = Math.max(16, Math.min(window.innerWidth - w - 16, headX - w * 0.25));
    const y = Math.max(16, skyY - h);
    this.thought.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  showBar(text: string): void {
    if (text !== this.lastBar) {
      this.bar.textContent = text;
      this.lastBar = text;
    }
    this.bar.classList.toggle('shown', this.barOn);
  }

  /** The published page's hint (how to hear it, what the keys do), or null to let it fade. */
  showHint(text: string | null): void {
    if (this.hint === null) return;
    if (text !== null && text !== this.hint.textContent) this.hint.textContent = text;
    this.hint.classList.toggle('shown', text !== null);
  }

  showLog(lines: readonly string[]): void {
    const text = lines.join('\n');
    if (text !== this.lastLog) {
      this.log.textContent = text;
      this.lastLog = text;
    }
    this.log.classList.toggle('shown', this.logOn);
  }
}
