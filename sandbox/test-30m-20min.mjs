/**
 * Test the specific case: 30m / 20min / air / GF 50/80
 * 
 * This script:
 * 1. Computes the deco schedule using generateDecoSchedule
 * 2. Shows the first stop depth
 * 3. Generates a full profile with the planned stops
 * 4. Calculates the ceiling time series for that profile
 * 5. Checks if ceiling at first stop arrival matches expectations
 */

import { 
    calculateTissueLoading,
    generateDecoSchedule,
    calculateCeilingTimeSeriesDetailed,
    N2_FRACTION,
    getInitialTissueN2,
    simulateDepthChange,
    simulateDepthTime,
    CALC_INTERVAL
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';

const DESCENT_SPEED = 20;
const ASCENT_SPEED = 10;

const gfLow = 0.5;
const gfHigh = 0.8;

console.log('=== Test: 30m / 20min / Air / GF 50/80 ===\n');

// Step 1: Simulate bottom phase
const maxDepth = 30;
const bottomTime = 20;  // Total time including descent
const descentTime = maxDepth / DESCENT_SPEED;

console.log(`Descent: ${descentTime.toFixed(2)} min`);
console.log(`Bottom time (total): ${bottomTime} min`);
console.log(`Actual time at depth: ${(bottomTime - descentTime).toFixed(2)} min`);
console.log('');

// Initialize tissues
const initialN2 = getInitialTissueN2(N2_FRACTION);
let tissues = {};
COMPARTMENTS.forEach(comp => {
    tissues[comp.id] = initialN2;
});

// Simulate descent
tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, N2_FRACTION);

// Simulate bottom time
const actualBottomDuration = bottomTime - descentTime;
tissues = simulateDepthTime(tissues, maxDepth, actualBottomDuration, N2_FRACTION);

console.log('Tissue pressures at end of bottom phase:');
for (const id of Object.keys(tissues).sort((a,b) => Number(a) - Number(b))) {
    console.log(`  Tissue ${id}: ${tissues[id].toFixed(4)} bar`);
}
console.log('');

// Step 2: Generate deco schedule
const schedule = generateDecoSchedule(tissues, maxDepth, N2_FRACTION, gfLow, gfHigh);

console.log('=== Deco Schedule (from generateDecoSchedule) ===');
console.log(`pAnchor: ${schedule.pAnchor.toFixed(4)} bar = ${schedule.anchorDepth.toFixed(2)} m`);
console.log('');
console.log('Stops:');
if (schedule.stops.length === 0) {
    console.log('  (no deco required)');
} else {
    for (const stop of schedule.stops) {
        console.log(`  ${stop.depth}m: ${stop.time} min`);
    }
}
console.log(`\nTotal ascent time: ${schedule.totalAscentTime.toFixed(2)} min`);
console.log('');

// Step 3: Build the full profile with planned stops
const waypoints = [
    { time: 0, depth: 0 },
    { time: descentTime, depth: maxDepth },
    { time: bottomTime, depth: maxDepth }
];

let currentTime = bottomTime;
let currentDepth = maxDepth;

// Add waypoints for each stop
for (const stop of schedule.stops) {
    // Ascent to stop
    const ascentTime = (currentDepth - stop.depth) / ASCENT_SPEED;
    currentTime += ascentTime;
    waypoints.push({ time: currentTime, depth: stop.depth });
    
    // Wait at stop
    currentTime += stop.time;
    waypoints.push({ time: currentTime, depth: stop.depth });
    
    currentDepth = stop.depth;
}

// Final ascent to surface
if (currentDepth > 0) {
    const finalAscentTime = currentDepth / ASCENT_SPEED;
    currentTime += finalAscentTime;
    waypoints.push({ time: currentTime, depth: 0 });
}

console.log('=== Generated Waypoints ===');
for (const wp of waypoints) {
    console.log(`  t=${wp.time.toFixed(2)} min, depth=${wp.depth}m`);
}
console.log('');

// Step 4: Calculate tissue loading for the full profile
const results = calculateTissueLoading(waypoints, N2_FRACTION);

// Step 5: Calculate ceiling time series
const { ceilingDepths, gfValues, pAnchor: computedPAnchor } = calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh);

console.log('=== Ceiling at key moments ===');
console.log(`Ceiling time series pAnchor: ${computedPAnchor.toFixed(4)} bar`);
console.log('');

// Find the moment of arrival at first stop
if (schedule.stops.length > 0) {
    const firstStopDepth = schedule.stops[0].depth;
    console.log(`First deco stop: ${firstStopDepth}m`);
    
    // Find the index where we first arrive at first stop depth
    for (let i = 0; i < results.timePoints.length; i++) {
        const depth = results.depthPoints[i];
        const ceiling = ceilingDepths[i];
        const gf = gfValues[i];
        
        // Check if we're arriving at first stop (within tolerance)
        if (Math.abs(depth - firstStopDepth) < 0.5 && i > 0 && results.depthPoints[i-1] > firstStopDepth) {
            console.log(`\nArrival at ${firstStopDepth}m:`);
            console.log(`  Time: ${results.timePoints[i].toFixed(2)} min`);
            console.log(`  Actual depth: ${depth.toFixed(2)}m`);
            console.log(`  Ceiling: ${ceiling.toFixed(2)}m`);
            console.log(`  GF used: ${(gf * 100).toFixed(1)}%`);
            console.log(`  Ceiling < depth? ${ceiling < depth ? 'YES' : 'NO'}`);
            break;
        }
    }
    
    // Also show the ceiling BEFORE the first stop (at the end of bottom time)
    for (let i = 0; i < results.timePoints.length; i++) {
        if (results.depthPoints[i] === maxDepth && 
            i + 1 < results.timePoints.length && 
            results.depthPoints[i+1] < maxDepth) {
            console.log(`\nAt start of ascent (t=${results.timePoints[i].toFixed(2)} min, depth=${maxDepth}m):`);
            console.log(`  Ceiling: ${ceilingDepths[i].toFixed(2)}m`);
            console.log(`  GF used: ${(gfValues[i] * 100).toFixed(1)}%`);
            break;
        }
    }
}
