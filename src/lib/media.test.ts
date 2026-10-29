import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId, toSeconds, youtubeStart, formatTime, youtubeEmbedUrl, youtubeThumbnailUrl } from './media.ts';

test('youtubeId reads every link form, and nothing else', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/watch?feature=share&v=${id}`,
    `https://youtu.be/${id}?t=10`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
  ]) assert.equal(youtubeId(url), id, url);
  assert.equal(youtubeId('https://vimeo.com/123'), undefined);
});

test('toSeconds reads seconds, m:ss, h:mm:ss and 1h2m3s; anything else is NaN', () => {
  assert.equal(toSeconds(90), 90);
  assert.equal(toSeconds('90'), 90);
  assert.equal(toSeconds('1.5'), 1.5);
  assert.equal(toSeconds('1:30'), 90);
  assert.equal(toSeconds('1:02:03'), 3723);
  assert.equal(toSeconds('1m30s'), 90);
  assert.equal(toSeconds('1h2m3s'), 3723);
  assert.ok(Number.isNaN(toSeconds('soon')));
  assert.ok(Number.isNaN(toSeconds('')));
});

test('youtubeStart reads t= or start=, else undefined; an unreadable one is NaN; it never throws on a bad link', () => {
  assert.equal(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=1m30s'), 90);
  assert.equal(youtubeStart('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=45'), 45);
  assert.equal(youtubeStart('https://youtu.be/dQw4w9WgXcQ'), undefined);
  assert.equal(youtubeStart('not a url'), undefined);
  assert.ok(Number.isNaN(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=abc') ?? 0));
});

test('formatTime gives m:ss, and a dash for no time', () => {
  assert.equal(formatTime(65.9), '1:05');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(NaN), '–:––');
});

test('youtubeEmbedUrl and youtubeThumbnailUrl build the no-cookie embed and the large thumbnail', () => {
  assert.equal(youtubeEmbedUrl('dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(youtubeThumbnailUrl('dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});
