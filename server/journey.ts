// The journey file: $XDG_DATA_HOME/wander/journey.json (default ~/.local/share/wander/journey.json), written
// atomically; a broken file is moved aside rather than lost; a new road keeps the old one as .bak.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { reviveJourney } from '../src/journal.ts';
import type { Journey } from '../src/journal.ts';

export function defaultJourneyPath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const xdg = env.XDG_DATA_HOME;
  const base = xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'wander', 'journey.json');
}

export class JourneyStore {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  /** The saved journey, or null when there is none (or it was broken and has been moved to .broken). */
  load(): Journey | null {
    if (!existsSync(this.path)) return null;
    try {
      return reviveJourney(JSON.parse(readFileSync(this.path, 'utf8')));
    } catch {
      renameSync(this.path, `${this.path}.broken`);
      return null;
    }
  }

  /** Saves atomically: a temporary file, then a rename. Refuses anything that is not a journey. */
  save(data: unknown): void {
    const journey = reviveJourney(data);
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(journey)}\n`);
    renameSync(tmp, this.path);
  }

  /** Starts over: the old road is kept as .bak. */
  fresh(): void {
    if (existsSync(this.path)) renameSync(this.path, `${this.path}.bak`);
  }
}
