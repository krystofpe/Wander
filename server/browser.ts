// Chromium: full screen in app mode for `npm start`, headless on the GPU for the tools (research: Engineering
// §1–9). The real binary is /usr/lib/chromium/chromium on Arch; /usr/bin/chromium is a launcher that adds the
// user's own flags and extensions.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.WANDER_CHROMIUM ?? '',
  '/usr/lib/chromium/chromium',
  '/usr/lib/chromium-browser/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** The Chromium binary to run, or null. `WANDER_CHROMIUM` overrides. */
export function findChromium(): string | null {
  for (const c of CANDIDATES) if (c !== '' && existsSync(c)) return c;
  return null;
}

/** Flags that keep a page running at full rate in the background and bring WebGL back after a GPU crash. */
export const STEADY_FLAGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-domain-blocking-for-3d-apis',
  '--disable-gpu-process-crash-limit',
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-default-apps',
  '--disable-background-networking',
  '--disable-features=Translate,MediaRouter',
];

/** Headless on the real GPU: without --use-angle=vulkan Chromium renders on SwiftShader, ~1.5 s a 4K frame. */
export const HEADLESS_FLAGS = ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc', ...STEADY_FLAGS];

/** Opens the page in its own Chromium app window, full screen, with a profile of its own. */
export function openApp(url: string, chromium: string): ChildProcess {
  const profile = join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'wander', 'chromium');
  mkdirSync(profile, { recursive: true });
  const args = [
    `--app=${url}`,
    '--start-fullscreen',
    `--user-data-dir=${profile}`,
    '--ozone-platform-hint=auto',
    '--window-size=1920,1080',
    ...STEADY_FLAGS,
  ];
  return spawn(chromium, args, { stdio: 'ignore', detached: false });
}
