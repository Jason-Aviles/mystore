// Supabase Edge Function: preorder-gate
// The ONLY way through the private preorder gate. The access code list
// never ships in the frontend bundle — codes are validated here with the
// service role against preorder_access_codes (per-campaign, rotatable,
// usage-limited) with the legacy access_codes table as a fallback.
//
// Body: {
//   email, code?, phone?, emailConsent?, smsConsent?,
//   campaign_slug?, referrer?
// }
// → { ok, mode: 'live'|'coming_soon', campaign?, error? }
//
// Behavior:
//   • coming_soon campaign (or live one before opens_at): email-collection
//     mode — saves the signup, no code needed, gate stays locked.
//   • live campaign: code required (when access_required) and checked
//     server-side; expired campaigns refuse entry.
//   • Signup is recorded with source 'preorder_password_gate', consent is
//     EXPLICIT (checkbox value, never assumed), and every consent decision
//     lands in the consent_events audit log with campaign/code/referrer.
//
// Deploy: supabase functions deploy preorder-gate --use-api
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, code, phone, emailConsent, smsConsent, campaign_slug, referrer } = await req.json();
    const to = String(email ?? '').trim().toLowerCase();
    if (!to || !to.includes('@') || to.length < 5) return json({ ok: false, error: 'email' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ---- resolve the campaign: requested slug, else the current one ----
    let campaign: any = null;
    if (campaign_slug) {
      const { data } = await supabase.from('preorder_campaigns').select('*')
        .eq('slug', String(campaign_slug)).maybeSingle();
      campaign = data;
    } else {
      const { data } = await supabase.from('preorder_campaigns').select('*')
        .in('status', ['live', 'coming_soon'])
        .order('status', { ascending: false }) // 'live' sorts after 'coming_soon'
        .order('created_at', { ascending: false })
        .limit(1);
      campaign = data?.[0] ?? null;
    }

    const now = Date.now();
    const opensAt = campaign?.opens_at ? Date.parse(campaign.opens_at) : null;
    const closesAt = campaign?.closes_at ? Date.parse(campaign.closes_at) : null;
    const isLive = campaign?.status === 'live'
      && (!opensAt || now >= opensAt)
      && (!closesAt || now < closesAt);
    const mode = isLive ? 'live' : 'coming_soon';

    const clean = String(code ?? '').trim().toUpperCase();
    let codeRow: any = null;

    if (isLive && campaign.access_required !== false) {
      if (!clean) return json({ ok: false, mode, error: 'code_required' }, 400);
      // per-campaign codes first…
      const { data: pc } = await supabase.from('preorder_access_codes')
        .select('id, code, uses, max_uses')
        .eq('campaign_id', campaign.id).eq('code', clean).eq('active', true)
        .maybeSingle();
      if (pc && (pc.max_uses == null || pc.uses < pc.max_uses)) {
        codeRow = pc;
      } else if (!pc) {
        // …then the legacy global list, so existing distributed codes keep working
        const { data: legacy } = await supabase.from('access_codes')
          .select('code, uses').eq('code', clean).eq('active', true).maybeSingle();
        if (legacy) codeRow = { legacy: true, code: legacy.code, uses: legacy.uses };
      }
      if (!codeRow) return json({ ok: false, mode, error: 'invalid_code' }, 401);
    }

    // ---- record signup + consent (explicit checkbox values only) ----
    const meta = {
      campaign: campaign?.slug ?? null,
      campaign_id: campaign?.id ?? null,
      code: codeRow ? clean : null,
      referrer: referrer ? String(referrer).slice(0, 300) : null,
      mode,
    };
    await supabase.rpc('save_email_signup', {
      p_email: to, p_source: 'preorder_password_gate',
      p_consent: emailConsent === true, p_meta: meta,
    });
    await supabase.from('consent_events').insert({
      email: to, channel: 'email', consent: emailConsent === true,
      source: 'preorder_password_gate', meta,
    });

    const cleanPhone = String(phone ?? '').replace(/[^0-9+]/g, '');
    if (cleanPhone.length >= 7 && smsConsent === true) {
      await supabase.rpc('save_sms_signup', { p_phone: cleanPhone, p_source: 'preorder_password_gate' });
      await supabase.from('consent_events').insert({
        email: to, phone: cleanPhone, channel: 'sms', consent: true,
        source: 'preorder_password_gate', meta,
      });
    }

    // count the code use (both tables)
    if (codeRow?.legacy) {
      await supabase.from('access_codes').update({ uses: (codeRow.uses ?? 0) + 1 }).eq('code', clean);
    } else if (codeRow?.id) {
      await supabase.from('preorder_access_codes').update({ uses: (codeRow.uses ?? 0) + 1 }).eq('id', codeRow.id);
    }

    // private-access confirmation email (never blocks the unlock)
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-flow`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flow: isLive ? 'preorder_access' : 'welcome',
          email: to,
          vars: {
            campaign_name: campaign?.name ?? 'the next drop',
            close_date: campaign?.closes_at ? new Date(campaign.closes_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '',
            ship_window: shipWindow(campaign),
            dedup_key: `${campaign?.id ?? 'none'}|access`,
          },
        }),
      });
    } catch { /* email failure must never block access */ }

    return json({
      ok: true,
      mode,
      unlocked: isLive,
      campaign: campaign ? {
        id: campaign.id, slug: campaign.slug, name: campaign.name,
        closes_at: campaign.closes_at, opens_at: campaign.opens_at,
        estimated_production_start: campaign.estimated_production_start,
        estimated_shipping_start: campaign.estimated_shipping_start,
        estimated_shipping_end: campaign.estimated_shipping_end,
      } : null,
    });
  } catch (e) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

function shipWindow(c: any): string {
  if (!c?.estimated_shipping_start || !c?.estimated_shipping_end) return '';
  const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(c.estimated_shipping_start)} – ${f(c.estimated_shipping_end)}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
