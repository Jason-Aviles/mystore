-- Draft → Preview → Publish for site settings (Oct 2026).
--   id 1 = PUBLISHED (what every visitor and every edge function reads)
--   id 2 = DRAFT     (admin edits land here; admins can preview it)
-- Publishing copies the draft over the published row in one statement.

alter table site_settings add column if not exists published_at timestamptz;
-- was single_row (id = 1); now exactly the published + draft rows
alter table site_settings drop constraint if exists single_row;
alter table site_settings drop constraint if exists site_settings_two_rows;
alter table site_settings add constraint site_settings_two_rows check (id in (1, 2));

insert into site_settings (id, data, updated_at)
  values (1, '{}'::jsonb, now()) on conflict (id) do nothing;
insert into site_settings (id, data, updated_at)
  select 2, data, now() from site_settings where id = 1
  on conflict (id) do nothing;

-- visitors may read ONLY the published row; the draft is admin-only
drop policy if exists "public read settings" on site_settings;
create policy "public read settings" on site_settings for select using (id = 1);

create or replace function publish_site_settings() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare stamp timestamptz := now();
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update site_settings
     set data = (select data from site_settings where id = 2),
         updated_at = stamp, published_at = stamp
   where id = 1;
  update site_settings set published_at = stamp where id = 2;
  return stamp;
end $$;
revoke all on function publish_site_settings() from public;
grant execute on function publish_site_settings() to authenticated;
