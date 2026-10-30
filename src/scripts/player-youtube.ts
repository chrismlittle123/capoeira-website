/** The player's engine for a YouTube recording: the embed, and YouTube's IFrame API for our controls. */
import { youtubeEmbedUrl, youtubeThumbnailUrl } from '../lib/player/media';
import type { Take } from '../lib/player/playback';
import { reducedMotion, type Engine, type Events } from './player-engine';

type YouTubeTake = Extract<Take, { kind: 'youtube' }>;

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

interface YTEvents {
  onReady(e: { target: YTPlayer }): void;
  onStateChange(e: { data: number }): void;
  onError(): void;
}

interface YTApi {
  Player: new (el: HTMLElement, options: { events: YTEvents }) => YTPlayer;
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

/** The embed for a take, starting at `start` seconds, autoplaying when asked. */
function embedFor(t: YouTubeTake, start: number, autoplay: boolean): HTMLIFrameElement {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    start: String(Math.floor(start)),
    playsinline: '1',
    rel: '0',
    enablejsapi: '1',
    origin: location.origin,
  });
  if (t.end) params.set('end', String(Math.ceil(t.end)));
  const iframe = document.createElement('iframe');
  iframe.src = `${youtubeEmbedUrl(t.videoId)}?${params}`;
  iframe.title = t.label;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  return iframe;
}

/** YouTube's player events, passed on to ours; `setState` records YT.PlayerState, `ready` fires once. */
function apiEvents(on: Events, rate: () => number, setState: (s: number) => void, ready: () => void): YTEvents {
  return {
    onReady: (e) => {
      e.target.setPlaybackRate?.(rate());
      on.onMeta();
      // autoplay may already be running before the API attached
      if (e.target.getPlayerState?.() === 1) {
        setState(1);
        on.onPlay();
      }
      ready();
    },
    onStateChange: (e) => {
      setState(e.data);
      if (e.data === 1) on.onPlay();
      else if (e.data === 2) on.onPause();
      else if (e.data === 0) on.onEnd();
    },
    onError: () => on.onError("This video can't be played here — try opening it on YouTube."),
  };
}

export function youtubeEngine(frame: HTMLElement, poster: HTMLElement | null, on: Events) {
  let player: YTPlayer | undefined;
  // Never rejects: a failure to load the API is reported once, and it resolves anyway.
  let ready: Promise<void> | undefined;
  let take: Take | undefined;
  let state = -1; // YT.PlayerState
  let rate = 1;
  let pendingSeek: number | undefined;

  const create = (t: Take, autoplay: boolean) => {
    if (t.kind !== 'youtube') return;
    // Insert the embed straight away, inside the user's tap, so the video starts even
    // before YouTube's control script has loaded (iOS only autoplays from a gesture).
    const iframe = embedFor(t, pendingSeek ?? t.start, autoplay);
    frame.replaceChildren(iframe);
    poster?.setAttribute('hidden', '');
    pendingSeek = undefined;

    // Then attach the API for our controls (speed, loop, seek, lyric sync).
    const setState = (s: number) => (state = s);
    ready = loadYouTubeApi().then(
      (YT) => new Promise<void>((resolve) => (player = new YT.Player(iframe, { events: apiEvents(on, () => rate, setState, resolve) }))),
    );
    // The video itself still plays without the API; only our extra controls need it. The
    // failure is reported here once, and `ready` then resolves so later calls are no-ops.
    ready = ready.catch(() => on.onError("YouTube's player controls didn't load: use the video's own controls."));
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
      if (img && t.kind === 'youtube') img.src = youtubeThumbnailUrl(t.videoId);
    },
    play() {
      if (!take) return;
      if (!ready) create(take, true);
      else void ready.then(() => player?.playVideo?.());
    },
    pause() {
      void ready?.then(() => player?.pauseVideo?.());
    },
    seek(t) {
      if (!take) return;
      if (!ready) {
        pendingSeek = t;
        create(take, true);
        return;
      }
      void ready.then(() => player?.seekTo?.(t, true));
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
