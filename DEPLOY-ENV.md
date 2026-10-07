# Live site environment — why admin says "Supabase is not connected"

## The diagnosis

`darkdivine.store` is live on Netlify, but it was built **without** the Supabase
environment variables. Proof, taken from the deployed bundle:

- The deployed JavaScript contains **zero** occurrences of the Supabase project
  URL or key. Vite bakes `VITE_*` values into the JS **at build time**, so if
  Netlify doesn't have them when it builds, they are simply absent forever.
- `darkdivine.store/admin` therefore renders the demo login (a single
  **Passcode** box) plus a notice saying this build has no Supabase connection.
- The same build made locally, with `.env` present, renders the real
  **Email + Password** form backed by Supabase Auth.
- Vite also dead-code-eliminates `createClient` entirely in that build: with
  both values `undefined`, `url && key` folds to a constant false, so
  `@supabase/supabase-js` never even ships. Absence of a supabase chunk in the
  deployed assets is the quickest way to confirm this.

So the code is fine and your Supabase project is fine — I confirmed the project
is awake and the key is valid. Only the Netlify build config is missing.

Two consequences today:

1. You cannot log into admin at all. Supabase Auth is unavailable, and the demo
   passcode has no value in the production build, so neither path works. (The
   built-in `darkdivine-admin` fallback was removed deliberately — a default
   compiled into the public bundle let anyone who read the JS sign into
   `/admin` on any deploy missing its Supabase vars.)
2. The live storefront is serving bundled demo/seed data, not your real
   database. Orders, signups, and reviews on the live site are not reaching
   Supabase.

## The fix (done in code — Oct 2026)

The two public values now live in **`.env.production`**, which is committed.
Vite reads it on every `vite build`, so Netlify's next build bakes Supabase in
without anyone touching the Netlify dashboard.

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://ryympmijyisupsfyfgaw.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the `sb_publishable_…` key |
| `VITE_META_PIXEL_ID` | Meta Ads pixel (public by design) |

All three are safe in public JavaScript — the publishable key is built for
the browser and is constrained by row-level security. Values set in the
Netlify dashboard would override this file, if you ever want to.

After a push, confirm: open `darkdivine.store/admin` → you should see
**Email** + **Password** fields, not a single Passcode box.

### Do NOT add these to Netlify

- `VITE_ADMIN_PASSCODE` — a production backdoor. With Supabase connected it is
  ignored anyway.
- Anything without the `VITE_` prefix (`STRIPE_SECRET_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `TWILIO_*`,
  `SUPABASE_ACCESS_TOKEN`). Those belong only in Supabase Edge Function
  secrets. A secret placed in a `VITE_` variable is compiled into public
  JavaScript that anyone can read.

## Optional Netlify variables

| Key | Effect if set |
| --- | --- |
| `VITE_META_PIXEL_ID` | Turns the Meta Ads pixel on. Blank/absent = off. |
| `VITE_PAYPAL_CLIENT_ID` | Shows the PayPal button at checkout. Blank = hidden. |

## Your admin account

Admin sign-in uses the Supabase Auth user `darkdivinestore@gmail.com`. Its
password is no longer stored in `.env` (a plaintext password in a project file
is a liability). If you need it reset: Supabase dashboard →
**Authentication** → **Users** → that user → **Reset password**. Set a new
password you keep in a password manager.

## Two environment-name bugs I found and fixed

Both were silent — no error, the feature just never fired.

1. **`TWILIO_FROM_NUMBER` → `TWILIO_FROM`.** The Edge Functions
   (`send-sms`, `stripe-webhook`) read `TWILIO_FROM`. The old `.env` and
   `.env.example` defined `TWILIO_FROM_NUMBER`, so SMS would never have sent
   even after you added real Twilio credentials.
2. **`OWNER_SALE_EMAIL` / `OWNER_SALE_PHONE` were undocumented.** The
   `stripe-webhook` function reads both to alert you when a sale lands, but
   neither appeared in `.env` or `.env.example`, so you would never have known
   to set them. `OWNER_SALE_EMAIL` is now filled in; the phone alert also needs
   Twilio configured.

After setting Twilio or the owner-alert values locally, push them to the
functions:

```
supabase secrets set OWNER_SALE_EMAIL=... OWNER_SALE_PHONE=... TWILIO_FROM=...
```

## Still outstanding (unchanged by this work)

- Resend sending domain is not verified, so no email actually sends yet.
- Stripe is in **test mode**. Real cards will not charge until you swap in live
  keys and re-run `scripts/setup-stripe-codes.mjs`.

## Netlify secret scanner (Oct 2026)

The first deploy with Supabase failed with **"Secrets scanning found secrets
in build."** Netlify compares every env var value against the repo and the
built files. The public ones (Supabase URL + publishable key, Meta pixel,
store email addresses) are meant to be there, so `netlify.toml` lists them
in `SECRETS_SCAN_OMIT_KEYS`. Everything else is still scanned.

Two code fixes came with it:

- `VITE_ADMIN_PASSCODE` is now read in dev builds only. It was being
  compiled into the public JavaScript because Netlify has it set.
- PayPal now runs server-side (see "PayPal" below). The old browser-only
  capture, which recorded no order, is gone.

**Cleanup in Netlify → Site configuration → Environment variables** — the
site build needs only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and
`VITE_META_PIXEL_ID` (and those are already in `.env.production`). Delete
the rest from Netlify: `VITE_ADMIN_PASSCODE`, `ADMIN_LOGIN_PASSWORD`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_RESTRICTED_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`,
`TWILIO_*`. They are used by Supabase Edge Functions, which have their own
secret store; a copy in Netlify does nothing except widen exposure.

## PayPal

Flow: the cart's PayPal button calls `paypal-create-order` (prices the cart
from the database with the same rules as Stripe, creates the pending order)
→ the buyer approves in PayPal → `paypal-capture` checks the order id, the
amount and the shipping country BEFORE capturing, then marks the order paid
through the same code as the Stripe webhook (address saved, confirmation
email, owner sale alert, stock decreased).

The button stays hidden until Supabase has these Edge Function secrets:

| Secret | Value |
| --- | --- |
| `PAYPAL_CLIENT_ID` | same as `VITE_PAYPAL_ID` in `.env.production` (same PayPal app) |
| `PAYPAL_CLIENT_SECRET` | developer.paypal.com → Apps & Credentials → your app |
| `PAYPAL_ENV` | `live` for real money, `sandbox` for test accounts |

**The `BAA…` client ID that was in `.env`/Netlify is a SANDBOX (test) app**
(verified Oct 2026: PayPal's sandbox issues it tokens, the live API refuses
it). It can never take real money. Get the live pair: developer.paypal.com
→ switch the toggle to **Live** → Apps & Credentials → your app (or Create
App, type Merchant) → copy its Client ID (starts with `A`) and Secret.

Put the live Client ID in `PAYPAL_CLIENT_ID` and the Secret in
`PAYPAL_CLIENT_SECRET` (keep `PAYPAL_ENV=live`) in `.env`, then run
`npm run secrets:paypal` — it checks the credentials with PayPal, saves them
in Supabase, confirms the live function reports ready, and writes the same
client ID into `.env.production` + `netlify.env` — commit and push after.
The button only appears when the browser's client ID matches the server's,
so a stale Netlify value can't produce a half-sandbox checkout. Then add "PayPal"
to Admin → Site Settings → Accepted payment methods so the logo shows.

Limits: PayPal charges the US Standard (free over the threshold) or Canada
Tracked rate — Priority shipping and Stripe promo codes are card-checkout
only.

**Status (Oct 6 2026): PayPal is LIVE.** Live app credentials verified with
PayPal and stored in Supabase (`PAYPAL_ENV=live`); the storefront reads the
public client ID from `VITE_PAYPAL_ID` in `.env.production`. (Note: this
live client ID also starts with `BAA…` — the prefix alone doesn't tell
sandbox from live; only PayPal's API does, which the setup script checks.)
