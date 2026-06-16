# Repetitive-Dive Trip Planner — Drag-to-Reschedule

**Date:** 2026-06-16
**Status:** Approved design, ready for implementation planning
**Depends on:** the calendar trip planner, branch `feat/calendar-trip-planner-core`.

## Background & Motivation

The calendar renders each dive as a duration-spanning block, but rescheduling is only
possible via the edit panel's date/time field. Direct drag-to-reschedule is the
headline calendar interaction: grab a block, move it to a different time (or day), drop
it. On drop, `planTrip` re-chains the trip so pre-saturation, deco, and conflicts update.

## Goals

- Drag a dive block to a new start time within its day or across day columns.
- Drop snaps the start to a **15-minute** grid, clamped to the visible window.
- A plain click still selects the dive (opens the edit panel); a drag does not.
- After a drop, the trip re-plans (conflicts/pre-saturation update) and the URL persists.

## Non-goals

- Resizing a block to change bottom time (depth/time stay; only start moves).
- Drag-to-create (creation stays click-to-open-dialog).
- Touch-specific gestures beyond what Pointer Events give for free.

## A. Drag mechanics — `js/components/TripCalendar.js`

Pointer Events on the blocks (they're absolutely positioned; HTML5 DnD is awkward here).

- **`pointerdown` on a `.tc-block`** (via the existing delegated container listener, or a
  dedicated pointerdown delegation): record `{ diveId, startClientY, startClientX,
  originColIndex, blockTopPct }`; `setPointerCapture` on the container; set a
  `pendingDrag` state. Do NOT yet treat it as a drag.
- **`pointermove`**: if `Math.hypot(dx, dy) > DRAG_THRESHOLD` (≈4 px), enter drag mode
  (`isDragging = true`, add a `tc-dragging` class to the block). While dragging:
  - Determine the day column under the pointer (`document.elementFromPoint` → closest
    `.tc-day`, or hit-test the known column rects) → `targetDayIndex`.
  - Compute `minutesOfDay` from the pointer Y within that column, **snapped to 15 min**,
    clamped to `[dayStartMin, dayEndMin]`.
  - Reposition the block live: set its `top` to the snapped position and, if the target
    column changed, move the block element into that column. (Optional: show the snapped
    time on the block — a follow-up nicety, not required.)
- **`pointerup`**:
  - If `isDragging`: compute final `startDateTime = toStartDateTime(targetDayIndex,
    snappedMinutesOfDay)` and dispatch **`reschedule`** `{ detail: { diveId, startDateTime } }`.
    Set a `justDragged` flag so the trailing `click` is suppressed.
  - Else (no drag): do nothing here — the normal delegated `click` → `selectDive` fires.
  - Clear drag state.
- The existing delegated **`click`** handler: if `justDragged` is set, consume it (reset
  the flag, return) so a drag doesn't also fire `selectDive`.

A `SNAP_DRAG_MIN = 15` constant. (Click-to-create keeps its existing whole-hour
`SNAP_MIN = 60`.)

This is self-contained: the whole gesture is pointerdown→move→up; no rerender happens
mid-gesture (rerender occurs after the drop, when the page handles `reschedule`).

## B. Click vs drag disambiguation

A movement threshold separates the two. Below threshold → click → `selectDive` (open
edit panel, unchanged). Past threshold → drag → `reschedule`, and the synthetic click is
suppressed via `justDragged` so a reposition doesn't also open the editor.

## C. Page wiring — `sandbox/repetitive-dives.html`

```js
calendar.addEventListener('reschedule', (e) => {
  trip = rescheduleDive(trip, e.detail.diveId, e.detail.startDateTime);
  selectedDiveId = e.detail.diveId;
  rerender();
});
```
`rescheduleDive` already exists in `js/tripState.js`. `rerender` re-plans (pre-saturation,
deco, conflicts) and calls `updateUrlWithTrip` (persists). The dragged block lands at the
snapped slot; overlapping another dive's deco-extended end shows the red conflict.
Import `rescheduleDive` alongside the existing `addDive`/`editDive`/`removeDive`.

## D. Edge cases

- Snap to 15 min; clamp the dropped start within `[dayStartMin, dayEndMin]`.
- Cross-day: the column under the pointer at drop sets the new day index.
- A drop that overlaps another dive is allowed — `planTrip` flags it red (not blocked).
- The delegated `click` must not double-fire after a drag (`justDragged` guard).
- A drag that ends outside any day column (e.g. over the ruler): clamp to the origin
  column / nearest valid column, or cancel (re-render restores the original). Keep it
  simple — if no valid target column, treat as cancel (no `reschedule`, rerender restores).

## E. Testing

- **Unit (`tests/run-tests.mjs`):** if a small pure snap helper is extracted (e.g.
  `snapMinutes(rawMin, snap)` or a position→(dayIndex, minutesOfDay) mapper), unit-test
  it (snaps to 15, clamps to window). Otherwise the math reuses `toStartDateTime` +
  `Math.round(x/15)*15`, covered by smoke.
- **Browser smoke (mandatory):** with Playwright stepped mouse moves —
  - Drag a block to a later time in the same column → `pointerup` reschedules: the dive's
    start changes to the snapped 15-min slot; the block moves; no console errors.
  - Drag a block to a different day column → its day changes.
  - A plain click (mousedown+up, no move) still opens the edit panel (selectDive).
  - Drag a dive on top of another so it starts before the other's deco end → the block
    shows the red `tc-conflict` style after re-plan.
  - The `?trip=` URL updates after a drag (persistence).

## F. Integration / Versioning

- No new module. Bump `CACHE_NAME` in `sw.js` and `.version-number::after` in
  `css/styles.css`. Add a `.tc-dragging` style (e.g. raised/opacity) for drag feedback.
- Wiki: note `TripCalendar` emits a `reschedule` event and supports pointer-drag
  rescheduling (15-min snap), in `Module-Reference.md`.

## Build Order

1. `TripCalendar` pointer-drag → `reschedule` event + `justDragged` click suppression +
   `tc-dragging` feedback (+ a unit test for the snap helper if extracted).
2. Page: handle `reschedule` (→ `rescheduleDive` + `rerender`); CSS for `.tc-dragging`;
   browser smoke; version bump.
3. Wiki.

## Open Questions / To Settle During Planning

- Whether to show a live snapped-time label on the block while dragging (nice-to-have).
- Exact `DRAG_THRESHOLD` (≈4 px) and whether to also require a small time-hold to start
  a drag (probably not — threshold alone is enough).
