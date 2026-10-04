-- Apply only to a fresh, dedicated Supabase project. No external resource is created by this repository.
create extension if not exists pgcrypto;
create schema if not exists private_management;
revoke all on schema private_management from public, anon, authenticated;
grant usage on schema private_management to service_role;

create type private_management.admin_role as enum ('viewer','editor','admin');
create table private_management.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role private_management.admin_role not null,
  created_at timestamptz not null default now()
);
create table private_management.sites (
  id uuid primary key default gen_random_uuid(), public_site_key text not null unique check (public_site_key ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table private_management.listings (id uuid primary key default gen_random_uuid(),site_id uuid not null references private_management.sites(id),name text not null check(length(name) between 1 and 200),status text not null check(status in ('draft','review','published','archived')),public_url text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private_management.content_items (id uuid primary key default gen_random_uuid(),site_id uuid not null references private_management.sites(id),title text not null check(length(title) between 1 and 200),slug text not null check(slug ~ '^[a-z0-9-]+$'),status text not null check(status in ('draft','review','published','archived')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private_management.offers (id uuid primary key default gen_random_uuid(),site_id uuid not null references private_management.sites(id),name text not null,price_minor bigint check(price_minor>=0),currency text check(currency ~ '^[A-Z]{3}$'),status text not null check(status in ('draft','active','paused','retired')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private_management.campaigns (id uuid primary key default gen_random_uuid(),site_id uuid not null references private_management.sites(id),name text not null,status text not null check(status in ('draft','active','paused','completed','cancelled')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private_management.transactions (id uuid primary key default gen_random_uuid(),site_id uuid not null references private_management.sites(id),amount_minor bigint not null,currency text not null check(currency ~ '^[A-Z]{3}$'),status text not null check(status in ('pending','settled','refunded','failed')),external_reference text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private_management.leads (id uuid primary key default gen_random_uuid(),site_id uuid not null references private_management.sites(id),contact_name text not null,contact_email text not null,consent_at timestamptz not null,status text not null check(status in ('new','contacted','qualified','closed','deleted')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private_management.claim_requests (id uuid primary key default gen_random_uuid(),site_id uuid not null references private_management.sites(id),listing_id uuid not null references private_management.listings(id),requester_name text not null,requester_email text not null,status text not null check(status in ('pending','approved','rejected','withdrawn')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private_management.form_submissions (id uuid primary key default gen_random_uuid(),site_id uuid not null references private_management.sites(id),form_key text not null check(form_key ~ '^[a-z0-9_-]+$'),payload jsonb not null check(jsonb_typeof(payload)='object'),consent_at timestamptz not null,status text not null check(status in ('new','reviewed','resolved','deleted')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private_management.tasks (id uuid primary key default gen_random_uuid(),site_id uuid not null references private_management.sites(id),title text not null,priority text not null check(priority in ('low','normal','high','urgent')),status text not null check(status in ('open','in_progress','blocked','done','cancelled')),due_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());

create table private_management.audit_events (
  id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
  actor_id uuid, actor_role text, action text not null, entity_type text not null, entity_id uuid,
  request_id uuid not null default gen_random_uuid(), metadata jsonb not null default '{}'::jsonb
);

-- RLS is enabled with no policies: anon/authenticated access is denied by default.
do $$ declare t text; begin foreach t in array array['admin_memberships','sites','listings','content_items','offers','campaigns','transactions','leads','claim_requests','form_submissions','tasks','audit_events'] loop execute format('alter table private_management.%I enable row level security',t); execute format('alter table private_management.%I force row level security',t); execute format('revoke all on private_management.%I from public, anon, authenticated',t); execute format('grant select,insert,update,delete on private_management.%I to service_role',t); end loop; end $$;
grant usage, select on all sequences in schema private_management to service_role;

-- Audit events are append-only even for service_role-facing application code.
revoke update, delete, truncate on private_management.audit_events from service_role;
create or replace function private_management.reject_audit_mutation() returns trigger language plpgsql as $$ begin raise exception 'audit_events are append-only'; end $$;
create trigger audit_events_immutable before update or delete on private_management.audit_events for each row execute function private_management.reject_audit_mutation();

comment on schema private_management is 'No health, patient, diagnosis, treatment, clinical or client-case data is permitted.';
