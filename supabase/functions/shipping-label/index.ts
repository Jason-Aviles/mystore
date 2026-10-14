// Supabase Edge Function: shipping-label  (ADMIN ONLY)
// Buys shipping labels through Shippo from the admin Orders screen.
//
// Body: { action, test?, ... }
//   check                       → is shipping set up? validates the ship-from
//                                 address and prices a sample parcel
//   rates  { order_id, box?, weight_oz? }
//                               → every carrier rate for this order's real
//                                 address; `recommended` = the service the
//                                 customer paid for
//   buy    { order_id, rate_id } → buys the label. Live: saves tracking,
//                                 marks the order shipped, emails tracking.
//                                 Test (test:true): label only, nothing else.
//   refund { order_id }          → voids the order's unused label
//
// test:true uses SHIPPO_TEST_API_KEY — free fake labels, never billed.
// Secrets: SHIPPO_API_KEY (live), SHIPPO_TEST_API_KEY (test)
// Deploy:  supabase functions deploy shipping-label --use-api
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, corsHeaders } from '../_shared/checkout-core.ts';
import { callerRole } from '../_shared/caller.ts';
import {
  loadShipConfig, configGaps, shippoKey, parcelFor, shippo, fromAddress, pickRates,
} from '../_shared/shipping.ts';

const SITE = Deno.env.get('SITE_URL') || 'https://darkdivine.store';
const msgs = (b: any) => (b?.messages || []).map((m: any) => m.text).filter(Boolean).slice(0, 4);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if ((await callerRole(req)) === 'public') return json({ ok: false, error: 'admin auth required' }, 401);
    const body = await req.json();
    const test = body.test === true;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const cfg = await loadShipConfig(supabase);
    const key = shippoKey(test);

    // ---------------------------------------------------------- check
    if (body.action === 'check') {
      const gaps = configGaps(cfg);
      const keys = { live: Boolean(shippoKey(false)), test: Boolean(shippoKey(true)) };
      if (gaps.length || !key) return json({ ok: false, gaps, keys });
      const v = await shippo('/addresses/', key, { ...fromAddress(cfg), validate: true });
      const valid = v.body?.validation_results?.is_valid;
      const sample = parcelFor(cfg, [{ qty: 1 }]);
      const r = await shippo('/shipments/', key, {
        address_from: fromAddress(cfg), address_to: { zip: '10001', country: 'US' },
        parcels: [sample.parcel], async: false,
      });
      return json({
        ok: valid !== false && (r.body?.rates || []).length > 0,
        keys, address_valid: valid ?? null,
        address_messages: (v.body?.validation_results?.messages || []).map((m: any) => m.text),
        sample: {
          to: 'New York 10001', weight_oz: sample.weightOz, box: sample.box,
          rates: (r.body?.rates || []).sort((a: any, b: any) => a.amount - b.amount).slice(0, 6)
            .map((x: any) => ({ carrier: x.provider, service: x.servicelevel?.name, amount: x.amount, days: x.estimated_days })),
        },
      });
    }

    if (!key) return json({ ok: false, error: test ? 'SHIPPO_TEST_API_KEY not set' : 'SHIPPO_API_KEY not set' }, 500);
    const gaps = configGaps(cfg);
    if (gaps.length) return json({ ok: false, error: 'setup', gaps }, 400);

    const { data: order } = await supabase.from('orders')
      .select('id, status, customer_email, shipping, shipping_quote, label, tracking, access_token')
      .eq('id', String(body.order_id || '')).maybeSingle();
    if (!order) return json({ ok: false, error: 'order not found' }, 404);

    // ---------------------------------------------------------- refund
    if (body.action === 'refund') {
      const t = order.label?.transaction_id;
      if (!t) return json({ ok: false, error: 'no label on this order' }, 400);
      const rk = shippoKey(Boolean(order.label?.test));
      const r = await shippo('/refunds/', rk!, { transaction: t, async: false });
      if (!r.ok) return json({ ok: false, error: msgs(r.body).join(' ') || `refund ${r.status}` }, 502);
      await supabase.from('orders').update({
        label: { ...order.label, refund_status: r.body?.status || 'QUEUED' }, updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      return json({ ok: true, refund_status: r.body?.status });
    }

    const s = order.shipping || {};
    if (!s.line1 || !s.postal_code || !s.country) return json({ ok: false, error: 'order has no shipping address yet' }, 400);
    const addressTo = {
      name: s.name || order.customer_email, street1: s.line1, street2: s.line2 || undefined,
      city: s.city, state: s.state, zip: s.postal_code, country: s.country,
      phone: s.phone || undefined, email: order.customer_email || undefined,
    };

    // ---------------------------------------------------------- rates
    if (body.action === 'rates') {
      const { data: items } = await supabase.from('order_items').select('product_handle, qty').eq('order_id', order.id);
      const handles = [...new Set((items || []).map((i: any) => i.product_handle))];
      const { data: prods } = handles.length
        ? await supabase.from('products').select('handle, data').in('handle', handles) : { data: [] };
      const weightOf = (h: string) => Number((prods || []).find((p: any) => p.handle === h)?.data?.weightOz) || null;
      const auto = parcelFor(cfg, (items || []).map((i: any) => ({ qty: i.qty, weightOz: weightOf(i.product_handle) })));
      // admin may override the box or weight for an odd package
      const box = (cfg.boxes || []).find((b) => b.name === body.box);
      const weightOz = Number(body.weight_oz) > 0 ? Math.ceil(Number(body.weight_oz)) : auto.weightOz;
      const parcel = box
        ? { length: String(box.length), width: String(box.width), height: String(box.height), distance_unit: 'in', weight: String(weightOz), mass_unit: 'oz' }
        : { ...auto.parcel, weight: String(weightOz) };

      const r = await shippo('/shipments/', key, {
        address_from: fromAddress(cfg), address_to: addressTo, parcels: [parcel], async: false,
      });
      if (!r.ok) return json({ ok: false, error: msgs(r.body).join(' ') || `shippo ${r.status}` }, 502);
      const rates = (r.body?.rates || []).sort((a: any, b: any) => Number(a.amount) - Number(b.amount));
      const paid = order.shipping_quote?.chosen || 'standard';
      // same rule as checkout: the cheapest rate within the service they paid for
      const rec = pickRates(rates, s.country === 'CA' ? 'CA' : 'US').find((p) => p.id === paid)?.rate;
      return json({
        ok: true, test,
        parcel: { weight_oz: weightOz, box: box?.name ?? auto.box },
        paid_service: paid, paid_cents: order.shipping_quote?.paid_cents ?? null,
        recommended: rec?.object_id ?? null,
        rates: rates.map((x: any) => ({
          id: x.object_id, carrier: x.provider, service: x.servicelevel?.name, token: x.servicelevel?.token,
          amount: x.amount, days: x.estimated_days,
        })),
        messages: msgs(r.body),
      });
    }

    // ---------------------------------------------------------- buy
    if (body.action === 'buy') {
      if (!body.rate_id) return json({ ok: false, error: 'pick a rate' }, 400);
      if (!test && order.label?.transaction_id && !order.label?.test && !order.label?.refund_status && body.force !== true) {
        return json({ ok: false, error: 'this order already has a live label — refund it first' }, 409);
      }
      const t = await shippo('/transactions/', key, { rate: body.rate_id, label_file_type: 'PDF_4x6', async: false });
      if (!t.ok || t.body?.status !== 'SUCCESS') {
        return json({ ok: false, error: msgs(t.body).join(' ') || `label ${t.body?.status || t.status}` }, 502);
      }
      const tx = t.body;
      const label = {
        transaction_id: tx.object_id, url: tx.label_url, tracking_number: tx.tracking_number,
        tracking_url: tx.tracking_url_provider, rate_id: body.rate_id,
        carrier: tx.rate?.provider ?? null, service: tx.rate?.servicelevel?.name ?? null,
        cost: tx.rate?.amount ?? null, test, purchased_at: new Date().toISOString(),
      };
      // a test label never touches the real order trail
      if (test) {
        await supabase.from('orders').update({ label, updated_at: new Date().toISOString() }).eq('id', order.id);
        return json({ ok: true, test, label });
      }
      await supabase.from('orders').update({
        label, tracking: tx.tracking_number, status: 'shipped', updated_at: new Date().toISOString(),
      }).eq('id', order.id);

      let emailed = false;
      if (order.customer_email && tx.tracking_number) {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-flow`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            flow: 'shipped', email: order.customer_email,
            vars: {
              order_number: String(order.id).slice(0, 8).toUpperCase(),
              tracking_url: tx.tracking_url_provider || `https://t.17track.net/en#nums=${encodeURIComponent(tx.tracking_number)}`,
              status_url: `${SITE}/order-status?o=${order.id}&t=${order.access_token}`,
              dedup_key: String(order.id),
            },
          }),
        }).catch(() => null);
        emailed = Boolean(res?.ok);
      }
      return json({ ok: true, test, label, emailed });
    }

    return json({ ok: false, error: 'unknown action' }, 400);
  } catch (e) {
    console.error('shipping-label', String((e as Error)?.message ?? e));
    return json({ ok: false, error: 'label_failed' }, 500);
  }
});
