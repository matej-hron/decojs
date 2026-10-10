-- Assertions for 0006_sites_description.sql, on the data of 0004_rls.sql and 0005_share.sql.
-- A owns 40..01 (members, Secret Cove, no share_location), 40..02 (private), 40..03 (link, Open Reef, share_location).
-- B is another member. C owns E1 at Shared Wall. Any failed check raises and stops psql (ON_ERROR_STOP).
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set E1 '4c000000-0000-0000-0000-000000000001'

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
set client_min_messages = notice;

-- 0004_rls.sql leaves B banned; B is an ordinary member here.
update auth.users set banned_until = null, is_anonymous = false, deleted_at = null where id = :'B';

-- ---- Constraints (as superuser) ----
do $$ begin
    update public.sites set url = 'http://example.com/x' where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: bad url accepted: %', 'http://example.com/x';
exception when check_violation then raise notice 'ok: bad url rejected';
end $$;
do $$ begin
    update public.sites set url = 'https://example.com/a b' where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: bad url accepted: %', 'https://example.com/a b';
exception when check_violation then raise notice 'ok: bad url rejected';
end $$;
do $$ begin
    update public.sites set url = 'https://example.com/' || repeat('x', 500) where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: bad url accepted: %', 'https://example.com/' || repeat('x', 500);
exception when check_violation then raise notice 'ok: bad url rejected';
end $$;
do $$ begin
    update public.sites set url = 'https://example.com/' || chr(1) where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: bad url accepted: %', 'https://example.com/' || chr(1);
exception when check_violation then raise notice 'ok: bad url rejected';
end $$;
do $$ begin
    update public.sites set url = 'https://example.com/' || chr(8238) where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: bad url accepted: %', 'https://example.com/' || chr(8238);
exception when check_violation then raise notice 'ok: bad url rejected';
end $$;
do $$ begin
    update public.sites set url = 'https://example.com/' || chr(160) where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: bad url accepted: %', 'https://example.com/' || chr(160);
exception when check_violation then raise notice 'ok: bad url rejected';
end $$;
do $$ begin
    update public.sites set url = 'https://example.com/"><script>' where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: bad url accepted: %', 'https://example.com/"><script>';
exception when check_violation then raise notice 'ok: bad url rejected';
end $$;
do $$ begin
    update public.sites set url = 'https:///x' where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: bad url accepted: %', 'https:///x';
exception when check_violation then raise notice 'ok: bad url rejected';
end $$;
do $$ begin
    update public.sites set url = 'HTTPS://example.com/' where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: bad url accepted: %', 'HTTPS://example.com/';
exception when check_violation then raise notice 'ok: bad url rejected';
end $$;
do $$ begin
    update public.log_entries set description = '   ' where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: blank description accepted';
exception when check_violation then raise notice 'ok: blank description rejected';
end $$;
do $$ begin
    update public.log_entries set description = repeat('x', 4001) where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: overlong description accepted';
exception when check_violation then raise notice 'ok: overlong description rejected';
end $$;

update public.sites set url = 'https://www.example.cz/lokality/lom-ho%C5%99ice?id=12&x=(1)#mapa' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.check(true, 'a percent-encoded url with query and fragment is accepted');
update public.sites set url = 'https://dive.example/secret-cove' where id = '20000000-0000-0000-0000-000000000001';
update public.sites set url = 'https://dive.example/open-reef' where id = '20000000-0000-0000-0000-000000000002';
update public.sites set url = 'https://dive.example/shared-wall' where id = '2c000000-0000-0000-0000-000000000001';
update public.log_entries set description = 'A-DESC-1' where id = '40000000-0000-0000-0000-000000000001';
update public.log_entries set description = 'A-DESC-PRIVATE' where id = '40000000-0000-0000-0000-000000000002';
update public.log_entries set description = 'A-DESC-3' where id = '40000000-0000-0000-0000-000000000003';
update public.log_entries set description = 'C-DESC', visibility = 'link', share_location = false where id = :'E1';

-- ---- Grants and shape ----
select pg_temp.check(not has_function_privilege('anon', 'public.community_entries(uuid, uuid, integer, integer)', 'execute'), 'anon cannot call community_entries');
select pg_temp.check(has_function_privilege('authenticated', 'public.community_entries(uuid, uuid, integer, integer)', 'execute'), 'members can call community_entries');
select pg_temp.check(has_function_privilege('anon', 'public.get_shared_dive(text)', 'execute'), 'anon can still call get_shared_dive');
select pg_temp.check((select array_agg(a::text order by a::text) from pg_proc, unnest(proacl) a
    where oid = 'public.community_entries(uuid, uuid, integer, integer)'::regprocedure and a::text !~ '^(postgres|service_role|supabase_admin)=')
    = array['authenticated=X/postgres'], 'community_entries: execute only for authenticated (plus admin roles)');
set role anon;
do $$ begin
    perform public.community_entries();
    raise exception 'FAILED: anon called community_entries';
exception when insufficient_privilege then raise notice 'ok: anon calling community_entries is refused';
end $$;
reset role;
select pg_temp.check((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
    where oid = 'public.community_entries(uuid, uuid, integer, integer)'::regprocedure), 'community_entries: security definer, empty search_path');
select pg_temp.check((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
    where oid = 'public.get_shared_dive(text)'::regprocedure), 'get_shared_dive: security definer, empty search_path');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'community_%'
      and pg_get_function_result(p.oid) ~* '\m(notes|share_token|email)\M'), 'no community function returns notes/share_token/email');

-- ---- B reads A's dives ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.check((select description from public.community_entries(:'A', '40000000-0000-0000-0000-000000000001', 1, 0)) = 'A-DESC-1', 'member sees the description');
select pg_temp.check((select site_url from public.community_entries(:'A', '40000000-0000-0000-0000-000000000001', 1, 0)) is null, 'no site url without share_location');
select pg_temp.check((select site_url from public.community_entries(:'A', '40000000-0000-0000-0000-000000000003', 1, 0)) = 'https://dive.example/open-reef', 'site url with share_location');
select pg_temp.check(not exists (select 1 from public.community_entries(:'A', null, 100, 0) where description = 'A-DESC-PRIVATE'), 'private dive and its description stay hidden');
reset role;
select count(*) as visible_a from public.log_entries where owner = :'A' and visibility in ('members', 'link') \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.check((select count(*) from public.community_entries(:'A', null, 100, 0)) = :visible_a, 'B sees exactly A''s members/link dives');
select pg_temp.check((select bool_and(log_number is null) from public.community_entries(:'A', null, 100, 0)), 'others'' log numbers still hidden');
select pg_temp.check(not exists (select 1 from public.community_entries(null, null, 100, 0) c where c::text ~ 'SECRET|NOTE'), 'no notes in any row');
reset role;

-- ---- A reads their own dives ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.check((select site_url from public.community_entries(:'A', '40000000-0000-0000-0000-000000000001', 1, 0)) = 'https://dive.example/secret-cove', 'owner sees their own site url');
select pg_temp.check((select description from public.community_entries(:'A', '40000000-0000-0000-0000-000000000002', 1, 0)) = 'A-DESC-PRIVATE', 'owner sees their private dive''s description');
-- RLS on the tables is unchanged: A cannot write B's site link or description.
update public.log_entries set description = 'HACK' where owner = :'B';
reset role;
select pg_temp.check(not exists (select 1 from public.log_entries where description = 'HACK'), 'cannot write another member''s description');

-- ---- Not logged in ----
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select count(*) from public.community_entries(null, null, 100, 0)) = 0, 'no user id: nothing');
reset role;

-- ---- Share page ----
select share_token as tok from public.log_entries where id = :'E1' \gset
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select public.get_shared_dive(:'tok') as j \gset
select pg_temp.check((:'j')::jsonb #>> '{entry,description}' = 'C-DESC', 'share page has the description');
select pg_temp.check((:'j')::jsonb #> '{site,url}' = 'null'::jsonb, 'share page: no site url without share_location');
select pg_temp.check((:'j')::jsonb::text !~ 'SECRET|NOTE', 'share page: still no notes');
select pg_temp.check(not ((:'j')::jsonb -> 'entry') ?| array['notes', 'share_token', 'owner', 'log_number', 'visibility'], 'share page: entry keys unchanged');
reset role;
update public.log_entries set share_location = true where id = :'E1';
set role anon;
select pg_temp.check(public.get_shared_dive(:'tok') #>> '{site,url}' = 'https://dive.example/shared-wall', 'share page: site url with share_location');
select pg_temp.check(public.get_shared_dive(repeat('0', 64)) is null, 'unknown token: null');
reset role;

-- ---- Old guarantees still hold with the new get_shared_dive ----
update auth.users set banned_until = now() + interval '1 day' where id = :'C';
set role anon;
select pg_temp.check(public.get_shared_dive(:'tok') is null, 'banned owner: link does not work');
reset role;
update auth.users set banned_until = null where id = :'C';
update public.log_entries set visibility = 'members' where id = :'E1';
set role anon;
select pg_temp.check(public.get_shared_dive(:'tok') is null, 'dive no longer link: null');
reset role;
