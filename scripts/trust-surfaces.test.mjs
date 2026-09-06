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

test('the gate exposes policy and support links without requiring an unlock', async () => {
  const [gate, layout] = await Promise.all([
    read('src/components/Gate.jsx'),
    read('src/components/Layout.jsx'),
  ]);
  for (const path of ['/shipping', '/refunds', '/privacy', '/terms', '/contact']) {
    assert.match(gate, new RegExp(path.replace('/', '\\/')));
    assert.match(layout, new RegExp(path.replace('/', '\\/')));
  }
  assert.match(gate, /onUtilityNavigate/);
  assert.match(layout, /gateSuppressedForUtility/);
});

test('private entry visibility is controlled independently from the gate', async () => {
  const [config, settings, gate] = await Promise.all([
    read('src/lib/config.js'),
    read('src/admin/Settings.jsx'),
    read('src/components/Gate.jsx'),
  ]);
  assert.match(config, /gateEntryEnabled:\s*true/);
  assert.match(settings, /Show private preorder entry/);
  assert.match(gate, /CONFIG\.gateEntryEnabled/);
});
