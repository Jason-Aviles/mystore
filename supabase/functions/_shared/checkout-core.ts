// Shared checkout core — ONE set of rules for every payment provider.
//
// prepareOrder(): resolves the cart against the real catalog (DB prices,
//   never the browser's), enforces stock, preorder windows, per-customer
//   limits and production caps, then creates/reuses the PENDING order with
//   its line items. create-checkout (Stripe) and paypal-create-order both
//   call it, so the two can never price or validate a cart differently.
//
// markOrderPaid(): the single "money arrived" path — pending → paid,
//   delivery address saved, customer record mirrored, confirmation email,
//   private owner sale alert, inventory decrement. stripe-webhook and
//   paypal-capture both call it. Idempotent: only a PENDING order moves.
import { sendOwnerSaleAlerts } from './owner-sale-alert.mjs';

export const US_STANDARD_CENTS = 695;   // $6.95 · 3–7 business days (free over threshold)
export const US_PRIORITY_CENTS = 1495;  // $14.95 · 2–3 business days
export const CA_TRACKED_CENTS = 1495;   // $14.95 · 7–14 business days
// Rates mirror the published shipping policy (src/pages/Policies.jsx).

type Fail = { ok: false; status: number; body: Record<string, unknown> };
export type Line = {
  handle: string; title: string; fullTitle: string;
  option1: string | null; option2: string | null;
  qty: number; price: number; balance: number;
  image: string | null; preorder: boolean; shipWindow: string | null; campaignId: string | null;
};
export type Prepared = {
  ok: true;
  orderId: string; accessToken: string;
  lines: Line[]; subtotal: number; balanceDue: number;
  shipTo: 'US' | 'CA'; freeShipThreshold: number;
  cartCampaign: any | null; stripeCustomer: string | null;
};

export async function prepareOrder(opts: {
  supabase: any;
  order_id?: string | null;
  email?: string | null;
  items: any[];
  country?: string | null;
  site: string;
  /** creates a Stripe customer for deposit orders (balance is invoiced later) */
  createStripeCustomer?: (email: string) => Promise<string | null>;
  /** code the shopper unlocked the private preorder with (gate) */
  accessCode?: string | null;
}): Promise<Fail | Prepared> {
  const { supabase, order_id, items, site } = opts;
  const email = String(opts.email || '').toLowerCase();
  const fail = (status: number, body: Record<string, unknown>): Fail => ({ ok: false, status, body });
  if (!items?.length) return fail(400, { error: 'empty cart' });
  const shipTo: 'US' | 'CA' = opts.country === 'CA' ? 'CA' : 'US';

  // ---- resolve every line against the real catalog ----
  const handles = [...new Set(items.map((i: any) => String(i.handle)))];
  const [{ data: prods }, { data: vars }, { data: settingsRow }] = await Promise.all([
    supabase.from('products').select('handle, title, price, images, status, campaign_id, per_customer_limit, max_preorder_units, deposit').in('handle', handles),
    supabase.from('product_variants').select('product_handle, option1, option2, inventory_qty, price').in('product_handle', handles),
    supabase.from('site_settings').select('data').eq('id', 1).maybeSingle(),
  ]);

  // ---- preorder campaigns touched by this cart ----
  const campaignIds = [...new Set((prods || []).map((p: any) => p.campaign_id).filter(Boolean))];
  const { data: campaigns } = campaignIds.length
    ? await supabase.from('preorder_campaigns').select('*').in('id', campaignIds)
    : { data: [] };
  // a RELEASED drop sells its pieces as normal in-stock items — only drops
  // still in a preorder state apply preorder windows, limits and deposits
  const campaignOf = (p: any) => {
    const c = (campaigns || []).find((x: any) => x.id === p.campaign_id) || null;
    return c && c.status !== 'released' ? c : null;
  };
  // a preorder that is no longer open must never be sellable — the window
  // is enforced HERE, not by trusting the storefront's clock
  for (const p of prods || []) {
    const c = campaignOf(p);
    if (c && !campaignLive(c)) return fail(409, { error: 'preorder_closed', campaign: c.name, closes_at: c.closes_at });
  }

  // PRIVATE PREORDER: the gate is only a screen — the code is enforced HERE.
  // A code-only campaign needs a currently active code for that campaign
  // (or a legacy drop code), whatever the browser did to skip the gate.
  const codeCampaigns = (campaigns || []).filter((c: any) => c.status === 'live' && c.access_required !== false);
  if (codeCampaigns.length && (prods || []).some((p: any) => codeCampaigns.some((c: any) => c.id === p.campaign_id))) {
    const clean = String(opts.accessCode || '').trim().toUpperCase();
    let ok = false;
    if (clean) {
      const { data: pc } = await supabase.from('preorder_access_codes').select('campaign_id')
        .eq('code', clean).eq('active', true).in('campaign_id', codeCampaigns.map((c: any) => c.id));
      ok = Boolean(pc?.length);
      if (!ok) {
        const { data: legacy } = await supabase.from('access_codes').select('code').eq('code', clean).eq('active', true).maybeSingle();
        ok = Boolean(legacy);
      }
    }
    if (!ok) return fail(403, { error: 'code_required' });
  }

  // prior PAID units per handle (for per-customer + production-cap checks)
  const { data: priorItems } = campaignIds.length
    ? await supabase.from('order_items')
        .select('product_handle, qty, orders!inner(status, customer_email)')
        .in('product_handle', handles)
        .in('orders.status', ['paid', 'shipped', 'delivered'])
    : { data: [] };
  const soldUnits = (h: string) => (priorItems || [])
    .filter((x: any) => x.product_handle === h)
    .reduce((s: number, x: any) => s + x.qty, 0);
  const buyerUnits = (h: string) => (priorItems || [])
    .filter((x: any) => x.product_handle === h && x.orders?.customer_email === email)
    .reduce((s: number, x: any) => s + x.qty, 0);
  const settings = settingsRow?.data || {};
  const freeShipThreshold = Number(settings.freeShipThreshold ?? 100);

  // LOCKDOWN (admin: preorder-only mode): only the drop's preorder pieces sell —
  // unless the featured drop's countdown has ended with "unlock the store"
  // on, exactly like the storefront (so the two can never disagree)
  let lockExpired = false;
  if (settings.preorderOnlyLock === true && settings.featuredDropId) {
    const { data: fd } = await supabase.from('preorder_campaigns').select('content').eq('id', settings.featuredDropId).maybeSingle();
    const cd = fd?.content?.countdown;
    lockExpired = Boolean(cd?.enabled && cd?.unlockOnExpiry && cd?.at && Date.now() >= Date.parse(cd.at));
  }
  if (settings.preorderOnlyLock === true && !lockExpired) {
    const regular = (prods || []).filter((p: any) => !campaignOf(p));
    if (regular.length) return fail(409, { error: 'store_locked', titles: regular.map((p: any) => p.title) });
  }

  const short: any[] = [];
  const lines: Line[] = [];
  for (const i of items) {
    // no arbitrary cap — the stock check rejects anything inventory can't cover
    const qty = Math.max(1, Math.floor(Number(i.qty) || 1));
    const p = (prods || []).find((x: any) => x.handle === i.handle && x.status === 'active');
    const v = (vars || []).find((x: any) =>
      x.product_handle === i.handle
      && x.option1 === (i.option1 || null)
      && (x.option2 || null) === (i.option2 || null));
    if (!p || !v) {
      short.push({ handle: i.handle, option1: i.option1, option2: i.option2, requested: qty, available: 0, title: p?.title || i.handle });
      continue;
    }
    if (v.inventory_qty < qty) {
      short.push({ handle: i.handle, option1: i.option1, option2: i.option2, requested: qty, available: v.inventory_qty, title: p.title });
      continue;
    }
    const c = campaignOf(p);
    // per-customer limit: this cart + everything this email already paid for
    if (c && p.per_customer_limit != null) {
      const inCart = items.filter((x: any) => x.handle === p.handle)
        .reduce((s: number, x: any) => s + Math.max(1, Math.floor(Number(x.qty) || 1)), 0);
      if (inCart + buyerUnits(p.handle) > p.per_customer_limit) {
        return fail(409, { error: 'limit', title: p.title, limit: p.per_customer_limit, already: buyerUnits(p.handle) });
      }
    }
    // production cap for the whole run — treated exactly like stock
    if (c && p.max_preorder_units != null) {
      const remaining = p.max_preorder_units - soldUnits(p.handle);
      if (qty > remaining) {
        short.push({ handle: i.handle, option1: i.option1, option2: i.option2, requested: qty, available: Math.max(0, remaining), title: p.title });
        continue;
      }
    }
    // deposits: charge the deposit per unit; the balance is invoiced later
    const deposit = c && p.deposit != null ? Number(p.deposit) : null;
    const fullPrice = Number(v.price ?? p.price);
    const price = deposit ?? fullPrice; // trusted price — from the DB
    const balancePerUnit = deposit != null ? Math.max(0, fullPrice - deposit) : 0;
    const img = Array.isArray(p.images) && p.images[0] ? String(p.images[0]) : null;
    lines.push({
      handle: p.handle,
      title: deposit != null ? `${p.title} — preorder deposit` : p.title,
      fullTitle: p.title,
      option1: i.option1 || null, option2: i.option2 || null,
      qty, price,
      balance: balancePerUnit * qty,
      image: img ? (img.startsWith('http') ? img : `${site}${img}`) : null,
      preorder: Boolean(c),
      shipWindow: c ? shipWindow(c) : null,
      campaignId: c?.id ?? null,
    });
  }
  if (short.length) return fail(409, { error: 'stock', lines: short });

  // campaign-wide caps (orders / units) — enforced against PAID orders
  for (const c of campaigns || []) {
    const cartUnits = lines.filter((l) => l.campaignId === c.id).reduce((s, l) => s + l.qty, 0);
    if (!cartUnits) continue;
    if (c.max_orders != null || c.max_units != null) {
      const { count: paidOrders } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id).in('status', ['paid', 'shipped', 'delivered']);
      if (c.max_orders != null && (paidOrders ?? 0) >= c.max_orders) return fail(409, { error: 'preorder_full', campaign: c.name });
      if (c.max_units != null) {
        const { data: cu } = await supabase.from('order_items')
          .select('qty, orders!inner(status, campaign_id)')
          .eq('orders.campaign_id', c.id)
          .in('orders.status', ['paid', 'shipped', 'delivered']);
        const unitsSold = (cu || []).reduce((s: number, x: any) => s + x.qty, 0);
        if (unitsSold + cartUnits > c.max_units) {
          return fail(409, { error: 'preorder_full', campaign: c.name, available: Math.max(0, c.max_units - unitsSold) });
        }
      }
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const hasPreorder = lines.some((l) => l.preorder);
  const cartCampaign = hasPreorder
    ? (campaigns || []).find((c: any) => lines.some((l) => l.campaignId === c.id)) ?? null
    : null;
  const balanceDue = lines.reduce((s, l) => s + (l.balance || 0), 0);

  // reuse this shopper's pending order on retry (keeps one Stripe customer)
  let existingOrder: { id: string; status: string; access_token: string; stripe_customer: string | null } | null = null;
  if (order_id) {
    const { data } = await supabase.from('orders')
      .select('id, status, access_token, stripe_customer').eq('id', order_id).maybeSingle();
    if (data?.status === 'pending') existingOrder = data;
  }
  let stripeCustomer: string | null = existingOrder?.stripe_customer ?? null;
  if (balanceDue > 0 && email && !stripeCustomer && opts.createStripeCustomer) {
    try { stripeCustomer = await opts.createStripeCustomer(email); } catch { /* invoice step surfaces it */ }
  }

  const preorderFields = cartCampaign ? {
    campaign_id: cartCampaign.id,
    production_status: 'received',
    est_ship_start: cartCampaign.estimated_shipping_start ?? null,
    est_ship_end: cartCampaign.estimated_shipping_end ?? null,
    balance_due: balanceDue,
    balance_status: balanceDue > 0 ? 'pending' : 'none',
    ...(stripeCustomer ? { stripe_customer: stripeCustomer } : {}),
  } : {};

  let orderId: string | null = null;
  let accessToken: string | null = null;
  if (existingOrder) {
    orderId = existingOrder.id;
    accessToken = existingOrder.access_token;
    await supabase.from('order_items').delete().eq('order_id', orderId);
    await supabase.from('orders').update({ total: subtotal, customer_email: email, updated_at: new Date().toISOString(), ...preorderFields }).eq('id', orderId);
  }
  if (!orderId) {
    const { data: customer } = email
      ? await supabase.from('customers').upsert({ email }, { onConflict: 'email' }).select('id').single()
      : { data: null };
    const { data: order, error: orderErr } = await supabase.from('orders').insert({
      customer_email: email,
      customer_id: customer?.id ?? null,
      status: 'pending',
      total: subtotal,
      ...preorderFields,
    }).select('id, access_token').single();
    if (orderErr || !order) return fail(500, { error: 'could not record the order' });
    orderId = order.id;
    accessToken = order.access_token;
  }
  await supabase.from('order_items').insert(lines.map((l) => ({
    order_id: orderId, product_handle: l.handle, title: l.title,
    option1: l.option1, option2: l.option2, qty: l.qty, price: l.price,
  })));

  return {
    ok: true, orderId: orderId!, accessToken: accessToken!, lines, subtotal, balanceDue,
    shipTo, freeShipThreshold, cartCampaign, stripeCustomer,
  };
}

/** The standard (cheapest published) shipping charge for a cart, in cents. */
export function standardShippingCents(shipTo: 'US' | 'CA', subtotal: number, freeShipThreshold: number) {
  if (shipTo === 'CA') return CA_TRACKED_CENTS;
  return subtotal >= freeShipThreshold ? 0 : US_STANDARD_CENTS;
}

export type Shipping = {
  name: string | null; phone: string | null;
  line1: string | null; line2: string | null; city: string | null;
  state: string | null; postal_code: string | null; country: string | null;
} | null;

/** pending → paid, plus every side effect of a real sale. Returns false if
    the order was not pending (already handled — nothing repeated). */
export async function markOrderPaid(opts: {
  supabase: any;
  orderId: string;
  email: string | null;
  shipping: Shipping;
  /** provider refs written to the order row */
  refs: Record<string, string | null>;
  totalCents?: number | null;
  currency?: string | null;
}): Promise<boolean> {
  const { supabase, orderId, shipping } = opts;
  const { data: found } = await supabase.from('orders')
    .select('id, status, campaign_id, access_token, est_ship_start, est_ship_end, customer_email')
    .eq('id', orderId).maybeSingle();
  if (!found || found.status !== 'pending') return false;

  // conditional update = the race guard: two deliveries can't both flip it
  const { data: flipped } = await supabase.from('orders').update({
    status: 'paid',
    ...opts.refs,
    ...(shipping ? { shipping } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', found.id).eq('status', 'pending').select('id');
  if (!flipped?.length) return false;

  const email = (opts.email || found.customer_email || '').toLowerCase() || null;
  // a PayPal buyer may only reveal their email at approval — keep the order's
  if (email && !found.customer_email) {
    await supabase.from('orders').update({ customer_email: email }).eq('id', found.id).then(() => {}, () => {});
  }
  if (shipping && email) {
    await supabase.from('customers').update({ name: shipping.name, phone: shipping.phone, address: shipping })
      .eq('email', email).then(() => {}, () => {});
  }

  // confirmation email (never blocks the sale)
  try {
    if (email) {
      const { data: camp } = found.campaign_id
        ? await supabase.from('preorder_campaigns').select('name, closes_at').eq('id', found.campaign_id).maybeSingle()
        : { data: null };
      const fmt = (d: string | null) => (d ? new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
      const shipWin = found.est_ship_start && found.est_ship_end ? `${fmt(found.est_ship_start)} – ${fmt(found.est_ship_end)}` : '';
      let balanceLine = '';
      if (found.campaign_id) {
        const { data: its } = await supabase.from('order_items').select('product_handle, qty, price').eq('order_id', found.id);
        const handles = [...new Set((its ?? []).map((i: any) => i.product_handle).filter(Boolean))];
        if (handles.length) {
          const { data: prods } = await supabase.from('products').select('handle, price, deposit').in('handle', handles);
          let balance = 0;
          for (const it of its ?? []) {
            const pr = (prods ?? []).find((p: any) => p.handle === it.product_handle);
            if (pr?.deposit != null && Math.abs(Number(it.price) - Number(pr.deposit)) < 0.01) {
              balance += Math.max(0, Number(pr.price) - Number(pr.deposit)) * it.qty;
            }
          }
          if (balance > 0) {
            balanceLine = `You paid a deposit today. The remaining balance of $${balance.toFixed(2)} is invoiced by email before your order ships — you approve that charge, nothing is billed automatically.`;
          }
        }
      }
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-flow`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow: found.campaign_id ? 'preorder_confirmation' : 'thank_you',
          email,
          vars: {
            order_number: String(found.id).slice(0, 8).toUpperCase(),
            dedup_key: String(found.id),
            status_url: `https://darkdivine.store/order-status?o=${found.id}&t=${found.access_token}`,
            campaign_name: camp?.name ?? '',
            close_date: camp?.closes_at ? fmt(camp.closes_at) : '',
            ship_window: shipWin,
            balance_line: balanceLine,
          },
        }),
      });
    }
  } catch { /* never block payment confirmation */ }

  const { data: items } = await supabase.from('order_items')
    .select('product_handle, title, option1, option2, qty, price').eq('order_id', found.id);

  // private owner alert — provider outage must never fail the sale
  try {
    const alertResult = await sendOwnerSaleAlerts({
      sale: {
        orderId: found.id,
        totalCents: opts.totalCents ?? Math.round((items ?? []).reduce((sum: number, item: any) => sum + Number(item.price) * Number(item.qty), 0) * 100),
        currency: opts.currency ?? 'usd',
        customerEmail: email ?? '',
        items: items ?? [],
      },
      secrets: {
        ownerEmail: Deno.env.get('OWNER_SALE_EMAIL'),
        ownerPhone: Deno.env.get('OWNER_SALE_PHONE'),
        resendApiKey: Deno.env.get('RESEND_API_KEY'),
        resendFrom: Deno.env.get('RESEND_FROM') ?? 'Dark Divine <contact@darkdivine.store>',
        twilioAccountSid: Deno.env.get('TWILIO_ACCOUNT_SID'),
        twilioAuthToken: Deno.env.get('TWILIO_AUTH_TOKEN'),
        twilioFrom: Deno.env.get('TWILIO_FROM'),
      },
    });
    if (alertResult.email === 'failed' || alertResult.sms === 'failed') console.error('Owner sale alert provider failure', alertResult);
  } catch (error) {
    console.error('Owner sale alert failed', String(error));
  }

  // decrement inventory for each line item
  for (const it of items ?? []) {
    if (!it.product_handle || !it.option1) continue;
    let q = supabase.from('product_variants').select('id, inventory_qty')
      .eq('product_handle', it.product_handle).eq('option1', it.option1);
    q = it.option2 ? q.eq('option2', it.option2) : q.is('option2', null);
    const { data: v } = await q.maybeSingle();
    if (v) {
      await supabase.from('product_variants').update({ inventory_qty: Math.max(0, v.inventory_qty - it.qty) }).eq('id', v.id);
    }
  }
  return true;
}

export function campaignLive(c: any) {
  if (!c || c.status !== 'live') return false;
  const now = Date.now();
  if (c.opens_at && now < Date.parse(c.opens_at)) return false;
  if (c.closes_at && now >= Date.parse(c.closes_at)) return false;
  return true;
}

export function shipWindow(c: any): string {
  if (!c?.estimated_shipping_start || !c?.estimated_shipping_end) return '';
  const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(c.estimated_shipping_start)} – ${f(c.estimated_shipping_end)}`;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
