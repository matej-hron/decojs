# Calendar UX (real dates, hour grid, add-dive dialog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repetitive-dives calendar look and behave like a real calendar (date range, hour grid) and replace the create flow with an add-dive dialog whose NDL is pre-saturation-aware.

**Architecture:** A default-preserving `initialTissuePressures` seam on `calculateNDL`; a pure `previewNdl` that chains a candidate dive via `planTrip` to get the position-aware NDL; `computeCalendarLayout` driven by an explicit `dayCount`; a `TripCalendar` render with a time ruler + date headers + hour gridlines; and a new `AddDiveDialog` with Custom/No-deco modes.

**Tech Stack:** Pure ES modules, no build step. Unit tests in `tests/run-tests.mjs` (custom framework). UI verified by Playwright browser smoke tests.

**Spec:** `docs/superpowers/specs/2026-06-15-calendar-ux-design.md`
**Branch:** `feat/calendar-trip-planner-core` (continue on the same branch).

---

## File Structure

- **Modify** `js/decoModel.js` — `calculateNDL` gains optional `initialTissuePressures`.
- **Create** `js/ndlPreview.js` — pure `previewNdl(trip, {startDateTime,maxDepth,gases}, gfLow)`.
- **Modify** `js/calendarLayout.js` — `computeCalendarLayout` takes explicit `dayCount`, `baseDay` always 0.
- **Modify** `js/components/TripCalendar.js` — time ruler, date headers, hour gridlines; render from `startDate` + `dayCount`.
- **Modify** `js/components/DiveEditPanel.js` — re-base epoch↔datetime mapping on the trip `startDate`.
- **Create** `js/components/AddDiveDialog.js` — Custom/No-deco add dialog with injected `computeNdl`.
- **Modify** `sandbox/repetitive-dives.html` — trip-config (start date + day count), dialog-based create.
- **Modify** `sw.js`, `css/styles.css` — register new modules, bump version.
- **Modify** `tests/run-tests.mjs` — tests for seeded NDL, previewNdl, and updated calendarLayout tests.

---

## Task 1: Seeded `calculateNDL`

**Files:**
- Modify: `js/decoModel.js:599` (signature) and the `afterDescent` loop (~617-625)
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add to `tests/run-tests.mjs` (in the decoModel area; `calculateNDL`, `getInitialTissueN2`, `N2_FRACTION`, `COMPARTMENTS`, `calculateTissueLoading` are already imported):

```js
describe('calculateNDL - initialTissuePressures seam', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];

    test('a surface-equilibrium seed reproduces the unseeded NDL', () => {
        const fresh = {};
        COMPARTMENTS.forEach(c => { fresh[c.id] = getInitialTissueN2(N2_FRACTION); });
        const seeded = calculateNDL(30, N2_FRACTION, 1.0, fresh);
        const unseeded = calculateNDL(30, N2_FRACTION, 1.0);
        expect(seeded.ndl).toBe(unseeded.ndl);
    });

    test('a pre-saturated seed shortens the NDL', () => {
        const prior = calculateTissueLoading(
            [{ time: 0, depth: 0 }, { time: 2, depth: 40 }, { time: 25, depth: 40 }, { time: 30, depth: 0 }],
            0, { gases: air });
        const loaded = {};
        COMPARTMENTS.forEach(c => { loaded[c.id] = prior.compartments[c.id].pressures.at(-1); });
        const seeded = calculateNDL(30, N2_FRACTION, 1.0, loaded);
        const unseeded = calculateNDL(30, N2_FRACTION, 1.0);
        expect(seeded.ndl).toBeLessThan(unseeded.ndl);
    });
});
```

- [ ] **Step 2: Run to verify the seed test fails**

Run: `npm test 2>&1 | grep -A2 "pre-saturated seed shortens"`
Expected: FAIL — the 4th arg is ignored today, so `seeded.ndl === unseeded.ndl` (not less).

- [ ] **Step 3: Implement the seam**

In `js/decoModel.js`, change the `calculateNDL` signature (line 599):
```js
export function calculateNDL(depth, n2Fraction = N2_FRACTION, gfLow = 1.0, initialTissuePressures = null) {
```

Then in the `afterDescent` loop (currently ~617-625), seed the per-compartment starting pressure. Replace:
```js
    const afterDescent = {};
    COMPARTMENTS.forEach(comp => {
        afterDescent[comp.id] = schreinerEquation(
            initialN2,
            getAlveolarN2Pressure(SURFACE_PRESSURE, n2Fraction),
            descentRate,
            descentTime,
            comp.halfTime
        );
    });
```
with:
```js
    const afterDescent = {};
    COMPARTMENTS.forEach(comp => {
        const startN2 = initialTissuePressures ? initialTissuePressures[comp.id] : initialN2;
        afterDescent[comp.id] = schreinerEquation(
            startN2,
            getAlveolarN2Pressure(SURFACE_PRESSURE, n2Fraction),
            descentRate,
            descentTime,
            comp.halfTime
        );
    });
```

(The `const initialN2 = getInitialTissueN2(n2Fraction)` line above stays as the default/fallback.)

- [ ] **Step 4: Run to verify pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!` (existing suite + 2 new). The surface-seed-equals-unseeded test proves default-preservation.

- [ ] **Step 5: Commit**

```bash
git add js/decoModel.js tests/run-tests.mjs
git commit -m "feat(model): calculateNDL accepts a seeded initial tissue state"
```

---

## Task 2: `previewNdl` (position-aware NDL)

**Files:**
- Create: `js/ndlPreview.js`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add `import { previewNdl } from '../js/ndlPreview.js';` near the other imports. Then:

```js
describe('ndlPreview - previewNdl', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];

    test('for the first dive it equals the surface NDL', () => {
        const trip = { gases: air, gfLow: 100, gfHigh: 100, dives: [] };
        const got = previewNdl(trip, { startDateTime: 9 * 60, maxDepth: 30, gases: air }, 100);
        const surface = calculateNDL(30, 0.79, 1.0).ndl;
        expect(got).toBe(surface);
    });

    test('a later, pre-saturated dive has a shorter NDL', () => {
        const trip = { gases: air, gfLow: 100, gfHigh: 100, dives: [
            { id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30, gases: air }
        ]};
        const later = previewNdl(trip, { startDateTime: 90, maxDepth: 30, gases: air }, 100); // short SI after d1
        const surface = calculateNDL(30, 0.79, 1.0).ndl;
        expect(later).toBeLessThan(surface);
    });

    test('does not depend on a placeholder bottom time (no circularity)', () => {
        const trip = { gases: air, gfLow: 100, gfHigh: 100, dives: [
            { id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30, gases: air }
        ]};
        const a = previewNdl(trip, { startDateTime: 90, maxDepth: 30, gases: air }, 100);
        const b = previewNdl(trip, { startDateTime: 90, maxDepth: 30, gases: air }, 100);
        expect(a).toBe(b); // deterministic, independent of internal placeholder
    });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test 2>&1 | grep -i "previewNdl\|Cannot find"`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `js/ndlPreview.js`:

```js
/**
 * Pre-saturation-aware NDL preview for a candidate dive at a given trip position.
 *
 * A dive's carried-in tissue load depends only on the dives BEFORE it (and the
 * surface gap), never on its own duration — so we can drop a placeholder dive at
 * the candidate start, let planTrip chain it, read its startingTissue, and feed
 * that into a seeded calculateNDL. No circularity.
 *
 * Pure module — no DOM.
 */
import { planTrip } from './tripPlanner.js';
import { addDive } from './tripState.js';
import { calculateNDL } from './decoModel.js';

/**
 * @param {Object} trip - { gases, gfLow, gfHigh, dives }
 * @param {Object} candidate - { startDateTime, maxDepth, gases }
 * @param {number} gfLow - GF Low as a percentage (0-100)
 * @returns {number} pre-saturation-aware NDL in minutes
 */
export function previewNdl(trip, candidate, gfLow) {
    const withCandidate = addDive(trip, {
        startDateTime: candidate.startDateTime,
        maxDepth: candidate.maxDepth,
        bottomTime: 1, // placeholder; startingTissue is independent of it
        gases: candidate.gases
    });
    const newId = withCandidate.dives[withCandidate.dives.length - 1].id;
    const result = planTrip(withCandidate);
    const placed = result.dives.find(d => d.id === newId);
    const seed = placed.startingTissue;
    const n2 = (candidate.gases && candidate.gases[0]) ? candidate.gases[0].n2 : 0.79;
    return calculateNDL(candidate.maxDepth, n2, gfLow / 100, seed).ndl;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add js/ndlPreview.js tests/run-tests.mjs
git commit -m "feat(trip): previewNdl — pre-saturation-aware NDL for a candidate dive"
```

---

## Task 3: `computeCalendarLayout` explicit `dayCount`

**Files:**
- Modify: `js/calendarLayout.js`
- Test: `tests/run-tests.mjs` (replace the existing `calendarLayout - computeCalendarLayout` describe block)

The model shifts: dive `startDateTime` is minutes-from-trip-start (day 0 = trip start), so `dayIndex = floor(startDateTime/1440)` directly and `baseDay` is always 0; `dayCount` comes from the caller (trip config), not the dives.

- [ ] **Step 1: Update the tests (they encode the new contract)**

Replace the entire existing `describe('calendarLayout - computeCalendarLayout', ...)` block in `tests/run-tests.mjs` with:

```js
describe('calendarLayout - computeCalendarLayout', () => {
    const win = (dayCount) => ({ dayStartMin: 6 * 60, dayEndMin: 20 * 60, dayCount }); // span 840 min

    test('positions a dive block by start time and duration within the day window', () => {
        const planResult = { dives: [{ id: 'd1', startDateTime: 9 * 60, endDateTime: 10 * 60 }], conflicts: [] };
        const layout = computeCalendarLayout(planResult, win(1));
        expect(layout.dayCount).toBe(1);
        expect(layout.baseDay).toBe(0);
        const b = layout.blocks[0];
        expect(b.dayIndex).toBe(0);
        expect(b.topPct).toBeCloseTo((540 - 360) / 840 * 100, 4);
        expect(b.heightPct).toBeCloseTo(60 / 840 * 100, 4);
        expect(b.conflict).toBe(false);
    });

    test('dayCount comes from the caller, not the dives (1 dive, 3 columns)', () => {
        const planResult = { dives: [{ id: 'd1', startDateTime: 9 * 60, endDateTime: 10 * 60 }], conflicts: [] };
        const layout = computeCalendarLayout(planResult, win(3));
        expect(layout.dayCount).toBe(3);
        expect(layout.blocks[0].dayIndex).toBe(0);
    });

    test('places a dive on day 2 in column index 2; flags conflicts', () => {
        const planResult = {
            dives: [
                { id: 'd1', startDateTime: 9 * 60,             endDateTime: 10 * 60 },
                { id: 'd2', startDateTime: (2 * 24 * 60) + 9 * 60, endDateTime: (2 * 24 * 60) + 10 * 60 }
            ],
            conflicts: [{ diveId: 'd2', type: 'overlap', overrunMinutes: 5 }]
        };
        const layout = computeCalendarLayout(planResult, win(3));
        expect(layout.baseDay).toBe(0);
        expect(layout.blocks.find(b => b.diveId === 'd1').dayIndex).toBe(0);
        expect(layout.blocks.find(b => b.diveId === 'd2').dayIndex).toBe(2);
        expect(layout.blocks.find(b => b.diveId === 'd2').conflict).toBe(true);
    });

    test('empty trip yields the configured columns and no blocks', () => {
        const layout = computeCalendarLayout({ dives: [], conflicts: [] }, win(2));
        expect(layout.dayCount).toBe(2);
        expect(layout.blocks).toHaveLength(0);
    });

    test('a dive starting before the window clips its top without inflating height', () => {
        const planResult = { dives: [{ id: 'd1', startDateTime: 5 * 60 + 30, endDateTime: 6 * 60 + 30 }], conflicts: [] };
        const b = computeCalendarLayout(planResult, win(1)).blocks[0];
        expect(b.topPct).toBe(0);
        expect(b.heightPct).toBeCloseTo(30 / 840 * 100, 4);
    });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npm test 2>&1 | grep -A3 "computeCalendarLayout"`
Expected: FAILs — current impl derives `dayCount`/`baseDay` from dives and ignores `windowConfig.dayCount`; the day-2 test expects `dayIndex 2` but current normalizes to 0.

- [ ] **Step 3: Implement**

Replace the body of `computeCalendarLayout` in `js/calendarLayout.js` with:

```js
export function computeCalendarLayout(planResult, windowConfig) {
    const { dayStartMin, dayEndMin, dayCount } = windowConfig;
    const span = dayEndMin - dayStartMin;
    const dives = planResult.dives || [];
    const conflictIds = new Set((planResult.conflicts || []).map(c => c.diveId));
    const clampPct = (p) => Math.max(0, Math.min(100, p));

    const blocks = dives.map(d => {
        const dayIndex = Math.floor(d.startDateTime / MIN_PER_DAY);
        const startMinOfDay = d.startDateTime - dayIndex * MIN_PER_DAY;
        const endMinOfDay = Math.min(d.endDateTime - dayIndex * MIN_PER_DAY, dayEndMin);
        // Clip the visible start to the window top so an early dive doesn't inflate height.
        const visibleStart = Math.max(startMinOfDay, dayStartMin);
        const topPct = clampPct((visibleStart - dayStartMin) / span * 100);
        const heightPct = clampPct((endMinOfDay - visibleStart) / span * 100);
        return {
            diveId: d.id,
            dayIndex,
            topPct,
            heightPct,
            conflict: conflictIds.has(d.id),
            startMinOfDay,
            endMinOfDay
        };
    });

    return { dayCount, baseDay: 0, blocks };
}
```

Keep the file's existing `MIN_PER_DAY` const and the module JSDoc; update the JSDoc `@param` to note `windowConfig.dayCount` and that `startDateTime` is trip-relative (day 0 = trip start).

- [ ] **Step 4: Run to verify pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add js/calendarLayout.js tests/run-tests.mjs
git commit -m "feat(trip): computeCalendarLayout driven by explicit dayCount (trip-relative days)"
```

---

## Task 4: Calendar hour grid + date headers + edit-panel re-base

**Files:**
- Modify: `js/components/TripCalendar.js`
- Modify: `js/components/DiveEditPanel.js`
- Modify: `sandbox/repetitive-dives.html` (CSS)

DOM work; verified by the Task 6 browser smoke test.

- [ ] **Step 1: Update `TripCalendar` render**

Change `TripCalendar` so it renders from a configured `dayCount` + `startDate`, with a time ruler and date headers. Update the constructor to accept `config.window` already containing `dayCount`, and add a `setTrip({ startDate, dayCount })` (or pass these to `render`). Concretely:

- Add to the constructor config handling: store `this.window` (with `dayStartMin`, `dayEndMin`, `dayCount`) and `this.startDate` (a `Date` or ISO string).
- Add a `configure({ startDate, dayCount })` method that sets `this.startDate` and `this.window.dayCount`.
- In `render(planResult)`: pass `this.window` (now including `dayCount`) to `computeCalendarLayout`. Build:
  - a left **ruler** element `.tc-ruler` containing one `.tc-hour-label` per hour from `dayStartMin/60` to `dayEndMin/60`, positioned at `top: (hour*60 - dayStartMin)/span*100 %`.
  - `layout.dayCount` day columns (NO extra phantom column). Each `.tc-day` gets a `.tc-day-header` showing the date (`startDate + dayIndex` days, formatted `toLocaleDateString` weekday+day+month) and absolutely-positioned `.tc-hour-line` gridlines at each hour.
  - blocks positioned as before.
- Keep emitting `createAt { dayIndex, minutesOfDay }` on empty-column click and `selectDive { diveId }` on block click. `toStartDateTime(dayIndex, minutesOfDay)` stays `dayIndex*1440 + minutesOfDay` (baseDay is 0).

Use this date-format helper inside the component:
```js
function formatDayHeader(startDate, dayIndex) {
    const base = (startDate instanceof Date) ? startDate : new Date(startDate + 'T00:00:00');
    const d = new Date(base.getTime() + dayIndex * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
```

- [ ] **Step 2: Re-base `DiveEditPanel` datetime mapping**

In `js/components/DiveEditPanel.js`, the epoch↔`datetime-local` helpers use a fixed `BASE`. Change `open(dive)` to accept the trip `startDate` (pass it in, e.g. `open(dive, startDate)`), and compute `BASE` from it: `const base = new Date((startDate||'2026-01-01') + 'T00:00:00').getTime();`. Use that base in the local input formatting/parsing so the panel's date matches the dive's column. (Keep the helpers but parameterise the base, or recompute inside `open`.) Update the page's `editPanel.open(dive)` call site to pass `trip.startDate` (Task 6).

- [ ] **Step 3: Add CSS to `sandbox/repetitive-dives.html`**

Append to the `<style>` block:
```css
    .trip-calendar { align-items: stretch; }
    .tc-ruler { position: relative; width: 48px; flex: 0 0 48px; }
    .tc-hour-label { position:absolute; right:4px; transform:translateY(-50%); font-size:.7rem; opacity:.6; }
    .tc-day { padding-top: 22px; } /* room for the header */
    .tc-day-header { position:absolute; top:0; left:0; right:0; height:20px; line-height:20px; text-align:center;
                     font-size:.75rem; font-weight:600; background:var(--surface,#f0f0f0);
                     border-bottom:1px solid var(--border-color,#ccc); border-radius:6px 6px 0 0; }
    .tc-hour-line { position:absolute; left:0; right:0; border-top:1px solid var(--border-color,#eee); opacity:.5; }
```

- [ ] **Step 4: Parse check + commit**

Run: `node --check js/components/TripCalendar.js && node --check js/components/DiveEditPanel.js && npm test 2>&1 | tail -3`
Expected: parses OK; suite still green (no node tests changed here).

```bash
git add js/components/TripCalendar.js js/components/DiveEditPanel.js sandbox/repetitive-dives.html
git commit -m "feat(trip): calendar hour ruler + date headers + gridlines; edit-panel date re-base"
```

---

## Task 5: `AddDiveDialog` component

**Files:**
- Create: `js/components/AddDiveDialog.js`
- Modify: `sandbox/repetitive-dives.html` (CSS)

- [ ] **Step 1: Implement the dialog**

Create `js/components/AddDiveDialog.js`:

```js
/**
 * Add-dive dialog with two modes:
 *   - Custom: depth + bottom-time (editable)
 *   - No-deco: depth → bottom-time = computed NDL (read-only)
 *
 * Physics is injected: `computeNdl(startDateTime, maxDepth, gases) => minutes`.
 * Emits 'add' { startDateTime, maxDepth, bottomTime, gases } and 'cancel'.
 */
export class AddDiveDialog extends EventTarget {
    constructor(container) {
        super();
        this.container = container;
    }

    /**
     * @param {Object} opts - { startDateTime, gases, defaultDepth=18, defaultTime=40, computeNdl }
     */
    open(opts) {
        this.opts = opts;
        const depth = opts.defaultDepth ?? 18;
        const time = opts.defaultTime ?? 40;
        this.container.innerHTML = `
          <div class="add-dialog-backdrop">
            <div class="add-dialog">
              <h3>Add dive</h3>
              <label>Max depth <input class="ad-depth" type="number" min="1" max="100" value="${depth}"> m</label>
              <div class="ad-modes">
                <label><input type="radio" name="ad-mode" class="ad-mode-custom" checked> Custom time
                  <input class="ad-time" type="number" min="1" max="200" value="${time}"> min</label>
                <label><input type="radio" name="ad-mode" class="ad-mode-ndl"> No-deco (NDL <span class="ad-ndl">–</span> min)</label>
              </div>
              <div class="ad-hint"></div>
              <div class="ad-actions"><button class="ad-cancel">Cancel</button><button class="ad-add">Add</button></div>
            </div>
          </div>`;

        const el = (s) => this.container.querySelector(s);
        const depthEl = el('.ad-depth');
        const timeEl = el('.ad-time');
        const ndlEl = el('.ad-ndl');
        const hintEl = el('.ad-hint');
        const modeCustom = el('.ad-mode-custom');

        const refresh = () => {
            const d = parseFloat(depthEl.value) || depth;
            const ndl = opts.computeNdl(opts.startDateTime, d, opts.gases);
            ndlEl.textContent = ndl;
            const customMode = modeCustom.checked;
            timeEl.disabled = !customMode;
            if (!customMode) timeEl.value = ndl;
            const t = parseFloat(timeEl.value) || 0;
            hintEl.textContent = (customMode && t > ndl)
                ? `⚠ deco — exceeds NDL (${ndl} min) for this depth at this point in the trip`
                : `NDL here: ${ndl} min`;
        };

        depthEl.addEventListener('input', refresh);
        timeEl.addEventListener('input', refresh);
        el('.ad-mode-custom').addEventListener('change', refresh);
        el('.ad-mode-ndl').addEventListener('change', refresh);
        el('.ad-cancel').addEventListener('click', () => { this.close(); this.dispatchEvent(new CustomEvent('cancel')); });
        el('.ad-add').addEventListener('click', () => {
            const maxDepth = parseFloat(depthEl.value) || depth;
            const bottomTime = parseFloat(timeEl.value) || time;
            this.dispatchEvent(new CustomEvent('add', {
                detail: { startDateTime: opts.startDateTime, maxDepth, bottomTime, gases: opts.gases }
            }));
            this.close();
        });

        refresh();
    }

    close() { this.container.innerHTML = ''; }
}
```

- [ ] **Step 2: Add dialog CSS to `sandbox/repetitive-dives.html`**

```css
    .add-dialog-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); display:flex;
                           align-items:center; justify-content:center; z-index:1000; }
    .add-dialog { background:var(--surface,#fff); padding:1.25rem; border-radius:10px; min-width:300px;
                  display:flex; flex-direction:column; gap:.6rem; }
    .add-dialog h3 { margin:0; }
    .ad-modes { display:flex; flex-direction:column; gap:.35rem; }
    .ad-hint { font-size:.85rem; opacity:.85; min-height:1.2em; }
    .ad-actions { display:flex; justify-content:flex-end; gap:.5rem; }
```

- [ ] **Step 3: Parse check + commit**

Run: `node --check js/components/AddDiveDialog.js && npm test 2>&1 | tail -3`
Expected: parses OK; suite green.

```bash
git add js/components/AddDiveDialog.js sandbox/repetitive-dives.html
git commit -m "feat(trip): AddDiveDialog with Custom/No-deco modes and live pre-saturation NDL"
```

---

## Task 6: Wire date config + dialog into the page

**Files:**
- Modify: `sandbox/repetitive-dives.html`
- Modify: `sw.js`, `css/styles.css`

- [ ] **Step 1: Trip date model + config bar**

Read the current page. Add `startDate` + `dayCount` to the `trip` object (e.g. `startDate: '2026-06-15', dayCount: 3`). In the `.trip-config` bar add a start-date input and a day-count input:
```html
      <label>Start date <input id="cfg-start" type="date" value="2026-06-15"></label>
      <label>Days <input id="cfg-days" type="number" min="1" max="14" value="3"></label>
```
Wire them:
```js
    document.getElementById('cfg-start').addEventListener('change', (e) => { trip = { ...trip, startDate: e.target.value }; rerender(); });
    document.getElementById('cfg-days').addEventListener('change', (e) => { trip = { ...trip, dayCount: Math.max(1, +e.target.value) }; rerender(); });
```
Ensure `dayCount` never drops below the latest occupied day: in `rerender()`, before rendering, compute `const neededDays = Math.max(trip.dayCount, ...trip.dives.map(d => Math.floor(d.startDateTime/1440)+1), 1);` and pass `neededDays` as the calendar's dayCount (don't silently mutate `trip.dayCount`, just use the max for rendering).

- [ ] **Step 2: Configure the calendar + use the dialog for create**

- Construct `TripCalendar` with a window including `dayCount`, and call `calendar.configure({ startDate: trip.startDate, dayCount: neededDays })` in `rerender()` before `calendar.render(lastResult)`.
- Import and instantiate `AddDiveDialog` into a container (add `<div id="add-dialog"></div>` to the body). Import `previewNdl`.
- Replace the `createAt` handler so instead of immediately adding a default dive, it opens the dialog:
```js
    import { AddDiveDialog } from '../js/components/AddDiveDialog.js';
    import { previewNdl } from '../js/ndlPreview.js';
    const addDialog = new AddDiveDialog(document.getElementById('add-dialog'));

    calendar.addEventListener('createAt', (e) => {
      const startDateTime = calendar.toStartDateTime(e.detail.dayIndex, e.detail.minutesOfDay);
      addDialog.open({
        startDateTime,
        gases: trip.gases,
        defaultDepth: 18,
        defaultTime: 40,
        computeNdl: (s, d, g) => previewNdl(trip, { startDateTime: s, maxDepth: d, gases: g }, trip.gfLow)
      });
    });
    addDialog.addEventListener('add', (e) => { trip = addDive(trip, e.detail); rerender(); });
```
- Update `editPanel.open(dive)` → `editPanel.open(dive, trip.startDate)` (Task 4 re-base).

- [ ] **Step 3: Browser smoke test (REQUIRED)**

Serve `python3 -m http.server 5500` (background). Playwright (script in repo root so it resolves `playwright`, then delete) on `http://localhost:5500/sandbox/repetitive-dives.html`. Assert:
1. ZERO console/page errors on load.
2. With start date set + Days=3, the calendar shows THREE columns with real date headers (e.g. "Mon 15 Jun"...), an hour ruler on the left, and hour gridlines. No phantom extra column.
3. Default dives render as blocks in the right day/time.
4. Click an empty slot → the add-dialog appears, pre-filled; it shows an "NDL here: N min".
5. Switch the dialog to "No-deco" → the time field disables and equals the NDL; switch depth and the NDL updates.
6. Position matters: open the dialog at an early-morning slot (first dive) vs an afternoon slot AFTER existing dives at the SAME depth → the afternoon NDL is SMALLER (pre-saturation). Report both numbers.
7. In Custom mode, set a bottom time above the NDL → the "⚠ deco" hint shows.
8. Click Add → the new dive appears as a block + overview card at the chosen slot.
9. Click a block → edit panel opens with the correct date; "View detail →" still opens the detail view.
Screenshot. Stop the server. Debug + fix any failure before committing; do not commit a broken page.

- [ ] **Step 4: Register modules + bump version**

- Add `'./js/ndlPreview.js'` and `'./js/components/AddDiveDialog.js'` to `sw.js` `STATIC_ASSETS`.
- Bump `sw.js` `CACHE_NAME` `deco-theory-0.6.7` → `deco-theory-0.6.8`; `css/styles.css` `.version-number::after` → `"0.6.8"`.

- [ ] **Step 5: Final test + commit**

Run: `npm test 2>&1 | tail -3` → `✅ All tests passed!`.
```bash
git add sandbox/repetitive-dives.html sw.js css/styles.css
git commit -m "feat(trip): date-range calendar config + dialog-based dive creation with pre-saturation NDL"
```

---

## Task 7: Wiki documentation

**Files:**
- Modify: `wiki/Module-Reference.md`

- [ ] **Step 1: Document**

Add/extend `Module-Reference.md`: the `calculateNDL` optional `initialTissuePressures` seam; `js/ndlPreview.js` (`previewNdl`); `js/components/AddDiveDialog.js`; and the calendar's date model (`startDate` + `dayCount`, `computeCalendarLayout` now taking explicit `dayCount` with trip-relative days). Verify any file:line citations against current source.

- [ ] **Step 2: Commit**

```bash
git add wiki/
git commit -m "docs(wiki): document seeded calculateNDL, previewNdl, AddDiveDialog, calendar date model"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** date model → Tasks 3,4,6; hour grid/look → Task 4; add dialog (2 modes) → Tasks 5,6; pre-saturation NDL → Tasks 1,2; wiring → Task 6; wiki → Task 7. Drag/chart-toggles/URL persistence correctly OUT. No gaps.
- **Placeholder scan:** none — pure/engine tasks have full code; UI tasks have full component code + explicit smoke acceptance.
- **Type/name consistency:** `initialTissuePressures` matches the existing seam pattern; `previewNdl(trip, {startDateTime,maxDepth,gases}, gfLow)` consistent between Task 2 and the page's `computeNdl` injection (Task 6); `AddDiveDialog` `add` detail `{startDateTime,maxDepth,bottomTime,gases}` matches `addDive` fields; `computeCalendarLayout` now `{dayCount, baseDay:0, blocks}` consistent between Task 3 and TripCalendar (Task 4).
- **Risk:** Task 3 changes an existing contract (baseDay/dayCount) and rewrites its tests — the new tests encode the new contract and the existing suite must stay green otherwise. The UI tasks (4–6) are gated on the mandatory Task 6 browser smoke test, including an explicit position-dependent-NDL check (step 6) that validates the headline feature.
