## Running the suite

```bash
npm test
```

Runs `node tests/run-tests.mjs`. No external test framework — `tests/run-tests.mjs` implements `describe`/`test`/`expect` inline (lines 10–140) with matchers `.toBe`, `.toEqual`, `.toBeCloseTo`, `.toBeGreaterThan`, `.toBeLessThan`, `.toHaveProperty`, `.toHaveLength`, `.toBeDefined`. Output is one line per test, then a pass/fail summary.

**208 tests pass in under 5 seconds.** The Jest configuration in `package.json` is vestigial — `test:jest` and `test:watch` still work but are not the canonical runner; the CI gate is `npm test`.

`npm test` is required to pass before every commit per `CLAUDE.md`.

## Test files

### `tests/decoModel.test.js` (~1300 lines, ~105 tests)

The algorithm suite. Directly imports from `js/decoModel.js` and `js/tissueCompartments.js`.

- **Constants & pressure.** Checks `SURFACE_PRESSURE`, `WATER_VAPOR_PRESSURE`, `N2_FRACTION`, `PRESSURE_PER_METER`, `getAmbientPressure`, `getAlveolarN2Pressure`.
- **Haldane and Schreiner equations.** Verifies the closed-form output at known half-times (1, 5, 10, 20 min) and compares Schreiner against a time-stepped Haldane reference.
- **M-values, ceilings, GF interpolation.** Exercises `getMValue`, `getAdjustedMValue`, `getCompartmentCeiling`, `getDiveCeiling`, `interpolateGF`, and the `calculateInstantGF`/`calculateMaxGF` pair.
- **GF-low anchor and first stop.** Covers `findGFLowAnchor` and `findFirstStopWithRampedGF` across a range of depths and GF settings, including edge cases where pAnchor coincides with a 3 m grid depth.
- **Deco schedule.** Full `generateDecoSchedule` runs for air, EAN50, and O₂ deco; asserts stop count, per-stop time bounds, total-deco bounds, and the `DecoCapExceededError` path.
- **Tissue loading end-to-end.** `calculateTissueLoading` on simple profiles; verifies monotonicity on descent, exponential shape, and surface equilibration.
- **Variant switching.** `setZHL16Variant('A'|'B'|'C')` followed by re-checking a reference dive.

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

### `tests/decotengu-comparison.test.mjs` (~180 lines)

The cross-implementation comparison script. Runs as part of `npm test` (included by `run-tests.mjs`) but also runnable standalone: `node tests/decotengu-comparison.test.mjs`.

Procedural style rather than describe/test — loops over every scenario in `tests/decotengu-reference.json`, reports pass/fail counts, and exits non-zero on regression.

### `tests/gasSwitchTime-zero-regression.test.mjs` (~130 lines)

Pinned regression: passing `{gasSwitchTime: 0}` to `generateDecoSchedule` must produce byte-identical schedules to the baseline captured before the `gasSwitchTime` feature was added. Baseline file: `tests/decojs-baseline.json`. Tolerance is 0 — exact match required across all 3900 scenarios.

## decotengu cross-check

This is the primary numerical-correctness evidence for the DecoJS algorithm.

**Reference data.** `tests/decotengu-reference.json` holds 3900 pre-generated deco scenarios produced by decotengu v0.14.1 (see [References](References.md#41-decotengu-primary-reference-implementation)). Reference data is regenerated with `python3 scripts/generate_decotengu_reference.py > tests/decotengu-reference.json`.

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

- **UI components.** No render or interaction tests for `DiveSetupEditor`, `DiveProfileChart`, `MValueChart`, or `GFChart`. Chart.js output is not asserted.
- **i18n.** No tests for translation loading, `data-i18n` substitution, or the `languagechange` event fan-out to components.
- **Keyboard shortcuts.** `MValueChart` and `GFChart` expose arrow-key / space / home / end playback; none of this is tested.
- **Helium.** `COMPARTMENTS` carries He coefficients but the algorithm lumps He into N₂ via `n2Fraction`. Full trimix (separate He kinetics) is not implemented and not tested. Gas definitions accept `he > 0` but no decotengu-reference scenarios exercise it.
- **SAC / gas consumption edge cases.** `computeGasConsumption` has basic coverage but not realistic multi-dive or bail-out scenarios.
- **Altitude / salinity.** `DEFAULT_ENVIRONMENT` in `chartTypes.js` exists but the algorithm uses fixed `SURFACE_PRESSURE = 1.01325`; altitude adjustment is not tested because it is not implemented.

Cross-link: see the individual algorithm chapters ([Algo-02-NDL-Calculation](Algo-02-NDL-Calculation.md), [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md), [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md), [Algo-05-Multi-Gas-Switching](Algo-05-Multi-Gas-Switching.md)) for which algorithm each test file exercises.
