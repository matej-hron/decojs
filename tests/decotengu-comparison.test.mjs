/**
 * Comparison test: DecoJS vs decotengu 0.14.1 (ZH-L16C)
 *
 * 3900 pre-generated deco scenarios across:
 *   - 16 depths (15m–60m, step 3m)
 *   - 10 bottom times per depth (NDL+3 to NDL+30, step 3min)
 *   - 4 gas configs (air, air+EAN50, air+O2, air+EAN50+O2)
 *   - 7 GF presets (Bühlmann 100/100 through Deco Planner 20/80)
 *
 * Known implementation differences (both are correct Bühlmann ZH-L16C):
 *
 *   1. SURFACE PRESSURE — we use 1.0 bar, decotengu uses 1.01325 bar (1 atm).
 *      This means decotengu starts with ~0.01 bar more N2 in tissues, producing
 *      slightly more deco obligation. This is the primary source of bias:
 *      we give on average 0.26 min less deco across all 3900 scenarios.
 *
 *   2. DESCENT TIME — we use ceil(depth/20) (whole minutes), decotengu uses
 *      exact depth/20. At 45m: we get 3 min descent (7 min at depth), decotengu
 *      gets 2.25 min (7.75 min at depth). More time at depth = more loading.
 *      This compounds with low GF Low (20–30%) where the first stop is deep
 *      and each extra minute of loading can add multiple deep stops.
 *
 *   3. STOP ROUNDING — both round to 1-minute stops, but the continuous ceiling
 *      crossing can land on different sides of a minute boundary. Accounts for
 *      ±1 min per stop.
 *
 * These differences are well-characterized:
 *   - 56% of scenarios match exactly (0 min diff)
 *   - Mean |diff|: 0.6 min, median: 0 min, P95: 2 min, max: 5 min
 *   - We give less deco in 31% of cases (surface pressure + descent rounding)
 *   - We give more deco in 13% of cases (stop rounding going the other way)
 *   - Largest outliers are GF 20/80 with deco gases at short bottom times
 *     (just past NDL boundary where small loading differences flip deep stops)
 *
 * Tolerance: max(5 min, 20% of reference total deco time)
 *   - 5 min floor covers rounding + surface pressure + descent time drift,
 *     especially for short deco with low GF Low where deep stop thresholds
 *     are sensitive to small loading differences
 *   - 20% scales for longer deco where parameter differences compound
 *
 * Regenerate reference: python3 scripts/generate_decotengu_reference.py > tests/decotengu-reference.json
 */

import { readFileSync } from 'fs';
import { COMPARTMENTS, setZHL16Variant, ZHL16_VARIANTS } from '../js/tissueCompartments.js';
import {
    simulateDepthChange,
    simulateDepthTime,
    generateDecoSchedule,
    getInitialTissueN2,
} from '../js/decoModel.js';

// ============================================================================
// Load reference data
// ============================================================================

const reference = JSON.parse(readFileSync(new URL('./decotengu-reference.json', import.meta.url)));
const scenarios = reference.scenarios;

// ============================================================================
// Gas config mapping (decotengu format → our format)
// ============================================================================

const GAS_CONFIGS = {
    'air': [
        { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
    ],
    'air+ean50': [
        { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
        { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50 },
    ],
    'air+o2': [
        { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
        { id: 'o2', name: 'O2', o2: 1.0, n2: 0.0 },
    ],
    'air+ean50+o2': [
        { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
        { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50 },
        { id: 'o2', name: 'O2', o2: 1.0, n2: 0.0 },
    ],
};

// ============================================================================
// Simulate dive and get deco schedule
// ============================================================================

function getOurDecoSchedule(depth, bottomTime, gases, gfLow, gfHigh) {
    const bottomGas = gases[0];
    const initialN2 = getInitialTissueN2(bottomGas.n2);
    let tissues = {};
    COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });

    const descentTime = Math.ceil(depth / 20);
    tissues = simulateDepthChange(tissues, 0, depth, descentTime, bottomGas.n2);

    const actualBottom = bottomTime - descentTime;
    if (actualBottom > 0) {
        tissues = simulateDepthTime(tissues, depth, actualBottom, bottomGas.n2);
    }

    const schedule = generateDecoSchedule(
        tissues, depth, bottomGas.n2,
        gfLow / 100, gfHigh / 100,
        gases
    );

    return {
        stops: schedule.stops,
        totalDeco: schedule.stops.reduce((sum, s) => sum + s.time, 0),
    };
}

// ============================================================================
// Run comparison
// ============================================================================

setZHL16Variant(ZHL16_VARIANTS.C);

let passed = 0;
let failed = 0;
const failures = [];
const allDiffs = [];

for (const sc of scenarios) {
    const gases = GAS_CONFIGS[sc.gasConfig];
    if (!gases) continue;

    const ours = getOurDecoSchedule(sc.depth, sc.bottomTime, gases, sc.gfLow, sc.gfHigh);
    const ref = sc.totalDeco;
    const tolerance = Math.max(5, ref * 0.20);
    const diff = ours.totalDeco - ref;
    const absDiff = Math.abs(diff);

    allDiffs.push(diff);

    if (absDiff <= tolerance) {
        passed++;
    } else {
        failed++;
        failures.push({
            depth: sc.depth, bt: sc.bottomTime, gas: sc.gasConfig,
            gf: `${sc.gfLow}/${sc.gfHigh}`, ref, ours: ours.totalDeco,
            diff: absDiff, tolerance: tolerance.toFixed(1),
        });
    }
}

// ============================================================================
// Report
// ============================================================================

const total = passed + failed;
const absDiffs = allDiffs.map(Math.abs).sort((a, b) => a - b);

console.log('='.repeat(70));
console.log('DecoJS vs decotengu comparison (ZH-L16C)');
console.log(`Reference: ${reference.generator} | Scenarios: ${total}`);
console.log(`Tolerance: max(5 min, 20% of reference)`);
console.log('='.repeat(70));
console.log();
console.log(`Passed:       ${passed}/${total} (${(passed/total*100).toFixed(1)}%)`);
console.log(`Failed:       ${failed}`);
console.log();
console.log('Difference statistics (ours − decotengu):');
console.log(`  Mean |diff|:  ${(absDiffs.reduce((a,b) => a+b, 0) / absDiffs.length).toFixed(1)} min`);
console.log(`  Median:       ${absDiffs[Math.floor(absDiffs.length / 2)]} min`);
console.log(`  P95:          ${absDiffs[Math.floor(absDiffs.length * 0.95)]} min`);
console.log(`  Max:          ${absDiffs[absDiffs.length - 1]} min`);
console.log(`  Exact match:  ${allDiffs.filter(d => d === 0).length} (${(allDiffs.filter(d=>d===0).length/total*100).toFixed(0)}%)`);
console.log(`  We give less: ${allDiffs.filter(d => d < 0).length} (${(allDiffs.filter(d=>d<0).length/total*100).toFixed(0)}%)`);
console.log(`  We give more: ${allDiffs.filter(d => d > 0).length} (${(allDiffs.filter(d=>d>0).length/total*100).toFixed(0)}%)`);

if (failures.length > 0) {
    console.log();
    console.log(`Failures (${failures.length}):`);
    failures.sort((a, b) => b.diff - a.diff);
    for (const f of failures.slice(0, 10)) {
        console.log(`  ${f.depth}m/${f.bt}min ${f.gas} GF${f.gf}: ref=${f.ref} ours=${f.ours} diff=${f.diff} tol=${f.tolerance}`);
    }
    if (failures.length > 10) console.log(`  ... and ${failures.length - 10} more`);
}

// Exit code
if (failed > 0) {
    console.log(`\n❌ ${failed} scenario(s) outside tolerance`);
    process.exit(1);
} else {
    console.log(`\n✅ All ${total} scenarios within tolerance`);
}
