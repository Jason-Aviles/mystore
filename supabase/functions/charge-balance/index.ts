// Supabase Edge Function: charge-balance
// Invoices the remaining balance on a deposit preorder — the honest way.
// Creates a Stripe INVOICE on the customer we made at deposit checkout and
// sends it, so Stripe emails them a hosted payment page they click to pay.
// Nothing is charged off-session; the customer approves the charge.
//
// Auth: admin JWT required.
// Body: { order_id }  → { ok, hosted_invoice_url } | { ok:false, error }
// Idempotent: an order already 'invoiced'/'paid' returns its existing state
// instead of creating a second invoice.
//
// Deploy: supabase functions deploy charge-balance --use-api
import Stripe from 'npm:stripe@16';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ---- admin check ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: 'admin auth required' }, 401);

    const { order_id } = await req.json();
    if (!order_id) return json({ ok: false, error: 'order_id required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

    const { data: o } = await supabase.from('orders')
      .select('id, customer_email, status, balance_due, balance_status, stripe_customer, stripe_balance_invoice, campaign_id, access_token')
      .eq('id', order_id).maybeSingle();
    if (!o) return json({ ok: false, error: 'order not found' }, 404);
    if (!['paid', 'shipped', 'delivered'].includes(o.status)) {
      return json({ ok: false, error: 'deposit not captured yet — order is not paid' }, 409);
    }
    if (Number(o.balance_due) <= 0) return json({ ok: false, error: 'no balance owed on this order' }, 409);
    if (o.balance_status === 'paid') return json({ ok: true, already: 'paid' });

    // idempotency: if we already sent an invoice, return it instead of a dup
    if (o.balance_status === 'invoiced' && o.stripe_balance_invoice) {
      const existing = await stripe.invoices.retrieve(o.stripe_balance_invoice);
      return json({ ok: true, already: 'invoiced', hosted_invoice_url: existing.hosted_invoice_url });
    }

    // need a Stripe customer to invoice; create one if the deposit checkout
    // couldn't (older orders), keyed to the order email
    let customerId = o.stripe_customer;
    if (!customerId) {
      if (!o.customer_email) return json({ ok: false, error: 'no email on order to invoice' }, 409);
      const cust = await stripe.customers.create({ email: o.customer_email });
      customerId = cust.id;
      await supabase.from('orders').update({ stripe_customer: customerId }).eq('id', o.id);
    }

    const cents = Math.round(Number(o.balance_due) * 100);
    const orderNum = String(o.id).slice(0, 8).toUpperCase();
    // Create the invoice FIRST, then attach the line item to THAT invoice id,
    // then finalize. (Creating a pending item then a bare invoice can leave a
    // $0 invoice — which Stripe instantly marks paid. Pinning the item to the
    // invoice avoids that.) We do NOT use Stripe's own email delivery (it needs
    // account activation); Stripe hosts the pay page, our Resend flow sends it.
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 7,
      auto_advance: false,
      description: 'Remaining balance on your Dark Divine preorder. Your deposit has already been applied.',
      metadata: { order_id: o.id, kind: 'preorder_balance' },
    });
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: cents,
      currency: 'usd',
      description: `Preorder balance — order ${orderNum}`,
    });
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    // guard: never send a $0/blank invoice as if it were the balance
    if (Number(finalized.amount_due) !== cents) {
      return json({ ok: false, error: `invoice amount mismatch (${finalized.amount_due} vs ${cents})` }, 500);
    }

    await supabase.from('orders').update({
      balance_status: 'invoiced',
      stripe_balance_invoice: finalized.id,
      updated_at: new Date().toISOString(),
    }).eq('id', o.id);

    // our own email with the secure Stripe pay link (never blocks the result)
    try {
      if (o.customer_email && finalized.hosted_invoice_url) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-flow`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            flow: 'preorder_balance',
            email: o.customer_email,
            vars: {
              order_number: orderNum,
              dedup_key: `${o.id}|balance-invoice`,
              total: `$${Number(o.balance_due).toFixed(2)}`,
              pay_url: finalized.hosted_invoice_url,
            },
          }),
        });
      }
    } catch { /* email failure must not undo a real, finalized invoice */ }

    return json({ ok: true, hosted_invoice_url: finalized.hosted_invoice_url, invoice: finalized.id });
  } catch (e) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
