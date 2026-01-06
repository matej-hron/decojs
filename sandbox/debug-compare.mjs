/**
 * Debug: Why is first stop at 9m instead of 6m?
 * 
 * Compare tissue states from two methods:
 * 1. Using calculateTissueLoading with waypoints
 * 2. Using manual simulateDepthChange + simulateDepthTime
 */

import { 
    calculateTissueLoading,
    generateDecoSchedule,
    N2_FRACTION,
    getInitialTissueN2,
    simulateDepthChange,
    simulateDepthTime,
    findGFLowAnchor,
    getAmbientPressure,
    interpolateGF,
    getDiveCeiling
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';

const DESCENT_SPEED = 20;
const ASCENT_SPEED = 10;

const gfLow = 0.5;
const gfHigh = 0.8;

const maxDepth = 30;
const bottomTime = 20;
const descentTime = maxDepth / DESCENT_SPEED;

console.log('=== Comparing tissue simulation methods ===\n');

// Method 1: calculateTissueLoading
const waypointsMethod1 = [
    { time: 0, depth: 0 },
    { time: descentTime, depth: maxDepth },
    { time: bottomTime, depth: maxDepth }
];

const results = calculateTissueLoading(waypointsMethod1, N2_FRACTION);

// Get tissues at end of bottom time (find index where time = bottomTime)
const tissuesMethod1 = {};
const bottomTimeIndex = results.timePoints.findIndex(t => t === bottomTime);
console.log(`Reading tissues at t=${bottomTime} (index ${bottomTimeIndex})`);
for (const compId of Object.keys(results.compartments)) {
    tissuesMethod1[compId] = results.compartments[compId].pressures[bottomTimeIndex];
}

// Method 2: Manual simulation
const initialN2 = getInitialTissueN2(N2_FRACTION);
let tissuesMethod2 = {};
COMPARTMENTS.forEach(comp => {
    tissuesMethod2[comp.id] = initialN2;
});

tissuesMethod2 = simulateDepthChange(tissuesMethod2, 0, maxDepth, descentTime, N2_FRACTION);
const actualBottomDuration = bottomTime - descentTime;
tissuesMethod2 = simulateDepthTime(tissuesMethod2, maxDepth, actualBottomDuration, N2_FRACTION);

console.log('Tissue pressures at end of bottom phase:');
console.log('ID   | Method1 (waypoints) | Method2 (manual) | Diff');
console.log('-----|---------------------|------------------|-------');

for (const id of Object.keys(tissuesMethod1).sort((a,b) => Number(a) - Number(b))) {
    const p1 = tissuesMethod1[id];
    const p2 = tissuesMethod2[id];
    const diff = Math.abs(p1 - p2);
    console.log(`${id.padStart(4)} | ${p1.toFixed(6).padStart(19)} | ${p2.toFixed(6).padStart(16)} | ${diff.toFixed(6)}`);
}

console.log('\n=== Deco schedule from each method ===\n');

const schedule1 = generateDecoSchedule({ ...tissuesMethod1 }, maxDepth, N2_FRACTION, gfLow, gfHigh);
const schedule2 = generateDecoSchedule({ ...tissuesMethod2 }, maxDepth, N2_FRACTION, gfLow, gfHigh);

console.log('Method 1 (calculateTissueLoading):');
console.log(`  pAnchor: ${schedule1.anchorDepth.toFixed(2)} m`);
console.log('  Stops:', schedule1.stops.map(s => `${s.depth}m:${s.time}min`).join(', ') || 'none');

console.log('\nMethod 2 (manual simulation):');
console.log(`  pAnchor: ${schedule2.anchorDepth.toFixed(2)} m`);
console.log('  Stops:', schedule2.stops.map(s => `${s.depth}m:${s.time}min`).join(', ') || 'none');

// Check findFirstStopWithRampedGF step by step for method 2
console.log('\n=== Detailed first stop check (Method 2) ===\n');

const { pAnchor } = findGFLowAnchor(tissuesMethod2, maxDepth, N2_FRACTION, gfLow);
console.log(`pAnchor: ${pAnchor.toFixed(4)} bar = ${((pAnchor - 1) * 10).toFixed(2)} m`);
console.log('');

for (let candidateDepth = 0; candidateDepth <= 12; candidateDepth += 3) {
    const ascentTime = (maxDepth - candidateDepth) / ASCENT_SPEED;
    const tissuesAtCandidate = simulateDepthChange({ ...tissuesMethod2 }, maxDepth, candidateDepth, ascentTime, N2_FRACTION);
    
    const candidateAmbient = getAmbientPressure(candidateDepth);
    const gf = interpolateGF(candidateAmbient, pAnchor, gfLow, gfHigh);
    
    const { ceilingDepth } = getDiveCeiling(tissuesAtCandidate, gf);
    
    const canStay = ceilingDepth <= candidateDepth;
    
    console.log(`${candidateDepth}m: ceiling=${ceilingDepth.toFixed(2)}m, GF=${(gf*100).toFixed(1)}%, canStay=${canStay}`);
}
