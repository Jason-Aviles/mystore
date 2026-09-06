-- ============================================================
-- DARK DIVINE — Supabase schema
-- Run this whole file in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- catalog ----------
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  created_at timestamptz default now()
);

create table if not exists products (
  handle text primary key,
  title text not null,
  price numeric(10,2) not null default 0,
  compare_at numeric(10,2),
  category text default 'essentials',
  collection text default 'Core',
  featured boolean default false,
  bestseller boolean default false,
  new_arrival boolean default false,
  stripe_link text,
  status text default 'active' check (status in ('active','draft','archived')),
  images jsonb default '[]',
  data jsonb default '{}',            -- full product JSON (desc, fit, care, seo, options…)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_handle text not null references products(handle) on delete cascade,
  option1 text not null,
  option2 text,
  sku text,
  inventory_qty integer not null default 0,
  price numeric(10,2),
  unique (product_handle, option1, option2)
);

-- ---------- people ----------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  phone text,
  accepts_marketing boolean default false,
  total_spent numeric(10,2) default 0,
  orders_count integer default 0,
  tags text,
  address jsonb,
  created_at timestamptz default now()
);

create table if not exists email_signups (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  source text not null default 'popup'
    check (source in ('password_gate','preorder_password_gate','footer_signup','popup','checkout','back_in_stock','support')),
  consent boolean default false,  -- marketing consent is EXPLICIT — never assumed
  unsubscribed boolean default false,
  meta jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists sms_subscribers (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  consent boolean not null default false,
  opted_out boolean not null default false,   -- STOP replies set this true
  consent_source text,                        -- where consent was given (gate, checkout…)
  consent_at timestamptz,                     -- when consent was given
  last_message_at timestamptz,                -- last SMS we sent (Twilio scaffold)
  created_at timestamptz default now()
);

-- Support requests contain private customer correspondence. Anonymous clients
-- cannot touch this table directly; the validated Edge Function is the only
-- public creation path and returns only an opaque reference.
create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null check (reference ~ '^DD-[0-9]{6}-[A-F0-9]{12}$'),
  kind text not null check (kind in ('message','tracking','return','order_issue')),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 5 and 320),
  order_number text check (order_number is null or char_length(order_number) <= 80),
  subject text check (subject is null or char_length(subject) <= 160),
  message text not null check (char_length(message) between 1 and 4000),
  status text not null default 'new'
    check (status in ('new','in_progress','waiting_customer','resolved','closed')),
  internal_note text check (internal_note is null or char_length(internal_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- commerce ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  customer_email text not null,
  status text not null default 'pending'
    check (status in ('pending','paid','shipped','delivered','refund_requested','refunded','cancelled')),
  total numeric(10,2) not null default 0,
  tracking text,
  note text,
  stripe_ref text,                    -- Stripe payment/session id once known
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_handle text,
  title text not null,
  option1 text,
  option2 text,
  qty integer not null default 1,
  price numeric(10,2) not null default 0
);

-- ---------- marketing ----------
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  audience text not null default 'all',
  status text not null default 'draft' check (status in ('draft','sending','sent','failed')),
  sent_count integer default 0,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  product_handle text references products(handle) on delete cascade,
  name text not null,
  email text,
  stars integer not null check (stars between 1 and 5),
  title text,
  body text not null,
  verified boolean default false,      -- email matched a paid order at submit time
  approved boolean default false,      -- owner approves in /admin/reviews
  source text default 'site',          -- 'site' | 'shopify_import'
  meta jsonb not null default '{}',    -- voluntary fit data: { size: 'M' } — real customer input only
  created_at timestamptz default now()
);

create table if not exists access_codes (
  code text primary key,
  active boolean default true,
  note text,
  uses integer default 0,
  created_at timestamptz default now()
);

-- starter access codes (change these before the drop)
insert into access_codes (code, note) values
  ('DIVINE333', 'launch code'),
  ('DIVINE00', 'list code'),
  ('CITYOFSINS', 'drop 002 code')
on conflict (code) do nothing;

-- ============================================================
-- Row Level Security
-- Public (anon) can: read active products/variants, insert signups,
-- insert pending orders. Everything else needs an authenticated
-- admin session (create the owner account in Auth → Users).
-- ============================================================
alter table products enable row level security;
alter table product_variants enable row level security;
alter table collections enable row level security;
alter table customers enable row level security;
alter table email_signups enable row level security;
alter table sms_subscribers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table campaigns enable row level security;
alter table access_codes enable row level security;
alter table reviews enable row level security;
alter table support_requests enable row level security;

-- Explicit grants and RLS are both required. The Edge Function uses the
-- server-only service role; signed-out visitors receive no table privileges.
revoke all on table support_requests from anon;
revoke all on table support_requests from authenticated;
grant select, update on table support_requests to authenticated;

-- reviews: anyone can read approved ones and submit new ones (pending approval)
create policy "public read approved reviews" on reviews for select using (approved = true);
create policy "public submit reviews" on reviews for insert with check (approved = false);
create policy "admin all reviews" on reviews for all to authenticated using (true) with check (true);

-- public storefront reads
create policy "public read products" on products for select using (status = 'active');
create policy "public read variants" on product_variants for select using (true);
create policy "public read collections" on collections for select using (true);

-- public capture
-- NOTE: inserts only. Anon must never UPDATE these tables directly (it
-- could rewrite consent on arbitrary rows) and never SELECT them (mailing
-- list exposure). All upsert-style writes go through the SECURITY DEFINER
-- functions below — a client-side upsert also simply fails under RLS,
-- because ON CONFLICT needs SELECT on the conflicting row.
create policy "public insert signups" on email_signups for insert with check (true);
create policy "public insert sms" on sms_subscribers for insert with check (true);
create policy "public insert customers" on customers for insert with check (true);
-- NO public select on customers — PII (emails, names, addresses) must never be
-- readable with the anon key. The storefront only inserts; admin + service
-- role read. (A "read own by email" policy with using(true) would expose
-- every customer to anyone — do not re-add it.)
create policy "public insert orders" on orders for insert with check (status = 'pending');
create policy "public insert order items" on order_items for insert with check (true);

-- access codes: NO public select policy on purpose — codes are checked by
-- the validate-access-code Edge Function using the service role.

-- ---------- product photo storage ----------
-- Public-read bucket for images uploaded from /admin — anyone can view,
-- only the signed-in owner can add or delete.
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;
create policy "public read product images" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "admin upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');
create policy "admin delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images');

-- admin (any authenticated user) full access
create policy "admin all products" on products for all to authenticated using (true) with check (true);
create policy "admin all variants" on product_variants for all to authenticated using (true) with check (true);
create policy "admin all collections" on collections for all to authenticated using (true) with check (true);
create policy "admin all customers" on customers for all to authenticated using (true) with check (true);
create policy "admin all signups" on email_signups for all to authenticated using (true) with check (true);
create policy "admin all sms" on sms_subscribers for all to authenticated using (true) with check (true);
create policy "admin all orders" on orders for all to authenticated using (true) with check (true);
create policy "admin all order items" on order_items for all to authenticated using (true) with check (true);
create policy "admin all campaigns" on campaigns for all to authenticated using (true) with check (true);
create policy "admin all codes" on access_codes for all to authenticated using (true) with check (true);
create policy "admin all support requests" on support_requests for all to authenticated using (true) with check (true);

-- ---------- signup write paths (SECURITY DEFINER — safe upserts) ----------
-- consent can only ratchet UP; an active signup clears unsubscribed
create or replace function public.save_email_signup(p_email text, p_source text, p_consent boolean default false, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if p_email is null or position('@' in p_email) = 0 then raise exception 'invalid email'; end if;
  insert into email_signups (email, source, consent, meta, unsubscribed)
  values (lower(trim(p_email)), p_source, coalesce(p_consent,false), coalesce(p_meta,'{}'::jsonb), false)
  on conflict (email) do update set
    source = excluded.source,
    meta = excluded.meta,
    unsubscribed = false,
    consent = email_signups.consent or excluded.consent;
end $fn$;
revoke all on function public.save_email_signup(text,text,boolean,jsonb) from public;
grant execute on function public.save_email_signup(text,text,boolean,jsonb) to anon, authenticated;

create or replace function public.set_unsubscribed(p_email text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  update email_signups set unsubscribed = true, consent = false where email = lower(trim(p_email));
end $fn$;
revoke all on function public.set_unsubscribed(text) from public;
grant execute on function public.set_unsubscribed(text) to anon, authenticated;

create or replace function public.save_sms_signup(p_phone text, p_source text default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare clean text := regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
begin
  if length(clean) < 7 then raise exception 'invalid phone'; end if;
  insert into sms_subscribers (phone, consent, opted_out, consent_source, consent_at)
  values (clean, true, false, p_source, now())
  on conflict (phone) do update set
    consent = true, opted_out = false,
    consent_source = coalesce(excluded.consent_source, sms_subscribers.consent_source),
    consent_at = now();
end $fn$;
revoke all on function public.save_sms_signup(text,text) from public;
grant execute on function public.save_sms_signup(text,text) to anon, authenticated;

-- ---------- site settings (admin-editable storefront config) ----------
create table if not exists site_settings (
  id int primary key default 1,
  data jsonb not null default '{}',
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
alter table site_settings enable row level security;
create policy "public read settings" on site_settings for select using (true);
create policy "admin all settings" on site_settings for all to authenticated using (true) with check (true);

-- ---------- recent sales (public social proof — product + time only) ----------
-- Feeds the storefront "just sold" toasts. Deliberately excludes every
-- customer field so it is safe under a public read policy.
create or replace view recent_sales
  with (security_invoker = off) as
  select oi.product_handle, o.created_at
  from orders o
  join order_items oi on oi.order_id = o.id
  where o.status in ('paid', 'shipped', 'delivered')
    and o.created_at > now() - interval '7 days'
  order by o.created_at desc
  limit 24;
grant select on recent_sales to anon, authenticated;

-- ---------- automated email flows ----------
-- One row per (recipient, flow, dedup key) prevents duplicate sends.
create table if not exists flow_sends (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  flow text not null,            -- 'welcome' | 'thank_you' | 'abandoned_1' | 'abandoned_2' | 'back_in_stock' | 'shipped'
  dedup_key text not null,       -- e.g. order id, product handle, or 'once'
  sent_at timestamptz default now(),
  unique (email, flow, dedup_key)
);
alter table flow_sends enable row level security;
-- writes are service-role only (no policy = denied); the signed-in admin
-- may READ so the Flows page can show real sent counters
create policy "admin read flow sends" on flow_sends for select to authenticated using (true);

-- ============ privacy-safe demand aggregates (truthful urgency) ============
-- counts only, no customer data; frontend applies a minimum-display floor
create or replace view public.product_demand as
select
  oi.product_handle,
  count(*) filter (where o.created_at > now() - interval '24 hours'
                   and o.status in ('paid','shipped','delivered'))       as orders_24h,
  count(*) filter (where o.created_at > now() - interval '7 days'
                   and o.status in ('paid','shipped','delivered'))       as orders_7d,
  mode() within group (order by oi.option1) filter
    (where o.created_at > now() - interval '7 days'
     and o.status in ('paid','shipped','delivered'))                     as top_size_7d
from order_items oi
join orders o on o.id = oi.order_id
group by oi.product_handle;

create or replace view public.restock_demand as
select (meta->>'product') as product_handle, count(*) as requests
from email_signups
where source = 'back_in_stock' and meta->>'product' is not null
group by meta->>'product';

grant select on public.product_demand, public.restock_demand to anon, authenticated;

-- ============================================================
-- PRIVATE PREORDER SYSTEM
-- Campaign-gated preorders: the gate unlocks a campaign, products are
-- assigned to it, checkout validates the window/limits server-side, the
-- webhook stamps production status, and customers track everything on a
-- token-protected order-status page.
-- ============================================================

create table if not exists preorder_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft','coming_soon','live','closed','archived')),
  opens_at timestamptz,
  closes_at timestamptz,
  estimated_production_start date,
  estimated_shipping_start date,
  estimated_shipping_end date,
  access_required boolean not null default true,
  max_orders integer,
  max_units integer,
  hero_image_url text,
  terms text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table preorder_campaigns enable row level security;
create policy "public read visible preorder campaigns" on preorder_campaigns
  for select using (status in ('coming_soon','live','closed'));
create policy "admin all preorder campaigns" on preorder_campaigns
  for all to authenticated using (true) with check (true);

-- Codes live server-side ONLY: no anon policy of any kind, so they never
-- reach the frontend bundle. Validation happens in the preorder-gate Edge
-- Function with the service role.
create table if not exists preorder_access_codes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references preorder_campaigns(id) on delete cascade,
  code text not null,
  label text,
  active boolean not null default true,
  max_uses integer,          -- null = unlimited
  uses integer not null default 0,
  created_at timestamptz default now(),
  unique (campaign_id, code)
);
alter table preorder_access_codes enable row level security;
create policy "admin all preorder codes" on preorder_access_codes
  for all to authenticated using (true) with check (true);

create table if not exists preorder_campaign_updates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references preorder_campaigns(id) on delete cascade,
  stage text,                -- optional production stage this update announces
  title text not null,
  body text not null,
  published boolean not null default true,
  emailed_at timestamptz,    -- set when the update was emailed to campaign customers
  created_at timestamptz default now()
);
alter table preorder_campaign_updates enable row level security;
create policy "public read published campaign updates" on preorder_campaign_updates
  for select using (published = true);
create policy "admin all campaign updates" on preorder_campaign_updates
  for all to authenticated using (true) with check (true);

-- Immutable consent audit log — one row per consent decision, never updated.
create table if not exists consent_events (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  channel text not null check (channel in ('email','sms')),
  consent boolean not null,
  source text not null,
  meta jsonb not null default '{}',
  created_at timestamptz default now()
);
alter table consent_events enable row level security;
create policy "public log consent" on consent_events for insert with check (true);
create policy "admin read consent" on consent_events for select to authenticated using (true);

-- Webhook idempotency ledger: one row per Stripe event id; a repeated
-- delivery hits the primary key and is skipped. Service-role only (no policies).
create table if not exists stripe_webhook_events (
  id text primary key,       -- Stripe event id (evt_…)
  type text,
  created_at timestamptz default now()
);
alter table stripe_webhook_events enable row level security;

-- ---- orders: preorder lifecycle + secure status lookup ----
alter table orders add column if not exists campaign_id uuid references preorder_campaigns(id);
alter table orders add column if not exists production_status text;
alter table orders add column if not exists est_ship_start date;
alter table orders add column if not exists est_ship_end date;
alter table orders add column if not exists stripe_payment_intent text;
-- access_token: unguessable per-order secret. The status link is
-- /order-status?o=<id>&t=<token>; the order-status Edge Function requires
-- both to match — order ids alone never expose an order.
alter table orders add column if not exists access_token text not null default encode(gen_random_bytes(24),'hex');
-- deposit balance automation: balance owed + Stripe customer/invoice lifecycle
alter table orders add column if not exists balance_due numeric(10,2) not null default 0;
alter table orders add column if not exists stripe_customer text;
alter table orders add column if not exists stripe_balance_invoice text;
alter table orders add column if not exists balance_status text not null default 'none';
-- delivery address Stripe collects at checkout, saved for fulfillment from
-- our own admin/CSV: { name, phone, line1, line2, city, state, postal_code, country }
alter table orders add column if not exists shipping jsonb;
alter table orders drop constraint if exists orders_balance_status_chk;
alter table orders add constraint orders_balance_status_chk
  check (balance_status in ('none','pending','invoiced','paid'));
alter table orders drop constraint if exists orders_production_status_chk;
alter table orders add constraint orders_production_status_chk check (
  production_status is null or production_status in (
    'received','preorder_closed','production_scheduled','materials_secured',
    'in_production','quality_control','preparing_shipment','shipped',
    'delivered','delayed','cancelled','refunded'));
create index if not exists orders_campaign_idx on orders (campaign_id);

-- ---- products: campaign link + honest preorder limits ----
alter table products add column if not exists campaign_id uuid references preorder_campaigns(id) on delete set null;
alter table products add column if not exists per_customer_limit integer;   -- max units one customer may preorder
alter table products add column if not exists max_preorder_units integer;   -- production cap for the whole run
alter table products add column if not exists deposit numeric(10,2);        -- optional per-unit deposit price
