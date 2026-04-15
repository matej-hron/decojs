/**
 * Generate baseline snapshot of DecoJS results for all 3900 decotengu scenarios.
 * Run BEFORE any code changes to capture current exact output.
 *
 * Usage: node scripts/generate_baseline.mjs > tests/decojs-baseline.json
 */

import { readFileSync } from 'fs';
import { COMPARTMENTS, setZHL16Variant, ZHL16_VARIANTS } from '../js/tissueCompartments.js';
import {
    simulateDepthChange,
    simulateDepthTime,
    generateDecoSchedule,
    getInitialTissueN2,
} from '../js/decoModel.js';

// Load reference scenarios
const reference = JSON.parse(readFileSync(new URL('../tests/decotengu-reference.json', import.meta.url)));
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

const results = [];

for (const sc of scenarios) {
    const gases = GAS_CONFIGS[sc.gasConfig];
    if (!gases) continue;

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

    const schedule = generateDecoSchedule(
        tissues, sc.depth, bottomGas.n2,
        sc.gfLow / 100, sc.gfHigh / 100,
        gases
    );

    const totalDeco = schedule.stops.reduce((sum, s) => sum + s.time, 0);

    results.push({
        depth: sc.depth,
        bottomTime: sc.bottomTime,
        gasConfig: sc.gasConfig,
        gfLow: sc.gfLow,
        gfHigh: sc.gfHigh,
        totalDeco,
        stops: schedule.stops.map(s => ({ depth: s.depth, time: s.time, gas: s.gas })),
    });
}

const output = {
    generator: 'DecoJS baseline snapshot',
    generatedAt: new Date().toISOString(),
    decoModelVersion: 'pre-gasSwitchTime',
    count: results.length,
    results,
};

console.log(JSON.stringify(output, null, 2));
