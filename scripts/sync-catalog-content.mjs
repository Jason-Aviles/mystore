/* Syncs the CURATED catalog (src/data/products.json — real photography,
   fit notes, model sizing, correct size casing) into the live Supabase
   products table, which otherwise still holds the raw Shopify CSV import
   (old Shopify-CDN images incl. retired AI shots, empty fit/model/care,
   "Xs"/"Xl" casing, one stale handle).

   Preserves live inventory_qty on every variant — stock counts stay
   canonical in the DB; only option casing is normalized to the seed.

   Idempotent. Run AFTER any future `npm run import:shopify`.
   Usage: node scripts/sync-catalog-content.mjs                       */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(1); }
const db = createClient(url, key);

const seed = JSON.parse(readFileSync(new URL('../src/data/products.json', import.meta.url), 'utf8'));

/* seed handle → legacy DB handle that must be renamed */
const HANDLE_ALIASES = {
  'city-of-sins-sunset-vice': 'city-of-sins-sunset-vice-electric-blue-ember-orange-on-shadow-grey',
};

const norm = (s) => String(s ?? '').trim().toLowerCase();

async function renameHandle(from, to) {
  // FK has no ON UPDATE CASCADE: copy row under the new handle, repoint
  // children, then drop the old row.
  const { data: old } = await db.from('products').select('*').eq('handle', from).maybeSingle();
  if (!old) return false;
  const { error: insErr } = await db.from('products').insert({ ...old, handle: to });
  if (insErr) throw new Error(`rename insert ${to}: ${insErr.message}`);
  for (const table of ['product_variants', 'reviews']) {
    const { error } = await db.from(table).update({ product_handle: to }).eq('product_handle', from);
    if (error) throw new Error(`rename ${table}: ${error.message}`);
  }
  await db.from('order_items').update({ product_handle: to }).eq('product_handle', from); // no FK, best-effort
  const { error: delErr } = await db.from('products').delete().eq('handle', from);
  if (delErr) throw new Error(`rename delete ${from}: ${delErr.message}`);
  console.log(`  ~ renamed handle ${from} → ${to}`);
  return true;
}

for (const p of seed) {
  // 0. handle rename when the DB still uses the legacy Shopify handle
  const { data: existing } = await db.from('products').select('handle').eq('handle', p.handle).maybeSingle();
  if (!existing && HANDLE_ALIASES[p.handle]) await renameHandle(HANDLE_ALIASES[p.handle], p.handle);

  // 1. product row: curated content + flags; data blob is the full seed JSON
  const { variants, ...data } = p;
  const { error } = await db.from('products').update({
    title: p.title,
    price: p.price,
    compare_at: p.compare || null,
    category: p.category,
    collection: p.collection,
    featured: !!p.featured,
    bestseller: !!p.bestseller,
    new_arrival: !!p.newArrival,
    status: 'active',
    images: p.images || [],
    data,
    updated_at: new Date().toISOString(),
  }).eq('handle', p.handle);
  if (error) { console.error(`  ! ${p.handle}: ${error.message}`); continue; }

  // 2. variants: normalize option casing to the seed, KEEP live quantities
  const { data: dbVars } = await db.from('product_variants').select('*').eq('product_handle', p.handle);
  let fixedCase = 0, inserted = 0;
  for (const v of variants) {
    const [o1, o2raw, seedQty] = v;
    const o2 = o2raw || null;
    const match = (dbVars || []).find((d) => norm(d.option1) === norm(o1) && norm(d.option2 || '') === norm(o2 || ''));
    if (match) {
      if (match.option1 !== o1 || (match.option2 || null) !== o2) {
        const { error: e } = await db.from('product_variants')
          .update({ option1: o1, option2: o2 }).eq('id', match.id);
        if (e) console.error(`  ! variant ${p.handle} ${o1}/${o2}: ${e.message}`); else fixedCase++;
      }
    } else {
      const { error: e } = await db.from('product_variants')
        .insert({ product_handle: p.handle, option1: o1, option2: o2, inventory_qty: seedQty });
      if (e) console.error(`  ! insert variant ${p.handle} ${o1}/${o2}: ${e.message}`); else inserted++;
    }
  }
  const extras = (dbVars || []).filter((d) => !variants.some((v) => norm(v[0]) === norm(d.option1) && norm(v[1] || '') === norm(d.option2 || '')));
  console.log(`  ✓ ${p.handle} — content synced, ${fixedCase} variant casings fixed, ${inserted} inserted${extras.length ? `, ${extras.length} extra DB variants left untouched` : ''}`);
}
console.log('Done. Live catalog now serves the curated content with real photography.');
