import { formatTime as fmt } from '../lib/media';

/*
 * One set of controls (cabaça play button, wire seek bar, speed, loop, takes) driving
 * either an <audio> element or a YouTube embed, plus karaoke-style lyric sync.
 */

interface Take {
  kind: 'audio' | 'youtube';
  src: string;
  videoId?: string;
  start: number;
  end?: number;
  label: string;
  performer?: string;
}

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

const SPEEDS = [1, 0.75, 0.5, 1.25];
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

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<any> | undefined;
function loadYouTubeApi() {
  ytApi ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
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
  let player: any;
  let ready: Promise<void> | undefined;
  let take: Take | undefined;
  let state = -1; // YT.PlayerState
  let rate = 1;
  let pendingSeek: number | undefined;

  const create = (t: Take, autoplay: boolean) => {
    ready = loadYouTubeApi().then(
      (YT) =>
        new Promise<void>((resolve) => {
          frame.innerHTML = '<div></div>';
          player = new YT.Player(frame.firstElementChild, {
            host: 'https://www.youtube-nocookie.com',
            videoId: t.videoId,
            playerVars: {
              start: Math.floor(t.start),
              ...(t.end && { end: Math.ceil(t.end) }),
              autoplay: autoplay ? 1 : 0,
              playsinline: 1,
              rel: 0,
              modestbranding: 1,
            },
            events: {
              onReady: () => {
                poster?.setAttribute('hidden', '');
                player.setPlaybackRate(rate);
                if (pendingSeek != null) player.seekTo(pendingSeek, true);
                pendingSeek = undefined;
                if (autoplay) player.playVideo();
                on.meta();
                resolve();
              },
              onStateChange: (e: { data: number }) => {
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
    ready.catch(() => on.error("Couldn't reach YouTube — are you offline?"));
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
      else ready.then(() => player.playVideo());
    },
    pause() {
      ready?.then(() => player.pauseVideo());
    },
    seek(t) {
      if (!take) return;
      if (!player) {
        pendingSeek = t;
        if (!ready) create(take, true);
        return;
      }
      player.seekTo(t, true);
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
  const slot = root.closest<HTMLElement>('[data-player-slot]')!;
  const holder = root.closest<HTMLElement>('[data-bar-holder]')!;
  const audio = root.querySelector('audio')!;
  const takes: Take[] = JSON.parse(root.querySelector('[data-takes]')!.textContent!);
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
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
  const ytE = video ? youtubeEngine(video.querySelector('[data-frame]')!, video.querySelector('[data-poster]'), events) : undefined;
  const engine = (): Engine => (takes[index].kind === 'youtube' ? ytE! : audioE);

  /** The playable window of the current take: [start, end]. */
  const range = (): [number, number] => {
    const t = takes[index];
    return [t.start, t.end ?? engine().duration];
  };

  // ── karaoke
  const synced = () => lines.length > 0 && index === syncIndex;
  function highlight(t: number) {
    if (!synced()) return;
    let found: HTMLElement | undefined;
    for (const l of lines) if (l.t <= t + 0.15) found = l.el;
    if (found === current) return;
    current?.classList.remove('now');
    current = found;
    if (!found) return;
    found.classList.add('now');
    if (!engine().paused && Date.now() - userScrolledAt > 3000)
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
    const p = Number.isFinite(end) && end > start ? Math.min(1, Math.max(0, (t - start) / (end - start))) : 0;
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
    const next = SPEEDS[(SPEEDS.indexOf(e.rate) + 1) % SPEEDS.length];
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
      { rootMargin: '-64px 0px 0px 0px' }, // the sticky header covers the top 64px
    ).observe(holder);
  }

  // ── lock-screen / headphone controls (audio only — YouTube manages its own)
  const ms = 'mediaSession' in navigator ? navigator.mediaSession : undefined;
  function setMediaMetadata() {
    if (!ms) return;
    const t = takes[index];
    ms.metadata =
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
    if (!ms || takes[index].kind !== 'audio') return;
    ms.playbackState = s;
    const [start, end] = range();
    if (Number.isFinite(end))
      try {
        ms.setPositionState({ duration: end, position: Math.min(end, Math.max(start, audio.currentTime)), playbackRate: audio.playbackRate });
      } catch {}
  }
  if (ms) {
    setMediaMetadata();
    const clamp = (t: number) => {
      const [start, end] = range();
      return Math.max(start, Number.isFinite(end) ? Math.min(end, t) : t);
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
        ms.setActionHandler(action, fn);
      } catch {}
  }
}
