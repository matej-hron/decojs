# NDL-Locked Dives + Deco in Calendar Labels

**Date:** 2026-06-16
**Status:** Approved design, ready for implementation planning
**Depends on:** the calendar trip planner, branch `feat/ndl-locked-dives` (stacked on `feat/calendar-trip-planner-core`).

## Background & Motivation

The add-dive dialog has a **No-deco** mode that sets a dive's bottom time to the
pre-saturation-aware NDL *at creation time*. But that value is then frozen: if the
dive is later moved — dragged to a new slot, re-timed in the edit panel, or pushed
into more pre-saturation by a change to an *earlier* dive — its stored bottom time no
longer matches the NDL at the new position. A dive the user intended to keep within
no-deco limits silently becomes a deco dive (or wastes available bottom time).

The fix: a dive can **remember** that it is an NDL dive. When it does, the engine
derives its bottom time = the current pre-saturation-aware NDL on every re-plan, so it
stays a no-deco dive no matter how it moves.

Separately, the calendar block labels show only `name · depth · runtime`. Adding the
**deepest deco stop + time-to-surface (TTS)** gives an at-a-glance read of how heavy
each dive's deco obligation is.

## Goals

- A dive created via the add-dialog's No-deco mode is flagged `ndlLocked` and remembers it.
- `planTrip` derives an `ndlLocked` dive's bottom time = pre-saturation-aware NDL at its
  position, on every plan — robust to drag, edit, depth/gas change, and upstream changes.
- The per-dive edit panel exposes the lock as a toggle and shows the derived bottom time
  read-only while locked; unchecking converts the dive to a custom (free bottom-time) dive.
- Calendar blocks with deco show `· stop {deepest}m · TTS {tts}min` appended to the label.
- The `ndlLocked` flag survives reload via the `?trip=` URL.

## Non-goals

- Changing how NDL itself is computed (`calculateNDL` is unchanged).
- Locking by deco obligation (e.g. "max 20 min deco") — only NDL (zero-deco) locking.
- Resizing blocks by drag (bottom time is derived for locked dives, typed for custom).
- A trip-wide "make all dives no-deco" action (YAGNI; per-dive only).

## A. Data model — the `ndlLocked` flag

A trip dive gains an optional boolean **`ndlLocked`**:

```js
{ id, name, startDateTime, maxDepth, bottomTime, gases, ndlLocked? }
```

- When `ndlLocked` is `true`, the stored `bottomTime` is **ignored by the engine** and
  the effective bottom time is derived (Section B). The stored value is kept only as a
  harmless fallback / last-known echo.
- When `ndlLocked` is absent or `false`, behaviour is exactly as today (custom bottom time).

`addDive` / `editDive` in `js/tripState.js` already spread arbitrary fields, so **no
reducer change is needed** — the flag flows through `addDive(trip, {... , ndlLocked})`
and `editDive(trip, id, { ndlLocked })`.

## B. Engine — `planTrip` derives the bottom time — `js/tripPlanner.js`

The headline change. Inside the per-dive loop, the existing code computes `seed`
(the carried-in / pre-saturated tissue state) *before* generating the profile. Right
after `seed` is known and `diveGases` is resolved, derive the bottom time:

```js
const NDL_LOCK_CAP = 99; // module constant

// ...inside the loop, after diveGases is resolved:
let bottomTime = dive.bottomTime;
if (dive.ndlLocked) {
  const n2 = (diveGases && diveGases[0]) ? diveGases[0].n2 : N2_FRACTION;
  const ndl = calculateNDL(dive.maxDepth, n2, gfLow / 100, seed).ndl;
  bottomTime = Number.isFinite(ndl) ? Math.min(ndl, NDL_LOCK_CAP) : NDL_LOCK_CAP;
}
```

Then use the local `bottomTime` (not `dive.bottomTime`) for `generateDecoProfile(...)`
and in the pushed result object's `bottomTime` field, so the calendar and edit panel
display the derived value.

Notes:
- `seed` is `null` for the first dive → `calculateNDL(depth, n2, gf, null)` uses the
  surface-saturated default, matching the dialog's first-dive NDL preview. No special case.
- `gfLow` is already in scope in `planTrip` (it is used for `generateDecoProfile`), so the
  derived NDL uses the same GF Low as the rest of the plan and as `previewNdl`.
- Add `calculateNDL` to the existing import from `./decoModel.js`.
- **∞ NDL (very shallow dive):** `calculateNDL` returns `Infinity`; cap the locked bottom
  time at `NDL_LOCK_CAP = 99` minutes.

Why engine-side (not handler-side recompute): a locked dive's correct bottom time depends
on its carried-in pre-saturation, which changes whenever *anything before it* changes.
Deriving inside `planTrip` makes the lock correct for every re-plan path with a single
code site; recomputing in each event handler would miss upstream changes and scatter the
logic (and `previewNdl` itself calls `planTrip`, so handler-side recompute is circular-ish).

## C. Add-dialog emits the flag — `js/components/AddDiveDialog.js`

The dialog already has the Custom/No-deco radio (`modeCustom = el('.ad-mode-custom')`) and
already derives the NDL for display. The only change is the emitted `add` detail:

```js
const detail = { name, startDateTime, maxDepth, bottomTime, gases: opts.gases,
                 ndlLocked: !modeCustom.checked };
```

`!modeCustom.checked` is `true` exactly when the No-deco radio is selected. For a custom
dive `ndlLocked` is `false`. The page's `add` handler already does
`trip = addDive(trip, e.detail)`, so the flag is stored with no page change.

## D. Edit panel — lock toggle + read-only derived time — `js/components/DiveEditPanel.js`

Add a **"No-deco (NDL-locked)"** checkbox to the panel header row, bound to
`dive.ndlLocked`.

- **Open signature gains a third arg:** `open(dive, startDate, plannedBottomTime)`. The
  raw `dive.bottomTime` can be stale for a locked dive, so the page passes the *planned*
  dive's bottom time (from `lastResult.dives`) for display.
- **Checkbox checked (locked):** the quick-setup bottom-time input (`quickTime`) is
  `disabled` and its value is set to `plannedBottomTime` (the derived NDL). The depth input
  stays editable — editing depth re-derives the NDL on the next plan automatically.
- **Checkbox unchecked (custom):** `quickTime` is enabled and editable, seeded with the
  current value; the dive becomes a normal custom dive on apply.
- **Toggling the checkbox** flips the disabled state and (when locking) resets `quickTime`'s
  displayed value to `plannedBottomTime`, then emits `apply`.
- **`emitApply` includes the flag:** read the checkbox into `ndlLocked` and add it to the
  patch:
  ```js
  const ndlLocked = this.container.querySelector('.dep-ndl-lock').checked;
  // ...patch: { startDateTime, maxDepth, bottomTime, gases, name, ndlLocked }
  ```
  When locked, `bottomTime` in the patch is the read-only derived value (harmless; the
  engine re-derives anyway). When unlocked, it is the user-typed value.

The page (`sandbox/repetitive-dives.html`) updates its `open(...)` call sites and its
`selectDive` handler to pass `plannedBottomTime` from the last plan result for the selected
dive (`lastResult.dives.find(d => d.id === id)?.bottomTime`).

## E. Calendar labels — deepest stop + TTS — `js/components/TripCalendar.js`

In `render`, the block label is currently:

```js
block.textContent = `${name} · ${depth}m · ${runtime}min`;
```

Append a deco segment **only when the planned dive has deco stops**:

```js
let label = `${name} · ${depth}m · ${runtime}min`;
const stops = (d && d.profile && d.profile.decoStops) || [];
if (stops.length > 0) {
  const deepest = Math.max(...stops.map(s => s.depth));
  const tts = Math.round((d.endDateTime - d.startDateTime) - d.bottomTime);
  label += ` · stop ${deepest}m · TTS ${tts}min`;
}
block.textContent = label;
```

- `deepest` = the deepest required deco stop depth (metres).
- `tts` (time-to-surface) = total runtime − bottom time = ascent travel + all stop time.
- No-deco dives (`decoStops` empty) keep today's label unchanged.

Consider extracting a small pure helper `decoLabelSuffix(plannedDive)` (returns `''` or
` · stop …m · TTS …min`) so the deepest-stop/TTS math is unit-testable without the DOM.

## F. Persistence — `js/tripUrl.js`

`encodeTrip` / `decodeTrip` use a per-dive field whitelist, so the flag must be added to
both:

- **`encodeTrip`:** in the per-dive `dive` object, add `if (d.ndlLocked) dive.ndlLocked = true;`
  (write only when set, to keep URLs short).
- **`decodeTrip`:** in the per-dive map, add `ndlLocked: d.ndlLocked === true` (defaults to
  `false` for older/short URLs).

Reload then preserves the lock.

## G. Testing

### Unit — `tests/run-tests.mjs` (custom runner, NOT Jest)

`tripPlanner`:
- A single locked dive's derived `bottomTime` equals `calculateNDL(depth, n2, gfLow, null).ndl`
  (surface-saturated, first position).
- Two identical locked dives a short surface interval apart: the **second** dive's derived
  `bottomTime` is strictly **less** than the first's (pre-saturation shortens NDL).
- A shallow locked dive whose NDL is `Infinity` (e.g. 10 m on air) derives `bottomTime === 99`
  (the cap).
- A non-locked dive is unaffected (derived `bottomTime === dive.bottomTime`).

Label helper (if `decoLabelSuffix` is extracted):
- A planned dive with deco stops returns ` · stop {max-depth}m · TTS {round(runtime-bottom)}min`.
- A planned dive with no stops returns `''`.

### Browser smoke (mandatory) — Playwright against `sandbox/repetitive-dives.html`

- Add a **No-deco** dive at 30 m as the first dive → its block shows a sensible NDL bottom
  time; the `?trip=` URL contains the encoded flag.
- Drag that dive later, onto another dive's pre-saturation tail → its **bottom time shrinks**
  and the block relabels (and `planTrip` re-derived it). No console errors.
- Open the dive in the edit panel → the **No-deco (NDL-locked)** checkbox is checked and the
  bottom-time field is read-only showing the derived NDL.
- Uncheck the lock → the bottom-time field becomes editable; the dive is now custom (moving it
  no longer changes its bottom time).
- A dive deep/long enough to incur deco shows `· stop {n}m · TTS {n}min` on its calendar block;
  a no-deco dive does not.
- Reload the page (same URL) → the locked dive is still locked (flag round-tripped).

## H. Integration / Versioning

- No new module. Touched files: `js/tripPlanner.js`, `js/components/AddDiveDialog.js`,
  `js/components/DiveEditPanel.js`, `js/components/TripCalendar.js`, `js/tripUrl.js`,
  `sandbox/repetitive-dives.html`, plus tests.
- Bump `CACHE_NAME` in `sw.js` and `.version-number::after` in `css/styles.css`.
- Wiki (`Module-Reference.md`): note `planTrip` derives bottom time for `ndlLocked` dives,
  and `TripCalendar` block labels show deepest deco stop + TTS when a dive incurs deco.

## Build Order

1. **Engine + model:** `planTrip` derives bottom time for `ndlLocked` dives (cap 99);
   `tripUrl` encode/decode the flag. Unit tests. Commit.
2. **Add-dialog:** emit `ndlLocked`. Smoke that a No-deco add stores it. Commit.
3. **Calendar labels:** deepest-stop + TTS suffix (extract `decoLabelSuffix`, unit-test).
   Commit.
4. **Edit panel:** lock checkbox + read-only derived time + page `plannedBottomTime` wiring.
   Browser smoke (drag-shrinks, toggle-unlocks). Commit.
5. Version bump + wiki.

## Open Questions / To Settle During Planning

- Whether `decoLabelSuffix` lives in `TripCalendar.js` (exported) or a tiny shared util.
  Leaning: export from `TripCalendar.js`, mirroring the existing `snapClamp` helper.
- Exact phrasing/abbreviation in the label (`stop` vs `⏹`, `TTS` vs `↑`). Plain text
  (`stop`, `TTS`) chosen for clarity; revisit only if the block gets visually crowded.
