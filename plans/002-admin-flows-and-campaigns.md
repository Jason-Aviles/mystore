# Plan 002: Admin "Flows" page + HTML campaigns with preview and test-send

> **Executor instructions**: Follow step by step; verify each step. On any
> STOP condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: No git repo. Compare every "Current state"
> excerpt against the live file before starting; mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (admin-only surfaces)
- **Depends on**: plans/001-flow-engine.md (reads its `flow_sends` table and `site_settings.data.flows` toggles)
- **Category**: direction
- **Planned at**: no git repo — 2026-07-10

## Why this matters

Plan 001 makes flows send; this plan makes them *visible and controllable* —
without it the owner can't tell whether automations are on, working, or
reaching anyone, which is why the system "doesn't feel complete." It also
upgrades manual campaigns from plain-text to the designed HTML templates with
a preview and a test-send, which is the difference between a tool the owner
trusts and one they fear.

## Current state

- `src/admin/AdminRoutes.jsx` — `NAV` array (~line 81) and `<Routes>` block
  (~line 118) list admin pages. Add "Flows" here. Pattern:
  `['/admin/flows', 'Flows', false]` + `<Route path="flows" element={<Flows />} />`.
- `src/admin/Campaigns.jsx` — composer writes `{ subject, body, audience }`
  via `adminSaveCampaign`; sends via `adminSendCampaign` →
  `send-campaign` Edge Function, which currently emails **plain text**
  (`supabase/functions/send-campaign/index.ts:50`, `text:` field).
- `src/admin/adminData.js` — data layer with live/demo branches. Follow its
  existing function style (e.g. `adminListCampaigns` ~line 171) for any new
  accessor. Demo mode = localStorage.
- `src/admin/Settings.jsx` — field-driven form; groups defined in `FIELDS`
  array; `'toggle'` type exists. **Convention warning**: apostrophes inside
  hint strings have previously broken this array — avoid `'` in hints.
- Flow toggles contract (from Plan 001): `site_settings.data.flows` object,
  e.g. `{ welcome: true, abandoned_1: false, ... }`; absent key = enabled.
  Save via existing `adminSaveSettings` (`src/admin/adminData.js`).
- `emails/new-drop.html` — the campaign template with `{{drop_name}}`,
  `{{drop_date}}` placeholders; `emails/README.md` documents all tokens.
- Admin styling: `.stat-cards`, `.admin-table`, `.note-banner`, `.pill ok/warn`
  classes in `src/styles/global.css` — reuse, don't invent.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Build | `npx vite build` | exit 0 |
| Route gate | `grep -n "flows" src/admin/AdminRoutes.jsx` | ≥2 matches |

## Scope

**In scope**: `src/admin/Flows.jsx` (create), `src/admin/AdminRoutes.jsx`,
`src/admin/Campaigns.jsx`, `src/admin/adminData.js`,
`supabase/functions/send-campaign/index.ts`, `plans/README.md`.

**Out of scope**: `send-flow`/`flow-cron` functions (001 owns them);
storefront components; SMS anything; `src/admin/Settings.jsx` (flows get
their own page, not more Settings fields).

## Git workflow

No git repo — edit in place.

## Steps

### Step 1: `src/admin/Flows.jsx`

One page, two zones:

1. **Flow cards** — one card per flow (welcome, abandoned_1, abandoned_2,
   back_in_stock, thank_you): name, one-line description, trigger + timing
   (copy the table in `emails/README.md`), an on/off toggle bound to
   `site_settings.data.flows` (read via `adminGetSettings`, write via
   `adminSaveSettings` — merge, don't clobber other settings), and a sent
   counter.
2. **Sent counter** — live mode: `select flow, count(*) from flow_sends group
   by flow` via supabase client (`.from('flow_sends').select('flow')` then
   count client-side is fine at this scale). Demo mode: show `—` and the
   standard demo `note-banner` ("flows send only when Supabase is
   connected").

Register the page in `AdminRoutes.jsx` (import + NAV entry + Route).

**Verify**: `npx vite build` exit 0; `grep -c "Flows" src/admin/AdminRoutes.jsx` ≥ 2.

### Step 2: HTML campaigns in `send-campaign/index.ts`

Replace the `text:` field with `html:`: inline `emails/new-drop.html` as a
constant, render `{{placeholders}}` from a new optional `campaign.vars`
(fall back: `drop_name` = subject), inject `campaign.body` (escape HTML,
convert `\n` to `<br>`) into the template's body slot — add a
`{{body}}` token to the inlined constant where the main paragraph sits.
Keep the unsubscribe footer, now as HTML.

**Verify**: `node -e "const s=require('fs').readFileSync('supabase/functions/send-campaign/index.ts','utf8');['html:','{{body}}'].forEach(k=>{if(!s.includes(k))throw k})"` → clean.

### Step 3: Preview + test-send in `Campaigns.jsx`

- **Preview**: an iframe (`srcDoc`) rendering the same inlined template with
  the composer's current subject/body substituted client-side (duplicate the
  tiny renderTemplate helper locally — acceptable duplication, the function
  is 3 lines).
- **Test send**: "Send test to me" button → prompts for an email (default:
  empty), calls `adminSendCampaign`-style invoke with
  `{ campaign_id, test_to: address }`. In `send-campaign/index.ts`, when
  `test_to` present: send only to that address, do NOT mark the campaign
  sent, return `{ ok: true, test: true }`.

**Verify**: build exit 0; `grep -n "test_to" supabase/functions/send-campaign/index.ts src/admin/Campaigns.jsx` → both files hit.

### Step 4: Audience count on the composer

Before sending, show "will reach N subscribers": live = count query on
`email_signups` (`consent=true, unsubscribed=false`, source filter);
demo = length of the localStorage queue. Add `adminAudienceCount(audience)`
to `adminData.js` following its live/demo branch convention.

**Verify**: build exit 0.

## Test plan

Manual (no framework): demo mode — Flows page renders 5 cards with toggles
persisting to localStorage settings; Campaigns preview updates as you type;
audience count shows queue length; build passes. Live-mode behaviors (counts,
test send) verify at deploy time — note them in the report as deferred.

## Done criteria

- [ ] `npx vite build` exit 0
- [ ] `/admin/flows` renders 5 flow cards with working toggles (demo mode)
- [ ] Campaign composer shows live HTML preview + audience count + test-send UI
- [ ] `send-campaign` sends `html:` not `text:`, honors `test_to`
- [ ] No out-of-scope files modified; README row updated

## STOP conditions

- Any excerpt mismatch (esp. `adminData.js` function shapes).
- Plan 001's `flow_sends`/`flows` contract absent from schema/functions —
  001 hasn't run; report ordering violation.
- Settings save path would clobber unrelated keys (verify `adminSaveSettings`
  merges — read it before writing toggles).

## Maintenance notes

- New flows added later need: card entry here, template + case in send-flow,
  optional cron sweep. Keep the flow list in ONE exported constant.
- Reviewer should scrutinize: settings merge (no clobber), test_to never
  marking campaigns sent, HTML escaping of campaign body (XSS via admin is
  low-risk but the escape is cheap).
