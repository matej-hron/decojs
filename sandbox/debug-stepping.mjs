/**
 * Debug: Trace the exact difference between calculateTissueLoading and manual simulation
 */

import { 
    calculateTissueLoading,
    N2_FRACTION,
    getInitialTissueN2,
    getAlveolarN2Pressure,
    getAmbientPressure,
    haldaneEquation,
    schreinerEquation,
    CALC_INTERVAL
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';

const maxDepth = 30;
const bottomTime = 20;
const descentTime = 1.5; // 30m / 20m/min

console.log('=== Tracing tissue loading calculation ===\n');
console.log(`CALC_INTERVAL: ${CALC_INTERVAL} seconds`);
console.log('');

// Profile
const waypoints = [
    { time: 0, depth: 0 },
    { time: descentTime, depth: maxDepth },
    { time: bottomTime, depth: maxDepth }
];

console.log('Profile:');
for (const wp of waypoints) {
    console.log(`  t=${wp.time.toFixed(2)} min, depth=${wp.depth}m`);
}
console.log('');

// Method 1: calculateTissueLoading step by step
console.log('=== calculateTissueLoading internals ===\n');

const results = calculateTissueLoading(waypoints, N2_FRACTION);

// Show time points around key transitions
console.log('Time points around descent end:');
for (let i = 0; i < results.timePoints.length && results.timePoints[i] <= 3; i++) {
    const t = results.timePoints[i];
    const d = results.depthPoints[i];
    const p1 = results.compartments[1].pressures[i];
    console.log(`  t=${t.toFixed(4)}, depth=${d.toFixed(2)}m, tissue1=${p1.toFixed(6)} bar`);
}
console.log('');

// Show time points at end of bottom time
console.log('Time points near end of bottom:');
const lastIndex = results.timePoints.length - 1;
for (let i = Math.max(0, lastIndex - 5); i <= lastIndex && results.timePoints[i] <= 21; i++) {
    const t = results.timePoints[i];
    const d = results.depthPoints[i];
    const p1 = results.compartments[1].pressures[i];
    console.log(`  t=${t.toFixed(4)}, depth=${d.toFixed(2)}m, tissue1=${p1.toFixed(6)} bar`);
}
console.log('');

// Method 2: Single-step Schreiner for descent, Haldane for bottom
console.log('=== Manual single-step calculation ===\n');

const initialN2 = getInitialTissueN2(N2_FRACTION);
const comp1 = COMPARTMENTS.find(c => c.id === 1);

console.log(`Initial tissue 1: ${initialN2.toFixed(6)} bar`);

// Descent: 0m -> 30m in 1.5 min
const startAlveolar = getAlveolarN2Pressure(getAmbientPressure(0), N2_FRACTION);
const endAlveolar = getAlveolarN2Pressure(getAmbientPressure(30), N2_FRACTION);
const rate = (endAlveolar - startAlveolar) / descentTime;

console.log(`Descent: startAlv=${startAlveolar.toFixed(6)}, endAlv=${endAlveolar.toFixed(6)}, rate=${rate.toFixed(6)} bar/min`);

const afterDescent = schreinerEquation(initialN2, startAlveolar, rate, descentTime, comp1.halfTime);
console.log(`After descent (Schreiner): tissue1=${afterDescent.toFixed(6)} bar`);

// Bottom: stay at 30m for (20 - 1.5) = 18.5 min
const actualBottomDuration = bottomTime - descentTime;
const bottomAlveolar = getAlveolarN2Pressure(getAmbientPressure(30), N2_FRACTION);
console.log(`Bottom: alveolar=${bottomAlveolar.toFixed(6)}, duration=${actualBottomDuration.toFixed(2)} min`);

const afterBottom = haldaneEquation(afterDescent, bottomAlveolar, actualBottomDuration, comp1.halfTime);
console.log(`After bottom (Haldane): tissue1=${afterBottom.toFixed(6)} bar`);

// Compare
const waypointResult = results.compartments[1].pressures[results.timePoints.indexOf(bottomTime)];
console.log('');
console.log('Comparison at t=20:');
console.log(`  calculateTissueLoading: ${waypointResult?.toFixed(6) || 'N/A'} bar`);
console.log(`  Manual single-step:     ${afterBottom.toFixed(6)} bar`);
console.log(`  Difference:             ${((afterBottom - (waypointResult || 0)) * 1000).toFixed(3)} mbar`);

// Let's also check: does the discretized version converge?
console.log('\n=== Discrete stepping simulation ===\n');

const stepSize = CALC_INTERVAL / 60; // Convert to minutes
let t = 0;
let tissue1 = initialN2;
let depth = 0;

// Simulate with same stepping as calculateTissueLoading
while (t < bottomTime) {
    let nextT = t + stepSize;
    
    // Don't cross waypoint boundaries
    for (const wp of waypoints) {
        if (t < wp.time && nextT > wp.time) {
            nextT = wp.time;
            break;
        }
    }
    
    const dt = nextT - t;
    
    // Calculate depth at current and next time
    let currentDepth, nextDepth;
    
    // Find segment for t
    if (t <= descentTime) {
        currentDepth = t / descentTime * maxDepth;
    } else {
        currentDepth = maxDepth;
    }
    
    if (nextT <= descentTime) {
        nextDepth = nextT / descentTime * maxDepth;
    } else {
        nextDepth = maxDepth;
    }
    
    const currentAlv = getAlveolarN2Pressure(getAmbientPressure(currentDepth), N2_FRACTION);
    const nextAlv = getAlveolarN2Pressure(getAmbientPressure(nextDepth), N2_FRACTION);
    const stepRate = (nextAlv - currentAlv) / dt;
    
    if (Math.abs(stepRate) < 0.0001) {
        tissue1 = haldaneEquation(tissue1, currentAlv, dt, comp1.halfTime);
    } else {
        tissue1 = schreinerEquation(tissue1, currentAlv, stepRate, dt, comp1.halfTime);
    }
    
    t = nextT;
}

console.log(`After discrete stepping: tissue1=${tissue1.toFixed(6)} bar`);
console.log(`Difference from single-step: ${((afterBottom - tissue1) * 1000).toFixed(3)} mbar`);
console.log(`Difference from calculateTissueLoading: ${((waypointResult - tissue1) * 1000).toFixed(3)} mbar`);
