/* ============================================================
   Shopify → Supabase import
   Reads the CSV exports in ./cvs and loads clean rows into
   products / product_variants / customers / orders / order_items.

   Usage:
     1) copy .env.example → .env and fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
     2) npm run import:shopify
        (add --dry to preview without writing)

   Notes:
   - Product image URLs from the Shopify CDN are kept as-is; swap them
     later by editing the product in /admin or re-pointing to /images/products.
   - Existing rows with the same handle/email are updated, not duplicated.
   ============================================================ */
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
const CSV_DIR = './cvs';

// tiny .env loader (no dotenv dependency)
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!url || !key)) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env (or run with --dry to preview).');
  process.exit(1);
}
const supabase = DRY ? null : createClient(url, key);

function readCsv(name) {
  const path = `${CSV_DIR}/${name}`;
  if (!existsSync(path)) { console.warn(`- skip: ${name} not found`); return []; }
  return parse(readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true, bom: true });
}

const clean = (s) => (s ?? '').toString().trim();
const num = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const stripHtml = (h) => clean(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------------- products ---------------- */
async function importProducts() {
  const rows = readCsv('products_export_1.csv');
  if (!rows.length) return;

  // group rows by handle — first row per handle carries the product fields
  const byHandle = new Map();
  for (const r of rows) {
    const h = clean(r.Handle);
    if (!h) continue;
    if (!byHandle.has(h)) byHandle.set(h, []);
    byHandle.get(h).push(r);
  }

  const products = [];
  const variants = [];

  for (const [handle, group] of byHandle) {
    const head = group.find((r) => clean(r.Title)) ?? group[0];
    const title = clean(head.Title) || handle;
    const opt1Name = clean(head['Option1 Name']) || 'Size';
    const opt2Name = clean(head['Option2 Name']) || null;

    const images = [...new Set(group.map((r) => clean(r['Image Src'])).filter(Boolean))];
    const opts1 = [], opts2 = [];
    for (const r of group) {
      const o1 = clean(r['Option1 Value']);
      const o2 = clean(r['Option2 Value']);
      const qty = r['Variant Inventory Qty'];
      if (!o1 || qty === '' || qty == null) continue;
      const o1n = o1.toUpperCase() === o1.toLowerCase() ? o1.toUpperCase() : o1[0].toUpperCase() + o1.slice(1);
      const o2n = o2 ? (o2.toUpperCase() === o2.toLowerCase() ? o2.toUpperCase() : o2[0].toUpperCase() + o2.slice(1)) : '';
      if (!opts1.includes(o1n)) opts1.push(o1n);
      if (o2n && !opts2.includes(o2n)) opts2.push(o2n);
      variants.push({
        product_handle: handle,
        option1: o1n,
        option2: o2n || null,
        sku: clean(r['Variant SKU']) || null,
        inventory_qty: parseInt(qty, 10) || 0,
        price: num(r['Variant Price']),
      });
    }

    const price = num(head['Variant Price']) ?? 0;
    const compare = num(head['Variant Compare At Price']);
    const tags = clean(head.Tags);
    const desc = stripHtml(head['Body (HTML)']);

    products.push({
      handle,
      title,
      price,
      compare_at: compare,
      category: title.toLowerCase().includes('bundle') ? 'bundle'
        : title.toLowerCase().includes('jersey') ? 'jersey'
        : title.toLowerCase().includes('pant') && title.toLowerCase().includes('nylon') ? 'pants'
        : 'essentials',
      collection: title.toLowerCase().includes('city of sin') ? 'City of Sins' : 'Core',
      featured: false,
      bestseller: false,
      new_arrival: false,
      stripe_link: null,
      status: clean(head.Status) === 'active' ? 'active' : 'draft',
      images,
      data: {
        sub: '',
        tag: tags || 'CORE',
        short: desc.slice(0, 180),
        desc: [desc],
        includes: null,
        materials: clean(head['Fabric (product.metafields.shopify.fabric)']) || '',
        care: '',
        fit: '',
        model: '',
        optionNames: [opt1Name, opt2Name],
        options1: opts1,
        options2: opts2.length ? opts2 : null,
        colorImages: null,
        images,
        seoTitle: clean(head['SEO Title']) || title,
        seoDescription: clean(head['SEO Description']) || desc.slice(0, 160),
      },
    });
  }

  console.log(`Products: ${products.length}, variants: ${variants.length}`);
  if (DRY) return;

  const { error: e1 } = await supabase.from('products')
    .upsert(products, { onConflict: 'handle' });
  if (e1) throw new Error('products upsert: ' + e1.message);

  for (const p of products) {
    await supabase.from('product_variants').delete().eq('product_handle', p.handle);
  }
  const { error: e2 } = await supabase.from('product_variants').insert(variants);
  if (e2) throw new Error('variants insert: ' + e2.message);
  console.log('✓ products + variants imported');
}

/* ---------------- customers ---------------- */
async function importCustomers() {
  const rows = readCsv('customers_export.csv');
  if (!rows.length) return;

  const customers = rows.map((r) => ({
    email: clean(r.Email).toLowerCase(),
    name: [clean(r['First Name']), clean(r['Last Name'])].filter(Boolean).join(' ') || null,
    phone: clean(r.Phone || r['Default Address Phone']) || null,
    accepts_marketing: /yes|true/i.test(clean(r['Accepts Email Marketing'] || r['Accepts Marketing'])),
    total_spent: num(r['Total Spent']) ?? 0,
    orders_count: parseInt(r['Total Orders'] || r['Orders Count'], 10) || 0,
    tags: clean(r.Tags) || null,
    address: {
      address1: clean(r['Default Address Address1']),
      city: clean(r['Default Address City']),
      province: clean(r['Default Address Province Code']),
      zip: clean(r['Default Address Zip']),
      country: clean(r['Default Address Country Code']),
    },
  })).filter((c) => c.email);

  console.log(`Customers: ${customers.length}`);
  if (DRY) return;
  const { error } = await supabase.from('customers').upsert(customers, { onConflict: 'email' });
  if (error) throw new Error('customers upsert: ' + error.message);

  // marketing-consented customers also join the email list
  const signups = customers.filter((c) => c.accepts_marketing).map((c) => ({
    email: c.email, source: 'checkout', consent: true, meta: { imported: 'shopify' },
  }));
  if (signups.length) {
    await supabase.from('email_signups').upsert(signups, { onConflict: 'email' });
  }
  console.log('✓ customers imported');
}

/* ---------------- orders ---------------- */
async function importOrders() {
  const rows = [...readCsv('orders_export.csv'), ...readCsv('orders_export_1.csv')];
  if (!rows.length) return;

  // group line rows by order Name (#1001 …)
  const byName = new Map();
  for (const r of rows) {
    const name = clean(r.Name);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(r);
  }

  console.log(`Orders: ${byName.size}`);
  if (DRY) return;

  for (const [name, group] of byName) {
    const head = group[0];
    const email = clean(head.Email).toLowerCase();
    if (!email) continue;

    const financial = clean(head['Financial Status']).toLowerCase();
    const fulfillment = clean(head['Fulfillment Status']).toLowerCase();
    const status =
      financial === 'refunded' ? 'refunded'
      : financial === 'voided' ? 'cancelled'
      : fulfillment === 'fulfilled' ? 'shipped'
      : financial === 'paid' ? 'paid'
      : 'pending';

    const { data: order, error } = await supabase.from('orders').insert({
      customer_email: email,
      status,
      total: num(head.Total) ?? 0,
      note: `Shopify ${name}`,
      created_at: clean(head['Created at']) || undefined,
    }).select().single();
    if (error) { console.warn(`- order ${name}: ${error.message}`); continue; }

    const items = group
      .filter((r) => clean(r['Lineitem name']))
      .map((r) => ({
        order_id: order.id,
        title: clean(r['Lineitem name']),
        qty: parseInt(r['Lineitem quantity'], 10) || 1,
        price: num(r['Lineitem price']) ?? 0,
        product_handle: null,
        option1: null,
        option2: null,
      }));
    if (items.length) await supabase.from('order_items').insert(items);
  }
  console.log('✓ orders imported');
}

/* ---------------- run ---------------- */
console.log(DRY ? '— DRY RUN (nothing written) —' : '— importing to Supabase —');
try {
  await importProducts();
  await importCustomers();
  await importOrders();
  console.log('Done.');
} catch (e) {
  console.error('Import failed:', e.message);
  process.exit(1);
}
