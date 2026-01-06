/**
 * Compare ceiling values: WITH 9m stop vs SKIPPING 9m stop
 * 
 * The user sees 5.3m on the chart - let's find where that value comes from
 */

import { 
    calculateTissueLoading,
    calculateCeilingTimeSeriesDetailed,
    N2_FRACTION
} from '../js/decoModel.js';

const gfLow = 0.5;
const gfHigh = 0.8;

// Profile WITH 9m stop
const waypointsWithStop = [
    { time: 0, depth: 0, gasId: "air" },
    { time: 2, depth: 30, gasId: "air" },
    { time: 20, depth: 30, gasId: "air" },
    { time: 23, depth: 9, gasId: "air" },
    { time: 24, depth: 9, gasId: "air" },
    { time: 25, depth: 6, gasId: "air" },
    { time: 26, depth: 6, gasId: "air" },
    { time: 27, depth: 3, gasId: "air" },
    { time: 30, depth: 3, gasId: "air" },
    { time: 31, depth: 0, gasId: "air" }
];

// Profile SKIPPING 9m stop
const waypointsSkip9m = [
    { time: 0, depth: 0, gasId: "air" },
    { time: 2, depth: 30, gasId: "air" },
    { time: 20, depth: 30, gasId: "air" },
    { time: 22.4, depth: 6, gasId: "air" },
    { time: 23.4, depth: 6, gasId: "air" },
    { time: 23.7, depth: 3, gasId: "air" },
    { time: 26.7, depth: 3, gasId: "air" },
    { time: 27, depth: 0, gasId: "air" }
];

console.log('=== Looking for ceiling value of 5.3m ===\n');

// WITH 9m stop
console.log('Profile WITH 9m stop:\n');
const results1 = calculateTissueLoading(waypointsWithStop, N2_FRACTION);
const { ceilingDepths: ceilings1, gfValues: gfs1, pAnchor: pAnchor1 } = calculateCeilingTimeSeriesDetailed(results1, gfLow, gfHigh);

console.log(`pAnchor: ${((pAnchor1 - 1) * 10).toFixed(2)}m\n`);

// Find all ceilings between 5.0 and 5.6m
console.log('Points where ceiling is between 5.0m and 5.6m:');
for (let i = 0; i < results1.timePoints.length; i++) {
    const c = ceilings1[i];
    if (c >= 5.0 && c <= 5.6) {
        console.log(`  t=${results1.timePoints[i].toFixed(2)}, depth=${results1.depthPoints[i].toFixed(1)}m, ceiling=${c.toFixed(2)}m, GF=${(gfs1[i]*100).toFixed(1)}%`);
    }
}

// Show ceiling at 6m arrival in WITH stop profile
const idx6m_with = results1.timePoints.findIndex(t => t >= 25);
console.log(`\nAt t=25 (arrival at 6m WITH stop): ceiling=${ceilings1[idx6m_with].toFixed(2)}m, depth=${results1.depthPoints[idx6m_with].toFixed(1)}m`);

// SKIPPING 9m stop
console.log('\n\nProfile SKIPPING 9m stop:\n');
const results2 = calculateTissueLoading(waypointsSkip9m, N2_FRACTION);
const { ceilingDepths: ceilings2, gfValues: gfs2, pAnchor: pAnchor2 } = calculateCeilingTimeSeriesDetailed(results2, gfLow, gfHigh);

console.log(`pAnchor: ${((pAnchor2 - 1) * 10).toFixed(2)}m\n`);

// Find all ceilings between 5.0 and 5.6m
console.log('Points where ceiling is between 5.0m and 5.6m:');
for (let i = 0; i < results2.timePoints.length; i++) {
    const c = ceilings2[i];
    if (c >= 5.0 && c <= 5.6) {
        console.log(`  t=${results2.timePoints[i].toFixed(2)}, depth=${results2.depthPoints[i].toFixed(1)}m, ceiling=${c.toFixed(2)}m, GF=${(gfs2[i]*100).toFixed(1)}%`);
    }
}

// Show ceiling at 6m arrival
const idx6m_skip = results2.timePoints.findIndex(t => t >= 22.4);
console.log(`\nAt t=22.4 (arrival at 6m SKIP 9m): ceiling=${ceilings2[idx6m_skip].toFixed(2)}m, depth=${results2.depthPoints[idx6m_skip].toFixed(1)}m`);

console.log('\n\n=== Comparison of 6m arrival ===\n');
console.log('WITH 9m stop:');
console.log(`  Time at 6m arrival: 25.0 min`);
console.log(`  Ceiling: ${ceilings1[idx6m_with].toFixed(2)}m`);
console.log(`  This is AFTER 1 min at 9m, so tissues have off-gassed`);

console.log('\nSKIPPING 9m stop:');
console.log(`  Time at 6m arrival: 22.4 min`);
console.log(`  Ceiling: ${ceilings2[idx6m_skip].toFixed(2)}m`);
console.log(`  This is a direct ascent, no time to off-gas`);

console.log('\n=== The 5.3m mystery ===\n');
console.log('Looking at the WITH 9m profile, the ceiling reaches ~5.3m');
console.log('after some time at the 9m stop (allowing off-gassing).');
console.log('');
console.log('The chart may be showing the profile WITH the 9m stop,');
console.log('where the diver stays at 9m and ceiling drops to 5.3m DURING the stop.');
