-- DecoTrail: send a dive to a buddy who is a member (docs/superpowers/specs/2026-10-13-buddy-shares-design.md).
-- Run once in the Supabase SQL editor after 0012. Safe to run again.
--
-- Security model: the sender offers one of their own dives to members who dived with them (dive_shares). The
-- recipient sees the offer and either declines it, links it to a dive they already logged (the sender is added to
-- that dive's buddies), or accepts it as a copy: a new dive in their own log with the basics (date, time, site,
-- depth, duration, water, visibility, conditions), the sender's dive story and a copy of the sender's recording.
-- Photos are copied by the app afterwards (re-uploaded into the recipient's folder); for that the recipient may
-- read the photos of a dive offered to them. Never copied: notes, gas, rating, weights, suit, the log number.
-- Everything goes through security definer functions; the table itself is read-only for the two parties.
-- A copied recording keeps the sender's file_path (the recipient cannot read that file): the app treats a
-- recording whose file is outside the own folder as a copy (no re-parse, no file in the export, no file delete).

begin;

set local lock_timeout = '5s';

create table if not exists public.dive_shares (
    id uuid primary key default gen_random_uuid(),
    entry_id uuid not null references public.log_entries (id) on delete cascade,
    sender uuid not null references auth.users (id) on delete cascade,
    recipient uuid not null references auth.users (id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
    -- The recipient's dive: the copy, or the dive they linked it to.
    result_entry_id uuid references public.log_entries (id) on delete set null,
    created_at timestamptz not null default now(),
    responded_at timestamptz,
    constraint dive_shares_once unique (entry_id, recipient),
    constraint dive_shares_not_self check (sender <> recipient)
);

create index if not exists dive_shares_recipient_idx on public.dive_shares (recipient, status);

alter table public.dive_shares enable row level security;
revoke all on table public.dive_shares from public, anon, authenticated;
grant select on table public.dive_shares to authenticated;
grant all on table public.dive_shares to service_role;

drop policy if exists "parties read dive shares" on public.dive_shares;
create policy "parties read dive shares" on public.dive_shares
    for select to authenticated
    using (sender = auth.uid() or recipient = auth.uid());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- How a member is called in a buddy list: nickname, else display name.
create or replace function public.share_member_name(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
    select coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.display_name), ''))
    from public.profiles p where p.id = p_id;
$$;

-- An active, invited member other than the caller.
create or replace function public.share_recipient_ok(p_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select p_id is not null and p_id is distinct from auth.uid()
       and exists (select 1 from public.profiles p where p.id = p_id)
       and exists (
           select 1 from auth.users u
           where u.id = p_id and not coalesce(u.is_anonymous, false)
             and u.deleted_at is null and (u.banned_until is null or u.banned_until < now())
       );
$$;

-- ---------------------------------------------------------------------------
-- Sender: offer an own dive to these members. Adds the missing offers and withdraws pending ones not in the
-- list; answered offers stay as they are (a declined buddy is not asked again). Returns the entry's offers.
-- ---------------------------------------------------------------------------

create or replace function public.set_dive_shares(p_entry uuid, p_recipients uuid[])
returns setof public.dive_shares
language plpgsql volatile security definer set search_path = ''
as $$
begin
    if not public.is_member() or not exists (
        select 1 from public.log_entries e where e.id = p_entry and e.owner = auth.uid()
    ) then
        raise exception 'Only the owner shares a dive' using errcode = '42501';
    end if;
    if coalesce(array_length(p_recipients, 1), 0) > 20 then
        raise exception 'Too many buddies' using errcode = '22023';
    end if;
    delete from public.dive_shares s
    where s.entry_id = p_entry and s.status = 'pending'
      and not (s.recipient = any (coalesce(p_recipients, '{}')));
    insert into public.dive_shares (entry_id, sender, recipient)
    select p_entry, auth.uid(), r
    from (select distinct unnest(coalesce(p_recipients, '{}')) as r) x
    where public.share_recipient_ok(x.r)
    on conflict on constraint dive_shares_once do nothing;
    return query select s.* from public.dive_shares s where s.entry_id = p_entry order by s.created_at, s.id;
end $$;

-- ---------------------------------------------------------------------------
-- Recipient: pending offers with what the dive is, newest first
-- ---------------------------------------------------------------------------

create or replace function public.incoming_dive_shares()
returns table (
    id uuid, entry_id uuid, sender uuid, created_at timestamptz,
    display_name text, nickname text, avatar_preset text, avatar_path text,
    dive_date date, entry_time time, duration_s integer, max_depth_m numeric, water_temp_c numeric,
    site_name text, description text, has_recording boolean, photo_count integer
)
language sql stable security definer set search_path = ''
as $$
    select s.id, s.entry_id, s.sender, s.created_at,
           p.display_name, p.nickname, p.avatar_preset, p.avatar_path,
           e.dive_date, e.entry_time, e.duration_s, e.max_depth_m, e.water_temp_c,
           st.name, e.description, e.recording_id is not null,
           (select count(*) from public.media m where m.entry_id = e.id and m.owner = e.owner and m.kind = 'photo')::integer
    from public.dive_shares s
    join public.log_entries e on e.id = s.entry_id and e.owner = s.sender
    left join public.profiles p on p.id = s.sender
    left join public.sites st on st.id = e.site_id and (st.visibility = 'members' or st.owner = auth.uid())
    where s.recipient = auth.uid() and s.status = 'pending'
      and public.is_member() and public.share_owner_active(s.sender)
    order by s.created_at desc, s.id;
$$;

create or replace function public.incoming_dive_share_count()
returns integer
language sql stable security definer set search_path = ''
as $$
    select case when not public.is_member() then 0 else (
        select count(*)::integer from public.dive_shares s
        where s.recipient = auth.uid() and s.status = 'pending' and public.share_owner_active(s.sender)
    ) end;
$$;

-- The photos and video links of a dive offered to the caller (to copy them after accepting).
create or replace function public.dive_share_media(p_share uuid)
returns table (
    id uuid, kind text, path text, url text, width integer, height integer,
    taken_at timestamptz, lat double precision, lon double precision, caption text
)
language sql stable security definer set search_path = ''
as $$
    select m.id, m.kind, m.path, m.url, m.width, m.height, m.taken_at,
           case when e.share_location then m.lat end, case when e.share_location then m.lon end, m.caption
    from public.dive_shares s
    join public.log_entries e on e.id = s.entry_id and e.owner = s.sender
    join public.media m on m.entry_id = e.id and m.owner = e.owner
    where s.id = p_share and s.recipient = auth.uid() and s.status in ('pending', 'accepted')
      and public.is_member()
      and (m.path is null or split_part(m.path, '/', 1) = e.owner::text)
    order by m.created_at, m.id;
$$;

-- Storage helper: the recipient reads the photos of a dive offered to them (to re-upload them as their own).
create or replace function public.share_photo_readable(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_member() and exists (
        select 1
        from public.dive_shares s
        join public.media m on m.entry_id = s.entry_id and m.owner = s.sender
        where s.recipient = auth.uid() and s.status in ('pending', 'accepted')
          and m.kind = 'photo' and m.path = p_name
          and split_part(p_name, '/', 1) = s.sender::text
    );
$$;

-- ---------------------------------------------------------------------------
-- Recipient: answer an offer
-- ---------------------------------------------------------------------------

create or replace function public.decline_dive_share(p_share uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
    update public.dive_shares set status = 'declined', responded_at = now()
    where id = p_share and recipient = auth.uid() and status = 'pending' and public.is_member();
$$;

-- Accept: with p_link_entry (one of the caller's own dives) the offer is linked to it and the sender is added to
-- its buddies; without, the dive is copied into the caller's log. Returns {"entry_id", "copied"}.
create or replace function public.accept_dive_share(p_share uuid, p_link_entry uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
    s public.dive_shares;
    e public.log_entries;
    me uuid := auth.uid();
    sender_name text;
    my_names text[];
    new_recording uuid;
    new_entry uuid;
    next_number integer;
    offset_n integer;
    share_loc boolean;
    vis text;
begin
    select * into s from public.dive_shares where id = p_share and recipient = me for update;
    if not found or not public.is_member() then
        raise exception 'This dive is not offered to you' using errcode = '42501';
    end if;
    if s.status = 'accepted' and s.result_entry_id is not null then
        return jsonb_build_object('entry_id', s.result_entry_id, 'copied', false); -- answered already (double tap)
    end if;
    if s.status <> 'pending' then
        raise exception 'This offer was answered already' using errcode = '22023';
    end if;
    select * into e from public.log_entries where id = s.entry_id and owner = s.sender;
    if not found or not public.share_owner_active(s.sender) then
        raise exception 'This dive is no longer available' using errcode = '22023';
    end if;
    sender_name := coalesce(public.share_member_name(s.sender), 'Buddy');

    if p_link_entry is not null then
        update public.log_entries
        set buddies = case when exists (select 1 from unnest(buddies) b where lower(b) = lower(sender_name))
                           then buddies else buddies || sender_name end,
            updated_at = now()
        where id = p_link_entry and owner = me;
        if not found then
            raise exception 'Only your own dive can be linked' using errcode = '42501';
        end if;
        update public.dive_shares set status = 'accepted', responded_at = now(), result_entry_id = p_link_entry where id = s.id;
        return jsonb_build_object('entry_id', p_link_entry, 'copied', false);
    end if;

    -- The copy's recording: the sender's samples (serial and counters kept: it is that computer's profile).
    if e.recording_id is not null then
        insert into public.dives (owner, device_serial, dive_number, start_local, file_path, file_sha256, parser_version, summary, record)
        select me, d.device_serial, d.dive_number, d.start_local, d.file_path, d.file_sha256, d.parser_version, d.summary, d.record
        from public.dives d where d.id = e.recording_id and d.owner = s.sender
        on conflict (owner, device_serial, dive_number, start_local) do nothing
        returning id into new_recording;
        if new_recording is null then -- the caller has that recording already (e.g. accepted before, then deleted the dive)
            select d2.id into new_recording
            from public.dives d1 join public.dives d2
              on d2.owner = me and d2.device_serial = d1.device_serial and d2.dive_number = d1.dive_number and d2.start_local = d1.start_local
            where d1.id = e.recording_id
              and not exists (select 1 from public.log_entries x where x.recording_id = d2.id);
        end if;
    end if;

    my_names := array_remove(array[lower(public.share_member_name(me)),
                                   lower((select btrim(p.display_name) from public.profiles p where p.id = me))], null);
    select greatest(coalesce(max(x.log_number), 0),
                    coalesce(case when (u.raw_user_meta_data ->> 'log_offset') ~ '^[0-9]{1,5}$'
                                  then (u.raw_user_meta_data ->> 'log_offset')::integer end, 0)) + 1,
           coalesce(u.raw_user_meta_data ->> 'share_location_default', '') <> 'false'
    into next_number, share_loc
    from auth.users u left join public.log_entries x on x.owner = u.id
    where u.id = me
    group by u.raw_user_meta_data;
    vis := public.my_default_visibility();
    if vis = 'link' then vis := 'members'; end if; -- a public link is the owner's explicit step, per dive

    insert into public.log_entries (owner, log_number, dive_date, entry_time, duration_s, max_depth_m, buddies,
                                    water_temp_c, vis_shallow_m, vis_deep_m, details, site_id, recording_id,
                                    visibility, share_location, description)
    values (me, next_number, e.dive_date, e.entry_time, e.duration_s, e.max_depth_m,
            array[sender_name] || coalesce((select array_agg(b order by o) from unnest(e.buddies) with ordinality t(b, o)
                                            where not (lower(btrim(b)) = any (my_names)) and lower(btrim(b)) <> lower(sender_name)), '{}'),
            e.water_temp_c, e.vis_shallow_m, e.vis_deep_m,
            coalesce((select jsonb_object_agg(k.key, k.value)
                      from jsonb_each(case when jsonb_typeof(e.details) = 'object' then e.details else '{}'::jsonb end) k
                      where k.key in ('airTempC', 'weather', 'current', 'waves', 'entry', 'avgDepthM', 'tags', 'guide', 'surfaceTempC')),
                     '{}'::jsonb),
            -- The site when the recipient may use it (a members site; never the sender's private spot).
            (select st.id from public.sites st where st.id = e.site_id and st.visibility = 'members'),
            new_recording, vis, share_loc, e.description)
    returning id into new_entry;

    update public.dive_shares set status = 'accepted', responded_at = now(), result_entry_id = new_entry where id = s.id;
    return jsonb_build_object('entry_id', new_entry, 'copied', true);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
    f text;
begin
    foreach f in array array[
        'public.set_dive_shares(uuid, uuid[])',
        'public.incoming_dive_shares()',
        'public.incoming_dive_share_count()',
        'public.dive_share_media(uuid)',
        'public.decline_dive_share(uuid)',
        'public.accept_dive_share(uuid, uuid)',
        'public.share_photo_readable(text)'
    ] loop
        execute format('revoke all on function %s from public, anon', f);
        execute format('grant execute on function %s to authenticated', f);
    end loop;
    foreach f in array array['public.share_member_name(uuid)', 'public.share_recipient_ok(uuid)'] loop
        execute format('revoke all on function %s from public, anon, authenticated', f);
    end loop;
end $$;

drop policy if exists "share recipient reads photos" on storage.objects;
create policy "share recipient reads photos" on storage.objects
    for select to authenticated
    using (bucket_id = 'dive-photos' and public.share_photo_readable(name));

commit;

notify pgrst, 'reload schema';
