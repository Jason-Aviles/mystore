# Storefront Trust Upgrade Design

## Goal

Increase shopper confidence across Dark Divine by removing the publicly visible legacy storefront, publishing complete and consistent legal information, making support requests reliable, presenting only verified business identity and production evidence, disclosing review provenance, and giving visitors control over long-running motion.

## Scope

This change covers the Netlify-hosted React storefront, its Supabase schema and admin application, and the public `www.darkdivine.store` hostname. It preserves the current product catalog, checkout behavior, visual language, fonts, colors, and product animation designs except where global user motion controls must pause them.

The work also completes the related admin requirement discussed immediately before this project: the existing `Drop mode` switch continues to remove the Drop navigation item and redirect `/drop`, while a new independent control can hide the private-preorder entry action without disabling the entire gate.

## Design Principles

- Never publish invented founder, company, address, production, packaging, review, or policy details.
- Admin identity fields default to empty and their storefront sections do not render until populated.
- Trust information stays reachable even when the storefront or preorder is locked.
- Customer support submissions succeed inside the website and return a durable reference number.
- Anonymous visitors may create support tickets but may never list or read tickets.
- Motion controls are visible, keyboard accessible, persistent, and honored by videos and GSAP.
- Reduced-motion preferences always override autoplay behavior.
- The trust upgrade remains visually restrained and uses the established Dark Divine design system.

## 1. Legacy Host Redirect

Netlify will receive a host-specific redirect rule before the SPA fallback:

- `https://www.darkdivine.store/*` redirects permanently to `https://darkdivine.store/:splat`.
- Paths and query strings are preserved.
- The apex hostname continues to use the React Router fallback.
- Redirect behavior is tested from configuration and verified against deployed HTTP responses.

The repository cannot redirect traffic that still resolves to an unrelated legacy hosting provider. Deployment verification therefore includes checking DNS/Netlify domain aliases. If `www` still points at the old provider, the owner must repoint or remove that DNS record before the repository rule can take effect. The old provider storefront should be unpublished after the redirect works.

## 2. Legal and Privacy Pages

A new `/terms` route will publish Terms of Service covering:

- store identity and agreement to the terms;
- eligibility and acceptable storefront use;
- product descriptions, availability, pricing, and correction of errors;
- orders, payment authorization, cancellations, and fraud prevention;
- preorder deposits, later balances, timelines, production changes, and cancellation rights;
- shipping, delivery, customs, returns, refunds, and final-sale handling by reference to the existing policies;
- intellectual property;
- prohibited uses;
- warranty and liability language written in plain English;
- governing location only when a verified business jurisdiction is configured;
- contact details and an effective date.

The Privacy page will add:

- an effective date;
- verified business/controller identity when configured;
- categories of collected data and why each is used;
- Stripe, Supabase, Resend, Twilio, Meta Pixel, and hosting disclosures only for services actually configured or used;
- cookies, local storage, session storage, analytics, and advertising explanations;
- retention guidance by data category;
- marketing consent, withdrawal, SMS STOP, access, export, correction, and deletion rights;
- children/minors language;
- security limitations, international processing, and policy-update notices;
- a support contact path.

Terms will be linked from the footer, cart/checkout trust area, private gate, and relevant preorder copy. Existing policy routes remain unchanged.

## 3. Private Gate and Admin Visibility Controls

The gate will contain a compact `Policies & support` row with links to Shipping, Returns, Privacy, Terms, and Contact. Selecting one temporarily closes or bypasses the overlay for that utility route without unlocking the rest of the storefront. The destination remains usable with the preorder-only lock enabled.

The gate layout will reserve normal-flow space for this link row and retain the existing mobile scrolling and safe-area behavior.

Admin settings will include:

- `Drop mode`: existing master switch for Drop navigation, Drop page, countdowns, and drop language.
- `Access-code gate`: existing switch for the complete entry overlay.
- `Show private preorder entry`: new switch controlling the access-code input and `Enter Private Preorder` action while preserving waitlist/notify behavior and policy access.
- `Browse as guest`: existing independent bypass switch.

When private entry is hidden during a live campaign, the gate presents the waitlist action rather than a dead or inaccessible form.

## 4. Reliable Support Tickets

### Data model

Supabase receives a `support_requests` table with:

- UUID primary key;
- public reference string with a unique constraint;
- request kind (`message`, `tracking`, `return`, or `order_issue`);
- customer name, email, order number, subject, and message;
- status (`new`, `in_progress`, `waiting_customer`, `resolved`, or `closed`);
- optional internal admin note;
- created and updated timestamps.

PII remains private. Row-level security provides no anonymous SELECT, UPDATE, or DELETE policy. Authenticated administrators can read and manage all tickets.

### Public creation

An RPC or Edge Function accepts a narrow validated payload, normalizes email, rate-limits abusive repetition where practical, generates a collision-resistant human-readable reference such as `DD-260906-A1B2C3`, inserts the ticket, and returns only the reference and creation status. It never returns another customer’s data.

The existing Contact forms submit directly to this backend. On success they show a persistent confirmation with the reference number and support-response expectation. Inputs reset only after confirmed insertion. If the backend is unavailable, the form preserves the customer’s text and displays the direct support email as a fallback; it does not automatically launch `mailto:`.

### Admin handling

A new Admin Support page lists newest tickets, filters by status and kind, opens ticket details, and updates status/internal notes. The admin navigation and dashboard expose the unread/new count. No outbound automated response is promised in this scope; the existing support mailbox remains the reply channel.

## 5. Verified Brand Identity and Evidence

Site Settings will add optional fields for:

- founder name;
- founder role/title;
- founder statement;
- legal business name;
- public business city and state/region;
- public support phone;
- founder portrait;
- up to three production photographs;
- up to three packaging/fulfillment photographs;
- optional short captions for each photograph.

Existing authenticated media upload/storage is reused. The About page becomes a trust-focused brand page while retaining its editorial tone:

- current brand story;
- founder block only when a founder name is configured;
- business identity block only for configured verified fields;
- production and packaging proof galleries only when real images exist;
- clear links to support and policies.

No placeholder such as `Founder name`, `[City]`, or an empty image frame may appear publicly.

## 6. Review Provenance

Review summaries and review sections will state that applicable reviews were imported from the previous Dark Divine Shopify store through Judge.me. The disclosure will distinguish imported reviews from new on-site reviews and explain the verified badge in concise language: verified means the associated email matched an eligible order in the available order records.

The disclosure must not imply that Judge.me currently hosts or independently certifies every review. Existing privacy-safe reviewer names remain unchanged.

## 7. Motion and Video Controls

A persistent global motion preference will have two states: `playing` and `paused`. It will be initialized from `prefers-reduced-motion`; reduced-motion starts paused. A compact control with text and icon will appear on pages containing long-running video or animation. It will expose `aria-pressed`, an explicit accessible name, visible keyboard focus, and at least a 44-pixel touch target.

The setting is stored locally and made available through the storefront context. Components must use it as follows:

- autoplay videos pause immediately when motion is paused and resume only when allowed;
- decorative infinite GSAP tweens pause or are not created;
- active GSAP timelines/ScrollTriggers are placed in a paused/static state without hiding content or blocking interaction;
- essential state transitions remain instantaneous when motion is paused;
- changing the setting takes effect without a reload;
- browser reduced-motion changes are observed and may force the safe paused state.

The control will not pause ordinary page scrolling or remove useful static imagery. Cleanup removes listeners and kills component-owned animation instances on unmount.

## 8. Visual Treatment

The visual direction stays within the existing black, bone, silver, and restrained pink palette. Trust additions use quiet editorial typography, hairline separators, compact metadata, and existing button styles. The gate’s policy links and the motion control are utility elements, not new decorative focal points.

The About proof galleries use documentary framing rather than simulated certificates, badges, stock photography, or fabricated seals. Mobile layouts remain single-column with natural document flow and no fixed-height copy containers.

## 9. Error Handling and Safety

- Legal and About content remains readable when Supabase settings fail by using truthful shipped defaults and omitting optional identity fields.
- Ticket submission disables duplicate clicks while pending and exposes errors through an `aria-live` status region.
- Ticket text is length-limited in both client and database/function validation.
- Ticket references contain no customer information.
- Redirect rules precede the SPA fallback to avoid redirect loops.
- Missing media never produces broken public placeholders.
- Paused motion leaves controls, navigation, video posters, and calls to action operable.

## 10. Testing and Acceptance

Implementation follows test-driven development.

### Automated checks

- Configuration test proves the `www` path-preserving redirect precedes the SPA fallback.
- Route/link tests prove Terms is reachable from footer, gate, and checkout trust content.
- Policy-content tests cover the required legal/privacy sections and conditional provider disclosures.
- Support backend tests prove valid creation, stable reference formatting, validation failures, anonymous read denial, and authenticated admin access.
- Contact tests prove successful confirmation, double-submit prevention, preserved input on failure, and no forced `mailto:` navigation.
- Gate tests prove policy access while locked and correct behavior for the private-entry visibility toggle.
- About tests prove blank optional identity fields produce no placeholders and populated settings render the configured content/media.
- Review tests prove provenance disclosure appears with imported reviews.
- Motion tests prove pause/resume behavior, persistence, reduced-motion defaults, accessible state, and safe static content.
- Existing media, homepage, notification, checkout, and responsive suites remain green.

### Visual checks

Capture and inspect at minimum:

- gate at 390x520 and 390x844, including every policy link and all available actions;
- Terms, Privacy, Contact confirmation, About, and homepage motion control at 390, 1004, and 1440 pixels wide;
- keyboard focus states;
- reduced-motion/paused screenshots;
- long founder copy and maximum ticket-error copy without overlap or horizontal overflow.

### Deployment checks

- production build succeeds;
- Supabase migration and public ticket function are deployed;
- `https://www.darkdivine.store/pages/about-us` returns a permanent redirect to the apex equivalent;
- representative legacy URLs preserve paths and query strings;
- no old storefront content remains publicly reachable on `www`;
- apex routes return the new React application.

## Non-Goals

- Inventing or researching private founder/business facts.
- Purchasing or generating fake production photography.
- Replacing Stripe checkout.
- Building a complete customer-service email platform.
- Replatforming away from Netlify or Supabase.
- Redesigning unrelated product or cinematic sections.

