# Interactive Schreiner Equation Sandbox — Design

**Date:** 2026-05-08
**Status:** Draft (post-brainstorm, awaiting user review)
**Implementation branch:** `feat/schreiner-sandbox`
**Sibling spec:** `2026-05-08-haldane-sandbox-page-design.md`

## Summary

A new sandbox page (`sandbox/schreiner.html`) that teaches the **Schreiner equation**

> P<sub>t</sub>(t) = P<sub>alv,0</sub> + R · (t − 1/k) − (P<sub>alv,0</sub> − P<sub>t,0</sub> − R/k) · e<sup>−kt</sup>

by rendering the formula as a live, annotated artefact — same visual idiom as the Haldane page, with the additional terms (R, R/k, the linear-rate moving alveolar pressure) made explicit via colour-coded variables and a fifth term card. The user picks **start depth**, **depth rate** (m/min, signed), and **segment time** (min); end depth is derived. Scrubbing time forward animates Pt(t) along a segment with a sloped P<sub>alv</sub>(t) line; the M-value bar updates live as the diver's instantaneous depth changes.

The pedagogical hook of this page (the reason it sits *after* Haldane in nav) is the **Haldane-as-degenerate-Schreiner** demo: setting `depth_rate = 0` makes R = 0, the linear-rate terms vanish, and the formula collapses on screen to pure exponential decay — the Haldane equation. Schreiner is "Haldane plus a moving alveolar source."

## Goals

- Make the moving parts of the Schreiner equation visible and inspectable: P<sub>alv,0</sub>, P<sub>t,0</sub>, R, k, e<sup>−kt</sup>.
- Surface the **R conversion** explicitly — `R = f_N₂ · depth_rate · 0.1` — because it's the most easily-fumbled bit of arithmetic in the Schreiner formula.
- Show the **phase-lag** intuition visually: P<sub>alv</sub> moves linearly in time while P<sub>t</sub> trails behind, settling toward but never quite catching up to (a moving target).
- Demonstrate the **Haldane collapse** with a single input change (rate → 0).
- Reuse the verified `schreinerEquation` primitive in `js/decoModel.js` — no new math.

## Non-goals (v1)

- No multi-segment dive simulation — that's `calculateTissueLoading()`'s job, lives in `sandbox/index.html`.
- No multi-compartment view — same scoping decision as Haldane (this page studies one compartment at a time).
- No nitrox / trimix selector — Air only for v1, F<sub>N₂</sub> = 0.7902 (or 0.79 in simplified mode).
- No GF (gradient factor) controls — exists in `gradient-factors.html`.
- No play / auto-advance scrubber.
- No pedagogical-copy i18n; control labels translate, intuition lines stay English.

## UI design

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Inputs strip:                                                              │
│ [start depth] [depth rate ↑↓] [time] [compartment] [model] [gas] [simpl.]│
│                                  end depth: 21.0 m  (derived)              │
├───────────────────────────────────────────────────────────────────────────┤
│   Pt(t) = Palv,0 + R · (t − 1/k) − (Palv,0 − Pt,0 − R/k) · e^−kt          │
│   3.1217 = 3.1217 + (−0.7902)·(0.9 − 38.96) − (3.1217 − 3.1217 − …)·…     │
├──────┬──────┬──────┬──────┬─────────────────────────────────────────────┤
│Palv,0│Pt,0  │  R   │  k   │ e^−kt                                          │
│  ↓   │  ↓   │  ↓   │  ↓   │  ↓                                             │
│ form │ form │ form │ form │ formula                                        │
│ subst│ subst│ subst│ subst│ substituted                                    │
│ value│ value│ value│ value│ value                                          │
│ why  │ why  │ why  │ why  │ why                                            │
├──────┴──────┴──────┴──────┴─────────────────────────────────────────────┤
│ ⏱ t = 0.45 min   [────●────]   [−1] [+1]                                  │
│   saturation = (1 − e^−kt) × 100%                                          │
├───────────────────────────────────────────────────────────────────────────┤
│ Mini chart:                                                                │
│   Palv(t) ────────── (linear, dashed blue, slopes from Palv,0 to Palv,end)│
│   Pt(t) ╭╮╭ (curve, lags behind Palv on the same scale)                   │
│   cursor at current t                                                      │
├───────────────────────────────────────────────────────────────────────────┤
│ M-value check (fixed 0..10 bar scale):                                     │
│   Pt₀ red ║  Palv blue ║  Pamb gray ║  Pt purple (moving) ║  M dark        │
│   Pt = X.XXXX bar | M = Y.YYYY bar  ✓ within                               │
│   M = a + Pamb(t)/b = … = M  ← Pamb at the diver's instantaneous depth    │
└───────────────────────────────────────────────────────────────────────────┘
```

> Numbers above use the precise math (with water-vapour correction). Simplified mode drops the −0.0627 just like the Haldane page.

### Inputs strip

| Control | Type | Range | Default | Drives |
|---|---|---|---|---|
| Start depth | number | 0–30 m | 30 | P<sub>t,0</sub>, P<sub>alv,0</sub>, P<sub>amb</sub>(t=0) |
| Depth rate | number | −20 to +20 m/min | −10 | R; sign of R indicates ascent (negative) vs descent (positive) |
| Time | number | 0.1–60 min | 0.9 | Scrubber upper bound; the segment's duration |
| Compartment | select | 1–16 | 5 | k via T½, M via a/b |
| Model | select | ZH-L16 a/b/c | C | M coefficients |
| Gas | display only | "Air (F<sub>N₂</sub> = 0.79)" | — | F<sub>N₂</sub> in R conversion + alveolar formula |
| Simplified | checkbox | off | off | drops water-vapour 0.0627 + uses F<sub>N₂</sub> = 0.79 |

A small read-only **End depth** display sits next to the rate/time inputs: `End depth = start_depth + depth_rate · time`. With defaults: `30 + (−10) · 0.9 = 21.0 m`.

### Live formula + substituted line

Two lines stacked. Top: symbolic with each variable in a coloured `<span>`. Bottom: the numeric substitution updates as state changes.

Colour palette (extends Haldane's, adds R):

- P<sub>alv,0</sub> (and any P<sub>alv</sub> reference) → blue `#2980b9`
- P<sub>t,0</sub> → red `#e74c3c`
- **R → teal `#16a085`** (new, distinct from existing palette)
- k → green `#27ae60`
- t → purple `#9b59b6`
- P<sub>t</sub> (result) → amber `#e67e22`

### Five term cards

Same anatomy as Haldane (name, symbolic formula, substituted formula, value, plain-English intuition), one extra:

- **P<sub>alv,0</sub>** (blue) — Alveolar N₂ pressure at start depth.
  - Symbolic precise: `(P_amb,start − 0.0627) · F_N₂`
  - Symbolic simplified: `(start_depth/10 + 1) · F_N₂`
- **P<sub>t,0</sub>** (red) — Tissue pressure at t=0, assumed equilibrated at start depth. (Same value as P<sub>alv,0</sub> in this single-segment model — the tissue starts saturated.)
- **R** (teal, NEW) — Alveolar pressure rate of change.
  - Symbolic: `f_N₂ · depth_rate · 0.1`
  - Substituted: e.g. `0.7902 · (−10) · 0.1 = −0.7902 bar/min`
  - Intuition: "How fast the alveolar source is moving. Positive = descent (alveolar climbing), negative = ascent (alveolar dropping)."
- **k** (green) — Same as Haldane: `ln(2) / T½`
- **e<sup>−kt</sup>** (purple) — Same as Haldane.

A 5-column grid at typical viewport widths, falling back to 3+2 (or 2+2+1) at narrower widths, then 1 column on phones.

### Time scrubber

- Numeric readout: `⏱ t = NN min` plus saturation % readout (`saturation = (1 − e^−kt) × 100%`, useful even when rate ≠ 0 as a measure of how far Pt has decayed toward the asymptote).
- Range slider: 0 to `state.segmentTime` (which the user controls via the time input above; not derived from compartment T½ on this page).
- Step buttons: `−1 / +1` minute. The snap-to-T½ pattern from Haldane doesn't carry over here — segment times are typically short (0.5–3 min for ascent/descent), so T½ markers usually fall outside the visible range.
- The `time` input value can be edited directly to extend or shrink the scrubber range; useful for the rate=0 demo (set time = 30+ to watch full Haldane equilibration).

### Mini Pt(t) chart

- Inline `<svg>`, 480 × 140 px, same scaffolding as Haldane.
- **Two lines** instead of one + asymptote:
  - **P<sub>alv</sub>(t)** — straight line from P<sub>alv,0</sub> to P<sub>alv,end</sub>, slope = R, dashed blue (4 4 dasharray).
  - **P<sub>t</sub>(t)** — curve as a solid dark path, sampled at 120 points across the segment.
- Baseline at P<sub>t,0</sub> (red dashed, 2 4 dasharray) to anchor where the tissue started.
- Vertical cursor at current t, dot at (t, P<sub>t</sub>(t)).
- Half-time tick markers: included only if a marker falls inside [0, segmentTime]. For typical short ascent segments (≤ 3 min, fast tissues T½ ≥ 5 min), no markers visible — that's fine. The cap of `Math.min(5, floor(tMax / T½))` continues to apply.

### M-value bar

- Same fixed 0..10 bar scale as Haldane (the M-value-fixed-scale PR).
- Anchors above the bar: **P<sub>t,0</sub>** (red), **P<sub>alv</sub> at current depth** (blue), **P<sub>amb</sub> at current depth** (gray).
- Marker (purple) for **Pt at current t**.
- M-line (dark vertical) at M position. **All four — Palv anchor, Pamb anchor, M-line, and Pt marker — recompute on every t-change**, since the diver's depth (and therefore P<sub>amb</sub>) changes during the segment. P<sub>t,0</sub> alone stays put (it's defined at t=0).
- Readout below the bar: `Pt = X | M = Y  ✓ within / ✗ exceeded`.
- Derivation line: `M = a + P_amb(t)/b = a_value + P_amb(t)_value / b_value = M_value` — values change with t.

### Haldane-collapse demo

When `depth_rate = 0`:

- R card: `R = 0` (terms involving R go to zero).
- The substituted formula reads: `Pt = Palv,0 + 0·(t − 1/k) − (Palv,0 − Pt,0 − 0)·e^−kt = Palv,0 − (Palv,0 − Pt,0)·e^−kt`.
- This is exactly the Haldane equation.
- Visually, the `R · (t − 1/k)` and `R/k` substituted text segments evaluate to zero and become numerically inert.

The R term card has an additional flag visible only when R = 0: a small `→ Haldane case` annotation pointing to the "fraction left to go" intuition. (Plain text, no special styling beyond italic muted text.)

## Architecture

### Files touched

| File | Action |
|---|---|
| `sandbox/schreiner.html` | NEW — entire page |
| `js/nav.js` | Add Schreiner entry under Sandbox submenu after Haldane |
| `index.html` | Add a sublink in the existing Sandbox topic card after Haldane |
| `sw.js` | Register `./sandbox/schreiner.html` in `STATIC_ASSETS`; bump `CACHE_NAME` |
| `css/styles.css` | Bump `.version-number::after` content |
| `locales/en.json`, `locales/cs.json`, `locales/es.json` | `nav.sandbox.schreiner`, `home.topics.sandboxLinks.schreiner`, `sandbox.schreiner.*` block |

### Module dependencies

```js
import {
    getAmbientPressure,
    getAlveolarN2Pressure,
    schreinerEquation,
    getMValue,
    N2_FRACTION,
} from '../js/decoModel.js';

import {
    getCompartmentsForVariant,
    getRateConstant,
} from '../js/tissueCompartments.js';
```

### State model

```js
const state = {
    startDepth: 30,
    depthRate: -10,    // m/min, signed
    segmentTime: 0.9,  // min, defines scrubber range
    compartmentIdx: 4, // 0-based
    variant: 'ZH-L16C',
    t: 0,
    n2Fraction: N2_FRACTION,  // overridden when simplified=true
    simplified: false,
};
```

Single `recompute()` reads state, computes derived values (P_alv,0, P_t,0, R, k, t-dependent Pt and Palv at current depth), updates DOM (formula, term cards, scrubber, chart, M-value bar). All input handlers mutate state and call recompute.

### `applyTimeRange()` simpler than Haldane's

On Haldane the scrubber max was `max(120, 4·T½)`. Here it's `state.segmentTime` directly — the user controls it via the time input. When the user changes time, `applyTimeRange()` updates `timeSlider.max = String(state.segmentTime)` and clamps state.t.

### Edge cases

- **`depth_rate = 0`**: end depth = start depth. R = 0. The Schreiner formula degenerates to Haldane (verified by `schreinerEquation` itself, but to avoid the `R/k` term being zero-with-rounding we still call `schreinerEquation` — the wiki notes this is the "documented degenerate case" and the existing primitive handles it).
- **Start depth + rate · time → negative end depth**: clamp end-depth display at 0 (you can't ascend through the surface). Math still works (alveolar pressure can't go below F_N₂ · 0.95 at sea level, so values stay sensible). Show end-depth as `0.0 m` if computed value is negative.
- **`segmentTime = 0`**: nothing happens. Pt = Pt,0 forever. Slider locks at 0. Acceptable degenerate state.
- **Saturation % at rate ≠ 0**: defined as `(1 − e^−kt) × 100`, same as Haldane. Even with R ≠ 0, the e^−kt factor is what governs how the initial-disequilibrium term decays. The saturation reading describes "how much of the initial gap (Palv,0 − Pt,0 − R/k) has settled." It's not a pure depth-tracking metric, but consistent with Haldane's interpretation when R = 0. Acceptable.

## Verification

### Existing test coverage

`schreinerEquation()` is covered in `tests/`. No new unit tests.

### Browser smoke test

`.claude-scratch/schreiner_smoke.py`, modeled on `haldane_smoke.py`:

1. Page loads, no console errors, hero h1 contains "Schreiner".
2. Defaults: start=30, rate=−10, time=0.9, comp idx 4, variant ZH-L16C → end depth read-out = "21.0 m".
3. Reference at t=0: Palv,0 ≈ 3.1217 bar, Pt,0 ≈ 3.1217 bar (saturated at start), R ≈ −0.7902 bar/min, k ≈ 0.0257 min⁻¹, e^−kt = 1.0, Pt = Pt,0 = 3.1217.
4. Reference at t=0.9 (full segment): Pt ≈ 3.1233 bar (per the wiki worked example).
5. Toggle simplified: term cards re-render with `(D/10 + 1) · F_N₂` form for P_alv and `f_N₂ · rate · 0.1` for R, with F = 0.79.
6. **Haldane-collapse demo (algebraic, not visual)**: This page enforces "tissue saturated at start depth", so Pt,0 always equals Palv,0 in the single-segment model. When the user sets rate=0, R goes to zero and the formula collapses to `Pt = Palv,0 + (Pt,0 − Palv,0)·e^−kt = Palv,0` — i.e. Pt stays constant. The collapse is *algebraic* (you can see the formula's terms zero out) rather than *visual* (the curve doesn't bend). To see Haldane's exponential decay visually, the learner goes back to the Haldane page (which lets Pt,0 differ from Palv via separate start and target depths). This page's contribution is the linear-rate story; the collapse note is the bridge back. Smoke test asserts mechanical equivalence:
     ```python
     # Rate=0 → Pt should remain at Palv,0 across all t, since this page's
     # single-segment model has Pt,0 == Palv,0.
     page.locator('#depthRate').fill('0')
     page.locator('#segmentTime').fill('30')
     for t_val in ['0', '5', '15', '27']:
         page.locator('#timeSlider').fill(t_val)
         page.locator('#timeSlider').dispatch_event('input')
         page.wait_for_timeout(30)
         pt = num('#ptValue')
         palv0 = num('#palv0Value')
         assert abs(pt - palv0) < 1e-6, f'rate=0 should keep Pt=Palv,0; got Pt={pt}, Palv,0={palv0} at t={t_val}'
     ```
7. M-value at current depth: scrub to t=0.5 (mid-segment). The diver's instantaneous depth is `30 + (−10)·0.5 = 25 m`. P_amb at 25m = 3.51325 bar. M for comp 5 ZH-L16C at that depth = 0.62 + 3.51325/0.8126 = 4.94 bar. Smoke test: scrub to t=0.5, read #mValue, assert ≈ 4.94 within 0.01.

### Pre-commit checklist

- `npm test` passes.
- `sw.js` `CACHE_NAME` and `css/styles.css` `.version-number::after` bumped to the same new version.
- New file `sandbox/schreiner.html` registered in `sw.js` `STATIC_ASSETS`.
- Wiki update: not needed (no math source files changed; Schreiner wiki is reference material that's already accurate).

## Open questions

1. **Should the `R = 0 → Haldane` annotation in the R term card be shown only when rate = 0, or always as a teaching note?** Recommendation: always-on small italic line at the bottom of the R card: *"R = 0 → equation becomes Haldane (constant depth)."* So the connection to the previous page is visible even before the user tries it.
2. **Place in the homepage sublinks list — between Haldane and Tissue Saturation, or after Tissue Saturation?** Schreiner extends Haldane, so right after Haldane is the natural narrative order. Recommendation: `… deco → tissue → haldane → schreiner → transfill → cascade → gas-law`.
3. **Should the time input accept fractional minutes natively?** Default 0.9 is fractional. Use `step="0.1"` on the input. Recommendation: yes.

## Out of scope / follow-ups

- Multi-segment chaining (descent + bottom + ascent in one view). Belongs in a richer planner page or an extension of `sandbox/index.html`.
- Continuous gas-switching during the segment.
- Integration with the existing `sandbox/tissue-saturation.html` to overlay a Schreiner segment on the multi-compartment view.
