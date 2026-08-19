/* ============================================================
   Review app export → Supabase
   Brings your 500+ Shopify reviews into the reviews table.

   1) Export reviews as CSV from your review app:
      - Judge.me: Settings → Import/Export → Export reviews
      - Loox:    Settings → Export
      - Shopify Product Reviews app: Apps → Reviews → Export
   2) Save the file as  cvs/reviews_export.csv
   3) npm run import:reviews          (add --dry to preview)

   Recognized columns (case-insensitive, extras ignored):
     product_handle | handle          → which product
     rating | stars | review_score    → 1..5
     body | content | review_content  → review text
     title                            → optional headline
     reviewer_name | name | author    → display name
     reviewer_email | email           → email (used for the Verified badge)
     created_at | review_date | date  → original date (kept)
     verified | verified_buyer        → yes/true → Verified badge
   Imported reviews land APPROVED (they were already public on Shopify).
   ============================================================ */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
// look in reviews-cvs/ first (any .csv), then the legacy path
let FILE = './cvs/reviews_export.csv';
if (existsSync('./reviews-cvs')) {
  const csv = readdirSync('./reviews-cvs').find((f) => f.endsWith('.csv'));
  if (csv) FILE = `./reviews-cvs/${csv}`;
}

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (!existsSync(FILE)) {
  console.error(`Not found: ${FILE}
Export your reviews from the review app you used on Shopify (Judge.me / Loox /
Shopify Product Reviews) and save the CSV to that exact path, then re-run.`);
  process.exit(1);
}

const rows = parse(readFileSync(FILE, 'utf8'), { columns: true, skip_empty_lines: true, bom: true });
const pick = (row, ...names) => {
  for (const key of Object.keys(row)) {
    if (names.includes(key.toLowerCase().replace(/\s+/g, '_'))) {
      const v = (row[key] ?? '').toString().trim();
      if (v) return v;
    }
  }
  return '';
};

const reviews = rows.map((r) => {
  const stars = parseInt(pick(r, 'rating', 'stars', 'review_score', 'score'), 10);
  const body = pick(r, 'body', 'content', 'review_content', 'review', 'text');
  if (!stars || !body) return null;
  return {
    product_handle: pick(r, 'product_handle', 'handle') || null,
    name: pick(r, 'reviewer_name', 'name', 'author', 'display_name') || 'Verified Customer',
    email: pick(r, 'reviewer_email', 'email').toLowerCase() || null,
    stars: Math.min(5, Math.max(1, stars)),
    title: pick(r, 'title', 'review_title') || null,
    body,
    verified: /^(yes|true|1|verified)/i.test(pick(r, 'verified', 'verified_buyer', 'verified_purchase')) || Boolean(pick(r, 'reviewer_email', 'email')),
    approved: true,
    source: 'shopify_import',
    created_at: pick(r, 'created_at', 'review_date', 'date') || undefined,
  };
}).filter(Boolean);

console.log(`Parsed ${reviews.length} reviews from ${rows.length} rows.`);
const byStars = reviews.reduce((m, r) => ((m[r.stars] = (m[r.stars] || 0) + 1), m), {});
console.log('Stars:', byStars);

if (DRY) { console.log('— dry run, nothing written —'); process.exit(0); }

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }
const supabase = createClient(url, key);

for (let i = 0; i < reviews.length; i += 200) {
  const { error } = await supabase.from('reviews').insert(reviews.slice(i, i + 200));
  if (error) { console.error('Insert failed:', error.message); process.exit(1); }
}
console.log(`✓ ${reviews.length} reviews imported (approved, live on the site).`);
