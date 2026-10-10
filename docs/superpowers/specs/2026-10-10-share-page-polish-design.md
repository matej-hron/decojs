# Shared dive page: map, Strava-like layout, exact location on by default

Branch `feat/share-page-polish`. Brief: coordinator `brief-sharepolish.md` plus two user follow-ups
(location switch in the Share card; exact location ON by default).

## Decisions (each with the one-line why)

### Map data — migration 0009_share_map.sql
- **A separate RPC `get_shared_dive_area(p_token)`** returns `{lat, lon, exact}` of the dive's site, or null.
  `exact = share_location`; otherwise lat/lon rounded to 2 decimals (≈ 1 km).
  *Why:* 0006 (sites) and 0008 (avatar fix) both `create or replace get_shared_dive`; a third full redefinition
  would silently drop whichever columns the others add, depending on run order. A new function is order-independent.
- Same filters as `get_shared_dive` (token format, `visibility = 'link'`, active owner, site of the same owner);
  `security definer`, granted to anon + authenticated. *Why:* identical trust boundary.
- **`log_entries.share_location` default → true, backfill existing rows to true** (user decision 2026-10-10).
  The share-token trigger keeps tokens on this update (visibility unchanged).
- The client calls the area RPC next to `get_shared_dive`; a missing function (0009 not run) or failure → falls back
  to the exact coordinates `get_shared_dive` already returns with `share_location`, else no map.
  *Why:* the page never depends on the migration.

### Default "show exact location"
- Stored in the account metadata (`user_metadata.share_location_default`, missing = true), like `log_offset`.
  *Why:* the user asked for no new column if possible; the profiles table has no settings blob, and the metadata
  already holds the other per-account logbook setting. Works before 0009 runs.
- Profile page: checkbox "Show exact location by default" right under "Who sees your new dives", saved with Save.
- New entries (EntryForm, ensureEntries auto-created from recordings) send `share_location` from that setting.

### Share card
- Checkbox "Show the exact location" inside the Public link card (same `share_location`, saves immediately via
  `store.setShareLocation`), with a one-line hint "Off: the map shows only the approximate area".
  Shown whether or not the link is on (it also governs members). *Why:* the user could not find the switch.

### Map rendering (shared `siteMap.js`)
- Mapy.com static map (`mapyStaticMapUrl`, as on feed cards; decotheory.eu is on the key's referrer list),
  `<img>` with `onerror` → Leaflet + OSM tiles, non-interactive (the existing fallback).
- Exact: marker. Approximate: no marker, zoom 11, a translucent ~1 km circle drawn over the centre (CSS on the
  static image, `L.circle` on Leaflet) and the label "Approximate area". *Why:* a pin would claim precision we removed.
- The owner always sees the exact map (own site).

### Layout (EntryDetail, shared by owner, member and share views)
- **Hero**: first photo (opens the lightbox); without photos the map; without both no hero.
- **Title block**: author row (read-only views), site name, date/time, visibility (owner); Edit button top right.
- **Stat row**: big numbers separated by thin rules (Strava), wraps to a 3-column grid on phones.
- **Two columns ≥ 900 px** (`minmax(0, 1.7fr) minmax(280px, 1fr)`):
  - left: analysis slot (share page: embedded profile + analysis), photos gallery (bigger thumbnails), description,
    notes (owner), details;
  - right: map (when not already the hero), gases, conditions, buddies, Share card (owner).
  - Owner/member pages have no embedded analysis (it is its own route); the left column then starts with photos.
- **Phone**: column wrappers become `display: contents` and cards get `order`: hero, title, stats, map, chart, photos,
  gases, conditions, buddies, description, details, share, actions.
- Every block is the same card (`.lb-d-card`: surface, border, radius, padding, small uppercase heading).
- Gases card: one gas per row (no half-width tile). Details: open card with group sub-headings — no collapsed
  "More details" summary that looked like a dead heading; nothing rendered when empty.
- Description: `entry.description` rendered when present (0006 adds it; `share.js` passes it through).
- Lightbox: previous/next buttons, ←/→ keys, counter "2 / 5", Esc closes.

### Share page extras
- Bottom call to action card: "Log your dives with DecoTrail" (+ "DecoTrail is invite-only for now — ask a member
  for an invitation.") and "Learn the theory on DecoTheory ↗".
- The page width grows to 1200 px so the two columns breathe.

## Tests
- Pure helpers: `siteArea()` (share.js), `roundArea()`, `heroKind()`; store `setShareLocation`,
  `defaultShareLocation`; `normalizeEntry`/EntryForm default; Docker SQL test `0009_share_map.sql`.
