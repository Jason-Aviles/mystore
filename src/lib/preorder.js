/* Private preorder helpers — single source of truth for campaign state.
   Every date shown anywhere comes from the campaign row the admin saved;
   nothing here invents urgency, stock, or timelines. */
import { supabase, hasSupabase } from './supabase';
import { normalizeCampaignMedia } from './media';
export { normalizeCampaignMedia } from './media';

/** The campaign the storefront should currently present:
    a live one first, else a coming-soon one, else null. */
export async function fetchCurrentCampaign() {
  if (!hasSupabase) return null;
  const { data } = await supabase.from('preorder_campaigns')
    .select('*')
    .in('status', ['live', 'coming_soon'])
    .order('created_at', { ascending: false });
  if (!data?.length) return null;
  const campaign = data.find((c) => campaignLive(c)) || data.find((c) => c.status === 'coming_soon') || data[0];
  return normalizeCampaignMedia(campaign);
}

/** live = status 'live' AND inside the open/close window right now. */
export function campaignLive(c) {
  if (!c || c.status !== 'live') return false;
  const now = Date.now();
  if (c.opens_at && now < Date.parse(c.opens_at)) return false;
  if (c.closes_at && now >= Date.parse(c.closes_at)) return false;
  return true;
}

const fmtDate = (d, opts = { month: 'short', day: 'numeric' }) =>
  d ? new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', opts) : '';

export function shipWindowText(c) {
  if (!c?.estimated_shipping_start || !c?.estimated_shipping_end) return '';
  return `${fmtDate(c.estimated_shipping_start)} – ${fmtDate(c.estimated_shipping_end)}`;
}
export function productionStartText(c) { return fmtDate(c?.estimated_production_start, { month: 'long', day: 'numeric' }); }
export function closesText(c) { return fmtDate(c?.closes_at, { month: 'long', day: 'numeric' }); }
export function opensText(c) { return fmtDate(c?.opens_at, { month: 'long', day: 'numeric' }); }

/** A product participates in the preorder when the admin assigned it to
    THIS campaign. (Campaign products are preorders; nothing is ever
    labeled ready-to-ship when it isn't.) */
export function isPreorderProduct(p, campaign) {
  return Boolean(p?.campaignId && campaign && p.campaignId === campaign.id && campaign.status !== 'archived');
}

/** Deposit breakdown for a preorder-deposit product, or null.
    { deposit } is charged now; { balance } is owed before shipping;
    { full } is the total piece price. create-checkout charges `deposit`,
    so the storefront must show THESE numbers, never the full price as if
    it were due today. */
export function depositTerms(p, campaign) {
  if (!isPreorderProduct(p, campaign) || p?.deposit == null) return null;
  const full = Number(p.price);
  const deposit = Number(p.deposit);
  return { deposit, balance: Math.max(0, full - deposit), full };
}

/** What a cart line is charged AT CHECKOUT (deposit for deposit-preorders,
    otherwise the full price) — matches create-checkout exactly. */
export function lineDueNow(p, qty, campaign) {
  const t = depositTerms(p, campaign);
  return (t ? t.deposit : Number(p.price)) * qty;
}
export function lineBalanceLater(p, qty, campaign) {
  const t = depositTerms(p, campaign);
  return t ? t.balance * qty : 0;
}

/* ---- unlock persistence -------------------------------------------------
   The unlocked campaign id + its close date live in localStorage. Expired
   unlocks are ignored, so access ends when the preorder does. */
const UNLOCK_KEY = 'dd_preorder_unlock';

export function saveUnlock(campaign) {
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify({
      campaignId: campaign?.id ?? null,
      slug: campaign?.slug ?? null,
      expiresAt: campaign?.closes_at ?? null,
      at: Date.now(),
    }));
  } catch { /* private mode */ }
}

export function readUnlock() {
  try {
    const u = JSON.parse(localStorage.getItem(UNLOCK_KEY));
    if (!u) return null;
    if (u.expiresAt && Date.now() >= Date.parse(u.expiresAt)) {
      localStorage.removeItem(UNLOCK_KEY);
      return null; // the preorder this unlock belonged to is over
    }
    return u;
  } catch { return null; }
}

export function clearUnlock() {
  try { localStorage.removeItem(UNLOCK_KEY); } catch {}
}

/* ---- customer status link (their own order only) ------------------------ */
const LAST_ORDER_KEY = 'dd_last_order';
export function saveOrderRef(orderId, token) {
  try { localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ orderId, token, at: Date.now() })); } catch {}
}
export function readOrderRef() {
  try { return JSON.parse(localStorage.getItem(LAST_ORDER_KEY)); } catch { return null; }
}

/** Gate submit → preorder-gate Edge Function (the ONLY code check). */
export async function submitGate({ email, code, phone, emailConsent, smsConsent, campaignSlug }) {
  if (!hasSupabase) return { ok: false, error: 'offline' };
  const { data, error } = await supabase.functions.invoke('preorder-gate', {
    body: {
      email, code, phone,
      emailConsent: emailConsent === true,
      smsConsent: smsConsent === true,
      campaign_slug: campaignSlug || undefined,
      referrer: document.referrer || null,
    },
  });
  if (error) {
    // supabase-js surfaces non-2xx as error; pull the body for the reason
    try {
      const body = await error.context?.json?.();
      if (body) return body;
    } catch {}
    return { ok: false, error: 'network' };
  }
  return data || { ok: false, error: 'network' };
}

/** Order-status lookup — id + token must both match server-side. */
export async function fetchOrderStatus(orderId, token) {
  if (!hasSupabase) return { ok: false };
  const { data, error } = await supabase.functions.invoke('order-status', {
    body: { order: orderId, token },
  });
  if (error || !data?.ok) return { ok: false };
  return data;
}

export const PRODUCTION_STAGES = [
  ['received', 'Preorder received'],
  ['preorder_closed', 'Preorder closed'],
  ['production_scheduled', 'Production scheduled'],
  ['materials_secured', 'Materials secured'],
  ['in_production', 'In production'],
  ['quality_control', 'Quality control'],
  ['preparing_shipment', 'Preparing shipment'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
];
export const EXCEPTION_STAGES = [
  ['delayed', 'Delayed'],
  ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'],
];
