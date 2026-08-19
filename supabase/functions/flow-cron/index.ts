// Supabase Edge Function: flow-cron
// Scheduled sweeps that drive the time-based flows. Run every 30 minutes:
//   supabase functions deploy flow-cron
//   Dashboard → Edge Functions → flow-cron → Schedules → cron: */30 * * * *
//
// Sweeps:
//   abandoned_1   pending orders 1–24h old   → "your size is still in the cart"
//   abandoned_2   pending orders 24–72h old  → COMEBACK25
//   back_in_stock back_in_stock signups whose product has inventory again
//
// All sends go through the send-flow function, which owns dedup /
// unsubscribe / toggle logic — this file only decides WHO qualifies.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://darkdivine.store';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-flow`;
  const auth = { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' };
  const results = { abandoned_1: 0, abandoned_2: 0, back_in_stock: 0 };

  const sendFlow = async (flow: string, email: string, vars: Record<string, string>) => {
    const res = await fetch(fnUrl, { method: 'POST', headers: auth, body: JSON.stringify({ flow, email, vars }) });
    const out = await res.json().catch(() => ({}));
    return out?.ok === true;
  };

  const hoursAgo = (h: number) => new Date(Date.now() - h * 36e5).toISOString();

  // ---- abandoned checkouts (pending orders; send-flow dedup key = order id) ----
  const { data: pending } = await supabase.from('orders')
    .select('id, customer_email, created_at')
    .eq('status', 'pending')
    .gte('created_at', hoursAgo(72))
    .lte('created_at', hoursAgo(1));

  for (const o of pending ?? []) {
    if (!o.customer_email) continue;
    const ageH = (Date.now() - new Date(o.created_at).getTime()) / 36e5;
    const flow = ageH >= 24 ? 'abandoned_2' : 'abandoned_1';
    const ok = await sendFlow(flow, o.customer_email, { cart_url: `${SITE}/cart`, dedup_key: String(o.id) });
    if (ok) results[flow as 'abandoned_1' | 'abandoned_2'] += 1;
  }

  // ---- back in stock (signups whose product has units again) ----
  const { data: waiters } = await supabase.from('email_signups')
    .select('email, meta')
    .eq('source', 'back_in_stock')
    .eq('unsubscribed', false);

  // check the exact size the customer asked about when they gave one —
  // "your size is back" must never fire because a DIFFERENT size restocked
  const keys = [...new Set((waiters ?? [])
    .filter((w) => w.meta?.product)
    .map((w) => `${w.meta.product}|${w.meta?.size || ''}`))];
  const stocked = new Set<string>();
  for (const key of keys) {
    const [h, size] = key.split('|');
    let q = supabase.from('product_variants')
      .select('inventory_qty').eq('product_handle', h).gt('inventory_qty', 0).limit(1);
    if (size) q = q.eq('option1', size);
    const { data: vars } = await q;
    if (vars?.length) stocked.add(key);
  }
  for (const w of waiters ?? []) {
    const h = w.meta?.product;
    if (!h || !stocked.has(`${h}|${w.meta?.size || ''}`)) continue;
    const size = w.meta?.size ? String(w.meta.size) : '';
    const ok = await sendFlow('back_in_stock', w.email, {
      // name the exact size they waited on when we know it
      product_name: String(h).replace(/-/g, ' ') + (size ? ` — size ${size}` : ''),
      product_url: `${SITE}/product/${h}`,
      // size-scoped dedup: notifying about M must not block a later L wait
      dedup_key: size ? `${h}|${size}` : String(h),
    });
    if (ok) results.back_in_stock += 1;
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
