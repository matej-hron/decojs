/**
 * What profile gives 25 min arrival at 6m directly from bottom?
 * 
 * If bottom time is longer, say 23 min at 30m:
 * - t=0: surface
 * - t=2: arrive 30m
 * - t=23: leave 30m (21 min bottom)
 * - t=25.4: arrive 6m (2.4 min ascent at 10m/min)
 * 
 * Close! Let's try 22 min bottom time:
 * - t=22: leave 30m (20 min bottom)
 * - t=24.4: arrive 6m
 * 
 * Or descent time is different. Let me simulate what the planner generates.
 */

import { 
    calculateTissueLoading,
    calculateCeilingTimeSeriesDetailed,
    N2_FRACTION
} from '../js/decoModel.js';

const gfLow = 0.5;
const gfHigh = 0.8;

// Profile that might give t=25 arrival at 6m
// If ascent is slower (9m/min = 3m in 20sec steps)
// From 30m to 6m = 24m at 9m/min = 2.67 min
// t=20 + 2.67 = 22.67

// Or maybe it's: bottom at 30m until t=22, then ascent
// t=22 leave 30m, t=24.67 arrive 6m

// Let me try: what if bottom is until t=22.5?
// t=22.5 leave 30m, t=25.17 arrive 6m at ~10m/min

// Actually, let me look at what happens if we have:
// - 20 min bottom (t=2 to t=22)
// - 3 min ascent (10m/min from 30 to 0 = 3 min total, but stops at 6m = 2.4 min)

// I'll simulate a profile that SHOULD match what user describes:
// Direct from bottom to 6m, arriving at t=25
const waypointsTest = [
    { time: 0, depth: 0, gasId: "air" },
    { time: 3, depth: 30, gasId: "air" },  // 3 min descent = 10m/min
    { time: 22.5, depth: 30, gasId: "air" },  // ~19.5 min at bottom
    { time: 25, depth: 6, gasId: "air" },  // 2.5 min ascent (9.6 m/min)
    { time: 28, depth: 6, gasId: "air" },  // 3 min at 6m
    { time: 28.5, depth: 3, gasId: "air" },
    { time: 31.5, depth: 3, gasId: "air" },
    { time: 32, depth: 0, gasId: "air" }
];

console.log('=== Testing profile with t=25 arrival at 6m ===\n');
const results = calculateTissueLoading(waypointsTest, N2_FRACTION);
const { ceilingDepths, gfValues, pAnchor } = calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh);

console.log(`pAnchor: ${((pAnchor - 1) * 10).toFixed(2)}m\n`);

// Find t=25 (arrival at 6m)
const idx25 = results.timePoints.findIndex(t => t >= 25);
console.log(`At t=${results.timePoints[idx25].toFixed(2)} (arrival at 6m):`);
console.log(`  Depth: ${results.depthPoints[idx25].toFixed(1)}m`);
console.log(`  Ceiling: ${ceilingDepths[idx25].toFixed(2)}m`);
console.log(`  GF: ${(gfValues[idx25] * 100).toFixed(1)}%`);

// What about points just before?
console.log('\nTimeline around arrival at 6m:');
for (let i = Math.max(0, idx25 - 10); i <= Math.min(results.timePoints.length - 1, idx25 + 5); i++) {
    const t = results.timePoints[i];
    const d = results.depthPoints[i];
    const c = ceilingDepths[i];
    const gf = gfValues[i];
    console.log(`  t=${t.toFixed(2)}, depth=${d.toFixed(1)}m, ceiling=${c.toFixed(2)}m, GF=${(gf*100).toFixed(1)}%`);
}

// Now check: what ceiling do we get if we use GF 50% (ignoring ramp)?
console.log('\n\n=== AHA! Let me check if ceiling uses wrong GF ===\n');

// At t=25, what's the ceiling at GF 50% vs interpolated GF?
import { COMPARTMENTS } from '../js/tissueCompartments.js';

const tissuesAt25 = {};
for (let i = 1; i <= 16; i++) {
    tissuesAt25[i] = results.compartments[i].pressures[idx25];
}

// Ceiling at GF 50%
let maxCeiling50 = 0;
for (let i = 1; i <= 16; i++) {
    const { a, b } = COMPARTMENTS[i];
    const pTissue = tissuesAt25[i];
    const mValue = a + (1.6 / b);  // M-value at 6m (1.6 bar)
    const toleratedAmbient = (pTissue - a * gfLow) / (gfLow / b + 1 - gfLow);
    const ceilingDepth = Math.max(0, (toleratedAmbient - 1) * 10);
    if (ceilingDepth > maxCeiling50) maxCeiling50 = ceilingDepth;
}

console.log(`Ceiling at GF 50% (ignoring interpolation): ${maxCeiling50.toFixed(2)}m`);
console.log(`Ceiling with GF interpolation: ${ceilingDepths[idx25].toFixed(2)}m`);

// Check what the GF is at 6m with our pAnchor
const pAmb6 = 1.6;
const pAnchorDepth = (pAnchor - 1) * 10;
console.log(`\npAnchor depth: ${pAnchorDepth.toFixed(2)}m`);
console.log(`6m is ${pAmb6 < pAnchor ? 'ABOVE' : 'at or below'} pAnchor`);

if (pAmb6 < pAnchor) {
    const interpolatedGF = gfLow + (gfHigh - gfLow) * (pAnchor - pAmb6) / (pAnchor - 1);
    console.log(`Interpolated GF at 6m: ${(interpolatedGF * 100).toFixed(1)}%`);
}
