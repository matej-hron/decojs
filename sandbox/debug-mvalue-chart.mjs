/**
 * Debug M-Value Chart for 30m/20min GF 5/50
 * 
 * Show the tissue trajectory vs GF corridor to find where crossings happen
 */

import { 
    calculateTissueLoading,
    generateDecoSchedule,
    simulateDepthChange,
    simulateDepthTime,
    findGFLowAnchor,
    interpolateGF,
    getMValue,
    getAdjustedMValue,
    getAmbientPressure,
    N2_FRACTION,
    SURFACE_PRESSURE
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';
import { generateDecoProfile } from '../js/diveSetup.js';

const gfLow = 5;   // percentage
const gfHigh = 50;  // percentage

console.log('=== M-Value Chart Debug for 30m/20min GF 5/50 ===\n');

// Generate the profile using the same function as the UI
const gases = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }];
const result = generateDecoProfile(30, 20, gases, gfLow, gfHigh, { enabled: false });

console.log('Generated profile:');
result.waypoints.forEach(wp => {
    console.log(`  t=${wp.time.toFixed(1)}: ${wp.depth}m${wp.gasId ? ` [${wp.gasId}]` : ''}`);
});

console.log(`\nDeco required: ${result.requiresDeco}`);
console.log(`NDL: ${result.ndl.toFixed(1)} min`);
console.log('Deco stops:', result.decoStops);

// Calculate tissue loading for the full profile
const loadingResults = calculateTissueLoading(result.waypoints, N2_FRACTION);

// Find pAnchor (same as chart does)
const maxDepth = Math.max(...loadingResults.depthPoints);
let ascentStartIndex = 0;
for (let i = 0; i < loadingResults.depthPoints.length; i++) {
    if (Math.abs(loadingResults.depthPoints[i] - maxDepth) < 0.5) {
        ascentStartIndex = i;
    }
}

const tissuesAtAscent = {};
for (const compId of Object.keys(loadingResults.compartments)) {
    tissuesAtAscent[compId] = loadingResults.compartments[compId].pressures[ascentStartIndex];
}

const gfLowDec = gfLow / 100;
const gfHighDec = gfHigh / 100;
const { pAnchor } = findGFLowAnchor(tissuesAtAscent, maxDepth, N2_FRACTION, gfLowDec);

console.log(`\npAnchor: ${((pAnchor - 1) * 10).toFixed(2)}m (${pAnchor.toFixed(3)} bar)`);

// Now check tissue trajectory vs GF corridor for TC1
console.log('\n\n=== TC1 Trajectory vs GF Corridor ===\n');
console.log('Time    Depth   pAmb    Tissue  GF_adj_M  GF%     Delta   Status');
console.log('─'.repeat(75));

const tc1 = COMPARTMENTS.find(c => c.id === 1);
let violations = 0;

for (let i = 0; i < loadingResults.timePoints.length; i++) {
    const t = loadingResults.timePoints[i];
    const depth = loadingResults.depthPoints[i];
    const pAmb = loadingResults.ambientPressures[i];
    const pTissue = loadingResults.compartments[1].pressures[i];
    
    // Calculate GF at this ambient pressure using pAnchor-based interpolation
    const gf = interpolateGF(pAmb, pAnchor, gfLowDec, gfHighDec);
    const mAdj = getAdjustedMValue(pAmb, tc1.aN2, tc1.bN2, gf);
    
    const delta = pTissue - mAdj;
    const status = delta > 0.001 ? '⚠️ CROSSES GF LINE' : '';
    if (delta > 0.001) violations++;
    
    // Only show key points (every 0.5 min or depth changes)
    const prevDepth = i > 0 ? loadingResults.depthPoints[i-1] : depth;
    const isDepthChange = Math.abs(depth - prevDepth) > 0.1;
    const isKeyTime = Math.abs(t - Math.round(t * 2) / 2) < 0.1;
    
    if (isDepthChange || isKeyTime || delta > 0) {
        console.log(`${t.toFixed(2).padStart(5)}   ${depth.toFixed(1).padStart(5)}m  ${pAmb.toFixed(3)}   ${pTissue.toFixed(3)}   ${mAdj.toFixed(3)}     ${(gf*100).toFixed(1).padStart(5)}%  ${(delta*1000).toFixed(1).padStart(6)}mb ${status}`);
    }
}

console.log('\n' + (violations > 0 
    ? `⚠️ Found ${violations} time points where TC1 crosses the GF corridor!`
    : '✅ TC1 stays within GF corridor throughout'));

// Check all compartments
console.log('\n\n=== Checking All Compartments ===\n');

for (const comp of COMPARTMENTS) {
    let compViolations = 0;
    let maxViolation = 0;
    let maxViolationTime = 0;
    
    for (let i = 0; i < loadingResults.timePoints.length; i++) {
        const t = loadingResults.timePoints[i];
        const pAmb = loadingResults.ambientPressures[i];
        const pTissue = loadingResults.compartments[comp.id].pressures[i];
        
        const gf = interpolateGF(pAmb, pAnchor, gfLowDec, gfHighDec);
        const mAdj = getAdjustedMValue(pAmb, comp.aN2, comp.bN2, gf);
        
        const delta = pTissue - mAdj;
        if (delta > 0.001) {
            compViolations++;
            if (delta > maxViolation) {
                maxViolation = delta;
                maxViolationTime = t;
            }
        }
    }
    
    if (compViolations > 0) {
        console.log(`TC${comp.id.toString().padStart(2)}: ${compViolations} violations, max ${(maxViolation * 1000).toFixed(1)} mbar at t=${maxViolationTime.toFixed(1)}`);
    }
}
