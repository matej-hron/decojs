## Running the suite

```bash
npm test
```

Runs `node tests/run-tests.mjs`. No external test framework — `tests/run-tests.mjs` implements `describe`/`test`/`expect` inline (lines 10–140) with matchers `.toBe`, `.toEqual`, `.toBeCloseTo`, `.toBeGreaterThan`, `.toBeLessThan`, `.toHaveProperty`, `.toHaveLength`, `.toBeDefined`. Output is one line per test, then a pass/fail summary.

**577 tests pass.** The Jest configuration in `package.json` is vestigial — `test:jest` and `test:watch` still work but are not the canonical runner; the CI gate is `npm test`, run on every pull request by `.github/workflows/ci.yml`.

`npm test` is required to pass before every commit per `CLAUDE.md`.

## Test files

### `tests/decoModel.test.js` (~1300 lines, ~105 tests)

The algorithm suite. Directly imports from `js/decoModel.js` and `js/tissueCompartments.js`.

- **Constants & pressure.** Checks `SURFACE_PRESSURE`, `WATER_VAPOR_PRESSURE`, `N2_FRACTION`, `PRESSURE_PER_METER`, `getAmbientPressure`, `getAlveolarN2Pressure`.
- **Haldane and Schreiner equations.** Verifies the closed-form output at known half-times (1, 5, 10, 20 min) and compares Schreiner against a time-stepped Haldane reference.
- **M-values, ceilings, GF interpolation.** Exercises `getMValue`, `getAdjustedMValue`, `getCompartmentCeiling`, `getDiveCeiling`, `interpolateGF`, and the `calculateInstantGF`/`calculateMaxGF` pair.
- **GF-low anchor and first stop.** Covers `findFirstStopAtGFLow` across a range of depths and GF settings, including edge cases where the unrounded ceiling coincides with a 3 m grid depth and where gas switches occur en route.
- **Deco schedule.** Full `generateDecoSchedule` runs for air, EAN50, and O₂ deco; asserts stop count, per-stop time bounds, total-deco bounds, and the `DecoCapExceededError` path.
- **Tissue loading end-to-end.** `calculateTissueLoading` on simple profiles; verifies monotonicity on descent, exponential shape, and surface equilibration.
- **Variant switching.** `setZHL16Variant('A'|'B'|'C')` followed by re-checking a reference dive.
- **M-values theory page.** Verifies glossary markup and locale parity across Czech, English, and Spanish, including the pressure-comparison conditions; checks the formula sandbox link and unambiguous ceiling definition; and proves the direct-ascent example violates TC3 while the safe-stop profile remains below all raw M-value limits.
- **Gradient-factors theory page.** Verifies canonical quantity symbols, GF subscripts, localized decimals, non-breaking unit spacing, and the sourced Richard Pyle/deep-stop history across Czech, English, and Spanish. The history test distinguishes personal observation, independent bubble models, gradient factors, the scope of the NEDU result, and current uncertainty. Focused source tests require the symmetric air/nitrox GF recommendation to link to Alain Foret's accessible publication of the CMAS recommendations and each supporting French, NEDU, and Belgian bullet to include its own study link. Direct CMAS URLs that return HTTP 403 are rejected. The French bullet must use the accessible NCBI/PubMed record. The Czech no-decompression heading is also checked for natural wording.
- **Gradient-factor input limits.** Requires both GF values to stay in the 10–100% range across setup validation, compact links, shared repetitive-dive trips, and both planner UIs. Manual values below the limit do not trigger a recalculation and are clamped to 10% when confirmed, preventing `0` from silently becoming `100`.
- **NDL deco-gas propagation.** Verifies that a no-decompression profile carrying EAN50 and O₂ still switches at the scheduler's MOD depths, applies configured switch time without being reclassified as decompression, preserves a longer safety stop at the same depth, retains gas-switch audit events, and feeds the changed N₂ fractions and tissue pressures into the shared chart calculation.

### `tests/diveSetup.test.js` (~650 lines, ~49 tests)

Configuration and gas management.

- **Setup loading.** `getDefaultSetup`, `extendDiveSetup`, localStorage round-trip via `saveDiveSetup`/`loadSavedSetup`.
- **Profile generation.** `generateSimpleProfile` descent/ascent rates, bottom-time semantics (measured from dive start, not depth arrival), safety stop insertion.
- **Gas helpers.** `calculateMOD`, `getGases`, `getGasAtWaypoint`, `getGasAtTime`, `getGasSwitchEvents`, `insertGasSwitchWaypoints` with 3 m MOD rounding.
- **`computeGasConsumption`.** SAC accounting at switch depths — explicitly tests that the switch-stop window bills at the bottom SAC rate, not the deco SAC rate.

### `tests/diveProfile.test.js` (~290 lines, ~29 tests)

Waypoint-array validation.

- Structure (first waypoint at surface, monotonic time, non-negative depth).
- `parseProfileInput` on tab-separated and comma-separated text.
- `calculateRates` classification into descent / ascent / level.
- `getDiveStats` maxima and totals.

### Decotengu matrices in `tests/run-tests.mjs`

The sea-level matrix also validates the practical runtime convention across all
3,900 profiles: model stop durations remain whole minutes, inter-stop ascents
use 20 seconds per 3 m, total timeline drift stays below 30 seconds, and the
re-simulated destination ceiling may differ by at most 1 cm.

The canonical suite directly checks the 3900 sea-level scenarios in
`tests/decotengu-reference.json` and 15,986 altitude scenarios in
`tests/decotengu-altitude-reference.json`. It also checks 105 scenarios split
equally across EN 13319, freshwater, and seawater in
`tests/decotengu-water-reference.json`. The reporting script remains runnable
standalone as `node tests/decotengu-comparison.test.mjs`.

The same runner also contains source-level teaching regressions for the Haldane and
Schreiner sandboxes. They verify fixed-target versus moving-target hierarchy,
the equilibrium surface start of the single basic Schreiner example, the
$R = 0$ reduction to Haldane, collapsed general and canonical algebra, and the
absence of a misleading tissue-saturation percentage. For Schreiner, they
verify both the simplified equilibrium-start form and the general sum of
initial tissue pressure, the Haldane contribution, and the moving-target
correction against `schreinerEquation()` for positive, negative, and zero
rates, multiple initial pressures, times, and half-times. They also verify the
step-by-step expansion into the canonical form while keeping calculus outside
the main teaching path.

The M-value sandbox regressions verify canonical quantity notation, direct
ambient-pressure control, a fixed 0–10 bar vertical scale, and removal of the
auxiliary $y = x$ line. In single-compartment mode the main chart must draw
exactly one line for the selected ZH-L16 variant; the all-compartments mode
must draw 16 lines from that same variant. A separate magnified panel remains
the only simultaneous A/B/C comparison and uses the existing `getMValue()`
calculation for all three values. The four quantity cards and the three
coefficient-derivation cards each collapse as one group. The generated
coefficient table must contain all 16 compartments from
`getCompartmentsForVariant()`, preserve the TC1 half-time and $b$ exception,
keep TC2–16 $b$ values identical across variants, and highlight only values
that differ from ZH-L16A. Its responsive wrapper must scroll locally without
causing document-level horizontal overflow.

The reusable M-value chart marks the current controlling compartment only
when it creates the deepest intersection with the continuous GF ramp. The
status and the selected compartment's ruler therefore use the same ceiling
definition. The selector highlight does not alter which compartments the user
selected, and the current points retain their standard appearance. When the
ceiling is clear, the chart explicitly reports that no compartment is
currently controlling decompression. If no GF ramp is created, the
intersection uses GF High. Both the status and ruler panel show the current
depth. The ruler omits the unused tissue-equals-ambient intersection.

The ruler labels its self-consistent intersection with the continuous GF ramp
explicitly, distinguishing it from the scheduler's fixed-GF check at the next
discrete stop depth.

The M-value chart can open the existing decision audit in a modal with its
Audit control or the `A` shortcut. Pressing `A` again closes it, including when
focus is inside the modal. Opening and closing the audit preserves both
fullscreen mode and the selected timeline position. Each audit row separates
compact phase, runtime, depth, and controlling-compartment columns from the
longer calculation explanation; hypothetical anchor simulations are labeled
separately and do not claim a position on the actual runtime.
Per-level departure rows show the destination and its target-depth GF, while
the controlling compartment stays in its dedicated column. They deliberately
omit the intermediate fixed-GF ceiling value so it cannot be confused with the
chart's continuous GF-ramp ceiling.

The coefficient-derivation graph labels $a$, including the upright `bar`
unit, and dimensionless $b$ directly in the SVG, positioned beside their
visible curve ends.

The pressure-page notation regressions require glossary-registered quantity
symbols in formulas (`p`, `h`, `V`, and `Δp`), the explicit initial
atmospheric-pressure subscript, and non-breaking separators in generated
volume and percentage values. They also reject language-specific prose used as
a formula variable. Dynamic MOD and narcosis exercise rows must re-render
their reveal labels, warning text, and decimal formatting after i18n
initialization and every language change. The Czech VENTID-C list retains each
original English symptom name beside its Czech explanation so the initials
remain meaningful.

The tissue-loading regressions require a content wrapper that prevents the
sticky table of contents from setting the first section's grid-row height.
They also enforce canonical localized tissue-pressure subscripts, the
registered `h`, `γ`, and `r` symbols, upright exponential `e`, non-breaking
micrometre units in the bubble canvas, and translated chart labels. The gas
pathway represents its partial-pressure gradient with four discrete stage
colors, reverses their order during off-gassing, and never paints a gradient
inside an individual anatomical stage. The bubble explanation distinguishes
gas pressure inside a bubble (`p_amb + 2γ/r`) from dissolved-gas tension in
the surrounding tissue, which determines the direction of diffusion. The
detailed bubble simulation lives in a dedicated responsive sandbox with a
larger, fixed-size canvas that is never stretched by its layout; the theory
page links to it instead of embedding the cramped visualization. Canvas formulas draw italic quantity
symbols and smaller upright localized subscripts instead of exposing code-like
underscore notation.

The transfilling sandbox regressions require locale-aware runtime formatting,
the glossary's upright `l` symbol, localized final-pressure subscripts and
result explanations, and re-rendering after a language change. Cylinder gas
content is presented as surface-equivalent volume at the explicit 1 bar
reference pressure rather than as the less intuitive `bar·l` product.

The cascade-filling sandbox follows the same convention. Its cylinder cards,
remaining supply, connection states, and structured fill log must use
locale-aware pressure and volume formatting, preserve decimal pressures, and
re-render existing log entries when the language changes.

The gas-law sandbox regressions require the glossary's upright `l` symbol,
locale-aware pressure, temperature, and volume values in generated output,
localized safety text before and after revealing the result, and re-rendering
of the hidden cylinder state when the language changes. The expanded fire
temperature scale must also suppress colliding reference labels while keeping
the current-temperature markers visible. Its collapsed model-limitations note
must identify the gauge-versus-absolute pressure difference as a small
high-pressure approximation, while giving appropriate prominence to real-gas
behaviour, thermal gradients, cylinder-volume and gauge uncertainty, and the
loss of cylinder material strength at fire temperatures.

The standard staged-mode gate also checks schedule structure, not only total
time: every emitted stop is on the 3 m grid and lasts at least one minute.
Decision-audit regressions additionally prove that enabling the trace leaves
stops, gas switches, total time, and anchor unchanged; they cover direct-ascent,
anchor-selection, and per-level events plus runtime/depth context and the
localized text renderer.
Across all 19,886 scenarios, the current implementation matches Decotengu's
exact stop-depth list in 96.1%, the complete depth/time schedule in 82.2%, and
has a mean absolute total-decompression difference of 0.13 min (maximum 3 min).

Procedural style rather than describe/test — loops over every scenario in `tests/decotengu-reference.json`, reports pass/fail counts, and exits non-zero on regression.

### `tests/gasSwitchTime-zero-regression.test.mjs` (~130 lines)

Pinned regression: passing `{gasSwitchTime: 0}` to `generateDecoSchedule` must produce byte-identical schedules to the baseline captured before the `gasSwitchTime` feature was added. Baseline file: `tests/decojs-baseline.json`. Tolerance is 0 — exact match required across all 3900 scenarios.

## decotengu cross-check

This is the primary numerical-correctness evidence for the DecoJS algorithm.

**Reference data.** `tests/decotengu-reference.json` holds 3900 pre-generated deco scenarios produced by decotengu v0.14.1 (see [References](References.md#41-decotengu-primary-reference-implementation)). Reference data is regenerated with `python3 scripts/generate_decotengu_reference.py > tests/decotengu-reference.json`.

**Altitude reference data.** `tests/decotengu-altitude-reference.json` adds 15,986
scenarios at 500, 1000, 1500, and 2500 m. Regenerate it with
`python3 scripts/generate_decotengu_altitude_reference.py >
tests/decotengu-altitude-reference.json`. Decotengu receives the absolute
`engine.surface_pressure`; the normal test run only reads the generated JSON and
does not require Python or Decotengu.

**Water-mode reference data.** `tests/decotengu-water-reference.json` adds
35 scenarios for each of the EN 13319, freshwater, and seawater modes.
Regenerate it with
`python3 scripts/generate_decotengu_water_reference.py >
tests/decotengu-water-reference.json`. DecoTengu 0.14.1 has no public water
density API, so the pinned generator deliberately overrides both copied private
conversion fields, `Engine._meter_to_bar` and `Engine._p3m`, and records that
method plus the exact factor in the JSON metadata.

**Scenario coverage.**

- **Depths:** 15 m, 18 m, 21 m, … 60 m (step 3 m, 16 values)
- **Bottom times:** NDL+3, NDL+6, … NDL+30 min (step 3 min, 10 values per depth)
- **Gas configs:** `air`, `air+EAN50`, `air+O2`, `air+EAN50+O2`
- **GF presets:** 100/100 (Bühlmann), 90/95, 80/85, 70/80, 50/80, 40/80, 30/80, 20/80 (Deco Planner-style)
- **Algorithm:** Bühlmann ZH-L16C for both sides

**Tolerances.** Per-scenario assertion is `|total_deco_diff| ≤ max(5 min, 20% of reference_total_deco)`. Per-stop tolerance is ±1 min.

These tolerances cover stop-time discretization noise — both implementations round stop times to whole minutes, and the continuous ceiling crossing can land on either side of a minute boundary, giving ±1 min per stop.

**Match statistics across all 3900 scenarios:**

| | |
|---|---|
| Pass rate | 100 % (3900/3900) |
| Exact match on total deco | 56 % (2196 scenarios) |
| Within ±2 min | 95 % (P95) |
| Mean \|diff\| | 0.6 min |
| Median \|diff\| | 0 min |
| Max \|diff\| | 5 min |
| DecoJS gives less | 41 % |
| DecoJS gives more | 3 % |

The largest residuals are concentrated at GF 20/80 (the most aggressive setting in the matrix) where stop-time discretization between the two implementations occasionally lands a stop on different minute boundaries.

Bühlmann constants (`SURFACE_PRESSURE=1.01325`, `N2_FRACTION=0.7902`, TC1 b-coefficient variant-specific) match decotengu — which itself cross-references the HeinrichsWeikamp OSTC firmware. See [References](References.md#6-zh-l16-constant-tables) for the provenance chain.

## decotengu repetitive-dive cross-check

Validates the repetitive-dive engine (surface-interval off-gassing, seeded deco, and multi-dive trip chaining) against decotengu 0.14.1. This harness is **not part of `npm test`** — run it on demand.

**Run:**

```bash
node tests/decotengu-repetitive-comparison.test.mjs
```

**Regenerate reference data:**

```bash
python3 scripts/generate_decotengu_repetitive_reference.py > tests/decotengu-repetitive-reference.json
```

### Three validation seams

**Seam A — surface-interval off-gassing.** Calls `simulateDepthTime` at depth 0 for each surface-interval duration and compares the resulting compartment pressures against decotengu's `model.load` run at surface pressure. Tolerance: 0.001 bar per compartment (compartments 2–16).

**Seam B — deco from a pre-saturated seed.** Seeds DecoJS's `generateDecoProfile` with `initialTissuePressures` taken from a preceding dive, then runs decotengu's ascent from the same saturated state. Tolerance: `max(5 min, 20%)` of reference total deco.

**Trips — multi-dive chaining end-to-end.** Chains two or three dives through `planTrip`, compares per-dive total deco against decotengu run as one continuous profile. Tolerance: `max(5 min, 20%)`.

### Model notes

**Compartment 1.** DecoJS uses the ZH-L16 "1b" first compartment (half-time 5.0 min); decotengu uses 4.0 min. This is a deliberate model choice. Compartment 1 is **excluded from the Seam A pass/fail gate** — its divergence (max ~0.012 bar) is reported as informational only.

**Scenario bottom times.** Reference scenarios use recreational/light-tech bottom times chosen so that every dive stays within DecoJS's 300-min/stop usable range. The test guards beyond-range profiles rather than crashing on them.

### Observed agreement

| Section | Metric | Value |
|---|---|---|
| Seam A | Max \|diff\| comp 2–16 | 2.22 × 10⁻¹⁶ bar (machine epsilon) |
| Seam A | Compartment 1 max \|diff\| (informational) | 1.19 × 10⁻² bar |
| Seam B | Mean \|diff\| | 0.3 min |
| Seam B | Max \|diff\| | 1 min |
| Trips | Mean \|diff\| | 0.3 min |
| Trips | Max \|diff\| | 2 min |
| Trips | Dive comparisons | 54 |

Off-gas agreement on compartments 2–16 is at floating-point machine epsilon, confirming the Schreiner equation and surface-interval logic are numerically identical to decotengu. Seeded deco and trip totals agree within 1–2 min — within the stop-discretization noise explained in the single-dive section above.

## Adding tests

Tests live in `tests/` with filenames `*.test.js` (ES modules via `import`) or `*.test.mjs`. Structure is:

```javascript
// tests/myThing.test.js
import { myFn } from '../js/decoModel.js';

describe('myFn', () => {
    test('returns the expected value at surface', () => {
        expect(myFn(0)).toBeCloseTo(1.01325, 4);
    });
});
```

For a new algorithm feature:

1. Add unit tests covering the equation at a few hand-calculated points and the equation's boundary behaviour (surface, max depth, zero time).
2. If the feature changes deco output, regenerate `tests/decojs-baseline.json` deliberately and commit the diff in a separate commit so the regression test stays meaningful.
3. If the feature could diverge from decotengu, note the divergence in `tests/decotengu-comparison.test.mjs` comment block and widen the tolerance locally for the affected scenarios rather than globally.

Bug fixes should include a regression test that fails without the fix (per `CLAUDE.md` convention).

## Test gaps

What is currently not covered — honest inventory so callers know where to be careful:

- **UI components.** `DiveSetupEditor` has narrow jsdom regressions for cylinder-volume notation, bottom/deco MOD labels, and debounced automatic profile generation. The P-P charts have focused state and interaction regressions, including timeline synchronization and the M-value intersection ruler, but no pixel-level render tests; Chart.js output is not asserted.
- **i18n.** No tests for translation loading, `data-i18n` substitution, or the `languagechange` event fan-out to components.
- **Keyboard shortcuts.** The M-value ruler's `T` shortcut and the fullscreen `F` shortcut in all three chart classes are tested. Arrow-key / space / home / end playback shortcuts are not.
- **Helium.** `COMPARTMENTS` carries He coefficients but the algorithm lumps He into N₂ via `n2Fraction`. Full trimix (separate He kinetics) is not implemented and not tested. Gas definitions accept `he > 0` but no decotengu-reference scenarios exercise it.
- **SAC / gas consumption edge cases.** `computeGasConsumption` has basic coverage but not realistic multi-dive or bail-out scenarios.
- **Water mode.** Unit tests cover the exact EN 13319, freshwater, and seawater
  factors; compatibility tests prove missing configuration remains exactly
  equivalent to the historical 0.1&nbsp;bar/m path; URL and editor tests cover
  selection and fallback; and 105 pinned DecoTengu scenarios cover schedules.

Cross-link: see the individual algorithm chapters ([Algo-02-NDL-Calculation](Algo-02-NDL-Calculation.md), [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md), [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md), [Algo-05-Multi-Gas-Switching](Algo-05-Multi-Gas-Switching.md)) for which algorithm each test file exercises.
