import { formatTime as fmt } from '../lib/media';
import { clampTime, lineAt, nextSpeed, parseTakes, progress, type Take } from '../lib/playback';
import { required, requiredClosest } from './dom';

/*
 * One set of controls (cabaça play button, wire seek bar, speed, loop, takes) driving
 * either an <audio> element or a YouTube embed, plus karaoke-style lyric sync.
 */

interface Engine {
  play(): void;
  pause(): void;
  seek(t: number): void;
  readonly time: number;
  readonly duration: number;
  readonly paused: boolean;
  rate: number;
  /** 0–1 loudness for the gourd animation */
  level(): number;
}

interface Events {
  play(): void;
  pause(): void;
  ended(): void;
  meta(): void;
  error(msg: string): void;
}

// After the reader scrolls, leave the page where they put it for this long before following the song again.
const SCROLL_PAUSE_MS = 3000;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ───────────────────────── audio ─────────────────────────

function audioEngine(audio: HTMLAudioElement, on: Events): Engine & { load(src: string): void } {
  let analyser: AnalyserNode | undefined;
  let buf: Uint8Array<ArrayBuffer> | undefined;
  let ctx: AudioContext | undefined;

  // Audio-reactive gourd. Same-origin only: a cross-origin file without CORS headers would go silent.
  const ensureAnalyser = () => {
    if (analyser || !('AudioContext' in window)) return;
    if (new URL(audio.currentSrc || audio.src, location.href).origin !== location.origin) return;
    try {
      ctx = new AudioContext();
      const node = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      buf = new Uint8Array(analyser.fftSize);
      node.connect(analyser).connect(ctx.destination);
    } catch {
      analyser = undefined;
    }
  };

  audio.addEventListener('play', () => {
    ctx?.resume();
    on.play();
  });
  audio.addEventListener('pause', () => on.pause());
  audio.addEventListener('ended', () => on.ended());
  audio.addEventListener('loadedmetadata', () => on.meta());
  audio.addEventListener('error', () => {
    if (audio.getAttribute('src')) on.error("Couldn't load this recording — are you offline?");
  });
  // metadata may already be there (cached file) before we attached the listener
  if (audio.readyState >= 1) queueMicrotask(() => on.meta());

  return {
    load(src) {
      audio.src = src;
      audio.load();
    },
    play() {
      ensureAnalyser();
      audio.play().catch((e: DOMException) => {
        // AbortError: superseded by pause/seek. NotAllowedError: autoplay blocked — just stay paused.
        if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') on.error("Couldn't play this recording.");
      });
    },
    pause: () => audio.pause(),
    seek: (t) => (audio.currentTime = t),
    get time() {
      return audio.currentTime;
    },
    get duration() {
      return audio.duration;
    },
    get paused() {
      return audio.paused;
    },
    get rate() {
      return audio.playbackRate;
    },
    set rate(r) {
      audio.playbackRate = r;
    },
    level() {
      if (!analyser || !buf) return 0;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      return Math.min(1, peak / 90);
    },
  };
}

// ───────────────────────── YouTube ─────────────────────────

/** The parts of YouTube's IFrame API player we use. Its methods only appear once it's ready. */
interface YTPlayer {
  playVideo?(): void;
  pauseVideo?(): void;
  seekTo?(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime?(): number;
  getDuration?(): number;
  getPlayerState?(): number;
  setPlaybackRate?(rate: number): void;
  destroy?(): void;
}

interface YTApi {
  Player: new (
    el: HTMLElement,
    options: {
      events: {
        onReady(e: { target: YTPlayer }): void;
        onStateChange(e: { data: number }): void;
        onError(): void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<YTApi> | undefined;
function loadYouTubeApi() {
  ytApi ??= new Promise<YTApi>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error('YouTube API missing'));
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      ytApi = undefined;
      reject(new Error('YouTube unavailable'));
    };
    document.head.append(s);
  });
  return ytApi;
}

function youtubeEngine(frame: HTMLElement, poster: HTMLElement | null, on: Events) {
  let player: YTPlayer | undefined;
  let ready: Promise<void> | undefined;
  let take: Take | undefined;
  let state = -1; // YT.PlayerState
  let rate = 1;
  let pendingSeek: number | undefined;

  const create = (t: Take, autoplay: boolean) => {
    // Insert the embed straight away, inside the user's tap, so the video starts even
    // before YouTube's control script has loaded (iOS only autoplays from a gesture).
    const params = new URLSearchParams({
      autoplay: autoplay ? '1' : '0',
      start: String(Math.floor(pendingSeek ?? t.start)),
      playsinline: '1',
      rel: '0',
      enablejsapi: '1',
      origin: location.origin,
    });
    if (t.end) params.set('end', String(Math.ceil(t.end)));
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${t.videoId}?${params}`;
    iframe.title = t.label;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
    poster?.setAttribute('hidden', '');
    pendingSeek = undefined;

    // Then attach the API for our controls (speed, loop, seek, lyric sync).
    ready = loadYouTubeApi().then(
      (YT) =>
        new Promise<void>((resolve) => {
          player = new YT.Player(iframe, {
            events: {
              onReady: (e) => {
                e.target.setPlaybackRate?.(rate);
                on.meta();
                // autoplay may already be running before the API attached
                if (e.target.getPlayerState?.() === 1) {
                  state = 1;
                  on.play();
                }
                resolve();
              },
              onStateChange: (e) => {
                state = e.data;
                if (e.data === 1) on.play();
                else if (e.data === 2) on.pause();
                else if (e.data === 0) on.ended();
              },
              onError: () => on.error("This video can't be played here — try opening it on YouTube."),
            },
          });
        }),
    );
    // The video itself still plays without the API; only our extra controls need it.
    ready.catch(() => undefined);
  };

  const engine: Engine & { load(t: Take): void } = {
    load(t) {
      take = t;
      state = -1;
      player?.destroy?.();
      player = undefined;
      ready = undefined;
      frame.innerHTML = '';
      poster?.removeAttribute('hidden');
      const img = poster?.querySelector('img');
      if (img && t.videoId) img.src = `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`;
    },
    play() {
      if (!take) return;
      if (!ready) create(take, true);
      else ready.then(() => player?.playVideo?.());
    },
    pause() {
      ready?.then(() => player?.pauseVideo?.());
    },
    seek(t) {
      if (!take) return;
      if (!ready) {
        pendingSeek = t;
        create(take, true);
        return;
      }
      ready.then(() => player?.seekTo?.(t, true));
    },
    get time() {
      return player?.getCurrentTime?.() ?? take?.start ?? 0;
    },
    get duration() {
      return player?.getDuration?.() || NaN;
    },
    get paused() {
      return state !== 1 && state !== 3;
    },
    get rate() {
      return rate;
    },
    set rate(r) {
      rate = r;
      player?.setPlaybackRate?.(r);
    },
    // No access to YouTube's audio, so the gourd just breathes while it plays.
    level() {
      return reducedMotion() ? 0 : 0.25 + 0.2 * Math.sin(performance.now() / 120);
    },
  };
  poster?.addEventListener('click', () => engine.play());
  return engine;
}

// ───────────────────────── controller ─────────────────────────

export function initPlayer(root: HTMLElement) {
  const slot = requiredClosest(root, '[data-player-slot]');
  const holder = requiredClosest(root, '[data-bar-holder]');
  const audio = required<HTMLAudioElement>(root, 'audio');
  const takes = parseTakes(JSON.parse(required(root, '[data-takes]').textContent || '[]'));
  if (!takes.length) return;
  const $ = <T extends HTMLElement>(sel: string) => required<T>(root, sel);
  const play = $<HTMLButtonElement>('[data-play]');
  const bar = $<HTMLInputElement>('[data-seek-bar]');
  const cur = $('[data-cur]');
  const dur = $('[data-dur]');
  const speedLabel = $('[data-speed-label]');
  const loop = $<HTMLButtonElement>('[data-loop]');
  const download = $<HTMLAnchorElement>('[data-download]');
  const ytLink = $<HTMLAnchorElement>('[data-youtube-link]');
  const nowLabel = $('[data-now-label]');
  const error = $('[data-error]');
  const takeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-take]')];
  const video = slot.querySelector<HTMLElement>('[data-video]');
  const syncIndex = Number(root.dataset.syncIndex ?? 0);
  const lyrics = document.querySelector<HTMLElement>('[data-lyrics]');
  const lines = [...document.querySelectorAll<HTMLElement>('.line[data-time]')].map((el) => ({
    el,
    t: Number(el.dataset.time),
  }));
  const lineTimes = lines.map((l) => l.t);

  let index = 0;
  let looping = false;
  let scrubbing = false;
  let started = false;
  let userScrolledAt = 0;
  let current: HTMLElement | undefined;
  let raf = 0;
  let smooth = 0;

  const events: Events = {
    play() {
      error.hidden = true;
      started = true;
      root.classList.add('playing');
      document.body.classList.add('playing');
      play.setAttribute('aria-label', 'Pause');
      lyrics?.classList.toggle('synced', synced());
      updateDock();
      setMediaState('playing');
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    },
    pause() {
      root.classList.remove('playing');
      document.body.classList.remove('playing');
      play.setAttribute('aria-label', 'Play');
      setAmp(0);
      setMediaState('paused');
      tick();
    },
    ended() {
      const t = takes[index];
      if (looping) {
        engine().seek(t.start);
        engine().play();
        return;
      }
      events.pause();
      current?.classList.remove('now');
      current = undefined;
      lyrics?.classList.remove('synced');
    },
    meta() {
      dur.textContent = fmt(range()[1]);
      tick();
    },
    error(msg) {
      error.textContent = msg;
      error.hidden = false;
      events.pause();
    },
  };

  const audioE = audioEngine(audio, events);
  const ytE = video ? youtubeEngine(required(video, '[data-frame]'), video.querySelector('[data-poster]'), events) : undefined;
  const engine = (): Engine => (takes[index].kind === 'youtube' && ytE ? ytE : audioE);
  // The engine only knows its video once a take is loaded — do it for the first take now,
  // otherwise a song whose first recording is a YouTube video can't be played.
  if (takes[0].kind === 'youtube') ytE?.load(takes[0]);

  /** The playable window of the current take: [start, end]. */
  const range = (): [number, number] => {
    const t = takes[index];
    return [t.start, t.end ?? engine().duration];
  };

  // ── karaoke
  const synced = () => lines.length > 0 && index === syncIndex;
  function highlight(t: number) {
    if (!synced()) return;
    const found = lines[lineAt(lineTimes, t)]?.el;
    if (found === current) return;
    current?.classList.remove('now');
    current = found;
    if (!found) return;
    found.classList.add('now');
    if (!engine().paused && Date.now() - userScrolledAt > SCROLL_PAUSE_MS)
      found.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  const userScrolled = () => (userScrolledAt = Date.now());
  addEventListener('touchmove', userScrolled, { passive: true });
  addEventListener('wheel', userScrolled, { passive: true });
  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) userScrolled();
  });

  function setAmp(v: number) {
    smooth = v;
    root.style.setProperty('--amp', v.toFixed(3));
    document.documentElement.style.setProperty('--amp', v.toFixed(3));
  }

  function tick() {
    const e = engine();
    const t = e.time;
    const [start, end] = range();
    if (Number.isFinite(end) && t >= end && !e.paused && takes[index].kind === 'audio') return events.ended();
    const p = progress(t, start, end);
    if (!scrubbing) {
      bar.value = String(Math.round(p * 1000));
      root.style.setProperty('--p', String(p));
    }
    cur.textContent = fmt(t);
    bar.setAttribute('aria-valuetext', `${fmt(t)} of ${fmt(end)}`);
    if (dur.textContent !== fmt(end)) dur.textContent = fmt(end);
    highlight(t);
    if (e.paused) return setAmp(0);
    setAmp(reducedMotion() ? 0 : smooth * 0.6 + e.level() * 0.4);
    raf = requestAnimationFrame(tick);
  }
  audio.addEventListener('timeupdate', () => audio.paused && tick());

  play.addEventListener('click', () => {
    const e = engine();
    if (!e.paused) return e.pause();
    const [start, end] = range();
    if (e.time < start - 0.5 || (Number.isFinite(end) && e.time >= end - 0.1)) e.seek(start);
    e.play();
  });

  bar.addEventListener('input', () => {
    scrubbing = true;
    const [start, end] = range();
    const t = start + (Number(bar.value) / 1000) * ((end || 0) - start);
    cur.textContent = fmt(t);
    root.style.setProperty('--p', String(Number(bar.value) / 1000));
  });
  bar.addEventListener('change', () => {
    scrubbing = false;
    const [start, end] = range();
    if (Number.isFinite(end)) engine().seek(start + (Number(bar.value) / 1000) * (end - start));
  });

  $<HTMLButtonElement>('[data-speed]').addEventListener('click', () => {
    const e = engine();
    const next = nextSpeed(e.rate);
    audioE.rate = next;
    if (ytE) ytE.rate = next;
    speedLabel.textContent = `${next}×`;
  });
  loop.addEventListener('click', () => {
    looping = !looping;
    loop.setAttribute('aria-pressed', String(looping));
  });

  function selectTake(i: number) {
    const wasPlaying = !engine().paused;
    engine().pause();
    index = i;
    const t = takes[i];
    error.hidden = true;
    if (t.kind === 'audio') audioE.load(t.src);
    else ytE?.load(t);
    if (video) video.hidden = t.kind !== 'youtube';
    download.hidden = t.kind !== 'audio';
    download.href = t.src;
    ytLink.hidden = t.kind !== 'youtube';
    ytLink.href = t.src;
    nowLabel.innerHTML = '';
    if (t.kind === 'youtube') {
      const badge = document.createElement('span');
      badge.className = 'yt-badge';
      badge.textContent = 'YouTube';
      nowLabel.append(badge);
    }
    nowLabel.append(t.label);
    takeButtons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.take) === i)));
    current?.classList.remove('now');
    current = undefined;
    lyrics?.classList.toggle('synced', synced() && wasPlaying);
    dur.textContent = fmt(range()[1]);
    setMediaMetadata();
    if (wasPlaying) {
      engine().seek(t.start);
      engine().play();
    }
  }
  takeButtons.forEach((b) => b.addEventListener('click', () => selectTake(Number(b.dataset.take))));

  // tap a timestamp in the lyrics to jump there
  document.querySelectorAll<HTMLElement>('[data-seek]').forEach((b) =>
    b.addEventListener('click', () => {
      if (index !== syncIndex) selectTake(syncIndex);
      engine().seek(Number(b.dataset.seek));
      engine().play();
    }),
  );

  // ── dock the controls to the bottom of the screen once they scroll out of view
  let visible = true;
  function updateDock() {
    const dock = !visible && started;
    if (dock && !root.classList.contains('docked')) holder.style.setProperty('--slot-h', `${holder.offsetHeight}px`);
    root.classList.toggle('docked', dock);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        updateDock();
      },
      // the sticky header covers the top of the page
      { rootMargin: `-${document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 64}px 0px 0px 0px` },
    ).observe(holder);
  }

  // ── lock-screen / headphone controls (audio only — YouTube manages its own)
  const session = 'mediaSession' in navigator ? navigator.mediaSession : undefined;
  function setMediaMetadata() {
    if (!session) return;
    const t = takes[index];
    session.metadata =
      t.kind === 'audio'
        ? new MediaMetadata({
            title: root.dataset.title,
            artist: t.performer ?? 'Capoeira Songs',
            album: t.label,
            artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
          })
        : null;
  }
  function setMediaState(s: MediaSessionPlaybackState) {
    if (!session || takes[index].kind !== 'audio') return;
    session.playbackState = s;
    const [start, end] = range();
    if (Number.isFinite(end))
      try {
        session.setPositionState({ duration: end, position: clampTime(audio.currentTime, start, end), playbackRate: audio.playbackRate });
      } catch {
        // Some browsers reject a position state they consider invalid; the lock screen just skips this update.
      }
  }
  if (session) {
    setMediaMetadata();
    const clamp = (t: number) => {
      const [start, end] = range();
      return clampTime(t, start, end);
    };
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => engine().play()],
      ['pause', () => engine().pause()],
      ['seekbackward', (d) => engine().seek(clamp(engine().time - (d.seekOffset ?? 5)))],
      ['seekforward', (d) => engine().seek(clamp(engine().time + (d.seekOffset ?? 5)))],
      ['seekto', (d) => d.seekTime != null && engine().seek(clamp(d.seekTime))],
    ];
    for (const [action, fn] of handlers)
      try {
        session.setActionHandler(action, fn);
      } catch {
        // This browser doesn't support the action: leave it out.
      }
  }
}
