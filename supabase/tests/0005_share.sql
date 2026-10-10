-- Assertions for 0005_share_link.sql. C owns a 'link' dive seeded before 0005; A and B come from 0004_rls.sql.
-- Any failed check raises and stops psql (ON_ERROR_STOP).
\set A '00000000-0000-0000-0000-00000000000a'
\set C '00000000-0000-0000-0000-00000000000c'
\set E1 '4c000000-0000-0000-0000-000000000001'

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
set client_min_messages = notice;
grant select on storage.objects to anon; -- Supabase grants it; the policies decide

-- ---- Backfill, trigger, constraints (as superuser) ----
select pg_temp.check((select share_token ~ '^[0-9a-f]{64}$' from public.log_entries where id = :'E1'), 'existing link dive got a 64-hex token');
select pg_temp.check((select count(*) from public.log_entries where visibility <> 'link' and share_token is not null) = 0, 'only link dives have tokens');
select pg_temp.check((select count(*) from public.log_entries where visibility = 'link' and share_token is null) = 0, 'every link dive has a token');
select pg_temp.check((select count(distinct share_token) = count(*) from public.log_entries where share_token is not null), 'tokens are distinct');

select share_token as tok from public.log_entries where id = :'E1' \gset

-- A client-sent token is ignored, on insert and on update.
set role authenticated;
select set_config('request.jwt.claim.sub', :'C', false);
update public.log_entries set share_token = repeat('a', 64) where id = :'E1';
select pg_temp.check((select share_token from public.log_entries where id = :'E1') = :'tok', 'owner cannot set the token of a link dive');
update public.log_entries set share_token = repeat('b', 64) where id = '4c000000-0000-0000-0000-000000000002';
select pg_temp.check((select share_token from public.log_entries where id = '4c000000-0000-0000-0000-000000000002') is null, 'owner cannot put a token on a members dive');
insert into public.log_entries (id, owner, log_number, dive_date, visibility, share_token)
    values ('4c000000-0000-0000-0000-000000000009', :'C', 9, '2026-09-20', 'link', repeat('c', 64));
select pg_temp.check((select share_token <> repeat('c', 64) and share_token ~ '^[0-9a-f]{64}$' from public.log_entries where id = '4c000000-0000-0000-0000-000000000009'), 'insert as link gets a server token');
update public.log_entries set visibility = 'private' where id = '4c000000-0000-0000-0000-000000000009';
select pg_temp.check((select share_token from public.log_entries where id = '4c000000-0000-0000-0000-000000000009') is null, 'switching away revokes the token');
update public.log_entries set visibility = 'link' where id = '4c000000-0000-0000-0000-000000000009';
select pg_temp.check((select share_token ~ '^[0-9a-f]{64}$' and share_token <> repeat('c', 64) from public.log_entries where id = '4c000000-0000-0000-0000-000000000009'), 'switching back makes a token');
select share_token as tok9 from public.log_entries where id = '4c000000-0000-0000-0000-000000000009' \gset
update public.log_entries set visibility = 'members' where id = '4c000000-0000-0000-0000-000000000009';
update public.log_entries set visibility = 'link' where id = '4c000000-0000-0000-0000-000000000009';
select pg_temp.check((select share_token from public.log_entries where id = '4c000000-0000-0000-0000-000000000009') <> :'tok9', 'turning on again makes a new token');
select share_token as tok9 from public.log_entries where id = '4c000000-0000-0000-0000-000000000009' \gset
update public.log_entries set max_depth_m = 5 where id = '4c000000-0000-0000-0000-000000000009';
select pg_temp.check((select share_token from public.log_entries where id = '4c000000-0000-0000-0000-000000000009') = :'tok9', 'other edits keep the token');
reset role;

-- ---- Grants ----
select pg_temp.check(has_function_privilege('anon', 'public.get_shared_dive(text)', 'execute'), 'anon can call get_shared_dive');
select pg_temp.check(not has_function_privilege('anon', 'public.request_share_token()', 'execute'), 'anon cannot call request_share_token');
select pg_temp.check(not has_function_privilege('anon', 'public.log_entries_share_token()', 'execute'), 'anon cannot call the trigger function');
select pg_temp.check(not has_function_privilege('anon', 'public.share_owner_active(uuid)', 'execute'), 'anon cannot call share_owner_active');
select pg_temp.check(not has_function_privilege('authenticated', 'public.shared_photo_readable(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.shared_avatar_readable(text)', 'execute'), 'storage helpers are anon-only');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('community_entries', 'community_media', 'community_recordings', 'community_recording',
                        'community_members', 'photo_readable', 'is_member', 'my_default_visibility')
      and has_function_privilege('anon', p.oid, 'execute')), 'anon still cannot execute community functions');
select pg_temp.check(not exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'), 'anon has no table grants in public');

-- ---- Anon with the token ----
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.headers', '{}', false);
select public.get_shared_dive(:'tok') as j \gset
select pg_temp.check((:'j')::jsonb #>> '{entry,id}' = :'E1', 'anon gets the shared dive by token');
select pg_temp.check((:'j')::jsonb::text !~ 'SECRET|NOTE', 'no notes (entry or site) in the payload');
select pg_temp.check(not ((:'j')::jsonb -> 'entry') ?| array['notes', 'share_token', 'owner', 'log_number', 'visibility'], 'entry has no notes/token/owner/number/visibility');
select pg_temp.check((:'j')::jsonb::text !~ 'SERIAL-XYZ|FW-9|HW-9|4711', 'no serial, firmware, hardware or dive counter anywhere');
select pg_temp.check((:'j')::jsonb #> '{entry,details}' = '{"guide": "Pepa", "rating": 4}'::jsonb, 'details: allow-listed keys only (no computer, no unknown keys)');
select pg_temp.check(not ((:'j')::jsonb -> 'entry') ?| array['site_id', 'recording_id'], 'no duplicate ids on the entry');
select pg_temp.check((:'j')::jsonb #>> '{recording,record,device,vendor}' = 'Divesoft', 'rest of the record is kept');
select pg_temp.check((:'j')::jsonb #> '{site,lat}' = 'null'::jsonb, 'no site coordinates without share_location');
select pg_temp.check((select bool_and(m -> 'lat' = 'null'::jsonb) from jsonb_array_elements((:'j')::jsonb -> 'media') m), 'no photo coordinates without share_location');
select pg_temp.check(jsonb_array_length((:'j')::jsonb -> 'media') = 2, 'only this dive''s media (photo + video)');
select pg_temp.check((:'j')::jsonb #>> '{author,display_name}' = 'Cyril', 'author display name');
select pg_temp.check((:'j')::jsonb #>> '{entry,buddies,0}' = 'Jana', 'buddies are shared');
select pg_temp.check(public.get_shared_dive(repeat('0', 64)) is null, 'unknown token: null');
select pg_temp.check(public.get_shared_dive(upper(:'tok')) is null, 'token is case-exact');
select pg_temp.check(public.get_shared_dive(left(:'tok', 63)) is null, 'shorter token: null');
select pg_temp.check(public.get_shared_dive('%') is null and public.get_shared_dive('') is null and public.get_shared_dive(null) is null, 'patterns / empty / null: null');
do $$ begin
    perform 1 from public.log_entries;
    raise exception 'FAILED: anon could read log_entries';
exception when insufficient_privilege then raise notice 'ok: anon cannot read log_entries';
end $$;

-- Storage without the header: nothing.
select pg_temp.check((select count(*) from storage.objects) = 0, 'anon without header sees no objects');
-- With a wrong / malformed header: nothing.
select set_config('request.headers', json_build_object('x-decotrail-share', repeat('0', 64))::text, false);
select pg_temp.check((select count(*) from storage.objects) = 0, 'anon with a wrong token sees no objects');
select set_config('request.headers', 'not json', false);
do $$ begin
    perform count(*) from storage.objects;
    raise notice 'ok: malformed headers do not grant anything';
exception when others then raise notice 'ok: malformed headers raise (no access)';
end $$;
-- With the token: exactly that dive's photo and the author's current avatar.
select set_config('request.headers', json_build_object('x-decotrail-share', :'tok')::text, false);
select pg_temp.check((select array_agg(name order by name) from storage.objects) =
    array[:'C' || '/4c000000-0000-0000-0000-000000000001/c1.jpg', :'C' || '/avatar-1.jpg'], 'token header: only that photo and avatar');
reset role;

-- ---- A logged-in member uses the same RPC; members' storage policies still apply as before ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select set_config('request.headers', '{}', false);
select pg_temp.check(public.get_shared_dive(:'tok') #>> '{entry,id}' = :'E1', 'member can open a share link too');
reset role;

-- ---- share_location on: coordinates appear ----
update public.log_entries set share_location = true where id = :'E1';
set role anon;
select pg_temp.check(public.get_shared_dive(:'tok') #>> '{site,lat}' = '43.5', 'site coordinates with share_location');
reset role;

-- ---- A banned owner's link stops working ----
update auth.users set banned_until = now() + interval '1 day' where id = :'C';
set role anon;
select pg_temp.check(public.get_shared_dive(:'tok') is null, 'banned owner: link does not work');
select set_config('request.headers', json_build_object('x-decotrail-share', :'tok')::text, false);
select pg_temp.check((select count(*) from storage.objects) = 0, 'banned owner: no objects');
reset role;
update auth.users set banned_until = null where id = :'C';

-- ---- Media pointing at another owner's path is not listed ----
insert into public.media (id, owner, entry_id, kind, path) values
    ('5c000000-0000-0000-0000-000000000009', :'C', :'E1', 'photo', :'A' || '/40000000-0000-0000-0000-000000000001/p1.jpg');
set role anon;
select pg_temp.check(public.get_shared_dive(:'tok')::text !~ '00000000000a/', 'foreign media path is not echoed');
reset role;

-- ---- Revoke: the old token stops working at once, for the RPC and the storage ----
update public.log_entries set visibility = 'members' where id = :'E1';
set role anon;
select pg_temp.check(public.get_shared_dive(:'tok') is null, 'revoked token: null');
select set_config('request.headers', json_build_object('x-decotrail-share', :'tok')::text, false);
select pg_temp.check((select count(*) from storage.objects) = 0, 'revoked token: no objects');
reset role;
