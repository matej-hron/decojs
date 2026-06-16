# Repetitive Planner UX — Master–Detail + Cleaner Labels

**Date:** 2026-06-16
**Status:** Approved design, ready for implementation planning
**Depends on:** the repetitive-dive planner + NDL/invalid features, branch `feat/trip-ux-master-detail` (stacked on `feat/ndl-invalid-and-no-safety-stop`).

## Background & Motivation

Two UX problems in `sandbox/repetitive-dives.html`:

1. **Spatial disconnect.** The page stacks: calendar → an inline edit-panel strip → a **long list of one card-per-dive** (`#panels`, each with its own profile chart) → a hidden full-page detail (`#detail`). Clicking a dive opens the edit strip below the calendar, but that dive's chart is buried somewhere in the middle of the card list. There is no single place that shows "the dive I clicked."

2. **Overloaded block labels.** `Dive 2 · 40m · 88min · stop 9m · TTS 58min` crams five fields with no hierarchy and two bare time numbers (runtime 88, TTS 58) the eye can't disambiguate.

Three independent label-design reviews converged: the two bare time numbers are the core sin; the block's *height already encodes total runtime*, so the number worth printing is **bottom time**; deco should read as one thing ("+N deco"); the surface interval belongs off the block.

## Goals

- Clicking a dive shows its chart + summary + controls **in place**, directly under the calendar — no scroll-hunting.
- The calendar is the single "list of all dives"; the redundant all-cards stack is removed.
- Block labels read cleanly: `name · depth · bottom-time` with a single deco/NDL tag.
- View / edit / delete via a single click + explicit panel controls (discoverable, touch-friendly).

## Non-goals

- Showing every dive's chart simultaneously (the calendar's blocks are the all-dives view).
- Differentiated click gestures (double/right-click) or hover-only affordances.
- Surface-interval labels drawn in the gutter between blocks (possible later; out of scope).
- Changing the deco/tissue maths. This is a presentation/interaction rework.

## A. Page structure — `sandbox/repetitive-dives.html`

Replace the three competing view regions with a master + one detail panel.

**Before:** `#calendar`, `#edit-panel`, `#add-dialog`, `#panels` (all cards), `#detail` (hidden).
**After:** `#calendar`, `#selected` (the one detail panel), `#add-dialog`.

`#panels`, `#edit-panel`, and `#detail` are removed; their behaviour folds into `#selected`.

**Selection state.** A page-level `selectedDiveId`. On every `rerender` (`planTrip` → `calendar.render(lastResult, selectedDiveId)` → `renderSelected(selectedDiveId)`): if `selectedDiveId` is null or no longer present, default to the first dive (`lastResult.dives[0]?.id`) so the panel is never empty. The calendar `selectDive` event sets `selectedDiveId` and rerenders.

## B. The `#selected` panel — `renderSelected(diveId)`

Renders the selected planned dive (`lastResult.dives.find(...)`). Structure:

- **Header row:** `${name} — ${clock}` on the left; on the right two buttons: **✎ Edit** (toggles the inline edit form) and **🗑 Delete** (calls `removeDive` directly — no need to enter edit mode to delete).
- **Summary line** (the details dropped from the block live here): surface interval, depth, bottom time, runtime, deco total, deepest stop, TTS, pre-load %. e.g. `SI 1:45 · 40m · 30min bottom · 88min runtime · +28min deco · first stop 9m · TTS 58min · pre-load 62% (#5)`. For the first dive, "first dive" replaces the SI; "fresh" replaces pre-load. Followed by the existing **pre-saturation strip** (`presatStrip`) when not the first dive.
- **Profile chart:** the existing `DiveProfileChart` built from the dive's `profile.waypoints` (reuse the current `seededSetup` shape), with the existing **mode-toggles** row (`buildModeToggles`).
- **▸ Full analysis** disclosure (a `<details>` or a toggle), collapsed by default. When expanded, lazily build the **M-value chart**, **GF chart**, and **runtime table** below the profile (reusing `MValueChart`, `GFChart`, `buildRuntimeRows`/`renderRuntimeTable`). Keep them out of the DOM/work until first expanded.
- **Edit form (inline):** hidden until **✎ Edit** is toggled. Reuses the existing `DiveEditPanel` (name / start / depth / bottom-time / No-deco lock). Mounted into a sub-container inside `#selected`; opened with `editPanel.open(rawDive, trip.startDate, plannedBottomTime)`.

**Editing state across rerender.** A page-level `editingOpen` boolean (reset to false when `selectedDiveId` changes). `DiveEditPanel`'s `apply` → `editDive(trip, ...)` → `rerenderDeferred()` (the existing 250 ms debounce that prevents the form being rebuilt mid-blur). `renderSelected`, when `editingOpen` is true for the current dive, re-mounts and re-opens the edit form with fresh planned values, so live edits don't collapse it. `DiveEditPanel`'s `remove` and the header **🗑 Delete** both → `removeDive` then select the nearest remaining dive (or none) and `rerender`.

**Invalid dive.** When `d.invalid`, `renderSelected` shows the header (with Edit + Delete), the invalid explanation (`INVALID_NDL_HTML`), and the pre-saturation strip — **no** profile / full-analysis charts (as today). Edit (to unlock) and Delete still function.

**Chart lifecycle.** `renderSelected` disposes any charts from the previous selection before rebuilding (mirror the existing `disposeDetail`/`overviewCharts` dispose pattern) to avoid leaking Chart.js listeners/ResizeObservers. A single `selectedCharts` array holds the profile (+ lazily the M-value/GF) charts.

`reRenderProfiles` (mode-toggle handler) simplifies to: re-call `renderSelected(selectedDiveId)` (there's only one view now).

## C. Calendar labels — `js/components/TripCalendar.js`

Replace the exported `decoLabelSuffix(plannedDive)` with an exported pure `diveBlockLabel(plannedDive)` that returns the **whole** block text:

```js
/**
 * Full calendar-block label for a planTrip result dive.
 * Number shown is bottom time (the block's HEIGHT already conveys total runtime).
 * @param {Object} d - planTrip result dive: { name?, id?, maxDepth, bottomTime, ndlLocked?, invalid?, profile }
 */
export function diveBlockLabel(d) {
    const name = (d && d.name) ? d.name : (d && d.id ? d.id.toUpperCase() : '?');
    const depth = d ? d.maxDepth : '?';
    if (d && d.invalid) return `${name} · ${depth}m · ⚠ no-deco N/A`;
    const bt = d ? Math.round(d.bottomTime) : '?';
    let label = `${name} · ${depth}m · ${bt}min`;
    const deco = (d && d.profile && d.profile.totalDecoTime) || 0;
    if (deco > 0) label += ` · +${Math.round(deco)} deco`;
    else if (d && d.ndlLocked) label += ` · NDL`;
    return label;
}
```

`render` sets `block.textContent = diveBlockLabel(d)` for non-invalid dives; the invalid path is covered by `diveBlockLabel` itself (so the special-case branch added earlier can call it too, or be folded in). The `tc-invalid` class + tooltip logic stays.

Examples:
- no-deco: `Dive 2 · 40m · 22min`
- deco: `Dive 2 · 40m · 30min · +28 deco`
- NDL-locked no-deco: `Dive 2 · 40m · 22min · NDL`
- invalid: `Dive 2 · 40m · ⚠ no-deco N/A`

## D. Engine — `js/tripPlanner.js`

The calendar needs `ndlLocked` to show the `NDL` tag, but the result dive doesn't currently echo it. Add `ndlLocked: !!dive.ndlLocked` to the `results.push({...})` object (and to the `TripDiveResult` typedef). No behavioural change.

## E. Block deco shading (separable enhancement)

Split the block background at the `bottomTime / runtime` fraction so the bottom phase is solid and the ascent+deco portion is a lighter/hatched band — the tall part of a deco block then visually *is* the "+N deco". Implementation: in `TripCalendar.render`, when the dive has deco, set the block's background to a `linear-gradient` whose colour stop is at `round(bottomTime / runtime * 100)%` (solid below, lighter above). Skipped for no-deco dives (solid) and invalid dives (keep the hatched invalid style). This is its own task and may be dropped if it reads noisy; it does not block the rest.

## F. Testing

### Unit — `tests/run-tests.mjs`
- Replace the `decoLabelSuffix` tests with `diveBlockLabel` tests covering: no-deco (`Dive 2 · 40m · 22min`), deco (`… · 30min · +28 deco`), NDL-locked no-deco (`… · 22min · NDL`), invalid (`… · ⚠ no-deco N/A`), and a fallback when `name` is absent (uses `id.toUpperCase()`). Update the import from `decoLabelSuffix` to `diveBlockLabel`.
- `planTrip` echoes `ndlLocked` on result dives (true for a locked dive, false/absent for a normal one).

### Browser smoke (mandatory — Playwright)
- On load: the first dive is auto-selected; `#selected` shows its summary + profile chart; there is no all-cards list (`#panels` gone).
- Click the 2nd then 3rd dive's calendar block → `#selected` updates in place each time to that dive's chart + summary, with no page scroll required and no console errors.
- **✎ Edit** reveals the inline form; changing depth applies and the panel/labels update; the form stays open across the edit (not collapsed).
- **🗑 Delete** removes the dive; selection moves to a remaining dive; the calendar updates.
- **▸ Full analysis** expands the M-value + GF + runtime table; collapsing/re-selecting disposes them without leaking (no console errors over repeated select/expand cycles).
- An invalid dive selected → explanation + pre-sat strip, no charts; Edit + Delete still work.
- Labels read `name · depth · bottom · +N deco` / `· NDL`; deco blocks show the shaded ascent band (if task E included).

## G. Integration / Versioning

- Touched: `sandbox/repetitive-dives.html` (major), `js/components/TripCalendar.js`, `js/tripPlanner.js`, `tests/run-tests.mjs`, inline `<style>` / `css/styles.css`.
- Bump `CACHE_NAME` (`sw.js`) + `.version-number::after` (`css/styles.css`).
- Wiki (`Module-Reference.md`): `TripCalendar` exports `diveBlockLabel` (bottom-time + deco/NDL tag) replacing `decoLabelSuffix`; `planTrip` result echoes `ndlLocked`; note the repetitive page is now master–detail (calendar + single `#selected` panel).

## Build Order

1. Engine + label: `planTrip` echoes `ndlLocked`; `TripCalendar.diveBlockLabel` (replace `decoLabelSuffix`) + render uses it; unit tests. Commit.
2. Page restructure: `#selected` master–detail panel (`renderSelected` with summary + profile + mode toggles + Edit toggle + Delete + Full-analysis disclosure); remove `#panels`/`#edit-panel`/`#detail`; auto-select first dive; selection/editing state + dispose lifecycle. Browser smoke. Commit.
3. Block deco shading (separable). Commit.
4. Version bump + wiki.

## Open Questions / To Settle During Planning

- Whether **Full analysis** is a `<details>` element or a custom toggle button — pick whichever disposes its charts cleanly on collapse.
- Exact summary-line wording/spacing (the content is fixed; the separators are a formatting choice).
- Whether to keep `DiveEditPanel`'s own Remove button when the `#selected` header already has Delete — lean toward hiding the panel's Remove to avoid two delete affordances (the panel gains a `showRemove: false`-style option, or the header Delete is the only one).
