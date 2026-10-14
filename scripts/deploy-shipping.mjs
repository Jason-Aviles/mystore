/* Puts Shippo shipping + the signup-bot fix live, in the only safe order:
     1. checks both Shippo keys in .env actually work
     2. adds the database pieces (shipping_config table, orders.shipping_quote
        + orders.label) — BEFORE any function that writes them
     3. stores the Shippo keys as Supabase Edge Function secrets
     4. deploys the changed functions (keeping each one's JWT setting)
     5. probes the live functions
   Usage: npm run deploy:shipping
   Needs in .env: SUPABASE_ACCESS_TOKEN, SHIPPO_API_KEY (live), SHIPPO_TEST_API_KEY */
import { readFileSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const root = new URL('..', import.meta.url);
const env = Object.fromEntries(
  readFileSync(new URL('.env', root), 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const REF = 'ryympmijyisupsfyfgaw';
const API = `https://api.supabase.com/v1/projects/${REF}`;
const H = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
const die = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };
const step = (m) => console.log(`\n▸ ${m}`);

for (const k of ['SUPABASE_ACCESS_TOKEN', 'SHIPPO_API_KEY', 'SHIPPO_TEST_API_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  if (!env[k]) die(`Missing ${k} in .env`);
}
if (!env.SHIPPO_API_KEY.startsWith('shippo_live_')) die('SHIPPO_API_KEY should be the LIVE key (starts shippo_live_)');
if (!env.SHIPPO_TEST_API_KEY.startsWith('shippo_test_')) die('SHIPPO_TEST_API_KEY should be the TEST key (starts shippo_test_)');

// 1 ---------------------------------------------------------------------
step('Checking Shippo keys');
for (const k of ['SHIPPO_API_KEY', 'SHIPPO_TEST_API_KEY']) {
  const r = await fetch('https://api.goshippo.com/carrier_accounts/?results=1', { headers: { Authorization: `ShippoToken ${env[k]}` } });
  if (!r.ok) die(`${k} was refused by Shippo (${r.status}) — copy it again from Shippo → Settings → API`);
  console.log(`  ${k} ✓`);
}

// 2 ---------------------------------------------------------------------
step('Adding shipping tables/columns to the database');
const sql = readFileSync(new URL('supabase/migrations/20261014120000_shipping.sql', root), 'utf8');
let r = await fetch(`${API}/database/query`, { method: 'POST', headers: H, body: JSON.stringify({ query: sql }) });
if (!r.ok) die(`Migration failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
r = await fetch(`${API}/database/query`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ query: "select count(*)::int as n from information_schema.columns where table_name='orders' and column_name in ('shipping_quote','label')" }),
});
const n = (await r.json())?.[0]?.n;
if (n !== 2) die('Columns not found after migration — stopping before any function deploy');
console.log('  shipping_config table + orders.shipping_quote/label ✓');

// 3 ---------------------------------------------------------------------
step('Saving Shippo keys as Supabase secrets');
r = await fetch(`${API}/secrets`, {
  method: 'POST', headers: H,
  body: JSON.stringify([
    { name: 'SHIPPO_API_KEY', value: env.SHIPPO_API_KEY },
    { name: 'SHIPPO_TEST_API_KEY', value: env.SHIPPO_TEST_API_KEY },
  ]),
});
if (!r.ok) die(`Saving secrets failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
console.log('  SHIPPO_API_KEY, SHIPPO_TEST_API_KEY ✓');

// 4 ---------------------------------------------------------------------
step('Deploying functions');
const cli = path.join(execSync('npm prefix -g').toString().trim(), process.platform === 'win32' ? 'supabase.cmd' : 'bin/supabase');
const FUNCS = [
  ['shipping-rates'], ['shipping-label'],
  ['create-checkout'], ['paypal-create-order'], ['paypal-capture'],
  ['stripe-webhook', '--no-verify-jwt'], // Stripe can't send a Supabase token
  ['preorder-gate'], ['send-flow'],
];
for (const [fn, ...flags] of FUNCS) {
  const out = spawnSync(`"${cli}"`, ['functions', 'deploy', fn, '--use-api', '--project-ref', REF, ...flags], {
    cwd: new URL('.', root), env: { ...process.env, SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN }, encoding: 'utf8', shell: true,
  });
  if (out.status !== 0) die(`Deploy of ${fn} failed:\n${out.stderr || out.stdout}`);
  console.log(`  ${fn} ✓`);
}

// 5 ---------------------------------------------------------------------
step('Checking the live functions');
const list = await (await fetch(`${API}/functions`, { headers: H })).json();
const jwt = Object.fromEntries(list.map((f) => [f.slug, f.verify_jwt]));
if (jwt['stripe-webhook'] !== false) die('stripe-webhook now requires a JWT — Stripe events would fail. Redeploy it with --no-verify-jwt');
const call = (fn, body) => fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
  method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
r = await call('create-checkout', { items: [] });
if (r.status !== 400) die(`create-checkout answered ${r.status} to an empty cart (expected 400)`);
r = await call('shipping-rates', { items: [] });
if (r.status !== 400) die(`shipping-rates answered ${r.status} (expected 400)`);
r = await call('shipping-label', { action: 'check' });
if (r.status !== 401) die(`shipping-label let the public key in (${r.status}) — expected 401`);
console.log('  checkout up · rates up · labels admin-only · stripe-webhook open to Stripe ✓');

console.log(`
✓ Done. Next:
  1. Admin → Shipping: your ship-from address + boxes → "Save & test (test key)"
  2. Admin → Products: Packed weight on each piece
  3. Admin → Site Settings → Store → "Live carrier rates at checkout" → Save → Publish
     (until then checkout keeps the flat rates, exactly as now)
  4. Orders → Ship… buys labels (tick "Test label" to try one free)`);
