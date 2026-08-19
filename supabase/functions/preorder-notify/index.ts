// Supabase Edge Function: preorder-notify
// Admin-only fan-out: publish ONE campaign update and email it to every
// paid order in that preorder campaign (each customer gets their own
// token-protected status link). Optionally advances every order's
// production stage at the same time.
//
// Auth: requires a signed-in admin JWT — the anon key alone is rejected.
// Body: { campaign_id, update_id?, flow?, stage? }
//   flow defaults to 'production_update'; use 'delay_notice',
//   'production_started', 'preorder_closed', 'qc_update', 'shipping_soon'…
// Dedup: flow_sends (email, flow, `${update_id||stage}|${order_id}`) — safe to re-run.
//
// Deploy: supabase functions deploy preorder-notify --use-api
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAGES = new Set([
  'received', 'preorder_closed', 'production_scheduled', 'materials_secured',
  'in_production', 'quality_control', 'preparing_shipment', 'shipped',
  'delivered', 'delayed', 'cancelled', 'refunded',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ---- admin check: the caller's JWT must resolve to a real user ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: 'admin auth required' }, 401);

    const { campaign_id, update_id, flow = 'production_update', stage } = await req.json();
    if (!campaign_id) return json({ ok: false, error: 'campaign_id required' }, 400);
    if (stage && !STAGES.has(stage)) return json({ ok: false, error: 'unknown stage' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [{ data: campaign }, { data: update }] = await Promise.all([
      supabase.from('preorder_campaigns').select('*').eq('id', campaign_id).maybeSingle(),
      update_id
        ? supabase.from('preorder_campaign_updates').select('*').eq('id', update_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!campaign) return json({ ok: false, error: 'campaign not found' }, 404);

    // stage change first, so the status page is right before emails land
    if (stage) {
      await supabase.from('orders').update({ production_status: stage, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaign_id)
        .in('status', ['paid', 'shipped', 'delivered']);
    }

    const { data: orders } = await supabase.from('orders')
      .select('id, customer_email, access_token, est_ship_start, est_ship_end')
      .eq('campaign_id', campaign_id)
      .in('status', ['paid', 'shipped', 'delivered']);

    const fmt = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
    let sent = 0, skipped = 0, failed = 0;
    for (const o of orders ?? []) {
      if (!o.customer_email?.includes('@')) { skipped++; continue; }
      const shipWin = o.est_ship_start && o.est_ship_end ? `${fmt(o.est_ship_start)} – ${fmt(o.est_ship_end)}`
        : (campaign.estimated_shipping_start && campaign.estimated_shipping_end
          ? `${fmt(campaign.estimated_shipping_start)} – ${fmt(campaign.estimated_shipping_end)}` : '');
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-flow`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            flow,
            email: o.customer_email,
            vars: {
              dedup_key: `${update_id ?? stage ?? 'notify'}|${o.id}`,
              order_number: String(o.id).slice(0, 8).toUpperCase(),
              status_url: `https://darkdivine.store/order-status?o=${o.id}&t=${o.access_token}`,
              campaign_name: campaign.name,
              ship_window: shipWin,
              production_start: fmt(campaign.estimated_production_start),
              update_title: update?.title ?? '',
              update_body: update?.body ?? '',
            },
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (out.ok) sent++; else if (out.skipped) skipped++; else failed++;
      } catch { failed++; }
    }

    if (update_id) {
      await supabase.from('preorder_campaign_updates')
        .update({ emailed_at: new Date().toISOString() }).eq('id', update_id);
    }

    return json({ ok: true, sent, skipped, failed, orders: (orders ?? []).length });
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
