import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('www permanently redirects to the apex host before the SPA fallback', async () => {
  const netlify = await read('netlify.toml');
  const canonical = netlify.indexOf('from = "https://www.darkdivine.store/*"');
  const fallback = netlify.indexOf('from = "/*"');
  assert.ok(canonical >= 0 && canonical < fallback);
  assert.match(netlify, /to = "https:\/\/darkdivine\.store\/:splat"[\s\S]*?status = 301[\s\S]*?force = true/);
});

test('terms is a public route linked from footer and cart', async () => {
  const [app, policies, footer, cart] = await Promise.all([
    read('src/App.jsx'), read('src/pages/Policies.jsx'),
    read('src/components/Footer.jsx'), read('src/pages/CartPage.jsx'),
  ]);
  assert.match(app, /path="\/terms"/);
  assert.match(policies, /export function TermsPolicy/);
  assert.match(footer, /to="\/terms"/);
  assert.match(cart, /to="\/terms"/);
});

test('privacy explains storage, providers, retention, rights, minors, and updates', async () => {
  const policies = (await read('src/pages/Policies.jsx')).toLowerCase();
  for (const phrase of ['effective', 'local storage', 'supabase', 'stripe', 'retention', 'children', 'policy changes']) {
    assert.match(policies, new RegExp(phrase));
  }
});
