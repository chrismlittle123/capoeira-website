#!/usr/bin/env node
// Scaffold a new song:  npm run new-song  (or: npm run new-song -- "Song title" path/to/audio.mp3)
import { createInterface } from 'node:readline';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { youtubeId } from '../src/lib/media.ts';
import { PUBLIC_DIR, dataFile, songFile } from '../src/lib/paths.ts';
import {
  audioUrl,
  dataIds,
  isSlug,
  localDate,
  parseIdList,
  slugify,
  songMarkdown,
  unescapeDroppedPath,
  unknownIds,
  type NewSong,
} from '../src/lib/song-scaffold.ts';

const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string, fallback = '') {
  process.stdout.write(fallback ? `${question} [${fallback}]: ` : `${question}: `);
  const { value = '' } = await lines.next();
  return String(value).trim() || fallback;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Ask for ids from one of the src/data files, refusing any that aren't in it. */
async function askIds(label: string, data: 'themes' | 'people' | 'places') {
  const path = dataFile(data);
  let known: string[] = [];
  try {
    known = dataIds(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`can't read the ids in ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`\n${label}:\n  ${known.join(', ')}`);
  const picked = parseIdList(await ask(`${label} (comma separated, blank for none)`));
  const unknown = unknownIds(picked, known);
  if (unknown.length) fail(`unknown ${label.toLowerCase()}: ${unknown.join(', ')} — add them to src/data first`);
  return picked;
}

// Ask and check everything first: nothing is written until every answer is good.
const [, , argTitle, argAudio] = process.argv;
const title = argTitle || (await ask('Title'));
if (!title.trim()) fail('a song needs a title');
const slug = await ask('URL slug', slugify(title));
if (!isSlug(slug)) fail(`"${slug}" can't be a URL slug: use lower-case letters, digits and dashes`);
const songPath = songFile(slug);
if (existsSync(songPath)) fail(`${songPath} already exists`);

const song: NewSong = {
  title,
  themes: await askIds('Themes', 'themes'),
  people: await askIds('People', 'people'),
  places: await askIds('Places', 'places'),
  added: localDate(new Date()),
};

let audioSource: string | undefined;
const audioAnswer = argAudio || (await ask('\nPath to an audio file to add (blank to skip)'));
if (audioAnswer) {
  audioSource = unescapeDroppedPath(audioAnswer);
  if (!existsSync(audioSource)) fail(`audio file not found: ${audioSource}`);
  song.audio = { file: audioUrl(slug, audioSource), performer: await ask('Who is singing? (optional)') };
  // audioUrl starts with a slash: /audio/<song>/<file>
  if (existsSync(`${PUBLIC_DIR}${song.audio.file}`)) fail(`${PUBLIC_DIR}${song.audio.file} already exists`);
}

const youtube = await ask('YouTube link (blank to skip)');
if (youtube) {
  if (!youtubeId(youtube)) fail(`that isn't a YouTube video link: ${youtube}`);
  song.youtube = { url: youtube, title: await ask('Video title (optional)') };
}
rl.close();

if (audioSource && song.audio) {
  const dest = `${PUBLIC_DIR}${song.audio.file}`;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(audioSource, dest);
  console.log(`✓ copied audio to ${dest}`);
}
writeFileSync(songPath, songMarkdown(song));
console.log(`\n✓ created ${songPath}\n  Open it, fill in the lyrics, then run \`npm run dev\` to see it.`);
