/**
 * Regression test: gasSwitchTime=0 must produce identical output to baseline.
 *
 * The baseline (tests/decojs-baseline.json) was generated BEFORE the gasSwitchTime
 * feature was added, using generateDecoSchedule with no options. This test verifies
 * that explicitly passing { gasSwitchTime: 0 } produces the exact same totalDeco
 * and stop schedule for all 3900 scenarios.
 *
 * Tolerance: 0 (exact match required).
 *
 * Usage: node tests/gasSwitchTime-zero-regression.test.mjs
 */

import { readFileSync } from 'fs';
import { COMPARTMENTS, setZHL16Variant, ZHL16_VARIANTS } from '../js/tissueCompartments.js';
import {
    simulateDepthChange,
    simulateDepthTime,
    generateDecoSchedule,
    getInitialTissueN2,
} from '../js/decoModel.js';

// Load reference scenarios and baseline
const reference = JSON.parse(readFileSync(new URL('./decotengu-reference.json', import.meta.url)));
const baseline = JSON.parse(readFileSync(new URL('./decojs-baseline.json', import.meta.url)));
const scenarios = reference.scenarios;

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

setZHL16Variant(ZHL16_VARIANTS.C);

// Build baseline lookup by key
const baselineByKey = new Map();
for (const r of baseline.results) {
    const key = `${r.depth}|${r.bottomTime}|${r.gasConfig}|${r.gfLow}|${r.gfHigh}`;
    baselineByKey.set(key, r);
}

let passed = 0;
let failed = 0;
const failures = [];

for (const sc of scenarios) {
    const gases = GAS_CONFIGS[sc.gasConfig];
    if (!gases) continue;

    const key = `${sc.depth}|${sc.bottomTime}|${sc.gasConfig}|${sc.gfLow}|${sc.gfHigh}`;
    const baselineResult = baselineByKey.get(key);
    if (!baselineResult) {
        failures.push({ ...sc, error: 'missing baseline' });
        failed++;
        continue;
    }

    const bottomGas = gases[0];
    const initialN2 = getInitialTissueN2(bottomGas.n2);
    let tissues = {};
    COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });

    const descentTime = Math.ceil(sc.depth / 20);
    tissues = simulateDepthChange(tissues, 0, sc.depth, descentTime, bottomGas.n2);

    const actualBottom = sc.bottomTime - descentTime;
    if (actualBottom > 0) {
        tissues = simulateDepthTime(tissues, sc.depth, actualBottom, bottomGas.n2);
    }

    // Explicitly pass gasSwitchTime: 0
    const schedule = generateDecoSchedule(
        tissues, sc.depth, bottomGas.n2,
        sc.gfLow / 100, sc.gfHigh / 100,
        gases,
        { gasSwitchTime: 0 }
    );

    const totalDeco = schedule.stops.reduce((sum, s) => sum + s.time, 0);

    if (totalDeco !== baselineResult.totalDeco) {
        failed++;
        failures.push({
            depth: sc.depth, bt: sc.bottomTime, gas: sc.gasConfig,
            gf: `${sc.gfLow}/${sc.gfHigh}`,
            baseline: baselineResult.totalDeco, got: totalDeco,
            diff: totalDeco - baselineResult.totalDeco,
        });
    } else {
        passed++;
    }
}

const total = passed + failed;

console.log('='.repeat(70));
console.log('gasSwitchTime=0 regression test (exact match vs baseline)');
console.log(`Scenarios: ${total} | Baseline: ${baseline.generatedAt}`);
console.log('='.repeat(70));
console.log();
console.log(`Passed: ${passed}/${total}`);
console.log(`Failed: ${failed}`);

if (failures.length > 0) {
    console.log();
    console.log(`Failures:`);
    for (const f of failures.slice(0, 20)) {
        if (f.error) {
            console.log(`  ${f.depth}m/${f.bottomTime}min ${f.gasConfig} GF${f.gfLow}/${f.gfHigh}: ${f.error}`);
        } else {
            console.log(`  ${f.depth}m/${f.bt}min ${f.gas} GF${f.gf}: baseline=${f.baseline} got=${f.got} diff=${f.diff}`);
        }
    }
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
    console.log(`\n\u274c ${failed} scenario(s) differ from baseline`);
    process.exit(1);
} else {
    console.log(`\n\u2705 All ${total} scenarios match baseline exactly (gasSwitchTime=0)`);
}
