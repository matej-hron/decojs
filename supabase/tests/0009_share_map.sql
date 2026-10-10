-- Assertions for 0009_share_map.sql (runs after 0005_share.sql, which left E1 revoked).
\set C '00000000-0000-0000-0000-00000000000c'
\set E1 '4c000000-0000-0000-0000-000000000001'

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
set client_min_messages = notice;

-- ---- Default and backfill ----
select pg_temp.check((select count(*) from public.log_entries where share_location = false) = 0, 'backfill: every dive shows its exact location');
select pg_temp.check((select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'log_entries' and column_name = 'share_location') = 'true', 'share_location defaults to true');
insert into public.log_entries (id, owner, log_number, dive_date) values ('4c000000-0000-0000-0000-000000000019', :'C', 19, '2026-09-30');
select pg_temp.check((select share_location from public.log_entries where id = '4c000000-0000-0000-0000-000000000019'), 'a new dive without the field: exact location on');
insert into public.log_entries (id, owner, log_number, dive_date, share_location) values ('4c000000-0000-0000-0000-000000000020', :'C', 20, '2026-09-30', false);
select pg_temp.check(not (select share_location from public.log_entries where id = '4c000000-0000-0000-0000-000000000020'), 'an explicit false is kept');

-- ---- Grants ----
select pg_temp.check(has_function_privilege('anon', 'public.get_shared_dive_area(text)', 'execute'), 'anon can call get_shared_dive_area');
select pg_temp.check(has_function_privilege('authenticated', 'public.get_shared_dive_area(text)', 'execute'), 'members can call it too');

-- ---- Share E1 again; the site gets a precise position ----
update public.sites set lat = 43.512345, lon = 16.406789 where id = '2c000000-0000-0000-0000-000000000001';
update public.log_entries set visibility = 'link', share_location = false where id = :'E1';
select share_token as tok from public.log_entries where id = :'E1' \gset

set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check(public.get_shared_dive_area(:'tok') = '{"lat": 43.51, "lon": 16.41, "exact": false}'::jsonb, 'approximate area: rounded to 2 decimals');
select pg_temp.check(public.get_shared_dive(:'tok') #> '{site,lat}' = 'null'::jsonb, 'get_shared_dive still hides the exact position');
select pg_temp.check(public.get_shared_dive_area(repeat('0', 64)) is null, 'unknown token: null');
select pg_temp.check(public.get_shared_dive_area(upper(:'tok')) is null, 'token is case-exact');
select pg_temp.check(public.get_shared_dive_area('%') is null and public.get_shared_dive_area(null) is null, 'patterns / null: null');
reset role;

update public.log_entries set share_location = true where id = :'E1';
set role anon;
select pg_temp.check(public.get_shared_dive_area(:'tok') = '{"lat": 43.512345, "lon": 16.406789, "exact": true}'::jsonb, 'exact position with share_location');
reset role;

-- ---- Site without a position: no area ----
update public.sites set lat = null, lon = null where id = '2c000000-0000-0000-0000-000000000001';
set role anon;
select pg_temp.check(public.get_shared_dive_area(:'tok') is null, 'site without a position: null');
reset role;
update public.sites set lat = 43.512345, lon = 16.406789 where id = '2c000000-0000-0000-0000-000000000001';

-- ---- Banned owner, then revoked link ----
update auth.users set banned_until = now() + interval '1 day' where id = :'C';
set role anon;
select pg_temp.check(public.get_shared_dive_area(:'tok') is null, 'banned owner: null');
reset role;
update auth.users set banned_until = null where id = :'C';
update public.log_entries set visibility = 'members' where id = :'E1';
set role anon;
select pg_temp.check(public.get_shared_dive_area(:'tok') is null, 'revoked link: null');
reset role;
