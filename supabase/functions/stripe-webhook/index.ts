// Supabase Edge Function: stripe-webhook
// Marks orders PAID the moment Stripe confirms payment, and decrements
// variant inventory — no manual bookkeeping on drop night.
//
// Setup:
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx STRIPE_WEBHOOK_SECRET=whsec_xxx
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   Stripe Dashboard → Webhooks → endpoint:
//     https://YOUR-PROJECT.supabase.co/functions/v1/stripe-webhook
//     event: checkout.session.completed
import Stripe from 'npm:stripe@16';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { markOrderPaid } from '../_shared/checkout-core.ts';
// The paid-order side effects (address, email, owner alert, inventory) live in
// _shared/checkout-core.ts — paypal-capture runs the exact same code.

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider,
    );
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${e}`, { status: 400 });
  }

  // Delayed methods (bank debits etc.) complete the session before the money
  // clears: payment_status is 'unpaid' then, and Stripe sends
  // async_payment_succeeded once it lands. Only a settled payment marks paid.
  const sessionEvent = event.type === 'checkout.session.completed'
    || event.type === 'checkout.session.async_payment_succeeded';
  const settled = sessionEvent
    && (event.data.object as Stripe.Checkout.Session).payment_status !== 'unpaid';
  if (sessionEvent && settled) {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // idempotency layer 1: the event-id ledger. Insert-first — a repeated
    // delivery of the SAME event hits the primary key and stops here.
    const { error: dupEvent } = await supabase.from('stripe_webhook_events')
      .insert({ id: event.id, type: event.type });
    if (dupEvent) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // find the order by id (preferred) or by session ref
    const match = orderId
      ? supabase.from('orders').select('id').eq('id', orderId)
      : supabase.from('orders').select('id').eq('stripe_ref', session.id);
    const { data: found } = await match.maybeSingle();

    if (found) {
      // ---- the delivery address Stripe collected, for fulfillment ----
      // shipping_details holds the SHIP-TO address (falls back to billing);
      // the API moved it under collected_information in newer versions.
      const cd = session.customer_details;
      const sd = (session as any).shipping_details
        ?? (session as any).collected_information?.shipping_details
        ?? null;
      const addr = sd?.address ?? cd?.address ?? null;
      const shipping = addr ? {
        name: sd?.name ?? cd?.name ?? null,
        phone: cd?.phone ?? null,
        line1: addr.line1 ?? null,
        line2: addr.line2 ?? null,
        city: addr.city ?? null,
        state: addr.state ?? null,
        postal_code: addr.postal_code ?? null,
        country: addr.country ?? null,
      } : null;

      // idempotency layer 2 lives inside: only a PENDING order transitions
      await markOrderPaid({
        supabase,
        orderId: found.id,
        email: session.customer_details?.email ?? session.customer_email ?? null,
        shipping,
        refs: {
          stripe_ref: session.id,
          stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
        },
        totalCents: session.amount_total,
        currency: session.currency,
      });
    }
  }

  // ---- preorder balance invoice was paid by the customer ----
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice;
    if (invoice.metadata?.kind === 'preorder_balance') {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      // idempotent: only flip a still-open balance to paid
      const { data: ord } = await supabase.from('orders')
        .select('id, balance_status, customer_email, access_token, balance_due')
        .eq('stripe_balance_invoice', invoice.id).maybeSingle();
      if (ord && ord.balance_status !== 'paid') {
        await supabase.from('orders').update({
          balance_status: 'paid',
          updated_at: new Date().toISOString(),
        }).eq('id', ord.id);
        // balance receipt (never blocks the webhook)
        try {
          if (ord.customer_email) {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-flow`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                flow: 'payment_receipt',
                email: ord.customer_email,
                vars: {
                  order_number: String(ord.id).slice(0, 8).toUpperCase(),
                  dedup_key: `${ord.id}|balance`,
                  total: `$${Number(ord.balance_due).toFixed(2)} balance`,
                  status_url: `https://darkdivine.store/order-status?o=${ord.id}&t=${ord.access_token}`,
                },
              }),
            });
          }
        } catch { /* receipt failure must not fail the webhook */ }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
