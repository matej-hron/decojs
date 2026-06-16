# Repetitive Planner Master–Detail UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a clicked dive's chart + summary + controls appear in place under the calendar (master–detail), and clean up the calendar block labels.

**Architecture:** The calendar is the master list; a single `#selected` panel below it is the detail, rebuilt by `renderSelected()` on every plan. The old all-cards stack (`#panels`), inline edit strip (`#edit-panel`), and full-page detail (`#detail`) collapse into `#selected`. A pure `diveBlockLabel()` helper produces clean block text; `planTrip` echoes `ndlLocked`.

**Tech Stack:** Pure ES modules, no build step. Custom test runner `tests/run-tests.mjs` (`npm test`, NOT Jest). Playwright for browser smoke. Chart.js components: `DiveProfileChart`, `MValueChart`, `GFChart`.

**Spec:** `docs/superpowers/specs/2026-06-16-trip-ux-master-detail-design.md`
**Branch:** `feat/trip-ux-master-detail` (already created, stacked on `feat/ndl-invalid-and-no-safety-stop`).

---

## File Structure

| File | Change |
|---|---|
| `js/tripPlanner.js` | Echo `ndlLocked` on result dives + typedef. |
| `js/components/TripCalendar.js` | Replace `decoLabelSuffix` with `diveBlockLabel`; render uses it. |
| `sandbox/repetitive-dives.html` | Master–detail restructure: `#selected` panel + `renderSelected`; remove `#panels`/`#edit-panel`/`#detail` and `renderOverview`/`showDetail`/`showOverview`; deco-shaded blocks; inline `<style>`. |
| `tests/run-tests.mjs` | `diveBlockLabel` tests (replace `decoLabelSuffix`); `planTrip` `ndlLocked`-echo test. |
| `sw.js`, `css/styles.css` | Version bump. |
| `wiki/Module-Reference.md` | Document the changes. |

---

## Task 1: Engine echo + clean block label

**Files:**
- Modify: `js/tripPlanner.js`, `js/components/TripCalendar.js`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing tests**

In `tests/run-tests.mjs`, change the import on line ~191 from:
```javascript
import { snapClamp, decoLabelSuffix } from '../js/components/TripCalendar.js';
```
to:
```javascript
import { snapClamp, diveBlockLabel } from '../js/components/TripCalendar.js';
```

Replace the entire existing `describe('TripCalendar - decoLabelSuffix', () => { ... })` block with:
```javascript
describe('TripCalendar - diveBlockLabel', () => {
    test('no-deco dive: name, depth, bottom time', () => {
        const d = { name: 'Dive 2', maxDepth: 40, bottomTime: 22, profile: { totalDecoTime: 0, decoStops: [] } };
        expect(diveBlockLabel(d)).toBe('Dive 2 · 40m · 22min');
    });
    test('deco dive: appends +N deco', () => {
        const d = { name: 'Dive 2', maxDepth: 40, bottomTime: 30, profile: { totalDecoTime: 28, decoStops: [{ depth: 9, time: 5 }] } };
        expect(diveBlockLabel(d)).toBe('Dive 2 · 40m · 30min · +28 deco');
    });
    test('NDL-locked no-deco dive: appends NDL tag', () => {
        const d = { name: 'Dive 2', maxDepth: 40, bottomTime: 22, ndlLocked: true, profile: { totalDecoTime: 0, decoStops: [] } };
        expect(diveBlockLabel(d)).toBe('Dive 2 · 40m · 22min · NDL');
    });
    test('invalid dive: no-deco N/A', () => {
        const d = { name: 'Dive 2', maxDepth: 40, bottomTime: 2, invalid: true, profile: { totalDecoTime: 0, decoStops: [] } };
        expect(diveBlockLabel(d)).toBe('Dive 2 · 40m · ⚠ no-deco N/A');
    });
    test('falls back to id.toUpperCase() when name absent', () => {
        const d = { id: 'd3', maxDepth: 18, bottomTime: 40, profile: { totalDecoTime: 0, decoStops: [] } };
        expect(diveBlockLabel(d)).toBe('D3 · 18m · 40min');
    });
});
```

Also, inside the existing `describe('tripPlanner - planTrip', ...)` block, add:
```javascript
    test('result echoes ndlLocked', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 5, ndlLocked: true },
                { id: 'd2', startDateTime: 1000, maxDepth: 30, bottomTime: 20 }
            ]
        });
        expect(trip.dives.find(d => d.id === 'd1').ndlLocked).toBe(true);
        expect(trip.dives.find(d => d.id === 'd2').ndlLocked).toBe(false);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -A2 "diveBlockLabel\|echoes ndlLocked"`
Expected: import error / failures — `diveBlockLabel` not exported, `ndlLocked` not on result.

- [ ] **Step 3: Implement `diveBlockLabel` in `TripCalendar.js`**

In `js/components/TripCalendar.js`, replace the exported `decoLabelSuffix` function (the JSDoc + function) with:
```javascript
/**
 * Full calendar-block label for a planTrip result dive. The number shown is the
 * bottom time — the block's HEIGHT already conveys total runtime, so runtime/TTS
 * are not repeated here (they live in the selected-dive panel).
 * @param {Object} d - planTrip result dive: { name?, id?, maxDepth, bottomTime, ndlLocked?, invalid?, profile }
 * @returns {string}
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

In `render`, the block label/title block currently reads (the `if (d && d.invalid) { ... } else { ... }` added earlier). Replace that whole label/title section with:
```javascript
            block.textContent = diveBlockLabel(d);
            block.title = (d && d.invalid)
                ? 'No-deco not possible here — too pre-saturated'
                : (b.conflict ? 'Overlaps previous dive\'s deco' : '');
```
(The `name`/`depth`/`runtime` locals previously used only for the label can be removed if now unused; keep `const d = byId.get(b.diveId)` and the class logic.)

- [ ] **Step 4: Implement `ndlLocked` echo in `planTrip`**

In `js/tripPlanner.js`, in the `results.push({ ... })` object, add `ndlLocked: !!dive.ndlLocked,` (e.g. right after `bottomTime,`). In the `TripDiveResult` typedef, add:
```javascript
 * @property {boolean} ndlLocked     Echo of the input dive's NDL-lock flag.
```

- [ ] **Step 5: Run tests**

Run: `npm test 2>&1 | tail -3`
Expected: all pass (the 5 label tests + the echo test replace the 3 old `decoLabelSuffix` tests; net +3).

- [ ] **Step 6: Commit**

```bash
git add js/tripPlanner.js js/components/TripCalendar.js tests/run-tests.mjs
git commit -m "feat(calendar): clean block label (bottom time + deco/NDL tag); echo ndlLocked

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Master–detail skeleton (`#selected` panel)

Replace the three view regions with `#selected` + `renderSelected` showing summary + profile chart + mode toggles, with auto-selection. (Edit/Delete/Full-analysis come in Task 3.)

**Files:**
- Modify: `sandbox/repetitive-dives.html`

- [ ] **Step 1: Restructure the DOM**

In `sandbox/repetitive-dives.html`, replace the content block:
```html
    <div id="calendar"></div>
    <div id="edit-panel"></div>
    <div id="add-dialog"></div>
    <div id="panels"></div>
    <div id="detail" style="display:none;"></div>
```
with:
```html
    <div id="calendar"></div>
    <div id="selected"></div>
    <div id="add-dialog"></div>
```

- [ ] **Step 2: Add panel CSS**

In the inline `<style>`, add (near the `.dive-card` rules):
```css
    .sel-header { display:flex; justify-content:space-between; align-items:center; gap:1rem; }
    .sel-header h2 { margin:.25rem 0; font-size:1.15rem; }
    .sel-actions { display:flex; gap:.5rem; }
    .sel-actions button { cursor:pointer; font-size:.85rem; padding:.2rem .6rem; border:1px solid var(--border-color,#ccc); border-radius:4px; background:var(--surface,#f7f7f7); }
    .sel-delete { color:#c0392b; }
    .sel-edit-form { margin:.5rem 0; }
    .sel-full { margin-top:.75rem; }
    .sel-full > summary { cursor:pointer; font-weight:600; font-size:.95rem; padding:.3rem 0; }
    #selected .chart-host { height:auto; min-height:320px; display:flex; flex-direction:column; }
    #selected .chart-host .dpc-chart-container { flex:0 0 320px; min-height:0; }
    #sel-profile { min-height:560px; }
    #sel-profile .dpc-chart-container { flex:0 0 560px; }
    #sel-mvalue, #sel-gf { min-height:700px; }
    #sel-mvalue .dpc-chart-container, #sel-gf .dpc-chart-container { flex:0 0 700px; }
```

- [ ] **Step 3: Replace the rendering machinery**

In the script, there are: `let overviewCharts`, `function renderOverview`, `let detailCharts`, `function disposeDetail`, `function showOverview`, `function showDetail`, plus `let detailDiveId`, the `const overview`/`const detail` refs, `function reRenderProfiles`, and the `rerender`/`rerenderDeferred` functions. Make these changes:

(a) Replace the `const overview = panels;` / `const detail = ...` lines and the chart-state vars. Find:
```javascript
    const overview   = panels;
    const detail     = document.getElementById('detail');
```
Replace with:
```javascript
    const selectedHost = document.getElementById('selected');
```
(If `panels` is declared above as `document.getElementById('panels')`, replace that declaration with `const selectedHost = document.getElementById('selected');` and remove the `overview`/`detail` lines. Ensure no remaining references to `panels`, `overview`, or `detail` survive — search and update.)

(b) Replace `function reRenderProfiles()` with:
```javascript
    function reRenderProfiles() {
      renderSelected(); // single view now — re-render picks up the new modes
    }
```

(c) Delete `let detailDiveId = null;`, `let overviewCharts = [];`, `function renderOverview(...) { ... }`, `let detailCharts = [];`, `function disposeDetail() { ... }`, `function showOverview() { ... }`, and `function showDetail(diveId) { ... }` entirely.

(d) Add the new selected-panel state + render function (place where `renderOverview` was):
```javascript
    // ── Selected-dive panel (master–detail) ─────────────────────────────────
    let selectedCharts = [];
    let editingOpen = false;
    let fullAnalysisOpen = false;

    function disposeSelected() {
      selectedCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
      selectedCharts = [];
    }

    function renderSelected() {
      disposeSelected();
      if (!lastResult || !lastResult.dives.length) { selectedHost.innerHTML = ''; return; }
      if (!selectedDiveId || !lastResult.dives.some(x => x.id === selectedDiveId)) {
        selectedDiveId = lastResult.dives[0].id;
      }
      const d = lastResult.dives.find(x => x.id === selectedDiveId);
      const siLine = d.surfaceIntervalBefore == null ? 'first dive' : `SI ${fmtDur(d.surfaceIntervalBefore)}`;
      const headerHtml = `
        <div class="sel-header">
          <h2>${esc(d.name || d.id.toUpperCase())} — ${fmtClock(d.startDateTime)}</h2>
          <div class="sel-actions"><button class="sel-edit">✎ Edit</button><button class="sel-delete">🗑 Delete</button></div>
        </div>`;

      if (d.invalid) {
        selectedHost.innerHTML = headerHtml
          + `<div class="dive-meta">${siLine} · ${d.maxDepth}m · invalid</div>`
          + INVALID_NDL_HTML
          + '<h3>Pre-saturation at start (surfacing GF per tissue)</h3>'
          + (d.surfaceIntervalBefore == null ? '<p>Fresh diver — no residual loading.</p>' : presatStrip(d.startingTissue))
          + '<div class="sel-edit-form"></div>';
        return;
      }

      const runtime = Math.round(d.endDateTime - d.startDateTime);
      const tts = Math.round(runtime - d.bottomTime);
      const deco = d.profile.totalDecoTime;
      const stops = d.profile.decoStops || [];
      const deepest = stops.length ? Math.max(...stops.map(s => s.depth)) : null;
      const presat = d.surfaceIntervalBefore == null ? null : surfacingGF(d.startingTissue);
      const parts = [siLine, `${d.maxDepth}m`, `${Math.round(d.bottomTime)}min bottom`, `${runtime}min runtime`];
      if (deco > 0) {
        parts.push(`+${Math.round(deco)}min deco`);
        if (deepest != null) parts.push(`first stop ${deepest}m`);
        parts.push(`TTS ${tts}min`);
      } else {
        parts.push('no-deco');
      }
      if (presat) parts.push(`pre-load ${Math.round(presat.controllingPct)}% (#${presat.controllingCompartmentId})`);

      selectedHost.innerHTML = headerHtml
        + `<div class="dive-meta">${parts.join(' · ')}</div>`
        + (d.surfaceIntervalBefore == null ? '' : presatStrip(d.startingTissue))
        + '<div class="sel-edit-form"></div>'
        + '<div id="sel-modes"></div><div class="chart-host" id="sel-profile"></div>'
        + `<details class="sel-full"${fullAnalysisOpen ? ' open' : ''}><summary>Full analysis (M-value, GF, runtime)</summary><div class="sel-full-body"></div></details>`;

      document.getElementById('sel-modes').appendChild(buildModeToggles());

      const diveGases = (trip.dives.find(td => td.id === d.id)?.gases) ?? trip.gases;
      const seededSetup = {
        ...trip, gases: diveGases,
        dives: [{ waypoints: d.profile.waypoints }],
        surfaceInterval: 0, initialTissuePressures: d.startingTissue,
        sacRate: 20, decoSacRate: 15
      };

      const profileChart = new DiveProfileChart(selectedHost.querySelector('#sel-profile'), {
        diveSetup: seededSetup, options: { showLabels: true, showCeiling: true, showLegend: false, ...profileModes }
      });
      selectedCharts.push(profileChart);

      const details = selectedHost.querySelector('.sel-full');
      const buildFull = () => {
        const body = details.querySelector('.sel-full-body');
        if (body.dataset.built) return;
        body.dataset.built = '1';
        body.innerHTML = '<h3>M-value loading</h3><div class="chart-host" id="sel-mvalue"></div>'
          + '<h3>Gradient factor</h3><div class="chart-host" id="sel-gf"></div>'
          + '<h3>Runtime</h3><div id="sel-runtime"></div>';
        const mvalueChart = new MValueChart(body.querySelector('#sel-mvalue'), {
          diveSetup: seededSetup,
          options: { compartments: [1], showMValueLines: true, showGFLines: true, showAmbientLine: true, showTrail: true, compartmentSelector: true }
        });
        const gfChart = new GFChart(body.querySelector('#sel-gf'), {
          diveSetup: seededSetup,
          options: { compartments: [1, 2, 3, 4, 5, 6], showTrail: true, compartmentSelector: true }
        });
        selectedCharts.push(mvalueChart, gfChart);
        const rows = buildRuntimeRows(d.profile, seededSetup.gases);
        body.querySelector('#sel-runtime').appendChild(renderRuntimeTable(rows));
      };
      details.addEventListener('toggle', () => { fullAnalysisOpen = details.open; if (details.open) buildFull(); });
      if (fullAnalysisOpen) buildFull();
    }
```

- [ ] **Step 4: Rewire `rerender` and the events**

Find `function rerender()`. It currently calls `renderOverview` via the `ovTimer`. Replace its body with:
```javascript
    function rerender() {
      clearTimeout(calcTimer);
      lastResult = planTrip(trip);
      const neededDays = Math.max(trip.dayCount || 1, 1,
        ...trip.dives.map(d => Math.floor(d.startDateTime / (24 * 60)) + 1));
      calendar.configure({ startDate: trip.startDate, dayCount: neededDays });
      calendar.render(lastResult, selectedDiveId);
      renderSelected();
      updateUrlWithTrip(trip);
    }
```
(Remove the `ovTimer`/`setTimeout(renderOverview…)` lines and the now-unused `let ovTimer`.)

Replace the `selectDive` handler (currently opens `editPanel`) with:
```javascript
    calendar.addEventListener('selectDive', (e) => {
      selectedDiveId = e.detail.diveId;
      editingOpen = false;       // switching dives closes any open edit form
      rerender();
    });
```

Replace the `reschedule` handler's body (remove the manual `editPanel.open` refresh — `renderSelected` handles it) with:
```javascript
    calendar.addEventListener('reschedule', (e) => {
      trip = rescheduleDive(trip, e.detail.diveId, e.detail.startDateTime);
      selectedDiveId = e.detail.diveId;
      rerender();
    });
```

Delete the old `editPanel`-related handlers for now (the `editPanel.addEventListener('apply'…)` and `('remove'…)` blocks) and the `const editPanel = new DiveEditPanel(...)` line — they are re-introduced in Task 3 inside the panel. Also remove the `DiveEditPanel` import if Task 3 re-adds it; simplest: **leave the `DiveEditPanel` import in place** and just remove the global `editPanel` instance + its two handlers here (Task 3 creates panel instances on demand).

- [ ] **Step 5: Verify parse + suite**

Run: `node --check` is not applicable to HTML; instead run `npm test 2>&1 | tail -3` (expect unchanged pass count from Task 1) and confirm the page has no obvious syntax error by loading it (next step).

- [ ] **Step 6: Browser smoke (Playwright)**

Serve (`python3 -m http.server 5500`) and drive `http://localhost:5500/sandbox/repetitive-dives.html`:
1. On load: `#selected` shows the first dive's summary + profile chart; `#panels`/`#detail`/`#edit-panel` do not exist in the DOM. No console errors.
2. Click the 2nd, then 3rd dive's calendar block → `#selected` updates in place to that dive's summary + profile chart each time. No console errors over repeated clicks (charts disposed, not leaked).
3. Toggle a profile mode checkbox → the profile chart re-renders.
4. Expand **Full analysis** → M-value + GF + runtime appear; re-selecting another dive and re-expanding works with no console errors.

If any check fails, STOP and report.

- [ ] **Step 7: Commit**

```bash
git add sandbox/repetitive-dives.html
git commit -m "feat(trip-ui): master-detail — single selected-dive panel under calendar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Edit + Delete in the selected panel

**Files:**
- Modify: `sandbox/repetitive-dives.html`

- [ ] **Step 1: Add the Edit/Delete wiring + open-form helper**

In `sandbox/repetitive-dives.html`, the `DiveEditPanel` is imported already. Add a module-level `let editPanel = null;` near the other `let` state. After `renderSelected` is defined, add:
```javascript
    function deleteDive(id) {
      trip = removeDive(trip, id);
      editingOpen = false;
      selectedDiveId = (trip.dives[0] && trip.dives[0].id) || null;
      rerender();
    }

    function openEditForm(d) {
      const formHost = selectedHost.querySelector('.sel-edit-form');
      if (!formHost) return;
      editPanel = new DiveEditPanel(formHost);
      editPanel.addEventListener('apply', (e) => {
        trip = editDive(trip, e.detail.id, e.detail.patch);
        rerenderDeferred();
      });
      editPanel.addEventListener('remove', () => deleteDive(d.id));
      const raw = trip.dives.find(td => td.id === d.id);
      if (raw) editPanel.open(raw, trip.startDate, d.bottomTime);
    }

    function wireSelectedActions(d) {
      const editBtn = selectedHost.querySelector('.sel-edit');
      const delBtn = selectedHost.querySelector('.sel-delete');
      if (editBtn) editBtn.addEventListener('click', () => {
        editingOpen = !editingOpen;
        if (editingOpen) openEditForm(d);
        else { if (editPanel) editPanel.close(); editPanel = null; }
      });
      if (delBtn) delBtn.addEventListener('click', () => deleteDive(d.id));
    }
```

- [ ] **Step 2: Call the wiring + re-open the form from `renderSelected`**

In `renderSelected`, at the END of BOTH the invalid branch (just before its `return;`) and the normal path (after the profile/full-analysis block), add:
```javascript
      wireSelectedActions(d);
      if (editingOpen) openEditForm(d);
```
(For the invalid branch, insert `wireSelectedActions(d); if (editingOpen) openEditForm(d);` before `return;`.)

- [ ] **Step 3: Verify suite**

Run: `npm test 2>&1 | tail -3`
Expected: unchanged pass count (no new unit tests; DOM logic).

- [ ] **Step 4: Browser smoke (Playwright)**

Drive `http://localhost:5500/sandbox/repetitive-dives.html`:
1. Select a dive → click **✎ Edit** → the inline edit form (name/start/depth/bottom-time/No-deco) appears. Change the depth value and blur → the calendar block + summary update to the new depth, and the edit form stays open (not collapsed). No console errors.
2. Click **✎ Edit** again → the form hides.
3. Click **🗑 Delete** → the dive is removed; selection moves to a remaining dive; the calendar updates. No console errors.
4. Select an NDL-locked dive, Edit, uncheck No-deco → it becomes a custom dive (bottom-time editable). 
5. Select an invalid dive → Edit and Delete still work (Edit lets you uncheck No-deco to fix it).

If any check fails, STOP and report.

- [ ] **Step 5: Commit**

```bash
git add sandbox/repetitive-dives.html
git commit -m "feat(trip-ui): inline edit + delete in the selected-dive panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Deco-shaded calendar blocks (separable)

**Files:**
- Modify: `js/components/TripCalendar.js`

- [ ] **Step 1: Shade the deco portion of deco blocks**

In `js/components/TripCalendar.js` `render`, after the block class + label are set and before appending, add (using the planned dive `d`):
```javascript
            // Shade the ascent+deco portion: solid for the bottom phase, lighter above,
            // so the tall part of a deco block visually reads as the "+N deco".
            if (d && !d.invalid && d.profile && d.profile.totalDecoTime > 0) {
                const runtime = d.endDateTime - d.startDateTime;
                const frac = runtime > 0 ? Math.max(0, Math.min(100, Math.round((d.bottomTime / runtime) * 100))) : 100;
                block.style.background =
                    `linear-gradient(to bottom, #2980b9 0%, #2980b9 ${frac}%, #5dade2 ${frac}%, #5dade2 100%)`;
            }
```
(No-deco blocks keep the default solid `#2980b9` from CSS; invalid blocks keep their hatched style — the guard excludes both. The conflict style sets its own background via the `.tc-conflict` class, which still wins for overlaps since the inline style is only set for non-conflict deco dives — verify a conflicting deco dive still shows red; if the inline style overrides the conflict red undesirably, also guard with `!b.conflict`.)

Add `&& !b.conflict` to the guard so overlap-red is never overridden:
```javascript
            if (d && !d.invalid && !b.conflict && d.profile && d.profile.totalDecoTime > 0) {
```

- [ ] **Step 2: Verify suite + browser**

Run: `npm test 2>&1 | tail -3` (unchanged; no unit test for inline style).
Browser: a deco dive's block shows a two-tone fill (darker bottom portion, lighter ascent/deco band); a no-deco dive is solid; a conflicting dive is still red; an invalid dive is still hatched. No console errors.

- [ ] **Step 3: Commit**

```bash
git add js/components/TripCalendar.js
git commit -m "feat(calendar): shade the deco portion of deco blocks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Version bump + wiki

**Files:**
- Modify: `sw.js:2`, `css/styles.css` (`.version-number::after`), `wiki/Module-Reference.md`

- [ ] **Step 1: Bump cache name** — `sw.js` line 2 patch +1.
- [ ] **Step 2: Bump visible version** — `css/styles.css` `.version-number::after` content to the SAME string.
- [ ] **Step 3: Wiki** — in `wiki/Module-Reference.md`: `TripCalendar` now exports `diveBlockLabel(plannedDive)` (returns `name · depth · bottom-time` with a `+N deco` or `NDL` tag; invalid → `⚠ no-deco N/A`) replacing `decoLabelSuffix`, and shades the deco portion of deco blocks; `planTrip` result dives echo `ndlLocked`; the repetitive page is master–detail (calendar + a single `#selected` panel rebuilt by `renderSelected`).
- [ ] **Step 4: Run suite** — `npm test 2>&1 | tail -3` → all pass.
- [ ] **Step 5: Commit**
```bash
git add sw.js css/styles.css wiki/Module-Reference.md
git commit -m "chore: version bump + wiki for master-detail UX

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- A page structure (#selected replaces #panels/#edit-panel/#detail) → Task 2 Steps 1,3,4. ✓
- B selected panel (header Edit/Delete, summary, pre-sat strip, profile + modes, Full-analysis disclosure, inline edit, invalid handling, dispose lifecycle, editing/fullAnalysis state) → Task 2 (skeleton, summary, profile, modes, full-analysis, dispose, invalid) + Task 3 (edit/delete, editing-state re-open). ✓
- C diveBlockLabel (bottom time + deco/NDL tag) → Task 1. ✓
- D planTrip echoes ndlLocked → Task 1 Step 4. ✓
- E block deco shading → Task 4. ✓
- F testing (diveBlockLabel + ndlLocked unit; browser smokes) → Task 1 unit; Task 2/3 smokes. ✓
- G versioning + wiki → Task 5. ✓

**Placeholder scan:** No TBD/TODO; code provided for every step. Task 2 Step 3 references removing existing functions by name (they exist in the file) and Step 4 reuses the existing `rerender` shape — concrete, not placeholder.

**Type/name consistency:** `diveBlockLabel` defined (Task 1) + imported in tests (Task 1) + used in render (Task 1). `renderSelected`/`disposeSelected`/`selectedCharts`/`editingOpen`/`fullAnalysisOpen`/`selectedHost` defined in Task 2 and used by `deleteDive`/`openEditForm`/`wireSelectedActions` in Task 3. `seededSetup` shape matches the old `showDetail`. `ndlLocked` echoed (Task 1) is read by `diveBlockLabel` (Task 1) and shown via the panel. `fmtDur`/`fmtClock`/`esc`/`presatStrip`/`buildModeToggles`/`surfacingGF`/`buildRuntimeRows`/`renderRuntimeTable`/`DiveProfileChart`/`MValueChart`/`GFChart`/`rerenderDeferred`/`calcTimer` are pre-existing and referenced as-is.
