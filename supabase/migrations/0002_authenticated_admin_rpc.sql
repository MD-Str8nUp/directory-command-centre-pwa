-- Authenticated, least-privilege administration. Apply after 0001.
-- Browser clients receive only the publishable key and their own short-lived Auth token.
create table if not exists private_management.rate_limit_buckets (
  user_id uuid not null, operation text not null, window_start timestamptz not null,
  hits integer not null check (hits > 0), primary key (user_id, operation, window_start)
);
alter table private_management.rate_limit_buckets enable row level security;
alter table private_management.rate_limit_buckets force row level security;
revoke all on private_management.rate_limit_buckets from public, anon, authenticated;

create or replace function private_management.current_admin(minimum private_management.admin_role default 'viewer')
returns private_management.admin_role language plpgsql stable security definer
set search_path = pg_catalog, private_management as $$
declare r private_management.admin_role;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select role into r from private_management.admin_memberships where user_id=auth.uid();
  if r is null or (case r when 'viewer' then 1 when 'editor' then 2 when 'admin' then 3 end) <
    (case minimum when 'viewer' then 1 when 'editor' then 2 when 'admin' then 3 end)
  then raise exception 'insufficient_role' using errcode='42501'; end if;
  return r;
end $$;

create or replace function private_management.consume_rate_limit(op text, max_hits integer default 45)
returns void language plpgsql volatile security definer set search_path=pg_catalog,private_management as $$
declare bucket timestamptz := date_trunc('minute', clock_timestamp()); n integer;
begin
  if auth.uid() is null or max_hits < 1 or max_hits > 120 or op !~ '^[a-z_]{1,40}$' then raise exception 'rate_limited' using errcode='42501'; end if;
  insert into private_management.rate_limit_buckets(user_id,operation,window_start,hits)
  values(auth.uid(),op,bucket,1) on conflict(user_id,operation,window_start)
  do update set hits=private_management.rate_limit_buckets.hits+1 returning hits into n;
  if n > max_hits then raise exception 'rate_limited' using errcode='P0001'; end if;
end $$;

create or replace function private_management.admin_list(entity text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private_management as $$
declare role private_management.admin_role; result jsonb;
begin
 role:=private_management.current_admin('viewer'); perform private_management.consume_rate_limit('admin_list',60);
 if entity='listings' then select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') into result from (select id,site_id,name,status,public_url,created_at,updated_at from private_management.listings limit 200) x;
 elsif entity='content_items' then select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') into result from (select id,site_id,title,slug,status,created_at,updated_at from private_management.content_items limit 200) x;
 elsif entity='tasks' then select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') into result from (select id,site_id,title,priority,status,due_at,created_at,updated_at from private_management.tasks limit 200) x;
 elsif entity='sites' then select coalesce(jsonb_agg(to_jsonb(x) order by x.public_site_key),'[]') into result from (select id,public_site_key from private_management.sites limit 200) x;
 else raise exception 'entity_not_allowed' using errcode='22023'; end if;
 insert into private_management.audit_events(actor_id,actor_role,action,entity_type,metadata) values(auth.uid(),role::text,'list',entity,jsonb_build_object('count',jsonb_array_length(result)));
 return result;
end $$;

create or replace function private_management.admin_upsert(entity text, record jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private_management as $$
declare role private_management.admin_role; result jsonb; rid uuid; sid uuid;
begin
 role:=private_management.current_admin('editor'); perform private_management.consume_rate_limit('admin_write',25);
 if jsonb_typeof(record)<>'object' then raise exception 'invalid_record' using errcode='22023'; end if;
 rid:=nullif(record->>'id','')::uuid; sid:=(record->>'site_id')::uuid;
 if entity='listings' then
   insert into private_management.listings(id,site_id,name,status,public_url) values(coalesce(rid,gen_random_uuid()),sid,left(trim(record->>'name'),200),record->>'status',nullif(record->>'public_url',''))
   on conflict(id) do update set site_id=excluded.site_id,name=excluded.name,status=excluded.status,public_url=excluded.public_url,updated_at=now() returning to_jsonb(listings.*) into result;
 elsif entity='content_items' then
   insert into private_management.content_items(id,site_id,title,slug,status) values(coalesce(rid,gen_random_uuid()),sid,left(trim(record->>'title'),200),record->>'slug',record->>'status')
   on conflict(id) do update set site_id=excluded.site_id,title=excluded.title,slug=excluded.slug,status=excluded.status,updated_at=now() returning to_jsonb(content_items.*) into result;
 elsif entity='tasks' then
   insert into private_management.tasks(id,site_id,title,priority,status,due_at) values(coalesce(rid,gen_random_uuid()),sid,left(trim(record->>'title'),500),record->>'priority',record->>'status',nullif(record->>'due_at','')::timestamptz)
   on conflict(id) do update set site_id=excluded.site_id,title=excluded.title,priority=excluded.priority,status=excluded.status,due_at=excluded.due_at,updated_at=now() returning to_jsonb(tasks.*) into result;
 else raise exception 'entity_not_allowed' using errcode='22023'; end if;
 if coalesce(length(trim(case when entity='listings' then result->>'name' else result->>'title' end)),0)=0 then raise exception 'invalid_record' using errcode='22023'; end if;
 insert into private_management.audit_events(actor_id,actor_role,action,entity_type,entity_id) values(auth.uid(),role::text,case when rid is null then 'create' else 'update' end,entity,(result->>'id')::uuid);
 return result;
end $$;

create or replace function private_management.admin_delete(entity text, record_id uuid)
returns void language plpgsql volatile security definer set search_path=pg_catalog,private_management as $$
declare role private_management.admin_role; affected integer;
begin
 role:=private_management.current_admin('admin'); perform private_management.consume_rate_limit('admin_write',25);
 if entity='listings' then delete from private_management.listings where id=record_id;
 elsif entity='content_items' then delete from private_management.content_items where id=record_id;
 elsif entity='tasks' then delete from private_management.tasks where id=record_id;
 else raise exception 'entity_not_allowed' using errcode='22023'; end if;
 get diagnostics affected=row_count; if affected<>1 then raise exception 'not_found' using errcode='P0002'; end if;
 insert into private_management.audit_events(actor_id,actor_role,action,entity_type,entity_id) values(auth.uid(),role::text,'delete',entity,record_id);
end $$;

revoke all on all functions in schema private_management from public, anon, authenticated;
grant usage on schema private_management to authenticated;
grant execute on function private_management.admin_list(text) to authenticated;
grant execute on function private_management.admin_upsert(text,jsonb) to authenticated;
grant execute on function private_management.admin_delete(text,uuid) to authenticated;
-- Helper functions remain non-executable by clients and are reached only through the reviewed RPCs.
