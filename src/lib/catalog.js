/* Catalog data layer.
   - With Supabase configured: products + variants come from the database.
   - Without it (demo/local mode): seed JSON from the Shopify export,
     with admin edits overlaid from localStorage so the admin panel
     works end-to-end before any backend exists. */
import seed from '../data/products.json';
import { supabase, hasSupabase } from './supabase';
import { normalizeProductMedia } from './media';
export { normalizeProductMedia } from './media';

const LS_KEY = 'dd_admin_catalog';

export function localOverlay() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
}
export function saveLocalOverlay(products) {
  localStorage.setItem(LS_KEY, JSON.stringify(products.map(normalizeProductMedia)));
}
export function resetLocalOverlay() {
  localStorage.removeItem(LS_KEY);
}

/** Rows from Supabase → the product shape the UI uses. */
function fromDb(row, variants) {
  return normalizeProductMedia({
    ...row.data,
    handle: row.handle,
    title: row.title,
    price: Number(row.price),
    compare: row.compare_at ? Number(row.compare_at) : null,
    category: row.category,
    collection: row.collection,
    featured: row.featured,
    bestseller: row.bestseller,
    newArrival: row.new_arrival,
    stripeLink: row.stripe_link || '',
    status: row.status,
    // preorder columns (null on regular products)
    campaignId: row.campaign_id || null,
    perCustomerLimit: row.per_customer_limit ?? null,
    maxPreorderUnits: row.max_preorder_units ?? null,
    deposit: row.deposit != null ? Number(row.deposit) : null,
    images: row.images?.length ? row.images : row.data?.images || [],
    variants: variants
      .filter((v) => v.product_handle === row.handle)
      .map((v) => [v.option1, v.option2 || '', v.inventory_qty]),
  });
}

export async function fetchProducts() {
  if (hasSupabase) {
    const [{ data: prods, error: e1 }, { data: vars, error: e2 }] = await Promise.all([
      supabase.from('products').select('*').order('created_at'),
      supabase.from('product_variants').select('*'),
    ]);
    if (!e1 && !e2 && prods?.length) {
      return prods.filter((p) => p.status !== 'archived').map((p) => fromDb(p, vars || []));
    }
    // fall through to seed if the tables are empty or unreachable
  }
  return (localOverlay() ?? seed).map(normalizeProductMedia);
}

export function variantQty(p, o1, o2) {
  const v = p.variants.find((v) => v[0] === o1 && (p.options2 ? v[1] === o2 : true));
  return v ? v[2] : 0;
}
export function totalStock(p) { return p.variants.reduce((s, v) => s + (v[2] || 0), 0); }
export function lowStock(p, threshold = 12) { const t = totalStock(p); return t > 0 && t <= threshold ? t : null; }
export function soldOut(p) { return totalStock(p) === 0; }
/** For single-option products: [inStockCount, totalCount] of sizes — real
    availability for card microcopy. Two-option products return null. */
export function sizeAvailability(p) {
  if (p.options2) return null;
  const total = p.options1?.length || 0;
  if (!total) return null;
  const inStock = p.options1.filter((o) => variantQty(p, o, '') > 0).length;
  return [inStock, total];
}
export const money = (n) => '$' + Number(n).toFixed(2);
