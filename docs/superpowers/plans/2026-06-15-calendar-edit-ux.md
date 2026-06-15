# Calendar Edit UX (selection fix, names, active-dive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "panel doesn't follow selection after an edit" bug, add per-dive editable names, and make the active (selected) dive explicit — keeping edits live but smooth.

**Architecture:** Event delegation on the persistent calendar container fixes the swallowed-selection bug at its source. Trip dives gain a `name` (echoed by planTrip). The add-dialog and edit-panel get Name fields; the calendar highlights the selected block and labels it with name + runtime; the page tracks `selectedDiveId` and debounces the heavy overview re-render.

**Tech Stack:** Pure ES modules, no build step. Unit tests in `tests/run-tests.mjs`; UI via Playwright browser smoke.

**Spec:** `docs/superpowers/specs/2026-06-15-calendar-edit-ux-design.md`
**Branch:** `feat/calendar-trip-planner-core` (continue on same branch).

---

## File Structure
- **Modify** `js/tripPlanner.js` — echo `name` onto result dives.
- **Modify** `js/components/TripCalendar.js` — delegated click handling; selected highlight; block label (name + runtime); `data-dive-id`.
- **Modify** `js/components/AddDiveDialog.js` — Name input.
- **Modify** `js/components/DiveEditPanel.js` — Name input + "Editing: {name}" header; emit `name`.
- **Modify** `sandbox/repetitive-dives.html` — `selectedDiveId`, names, debounced overview, CSS (min-height, highlight).
- **Modify** `sw.js`, `css/styles.css` — version bump.
- **Modify** `tests/run-tests.mjs` — tripState/tripPlanner name tests.

`tripState.js` needs no code change — `addDive` already spreads `fields` (so a `name` passes through) and `editDive` patches arbitrary fields. We only add tests for it.

---

## Task 1: Names in the data layer

**Files:**
- Modify: `js/tripPlanner.js` (the `results.push({...})` in the dive loop)
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write failing tests**

`addDive`, `editDive`, `planTrip` are already imported in `tests/run-tests.mjs`. Add:

```js
describe('tripState/tripPlanner - dive names', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];

    test('addDive stores a provided name', () => {
        const t = addDive({ gases: air, gfLow: 100, gfHigh: 100, dives: [] },
            { name: 'Reef', startDateTime: 0, maxDepth: 18, bottomTime: 40, gases: air });
        expect(t.dives[0].name).toBe('Reef');
    });

    test('editDive patches the name', () => {
        let t = addDive({ gases: air, gfLow: 100, gfHigh: 100, dives: [] },
            { name: 'Reef', startDateTime: 0, maxDepth: 18, bottomTime: 40, gases: air });
        t = editDive(t, t.dives[0].id, { name: 'Wreck' });
        expect(t.dives[0].name).toBe('Wreck');
    });

    test('planTrip echoes the dive name onto result dives', () => {
        const trip = { gases: air, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', name: 'Wreck', startDateTime: 0, maxDepth: 40, bottomTime: 30, gases: air }] };
        expect(planTrip(trip).dives[0].name).toBe('Wreck');
    });
});
```

- [ ] **Step 2: Run — the planTrip echo test fails**

Run: `npm test 2>&1 | grep -A2 "echoes the dive name"`
Expected: FAIL — result dives don't carry `name` yet. (The two tripState tests already pass — `addDive`/`editDive` are generic.)

- [ ] **Step 3: Implement the echo**

In `js/tripPlanner.js`, find the `results.push({ ... })` call inside the `ordered.forEach` loop. Add a `name` field echoing the input dive (place it next to the existing `maxDepth`/`bottomTime` echoes):

```js
            name: dive.name,
```

(So the pushed object includes `id, startDateTime, endDateTime, surfaceIntervalBefore, startingTissue, endTissue, profile, maxDepth, bottomTime, name`.)

- [ ] **Step 4: Run — green**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!` (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add js/tripPlanner.js tests/run-tests.mjs
git commit -m "feat(trip): dive names flow through tripState and are echoed by planTrip"
```

---

## Task 2: TripCalendar — delegation, highlight, label (the core fix)

**Files:**
- Modify: `js/components/TripCalendar.js`
- Modify: `sandbox/repetitive-dives.html` (CSS)

- [ ] **Step 1: Add a delegated click handler in the constructor**

In `js/components/TripCalendar.js`, change the constructor to attach ONE click listener on the persistent container, and add an `_onClick` method. Replace the constructor with:

```js
    constructor(container, config = {}) {
        super();
        this.container = container;
        this.window = config.window || DEFAULT_WINDOW;
        this.startDate = config.startDate || '2026-06-15';
        this.selectedDiveId = null;
        this.container.classList.add('trip-calendar');
        // Delegated click handling on the PERSISTENT container so handlers survive
        // the innerHTML rebuild on every render (fixes selection being swallowed when
        // an edit-commit rerenders the calendar mid-click).
        this.container.addEventListener('click', (e) => this._onClick(e));
    }

    _onClick(e) {
        const block = e.target.closest('.tc-block');
        if (block && this.container.contains(block)) {
            this.dispatchEvent(new CustomEvent('selectDive', { detail: { diveId: block.dataset.diveId } }));
            return;
        }
        const col = e.target.closest('.tc-day');
        if (col && this.container.contains(col) && !e.target.closest('.tc-day-header')) {
            const { dayStartMin, dayEndMin } = this.window;
            const span = dayEndMin - dayStartMin;
            const dayIndex = Number(col.dataset.dayIndex);
            const rect = col.getBoundingClientRect();
            const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            const minutesOfDay = Math.round((dayStartMin + frac * span) / SNAP_MIN) * SNAP_MIN;
            this.dispatchEvent(new CustomEvent('createAt', { detail: { dayIndex, minutesOfDay } }));
        }
    }
```

- [ ] **Step 2: Update `render` — remove per-element listeners, add data-dive-id / highlight / label**

Change the `render` signature to accept `selectedDiveId`, REMOVE the per-column `col.addEventListener('click', ...)` block (the lines that dispatch `createAt`) and the per-block `block.addEventListener('click', ...)` block (the lines that dispatch `selectDive`) — they're now handled by delegation. Update the block construction. The new `render`:

```js
    render(planResult, selectedDiveId = null) {
        this.selectedDiveId = selectedDiveId;
        const layout = computeCalendarLayout(planResult, this.window);
        const { dayStartMin, dayEndMin } = this.window;
        const span = dayEndMin - dayStartMin;
        const byId = new Map((planResult.dives || []).map(d => [d.id, d]));
        this.container.innerHTML = '';

        // Left hour ruler
        const ruler = document.createElement('div');
        ruler.className = 'tc-ruler';
        const startHour = Math.floor(dayStartMin / 60);
        const endHour = Math.ceil(dayEndMin / 60);
        for (let H = startHour; H <= endHour; H++) {
            const label = document.createElement('div');
            label.className = 'tc-hour-label';
            label.style.top = ((H * 60 - dayStartMin) / span * 100) + '%';
            label.textContent = String(H).padStart(2, '0') + ':00';
            ruler.appendChild(label);
        }
        this.container.appendChild(ruler);

        const colEls = [];
        for (let c = 0; c < layout.dayCount; c++) {
            const col = document.createElement('div');
            col.className = 'tc-day';
            col.dataset.dayIndex = String(c);

            const header = document.createElement('div');
            header.className = 'tc-day-header';
            header.textContent = formatDayHeader(this.startDate, c);
            col.appendChild(header);

            for (let H = startHour; H <= endHour; H++) {
                const line = document.createElement('div');
                line.className = 'tc-hour-line';
                line.style.top = ((H * 60 - dayStartMin) / span * 100) + '%';
                col.appendChild(line);
            }

            this.container.appendChild(col);
            colEls.push(col);
        }

        layout.blocks.forEach(b => {
            if (b.dayIndex < 0 || b.dayIndex >= colEls.length) return;
            const d = byId.get(b.diveId);
            const block = document.createElement('div');
            block.className = 'tc-block'
                + (b.conflict ? ' tc-conflict' : '')
                + (b.diveId === selectedDiveId ? ' tc-selected' : '');
            block.dataset.diveId = b.diveId;
            block.style.top = b.topPct + '%';
            block.style.height = Math.max(b.heightPct, 2) + '%';
            const name = (d && d.name) ? d.name : b.diveId.toUpperCase();
            const depth = d ? d.maxDepth : '?';
            const runtime = d ? Math.round(d.endDateTime - d.startDateTime) : '?';
            block.textContent = `${name} · ${depth}m · ${runtime}min`;
            block.title = b.conflict ? 'Overlaps previous dive\'s deco' : '';
            colEls[b.dayIndex].appendChild(block);
        });

        this._layout = layout;
    }
```

- [ ] **Step 3: Add CSS (min-height + selected highlight)**

In `sandbox/repetitive-dives.html` `<style>`, update the `.tc-block` rule to add a min-height, and add a selected rule. Find `.tc-block { ... }` and add `min-height: 2.4em;` to it; then add:
```css
    .tc-block.tc-selected { outline:2px solid #f1c40f; outline-offset:0; z-index:2; }
```

- [ ] **Step 4: Parse + suite**

Run: `node --check js/components/TripCalendar.js && npm test 2>&1 | tail -3`
Expected: parses; suite green (no node tests for this file; full behaviour validated in Task 5 smoke).

- [ ] **Step 5: Commit**

```bash
git add js/components/TripCalendar.js sandbox/repetitive-dives.html
git commit -m "fix(trip): delegated calendar clicks (selection survives rerender); name+runtime label; selected highlight"
```

---

## Task 3: AddDiveDialog — Name field

**Files:**
- Modify: `js/components/AddDiveDialog.js`

- [ ] **Step 1: Add the Name input + include name in the emitted detail**

In `open(opts)`, add a Name input at the top of the dialog form (after the `<h3>`), defaulting to `opts.defaultName`:
```html
              <label>Name <input class="ad-name" type="text" value="${opts.defaultName || ''}"></label>
```
In the `.ad-add` click handler, read it and include it in the `add` detail:
```js
            const name = (el('.ad-name').value || opts.defaultName || '').trim();
            const detail = { name, startDateTime: opts.startDateTime, maxDepth, bottomTime, gases: opts.gases };
            this.close();
            this.dispatchEvent(new CustomEvent('add', { detail }));
```
(Keep the existing `maxDepth`/`bottomTime` reads; just add `name` and put it in `detail`.)

- [ ] **Step 2: Parse + suite + commit**

Run: `node --check js/components/AddDiveDialog.js && npm test 2>&1 | tail -3`
Expected: parses; green.
```bash
git add js/components/AddDiveDialog.js
git commit -m "feat(trip): AddDiveDialog Name field"
```

---

## Task 4: DiveEditPanel — Name field + active-dive header

**Files:**
- Modify: `js/components/DiveEditPanel.js`

- [ ] **Step 1: Add header + name input; emit name in the patch**

In `open(dive, startDate)`, change the `this.container.innerHTML` template to add a header showing the dive name and a Name input. Replace the `.dep-row` block's template with:
```js
        this.container.innerHTML = `
            <div class="dep-header">Editing: ${(dive.name || dive.id)}</div>
            <div class="dep-row">
                <label>Name <input type="text" class="dep-name" value="${dive.name || ''}"></label>
                <label>Start <input type="datetime-local" class="dep-start" value="${epochMinToLocalInput(dive.startDateTime, base)}"></label>
                <button class="dep-remove">Remove dive</button>
            </div>
            <div class="dep-editor"></div>`;
```
In `emitApply`, read the name and add it to the patch:
```js
            const name = (this.container.querySelector('.dep-name').value || this.dive.name || '').trim();
            const startDateTime = localInputToEpochMin(this.container.querySelector('.dep-start').value, base);
            this.dispatchEvent(new CustomEvent('apply', {
                detail: { id: this.dive.id, patch: { startDateTime, maxDepth, bottomTime, gases: setup.gases, name } }
            }));
```
Wire the name input to emitApply (next to the `.dep-start` change listener):
```js
        this.container.querySelector('.dep-name').addEventListener('change', emitApply);
```

- [ ] **Step 2: CSS for the header**

In `sandbox/repetitive-dives.html` `<style>`, add:
```css
    .dep-header { font-weight:600; margin-bottom:.35rem; }
```

- [ ] **Step 3: Parse + suite + commit**

Run: `node --check js/components/DiveEditPanel.js && npm test 2>&1 | tail -3`
Expected: parses; green.
```bash
git add js/components/DiveEditPanel.js sandbox/repetitive-dives.html
git commit -m "feat(trip): DiveEditPanel Name field + active-dive header"
```

---

## Task 5: Page wiring + the regression smoke test

**Files:**
- Modify: `sandbox/repetitive-dives.html`
- Modify: `sw.js`, `css/styles.css`

- [ ] **Step 1: Read the page**, then apply these changes to the module script.

- [ ] **Step 2: Names + selectedDiveId + debounce**

- Seed the initial dives with names: add `name: 'Dive 1'`, `'Dive 2'`, `'Dive 3'` to the three `trip.dives` entries.
- Add module-scope state: `let selectedDiveId = null;` and `let overviewTimer = null;`.
- Change `rerender()` so the calendar updates immediately with the selected id, and the OVERVIEW is debounced:
```js
    function rerender() {
      lastResult = planTrip(trip);
      const neededDays = Math.max(trip.dayCount || 1, 1,
        ...trip.dives.map(d => Math.floor(d.startDateTime / (24 * 60)) + 1));
      calendar.configure({ startDate: trip.startDate, dayCount: neededDays });
      calendar.render(lastResult, selectedDiveId);
      clearTimeout(overviewTimer);
      overviewTimer = setTimeout(() => renderOverview(lastResult), 250);
    }
```
- Update the `selectDive` handler to track selection and open the panel:
```js
    calendar.addEventListener('selectDive', (e) => {
      selectedDiveId = e.detail.diveId;
      const dive = trip.dives.find(d => d.id === selectedDiveId);
      if (dive) editPanel.open(dive, trip.startDate);
      calendar.render(lastResult, selectedDiveId); // immediate highlight, no full rerender needed
    });
```
- Update `createAt` to pass a default name into the dialog:
```js
      addDialog.open({
        startDateTime,
        gases: trip.gases,
        defaultDepth: 18,
        defaultTime: 40,
        defaultName: `Dive ${trip.dives.length + 1}`,
        computeNdl: (s, d, g) => previewNdl(trip, { startDateTime: s, maxDepth: d, gases: g }, trip.gfLow)
      });
```
- The `add` handler already does `trip = addDive(trip, e.detail); rerender();` — `e.detail` now carries `name`, so no change needed beyond confirming it passes through.
- The `apply`/`remove` handlers stay (`patch` now carries `name`).

- [ ] **Step 3: Names in overview + detail labels**

In `renderOverview(result)`, where each card's title uses the dive id, use the name. Find the card title (currently uses `d.id.toUpperCase()`) and change to `(d.name || d.id)`. Likewise in `showDetail(diveId)`, the detail header should use `(d.name || d.id)` (look up `d` in `lastResult.dives`). Keep `fmtClock`/deco/etc. unchanged.

- [ ] **Step 4: Browser smoke test (REQUIRED — regression-first)**

Playwright (script in repo root, then delete). Start `python3 -m http.server 5500`. On `http://localhost:5500/sandbox/repetitive-dives.html` assert:
1. ZERO console/page errors.
2. **THE REGRESSION:** click dive 1's block → edit panel shows "Editing: Dive 1". Change the depth field (e.g. to 18) and dispatch change. THEN click dive 2's block → the edit panel now shows **"Editing: Dive 2"** with depth 40 and start 11:00 (NOT Dive 1 / depth 18). This is the bug that must be fixed.
3. Calendar blocks show **name · depth · runtime** (e.g. "Dive 1 · 40m · NNmin"); the selected block has the `tc-selected` outline.
4. Rename: in the edit panel, set Name to "Wreck", dispatch change → the block label and the overview card title become "Wreck".
5. Add: click an empty slot → the dialog has a Name field defaulting to "Dive 4"; Add → a block + card with that name appear.
6. Min height: blocks are at least ~2.4em tall (short dives still legible).
Capture a screenshot. Stop the server. Fix any failure before committing.

- [ ] **Step 5: Version bump + commit**

- Bump `sw.js` `CACHE_NAME` `deco-theory-0.6.9` → `deco-theory-0.6.10`; `css/styles.css` `.version-number::after` → `"0.6.10"`.
- Run `npm test 2>&1 | tail -3` (green).
```bash
git add sandbox/repetitive-dives.html sw.js css/styles.css
git commit -m "feat(trip): selection follows edits; dive names in calendar/overview/detail; debounced overview"
```

---

## Task 6: Wiki

**Files:**
- Modify: `wiki/Module-Reference.md`

- [ ] **Step 1: Document + commit**

Note in `Module-Reference.md`: trip dives carry an optional `name` (echoed by `planTrip`); `TripCalendar` uses delegated container click handling and `render(planResult, selectedDiveId)` (selected block highlighted; label = name · depth · runtime); `DiveEditPanel`/`AddDiveDialog` have Name fields. Verify any file:line citations.
```bash
git add wiki/
git commit -m "docs(wiki): dive names, delegated calendar clicks, render(selectedDiveId)"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** selection fix (delegation) → Task 2; names data → Task 1, UI → Tasks 3-5; active-dive highlight+header → Tasks 2,4,5; block label+min-height → Task 2; debounce → Task 5; tests/regression → Tasks 1,5; wiki → Task 6. No gaps.
- **Placeholder scan:** none — pure/data tasks have full code; UI tasks have concrete snippets + explicit smoke acceptance (the regression is step 2 of Task 5's smoke).
- **Type/name consistency:** `name` field consistent across tripState (pass-through), tripPlanner (echo), AddDiveDialog `add` detail, DiveEditPanel `apply` patch, and the page; `render(planResult, selectedDiveId)` signature consistent between Task 2 and the page's calls in Task 5; `data-dive-id` set in Task 2 and read by the delegated handler in Task 2.
- **Risk:** the delegation change (Task 2) is the crux; it's validated by Task 5's regression smoke (edit-then-switch). The debounce means smoke must wait ~300ms before asserting overview state.
