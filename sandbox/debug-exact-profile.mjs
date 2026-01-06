/**
 * Debug the exact profile from the screenshot
 * TC1 crosses the GF corridor line
 */

import { 
    calculateTissueLoading,
    findGFLowAnchor,
    interpolateGF,
    getMValue,
    getAdjustedMValue,
    getAmbientPressure,
    N2_FRACTION,
    SURFACE_PRESSURE
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';

const gfLow = 0.05;   // 5%
const gfHigh = 0.50;  // 50%

// Exact waypoints from user
const waypoints = [
    { time: 0, depth: 0, gasId: "air" },
    { time: 2, depth: 30, gasId: "air" },
    { time: 20, depth: 30, gasId: "air" },
    { time: 22, depth: 18, gasId: "air" },
    { time: 23, depth: 18, gasId: "air" },
    { time: 24, depth: 12, gasId: "air" },
    { time: 26, depth: 12, gasId: "air" },
    { time: 27, depth: 9, gasId: "air" },
    { time: 30, depth: 9, gasId: "air" },
    { time: 31, depth: 6, gasId: "air" },
    { time: 37, depth: 6, gasId: "air" },
    { time: 38, depth: 3, gasId: "air" },
    { time: 56, depth: 3, gasId: "air" },
    { time: 57, depth: 0, gasId: "air" }
];

console.log('=== Debugging Exact Profile from Screenshot ===\n');

// Calculate tissue loading
const results = calculateTissueLoading(waypoints, N2_FRACTION);

// Find pAnchor
const maxDepth = Math.max(...results.depthPoints);
let ascentStartIndex = 0;
for (let i = 0; i < results.depthPoints.length; i++) {
    if (Math.abs(results.depthPoints[i] - maxDepth) < 0.5) {
        ascentStartIndex = i;
    }
}

const tissuesAtAscent = {};
for (const compId of Object.keys(results.compartments)) {
    tissuesAtAscent[compId] = results.compartments[compId].pressures[ascentStartIndex];
}

const { pAnchor } = findGFLowAnchor(tissuesAtAscent, maxDepth, N2_FRACTION, gfLow);
console.log(`pAnchor: ${pAnchor.toFixed(3)} bar = ${((pAnchor - 1) * 10).toFixed(2)}m\n`);

// Check TC1 specifically during the critical ascent phase (t=20 to t=24)
console.log('=== TC1 During Ascent from 30m to 18m to 12m ===\n');
console.log('Time    Depth   pAmb    Tissue  GF_adj_M  GF%     Delta   Status');
console.log('─'.repeat(75));

const tc1 = COMPARTMENTS.find(c => c.id === 1);
let violations = [];

for (let i = 0; i < results.timePoints.length; i++) {
    const t = results.timePoints[i];
    const depth = results.depthPoints[i];
    const pAmb = results.ambientPressures[i];
    const pTissue = results.compartments[1].pressures[i];
    
    // Calculate GF at this ambient pressure
    const gf = interpolateGF(pAmb, pAnchor, gfLow, gfHigh);
    const mAdj = getAdjustedMValue(pAmb, tc1.aN2, tc1.bN2, gf);
    
    const delta = pTissue - mAdj;
    const status = delta > 0.001 ? '⚠️ VIOLATION' : '';
    
    if (delta > 0.001) {
        violations.push({ t, depth, pAmb, pTissue, mAdj, gf, delta });
    }
    
    // Show ascent phase (t=19 to t=27)
    if (t >= 19 && t <= 27) {
        console.log(`${t.toFixed(2).padStart(5)}   ${depth.toFixed(1).padStart(5)}m  ${pAmb.toFixed(3)}   ${pTissue.toFixed(3)}   ${mAdj.toFixed(3)}     ${(gf*100).toFixed(1).padStart(5)}%  ${(delta*1000).toFixed(1).padStart(6)}mb ${status}`);
    }
}

if (violations.length > 0) {
    console.log(`\n⚠️ Found ${violations.length} time points with GF corridor violations!\n`);
    
    console.log('Worst violations:');
    violations.sort((a, b) => b.delta - a.delta);
    for (const v of violations.slice(0, 5)) {
        console.log(`  t=${v.t.toFixed(2)}: depth=${v.depth.toFixed(1)}m, tissue=${v.pTissue.toFixed(3)} > adjM=${v.mAdj.toFixed(3)} (GF=${(v.gf*100).toFixed(1)}%), Δ=${(v.delta*1000).toFixed(1)}mbar`);
    }
} else {
    console.log('\n✅ No violations found');
}

// Explain why
console.log('\n\n=== Analysis ===\n');
console.log('The GF corridor is a LINE from (pAnchor, M_gfLow) to (surface, M_gfHigh).');
console.log('');
console.log(`pAnchor = ${pAnchor.toFixed(3)} bar (${((pAnchor-1)*10).toFixed(1)}m)`);
console.log(`At pAnchor: GF = ${gfLow*100}%, M_adj = ${getAdjustedMValue(pAnchor, tc1.aN2, tc1.bN2, gfLow).toFixed(3)} bar`);
console.log(`At surface: GF = ${gfHigh*100}%, M_adj = ${getAdjustedMValue(SURFACE_PRESSURE, tc1.aN2, tc1.bN2, gfHigh).toFixed(3)} bar`);
console.log('');
console.log('The corridor is a STRAIGHT line between these two points.');
console.log('But the tissue trajectory is NOT a straight line - it curves.');
console.log('');
console.log('At intermediate depths (between pAnchor and surface), the interpolated GF');
console.log('defines an adjusted M-value that lies ON the corridor line.');
console.log('');
console.log('If the deco scheduler only checks at STOP DEPTHS (18m, 12m, 9m, etc.)');
console.log('but not at intermediate depths DURING ascent between stops,');
console.log('the tissue may briefly exceed the corridor during the ascent phase.');

// Show the corridor vs tissue at key ambient pressures
console.log('\n\n=== GF Corridor vs TC1 Trajectory ===\n');
console.log('pAmb    Depth   GF%     Corridor  TC1_tissue  Delta');
console.log('─'.repeat(60));

for (let pAmb = pAnchor; pAmb >= SURFACE_PRESSURE; pAmb -= 0.1) {
    const depth = (pAmb - 1) * 10;
    const gf = interpolateGF(pAmb, pAnchor, gfLow, gfHigh);
    const corridor = getAdjustedMValue(pAmb, tc1.aN2, tc1.bN2, gf);
    
    // Find tissue pressure at this pAmb
    let tissueAtPAmb = null;
    for (let i = 0; i < results.ambientPressures.length; i++) {
        if (Math.abs(results.ambientPressures[i] - pAmb) < 0.05) {
            tissueAtPAmb = results.compartments[1].pressures[i];
            break;
        }
    }
    
    if (tissueAtPAmb !== null) {
        const delta = tissueAtPAmb - corridor;
        const status = delta > 0 ? '⚠️' : '';
        console.log(`${pAmb.toFixed(2)}    ${depth.toFixed(1).padStart(5)}m  ${(gf*100).toFixed(1).padStart(5)}%   ${corridor.toFixed(3)}     ${tissueAtPAmb.toFixed(3)}       ${(delta*1000).toFixed(1).padStart(6)}mb ${status}`);
    }
}
