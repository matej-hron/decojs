/**
 * Debug script to understand the ceiling behavior during ascent planning
 * 
 * The user's question: For 30m/20min air GF 50/80, why does the planner schedule deco at 9m
 * when ceiling at 9m arrival is only 6.2m? If we continued to 6m, would the ceiling exceed 6m?
 */

import { 
    calculateTissueLoading,
    N2_FRACTION,
    findGFLowAnchor,
    getAmbientPressure,
    interpolateGF,
    getDiveCeiling,
    simulateDepthChange
} from '../js/decoModel.js';

const ASCENT_SPEED = 10; // m/min

// Profile: descent, bottom time, then ascent will be simulated manually
const waypoints = [
    { time: 0, depth: 0 },
    { time: 1.5, depth: 30 },   // Descent at 20m/min
    { time: 20, depth: 30 },    // Bottom time
];

const gfLow = 0.5;
const gfHigh = 0.8;

// Calculate tissue loading at end of bottom time
const results = calculateTissueLoading(waypoints, N2_FRACTION);

// Get tissue pressures at end of bottom time
const tissuesAtBottom = {};
for (const compId of Object.keys(results.compartments)) {
    const pressures = results.compartments[compId].pressures;
    tissuesAtBottom[compId] = pressures[pressures.length - 1];
}

console.log('=== Debug: First Stop Discovery ===\n');
console.log('Dive: 30m / 20min, Air, GF 50/80');
console.log('');

// Step 1: Find pAnchor
const anchorResult = findGFLowAnchor(tissuesAtBottom, 30, N2_FRACTION, gfLow);
console.log('pAnchor:', anchorResult.pAnchor.toFixed(4), 'bar');
console.log('Anchor depth:', anchorResult.anchorDepth.toFixed(2), 'm');
console.log('Leading compartment at anchor:', anchorResult.leadingCompartment);
console.log('');

// Step 2: Simulate ascent to candidate stops and check ceiling
console.log('=== Testing candidate stop depths ===\n');

const pAnchor = anchorResult.pAnchor;

for (let candidateDepth = 0; candidateDepth <= 15; candidateDepth += 3) {
    // Simulate ascent from 30m to candidateDepth
    const ascentTime = (30 - candidateDepth) / ASCENT_SPEED;
    const tissuesAtCandidate = simulateDepthChange({ ...tissuesAtBottom }, 30, candidateDepth, ascentTime, N2_FRACTION);
    
    // Get GF at candidate depth
    const candidateAmbient = getAmbientPressure(candidateDepth);
    const gf = interpolateGF(candidateAmbient, pAnchor, gfLow, gfHigh);
    
    // Get ceiling at candidate depth with that GF
    const { ceilingDepth, controllingCompartment } = getDiveCeiling(tissuesAtCandidate, gf);
    
    const canStay = ceilingDepth <= candidateDepth;
    
    console.log(`Candidate: ${candidateDepth}m`);
    console.log(`  Ascent time: ${ascentTime.toFixed(2)} min`);
    console.log(`  GF at depth: ${(gf * 100).toFixed(1)}%`);
    console.log(`  Ceiling after arriving: ${ceilingDepth.toFixed(2)}m`);
    console.log(`  Controlling tissue: ${controllingCompartment}`);
    console.log(`  Can stay? ${canStay ? 'YES' : 'NO'} (ceiling ${ceilingDepth.toFixed(2)}m ${canStay ? '<=' : '>'} depth ${candidateDepth}m)`);
    console.log('');
}

// Step 3: Let's trace what happens at 6m vs 9m more carefully
console.log('=== Detailed comparison: 6m vs 9m ===\n');

for (const targetDepth of [9, 6]) {
    const ascentTime = (30 - targetDepth) / ASCENT_SPEED;
    const tissuesAtTarget = simulateDepthChange({ ...tissuesAtBottom }, 30, targetDepth, ascentTime, N2_FRACTION);
    
    const targetAmbient = getAmbientPressure(targetDepth);
    const gf = interpolateGF(targetAmbient, pAnchor, gfLow, gfHigh);
    
    // Check ceiling with GF from interpolation
    const { ceilingDepth, controllingCompartment } = getDiveCeiling(tissuesAtTarget, gf);
    
    // Also show what the ceiling would be with GF Low
    const { ceilingDepth: ceilingAtGFLow } = getDiveCeiling(tissuesAtTarget, gfLow);
    
    console.log(`=== At ${targetDepth}m ===`);
    console.log(`  Tissues after ${ascentTime.toFixed(2)} min ascent from 30m`);
    console.log(`  Ambient: ${targetAmbient.toFixed(2)} bar`);
    console.log(`  pAnchor: ${pAnchor.toFixed(4)} bar (${anchorResult.anchorDepth.toFixed(2)}m)`);
    console.log(`  Interpolated GF: ${(gf * 100).toFixed(1)}%`);
    console.log(`  Ceiling at interpolated GF: ${ceilingDepth.toFixed(2)}m`);
    console.log(`  Ceiling at GF Low (50%): ${ceilingAtGFLow.toFixed(2)}m`);
    console.log(`  Controlling tissue: ${controllingCompartment}`);
    console.log('');
}

// Step 4: The KEY question - what's the issue?
console.log('=== Analysis ===\n');
console.log('The issue is in findFirstStopWithRampedGF:');
console.log('It iterates from surface (0m) upward and returns the FIRST depth where ceiling <= depth.');
console.log('');
console.log('At 6m:');
const ascentTo6 = (30 - 6) / ASCENT_SPEED;
const tissuesAt6 = simulateDepthChange({ ...tissuesAtBottom }, 30, 6, ascentTo6, N2_FRACTION);
const ambient6 = getAmbientPressure(6);
const gf6 = interpolateGF(ambient6, pAnchor, gfLow, gfHigh);
const ceiling6 = getDiveCeiling(tissuesAt6, gf6);
console.log(`  GF at 6m: ${(gf6 * 100).toFixed(1)}%`);
console.log(`  Ceiling: ${ceiling6.ceilingDepth.toFixed(2)}m`);
console.log(`  Can stay at 6m? ${ceiling6.ceilingDepth <= 6 ? 'YES' : 'NO'}`);
console.log('');

console.log('At 9m:');
const ascentTo9 = (30 - 9) / ASCENT_SPEED;
const tissuesAt9 = simulateDepthChange({ ...tissuesAtBottom }, 30, 9, ascentTo9, N2_FRACTION);
const ambient9 = getAmbientPressure(9);
const gf9 = interpolateGF(ambient9, pAnchor, gfLow, gfHigh);
const ceiling9 = getDiveCeiling(tissuesAt9, gf9);
console.log(`  GF at 9m: ${(gf9 * 100).toFixed(1)}%`);
console.log(`  Ceiling: ${ceiling9.ceilingDepth.toFixed(2)}m`);
console.log(`  Can stay at 9m? ${ceiling9.ceilingDepth <= 9 ? 'YES' : 'NO'}`);
