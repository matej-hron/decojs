# Community site directory (migration 0011)

Date: 2026-10-10. Request: "all users should see all sites — with information about visibility too", plus
"temperature matters as much as visibility on site pages". Coordinator rulings are in the task brief; the decisions
below fill the gaps (each with a one-line why). Autonomous session: no user approval round.

## Goal

Sites stop being a private address book and become a shared DecoTrail directory. Every member sees every
members-visible site with its position, and what the community's visible dives say about it: visits, last visit,
visibility (shallow/deep) and water temperature (bottom/surface), both by month. Members reuse one site entry
("Barbora CMAS" once) instead of creating duplicates. Only the creator edits, moves, merges or deletes a site.

## Data model and security (0011_community_sites.sql)

- `sites.visibility text not null default 'members' check (visibility in ('members','private'))`. Existing sites
  become `members` (the default fills them). *Why:* the brief; a secret spot stays with its creator.
- Base-table RLS of `sites` stays owner-only. Others read only through security-definer functions that never
  return `notes`. *Why:* widening the table policy would leak notes through `select *`.
- **Which site a dive shows** (every function that joins a dive to its site): `s.id = e.site_id and
  (s.visibility = 'members' or (s.owner = e.owner and s.owner = auth.uid()))`. A members site shows with anyone's
  dive; a private site only with its creator's own dives, and only to the creator. *Why:* a dive may now point at
  another member's site; a secret spot's name must not appear on the feed or the public share page (anon has no
  `auth.uid()`, so the share page shows only members sites). Coordinates keep their 0004/0009 rule
  (`share_location`) in `community_entries`, `get_shared_dive`, `get_shared_dive_area`. Redefined with this join:
  `community_entries` (0006 shape), `get_shared_dive` (0006 shape incl. 0008 `author_key`), `get_shared_dive_area`
  (0009), `social_inbox` and `community_members` (0010 shapes). Signatures and columns unchanged.
- **Attaching a site to a dive** — trigger `log_entries_site_check` (before insert, or update when `site_id`
  changes): the site must be the dive owner's own or `members`. *Why:* the FK alone would let anyone attach a
  guessed id of a private site and read its name back.
- **Site guard** — trigger on `sites` before update: `owner` cannot change; `visibility` cannot become `private`
  while another member's dive uses the site (error `DTS01`). Before delete (direct statements only,
  `pg_trigger_depth() = 1`): refused while any dive uses it (error `DTS02`). *Why:* the ruling "delete blocked if
  any dive (anyone's) uses it"; account deletion cascades (depth > 1) still work and the FK sets others' dives to
  no site (GDPR beats tidiness).
- **Read functions** (members only, `is_member()`, revoked from anon):
  - `community_sites()` → one row per site the caller may see (own, or `members`): `id, owner, name, lat, lon,
    country, water, altitude_m, url, visibility, created_at, updated_at, visits int, last_visit date,
    vis_min, vis_max, temp_min, temp_max numeric, used_by_others boolean`. Aggregates only over dives the caller
    may see (own or `members`/`link`) and that show this site (join rule above). `vis_*` span shallow and deep
    values; `temp_*` span bottom (`water_temp_c`) and surface (`details.surfaceTempC`, numeric JSON only).
    `used_by_others` is set only on the caller's own sites (null otherwise): whether any other member's dive
    (including private ones) uses it. *Why:* the delete/merge/private guards need it; it reveals only "someone
    dived here", which the delete refusal reveals anyway — documented trade-off.
  - `site_stats(p_site_id)` → jsonb or null when the site is not visible:
    `{visits, divers, first_visit, last_visit,
      vis:  {shallow: S, deep: S},  temp: {bottom: S, surface: S},
      months: [{month, n, bottom: {avg,min,max,n}|null, surface: {...}|null, vis: {avg,n}|null}]}` where
    `S = {n, avg, min, max, best_date (date of max), latest, latest_date} | null`. Same dive filter.
  - `site_visits(p_site_id, p_limit default 50, p_offset default 0)` → `id, owner, dive_date, entry_time,
    duration_s, max_depth_m, water_temp_c, surface_temp_c, vis_shallow_m, vis_deep_m, visibility` newest first,
    limit clamped 1..200. Same filter.
  - `merge_site(p_from, p_into) → jsonb {moved, deleted}` (volatile): caller owns `p_from`; `p_into` is visible
    to the caller and different; moves **only the caller's own** dives from → into, then deletes `p_from` only
    when no dive (anyone's) uses it any more, otherwise keeps it. `moved` = the caller's own dives moved,
    `deleted` = whether `p_from` went; how many other dives remain is never revealed. *Why:* the user's rule —
    a merge never touches other members' dives; a duplicate others still use stays for them.
- Idempotent (`if not exists`, `create or replace`, drop+create where the shape is new), one transaction,
  `lock_timeout 5s`, `notify pgrst`. Docker RLS suite `supabase/tests/0011_community_sites.sql`.

## Client

- `js/backend/sitesStore.js` (`createSitesApi`): `sitesAvailability()` probe ('yes'|'no'|'unknown' — selects
  `visibility` from `sites`), `communitySitesStatus()`, `listCommunitySites()`, `siteStats(id)`,
  `siteVisits(id, {limit, offset})`, `mergeSiteInto(from, into)`. `supabaseStore` adds `listAllSites()` (own rows
  with notes, plus community rows of others, each with `own` and the aggregates; without 0011 = `listSites()`),
  sends `visibility` only when 0011 ran, maps `DTS01`/`DTS02` to `DiveStoreError` kinds `site-shared` /
  `site-in-use`, uses `merge_site` when available. "Delete all my data" keeps own sites other members use (notes
  and link cleared) and reports `sitesKept`. *Why:* deleting would fail or unlink others' dives.
- `js/logbook/siteStats.js` (pure): `siteStatsFromRows(rows)` returns the `site_stats` shape (fallback without
  0011 and for tests), `siteSummaryLine(site, lang)` → `vis 4–8 m · 6–21 °C (last: 27 Sep)`; U+00A0 before units,
  decimal comma in cs, `fmtNum`.
- **Sites tab** (`SitesPage` list): segmented *All sites / My sites* (All only with 0011), *List / Map* toggle.
  List: sorted by distance when the geolocation permission is already granted, otherwise by name with a
  "Sort by distance" button (asks once). Card: map thumbnail, name, "added by Luis" / "You", lock badge for
  private, the summary line, visits, distance. Map: Leaflet with the picker's Mapy/OSM layers, all positioned
  sites as pins (own blue, others teal, private with a dark ring); popup = name, added by, summary, "Open".
- **Site page**: any visible site. Header (name, added by, link, privacy), map preview, **Conditions** card with
  two equal panels — *Visibility* (shallow/deep: avg, range, best with date, latest with date) and *Temperature*
  (bottom/surface: avg, min–max, latest with date) — then a 12-month strip with bottom and surface averages (and
  visibility average) where data exists. Visits list (from `site_visits`, else the 0006 client fallback). Owner
  only: edit form (+ Visibility select *Members / Only me*), notes, move pin, merge into any other visible site,
  delete when no one uses it. *Why:* the user's temperature emphasis; one stats shape for server and fallback.
- **Entry form + picker**: datalist and map picker offer community sites (others' pins teal, tooltip "added by");
  a typed name resolves to own site first, then the community site with most visits. Duplicate guard checks all
  sites within 300 m: "Use Barbora CMAS (added by Luis)". Entry detail and the dive list resolve names through
  `listAllSites()` so a dive at another member's site shows its name.
- Degrades without 0011: the probe says 'no' → My sites only, client-side stats, no visibility field, old merge.
- en/cs/es strings, phone-first, dark mode via existing tokens.

## Out of scope

Suggesting edits to others' sites; moderation; clustering pins; site photos.
