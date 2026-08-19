/* Admin data layer.
   LIVE mode (Supabase configured): reads/writes the real tables.
   DEMO mode (no Supabase): products persist to localStorage overlay,
   orders/customers/signups read from local queues — so the owner can
   learn the panel and stage catalog changes before going live. */
import seed from '../data/products.json';
import { supabase, hasSupabase } from '../lib/supabase';
import { localOverlay, normalizeProductMedia, saveLocalOverlay } from '../lib/catalog';

export const isLive = hasSupabase;

/* ---------- products ---------- */
export async function adminListProducts() {
  if (isLive) {
    const [{ data: prods }, { data: vars }] = await Promise.all([
      supabase.from('products').select('*').order('created_at'),
      supabase.from('product_variants').select('*'),
    ]);
    if (prods) {
      return prods.map((row) => normalizeProductMedia({
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
        status: row.status || 'active',
        images: row.images?.length ? row.images : row.data?.images || [],
        variants: (vars || []).filter((v) => v.product_handle === row.handle)
          .map((v) => [v.option1, v.option2 || '', v.inventory_qty]),
      }));
    }
  }
  return (localOverlay() ?? seed).map((p) => normalizeProductMedia({ status: 'active', ...p }));
}

export async function adminSaveProduct(product) {
  const normalizedProduct = normalizeProductMedia(product);
  if (isLive) {
    const { variants, ...p } = normalizedProduct;
    const row = {
      handle: p.handle,
      title: p.title,
      price: p.price,
      compare_at: p.compare || null,
      category: p.category,
      collection: p.collection,
      featured: !!p.featured,
      bestseller: !!p.bestseller,
      new_arrival: !!p.newArrival,
      stripe_link: p.stripeLink || null,
      status: p.status || 'active',
      images: p.images || [],
      data: p, // full JSON blob keeps desc/fit/care/etc without schema churn
    };
    const { error } = await supabase.from('products').upsert(row, { onConflict: 'handle' });
    if (error) throw error;
    await supabase.from('product_variants').delete().eq('product_handle', p.handle);
    const { error: e2 } = await supabase.from('product_variants').insert(
      variants.map((v) => ({ product_handle: p.handle, option1: v[0], option2: v[1] || null, inventory_qty: v[2] }))
    );
    if (e2) throw e2;
    return;
  }
  const list = (localOverlay() ?? seed).slice();
  const i = list.findIndex((x) => x.handle === normalizedProduct.handle);
  if (i >= 0) list[i] = normalizedProduct; else list.push(normalizedProduct);
  saveLocalOverlay(list);
}

export async function adminDeleteProduct(handle) {
  if (isLive) {
    // archive rather than hard-delete so past orders keep their reference
    const { error } = await supabase.from('products').update({ status: 'archived' }).eq('handle', handle);
    if (error) throw error;
    return;
  }
  saveLocalOverlay((localOverlay() ?? seed).filter((p) => p.handle !== handle));
}

/* ---------- product images ---------- */
/** Resize + compress in the browser so uploads stay light (max 1400px, JPEG 85%). */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 1400;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('compress failed'))), 'image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Upload a product photo.
    LIVE → Supabase Storage bucket `product-images` (public CDN URL, survives
           every redeploy — this is how photos work on Netlify).
    DEMO → compressed data-URL kept in this browser only. */
export async function uploadProductImage(file) {
  const blob = await compressImage(file);
  if (isLive) {
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from('product-images')
      .upload(path, blob, { cacheControl: '31536000', contentType: 'image/jpeg' });
    if (error) throw error;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  }
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** Upload a raw media file (e.g. a hero video) to Supabase Storage — no
    compression (can't transcode video in the browser), so keep clips light.
    Returns a public CDN URL. Demo mode returns an ephemeral object URL. */
export async function uploadMedia(file) {
  const MAX = 30 * 1024 * 1024; // 30MB — hero clips must stay light for load
  if (file.size > MAX) throw new Error('Video too large — keep it under 30MB (compress/trim it first).');
  if (isLive) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const path = `media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('product-images')
      .upload(path, file, { cacheControl: '31536000', contentType: file.type || undefined });
    if (error) throw error;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  }
  return URL.createObjectURL(file); // demo only — not persisted
}

/* ---------- orders ---------- */
const DEMO_ORDERS_KEY = 'dd_demo_orders';
function demoOrders() {
  try { return JSON.parse(localStorage.getItem(DEMO_ORDERS_KEY)) || []; } catch { return []; }
}

export async function adminListOrders() {
  if (isLive) {
    const { data } = await supabase.from('orders')
      .select('*, order_items(*)').order('created_at', { ascending: false });
    return data || [];
  }
  return demoOrders();
}

export async function adminUpdateOrder(id, patch) {
  if (isLive) {
    const { error } = await supabase.from('orders').update(patch).eq('id', id);
    if (error) throw error;
    return;
  }
  const list = demoOrders().map((o) => (o.id === id ? { ...o, ...patch } : o));
  localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(list));
}

/* ---------- customers ---------- */
export async function adminListCustomers() {
  if (isLive) {
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    return data || [];
  }
  try { return JSON.parse(localStorage.getItem('dd_demo_customers')) || []; } catch { return []; }
}

/* ---------- email signups ---------- */
export async function adminListSms() {
  if (isLive) {
    // table is sms_subscribers (matches schema.sql — 'sms_signups' never existed)
    const { data } = await supabase.from('sms_subscribers').select('*').order('created_at', { ascending: false });
    return data || [];
  }
  try { return JSON.parse(localStorage.getItem('dd_sms_queue')) || []; } catch { return []; }
}

export async function adminListSignups() {
  if (isLive) {
    const { data } = await supabase.from('email_signups').select('*').order('created_at', { ascending: false });
    return data || [];
  }
  try { return JSON.parse(localStorage.getItem('dd_email_queue')) || []; } catch { return []; }
}

/* ---------- campaigns ---------- */
export async function adminListCampaigns() {
  if (isLive) {
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    return data || [];
  }
  try { return JSON.parse(localStorage.getItem('dd_demo_campaigns')) || []; } catch { return []; }
}

export async function adminSaveCampaign(c) {
  if (isLive) {
    const { error } = await supabase.from('campaigns').upsert(c);
    if (error) throw error;
    return;
  }
  const list = (await adminListCampaigns()).filter((x) => x.id !== c.id);
  list.unshift({ ...c, id: c.id || crypto.randomUUID(), created_at: new Date().toISOString() });
  localStorage.setItem('dd_demo_campaigns', JSON.stringify(list));
}

/* ---------- site settings (admin-editable storefront config) ---------- */
export async function adminGetSettings() {
  const { fetchSiteSettings } = await import('../lib/config');
  return fetchSiteSettings();
}

export async function adminSaveSettings(patch) {
  if (isLive) {
    const current = await adminGetSettings();
    const { error } = await supabase.from('site_settings')
      .upsert({ id: 1, data: { ...current, ...patch }, updated_at: new Date().toISOString() });
    if (error) throw error;
    return;
  }
  const { saveLocalSettings } = await import('../lib/config');
  saveLocalSettings(patch);
}

/** How many consented, subscribed addresses a campaign audience reaches. */
export async function adminAudienceCount(audience) {
  if (isLive) {
    let q = supabase.from('email_signups')
      .select('email', { count: 'exact', head: true })
      .eq('consent', true).eq('unsubscribed', false);
    if (audience !== 'all') q = q.eq('source', audience);
    const { count } = await q;
    return count ?? 0;
  }
  try {
    const list = JSON.parse(localStorage.getItem('dd_email_queue')) || [];
    const match = audience === 'all' ? list : list.filter((e) => e.source === audience);
    return new Set(match.map((e) => e.email)).size;
  } catch { return 0; }
}

/* ---------- admin notifications ---------- */
/** Actionable counts for the admin bell: orders to ship, preorder balances to
    invoice, reviews to approve, plus info (new signups, low-stock sizes).
    `total` is the "needs your action" number shown on the badge. */
export async function adminNotifications() {
  const empty = { total: 0, orders: 0, balances: 0, reviews: 0, newSignups: 0, soldOut: 0, items: [] };
  if (!isLive) return empty;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const head = { count: 'exact', head: true };
  try {
    // NOTE: no "low stock" alert on purpose — this is a limited-run brand,
    // small quantities are intentional, so low stock is normal, not news.
    // Fully SOLD-OUT sizes are shown instead (restock/retire decision).
    const [o, b, r, s, so] = await Promise.all([
      supabase.from('orders').select('id', head).eq('status', 'paid'), // paid but not yet shipped
      supabase.from('orders').select('id', head).eq('balance_status', 'pending').in('status', ['paid', 'shipped', 'delivered']),
      supabase.from('reviews').select('id', head).eq('approved', false),
      supabase.from('email_signups').select('id', head).gt('created_at', since),
      supabase.from('product_variants').select('id', head).eq('inventory_qty', 0),
    ]);
    const orders = o.count ?? 0, balances = b.count ?? 0, reviews = r.count ?? 0, newSignups = s.count ?? 0, soldOut = so.count ?? 0;
    const items = [];
    const plural = (n, one, many) => (n === 1 ? one : many);
    if (orders) items.push({ key: 'orders', count: orders, label: plural(orders, 'order to fulfill', 'orders to fulfill'), to: '/admin/orders' });
    if (balances) items.push({ key: 'balances', count: balances, label: plural(balances, 'preorder balance to invoice', 'preorder balances to invoice'), to: '/admin/preorders' });
    if (reviews) items.push({ key: 'reviews', count: reviews, label: plural(reviews, 'review to approve', 'reviews to approve'), to: '/admin/reviews' });
    if (newSignups) items.push({ key: 'signups', count: newSignups, label: 'new signups (24h)', to: '/admin/signups', info: true });
    if (soldOut) items.push({ key: 'soldout', count: soldOut, label: plural(soldOut, 'sold-out size', 'sold-out sizes'), to: '/admin/products', info: true });
    return { total: orders + balances + reviews, orders, balances, reviews, newSignups, soldOut, items };
  } catch {
    return empty;
  }
}

/** Send via the send-campaign Edge Function (uses Resend server-side). */
export async function adminSendCampaign(id, testTo = null) {
  if (!isLive) return { ok: false, error: 'Connect Supabase + Resend to send for real. Campaign saved as draft.' };
  const body = testTo ? { campaign_id: id, test_to: testTo } : { campaign_id: id };
  const { data, error } = await supabase.functions.invoke('send-campaign', { body });
  if (error) return { ok: false, error: error.message };
  return { ok: true, ...data };
}
