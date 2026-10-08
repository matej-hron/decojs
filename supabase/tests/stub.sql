-- Minimal stand-in for the parts of Supabase the migrations use (local tests only).
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
create extension if not exists pgcrypto;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key);
-- Supabase reads the JWT subject; tests set it with set_config('request.jwt.claim.sub', …).
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text not null, owner uuid, unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable
as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

-- PostgREST is not running here; the migration's notify is harmless.
