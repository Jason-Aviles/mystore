// Supabase Edge Function: send-campaign
// Sends a saved campaign to its audience through Resend.
//
// Setup:
//   supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM=contact@darkdivine.store
//   supabase functions deploy send-campaign
//
// Audience = email_signups.source filter ('all' = every consented address).
// Unsubscribed rows are always skipped and an unsubscribe footer is added.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { campaign_id, test_to } = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM = Deno.env.get('RESEND_FROM') ?? 'contact@darkdivine.store';
    if (!RESEND_KEY) return json({ ok: false, error: 'RESEND_API_KEY not set' }, 500);
    const site = 'https://darkdivine.store';

    const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', campaign_id).single();
    if (!campaign) return json({ ok: false, error: 'campaign not found' }, 404);
    if (!test_to && campaign.status === 'sent') return json({ ok: false, error: 'already sent' }, 400);

    // branded HTML shell (mirrors emails/new-drop.html) with {{body}} slot
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const buildHtml = (to: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 12px;"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#141416;border:1px solid #2a2a2e;"><tr><td style="padding:36px 32px 8px;text-align:center;"><div style="font-family:Georgia,serif;font-size:26px;letter-spacing:4px;color:#f2f1ee;font-weight:bold;">DARK DIVINE</div><div style="font-family:Georgia,serif;font-style:italic;font-size:15px;color:#8e939c;margin-top:6px;">Illuminate the darkness within</div></td></tr><tr><td style="padding:24px 32px;font-family:Arial,sans-serif;color:#c9c7c1;font-size:15px;line-height:1.7;">${esc(campaign.body).split('\n').join('<br>')}</td></tr><tr><td style="padding:4px 32px 32px;" align="center"><a href="${site}" style="display:inline-block;background:#efb6c4;color:#0a0a0b;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:3px;text-decoration:none;padding:15px 38px;">SHOP THE DROP</a></td></tr><tr><td style="padding:0 32px 32px;font-family:Arial,sans-serif;color:#8e939c;font-size:12px;text-align:center;border-top:1px solid #2a2a2e;padding-top:20px;">One email per drop. Nothing else.<br><br><a href="${site}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#5a5f66;">Unsubscribe</a></td></tr></table></td></tr></table>`;

    // test send: one address, campaign stays draft
    if (test_to) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `DARK DIVINE <${FROM}>`, to: [test_to], subject: `[TEST] ${campaign.subject}`, html: buildHtml(test_to) }),
      });
      return json({ ok: res.ok, test: true });
    }

    let q = supabase.from('email_signups').select('email')
      .eq('consent', true).eq('unsubscribed', false);
    if (campaign.audience !== 'all') q = q.eq('source', campaign.audience);
    const { data: recipients } = await q;
    const emails = [...new Set((recipients ?? []).map((r) => r.email))];

    await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaign_id);

    let sent = 0;
    // Resend batch endpoint takes up to 100 messages per call
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100).map((to) => ({
        from: `DARK DIVINE <${FROM}>`,
        to: [to],
        subject: campaign.subject,
        html: buildHtml(to),
      }));
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
    }

    await supabase.from('campaigns').update({
      status: sent > 0 || emails.length === 0 ? 'sent' : 'failed',
      sent_count: sent,
      sent_at: new Date().toISOString(),
    }).eq('id', campaign_id);

    return json({ ok: true, sent, audience_size: emails.length });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
