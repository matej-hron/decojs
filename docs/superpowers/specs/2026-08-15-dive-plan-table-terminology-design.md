# Dive Plan Table Terminology & Layout (Bottom/Ascent split)

**Date:** 2026-08-15
**Status:** Approved design, ready for implementation planning
**Trigger:** School advisor (garant/JKH) reviewed the sandbox "Dive Plan" table and found the
column names "Zastávka" (Stop) and "Runtime" misleading, and proposed splitting the table into
"Na dně" (Bottom) / "Výstup" (Ascent) sections, mirroring Divesoft's mobile dive-plan UI.

## Background & Motivation

`renderDivePlanTableHTML()` (`js/diveSetup.js:1445-1621`) generates the "Dive Plan" table shown
in the sandbox editor (`DiveSetupEditor`) and on `pressure.html`. Empirical tracing (raw waypoint
times vs. displayed values) confirmed:

- The **"Stop"** column's displayed duration already includes the transit time to the *next*
  level (the inter-stop ascent is folded into the preceding stop row — deliberate, see
  `js/diveSetup.js:1525-1550`).
- The **"Runtime"** column value is the diver's *arrival time at the next depth*, not a
  departure time from the current one.

So "Zastávka"/"Stop" and "Runtime" as bare labels invite a diver to misread the table (e.g.
assume they're still at 12 m at the row's runtime, when they've already left for 9 m). The
garant's proposal — confirmed correct against the code — is to rename rather than restructure:
keep the current merge/fold behavior (validated separately with the user, who prefers it), and
fix the labels + add one explanatory footnote.

The garant also proposed splitting the table into two sections, matching Divesoft's dive-computer
UI convention: **Na dně** (Bottom: descent + bottom time) and **Výstup** (Ascent: everything
after leaving the bottom — stops, gas switches, ascents), plus a terminal, purely informational
**Hladina** (Surface) row.

Separately, the garant/user noted the table's current sandbox position (left editor panel, far
from any chart) is poor; Divesoft-style tools place the runtime table right next to the profile
graph. The user asked to move it above the first (Dive Profile) chart in the sandbox.

## Goals

- Rename `colStop` → "Doba trvání" (Duration) and add a footnote to `colRuntime` ("Runtime")
  reading "čas konce etapy" (end time of the stage), in all three shipped languages (cs/en/es)
  for parity.
- Rename `colDepth` → "Do / v hloubce" in Czech (covers both "descending to" and "at" a depth).
- Split the table body into two visually-headed groups: **Na dně** (descent + bottom rows) and
  **Výstup** (everything after).
- Add a terminal, purely cosmetic **Hladina** (Surface) row after the last real row (blank
  duration/runtime/gas/tank cells) — reusing the existing `phaseSurface` label.
- Move the sandbox's Dive-1-Plan table rendering from the left editor panel to a new container
  directly above the Dive Profile chart in the right charts panel.
- Preserve the existing merge/fold logic (`js/diveSetup.js:1525-1572`) exactly as-is — this is a
  labeling/presentation change, not a data-model change.

## Non-goals

- `js/components/RuntimeTable.js` (used by `sandbox/repetitive-dives.html`) is **out of scope**.
  It has no i18n infrastructure today (hardcoded English strings); building that from scratch is
  disproportionate to what is now a "rename columns" request. Left as a follow-up if the garant's
  feedback is later extended to repetitive dives.
- `pressure.html`'s table position is **not** moved (stays below its chart, in the "Written Dive
  Plan" section) — the layout-move request was specifically about the sandbox's Divesoft-style
  UX; `pressure.html` is a standalone educational page with a different reading flow (explanation
  first, table as a static example after).
- No change to the underlying merge/fold algorithm, waypoint computation, or gas-consumption math.
- Section headers ("Na dně"/"Výstup") get their **own** i18n keys, distinct from the per-row phase
  labels (`phaseBottom`="Dno", `phaseAscent`="Výstup" abbreviated per-row), to avoid "Výstup"
  appearing twice in a row (section heading immediately followed by a "↑ Výstup" row label).

## A. Column renames + footnote — `locales/{cs,en,es}.json`, `js/diveSetup.js`

New/changed `divePlan` keys (targeted string replacement, not JSON rewrite, per repo convention):

| Key | cs (current → new) | en (current → new) | es (current → new) |
|---|---|---|---|
| `colDepth` | "Hloubka" → "Do / v hloubce" | "Depth" (unchanged) | "Profundidad" (unchanged) |
| `colStop` | "Zastávka" → "Doba trvání" | "Stop" → "Duration" | "Parada" → "Duración" |
| `colRuntime` | "Runtime" (unchanged) | "Runtime" (unchanged) | "Runtime" (unchanged) |
| `runtimeFootnote` (new) | "čas konce etapy" | "end time of the stage" | "hora de fin de la etapa" |
| `sectionBottom` (new) | "Na dně" | "Bottom" | "Fondo" |
| `sectionAscent` (new) | "Výstup" | "Ascent" | "Ascenso" |

`colPhase`, `colGas`, `colTank`, and all `phase*` keys (including `phaseSurface`, reused for the
new terminal row) are unchanged.

In `renderDivePlanTableHTML`, add a footnote marker to the `colRuntime` header (`Runtime *`) and
render the footnote text as a `<caption>`-like line below the table (a `<tfoot>` row spanning all
columns, or a sibling `<p class="dse-plan-footnote">` immediately after the `</table>` — decide at
implementation time based on which composes more cleanly with existing `.dse-plan-table` CSS).

## B. Bottom / Ascent section split — `js/diveSetup.js:renderDivePlanTableHTML`

Every segment already carries an internal `cls` (`des`, `bottom`, `asc`, `switch`, `stop`) set
during the build loop (`js/diveSetup.js:1471-1521`), before the merge/fold passes. After the
merge/fold passes finish (so the group boundary reflects final, folded rows) and while building
`rows`, insert a section-header `<tr>` immediately before:

- the **first** row overall → `<tr class="dse-plan-section"><th colspan="6">${sectionBottom}</th></tr>`
  (covers `des`/`bottom` rows — "Na dně").
- the **first** row whose `cls` is not `des`/`bottom` (i.e., the first row after leaving the
  bottom — `asc`/`switch`/`stop`) → `<tr class="dse-plan-section"><th colspan="6">${sectionAscent}</th></tr>`
  ("Výstup").

Edge case: a dive with no bottom rows at all (shouldn't happen in practice — every profile starts
with a descent) needs no special handling since the Bottom-section boundary check is simply "is
this the first row", which always fires.

## C. Terminal Hladina (Surface) row — `js/diveSetup.js:renderDivePlanTableHTML`

After the row-building loop, append one more `<tr>`:

- `phase` = `phaseSurface` label ("Hladina"/"Surface"/"Superficie") with no icon (or reuse `▲`
  icon already defined for the surface segment at line 1507 — decide at implementation time).
- `depth` = `0\u00a0m` (matches existing `\u00a0` convention for depth cells).
- `duration`, `runtime`, `gas`, `tank` = all `—` (em dash, matching the existing "no value"
  convention used elsewhere in the table, e.g. line 1603).

This is purely additive: it does **not** restore the dropped standalone Surface *segment*
(`js/diveSetup.js:1565-1572` stays untouched) — it's a cosmetic final marker row appended after
all real segments are rendered, independent of the segments array.

## D. Move Dive-1-Plan table above the first chart — sandbox only

**Editor option (backward-compatible):** add `showDivePlanPreview: true` (default) to
`DiveSetupEditor`'s options (`js/components/DiveSetupEditor.js` DEFAULTS block, alongside
`showWaypoints`). When `false`, `_buildWaypointsSection` still builds the raw editable waypoints
table but skips creating/updating the `.dse-dive-plan` preview `<div>` inside the editor
(`_updateDivePlan` becomes a no-op for that dive's plan div, or the div is simply never appended).

Existing consumers (`DiveEditPanel.js`, `sandbox/editor-test.html`) don't set this option, so they
keep today's behavior unchanged (default `true`).

**Sandbox wiring — `sandbox/index.html`:**
- Set `showDivePlanPreview: false` in the `DiveSetupEditor` options passed by `sandbox/index.html`.
- Add `<div id="dive-plan-table-container" class="dse-plan-table-wrapper"></div>` right above
  `<div class="chart-wrapper" id="dive-profile-container">` (after the "Export Config" panel,
  before the chart canvas — i.e., directly above the Dive Profile chart itself, not above its
  mode-toggle buttons or advanced options).
- Add `renderDivePlanTableHTML` and `getDiveSetupWaypoints` to the existing
  `import { computeGasConsumption } from '../js/diveSetup.js'` line.
- In the existing `editor.addEventListener('change', ...)` handler (`sandbox/index.html:~1258`),
  render the table on every change:
  ```js
  const planContainer = document.getElementById('dive-plan-table-container');
  planContainer.innerHTML = renderDivePlanTableHTML(
      getDiveSetupWaypoints(diveSetup), diveSetup.gases,
      { sacRate, decoSacRate, reserve } // same values DiveSetupEditor itself would use
  );
  ```
  This exactly mirrors the pattern `pressure.html` already uses independently — no new API
  surface on `DiveSetupEditor` beyond the one boolean option.
- Fire an initial render once after the editor's first setup (mirroring how the charts get their
  initial render), so the table isn't blank until the first user edit.

## E. Testing

`renderDivePlanTableHTML` has no existing test coverage in `tests/run-tests.mjs` — this is a good
opportunity to add a minimal suite alongside the change (matches "bug fixes get regression tests"
convention, and this is new-ish surface even though it's a rename):

- New column header text renders exactly (`colStop`/`colDepth`/`colRuntime` + footnote marker,
  per language via `translate()`).
- Section header rows appear exactly twice per rendered table (Bottom once, Ascent once) for a
  typical multi-stop deco profile, and the Bottom section's rows are a prefix of `des`/`bottom`
  classes.
- Terminal Hladina row is always present, always last, and its depth/duration/runtime/gas/tank
  cells match the expected blank/dash convention.
- `DiveSetupEditor` with `showDivePlanPreview: false` does not create a `.dse-dive-plan` div (or
  it stays empty) — the option actually suppresses internal rendering.
- Existing behavior (merge/fold, tank/reserve, gas switching) is unaffected — reuse the profile
  already used for prior empirical verification (45 m / 25 min, GF 30/70) as a fixture and assert
  row count / values are unchanged except for the added section headers and terminal row.

Browser smoke (manual, since there's no Playwright harness wired to this repo currently): open
`sandbox/index.html`, confirm the table now renders above the Dive Profile chart and updates live
on waypoint edits; open `pressure.html`, confirm its table (below its chart, unmoved) shows the
renamed columns/footnote/sections.

## F. Integration / Versioning

- Touched files: `js/diveSetup.js`, `js/components/DiveSetupEditor.js`, `sandbox/index.html`,
  `locales/cs.json`, `locales/en.json`, `locales/es.json`, `css/styles.css` (new
  `.dse-plan-section`, `.dse-plan-footnote`, `.dse-plan-table-wrapper` rules), `tests/run-tests.mjs`.
- Bump `CACHE_NAME` in `sw.js` and `.version-number::after` in `css/styles.css` (shipped
  HTML/JS/JSON changes).
- Update `wiki/Module-Reference.md` if `renderDivePlanTableHTML`'s signature or output shape is
  documented there (check during implementation).

## Open Questions / To Settle During Planning

- Whether the footnote renders as a `<tfoot>` row (stays inside `<table>`, better for print/copy)
  or a sibling `<p>` after the table (simpler CSS) — pick based on how the existing
  `.dse-plan-table` styling composes.
- Exact icon (if any) for the terminal Hladina row — reuse the `▲` used for the dropped Surface
  segment, or none (since the row is purely a marker, not a phase transition).
