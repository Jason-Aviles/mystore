/* Reviews data layer.
   src/data/imported-reviews.json = your ACTUAL 296 Judge.me reviews exported
   from the Shopify store (reviews-cvs/), with emails and IPs stripped for
   privacy. They ship with the site so every visitor sees them instantly —
   no backend required. New reviews are collected post-purchase and
   moderated in /admin/reviews. */
import imported from '../data/imported-reviews.json';
import { supabase, hasSupabase } from './supabase';

const SEED = imported.map((r, i) => ({
  id: `import-${i}`,
  ...r,
  verified: true,           // every row in the export carried an order email
  approved: true,
  source: 'shopify_import',
}));

/** Per-product counts and averages from the real review data. */
export const SHOPIFY_RATING_COUNTS = SEED.reduce((m, r) => {
  m[r.product_handle] = (m[r.product_handle] || 0) + 1;
  return m;
}, {});
export const TOTAL_SHOPIFY_RATINGS = SEED.length;
export const RATING_AVG = (SEED.reduce((s, r) => s + r.stars, 0) / SEED.length).toFixed(1);
export function productAvg(handle) {
  const list = SEED.filter((r) => r.product_handle === handle);
  if (!list.length) return null;
  return (list.reduce((s, r) => s + r.stars, 0) / list.length).toFixed(1);
}

const LS_KEY = 'dd_reviews';
function localReviews() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function saveLocal(list) { localStorage.setItem(LS_KEY, JSON.stringify(list)); }

/** Approved reviews — imported seed + live submissions. Newest first. */
export async function fetchReviews(handle = null) {
  let live = [];
  if (hasSupabase) {
    let q = supabase.from('reviews').select('*').eq('approved', true).order('created_at', { ascending: false });
    if (handle) q = q.eq('product_handle', handle);
    const { data } = await q;
    live = data || [];
  } else {
    live = localReviews().filter((r) => r.approved);
    if (handle) live = live.filter((r) => r.product_handle === handle);
  }
  // if the same import was also loaded into Supabase, don't show it twice
  const seedNeeded = !live.some((r) => r.source === 'shopify_import');
  const seed = seedNeeded ? (handle ? SEED.filter((r) => r.product_handle === handle) : SEED) : [];
  return [...live.filter((r) => r.source !== 'shopify_import'), ...seed,
    ...live.filter((r) => r.source === 'shopify_import')];
}

/** Submit a review → pending until approved in admin.
    verified = the email has a paid/shipped/delivered order on file.
    meta.size = the size the customer says they bought (voluntary, real). */
export async function submitReview({ product_handle, name, email, stars, body, meta = {} }) {
  const review = {
    product_handle,
    name: name.trim(),
    email: (email || '').trim().toLowerCase(),
    stars: Math.min(5, Math.max(1, Number(stars))),
    body: body.trim(),
    verified: false,
    approved: false,
    source: 'site',
    meta,
  };

  if (hasSupabase) {
    if (review.email) {
      const { count } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_email', review.email)
        .in('status', ['paid', 'shipped', 'delivered']);
      review.verified = (count ?? 0) > 0;
    }
    const { error } = await supabase.from('reviews').insert(review);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const list = localReviews();
  list.unshift({ ...review, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  saveLocal(list);
  return { ok: true, demo: true };
}

export function ratingCount(handle, liveReviews = []) {
  return (SHOPIFY_RATING_COUNTS[handle] || 0)
    + liveReviews.filter((r) => r.product_handle === handle && r.source !== 'shopify_import').length;
}

export function avgStars(reviews) {
  if (!reviews.length) return null;
  return (reviews.reduce((s, r) => s + r.stars, 0) / reviews.length).toFixed(1);
}

/* ---- admin (live submissions only — the import is read-only seed) ---- */
export async function adminListReviews() {
  if (hasSupabase) {
    const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
    return data || [];
  }
  return localReviews();
}
export async function adminSetApproved(id, approved) {
  if (hasSupabase) {
    const { error } = await supabase.from('reviews').update({ approved }).eq('id', id);
    if (error) throw error;
    return;
  }
  saveLocal(localReviews().map((r) => (r.id === id ? { ...r, approved } : r)));
}
/** Admin adds a review the owner genuinely received off-platform (DM, email,
    in person) — in the customer's own words. Honesty guardrails:
    - the "Verified" badge is set ONLY if the email really matches a paid
      order; it can NEVER be forced on by hand;
    - source is 'admin' so these are distinguishable from customer-submitted
      and imported reviews. This is NOT a tool for inventing reviews. */
export async function adminAddReview({ product_handle, name, email, stars, body, size, approved = true }) {
  const review = {
    product_handle: product_handle || null,
    name: (name || '').trim(),
    email: (email || '').trim().toLowerCase(),
    stars: Math.min(5, Math.max(1, Number(stars) || 0)),
    body: (body || '').trim(),
    verified: false,
    approved: Boolean(approved),
    source: 'admin',
    meta: size ? { size } : {},
  };
  if (!review.name || !review.body || !review.stars) {
    return { ok: false, error: 'Name, a star rating, and the review text are all required.' };
  }
  if (hasSupabase) {
    if (review.email) {
      const { count } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_email', review.email)
        .in('status', ['paid', 'shipped', 'delivered']);
      review.verified = (count ?? 0) > 0; // real order or no badge — never manual
    }
    const { error } = await supabase.from('reviews').insert(review);
    if (error) return { ok: false, error: error.message };
    return { ok: true, verified: review.verified };
  }
  const list = localReviews();
  list.unshift({ ...review, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  saveLocal(list);
  return { ok: true, demo: true };
}

export async function adminDeleteReview(id) {
  if (hasSupabase) {
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  saveLocal(localReviews().filter((r) => r.id !== id));
}
