# DecoTrail public profiles and browsing without logging in (migration 0012)

Date: 2026-10-11. Request: "To be able to present the app, users can mark their profile as public (off by default).
Then we allow anonymous access: visitors see feeds from opted-in users, and site information without personal data."
User rulings (asked): a public profile shows every dive that is not *Private*; site conditions aggregate all members'
dives; a logged-out visitor lands on the public Feed with a *Log in* button.

## Goal

A visitor who is not logged in opens `lab/dive-log.html` and browses DecoTrail: the Feed of public members' dives,
their member pages, each dive with its analysis, the Community list of public members, and the Sites directory with
conditions. Members switch *Public profile* on in their profile; nothing is public until they do.

## Data model and security (`0012_public_profiles.sql`)

- `profiles.is_public boolean not null default false`. Members change it through the existing owner-only update
  policy. No backfill: every existing profile stays private.
- Visitors (role `anon`) read only through new `security definer` functions; no table gets an anon grant and the
  member functions of 0004–0011 stay closed to anon. Why separate functions instead of widening the member ones:
  the public rules are stricter, and each member function has been redefined by several migrations already (see
  0009's note): a further redefinition would make the run order matter again.
- A dive is public when `visibility in ('members', 'link')` and its owner's profile is public and the account is
  active (`share_owner_active`, from 0005). Why not only `link` dives: the user's choice; *Private* still hides a
  dive from everyone.
- `public_entries`, `public_media`, `public_recordings`, `public_recording`, `public_members` return the same row
  shapes as their `community_*` twins, so the client reads both alike. Stricter than for members:
  - no `log_number` (gaps would reveal private dives), no buddies (third people who did not opt in), `details`
    reduced to the share page's allow-list (no `computer`, which carries the serial number);
  - recordings without device serial, lifetime dive counter, file name or hash (the share page's stripping);
  - a site's position only with `share_location`, only `members` sites, the site link only on its creator's dives.
- Sites: `public_sites`, `public_site_stats`, `public_site_visits`. Every `members` site with name, position,
  water, altitude and link; never the creator (`owner` is null). Conditions aggregate every members-visible dive
  (numbers only, nobody named). Why: that is the directory's value, and an average names nobody. The visits list
  shows only dives of public profiles.
- Storage: anon `select` on `dive-photos` objects of public dives and on `avatars` of public profiles. Same known
  limit as the share link: a signed URL keeps working until it expires (1 hour).
- Switching the profile off hides everything at once (every function checks `is_public` on each call).

Tested in `supabase/tests/0012_public_profiles.sql` (run by `supabase/tests/run.sh`): grants, the switch through RLS,
every field rule above, banned owners, storage, switching off.

## Client

- `js/backend/publicStore.js`: `publicAvailability()` (probe: `public_members` with a null-uuid id; 'yes' | 'no' cached
  | 'unknown') and `publicStore()`, a frozen read-only store whose methods carry the community API's names
  (`listCommunityEntries`, `getMember`, `listAllSites`, `siteStats`, …) and call the `public_*` RPCs. No write method,
  `currentUser()` is null. Why the same names: `CommunityFeed`, `MembersPage`, `MemberPage`, `EntryDetail` (read-only),
  the embedded `RecordedDiveAnalysis` and `SitesPage` work unchanged.
- `LogbookApp`: logged out with a store that has the API, it enters *guest mode* (body `tr-guest`, app layout): tabs
  Feed / Community / Sites, a *Log in* button in the top bar, routes resolved by `resolveGuestRoute` (`home` → Feed;
  own dives, profile, New for you → the login). `#/login` mounts the existing login form inside the shell. Without
  0012 (or while the probe fails, or when a login link came back with an error) the page is the login form alone,
  as before. Logging in leaves guest mode for the member app; a member on `#/login` lands at home.
- Guest views: the Feed shows an intro with *Log in* and no *New dive*; Community and Sites have visitor intros;
  Sites shows the whole directory without the *My sites* switch, creator or edit note; a dive has no kudos/comments.
- Profile: a *Public profile* checkbox (only when the column exists), with what visitors see and what stays hidden.
- Privacy policy: a *Public profile* paragraph (en/cs/es).

## Out of scope

- Kudos and comments for visitors (names of members who did not opt in).
- Search-engine indexing: the page stays `noindex`.
- A "see your profile as a visitor" preview.
