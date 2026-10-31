/** What the player's controls drive, and what an engine reports back: the contract the audio and YouTube engines share. */

export interface Engine {
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

/** What an engine reports back. These only update the controls; they don't start or stop anything. */
export interface Events {
  onPlay(): void;
  onPause(): void;
  onEnd(): void;
  onMeta(): void;
  onError(msg: string): void;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
