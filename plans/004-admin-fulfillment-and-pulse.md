# Plan 004: Admin completeness — fulfillment workflow (tracking + shipped email) and a dashboard pulse

> **Executor instructions**: Follow step by step; verify each step. On any
> STOP condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: No git repo. Compare every "Current state"
> excerpt against the live file before starting; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-flow-engine.md (reuses `send-flow` for the shipped email)
- **Category**: direction
- **Planned at**: no git repo — 2026-07-10

## Why this matters

The owner says the admin "doesn't feel complete." The concrete gaps: an order
can be marked shipped but there is nowhere to enter a tracking number, the
customer never hears about it (the policies promise "you'll get a tracking
number by email the moment it leaves" — currently a false promise), and the
dashboard shows totals but no motion (no trend, no today-vs-yesterday pulse).
This plan closes the fulfillment loop and gives the dashboard a heartbeat.

## Current state

- `src/admin/Orders.jsx` — order rows with a status `<select>` writing via
  `adminUpdateOrder(id, patch)` (`src/admin/adminData.js:142-150`, which
  updates `orders` live or the `dd_demo_orders` localStorage list).
- `supabase/schema.sql` `orders` table — has `status`, `total`,
  `customer_email`, `stripe_ref`, timestamps. **No tracking column** —
  confirm with `grep -n "tracking" supabase/schema.sql` → no matches.
- `emails/thank-you.html` — contains a `{{tracking_url}}` placeholder
  (see `emails/README.md`), intended for a shipped notification.
- Plan 001 contract: `send-flow` Edge Function accepts
  `{ flow, email, vars }`, dedupes via `flow_sends (email, flow, dedup_key)`.
  This plan adds flow name `'shipped'`.
- `src/admin/Dashboard.jsx` — stat cards computed from
  `adminListOrders()/adminListSignups()`; no time-series.
- Storefront promise to honor: `src/pages/Policies.jsx` shipping section —
  "You'll get a tracking number by email the moment your order leaves."

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Build | `npx vite build` | exit 0 |
| Schema gate | `grep -n "tracking_number" supabase/schema.sql` | 1 match after step 1 |

## Scope

**In scope**: `supabase/schema.sql` (one column + one line in the shipped
flow note), `src/admin/Orders.jsx`, `src/admin/adminData.js`,
`src/admin/Dashboard.jsx`, `supabase/functions/send-flow/index.ts`
(add `'shipped'` case + template), `plans/README.md`.

**Out of scope**: storefront pages; `stripe-webhook`; campaigns; any carrier
API integration (tracking number is a pasted string + carrier-agnostic
link `https://t.17track.net/en#nums={{tracking_number}}` — do not build
per-carrier logic).

## Git workflow

No git repo — edit in place.

## Steps

### Step 1: Schema — add tracking to orders

In `supabase/schema.sql`, inside the `orders` create-table block, add
`tracking_number text,` (nullable). Keep style consistent with adjacent
columns.

**Verify**: `grep -n "tracking_number" supabase/schema.sql` → 1 match.

### Step 2: Orders page — ship workflow

In `src/admin/Orders.jsx`: when an order's status is set to `shipped`
(or a new "Mark shipped" action), open an inline input for the tracking
number; on confirm call `adminUpdateOrder(id, { status: 'shipped',
tracking_number })`, then (live mode only) invoke `send-flow` with
`{ flow: 'shipped', email: order.customer_email, vars: { order_number:
id-slice, tracking_url: 'https://t.17track.net/en#nums=' + tracking_number } }`
via `supabase.functions.invoke`, wrapped in try/catch (never block the
status update). Show the tracking number on the row afterward.

**Verify**: build exit 0; `grep -n "tracking_number" src/admin/Orders.jsx` ≥ 2.

### Step 3: `send-flow` — add the `shipped` flow

In `supabase/functions/send-flow/index.ts` add a `SHIPPED_HTML` template:
reuse the inlined `thank-you.html` structure but with subject
"It left the building — tracking inside", a headline "Your run is on the
move", and the `{{tracking_url}}` button. Dedup key: the order id.

**Verify**: node-grep gate — file contains `SHIPPED_HTML` and `shipped`.

### Step 4: Dashboard pulse

In `src/admin/Dashboard.jsx`, above the stat cards add a 14-day revenue
sparkline: bucket paid orders (`created_at`) into days, render as a simple
inline SVG polyline (no chart library — repo has none and must not gain
one), pink stroke `var(--red)`, with "today" and "7-day" revenue figures
beside it. Demo mode: renders from `dd_demo_orders` the same way (empty =
flat line + note).

**Verify**: build exit 0; `grep -n "polyline" src/admin/Dashboard.jsx` ≥ 1.

## Test plan

Manual, demo mode: mark a demo order shipped → tracking input appears,
number persists on the row after reload (localStorage). Dashboard renders
sparkline without errors on zero orders. Live-mode email send verifies at
deploy time (defer, note in report).

## Done criteria

- [ ] `npx vite build` exit 0
- [ ] Shipping an order captures + persists a tracking number in both modes
- [ ] `send-flow` has a `shipped` case with `{{tracking_url}}`
- [ ] Dashboard shows a 14-day revenue sparkline (SVG, no new deps)
- [ ] `package.json` unchanged (`grep -c '"dependencies"' package.json` → 1,
      and no new packages added)
- [ ] README row updated

## STOP conditions

- `Orders.jsx` structure doesn't match (status select / adminUpdateOrder).
- Plan 001's `send-flow` doesn't exist yet — implement steps 1, 2 (without
  the invoke), and 4; report step 3 blocked on 001.
- Tempted to add a chart library — STOP, inline SVG only.

## Maintenance notes

- If a carrier API is ever added, replace only the `tracking_url` builder.
- Reviewer: check the shipped email can't fire twice (dedup key = order id)
  and that a failed email never blocks the status update.
