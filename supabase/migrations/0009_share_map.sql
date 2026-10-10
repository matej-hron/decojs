-- 0009: map on the public share page, and "show the exact location" on by default.
-- Run once in the Supabase SQL editor after 0005. Safe to run again. Independent of 0006 and 0008: it does not
-- redefine get_shared_dive() (those migrations do), it adds a separate function next to it.
--
-- get_shared_dive_area(token): the position of the shared dive's site for the map. Exact when the owner ticked
-- "Show the exact location" (share_location), otherwise rounded to 2 decimals (about 1 km): dive sites are public
-- places, but the owner's choice still means something. Same filters as get_shared_dive().
--
-- share_location now defaults to true, and existing dives are switched on (the user's decision, 2026-10-10: only
-- the owner's own dives exist yet). The app sends the owner's own default with every new dive.

begin;

set local lock_timeout = '5s';

alter table public.log_entries alter column share_location set default true;
-- The share-token trigger keeps the token of 'link' dives (visibility does not change here).
update public.log_entries set share_location = true where share_location = false;

create or replace function public.get_shared_dive_area(p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    select jsonb_build_object(
        'lat', case when e.share_location then s.lat else round(s.lat::numeric, 2) end,
        'lon', case when e.share_location then s.lon else round(s.lon::numeric, 2) end,
        'exact', e.share_location
    )
    from public.log_entries e
    join public.sites s on s.id = e.site_id and s.owner = e.owner
    where p_token ~ '^[0-9a-f]{64}$'
      and e.share_token = p_token
      and e.visibility = 'link'
      and s.lat is not null and s.lon is not null
      and public.share_owner_active(e.owner);
$$;

revoke all on function public.get_shared_dive_area(text) from public;
grant execute on function public.get_shared_dive_area(text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
