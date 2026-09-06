import { normalizeSiteSettings } from './media';
import { DEFAULT_HOMEPAGE } from './homeContent';
export { normalizeMediaUrl, normalizeSiteSettings } from './media';

/* Site configuration.
   DEFAULT_CONFIG ships with the bundle; the admin panel's Site Settings
   page saves overrides (Supabase `site_settings` in live mode, localStorage
   in demo mode). StoreContext merges overrides over the defaults, so the
   whole storefront updates without a redeploy. */

export const DEFAULT_CONFIG = {
  brand: 'Dark Divine',
  domain: 'https://darkdivine.store',
  lowStockThreshold: 12, // "Only X left" appears at or below this many total units
  freeShipThreshold: 100,
  dropMode: true,       // master switch — off hides countdowns, drop links, drop language everywhere
  dropName: 'CITY OF SINS — DROP 002',
  dropDate: '2026-07-24T19:00:00-04:00', // update per drop
  supportEmail: 'contact@darkdivine.store', // the brand's only mailbox
  instagram: 'https://instagram.com/darkdivine.official',
  instagramHandle: '@darkdivine.official',
  // Fallback codes used ONLY when Supabase isn't configured.
  // With Supabase, codes live in the access_codes table and are checked
  // by the validate-access-code Edge Function (see supabase/functions).
  // NOTE: any frontend-only code is visible in the bundle — not secure.
  fallbackAccessCodes: ['DIVINE333', 'DIVINE00', 'CITYOFSINS'],
  welcomeCode: 'DARKDIVINEWELCOME10',   // 10% — exists in Shopify discounts export
  comebackCode: 'DARKDIVINECOMEBACK25', // 25% — exists in Shopify discounts export

  /* ---- admin-editable storefront copy (defaults match the built-in design) ---- */
  /* ---- trust content (single source — every page reads THESE, never hardcodes) ---- */
  returnsDays: 30,        // return window in days — must match the published refund policy
  processingDays: 2,      // business days to dispatch — must match the shipping policy
  supportResponse: 'within 24 hours', // general support reply time — only claim what you honor
  returnsResponse: 'within 48 hours', // return-request reply time (often longer than general support)
  freeReturns: false, // false = customer covers return shipping on normal returns (defects/wrong items always on us). Flip true only if you truly offer free return shipping.
  // Payment methods VERIFIED against this Stripe account's dashboard config
  // (card brands, Apple Pay, Link, Cash App, Klarna, Amazon Pay on; Google Pay
  // and Afterpay OFF). Edit in admin if you toggle methods in Stripe.
  payMethods: 'Visa, Mastercard, Amex, Discover, Apple Pay, Link, Cash App, Klarna, Amazon Pay',
  payLaterNote: true,     // Klarna pay-in-4 note on product/cart — Klarna is ON in Stripe; turn off if you disable it there

  anncText: '', // empty = auto "Free US shipping over $X · {dropName} loading"
  saleEndsAt: '', // ISO date — if set & future, the announcement bar counts down to it. Only set when the sale genuinely ends then.
  heroScript: 'Illuminate',
  heroTitle: 'The Darkness|Within', // "|" = line break
  heroSub: 'Limited-run streetwear cut in small numbers. Every piece is released once, in one drop — when a colorway sells through, it never comes back.',
  gateEnabled: true, // access-code gate on The Drop page
  gateEntryEnabled: true, // independently hide code entry while preserving waitlist + policy access
  gateRemember: false, // remember unlock across visits — off: gate greets them again next visit (same tab stays open)
  gateGuestBypass: true, // false = code is the ONLY way in (no "browse as guest")
  preorderOnlyLock: false, // true = storefront routes redirect into the active private preorder
  dropImage: '',
  // Hero background videos + their poster stills. Blank falls back to the
  // built-in clips. Admin can upload/replace these in Site Settings.
  heroVideoA: '/media/editorial/broadcast.mp4',
  heroPosterA: '/media/editorial/broadcast-poster.jpg',
  heroVideoB: '/media/editorial/hero-film.mp4',
  heroPosterB: '/media/editorial/hero-film-poster.jpg',
  shopCampaignImage: '', // editorial tile in the Shop All grid (defaults to the couch shot) // admin-uploaded picture of the next drop — shows in the gate, homepage timer panel, and Drop page
  reviewPopups: true, // corner toasts featuring real verified reviews
  popupEnabled: true,   // email capture popup
  popupDelaySec: 18,    // seconds before the timed popup
  popupTitle: 'Your First Order', // headline under the 10% OFF
  popupImage: '',       // campaign image in the popup (defaults to pendant editorial)
  // Meta (Facebook) Pixel ID. Set VITE_META_PIXEL_ID in .env to connect ads —
  // the pixel fires the moment it's filled in and the site is rebuilt/deployed.
  // The admin Site Settings field still overrides this if you set it there.
  metaPixelId: import.meta.env.VITE_META_PIXEL_ID || '',
  justSoldPopups: true, // corner toasts from real paid orders
  homepage: DEFAULT_HOMEPAGE,
};

// Back-compat: modules that want the static defaults.
export const CONFIG = DEFAULT_CONFIG;

const LS_KEY = 'dd_site_settings';

export function localSettings() {
  try { return normalizeSiteSettings(JSON.parse(localStorage.getItem(LS_KEY)) || {}); } catch { return {}; }
}
export function saveLocalSettings(patch) {
  localStorage.setItem(LS_KEY, JSON.stringify(normalizeSiteSettings({ ...localSettings(), ...patch })));
}
export function replaceLocalSettings(overrides) {
  localStorage.setItem(LS_KEY, JSON.stringify(normalizeSiteSettings(overrides)));
}

/** Fetch admin overrides. Live → site_settings table; demo → localStorage. */
export async function fetchSiteSettings() {
  const { supabase, hasSupabase } = await import('./supabase');
  if (hasSupabase) {
    const { data } = await supabase.from('site_settings').select('data').eq('id', 1).maybeSingle();
    return normalizeSiteSettings(data?.data || {});
  }
  return localSettings();
}
