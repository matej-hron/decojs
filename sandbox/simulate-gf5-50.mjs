/**
 * Simulate 30m/20min with GF 5/50
 * Check if planned deco crosses the interpolated gradient line
 */

import { 
    calculateTissueLoading,
    calculateCeilingTimeSeriesDetailed,
    generateDecoSchedule,
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

console.log('=== 30m/20min with GF 5/50 ===\n');

// First, generate the deco schedule
const initialTissues = {};
for (let i = 1; i <= 16; i++) {
    initialTissues[i] = 0.79 * (SURFACE_PRESSURE - 0.0627); // Surface saturated
}

// Simulate descent and bottom time
const descentTime = 2; // min
const bottomTime = 20; // min at 30m (including descent)
const maxDepth = 30;

// Simple simulation: descend to 30m, stay until t=20
import { simulateDepthChange, simulateDepthTime } from '../js/decoModel.js';

let tissues = { ...initialTissues };

// Descend to 30m
tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, N2_FRACTION);
console.log(`After descent to ${maxDepth}m:`);
console.log(`  TC1: ${tissues[1].toFixed(3)} bar`);

// Stay at 30m for remaining bottom time
const timeAtBottom = bottomTime - descentTime;
tissues = simulateDepthTime(tissues, maxDepth, timeAtBottom, N2_FRACTION);
console.log(`After ${timeAtBottom} min at ${maxDepth}m:`);
console.log(`  TC1: ${tissues[1].toFixed(3)} bar`);
console.log(`  TC4: ${tissues[4].toFixed(3)} bar`);

// Find pAnchor
const anchorResult = findGFLowAnchor(tissues, maxDepth, N2_FRACTION, gfLow);
console.log(`\npAnchor: ${((anchorResult.pAnchor - 1) * 10).toFixed(2)}m`);
console.log(`Leading compartment at pAnchor: TC${anchorResult.leadingCompartment}`);

// Generate deco schedule
const scheduleResult = generateDecoSchedule(tissues, maxDepth, N2_FRACTION, gfLow, gfHigh);
const schedule = scheduleResult.stops;
console.log('\nDeco Schedule:');
console.log(`pAnchor from schedule: ${((scheduleResult.pAnchor - 1) * 10).toFixed(2)}m`);
schedule.forEach(stop => {
    console.log(`  ${stop.depth}m: ${stop.time} min`);
});

// Now build the full profile with deco stops
const waypoints = [
    { time: 0, depth: 0, gasId: "air" },
    { time: descentTime, depth: maxDepth, gasId: "air" },
    { time: bottomTime, depth: maxDepth, gasId: "air" }
];

// Add deco stops
let currentTime = bottomTime;
let currentDepth = maxDepth;
const ascentRate = 10; // m/min

schedule.forEach(stop => {
    // Ascend to stop
    const ascentTime = (currentDepth - stop.depth) / ascentRate;
    currentTime += ascentTime;
    waypoints.push({ time: currentTime, depth: stop.depth, gasId: "air" });
    
    // Stay at stop
    currentTime += stop.time;
    waypoints.push({ time: currentTime, depth: stop.depth, gasId: "air" });
    
    currentDepth = stop.depth;
});

// Final ascent to surface
if (currentDepth > 0) {
    const finalAscentTime = currentDepth / ascentRate;
    currentTime += finalAscentTime;
    waypoints.push({ time: currentTime, depth: 0, gasId: "air" });
}

console.log('\nFull Profile:');
waypoints.forEach(wp => {
    console.log(`  t=${wp.time.toFixed(1)}: ${wp.depth}m`);
});

// Now calculate tissue loading and check for GF violations
console.log('\n\n=== Checking for GF Line Crossings ===\n');

const results = calculateTissueLoading(waypoints, N2_FRACTION);
const { ceilingDepths, gfValues, pAnchor } = calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh);

console.log(`pAnchor from ceiling calc: ${((pAnchor - 1) * 10).toFixed(2)}m\n`);

// For each time point during ascent, check if any tissue exceeds the GF line
let violations = [];
let maxViolation = 0;
let maxViolationTime = 0;
let maxViolationComp = 0;
let maxViolationDetails = null;

console.log('Checking each time point for GF line violations...\n');

// Group violations by phase (before pAnchor, after pAnchor)
let violationsBeforePAnchor = 0;
let violationsAfterPAnchor = 0;

for (let i = 0; i < results.timePoints.length; i++) {
    const t = results.timePoints[i];
    const depth = results.depthPoints[i];
    const pAmb = results.ambientPressures[i];
    const activeGF = gfValues[i];
    
    // Check each compartment
    for (const comp of COMPARTMENTS) {
        const pTissue = results.compartments[comp.id].pressures[i];
        const rawMValue = getMValue(pAmb, comp.aN2, comp.bN2);
        const adjustedMValue = getAdjustedMValue(pAmb, comp.aN2, comp.bN2, activeGF);
        
        // Tissue exceeds adjusted M-value?
        if (pTissue > adjustedMValue + 0.001) {  // Small tolerance
            const overshoot = pTissue - adjustedMValue;
            const overshootPct = (overshoot / (rawMValue - pAmb)) * 100;
            
            if (pAmb >= pAnchor) {
                violationsBeforePAnchor++;
            } else {
                violationsAfterPAnchor++;
            }
            
            violations.push({
                time: t,
                depth: depth,
                comp: comp.id,
                pTissue: pTissue,
                adjustedM: adjustedMValue,
                rawM: rawMValue,
                pAmb: pAmb,
                activeGF: activeGF,
                overshoot: overshoot,
                overshootPct: overshootPct
            });
            
            if (overshoot > maxViolation) {
                maxViolation = overshoot;
                maxViolationTime = t;
                maxViolationComp = comp.id;
                maxViolationDetails = violations[violations.length - 1];
            }
        }
    }
}

if (violations.length > 0) {
    console.log(`⚠️ Found ${violations.length} GF line crossings!`);
    console.log(`   Before pAnchor (${((pAnchor - 1) * 10).toFixed(1)}m): ${violationsBeforePAnchor}`);
    console.log(`   After pAnchor: ${violationsAfterPAnchor}\n`);
    
    // Group by compartment
    const byComp = {};
    violations.forEach(v => {
        if (!byComp[v.comp]) byComp[v.comp] = [];
        byComp[v.comp].push(v);
    });
    
    console.log('Violations by compartment:');
    for (const [comp, vList] of Object.entries(byComp)) {
        const maxV = vList.reduce((a, b) => a.overshoot > b.overshoot ? a : b);
        console.log(`  TC${comp}: ${vList.length} points, max overshoot ${(maxV.overshoot * 1000).toFixed(1)} mbar at t=${maxV.time.toFixed(1)} (${maxV.depth.toFixed(1)}m)`);
    }
    
    console.log('\nWorst violation:');
    const v = maxViolationDetails;
    console.log(`  Time: ${v.time.toFixed(2)} min`);
    console.log(`  Depth: ${v.depth.toFixed(1)}m`);
    console.log(`  Compartment: TC${v.comp}`);
    console.log(`  Tissue pressure: ${v.pTissue.toFixed(3)} bar`);
    console.log(`  Adjusted M-value: ${v.adjustedM.toFixed(3)} bar (at GF ${(v.activeGF * 100).toFixed(1)}%)`);
    console.log(`  Raw M-value: ${v.rawM.toFixed(3)} bar`);
    console.log(`  Overshoot: ${(v.overshoot * 1000).toFixed(1)} mbar`);
    
    // Show timeline around worst violation
    console.log('\nTimeline around worst violation:');
    const vTime = maxViolationTime;
    for (let i = 0; i < results.timePoints.length; i++) {
        const t = results.timePoints[i];
        if (t >= vTime - 1 && t <= vTime + 1) {
            const depth = results.depthPoints[i];
            const pAmb = results.ambientPressures[i];
            const activeGF = gfValues[i];
            const pTissue = results.compartments[maxViolationComp].pressures[i];
            const comp = COMPARTMENTS.find(c => c.id === maxViolationComp);
            const adjustedM = getAdjustedMValue(pAmb, comp.aN2, comp.bN2, activeGF);
            const delta = pTissue - adjustedM;
            const marker = delta > 0 ? '⚠️' : '✅';
            console.log(`  t=${t.toFixed(2)}, d=${depth.toFixed(1)}m, GF=${(activeGF*100).toFixed(1)}%, TC${maxViolationComp}=${pTissue.toFixed(3)}, adjM=${adjustedM.toFixed(3)}, Δ=${(delta*1000).toFixed(1)}mbar ${marker}`);
        }
    }
} else {
    console.log('✅ No GF line crossings found');
}

console.log('\n\n=== Analysis ===\n');
console.log('With GF 5/50, the gradient factor starts at only 5% at pAnchor.');
console.log('This means virtually no supersaturation is allowed at the first stop.');
console.log('');
console.log('The deco scheduler checks ceiling at DESTINATION depth after each ascent,');
console.log('but does NOT check intermediate points during the 10 m/min ascent.');
console.log('');
console.log('With very low GF Low (5%), the allowed M-value at pAnchor is barely above');
console.log('ambient pressure, so any tissue pressure that worked at a deeper stop');
console.log('may exceed the stricter limit when ascending toward pAnchor.');

// Show specific M-value limits at key depths
console.log('\n\n=== M-Value Limits at Key Depths ===\n');
const tc1 = COMPARTMENTS.find(c => c.id === 1);
const keyDepths = [18, 15, 12, 9, 6, 3, 0];
console.log('Depth   pAmb    GF      M_raw   M_adj   Tissue1');
console.log('─'.repeat(55));
for (const d of keyDepths) {
    const pAmb = getAmbientPressure(d);
    const gf = interpolateGF(pAmb, pAnchor, gfLow, gfHigh);
    const mRaw = getMValue(pAmb, tc1.aN2, tc1.bN2);
    const mAdj = getAdjustedMValue(pAmb, tc1.aN2, tc1.bN2, gf);
    
    // Find tissue pressure at this depth from profile
    const idx = results.depthPoints.findIndex((dp, i) => 
        Math.abs(dp - d) < 0.5 && results.timePoints[i] > 20
    );
    const pTissue = idx >= 0 ? results.compartments[1].pressures[idx] : 'N/A';
    const pTissueStr = typeof pTissue === 'number' ? pTissue.toFixed(3) : pTissue;
    
    console.log(`${d.toString().padStart(3)}m   ${pAmb.toFixed(2)}    ${(gf*100).toFixed(1).padStart(5)}%  ${mRaw.toFixed(3)}   ${mAdj.toFixed(3)}   ${pTissueStr}`);
}
