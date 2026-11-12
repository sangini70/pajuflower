import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sermons = JSON.parse(await readFile(path.join(root, 'content', 'sermons.json'), 'utf8'))
  .filter((sermon) => sermon.publicStatus === 'published' && sermon.approvalStatus === 'approved' && sermon.youtubeUrl);

const youtubeIdFromUrl = (value) => {
  const url = new URL(value);
  const id = url.hostname === 'youtu.be'
    ? url.pathname.slice(1)
    : url.searchParams.get('v');
  return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
};

for (const sermon of sermons) {
  const html = await readFile(path.join(root, 'dist', 'sermons', sermon.slug, 'index.html'), 'utf8');
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const video = jsonLd.flatMap((value) => Array.isArray(value) ? value : [value])
    .find((value) => value['@type'] === 'VideoObject');
  const videoId = youtubeIdFromUrl(sermon.youtubeUrl);

  assert.ok(video, `${sermon.id}: VideoObject is missing`);
  assert.equal(video.name, sermon.title, `${sermon.id}: VideoObject.name mismatch`);
  assert.equal(video.description, sermon.summary, `${sermon.id}: VideoObject.description mismatch`);
  assert.match(video.thumbnailUrl, /^https:\/\//, `${sermon.id}: thumbnailUrl must be absolute HTTPS`);
  assert.match(video.thumbnailUrl, new RegExp(`/vi/${videoId}/`), `${sermon.id}: thumbnailUrl video ID mismatch`);
  assert.equal(video.uploadDate, `${sermon.date}T00:00:00+09:00`, `${sermon.id}: uploadDate mismatch`);
  assert.equal(video.embedUrl, `https://www.youtube-nocookie.com/embed/${videoId}`, `${sermon.id}: embedUrl mismatch`);
}

console.log(`video-structured-data: PASS (${sermons.length} published sermon pages)`);
