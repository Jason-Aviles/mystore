# Storefront Trust Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dark Divine storefront materially more trustworthy through canonical-domain redirects, complete legal pages, reachable gate policies, durable support tickets, verified brand identity, transparent review provenance, and user-controlled motion.

**Architecture:** Keep storefront presentation configuration-driven through the existing `site_settings` row, add a private Supabase support-ticket subsystem with a narrow public creation RPC, and expose ticket handling through the authenticated admin. Add one global motion preference to `StoreContext`, then make page-level video/GSAP code consume that state so pause mode leaves static content readable.

**Tech Stack:** React 18, React Router 6, Vite 5, Supabase/Postgres/RLS/RPC, GSAP 3 with `@gsap/react`, Netlify redirects, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-storefront-trust-upgrade-design.md`

## Global Constraints

- Never publish invented founder, company, address, production, packaging, review, or policy details.
- Optional identity and evidence fields render only when they contain a real admin-saved value.
- Keep trust and support routes reachable under both access-gate and preorder-only lock modes.
- Anonymous visitors can create support tickets but cannot read, update, list, or delete them.
- Preserve existing catalog data, checkout behavior, visual language, fonts, colors, and product interactions.
- Do not add new runtime dependencies.
- Respect `prefers-reduced-motion`; static content and calls to action remain readable when motion is paused.
- Every code task follows red-green-refactor and ends with focused tests plus a commit.

---

### Task 1: Canonical Host and Legal Foundation

**Files:**
- Create: `scripts/trust-surfaces.test.mjs`
- Modify: `netlify.toml`
- Modify: `src/App.jsx`
- Modify: `src/pages/Policies.jsx`
- Modify: `src/components/Footer.jsx`
- Modify: `src/pages/CartPage.jsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `CONFIG.brand`, `CONFIG.domain`, `CONFIG.supportEmail`, optional identity settings introduced in Task 5.
- Produces: public `/terms` route; `TermsPolicy` React component; canonical `www` redirect; legal navigation links.

- [ ] **Step 1: Write the failing trust-surface test**

Create `scripts/trust-surfaces.test.mjs` using the existing Node test style:

```js
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
  const policies = await read('src/pages/Policies.jsx');
  for (const phrase of ['Effective', 'local storage', 'Supabase', 'Stripe', 'retention', 'children', 'policy changes']) {
    assert.match(policies.toLowerCase(), new RegExp(phrase.toLowerCase()));
  }
});
```

- [ ] **Step 2: Run the focused test and verify red state**

Run: `node --test scripts/trust-surfaces.test.mjs`

Expected: failures for the missing redirect, `/terms` route, and strengthened privacy content.

- [ ] **Step 3: Add the host redirect before the SPA fallback**

Add this block at the top of `netlify.toml` redirects:

```toml
[[redirects]]
  from = "https://www.darkdivine.store/*"
  to = "https://darkdivine.store/:splat"
  status = 301
  force = true
```

Keep the existing `/* -> /index.html` rule after it.

- [ ] **Step 4: Add complete Terms and strengthen Privacy**

Export `TermsPolicy` from `src/pages/Policies.jsx`, following the existing `PolicyPage` structure. Use plain-language sections for agreement, eligibility, products/pricing, orders/payment, preorder deposits and balances, shipping/customs, cancellations, returns/refunds, intellectual property, prohibited use, warranty limitations, liability limitations, policy changes, and contact. Render governing jurisdiction only when `CONFIG.businessRegion` is non-empty.

Expand `PrivacyPolicy` with an effective-date line and sections covering categories/purposes, checkout providers, Supabase storage, configured communications providers, Meta Pixel only when `CONFIG.metaPixelId` is truthy, browser storage, retention, customer rights, minors, international processing, security limitations, and policy changes. Link to `/contact` for requests.

Add the lazy import and route in `src/App.jsx`:

```jsx
const TermsPolicy = lazy(() => import('./pages/Policies').then((m) => ({ default: m.TermsPolicy })));
// inside Layout routes
<Route path="/terms" element={<TermsPolicy />} />
```

- [ ] **Step 5: Add legal links without changing checkout behavior**

Add `Terms` to the footer legal row. Add a concise cart sentence below the secure-checkout note:

```jsx
<p className="checkout-legal">
  By continuing, you agree to our <Link to="/terms">Terms</Link> and acknowledge our <Link to="/privacy">Privacy Policy</Link>.
</p>
```

Style `.checkout-legal` as secondary text with readable underline/focus states.

- [ ] **Step 6: Run tests and build**

Run: `node --test scripts/trust-surfaces.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 7: Commit**

```bash
git add netlify.toml scripts/trust-surfaces.test.mjs src/App.jsx src/pages/Policies.jsx src/components/Footer.jsx src/pages/CartPage.jsx src/styles/global.css
git commit -m "Add canonical redirect and complete legal pages"
```

---

### Task 2: Gate Policy Access and Independent Entry Control

**Files:**
- Modify: `src/lib/config.js`
- Modify: `src/admin/Settings.jsx`
- Modify: `src/components/Gate.jsx`
- Modify: `src/components/Layout.jsx`
- Modify: `src/styles/global.css`
- Modify: `scripts/responsive-accessibility.test.mjs`
- Modify: `scripts/trust-surfaces.test.mjs`

**Interfaces:**
- Consumes: `CONFIG.gateEntryEnabled: boolean`, existing `gateEnabled`, `gateGuestBypass`, `preorderOnlyLock`, and `dropMode`.
- Produces: gate utility navigation through `onUtilityNavigate(path: string): void`; admin-controlled private entry visibility.

- [ ] **Step 1: Add failing gate tests**

Extend `scripts/trust-surfaces.test.mjs` with source assertions for `gateEntryEnabled`, `/shipping`, `/refunds`, `/privacy`, `/terms`, and `/contact` links in `Gate.jsx`.

Extend `scripts/responsive-accessibility.test.mjs` with a Playwright test that opens `/?gate` at 390x520, asserts all five utility links are reachable by scrolling, clicks Terms, and verifies the URL is `/terms` with the gate absent for that utility visit.

Add a second browser test that injects saved settings with `gateEntryEnabled: false`, opens `/?gate`, and verifies `Enter Private Preorder` and the access-code input are absent while `Join the list` and the five utility links remain visible.

- [ ] **Step 2: Run the focused tests and verify red state**

Run: `node --test scripts/trust-surfaces.test.mjs`

Run: `node --test --test-name-pattern="gate" scripts/responsive-accessibility.test.mjs`

Expected: failures because the setting and gate links do not exist.

- [ ] **Step 3: Add the admin setting and truthful presets**

Add to `DEFAULT_CONFIG`:

```js
gateEntryEnabled: true,
```

Add an Access field in `Settings.jsx`:

```js
['gateEntryEnabled', 'Show private preorder entry', 'toggle', 'Off hides the access-code field and entry button while keeping waitlist and policy links available'],
```

Set `gateEntryEnabled: false` for `Tease / Waitlist`, and `true` for `Early Access` and `Live Drop`. Keep `Off-season` false.

- [ ] **Step 4: Implement utility-route escape without globally unlocking**

In `Layout.jsx`, define the legal/support routes once and derive `gateBypassedForUtility` from `pathname`. Do not render `Gate` when the current path is a utility route. Continue applying `preorderOnlyLock` to every non-allowed route.

Pass an `onUtilityNavigate` callback into `Gate` that navigates directly to the selected utility path without calling `unlock()`.

In `Gate.jsx`, render `Link`-style buttons or buttons using the callback in a normal-flow `<nav aria-label="Policies and support">`. When `CONFIG.gateEntryEnabled === false`, hide the access-code field and entry submit action and show the existing list-join action as the primary action.

- [ ] **Step 5: Style and verify the compact mobile layout**

Add `.gate-utility`, `.gate-utility a/button`, and focus styles. Use flex-wrap, a minimum 44-pixel touch height, normal-flow spacing, and bottom safe-area padding. Do not absolutely position the utility row.

Run: `node --test scripts/trust-surfaces.test.mjs`

Run: `npm run test:responsive`

Expected: all tests pass; gate screenshots show every action and utility link without overlap at 390x520 and 390x844.

- [ ] **Step 6: Commit**

```bash
git add src/lib/config.js src/admin/Settings.jsx src/components/Gate.jsx src/components/Layout.jsx src/styles/global.css scripts/trust-surfaces.test.mjs scripts/responsive-accessibility.test.mjs
git commit -m "Keep policies reachable from the private gate"
```

---

### Task 3: Secure Support Ticket Backend

**Files:**
- Modify: `supabase/schema.sql`
- Create: `scripts/support-schema.test.mjs`
- Create: `src/lib/support.js`
- Modify: `src/admin/adminData.js`

**Interfaces:**
- Produces: `createSupportRequest(payload): Promise<{ reference: string }>`.
- Produces: `adminListSupportRequests(filters?: { status?: string, kind?: string }): Promise<SupportRequest[]>`.
- Produces: `adminUpdateSupportRequest(id: string, patch: { status?: string, internal_note?: string }): Promise<void>`.
- `SupportRequest` fields: `id`, `reference`, `kind`, `name`, `email`, `order_number`, `subject`, `message`, `status`, `internal_note`, `created_at`, `updated_at`.

- [ ] **Step 1: Write the failing schema contract test**

Create `scripts/support-schema.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('support requests are private and publicly creatable only through the RPC', () => {
  assert.match(schema, /create table if not exists support_requests/i);
  assert.match(schema, /alter table support_requests enable row level security/i);
  assert.match(schema, /create policy "admin all support requests"[\s\S]*to authenticated/i);
  assert.doesNotMatch(schema, /create policy "public[^\n]*support requests"[\s\S]*for select/i);
  assert.match(schema, /create or replace function public\.create_support_request/i);
  assert.match(schema, /grant execute on function public\.create_support_request/i);
});

test('public references contain no email or order data', () => {
  assert.match(schema, /DD-[^']*gen_random_bytes/i);
});
```

- [ ] **Step 2: Run the schema test and verify red state**

Run: `node --test scripts/support-schema.test.mjs`

Expected: failure because the table and RPC are absent.

- [ ] **Step 3: Add the private table and authenticated admin policy**

Append an idempotent `support_requests` table to `supabase/schema.sql` with text-length checks, the four allowed kinds, the five allowed statuses, unique reference, and timestamps. Enable RLS and add only this table policy:

```sql
create policy "admin all support requests" on support_requests
  for all to authenticated using (true) with check (true);
```

Do not add anonymous table policies.

- [ ] **Step 4: Add a narrow security-definer creation RPC**

Implement:

```sql
create or replace function public.create_support_request(
  p_kind text,
  p_name text,
  p_email text,
  p_order_number text default null,
  p_subject text default null,
  p_message text default null
) returns text
language plpgsql
security definer
set search_path = public
```

Validate kind, normalized email, name length 1-100, order number length <=80, subject length <=160, and message length 1-4000. Reject more than three tickets from the same normalized email in two minutes. Generate `DD-YYMMDD-` plus 12 uppercase hex characters derived from `gen_random_bytes(6)`, insert the row, and return only the reference. Revoke all from public, then grant execution to `anon` and `authenticated`.

- [ ] **Step 5: Implement the storefront and admin data functions**

In `src/lib/support.js`, normalize and validate the client payload before calling:

```js
const { data, error } = await supabase.rpc('create_support_request', {
  p_kind: payload.kind,
  p_name: payload.name.trim(),
  p_email: payload.email.trim().toLowerCase(),
  p_order_number: payload.orderNumber?.trim() || null,
  p_subject: payload.subject?.trim() || null,
  p_message: payload.message?.trim() || null,
});
```

Return `{ reference: data }`. In demo mode, generate the same shaped reference, save a complete ticket into `dd_demo_support_requests`, and return the reference.

In `src/admin/adminData.js`, add list/update functions using Supabase in live mode and the same localStorage collection in demo mode. Allow only `status` and `internal_note` updates.

- [ ] **Step 6: Run focused tests and build**

Run: `node --test scripts/support-schema.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql scripts/support-schema.test.mjs src/lib/support.js src/admin/adminData.js
git commit -m "Add private support ticket backend"
```

---

### Task 4: Contact Confirmation and Admin Support Inbox

**Files:**
- Create: `src/admin/Support.jsx`
- Modify: `src/pages/Contact.jsx`
- Modify: `src/admin/AdminRoutes.jsx`
- Modify: `src/admin/adminData.js`
- Modify: `src/styles/global.css`
- Modify: `scripts/responsive-accessibility.test.mjs`
- Modify: `scripts/trust-surfaces.test.mjs`

**Interfaces:**
- Consumes: `createSupportRequest`, `adminListSupportRequests`, and `adminUpdateSupportRequest` from Task 3.
- Produces: customer confirmation UI with `data-support-reference`; authenticated `/admin/support` inbox.

- [ ] **Step 1: Write failing customer and admin tests**

Add a source contract test proving `Contact.jsx` imports `createSupportRequest`, contains no `window.location.href = mailto`, and exposes `data-support-reference`.

Add a Playwright test that mocks the Supabase RPC response as `DD-260906-A1B2C3`, submits the general support form, and asserts the page shows `Request DD-260906-A1B2C3 received`. Add a failure-path test that rejects the request and verifies the entered message remains in the textarea and the direct email fallback is visible.

Add source assertions that `AdminRoutes.jsx` has `/admin/support`, that the Support nav badge uses `notif.support`, and that `Support.jsx` includes filters for all five statuses.

- [ ] **Step 2: Run tests and verify red state**

Run: `node --test scripts/trust-surfaces.test.mjs`

Run: `node --test --test-name-pattern="support" scripts/responsive-accessibility.test.mjs`

Expected: failures because the direct submission and admin inbox are absent.

- [ ] **Step 3: Replace both `mailto:` form submissions**

In `Contact.jsx`, use explicit controlled fields or `FormData`, `busy`, `error`, and `confirmation` state. Map tracking requests to kind `tracking` and general messages to kind `message`. Disable only the active submit button while pending. On success, reset that form and render:

```jsx
<div className="support-confirmation" role="status" aria-live="polite" data-support-reference={confirmation.reference}>
  <b>Request {confirmation.reference} received.</b>
  <span>Save this number. A real person replies {CONFIG.supportResponse}.</span>
</div>
```

On failure, retain all fields and render a message with a normal `mailto:` link to `CONFIG.supportEmail`; do not navigate automatically.

- [ ] **Step 4: Build the authenticated inbox**

Create `Support.jsx` with newest-first loading, status/kind `<select>` filters, an accessible table/list, expandable full messages, reference copy button, status selector, internal-note textarea, and `Save ticket` button. Surface load/save errors through `role="status"` and never place customer PII in URLs.

Add Support to admin navigation and routing. Extend `adminNotifications()` to count rows where `status = 'new'`, return `support`, and add an item linking to `/admin/support`.

- [ ] **Step 5: Style and verify responsive states**

Add `.support-confirmation`, `.support-ticket-list`, `.support-ticket`, `.support-ticket-meta`, and admin form styles. At 390px, stack ticket metadata and keep buttons 44px tall; at desktop, use the existing admin panel proportions.

Run: `node --test scripts/trust-surfaces.test.mjs`

Run: `npm run test:responsive`

Expected: successful and failed contact states remain readable with no horizontal overflow; admin source contracts pass.

- [ ] **Step 6: Commit**

```bash
git add src/admin/Support.jsx src/pages/Contact.jsx src/admin/AdminRoutes.jsx src/admin/adminData.js src/styles/global.css scripts/responsive-accessibility.test.mjs scripts/trust-surfaces.test.mjs
git commit -m "Replace mailto forms with tracked support requests"
```

---

### Task 5: Verified Identity, Documentary Media, and Review Provenance

**Files:**
- Modify: `src/lib/config.js`
- Modify: `src/admin/Settings.jsx`
- Modify: `src/pages/About.jsx`
- Modify: `src/components/Reviews.jsx`
- Modify: `src/components/Footer.jsx`
- Modify: `src/pages/Product.jsx`
- Modify: `src/styles/global.css`
- Create: `scripts/brand-trust.test.mjs`

**Interfaces:**
- Consumes/produces optional settings: `founderName`, `founderRole`, `founderStatement`, `legalBusinessName`, `businessCity`, `businessRegion`, `supportPhone`, `founderImage`, `productionImages`, `packagingImages`.
- Evidence images use `{ src: string, alt: string, caption: string }` objects.
- Produces reusable review provenance copy identifying previous Shopify/Judge.me imports without claiming current third-party certification.

- [ ] **Step 1: Write failing identity/provenance tests**

Create `scripts/brand-trust.test.mjs` to import `DEFAULT_CONFIG` and assert all optional identity strings default to `''` and both evidence arrays default to `[]`. Read `About.jsx` and assert it conditionally checks each identity/media value. Read `Reviews.jsx`, `Footer.jsx`, and `Product.jsx` and assert they include `previous Shopify store` and `Judge.me` disclosure where imported reviews are summarized.

- [ ] **Step 2: Run the test and verify red state**

Run: `node --test scripts/brand-trust.test.mjs`

Expected: failures for missing fields and provenance copy.

- [ ] **Step 3: Add truthful defaults and admin editors**

Add empty defaults to `DEFAULT_CONFIG`. Add a `Brand identity` setting group for text fields and founder image using the existing image-upload control. Add two repeatable three-slot image groups in `Settings.jsx`; each slot edits URL/upload, alt text, and caption. Save them inside `productionImages` and `packagingImages` arrays after filtering rows without `src`.

Do not seed the legacy site’s address, phone, or placeholder city.

- [ ] **Step 4: Rebuild About as conditional trust evidence**

Keep the existing story copy and editorial image. Add:

- a founder section only when `CONFIG.founderName` is truthy;
- a business facts section showing only populated legal name, city/region, phone, support email, and domain;
- production and fulfillment figures created only from images with `src` and non-empty descriptive `alt`;
- links to Contact, Shipping, Returns, Privacy, and Terms.

Use normal document flow, `loading="lazy"`, width/height or `aspect-ratio`, and `<figure>/<figcaption>`. Never render empty headings or placeholder cards.

- [ ] **Step 5: Add review provenance at every aggregate claim**

Create one concise shared string in `src/lib/reviews.js`, for example:

```js
export const REVIEW_PROVENANCE = 'Reviews marked imported came from Dark Divine’s previous Shopify store through Judge.me. Verified means the review email matched an eligible order in the records available to us.';
```

Render a shortened source label next to aggregate counts and the full explanation in the Reviews section. Preserve the existing privacy-safe reviewer names and verification logic.

- [ ] **Step 6: Run tests and capture About layouts**

Run: `node --test scripts/brand-trust.test.mjs`

Run: `npm run test:responsive`

Capture `/about` at 390x844, 1004x847, and 1440x900 with empty identity fields, then with long demo values and three images in each gallery. Assert no empty sections, broken images, overlap, or horizontal overflow.

- [ ] **Step 7: Commit**

```bash
git add src/lib/config.js src/lib/reviews.js src/admin/Settings.jsx src/pages/About.jsx src/components/Reviews.jsx src/components/Footer.jsx src/pages/Product.jsx src/styles/global.css scripts/brand-trust.test.mjs
git commit -m "Add verified brand identity and review provenance"
```

---

### Task 6: Persistent Video and GSAP Motion Control

**Files:**
- Create: `src/lib/motionPreference.js`
- Create: `src/components/MotionControl.jsx`
- Modify: `src/context/StoreContext.jsx`
- Modify: `src/components/Layout.jsx`
- Modify: `src/components/MotionLayer.jsx`
- Modify: `src/hooks/usePageMotion.js`
- Modify: `src/pages/Home.jsx`
- Modify: `src/components/FilmStrip.jsx`
- Modify: `src/components/ProductStory.jsx`
- Modify: `src/styles/global.css`
- Create: `scripts/motion-preference.test.mjs`
- Modify: `scripts/responsive-accessibility.test.mjs`

**Interfaces:**
- Produces: `readMotionPreference(mediaQuery): boolean`, where `true` means paused.
- Produces: `saveMotionPreference(paused: boolean): void`.
- Adds StoreContext values: `motionPaused: boolean`, `setMotionPaused(next: boolean): void`, `toggleMotion(): void`.
- `MotionControl` consumes the StoreContext values and renders `aria-pressed={motionPaused}`.

- [ ] **Step 1: Write failing pure preference tests**

Create `scripts/motion-preference.test.mjs` to verify:

```js
test('explicit local preference wins unless reduced motion is requested', () => {
  assert.equal(resolveMotionPreference({ stored: 'playing', reduced: false }), false);
  assert.equal(resolveMotionPreference({ stored: 'paused', reduced: false }), true);
  assert.equal(resolveMotionPreference({ stored: 'playing', reduced: true }), true);
});
```

Export the pure `resolveMotionPreference({ stored, reduced })` function from the new module so Node can test it without DOM globals.

Extend Playwright coverage to assert a `Pause motion` button exists on Home, has a 44x44 minimum hit area, pauses every video, changes to `Play motion`, survives reload, and resumes videos when selected. Add reduced-motion coverage asserting the initial state is paused.

- [ ] **Step 2: Run tests and verify red state**

Run: `node --test scripts/motion-preference.test.mjs`

Run: `node --test --test-name-pattern="motion" scripts/responsive-accessibility.test.mjs`

Expected: failures because the preference and control do not exist.

- [ ] **Step 3: Implement the preference and context state**

Use localStorage key `dd_motion`. `resolveMotionPreference` returns paused whenever reduced motion is true; otherwise it maps stored `paused`/`playing`, defaulting to playing. `StoreContext` listens to `(prefers-reduced-motion: reduce)` changes, forces pause when it becomes true, persists manual changes, toggles `motion-paused` on `<html>`, and removes its listener on unmount.

- [ ] **Step 4: Add the accessible control**

Render `MotionControl` from `Layout` only when the current public page contains cinematic media, starting with Home, Drop, and product pages. Use a normal button with visible `Pause motion`/`Play motion` text, `aria-pressed`, and title. Place it above decorative layers with a fixed safe-area-aware position and 44-pixel minimum dimensions.

- [ ] **Step 5: Make video and GSAP ownership explicit**

In `Home.jsx` and `FilmStrip.jsx`, keep video refs and call `pause()` whenever `motionPaused` becomes true; call `play().catch(() => {})` only when false and the video is configured to autoplay.

Pass `motionPaused` into `MotionLayer`, `usePageMotion`, and `ProductStory`. Add it to `useGSAP` dependencies. When paused, revert component-owned GSAP contexts/ScrollTriggers and clear animation-added opacity/visibility/transform values required for readable static layouts. When playing, recreate only component-scoped timelines. Never call `gsap.globalTimeline.pause()` because that would also freeze unrelated UI feedback.

Add `.motion-paused` CSS rules disabling decorative CSS animation and smooth scrolling while leaving content visible.

- [ ] **Step 6: Verify pause/resume, resizing, and reduced motion**

Run: `node --test scripts/motion-preference.test.mjs`

Run: `npm run test:responsive`

Expected: all videos pause, button state persists, reduced-motion starts static, product story is not pinned while paused, and no invisible animated layer blocks buttons.

Capture Home at 390x844, 1004x847, and 1440x900 in playing and paused states.

- [ ] **Step 7: Commit**

```bash
git add src/lib/motionPreference.js src/components/MotionControl.jsx src/context/StoreContext.jsx src/components/Layout.jsx src/components/MotionLayer.jsx src/hooks/usePageMotion.js src/pages/Home.jsx src/components/FilmStrip.jsx src/components/ProductStory.jsx src/styles/global.css scripts/motion-preference.test.mjs scripts/responsive-accessibility.test.mjs
git commit -m "Add accessible global motion controls"
```

---

### Task 7: Full Regression, Visual Review, and Deployment Readiness

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: any task-owned file only when a verified regression requires correction.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: documented Supabase deployment steps, domain checks, and verified production build.

- [ ] **Step 1: Document operations without secrets**

Update README with exact steps to run the new `supabase/schema.sql` statements, confirm authenticated admin access to Support, populate verified identity/media fields, verify `www` is assigned to the Netlify site, and unpublish the legacy provider after the 301 works.

Remove any real credentials accidentally present in `.env.example`; keep only obvious non-secret placeholders. Verify `.env` remains ignored and never print its values in tests or logs.

- [ ] **Step 2: Run every automated suite from a clean production build**

Run:

```bash
npm run test:media
npm run test:notifications
npm run test:homepage
node --test scripts/trust-surfaces.test.mjs scripts/support-schema.test.mjs scripts/brand-trust.test.mjs scripts/motion-preference.test.mjs
npm run test:responsive
npm run build
```

Expected: every test passes and Vite completes the production build.

- [ ] **Step 3: Perform visual acceptance review**

Inspect screenshots for Gate, Terms, Privacy, Contact success/error, About empty/populated, and Home motion states at 390x520, 390x844, 1004x847, and 1440x900. Check copy intersections, clipped controls, safe-area padding, keyboard focus, broken images, horizontal overflow, and whether paused mode leaves every CTA usable.

If a failure appears, first add or tighten the reproducing assertion, run it red, apply the smallest scoped correction, and rerun the affected plus full responsive suites.

- [ ] **Step 4: Verify deployment-facing behavior without guessing**

After deployment, run:

```bash
curl -I "https://www.darkdivine.store/pages/about-us?source=legacy"
curl -I "https://darkdivine.store/terms"
curl -I "https://darkdivine.store/privacy"
```

Expected: the first response is a permanent redirect whose `Location` preserves `/pages/about-us?source=legacy` on the apex domain; Terms and Privacy return the current app successfully. Confirm the old placeholder About content is no longer reachable.

- [ ] **Step 5: Final diff and security review**

Run `git diff --check`, `git status --short`, and inspect the diff for credentials, public support-ticket reads, invented identity copy, forced `mailto:` navigation, inaccessible controls, and unrelated changes. Leave `.claude/settings.local.json` untouched.

- [ ] **Step 6: Commit documentation or verified corrections**

```bash
git add README.md .env.example
git commit -m "Document trust upgrade deployment"
```

Only add extra task-owned files if Step 3 exposed and verified a regression fix.
