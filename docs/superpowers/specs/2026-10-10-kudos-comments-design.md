# DecoTrail kudos and comments — design

Brief: coordinator `brief-social.md` (binding rulings). Migration `0010_social.sql`. Autonomous session: decisions below
carry a one-line "why".

## Scope

- **Kudos (👏)** on another member's dive the caller can see (own, `members` or `link` dives of others). One per member
  per dive; tapping again undoes. Never on own dives. Feed cards and the dive detail show 👏 + count; tapping the count
  opens the list of avatars + names. No word label; tooltip/accessible name en "Kudos", cs "Bravo", es "Bravo".
- **Comments** by members on dives they can see. Plain text, 1–1000 characters, HTML escaped, line breaks kept.
  Oldest → newest under the dive. The author edits/deletes their own ("edited" shown); the dive owner deletes any comment
  on their dive. The owner turns comments off per dive in a ⋯ menu on their own dive; while off, existing comments are
  hidden from everyone (the owner sees "Comments are off" and can turn them on again). In-page confirmations only.
- **Share page (anon):** kudos count only, no names, no comments.
- **New for you (in-app only):** a badge with the number of kudos/comments on my dives since I last opened "New for you",
  and the list (who, what, which dive, when; tap → dive). Last-seen time in an owner-only table `social_seen` (not in `profiles`: every member can read profiles, so it would be a "last seen" tracker — found by the adversarial review).
- Delete-all-my-data removes my kudos and comments (those on my dives go with my dives). Privacy page (en/cs/es).
- Not now: buddy tagging, email/push. Nothing here blocks them (the inbox function returns a `kind`, so a `tag` kind can be added).

## Backend — `supabase/migrations/0010_social.sql`

One transaction, idempotent (`if not exists`, `create or replace`, `drop policy if exists`).

- `log_entries.comments_enabled boolean not null default true`. Owner changes it through the existing owner-only RLS.
- `social_seen(member_id pk, seen_at)`: no grants to clients; only the definer functions read/write it.
- `kudos(entry_id → log_entries on delete cascade, member_id → auth.users on delete cascade default auth.uid(),
  created_at default now(), primary key (entry_id, member_id))`.
- `comments(id uuid pk default gen_random_uuid(), entry_id → log_entries on delete cascade, author_id → auth.users on delete
  cascade default auth.uid(), body text check 1–1000 chars and not blank, created_at, edited_at)`.
- Security-definer helpers (all `set search_path = ''`, not executable by anon):
  - `entry_visible(entry)`: `is_member()` and the entry is mine or `members`/`link` — the 0004 rule.
  - `can_kudos(entry)`: visible and not mine.
  - `can_comment(entry)`: visible and `comments_enabled`.
  - `comments_readable(entry)`: same as `can_comment` (hidden while off).
  - `owns_entry(entry)`: the entry's owner is the caller.
- **RLS** (no anon grants at all; `authenticated` gets `select, insert, delete` on kudos and
  `select, insert, update (body), delete` on comments — column grant: an update can only touch the body):
  - kudos select: own rows, or `entry_visible`. insert: `member_id = auth.uid() and can_kudos(entry_id)`. delete: own.
  - comments select: own rows, or `comments_readable`, or `owns_entry`. insert: `author_id = auth.uid() and
    can_comment(entry_id)`. update: own and `can_comment` (using + check). delete: own or `owns_entry`.
  - Triggers (why: clients cannot backdate or move rows): kudos/comments insert sets `created_at = now()`; comment
    insert sets `edited_at = null`; comment update keeps `entry_id`, `author_id`, `created_at`, sets `edited_at = now()`
    when the body changed. Rate sanity: at most 10 comments per author per minute (insert trigger) — why: a stuck client
    or a script cannot flood a dive.
- **Read RPCs** (security definer, `authenticated` only; they never return notes or anything of a dive the caller cannot see):
  - `social_counts(p_entry_ids uuid[])` → `entry_id, kudos_count, kudoed (by me), comment_count, comments_enabled`, only for
    visible entries, at most 200 ids. Comment count is 0 while comments are off. Why a separate function instead of
    extending `community_entries`: parallel sessions (0006/0009) redefine the read functions; a separate call cannot conflict.
  - `entry_kudos(p_entry_id)` → `member_id, display_name, avatar_preset, avatar_path, created_at` (newest first) of a visible entry.
  - `entry_comments(p_entry_id)` → `id, author_id, display_name, avatar_preset, avatar_path, body, created_at, edited_at`
    oldest first; nothing while comments are off or the entry is not visible.
  - `social_inbox(p_limit)` → `kind ('kudos'|'comment'), entry_id, actor_id, display_name, avatar_preset, avatar_path,
    created_at, excerpt (first 140 chars of a comment), dive_date, site_name, is_new` — events by others on my dives,
    newest first, max 100; comments of dives with comments off are left out.
  - `social_unseen_count()` → integer, the badge: inbox events newer than `social_seen_at`.
  - `social_mark_seen()` → upserts my `seen_at = now()` (server time — why: the client clock may be wrong).
  - `shared_dive_kudos(p_token)` → integer for anon: the kudos count of the `link` dive with that token (same checks as
    `get_shared_dive`), null otherwise. Why separate: `get_shared_dive` belongs to 0009's parallel work.
- Tests: `supabase/tests/0010_social.sql` (+ run twice in `run.sh`): visibility, spoofing, anon, comments off, owner delete,
  column grant, rate limit, private-dive leakage through every function and through the tables.

## Client

- `js/backend/socialStore.js` (`createSocialApi`, mixed into the Supabase store like the community API):
  `socialStatus()` probe (`kudos` table; `PGRST205` → off, cached; transient → unknown), `socialCounts(ids)` → Map,
  `setKudos(entryId, on)`, `listKudos`, `listComments`, `addComment`, `editComment`, `deleteComment`,
  `setCommentsEnabled(entryId, on)`, `socialInbox`, `socialUnseenCount`, `markSocialSeen`, `deleteMySocial()`
  (used by deleteAllMyData). Share store: `kudosCount()`.
- `js/logbook/social.js` (pure, tested): `normalizeComment` (trim, max 1000 code points, `{ok, body, error}`),
  `commentBodyHtml` (escape; line breaks via CSS `white-space: pre-wrap`), `kudosBarHtml`, `kudosListHtml`,
  `relativeTime`, `inboxItemText`, `toggleKudosCounts` (optimistic update).
- `js/logbook/SocialBar.js`: the 👏 button (aria-pressed) + count button (aria-expanded → inline list of avatars + names)
  and 💬 count. Used on feed cards (above the stretched card link: `position: relative; z-index: 1`) and the detail.
  Own dive: no 👏 button, count only. Optimistic toggle, rolled back with a message on failure.
- `js/logbook/CommentsSection.js`: list + composer (textarea, live counter near the limit, Send), per own comment
  Edit / Delete, owner Delete on others'; delete asks inline ("Delete this comment?" Delete / Cancel). Comments off →
  a muted line. Mounted under the detail of own and member dives (not on the share page).
- `EntryDetail`: a ⋯ menu on own dives (when social is available) with "Turn off comments" / "Turn on comments".
- Feed: after a page loads, one `socialCounts` call for its ids; cards render the bar when counts are known.
- New for you: route `#/activity` (`ActivityPage.js`). A bell in the top bar (`.tr-top-end`, both phone and desktop) with a
  badge — why the top bar, not a sixth tab: the phone bottom bar already holds five tabs. Count refreshed on login and on
  route changes (at most once a minute); opening the page lists the inbox (new items highlighted) and then marks seen.
- Share page: "👏 N" line under the title when N > 0 (no names).
- Everything hidden until the probe says 0010 exists (app works unchanged before the migration).
- en/cs/es strings; dark mode via the existing tokens; phone first (44 px targets).

## Privacy text

Members who can see a dive see its kudos (who gave them) and comments; owners can turn comments off and delete any
comment on their dives; the public link shows only the kudos count; deleting all data removes my kudos and comments.

## Adversarial review (Opus) — applied

- `social_seen_at` on profiles was readable by every member → moved to the owner-only `social_seen` table.
- Blank check allowed only-whitespace/zero-width bodies → `btrim` with tabs, line breaks, NBSP, ZWSP, BOM.
- Rate limit bypassable by parallel requests → per-author advisory transaction lock before the count.
- Accepted: owner and author still read a comment through the table while comments are off (needed for delete with a
  filter; their own dive/words; the app shows none). Kudos toggle can re-notify (one live event per member per dive).
  Policy helpers are callable as RPCs but return false for private and missing dives alike.
