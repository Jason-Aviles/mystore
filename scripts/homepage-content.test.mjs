import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_HOMEPAGE,
  formatHomepageText,
  mergeHomepage,
} from '../src/lib/homeContent.js';
import { HOMEPAGE_FIELD_GROUPS } from '../src/admin/homepageFields.js';

test('every homepage setting has an admin editor', () => {
  const editableKeys = new Set(
    HOMEPAGE_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.key)),
  );
  const missing = Object.keys(DEFAULT_HOMEPAGE).filter((key) => !editableKeys.has(key));

  assert.deepEqual(missing, []);
});

test('homepage defaults cover every repeatable content and media section', () => {
  assert.equal(DEFAULT_HOMEPAGE.qualityItems.length, 4);
  assert.equal(DEFAULT_HOMEPAGE.reelItems.length, 9);
  assert.equal(DEFAULT_HOMEPAGE.lookbookItems.length, 8);
  assert.equal(DEFAULT_HOMEPAGE.faqItems.length, 6);

  assert.ok(DEFAULT_HOMEPAGE.reelItems.every((item) => item.src && item.type));
  assert.ok(DEFAULT_HOMEPAGE.lookbookItems.every((item) => item.src && item.alt && item.to));
});

test('saved homepage values merge over complete defaults', () => {
  const merged = mergeHomepage({ bestTitle: 'Chosen Pieces', reelItems: [] });

  assert.equal(merged.bestTitle, 'Chosen Pieces');
  assert.equal(merged.heroPrimaryTextDrop, DEFAULT_HOMEPAGE.heroPrimaryTextDrop);
  assert.deepEqual(merged.reelItems, []);
});

test('homepage copy supports safe store-value tokens', () => {
  const text = formatHomepageText(
    'Free over {freeShipThreshold} · {dropName} · {instagramHandle}',
    { freeShipThreshold: 125, dropName: 'DROP 003', instagramHandle: '@darkdivine' },
  );

  assert.equal(text, 'Free over 125 · DROP 003 · @darkdivine');
});

test('homepage and film strip render from settings rather than static editorial media', async () => {
  const [home, filmStrip, settings] = await Promise.all([
    readFile(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/FilmStrip.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/admin/Settings.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(home, /mergeHomepage\(CONFIG\.homepage\)/);
  assert.match(home, /<FilmStrip content=\{HOME\}/);
  assert.doesNotMatch(home, /\/media\/editorial\//);
  assert.doesNotMatch(filmStrip, /const REEL\s*=/);
  assert.match(settings, /HOMEPAGE_FIELD_GROUPS/);
  assert.match(settings, /HomepageEditor/);
});
