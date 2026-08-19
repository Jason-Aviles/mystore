# Trust & Conversion Audit — July 12, 2026 (STATUS: EXECUTED)

Full-site audit of trust, social proof, cart, product, and checkout, followed by
implementation. Every fix verified by a 43-check Playwright suite (desktop + mobile
emulation) against the dev server and the LIVE Supabase backend.

## Audit table

| # | Issue | Customer risk | Impact | Evidence | Fix | Priority | Status |
|---|-------|--------------|--------|----------|-----|----------|--------|
| 1 | Pending orders NEVER created from storefront — `orders` has no anon SELECT policy, so `.insert().select()` fails on RETURNING; checkout proceeded without an order row | Webhook can't mark paid → inventory never decrements → overselling; no abandoned-cart emails; admin blind to orders | Critical | Live DB: only the 6 imported orders existed despite the Jul 12 "E2E test" | Order creation moved into `create-checkout` (service role) | P0 | ✅ deployed + verified (pending order w/ real total created) |
| 2 | `customers` table publicly readable — `using (true)` SELECT policy | Anyone with the anon key (it ships in the bundle) could dump 83 customers' emails/names/addresses | Critical (privacy/trust) | `pg_policies` on live DB | Policy dropped; storefront no longer reads customers | P0 | ✅ migrated |
| 3 | Email/SMS signups silently failing — upsert under RLS needs SELECT on the conflict row; every `saveEmailSignup`/`saveSmsSignup` got 401 and fell back to browser-local queue while telling the user "you're in" | Gate/footer/popup/checkout captures never reached the list; welcome emails never sent | Critical | curl repro: 42501 on upsert, 201 on plain insert; 0 gate-source rows in live DB | `save_email_signup` / `save_sms_signup` / `set_unsubscribed` SECURITY DEFINER RPCs; broad anon UPDATE policy dropped (hardening: consent can now only ratchet up) | P0 | ✅ migrated + verified (`backend:"supabase"`) |
| 4 | Live catalog was the RAW Shopify CSV import: old Shopify-CDN images incl. the retired AI shots, EMPTY fit/model/care, "Xs"/"Xl" size casing, one stale handle | Customers saw AI images the owner banned, no fit guidance, broken-looking size chips | Critical (content) | REST + SQL inspection of live `products` | `scripts/sync-catalog-content.mjs` — curated seed → DB, preserving live inventory; handle renamed; 17 variant casings fixed | P0 | ✅ ran + verified |
| 5 | `create-checkout` trusted client-sent prices | Pay-what-you-want exploit (buy $150 bundle for $0.01) | Critical (integrity) | Function code read | Server resolves prices/titles/images from DB; client sends handle+options+qty only | P0 | ✅ deployed + tamper-tested ($0.01 request → $69.99 order) |
| 6 | No stock validation anywhere: unlimited qty add-to-cart, no server check | Overselling one-run inventory; refund apologies after drop night | High | Code + variant data (bundle combos have 1 unit!) | Client: addToCart/setQty clamp to real variantQty with honest toasts; drawer/cart per-line warnings; server: 409 with exact short lines + one-click "Update my cart" recovery | P0 | ✅ verified (cap at 1 unit, 409 path) |
| 7 | Discount codes promised everywhere (10% welcome etc.) didn't exist in Stripe → promo field rejected them | Broken promise at the moment of payment | High | Stripe API: 0 promotion codes | `scripts/setup-stripe-codes.mjs` — 3 real codes w/ Shopify-export semantics, created in test mode; README: re-run with live key | P0 | ✅ created |
| 8 | Payment logos claimed PayPal (no client ID), Google Pay + Afterpay (verified OFF in Stripe dashboard); missing Cash App/Amazon Pay (verified ON) | False advertising at cart/footer/FAQ | High | Stripe `payment_method_configurations` API | `payMethods` config verified against the account + admin field; PayPal auto-appends only when configured; pay-in-4 note = Klarna only, admin toggle | P0 | ✅ verified in UI |
| 9 | Checkout offered "US Standard $6.95" to UK/AU addresses; free-ship threshold hardcoded (drifts from admin setting) | Wrong rates, wrong promises at payment | High | Function code | Ships-to selector (US/CA) → country-correct rates matching the policy page (US Standard/Priority, Canada Tracked); threshold read live from site_settings; policy page intl line now honest | P1 | ✅ deployed |
| 10 | Contact "Track Your Order" form claimed "we'll resend your tracking within a few minutes" but did NOTHING | Fabricated promise; support black hole | High | Code: submitTrack only reset the form | Honest flow: logs request + opens prefilled email; promises only the configured response time | P1 | ✅ verified |
| 11 | Sold-out product showed "In stock — one run only" + JSON-LD always `InStock` | Lying to customers and Google | High | `lowStock()` returns null at 0 → wrong branch | Real sold-out states: PDP note+disabled CTA+notify list, card badge+dim, JSON-LD OutOfStock | P1 | ✅ |
| 12 | Webhook not idempotent — duplicate Stripe delivery double-decremented inventory | Phantom stock loss on one-run inventory | High | Function code | Only transitions `pending→paid` run side-effects | P1 | ✅ deployed |
| 13 | Checkout email upsert set `consent:true` invisibly ("Email for order updates" ≠ marketing consent); BIS same | Consent mislabeling (compliance) | High | marketing.js default | Schema default consent=false; unchecked opt-in checkbox at checkout; BIS consent:false; RPC ratchets consent up only | P1 | ✅ |
| 14 | Unsubscribed users who re-signed up stayed muted forever while seeing "you're in" | Broken promise | Medium | upsert never cleared `unsubscribed` | RPC clears unsubscribed on active signup | P1 | ✅ |
| 15 | Response-time claims conflicted (24h footer vs 48h refunds vs 24h size guide) | Inconsistency reads as carelessness | Medium | Page copy | `supportResponse` config used everywhere (returns keep the explicit 48h line) | P1 | ✅ |
| 16 | Size guide navigated away from PDP; inches only | Fit doubt + lost buying context | Medium | UX review | In-page modal (focus trap, Esc, in/cm toggle, product fit+model, per-category charts); /size-guide page shares the same source | P1 | ✅ |
| 17 | Back-in-stock alert fired when ANY size restocked, not the customer's saved size; dedup blocked later different-size waits | "Your size is back" lie | Medium | flow-cron code | Size-aware check + size-scoped dedup + size named in the email | P1 | ✅ deployed |
| 18 | Abandoned/BIS email copy: blanket "most sizes have fewer than three units", "TODAY ONLY" on a code with no expiry, "came free from an unpaid order" guess | Unverifiable claims | Medium | send-flow templates | All reworded to always-true statements; welcome email code follows admin setting | P1 | ✅ deployed |
| 19 | ProductCard used hardcoded low-stock threshold 12 (ignored admin setting) | Card and PDP could disagree | Medium | Code | `CONFIG.lowStockThreshold` passed | P2 | ✅ |
| 20 | Sold-out size click → misleading "Pick your size first" | Confusion at decision point | Medium | Code | `selectionState()` → "That size is sold out — join the notify list"; aria labels announce sold-out | P2 | ✅ |
| 21 | Mobile horizontal pan on Home (69px: `.ghost-00` hangs) and Drop (123px: `aspect-ratio` transferring `min-height` to width on `.drop-video`) — hidden on desktop by ScrollSmoother's wrapper | Broken feel on phones = the primary device | High (mobile) | Probe: scrollWidth walk | `overflow-x: clip` on ghost sections; explicit `width:100%` on drop-video | P1 | ✅ 0px on all 6 routes |
| 22 | Admin SMS list read a nonexistent `sms_signups` table | Owner can't see SMS list | Medium | Live schema | → `sms_subscribers` | P2 | ✅ |
| 23 | Meta Purchase event ignored quantities | Bad ROAS data | Low | Thanks.jsx | price×qty | P2 | ✅ |
| 24 | Reviews: no rating breakdown, no sorting, no fit data | Harder to trust the 296 reviews | Medium | UX | Histogram (real spread 215/74/7), sort incl. lowest-first, verified-only filter, optional size-purchased field (stored in new `reviews.meta`), size chip on cards | P2 | ✅ |
| 25 | Popup hardcoded "4.7/296" + "No thanks, I'll pay full price" confirm-shaming | Copy drifts as reviews grow; manipulative tone | Low | Code | Derived from live constants; "No thanks" | P2 | ✅ |
| 26 | Gate SMS field implied consent by typing a number | TCPA risk | Medium | Gate.jsx | Express-consent checkbox (matches homepage pattern) | P1 | ✅ |
| 27 | Duplicate pending orders per checkout retry | Duplicate abandoned emails | Low | CartPage flow | Function reuses the pending order by id | P2 | ✅ |

## Still open (needs owner input — do NOT fake)
- **International shipping beyond Canada**: no real rates exist → checkout restricted to US/CA and the policy page says to email first. Add real rates when known.
- **PayPal**: `VITE_PAYPAL_CLIENT_ID` empty → button hidden, no PayPal claims anywhere. When enabling, the client-side capture path needs a server-side order update (anon can't update orders — by design).
- **Google Pay / Afterpay**: OFF in the Stripe dashboard. Enable there first, then add to Admin → Trust & policies → payment methods.
- **Live Stripe keys**: still test mode. After activation: swap secrets, re-run `node scripts/setup-stripe-codes.mjs`, re-check dashboard payment methods.
- **Customer photos / UGC section**: no permissioned customer photos exist yet as structured data. Lookbook already uses the brand's real content. Build the submission+consent+moderation flow when photos start arriving (schema suggestion: `ugc_submissions` with consent + product link + approved flag).
- **Response-time promise**: currently "within 24 hours" (owner's original claim). Confirm it's honored or soften in Admin → Trust & policies.

## Round 2 — full bug hunt (same day)

| # | Bug | Impact | Fix | Status |
|---|-----|--------|-----|--------|
| 28 | addToCart double-click race: two clicks in one React batch both computed from stale state — the last unit could enter the cart twice | Oversell on 1-unit combos | Re-clamp inside the setState updater | ✅ |
| 29 | create-checkout silently clamped qty to 10 — cart says 12, customer pays for 10 | Total mismatch | Clamp removed; stock check rejects excess honestly | ✅ deployed |
| 30 | Thanks page captured the purchase at mount, but a Stripe return is a fresh load with the catalog still fetching — Purchase pixel fired empty, review picker showed the whole catalog | Broken ROAS data | Capture waits for products (once-guard ref) | ✅ |
| 31 | Rapid navigation killed veil transitions mid-flight → RGB-split clones/shard panels stranded over the page forever | Stuck translucent overlay | Purge leftovers at every route start + on cleanup; verified with an interrupt-chain test | ✅ |
| 32 | Countdown rendered "NaN NaN NaN" cells when dropDate is empty/invalid (reachable from admin) | Broken-looking homepage/gate | NaN guard returns null | ✅ |
| 33 | SearchOverlay Enter-key navigation skipped the Search analytics event that clicks fire | Undercounted searches | Enter routes through the same go() | ✅ |
| 34 | og:image was a RELATIVE url (link previews broken on every platform) and pointed at an AI bundle mockup | No/wrong social preview | Absolute URL to the real pendant editorial + og:url/og:type | ✅ |
| 35 | Campaign templates: fake "Friday 7PM ET" date, "25% off today only" (code never expires), hardcoded codes ignoring admin settings | Dishonest canned emails | Templates derive from CONFIG.dropDate/welcomeCode/comebackCode; "today only" removed | ✅ |
| 36 | Flows admin: sent-counters query denied by flow_sends RLS (`using(false)` for authenticated) — counters stuck at 0 forever | Admin blind to automation | Policy replaced with authenticated SELECT (writes stay service-role-only) | ✅ migrated |
| 37 | Tee PDP panned 35px sideways on phones: `.pdp` grid items default `min-width:auto`, so a 6-thumb row (424px) forced the column wide instead of scrolling inside `.thumbs` | Mobile jank on 6-image products (tee, pants) | `.pdp > * { min-width: 0 }` | ✅ |
| 38 | Thanks copy hardcoded "2 business days" | Drifts from admin setting | Uses CONFIG.processingDays | ✅ |

Round-2 verification: 48/48 route-crawl checks (18 routes × desktop+mobile emulation, search/megamenu/quickview/Esc flows, rapid-nav overlay chain, gate NaN guard, zero console errors) + the original 43/43 trust suite re-passed. Build clean. Test rows purged from the live DB.

## Verification
- 43/43 Playwright checks passed (desktop 1380px + mobile 390px emulation): stock caps, sold-out honesty, size-guide modal, histogram/sorting, payment claims, checkout → real Stripe session, mobile overflow 0px on all routes, sticky ATC, consent defaults, no console errors on our pages.
- Server tests: 409 with exact short lines for over-quantity; $0.01 price-tamper request produced a $69.99 order; signup RPC returns `backend:"supabase"`.
- All test orders/signups deleted from the live DB afterwards.
