-- Admin allowlist (Oct 2026 security fix).
-- Before this, every admin policy was `to authenticated using (true)` and
-- public sign-up was open: ANY account anyone created had full admin power
-- (customers, orders, prices, settings). Sign-up is now disabled in Auth
-- settings AND every admin policy checks this allowlist, so even a stray
-- authenticated account gets nothing.

create table if not exists admins (
  email text primary key,
  created_at timestamptz default now()
);
alter table admins enable row level security;
-- no policies on purpose: only the service role and is_admin() read it

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated, service_role;

-- every policy granted to `authenticated` now requires is_admin()
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname, cmd
    from pg_policies
    where schemaname in ('public', 'storage') and roles = '{authenticated}'
  loop
    if p.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on %I.%I using (is_admin())', p.policyname, p.schemaname, p.tablename);
    elsif p.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check (is_admin() and %s)', p.policyname, p.schemaname, p.tablename,
        coalesce((select with_check from pg_policies x where x.schemaname = p.schemaname and x.tablename = p.tablename and x.policyname = p.policyname), 'true'));
    else
      execute format('alter policy %I on %I.%I using (is_admin()) with check (is_admin())', p.policyname, p.schemaname, p.tablename);
    end if;
  end loop;
end $$;
