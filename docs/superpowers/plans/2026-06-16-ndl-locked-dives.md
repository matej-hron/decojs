# NDL-Locked Dives + Deco in Calendar Labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dive can be flagged "NDL-locked" so the engine always derives its bottom time = the pre-saturation-aware NDL at its current position; and calendar blocks show deepest deco stop + time-to-surface.

**Architecture:** Add an optional `ndlLocked` boolean to a trip dive. `planTrip` (the single re-plan site) derives that dive's bottom time from the carried-in tissue seed via `calculateNDL`, capped at 99 min. The add-dialog emits the flag, the edit panel toggles it (read-only derived time while locked), `tripUrl` persists it, and `TripCalendar` appends a `· stop Xm · TTS Ymin` suffix for dives that incur deco.

**Tech Stack:** Pure ES modules (no build step). Custom test runner at `tests/run-tests.mjs` (`node tests/run-tests.mjs`, NOT Jest). Playwright for browser smoke.

**Spec:** `docs/superpowers/specs/2026-06-16-ndl-locked-dives-design.md`

**Branch:** `feat/ndl-locked-dives` (already created, stacked on `feat/calendar-trip-planner-core`).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `js/tripPlanner.js` | Chains the trip; per-dive deco. | Derive `bottomTime` for `ndlLocked` dives (cap 99). |
| `js/tripUrl.js` | Trip ↔ URL (whitelist fields). | Encode/decode `ndlLocked`. |
| `js/components/AddDiveDialog.js` | Add-dive dialog. | Emit `ndlLocked` in `add` detail. |
| `js/components/TripCalendar.js` | Calendar render + drag. | Export `decoLabelSuffix`; append to block label. |
| `js/components/DiveEditPanel.js` | Per-dive editor. | Lock checkbox + read-only derived time; `open(dive, startDate, plannedBottomTime)`; emit `ndlLocked`. |
| `sandbox/repetitive-dives.html` | Page wiring. | Pass `plannedBottomTime` into `editPanel.open`. |
| `tests/run-tests.mjs` | All unit tests. | New `planTrip` lock tests, `tripUrl` round-trip test, `decoLabelSuffix` tests. |
| `sw.js`, `css/styles.css` | Versioning. | Bump cache name + version number. |
| `wiki/Module-Reference.md` | Dev wiki. | Document the two behaviours. |

---

## Task 1: Engine derives bottom time for NDL-locked dives

**Files:**
- Modify: `js/tripPlanner.js`
- Test: `tests/run-tests.mjs` (append inside the existing `describe('tripPlanner - planTrip', ...)` block, after the last test, before its closing `});` near line 2900+ — find the block that opens at line ~2768)

- [ ] **Step 1: Write the failing tests**

In `tests/run-tests.mjs`, find the `describe('tripPlanner - planTrip', () => {` block (opens ~line 2768). Inside it (after the existing tests, before the block's closing `});`), add:

```javascript
    test('an ndlLocked first dive derives bottomTime = surface-saturated NDL', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 5, ndlLocked: true }]
        };
        const trip = planTrip(setup);
        const expected = calculateNDL(30, gases[0].n2, 1.0, null).ndl;
        // bottomTime is derived, ignoring the stored placeholder of 5.
        expect(trip.dives[0].bottomTime).toBe(Math.min(expected, 99));
    });

    test('an ndlLocked dive shortens when pre-saturated (later position)', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,   maxDepth: 30, bottomTime: 20 },
                { id: 'd2', startDateTime: 120, maxDepth: 30, bottomTime: 5, ndlLocked: true }
            ]
        };
        const trip = planTrip(setup);
        const lockedAfter = trip.dives.find(d => d.id === 'd2').bottomTime;
        const surfaceNdl = calculateNDL(30, gases[0].n2, 1.0, null).ndl;
        // Pre-saturation from d1 leaves d2 with a strictly shorter NDL than fresh.
        expect(lockedAfter).toBeLessThan(Math.min(surfaceNdl, 99));
    });

    test('an ndlLocked very-shallow dive caps bottomTime at 99', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 10, bottomTime: 5, ndlLocked: true }]
        };
        const trip = planTrip(setup);
        // calculateNDL(10m) is effectively infinite → capped.
        expect(trip.dives[0].bottomTime).toBe(99);
    });

    test('a non-locked dive keeps its stored bottomTime', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 17 }]
        };
        const trip = planTrip(setup);
        expect(trip.dives[0].bottomTime).toBe(17);
    });
```

Note: `calculateNDL` and `planTrip` are already imported at the top of `tests/run-tests.mjs` (lines ~170 and ~186); `gases` is the const defined at the top of this `describe` block.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -A2 "ndlLocked"`
Expected: the three locked-dive tests FAIL (derived bottomTime not implemented; `planTrip` currently echoes the stored `bottomTime`, so e.g. the cap test gets `5` not `99`). The "non-locked" test passes.

- [ ] **Step 3: Implement the derivation in `planTrip`**

In `js/tripPlanner.js`, update the import on line 12 to add `calculateNDL`:

```javascript
import { calculateTissueLoading, simulateDepthTime, calculateNDL, N2_FRACTION } from './decoModel.js';
```

Add a module constant just below the imports (after line 12, before the JSDoc/`export function planTrip`):

```javascript
/** Cap for an NDL-locked dive whose NDL is effectively infinite (very shallow). */
const NDL_LOCK_CAP = 99;
```

Inside `planTrip`'s `ordered.forEach((dive, i) => {` loop, the existing code computes `seed` and then `const diveGases = dive.gases ?? gases;`. Immediately after the `diveGases` line, insert the derivation and switch every later use of `dive.bottomTime` to the local `bottomTime`:

```javascript
        const diveGases = dive.gases ?? gases;

        // NDL-locked dives derive their bottom time from the carried-in pre-saturation,
        // so they stay no-deco wherever they are scheduled. seed === null on the first
        // dive ⇒ surface-saturated NDL (matches the add-dialog preview).
        let bottomTime = dive.bottomTime;
        if (dive.ndlLocked) {
            const n2 = (diveGases && diveGases[0]) ? diveGases[0].n2 : N2_FRACTION;
            const ndl = calculateNDL(dive.maxDepth, n2, gfLow / 100, seed).ndl;
            bottomTime = Number.isFinite(ndl) ? Math.min(ndl, NDL_LOCK_CAP) : NDL_LOCK_CAP;
        }

        const decoOpts = seed ? { initialTissuePressures: seed } : {};
        const profile = generateDecoProfile(
            dive.maxDepth, bottomTime, diveGases, gfLow, gfHigh, undefined, decoOpts
        );
```

Then in the `results.push({ ... })` object, change `bottomTime: dive.bottomTime,` to:

```javascript
            bottomTime,
```

(That is, echo the derived value. Leave `maxDepth: dive.maxDepth` as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -5`
Expected: all tests pass (the four new ones included); the suite total increases by 4.

- [ ] **Step 5: Commit**

```bash
git add js/tripPlanner.js tests/run-tests.mjs
git commit -m "feat(trip): derive bottom time for NDL-locked dives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Persist the `ndlLocked` flag in the trip URL

**Files:**
- Modify: `js/tripUrl.js`
- Test: `tests/run-tests.mjs` (inside `describe('tripUrl - encode/decode', ...)`, opens ~line 3225)

- [ ] **Step 1: Write the failing test**

Inside the `describe('tripUrl - encode/decode', () => {` block, add:

```javascript
    test('round-trips the ndlLocked flag', () => {
        const trip = {
            startDate: '2026-06-15', dayCount: 2, gfLow: 100, gfHigh: 100,
            gases: [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }],
            dives: [
                { id: 'd1', name: 'A', startDateTime: 540, maxDepth: 30, bottomTime: 20, ndlLocked: true },
                { id: 'd2', name: 'B', startDateTime: 1980, maxDepth: 18, bottomTime: 40 }
            ]
        };
        const back = decodeTrip(encodeTrip(trip));
        expect(back.dives[0].ndlLocked).toBe(true);
        expect(back.dives[1].ndlLocked).toBe(false);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 "round-trips the ndlLocked"`
Expected: FAIL — `back.dives[0].ndlLocked` is `undefined`, not `true`.

- [ ] **Step 3: Implement encode + decode**

In `js/tripUrl.js`, inside `encodeTrip`'s `dives: (trip.dives || []).map(d => { ... })`, after the existing per-dive-gas `if (...) dive.gases = ...;` line and before `return dive;`, add:

```javascript
            if (d.ndlLocked) dive.ndlLocked = true; // store only when set, to keep URLs short
```

In `decodeTrip`'s `const dives = m.dives.map((d, i) => ({ ... }))`, add a field to the returned object (after `gases: ...`):

```javascript
            ndlLocked: d.ndlLocked === true
```

(So the object becomes `{ id, name, startDateTime, maxDepth, bottomTime, gases, ndlLocked }`. Add a comma after the `gases:` line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | grep -A2 "round-trips the ndlLocked"`
Expected: PASS (no error line printed under it).

- [ ] **Step 5: Commit**

```bash
git add js/tripUrl.js tests/run-tests.mjs
git commit -m "feat(trip-url): persist the ndlLocked flag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add-dialog emits the `ndlLocked` flag

**Files:**
- Modify: `js/components/AddDiveDialog.js:78`

No unit test (DOM dialog; covered by the browser smoke in Task 5). The change is one field.

- [ ] **Step 1: Add the flag to the emitted detail**

In `js/components/AddDiveDialog.js`, the `el('.ad-add').addEventListener('click', ...)` handler builds `const detail = { name, startDateTime, maxDepth, bottomTime, gases: opts.gases };` (line 78). The handler already has `modeCustom` in scope? No — `modeCustom` is defined in `refresh`'s closure scope at line 48 (`const modeCustom = el('.ad-mode-custom');`), which is the `open()` body, so it IS in scope in the click handler. Change line 78 to:

```javascript
            const detail = { name, startDateTime, maxDepth, bottomTime, gases: opts.gases,
                             ndlLocked: !modeCustom.checked };
```

`!modeCustom.checked` is `true` exactly when the No-deco radio is selected.

- [ ] **Step 2: Verify it loads (smoke)**

Run: `node -e "import('./js/components/AddDiveDialog.js').then(()=>console.log('ok'))"`
Expected: prints `ok` (module parses with no syntax error).

- [ ] **Step 3: Run the full suite (no regressions)**

Run: `npm test 2>&1 | tail -3`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add js/components/AddDiveDialog.js
git commit -m "feat(add-dialog): emit ndlLocked when No-deco mode is selected

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Calendar labels show deepest deco stop + TTS

**Files:**
- Modify: `js/components/TripCalendar.js` (export `decoLabelSuffix`; use it in `render` ~line 193)
- Test: `tests/run-tests.mjs` (new `describe` block; `snapClamp` is already imported from `TripCalendar.js` at line 191 — add `decoLabelSuffix` to that import)

- [ ] **Step 1: Write the failing tests**

In `tests/run-tests.mjs`, change the import on line 191 from:

```javascript
import { snapClamp } from '../js/components/TripCalendar.js';
```
to:
```javascript
import { snapClamp, decoLabelSuffix } from '../js/components/TripCalendar.js';
```

Add a new top-level `describe` block (place it right after the existing `describe('tripUrl - encode/decode', ...)` block closes):

```javascript
describe('TripCalendar - decoLabelSuffix', () => {
    test('returns deepest stop + TTS for a dive with deco', () => {
        const dive = {
            startDateTime: 540, endDateTime: 600, bottomTime: 30,
            profile: { decoStops: [{ depth: 6, time: 3 }, { depth: 9, time: 2 }] }
        };
        // deepest stop = 9 m; TTS = (600 - 540) - 30 = 30 min
        expect(decoLabelSuffix(dive)).toBe(' · stop 9m · TTS 30min');
    });

    test('returns empty string for a no-deco dive', () => {
        const dive = {
            startDateTime: 540, endDateTime: 570, bottomTime: 25,
            profile: { decoStops: [] }
        };
        expect(decoLabelSuffix(dive)).toBe('');
    });

    test('returns empty string when profile is missing', () => {
        expect(decoLabelSuffix({ startDateTime: 0, endDateTime: 30, bottomTime: 20 })).toBe('');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -B1 -A2 "decoLabelSuffix"`
Expected: import fails / tests FAIL — `decoLabelSuffix` is not exported yet.

- [ ] **Step 3: Implement and use `decoLabelSuffix`**

In `js/components/TripCalendar.js`, add an exported pure helper near the other exported helper `snapClamp` (top level of the module, outside the class):

```javascript
/**
 * Label suffix describing a planned dive's deco obligation, or '' if none.
 * @param {Object} plannedDive - a planTrip result dive: { startDateTime, endDateTime, bottomTime, profile }
 * @returns {string} e.g. ' · stop 9m · TTS 30min', or '' for a no-deco dive
 */
export function decoLabelSuffix(plannedDive) {
    const stops = (plannedDive && plannedDive.profile && plannedDive.profile.decoStops) || [];
    if (stops.length === 0) return '';
    const deepest = Math.max(...stops.map(s => s.depth));
    const tts = Math.round((plannedDive.endDateTime - plannedDive.startDateTime) - plannedDive.bottomTime);
    return ` · stop ${deepest}m · TTS ${tts}min`;
}
```

In `render`, replace the label line (currently `block.textContent = \`${name} · ${depth}m · ${runtime}min\`;` near line 193) with:

```javascript
            block.textContent = `${name} · ${depth}m · ${runtime}min` + (d ? decoLabelSuffix(d) : '');
```

(`d` is the planTrip result dive from `byId.get(b.diveId)`, already in scope just above.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -3`
Expected: all pass; suite total up by 3.

- [ ] **Step 5: Commit**

```bash
git add js/components/TripCalendar.js tests/run-tests.mjs
git commit -m "feat(calendar): show deepest deco stop + TTS in block labels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Edit panel lock toggle + page wiring + browser smoke

**Files:**
- Modify: `js/components/DiveEditPanel.js`
- Modify: `sandbox/repetitive-dives.html:411` (pass `plannedBottomTime` into `editPanel.open`)

This task has no isolated unit test (DOM-heavy panel + page glue); it is validated by the mandatory browser smoke in Step 5.

- [ ] **Step 1: Add the lock checkbox and read-only derived time to the panel**

In `js/components/DiveEditPanel.js`, change the `open` signature (line 23) from `open(dive, startDate) {` to:

```javascript
    open(dive, startDate, plannedBottomTime) {
```

In the `this.container.innerHTML = ...` template, add the lock checkbox to the `.dep-row` (after the Start label, before the Remove button):

```javascript
            <div class="dep-row">
                <label>Name <input type="text" class="dep-name" value="${esc(dive.name || '')}"></label>
                <label>Start <input type="datetime-local" class="dep-start" value="${epochMinToLocalInput(dive.startDateTime, base)}"></label>
                <label class="dep-lock-label"><input type="checkbox" class="dep-ndl-lock"${dive.ndlLocked ? ' checked' : ''}> No-deco (NDL-locked)</label>
                <button class="dep-remove">Remove dive</button>
            </div>
```

After the block that pre-fills `quickDepth`/`quickTime` (the `if (this.editor.elements && this.editor.elements.quickDepth) { ... }` near line 62), add a helper that reflects the lock state into the bottom-time input, and call it once:

```javascript
        const lockEl = this.container.querySelector('.dep-ndl-lock');
        const qt = this.editor.elements ? this.editor.elements.quickTime : null;
        // When locked, bottom time is engine-derived: show the planned NDL read-only.
        const applyLockState = () => {
            if (!qt) return;
            if (lockEl.checked) {
                qt.disabled = true;
                if (Number.isFinite(plannedBottomTime)) qt.value = plannedBottomTime;
            } else {
                qt.disabled = false;
            }
        };
        applyLockState();
```

- [ ] **Step 2: Include the flag in the emitted patch and react to the toggle**

In the `emitApply` function, read the checkbox and add it to the patch. Change the `dispatchEvent` payload so the `patch` includes `ndlLocked`:

```javascript
        const emitApply = () => {
            const setup = this.editor.getDiveSetup();
            const maxDepth = parseFloat(this.editor.elements.quickDepth.value) || this.dive.maxDepth;
            const bottomTime = parseFloat(this.editor.elements.quickTime.value) || this.dive.bottomTime;
            const name = (this.container.querySelector('.dep-name').value || this.dive.name || '').trim();
            const sdt = localInputToEpochMin(this.container.querySelector('.dep-start').value, base);
            const startDateTime = Number.isFinite(sdt) ? sdt : this.dive.startDateTime;
            const ndlLocked = this.container.querySelector('.dep-ndl-lock').checked;
            this.dispatchEvent(new CustomEvent('apply', {
                detail: { id: this.dive.id, patch: { startDateTime, maxDepth, bottomTime, gases: setup.gases, name, ndlLocked } }
            }));
        };
```

Then wire the checkbox so toggling it updates the input state and re-emits:

```javascript
        lockEl.addEventListener('change', () => { applyLockState(); emitApply(); });
```

(Add this next to the existing `this.editor.addEventListener('change', emitApply);` listener registrations.)

- [ ] **Step 2b: Sync the close() for the new signature**

No change needed — `close()` already clears `this.dive`/`this.editor`/innerHTML and works regardless of the new arg. Verify `open` still calls `this.close()` first when re-opening (it does, line 24).

- [ ] **Step 3: Page passes the planned bottom time into the panel**

In `sandbox/repetitive-dives.html`, the `selectDive` handler (line 408–413) currently calls `editPanel.open(dive, trip.startDate);`. Change it to pass the planned dive's bottom time from the last plan result:

```javascript
    calendar.addEventListener('selectDive', (e) => {
      selectedDiveId = e.detail.diveId;
      const dive = trip.dives.find(d => d.id === selectedDiveId);
      const planned = lastResult && lastResult.dives.find(d => d.id === selectedDiveId);
      if (dive) editPanel.open(dive, trip.startDate, planned ? planned.bottomTime : dive.bottomTime);
      rerender();
    });
```

- [ ] **Step 4: Add a CSS touch for the lock label and verify modules parse**

In `css/styles.css`, add a small rule so the lock checkbox label sits inline (search for an existing `.dep-row` rule to place it nearby; if none, append in the repetitive-dives section):

```css
.dep-lock-label { display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
```

Run: `node -e "import('./js/components/DiveEditPanel.js').then(()=>console.log('ok'))" && npm test 2>&1 | tail -3`
Expected: prints `ok`, then all tests pass (no regressions).

- [ ] **Step 5: Browser smoke (MANDATORY — Playwright)**

Start a static server if not already running (`python3 -m http.server 5500` from repo root) and drive `http://localhost:5500/sandbox/repetitive-dives.html`. Verify:

1. Click an empty calendar slot → in the dialog pick **No-deco**, depth 30 m, Add. The new block shows a sensible NDL bottom time; the page URL `?trip=` contains the encoded trip.
2. Select that dive → the edit panel's **No-deco (NDL-locked)** checkbox is **checked** and the bottom-time input is disabled, showing the derived NDL.
3. Drag the locked dive later, onto/after another dive so it carries pre-saturation → its bottom time **shrinks** and the block relabels. No console errors.
4. Uncheck the lock in the editor → the bottom-time field becomes **editable**; moving the dive now leaves the bottom time unchanged.
5. A dive deep/long enough to incur deco (e.g. 40 m / 30 min) shows `· stop {n}m · TTS {n}min` on its block; a no-deco dive does not.
6. Reload the page (same URL) → the locked dive is **still locked** (checkbox checked on reselect).

Capture: assert no `console.error` during the run; assert the locked block's text changes between step 2 and step 3 (bottom time decreased).

- [ ] **Step 6: Commit**

```bash
git add js/components/DiveEditPanel.js sandbox/repetitive-dives.html css/styles.css
git commit -m "feat(edit-panel): NDL-lock toggle with read-only derived bottom time

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Version bump + wiki

**Files:**
- Modify: `sw.js:2` (`CACHE_NAME`)
- Modify: `css/styles.css` (`.version-number::after` content)
- Modify: `wiki/Module-Reference.md`

- [ ] **Step 1: Bump the cache name**

In `sw.js` line 2, read the current `const CACHE_NAME = 'deco-theory-X.X.XX'` and increment the patch number by 1 (e.g. `0.6.19` → `0.6.20`).

- [ ] **Step 2: Bump the visible version number**

In `css/styles.css`, search for `.version-number::after` and update its `content:` value to the SAME version string used in Step 1.

- [ ] **Step 3: Update the wiki**

In `wiki/Module-Reference.md`, in the `tripPlanner` / `planTrip` entry, add a sentence: a dive with `ndlLocked: true` has its `bottomTime` derived = pre-saturation-aware NDL (`calculateNDL` seeded with the carried-in tissue), capped at 99 min. In the `TripCalendar` entry, add: block labels append `· stop {deepestStop}m · TTS {tts}min` for dives that incur deco (`decoLabelSuffix` exported helper).

- [ ] **Step 4: Run the full suite one final time**

Run: `npm test 2>&1 | tail -3`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add sw.js css/styles.css wiki/Module-Reference.md
git commit -m "chore: version bump + wiki for NDL-locked dives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Push the wiki**

Per the project convention, the `wiki/` dir mirrors a separate `decojs.wiki.git` remote and is NOT pushed automatically. After merging is decided, sync the wiki page change to the wiki remote. (Defer the actual push until the branch stack is merged; note it here so it is not forgotten.)

---

## Self-Review

**Spec coverage:**
- A (`ndlLocked` data model) → Tasks 1–5 thread the flag through engine, URL, dialog, panel. ✓
- B (engine derivation, cap 99) → Task 1. ✓
- C (add-dialog emits flag) → Task 3. ✓
- D (edit-panel toggle + read-only derived time + `plannedBottomTime` wiring) → Task 5. ✓
- E (deepest stop + TTS label) → Task 4. ✓
- F (URL persistence) → Task 2. ✓
- G (testing: planner unit, label unit, browser smoke) → Tasks 1, 2, 4 unit + Task 5 smoke. ✓
- H (versioning + wiki) → Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Task 6 reads the current version rather than hard-coding a guessed string (the live value is unknown at plan-write time) — this is a deliberate read-then-increment, not a placeholder.

**Type/name consistency:** `ndlLocked` (boolean) used identically in `planTrip`, `tripUrl`, `AddDiveDialog`, `DiveEditPanel`, page. `decoLabelSuffix(plannedDive)` defined in Task 4, imported in the Task 4 test. `open(dive, startDate, plannedBottomTime)` defined in Task 5 and called with three args from the page in the same task. `NDL_LOCK_CAP = 99` matches the `99` asserted in the Task 1 cap test. TTS formula `round((end-start)-bottomTime)` matches between `decoLabelSuffix` and its test (30 min).
