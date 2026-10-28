# Cantigas — capoeira songbook

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

This creates `src/content/songs/<slug>.md` (and copies the audio into
`public/audio/<slug>/`). Open the file and write the lyrics:

```md
---
title: Paranauê
alternateTitles: [Paraná ê]
type: corrido                         # id from src/data/song-types.yaml
toques: [sao-bento-grande-regional]   # ids from src/data/toques.yaml
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
added: 2026-10-28
---

## Coro
[0:04] Paranauê, paranauê, paraná
> Paranauê, paranauê, Paraná

## Solo
[0:09] Vou dizer a minha mulher, paraná
> I'm going to tell my wife, Paraná
```

- `## Coro` (or Chorus/Resposta) = everyone answers; any other heading (`## Solo`,
  `## Ladainha`, …) = the lead singer. Alternate them freely for call-and-response.
- `> ` under a line is its translation. A blank line starts a new stanza.
- `[m:ss]` timestamps are optional; when present, lines light up karaoke-style
  while the synced recording plays and become tap-to-seek.
- Words from `src/data/glossary.yaml` are underlined automatically with a tap-to-explain popup.
- `draft: true` hides a song from the production build.

**The build fails** on a misspelled id, a missing audio file or a malformed field,
so a broken song can't reach the live site.

To add a new toque, theme, person, place, song type or glossary word, add an entry to
the matching YAML file in `src/data/`.

### Audio tips

Export clips as `.m4a` (AAC) or `.mp3` at ~96–128 kbps — a 1-minute clip is about
1 MB. Files live in `public/audio/` and are committed with the site. If the
collection grows past a few hundred MB, move them to object storage (e.g. Cloudflare
R2) and use full `https://` URLs in `file:` — everything else keeps working.

> `public/audio/paranaue/demo-berimbau.m4a` is a **synthesized placeholder** used to
> demo the player and lyric sync. Delete it (and its `recordings:` entry and the
> `[m:ss]` stamps in `paranaue.md`) once you have a real recording.

## Features

- **Search** (`/` or ⌘K anywhere): accent-insensitive (`sao bento` → São Bento),
  typo-tolerant, matches titles, lyrics *and* English translations, shows the
  matching line, filters by song type, shareable `?q=` URLs.
- **Song page**: call-and-response layout, translation toggle, text size, keep-screen-on
  (for reading in the roda), share, glossary popups, related songs.
- **Player**: the cabaça is the play button and pulses with the actual audio; the wire is
  the progress bar; 0.5×/0.75× speed for learning, loop, multiple takes, lock-screen
  controls, docks to the bottom of the screen as you scroll.
- **Offline**: a service worker caches every song page, so lyrics load with no signal.
  Installable to the home screen.
- **Open data**: `/api/songs.json` (all songs with structured lyrics) and
  `/api/ontology.json` (all taxonomies); schema.org `MusicComposition` JSON-LD on every song.
- Light/dark themes, view-transition animations, respects reduced-motion.

## Data model

```
Song ──type──▶ SongType   ──toques──▶ Toque   ──themes──▶ Theme
     ──people─▶ Person    ──places──▶ Place   ──related─▶ Song
     ──recordings (audio, optionally time-synced)
GlossaryTerm (linked into lyrics automatically)
```

Schemas: `src/content.config.ts`. Lyrics parser: `src/lib/lyrics.ts`.

## Deploying

Any static host works. Cloudflare Pages, Netlify and Vercel all have free tiers that
build straight from GitHub:

- Build command: `npm run build`
- Output directory: `dist`

Push a new song to `main` and the site rebuilds itself.
