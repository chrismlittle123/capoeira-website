/** The song page's reading tools: translation toggle, text size, keep-screen-on, share, recently viewed. */
import { MAX_SCALE, MIN_SCALE, STORAGE_KEYS, clampScale, rememberRecent } from '../lib/reading';
import { required } from './dom';

const root = document.documentElement;
const toast = required(document, '[data-toast]');
const tool = (name: string) => document.querySelector<HTMLButtonElement>(`[data-tool="${name}"]`);

// Storage can be blocked (private mode, strict settings): then preferences last for this page only.
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // see above: nothing to keep it in
    }
  },
};

const TOAST_MS = 1800;
const say = (msg: string) => {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), TOAST_MS);
};

// translation (the class lives on <html> so Base.astro can apply it before first paint)
const tr = tool('translation');
const setTranslation = (on: boolean) => {
  root.classList.toggle('hide-translation', !on);
  tr?.setAttribute('aria-pressed', String(on));
  tr?.setAttribute('title', on ? 'Hide translation' : 'Show translation');
  store.set(STORAGE_KEYS.translation, on ? '1' : '0');
};
setTranslation(store.get(STORAGE_KEYS.translation) !== '0');
tr?.addEventListener('click', () => setTranslation(tr.getAttribute('aria-pressed') !== 'true'));

// text size
const smaller = required<HTMLButtonElement>(document, '[data-tool="smaller"]');
const bigger = required<HTMLButtonElement>(document, '[data-tool="bigger"]');
let scale = clampScale(Number(store.get(STORAGE_KEYS.lyricScale) ?? 1) || 1);
const setScale = (s: number) => {
  scale = clampScale(s);
  root.style.setProperty('--lyric-scale', String(scale));
  store.set(STORAGE_KEYS.lyricScale, String(scale));
  smaller.disabled = scale <= MIN_SCALE;
  bigger.disabled = scale >= MAX_SCALE;
};
setScale(scale);
smaller.addEventListener('click', () => setScale(scale - 0.1));
bigger.addEventListener('click', () => setScale(scale + 0.1));

// keep the screen awake while reading in the roda
const awake = tool('awake');
let lock: WakeLockSentinel | null = null;
let wantAwake = false; // the browser drops the lock when the tab is hidden; re-take it on return
if ('wakeLock' in navigator && awake) {
  awake.hidden = false;
  const request = async () => {
    try {
      lock = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  };
  const toggle = async () => {
    if (wantAwake) {
      wantAwake = false;
      // a lock the browser already dropped can't be released again; either way it's gone
      await lock?.release().catch(() => undefined);
      lock = null;
      say('Screen can sleep');
    } else if (await request()) {
      wantAwake = true;
      say('Screen stays on');
    } else {
      say("Couldn't keep the screen on");
    }
    awake.setAttribute('aria-pressed', String(wantAwake));
  };
  // toggle() catches every failure itself
  awake.addEventListener('click', () => void toggle());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantAwake) void request();
  });
}

// share: every failure is caught, ending in the link shown on screen
async function share() {
  const data = { title: document.title, url: location.href };
  if ('share' in navigator) {
    try {
      await navigator.share(data);
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // the share sheet was closed
    }
  }
  try {
    await navigator.clipboard.writeText(location.href);
    say('Link copied');
  } catch {
    say(location.href);
  }
}
tool('share')?.addEventListener('click', () => void share());

// remember recently viewed songs
const id = location.pathname.split('/').filter(Boolean).pop();
if (id) store.set(STORAGE_KEYS.recent, JSON.stringify(rememberRecent(store.get(STORAGE_KEYS.recent), id)));
