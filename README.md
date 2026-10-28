# Capoeira Songs

Live at **https://capoeira-songs.pages.dev** — redeploys on every push to `main`.

A fast, phone-first website of capoeira songs: lyrics, translations and audio, with
instant search. Static site built with [Astro](https://astro.build) — no server, no
database to run, free to host.

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # type-checks, validates all song data, outputs dist/
```

Set your group name, title and licence in `src/site.config.ts`, and your real domain
in `astro.config.mjs` (`site:`).

## Adding a song

```sh
npm run new-song                                # asks a few questions
npm run new-song -- "Sou eu Maitá" ~/rec.m4a    # title + audio file up front
```

This creates `src/content/songs/<slug>.md` (copying any audio into
`public/audio/<slug>/`, and asking for an optional YouTube link). Open the file and write the lyrics:

```md
---
title: Paranauê
alternateTitles: [Paraná ê]
themes: [war, love]                   # src/data/themes.yaml
people: []                            # src/data/people.yaml
places: [parana]                      # src/data/places.yaml
related: [marinheiro-so]              # other song slugs
styles: [regional, contemporanea]     # angola | regional | contemporanea
summary: One line shown under the title and in link previews.
about: |
  Longer notes: history, meaning, variations.
recordings:
  - file: /audio/paranaue/roda-sabado.m4a
    performer: Mestre Fulano
    recordedAt: 2026-05-01
    sync: true                        # the [m:ss] timestamps below refer to this one
  - youtube: https://youtu.be/VIDEO_ID?t=95   # any YouTube link; ?t= sets the start
    title: Batizado 2025
    end: 2:40                         # optional: stop here (a song inside a long roda video)
added: 2026-10-28
---

## Coro
[0:04] Paranauê, paranauê, paraná
> Paranauê, paranauê, Paraná

## Solo
[0:09] Vou dizer a minha mulher, paraná
> I'm going to tell my wife, Paraná
+ Paranauê, paranauê, paraná
> (the coro answers)
```

- `## Coro` (or Chorus/Resposta) = everyone answers; any other heading (`## Solo`,
  `## Ladainha`, …) = the lead singer. Alternate them freely for call-and-response.
- `+ ` at the start of a line = the coro answers inside a solo section (keeps
  short call-and-response songs compact).
- `> ` under a line is its translation. A blank line starts a new stanza.
- `[m:ss]` timestamps are optional; when present, lines light up karaoke-style
  while the synced recording (audio **or** YouTube) plays and become tap-to-seek.
  Times are positions in that recording — for a video starting at `?t=95`, the
  first line might be `[1:37]`.
- Words from `src/data/glossary.yaml` are underlined automatically with a tap-to-explain popup.
- `draft: true` hides a song from the production build.

**The build fails** on a misspelled id, a missing audio file or a malformed field,
so a broken song can't reach the live site.

To add a new theme, person, place or glossary word, add an entry to the matching YAML
file in `src/data/`. Each song's **difficulty** (Easy / Medium / Hard) is worked out
automatically from how many words there are to learn in its distinct lines.

### Removing a song

Delete its file in `src/content/songs/` (and its folder in `public/audio/`), then add
two lines to `public/_redirects` so old links go to the song list:

```
/songs/<slug>/ /songs/ 301
/songs/<slug> /songs/ 301
```

Without this, Cloudflare Pages keeps serving its cached copy of the deleted page for
up to a week.

### YouTube

A recording can be a YouTube link instead of a file (`watch?v=`, `youtu.be/`,
`shorts/`, `live/` all work). The page shows a lightweight thumbnail and only loads
YouTube's player (privacy-enhanced, `youtube-nocookie.com`) when someone presses
play. The same controls — speed, loop, start/end, karaoke sync — work for videos.
A song can mix audio files and a video; listeners switch between them. **One YouTube
video per song at most** — the build fails if a song has two. Videos are listed before
any roda recording.

### Audio tips

Export clips as `.m4a` (AAC) or `.mp3` at ~96–128 kbps — a 1-minute clip is about
1 MB. Files live in `public/audio/` and are committed with the site. If the
collection grows past a few hundred MB, move them to object storage (e.g. Cloudflare
R2) and use full `https://` URLs in `file:` — everything else keeps working.

## Features

- **Search** (`/` or ⌘K anywhere): accent-insensitive (`sao bento` → São Bento),
  typo-tolerant, matches titles, lyrics *and* English translations, shows the
  matching line, filters by song type, shareable `?q=` URLs.
- **Song page**: call-and-response layout, translation toggle, text size, keep-screen-on
  (for reading in the roda), share, glossary popups, related songs.
- **Player**: audio files and YouTube videos behind one set of controls. The cabaça is
  the play button and pulses with the audio; the wire is the progress bar; 0.5×/0.75×
  speed for learning, loop, start/end clipping, multiple takes, lock-screen controls,
  docks to the bottom of the screen as you scroll.
- **Offline**: the service worker precaches the whole site (pages, styles, fonts, search
  index) on first visit and refreshes automatically whenever a song changes. Audio and
  YouTube need a connection. Installable to the home screen.
- **Open data**: `/api/songs.json` (all songs with structured lyrics) and
  `/api/ontology.json` (all taxonomies); schema.org `MusicComposition` JSON-LD on every
  song; `sitemap.xml` and `robots.txt`.
- Visual language shared with Brasil Seis (paper, petrol ink, brass; Fraunces, Hanken
  Grotesk, Space Mono), with an animated berimbau rhythm grid. Respects reduced-motion.

## Data model

```
Song ──type──▶ SongType   ──toques──▶ Toque   ──themes──▶ Theme
     ──people─▶ Person    ──places──▶ Place   ──related─▶ Song
     ──recordings (audio, optionally time-synced)
GlossaryTerm (linked into lyrics automatically)
```

Schemas: `src/content.config.ts`. Lyrics parser: `src/lib/lyrics.ts`.

## Deploying — Cloudflare Pages

Static site, so hosting is free and there's no server to run. Cloudflare Pages project
**`capoeira-songs`**, connected to this GitHub repo (the Cloudflare GitHub app has
access to this repo only). Unlike Brasil Seis it isn't behind Cloudflare Access — the
songbook is public.

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** →
   pick `capoeira-website`.
3. Build settings: framework preset **Astro**, **Build command** `npm run build`,
   **Output directory** `dist`. Node comes from `.node-version`.
4. Deploy. You get a `*.pages.dev` URL — put it (or your custom domain) in `site:` in
   `astro.config.mjs` so canonical links, the sitemap and JSON-LD point at the right
   place, then push again.

Every push to `main` redeploys; pull requests get preview URLs. Cache headers live in
`public/_headers`.
