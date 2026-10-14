// Supabase Edge Function: shipping-rates
// Public, read-only: the cart asks what shipping will cost for its items
// and ZIP so the shopper sees it BEFORE the payment page. Uses the exact
// same quote as checkout (_shared/shipping.ts quoteShipping) — the numbers
// shown here are the numbers Stripe/PayPal will charge. Creates nothing.
//
// Body: { items: [{handle, option1, option2, qty}], country: 'US'|'CA', zip }
// → { source, zone, live, options: [{ id, label, cents }] }
//
// Deploy: supabase functions deploy shipping-rates --use-api
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, corsHeaders } from '../_shared/checkout-core.ts';
import { quoteShipping, cleanZip } from '../_shared/shipping.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { items, country: c, zip: rawZip } = await req.json();
    if (!Array.isArray(items) || !items.length || items.length > 50) return json({ error: 'empty cart' }, 400);
    const country: 'US' | 'CA' = c === 'CA' ? 'CA' : 'US';
    const zip = cleanZip(country, rawZip);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const handles = [...new Set(items.map((i: any) => String(i.handle)))];
    const [{ data: prods }, { data: vars }, { data: settingsRow }] = await Promise.all([
      supabase.from('products').select('handle, price, status, campaign_id, deposit, data').in('handle', handles),
      supabase.from('product_variants').select('product_handle, option1, option2, price').in('product_handle', handles),
      supabase.from('site_settings').select('data').eq('id', 1).maybeSingle(),
    ]);
    const settings = settingsRow?.data || {};

    // DB prices only (deposit items count at the deposit, like checkout)
    let subtotal = 0;
    const lines: { qty: number; weightOz: number | null }[] = [];
    for (const i of items) {
      const p = (prods || []).find((x: any) => x.handle === i.handle && x.status === 'active');
      if (!p) continue;
      const v = (vars || []).find((x: any) => x.product_handle === i.handle
        && x.option1 === (i.option1 || null) && (x.option2 || null) === (i.option2 || null));
      const qty = Math.max(1, Math.min(99, Math.floor(Number(i.qty) || 1)));
      const unit = p.campaign_id && p.deposit != null ? Number(p.deposit) : Number(v?.price ?? p.price);
      subtotal += unit * qty;
      lines.push({ qty, weightOz: Number(p.data?.weightOz) > 0 ? Number(p.data.weightOz) : null });
    }
    if (!lines.length) return json({ error: 'empty cart' }, 400);

    const live = settings.shipLiveRates === true;
    if (live && !zip) return json({ live, zip_required: true, options: [] });
    const quote = await quoteShipping({
      supabase, settings, country, zip, subtotal,
      threshold: Number(settings.freeShipThreshold ?? 100), items: lines,
    });
    return json({
      live, source: quote.source, zone: quote.zone, zip: quote.zip,
      options: quote.options.map((o) => ({ id: o.id, label: o.label, cents: o.cents })),
    });
  } catch (e) {
    console.error('shipping-rates', String((e as Error)?.message ?? e));
    return json({ error: 'rates_failed' }, 500);
  }
});
