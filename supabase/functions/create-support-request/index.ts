// Public support-ticket creation. Customer correspondence remains in a table
// with no anonymous grants; this narrow server-side function validates input,
// applies a basic email rate limit, inserts with the service role, and returns
// only a non-identifying reference number.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KINDS = new Set(['message', 'tracking', 'return', 'order_issue']);
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

function reference() {
  const date = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `DD-${date}-${suffix}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json();
    const kind = clean(body.kind, 20);
    const name = clean(body.name, 100);
    const email = clean(body.email, 320).toLowerCase();
    const orderNumber = clean(body.order_number ?? body.orderNumber, 80) || null;
    const subject = clean(body.subject, 160) || null;
    const message = clean(body.message, 4000);

    if (!KINDS.has(kind)) return json({ ok: false, error: 'invalid_kind' }, 400);
    if (!name) return json({ ok: false, error: 'name_required' }, 400);
    if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
      return json({ ok: false, error: 'invalid_email' }, 400);
    }
    if (!message) return json({ ok: false, error: 'message_required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase.from('support_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', since);
    if (countError) return json({ ok: false, error: 'service_unavailable' }, 503);
    if ((count ?? 0) >= 3) return json({ ok: false, error: 'too_many_requests' }, 429);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ref = reference();
      const { error } = await supabase.from('support_requests').insert({
        reference: ref,
        kind,
        name,
        email,
        order_number: orderNumber,
        subject,
        message,
      });
      if (!error) return json({ ok: true, reference: ref }, 201);
      if (error.code !== '23505') return json({ ok: false, error: 'service_unavailable' }, 503);
    }
    return json({ ok: false, error: 'reference_unavailable' }, 503);
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
