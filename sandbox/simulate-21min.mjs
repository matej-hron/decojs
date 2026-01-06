/**
 * Simulate user's profile with 21 min bottom time
 * They see "0.2m above ceiling" violation but chart shows ceiling 5.6m at 6m
 */

import { 
    calculateTissueLoading,
    calculateCeilingTimeSeriesDetailed,
    N2_FRACTION
} from '../js/decoModel.js';

const gfLow = 0.5;
const gfHigh = 0.8;

const waypoints = [
    { time: 0, depth: 0, gasId: "air" },
    { time: 2, depth: 30, gasId: "air" },
    { time: 21, depth: 30, gasId: "air" },  // 1 min longer bottom time
    { time: 25, depth: 6, gasId: "air" },   // 4 min ascent = 6 m/min
    { time: 26, depth: 6, gasId: "air" },
    { time: 27, depth: 3, gasId: "air" },
    { time: 30, depth: 3, gasId: "air" },
    { time: 31, depth: 0, gasId: "air" }
];

console.log('=== 21 min bottom time, slow ascent to 6m ===\n');
console.log('Ascent rate: 30m to 6m in 4 min = 6 m/min\n');

const results = calculateTissueLoading(waypoints, N2_FRACTION);
const { ceilingDepths, gfValues, pAnchor } = calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh);

console.log(`pAnchor: ${((pAnchor - 1) * 10).toFixed(2)}m\n`);

// Find all violations
console.log('Checking for ceiling violations:\n');
let maxViolation = 0;
let maxViolationTime = 0;
let maxViolationDepth = 0;
let maxViolationCeiling = 0;

for (let i = 0; i < results.timePoints.length; i++) {
    const t = results.timePoints[i];
    const d = results.depthPoints[i];
    const c = ceilingDepths[i];
    const violation = c - d;
    
    if (violation > maxViolation) {
        maxViolation = violation;
        maxViolationTime = t;
        maxViolationDepth = d;
        maxViolationCeiling = c;
    }
}

if (maxViolation > 0) {
    console.log(`Max violation: ${maxViolation.toFixed(2)}m above ceiling`);
    console.log(`  At t=${maxViolationTime.toFixed(2)}: depth=${maxViolationDepth.toFixed(1)}m, ceiling=${maxViolationCeiling.toFixed(2)}m`);
} else {
    console.log('No violations');
}

// Timeline during ascent (where violation likely is)
console.log('\n\nTimeline during ascent (t=21 to t=26):');
console.log('Time    Depth   Ceiling  GF      Status');
console.log('─'.repeat(50));
for (let i = 0; i < results.timePoints.length; i++) {
    const t = results.timePoints[i];
    if (t >= 21 && t <= 26) {
        const d = results.depthPoints[i];
        const c = ceilingDepths[i];
        const gf = gfValues[i];
        const violation = c - d;
        const status = violation > 0.01 ? `⚠️ +${violation.toFixed(2)}m` : '✅';
        console.log(`${t.toFixed(2)}   ${d.toFixed(1)}m    ${c.toFixed(2)}m   ${(gf*100).toFixed(1)}%    ${status}`);
    }
}

// At t=25 (arrival at 6m)
const idx25 = results.timePoints.findIndex(t => t >= 25);
console.log(`\n\nAt t=25 (what chart shows when you hover at 6m arrival):`);
console.log(`  Depth: ${results.depthPoints[idx25].toFixed(1)}m`);
console.log(`  Ceiling: ${ceilingDepths[idx25].toFixed(2)}m`);

// At t=26 (end of 6m stop)
const idx26 = results.timePoints.findIndex(t => t >= 26);
console.log(`\nAt t=26 (end of 6m stop):`);
console.log(`  Depth: ${results.depthPoints[idx26].toFixed(1)}m`);
console.log(`  Ceiling: ${ceilingDepths[idx26].toFixed(2)}m`);

// At surface (t=31)
const idx31 = results.timePoints.findIndex(t => t >= 31);
console.log(`\nAt t=31 (surfacing):`);
console.log(`  Depth: ${results.depthPoints[idx31].toFixed(1)}m`);
console.log(`  Ceiling: ${ceilingDepths[idx31].toFixed(2)}m`);
console.log(`  Violation: ${ceilingDepths[idx31].toFixed(2)}m above surface!`);

// Timeline near surface
console.log('\nTimeline at surfacing (t=30 to t=32):');
for (let i = 0; i < results.timePoints.length; i++) {
    const t = results.timePoints[i];
    if (t >= 30 && t <= 32) {
        const d = results.depthPoints[i];
        const c = ceilingDepths[i];
        const gf = gfValues[i];
        const status = c > d + 0.01 ? `⚠️ +${(c-d).toFixed(2)}m` : '✅';
        console.log(`  t=${t.toFixed(2)}, depth=${d.toFixed(1)}m, ceiling=${c.toFixed(2)}m, GF=${(gf*100).toFixed(1)}% ${status}`);
    }
}

console.log('\n\n=== THE ISSUE ===\n');
console.log('The violation happens DURING the ascent (when passing through ~7m)');
console.log('But by the time you arrive at 6m, ceiling has dropped to 5.6m');
console.log('');
console.log('The chart shows ceiling at each point in time, so at 6m you see 5.6m.');
console.log('But the violation message correctly detected that ceiling was exceeded');
console.log('at some point during the ascent.');
