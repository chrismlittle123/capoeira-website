/**
 * One set of controls (cabaça play button, wire seek bar, speed, loop, takes) driving
 * either an <audio> element or a YouTube embed, plus karaoke-style lyric sync.
 * The engines are in player-audio.ts and player-youtube.ts, the lock screen in
 * player-media-session.ts.
 */
import { formatTime } from '../lib/player/media';
import { lineAt, nextSpeed, parseTakes, progress, type Take } from '../lib/player/playback';
import { required, requiredClosest } from './dom';
import { audioEngine } from './player-audio';
import { reducedMotion, type Engine, type Events } from './player-engine';
import { mediaSession, type MediaControls } from './player-media-session';
import { youtubeEngine } from './player-youtube';

// After the reader scrolls, leave the page where they put it for this long before following the song again.
const SCROLL_PAUSE_MS = 3000;

/** The player's markup: the controls inside `root`, and the slot and lyrics around it. */
function findUi(root: HTMLElement) {
  const $ = <T extends HTMLElement>(sel: string) => required<T>(root, sel);
  const bar = $<HTMLInputElement>('[data-seek-bar]');
  return {
    root,
    holder: requiredClosest(root, '[data-bar-holder]'),
    audio: required<HTMLAudioElement>(root, 'audio'),
    play: $<HTMLButtonElement>('[data-play]'),
    bar,
    // the bar runs from 0 to its max
    seekSteps: Number(bar.max),
    cur: $('[data-cur]'),
    dur: $('[data-dur]'),
    speed: $<HTMLButtonElement>('[data-speed]'),
    speedLabel: $('[data-speed-label]'),
    loop: $<HTMLButtonElement>('[data-loop]'),
    download: $<HTMLAnchorElement>('[data-download]'),
    ytLink: $<HTMLAnchorElement>('[data-youtube-link]'),
    nowLabel: $('[data-now-label]'),
    error: $('[data-error]'),
    takeButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-take]')],
    video: requiredClosest(root, '[data-player-slot]').querySelector<HTMLElement>('[data-video]'),
    lyrics: document.querySelector<HTMLElement>('[data-lyrics]'),
  };
}
type Ui = ReturnType<typeof findUi>;

interface LyricLine {
  el: HTMLElement;
  t: number;
}

export function initPlayer(root: HTMLElement) {
  const takes = parseTakes(JSON.parse(required(root, '[data-takes]').textContent || '[]'));
  if (!takes.length) return;
  const lines = [...document.querySelectorAll<HTMLElement>('.line[data-time]')].map((el) => ({
    el,
    t: Number(el.dataset.time),
  }));
  new Player(findUi(root), takes, lines, Number(root.dataset.syncIndex ?? 0)).wire();
}

class Player implements Events {
  private index = 0;
  private looping = false;
  private scrubbing = false;
  private started = false;
  private visible = true;
  private userScrolledAt = 0;
  private current: HTMLElement | undefined;
  private raf = 0;
  private smooth = 0;
  private readonly lineTimes: number[];
  private readonly audioE: ReturnType<typeof audioEngine>;
  private readonly ytE: ReturnType<typeof youtubeEngine> | undefined;
  private readonly session: MediaControls;

  constructor(
    private readonly ui: Ui,
    private readonly takes: Take[],
    private readonly lines: LyricLine[],
    private readonly syncIndex: number,
  ) {
    this.lineTimes = lines.map((l) => l.t);
    this.audioE = audioEngine(ui.audio, this);
    const video = ui.video;
    this.ytE = video ? youtubeEngine(required(video, '[data-frame]'), video.querySelector('[data-poster]'), this) : undefined;
    // The engine only knows its video once a take is loaded — do it for the first take now,
    // otherwise a song whose first recording is a YouTube video can't be played.
    if (takes[0].kind === 'youtube') this.ytE?.load(takes[0]);
    this.session = mediaSession({
      take: () => this.take,
      engine: () => this.engine(),
      range: () => this.range(),
      audio: ui.audio,
      title: ui.root.dataset.title,
    });
  }

  private get take(): Take {
    return this.takes[this.index];
  }

  private engine(): Engine {
    return this.take.kind === 'youtube' && this.ytE ? this.ytE : this.audioE;
  }

  /** The playable window of the current take: [start, end]. */
  private range(): [number, number] {
    return [this.take.start, this.take.end ?? this.engine().duration];
  }

  // ── what the engines report

  onPlay() {
    const { ui } = this;
    ui.error.hidden = true;
    this.started = true;
    ui.root.classList.add('playing');
    document.body.classList.add('playing');
    ui.play.setAttribute('aria-label', 'Pause');
    ui.lyrics?.classList.toggle('synced', this.synced());
    this.updateDock();
    this.session.setState('playing');
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  onPause() {
    this.ui.root.classList.remove('playing');
    document.body.classList.remove('playing');
    this.ui.play.setAttribute('aria-label', 'Play');
    this.setAmp(0);
    this.session.setState('paused');
    this.tick();
  }

  onEnd() {
    if (this.looping) {
      this.engine().seek(this.take.start);
      this.engine().play();
      return;
    }
    // An audio take with an `end:` is still playing when it gets here: stop it, or tick()
    // would see it running past its end and call onEnd again, forever.
    this.engine().pause();
    this.onPause();
    this.current?.classList.remove('now');
    this.current = undefined;
    this.ui.lyrics?.classList.remove('synced');
  }

  onMeta() {
    this.ui.dur.textContent = formatTime(this.range()[1]);
    this.tick();
  }

  onError(msg: string) {
    this.ui.error.textContent = msg;
    this.ui.error.hidden = false;
    this.onPause();
  }

  // ── karaoke

  private synced() {
    return this.lines.length > 0 && this.index === this.syncIndex;
  }

  private highlight(t: number) {
    if (!this.synced()) return;
    const found = this.lines[lineAt(this.lineTimes, t)]?.el;
    if (found === this.current) return;
    this.current?.classList.remove('now');
    this.current = found;
    if (!found) return;
    found.classList.add('now');
    if (!this.engine().paused && Date.now() - this.userScrolledAt > SCROLL_PAUSE_MS)
      found.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  private setAmp(v: number) {
    this.smooth = v;
    this.ui.root.style.setProperty('--amp', v.toFixed(3));
    document.documentElement.style.setProperty('--amp', v.toFixed(3));
  }

  /** Bring the bar, the times and the lyrics up to the engine's position; runs every frame while playing. */
  private readonly tick = (): void => {
    const { ui } = this;
    const e = this.engine();
    const t = e.time;
    const [start, end] = this.range();
    if (Number.isFinite(end) && t >= end && !e.paused && this.take.kind === 'audio') return this.onEnd();
    const p = progress(t, start, end);
    if (!this.scrubbing) {
      ui.bar.value = String(Math.round(p * ui.seekSteps));
      ui.root.style.setProperty('--p', String(p));
    }
    ui.cur.textContent = formatTime(t);
    ui.bar.setAttribute('aria-valuetext', `${formatTime(t)} of ${formatTime(end)}`);
    if (ui.dur.textContent !== formatTime(end)) ui.dur.textContent = formatTime(end);
    this.highlight(t);
    if (e.paused) return this.setAmp(0);
    this.setAmp(reducedMotion() ? 0 : this.smooth * 0.6 + e.level() * 0.4);
    this.raf = requestAnimationFrame(this.tick);
  };

  // ── takes

  private selectTake(i: number) {
    const wasPlaying = !this.engine().paused;
    this.engine().pause();
    this.index = i;
    const t = this.take;
    this.ui.error.hidden = true;
    if (t.kind === 'audio') this.audioE.load(t.src);
    else this.ytE?.load(t);
    this.showTake(t, i);
    this.current?.classList.remove('now');
    this.current = undefined;
    this.ui.lyrics?.classList.toggle('synced', this.synced() && wasPlaying);
    this.ui.dur.textContent = formatTime(this.range()[1]);
    this.session.setMetadata();
    if (wasPlaying) {
      this.engine().seek(t.start);
      this.engine().play();
    }
  }

  /** The controls that depend on which take is chosen: its links, its label, the pressed button. */
  private showTake(t: Take, i: number) {
    const { ui } = this;
    if (ui.video) ui.video.hidden = t.kind !== 'youtube';
    ui.download.hidden = t.kind !== 'audio';
    ui.download.href = t.src;
    ui.ytLink.hidden = t.kind !== 'youtube';
    ui.ytLink.href = t.src;
    ui.nowLabel.innerHTML = '';
    if (t.kind === 'youtube') {
      const badge = document.createElement('span');
      badge.className = 'yt-badge';
      badge.textContent = 'YouTube';
      ui.nowLabel.append(badge);
    }
    ui.nowLabel.append(t.label);
    ui.takeButtons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.take) === i)));
  }

  // ── wiring

  wire() {
    this.wireControls();
    this.wireLyrics();
    this.wireDock();
  }

  private wireControls() {
    const { ui } = this;
    ui.audio.addEventListener('timeupdate', () => ui.audio.paused && this.tick());
    ui.play.addEventListener('click', () => {
      const e = this.engine();
      if (!e.paused) return e.pause();
      const [start, end] = this.range();
      if (e.time < start - 0.5 || (Number.isFinite(end) && e.time >= end - 0.1)) e.seek(start);
      e.play();
    });
    ui.bar.addEventListener('input', () => {
      this.scrubbing = true;
      const [start, end] = this.range();
      const fraction = Number(ui.bar.value) / ui.seekSteps;
      // until the length is known there's no time to show for a position
      if (Number.isFinite(end)) ui.cur.textContent = formatTime(start + fraction * (end - start));
      ui.root.style.setProperty('--p', String(fraction));
    });
    ui.bar.addEventListener('change', () => {
      this.scrubbing = false;
      const [start, end] = this.range();
      if (Number.isFinite(end)) this.engine().seek(start + (Number(ui.bar.value) / ui.seekSteps) * (end - start));
    });
    ui.speed.addEventListener('click', () => {
      const next = nextSpeed(this.engine().rate);
      this.audioE.rate = next;
      if (this.ytE) this.ytE.rate = next;
      ui.speedLabel.textContent = `${next}×`;
    });
    ui.loop.addEventListener('click', () => {
      this.looping = !this.looping;
      ui.loop.setAttribute('aria-pressed', String(this.looping));
    });
    ui.takeButtons.forEach((b) => b.addEventListener('click', () => this.selectTake(Number(b.dataset.take))));
  }

  private wireLyrics() {
    const userScrolled = () => (this.userScrolledAt = Date.now());
    addEventListener('touchmove', userScrolled, { passive: true });
    addEventListener('wheel', userScrolled, { passive: true });
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) userScrolled();
    });
    // tap a timestamp in the lyrics to jump there
    document.querySelectorAll<HTMLElement>('[data-seek]').forEach((b) =>
      b.addEventListener('click', () => {
        if (this.index !== this.syncIndex) this.selectTake(this.syncIndex);
        this.engine().seek(Number(b.dataset.seek));
        this.engine().play();
      }),
    );
  }

  // ── dock the controls to the bottom of the screen once they scroll out of view

  private updateDock() {
    const { root, holder } = this.ui;
    const dock = !this.visible && this.started;
    if (dock && !root.classList.contains('docked')) holder.style.setProperty('--slot-h', `${holder.offsetHeight}px`);
    root.classList.toggle('docked', dock);
  }

  private wireDock() {
    if (!('IntersectionObserver' in window)) return;
    new IntersectionObserver(
      ([e]) => {
        this.visible = e.isIntersecting;
        this.updateDock();
      },
      // the sticky header covers the top of the page
      { rootMargin: `-${document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 64}px 0px 0px 0px` },
    ).observe(this.ui.holder);
  }
}
