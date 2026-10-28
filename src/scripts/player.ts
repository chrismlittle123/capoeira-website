const fmt = (t: number) =>
  Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '–:––';

const SPEEDS = [1, 0.75, 0.5, 1.25];

export function initPlayer(root: HTMLElement) {
  const audio = root.querySelector('audio')!;
  const play = root.querySelector<HTMLButtonElement>('[data-play]')!;
  const bar = root.querySelector<HTMLInputElement>('[data-seek-bar]')!;
  const cur = root.querySelector<HTMLElement>('[data-cur]')!;
  const dur = root.querySelector<HTMLElement>('[data-dur]')!;
  const speed = root.querySelector<HTMLButtonElement>('[data-speed]')!;
  const loop = root.querySelector<HTMLButtonElement>('[data-loop]')!;
  const download = root.querySelector<HTMLAnchorElement>('[data-download]')!;
  const nowLabel = root.querySelector<HTMLElement>('[data-now-label]')!;
  const takes = [...root.querySelectorAll<HTMLButtonElement>('[data-take]')];
  const syncIndex = Number(root.dataset.syncIndex ?? 0);
  const lyrics = document.querySelector<HTMLElement>('[data-lyrics]');
  const lines = [...document.querySelectorAll<HTMLElement>('.line[data-time]')].map((el) => ({
    el,
    t: Number(el.dataset.time),
  }));
  let take = 0;
  let scrubbing = false;
  let userScrolledAt = 0;
  let current: HTMLElement | undefined;

  // ── audio-reactive cabaça (same-origin files only: a cross-origin source without CORS would go silent)
  let analyser: AnalyserNode | undefined;
  let buf: Uint8Array<ArrayBuffer> | undefined;
  const sameOrigin = () => new URL(audio.currentSrc || audio.src, location.href).origin === location.origin;
  function ensureAnalyser() {
    if (analyser || !sameOrigin() || !('AudioContext' in window)) return;
    try {
      const ctx = new AudioContext();
      const node = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      buf = new Uint8Array(analyser.fftSize);
      node.connect(analyser).connect(ctx.destination);
      audio.addEventListener('play', () => ctx.resume());
    } catch {
      analyser = undefined;
    }
  }
  const level = () => {
    if (!analyser || !buf) return 0;
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    return Math.min(1, peak / 90);
  };

  // ── karaoke
  const synced = () => lines.length > 0 && take === syncIndex;
  function highlight(t: number) {
    if (!synced()) return;
    let found: HTMLElement | undefined;
    for (const l of lines) if (l.t <= t + 0.15) found = l.el;
    if (found === current) return;
    current?.classList.remove('now');
    current = found;
    if (!found) return;
    found.classList.add('now');
    if (Date.now() - userScrolledAt > 3000) found.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  addEventListener('touchmove', () => (userScrolledAt = Date.now()), { passive: true });
  addEventListener('wheel', () => (userScrolledAt = Date.now()), { passive: true });

  let raf = 0;
  let smooth = 0;
  function tick() {
    const t = audio.currentTime;
    if (!scrubbing && audio.duration) {
      bar.value = String((t / audio.duration) * 1000);
      root.style.setProperty('--p', String(t / audio.duration));
    }
    cur.textContent = fmt(t);
    highlight(t);
    smooth = smooth * 0.6 + level() * 0.4;
    root.style.setProperty('--amp', smooth.toFixed(3));
    document.documentElement.style.setProperty('--amp', smooth.toFixed(3));
    if (!audio.paused) raf = requestAnimationFrame(tick);
  }

  play.addEventListener('click', () => {
    ensureAnalyser();
    audio.paused ? audio.play() : audio.pause();
  });
  audio.addEventListener('play', () => {
    root.classList.add('playing');
    document.body.classList.add('playing');
    play.setAttribute('aria-label', 'Pause');
    lyrics?.classList.toggle('synced', synced());
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  });
  audio.addEventListener('pause', () => {
    root.classList.remove('playing');
    document.body.classList.remove('playing');
    play.setAttribute('aria-label', 'Play');
    root.style.setProperty('--amp', '0');
    document.documentElement.style.setProperty('--amp', '0');
  });
  audio.addEventListener('ended', () => audio.dispatchEvent(new Event('pause')));
  audio.addEventListener('loadedmetadata', () => (dur.textContent = fmt(audio.duration)));
  audio.addEventListener('timeupdate', () => audio.paused && tick());

  bar.addEventListener('input', () => {
    scrubbing = true;
    const t = (Number(bar.value) / 1000) * (audio.duration || 0);
    cur.textContent = fmt(t);
    root.style.setProperty('--p', String(Number(bar.value) / 1000));
  });
  bar.addEventListener('change', () => {
    scrubbing = false;
    if (audio.duration) audio.currentTime = (Number(bar.value) / 1000) * audio.duration;
  });

  speed.addEventListener('click', () => {
    const next = SPEEDS[(SPEEDS.indexOf(audio.playbackRate) + 1) % SPEEDS.length];
    audio.playbackRate = next;
    speed.textContent = `${next}×`;
  });
  loop.addEventListener('click', () => {
    audio.loop = !audio.loop;
    loop.setAttribute('aria-pressed', String(audio.loop));
  });

  for (const btn of takes) {
    btn.addEventListener('click', () => {
      take = Number(btn.dataset.take);
      const wasPlaying = !audio.paused;
      audio.src = btn.dataset.src!;
      download.href = btn.dataset.src!;
      nowLabel.textContent = btn.dataset.label!;
      takes.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      current?.classList.remove('now');
      current = undefined;
      lyrics?.classList.toggle('synced', synced());
      if (wasPlaying) audio.play();
    });
  }

  // tap a timestamp in the lyrics to jump there
  document.querySelectorAll<HTMLElement>('[data-seek]').forEach((b) =>
    b.addEventListener('click', () => {
      if (take !== syncIndex) takes[syncIndex]?.click();
      ensureAnalyser();
      audio.currentTime = Number(b.dataset.seek);
      audio.play();
    }),
  );

  // dock to the bottom of the screen once it scrolls out of view (after playback has started)
  const slot = root.closest<HTMLElement>('[data-player-slot]');
  let started = false;
  if (slot && 'IntersectionObserver' in window) {
    let visible = true;
    const update = () => {
      if (!visible && started) slot.style.setProperty('--slot-h', `${slot.offsetHeight}px`);
      root.classList.toggle('docked', !visible && started);
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      update();
    }).observe(slot);
    audio.addEventListener('play', () => {
      started = true;
      update();
    });
  }

  // lock-screen / headphone controls
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: root.dataset.title,
      artist: root.dataset.artist,
      artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => (audio.currentTime = Math.max(0, audio.currentTime - 5)));
    navigator.mediaSession.setActionHandler('seekforward', () => (audio.currentTime += 5));
  }
}
