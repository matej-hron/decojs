/**
 * Debug: What does generateDecoSchedule actually return?
 */

import { 
    calculateTissueLoading,
    generateDecoSchedule,
    N2_FRACTION
} from '../js/decoModel.js';

// Profile: descent and bottom time
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

console.log('=== generateDecoSchedule output ===\n');

const schedule = generateDecoSchedule(tissuesAtBottom, 30, N2_FRACTION, gfLow, gfHigh);

console.log('pAnchor:', schedule.pAnchor.toFixed(4), 'bar');
console.log('Anchor depth:', schedule.anchorDepth.toFixed(2), 'm');
console.log('');
console.log('Stops:');
for (const stop of schedule.stops) {
    console.log(`  ${stop.depth}m: ${stop.time} min (${stop.gas})`);
}
console.log('');
console.log('Total deco time:', schedule.totalTime.toFixed(2), 'min');
console.log('Total ascent time:', schedule.totalAscentTime.toFixed(2), 'min');
