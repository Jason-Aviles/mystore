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

## The fix

Add exactly these two variables in Netlify, then redeploy.

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://ryympmijyisupsfyfgaw.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_mNYpNxYTO7O7-S0-HyATvA_d1MoEsyA` |

Both are safe to expose in the browser — the anon/publishable key is designed
for client-side use and is constrained by row-level security.

### Steps

1. Netlify → your site → **Site configuration** → **Environment variables**.
2. **Add a variable** → key `VITE_SUPABASE_URL` → value above. Scope: all
   contexts (Production, Deploy previews, Branch deploys).
3. Repeat for `VITE_SUPABASE_ANON_KEY`.
4. Go to **Deploys** → **Trigger deploy** → **Clear cache and deploy site**.
   Clearing the cache matters: a plain redeploy can reuse the cached build.
5. When it finishes, open `darkdivine.store/admin`. You should now see an
   **Email** and **Password** field instead of a single Passcode box.

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
