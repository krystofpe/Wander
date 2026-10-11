// The two modes, the endless walk and the creature's hollow, and the way between them: Tab (or a click on the dim line
// that names the other) fades out and opens the other page; each page fades in, and remembers that it was the last one
// open (on the server for `npm start`, in the browser on the published page). The page saves itself as it goes, as it
// always does when it is left.

export type Mode = 'wander' | 'creature';

const STORE = 'wander.mode';

/** The address of the other mode's page, from this one. */
function otherUrl(mode: Mode): string {
  const url = new URL(mode === 'wander' ? 'creature/' : '../', location.href);
  if (new URLSearchParams(location.search).has('hollow')) url.searchParams.set('hollow', '1');
  return url.href;
}

/** The mode last open, as the browser remembers it (the published page), or null. */
export function lastMode(): Mode | null {
  try {
    const m = localStorage.getItem(STORE);
    return m === 'creature' || m === 'wander' ? m : null;
  } catch {
    return null;
  }
}

function remember(mode: Mode, site: boolean): void {
  try {
    localStorage.setItem(STORE, mode);
  } catch {
    // Private window or blocked storage: it starts where its address says.
  }
  if (!site) navigator.sendBeacon('/api/mode', new Blob([JSON.stringify({ mode })], { type: 'application/json' }));
}

/**
 * Sets the page up as one of the modes: a fade in, a dim line naming the other mode (shown while `shown()` says so,
 * clickable), Tab to go. `ready()` says whether it may go now (not while you type to it).
 */
export function modes(mode: Mode, site: boolean, shown: () => boolean, ready: () => boolean = () => true): void {
  remember(mode, site);
  const fade = document.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:1;transition:opacity 0.9s ease;pointer-events:none;z-index:10';
  document.body.appendChild(fade);
  requestAnimationFrame(() => requestAnimationFrame(() => (fade.style.opacity = '0')));
  const line = document.createElement('div');
  line.id = 'mode';
  line.textContent = mode === 'wander' ? new URLSearchParams(location.search).has('hollow') ? 'Tab · the hollow' : 'Tab · the dreaming' : 'Tab · the road';
  line.style.cssText = 'position:fixed;right:calc(var(--px,3px)*8);top:calc(var(--px,3px)*6);font-family:var(--thought-font);font-style:italic;font-size:calc(var(--px,3px)*5);color:var(--dim);opacity:0;transition:opacity 0.8s ease;cursor:pointer;z-index:5;letter-spacing:0.03em';
  document.body.appendChild(line);
  let going = false;
  const go = (): void => {
    if (going) return;
    going = true;
    remember(mode === 'wander' ? 'creature' : 'wander', site);
    fade.style.transition = 'opacity 0.6s ease';
    fade.style.opacity = '1';
    setTimeout(() => location.assign(otherUrl(mode)), 650);
  };
  line.addEventListener('click', go);
  addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    if (ready()) go();
  });
  setInterval(() => {
    const on = shown();
    line.style.opacity = on ? '1' : '0';
    line.style.pointerEvents = on ? 'auto' : 'none';
  }, 300);
}
