# DARK DIVINE — darkdivine.store

Production React storefront + admin panel for the Dark Divine clothing brand.
Fully off Shopify: React + Vite frontend, Supabase backend, Stripe Payment Links
checkout, Resend email marketing, Twilio-ready SMS structure. Deploys to Netlify.

```
├── src/
│   ├── pages/          Home, Drop, Shop, Product, Cart, About, Contact, policies, Unsubscribe
│   ├── components/     Header, Footer, Gate, CartDrawer, ProductCard, VariantPicker, Countdown, Popups
│   ├── admin/          /admin panel — dashboard, products CRUD, inventory, orders, customers, email list, campaigns
│   ├── context/        StoreContext (cart, wishlist, unlock state)
│   ├── lib/            config, supabase client, catalog + marketing data layers
│   └── data/           seed products.json (from your Shopify export) + reviews
├── supabase/
│   ├── schema.sql      all 10 tables + RLS — paste into SQL Editor
│   └── functions/      validate-access-code, send-campaign (Resend)
├── scripts/import-shopify.mjs   Shopify CSV → Supabase importer
├── emails/             5 HTML email templates (welcome, abandoned cart ×2, drop, thank-you, back-in-stock)
├── cvs/                your Shopify exports (source data)
├── public/images/      brand + product images (downloaded from Shopify CDN)
└── legacy-static/      the earlier static-HTML version, kept for reference
```

## Run it now (no accounts needed)

```bash
npm install
npm run dev        # storefront at http://localhost:5173
```

- **Gate codes (demo):** DIVINE333, DIVINE00, CITYOFSINS — or "Browse as guest"
- **Admin (demo):** http://localhost:5173/admin — passcode `darkdivine-admin`
  (change via `VITE_ADMIN_PASSCODE` in `.env`)

Demo mode = everything works, data stays in your browser. Connecting Supabase
(below) makes it real for every visitor.

## Go-live checklist (in order)

### 1. Supabase (free tier) — ~15 min
1. Create a project at [supabase.com](https://supabase.com) → copy the **Project URL** and **anon key** (Settings → API).
2. SQL Editor → New query → paste all of `supabase/schema.sql` → Run.
3. Auth → Users → **Add user** → your email + a strong password. That's your admin login.
4. Copy `.env.example` → `.env`, fill in:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (import script — service key is in Settings → API, keep it secret)
5. Import your Shopify data:
   ```bash
   npm run import:shopify -- --dry   # preview: 8 products, 119 variants, 83 customers, 6 orders
   npm run import:shopify            # write to Supabase
   node scripts/sync-catalog-content.mjs   # ALWAYS after an import — overlays the curated
                                           # catalog (real photos, fit notes, correct size
                                           # casing) onto the raw CSV rows
   ```
6. Edge Functions (secure gate + email sending) — needs the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy validate-access-code
   supabase functions deploy send-campaign
   supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM=drops@darkdivine.store
   ```
   Until `validate-access-code` is deployed, the gate falls back to a table lookup, and
   without Supabase at all it falls back to codes hard-coded in `src/lib/config.js` —
   **that fallback is visible in the JS bundle and is not secure.** Manage real codes
   in the `access_codes` table.

### 2. Stripe — real one-cart checkout (~20 min)
1. [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API keys → copy the **secret key**.
2. ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
   supabase functions deploy create-checkout
   ```
   The cart's **Pay Securely** button now opens a single Stripe Checkout for the whole
   order — card, address collection, promo codes, the works.
3. **Payment methods** — Dashboard → Settings → Payment methods → enable what you
   want; methods appear at checkout automatically, zero code changes. **Then make the
   site's claims match**: Admin → Site Settings → *Trust & policies* → "Accepted payment
   methods" must list exactly what's enabled (as of Jul 2026 the account has card,
   Apple Pay, Link, Cash App, Klarna, Amazon Pay ON; Google Pay and Afterpay OFF —
   the storefront copy reflects that).
3b. **Discount codes** — the codes promised on the site (welcome 10% etc.) must exist
   in Stripe or the promo field rejects them:
   ```bash
   node scripts/setup-stripe-codes.mjs   # creates WELCOME10 / COMEBACK25 / FOREVER30
   ```
   Run it once with the TEST key (done) and **again after swapping in the live key** —
   test-mode codes do not carry over.
4. **Auto-mark orders paid** — Dashboard → Developers → Webhooks → Add endpoint
   `https://YOUR-PROJECT.supabase.co/functions/v1/stripe-webhook`, event
   `checkout.session.completed`, then:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
   Paid orders flip to **paid** in `/admin/orders` by themselves and variant
   inventory decrements automatically.
5. **Promo codes** — recreate `DARKDIVINEWELCOME10` (10%), `DARKDIVINECOMEBACK25` (25%),
   `30DARKDIVINEFOREVER` (30%) as Coupons → Promotion codes; the checkout has
   `allow_promotion_codes` on.
6. Refunds: Dashboard → Payments → refund, then set the order to **refunded** in admin.

### 2b. PayPal (~10 min, optional but recommended)
1. [developer.paypal.com](https://developer.paypal.com) → My Apps → Create App (**Live**) → copy the Client ID.
2. Put it in `.env` / Netlify env as `VITE_PAYPAL_CLIENT_ID`.
3. A real PayPal button appears at checkout; captures go straight to your PayPal
   business account and the order is marked paid automatically.

> **Shop Pay:** exists only inside Shopify — no store off Shopify can offer it.
> Stripe **Link** is the equivalent one-click wallet and is included above.

### 2c. Your 500+ Shopify reviews
The site already shows the **real rating counts** from your export (110 hoodie,
106 sweatpants, 79 tee). To bring the full written reviews over:
1. In your Shopify review app (Judge.me / Loox / Product Reviews): export reviews as CSV.
2. Save it as `cvs/reviews_export.csv`.
3. `npm run import:reviews -- --dry` to preview, then `npm run import:reviews`.
   They import pre-approved and appear on product pages immediately.
New reviews are collected on the post-purchase page and moderated in `/admin/reviews`.

### 3. Resend (email) — ~15 min
1. [resend.com](https://resend.com) → add domain `darkdivine.store` → add their DNS records → verify.
2. Create an API key → set it as a Supabase secret (step 1.6).
3. Senders: `drops@` (campaigns), `hello@` (welcome), `support@` (service).
4. Send campaigns from `/admin/campaigns` — three templates (drop, welcome, win-back)
   are built in, and `emails/` has full-design HTML versions.
5. Real discount codes that already exist from your Shopify export:
   `DARKDIVINEWELCOME10` (10%), `DARKDIVINECOMEBACK25` (25%), `30DARKDIVINEFOREVER` (30%).
   Recreate them as Stripe coupons/promo codes so they work on Payment Links.

### 4. Twilio SMS — later, optional
Phone numbers + consent are already being collected (`sms_subscribers` table, STOP-ready
`opted_out` column). **Nothing sends until you connect Twilio.** When ready: buy a number,
register A2P 10DLC, then add a send function using `TWILIO_*` vars from `.env.example`.

### 5. Netlify + domain — ~15 min
1. Push this folder to GitHub, then Netlify → **Import from Git**.
   Build command `npm run build`, publish directory `dist` (already in `netlify.toml`).
2. Site settings → Environment variables → add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   (never the service role key).
3. Domain settings → add `darkdivine.store` → at your registrar point:
   - `A` record @ → `75.2.60.5`
   - `CNAME` www → `YOURSITE.netlify.app`
4. HTTPS is automatic. Done — the gate is live at darkdivine.store.

## How photos work (important for Netlify)

There are two kinds of images and they live in different places:

1. **Shipped images** — everything in `public/images/` (brand shots + the product
   photos pulled from your Shopify CDN). These are bundled into every deploy and
   served from Netlify's CDN automatically. To change one, replace the file and
   redeploy.
2. **Photos you upload from /admin** — the product editor now has a visual photo
   manager (upload from your computer, paste a URL, reorder with ←/→, ✕ to remove,
   first photo = main). Uploads go to **Supabase Storage** (`product-images` bucket,
   created by schema.sql) and get a permanent public CDN URL — they are **not** part
   of the Netlify deploy, so they survive every redeploy and appear instantly without
   rebuilding. Photos are auto-resized to 1400px so pages stay fast.
   In demo mode (no Supabase) uploads only persist in your own browser.

## Admin panel guide (/admin)

**How to get in:**
- Local: `npm run dev` → http://localhost:5173/admin → passcode `darkdivine-admin`
  (change it via `VITE_ADMIN_PASSCODE` in `.env`).
- Live: https://darkdivine.store/admin → the email + password you created in
  Supabase → Auth → Users. The URL isn't linked anywhere on the store; only you know it.

| Screen | What you can do |
|---|---|
| Dashboard | Revenue, pending orders, list size, low-stock/sold-out alerts |
| Products | Add / edit / remove (archive) products, set Stripe links, flags |
| — inventory | Per-variant stock grid (every size/color combo, live counts) |
| Orders | Status pipeline: pending → paid → shipped → delivered, plus refund_requested → refunded; tracking numbers, internal notes |
| Customers | Imported Shopify customers, spend, marketing consent, search |
| Email List | Every signup with its source (gate/popup/footer/checkout/back-in-stock), CSV export |
| Campaigns | Compose from templates, pick audience, send via Resend, history |

## Drop-day runbook

1. `/admin/products` — confirm stock, set drop products **Featured**.
2. `access_codes` table — add the new code, deactivate old ones.
3. `src/lib/config.js` — update `dropDate` + `dropName`, redeploy (~1 min on Netlify).
4. `/admin/campaigns` — "drop" template → audience **all** → send 48h before, again at drop.
5. After: pending orders → **paid** as Stripe confirms; sold-out sizes announce themselves
   with low-stock badges the whole way down.

## Private preorder system (`/admin/preorders`)

Run a made-to-order drop where the gate becomes a private preorder experience and the
storefront tells the truth about production timelines.

1. **Create a campaign** in `/admin/preorders`. Fill in the real dates (opens, closes,
   estimated production start, estimated shipping window) and optional caps (max orders,
   max units). Everything you type appears verbatim on the gate, product pages, checkout,
   and confirmation email — nothing is invented.
2. **Assign products** to the campaign in the same page. Optionally set a per-customer
   limit, a production cap, or a per-unit deposit. Assigned products show a **Preorder**
   badge and "made after the preorder closes" everywhere — never "in stock".
3. **Add access codes** (per-campaign, disable/rotate any time). Codes are validated only
   by the `preorder-gate` Edge Function — they never ship in the site's JavaScript.
4. **Set the status**: `coming_soon` = the gate collects emails only (no code, stays
   locked); `live` = the gate asks for the access code and, once opened, unlock lasts until
   the preorder closes. `closed` stops checkout server-side even if a stale tab tries.
5. **During production**: publish one update per stage from the campaign page — it emails
   every paid customer their own private status link and can advance every order's stage at
   once. Add tracking numbers per order. Export the **Production CSV** (units to make by
   size/color) and **Fulfillment CSV**.
6. **Customers** track their order at `/order-status` using the private link in their
   confirmation email (order id + unguessable token — no email-only lookup).

### Preorder deposits (optional)

Set a per-unit **deposit** on a campaign product and checkout charges only the deposit.
The remaining balance is handled honestly — never an automatic off-session charge:

- The product page and cart show "deposit today $X · balance $Y invoiced before shipping".
- Checkout creates a Stripe customer and stores the balance on the order.
- When you're ready to collect (e.g. before shipping), click **Invoice $Y** in the order's
  Balance column in `/admin/preorders`. That creates a Stripe invoice and emails the
  customer a secure Stripe-hosted payment page — they click to pay.
- When they pay, the `invoice.paid` webhook marks the order's balance **paid** and the
  status page updates. (Requires the `invoice.paid` event on your Stripe webhook — already
  enabled on the live endpoint.)

**Optional SMS (Twilio):** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
secrets and deploy `send-sms`, then point your Twilio number's messaging webhook at
`/functions/v1/send-sms`. Until those secrets exist, SMS is a no-op — email works without
it. Texts only ever go to numbers with explicit consent that haven't replied STOP.
#   m y s t o r e  
 