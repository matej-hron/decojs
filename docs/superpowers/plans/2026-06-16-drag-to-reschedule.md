# Drag-to-Reschedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag a dive block on the calendar to reschedule it (within/across days, 15-min snap); on drop the trip re-chains and persists.

**Architecture:** `TripCalendar` gains Pointer-Events drag handling that emits a `reschedule` event; a pure `snapClamp` helper is unit-tested. The page handles `reschedule` via the existing `rescheduleDive` reducer + `rerender`. A movement threshold distinguishes click (select) from drag (reschedule).

**Tech Stack:** Pure ES modules, no build. Pointer Events. Unit tests in `tests/run-tests.mjs`; drag verified by Playwright stepped mouse moves.

**Spec:** `docs/superpowers/specs/2026-06-16-drag-to-reschedule-design.md`
**Branch:** `feat/calendar-trip-planner-core`.

---

## File Structure
- **Modify** `js/components/TripCalendar.js` — `snapClamp` (exported, pure) + pointer-drag handlers + `reschedule` event + click-suppression.
- **Modify** `sandbox/repetitive-dives.html` — handle `reschedule` (→ `rescheduleDive` + `rerender`); `.tc-dragging` CSS.
- **Modify** `sw.js`, `css/styles.css` — version bump.
- **Modify** `tests/run-tests.mjs` — `snapClamp` unit tests.

---

## Task 1: TripCalendar drag + `snapClamp`

**Files:**
- Modify: `js/components/TripCalendar.js`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

`TripCalendar.js` has no top-level DOM access (only an import of `computeCalendarLayout` + the class), so it imports cleanly in Node. Add `import { snapClamp } from '../js/components/TripCalendar.js';` near the other imports in `tests/run-tests.mjs`. Then add:

```js
describe('TripCalendar - snapClamp', () => {
    const ds = 6 * 60, de = 20 * 60;
    test('snaps to the nearest 15 minutes', () => {
        expect(snapClamp(9 * 60 + 8, ds, de, 15)).toBe(9 * 60 + 15); // 09:08 -> 09:15
        expect(snapClamp(9 * 60 + 7, ds, de, 15)).toBe(9 * 60);      // 09:07 -> 09:00
    });
    test('clamps to the day window', () => {
        expect(snapClamp(5 * 60, ds, de, 15)).toBe(ds);   // before window -> dayStart
        expect(snapClamp(21 * 60, ds, de, 15)).toBe(de);  // after window  -> dayEnd
    });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test 2>&1 | grep -i "snapClamp\|Cannot find"`
Expected: FAIL — `snapClamp` is not exported yet.

- [ ] **Step 3: Add `snapClamp` + the drag constants**

In `js/components/TripCalendar.js`, near the top constants (by `SNAP_MIN`), add:

```js
const DRAG_THRESHOLD = 4;   // px of movement before a press becomes a drag
const SNAP_DRAG_MIN = 15;   // drag drops snap to 15 minutes

/** Snap a minutes-of-day value to `snap` and clamp it to the visible window. Pure. */
export function snapClamp(rawMin, dayStartMin, dayEndMin, snap) {
    const snapped = Math.round(rawMin / snap) * snap;
    return Math.max(dayStartMin, Math.min(dayEndMin, snapped));
}
```

- [ ] **Step 4: Wire drag in the constructor + suppress click after drag**

In the constructor, after the existing `this.container.addEventListener('click', ...)` line, add drag state + a pointerdown listener:
```js
        this._justDragged = false;
        this._drag = null;
        this.container.addEventListener('pointerdown', (e) => this._onPointerDown(e));
```
At the TOP of `_onClick(e)`, add the suppression guard (so a drag doesn't also select):
```js
    _onClick(e) {
        if (this._justDragged) { this._justDragged = false; return; }
        // ... existing body unchanged ...
```

- [ ] **Step 5: Add the pointer handlers**

Add these three methods to the class (e.g. after `_onClick`):

```js
    _onPointerDown(e) {
        if (e.button !== 0) return;
        const block = e.target.closest('.tc-block');
        if (!block || !this.container.contains(block)) return;
        this._justDragged = false;
        this._drag = {
            diveId: block.dataset.diveId, block,
            startX: e.clientX, startY: e.clientY,
            moved: false, targetDayIndex: null, targetMinutes: null
        };
        this._moveHandler = (ev) => this._onPointerMove(ev);
        this._upHandler = (ev) => this._onPointerUp(ev);
        document.addEventListener('pointermove', this._moveHandler);
        document.addEventListener('pointerup', this._upHandler);
    }

    _onPointerMove(e) {
        const d = this._drag;
        if (!d) return;
        if (!d.moved) {
            if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
            d.moved = true;
            d.block.classList.add('tc-dragging');
            d.block.style.pointerEvents = 'none'; // so elementFromPoint sees the column behind
        }
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const col = el ? el.closest('.tc-day') : null;
        if (!col || !this.container.contains(col)) return; // off a column — keep last valid target
        const { dayStartMin, dayEndMin } = this.window;
        const span = dayEndMin - dayStartMin;
        const rect = col.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const minutesOfDay = snapClamp(dayStartMin + frac * span, dayStartMin, dayEndMin, SNAP_DRAG_MIN);
        d.targetDayIndex = Number(col.dataset.dayIndex);
        d.targetMinutes = minutesOfDay;
        // Live feedback: move the block into the target column at the snapped position.
        if (d.block.parentElement !== col) col.appendChild(d.block);
        d.block.style.top = ((minutesOfDay - dayStartMin) / span * 100) + '%';
    }

    _onPointerUp() {
        const d = this._drag;
        document.removeEventListener('pointermove', this._moveHandler);
        document.removeEventListener('pointerup', this._upHandler);
        this._drag = null;
        if (!d) return;
        if (d.block) { d.block.classList.remove('tc-dragging'); d.block.style.pointerEvents = ''; }
        if (d.moved && d.targetDayIndex != null && d.targetMinutes != null) {
            this._justDragged = true; // swallow the trailing click
            const startDateTime = this.toStartDateTime(d.targetDayIndex, d.targetMinutes);
            this.dispatchEvent(new CustomEvent('reschedule', { detail: { diveId: d.diveId, startDateTime } }));
        }
    }
```

(`toStartDateTime` and `this.window` already exist. The dispatched `reschedule` is handled by the page in Task 2; until then a drag just fires an event nothing listens to — harmless.)

- [ ] **Step 6: Run to verify pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!` (existing suite + 2 new snapClamp tests). Also `node --check js/components/TripCalendar.js`.

- [ ] **Step 7: Commit**

```bash
git add js/components/TripCalendar.js tests/run-tests.mjs
git commit -m "feat(trip): TripCalendar pointer-drag to reschedule (snapClamp + reschedule event)"
```

---

## Task 2: Page wiring + drag CSS + smoke

**Files:**
- Modify: `sandbox/repetitive-dives.html`
- Modify: `sw.js`, `css/styles.css`

- [ ] **Step 1: Import `rescheduleDive` + handle `reschedule`**

In `sandbox/repetitive-dives.html`, add `rescheduleDive` to the existing tripState import:
```js
    import { addDive, editDive, removeDive, rescheduleDive } from '../js/tripState.js';
```
Near the other `calendar.addEventListener(...)` handlers, add:
```js
    calendar.addEventListener('reschedule', (e) => {
      trip = rescheduleDive(trip, e.detail.diveId, e.detail.startDateTime);
      selectedDiveId = e.detail.diveId;
      rerender();
    });
```

- [ ] **Step 2: Drag CSS**

In the page `<style>`, add a dragging style + a grab cursor on blocks:
```css
    .tc-block { cursor: grab; }
    .tc-block.tc-dragging { opacity:.85; z-index:3; cursor:grabbing; box-shadow:0 2px 8px rgba(0,0,0,.35); }
```

- [ ] **Step 3: Browser smoke test (REQUIRED)**

Playwright (script in repo root, then delete). Start `python3 -m http.server 5500`. On `http://localhost:5500/sandbox/repetitive-dives.html`. Use `page.mouse` with steps to drag (mouse.down fires pointerdown; move with `{steps}` fires pointermove; mouse.up fires pointerup). Helper:
```js
async function dragBlock(page, fromSel, toX, toY) {
  const b = await page.locator(fromSel).first().boundingBox();
  await page.mouse.move(b.x + b.width/2, b.y + 8);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
```
Assert:
1. ZERO console/page errors on load.
2. **Reschedule within a day:** record dive 1's block top (px). Drag it ~150px lower within the SAME `.tc-day` column. After drop, the block for that dive is at a LOWER top (later time) than before, AND the `?trip=` URL changed. Report before/after top.
3. **Cross-day:** drag a block into a DIFFERENT `.tc-day` column (use that column's x-centre). After drop, the dive's block is in the other column (its day changed).
4. **Click still selects:** click a block WITHOUT moving (`page.locator('.tc-block').first().click()`) → the edit panel (`#edit-panel .dse-quick-depth`) appears (selectDive still works; the drag didn't break clicks).
5. **Conflict on overlap:** drag a dive so it starts right where another dive already is (same column, near another block's top) → after re-plan, some `.tc-block.tc-conflict` exists (overlap flagged red).
Capture a screenshot mid/after a drag. Stop the server. If a drag doesn't move the dive, debug (confirm the `reschedule` handler is wired and `_justDragged` suppresses only the click, not the drag). Do NOT commit broken.

- [ ] **Step 4: Version bump + commit**

- Bump `sw.js` `CACHE_NAME` `deco-theory-0.6.18` → `deco-theory-0.6.19`; `css/styles.css` `.version-number::after` → `"0.6.19"`.
- `npm test 2>&1 | tail -3` (expect green).
```bash
git add sandbox/repetitive-dives.html sw.js css/styles.css
git commit -m "feat(trip): drag a calendar block to reschedule (15-min snap, cross-day, conflicts update)"
```

---

## Task 3: Wiki

**Files:**
- Modify: `wiki/Module-Reference.md`

- [ ] **Step 1: Document + commit**

In the `js/components/TripCalendar.js` entry, note: pointer-drag rescheduling — dragging a block past a ~4px threshold emits a `reschedule` event `{ diveId, startDateTime }` (drop snapped to 15 min via the exported pure `snapClamp`, clamped to the window, cross-day supported); a plain click still emits `selectDive` (the trailing click after a drag is suppressed). Note the page wires `reschedule` → `rescheduleDive` → `rerender`. Verify any file:line citations.
```bash
git add wiki/
git commit -m "docs(wiki): document TripCalendar drag-to-reschedule + snapClamp"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** drag mechanics + `reschedule` + snap + click-suppression → Task 1; page wiring + conflicts/persist + CSS → Task 2; wiki → Task 3. The clamp/cross-day/conflict edge cases are in Task 1 (`snapClamp`, last-valid-target, `_columnAt`) + Task 2 smoke. No gaps.
- **Placeholder scan:** none — Task 1 has full pointer-handler code + a pure tested helper; Task 2 has the handler + a concrete smoke harness.
- **Type/name consistency:** `snapClamp(rawMin, dayStartMin, dayEndMin, snap)` consistent between Task 1 definition, tests, and `_onPointerMove` usage; the `reschedule` event detail `{ diveId, startDateTime }` consistent between Task 1 dispatch and Task 2 handler; `rescheduleDive(trip, id, startDateTime)` matches the existing tripState signature.
- **Risk:** the drag gesture is DOM/pointer (not node-testable) → covered by Task 2's Playwright smoke (the four interaction checks). `snapClamp` (the only pure piece) is unit-tested. The `_justDragged` guard ensures a reposition doesn't also open the editor; the inline `pointer-events:none` on the dragged block makes `elementFromPoint` column hit-testing work regardless of page CSS.
