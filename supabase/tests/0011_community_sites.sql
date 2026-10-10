-- Assertions for 0011_community_sites.sql. Own users, sites and dives: A creates the sites, B and C are members,
-- X is an anonymous sign-in, Z is banned. Any failed check raises and stops psql (ON_ERROR_STOP).
\set A '00000000-0000-0000-0000-0000000000e1'
\set B '00000000-0000-0000-0000-0000000000e2'
\set C '00000000-0000-0000-0000-0000000000e3'
\set X '00000000-0000-0000-0000-0000000000e4'
\set Z '00000000-0000-0000-0000-0000000000e5'
-- Sites: SM = A's members site, SP = A's private site, SA2/SA3 = A's members sites (own dive only / unused),
-- SB = B's duplicate of SM, SBP = B's private site, ZS = Z's site.
\set SM '5e000000-0000-0000-0000-000000000001'
\set SP '5e000000-0000-0000-0000-000000000002'
\set SB '5e000000-0000-0000-0000-000000000003'
\set SBP '5e000000-0000-0000-0000-000000000004'
\set SA2 '5e000000-0000-0000-0000-000000000005'
\set SA3 '5e000000-0000-0000-0000-000000000006'
\set ZS '5e000000-0000-0000-0000-000000000007'
\set ST '5e000000-0000-0000-0000-000000000008'
-- Dives.
\set A1 '6e000000-0000-0000-0000-000000000001'
\set APRIV '6e000000-0000-0000-0000-000000000002'
\set A3 '6e000000-0000-0000-0000-000000000003'
\set B1 '6e000000-0000-0000-0000-000000000004'
\set B2 '6e000000-0000-0000-0000-000000000005'
\set C1 '6e000000-0000-0000-0000-000000000006'
\set B3 '6e000000-0000-0000-0000-000000000007'
\set A4 '6e000000-0000-0000-0000-000000000008'
\set BX '6e000000-0000-0000-0000-000000000009'
\set C2 '6e000000-0000-0000-0000-00000000000a'
\set BT1 '6e000000-0000-0000-0000-00000000000b'
\set BT2 '6e000000-0000-0000-0000-00000000000c'

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
-- The SQLSTATE a statement fails with (its changes rolled back as a subtransaction), or null when it succeeds.
create function pg_temp.err(stmt text) returns text language plpgsql as $$
begin
    execute stmt;
    return null;
exception when others then
    return sqlstate;
end $$;
grant execute on function pg_temp.err(text) to anon, authenticated;
-- Rows a statement changed (0 = silently filtered by RLS).
create function pg_temp.affected(stmt text) returns integer language plpgsql as $$
declare n integer;
begin
    execute stmt;
    get diagnostics n = row_count;
    return n;
end $$;
grant execute on function pg_temp.affected(text) to anon, authenticated;
set client_min_messages = notice;

-- ---- Schema, backfill and grants (before this file adds its own sites) ----
select pg_temp.check((select count(*) > 0 and bool_and(visibility = 'members') from public.sites), 'existing sites became members');
select pg_temp.check((select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'sites' and column_name = 'visibility') = '''members''::text', 'visibility defaults to members');
select pg_temp.check((select count(*) from pg_constraint where conname = 'sites_visibility_check') = 1, 'one visibility constraint after two runs');
select pg_temp.check((select count(*) from pg_trigger where tgname in ('log_entries_site_check', 'sites_guard')) = 2, 'one of each trigger after two runs');
select pg_temp.check(exists (select 1 from pg_indexes where indexname = 'log_entries_site_idx'), 'site index exists');
select pg_temp.check(pg_temp.err(format('update public.sites set visibility = %L where id = (select id from public.sites limit 1)', 'public')) = '23514', 'unknown site visibility refused');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('community_sites', 'site_stats', 'site_visits', 'merge_site', 'log_entries_site_check', 'sites_guard',
                        'community_entries', 'social_inbox', 'community_members')
      and has_function_privilege('anon', p.oid, 'execute')), 'anon cannot execute the member functions');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('log_entries_site_check', 'sites_guard')
      and has_function_privilege('authenticated', p.oid, 'execute')), 'members cannot call the trigger functions');
select pg_temp.check(has_function_privilege('authenticated', 'public.community_sites()', 'execute')
    and has_function_privilege('authenticated', 'public.site_stats(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.site_visits(uuid, integer, integer)', 'execute')
    and has_function_privilege('authenticated', 'public.merge_site(uuid, uuid)', 'execute'), 'members can call the site functions');
select pg_temp.check(has_function_privilege('anon', 'public.get_shared_dive(text)', 'execute')
    and has_function_privilege('anon', 'public.get_shared_dive_area(text)', 'execute'), 'anon still reads shared dives');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('community_sites', 'site_visits')
      and pg_get_function_result(p.oid) ~* '\m(notes|share_token|log_number)\M'), 'site functions return no notes/share_token/log_number');

-- ---- Data ----
insert into auth.users (id, is_anonymous, banned_until) values
    (:'A', false, null), (:'B', false, null), (:'C', false, null), (:'X', true, null), (:'Z', false, now() + interval '1 day');
insert into public.profiles (id, display_name) values (:'A', 'Anna'), (:'B', 'Boris'), (:'C', 'Cyril');
insert into public.sites (id, owner, name, lat, lon, notes, visibility) values
    (:'SM', :'A', 'Barbora CMAS', 50.11, 14.22, 'A-SECRET-SITE-NOTE', 'members'),
    (:'SP', :'A', 'Secret Spring', 49.33, 16.44, 'A-SECRET-SITE-NOTE', 'private'),
    (:'SA2', :'A', 'Only Anna', null, null, null, 'members'),
    (:'SA3', :'A', 'Unused', null, null, null, 'members'),
    (:'SB', :'B', 'Barbora duplicate', 50.11, 14.22, 'B-SECRET-SITE-NOTE', 'members'),
    (:'SBP', :'B', 'Boris private', null, null, null, 'private'),
    (:'ZS', :'Z', 'Banned site', null, null, null, 'members'),
    (:'ST', :'A', 'Hot Spring', null, null, null, 'members');
update public.sites set url = 'https://example.com/barbora' where id = :'SM';
insert into public.log_entries (id, owner, log_number, dive_date, entry_time, notes, site_id, visibility, share_location,
                                water_temp_c, vis_shallow_m, vis_deep_m, details) values
    (:'A1', :'A', 1, '2026-07-10', '09:00', 'A-SECRET-NOTE', :'SM', 'members', true, 20, 8, 5, '{"surfaceTempC": 24}'),
    -- Extreme values on a private dive: they must never reach anyone else's stats.
    (:'APRIV', :'A', 2, '2026-12-01', '09:00', 'A-SECRET-NOTE', :'SM', 'private', true, -5, 99, 99, '{"surfaceTempC": 88}'),
    (:'A3', :'A', 3, '2026-06-01', '09:00', 'A-SECRET-NOTE', :'SP', 'link', true, 15, null, null, '{}'),
    (:'A4', :'A', 4, '2026-06-02', '09:00', 'A-SECRET-NOTE', :'SA2', 'members', true, null, null, null, '{}');

-- B attaches A's members site to own dives (through RLS, as B).
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
insert into public.log_entries (id, log_number, dive_date, entry_time, notes, site_id, visibility, share_location,
                                water_temp_c, vis_shallow_m, vis_deep_m, details) values
    (:'B1', 1, '2026-08-15', '10:00', 'B-SECRET-NOTE', :'SM', 'link', true, 18, 10, 6, '{"surfaceTempC": 22}'),
    (:'B2', 2, '2026-08-20', '10:00', 'B-SECRET-NOTE', :'SM', 'members', true, null, null, null, '{"surfaceTempC": "abc"}'),
    (:'B3', 3, '2026-05-02', '10:00', 'B-SECRET-NOTE', :'SB', 'members', true, null, null, null, '{}');
select pg_temp.check((select owner from public.log_entries where id = :'B1') = :'B', 'B attached A''s members site to own dive');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'C', false);
insert into public.log_entries (id, log_number, dive_date, site_id, visibility, share_location) values
    (:'C1', 1, '2026-05-01', :'SB', 'link', true),
    (:'C2', 2, '2026-05-03', :'SB', 'private', true);
reset role;
-- Surface temperature outside -5..45 °C is a typo, not data.
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
insert into public.log_entries (id, log_number, dive_date, site_id, visibility, water_temp_c, details) values
    (:'BT1', 5, '2026-03-01', :'ST', 'members', 10, '{"surfaceTempC": 60}'),
    (:'BT2', 6, '2026-03-02', :'ST', 'members', 12, '{"surfaceTempC": -5}');
reset role;
select share_token as tb1 from public.log_entries where id = :'B1' \gset
select share_token as ta3 from public.log_entries where id = :'A3' \gset
select share_token as tc1 from public.log_entries where id = :'C1' \gset

-- ---- B: the directory ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.check(not exists (select 1 from public.community_sites() where id = :'SP'), 'B does not see A''s private site in the directory');
select pg_temp.check(not exists (select 1 from public.community_sites() where name = 'Secret Spring'), 'nor its name');
select pg_temp.check((select count(*) from public.community_sites() where id in (:'SM', :'SA2', :'SA3', :'SB', :'SBP')) = 5, 'B sees members sites and own sites');
select pg_temp.check((select visits = 3 and last_visit = '2026-08-20' and vis_min = 5 and vis_max = 10 and temp_min = 18 and temp_max = 24
    and used_by_others is null and lat = 50.11 and owner = :'A' and visibility = 'members'
    from public.community_sites() where id = :'SM'), 'SM row: visible dives only (no private extremes), used_by_others null for others'' sites');
select pg_temp.check((select used_by_others from public.community_sites() where id = :'SB'), 'own site used by C: used_by_others true');
select pg_temp.check((select not used_by_others and visits = 0 from public.community_sites() where id = :'SBP'), 'own unused site: used_by_others false, 0 visits');
select pg_temp.check((select string_agg(name, '|' order by name, id) from public.community_sites() where id in (:'SM', :'SB', :'SA3'))
    = 'Barbora CMAS|Barbora duplicate|Unused', 'directory ordered by name');

-- ---- B: stats of SM ----
select public.site_stats(:'SM') as st \gset
select pg_temp.check((:'st'::jsonb ->> 'visits')::int = 3 and (:'st'::jsonb ->> 'divers')::int = 2
    and :'st'::jsonb ->> 'first_visit' = '2026-07-10' and :'st'::jsonb ->> 'last_visit' = '2026-08-20', 'site_stats visits/divers/first/last exclude the private dive');
select pg_temp.check(:'st'::jsonb -> 'temp' -> 'bottom' = '{"n": 2, "avg": 19.0, "max": 20, "min": 18, "best_date": "2026-07-10", "latest": 18, "latest_date": "2026-08-15"}'::jsonb,
    'bottom temperature S');
select pg_temp.check(:'st'::jsonb -> 'temp' -> 'surface' = '{"n": 2, "avg": 23.0, "max": 24, "min": 22, "best_date": "2026-07-10", "latest": 22, "latest_date": "2026-08-15"}'::jsonb,
    'surface temperature S ignores "abc" and the private 88');
select pg_temp.check(:'st'::jsonb -> 'vis' -> 'shallow' = '{"n": 2, "avg": 9.0, "max": 10, "min": 8, "best_date": "2026-08-15", "latest": 10, "latest_date": "2026-08-15"}'::jsonb,
    'shallow visibility S');
select pg_temp.check((:'st'::jsonb -> 'vis' -> 'deep' ->> 'max')::numeric = 6, 'deep visibility max is not the private 99');
select pg_temp.check(:'st'::jsonb -> 'months' = '[
    {"month": 7, "n": 1, "bottom": {"avg": 20.0, "min": 20, "max": 20, "n": 1}, "surface": {"avg": 24.0, "min": 24, "max": 24, "n": 1}, "vis": {"avg": 6.5, "n": 2}},
    {"month": 8, "n": 2, "bottom": {"avg": 18.0, "min": 18, "max": 18, "n": 1}, "surface": {"avg": 22.0, "min": 22, "max": 22, "n": 1}, "vis": {"avg": 8.0, "n": 2}}
    ]'::jsonb, 'months: only visible dives, no December from the private dive');
select pg_temp.check(:'st' !~ '(99|88|-5|SECRET)', 'no private values or notes anywhere in the stats');
select pg_temp.check(public.site_stats(:'SP') is null, 'site_stats of A''s private site: null for B');
select pg_temp.check(public.site_stats(gen_random_uuid()) is null, 'site_stats of an unknown site: null');
select pg_temp.check(public.site_stats(:'SBP') = '{"visits": 0, "divers": 0, "first_visit": null, "last_visit": null,
    "vis": {"shallow": null, "deep": null}, "temp": {"bottom": null, "surface": null}, "months": []}'::jsonb, 'site_stats of a site without dives');

-- ---- B: visits ----
select pg_temp.check(not exists (select 1 from public.site_visits(:'SP')), 'site_visits of A''s private site: none for B');
select pg_temp.check((select string_agg(id::text, ',') from public.site_visits(:'SM')) = concat_ws(',', :'B2', :'B1', :'A1'), 'site_visits: visible dives, newest first');
select pg_temp.check((select surface_temp_c is null from public.site_visits(:'SM') where id = :'B2')
    and (select surface_temp_c = 22 and water_temp_c = 18 and visibility = 'link' from public.site_visits(:'SM') where id = :'B1'), 'site_visits surface temperature only when numeric');
select pg_temp.check((select count(*) from public.site_visits(:'SM', 0)) = 1 and (select count(*) from public.site_visits(:'SM', 1000)) = 3
    and (select id from public.site_visits(:'SM', 1, 2)) = :'A1' and (select count(*) from public.site_visits(:'SM', 50, -5)) = 3, 'site_visits limit/offset clamped');

-- ---- B: no notes, no private site name, anywhere ----
select pg_temp.check(coalesce((select string_agg(row_to_json(x)::text, '') from public.community_sites() x), '')
    || coalesce((select string_agg(row_to_json(x)::text, '') from public.site_visits(:'SM') x), '')
    || coalesce((select string_agg(row_to_json(x)::text, '') from public.community_entries() x), '')
    || coalesce((select string_agg(row_to_json(x)::text, '') from public.community_members() x), '')
    || coalesce((select string_agg(row_to_json(x)::text, '') from public.social_inbox() x), '') !~ '(A-SECRET|Secret Spring)',
    'B reads neither A''s notes nor the private site''s name through any function');
select pg_temp.check((select site_id is null and site_name is null from public.community_entries(null, :'A3')), 'community_entries: A''s dive at a private site shows no site to B');
select pg_temp.check((select site_name = 'Barbora CMAS' from public.community_entries(null, :'B1')), 'community_entries: own dive at another member''s site shows its name');
select pg_temp.check(not ((select 'Secret Spring' = any (top_sites) from public.community_members(:'A'))), 'community_members: A''s private site not in top sites for B');

-- ---- Hardening ----
select pg_temp.check((select temp_min = -5 and temp_max = 12 from public.community_sites() where id = :'ST'), 'community_sites ignores a surface temperature of 60, keeps -5');
select pg_temp.check(public.site_stats(:'ST') -> 'temp' -> 'surface' ->> 'n' = '1' and public.site_stats(:'ST') -> 'temp' -> 'surface' ->> 'max' = '-5'
    and public.site_stats(:'ST') -> 'months' -> 0 -> 'surface' ->> 'n' = '1', 'site_stats ignores a surface temperature of 60');
select pg_temp.check((select surface_temp_c is null from public.site_visits(:'ST') where id = :'BT1')
    and (select surface_temp_c = -5 from public.site_visits(:'ST') where id = :'BT2'), 'site_visits: out-of-range surface temperature is null');
select pg_temp.check(pg_temp.err(format('insert into public.log_entries (owner, log_number, dive_date, site_id) values (%L, 99, %L, %L)', :'A', '2026-01-01', :'SP')) = 'DTS03',
    'spoofed owner + A''s private site: DTS03 (no existence oracle)');
select pg_temp.check(pg_temp.err(format('insert into public.log_entries (owner, log_number, dive_date, site_id) values (%L, 99, %L, %L)', :'A', '2026-01-01', gen_random_uuid())) = 'DTS03',
    'spoofed owner + unknown site: the same DTS03');
select pg_temp.check(pg_temp.err(format('update public.log_entries set owner = %L, site_id = %L where id = %L', :'A', :'SP', :'B2')) = 'DTS03',
    'handing a dive over with A''s private site: DTS03');
select pg_temp.check(pg_temp.err(format('insert into public.sites (name) values (%L)', '   ')) = '23514', 'blank site name refused');
select pg_temp.check(pg_temp.err(format('insert into public.sites (name) values (%L)', repeat('x', 121))) = '23514', '121-character site name refused');
select pg_temp.check(pg_temp.err(format('insert into public.sites (name, lat, lon) values (%L, 91, 0)', 'x')) = '23514', 'latitude 91 refused');
select pg_temp.check(pg_temp.err(format('insert into public.sites (name, lat, lon) values (%L, 0, -181)', 'x')) = '23514', 'longitude -181 refused');
select pg_temp.check(pg_temp.err(format('insert into public.sites (name, lat, lon) values (%L, -90, 180)', repeat('x', 120))) is null, 'limits themselves accepted');
delete from public.sites where name = repeat('x', 120);
reset role;
select pg_temp.check(pg_get_functiondef('public.log_entries_site_check()'::regprocedure) ~ 'for share'
    and pg_get_functiondef('public.merge_site(uuid, uuid)'::regprocedure) ~ 'for share'
    and pg_get_functiondef('public.merge_site(uuid, uuid)'::regprocedure) ~ 'for update', 'site rows locked against a concurrent switch to private');
set role authenticated;
select set_config('request.jwt.claim.sub', :'C', false);
select pg_temp.check((select site_url is null and site_name = 'Barbora CMAS' from public.community_entries(null, :'B1')), 'no site link on another member''s dive (name stays)');
select pg_temp.check((select site_url = 'https://example.com/barbora' from public.community_entries(null, :'A1')), 'the creator''s link on the creator''s own dive');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check(public.get_shared_dive(:'tb1') -> 'site' ? 'url' and public.get_shared_dive(:'tb1') -> 'site' ->> 'url' is null, 'share page: no site link on another member''s dive');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);

-- ---- B cannot change A's sites ----
select pg_temp.check(pg_temp.affected(format('update public.sites set name = %L where id = %L', 'Hijack', :'SM')) = 0, 'B cannot rename A''s site');
select pg_temp.check(pg_temp.affected(format('update public.sites set name = %L where id = %L', 'Hijack', :'SP')) = 0, 'B cannot touch A''s private site');
select pg_temp.check(pg_temp.affected(format('delete from public.sites where id = %L', :'SM')) = 0, 'B cannot delete A''s site');
select pg_temp.check(not exists (select 1 from public.sites where owner = :'A'), 'B cannot read A''s sites table rows');
-- ---- Attaching ----
select pg_temp.check(pg_temp.err(format('update public.log_entries set site_id = %L where id = %L', :'SP', :'B2')) = 'DTS03', 'B cannot attach A''s private site (update)');
select pg_temp.check(pg_temp.err(format('insert into public.log_entries (log_number, dive_date, site_id) values (9, %L, %L)', '2026-01-01', :'SP')) = 'DTS03', 'B cannot attach A''s private site (insert)');
select pg_temp.check(pg_temp.err(format('insert into public.log_entries (log_number, dive_date, site_id) values (9, %L, %L)', '2026-01-01', gen_random_uuid())) is not null, 'B cannot attach a made-up site id');
select pg_temp.check(pg_temp.err(format('update public.log_entries set notes = %L where id = %L', 'still fine', :'B2')) is null, 'updating a dive without changing its site passes');
-- ---- Merge refused ----
select pg_temp.check(pg_temp.err(format('select public.merge_site(%L, %L)', :'SM', :'SB')) = '42501', 'merge_site by a non-owner refused');
select pg_temp.check(pg_temp.err(format('select public.merge_site(%L, %L)', :'SB', :'SP')) = '42501', 'merge_site into an invisible site refused');
select pg_temp.check(pg_temp.err(format('select public.merge_site(%L, %L)', :'SB', :'SB')) = '42501', 'merge_site into itself refused');
select pg_temp.check(pg_temp.err(format('select public.merge_site(%L, %L)', :'SB', gen_random_uuid())) = '42501', 'merge_site into an unknown site refused');
reset role;

-- ---- C sees B's dive with A's site ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'C', false);
select pg_temp.check((select site_name = 'Barbora CMAS' and site_lat = 50.11 from public.community_entries(null, :'B1')), 'C sees B''s dive at A''s members site, with its name');
select pg_temp.check((select visits from public.community_sites() where id = :'SM') = 3, 'C counts the same visible dives');
select pg_temp.check((select site_name is null from public.community_entries(null, :'A3')), 'C does not see the private site on A''s dive');
reset role;

-- ---- Anon share page ----
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check(public.get_shared_dive(:'tb1') -> 'site' ->> 'name' = 'Barbora CMAS', 'anon share page of B''s dive names A''s members site');
select pg_temp.check(public.get_shared_dive_area(:'tb1') ->> 'lat' = '50.11', 'anon share map of B''s dive has the position');
select pg_temp.check(public.get_shared_dive(:'ta3') ->> 'site' is null and public.get_shared_dive(:'ta3') is not null, 'anon share page of A''s dive at a private site: no site');
select pg_temp.check(public.get_shared_dive_area(:'ta3') is null, 'anon share map of A''s dive at a private site: none');
select pg_temp.check(pg_temp.err('select * from public.community_sites()') = '42501', 'anon cannot call community_sites');
select pg_temp.check(pg_temp.err(format('select public.site_stats(%L)', :'SM')) = '42501', 'anon cannot call site_stats');
select pg_temp.check(pg_temp.err(format('select * from public.site_visits(%L)', :'SM')) = '42501', 'anon cannot call site_visits');
select pg_temp.check(pg_temp.err(format('select public.merge_site(%L, %L)', :'SB', :'SM')) = '42501', 'anon cannot call merge_site');
reset role;

-- ---- Legacy data: B's dive pointing at A's private site (planted past the trigger) ----
alter table public.log_entries disable trigger log_entries_site_check;
insert into public.log_entries (id, owner, log_number, dive_date, site_id, visibility, share_location, water_temp_c)
    values (:'BX', :'B', 4, '2026-04-01', :'SP', 'link', true, 77);
alter table public.log_entries enable trigger log_entries_site_check;
insert into public.kudos (entry_id, member_id) values (:'BX', :'C');
select share_token as tbx from public.log_entries where id = :'BX' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.check((select site_name is null from public.social_inbox() where entry_id = :'BX'), 'social_inbox: no private site name of another member');
select pg_temp.check((select site_name is null from public.community_entries(null, :'BX')), 'community_entries: own dive at another member''s private site shows no site');
select pg_temp.check(not ((select 'Secret Spring' = any (top_sites) from public.community_members(:'B'))), 'community_members: no private site of another member');
select pg_temp.check(public.site_stats(:'SP') is null and not exists (select 1 from public.site_visits(:'SP')), 'still no stats of the private site for B');
reset role;
set role anon;
select pg_temp.check(public.get_shared_dive(:'tbx') ->> 'site' is null and public.get_shared_dive_area(:'tbx') is null, 'share page: no private site of another member');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.check((public.site_stats(:'SP') ->> 'visits')::int = 1 and public.site_stats(:'SP')::text !~ '77', 'A''s private site stats: only A''s own dive, not the planted one');
select pg_temp.check((select 'Secret Spring' = any (top_sites) from public.community_members(:'A')), 'A sees own private site in own top sites');
select pg_temp.check((select site_name = 'Secret Spring' from public.community_entries(null, :'A3')), 'A sees own private site on own dive');
reset role;
delete from public.log_entries where id = :'BX';

-- ---- Owner A ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.check((select used_by_others and visits = 4 and temp_min = -5 from public.community_sites() where id = :'SM'), 'A: own site used by others, own private dive counted for A');
select pg_temp.check((select visibility = 'private' and used_by_others = false from public.community_sites() where id = :'SP'), 'A sees own private site');
select pg_temp.check(pg_temp.err(format('update public.sites set visibility = %L where id = %L', 'private', :'SM')) = 'DTS01', 'A cannot make a site private while B dives there');
select pg_temp.check(pg_temp.err(format('delete from public.sites where id = %L', :'SM')) = 'DTS02', 'A cannot delete a site others use');
select pg_temp.check(pg_temp.err(format('delete from public.sites where id = %L', :'SA2')) = 'DTS02', 'A cannot delete a site own dives use');
select pg_temp.check(pg_temp.affected(format('update public.sites set visibility = %L where id = %L', 'private', :'SA2')) = 1, 'A makes a site only A dives at private');
select pg_temp.check(pg_temp.affected(format('update public.sites set name = %L where id = %L', 'Barbora CMAS', :'SM')) = 1, 'A still edits a shared site');
select pg_temp.check(pg_temp.affected(format('delete from public.sites where id = %L', :'SA3')) = 1, 'A deletes an unused site');
select pg_temp.check(pg_temp.err(format('update public.sites set owner = %L where id = %L', :'B', :'SM')) = '42501', 'A cannot give a site away');
reset role;
select pg_temp.check(pg_temp.err(format('update public.sites set owner = %L where id = %L', :'B', :'SM')) = '42501', 'owner never changes, even for the superuser');
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.check(not exists (select 1 from public.community_sites() where id = :'SA2'), 'a site turned private leaves B''s directory');
reset role;

-- ---- Merge ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.check(pg_temp.err(format('select public.merge_site(%L, %L)', :'SB', :'SBP')) = 'DTS03', 'merge onto own private site with C''s dive refused');
reset role;
select pg_temp.check(exists (select 1 from public.sites where id = :'SB')
    and (select site_id from public.log_entries where id = :'C1') = :'SB'
    and (select site_id from public.log_entries where id = :'B3') = :'SB', 'failed merge rolled back');
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.check(public.merge_site(:'SB', :'SM') = 1, 'merge_site returns only the count of the caller''s own dives');
reset role;
select pg_temp.check(not exists (select 1 from public.sites where id = :'SB')
    and (select site_id from public.log_entries where id = :'C1') = :'SM'
    and (select site_id from public.log_entries where id = :'B3') = :'SM'
    and (select site_id from public.log_entries where id = :'C2') = :'SM', 'merged site deleted, all dives (also C''s private one) on the target');
set role anon;
select pg_temp.check(public.get_shared_dive(:'tc1') -> 'site' ->> 'name' = 'Barbora CMAS', 'C''s shared dive now names the merged site');
reset role;

-- ---- Non-members ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'X', false);
select pg_temp.check(not exists (select 1 from public.community_sites()), 'anonymous sign-in: empty directory');
select pg_temp.check(public.site_stats(:'SM') is null, 'anonymous sign-in: no stats');
select pg_temp.check(not exists (select 1 from public.site_visits(:'SM')), 'anonymous sign-in: no visits');
select set_config('request.jwt.claim.sub', :'Z', false);
select pg_temp.check(not exists (select 1 from public.community_sites()), 'banned user: empty directory');
select pg_temp.check(public.site_stats(:'SM') is null and public.site_stats(:'ZS') is null, 'banned user: no stats, not even of own site');
select pg_temp.check(not exists (select 1 from public.site_visits(:'SM')), 'banned user: no visits');
select pg_temp.check(pg_temp.err(format('select public.merge_site(%L, %L)', :'ZS', :'SM')) = '42501', 'banned user cannot merge own site');
reset role;

-- ---- Account deletion cascades past the delete guard ----
select pg_temp.check(pg_temp.err(format('delete from auth.users where id = %L', :'A')) is null, 'deleting A''s account passes');
select pg_temp.check(not exists (select 1 from public.sites where owner = :'A'), 'A''s sites are gone');
select pg_temp.check((select site_id is null from public.log_entries where id = :'B1')
    and (select site_id is null from public.log_entries where id = :'C1'), 'others'' dives keep going without a site');
