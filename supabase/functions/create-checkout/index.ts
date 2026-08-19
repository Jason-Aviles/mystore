// Supabase Edge Function: create-checkout
// Turns the whole cart into ONE Stripe Checkout Session — real card form,
// Apple Pay / Google Pay, address collection, single payment.
//
// Integrity rules (why this function owns the order):
//   • Prices/titles come from the DATABASE, never from the browser — a
//     tampered request can't buy a $150 bundle for $0.01.
//   • Inventory is checked here before Stripe opens — if a size sold out
//     while the cart sat, the customer gets a precise, fixable error
//     instead of paying for stock that doesn't exist.
//   • The pending order row is created HERE with the service role. (The
//     storefront's anon key can insert orders but can't read them back,
//     so client-side .insert().select() dies on the RETURNING step —
//     that bug meant no pending orders, no webhook reconciliation, no
//     abandoned-cart flow, no inventory decrement.)
//   • The free-shipping threshold is read live from site_settings so the
//     admin panel and the checkout can never promise different numbers.
//
// Setup:
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
//   supabase functions deploy create-checkout
import Stripe from 'npm:stripe@16';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const US_STANDARD_CENTS = 695;   // $6.95 · 3–7 business days (free over threshold)
const US_PRIORITY_CENTS = 1495;  // $14.95 · 2–3 business days
const CA_TRACKED_CENTS = 1495;   // $14.95 · 7–14 business days
// Rates mirror the published shipping policy (src/pages/Policies.jsx).
// Shipping beyond US/CA isn't offered at checkout yet — the policy page
// tells those customers to email support instead of being mischarged.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { order_id, email, items, origin, country } = await req.json();
    if (!items?.length) return json({ error: 'empty cart' }, 400);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY not configured' }, 500);
    const stripe = new Stripe(stripeKey);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const site = origin || 'https://darkdivine.store';
    const shipTo = country === 'CA' ? 'CA' : 'US';

    // ---- resolve every line against the real catalog ----
    const handles = [...new Set(items.map((i: any) => String(i.handle)))];
    const [{ data: prods }, { data: vars }, { data: settingsRow }] = await Promise.all([
      supabase.from('products').select('handle, title, price, images, status, campaign_id, per_customer_limit, max_preorder_units, deposit').in('handle', handles),
      supabase.from('product_variants').select('product_handle, option1, option2, inventory_qty, price').in('product_handle', handles),
      supabase.from('site_settings').select('data').eq('id', 1).maybeSingle(),
    ]);

    // ---- preorder campaigns touched by this cart ----
    const campaignIds = [...new Set((prods || []).map((p) => p.campaign_id).filter(Boolean))];
    const { data: campaigns } = campaignIds.length
      ? await supabase.from('preorder_campaigns').select('*').in('id', campaignIds)
      : { data: [] };
    const campaignOf = (p: any) => (campaigns || []).find((c) => c.id === p.campaign_id) || null;
    const campaignLive = (c: any) => {
      if (!c || c.status !== 'live') return false;
      const now = Date.now();
      if (c.opens_at && now < Date.parse(c.opens_at)) return false;
      if (c.closes_at && now >= Date.parse(c.closes_at)) return false;
      return true;
    };
    // a preorder that is no longer open must never be sellable — the window
    // is enforced HERE, not by trusting the storefront's clock
    for (const p of prods || []) {
      const c = campaignOf(p);
      if (c && !campaignLive(c)) {
        return json({ error: 'preorder_closed', campaign: c.name, closes_at: c.closes_at }, 409);
      }
    }

    // prior PAID units per handle (for per-customer + production-cap checks)
    const buyer = String(email || '').toLowerCase();
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
      .filter((x: any) => x.product_handle === h && x.orders?.customer_email === buyer)
      .reduce((s: number, x: any) => s + x.qty, 0);
    const settings = settingsRow?.data || {};
    const freeShipThreshold = Number(settings.freeShipThreshold ?? 100);

    const short: any[] = [];
    const lines: any[] = [];
    for (const i of items) {
      // no arbitrary cap here — silently paying for fewer units than the
      // cart shows would be its own lie; the stock check below rejects
      // anything the inventory can't cover
      const qty = Math.max(1, Math.floor(Number(i.qty) || 1));
      const p = (prods || []).find((x) => x.handle === i.handle && x.status === 'active');
      const v = (vars || []).find((x) =>
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
      // per-customer purchase limit: this cart + everything this email
      // already paid for must stay inside the published limit
      if (c && p.per_customer_limit != null) {
        const inCart = items.filter((x: any) => x.handle === p.handle)
          .reduce((s: number, x: any) => s + Math.max(1, Math.floor(Number(x.qty) || 1)), 0);
        if (inCart + buyerUnits(p.handle) > p.per_customer_limit) {
          return json({
            error: 'limit', title: p.title, limit: p.per_customer_limit,
            already: buyerUnits(p.handle),
          }, 409);
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
      // deposits: when set, Stripe charges the deposit per unit and the line
      // says so plainly — the customer is never billed the balance silently
      const deposit = c && p.deposit != null ? Number(p.deposit) : null;
      const fullPrice = Number(v.price ?? p.price);
      const price = deposit ?? fullPrice; // trusted price — from the DB
      // balance per unit is invoiced later (Stripe invoice, customer-approved)
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
    // any unavailable line stops checkout with an exact, fixable answer
    if (short.length) return json({ error: 'stock', lines: short }, 409);

    // campaign-wide caps (orders / units) — enforced against PAID orders
    for (const c of campaigns || []) {
      const cartUnits = lines.filter((l) => l.campaignId === c.id).reduce((s, l) => s + l.qty, 0);
      if (!cartUnits) continue;
      if (c.max_orders != null || c.max_units != null) {
        const { count: paidOrders } = await supabase.from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id).in('status', ['paid', 'shipped', 'delivered']);
        if (c.max_orders != null && (paidOrders ?? 0) >= c.max_orders) {
          return json({ error: 'preorder_full', campaign: c.name }, 409);
        }
        if (c.max_units != null) {
          const { data: cu } = await supabase.from('order_items')
            .select('qty, orders!inner(status, campaign_id)')
            .eq('orders.campaign_id', c.id)
            .in('orders.status', ['paid', 'shipped', 'delivered']);
          const unitsSold = (cu || []).reduce((s: number, x: any) => s + x.qty, 0);
          if (unitsSold + cartUnits > c.max_units) {
            return json({ error: 'preorder_full', campaign: c.name, available: Math.max(0, c.max_units - unitsSold) }, 409);
          }
        }
      }
    }

    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

    // preorder facts stamped onto the order so status page + emails always
    // show the same window the customer saw at checkout
    const hasPreorder = lines.some((l) => l.preorder);
    const cartCampaign = hasPreorder
      ? (campaigns || []).find((c) => lines.some((l) => l.campaignId === c.id)) ?? null
      : null;
    // deposit balance owed later (invoiced, customer-approved — never auto-charged)
    const balanceDue = lines.reduce((s, l) => s + (l.balance || 0), 0);

    // A deposit order needs a real Stripe customer so the balance can be
    // invoiced later. REUSE the one already on this pending order if the
    // shopper is retrying — creating a fresh customer per attempt would
    // orphan Stripe customer records and lose the earlier one.
    let existingOrder: { id: string; status: string; access_token: string; stripe_customer: string | null } | null = null;
    if (order_id) {
      const { data } = await supabase.from('orders')
        .select('id, status, access_token, stripe_customer').eq('id', order_id).maybeSingle();
      if (data?.status === 'pending') existingOrder = data as typeof existingOrder;
    }

    let stripeCustomer: string | null = existingOrder?.stripe_customer ?? null;
    if (balanceDue > 0 && email && !stripeCustomer) {
      try {
        const cust = await stripe.customers.create({ email: String(email).toLowerCase() });
        stripeCustomer = cust.id;
      } catch { /* invoice step will surface a missing-customer error honestly */ }
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

    // ---- pending order: reuse the one from this session or create fresh ----
    let orderId: string | null = null;
    let accessToken: string | null = null;
    if (existingOrder) {
      orderId = existingOrder.id;
      accessToken = existingOrder.access_token;
      await supabase.from('order_items').delete().eq('order_id', orderId);
      await supabase.from('orders').update({ total: subtotal, customer_email: (email || '').toLowerCase(), updated_at: new Date().toISOString(), ...preorderFields }).eq('id', orderId);
    }
    if (!orderId) {
      const { data: customer } = email
        ? await supabase.from('customers').upsert({ email: String(email).toLowerCase() }, { onConflict: 'email' }).select('id').single()
        : { data: null };
      const { data: order, error: orderErr } = await supabase.from('orders').insert({
        customer_email: (email || '').toLowerCase(),
        customer_id: customer?.id ?? null,
        status: 'pending',
        total: subtotal,
        ...preorderFields,
      }).select('id, access_token').single();
      if (orderErr || !order) return json({ error: 'could not record the order' }, 500);
      orderId = order.id;
      accessToken = order.access_token;
    }
    await supabase.from('order_items').insert(lines.map((l) => ({
      order_id: orderId,
      product_handle: l.handle,
      title: l.title,
      option1: l.option1,
      option2: l.option2,
      qty: l.qty,
      price: l.price,
    })));

    const line_items = lines.map((l) => ({
      quantity: l.qty,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(l.price * 100),
        product_data: {
          name: l.title,
          // preorder truth travels INTO Stripe Checkout — the payment page
          // itself says this item is made later and when it ships
          description: [
            [l.option1, l.option2].filter(Boolean).join(' / ') || null,
            l.preorder ? (l.shipWindow
              ? `Preorder — made after the preorder closes. Est. ship ${l.shipWindow}.`
              : 'Preorder — made after the preorder closes.') : null,
          ].filter(Boolean).join(' · ') || undefined,
          images: l.image ? [l.image] : undefined,
        },
      },
    }));

    // Only the rates the shipping policy actually publishes, for the country
    // the customer told us — nobody can pick a US rate for a Canadian address.
    const shipping_options = shipTo === 'CA'
      ? [{
          shipping_rate_data: {
            display_name: 'Canada Tracked (7–14 business days)',
            type: 'fixed_amount' as const,
            fixed_amount: { amount: CA_TRACKED_CENTS, currency: 'usd' },
          },
        }]
      : [{
          shipping_rate_data: {
            display_name: subtotal >= freeShipThreshold ? 'US Standard (3–7 business days) — Free' : 'US Standard (3–7 business days)',
            type: 'fixed_amount' as const,
            fixed_amount: { amount: subtotal >= freeShipThreshold ? 0 : US_STANDARD_CENTS, currency: 'usd' },
          },
        }, {
          shipping_rate_data: {
            display_name: 'US Priority (2–3 business days)',
            type: 'fixed_amount' as const,
            fixed_amount: { amount: US_PRIORITY_CENTS, currency: 'usd' },
          },
        }];

    // No payment_method_types passed on purpose: Stripe automatically offers
    // every method you enable in Dashboard → Settings → Payment methods
    // (cards, Apple Pay, Google Pay, Link, Cash App Pay, Klarna, Afterpay,
    // Amazon Pay). Toggle them there — no code change needed.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      // deposit orders use the Stripe customer we created (so the later
      // balance invoice lands on the same record); everyone else just gets
      // their email prefilled. Never pass both — Stripe rejects that.
      ...(stripeCustomer ? { customer: stripeCustomer } : { customer_email: email || undefined }),
      shipping_address_collection: { allowed_countries: [shipTo] },
      phone_number_collection: { enabled: true }, // carriers need a delivery phone
      shipping_options,
      allow_promotion_codes: true,     // DARKDIVINEWELCOME10 etc. — created by scripts/setup-stripe-codes.mjs
      metadata: {
        order_id: orderId,
        ...(cartCampaign ? {
          campaign_id: cartCampaign.id,
          campaign: cartCampaign.slug,
          est_ship_window: shipWindow(cartCampaign) || '',
        } : {}),
      },
      success_url: `${site}/thanks?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/cart`,
    });

    // remember the session on the pending order so the webhook can reconcile
    await supabase.from('orders').update({ stripe_ref: session.id }).eq('id', orderId);

    // access_token goes back to the buyer's own browser so the Thanks page
    // can link straight to the token-protected status page for THIS order
    return json({ url: session.url, order_id: orderId, access_token: accessToken });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function shipWindow(c: any): string {
  if (!c?.estimated_shipping_start || !c?.estimated_shipping_end) return '';
  const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(c.estimated_shipping_start)} – ${f(c.estimated_shipping_end)}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
