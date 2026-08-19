import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const MEDIA_ROOT = path.join(PUBLIC, 'media');
const MEDIA_EXTENSIONS = new Set([
  '.avif', '.bmp', '.gif', '.glb', '.heic', '.ico', '.jpeg', '.jpg',
  '.m4v', '.mov', '.mp4', '.ogg', '.png', '.svg', '.tif', '.tiff',
  '.webm', '.webp',
]);
const TEXT_EXTENSIONS = new Set([
  '.css', '.html', '.js', '.jsx', '.json', '.mjs', '.ts', '.tsx',
  '.webmanifest', '.xml',
]);
const IGNORED_DIRECTORIES = new Set([
  '.git', 'dist', 'node_modules',
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }

  return files;
}

function toPublicUrl(file) {
  return `/${path.relative(PUBLIC, file).split(path.sep).join('/')}`;
}

async function localMediaReferences() {
  const files = [
    ...await walk(path.join(ROOT, 'src')),
    ...await walk(PUBLIC),
    path.join(ROOT, 'index.html'),
  ];
  const references = new Set();
  const matcher = /(?<![:/])\/[A-Za-z0-9_./ -]+\.(?:avif|bmp|gif|glb|heic|ico|jpe?g|m4v|mov|mp4|ogg|png|svg|tiff?|webm|webp)(?![A-Za-z0-9])/gi;

  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const source = await readFile(file, 'utf8');
    for (const line of source.split(/\r?\n/)) {
      if (line.includes('media-integrity-ignore')) continue;
      for (const match of line.matchAll(matcher)) references.add(match[0]);
    }
  }

  return references;
}

test('all repository media is retained only when the site references it', async () => {
  const files = await walk(ROOT);
  const media = files.filter((file) => MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const outsideMediaFolder = media
    .filter((file) => !file.startsWith(`${MEDIA_ROOT}${path.sep}`))
    .map((file) => path.relative(ROOT, file));

  assert.deepEqual(outsideMediaFolder, [], `Media outside public/media:\n${outsideMediaFolder.join('\n')}`);

  const references = await localMediaReferences();
  const publicMedia = media.map(toPublicUrl);
  const orphaned = publicMedia.filter((url) => !references.has(url));
  assert.deepEqual(orphaned, [], `Unreferenced public media:\n${orphaned.join('\n')}`);
});

test('every local media reference resolves to a public file', async () => {
  const references = await localMediaReferences();
  const missing = [];

  for (const url of references) {
    const file = path.join(PUBLIC, ...url.slice(1).split('/'));
    try {
      if (!(await stat(file)).isFile()) missing.push(url);
    } catch {
      missing.push(url);
    }
  }

  assert.deepEqual(missing, [], `Missing referenced media:\n${missing.join('\n')}`);
});
