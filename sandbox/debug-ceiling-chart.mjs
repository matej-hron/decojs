/**
 * Debug: Why does the chart show 5.3m ceiling instead of 6.06m?
 * 
 * Let's trace through calculateCeilingTimeSeriesDetailed step by step
 */

import { 
    calculateTissueLoading,
    calculateCeilingTimeSeriesDetailed,
    findGFLowAnchor,
    getAmbientPressure,
    interpolateGF,
    getDiveCeiling,
    N2_FRACTION,
    SURFACE_PRESSURE,
    PRESSURE_PER_METER
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';

const gfLow = 0.5;
const gfHigh = 0.8;

// Profile WITHOUT 9m stop (skipping directly to 6m)
const waypointsSkip9m = [
    { time: 0, depth: 0, gasId: "air" },
    { time: 2, depth: 30, gasId: "air" },
    { time: 20, depth: 30, gasId: "air" },
    // SKIP 9m - go directly to 6m
    { time: 22.4, depth: 6, gasId: "air" },
    { time: 23.4, depth: 6, gasId: "air" },
    { time: 23.7, depth: 3, gasId: "air" },
    { time: 26.7, depth: 3, gasId: "air" },
    { time: 27, depth: 0, gasId: "air" }
];

console.log('=== Debug: Ceiling calculation at 6m arrival ===\n');

// Calculate tissue loading
const results = calculateTissueLoading(waypointsSkip9m, N2_FRACTION);

// Get ceiling time series
const { ceilingDepths, gfValues, pAnchor } = calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh);

console.log(`pAnchor from calculateCeilingTimeSeriesDetailed: ${((pAnchor - 1) * 10).toFixed(2)}m`);
console.log('');

// Find the index where we arrive at 6m
const idx6m = results.timePoints.findIndex(t => t >= 22.4);
console.log(`Index for t=22.4: ${idx6m}`);
console.log(`Time at that index: ${results.timePoints[idx6m]}`);
console.log(`Depth at that index: ${results.depthPoints[idx6m]}`);
console.log(`Ceiling from time series: ${ceilingDepths[idx6m].toFixed(2)}m`);
console.log(`GF from time series: ${(gfValues[idx6m] * 100).toFixed(1)}%`);
console.log('');

// Now let's manually calculate what the ceiling should be
console.log('=== Manual calculation at t=22.4 (6m arrival) ===\n');

const tissuePressuresAt6m = {};
for (const compId of Object.keys(results.compartments)) {
    tissuePressuresAt6m[compId] = results.compartments[compId].pressures[idx6m];
}

console.log('Tissue pressures at 6m arrival:');
for (const id of Object.keys(tissuePressuresAt6m).sort((a,b) => Number(a) - Number(b)).slice(0, 5)) {
    console.log(`  TC${id}: ${tissuePressuresAt6m[id].toFixed(4)} bar`);
}
console.log('');

// What's the ambient pressure at 6m?
const ambientAt6m = getAmbientPressure(6);
console.log(`Ambient at 6m: ${ambientAt6m.toFixed(4)} bar`);
console.log(`pAnchor: ${pAnchor.toFixed(4)} bar`);
console.log(`Is 6m above pAnchor (ambient < pAnchor)? ${ambientAt6m < pAnchor}`);
console.log('');

// What GF should be used?
const gfAt6m = interpolateGF(ambientAt6m, pAnchor, gfLow, gfHigh);
console.log(`Interpolated GF at 6m: ${(gfAt6m * 100).toFixed(2)}%`);
console.log('');

// Calculate ceiling with correct GF
const { ceilingDepth: manualCeiling, controllingCompartment } = getDiveCeiling(tissuePressuresAt6m, gfAt6m);
console.log(`Manual ceiling at GF ${(gfAt6m * 100).toFixed(1)}%: ${manualCeiling.toFixed(2)}m`);
console.log(`Controlling compartment: ${controllingCompartment}`);
console.log('');

// What if we use GF Low (50%)?
const { ceilingDepth: ceilingAtGFLow } = getDiveCeiling(tissuePressuresAt6m, gfLow);
console.log(`Ceiling at GF Low (50%): ${ceilingAtGFLow.toFixed(2)}m`);
console.log('');

// Check the ascentStarted flag logic
console.log('=== Checking ascentStarted logic ===\n');

// Find max depth
let maxDepthSeen = 0;
for (let i = 0; i < results.depthPoints.length; i++) {
    if (results.depthPoints[i] > maxDepthSeen) {
        maxDepthSeen = results.depthPoints[i];
    }
}
console.log(`Max depth: ${maxDepthSeen}m`);

// Find ascent start index
let ascentStartIndex = 0;
const depthTolerance = 0.1;
for (let i = 0; i < results.timePoints.length; i++) {
    if (Math.abs(results.depthPoints[i] - maxDepthSeen) < depthTolerance) {
        ascentStartIndex = i;
    }
}
console.log(`Ascent start index: ${ascentStartIndex}`);
console.log(`Time at ascent start: ${results.timePoints[ascentStartIndex]}`);
console.log(`Depth at ascent start: ${results.depthPoints[ascentStartIndex]}`);
console.log('');

// Check if ascentStarted is true at idx6m
let previousDepth = results.depthPoints[0];
let ascentStarted = false;
for (let i = 0; i <= idx6m; i++) {
    const currentDepth = results.depthPoints[i];
    const isAscending = currentDepth < previousDepth;
    if (isAscending && !ascentStarted && currentDepth < maxDepthSeen) {
        ascentStarted = true;
        console.log(`ascentStarted set to true at i=${i}, t=${results.timePoints[i]}, depth=${currentDepth}`);
    }
    previousDepth = currentDepth;
}
console.log(`ascentStarted at idx6m (${idx6m}): ${ascentStarted}`);
console.log('');

// What's the ambient pressure at idx6m?
const currentAmbient = results.ambientPressures[idx6m];
console.log(`Ambient at idx6m: ${currentAmbient.toFixed(4)} bar`);
console.log(`currentAmbient >= pAnchor? ${currentAmbient >= pAnchor}`);
console.log('');

// So what GF is used by the algorithm?
let gfUsed;
if (!ascentStarted || currentAmbient >= pAnchor) {
    gfUsed = gfLow;
    console.log('Algorithm uses GF Low because: ' + (!ascentStarted ? 'ascentStarted is false' : 'currentAmbient >= pAnchor'));
} else {
    gfUsed = interpolateGF(currentAmbient, pAnchor, gfLow, gfHigh);
    console.log(`Algorithm interpolates GF: ${(gfUsed * 100).toFixed(2)}%`);
}
console.log(`GF used by algorithm: ${(gfUsed * 100).toFixed(2)}%`);
console.log(`GF from time series: ${(gfValues[idx6m] * 100).toFixed(2)}%`);
