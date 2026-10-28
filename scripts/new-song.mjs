#!/usr/bin/env node
// Scaffold a new song:  npm run new-song  (or: npm run new-song -- "Song title" path/to/audio.mp3)
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parse } from 'yaml';

const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q, def = '') => {
  process.stdout.write(def ? `${q} [${def}]: ` : `${q}: `);
  const { value = '' } = await lines.next();
  return value.trim() || def;
};
const ids = (file) => Object.keys(parse(readFileSync(`src/data/${file}.yaml`, 'utf8')));
const slugify = (s) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function pick(label, options, multi = true) {
  console.log(`\n${label}:\n  ${options.join(', ')}`);
  const answer = await ask(multi ? `${label} (comma separated, blank for none)` : label, multi ? '' : options[0]);
  const picked = answer.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = picked.filter((p) => !options.includes(p));
  if (unknown.length) {
    console.error(`✗ unknown ${label.toLowerCase()}: ${unknown.join(', ')} — add them to src/data first`);
    process.exit(1);
  }
  return picked;
}

const [, , argTitle, argAudio] = process.argv;
const title = argTitle || (await ask('Title'));
const slug = await ask('URL slug', slugify(title));
const file = `src/content/songs/${slug}.md`;
if (existsSync(file)) {
  console.error(`✗ ${file} already exists`);
  process.exit(1);
}

const [type] = await pick('Type', ids('song-types'), false);
const toques = await pick('Toques', ids('toques'));
const themes = await pick('Themes', ids('themes'));
const people = await pick('People', ids('people'));
const places = await pick('Places', ids('places'));

let recordings = '';
const audio = argAudio || (await ask('\nPath to an audio file to add (blank to skip)'));
if (audio) {
  const src = audio.replace(/^['"]|['"]$/g, '').replace(/\\ /g, ' ');
  if (!existsSync(src)) {
    console.error(`✗ audio file not found: ${src}`);
    process.exit(1);
  }
  mkdirSync(`public/audio/${slug}`, { recursive: true });
  const dest = `/audio/${slug}/${slugify(basename(src, extname(src)))}${extname(src).toLowerCase()}`;
  copyFileSync(src, `public${dest}`);
  const performer = await ask('Who is singing? (optional)');
  recordings = `recordings:\n  - file: ${dest}\n${performer ? `    performer: ${performer}\n` : ''}    sync: false\n`;
  console.log(`✓ copied audio to public${dest}`);
}
rl.close();

const list = (k, v) => (v.length ? `${k}: [${v.join(', ')}]\n` : '');
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  file,
  `---
title: ${JSON.stringify(title)}
type: ${type}
${list('toques', toques)}${list('themes', themes)}${list('people', people)}${list('places', places)}summary: ""
${recordings}added: ${today}
---

## Coro
First line of the coro
> English translation

## Solo
First solo line
> English translation
`,
);
console.log(`\n✓ created ${file}\n  Open it, fill in the lyrics, then run \`npm run dev\` to see it.`);
