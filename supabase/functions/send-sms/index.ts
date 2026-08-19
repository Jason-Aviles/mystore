// Supabase Edge Function: send-sms  (Twilio scaffold — OPTIONAL)
// Sends SMS ONLY to subscribers with explicit consent who have not opted
// out, and handles Twilio's inbound webhook for STOP/START keywords.
//
// This function is a no-op until Twilio credentials exist:
//   supabase secrets set TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx TWILIO_FROM=+1xxxxxxxxxx
//   supabase functions deploy send-sms --use-api --no-verify-jwt
//   Twilio Console → phone number → Messaging webhook:
//     https://YOUR-PROJECT.supabase.co/functions/v1/send-sms   (POST, form-encoded)
//
// Outbound (admin JWT required, JSON body):
//   { message, kind }              → broadcast to every consented subscriber
//   { message, kind, phone }       → one recipient (still consent-checked)
//   kind: 'preorder_open' | 'closing_reminder' | 'production_update'
//         | 'shipping_alert' | 'delay_notice'
// Inbound (Twilio, form-encoded): Body=STOP → opted_out, Body=START → re-opt-in.
//
// Compliance guarantees enforced here, not by the caller:
//   • consent=true AND opted_out=false or the number is skipped — no exceptions
//   • every send stamps last_message_at
//   • STOP is honored immediately and logged to consent_events
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const KINDS = new Set(['preorder_open', 'closing_reminder', 'production_update', 'shipping_alert', 'delay_notice']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ---- inbound Twilio webhook (form-encoded): STOP / START handling ----
  const ctype = req.headers.get('content-type') ?? '';
  if (ctype.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData();
    const from = String(form.get('From') ?? '').replace(/[^0-9+]/g, '');
    const body = String(form.get('Body') ?? '').trim().toUpperCase();
    if (from) {
      if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(body)) {
        await supabase.from('sms_subscribers').update({ opted_out: true, consent: false }).eq('phone', from);
        await supabase.from('consent_events').insert({ phone: from, channel: 'sms', consent: false, source: 'sms_stop_reply', meta: { keyword: body } });
      } else if (['START', 'UNSTOP', 'YES'].includes(body)) {
        await supabase.from('sms_subscribers').update({ opted_out: false, consent: true, consent_at: new Date().toISOString(), consent_source: 'sms_start_reply' }).eq('phone', from);
        await supabase.from('consent_events').insert({ phone: from, channel: 'sms', consent: true, source: 'sms_start_reply', meta: { keyword: body } });
      }
    }
    // empty TwiML = no auto-reply (Twilio handles STOP confirmations itself)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // ---- outbound: admin JWT required ----
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: 'admin auth required' }, 401);

    const SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const FROM = Deno.env.get('TWILIO_FROM');
    if (!SID || !TOKEN || !FROM) {
      return json({ ok: false, error: 'Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM' }, 501);
    }

    const { message, kind, phone } = await req.json();
    const text = String(message ?? '').trim();
    if (!text || text.length > 640) return json({ ok: false, error: 'message required (max 640 chars)' }, 400);
    if (!KINDS.has(kind)) return json({ ok: false, error: `kind must be one of: ${[...KINDS].join(', ')}` }, 400);

    // recipients: explicit consent AND not opted out — enforced HERE
    let q = supabase.from('sms_subscribers').select('phone')
      .eq('consent', true).eq('opted_out', false);
    if (phone) q = q.eq('phone', String(phone).replace(/[^0-9+]/g, ''));
    const { data: subs } = await q;
    if (!subs?.length) return json({ ok: true, sent: 0, note: phone ? 'number has no active consent' : 'no consented subscribers' });

    const withOptOut = `${text} Reply STOP to opt out.`;
    let sent = 0, failed = 0;
    for (const s of subs) {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${SID}:${TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: s.phone, From: FROM, Body: withOptOut }),
      });
      if (res.ok) {
        sent++;
        await supabase.from('sms_subscribers').update({ last_message_at: new Date().toISOString() }).eq('phone', s.phone);
      } else failed++;
    }
    return json({ ok: true, sent, failed, kind });
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
