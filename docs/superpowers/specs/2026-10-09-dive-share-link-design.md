# DecoTrail — public share link for one dive

Status: approved by the autonomous brief (2026-10-09). Builds on 0004 (`visibility = private | members | link`,
`share_location`, reserved `share_token`).

## Goal

The owner of a dive can turn on a public link. Anyone with the link — no account — sees a read-only page with
that one dive: profile chart + analysis, date, depth, time, gas, site name, photos, video links, buddies, and
the diver's display name and avatar. Never notes, never email, exact position only with `share_location`.
Turning the link off revokes it immediately; turning it on again makes a new link.

## Decisions (each with a one-line why)

1. **Link format `https://decotheory.eu/lab/dive.html#s=<token>`.** A separate light page needs no login code
   and gets its own noindex + generic preview; the token sits in the fragment, so it never reaches server
   logs, `Referer` headers or link-preview crawlers. Works via trail.decotheory.eu forwarding (hash kept).
2. **Token = 64 lowercase hex chars (two `gen_random_uuid()` → 244 random bits)**, column changed from
   `uuid` to `text` with a format check. Why: the brief asks for ≥ 128 bit; one v4 UUID has only 122;
   `gen_random_uuid()` is built into Postgres 13+ (no pgcrypto/schema dependency).
3. **The server owns the token.** A `before insert or update` trigger on `log_entries`: visibility `link`
   and no token yet (or switching to `link`) → new token; anything else → `null`. Client-sent tokens are
   ignored (the trigger always overwrites). Why: revocation cannot be forgotten by any client, old app
   versions included; the app only flips `visibility`.
4. **Anon read = one security-definer RPC `get_shared_dive(p_token text) returns jsonb`**, granted to `anon`
   and `authenticated`. It returns `null` unless the token matches exactly a `link` entry (format-checked
   first, so no pattern tricks). Payload: whitelisted entry columns (no notes, no log number, no owner id
   column, no ids except what photos need), site name/country/water/altitude, coordinates only with
   `share_location`, the author's display name / avatar preset / avatar path, media (photo paths, video
   links, captions; photo coordinates only with `share_location`), and the recording (summary + record with
   the device serial removed). Why: one call, nothing else anon-readable, no listing of any kind.
5. **Photos and avatar: header-gated anon storage `SELECT` policies + signed URLs.** The share page builds its
   own Supabase client (no session) that sends header `x-decotrail-share: <token>` on every request. Supabase
   Storage copies request headers into `request.headers` for RLS (verified in supabase/storage
   `src/internal/database/postgres/scope.ts`). Policy for `anon`: an object of `dive-photos` is readable only
   if it is a photo of the entry whose `share_token` equals that header; `avatars`: only the `avatar_path` of
   that entry's owner. The page then calls `createSignedUrls` (1 h). Why: a plain anon policy ("photos of
   any link dive") would let anyone with the public anon key *list* the bucket and enumerate every shared
   dive's photos without a token; with the header gate a listing shows at most the photos of the one dive
   whose token you already hold. Buckets stay private; no Edge Function to deploy. If the header ever does
   not reach RLS, photos simply do not load (the page still works) — degrade, not leak.
6. **Members keep seeing `link` dives** (0004 semantics: link ⊃ members). Profile default visibility does not
   offer `link`: each public link is a deliberate act per dive.
7. **Owner UI.** Dive detail (own dive) gets a "Public link" card with a switch (`role="switch"`). On →
   shows the link, **Copy** and (where `navigator.share` exists) **Share**. Off → revoke (visibility back
   to what it was before turning on in this view, else `members`). The edit form offers a third radio
   "Public link" and, for a dive that already has one, shows it with Copy. The share-location checkbox text
   becomes "Show the exact location" (it now applies to link visitors too).
8. **Degrade without 0005.** `store.shareStatus()` probes the RPC once per session (`PGRST202`/`42883`/404 →
   no). Without it: no share card, no "Public link" radio (an existing `link` value is still shown as before
   so it is not silently changed), and the share page says the link is not available.
9. **Share page.** `lab/dive.html`: DecoTrail top bar (brand, language, DecoTheory ↗), the read-only
   `EntryDetail` (author row without a link, no back link) and below it the embedded
   `RecordedDiveAnalysis` (same touch readout as members' view; tissue chaining over earlier dives is not
   available because their recordings are not shared — documented gap). Footer with a "Keep your own log on
   DecoTrail" link. `<meta name="robots" content="noindex, nofollow">`, `<title>DecoTrail dive</title>`,
   `og:title` "DecoTrail dive", generic description, `referrer` = `no-referrer`. Unknown/revoked token →
   friendly "This link does not work (anymore)" card.
10. **Abuse.** 244-bit tokens; the RPC rejects anything not matching `^[0-9a-f]{64}$` before touching the
    table; equality lookup on a unique index (no prefix/LIKE); anon has no other grants (0001–0004 revoke
    anon). Supabase's API rate limits apply; nothing else is needed for unguessable tokens.

## Pieces

- `supabase/migrations/0005_share_link.sql` + `supabase/tests/0005_share.sql` (Docker harness).
- `js/logbook/share.js` — pure: `parseShareHash`, `shareUrl`, `isShareToken`, `sharedDiveParts` (RPC payload
  → `{entry, site, media, author, recording}`), `SHARE_HEADER`.
- `js/backend/supabaseStore.js` — `shareStatus()`, `setSharing(id, on, restore)`.
- `js/backend/shareStore.js` — the anon client for the page: `loadSharedDive`, `photoUrls`, `avatarUrl`,
  read-only adapter for EntryDetail + RecordedDiveAnalysis.
- `js/logbook/ShareCard.js` — owner card on the detail screen.
- `js/logbook/SharedDivePage.js` — the page controller; `lab/dive.html`.
- `EntryDetail`: `authorHref` optional, `analysisHref`/`hideBack` for the share page, ShareCard slot.
- `EntryForm`: third radio + link row when sharing is available.
- en/cs/es strings; `sw.js` STATIC_ASSETS; privacy page sentence about public links.

## Tests

Unit (node): `share.js` helpers (token format, hash parsing incl. junk, payload mapping never carrying notes),
store `shareStatus` / `setSharing` with a fake client, ShareCard/EntryForm rendering via the existing DOM
test style. SQL (Docker): token generated/cleared/rotated by the trigger, client-sent token ignored, RPC
returns null for wrong/malformed/revoked tokens and for private/members dives, never notes, coords gated,
serial stripped, anon cannot select tables or call community RPCs, storage policies honour the header.
Browser: share page at 390×844 and desktop, light/dark, with a fake store harness; owner card likewise.
