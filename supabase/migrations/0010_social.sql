-- DecoTrail kudos and comments on dives (docs/superpowers/specs/2026-10-10-kudos-comments-design.md).
-- Run once in the Supabase SQL editor after 0004 (and 0005). Safe to run again.
--
-- Security model: the same rule as 0004 decides everything — a member may see a dive when it is their own or
-- its visibility is 'members' or 'link'. Kudos and comments of any other dive (a private one, or one that became
-- private later) are invisible: the read functions and the table policies both go through entry_visible().
-- Clients write the two tables directly; the policies pin the author to auth.uid(), the triggers keep the
-- server's timestamps, and an update can only change a comment's body (column grant). Accepted: the owner and
-- the author can still read (and delete) a comment through the table while comments are off — their own dive
-- and their own words; the app shows none (entry_comments). Toggling kudos re-notifies the owner at most once per toggle. Anonymous visitors get
-- nothing but the kudos count of a shared dive whose token they hold and the author's nickname (shared_dive_social). Notes never appear.

begin;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- The owner turns comments off per dive; existing comments are hidden while it is off.
alter table public.log_entries add column if not exists comments_enabled boolean not null default true;
-- A nickname ("Luis"), shown instead of the name wherever members appear; trimmed, 1–40 characters.
alter table public.profiles add column if not exists nickname text;
alter table public.profiles drop constraint if exists profiles_nickname_check;
alter table public.profiles add constraint profiles_nickname_check
    check (nickname is null or (char_length(nickname) between 1 and 40 and nickname = btrim(nickname)));

-- When each member last opened "New for you". Its own table, not a profiles column: every member can read
-- profiles, and this would be a "last seen" tracker. Only the definer functions below touch it.
create table if not exists public.social_seen (
    member_id uuid primary key references auth.users (id) on delete cascade,
    seen_at timestamptz not null
);
alter table public.social_seen enable row level security;
revoke all on table public.social_seen from public, anon, authenticated;
grant all on table public.social_seen to service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.kudos (
    entry_id uuid not null references public.log_entries (id) on delete cascade,
    member_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (entry_id, member_id)
);
create index if not exists kudos_member_idx on public.kudos (member_id);

create table if not exists public.comments (
    id uuid primary key default gen_random_uuid(),
    entry_id uuid not null references public.log_entries (id) on delete cascade,
    author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    body text not null,
    created_at timestamptz not null default now(),
    edited_at timestamptz
);
-- Not blank, also not only tabs, line breaks or invisible spaces. Outside create table so a re-run updates it.
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments add constraint comments_body_check
    check (char_length(body) between 1 and 1000 and btrim(body, U&' \0009\000A\000D\00A0\200B\FEFF') <> '');
create index if not exists comments_entry_idx on public.comments (entry_id, created_at, id);
create index if not exists comments_author_idx on public.comments (author_id, created_at);

alter table public.kudos enable row level security;
alter table public.comments enable row level security;

revoke all on table public.kudos from public, anon, authenticated;
revoke all on table public.comments from public, anon, authenticated;
grant select, insert, delete on table public.kudos to authenticated;
grant select, insert, delete on table public.comments to authenticated;
grant update (body) on table public.comments to authenticated; -- nothing else of a comment can change
grant all on table public.kudos to service_role;
grant all on table public.comments to service_role;

-- ---------------------------------------------------------------------------
-- Who may do what (security definer: they read log_entries past its owner-only RLS)
-- ---------------------------------------------------------------------------

-- The 0004 rule: a logged-in member, and the dive is theirs or visible to members.
create or replace function public.entry_visible(p_entry uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_member() and exists (
        select 1 from public.log_entries e
        where e.id = p_entry
          and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    );
$$;

create or replace function public.can_kudos(p_entry uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_member() and exists (
        select 1 from public.log_entries e
        where e.id = p_entry
          and e.owner <> auth.uid()
          and e.visibility in ('members', 'link')
    );
$$;

-- Visible and comments on: who may write comments, and whose comments may be read.
create or replace function public.can_comment(p_entry uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_member() and exists (
        select 1 from public.log_entries e
        where e.id = p_entry
          and e.comments_enabled
          and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    );
$$;

create or replace function public.owns_entry(p_entry uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_member() and exists (
        select 1 from public.log_entries e where e.id = p_entry and e.owner = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- Server-kept fields
-- ---------------------------------------------------------------------------

create or replace function public.kudos_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    new.created_at := now();
    return new;
end $$;

drop trigger if exists kudos_touch on public.kudos;
create trigger kudos_touch before insert on public.kudos
    for each row execute function public.kudos_touch();

create or replace function public.comments_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        -- Rate sanity: a stuck client or a script cannot flood dives with comments. The lock makes parallel
        -- requests of one author wait for each other, so they cannot all pass the count at once.
        if auth.uid() is not null then
            perform pg_advisory_xact_lock(hashtext('decotrail-comments:' || auth.uid()::text));
        end if;
        if auth.uid() is not null and (
            select count(*) from public.comments c
            where c.author_id = auth.uid() and c.created_at > now() - interval '1 minute'
        ) >= 10 then
            raise exception 'Too many comments, try again in a minute' using errcode = 'P0001';
        end if;
        new.created_at := now();
        new.edited_at := null;
    else
        new.id := old.id;
        new.entry_id := old.entry_id;
        new.author_id := old.author_id;
        new.created_at := old.created_at;
        new.edited_at := case when new.body is distinct from old.body then now() else old.edited_at end;
    end if;
    return new;
end $$;

drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before insert or update on public.comments
    for each row execute function public.comments_touch();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy if exists "members read kudos of visible dives" on public.kudos;
create policy "members read kudos of visible dives" on public.kudos
    for select to authenticated
    using (member_id = auth.uid() or public.entry_visible(entry_id));

drop policy if exists "members give kudos" on public.kudos;
create policy "members give kudos" on public.kudos
    for insert to authenticated
    with check (member_id = auth.uid() and public.can_kudos(entry_id));

drop policy if exists "members take back own kudos" on public.kudos;
create policy "members take back own kudos" on public.kudos
    for delete to authenticated
    using (member_id = auth.uid());

drop policy if exists "members read comments of visible dives" on public.comments;
create policy "members read comments of visible dives" on public.comments
    for select to authenticated
    using (author_id = auth.uid() or public.can_comment(entry_id) or public.owns_entry(entry_id));

drop policy if exists "members write comments" on public.comments;
create policy "members write comments" on public.comments
    for insert to authenticated
    with check (author_id = auth.uid() and public.can_comment(entry_id));

drop policy if exists "authors edit own comments" on public.comments;
create policy "authors edit own comments" on public.comments
    for update to authenticated
    using (author_id = auth.uid() and public.can_comment(entry_id))
    with check (author_id = auth.uid() and public.can_comment(entry_id));

drop policy if exists "authors and dive owners delete comments" on public.comments;
create policy "authors and dive owners delete comments" on public.comments
    for delete to authenticated
    using (author_id = auth.uid() or public.owns_entry(entry_id));

-- ---------------------------------------------------------------------------
-- Read functions
-- ---------------------------------------------------------------------------

-- The result columns grew (nickname); a re-run or an older copy must not block create or replace.
drop function if exists public.entry_kudos(uuid);
drop function if exists public.entry_comments(uuid);
drop function if exists public.social_inbox(integer);
drop function if exists public.shared_dive_kudos(text);

-- Counts for feed cards and the detail: only for dives the caller may see; 0 comments while they are off.
create or replace function public.social_counts(p_entry_ids uuid[])
returns table (entry_id uuid, kudos_count integer, kudoed boolean, comment_count integer, comments_enabled boolean)
language sql stable security definer set search_path = ''
as $$
    select e.id,
           (select count(*) from public.kudos k where k.entry_id = e.id)::integer,
           exists (select 1 from public.kudos k where k.entry_id = e.id and k.member_id = auth.uid()),
           case when e.comments_enabled
                then (select count(*) from public.comments c where c.entry_id = e.id)::integer else 0 end,
           e.comments_enabled
    from public.log_entries e
    where public.is_member()
      and e.id = any ((coalesce(p_entry_ids, '{}'::uuid[]))[1:200])
      and (e.owner = auth.uid() or e.visibility in ('members', 'link'));
$$;

-- Who gave kudos to a dive the caller may see, newest first.
create or replace function public.entry_kudos(p_entry_id uuid)
returns table (member_id uuid, display_name text, nickname text, avatar_preset text, avatar_path text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
    select k.member_id, p.display_name, p.nickname, p.avatar_preset, p.avatar_path, k.created_at
    from public.kudos k
    left join public.profiles p on p.id = k.member_id
    where k.entry_id = p_entry_id
      and public.entry_visible(p_entry_id)
    order by k.created_at desc, k.member_id
    limit 500;
$$;

-- The comments of a dive the caller may see, oldest first; none while comments are off.
create or replace function public.entry_comments(p_entry_id uuid)
returns table (
    id uuid, entry_id uuid, author_id uuid, display_name text, nickname text, avatar_preset text, avatar_path text,
    body text, created_at timestamptz, edited_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
    select c.id, c.entry_id, c.author_id, p.display_name, p.nickname, p.avatar_preset, p.avatar_path, c.body, c.created_at, c.edited_at
    from public.comments c
    left join public.profiles p on p.id = c.author_id
    where c.entry_id = p_entry_id
      and public.can_comment(p_entry_id)
    order by c.created_at, c.id
    limit 1000;
$$;

-- "New for you": kudos and comments by others on the caller's dives, newest first.
create or replace function public.social_inbox(p_limit integer default 50)
returns table (
    kind text, entry_id uuid, actor_id uuid, display_name text, nickname text, avatar_preset text, avatar_path text,
    created_at timestamptz, excerpt text, dive_date date, site_name text, is_new boolean
)
language sql stable security definer set search_path = ''
as $$
    with seen as (
        select (select ss.seen_at from public.social_seen ss where ss.member_id = auth.uid()) as at
    ), ev as (
        select 'kudos'::text as kind, k.entry_id, k.member_id as actor_id, k.created_at, null::text as excerpt
        from public.kudos k
        join public.log_entries e on e.id = k.entry_id
        where e.owner = auth.uid() and k.member_id <> auth.uid()
        union all
        select 'comment', c.entry_id, c.author_id, c.created_at, left(c.body, 140)
        from public.comments c
        join public.log_entries e on e.id = c.entry_id
        where e.owner = auth.uid() and c.author_id <> auth.uid() and e.comments_enabled
    )
    select ev.kind, ev.entry_id, ev.actor_id, p.display_name, p.nickname, p.avatar_preset, p.avatar_path,
           ev.created_at, ev.excerpt, e.dive_date, s.name,
           (seen.at is null or ev.created_at > seen.at)
    from ev
    cross join seen
    join public.log_entries e on e.id = ev.entry_id
    left join public.sites s on s.id = e.site_id and s.owner = e.owner
    left join public.profiles p on p.id = ev.actor_id
    where public.is_member()
    order by ev.created_at desc, ev.entry_id, ev.actor_id
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- The badge: inbox events newer than the last visit.
create or replace function public.social_unseen_count()
returns integer
language sql stable security definer set search_path = ''
as $$
    with seen as (
        select coalesce((select ss.seen_at from public.social_seen ss where ss.member_id = auth.uid()), '-infinity'::timestamptz) as at
    )
    select case when not public.is_member() then 0 else (
        (select count(*) from public.kudos k join public.log_entries e on e.id = k.entry_id, seen
         where e.owner = auth.uid() and k.member_id <> auth.uid() and k.created_at > seen.at)
      + (select count(*) from public.comments c join public.log_entries e on e.id = c.entry_id, seen
         where e.owner = auth.uid() and c.author_id <> auth.uid() and e.comments_enabled and c.created_at > seen.at)
    )::integer end;
$$;

-- Opened "New for you": remember the server time.
create or replace function public.social_mark_seen()
returns timestamptz
language sql volatile security definer set search_path = ''
as $$
    insert into public.social_seen (member_id, seen_at)
    select auth.uid(), now() where public.is_member()
    on conflict (member_id) do update set seen_at = excluded.seen_at
    returning seen_at;
$$;

-- Delete all my data: forget when "New for you" was last opened.
create or replace function public.social_forget_seen()
returns void
language sql volatile security definer set search_path = ''
as $$
    delete from public.social_seen where member_id = auth.uid();
$$;

-- Anon share page, for the 'link' dive whose token the caller holds: the kudos count only (no names) and the
-- author's nickname. Separate from get_shared_dive, which other migrations redefine.
create or replace function public.shared_dive_social(p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    select jsonb_build_object(
        'kudos_count', (select count(*) from public.kudos k where k.entry_id = e.id),
        'author_nickname', (select p.nickname from public.profiles p where p.id = e.owner)
    )
    from public.log_entries e
    where p_token ~ '^[0-9a-f]{64}$'
      and e.share_token = p_token
      and e.visibility = 'link'
      and public.share_owner_active(e.owner);
$$;


-- ---------------------------------------------------------------------------
-- Members directory with the nickname (0004's function plus one column; same filters)
-- ---------------------------------------------------------------------------

drop function if exists public.community_members(uuid);
create function public.community_members(p_id uuid default null)
returns table (
    id uuid, display_name text, nickname text, avatar_preset text, avatar_path text, home_country text,
    created_at timestamptz, dive_count integer, deepest_m numeric, total_s bigint,
    last_dive_date date, top_sites text[]
)
language sql stable security definer set search_path = ''
as $$
    select p.id, p.display_name, p.nickname, p.avatar_preset, p.avatar_path, p.home_country, p.created_at,
           coalesce(st.n, 0)::integer, st.deepest, coalesce(st.total, 0)::bigint, st.last,
           coalesce(ts.names, '{}')
    from public.profiles p
    left join lateral (
        select count(*) as n, max(e.max_depth_m) as deepest, sum(e.duration_s) as total, max(e.dive_date) as last
        from public.log_entries e
        where e.owner = p.id and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    ) st on true
    left join lateral (
        select array_agg(x.name order by x.n desc, x.name) as names
        from (
            select s.name, count(*) as n
            from public.log_entries e
            join public.sites s on s.id = e.site_id and s.owner = e.owner
            where e.owner = p.id and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
            group by s.name
            order by count(*) desc, s.name
            limit 3
        ) x
    ) ts on true
    where public.is_member()
      and (p_id is null or p.id = p_id)
    order by (p.id = auth.uid()) desc, st.last desc nulls last, coalesce(p.nickname, p.display_name), p.id;
$$;

do $$
declare
    f text;
begin
    -- Policy helpers and the readers: members only.
    foreach f in array array[
        'public.entry_visible(uuid)',
        'public.can_kudos(uuid)',
        'public.can_comment(uuid)',
        'public.owns_entry(uuid)',
        'public.social_counts(uuid[])',
        'public.entry_kudos(uuid)',
        'public.entry_comments(uuid)',
        'public.social_inbox(integer)',
        'public.social_unseen_count()',
        'public.social_mark_seen()',
        'public.social_forget_seen()',
        'public.community_members(uuid)'
    ] loop
        execute format('revoke all on function %s from public, anon', f);
        execute format('grant execute on function %s to authenticated', f);
    end loop;
    foreach f in array array['public.kudos_touch()', 'public.comments_touch()'] loop
        execute format('revoke all on function %s from public, anon, authenticated', f);
    end loop;
    execute 'revoke all on function public.shared_dive_social(text) from public';
    execute 'grant execute on function public.shared_dive_social(text) to anon, authenticated';
end $$;

commit;

notify pgrst, 'reload schema';
