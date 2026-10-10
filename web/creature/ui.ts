// What there is besides the hollow: its words above its head (the wanderer's thought, spoken), the bar with its name
// and its needs, the hints of what you can do, the journal (J), and the box you type to it in. Plain DOM over the
// canvas, sized in the art's own pixels, quiet as the wanderer's.
import type { Segment } from '../../src/creature/game.ts';
import { twoLines } from '../ui.ts';

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

export class CreatureUi {
  private readonly bubble = el('bubble');
  private readonly bar = el('bar');
  private readonly hints = el('hints');
  private readonly journal = el('journal');
  private readonly talk = el('talk');
  readonly input = el('talk-input') as HTMLInputElement;
  private readonly label = el('talk-label');
  private lastPx = 0;
  private lastBubble = '';
  private lastBar = '';
  private lastHints = '';
  private lastJournal = '';

  /** CSS pixels per art pixel, so text scales with the art at 1080p and 4K alike. */
  setScale(cssPerArtPixel: number): void {
    if (cssPerArtPixel === this.lastPx) return;
    this.lastPx = cssPerArtPixel;
    document.documentElement.style.setProperty('--px', `${cssPerArtPixel}px`);
  }

  /** Its words, or none: placed above its head (CSS pixels), kept on the screen. */
  say(bubble: { text: string; kind: 'say' | 'think' } | null, headX: number, headY: number): void {
    const text = bubble === null ? '' : twoLines(bubble.text, 40);
    if (text !== this.lastBubble) {
      if (text !== '') this.bubble.textContent = text;
      this.lastBubble = text;
    }
    this.bubble.classList.toggle('shown', bubble !== null);
    this.bubble.classList.toggle('think', bubble?.kind === 'think');
    const w = this.bubble.offsetWidth;
    const h = this.bubble.offsetHeight;
    const x = Math.max(16, Math.min(window.innerWidth - w - 16, headX - w / 2));
    const y = Math.max(16, headY - h - this.lastPx * 6);
    this.bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  private static html(segments: readonly Segment[], sep: string): string {
    const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
    return segments.map((s) => `<span class="${s.tone ?? ''}">${esc(s.text)}</span>`).join(sep);
  }

  showBar(segments: readonly Segment[], on: boolean): void {
    const html = CreatureUi.html(segments, '<span class="sep"> · </span>');
    if (html !== this.lastBar) {
      this.bar.innerHTML = html;
      this.lastBar = html;
    }
    this.bar.classList.toggle('shown', on);
  }

  showHints(segments: readonly Segment[], on: boolean): void {
    const html = CreatureUi.html(segments, ' ');
    if (html !== this.lastHints) {
      this.hints.innerHTML = html;
      this.lastHints = html;
    }
    this.hints.classList.toggle('shown', on);
  }

  showJournal(lines: readonly string[] | null): void {
    const text = lines === null ? '' : lines.join('\n');
    if (text !== this.lastJournal) {
      if (text !== '') this.journal.textContent = text;
      this.lastJournal = text;
    }
    this.journal.classList.toggle('shown', lines !== null);
  }

  /** The box you type in: shown (and focused) while you talk to it or tell it your name. */
  showTalk(mode: 'talk' | 'name' | null): void {
    const on = mode !== null;
    if (on !== this.talk.classList.contains('shown')) {
      this.talk.classList.toggle('shown', on);
      if (on) {
        this.input.value = '';
        this.input.focus();
      } else this.input.blur();
    }
    if (mode !== null) this.label.textContent = mode === 'name' ? 'your name ›' : 'you ›';
  }
}
