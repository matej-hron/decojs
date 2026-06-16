# decotengu Repetitive-Engine Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the DecoJS repetitive-dive engine (surface-interval off-gassing, pre-saturated deco, multi-dive chaining) against decotengu 0.14.1 via a checked-in reference dataset and a standalone comparison script.

**Architecture:** A Python generator drives decotengu's low-level stepping to emit reference JSON in three sections (off-gas seam, seeded-deco seam, full trips). A standalone Node script replays each section against our engine and reports per-section agreement, exiting non-zero on any out-of-tolerance scenario. Mirrors the existing single-dive decotengu harness; NOT wired into `npm test`.

**Tech Stack:** Python 3 + decotengu 0.14.1 (ZH_L16C_GF); Node ES modules; our `js/decoModel.js`, `js/diveSetup.js`, `js/tripPlanner.js`, `js/tissueCompartments.js`.

**Spec:** `docs/superpowers/specs/2026-06-16-decotengu-repetitive-validation-design.md`
**Branch:** `feat/decotengu-repetitive-validation` (already created, stacked on `feat/ndl-locked-dives`).

> **All code in this plan has been verified end-to-end against the installed decotengu 0.14.1.** The seeded computation matches `engine.calculate` exactly for a surface seed; the JS side matches decotengu exactly on the spot-checked Seam-B (85=85) and trip ([46,85]=[46,85]) cases; the off-gas seam agrees to ~6.7e-4 bar.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/generate_decotengu_repetitive_reference.py` | Python generator: decotengu helpers + 3 section generators + a self-check that guards against decotengu API drift. Prints JSON to stdout. |
| `tests/decotengu-repetitive-reference.json` | Checked-in reference data (the generator's output). |
| `tests/decotengu-repetitive-comparison.test.mjs` | Standalone Node comparison: loads JSON, runs our engine for all 3 sections, prints stats, exits non-zero on failure. |
| `wiki/Validation-and-Testing.md` | Document the harness (coverage, regenerate + run commands, observed agreement). |

---

## Task 1: Python generator + reference JSON

**Files:**
- Create: `scripts/generate_decotengu_repetitive_reference.py`
- Create (generated): `tests/decotengu-repetitive-reference.json`

- [ ] **Step 1: Write the generator script**

Create `scripts/generate_decotengu_repetitive_reference.py` with EXACTLY this content (verified working against decotengu 0.14.1):

```python
"""
Generate reference data from decotengu 0.14.1 (ZH-L16C) to validate the DecoJS
repetitive-dive engine: surface-interval off-gassing, deco from a pre-saturated
state, and full multi-dive chaining.

Sections:
  seamA_offgas     - tissue N2 pressures after a surface interval (model.load at depth 0)
  seamB_seededDeco - total deco from a pre-saturated surface tissue state
  trips            - per-dive total deco for a continuous multi-dive profile

decotengu's high-level Engine.calculate() always resets to surface saturation, so the
seeded/continuous paths drive the low-level stepping (_step_start/_step_next_descent/
_step_next/_dive_ascent), which carry an arbitrary starting tissue state.

Regenerate:
  python3 scripts/generate_decotengu_repetitive_reference.py > tests/decotengu-repetitive-reference.json
"""

import json
from decotengu import create
from decotengu.model import ZH_L16C_GF, Data

AIR = [(0, 21)]            # (gas switch depth, O2 %)
DEPTHS = [30, 40, 50]
SIS = [30, 60, 120, 240]   # surface intervals (min)
GFS = [(100, 100), (40, 85)]


def make_engine(gf_low, gf_high, gases=AIR):
    e = create()
    e.model = ZH_L16C_GF()
    e.model.gf_low = gf_low / 100.0
    e.model.gf_high = gf_high / 100.0
    for d, o2 in gases:
        e.add_gas(d, o2)
    return e


def surface_seed(e):
    """Surface-saturated tissue tuple (((n2, he), ...))."""
    return e.model.init(e.surface_pressure).tissues


def offgas(e, tissues, minutes):
    """Load a surface segment (depth 0) for `minutes` on bottom gas; return new tissue tuple."""
    gas = e._gas_list[0]
    data = Data(tuple(tissues), e.model.gf_low)
    return e.model.load(e._to_pressure(0), minutes, gas, 0, data).tissues


def deco_from_seed(e, seed_tissues, depth, bottom_time):
    """Descend from a surface seed, hold bottom time, run the deco ascent.

    `bottom_time` is measured from the start of the dive and includes descent
    (matching DecoJS bottomTime semantics). Returns (total_deco, stops, surfacing_tissues).
    """
    gas = e._gas_list[0]
    start = e._step_start(e._to_pressure(0), gas)
    start = start._replace(data=start.data._replace(tissues=tuple(seed_tissues)))
    descent_time = depth / e.descent_rate          # descent_rate = 20 m/min
    bottom = e._step_next_descent(start, descent_time, gas)
    bottom = e._step_next(bottom, bottom_time - descent_time, gas)
    deco_gas_list = sorted(e._gas_list[1:], key=lambda g: g.depth, reverse=True)
    deco_gas_list.insert(0, gas)
    del e.deco_table[:]
    ascent = list(e._dive_ascent(bottom, deco_gas_list))
    stops = [{"depth": s.depth, "time": s.time} for s in e.deco_table]
    surfacing = ascent[-1].data.tissues
    return e.deco_table.total, stops, surfacing


def n2(tissues):
    """Per-compartment N2 partial pressures (he implied 0 for air)."""
    return [t[0] for t in tissues]


def self_check():
    """Seeded-from-surface deco MUST equal Engine.calculate (guards against API drift)."""
    e = make_engine(100, 100)
    total, _, _ = deco_from_seed(e, surface_seed(e), 40, 30)
    e2 = make_engine(100, 100)
    list(e2.calculate(40, 30))
    assert abs(total - e2.deco_table.total) < 1e-9, (total, e2.deco_table.total)


def gen_seamA():
    rows = []
    for depth in DEPTHS:
        for bt in (depth, depth + 15):     # two dive lengths -> realistic loaded states
            e = make_engine(100, 100)
            _, _, loaded = deco_from_seed(e, surface_seed(e), depth, bt)
            for gap in SIS:
                rows.append({
                    "startTissuesN2": n2(loaded),
                    "gapMin": gap,
                    "expectedTissuesN2": n2(offgas(e, loaded, gap)),
                })
    return rows


def gen_seamB():
    rows = []
    for gl, gh in GFS:
        for depth in DEPTHS:
            e = make_engine(gl, gh)
            _, _, surf1 = deco_from_seed(e, surface_seed(e), depth, depth + 10)
            seed = offgas(e, surf1, 60)
            bt = depth + 10
            total, stops, _ = deco_from_seed(e, seed, depth, bt)
            if total <= 0:
                continue
            rows.append({
                "seedTissuesN2": n2(seed),
                "depth": depth, "bottomTime": bt,
                "gfLow": gl, "gfHigh": gh,
                "totalDeco": total, "stops": stops,
            })
    return rows


def gen_trips():
    trip_defs = []
    # 2-dive trips across depth x SI x GF
    for gl, gh in GFS:
        for depth in DEPTHS:
            for si in SIS:
                trip_defs.append((gl, gh, [(depth, depth + 10, None), (depth, depth + 10, si)]))
    # a few 3-dive trips (descending depth profile across the day)
    for gl, gh in GFS:
        trip_defs.append((gl, gh, [(40, 30, None), (30, 35, 90), (20, 45, 120)]))

    rows = []
    for gl, gh, dives in trip_defs:
        e = make_engine(gl, gh)
        seed = surface_seed(e)
        per_dive = []
        for depth, bt, si in dives:
            if si is not None:
                seed = offgas(e, seed, si)
            total, _, surf = deco_from_seed(e, seed, depth, bt)
            per_dive.append(total)
            seed = surf
        rows.append({
            "gfLow": gl, "gfHigh": gh,
            "dives": [{"depth": d, "bottomTime": b, "siBeforeMin": s} for d, b, s in dives],
            "perDiveDeco": per_dive,
        })
    return rows


def main():
    self_check()
    output = {
        "generator": "decotengu 0.14.1",
        "model": "ZH-L16C",
        "surfacePressure": 1.01325,
        "n2Fraction": 0.79,
        "note": "Reference for DecoJS repetitive-engine validation. "
                "N2 partial pressures in bar; deco times in minutes. "
                "bottomTime includes descent (from dive start).",
        "seamA_offgas": gen_seamA(),
        "seamB_seededDeco": gen_seamB(),
        "trips": gen_trips(),
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the generator and confirm it produces all three sections**

Run: `python3 scripts/generate_decotengu_repetitive_reference.py > tests/decotengu-repetitive-reference.json && python3 -c "import json; d=json.load(open('tests/decotengu-repetitive-reference.json')); print('seamA', len(d['seamA_offgas']), 'seamB', len(d['seamB_seededDeco']), 'trips', len(d['trips']))"`

Expected: prints `seamA 24 seamB 6 trips 26` (the `self_check()` assertion passing is implicit — if decotengu's API had drifted, the script would have raised `AssertionError` and produced no file). Counts may shift slightly if any seamB row hits 0 deco and is skipped; any non-zero counts in all three sections are acceptable.

- [ ] **Step 3: Spot-check a trip row by eye**

Run: `python3 -c "import json; d=json.load(open('tests/decotengu-repetitive-reference.json')); t=[x for x in d['trips'] if x['gfLow']==100 and len(x['dives'])==2 and x['dives'][0]['depth']==40][0]; print(t['dives'], t['perDiveDeco'])"`

Expected: a 2-dive 40 m trip where `perDiveDeco[1] > perDiveDeco[0]` for the shorter surface intervals (the second dive is pre-saturated, so it carries more deco). Confirm the second value exceeds the first for at least the SI=30/60 cases.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_decotengu_repetitive_reference.py tests/decotengu-repetitive-reference.json
git commit -m "test(decotengu): generate repetitive-engine reference data

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: JS comparison test (all three sections)

**Files:**
- Create: `tests/decotengu-repetitive-comparison.test.mjs`

This is a standalone script (like `tests/decotengu-comparison.test.mjs`), NOT part of `npm test`. Its "test" is running it and observing agreement; it exits non-zero if any scenario is out of tolerance.

- [ ] **Step 1: Write the comparison script**

Create `tests/decotengu-repetitive-comparison.test.mjs` with EXACTLY this content (verified: Seam-B and trip spot-checks matched decotengu exactly; off-gas agrees to ~6.7e-4 bar):

```javascript
/**
 * Repetitive-engine validation: DecoJS vs decotengu 0.14.1 (ZH-L16C).
 *
 * Standalone — NOT part of `npm test`.
 *   Run:        node tests/decotengu-repetitive-comparison.test.mjs
 *   Regenerate: python3 scripts/generate_decotengu_repetitive_reference.py > tests/decotengu-repetitive-reference.json
 *
 * Three sections, each a report + gate:
 *   seamA — surface-interval off-gassing: simulateDepthTime(.,0,gap,0.79) vs decotengu model.load.
 *           Tight per-compartment N2 tolerance (0.001 bar).
 *   seamB — deco from a pre-saturated seed: generateDecoProfile(initialTissuePressures) vs
 *           decotengu seeded ascent. Tolerance max(5, 20%) min.
 *   trips — per-dive total deco for a multi-dive trip: planTrip vs decotengu run continuously.
 *           Tolerance max(5, 20%) min. Looser because dive1's ±1-min stop rounding propagates
 *           into later dives' seeds.
 *
 * Air is modelled as o2:0.21/n2:0.79 on our side to match decotengu (as the single-dive
 * comparison does). Safety stop is disabled so totals are apples-to-apples (decotengu has none).
 */

import { readFileSync } from 'fs';
import { COMPARTMENTS, setZHL16Variant, ZHL16_VARIANTS } from '../js/tissueCompartments.js';
import { simulateDepthTime } from '../js/decoModel.js';
import { generateDecoProfile } from '../js/diveSetup.js';
import { planTrip } from '../js/tripPlanner.js';

setZHL16Variant(ZHL16_VARIANTS.C);

const ref = JSON.parse(readFileSync(new URL('./decotengu-repetitive-reference.json', import.meta.url)));
const AIR = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }];
const N2 = 0.79;
const TOL_OFFGAS = 0.001;                       // bar, per compartment
const decoTol = (refMin) => Math.max(5, refMin * 0.20);

if (COMPARTMENTS.length !== 16) {
    console.error(`Expected 16 compartments, got ${COMPARTMENTS.length}`);
    process.exit(1);
}

// Build a tissue dict { compartmentId: n2Pressure } from a decotengu N2 vector (index-aligned).
const tissueDict = (n2Vec) => {
    const t = {};
    COMPARTMENTS.forEach((c, i) => { t[c.id] = n2Vec[i]; });
    return t;
};

const stats = (diffs) => {
    const abs = diffs.map(Math.abs).sort((a, b) => a - b);
    const mean = abs.reduce((a, b) => a + b, 0) / (abs.length || 1);
    return {
        mean, median: abs[Math.floor(abs.length / 2)] ?? 0,
        p95: abs[Math.floor(abs.length * 0.95)] ?? 0,
        max: abs[abs.length - 1] ?? 0,
        exact: diffs.filter(d => d === 0).length,
    };
};

let anyFail = false;
console.log('='.repeat(70));
console.log('DecoJS vs decotengu — REPETITIVE engine validation (ZH-L16C)');
console.log(`Reference: ${ref.generator}`);
console.log('='.repeat(70));

// ---------------------------------------------------------------------------
// Seam A — surface-interval off-gassing
// ---------------------------------------------------------------------------
{
    let fail = 0;
    let worstMax = 0;
    const worst = [];
    for (const sc of ref.seamA_offgas) {
        const out = simulateDepthTime(tissueDict(sc.startTissuesN2), 0, sc.gapMin, N2);
        let scMax = 0;
        COMPARTMENTS.forEach((c, i) => {
            const d = Math.abs(out[c.id] - sc.expectedTissuesN2[i]);
            if (d > scMax) scMax = d;
        });
        if (scMax > worstMax) worstMax = scMax;
        if (scMax > TOL_OFFGAS) { fail++; worst.push({ gap: sc.gapMin, max: scMax }); }
    }
    anyFail = anyFail || fail > 0;
    console.log(`\nSeam A (off-gas)  scenarios: ${ref.seamA_offgas.length}`);
    console.log(`  Tolerance: ${TOL_OFFGAS} bar/compartment`);
    console.log(`  Max abs diff: ${worstMax.toExponential(2)} bar`);
    console.log(`  ${fail === 0 ? '✅ all within tolerance' : `❌ ${fail} over tolerance`}`);
    worst.slice(0, 10).forEach(w => console.log(`    gap ${w.gap}min: max ${w.max.toExponential(2)} bar`));
}

// ---------------------------------------------------------------------------
// Seam B — deco from a pre-saturated seed
// ---------------------------------------------------------------------------
{
    let fail = 0;
    const diffs = [];
    const failures = [];
    for (const sc of ref.seamB_seededDeco) {
        const profile = generateDecoProfile(
            sc.depth, sc.bottomTime, AIR, sc.gfLow, sc.gfHigh,
            { enabled: false },                              // no safety stop (match decotengu)
            { initialTissuePressures: tissueDict(sc.seedTissuesN2) }
        );
        const diff = profile.totalDecoTime - sc.totalDeco;
        diffs.push(diff);
        if (Math.abs(diff) > decoTol(sc.totalDeco)) {
            fail++;
            failures.push({ d: sc.depth, bt: sc.bottomTime, gf: `${sc.gfLow}/${sc.gfHigh}`,
                            ref: sc.totalDeco, ours: profile.totalDecoTime, diff });
        }
    }
    anyFail = anyFail || fail > 0;
    const s = stats(diffs);
    console.log(`\nSeam B (seeded deco)  scenarios: ${ref.seamB_seededDeco.length}`);
    console.log(`  Tolerance: max(5, 20%) min`);
    console.log(`  |diff| mean ${s.mean.toFixed(1)}  median ${s.median}  p95 ${s.p95}  max ${s.max}  exact ${s.exact}`);
    console.log(`  ${fail === 0 ? '✅ all within tolerance' : `❌ ${fail} over tolerance`}`);
    failures.slice(0, 10).forEach(f =>
        console.log(`    ${f.d}m/${f.bt}min GF${f.gf}: ref=${f.ref} ours=${f.ours} diff=${f.diff}`));
}

// ---------------------------------------------------------------------------
// Trips — per-dive total deco for a continuous multi-dive profile
// ---------------------------------------------------------------------------
{
    let fail = 0;
    const diffs = [];
    const failures = [];
    for (const sc of ref.trips) {
        // Build the dive list incrementally so the surface interval before dive k equals
        // siBeforeMin: place dive k at (planTrip on dives 0..k-1).dives[k-1].endDateTime + si.
        const dives = [];
        for (let k = 0; k < sc.dives.length; k++) {
            const def = sc.dives[k];
            let startDateTime;
            if (k === 0) {
                startDateTime = 0;
            } else {
                const partial = planTrip({ gases: AIR, gfLow: sc.gfLow, gfHigh: sc.gfHigh, dives });
                startDateTime = partial.dives[k - 1].endDateTime + def.siBeforeMin;
            }
            dives.push({ id: `d${k + 1}`, startDateTime, maxDepth: def.depth, bottomTime: def.bottomTime });
        }
        const result = planTrip({ gases: AIR, gfLow: sc.gfLow, gfHigh: sc.gfHigh, dives });
        result.dives.forEach((d, k) => {
            const refDeco = sc.perDiveDeco[k];
            const diff = d.profile.totalDecoTime - refDeco;
            diffs.push(diff);
            if (Math.abs(diff) > decoTol(refDeco)) {
                fail++;
                failures.push({ gf: `${sc.gfLow}/${sc.gfHigh}`, k, dive: sc.dives[k],
                                ref: refDeco, ours: d.profile.totalDecoTime, diff });
            }
        });
    }
    anyFail = anyFail || fail > 0;
    const s = stats(diffs);
    console.log(`\nTrips (end-to-end)  dive comparisons: ${diffs.length}`);
    console.log(`  Tolerance: max(5, 20%) min`);
    console.log(`  |diff| mean ${s.mean.toFixed(1)}  median ${s.median}  p95 ${s.p95}  max ${s.max}  exact ${s.exact}`);
    console.log(`  ${fail === 0 ? '✅ all within tolerance' : `❌ ${fail} over tolerance`}`);
    failures.slice(0, 10).forEach(f =>
        console.log(`    GF${f.gf} dive${f.k + 1} ${f.dive.depth}m/${f.dive.bottomTime}min ` +
                    `SI${f.dive.siBeforeMin}: ref=${f.ref} ours=${f.ours} diff=${f.diff}`));
}

console.log('\n' + '='.repeat(70));
if (anyFail) {
    console.log('❌ One or more sections had scenarios outside tolerance');
    process.exit(1);
} else {
    console.log('✅ All sections within tolerance');
}
```

- [ ] **Step 2: Run the comparison**

Run: `node tests/decotengu-repetitive-comparison.test.mjs`

Expected: all three sections print `✅ ... within tolerance`, the final line is `✅ All sections within tolerance`, and the process exits 0. Seam A max abs diff should be on the order of `~7e-04 bar`; Seam B and Trips should show small mean |diff| (≤ ~2 min) with no failures. If any section fails, STOP — do not loosen tolerances to force a pass; report the failing scenarios (they indicate a real divergence to investigate).

- [ ] **Step 3: Confirm exit code**

Run: `node tests/decotengu-repetitive-comparison.test.mjs > /dev/null 2>&1; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add tests/decotengu-repetitive-comparison.test.mjs
git commit -m "test(decotengu): repetitive-engine comparison script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wiki documentation

**Files:**
- Modify: `wiki/Validation-and-Testing.md`

- [ ] **Step 1: Capture the observed agreement**

Run: `node tests/decotengu-repetitive-comparison.test.mjs` and copy the three section summary lines (Seam A max diff; Seam B and Trips mean/max |diff|) for the wiki.

- [ ] **Step 2: Add a section to the wiki**

In `wiki/Validation-and-Testing.md`, read the existing decotengu section first (search for "decotengu") to match the page's formatting. Add a new subsection documenting the repetitive harness. Include:
- What it validates: surface-interval off-gassing (Seam A), deco from a pre-saturated state (Seam B), and full multi-dive chaining via `planTrip` (Trips).
- That it is a **standalone** script (not part of `npm test`), mirroring the single-dive decotengu comparison.
- Regenerate command: `python3 scripts/generate_decotengu_repetitive_reference.py > tests/decotengu-repetitive-reference.json`
- Run command: `node tests/decotengu-repetitive-comparison.test.mjs`
- Tolerances: 0.001 bar/compartment for off-gas; `max(5 min, 20%)` for seeded deco and trips, with a note that dive1's ±1-min stop rounding propagates into later dives' seeds (so end-to-end is looser than the seams).
- The observed agreement numbers captured in Step 1.

- [ ] **Step 3: Commit**

```bash
git add wiki/Validation-and-Testing.md
git commit -m "docs(wiki): document repetitive decotengu validation harness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Note:** The `wiki/` dir mirrors a separate `decojs.wiki.git` remote and is NOT pushed automatically. Defer the wiki push until the branch stack is merged (handled separately).

---

## Self-Review

**Spec coverage:**
- Reference JSON shape (3 sections) → Task 1 generator. ✓
- Seam A off-gas (model.load vs simulateDepthTime, 0.001 bar) → Task 1 `gen_seamA` + Task 2 Seam A loop. ✓
- Seam B seeded deco (deco_from_seed vs generateDecoProfile initialTissuePressures, max(5,20%)) → Task 1 `gen_seamB` + Task 2 Seam B loop. ✓
- Trips end-to-end (continuous decotengu vs planTrip, max(5,20%)) → Task 1 `gen_trips` + Task 2 Trips loop. ✓
- `startDateTime` construction from `siBeforeMin` (incremental option 2) → Task 2 Trips loop. ✓
- Mirror standalone harness, not in `npm test` → both scripts standalone. ✓
- decotengu low-level signatures pinned → all baked into Task 1 (verified). ✓
- No `js/` changes / no version bump → confirmed (only scripts/tests/wiki). ✓
- Wiki `Validation-and-Testing.md` → Task 3. ✓

**Placeholder scan:** No TBD/TODO. Every code step contains complete, verified code. Step counts in Task 1 Step 2 (`seamA 24 seamB 6 trips 26`) are the actual generator output for the grids defined in the script (DEPTHS×2×SIS = 3×2×4 = 24 seam A; GFS×DEPTHS = 2×3 = 6 seam B; 2-dive 2×3×4=24 + two 3-dive = 26 trips), noted as approximate in case a seamB row hits 0 deco.

**Type/name consistency:** `tissueDict` builds `{ compartmentId: n2 }` matching `simulateDepthTime` / `initialTissuePressures` input. `generateDecoProfile(depth, bottomTime, gases, gfLow, gfHigh, safetyStop, options)` arg order matches `tripPlanner.js` usage; `{ enabled: false }` is the safetyStop arg and `{ initialTissuePressures }` the options arg. Reference field names (`startTissuesN2`, `expectedTissuesN2`, `seedTissuesN2`, `totalDeco`, `perDiveDeco`, `siBeforeMin`) are identical between the generator's emitted JSON and the JS test's reads. `deco_from_seed` / `offgas` / `surface_seed` names match between definition and use.
