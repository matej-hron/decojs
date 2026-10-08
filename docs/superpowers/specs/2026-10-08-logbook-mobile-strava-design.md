# Logbook: phone overhaul and Strava-inspired dive feed

Date: 2026-10-08 · Branch: `feat/logbook-mobile-strava` · Status: approved (autonomous run, gates pre-approved)

## What the user said

- "not the best on phone"
- "the list is broken for many alternatives" (Tiles / List / Table and select mode on narrow screens)
- "there is work on the page to look good on phone overall"
- "please inspire from Strava — even on the list we should show some nice pics or map"

## Goal and success criteria

1. The main list is an activity feed: each dive is a card with big stats and a visual (photo, else site map, else
   depth profile). It looks good at 360–390 px and on desktop.
2. Every logbook screen works on a phone: no horizontal page scroll at 360 px, touch targets ≥ 44 px, safe-area
   insets respected, readable type (inputs ≥ 16 px so iOS does not zoom).
3. i18n parity (en/cs/es), notation rules (NBSP between number and unit, decimal comma in Czech), dark mode
   (`data-theme="dark"`), existing tests green, new pure helpers tested.

Out of scope: `js/charts/*` (another session), Supabase migrations, version bump, merging.

## Decisions (each with its why)

| # | Decision | Why |
|---|----------|-----|
| D1 | Views become **Feed · Tiles · Table**. Feed replaces List and is the default; a stored `list` preference migrates to `feed`. | Feed does everything List did (month groups, facts, notes, buddies) plus the visual; three views are enough. |
| D2 | Feed card: header (number badge, title = site name or "Dive #n", date + time), stat row, buddies/tags, two-line notes, then a full-bleed **visual** at the bottom. | Strava's layout: text first, map/photo underneath; a phone scrolls through the visual without it hiding the facts. |
| D3 | Visual priority: first photo → Mapy.com static map of the site → depth profile ("water column" area) → none. A photo with siblings shows a "+n" chip. | Photos are the most personal; a map is the next most recognizable; the profile is always available for computer dives. |
| D4 | Static map: `https://api.mapy.com/v1/static/map` (outdoor mapset, zoom 12, marker in brand colour, `scale` 2 on HiDPI, jpg, UI language). The image carries the Mapy.com logo and attribution itself. If the key is empty or the image fails, fall back to the profile (or no visual). | Verified the endpoint answers 200 with the logo baked in; no Leaflet per card (dozens of live maps would be heavy). |
| D5 | Tiles become a gallery: 2 columns at 360 px, every tile has a visual (photo → map → profile → large depth number). | The tiles were text boxes that duplicated List; a gallery earns its place for browsing photos. |
| D6 | Table stays; it scrolls inside its own box, the number column is sticky. | Power-user view for sorting; must never widen the page. |
| D7 | Top bar: title "Your dives" + totals line (dive count, time underwater, deepest), Sites link, and a "⋯" menu (`<details>`) holding Upload DIVELOG, Export, the account e-mail and Log out. "New dive" is a button in the bar on desktop and a floating button (safe-area aware) on phones. | Five equal buttons wrapped into three rows on a phone; rare actions belong in a menu. |
| D8 | Select mode on phones: the selection bar sticks to the bottom of the screen (count, All, None, Delete…, Cancel) and the floating New dive button hides. Checkbox sits in the card header. | Reachable with the thumb and visible while scrolling a long list. |
| D9 | Dive detail: back + Edit in a compact top row, Fraunces title (site or "Dive #n"), sub-line with number/date/time, the same stat style in a 2-column (phone) / 4-column grid, then map, photos (3 columns on phone), notes, more details, actions (2-column grid on phone, Delete separated). | Same visual language as the feed; actions do not form a ragged wrap. |
| D10 | Forms, new-dive flow, sites page, site picker: 16 px inputs, full-width action buttons on phones, picker honours safe areas. No logic changes. | Polish only; behaviour is tested already. |
| D11 | On the logbook (logged in), the page hero subtitle is hidden on phones and the hero is compact. | The subtitle describes the analysis tool and pushes the list below the fold. |
| D12 | New pure helpers live in `js/logbook/feed.js` (titles, stats, visual choice, totals, view migration, photo index) and `geo.js` (`mapyStaticMapUrl`); `listViews.js` gains `profileAreaPath`. All tested in `tests/logbook.test.mjs`. | Keeps `LogbookApp.js` from growing logic; matches the existing pure-helper pattern. |

## Components and data flow

- `LogbookApp._showList` already loads entries, sites and photo media. It now keeps, per entry, the first photo path
  and the photo count (`photoIndex`) and the signed URL of the first photo.
- Rendering: `_feedCard(entry)`, `_tile(entry)`, `_renderTable()` (kept), `_renderBar()` (new layout), `_visual(entry, size)`
  returns the visual HTML using `chooseVisual`.
- Profiles: the existing lazy sparkline loader (IntersectionObserver, 3 concurrent `loadDive`) now serves every
  `.lb-spark[data-rec]` slot in Feed and Tiles; a slot with `data-area` is painted as a filled water column.
- Map images: `<img loading="lazy">`; a capturing `error` listener on the view swaps a failed map for the profile slot.

## Error handling

- Missing site position, missing key, failed map image → profile; no recording → no visual (Feed) or depth number (Tiles).
- Signed photo URL failure already logs and falls back to no photo.

## Testing

- Unit (node:test): `mapyStaticMapUrl`, `diveTitle`, `feedStats` (Czech decimal comma, NBSP), `chooseVisual`,
  `logbookTotals`, `formatTotalTime`, `migrateView`, `photoIndex`, `profileAreaPath`.
- jsdom: existing select-mode test updated for the `feed` view name and card classes; new test that the feed renders a
  map image for a positioned site and a photo when one exists.
- Browser: harness with an in-memory store (scratchpad, not committed) at 390×844 and desktop, light and dark,
  every route. The user's real data cannot be reached from the automation browser (no session); noted in REPORT.md.
