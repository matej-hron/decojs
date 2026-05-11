# Gradient Factors Sandbox Page — Design Spec

**Date:** 2026-05-11
**Status:** Draft → awaiting user review
**Author:** Matej (with Claude)
**Companion sandboxes:** [`sandbox/haldane.html`](../../../sandbox/haldane.html), [`sandbox/schreiner.html`](../../../sandbox/schreiner.html), [`sandbox/m-values.html`](../../../sandbox/m-values.html)
**Wiki source of truth:** [`wiki/Model-05-Gradient-Factors.md`](../../../wiki/Model-05-Gradient-Factors.md), [`wiki/Model-04-M-Values.md`](../../../wiki/Model-04-M-Values.md)

---

## 1. Goal

Build a single-file interactive sandbox at `sandbox/gradient-factors.html` that **explains the three GF formulas from the wiki by visualizing them live**.

The three formulas being taught:

1. **Interpolation** (Model-05): `GF(P_amb) = GF_lo + (GF_hi − GF_lo) · (pAnchor − P_amb) / (pAnchor − 1.013)` — piecewise linear with flat shoulders at GF_lo (below pAnchor) and GF_hi (at/above surface).
2. **GF-adjusted M-value** (Model-04): `M_adj(P_amb, GF) = P_amb + GF · (M(P_amb) − P_amb)` where `M = a + P_amb/b`.
3. **Ceiling** (Model-04): `P_ceiling = b · (P_t − GF·a) / (b · (1 − GF) + GF)`.

Each formula gets a visual representation that updates live as the user scrubs sliders. The page complements (does not replace) the existing prose theory page `gradient-factors.html` and the wiki page `wiki/Model-05-Gradient-Factors.md`.

## 2. Scope

### In scope

- New file `sandbox/gradient-factors.html`, single self-contained HTML + ES module (no build step).
- **Two stacked chart panels** sharing a single state and a single "current depth" indicator:
  - **Panel 1 (GF corridor)** — graphs `GF(P_amb)` directly. Visualizes formula 1.
  - **Panel 2 (P-P diagram)** — graphs `P_t` vs `P_amb` with raw M-line and M_adj. Visualizes formulas 2 and 3.
- **Mode toggle**: Single GF (intro) | GF Lo + Hi (full ramp). Default: Lo + Hi.
- **Live formula readout** with KaTeX rendering of all three formulas plus current-value substitution next to each.
- Inline SVG charts (no charting library), bespoke for the teaching narrative — same pattern as `sandbox/m-values.html`.
- Compute reuses exported functions from `js/decoModel.js` — no formula reimplementation.
- i18n in en / cs / es using `data-i18n` attributes.
- Nav entry under Sandbox submenu.
- Service-worker static-asset entry.
- Cross-link from theory page `gradient-factors.html` ("Open in sandbox →").
- Cross-link from wiki `Model-05-Gradient-Factors.md` (Sandbox link in cross-references section).
- Smoke test (gitignored) under `.claude-scratch/gf_smoke.py` following the existing sandbox smoke-test pattern.

### Out of scope (explicitly)

- Multi-dive simulation, dive setup editor, gas switches — the existing `sandbox/index.html` already covers that operational view. This sandbox is conceptual.
- Showing all 16 compartments' M_adj lines and ceilings simultaneously. Only the selected compartment is rendered prominently; the other 15 raw M-lines are dimmed for context (no per-compartment ceilings).
- Tissue trails (saturation over time) — covered by `sandbox/tissue-saturation.html`.
- Algorithmic computation of pAnchor from a tissue state. The anchor depth is a *user-set* slider in this sandbox, not derived via `findFirstStopAtGFLow`. (Rationale: keeping the sandbox isolated from dive simulation. The wiki section on pAnchor derivation is text-linked, not interactively shown here.)
- Gas-switch wrinkle (Model-05 section "Gas-switch wrinkle").

## 3. Layout and visual design

### 3.1 Page structure (top to bottom)

```
┌─────────────────────────────────────────────────────┐
│ Nav bar (shared)                                    │
├─────────────────────────────────────────────────────┤
│ Title: "Gradient Factors"                           │
│ Subtitle: "Three formulas. One ramp. Scrub them."   │
├─────────────────────────────────────────────────────┤
│ Mode toggle: [Single GF] [GF Lo + Hi] ←default      │
├─────────────────────────────────────────────────────┤
│ Live formula readout (3 lines, KaTeX-rendered):     │
│  F1: GF(P_amb) = …  → at current depth: GF = 0.55   │
│  F2: M_adj = …      → M_adj = 3.21 bar              │
│  F3: P_ceiling = …  → ceiling = 2.18 bar (≈ 12 m)   │
├─────────────────────────────────────────────────────┤
│ Panel 1 — GF corridor (GF on y, P_amb on x)         │
│ Shaded band from (surface, GF_hi) to (pAnchor, GF_lo│
│ Red vertical "current depth" line                   │
├─────────────────────────────────────────────────────┤
│ Panel 2 — P-P diagram (P_t on y, P_amb on x)        │
│ Other 15 raw M-lines (faint background)             │
│ Selected raw M-line (orange)                        │
│ M_adj segment from (pAnchor, M_adj@GF_lo)           │
│           to (surface, M_adj@GF_hi)                 │
│ Tissue marker (blue dot)                            │
│ Ceiling marker (red dashed vertical)                │
│ Red vertical "current depth" line (same x as P1)    │
├─────────────────────────────────────────────────────┤
│ Controls row:                                       │
│  Compartment: ← TC6 →   Variant: A B [C]            │
│  Current depth slider (0–40 m)                      │
│  Tissue P_t slider                                  │
│  GF Hi slider                                       │
│  GF Lo slider (Mode 2 only)                         │
│  Anchor depth slider (Mode 2 only)                  │
├─────────────────────────────────────────────────────┤
│ Output cards: GF | M / M_adj / Δ | Ceiling          │
├─────────────────────────────────────────────────────┤
│ Term cards (collapsible):                           │
│  a, b, GF_lo, GF_hi, pAnchor, M_adj                 │
└─────────────────────────────────────────────────────┘
```

### 3.2 Mode behavior

**Mode 1 — Single GF:**
- Panel 1 collapses to a horizontal line at the chosen GF value (see Open Questions for the alternative of hiding panel 1 in Single mode).
- Panel 2 draws M_adj as a line parallel between ambient and raw M (single GF value).
- Sliders shown: compartment, variant, current depth, tissue P_t, GF.
- Hidden: GF Lo, anchor depth.

**Mode 2 — GF Lo + Hi (default):**
- Panel 1 draws the full ramp (corridor) from (pAnchor, GF_lo) to (surface, GF_hi), flat below pAnchor at GF_lo, flat above surface at GF_hi.
- Panel 2 draws M_adj as a slanted segment between `(pAnchor, M_adj@GF_lo)` and `(surface, M_adj@GF_hi)`. Above pAnchor toward higher P_amb, the M_adj line collapses onto the raw M-line (since GF = GF_lo and the segment ends at pAnchor); render as a faint extension or just stop at pAnchor.
- All sliders shown.

### 3.3 Cross-panel "current depth" alignment

The red "current depth" vertical line appears in both panels at the same x-position. This is the visual hinge: scrub the slider and the diver sees simultaneously *what GF is at this depth* (panel 1) and *what that GF does to M_adj and the ceiling* (panel 2).

### 3.4 Color and style

Reuse CSS variables from `css/styles.css`. Color mapping:
- Ambient line: `--text-muted` dashed
- Raw M-line: orange (selected compartment)
- Other 15 raw M-lines: light grey, opacity 0.5
- M_adj: lighter orange / amber
- pAnchor marker: teal (`#16a085`)
- Current depth marker: red (`#c0392b`)
- Tissue marker: blue (`#2980b9`)
- Ceiling marker: red dashed

## 4. State and computation

### 4.1 State object

Single plain object held in the page script:

```js
const state = {
  mode: 'lohi',           // 'single' | 'lohi'
  compartmentIdx: 5,      // 0–15
  variant: 'C',           // 'A' | 'B' | 'C'
  currentDepth: 18,       // meters
  tissuePt: 3.0,          // bar (N2 partial pressure)
  gf: 0.70,               // Mode 1 only
  gfLo: 0.30,             // Mode 2
  gfHi: 0.70,             // Mode 2
  anchorDepth: 18,        // meters (Mode 2)
};
```

### 4.2 Compute (reused from `js/decoModel.js`)

```js
import {
  COMPARTMENTS,
  getMValue,
  getAdjustedMValue,
  interpolateGF,
  getCompartmentCeiling,
  SURFACE_PRESSURE,
} from '../js/decoModel.js';
```

Derived values on each render:
- `P_amb = SURFACE_PRESSURE + currentDepth / 10`
- `pAnchor = SURFACE_PRESSURE + anchorDepth / 10`
- `M = getMValue(P_amb, comp.a, comp.b)`
- `gfHere = (mode === 'single') ? gf : interpolateGF(P_amb, pAnchor, gfLo, gfHi)`
- `M_adj = getAdjustedMValue(P_amb, comp.a, comp.b, gfHere)`
- `ceilingBar = getCompartmentCeiling(tissuePt, comp.a, comp.b, gfHere)`
- `ceilingM = Math.max(0, (ceilingBar - SURFACE_PRESSURE) * 10)`
- `violation = tissuePt > M_adj`

### 4.3 Render flow

```
input change → updateState() → render():
                                 ├─ renderFormulaReadout()
                                 ├─ renderGFCorridorPanel()
                                 ├─ renderPPDiagramPanel()
                                 ├─ renderControls()      // slider values, visibility per mode
                                 └─ renderCards()
```

Same pattern as `sandbox/m-values.html` — pure functions consuming `state`, no intermediate dirty flags.

## 5. i18n

New keys under `sandbox.gradientFactors.*`:

- `title`, `subtitle`
- `mode.single`, `mode.lohi`
- `formulas.f1`, `formulas.f2`, `formulas.f3` (the labels, not the equations — equations are KaTeX in HTML)
- `controls.compartment`, `controls.variant`, `controls.depth`, `controls.tissuePt`, `controls.gf`, `controls.gfLo`, `controls.gfHi`, `controls.anchor`
- `cards.gfHere.label`, `cards.mvalues.label`, `cards.ceiling.label`, `cards.violation.label`
- `terms.a.name`, `terms.a.value`, `terms.a.why` (and same for `b`, `gfLo`, `gfHi`, `pAnchor`, `mAdj`)
- `legend.ambient`, `legend.rawM`, `legend.mAdj`, `legend.pAnchor`, `legend.tissue`, `legend.ceiling`

Mirror keys in `en.json`, `cs.json`, `es.json`. Czech terminology follows the polished glossary established in `feedback_czech_diving_terms.md` and PR #33 (sycení, přesycení, okolní, řídicí — never řídící — strop/ceiling, etc.).

## 6. Integration

- `sw.js`: add `'./sandbox/gradient-factors.html'` to `STATIC_ASSETS`; bump cache `0.5.84 → 0.5.85`.
- `css/styles.css`: bump version-number content to match `0.5.85`.
- `js/nav.js`: add to Sandbox submenu, after `m-values.html`.
- `gradient-factors.html` (top-level theory page): add a CTA box "Try the sandbox →" near the GF Lo/Hi section, linking to `./sandbox/gradient-factors.html`.
- `wiki/Model-05-Gradient-Factors.md`: add a bullet to the "Cross-references" section pointing to `https://decotheory.eu/sandbox/gradient-factors.html`.

## 7. Testing

### 7.1 Unit tests

None. All compute functions are reused from `js/decoModel.js` and already covered by `tests/`.

### 7.2 Smoke test (gitignored)

`.claude-scratch/gf_smoke.py` — Playwright script following the same pattern as the m-values smoke test. Asserts:
- Page loads without console errors
- All sliders are present
- Scrubbing each slider updates the displayed GF / M_adj / ceiling values
- Mode toggle hides/shows GF Lo and Anchor sliders correctly
- Compartment prev/next changes the TC label and updates the chart
- Variant A/B/C toggle changes the raw M-line slope/intercept

### 7.3 Cross-check against wiki worked example

Use the Model-05 worked example (line 116–123): 40 m / 25 min / GF 30/85 / ZH-L16C / TC1. The example gives pAnchor = 2.81 bar (18 m) and `GF(6 m) ≈ 0.67`. Set the sandbox sliders to match (variant C, TC1, anchor depth 18 m, GF 30/85, current depth 6 m) and confirm the displayed GF reads ≈ 0.67. This validates the interpolation wiring.

## 8. Risks and open questions

- **Panel 1 in Single mode**: should it show a flat horizontal line, or be hidden? Decide during implementation based on which renders less cluttered.
- **M_adj segment extension past pAnchor**: in panel 2, the M_adj at depths deeper than pAnchor is the GF_lo case (since GF clamps to GF_lo). We can either (a) extend the M_adj line to the right of pAnchor as a continuation at the GF_lo slope, or (b) stop the line at pAnchor. Decide during implementation; (a) is mathematically more complete, (b) is visually cleaner.
- **Default values**: tentatively GF 30/70 with anchor at 18 m, current depth 18 m, TC6, variant C, tissue P_t at saturation for 30 m air (≈ 3.15 bar). Final defaults may shift after first interactive test.

## 9. Acceptance criteria

The sandbox ships when:
- All three formulas are visible on the page in math notation with live-updated value substitution.
- Both chart panels update in real time on every slider change.
- The red current-depth line in panel 1 and panel 2 stay vertically aligned at the same P_amb.
- Mode toggle switches between Single GF and Lo + Hi without visual glitches.
- Compartment prev/next + variant selector both work and update the raw M-line.
- Czech and Spanish translations render without missing keys.
- Wiki worked-example cross-check passes (GF at 6 m for the 18 m anchor matches ≈ 0.67).
- The smoke test passes locally.
- `npm test` continues to pass (no new tests, no regressions).
