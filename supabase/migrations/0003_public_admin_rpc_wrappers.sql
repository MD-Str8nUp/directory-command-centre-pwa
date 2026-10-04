-- Public-schema PostgREST entry points for the authenticated administration RPCs.
-- The private_management functions retain all membership, rate-limit and audit enforcement.

create or replace function public.admin_list(entity text)
returns jsonb
language sql
volatile
security invoker
set search_path = pg_catalog, private_management
as $$
  select private_management.admin_list($1);
$$;

create or replace function public.admin_upsert(entity text, record jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = pg_catalog, private_management
as $$
  select private_management.admin_upsert($1, $2);
$$;

create or replace function public.admin_delete(entity text, record_id uuid)
returns void
language sql
volatile
security invoker
set search_path = pg_catalog, private_management
as $$
  select private_management.admin_delete($1, $2);
$$;

revoke execute on function public.admin_list(text) from public, anon, authenticated;
revoke execute on function public.admin_upsert(text, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_delete(text, uuid) from public, anon, authenticated;

grant execute on function public.admin_list(text) to authenticated;
grant execute on function public.admin_upsert(text, jsonb) to authenticated;
grant execute on function public.admin_delete(text, uuid) to authenticated;
