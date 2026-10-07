// Who is calling this edge function?
//   'service' — another function / cron using the service-role key
//   'admin'   — a signed-in user whose email is on the admins allowlist
//   'public'  — anyone else (the storefront's publishable key, strangers)
// Admin-only functions must reject 'public'. Before Oct 2026 several only
// checked "is anyone signed in", which (with open sign-up) meant anyone.
import { createClient } from 'npm:@supabase/supabase-js@2';

export type Caller = 'service' | 'admin' | 'public';

export async function callerRole(req: Request): Promise<Caller> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return 'public';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (serviceKey && token === serviceKey) return 'service';

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') || serviceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await userClient.auth.getUser(token).catch(() => ({ data: null }));
  const email = data?.user?.email?.toLowerCase();
  if (!email) return 'public';
  const svc = createClient(url, serviceKey);
  const { data: row } = await svc.from('admins').select('email').ilike('email', email).maybeSingle();
  return row ? 'admin' : 'public';
}
