import { 
    calculateCeilingTimeSeriesDetailed,
    calculateTissueLoading,
    N2_FRACTION
} from '../js/decoModel.js';

// Simulate the dive profile user is testing: 30m/20min, skip 9m stop
const waypoints = [
    { time: 0, depth: 0 },
    { time: 1.5, depth: 30 },      // Descent
    { time: 20, depth: 30 },       // Bottom
    { time: 22.4, depth: 6 },      // Direct to 6m (skip 9m)
    { time: 23.4, depth: 6 },      // 1min at 6m
    { time: 23.7, depth: 3 },      // Ascent to 3m
    { time: 27.7, depth: 3 },      // 4min at 3m  
    { time: 28, depth: 0 },        // Surface
];

const gfLow = 0.5;
const gfHigh = 0.8;

// Calculate tissue loading
const results = calculateTissueLoading(waypoints, N2_FRACTION);

// Calculate ceiling with GF ramp
const { ceilingDepths, gfValues, pAnchor } = calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh);

console.log('=== Ceiling analysis for profile skipping 9m stop ===');
console.log('pAnchor:', pAnchor.toFixed(4), 'bar =', ((pAnchor - 1) * 10).toFixed(2), 'm');
console.log('');
console.log('Time points where ceiling > depth (violations):');
console.log('');

let violationCount = 0;
let maxViolation = 0;
let maxViolationTime = 0;
let maxViolationDepth = 0;

for (let i = 0; i < results.timePoints.length; i++) {
    const time = results.timePoints[i];
    const depth = results.depthPoints[i];
    const ceiling = ceilingDepths[i];
    const gf = gfValues[i];
    
    if (ceiling > depth + 0.001) { // tiny tolerance for floating point
        violationCount++;
        const violation = ceiling - depth;
        if (violation > maxViolation) {
            maxViolation = violation;
            maxViolationTime = time;
            maxViolationDepth = depth;
        }
        if (violationCount <= 10) {
            console.log('  t=' + time.toFixed(1) + 'min, depth=' + depth.toFixed(2) + 'm, ceiling=' + ceiling.toFixed(2) + 'm, GF=' + gf.toFixed(4) + ', violation=' + violation.toFixed(2) + 'm');
        }
    }
}

console.log('');
console.log('Total violation data points:', violationCount);
console.log('Max violation:', maxViolation.toFixed(2), 'm at t=', maxViolationTime.toFixed(1), 'min, depth=', maxViolationDepth.toFixed(2), 'm');
