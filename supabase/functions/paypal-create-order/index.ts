// Supabase Edge Function: paypal-create-order
// Server-side PayPal order for the whole cart. Same integrity rules as the
// Stripe path (shared prepareOrder): DB prices only, real stock, preorder
// windows/limits/caps, and a PENDING order row created here. The PayPal
// order carries our order id as custom_id so the capture step can prove the
// approval belongs to this exact order and amount.
//
// Shipping: PayPal collects the address in its own window; we charge the
// published standard rate for the country the customer chose in the cart
// (US Standard, free over the threshold · Canada Tracked). paypal-capture
// refuses — before any money moves — if the PayPal address is in a
// different country than the rate that was charged.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@16';
import { prepareOrder, standardShippingCents, json, corsHeaders } from '../_shared/checkout-core.ts';
import { paypal, paypalConfigured, money } from '../_shared/paypal.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { order_id, email, items, origin, country, probe } = await req.json();
    // the storefront asks first, so the button never shows before the
    // server-side secrets exist (no half-working PayPal window)
    if (probe) return json({ configured: paypalConfigured(), env: Deno.env.get('PAYPAL_ENV') === 'live' ? 'live' : 'sandbox' });
    if (!paypalConfigured()) return json({ error: 'paypal_not_configured' }, 503);
    if (!items?.length) return json({ error: 'empty cart' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const site = origin || 'https://darkdivine.store';

    const prepared = await prepareOrder({
      supabase, order_id, email, items, country, site,
      // deposit balances are invoiced through Stripe, whatever paid the deposit
      createStripeCustomer: stripeKey
        ? async (e) => (await new Stripe(stripeKey).customers.create({ email: e })).id
        : undefined,
    });
    if (!prepared.ok) return json(prepared.body, prepared.status);
    const { orderId, accessToken, lines, subtotal, shipTo, freeShipThreshold } = prepared;

    const shippingCents = standardShippingCents(shipTo, subtotal, freeShipThreshold);
    const itemTotal = lines.reduce((s, l) => s + Math.round(l.price * 100) * l.qty, 0);
    const totalCents = itemTotal + shippingCents;

    const created = await paypal('/v2/checkout/orders', {
      method: 'POST',
      requestId: `create-${orderId}-${Date.now()}`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: orderId,
          // unique per attempt — PayPal rejects a reused invoice_id
          invoice_id: `DD-${orderId.slice(0, 8).toUpperCase()}-${Date.now().toString(36)}`,
          description: 'Dark Divine order',
          amount: {
            currency_code: 'USD',
            value: money(totalCents / 100),
            breakdown: {
              item_total: { currency_code: 'USD', value: money(itemTotal / 100) },
              shipping: { currency_code: 'USD', value: money(shippingCents / 100) },
            },
          },
          items: lines.map((l) => ({
            name: l.title.slice(0, 127),
            description: ([l.option1, l.option2].filter(Boolean).join(' / ')
              + (l.preorder ? ` · Preorder${l.shipWindow ? `, est. ship ${l.shipWindow}` : ''}` : '')).slice(0, 127) || undefined,
            sku: [l.handle, l.option1, l.option2].filter(Boolean).join(':').slice(0, 127),
            quantity: String(l.qty),
            unit_amount: { currency_code: 'USD', value: money(Math.round(l.price * 100) / 100) },
            category: 'PHYSICAL_GOODS',
          })),
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'Dark Divine',
              shipping_preference: 'GET_FROM_FILE', // buyer picks/enters address in PayPal
              user_action: 'PAY_NOW',
            },
          },
        },
      },
    });
    if (!created.ok || !created.body?.id) {
      console.error('PayPal create failed', created.status, JSON.stringify(created.body).slice(0, 600));
      return json({ error: 'paypal_create_failed' }, 502);
    }

    // link the PayPal order to ours — capture verifies this match
    await supabase.from('orders').update({ stripe_ref: `paypal:${created.body.id}`, updated_at: new Date().toISOString() }).eq('id', orderId);

    return json({ paypal_order_id: created.body.id, order_id: orderId, access_token: accessToken, ship_to: shipTo });
  } catch (e) {
    console.error('paypal-create-order', String((e as Error)?.message ?? e));
    return json({ error: 'paypal_create_failed' }, 500);
  }
});
