# Plan 001: Build the automated email-flow engine (welcome, thank-you, abandoned checkout, back-in-stock)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on.
> If anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: This repo is NOT a git repository — there is no
> SHA to diff against. Instead, compare every excerpt in "Current state"
> against the live file before starting; on any mismatch, STOP and report.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (touches checkout webhook; all sends are server-side)
- **Depends on**: none
- **Category**: direction (completes the homegrown Klaviyo)
- **Planned at**: no git repo — 2026-07-10, verified against live files

## Why this matters

The store captures emails at five touchpoints and has five designed HTML email
templates, but nothing ever sends automatically. Abandoned-checkout emails are
the single highest-ROI automation in e-commerce (typically recovering 5–15% of
abandoned carts), and the welcome email delivers the discount code subscribers
were promised. This plan turns the existing dormant templates into real
triggered flows using infrastructure the repo already has (Supabase Edge
Functions + Resend). After it lands, the owner has a working Klaviyo
replacement with zero subscription cost.

## Current state

- `emails/*.html` — five inline-styled, email-client-safe templates:
  `welcome.html`, `abandoned-cart.html`, `thank-you.html`, `back-in-stock.html`,
  `new-drop.html`. They use `{{placeholder}}` tokens documented in
  `emails/README.md` (`{{first_name}}`, `{{cart_url}}`, `{{order_number}}`,
  `{{product_name}}`, `{{product_url}}`, `{{drop_name}}`, `{{drop_date}}`).
  **They are referenced nowhere in code** — confirm with
  `grep -rn "welcome.html" src/ supabase/` → no matches.
- `src/lib/marketing.js:16-28` — `saveEmailSignup({ email, source, consent, meta })`
  upserts into `email_signups` (Supabase) or a localStorage queue (demo). This
  is the welcome-flow trigger point. Excerpt:
  ```js
  export async function saveEmailSignup({ email, source, consent = true, meta = {} }) {
    metaTrack('Lead');
    const entry = { email: email.trim().toLowerCase(), source, consent, meta, created_at: new Date().toISOString() };
    if (hasSupabase) {
      const { error } = await supabase.from('email_signups').upsert(
  ```
- `supabase/functions/send-campaign/index.ts:34-58` — existing Resend send
  pattern to copy: service-role client, audience query on
  `email_signups` filtered `consent=true, unsubscribed=false`, Resend batch
  endpoint (max 100/call), unsubscribe footer linking
  `/unsubscribe?email=...`.
- `supabase/functions/stripe-webhook/index.ts:49-73` — on
  `checkout.session.completed` marks the order `paid` and decrements
  inventory. This is the thank-you trigger point AND the moment an
  abandoned-checkout chase must be cancelled.
- `supabase/schema.sql` — `orders` table has `status` ('pending' → 'paid'),
  `customer_email`, `created_at`. A pending order older than 1h whose email
  hasn't paid = an abandoned checkout. `email_signups` has `unsubscribed
  boolean default false` (line ~66). Back-in-stock requests are stored as
  `email_signups` rows with `source='back_in_stock'` and
  `meta: { product, size }` (written by `src/pages/Product.jsx` `bisSubmit`).
- Secrets available to functions (see `.env.example`): `RESEND_API_KEY`,
  `RESEND_FROM` (contact@darkdivine.store), `SUPABASE_SERVICE_ROLE_KEY`.
- Repo conventions: Edge Functions are Deno, `npm:` specifiers, a `json()`
  response helper, CORS headers block — copy the shape of
  `supabase/functions/send-campaign/index.ts` exactly.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Frontend build | `npx vite build` | `✓ built in …`, exit 0 |
| Deno syntax check (if deno installed) | `deno check supabase/functions/send-flow/index.ts` | exit 0 |
| Grep gate | `grep -rn "send-flow" src/` | ≥1 match after step 5 |

There is no test suite. The build is the only automated gate. Live
verification requires a connected Supabase project (not yet provisioned) —
that is expected and NOT a stop condition; see Done criteria.

## Scope

**In scope** (the only files you may modify/create):
- `supabase/functions/send-flow/index.ts` (create)
- `supabase/functions/flow-cron/index.ts` (create)
- `supabase/functions/stripe-webhook/index.ts` (add one fetch call)
- `supabase/schema.sql` (append `flow_sends` table + `flows` settings row note)
- `src/lib/marketing.js` (invoke welcome flow after successful signup)
- `emails/*.html` (read only — inline their contents into send-flow)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `src/components/Popups.jsx`, `Gate.jsx`, `Footer.jsx` — capture UIs already
  call `saveEmailSignup`; the trigger belongs in the lib, not per-component.
- `supabase/functions/send-campaign/index.ts` — manual campaigns are Plan 002.
- Any SMS/Twilio sending — deferred (keys blank; compliance not settled).
- The admin UI — Plan 002.

## Git workflow

Repo is not under git. Do not `git init`. Just edit files.

## Steps

### Step 1: Add the `flow_sends` dedup table to `supabase/schema.sql`

Append (following the existing table style in that file):

```sql
-- ---------- automated email flows ----------
-- One row per (recipient, flow, subject-key) prevents duplicate sends.
create table if not exists flow_sends (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  flow text not null,            -- 'welcome' | 'thank_you' | 'abandoned_1' | 'abandoned_2' | 'back_in_stock'
  dedup_key text not null,       -- e.g. order id, product handle, or 'once'
  sent_at timestamptz default now(),
  unique (email, flow, dedup_key)
);
alter table flow_sends enable row level security;
create policy "service role only" on flow_sends for all to authenticated using (false);
```

**Verify**: `grep -c "flow_sends" supabase/schema.sql` → `4` or more.

### Step 2: Create `supabase/functions/send-flow/index.ts`

A single function that sends ONE flow email. Body:
`{ flow, email, vars }` where `vars` is the placeholder map. Behavior:

1. Copy the CORS block, service-role client creation, `RESEND_KEY`/`FROM`
   guard, and `json()` helper verbatim from `send-campaign/index.ts`.
2. Inline the five templates as string constants (`WELCOME_HTML`, etc.) —
   copy each file's full contents from `emails/*.html`. (Edge functions can't
   read repo files at runtime; inlining is the deliberate choice.)
3. `renderTemplate(html, vars)`: replace every `{{key}}` with
   `vars[key] ?? ''` (simple global regex, no library).
4. Skip-guards before sending, in order:
   - recipient exists in `email_signups` with `unsubscribed=true` → return
     `{ ok: false, skipped: 'unsubscribed' }`;
   - `insert` into `flow_sends` with the (email, flow, dedup_key) — on a
     unique-violation error return `{ ok: false, skipped: 'duplicate' }`
     (insert-first makes the dedup atomic);
   - flow disabled → check `site_settings.data->flows->>{flow}` — if
     explicitly `false`, return `{ ok: false, skipped: 'disabled' }`.
5. Send via the same Resend endpoint pattern (single email, not batch), with
   subject per flow: welcome "Welcome to the family — 10% inside",
   thank_you "You were there for the run", abandoned_1 "Your run is still
   holding", abandoned_2 "25% says come back", back_in_stock "It came back —
   briefly". Append the same unsubscribe footer as send-campaign but as an
   HTML `<p>`.

**Verify**: `deno check supabase/functions/send-flow/index.ts` → exit 0
(if deno is unavailable: `node -e "const s=require('fs').readFileSync('supabase/functions/send-flow/index.ts','utf8'); ['WELCOME_HTML','renderTemplate','flow_sends','abandoned_2'].forEach(k=>{if(!s.includes(k))throw k})"` → no throw).

### Step 3: Create `supabase/functions/flow-cron/index.ts` (scheduled sweeps)

Runs on a schedule (deploy note in the file header:
`supabase functions deploy flow-cron` + Dashboard → Edge Functions →
Schedules → every 30 minutes). Each run:

1. **Abandoned #1**: orders `status='pending'`, `created_at` between 24h and
   1h ago → for each, invoke send-flow internally (`fetch` the function URL
   with the service key, or refactor send-flow's core into a shared local
   function — simplest: duplicate the send core in this file) with
   `flow:'abandoned_1'`, `dedup_key: order.id`, vars
   `{ cart_url: 'https://darkdivine.store/cart' }`.
2. **Abandoned #2**: same query but 24h–72h old, `flow:'abandoned_2'`,
   include `DARKDIVINECOMEBACK25` in vars (it's a real pre-existing code —
   see `emails/README.md`).
3. **Back-in-stock**: `email_signups` where `source='back_in_stock'`; for
   each, look up the product's variants (`product_variants` by
   `meta->>product`); if any `inventory_qty > 0`, send `back_in_stock` with
   `product_name`/`product_url` vars, `dedup_key: product handle`.
   The `flow_sends` unique row guarantees one send per person per product.

**Verify**: same node-grep gate — file contains `abandoned_1`, `abandoned_2`,
`back_in_stock`, `inventory_qty`.

### Step 4: Trigger thank-you from the Stripe webhook

In `supabase/functions/stripe-webhook/index.ts`, after the order update to
`paid` (line ~54, inside `if (found)`), add a non-blocking fetch:

```ts
// fire the thank-you flow (failure must never fail the webhook)
try {
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-flow`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      flow: 'thank_you',
      email: session.customer_details?.email ?? session.customer_email,
      vars: { order_number: String(found.id).slice(0, 8).toUpperCase() },
    }),
  });
} catch { /* never block payment confirmation */ }
```

**Verify**: `grep -n "send-flow" supabase/functions/stripe-webhook/index.ts` → 1 match.

### Step 5: Trigger welcome from `src/lib/marketing.js`

In `saveEmailSignup`, after the successful Supabase upsert (inside the
`if (!error)` branch, `src/lib/marketing.js:24`), add a fire-and-forget
invoke — do NOT await it into the return path:

```js
// welcome flow: server-side send, deduped by flow_sends — safe to fire blind
supabase.functions.invoke('send-flow', {
  body: { flow: 'welcome', email: entry.email, vars: { first_name: '' } },
}).catch(() => {});
```

Only for sources that expect a welcome (skip `checkout` and `back_in_stock`):
wrap in `if (!['checkout', 'back_in_stock'].includes(source))`.

**Verify**: `npx vite build` → exit 0. `grep -n "send-flow" src/lib/marketing.js` → 1 match.

## Test plan

No test framework exists. Manual verification matrix (execute what's possible
now; the rest is deploy-time):

- Now: `npx vite build` passes; demo mode signup (no Supabase) still returns
  `{ ok: true, backend: 'local' }` — confirm the invoke is guarded by
  `hasSupabase` scope (it's inside the `if (hasSupabase)` branch).
- At deploy time (owner, documented in the file headers): sign up with a test
  address → welcome arrives once, second signup sends nothing; create a
  pending order, wait for cron → abandoned_1 arrives; pay an order →
  thank-you arrives; set a variant 0→3 with a back_in_stock signup → alert
  arrives.

## Done criteria

- [ ] `npx vite build` exits 0
- [ ] `supabase/functions/send-flow/index.ts` and `flow-cron/index.ts` exist,
      contain all five inlined templates / three sweep queries respectively
- [ ] `grep -rn "flow_sends" supabase/schema.sql supabase/functions/` → ≥3 files
- [ ] stripe-webhook contains exactly one `send-flow` fetch inside `if (found)`
- [ ] `saveEmailSignup` invokes the flow only under `hasSupabase` and only for
      welcome-appropriate sources
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` row updated

## STOP conditions

- Any "Current state" excerpt doesn't match the live file.
- You find an existing automated-send implementation anywhere (search
  `grep -rn "resend.com" supabase/ src/` — only send-flow, flow-cron, and
  send-campaign should hit) — report instead of duplicating.
- The templates in `emails/` contain `{{placeholders}}` not covered by this
  plan's vars — list them in the report rather than inventing values.
- You are tempted to send SMS — that is explicitly deferred.

## Maintenance notes

- When Supabase is provisioned: deploy both functions, re-run schema.sql,
  schedule flow-cron at 30-minute intervals. Resend free tier is 100
  emails/day — fine at launch, revisit before big drops.
- Plan 002 builds the admin Flows page on top of the
  `site_settings.data.flows` toggles this plan reads (absent key = enabled).
- If checkout later collects first names, thread them into `vars.first_name`.
- The unsubscribe footer relies on the existing `/unsubscribe` page — do not
  change its query param contract (`?email=`).
