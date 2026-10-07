/* Pushes the PayPal server secrets from .env into Supabase Edge Function
   secrets, then asks the live function whether PayPal is ready.
   Usage: fill PAYPAL_CLIENT_SECRET (and PAYPAL_ENV) in .env, then
          npm run secrets:paypal                                        */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const REF = 'ryympmijyisupsfyfgaw';
const need = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_ENV', 'SUPABASE_ACCESS_TOKEN'];
const missing = need.filter((k) => !env[k]);
if (missing.length) { console.error(`Missing in .env: ${missing.join(', ')}`); process.exit(1); }
if (!['live', 'sandbox'].includes(env.PAYPAL_ENV)) { console.error('PAYPAL_ENV must be "live" or "sandbox"'); process.exit(1); }
// VITE_PAYPAL_CLIENT_ID is synced FROM PAYPAL_CLIENT_ID at the end (step 4)

// 1. prove the credentials work before storing them
const base = env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const auth = await fetch(`${base}/v1/oauth2/token`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
});
if (!auth.ok) {
  // tell a sandbox app apart from a wrong secret — the usual mix-up
  const other = env.PAYPAL_ENV === 'live' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  const alt = await fetch(`${other}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (alt.ok) {
    console.error(`These are ${env.PAYPAL_ENV === 'live' ? 'SANDBOX (test)' : 'LIVE'} credentials, but PAYPAL_ENV=${env.PAYPAL_ENV}.`
      + (env.PAYPAL_ENV === 'live' ? ' For real money, use the Live app: developer.paypal.com → switch to Live → Apps & Credentials.' : ''));
  } else {
    console.error(`PayPal rejected these credentials (${auth.status}). Re-copy the Client ID and Secret from the same app.`);
  }
  process.exit(1);
}
console.log(`✓ PayPal accepted the ${env.PAYPAL_ENV} credentials`);

// 2. store them as Edge Function secrets
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_ENV'].map((name) => ({ name, value: env[name] }))),
});
if (!res.ok) { console.error(`Supabase refused the secrets (${res.status}): ${await res.text()}`); process.exit(1); }
console.log('✓ Saved PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV in Supabase');

// 3. the live function now reports ready (the storefront button appears)
const probe = await fetch(`${env.SUPABASE_URL}/functions/v1/paypal-create-order`, {
  method: 'POST',
  headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ probe: true }),
});
console.log('Live check:', await probe.text());

// 4. the storefront needs the same (public) client ID in its build
const setVar = (file, key, value) => {
  const url = new URL(`../${file}`, import.meta.url);
  if (!existsSync(url)) return;
  let text = readFileSync(url, 'utf8');
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${text.replace(/\s*$/, '')}
${line}
`;
  writeFileSync(url, text);
};
for (const file of ['.env', '.env.production', 'netlify.env']) setVar(file, 'VITE_PAYPAL_CLIENT_ID', env.PAYPAL_CLIENT_ID);
console.log('✓ VITE_PAYPAL_CLIENT_ID written to .env, .env.production and netlify.env');
console.log('Next: commit + push (Netlify rebuilds), and in Netlify set VITE_PAYPAL_CLIENT_ID to the same value or delete it there.');
console.log('Then add "PayPal" to Admin → Site Settings → Accepted payment methods.');
