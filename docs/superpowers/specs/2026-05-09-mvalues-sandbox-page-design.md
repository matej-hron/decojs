# M-Value Sandbox Page — Design Spec

**Date:** 2026-05-09
**Status:** Draft → awaiting user review
**Author:** Matej (with Claude)
**Companion sandboxes:** [`sandbox/haldane.html`](../../../sandbox/haldane.html), [`sandbox/schreiner.html`](../../../sandbox/schreiner.html)

---

## 1. Goal

Build a single-file interactive sandbox page at `sandbox/m-values.html` that lets students explore the Bühlmann M-value formula and **see where its `a` and `b` coefficients come from**.

The page tells four stories on one screen:

1. **M is depth-dependent.** It's a sloped line, not a fixed limit — `M(P_amb) = a + P_amb/b`.
2. **Each compartment has its own line.** All 16 lines stacked form a "tolerance wall."
3. **Variants A / B / C are calibration choices.** Same physics, hand-tweaked intercepts for the middle compartments.
4. **`a` and `b` come from formulas, not statistics.** ZH-L16A is analytical; B and C are deviations.

The page complements (does not replace) the existing prose theory page `m-values.html` and the wiki page `wiki/Model-04-M-Values.md`.

## 2. Scope

### In scope

- New file `sandbox/m-values.html`, single self-contained HTML + ES module (no build step).
- Two stacked **playgrounds** on one page:
  - **Top:** "What does M look like at this depth?" — formula evaluation as you scrub depth/compartment/variant.
  - **Bottom:** "Where do `a` and `b` come from?" — derivation curves with the 16 standard compartments overlaid as dots.
- Synced compartment selector and variant toggle across both playgrounds.
- Inline SVG charts (no charting library), reusing existing CSS variables.
- i18n in en / cs / es using `data-i18n` attributes and the existing `js/i18n.js` machinery.
- Nav entry under Sandbox submenu.
- Service-worker static-asset entry.
- Cross-links from `wiki/Model-04-M-Values.md` and `wiki/Model-01-Compartments.md`.
- Smoke test (gitignored) under `.claude-scratch/mvalues_smoke.py` following Haldane/Schreiner pattern.

### Out of scope (explicitly)

- **Gradient factors.** No GF Low/High inputs, no GF corridor. Deferred to a possible future GF sandbox.
- **Live tissue pressure (Pt).** No tissue marker, no Pt slider, no "is this tissue safe" check. That belongs to Haldane / Schreiner sandboxes, where Pt actually evolves over time.
- **Helium coefficients.** N₂ only — matches `m-values.html` theory page.
- **"Open in dive sandbox" deep-link.** No dive context to deep-link.
- **Modifying the existing prose theory page** `m-values.html`. It stays as-is.

## 3. Page identity

| Field | Value |
|---|---|
| File | `sandbox/m-values.html` |
| Title (en) | "M-Value Sandbox" |
| Title (cs) | "M-hodnota: pískoviště" (verify against existing `m-values.html` translations and stay consistent) |
| Title (es) | "Sandbox de Valor M" (verify against existing `m-values.html` translations and stay consistent) |
| Subtitle (en) | "Where the line comes from, and what it looks like for all 16 compartments." |
| Nav placement | Sandbox submenu, between `schreiner.html` and `transfilling.html` |
| Sandbox `index.html` ordering | deco → tissue saturation → haldane → schreiner → **m-values** → transfilling → cascade → gas-law |
| Home topic tile entry | New sublink under the Sandbox topic tile |

**Note on naming collision:** the existing `m-values.html` (theory page, top-level) and the new `sandbox/m-values.html` share a stem but live in different directories. Same pattern used by `tissue-loading.html` (theory) vs `sandbox/tissue-saturation.html` (sandbox), so no rename needed.

## 4. Top playground — "What does M look like at this depth?"

### 4.1 Inputs strip

- **Depth:** numeric input + range slider, range 0–60 m, step 0.1, default **30**.
- **Compartment:** select dropdown, options 1–16 (with half-time and label, e.g. "TC5 — 27 min — Muscle, Skin"), default **TC5**.
- **Variant:** radio button group, A / B / C, default **C**. **This control is shared with the bottom playground** — it's a single global control for the page.
- **View toggle:** segmented control with two options: "This compartment" / "All 16", default **This compartment**.

### 4.2 Annotated formula

Centered block, color-coded terms:

```
M  =  a  +  P_amb / b
```

Each term color matches its term card and the chart elements where it appears.

### 4.3 Term cards (4 cards)

| Card | Label (en) | Value | Computed from |
|---|---|---|---|
| `a` | "Tissue intercept" | live number, 4 decimals, e.g. `0.6200` | compartment + variant lookup |
| `P_amb` | "Ambient pressure" | live number, 4 decimals, e.g. `4.0133 bar` | `1.01325 + depth · 0.1` |
| `b` | "Tissue slope" | live number, 4 decimals, e.g. `0.8126` | compartment + variant lookup |
| `M` | "Tolerated tissue pressure" | live number, 4 decimals, e.g. `5.5588 bar` | `a + P_amb / b` |

Cards reflow to a 2×2 grid on mobile.

### 4.4 Main chart

- **SVG inline**, viewBox `0 0 480 280` (slightly taller than Schreiner's 140 to fit a 0–10 bar y-axis comfortably).
- **Axes:**
  - x: ambient pressure, 0–7 bar (covers surface through ~60 m).
  - y: tissue inert-gas pressure, **dynamic** — computed each render as `1.1 × max(M at maxP_amb across visible compartments)`, clamped to a minimum of 10 bar so the axis doesn't jitter on small movements. (Matches the dynamic-axis approach in `js/mvalues.js:1088`. Without this, TC1 var A lines clip at deeper depths because slope = 1/b ≈ 2.)
- **Always-shown reference lines:**
  - Ambient line `y = x`: blue dashed.
  - Surface line `x = 1.01325`: gray dashed vertical.
- **"This compartment" view (default):**
  - Selected compartment's M-line in the active variant: bold red, color from compartment palette.
  - Same compartment under the other two variants: faint dashed lines (visual differentiation: lighter color, dash pattern).
  - Marker dot at `(P_amb_current, M_current)` — large, filled circle in the active variant's color.
- **"All 16" view:**
  - All 16 M-lines for the active variant, color-coded per the existing compartment palette in `js/tissueCompartments.js`.
  - Selected compartment's line is bold; others are thin/muted.
  - Marker dot at `(P_amb_current, M_current)` for the selected compartment only.
- Axis labels and tick marks use existing chart styles from Haldane/Schreiner.

## 5. Bottom playground — "Where do `a` and `b` come from?"

### 5.1 Anchor message (above the playground)

> "ZH-L16A's `a` and `b` aren't fitted to data — they're computed from half-time alone. Variants B and C are post-hoc adjustments to specific compartments."

### 5.2 Annotated formulas

Two stacked formula blocks, color-coded:

```
a(t½)  =  2 · t½^(-1/3)        (bar)
b(t½)  =  1.005 − t½^(-1/2)
```

### 5.3 Inputs strip

- **Half-time slider:** continuous, range 1–700 min, **logarithmic scale** (so the fast end isn't crushed), default starts at **27 min** (TC5's t½, matching default compartment).
- **Numeric input** mirroring the slider, accepts free-form values 1–700.
- **"Snap to compartments" toggle:** when on, slider quantizes to the 16 standard t½ values for the **active variant**. The 16 t½ values are: **4** (TC1 in variant A only) **OR 5** (TC1 in variants B/C), 8, 12.5, 18.5, 27, 38.3, 54.3, 77, 109, 146, 187, 239, 305, 390, 498, 635. Switching variant while snapped re-snaps to the new variant's nearest t½ (relevant only for TC1, since 4 ↔ 5 swap). Default off.
- **Variant toggle:** **shared with top playground** (one global control). Lives at the page level, not duplicated.

### 5.4 Term cards (3 cards)

| Card | Label (en) | Value |
|---|---|---|
| `t½` | "Half-time" | live, e.g. `27.0 min` |
| `a(t½)` | "Analytical a — and stored variant value" | analytical: e.g. `0.6667`. When current t½ exactly matches a standard compartment, display `stored: 0.6200 (variant C, Δ −0.0467)` underneath. When between standards, display only the analytical value with a small hint "between standards". |
| `b(t½)` | "Analytical b" | live, e.g. `0.8126`. Footnote on the card indicates "TC1 in variant A uses t½=4, others use t½=5" because that's the only compartment where `b` differs across variants. |

### 5.5 Main chart

- **SVG inline**, viewBox `0 0 480 280`.
- **X-axis:** `t½`, 1–700 min, **log scale** (so 4-min and 635-min compartments are both visible).
- **Two y-axes** (overlaid in a single panel via dual scaling, or rendered as a small-multiple of two stacked panels — implementer's choice; leaning overlay):
  - Left y: `a` value, 0–1.5 bar.
  - Right y: `b` value, 0.4–1.0 dimensionless.
- **Curves:**
  - `a(t½) = 2·t½^(-1/3)`: smooth red curve, ~120 sample points.
  - `b(t½) = 1.005 − t½^(-1/2)`: smooth blue curve, ~120 sample points.
- **Compartment dots (overlay):**
  - 16 dots at standard t½ values (using the active variant's t½ for TC1).
  - Each dot drawn twice — once at `(t½, a_stored)` (red-side), once at `(t½, b_stored)` (blue-side).
  - For variant A: all dots sit exactly on the curves (because A *is* the formula).
  - For variant C: TC5–15 a-dots lift downward off the red curve. b-dots stay on the blue curve except TC1 (which sits at a different t½ in B/C).
  - Selected compartment dot is highlighted (bold outline / larger).
- **Slider position indicator:** vertical guideline at the current slider t½. Where it crosses the red and blue curves, draw small horizontal segments out to the y-axes — the live values shown in the term cards.

### 5.6 The teaching moment

Toggling the variant from A → C lifts a subset of red dots downward off the red curve. The variant story becomes literal: "look, here's where Bühlmann pushed the dots."

## 6. Cross-playground sync

| Control | Behavior |
|---|---|
| Compartment | Synced both ways. Selecting in top updates bottom's highlighted dot and snaps the t½ slider to that compartment's t½. Selecting a dot in bottom (or matching the slider to a standard t½) updates top's compartment dropdown. |
| Variant | Single global control on the page. Affects both playgrounds. |
| Depth (top only) | Local to top. Doesn't affect bottom. |
| t½ slider (bottom only) | Local to bottom. When between standards, top's compartment selector stays on its previous value (the user is exploring an interpolated tissue, not selecting one). When snapped to a standard, top's compartment selector follows. |
| View toggle (top only) | Local to top. |
| Snap toggle (bottom only) | Local to bottom. |

## 7. Layout & responsive behavior

### 7.1 Desktop (≥900 px)

```
┌────────────────────────────────────────────────────┐
│ Header / nav / disclaimer                          │
├────────────────────────────────────────────────────┤
│ Title block                                        │
│ Variant toggle (shared across both playgrounds)    │
├────────────────────────────────────────────────────┤
│ ┌── Top playground ─────────────────────────────┐  │
│ │ Anchor: "What does M look like at this depth?"│  │
│ │ Inputs strip (depth, comp, view)              │  │
│ │ Formula                                       │  │
│ │ Term cards (4 in a row)                       │  │
│ │ Chart                                         │  │
│ └───────────────────────────────────────────────┘  │
│                                                    │
│ ┌── Bottom playground ──────────────────────────┐  │
│ │ Anchor: "Where do a and b come from?"         │  │
│ │ Inputs (t½ slider, snap toggle)               │  │
│ │ Formulas                                      │  │
│ │ Term cards (3 in a row)                       │  │
│ │ Chart                                         │  │
│ └───────────────────────────────────────────────┘  │
│                                                    │
│ Cross-links: wiki / theory page / Haldane /        │
│              Schreiner sandboxes                   │
└────────────────────────────────────────────────────┘
```

Both playgrounds full-width, stacked vertically.

### 7.2 Mobile (<900 px)

Same vertical stacking. Inside each playground:
- Inputs above formula above cards above chart.
- Top cards reflow to 2×2 grid.
- Bottom cards stay 1×3 (already narrow).
- Charts fill width with maintained aspect ratio.

### 7.3 Visual styling

- All existing CSS variables, term-card classes, formula-block styles from `sandbox/haldane.html` and `sandbox/schreiner.html` are reused.
- Bottom playground gets a subtle visual differentiator (e.g., faint background tint or top border) to signal "different topic".

## 8. Defaults on first load

| Control | Default |
|---|---|
| Variant | C |
| Compartment | TC5 (27 min) |
| Depth | 30 m |
| Top view toggle | "This compartment" |
| Bottom snap toggle | off (continuous) |
| Bottom t½ slider | 27 min (matches TC5) |

Why TC5: it's the canonical "first compartment to differ between A and C" — picking it on first load makes the variant story land immediately when the user toggles A ↔ C.

## 9. i18n keys

All UI strings keyed under `sandbox.mvalues.*`. Required keys (en/cs/es):

```
sandbox.mvalues.title
sandbox.mvalues.subtitle
sandbox.mvalues.disclaimer

sandbox.mvalues.variantToggle.label
sandbox.mvalues.variantToggle.optionA
sandbox.mvalues.variantToggle.optionB
sandbox.mvalues.variantToggle.optionC

sandbox.mvalues.top.anchor
sandbox.mvalues.top.inputs.depth
sandbox.mvalues.top.inputs.compartment
sandbox.mvalues.top.inputs.viewToggle.label
sandbox.mvalues.top.inputs.viewToggle.thisComp
sandbox.mvalues.top.inputs.viewToggle.all16
sandbox.mvalues.top.cards.a.label
sandbox.mvalues.top.cards.pAmb.label
sandbox.mvalues.top.cards.b.label
sandbox.mvalues.top.cards.m.label
sandbox.mvalues.top.chart.xAxis
sandbox.mvalues.top.chart.yAxis
sandbox.mvalues.top.chart.legendAmbient
sandbox.mvalues.top.chart.legendSurface

sandbox.mvalues.bottom.anchor
sandbox.mvalues.bottom.inputs.halfTime
sandbox.mvalues.bottom.inputs.snapToggle
sandbox.mvalues.bottom.cards.halfTime.label
sandbox.mvalues.bottom.cards.a.label
sandbox.mvalues.bottom.cards.a.deltaHint
sandbox.mvalues.bottom.cards.a.betweenHint
sandbox.mvalues.bottom.cards.b.label
sandbox.mvalues.bottom.cards.b.tc1Note
sandbox.mvalues.bottom.chart.xAxis
sandbox.mvalues.bottom.chart.yAxisA
sandbox.mvalues.bottom.chart.yAxisB

sandbox.mvalues.crossLinks.heading
sandbox.mvalues.crossLinks.wiki
sandbox.mvalues.crossLinks.theory
sandbox.mvalues.crossLinks.haldane
sandbox.mvalues.crossLinks.schreiner

nav.sandbox.mvalues
home.topics.sandboxLinks.mvalues
```

Czech translation guideline (per project memory): keep English diving loanwords. "M-value" stays as "M-value" or "M-hodnota" (whatever the existing `m-values.html` already uses — verify and match). Avoid coining calques.

## 10. Technical details

- Pure ES module, no build step.
- Single HTML file with inline `<script type="module">`.
- Imports from `js/tissueCompartments.js`:
  - `COMPARTMENTS`, `setZHL16Variant`, `ZHL16_VARIANTS`, `getRateConstant` (if needed).
- Imports from `js/decoModel.js`:
  - `getMValue` (`a + P_amb / b`).
- Local helper functions (defined in the page):
  - `computeAFromHalfTime(halfTime)` → returns `2 * Math.pow(halfTime, -1/3)`.
  - `computeBFromHalfTime(halfTime)` → returns `1.005 - Math.pow(halfTime, -0.5)`.
  - `findCompartmentByHalfTime(halfTime, variant)` → returns nearest standard compartment object or null when between standards (within tolerance).
- Chart sample density: ~120 points along x for smooth curves (matches Schreiner).
- Log-scale axis for bottom chart's t½ axis: `Math.log10(t½)` mapping.

## 11. Service worker & versioning

- Add `'./sandbox/m-values.html'` to `STATIC_ASSETS` in `sw.js`.
- Bump `CACHE_NAME` in `sw.js`.
- Bump `.version-number::after` in `css/styles.css`.

## 12. Wiki updates

- `wiki/Model-04-M-Values.md`: add a "See also" cross-link to the new sandbox at the bottom (or under the relevant section).
- `wiki/Model-01-Compartments.md`: add a "See also" cross-link to the new sandbox under the "Bühlmann a/b — where they come from" section (the bottom playground demonstrates this section visually).
- `wiki/Module-Reference.md`: list the new sandbox file in the sandbox section.
- No new wiki page needed — the prose already exists.

## 13. Smoke testing

Following Haldane/Schreiner pattern, a Playwright Python script lives at `.claude-scratch/mvalues_smoke.py` (gitignored). Test layers grow with each implementation task:

- **Skeleton:** page loads, h1 contains "M-value", nav link present, no console errors.
- **Top playground inputs:** depth/compartment/variant produce expected `a`, `P_amb`, `b`, `M` values.
- **Top chart:** marker position moves with depth; "All 16" toggle changes line count.
- **Bottom playground:** t½ slider updates `a(t½)` and `b(t½)` per analytical formulas.
- **Sync:** compartment in top → highlights dot in bottom. t½ slider snapped to standard → updates top compartment.
- **Variant toggle (global):** changing variant re-renders both playgrounds; ZH-L16C dots for TC5–15 lift off the red curve in bottom.

Test runs against `python scripts/with_server.py --server "python -m http.server 5599" --port 5599 -- python .claude-scratch/mvalues_smoke.py` (using the `webapp-testing` skill's helper).

## 14. Implementation phases (preview for the plan)

Anticipated 7-task plan along the lines of:

1. Skeleton page + nav + sw + i18n stub + smoke test infra.
2. Top playground inputs + formula display + 4 term cards (no chart).
3. Top playground chart, "This compartment" view (1 line + 2 faint variants + marker).
4. Top playground "All 16" view toggle.
5. Bottom playground inputs + formulas + 3 term cards (no chart).
6. Bottom playground chart with curves and overlay dots.
7. Cross-playground sync + cross-links + wiki updates + version bump.

The detailed plan lives in a separate `docs/superpowers/plans/` document, written via the `writing-plans` skill after this spec is approved.

## 15. Open questions (none currently)

All major design choices have been resolved during brainstorming. Items left to writing-plans:

- Exact CSS class names and styles (reuse from Haldane/Schreiner).
- Decision between dual-y-axis overlay vs stacked panels for bottom chart (implementer's call given UI feedback).
- Specific i18n string wording (en lemma is in this spec; translations refined during implementation).

---

**End of spec.**
