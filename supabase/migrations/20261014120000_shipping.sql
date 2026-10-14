-- ---------- shipping (Shippo) ----------
-- Ship-from address + boxes. Admin-only: the owner's address must never be
-- readable with the public key (site_settings is public, so not there).
create table if not exists shipping_config (
  id integer primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table shipping_config enable row level security;
drop policy if exists "admins manage shipping config" on shipping_config;
create policy "admins manage shipping config" on shipping_config
  for all to authenticated using (is_admin()) with check (is_admin());
insert into shipping_config (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- what checkout quoted/charged for shipping, and the label bought for it
alter table orders add column if not exists shipping_quote jsonb;
alter table orders add column if not exists label jsonb;
