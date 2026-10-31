/** The player's engine for an <audio> recording, with an analyser for the audio-reactive gourd. */
import type { Engine, Events } from './player-engine';

export function audioEngine(audio: HTMLAudioElement, on: Events): Engine & { load(src: string): void } {
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
    // A context that stays suspended only stills the gourd animation.
    ctx?.resume().catch(() => undefined);
    on.onPlay();
  });
  audio.addEventListener('pause', () => on.onPause());
  audio.addEventListener('ended', () => on.onEnd());
  audio.addEventListener('loadedmetadata', () => on.onMeta());
  audio.addEventListener('error', () => {
    if (audio.getAttribute('src')) on.onError("Couldn't load this recording — are you offline?");
  });
  // metadata may already be there (cached file) before we attached the listener
  if (audio.readyState >= 1) queueMicrotask(() => on.onMeta());

  return {
    load(src) {
      audio.src = src;
      audio.load();
    },
    play() {
      ensureAnalyser();
      audio.play().catch((e: DOMException) => {
        // AbortError: superseded by pause/seek. NotAllowedError: autoplay blocked — just stay paused.
        if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') on.onError("Couldn't play this recording.");
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
