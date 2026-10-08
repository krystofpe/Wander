// The only module that touches the real terminal: full-screen mode, mouse and focus reporting, restore.

export const SYNC_BEGIN = '\x1b[?2026h';
export const SYNC_END = '\x1b[?2026l';
/**
 * Separate full screen, hidden cursor, auto-wrap off (so the bottom-right cell never scrolls), mouse reporting
 * of every motion in SGR form, and focus in/out reports.
 */
export const ENTER = '\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?1003h\x1b[?1006h\x1b[?1004h';
/** End any half-sent frame, mouse and focus reports off, reset colours, auto-wrap on, cursor on, leave the full screen. */
export const LEAVE = '\x1b[?2026l\x1b[?1004l\x1b[?1006l\x1b[?1003l\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l';
export const BELL = '\x07';

type Listener = (...args: any[]) => void;

/** The parts of `process` the terminal uses, so tests can pass fakes. */
export type Io = {
  readonly stdin: {
    setRawMode(on: boolean): unknown;
    setEncoding(encoding: 'utf8'): unknown;
    resume(): unknown;
    pause(): unknown;
    on(event: 'data', listener: (text: string) => void): unknown;
  };
  readonly stdout: {
    readonly columns?: number;
    readonly rows?: number;
    write(text: string): unknown;
    on(event: string, listener: Listener): unknown;
  };
  readonly stderr: { write(text: string): unknown };
  readonly proc: { on(event: string, listener: Listener): unknown; exit(code: number): void };
};

export class Terminal {
  private restored = false;
  private readonly io: Io;

  constructor(io: Io) {
    this.io = io;
  }

  get cols(): number {
    return this.io.stdout.columns ?? 80;
  }

  get rows(): number {
    return this.io.stdout.rows ?? 24;
  }

  /** Installs the restore hooks first, then enters raw full-screen mode. */
  open(): void {
    this.installHooks();
    const { stdin } = this.io;
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    this.write(ENTER);
  }

  onData(listener: (text: string) => void): void {
    this.io.stdin.on('data', listener);
  }

  onResize(listener: () => void): void {
    this.io.stdout.on('resize', listener);
  }

  write(text: string): void {
    if (this.restored) return;
    try {
      this.io.stdout.write(text);
    } catch {
      this.gone();
    }
  }

  /** Puts the terminal back the way it was. Safe to call any number of times. */
  restore(): void {
    if (this.restored) return;
    this.restored = true;
    try {
      this.io.stdout.write(LEAVE);
    } catch {
      // the terminal is already gone
    }
    try {
      this.io.stdin.setRawMode(false);
      this.io.stdin.pause();
    } catch {
      // the terminal is already gone
    }
  }

  /** The terminal went away (window closed): nothing is left to restore, so just leave. */
  private gone(): void {
    this.restored = true;
    this.io.proc.exit(0);
  }

  private installHooks(): void {
    const { proc, stdout, stderr } = this.io;
    const quit = (code: number) => (): void => {
      this.restore();
      proc.exit(code);
    };
    proc.on('SIGINT', quit(130));
    proc.on('SIGTERM', quit(143));
    proc.on('SIGHUP', quit(129));
    const crash = (err: unknown): void => {
      this.restore();
      try {
        stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      } catch {
        // nowhere left to report it
      }
      proc.exit(1);
    };
    proc.on('uncaughtException', crash);
    proc.on('unhandledRejection', crash);
    proc.on('exit', () => this.restore());
    stdout.on('error', () => this.gone());
  }
}
