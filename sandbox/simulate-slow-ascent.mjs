/**
 * Simulate the user's modified profile:
 * - Removed 9m waypoints but kept times
 * - Result: slower ascent from 30m to 6m (5 min instead of 2.4 min)
 */

import { 
    calculateTissueLoading,
    calculateCeilingTimeSeriesDetailed,
    N2_FRACTION
} from '../js/decoModel.js';

const gfLow = 0.5;
const gfHigh = 0.8;

// User's actual profile (deleted 9m waypoints, kept times)
const waypointsSlowAscent = [
    { time: 0, depth: 0, gasId: "air" },
    { time: 2, depth: 30, gasId: "air" },
    { time: 20, depth: 30, gasId: "air" },
    { time: 25, depth: 6, gasId: "air" },   // 5 min to go 24m = 4.8 m/min (SLOW!)
    { time: 26, depth: 6, gasId: "air" },
    { time: 27, depth: 3, gasId: "air" },
    { time: 30, depth: 3, gasId: "air" },
    { time: 31, depth: 0, gasId: "air" }
];

// Original profile with 9m stop
const waypointsWithStop = [
    { time: 0, depth: 0, gasId: "air" },
    { time: 2, depth: 30, gasId: "air" },
    { time: 20, depth: 30, gasId: "air" },
    { time: 23, depth: 9, gasId: "air" },   // Fast ascent to 9m (7 m/min)
    { time: 24, depth: 9, gasId: "air" },   // 1 min stop
    { time: 25, depth: 6, gasId: "air" },
    { time: 26, depth: 6, gasId: "air" },
    { time: 27, depth: 3, gasId: "air" },
    { time: 30, depth: 3, gasId: "air" },
    { time: 31, depth: 0, gasId: "air" }
];

console.log('=== SLOW ASCENT (deleted 9m waypoints, kept times) ===\n');
console.log('Profile: 30m → 6m in 5 min (4.8 m/min)\n');

const results1 = calculateTissueLoading(waypointsSlowAscent, N2_FRACTION);
const { ceilingDepths: c1, gfValues: gf1, pAnchor: pA1 } = calculateCeilingTimeSeriesDetailed(results1, gfLow, gfHigh);

console.log(`pAnchor: ${((pA1 - 1) * 10).toFixed(2)}m\n`);

// Find arrival at 6m (t=25)
const idx25_slow = results1.timePoints.findIndex(t => t >= 25);
console.log(`At t=25 (arrival at 6m):`);
console.log(`  Depth: ${results1.depthPoints[idx25_slow].toFixed(1)}m`);
console.log(`  Ceiling: ${c1[idx25_slow].toFixed(2)}m`);
console.log(`  GF: ${(gf1[idx25_slow] * 100).toFixed(1)}%`);
console.log(`  Violation: ${c1[idx25_slow] > 6 ? '⚠️ YES' : '✅ NO'}`);

// Timeline during ascent
console.log('\nTimeline during slow ascent (t=20 to t=26):');
for (let i = 0; i < results1.timePoints.length; i++) {
    const t = results1.timePoints[i];
    if (t >= 20 && t <= 26) {
        const d = results1.depthPoints[i];
        const ceil = c1[i];
        const gf = gf1[i];
        const violation = ceil > d ? '⚠️' : '✅';
        console.log(`  t=${t.toFixed(2)}, depth=${d.toFixed(1)}m, ceiling=${ceil.toFixed(2)}m, GF=${(gf*100).toFixed(1)}% ${violation}`);
    }
}

// Check for any violations
console.log('\n\nChecking for ceiling violations:');
let violations = 0;
for (let i = 0; i < results1.timePoints.length; i++) {
    if (c1[i] > results1.depthPoints[i] + 0.01) {
        violations++;
        if (violations <= 5) {
            console.log(`  ⚠️ t=${results1.timePoints[i].toFixed(2)}: depth=${results1.depthPoints[i].toFixed(1)}m < ceiling=${c1[i].toFixed(2)}m`);
        }
    }
}
if (violations > 5) console.log(`  ... and ${violations - 5} more violations`);
if (violations === 0) console.log('  ✅ No violations!');

console.log('\n\n=== COMPARISON WITH ORIGINAL (fast ascent + 9m stop) ===\n');

const results2 = calculateTissueLoading(waypointsWithStop, N2_FRACTION);
const { ceilingDepths: c2, gfValues: gf2, pAnchor: pA2 } = calculateCeilingTimeSeriesDetailed(results2, gfLow, gfHigh);

// Find arrival at 6m (t=25) in original
const idx25_orig = results2.timePoints.findIndex(t => t >= 25);
console.log('Original profile (with 9m stop):');
console.log(`  At t=25 (arrival at 6m): ceiling=${c2[idx25_orig].toFixed(2)}m`);

console.log('\nSlow ascent profile (your modification):');
console.log(`  At t=25 (arrival at 6m): ceiling=${c1[idx25_slow].toFixed(2)}m`);

console.log('\n\n=== WHY THE SLOW ASCENT WORKS ===\n');
console.log('During the slow 5-minute ascent from 30m to 6m:');
console.log('- You spend time at intermediate depths (24m, 18m, 12m, etc.)');
console.log('- At these depths, ambient pressure is still high enough');
console.log('- Tissues can off-gas during ascent (pressure gradient favorable)');
console.log('- By the time you reach 6m, tissues have off-gassed significantly');
console.log('');
console.log('This is essentially a "deep stop" approach - ascending slowly');
console.log('rather than rushing to a fixed stop depth.');
