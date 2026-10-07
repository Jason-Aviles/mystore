// Minimal PayPal REST client (Orders v2) for the edge functions.
// Secrets (Supabase → Edge Functions → Secrets):
//   PAYPAL_CLIENT_ID      — same value as the storefront's VITE_PAYPAL_CLIENT_ID
//   PAYPAL_CLIENT_SECRET  — from developer.paypal.com → Apps & Credentials
//   PAYPAL_ENV            — "live" for real money, "sandbox" for test accounts

export function paypalConfigured() {
  return Boolean(Deno.env.get('PAYPAL_CLIENT_ID') && Deno.env.get('PAYPAL_CLIENT_SECRET'));
}

function base() {
  return Deno.env.get('PAYPAL_ENV') === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  const id = Deno.env.get('PAYPAL_CLIENT_ID')!;
  const secret = Deno.env.get('PAYPAL_CLIENT_SECRET')!;
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`PayPal auth failed (${res.status}) — check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_ENV`);
  }
  cached = { token: body.access_token, until: Date.now() + (Number(body.expires_in || 300) - 60) * 1000 };
  return body.access_token;
}

/** Calls the PayPal API; returns { ok, status, body } — never throws on 4xx. */
export async function paypal(path: string, init: { method?: string; body?: unknown; requestId?: string } = {}) {
  const res = await fetch(`${base()}${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      // PayPal-Request-Id makes create/capture idempotent on retries
      ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}),
      Prefer: 'return=representation',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export const money = (n: number) => n.toFixed(2);
