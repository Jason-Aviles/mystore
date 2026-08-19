/* Email + SMS capture. Writes to Supabase when configured, otherwise
   queues locally so nothing is lost during development. */
import { supabase, hasSupabase } from './supabase';

function localQueue(key, entry) {
  try {
    const q = JSON.parse(localStorage.getItem(key)) || [];
    q.push(entry);
    localStorage.setItem(key, JSON.stringify(q));
  } catch {}
}

/** source: 'password_gate' | 'footer_signup' | 'popup' | 'checkout' | 'back_in_stock' */
import { metaTrack } from './meta';

export async function saveEmailSignup({ email, source, consent = true, meta = {} }) {
  metaTrack('Lead');
  const entry = { email: email.trim().toLowerCase(), source, consent, meta, created_at: new Date().toISOString() };
  if (hasSupabase) {
    // save_email_signup RPC (SECURITY DEFINER) instead of a client upsert:
    // (1) upsert-under-RLS needs a SELECT policy the table must never have
    //     (it would expose the whole mailing list) — the old client upsert
    //     was failing 401 and silently stranding signups in localStorage;
    // (2) consent can only ratchet UP (existing true is never overwritten
    //     by a non-marketing capture like checkout or restock alerts);
    // (3) an active signup clears unsubscribed — an explicit re-opt-in.
    const { error } = await supabase.rpc('save_email_signup', {
      p_email: entry.email, p_source: source, p_consent: consent === true, p_meta: meta,
    });
    if (!error) {
      // welcome flow: server-side send, deduped by flow_sends — fire and forget
      if (!['checkout', 'back_in_stock'].includes(source)) {
        supabase.functions.invoke('send-flow', {
          body: { flow: 'welcome', email: entry.email, vars: { first_name: '' } },
        }).catch(() => {});
      }
      return { ok: true, backend: 'supabase' };
    }
  }
  localQueue('dd_email_queue', entry);
  return { ok: true, backend: 'local' };
}

/** SMS opt-in. Nothing is ever sent unless Twilio is connected server-side. */
export async function saveSmsSignup({ phone, consent, source = null }) {
  if (!consent) return { ok: false, error: 'consent-required' };
  const entry = { phone: phone.replace(/[^\d+]/g, ''), consent: true, opted_out: false, created_at: new Date().toISOString() };
  if (hasSupabase) {
    // definer RPC — same RLS-upsert trap as email signups; source records
    // WHERE consent was given (TCPA-style provenance)
    const { error } = await supabase.rpc('save_sms_signup', { p_phone: entry.phone, p_source: source });
    if (!error) return { ok: true, backend: 'supabase' };
  }
  localQueue('dd_sms_queue', entry);
  return { ok: true, backend: 'local' };
}

/** Access-code check.
    Secure path: validate-access-code Edge Function (code never ships in the bundle).
    Fallback: access_codes table read, then hard-coded list (NOT secure — dev only). */
export async function validateAccessCode(code, fallbackCodes) {
  const clean = code.trim().toUpperCase();
  if (hasSupabase) {
    try {
      const { data, error } = await supabase.functions.invoke('validate-access-code', { body: { code: clean } });
      if (!error && data) return Boolean(data.valid);
    } catch {}
    const { data } = await supabase
      .from('access_codes').select('code').eq('code', clean).eq('active', true).maybeSingle();
    if (data) return true;
    return false;
  }
  return fallbackCodes.includes(clean);
}
