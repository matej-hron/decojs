# Calendar Trip Planner (core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded dive list on the repetitive-dives page with an editable visual calendar (create/edit/remove dives, per-dive gases, duration-spanning blocks, conflicts) driving the existing planTrip + overview/detail.

**Architecture:** A small per-dive-gas change to `planTrip`; a pure `tripState` reducer; a pure `computeCalendarLayout` + a `TripCalendar` DOM renderer; a per-dive edit panel reusing `DiveSetupEditor`; and page rewiring so calendar edits re-run `planTrip` and re-render overview/detail. Pure logic is unit-tested; DOM is browser-smoke-tested.

**Tech Stack:** Pure ES modules, no build step. Unit tests in `tests/run-tests.mjs` (custom framework). Charts/editor are browser-only; layout/DOM verified by Playwright smoke tests.

**Spec:** `docs/superpowers/specs/2026-06-15-calendar-trip-planner-core-design.md`
**Branch:** `feat/calendar-trip-planner-core` (stacked on `feat/repetitive-dive-detail-view`).

---

## File Structure

- **Modify** `js/tripPlanner.js` — `planTrip` uses `dive.gases ?? diveSetup.gases` per dive.
- **Create** `js/tripState.js` — pure reducer: `addDive`, `editDive`, `removeDive`, `rescheduleDive`.
- **Create** `js/calendarLayout.js` — pure `computeCalendarLayout(planResult, windowConfig)` → positioned blocks + day columns.
- **Create** `js/components/TripCalendar.js` — DOM renderer over the layout; emits `createAt`/`selectDive`.
- **Create** `js/components/DiveEditPanel.js` — per-dive edit panel wrapping a stripped-down `DiveSetupEditor` + a start-datetime field.
- **Modify** `sandbox/repetitive-dives.html` — hold trip state, wire calendar + edit panel + trip-config bar; re-run planTrip on change; keep overview/detail.
- **Modify** `sw.js`, `css/styles.css` — register new modules, bump version.
- **Modify** `tests/run-tests.mjs` — unit tests for the per-dive-gas change, `tripState`, and `computeCalendarLayout`.

---

## Task 1: `planTrip` per-dive gases

**Files:**
- Modify: `js/tripPlanner.js` (the `ordered.forEach` loop, ~lines 38-62)
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add to the `tripPlanner - planTrip` describe block in `tests/run-tests.mjs`:

```js
    test('per-dive gases: a richer nitrox mix reduces that dive\'s deco', () => {
        const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
        const ean32 = [{ id: 'ean32', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0 }];
        const run = (g2) => planTrip({ gases: air, gfLow: 100, gfHigh: 100, dives: [
            { id: 'd1', startDateTime: 0,   maxDepth: 30, bottomTime: 30, gases: air },
            { id: 'd2', startDateTime: 200, maxDepth: 30, bottomTime: 30, gases: g2 }
        ]});
        const airDeco = run(air).dives[1].profile.totalDecoTime;
        const ean32Deco = run(ean32).dives[1].profile.totalDecoTime;
        expect(ean32Deco).toBeLessThan(airDeco);
    });

    test('falls back to shared gases when a dive has no gases field', () => {
        const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
        const withField = planTrip({ gases: air, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30, gases: air }] });
        const without = planTrip({ gases: air, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30 }] });
        expect(without.dives[0].profile.totalDecoTime).toBe(withField.dives[0].profile.totalDecoTime);
    });
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `npm test 2>&1 | grep -A2 "richer nitrox"`
Expected: FAIL — both runs use the shared `air`, so `ean32Deco === airDeco` (not less). (If instead 30 m/30 min has zero deco on air at GF100, the assertion can't show a difference — in that case change both dives to `maxDepth: 30, bottomTime: 40` so air clearly incurs deco, and keep EAN32 lower. Verify air deco > 0 first.)

- [ ] **Step 3: Implement**

In `js/tripPlanner.js`, inside the `ordered.forEach((dive, i) => { ... })` loop, immediately before the `const decoOpts = ...` line, add:

```js
        const diveGases = dive.gases ?? gases;
```

Then change the two model calls to use `diveGases` instead of `gases`:

```js
        const profile = generateDecoProfile(
            dive.maxDepth, dive.bottomTime, diveGases, gfLow, gfHigh, undefined, decoOpts
        );
        // surfaceInterval = 0: we want only the in-water tissue track for this dive;
        // surface off-gassing between dives is handled separately by simulateDepthTime
        // at the start of the next iteration.
        const loading = calculateTissueLoading(profile.waypoints, 0, { gases: diveGases, ...decoOpts });
```

(Leave the outer `const gases = diveSetup.gases;` as the fallback source.)

- [ ] **Step 4: Run to verify pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!` (existing suite stays green — the fallback preserves behaviour for trips without per-dive gases).

- [ ] **Step 5: Commit**

```bash
git add js/tripPlanner.js tests/run-tests.mjs
git commit -m "feat(trip): planTrip honours per-dive gases (falls back to shared)"
```

---

## Task 2: `tripState` pure reducer

**Files:**
- Create: `js/tripState.js`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add `import { addDive, editDive, removeDive, rescheduleDive } from '../js/tripState.js';` near the other imports in `tests/run-tests.mjs`. Then add:

```js
describe('tripState - reducer', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
    const base = () => ({ gases: air, gfLow: 100, gfHigh: 100, dives: [] });

    test('addDive assigns a stable unique id and appends', () => {
        let t = base();
        t = addDive(t, { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = addDive(t, { startDateTime: 660, maxDepth: 30, bottomTime: 35, gases: air });
        expect(t.dives.length).toBe(2);
        expect(t.dives[0].id).toBe('d1');
        expect(t.dives[1].id).toBe('d2');
        expect(t.dives[1].maxDepth).toBe(30);
    });

    test('addDive does not mutate the input trip', () => {
        const t0 = base();
        const t1 = addDive(t0, { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        expect(t0.dives.length).toBe(0);
        expect(t1.dives.length).toBe(1);
    });

    test('editDive patches fields by id, leaving others untouched', () => {
        let t = addDive(base(), { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = editDive(t, 'd1', { maxDepth: 18, bottomTime: 50 });
        expect(t.dives[0].maxDepth).toBe(18);
        expect(t.dives[0].bottomTime).toBe(50);
        expect(t.dives[0].startDateTime).toBe(540);
    });

    test('rescheduleDive changes only startDateTime', () => {
        let t = addDive(base(), { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = rescheduleDive(t, 'd1', 600);
        expect(t.dives[0].startDateTime).toBe(600);
        expect(t.dives[0].maxDepth).toBe(40);
    });

    test('removeDive drops the dive by id; remaining ids are unchanged', () => {
        let t = addDive(base(), { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = addDive(t, { startDateTime: 660, maxDepth: 30, bottomTime: 35, gases: air });
        t = removeDive(t, 'd1');
        expect(t.dives.length).toBe(1);
        expect(t.dives[0].id).toBe('d2');
    });

    test('ids never collide after a remove (max-based, not length-based)', () => {
        let t = addDive(base(), { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = addDive(t, { startDateTime: 660, maxDepth: 30, bottomTime: 35, gases: air });
        t = removeDive(t, 'd1');                 // leaves d2
        t = addDive(t, { startDateTime: 780, maxDepth: 20, bottomTime: 40, gases: air });
        expect(t.dives.map(d => d.id)).toEqual(['d2', 'd3']);  // not a duplicate 'd2'
    });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test 2>&1 | grep -i "tripState\|Cannot find"`
Expected: FAIL — module `../js/tripState.js` does not exist.

- [ ] **Step 3: Implement**

Create `js/tripState.js`:

```js
/**
 * Pure reducer over a trip's dive list. Every operation returns a NEW trip
 * (immutable update); the dives array is ready to feed planTrip().
 *
 * A trip dive: { id, startDateTime (epoch minutes), maxDepth, bottomTime, gases }.
 * Pure module — no DOM, no side effects.
 */

/**
 * Next stable id: 'd<n>' where n is one past the highest existing numeric suffix.
 * Max-based (not length-based) so ids never collide after a removal.
 */
function nextId(dives) {
    let max = 0;
    for (const d of dives) {
        const m = /^d(\d+)$/.exec(d.id || '');
        if (m) max = Math.max(max, Number(m[1]));
    }
    return 'd' + (max + 1);
}

export function addDive(trip, fields) {
    const dive = { id: nextId(trip.dives), ...fields };
    return { ...trip, dives: [...trip.dives, dive] };
}

export function editDive(trip, id, patch) {
    return {
        ...trip,
        dives: trip.dives.map(d => (d.id === id ? { ...d, ...patch } : d))
    };
}

export function removeDive(trip, id) {
    return { ...trip, dives: trip.dives.filter(d => d.id !== id) };
}

export function rescheduleDive(trip, id, startDateTime) {
    return editDive(trip, id, { startDateTime });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add js/tripState.js tests/run-tests.mjs
git commit -m "feat(trip): pure tripState reducer (add/edit/remove/reschedule)"
```

---

## Task 3: `computeCalendarLayout` pure layout

**Files:**
- Create: `js/calendarLayout.js`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add `import { computeCalendarLayout } from '../js/calendarLayout.js';` near the other imports. Then:

```js
describe('calendarLayout - computeCalendarLayout', () => {
    const win = { dayStartMin: 6 * 60, dayEndMin: 20 * 60 }; // 06:00–20:00, span 840 min

    test('positions a dive block by start time and duration within the day window', () => {
        // Dive on day 0 (epoch day 0), 09:00 start, ends 10:00 (60 min).
        const planResult = {
            dives: [{ id: 'd1', startDateTime: 9 * 60, endDateTime: 10 * 60 }],
            conflicts: []
        };
        const layout = computeCalendarLayout(planResult, win);
        expect(layout.dayCount).toBe(1);
        const b = layout.blocks[0];
        expect(b.diveId).toBe('d1');
        expect(b.dayIndex).toBe(0);
        // top = (540 - 360) / 840 * 100
        expect(b.topPct).toBeCloseTo((540 - 360) / 840 * 100, 4);
        // height = 60 / 840 * 100
        expect(b.heightPct).toBeCloseTo(60 / 840 * 100, 4);
        expect(b.conflict).toBe(false);
    });

    test('spans multiple day columns and flags conflicts', () => {
        const planResult = {
            dives: [
                { id: 'd1', startDateTime: 9 * 60,            endDateTime: 10 * 60 },        // day 0
                { id: 'd2', startDateTime: (24 * 60) + 9 * 60, endDateTime: (24 * 60) + 10 * 60 } // day 1
            ],
            conflicts: [{ diveId: 'd2', type: 'overlap', overrunMinutes: 5 }]
        };
        const layout = computeCalendarLayout(planResult, win);
        expect(layout.dayCount).toBe(2);
        expect(layout.blocks.find(b => b.diveId === 'd1').dayIndex).toBe(0);
        expect(layout.blocks.find(b => b.diveId === 'd2').dayIndex).toBe(1);
        expect(layout.blocks.find(b => b.diveId === 'd2').conflict).toBe(true);
    });

    test('empty trip yields one day column and no blocks', () => {
        const layout = computeCalendarLayout({ dives: [], conflicts: [] }, win);
        expect(layout.dayCount).toBe(1);
        expect(layout.blocks).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test 2>&1 | grep -i "calendarLayout\|Cannot find"`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `js/calendarLayout.js`:

```js
/**
 * Pure calendar layout: turn a planTrip result into positioned blocks across
 * day columns. No DOM. Heights/positions are percentages of the visible day
 * window so the renderer can map them to pixels freely.
 */

const MIN_PER_DAY = 24 * 60;

/**
 * @param {Object} planResult - planTrip() output: { dives:[{id,startDateTime,endDateTime}], conflicts:[{diveId}] }
 * @param {Object} windowConfig - { dayStartMin, dayEndMin } minutes-of-day for the visible window
 * @returns {{ dayCount:number, baseDay:number, blocks:Array }}
 *   blocks: { diveId, dayIndex, topPct, heightPct, conflict, startMinOfDay, endMinOfDay }
 */
export function computeCalendarLayout(planResult, windowConfig) {
    const { dayStartMin, dayEndMin } = windowConfig;
    const span = dayEndMin - dayStartMin;
    const dives = planResult.dives || [];
    const conflictIds = new Set((planResult.conflicts || []).map(c => c.diveId));

    if (dives.length === 0) {
        return { dayCount: 1, baseDay: 0, blocks: [] };
    }

    const days = dives.map(d => Math.floor(d.startDateTime / MIN_PER_DAY));
    const baseDay = Math.min(...days);
    const maxDay = Math.max(...days);
    const dayCount = (maxDay - baseDay) + 1;

    const clampPct = (p) => Math.max(0, Math.min(100, p));

    const blocks = dives.map(d => {
        const dayIndex = Math.floor(d.startDateTime / MIN_PER_DAY) - baseDay;
        const startMinOfDay = d.startDateTime - (baseDay + dayIndex) * MIN_PER_DAY;
        // Clamp the end into the same day window (a dive crossing midnight is
        // clamped to the window bottom for v1 — documented limitation).
        const endMinOfDay = Math.min(d.endDateTime - (baseDay + dayIndex) * MIN_PER_DAY, dayEndMin);
        const topPct = clampPct((startMinOfDay - dayStartMin) / span * 100);
        const heightPct = clampPct((endMinOfDay - startMinOfDay) / span * 100);
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

    return { dayCount, baseDay, blocks };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add js/calendarLayout.js tests/run-tests.mjs
git commit -m "feat(trip): pure computeCalendarLayout (day columns, positioned blocks)"
```

---

## Task 4: `TripCalendar` DOM renderer

**Files:**
- Create: `js/components/TripCalendar.js`

This component is DOM-only; correctness is verified when wired into the page (Task 6) via browser smoke test. Build it now with a clean interface.

- [ ] **Step 1: Implement the component**

Create `js/components/TripCalendar.js`:

```js
/**
 * Renders a trip as duration-spanning blocks across day columns, from a planTrip
 * result via computeCalendarLayout. Emits interaction events; owns no trip state.
 *
 * Events (CustomEvent, via addEventListener on the instance which extends EventTarget):
 *   'createAt'   detail: { dayIndex, minutesOfDay }  — user clicked empty area
 *   'selectDive' detail: { diveId }                  — user clicked a block
 */
import { computeCalendarLayout } from '../calendarLayout.js';

const MIN_PER_DAY = 24 * 60;
const DEFAULT_WINDOW = { dayStartMin: 6 * 60, dayEndMin: 20 * 60 };
const SNAP_MIN = 5;

export class TripCalendar extends EventTarget {
    constructor(container, config = {}) {
        super();
        this.container = container;
        this.window = config.window || DEFAULT_WINDOW;
        this.container.classList.add('trip-calendar');
    }

    /** Render from a planTrip result. */
    render(planResult) {
        const layout = computeCalendarLayout(planResult, this.window);
        const span = this.window.dayEndMin - this.window.dayStartMin;
        const byId = new Map((planResult.dives || []).map(d => [d.id, d]));
        this.container.innerHTML = '';

        // One extra empty column to let the user create on the next day.
        const cols = layout.dayCount + 1;
        for (let c = 0; c < cols; c++) {
            const col = document.createElement('div');
            col.className = 'tc-day';
            col.dataset.dayIndex = String(c);

            // Click empty area → createAt(dayIndex, snapped minutesOfDay)
            col.addEventListener('click', (e) => {
                if (e.target !== col) return; // ignore clicks that bubbled from a block
                const rect = col.getBoundingClientRect();
                const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                const raw = this.window.dayStartMin + frac * span;
                const minutesOfDay = Math.round(raw / SNAP_MIN) * SNAP_MIN;
                this.dispatchEvent(new CustomEvent('createAt', { detail: { dayIndex: c, minutesOfDay } }));
            });
            this.container.appendChild(col);
        }

        const colEls = this.container.querySelectorAll('.tc-day');
        layout.blocks.forEach(b => {
            const d = byId.get(b.diveId);
            const block = document.createElement('div');
            block.className = 'tc-block' + (b.conflict ? ' tc-conflict' : '');
            block.style.top = b.topPct + '%';
            block.style.height = Math.max(b.heightPct, 2) + '%';
            block.textContent = `${b.diveId.toUpperCase()} · ${d ? d.maxDepth : '?'}m`;
            block.title = b.conflict ? 'Overlaps previous dive\'s deco' : '';
            block.addEventListener('click', (e) => {
                e.stopPropagation();
                this.dispatchEvent(new CustomEvent('selectDive', { detail: { diveId: b.diveId } }));
            });
            colEls[b.dayIndex].appendChild(block);
        });

        this._layout = layout;
    }

    /** Convert a (dayIndex, minutesOfDay) from a createAt event into an absolute epoch-minute start. */
    toStartDateTime(dayIndex, minutesOfDay) {
        const baseDay = this._layout ? this._layout.baseDay : 0;
        return (baseDay + dayIndex) * MIN_PER_DAY + minutesOfDay;
    }
}
```

- [ ] **Step 2: Add calendar styles to `sandbox/repetitive-dives.html`**

In the page `<style>` block, add:

```css
    .trip-calendar { display:flex; gap:8px; align-items:stretch; min-height:420px; margin:1rem 0; }
    .tc-day { position:relative; flex:1 1 0; min-width:120px; border:1px solid var(--border-color,#ccc);
              border-radius:6px; background:var(--surface,#fafafa); cursor:crosshair; }
    .tc-block { position:absolute; left:4px; right:4px; box-sizing:border-box; padding:2px 4px;
                font-size:.75rem; color:#fff; background:#2980b9; border-radius:4px; overflow:hidden;
                cursor:pointer; }
    .tc-block.tc-conflict { background:#c0392b; outline:2px solid #c0392b; }
```

- [ ] **Step 3: Commit (component only; wiring is Task 6)**

```bash
git add js/components/TripCalendar.js sandbox/repetitive-dives.html
git commit -m "feat(trip): TripCalendar DOM renderer (duration blocks, create/select events)"
```

(`npm test` is unaffected — no node-testable code here. The component is exercised in Task 6's smoke test.)

---

## Task 5: Per-dive edit panel reusing `DiveSetupEditor`

**Files:**
- Create: `js/components/DiveEditPanel.js`

- [ ] **Step 1: Read the editor's API**

Read `js/components/DiveSetupEditor.js` around its constructor (line ~124), `getDiveSetup()` (~177), `setDiveSetup()` (~186), the `DEFAULT_EDITOR_OPTIONS` (~90), and how it emits `change` (search `_emitChange`). Confirm the option flags: `showQuickSetup`, `showGradientFactors`, `showSacRate`, `showMultiDive`, `showSurfaceInterval`, `showProfiles`, `showDescription`, `showImportExport`. Note how `getDiveSetup()` returns gases and `dives[0].waypoints`.

- [ ] **Step 2: Implement the panel**

Create `js/components/DiveEditPanel.js`:

```js
/**
 * Per-dive edit panel: a start date+time field plus a stripped-down DiveSetupEditor
 * (quick-setup depth/bottom-time + gas management). Emits 'apply' / 'remove'.
 *
 * Events:
 *   'apply'  detail: { id, patch: { startDateTime, maxDepth, bottomTime, gases } }
 *   'remove' detail: { id }
 */
import { DiveSetupEditor } from './DiveSetupEditor.js';

const MIN_PER_DAY = 24 * 60;

// epoch-minutes <-> <input type="datetime-local"> helpers (treat minute 0 as a fixed base date).
const BASE = Date.UTC(2026, 0, 1, 0, 0, 0); // arbitrary trip epoch; only relative days/times matter
function epochMinToLocalInput(min) {
    const d = new Date(BASE + min * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function localInputToEpochMin(value) {
    // value: 'YYYY-MM-DDTHH:MM' — parse as UTC against BASE
    const [datePart, timePart] = value.split('T');
    const [y, mo, da] = datePart.split('-').map(Number);
    const [h, mi] = timePart.split(':').map(Number);
    const ms = Date.UTC(y, mo - 1, da, h, mi);
    return Math.round((ms - BASE) / 60000);
}

function deriveMaxDepthBottomTime(setup) {
    const wps = setup.dives[0].waypoints;
    const maxDepth = Math.max(...wps.map(w => w.depth));
    // bottomTime = the latest time the profile is still at max depth (time leaving the bottom).
    const bottomTime = Math.max(...wps.filter(w => w.depth === maxDepth).map(w => w.time));
    return { maxDepth, bottomTime };
}

export class DiveEditPanel extends EventTarget {
    constructor(container) {
        super();
        this.container = container;
        this.dive = null;
    }

    open(dive) {
        this.dive = dive;
        this.container.innerHTML = `
            <div class="dep-row">
                <label>Start <input type="datetime-local" class="dep-start" value="${epochMinToLocalInput(dive.startDateTime)}"></label>
                <button class="dep-remove">Remove dive</button>
            </div>
            <div class="dep-editor"></div>`;

        // Seed a single-dive setup for the editor from this dive's params.
        const editorSetup = {
            gases: dive.gases,
            gfLow: 100, gfHigh: 100,
            dives: [{ waypoints: [] }] // editor's quick-setup will (re)generate waypoints from depth/time
        };
        this.editor = new DiveSetupEditor(this.container.querySelector('.dep-editor'), {
            diveSetup: editorSetup,
            options: {
                showProfiles: false, showQuickSetup: true, showGradientFactors: false,
                showSacRate: false, showMultiDive: false, showSurfaceInterval: false,
                showDescription: false, showImportExport: false
            }
        });

        // Pre-fill the quick-setup depth/time if the editor exposes those inputs.
        if (this.editor.elements && this.editor.elements.quickDepth) {
            this.editor.elements.quickDepth.value = dive.maxDepth;
            this.editor.elements.quickTime.value = dive.bottomTime;
        }

        const emitApply = () => {
            const setup = this.editor.getDiveSetup();
            const { maxDepth, bottomTime } = deriveMaxDepthBottomTime(setup);
            const startDateTime = localInputToEpochMin(this.container.querySelector('.dep-start').value);
            this.dispatchEvent(new CustomEvent('apply', {
                detail: { id: this.dive.id, patch: { startDateTime, maxDepth, bottomTime, gases: setup.gases } }
            }));
        };

        this.editor.addEventListener('change', emitApply);
        this.container.querySelector('.dep-start').addEventListener('change', emitApply);
        this.container.querySelector('.dep-remove').addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('remove', { detail: { id: this.dive.id } }));
        });
    }

    close() {
        if (this.editor && this.editor.destroy) this.editor.destroy();
        this.editor = null;
        this.dive = null;
        this.container.innerHTML = '';
    }
}
```

> The `deriveMaxDepthBottomTime` + quick-input pre-fill is the spec's flagged integration point. During the smoke test (Task 6) verify that editing depth/time in the panel actually changes the dive's block; if the editor's `getDiveSetup()` waypoints don't reflect the quick inputs until a "generate" action, call the editor's generate path or read `quickDepth`/`quickTime` directly instead — adjust here, don't guess silently.

- [ ] **Step 2b: Add panel styles to `sandbox/repetitive-dives.html`**

```css
    .dep-row { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:.5rem; }
    .dep-remove { color:#c0392b; cursor:pointer; }
```

- [ ] **Step 3: Commit**

```bash
git add js/components/DiveEditPanel.js sandbox/repetitive-dives.html
git commit -m "feat(trip): DiveEditPanel reusing DiveSetupEditor for per-dive depth/time/gas"
```

---

## Task 6: Wire the calendar into the page

**Files:**
- Modify: `sandbox/repetitive-dives.html`
- Modify: `sw.js`, `css/styles.css`

- [ ] **Step 1: Restructure the page script**

Read the current `sandbox/repetitive-dives.html` script. Replace the hardcoded-`setup` + one-shot `planTrip` + overview loop with a state-driven flow. Add imports:

```js
    import { TripCalendar } from '../js/components/TripCalendar.js';
    import { DiveEditPanel } from '../js/components/DiveEditPanel.js';
    import { addDive, editDive, removeDive } from '../js/tripState.js';
```

Add containers to the `<body>` (inside `.trip`, above `#panels`):

```html
    <div class="trip-config">
      <label>GF Low <input id="cfg-gflow" type="number" value="100" min="1" max="100"></label>
      <label>GF High <input id="cfg-gfhigh" type="number" value="100" min="1" max="100"></label>
    </div>
    <div id="calendar"></div>
    <div id="edit-panel"></div>
```

Introduce page state and a single re-render path:

```js
    const air = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0, cylinderVolume: 12, startPressure: 200 }];
    let trip = {
      gases: air, gfLow: 100, gfHigh: 100,
      dives: [
        { id: 'd1', startDateTime: 9 * 60,  maxDepth: 40, bottomTime: 30, gases: air },
        { id: 'd2', startDateTime: 11 * 60, maxDepth: 40, bottomTime: 30, gases: air }
      ]
    };

    const calendar = new TripCalendar(document.getElementById('calendar'));
    const editPanel = new DiveEditPanel(document.getElementById('edit-panel'));
    let lastResult = null;

    function rerender() {
      lastResult = planTrip(trip);              // planTrip already in scope from earlier import
      calendar.render(lastResult);
      renderOverview(lastResult);               // existing overview-building logic, refactored into a function
    }

    calendar.addEventListener('createAt', (e) => {
      const start = calendar.toStartDateTime(e.detail.dayIndex, e.detail.minutesOfDay);
      trip = addDive(trip, { startDateTime: start, maxDepth: 40, bottomTime: 30, gases: trip.gases });
      rerender();
    });
    calendar.addEventListener('selectDive', (e) => {
      const dive = trip.dives.find(d => d.id === e.detail.diveId);
      if (dive) editPanel.open(dive);
    });
    editPanel.addEventListener('apply', (e) => { trip = editDive(trip, e.detail.id, e.detail.patch); rerender(); });
    editPanel.addEventListener('remove', (e) => { trip = removeDive(trip, e.detail.id); editPanel.close(); rerender(); });

    document.getElementById('cfg-gflow').addEventListener('change', (ev) => { trip = { ...trip, gfLow: +ev.target.value }; rerender(); });
    document.getElementById('cfg-gfhigh').addEventListener('change', (ev) => { trip = { ...trip, gfHigh: +ev.target.value }; rerender(); });

    rerender();
```

Refactor the existing overview-panel building (the old `trip.dives.forEach` block that builds `.dive-card`s and the detail-view `showDetail`) into a `renderOverview(result)` function that consumes a `planTrip` result. The detail view's `showDetail(diveId)` must look the dive up in `result.dives` (or keep using the trip + result). Keep the existing detail-view behaviour intact (it already takes a per-dive `seededSetup`).

> This is the integration-heavy step. Preserve the existing overview + detail-view code; just drive it from `rerender()` instead of a one-shot pass, and source `gases` per dive from the trip dive (`d.gases`) when building each `seededSetup` (so the detail view reflects per-dive gases).

- [ ] **Step 2: Browser smoke test (REQUIRED)**

Serve `python3 -m http.server 5500` (background). Use Playwright (the `example-skills:webapp-testing` skill or a short script) on `http://localhost:5500/sandbox/repetitive-dives.html`. Assert:
1. ZERO console/page errors on load.
2. The calendar renders day columns with two duration-spanning blocks (D1, D2).
3. Clicking empty area in a day column creates a third dive (block appears; overview gains a panel).
4. Clicking a block opens the edit panel; changing the depth input updates that dive's block height and the overview deco figure.
5. Creating a dive that starts before the prior dive's deco-end shows a red `.tc-conflict` block.
6. Clicking a block → the existing seeded detail view still opens (via the overview/selection path).
7. Removing a dive drops its block and overview panel.
Capture a screenshot. Stop the server. Fix any breakage before committing; if a chart/editor wiring fails, debug against `sandbox/index.html`. Do not commit a broken page.

- [ ] **Step 3: Register modules + bump version**

- Add to `sw.js` `STATIC_ASSETS` (matching neighbour path style): `'./js/tripState.js'`, `'./js/calendarLayout.js'`, `'./js/components/TripCalendar.js'`, `'./js/components/DiveEditPanel.js'`, and `'./js/components/DiveSetupEditor.js'` if not already present (grep first).
- Bump `sw.js` `CACHE_NAME` `deco-theory-0.6.6` → `deco-theory-0.6.7`.
- Update `css/styles.css` `.version-number::after` content to `"0.6.7"`.

- [ ] **Step 4: Final test run + commit**

Run: `npm test 2>&1 | tail -3` → expect `✅ All tests passed!`.

```bash
git add sandbox/repetitive-dives.html sw.js css/styles.css
git commit -m "feat(trip): editable calendar drives the trip; per-dive gases in detail view + version bump"
```

---

## Task 7: Wiki documentation

**Files:**
- Modify: `wiki/Module-Reference.md`

- [ ] **Step 1: Document the new modules**

Add `Module-Reference.md` entries for: `js/tripState.js` (pure reducer — add/edit/remove/reschedule), `js/calendarLayout.js` (pure `computeCalendarLayout`), `js/components/TripCalendar.js` (DOM calendar, `createAt`/`selectDive` events), `js/components/DiveEditPanel.js` (per-dive edit panel reusing `DiveSetupEditor`). Note `planTrip` now uses per-dive `dive.gases` with fallback to `diveSetup.gases`.

- [ ] **Step 2: Verify citations + commit**

Re-open the new files; confirm any file:line references match. Then:

```bash
git add wiki/
git commit -m "docs(wiki): document tripState, calendarLayout, TripCalendar, DiveEditPanel; per-dive gases"
```

(Do not push to the wiki remote — controller handles wiki sync.)

---

## Self-Review (completed during planning)

- **Spec coverage:** per-dive gases → Task 1; trip-state reducer → Task 2; calendar render (duration blocks/conflicts) → Tasks 3 (layout) + 4 (DOM); create/edit via reused editor → Tasks 4–5; wiring + trip config → Task 6; wiki → Task 7. Drag, chart-mode toggles, URL persistence are correctly OUT (③-rich). No gaps.
- **Placeholder scan:** none — pure tasks have full code; UI tasks have full component code + explicit smoke acceptance.
- **Type/name consistency:** trip dive shape `{ id, startDateTime, maxDepth, bottomTime, gases }` consistent across tripState, planTrip, DiveEditPanel `patch`, and the page. `computeCalendarLayout` block shape (`diveId/dayIndex/topPct/heightPct/conflict`) consistent between Task 3 and TripCalendar. Events `createAt`/`selectDive` (TripCalendar) and `apply`/`remove` (DiveEditPanel) consistent between component and page wiring.
- **Risk:** the editor maxDepth/bottomTime extraction (Task 5) and the page rewiring (Task 6) are the integration risks — both gated on the mandatory browser smoke test in Task 6, with explicit instructions to debug against `sandbox/index.html` rather than guess. Pure logic (Tasks 1–3) is unit-tested; the existing 221-suite must stay green throughout.
