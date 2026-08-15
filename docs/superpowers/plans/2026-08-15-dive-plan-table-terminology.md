# Dive Plan Table Terminology & Layout — Implementation Plan

**Goal:** Rename misleading "Zastávka"/"Stop" and bare "Runtime" columns, split the table into
Bottom/Ascent sections (Divesoft-style), add a terminal Hladina row, and move the sandbox's
Dive-1-Plan table above the Dive Profile chart.

**Architecture:** `renderDivePlanTableHTML()` (`js/diveSetup.js`) gains a section-header pass and
a terminal row, plus renamed i18n keys and a footnote. `DiveSetupEditor` gains a
`showDivePlanPreview` option (default `true`) so `sandbox/index.html` can suppress the internal
plan div and render its own copy above the chart, reusing the existing `'change'` event.

**Tech Stack:** Pure ES modules, no build step. Custom test runner `node tests/run-tests.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-15-dive-plan-table-terminology-design.md`

---

## Task 1: i18n — column renames, footnote, section-header keys

**Files:** `locales/cs.json`, `locales/en.json`, `locales/es.json`

- [x] Add to each `divePlan` block (targeted string edits, keep 4-space indent):
  - `colDepth` (cs only: "Hloubka" → "Do / v hloubce")
  - `colStop` → "Doba trvání" / "Duration" / "Duración"
  - `runtimeFootnote` (new) → "čas konce etapy" / "end time of the stage" / "hora de fin de la etapa"
  - `sectionBottom` (new) → "Na dně" / "Bottom" / "Fondo"
  - `sectionAscent` (new) → "Výstup" / "Ascent" / "Ascenso"
- [x] Verify with `diff <(git diff --stat locales/) <(git diff -w --stat locales/)` — no
  formatting-only diff noise.

## Task 2: `renderDivePlanTableHTML` — footnote marker, section headers, terminal row

**Files:** `js/diveSetup.js`

- [x] Header: render `colRuntime` with a footnote marker (`Runtime *`); add a footnote line after
  `</table>` reading `* {runtimeFootnote}`.
- [x] After the existing merge/fold passes, insert section header rows into `rows` output: one
  before the first row (Bottom) and one before the first row whose `cls` isn't `des`/`bottom`
  (Ascent).
- [x] Append one terminal row after the loop: phase = `phaseSurface` label, depth `0\u00a0m`,
  duration/runtime/gas/tank = `—`.
- [x] Keep merge/fold logic (lines ~1525-1572) untouched.

## Task 3: Tests for the new table shape

**Files:** `tests/run-tests.mjs`

- [x] Renamed headers render (`colStop`, footnote marker) via `translate()`.
- [x] Exactly one Bottom and one Ascent section header row appear, Bottom's rows precede Ascent's.
- [x] Terminal Hladina row is always last with blank/dash cells.
- [x] Existing merge/fold behavior (row count, tank/reserve values) unchanged for the 45m/25min
  GF 30/70 fixture used in prior empirical verification.

## Task 4: `DiveSetupEditor` — `showDivePlanPreview` option

**Files:** `js/components/DiveSetupEditor.js`

- [x] Add `showDivePlanPreview: true` to `DEFAULT_EDITOR_OPTIONS`.
- [x] In `_updateDivePlan`, no-op (return early) when `this.options.showDivePlanPreview === false`.

## Task 5: Sandbox — move table above the Dive Profile chart

**Files:** `sandbox/index.html`

- [x] Add `showDivePlanPreview: false` to the `DiveSetupEditor` options.
- [x] Add `<div id="dive-plan-table-container" class="dse-plan-table-wrapper"></div>` above
  `#dive-profile-container`.
- [x] Import `renderDivePlanTableHTML`, `getDiveSetupWaypoints` from `../js/diveSetup.js`.
- [x] Render the table in the existing `'change'` listener + once on initial load.

## Task 6: CSS for section rows, footnote, wrapper

**Files:** `css/styles.css`

- [x] `.dse-plan-section` (bold, muted background spanning row).
- [x] `.dse-plan-footnote` (small, muted text below table).
- [x] `.dse-plan-table-wrapper` (sandbox positioning spacing).

## Task 7: Version bump + verification

- [x] Bump `CACHE_NAME` in `sw.js` and `.version-number::after` in `css/styles.css`.
- [x] `npm test` full suite green.
