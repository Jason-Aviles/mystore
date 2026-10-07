-- Drops (Oct 2026): preorder campaigns become the store's "drops".
--   status: draft · coming_soon (Upcoming) · live (Preorder open) ·
--           released (out now, sells normally) · closed · archived
--   content       = PUBLISHED landing page + countdown (what visitors see)
--   draft_content = admin edits; publish_site_settings() copies it live
-- Which drop is featured lives in site_settings.data.featuredDropId, so it
-- goes through the same draft → preview → publish flow as every setting.

alter table preorder_campaigns drop constraint if exists preorder_campaigns_status_check;
alter table preorder_campaigns add constraint preorder_campaigns_status_check
  check (status in ('draft', 'coming_soon', 'live', 'released', 'closed', 'archived'));

alter table preorder_campaigns add column if not exists content jsonb not null default '{}'::jsonb;
alter table preorder_campaigns add column if not exists draft_content jsonb not null default '{}'::jsonb;

-- visitors may read any drop that is announced or out (never drafts)
drop policy if exists "public read visible preorder campaigns" on preorder_campaigns;
create policy "public read visible preorder campaigns" on preorder_campaigns
  for select using (status in ('coming_soon', 'live', 'released', 'closed'));

-- publish now also pushes every drop's draft landing page live
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
  update preorder_campaigns
     set content = draft_content, updated_at = stamp
   where content is distinct from draft_content;
  return stamp;
end $$;
revoke all on function publish_site_settings() from public;
grant execute on function publish_site_settings() to authenticated;
