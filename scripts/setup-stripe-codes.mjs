/* Recreates the store's REAL Shopify discount codes in Stripe so the codes
   promised on the site (signup box, popup, gate, welcome/comeback emails)
   actually work at checkout. Semantics come straight from the Shopify
   export (cvs/discounts_export.csv) — nothing invented:

     DARKDIVINEWELCOME10   -10%  (welcome — shown after every email signup)
     DARKDIVINECOMEBACK25  -25%  (comeback — abandoned-cart email #2)
     30DARKDIVINEFOREVER   -30%  (legacy loyalty code, still active in export)

   Shopify enforced "once per customer"; Stripe can't fully enforce that for
   guest checkouts, so codes are created without a redemption cap — same
   money math, slightly looser enforcement. Re-running is safe (idempotent).

   Usage:  node scripts/setup-stripe-codes.mjs
   Uses STRIPE_SECRET_KEY from .env — run again with the LIVE key after
   Stripe activation (test-mode objects don't carry over).            */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const KEY = process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY;
if (!KEY) { console.error('STRIPE_SECRET_KEY missing'); process.exit(1); }

const CODES = [
  { code: 'DARKDIVINEWELCOME10', percent: 10, name: 'Welcome 10% (first order)' },
  { code: 'DARKDIVINECOMEBACK25', percent: 25, name: 'Comeback 25%' },
  { code: '30DARKDIVINEFOREVER', percent: 30, name: 'Forever 30% (loyalty)' },
];

async function stripe(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(KEY + ':').toString('base64')}`,
      ...(params && { 'Content-Type': 'application/x-www-form-urlencoded' }),
    },
    body: params && new URLSearchParams(params),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${path}: ${json.error.message}`);
  return json;
}

const mode = KEY.startsWith('sk_live') ? 'LIVE' : 'TEST';
console.log(`Stripe ${mode} mode — syncing promotion codes…`);

const existing = await stripe('promotion_codes?limit=100');
for (const { code, percent, name } of CODES) {
  const found = existing.data.find((p) => p.code === code);
  if (found) {
    console.log(`  = ${code} already exists (${found.coupon.percent_off}% off, active: ${found.active})`);
    continue;
  }
  const coupon = await stripe('coupons', {
    percent_off: String(percent),
    duration: 'once',
    name,
  });
  // current API shape: promotion_codes take promotion[type]+promotion[coupon]
  await stripe('promotion_codes', { 'promotion[type]': 'coupon', 'promotion[coupon]': coupon.id, code });
  console.log(`  + ${code} created — ${percent}% off`);
}
console.log('Done. Codes now work in the promo field on Stripe Checkout.');
if (mode === 'TEST') console.log('REMINDER: re-run this after switching to the live key — test codes do not carry over.');
