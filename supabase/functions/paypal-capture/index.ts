// Supabase Edge Function: paypal-capture
// Called after the buyer approves in the PayPal window. Verifies BEFORE any
// money moves, then captures and records the sale:
//   1. our order exists, is linked to this PayPal order, and is pending
//   2. the PayPal order's custom_id is our order id, and its item total is
//      exactly the server-priced total we stored (no client tampering)
//   3. the PayPal shipping address is in a country we ship to, and is the
//      same country whose rate was charged — otherwise nothing is captured
//      and the shopper is told how to fix it
//   4. capture (idempotent request id), then the SAME paid-order path the
//      Stripe webhook uses: address saved, confirmation email, owner alert,
//      inventory decrement (_shared/checkout-core.ts markOrderPaid)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { markOrderPaid, standardShippingCents, json, corsHeaders } from '../_shared/checkout-core.ts';
import { paypal, paypalConfigured } from '../_shared/paypal.ts';

const cents = (v: unknown) => Math.round(Number(v || 0) * 100);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!paypalConfigured()) return json({ error: 'paypal_not_configured' }, 503);
    const { paypal_order_id, order_id } = await req.json();
    if (!paypal_order_id || !order_id) return json({ error: 'missing ids' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: order } = await supabase.from('orders')
      .select('id, status, total, stripe_ref, access_token').eq('id', order_id).maybeSingle();
    if (!order || order.stripe_ref !== `paypal:${paypal_order_id}`) return json({ error: 'order_mismatch' }, 404);
    // a retry after success: report the finished order, change nothing
    if (order.status !== 'pending') return json({ ok: true, order_id: order.id, access_token: order.access_token, already: true });

    // ---- 2 + 3: inspect the approved PayPal order before capturing ----
    const look = await paypal(`/v2/checkout/orders/${encodeURIComponent(paypal_order_id)}`);
    if (!look.ok) return json({ error: 'paypal_lookup_failed' }, 502);
    const unit = look.body?.purchase_units?.[0] ?? {};
    if (unit.custom_id !== order.id) return json({ error: 'order_mismatch' }, 409);
    const itemTotal = cents(unit.amount?.breakdown?.item_total?.value);
    if (Math.abs(itemTotal - cents(order.total)) > 1) {
      console.error('PayPal amount mismatch', order.id, itemTotal, order.total);
      return json({ error: 'amount_mismatch' }, 409);
    }
    const addr = unit.shipping?.address ?? {};
    const country = String(addr.country_code || '').toUpperCase();
    if (!['US', 'CA'].includes(country)) {
      return json({ error: 'ship_unsupported', country }, 409);
    }
    const { data: settingsRow } = await supabase.from('site_settings').select('data').eq('id', 1).maybeSingle();
    const threshold = Number(settingsRow?.data?.freeShipThreshold ?? 100);
    const shippingCharged = cents(unit.amount?.breakdown?.shipping?.value);
    if (shippingCharged !== standardShippingCents(country as 'US' | 'CA', itemTotal / 100, threshold)) {
      // e.g. cart priced US shipping but the PayPal address is in Canada
      return json({ error: 'ship_country', country }, 409);
    }

    // ---- 4: capture (idempotent on our order id) ----
    let cap = await paypal(`/v2/checkout/orders/${encodeURIComponent(paypal_order_id)}/capture`, {
      method: 'POST', requestId: `capture-${order.id}`,
    });
    if (!cap.ok && cap.body?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
      cap = await paypal(`/v2/checkout/orders/${encodeURIComponent(paypal_order_id)}`);
    }
    if (!cap.ok) {
      const issue = cap.body?.details?.[0]?.issue || '';
      // card declined inside PayPal → the buyer can pick another funding source
      if (issue === 'INSTRUMENT_DECLINED') return json({ error: 'declined', restart: true }, 402);
      console.error('PayPal capture failed', cap.status, JSON.stringify(cap.body).slice(0, 600));
      return json({ error: 'capture_failed' }, 502);
    }
    const capture = cap.body?.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture || !['COMPLETED', 'PENDING'].includes(capture.status)) {
      return json({ error: 'capture_failed', status: capture?.status ?? null }, 502);
    }

    const ship = cap.body?.purchase_units?.[0]?.shipping ?? unit.shipping ?? {};
    const a = ship.address ?? addr;
    const shipping = {
      name: ship.name?.full_name ?? null,
      phone: cap.body?.payer?.phone?.phone_number?.national_number ?? null,
      line1: a.address_line_1 ?? null,
      line2: a.address_line_2 ?? null,
      city: a.admin_area_2 ?? null,
      state: a.admin_area_1 ?? null,
      postal_code: a.postal_code ?? null,
      country: a.country_code ?? null,
    };
    const email = cap.body?.payer?.email_address ?? null;

    if (capture.status === 'PENDING') {
      // PayPal is holding the funds for review (e.g. eCheck). Don't fulfil
      // yet — keep the address + reference so the admin can see it.
      await supabase.from('orders').update({
        shipping, stripe_payment_intent: `paypal_capture:${capture.id}`, updated_at: new Date().toISOString(),
        ...(email ? { customer_email: String(email).toLowerCase() } : {}),
      }).eq('id', order.id);
      return json({ ok: true, pending: true, order_id: order.id, access_token: order.access_token });
    }

    await markOrderPaid({
      supabase,
      orderId: order.id,
      email,
      shipping,
      refs: { stripe_ref: `paypal:${paypal_order_id}`, stripe_payment_intent: `paypal_capture:${capture.id}` },
      totalCents: cents(capture.amount?.value),
      currency: String(capture.amount?.currency_code || 'USD').toLowerCase(),
    });
    return json({ ok: true, order_id: order.id, access_token: order.access_token });
  } catch (e) {
    console.error('paypal-capture', String((e as Error)?.message ?? e));
    return json({ error: 'capture_failed' }, 500);
  }
});
