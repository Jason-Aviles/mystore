import { supabase, hasSupabase } from './supabase';

/* Truthful demand signals — aggregates from the privacy-safe views
   (product_demand / restock_demand). Counts only, no customer data.
   PRIVACY FLOOR: numbers below MIN_SHOW are never displayed, so a
   single customer's action can never be singled out. Demo mode
   returns null and the UI simply shows nothing. */
export const MIN_SHOW = 3;

const cache = {};
export async function fetchDemand(handle) {
  if (!hasSupabase) return null;
  if (cache[handle]) return cache[handle];
  try {
    const [{ data: d }, { data: r }] = await Promise.all([
      supabase.from('product_demand').select('*').eq('product_handle', handle).maybeSingle(),
      supabase.from('restock_demand').select('*').eq('product_handle', handle).maybeSingle(),
    ]);
    const out = {
      orders24h: d?.orders_24h ?? 0,
      orders7d: d?.orders_7d ?? 0,
      topSize: d?.top_size_7d ?? null,
      restockRequests: Number(r?.requests ?? 0),
    };
    cache[handle] = out;
    return out;
  } catch {
    return null;
  }
}
