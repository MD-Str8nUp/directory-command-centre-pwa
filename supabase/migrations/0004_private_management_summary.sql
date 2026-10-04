-- Aggregate-only management summary for an already approved authenticated device.
-- Returns no record identifiers, site identifiers, names, titles, URLs, slugs, dates or bodies.
create or replace function private_management.admin_summary()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, private_management
as $$
declare
  role private_management.admin_role;
  result jsonb;
begin
  role := private_management.current_admin('viewer');
  perform private_management.consume_rate_limit('admin_summary', 60);

  select jsonb_build_object(
    'listings', jsonb_build_object(
      'total', (select count(*) from private_management.listings),
      'statuses', (select coalesce(jsonb_object_agg(status, count), '{}'::jsonb) from (select status, count(*)::integer as count from private_management.listings group by status) x)
    ),
    'content_items', jsonb_build_object(
      'total', (select count(*) from private_management.content_items),
      'statuses', (select coalesce(jsonb_object_agg(status, count), '{}'::jsonb) from (select status, count(*)::integer as count from private_management.content_items group by status) x)
    ),
    'tasks', jsonb_build_object(
      'total', (select count(*) from private_management.tasks),
      'statuses', (select coalesce(jsonb_object_agg(status, count), '{}'::jsonb) from (select status, count(*)::integer as count from private_management.tasks group by status) x)
    ),
    'refreshed_at', clock_timestamp()
  ) into result;

  insert into private_management.audit_events(actor_id, actor_role, action, entity_type, metadata)
  values(auth.uid(), role::text, 'summary', 'aggregate', jsonb_build_object('entities', 3));
  return result;
end $$;

create or replace function public.admin_summary()
returns jsonb
language sql
volatile
security invoker
set search_path = pg_catalog, private_management
as $$
  select private_management.admin_summary();
$$;

revoke all on function private_management.admin_summary() from public, anon, authenticated;
revoke execute on function public.admin_summary() from public, anon, authenticated;
-- The private schema is not exposed by PostgREST; this grant permits the
-- authenticated SECURITY INVOKER wrapper to call the membership-gated function.
grant execute on function private_management.admin_summary() to authenticated;
grant execute on function public.admin_summary() to authenticated;
