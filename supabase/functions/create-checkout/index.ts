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
import {
  prepareOrder, shipWindow, json, corsHeaders,
  US_STANDARD_CENTS, US_PRIORITY_CENTS, CA_TRACKED_CENTS,
} from '../_shared/checkout-core.ts';
// Cart pricing, stock, preorder rules and the pending order all live in
// _shared/checkout-core.ts — PayPal (paypal-create-order) uses the same code.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { order_id, email, items, origin, country, access_code } = await req.json();
    if (!items?.length) return json({ error: 'empty cart' }, 400);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY not configured' }, 500);
    const stripe = new Stripe(stripeKey);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const site = origin || 'https://darkdivine.store';
    const prepared = await prepareOrder({
      supabase, order_id, email, items, country, site, accessCode: access_code,
      createStripeCustomer: async (e) => (await stripe.customers.create({ email: e })).id,
    });
    if (!prepared.ok) return json(prepared.body, prepared.status);
    const { orderId, accessToken, lines, subtotal, shipTo, freeShipThreshold, cartCampaign, stripeCustomer } = prepared;

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
