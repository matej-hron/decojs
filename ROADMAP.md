# Restructuring Roadmap

## Goal
Restructure the app into 3 clear parts:
1. **Sandbox** - Interactive dive planner with charts
2. **Theory** - Educational pages using chart components
3. **Tests** - Quiz pages (unchanged)

---

## Phase 1: Chart Components ✅ COMPLETE
- [x] Create `js/charts/chartTypes.js` - DiveSetup contract, validation, defaults
- [x] Create `js/charts/DiveProfileChart.js` - Time-based visualization
  - [x] Depth profile with labels (DESCENT, BOTTOM TIME, MAX, ASCENT, stops)
  - [x] Ambient pressure overlay
  - [x] Partial pressures (ppO₂, ppN₂)
  - [x] Ceiling line
  - [x] Tissue loading curves
  - [x] Gas switch markers
- [x] Create `js/charts/MValueChart.js` - Pressure-pressure diagram
  - [x] M-value lines per compartment
  - [x] GF Low/High lines
  - [x] Tissue trails
  - [x] Timeline playback with keyboard shortcuts
  - [x] Compartment selector
- [x] Create `sandbox/chart-test.html` - Test page with usage examples
- [x] Fix gas switch detection bug (waypoints without gasId inherit current gas)

---

## Phase 2: DiveSetupEditor Component ✅ COMPLETE
- [x] Extract editor from `dive-setup.html` (~1100 lines)
- [x] Create `js/components/DiveSetupEditor.js`
  - [x] Gas management (add/edit/remove gases)
  - [x] Waypoint editor (table with add/edit/remove)
  - [x] GF sliders
  - [x] Profile presets dropdown
  - [x] Import/Export JSON
- [x] Editor emits `change` events with updated DiveSetup
- [x] Create `sandbox/editor-test.html` to test the component

---

## Phase 3: Sandbox Page ✅ COMPLETE
- [x] Create `sandbox/index.html` - Main sandbox page
  - [x] DiveSetupEditor on left/top
  - [x] DiveProfileChart + MValueChart on right/bottom
  - [x] Real-time updates: editor changes → charts update
- [x] Add profile library (save/load named profiles)
- [x] LocalStorage persistence

---

## Phase 4: Theory Pages Refactor ✅ COMPLETE
- [x] Refactor `m-values.html` to use MValueChart component
  - Replaced 1160-line js/mvalues.js with ~100 lines inline script
  - Uses MValueChart component with built-in compartment selector & timeline
- [~] Refactor `pressure.html` - DEFERRED
  - Page has many specialized interactive calculators beyond chart components
  - Would require significant work with limited benefit
- [~] Refactor `tissue-loading.html` - DEFERRED
  - Has unique educational features (gas pathway SVG, half-time charts)
  - Current js/main.js + js/visualization.js work well for this page
- [x] Theory pages use locked/preset DiveSetup (not editable)
- [x] Removed duplicated chart code from m-values.html

---

## Phase 5: Navigation & Cleanup ✅ COMPLETE
- [x] Update `js/nav.js` with new structure:
  ```
  Sandbox
    └── Dive Planner
    └── Dive Setup
  Theory
    ├── Pressure & Depth
    ├── Tissue Loading
    └── M-Values
  Tests
    ├── Physics
    ├── Anatomy
    └── Accidents
  ```
- [x] Delete obsolete files:
  - [x] `visual-editor.html`
  - [x] `js/profileEditor.js`
- [x] Update README.md with new structure
- [x] Bump version in `sw.js` and `css/styles.css`

---

## Notes
- Branch: `restructure/sandbox-theory`
- All changes must pass `npm test` before merge
- Update cache version before any push (see `.github/copilot-instructions.md`)
