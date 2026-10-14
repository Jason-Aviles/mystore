// Shipping rates + labels through Shippo — ONE place for both checkout
// quotes and admin label buying.
//
// Config lives in the admin-only `shipping_config` table (the ship-from
// address is the owner's, so it never goes in public site_settings).
// The public switch `site_settings.shipLiveRates` decides whether checkout
// quotes real carrier rates by ZIP. Off, missing config, or any Shippo
// failure → the published flat rates, so shipping can never block a sale.
//
// Free standard shipping only for the contiguous US ("L48") over the
// threshold; Alaska/Hawaii/territories/military and Canada pay real rates.

export const US_STANDARD_CENTS = 695;   // $6.95 · 3–7 business days (free over threshold)
export const US_PRIORITY_CENTS = 1495;  // $14.95 · 2–3 business days
export const CA_TRACKED_CENTS = 1495;   // $14.95 · 7–14 business days
// Flat rates mirror the published shipping policy (src/pages/Policies.jsx).

export type Zone = 'L48' | 'US_REMOTE' | 'CA';
export type ShipOption = {
  id: string;          // our service id: standard | priority | express | ups_2day | ups_next | ca_*
  label: string;       // shown at checkout
  cents: number;       // what the customer pays
  costCents?: number;  // what the carrier charges us (live quotes only)
  token?: string;      // Shippo servicelevel token
  days?: number | null;
};
export type Quote = {
  source: 'shippo' | 'flat';
  country: 'US' | 'CA';
  zip: string | null;
  zone: Zone;
  options: ShipOption[]; // options[0] is always the standard rate
  weightOz?: number;
};

// what the customer can pick, in order — first match per service wins
const US_SERVICES: { id: string; label: string; tokens: string[] }[] = [
  { id: 'standard', label: 'Standard (USPS Ground Advantage)', tokens: ['usps_ground_advantage'] },
  { id: 'priority', label: 'USPS Priority Mail', tokens: ['usps_priority'] },
  { id: 'ups_2day', label: 'UPS 2nd Day Air', tokens: ['ups_second_day_air'] },
  { id: 'express', label: 'USPS Priority Mail Express', tokens: ['usps_priority_express'] },
  { id: 'ups_next', label: 'UPS Next Day Air', tokens: ['ups_next_day_air_saver', 'ups_next_day_air'] },
];
const CA_SERVICES = [
  { id: 'standard', label: 'Canada Tracked (USPS First-Class International)', tokens: ['usps_first_class_package_international_service'] },
  { id: 'priority', label: 'USPS Priority Mail International', tokens: ['usps_priority_mail_international'] },
];
// US and Canada share ids (standard, priority) — merge, don't overwrite
export const ALL_SERVICE_TOKENS: Record<string, string[]> = {};
for (const s of [...US_SERVICES, ...CA_SERVICES]) {
  ALL_SERVICE_TOKENS[s.id] = [...(ALL_SERVICE_TOKENS[s.id] || []), ...s.tokens];
}

/** US ZIP → zone. Free shipping is contiguous-US only. */
export function zoneOf(country: string, zip?: string | null): Zone {
  if (country === 'CA') return 'CA';
  const z3 = Number(String(zip || '').trim().slice(0, 3));
  if (!Number.isFinite(z3) || String(zip || '').trim().length < 5) return 'L48';
  if (z3 >= 995 && z3 <= 999) return 'US_REMOTE'; // Alaska
  if (z3 >= 967 && z3 <= 969) return 'US_REMOTE'; // Hawaii, Guam, N. Marianas
  if (z3 >= 6 && z3 <= 9) return 'US_REMOTE';     // Puerto Rico, USVI
  if (z3 >= 90 && z3 <= 98) return 'US_REMOTE';   // APO/FPO Europe
  if (z3 === 340 || (z3 >= 962 && z3 <= 966)) return 'US_REMOTE'; // APO/FPO
  return 'L48';
}

export function cleanZip(country: string, zip: unknown): string | null {
  const s = String(zip ?? '').trim().toUpperCase();
  if (country === 'CA') return /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(s) ? s.replace(/^(...)(\S)/, '$1 $2') : null;
  return /^\d{5}(-\d{4})?$/.test(s) ? s.slice(0, 5) : null;
}

export function flatQuote(country: 'US' | 'CA', subtotal: number, threshold: number, zip: string | null = null): Quote {
  if (country === 'CA') {
    return { source: 'flat', country, zip, zone: 'CA', options: [
      { id: 'standard', label: 'Canada Tracked (7–14 business days)', cents: CA_TRACKED_CENTS },
    ] };
  }
  const zone = zoneOf(country, zip);
  const free = zone === 'L48' && threshold > 0 && subtotal >= threshold;
  return { source: 'flat', country, zip, zone, options: [
    { id: 'standard', label: free ? 'US Standard (3–7 business days) — Free' : 'US Standard (3–7 business days)', cents: free ? 0 : US_STANDARD_CENTS },
    { id: 'priority', label: 'US Priority (2–3 business days)', cents: US_PRIORITY_CENTS },
  ] };
}

// ---------------------------------------------------------------- config

export type ShipConfig = {
  from?: Record<string, string>;
  packagingOz?: number;
  defaultItemOz?: number;
  boxes?: { name: string; length: number; width: number; height: number; maxOz?: number }[];
  handlingCents?: number;
  services?: string[]; // enabled upgrade ids; standard is always on
};

export async function loadShipConfig(supabase: any): Promise<ShipConfig> {
  const { data } = await supabase.from('shipping_config').select('data').eq('id', 1).maybeSingle();
  return (data?.data || {}) as ShipConfig;
}

/** Ready to quote/buy? Returns what's missing (empty = ready). */
export function configGaps(cfg: ShipConfig): string[] {
  const f = cfg.from || {};
  const gaps: string[] = [];
  for (const k of ['name', 'street1', 'city', 'state', 'zip', 'phone', 'email']) if (!String(f[k] || '').trim()) gaps.push(`ship-from ${k}`);
  if (!cfg.boxes?.length) gaps.push('at least one box size');
  return gaps;
}

export function shippoKey(test: boolean): string | null {
  return Deno.env.get(test ? 'SHIPPO_TEST_API_KEY' : 'SHIPPO_API_KEY') || null;
}

/** total packed weight + the smallest box that fits it */
export function parcelFor(cfg: ShipConfig, items: { qty: number; weightOz?: number | null }[]) {
  const per = Number(cfg.defaultItemOz) > 0 ? Number(cfg.defaultItemOz) : 24;
  const weightOz = Math.max(1, Math.ceil(
    items.reduce((s, i) => s + (Number(i.weightOz) > 0 ? Number(i.weightOz) : per) * i.qty, 0)
    + (Number(cfg.packagingOz) || 0),
  ));
  const boxes = (cfg.boxes || []).slice().sort((a, b) => (a.maxOz ?? 1e9) - (b.maxOz ?? 1e9));
  const box = boxes.find((b) => b.maxOz == null || b.maxOz >= weightOz) || boxes[boxes.length - 1];
  return {
    weightOz,
    box: box?.name ?? null,
    parcel: {
      length: String(box?.length ?? 12), width: String(box?.width ?? 10), height: String(box?.height ?? 4),
      distance_unit: 'in', weight: String(weightOz), mass_unit: 'oz',
    },
  };
}

export async function shippo(path: string, key: string, body?: unknown) {
  const res = await fetch(`https://api.goshippo.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `ShippoToken ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json as any };
}

export function fromAddress(cfg: ShipConfig) {
  const f = cfg.from || {};
  return {
    name: f.name, company: f.company || undefined, street1: f.street1, street2: f.street2 || undefined,
    city: f.city, state: f.state, zip: f.zip, country: f.country || 'US', phone: f.phone, email: f.email,
  };
}

/** Pick one rate per offered service from a Shippo rates list. */
export function pickRates(rates: any[], country: 'US' | 'CA', enabled?: string[]) {
  const list = country === 'CA' ? CA_SERVICES : US_SERVICES;
  const out: { id: string; label: string; rate: any }[] = [];
  for (const s of list) {
    if (s.id !== 'standard' && enabled && !enabled.includes(s.id)) continue;
    const match = s.tokens.map((t) => rates.find((r) => r.servicelevel?.token === t)).find(Boolean);
    if (match) out.push({ id: s.id, label: s.label, rate: match });
  }
  return out;
}

const cents = (v: unknown) => Math.round(Number(v || 0) * 100);
const daysText = (d: number | null | undefined) => (d ? ` (est. ${d} business day${d === 1 ? '' : 's'})` : '');

/**
 * Checkout quote. Real Shippo rates when live rates are on and configured,
 * flat published rates otherwise — never throws.
 */
export async function quoteShipping(opts: {
  supabase: any; settings: Record<string, any>;
  country: 'US' | 'CA'; zip: string | null; subtotal: number; threshold: number;
  items: { qty: number; weightOz?: number | null }[];
}): Promise<Quote> {
  const { supabase, settings, country, zip, subtotal, threshold, items } = opts;
  const flat = flatQuote(country, subtotal, threshold, zip);
  if (settings.shipLiveRates !== true || !zip) return flat;
  try {
    const cfg = await loadShipConfig(supabase);
    const key = shippoKey(false);
    if (!key || configGaps(cfg).length) return flat;
    const { parcel, weightOz } = parcelFor(cfg, items);
    const res = await shippo('/shipments/', key, {
      address_from: fromAddress(cfg),
      address_to: { zip, country },
      parcels: [parcel],
      async: false,
    });
    const picked = pickRates(res.body?.rates || [], country, cfg.services);
    if (!res.ok || !picked.length || picked[0].id !== 'standard') return flat;
    const zone = zoneOf(country, zip);
    const free = zone === 'L48' && threshold > 0 && subtotal >= threshold;
    const handling = Math.max(0, Math.round(Number(cfg.handlingCents) || 0));
    return {
      source: 'shippo', country, zip, zone, weightOz,
      options: picked.map((p) => {
        const cost = cents(p.rate.amount);
        const isFree = free && p.id === 'standard';
        return {
          id: p.id,
          label: `${p.label}${daysText(p.rate.estimated_days)}${isFree ? ' — Free' : ''}`,
          cents: isFree ? 0 : cost + handling,
          costCents: cost,
          token: p.rate.servicelevel?.token,
          days: p.rate.estimated_days ?? null,
        };
      }),
    };
  } catch {
    return flat;
  }
}
