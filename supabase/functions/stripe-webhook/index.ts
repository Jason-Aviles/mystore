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

  if (event.type === 'checkout.session.completed') {
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
      ? supabase.from('orders').select('id, status, campaign_id, access_token, est_ship_start, est_ship_end').eq('id', orderId)
      : supabase.from('orders').select('id, status, campaign_id, access_token, est_ship_start, est_ship_end').eq('stripe_ref', session.id);
    const { data: found } = await match.maybeSingle();

    // idempotency layer 2: only a PENDING order transitions — a different
    // event for an already-paid order must not decrement inventory again
    if (found && found.status === 'pending') {
      // ---- capture the delivery address Stripe collected, for fulfillment ----
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

      await supabase.from('orders').update({
        status: 'paid',
        stripe_ref: session.id,
        stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
        ...(shipping ? { shipping } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', found.id);

      // mirror name/phone/address onto the customer record too (best effort)
      if (shipping && cd?.email) {
        await supabase.from('customers').update({
          name: shipping.name, phone: shipping.phone, address: shipping,
        }).eq('email', String(cd.email).toLowerCase()).then(() => {}, () => {});
      }

      // confirmation email (failure must never fail the webhook) —
      // preorder orders get the preorder confirmation with the status link
      try {
        const email = session.customer_details?.email ?? session.customer_email;
        if (email) {
          const { data: camp } = found.campaign_id
            ? await supabase.from('preorder_campaigns').select('name, closes_at').eq('id', found.campaign_id).maybeSingle()
            : { data: null };
          const fmt = (d: string | null) => (d ? new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
          const shipWin = found.est_ship_start && found.est_ship_end
            ? `${fmt(found.est_ship_start)} – ${fmt(found.est_ship_end)}` : '';

          // deposit balance: if any line was charged a deposit (item price ==
          // product.deposit and < full price), the customer still owes the
          // rest before shipping — say the exact number, never surprise them
          let balanceLine = '';
          if (found.campaign_id) {
            const { data: its } = await supabase.from('order_items')
              .select('product_handle, qty, price').eq('order_id', found.id);
            const handles = [...new Set((its ?? []).map((i) => i.product_handle).filter(Boolean))];
            if (handles.length) {
              const { data: prods } = await supabase.from('products')
                .select('handle, price, deposit').in('handle', handles);
              let balance = 0;
              for (const it of its ?? []) {
                const pr = (prods ?? []).find((p) => p.handle === it.product_handle);
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
            headers: {
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
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

      // decrement inventory for each line item
      const { data: items } = await supabase.from('order_items')
        .select('product_handle, option1, option2, qty').eq('order_id', found.id);
      for (const it of items ?? []) {
        if (!it.product_handle || !it.option1) continue;
        let q = supabase.from('product_variants')
          .select('id, inventory_qty')
          .eq('product_handle', it.product_handle)
          .eq('option1', it.option1);
        q = it.option2 ? q.eq('option2', it.option2) : q.is('option2', null);
        const { data: v } = await q.maybeSingle();
        if (v) {
          await supabase.from('product_variants')
            .update({ inventory_qty: Math.max(0, v.inventory_qty - it.qty) })
            .eq('id', v.id);
        }
      }
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
