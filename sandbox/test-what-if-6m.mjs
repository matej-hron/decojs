/**
 * Final test: What happens if diver continues to 6m?
 * 
 * The user's question is: at 9m the ceiling is 6.2m (actually 6.53m per our calcs).
 * If diver continues to 6m, would ceiling exceed 6m?
 */

import { 
    generateDecoSchedule,
    N2_FRACTION,
    getInitialTissueN2,
    simulateDepthChange,
    simulateDepthTime,
    getAmbientPressure,
    interpolateGF,
    getDiveCeiling,
    findGFLowAnchor
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';

const ASCENT_SPEED = 10;

const gfLow = 0.5;
const gfHigh = 0.8;

const maxDepth = 30;
const bottomTime = 20;
const descentTime = 1.5;

console.log('=== What if diver continues to 6m without stopping at 9m? ===\n');

// Simulate to end of bottom time
const initialN2 = getInitialTissueN2(N2_FRACTION);
let tissues = {};
COMPARTMENTS.forEach(comp => {
    tissues[comp.id] = initialN2;
});

tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, N2_FRACTION);
tissues = simulateDepthTime(tissues, maxDepth, bottomTime - descentTime, N2_FRACTION);

// Find pAnchor at start of ascent
const { pAnchor, anchorDepth } = findGFLowAnchor(tissues, maxDepth, N2_FRACTION, gfLow);
console.log(`pAnchor: ${pAnchor.toFixed(4)} bar = ${anchorDepth.toFixed(2)} m\n`);

// Simulate direct ascent from 30m to various depths
console.log('Direct ascent from 30m - ceiling at each candidate depth:\n');
console.log('Depth | Ascent Time | Ceiling | GF   | Ceiling vs Depth');
console.log('------|-------------|---------|------|------------------');

for (let targetDepth = 12; targetDepth >= 0; targetDepth -= 3) {
    const ascentTime = (maxDepth - targetDepth) / ASCENT_SPEED;
    const tissuesAtTarget = simulateDepthChange({ ...tissues }, maxDepth, targetDepth, ascentTime, N2_FRACTION);
    
    const targetAmbient = getAmbientPressure(targetDepth);
    const gf = interpolateGF(targetAmbient, pAnchor, gfLow, gfHigh);
    
    const { ceilingDepth } = getDiveCeiling(tissuesAtTarget, gf);
    
    const status = ceilingDepth <= targetDepth 
        ? '✓ Can stay' 
        : `✗ Ceiling ${(ceilingDepth - targetDepth).toFixed(2)}m ABOVE depth`;
    
    console.log(`${targetDepth.toString().padStart(5)}m | ${ascentTime.toFixed(2).padStart(11)} min | ${ceilingDepth.toFixed(2).padStart(7)}m | ${(gf*100).toFixed(1).padStart(4)}% | ${status}`);
}

console.log('\n=== Answer to the question ===\n');
console.log('At 9m arrival: ceiling is 6.53m which is BELOW 9m → diver can stay');
console.log('At 6m arrival: ceiling would be 6.08m which is ABOVE 6m → diver CANNOT stay!');
console.log('');
console.log('The 9m first stop is CORRECT because:');
console.log('1. pAnchor is at 6.27m (where GF_max first equals GF_low during simulated ascent)');
console.log('2. At 6m (1.6 bar), we are ABOVE pAnchor (1.627 bar)');
console.log('3. So GF is interpolated: GF = 51.3% (not 50%)');
console.log('4. With GF 51.3%, ceiling is 6.08m which exceeds 6m depth');
console.log('5. Therefore first stop must be at 9m where ceiling (6.53m) < depth (9m)');
