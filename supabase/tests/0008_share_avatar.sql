-- Assertions for 0008_share_avatar_fix.sql: the author key is stable, short, and not the owner id.
\set C '00000000-0000-0000-0000-00000000000c'
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
set client_min_messages = notice;
select share_token as tok from public.log_entries where visibility = 'link' and owner = :'C' limit 1 \gset
select public.get_shared_dive(:'tok') as j \gset
select pg_temp.check((:'j')::jsonb #>> '{author,author_key}' ~ '^[0-9a-f]{12}$', 'author_key is 12 hex');
select pg_temp.check(position((:'j')::jsonb #>> '{author,author_key}' in :'C') = 0 and (:'j')::jsonb #>> '{author,author_key}' <> left(:'C', 12), 'author_key does not reveal the owner id');
select pg_temp.check((:'j')::jsonb #>> '{author,display_name}' = 'Cyril', 'rest of the payload intact');
