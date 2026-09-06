import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveMotionPaused } from '../src/lib/motionPreference.js';

test('reduced motion always wins and a saved pause persists', () => {
  assert.equal(resolveMotionPaused(true, false), true);
  assert.equal(resolveMotionPaused(false, false), false);
  assert.equal(resolveMotionPaused(false, true), true);
  assert.equal(resolveMotionPaused(undefined, true), true);
});

test('storefront exposes a persistent motion control and scopes animation teardown', async () => {
  const [context, layout, home, hook] = await Promise.all([
    readFile(new URL('../src/context/StoreContext.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Layout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/usePageMotion.js', import.meta.url), 'utf8'),
  ]);
  assert.match(context, /MOTION_STORAGE_KEY/);
  assert.match(context, /motionPaused/);
  assert.match(layout, /MotionControl/);
  assert.match(layout, /usePageMotion\(!loading, motionPaused\)/);
  assert.match(home, /<FilmStrip[^>]+paused=\{motionPaused\}/);
  assert.match(home, /<ScrollSerpent[^>]+paused=\{motionPaused\}/);
  assert.match(hook, /dependencies:\s*\[pathname, ready, motionPaused\]/);
});
