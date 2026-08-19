// Supabase Edge Function: validate-access-code
// Secure gate check — the code list never ships in the frontend bundle.
//
// Deploy:  supabase functions deploy validate-access-code
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return json({ valid: false, error: 'code required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clean = code.trim().toUpperCase();
    const { data } = await supabase
      .from('access_codes')
      .select('code, uses')
      .eq('code', clean)
      .eq('active', true)
      .maybeSingle();

    if (data) {
      await supabase.from('access_codes').update({ uses: (data.uses ?? 0) + 1 }).eq('code', clean);
    }

    return json({ valid: Boolean(data) });
  } catch (e) {
    return json({ valid: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
