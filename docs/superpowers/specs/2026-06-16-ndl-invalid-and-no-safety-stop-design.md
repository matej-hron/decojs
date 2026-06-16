# Invalid NDL Dives + Safety Stops Off by Default

**Date:** 2026-06-16
**Status:** Approved design, ready for implementation planning
**Depends on:** the repetitive-dive engine + NDL-lock feature, branch `feat/ndl-invalid-and-no-safety-stop` (stacked on `feat/decotengu-repetitive-validation`).

## Background & Motivation

Two issues observed in the repetitive-dive planner:

1. **Degenerate "triangle" NDL dives.** When an NDL-locked dive is heavily pre-saturated
   (e.g. dragged into overlap), its derived NDL drops to ~0. `planTrip` floors the bottom
   time at the descent time to keep the profile renderable, producing a dive with ~0 minutes
   of real bottom time — a triangle in the profile chart. These are misleading: they are not
   genuine no-deco dives (there is no no-deco bottom time at that position). They should be
   marked **invalid**, not drawn as if they were a real dive.

2. **Safety stops obfuscate deco times.** `planTrip` generates profiles with the default
   safety stop enabled. The safety stop (3 min at 5 m) is added to *no-deco* dives via the
   simple-profile path, inflating their runtime by 3 min while deco dives carry deco stops
   instead. The mix makes the calendar's runtime / TTS numbers inconsistent across dives.

## Goals

- An NDL-locked dive whose actual bottom phase is **under 1 minute** is flagged invalid; it is
  rendered as an invalid block with an explanation instead of the misleading triangle profile.
- An invalid dive still chains tissue forward (later dives' pre-saturation stays realistic).
- Safety stops are **disabled** throughout the trip planner; runtimes/TTS reflect pure deco.

## Non-goals

- Flagging custom (non-NDL-locked) dives invalid. The user owns a custom dive's bottom time;
  only auto-derived NDL-locked dives are floored, so only they produce the degenerate case.
- A UI toggle to re-enable safety stops (YAGNI — off, no toggle).
- Changing `generateDecoProfile`/`DEFAULT_SAFETY_STOP` themselves. Only `planTrip`'s call to
  `generateDecoProfile` changes (it passes an explicit `{ enabled: false }`).

## A. Engine — `js/tripPlanner.js`

### A.1 Safety stops off
Change the per-dive `generateDecoProfile(dive.maxDepth, bottomTime, diveGases, gfLow, gfHigh,
undefined, decoOpts)` call so the 6th argument is `{ enabled: false }` instead of `undefined`.
This disables the safety stop for every trip dive (no-deco and deco alike). It does **not**
change `profile.totalDecoTime` (which never counted the safety stop) — only the no-deco dives'
runtime (and therefore the calendar runtime / TTS) shrinks by the former 3-min stop.

### A.2 Invalid NDL-locked dives
In the existing `ndlLocked` branch, after computing `capped` and `descentTime`, detect the
degenerate case and flag it. The actual bottom phase is `capped − descentTime`:

```js
let invalid = false;
let invalidReason = null;
if (dive.ndlLocked) {
    const n2 = (diveGases && diveGases[0]) ? diveGases[0].n2 : N2_FRACTION;
    const ndl = calculateNDL(dive.maxDepth, n2, gfLow / 100, seed).ndl;
    const capped = Number.isFinite(ndl) ? Math.min(ndl, NDL_LOCK_CAP) : NDL_LOCK_CAP;
    const descentTime = dive.maxDepth / 20;
    if (capped - descentTime < 1) {
        // No real no-deco dive exists at this position (too pre-saturated). Still floor the
        // bottom time so a (minimal) profile is generated for tissue continuity, but flag the
        // dive invalid so the UI shows an explanation instead of the degenerate triangle.
        invalid = true;
        invalidReason = 'ndl-too-short';
    }
    bottomTime = Math.max(capped, descentTime);
}
```

The profile is still generated at the floored `bottomTime` (so `endTissue` flows to later
dives). Add `invalid` and `invalidReason` to the pushed result object:

```js
results.push({
    id: dive.id, name: dive.name,
    startDateTime: dive.startDateTime, endDateTime,
    maxDepth: dive.maxDepth, bottomTime,
    surfaceIntervalBefore, startingTissue, endTissue, profile,
    invalid, invalidReason,
});
```

`invalid` is a **result-dive flag**, NOT a `conflicts` entry — `computeCalendarLayout` derives
the `tc-conflict` style from the `conflicts` array, and an invalid dive needs its own distinct
style. (A dive can be both overlapping *and* invalid; the styles may coexist, invalid taking
visual precedence.) Non-locked dives get `invalid: false`.

## B. Calendar — `js/components/TripCalendar.js`

In `render`, the block already has the planned dive `d = byId.get(b.diveId)`. When `d.invalid`:
- Add a `tc-invalid` class to the block (alongside the existing conflict/selected classes).
- Set the label to `${name} · ${depth}m · ⚠ no-deco N/A` (no `decoLabelSuffix`, no runtime).
- Set the block `title` to a short tooltip, e.g. `No-deco not possible here — too pre-saturated`.

Valid dives are unchanged (`name · depth · runtime` + `decoLabelSuffix`).

Add a `.tc-invalid` rule to the calendar/page CSS: a distinct invalid look (e.g. hatched or
muted-red background, dashed border) clearly different from `.tc-conflict`.

## C. Overview + Detail — `sandbox/repetitive-dives.html`

A small shared helper string/markup for the invalid explanation:
> *No-deco dive not possible here — too pre-saturated. Move it later or unlock to a custom dive.*

### C.1 Overview cards (`renderOverview`)
For a dive with `d.invalid`, render the card header (name, SI line, etc.) as today but, instead
of constructing the `DiveProfileChart` (which would draw the triangle), place the invalid
explanation markup in the chart host. Do not push a chart into `overviewCharts` for that dive.
Keep the "View detail →" button (detail shows the explanation + pre-saturation strip).

### C.2 Detail view (`showDetail`)
For a dive with `d.invalid`, render the header + SI line + the pre-saturation strip (which
visually explains *why* it is invalid — the diver is heavily loaded), then the invalid
explanation, and **skip** the profile / M-value / GF / runtime charts entirely (do not
construct those chart objects). Valid dives render exactly as today.

This keeps all chart construction guarded so no degenerate (triangle) chart is ever built.

## D. Testing

### Unit — `tests/run-tests.mjs` (custom runner)
`tripPlanner`:
- An NDL-locked dive forced into overlap (NDL ≈ 0) → `result.dives[k].invalid === true`,
  `invalidReason === 'ndl-too-short'`, and the dive still has a populated `endTissue`
  (chaining preserved — assert it differs from the surface-equilibrium baseline).
- A normal NDL-locked first dive (ample bottom time, e.g. 30 m) → `invalid === false`.
- A non-locked dive → `invalid === false`.
- **Safety stop off:** a no-deco trip dive's `profile.waypoints` contain no 5 m / 3-min
  safety-stop segment (assert no waypoint sits at depth 5 for a 3-min span / the runtime equals
  descent + bottom + direct ascent). Compare a planTrip no-deco dive's runtime to the same dive
  generated with `generateDecoProfile(..., { enabled: false })` directly — they match.

### Browser smoke (mandatory — Playwright)
- Add an NDL-locked dive, drag it into overlap → its calendar block shows the `tc-invalid`
  style and the `⚠ no-deco N/A` label (not a stop/TTS suffix); opening it shows the explanation
  and the pre-saturation strip, with **no** triangle profile chart and no console errors.
- A deco dive's calendar TTS no longer includes the former 3-min safety stop (compare a no-deco
  dive's runtime before/after is 3 min shorter, or just confirm no 5 m/3-min stop in its detail
  runtime table).
- A normal (valid) NDL dive and a normal deco dive still render their charts as before.

## E. Integration / Versioning

- Touched files: `js/tripPlanner.js`, `js/components/TripCalendar.js`,
  `sandbox/repetitive-dives.html`, `css/styles.css` (or the page's inline `<style>` where the
  `.tc-*` and card rules live), plus tests.
- Bump `CACHE_NAME` in `sw.js` and `.version-number::after` in `css/styles.css`.
- Wiki (`Module-Reference.md`): `planTrip` disables safety stops for trip dives and flags an
  NDL-locked dive `invalid` (with `invalidReason: 'ndl-too-short'`) when its actual bottom phase
  is under 1 min; `TripCalendar` renders such dives with a `tc-invalid` style.

## Build Order

1. Engine: `planTrip` safety-stop-off + invalid detection/flag (+ unit tests). Commit.
2. Calendar: `tc-invalid` style + invalid label/tooltip. Commit.
3. Page: overview + detail guards (explanation instead of charts for invalid dives). Browser
   smoke. Commit.
4. Version bump + wiki.

## Open Questions / To Settle During Planning

- Exact `.tc-invalid` visual (hatched vs muted-red vs dashed) — pick one clearly distinct from
  `.tc-conflict` during implementation; not a behavioural decision.
- Whether the overview card for an invalid dive keeps the mode-toggles strip (it is meaningless
  without a chart) — drop it for invalid cards.
