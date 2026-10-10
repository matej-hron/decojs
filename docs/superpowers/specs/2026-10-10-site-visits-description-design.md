# Site visits, site link, dive description — design

Date: 2026-10-10 · Branch `feat/sites-visits-description` · Migration `0006_sites_description.sql`

The user was away and asked for autonomous work, so each decision below has a one-line "why".

## 1. Visits on the site page (Sites → a site)

**What.** The site page (`#/site/<id>`) gets three blocks at the top, above the edit form:

1. **Summary card:** the site name, "Site info ↗" (when the site has a link), and stat tiles:
   - visits;
   - visibility near the surface: average and best;
   - visibility at depth: average and best;
   - water temperature range.
   Below the tiles is a short "water by month" strip, one chip per month that has data ("Jun 8–12 °C").
2. **Visits list:** every dive at this place that the user may see, newest first. Each row shows:
   - the diver's avatar and name ("You" for own dives);
   - date, depth, time;
   - visibility near the surface and at depth;
   - water temperature.
   Each row links to the dive (own dive → `#/dive/<id>`, a member's → `#/m/<id>`). The page shows 20 rows, then "Show all (n)".
3. The existing **edit form**, now titled "Edit site", followed by the merge and delete blocks. They are unchanged except for the new link field.
   - *Why this order:* on a phone you look at a site far more often than you edit it.

**Data source.** The page reads only through the existing `community_entries` RPC, page by page (100 rows each, at most 20 pages, so 2000 dives). That RPC already returns the caller's own dives plus members' `members`/`link` dives. It never returns others' private dives or notes, and it returns coordinates only with `share_location`.
- When the community backend is absent (`communityStatus()` false), the page uses the caller's own `listEntries()` + `listSites()` instead.
- The result is cached in the page instance only.
- *Why no new RPC:* it adds no new security surface (the brief asks for the existing read functions), and an invite-only club logs a few thousand dives at most. A server-side filter is a possible later optimisation.

**Which dives count as "at this site"** (pure `visitMatches(row, site)`). Sites are per owner, so a member's dive points at that member's own site row. A dive matches when:
- its `site_id` is this site; or
- its site name equals this site's name after normalisation (trim, case-fold, strip diacritics, collapse whitespace); or
- both positions are known (the member's only when shared) and are at most 200&nbsp;m apart.

Why name **or** position:
- Members name the same quarry slightly differently, or not at all the same.
- 200&nbsp;m is tighter than the 300&nbsp;m the picker uses for "same site", so two different sites rarely merge.
- Hidden coordinates never take part in matching: the client never receives them.

**Stats** (pure `siteVisitStats(rows)`):
- the count;
- for each of `vis_shallow_m` and `vis_deep_m`: mean, maximum and the number of dives that have a value;
- water temperature: overall minimum and maximum, plus per calendar month (1–12) minimum and maximum, from `water_temp_c` and `dive_date`.
Missing values are skipped and never count as 0.

**Privacy.** Nothing beyond what the feed already shows: no notes, no others' log numbers, no hidden coordinates. The description is not shown in the list, to keep it compact.

## 2. Site external link

- `sites.url text`, check `url is null or (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 500)`.
- Edit form: a "Site info link" field (type `url`, `inputmode=url`). It is validated client-side with the existing `isHttpsUrl`; an empty field means null.
- Shown as "Site info ↗" on the site page and on the owner's dive detail, with `target=_blank rel="noopener noreferrer"`.
- **Shared with others only like coordinates** (the owner's own view, or `share_location`): `community_entries.site_url` and `get_shared_dive.site.url`. *Why:* a pasted map link can carry the exact position; the owner already decides about that with "Show the exact location".

## 3. Dive story (`log_entries.description`, visible to members)

User clarification (2026-10-10): the field is the diver's personal story of the dive (how it was, what they saw, what happened), meant to be shared. It is a first-class field:
- Label, also the heading above the story on the detail, member and share pages: en "How was it?", cs "Jaké to bylo?", es "¿Qué tal fue?" (the user's wording; this replaced "Dive story"). Placeholders: "How was the dive? What did you see?" / "Jak se ponor vydařil? Co jste viděli?" / "¿Qué tal la inmersión? ¿Qué viste?"
- A multi-line textarea that grows with the text (CSS `field-sizing: content`, with a scroll-height fallback). Limit 5000 characters, in the form and in the 0006 check.
- Display through `storyHtml`:
  - the text is escaped;
  - a blank line starts a paragraph and single line breaks are kept;
  - `https://` addresses become `rel="noopener noreferrer nofollow ugc"` new-tab links, with trailing punctuation left outside the link.
- Shown as reading text right under the title: on the detail page, the member view and the share page.
- Feed cards show a 2–3 line excerpt (220 characters, plus a 3-line clamp).
- Private Notes stay separate (only you). The rest of this section is unchanged:


- `log_entries.description text`, check `char_length(btrim(description)) between 1 and 5000`.
- **Form:** the "Description (visible to members)" textarea sits right after the buddies, near the top. It has a hint: "Members see this. Keep private thoughts in Notes."
  - "Notes (only you)" moves into **More details**, as its first field. More details opens by itself when the entry has notes.
  - *Why:* this is the brief's layout. Auto-open keeps existing notes from being hidden.
- **Shown:**
  - on the detail page (own and member, above the facts);
  - in the share page (via `EntryDetail`);
  - in the feed card as an excerpt: at most 160 characters, cut at a word boundary with "…", plus a CSS 3-line clamp.
  - Own logbook cards show the description, and fall back to notes only when there is no description. *Why:* the owner already saw notes there, and cards should not go blank for old dives.
- **Read functions:** 0006 redefines `community_entries` (adds `description`, `site_url`; same filters, `security definer`, `search_path = ''`, grants back to `authenticated` only) and `get_shared_dive` (adds `entry.description`, `site.url` gated by `share_location`). Notes are never returned.
- `entryFromCommunityRow` keeps `description` and maps `site_url`. `sharedDiveParts` allow-lists `description` and the site `url`.

## 4. Migration 0006 and graceful degradation

- One transaction. Safe to run again:
  - `add column if not exists`, then drop and re-add each constraint;
  - `drop function if exists` + `create` for `community_entries` (its return type changes);
  - `create or replace` for `get_shared_dive`;
  - re-revoke from `public, anon` and re-grant.
  Ends with `notify pgrst`.
- Docker test `supabase/tests/0006_sites_description.sql`, run by `run.sh`. It covers:
  - the constraints;
  - a member sees another member's description but never notes;
  - `site_url` is null without `share_location`;
  - anon can't call `community_entries`;
  - the share payload has the description and the gated url.
- **Client probe:** `descriptionAvailability()` selects `log_entries.description` with `limit 0`:
  - missing column (`42703`/`PGRST204`/`PGRST205`, or HTTP 400 with "column") → `no`, cached;
  - any other error → `unknown`, not cached.
- **Saving:**
  - with `description` or `url` in the row and status `no`: those keys are stripped and the save goes ahead;
  - with status `unknown`: the save fails with `unreachable`. *Why:* silently dropping text the user typed is worse than a retry.
- **Without 0006:** the form hides the description field and the site form hides the link field (each gets a flag from the app, like `share`). The visits block works without 0006.
- The migration is reviewed adversarially by an Opus subagent. **The user runs it**; this branch stops at that gate.

## 5. Strings, UI and tests

- en/cs/es strings live under `diveLog.logbook.sites.visits.*`, `diveLog.logbook.form.description*` and `diveLog.logbook.sites.url*`.
- Czech strings use a decimal comma and U+00A0 before units.
- Phone first, at 390&nbsp;px:
  - stat tiles in a 2-column grid;
  - visit rows on two lines (who + date / numbers);
  - dark mode through the existing CSS variables.
- **Tests (TDD):**
  - `visitMatches`, `siteVisitStats`, `descriptionExcerpt`;
  - the probe and save-stripping in the store;
  - `entryFromCommunityRow` / `sharedDiveParts` carry the description and never notes;
  - form and site page (jsdom): the description field hidden or shown, the url validated;
  - the visits block renders from a fake store.
