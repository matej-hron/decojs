# Calendar Trip Planner — Edit UX: Selection Fix, Dive Names, Active-Dive

**Date:** 2026-06-15
**Status:** Approved design, ready for implementation planning
**Depends on:** the calendar trip planner (③-core + calendar-UX), branch `feat/calendar-trip-planner-core`.

## Background & Motivation

Testing the calendar surfaced three things:

1. **A real bug:** after editing one dive, clicking another dive's block does NOT
   switch the editor to it — the panel stays on the first dive. Root cause (verified
   by reproduction): committing an edit fires the field's `change`/blur →
   `rerender()` → `calendar.render()` does `container.innerHTML = ''` and rebuilds
   every block. A single click that both commits the edit (blur) and targets another
   block has that block destroyed under it by the rebuild, so the per-block
   `selectDive` handler never fires. The full rebuild on every edit also makes
   editing feel janky (it re-runs `planTrip` and rebuilds every overview chart).
2. **Dives need user-entered names**, not just the internal `d1`/`d2` id.
3. **The editor should clearly reflect the active (selected) dive.**

(The earlier "block size seems relative to depth" was a misread — block height = real
in-water runtime incl. deco, which is correct; the only block tweaks wanted are to
add the time to the label and enforce a minimum height so the label fits.)

## Goals

- Clicking any dive reliably switches the editor to it, even mid-edit.
- Per-dive editable names (default "Dive N"), shown as the label everywhere.
- The selected dive is visually highlighted and named in the edit panel.
- Block label includes the runtime; short dives keep a legible minimum height.
- Editing stays smooth (no chart-rebuild jank on every keystroke).

## Non-goals

- Drag-to-reschedule, chart-mode toggles, URL persistence (still ③-rich/later).
- An explicit "Apply" button — edits stay live (with a debounce on the heavy render).

## A. Selection bug — root-cause fix (defer edit rerender + delegation)

`TripCalendar` currently attaches click listeners to each `.tc-block` and `.tc-day`,
which are destroyed by `innerHTML = ''` on every render. Replace with **delegated
listeners attached once to the persistent `this.container`** (in the constructor,
not per-render):

- Blocks render with `data-dive-id`; day columns with `data-day-index`.
- A single `click` listener on the container: `e.target.closest('.tc-block')` →
  dispatch `selectDive { diveId }`; else `e.target.closest('.tc-day')` (and the
  target is not the `.tc-day-header`) → compute `minutesOfDay` from the click Y
  within that column and dispatch `createAt { dayIndex, minutesOfDay }`.

Delegation is good hygiene, but **verification showed it is not sufficient alone**:
when the edit commits on blur and rerenders the calendar *synchronously during the
click* (`innerHTML=''` rebuilds the block the user is clicking before `mouseup`), the
click→`selectDive` is still broken — a mid-`mousedown` DOM rebuild detaches the
mousedown target so the `click` no longer resolves to the new block.

**The actual fix: defer the edit-triggered rerender.** The page's `apply` (edit)
handler debounces its rerender (~250 ms) so the calendar is NOT rebuilt synchronously
during the blur/click; the selection click completes against the live block, and the
deferred rerender runs afterwards. (This also de-janks editing.) Selection itself
runs on the click — after `mouseup` — where an immediate calendar render is safe and
gives an instant highlight.

The page tracks `let selectedDiveId`. `selectDive` sets it and opens the panel for
that dive; the deferred-on-edit / immediate-on-select rerender keeps everything in
sync.

## B. Active-dive indication

- `TripCalendar.render(planResult, selectedDiveId)` adds a `tc-selected` class to the
  matching block (brighter outline).
- `DiveEditPanel.open(dive, startDate)` shows a header: **"Editing: {name}"** above
  the start-time field, so the active dive is unambiguous.

## C. Dive names

- Each trip dive gains a `name` field. The four seam points:
  - `js/tripState.js` `addDive`: store `fields.name` if provided (the page/dialog
    supplies a default "Dive N"); `editDive` already patches arbitrary fields, so a
    `{ name }` patch works.
  - `js/tripPlanner.js`: echo `name` onto each result dive (like `maxDepth`/
    `bottomTime` already are) so the calendar/overview can label without consulting
    the input trip.
  - `AddDiveDialog`: a **Name** input, pre-filled by the page with `Dive ${n}`.
  - `DiveEditPanel`: a **Name** input → emits `name` in the `apply` patch.
- Default names: the page seeds its initial dives with `name: 'Dive 1'…` and supplies
  `name: 'Dive ${trip.dives.length + 1}'` when opening the add-dialog. Display falls
  back to the id if a name is ever empty.
- The `name` is shown as the label on the **calendar block**, **overview card title**,
  and **detail-view header** (replacing the `d1` id; the id stays internal).

## D. Block label + minimum height

- Block label becomes **"{name} · {maxDepth}m · {runtimeMin}min"** where
  `runtimeMin = round(endDateTime − startDateTime)` from the result dive.
- Add a CSS **`min-height`** to `.tc-block` (e.g. ~2.4em) so the label is always
  legible, even when the true duration would render shorter. (The percentage height
  still drives normal sizing; `min-height` is just a floor.)

## E. Less jank — debounce the heavy re-render

Split the cheap update from the expensive one:

- On every change, recompute `planTrip` and re-render the **calendar** immediately
  (cheap DOM).
- **Debounce** the **overview** re-render (~250 ms) — it disposes/rebuilds N
  `DiveProfileChart` instances and is the expensive part. So rapid edits/switches
  stay smooth; the overview catches up shortly after you pause. The detail view (if
  open) likewise updates on the debounced path.

## Testing

- **Unit (`tests/run-tests.mjs`):** `tripState` — `addDive` stores a provided `name`;
  `editDive` patches `name`; (and `planTrip` echoes `name` onto result dives).
- **Browser smoke (mandatory), including the exact regression:**
  - **Edit-then-switch:** edit dive 1's depth, then click dive 2's block → the panel
    switches to dive 2 (its name/depth/time), NOT dive 1. (This is the bug.)
  - Names: a renamed dive shows the new name on its block, overview card, and detail
    header; the add-dialog has a Name field defaulting to "Dive N".
  - The selected block is visually highlighted; the edit panel header names it.
  - Block labels include the runtime; a short dive still renders at the min height.
  - Editing several fields in quick succession stays responsive (debounce).
  - Zero console errors.

## Integration / Versioning

- No new modules expected (changes are to existing files). Bump `CACHE_NAME` in
  `sw.js` and `.version-number::after` in `css/styles.css` to the same new version.
- Wiki: note `name` on trip dives + the calendar's delegated event handling and
  `render(planResult, selectedDiveId)` signature.

## Build Order

1. Names in data: `tripState` (`name` through add/edit) + `tripPlanner` echo (+ unit
   tests).
2. `TripCalendar`: event delegation (the bug fix) + `tc-selected` highlight + block
   label (name + runtime) + `min-height` CSS.
3. `AddDiveDialog`: Name field (default supplied by page).
4. `DiveEditPanel`: Name field + "Editing: {name}" header.
5. Page wiring: `selectedDiveId`; seed initial dive names; pass `selectedDiveId` to
   the calendar; names in overview/detail labels; debounced overview re-render;
   default name into the add-dialog.
6. Browser smoke (regression-first) + version bump.
7. Wiki.

## Open Questions / To Settle During Planning

- Exact min-height value / whether to also cap the block label to one line with
  ellipsis when very short.
- Whether the overview card and detail header also get the selected highlight (lean:
  name everywhere is enough; highlight just on the calendar block).
