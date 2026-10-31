/** Lock-screen and headphone controls for the player (audio only — YouTube manages its own). */
import { SITE } from '../site.config';
import { clampTime, type Take } from '../lib/player/playback';
import type { Engine } from './player-engine';

// Lock-screen skip back/forward, in seconds, when the system doesn't say.
const SKIP_SECONDS = 5;

/** What the lock screen reads from the player, each time it needs it. */
export interface NowPlaying {
  take(): Take;
  engine(): Engine;
  /** The playable window of the current take: [start, end]. */
  range(): [number, number];
  audio: HTMLAudioElement;
  title: string | undefined;
}

export interface MediaControls {
  setMetadata(): void;
  setState(s: MediaSessionPlaybackState): void;
}

export function mediaSession(now: NowPlaying): MediaControls {
  const session = 'mediaSession' in navigator ? navigator.mediaSession : undefined;

  function setMetadata() {
    if (!session) return;
    const t = now.take();
    session.metadata =
      t.kind === 'audio'
        ? new MediaMetadata({ title: now.title ?? '', artist: t.performer ?? SITE.title, album: t.label, artwork: [SITE.icon] })
        : null;
  }

  function setState(s: MediaSessionPlaybackState) {
    if (!session || now.take().kind !== 'audio') return;
    session.playbackState = s;
    const [start, end] = now.range();
    if (Number.isFinite(end))
      try {
        session.setPositionState({ duration: end, position: clampTime(now.audio.currentTime, start, end), playbackRate: now.audio.playbackRate });
      } catch {
        // Some browsers reject a position state they consider invalid; the lock screen just skips this update.
      }
  }

  if (session) {
    setMetadata();
    const clamp = (t: number) => {
      const [start, end] = now.range();
      return clampTime(t, start, end);
    };
    const seekBy = (d: MediaSessionActionDetails, sign: number) =>
      now.engine().seek(clamp(now.engine().time + sign * (d.seekOffset ?? SKIP_SECONDS)));
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => now.engine().play()],
      ['pause', () => now.engine().pause()],
      ['seekbackward', (d) => seekBy(d, -1)],
      ['seekforward', (d) => seekBy(d, 1)],
      ['seekto', (d) => typeof d.seekTime === 'number' && now.engine().seek(clamp(d.seekTime))],
    ];
    for (const [action, fn] of handlers)
      try {
        session.setActionHandler(action, fn);
      } catch {
        // This browser doesn't support the action: leave it out.
      }
  }
  return { setMetadata, setState };
}
