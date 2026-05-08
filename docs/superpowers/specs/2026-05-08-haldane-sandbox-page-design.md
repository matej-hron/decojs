# Interactive Haldane Equation Sandbox — Design

**Date:** 2026-05-08
**Status:** Draft (post-brainstorm, awaiting user review)
**Implementation branch:** `feat/haldane-sandbox`

## Summary

A new sandbox page (`sandbox/haldane.html`) that teaches the **Haldane equation**

> P<sub>t</sub>(t) = P<sub>alv</sub> + (P<sub>t,0</sub> − P<sub>alv</sub>) · e<sup>−kt</sup>

by rendering the formula as a **live, annotated artefact**. Each variable is colour-coded; satellite "term cards" beneath the formula show what each variable means, how it is computed, and its current numeric value. The user picks an initial depth, a target depth, and a tissue compartment, then scrubs time forward in minutes to watch the equation evaluate. An M-value strip at the bottom optionally compares the resulting Pt against ZH-L16 a/b/c limits.

The page is a **pedagogical companion** to the existing theory pages (`pressure.html`, `tissue-loading.html`, `m-values.html`, `gradient-factors.html`) and a stepping stone for a parallel **Schreiner** sandbox to follow.

## Goals

- Make the four "moving parts" of the Haldane equation visible and inspectable: P<sub>alv</sub>, P<sub>t,0</sub>, k, and e<sup>−kt</sup>.
- Let the user vary inputs and time and see the substituted equation update line-by-line.
- Surface the M-value comparison so learners see how Haldane output feeds into Bühlmann limits.
- Reuse the verified math primitives in `js/decoModel.js` and `js/tissueCompartments.js` — no new equations, no duplicated logic.

## Non-goals (v1)

- No multi-compartment view (the existing `sandbox/tissue-saturation.html` already covers that).
- No descent/ascent simulation — Haldane assumes constant P<sub>alv</sub>. Schreiner v2 (separate page, future spec) will own that.
- No nitrox / trimix gas selector. Air only (F<sub>N₂</sub> ≈ 0.7902, the existing `N2_FRACTION` constant). Adding a gas picker is a YAGNI deferral, easy to bolt on later by surfacing `n2Fraction` as state.
- No GF (gradient factor) controls. The page shows raw M-values; the existing `gradient-factors.html` page covers GF intuition.
- No play/auto-advance for the time scrubber. A scrubber + step buttons is sufficient to explore the curve.
- No i18n for the educational copy. Inputs/labels follow existing conventions; longer pedagogical strings ship in English-only for v1 (see "Open questions" below).

## UI design

```
┌─────────────────────────────────────────────────────────────┐
│ Inputs strip:                                                │
│ [start depth] [target depth] [compartment ▾] [gas: Air]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Pt(t) = Palv + (Pt,0 − Palv) · e^−kt   ← LIVE FORMULA     │
│   1.71  = 2.37 + (0.79 − 2.37)  · 0.428  ← SUBSTITUTED      │
│                                                             │
├──────────┬──────────┬──────────┬───────────────────────────┤
│ Palv     │ Pt,0     │ k        │ e^−kt                     │  ← TERM CARDS
│ formula  │ formula  │ formula  │ formula                   │
│ subst.   │ subst.   │ subst.   │ subst.                    │
│ value    │ value    │ value    │ value                     │
│ intuition│ intuition│ intuition│ intuition                 │
├──────────┴──────────┴──────────┴───────────────────────────┤
│ ⏱ t = 33 min   [────●────────] [−5][−1][+1][+5]            │  ← TIME CONTROL
├─────────────────────────────────────────────────────────────┤
│  Pt(t) curve · cursor at current t · asymptote at Palv      │  ← MINI CHART
├─────────────────────────────────────────────────────────────┤
│ M-value check: ███▓▓▓░░░  Pt = 1.71 / M = 2.93  ✓  [a/b/c] │  ← M-VALUE STRIP
└─────────────────────────────────────────────────────────────┘
```

> Numbers in the ASCII mockup use the napkin form `Palv = (D+10)/10·F_N₂` for legibility (Pt,0 ≈ 0.79, Palv at 30 m ≈ 2.37). The actual page renders values from `getAlveolarN2Pressure`, which includes the water-vapour correction (Pt,0 ≈ 0.75 at surface, Palv at 30 m ≈ 3.12). The Pt example in the M-value strip is similarly rounded.

### Inputs strip

| Control | Type | Range | Default | Drives |
|---|---|---|---|---|
| Start depth | number + slider | 0–60 m | 0 | P<sub>t,0</sub> |
| Target depth | number + slider | 0–60 m | 30 | P<sub>alv</sub> |
| Compartment | `<select>` 1–16 | discrete | 5 (T½ = 27 min) | k, M-value coefficients |
| Gas | `<span>` (display only, v1) | — | "Air (F<sub>N₂</sub> = 0.79)" | F<sub>N₂</sub> |

Compartment options render as `"5 · T½ = 27.0 min"` etc., halftimes pulled from `getCompartmentsForVariant(currentVariant)`.

### Live formula + substituted line

Two lines stacked. Top: symbolic with each variable in a coloured `<span>`. Bottom: the numeric substitution updates as state changes. Colour palette (matches existing CSS variable scheme):

- P<sub>alv</sub> → blue (#2980b9, the project primary)
- P<sub>t,0</sub> → red (#e74c3c)
- k → green (#27ae60)
- t → purple (#9b59b6)
- P<sub>t</sub> (result) → amber (#e67e22)

### Term cards

Four cards in a 4-column grid (collapsing to 2 columns at narrow widths and 1 column on phones). Each card contains:

1. **Header**: variable name + plain-English label (e.g. `Palv · alveolar N₂ pressure`).
2. **Symbolic formula** (e.g. `(P_amb − 0.0627)·F_N₂`).
3. **Substituted formula** with current numbers (e.g. `(4.01 − 0.0627)·0.79`).
4. **Resulting value** (large, monospace, accent colour).
5. **One-line intuition** (italic, muted) — e.g. for k: *"Faster compartments → bigger k → catch up sooner."*

Card top-border colour matches the variable's accent in the formula above. That visual link is the entire mechanism; no SVG arrows needed.

### Water-vapour pedagogical note

The "napkin" `Palv = (D+10)/10 · F_N₂` formula is what most divers learn first; the *actual* `getAlveolarN2Pressure(P_amb, F_N₂) = (P_amb − 0.0627)·F_N₂` includes a water-vapour correction (alveolar gas is humidified, displacing some inert gas). The Palv card surfaces the corrected formula as the primary; a small expandable "**why the −0.0627?**" footnote explains the simplification. This keeps the displayed numbers consistent with the rest of DecoJS (which uses `WATER_VAPOR_PRESSURE = 0.0627`).

### Time control

- Numeric readout: `⏱ t = NN min`.
- Range slider: 0 to `max(120, 4·T½)` minutes — long enough to see the curve flatten near asymptote for any compartment.
- Step buttons: −5, −1, +1, +5. Disabled when at range bounds.
- Time is integer minutes only (no fractional values, no animation).

### Mini Pt chart

- Inline `<svg>`, ~480 × 120 px.
- Single curve: P<sub>t</sub>(τ) for τ ∈ [0, t<sub>max</sub>], 120 sample points.
- Horizontal asymptote line at P<sub>alv</sub>.
- Horizontal line at P<sub>t,0</sub>.
- Vertical cursor at current `t`, with a dot at (t, P<sub>t</sub>(t)).
- No axis labels other than the start/end values along x-axis (min) and y-axis (bar). Aim is intuition, not measurement; the term cards already carry the precise numbers.

This is **not** the existing `TissueSaturationSim` component. That component renders all 16 compartments and would fight the page's single-compartment focus. We render a fresh inline SVG.

### M-value strip

- Horizontal gradient bar (green → amber → red) with a marker at `Pt / M`. Marker turns red and a "✗ exceeded" label shows when Pt > M.
- Numeric readout: `Pt = X.XX / M = Y.YY`.
- Model selector: `<select>` with three options — ZH-L16 a, b, c. Changing this updates the M-value (and the bar position) but does **not** affect P<sub>t</sub> (Haldane uses only the half-time, which is identical across the three variants).
- M-value at depth uses `getMValue(P_amb_target, compartment.aN2, compartment.bN2)`. Note: M-value compares against ambient at the *target* depth, not surface — matches Bühlmann convention used elsewhere in the codebase.

## Architecture

### Files touched

| File | Change |
|---|---|
| `sandbox/haldane.html` | NEW — entire page (markup, inline `<style>`, inline `<script>`) |
| `js/nav.js` | Add entry under `Sandbox` submenu |
| `index.html` | Add a topic tile/link to the new page (under existing topic-tile section) |
| `sw.js` | Add `./sandbox/haldane.html` to `STATIC_ASSETS` array; bump `CACHE_NAME` |
| `css/styles.css` | Bump `.version-number::after` content; no new shared CSS (all page-specific styles live inline) |

### Module dependencies

The page imports as ESM from existing modules — **no new module is created**:

```js
import {
    getAmbientPressure,
    getAlveolarN2Pressure,
    getInitialTissueN2,
    haldaneEquation,
    getMValue,
    N2_FRACTION,
    SURFACE_PRESSURE,
    WATER_VAPOR_PRESSURE,
} from '../js/decoModel.js';

import {
    ZHL16_VARIANTS,
    getCompartmentsForVariant,
    getRateConstant,
} from '../js/tissueCompartments.js';
```

### State model

A single in-memory `state` object holds:

```js
const state = {
    startDepth: 0,        // m
    targetDepth: 30,      // m
    compartmentIdx: 4,    // 0-based; UI shows 1-based
    variant: 'C',         // 'A' | 'B' | 'C'
    t: 0,                 // minutes
    n2Fraction: N2_FRACTION,  // fixed for v1
};
```

A single `recompute()` function reads `state`, recomputes all derived values (Pt0, Palv, k, e^−kt, Pt, M-value), and updates the DOM. Every input handler mutates state and calls `recompute()`. No frameworks; the page is small enough that direct DOM updates are clean.

### Edge cases

- **start depth = target depth**: Pt,0 = Palv → `(Pt,0 − Palv) = 0` → Pt(t) = Palv for all t. The curve is a flat line; the term cards still render correctly. Worth showing — illustrates "no driving gradient, no change."
- **Compartment 1 (very fast)**: T½ ≈ 5 min, asymptote reached in well under 30 min. Time slider should still go to 4·T½ minimum, plus a 120-min floor to keep the slider feeling usable on slow compartments.
- **e<sup>−kt</sup> at t = 0**: equals 1.0; substituted formula correctly shows `Pt(0) = Pt0`.
- **Negative `(Pt,0 − Palv)` (descent into deeper depth → on-gassing)** vs **positive (ascent into shallower depth → off-gassing)**: equation is symmetric; both are demonstrable. The "intuition" copy should not assume direction.

## Verification

### Existing test coverage

Math is unchanged — the existing 201-test suite (`tests/`) already covers `haldaneEquation`, `getMValue`, and compartment data. No new unit tests added.

### Browser smoke test

Playwright script (run via the existing `webapp-testing` skill pattern, the same way `transfilling.html` was smoke-tested):

1. Load page; assert no console errors.
2. Set start = 0, target = 30, compartment = 5, t = 0 → assert Pt readout ≈ Pt,0.
3. Move scrubber to t = 27 (one half-time) → assert Pt is approximately halfway between Pt,0 and Palv (within 0.5%).
4. Move to t = 120 → assert Pt is within 1% of Palv.
5. Switch ZH-L16 variant (a → b → c) → assert M-value readout changes; assert Pt readout does **not** change.
6. Set start = target = 20 → assert Pt = Palv for all t (curve is flat).

### Pre-commit checklist (per CLAUDE.md)

- `npm test` passes.
- `sw.js` `CACHE_NAME` and `css/styles.css` `.version-number::after` bumped to the same new version.
- New file `sandbox/haldane.html` registered in `sw.js` `STATIC_ASSETS`.
- Wiki update: not needed (no math source files changed).

## Open questions

1. **Half-time variant and compartment numbering** — the codebase has the variant selector used in other sandbox tools. Should the Haldane page use a single fixed variant for compartment data (e.g. always ZH-L16C) or surface the variant selector? **Recommendation:** keep the M-value model selector as the only variant control on this page. The page's compartment data (T½) doesn't actually differ across a/b/c — only the M-value coefficients do. So the user picks "compartment 5" in absolute terms, and ZH-L16 a/b/c only affects the bottom strip.
2. **Educational copy language** — Sandbox pages are translated; theory pages are mostly English. This page sits between the two. **Recommendation:** ship inputs/labels via i18n (so they match other sandbox pages), but keep the long explanations and "intuition" copy English-only for v1; revisit for translation when content is stable.
3. **Where on `index.html`?** — Add as a Sandbox topic tile, placed near `tissue-saturation.html` (its closest cousin). User to confirm placement order.

## Out of scope / follow-ups

- **Schreiner companion** — a separate `sandbox/schreiner.html` page reusing the same shell, with descent/ascent rate as an additional input. Foreseen for after Haldane lands.
- **Multi-compartment overlay** — option to show all 16 curves on the mini chart with the picked one highlighted. Possible v2 feature; not a v1 requirement.
- **Gas picker (nitrox / trimix)** — surface `n2Fraction` as a UI control. Trivial extension once requested.
- **Repetitive dives / off-gassing** — already a known DecoJS roadmap item; would require Pt,0 to come from a prior dive's tail rather than from start-depth saturation. Out of scope here.
