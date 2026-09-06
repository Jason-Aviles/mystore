-- Private support inbox. Public visitors submit only through the validated
-- create-support-request Edge Function, which uses the service role.
create table if not exists public.support_requests (
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

alter table public.support_requests enable row level security;
revoke all on table public.support_requests from anon;
revoke all on table public.support_requests from authenticated;
grant select, update on table public.support_requests to authenticated;

drop policy if exists "admin all support requests" on public.support_requests;
create policy "admin all support requests"
  on public.support_requests for all to authenticated
  using (true) with check (true);
