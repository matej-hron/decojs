/**
 * Debug script to investigate gas switching during ascent
 * 
 * Issue: When the first deco stop is at 6m, the scheduler switches directly
 * to 100% O2 and skips EAN50. Expected behavior:
 * - Switch to EAN50 at 21m (MOD)
 * - Switch to O2 at 6m (MOD)
 */

import { 
    calculateTissueLoading,
    generateDecoSchedule,
    simulateDepthChange,
    simulateDepthTime,
    N2_FRACTION,
    SURFACE_PRESSURE
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';

// Standard deco gases
const gases = [
    { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
    { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 },
    { id: 'o2', name: 'O2', o2: 1.00, n2: 0.00, he: 0 }
];

// Calculate initial tissue saturated at surface
const initialTissues = {};
for (let i = 1; i <= 16; i++) {
    initialTissues[i] = 0.79 * (SURFACE_PRESSURE - 0.0627); // Surface saturated
}

/**
 * Simulate a dive and check gas switches
 */
function testDive(maxDepth, bottomTime, gfLow, gfHigh, description) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${description}`);
    console.log(`Dive: ${maxDepth}m / ${bottomTime}min, GF ${gfLow*100}/${gfHigh*100}`);
    console.log('='.repeat(60));
    
    let tissues = { ...initialTissues };
    
    // Simulate descent (20 m/min)
    const descentTime = maxDepth / 20;
    tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, N2_FRACTION);
    
    // Simulate time at depth
    const timeAtDepth = bottomTime - descentTime;
    tissues = simulateDepthTime(tissues, maxDepth, timeAtDepth, N2_FRACTION);
    
    console.log(`\nAfter ${bottomTime}min at ${maxDepth}m:`);
    console.log(`  TC4: ${tissues[4].toFixed(3)} bar`);
    console.log(`  TC5: ${tissues[5].toFixed(3)} bar`);
    
    // Generate deco schedule with gases
    const schedule = generateDecoSchedule(tissues, maxDepth, N2_FRACTION, gfLow, gfHigh, gases);
    
    console.log(`\nFirst stop depth: ${schedule.stops.length > 0 ? schedule.stops[0].depth + 'm' : 'none (NDL dive)'}`);
    
    console.log('\nGas Switches:');
    if (schedule.gasSwitches.length === 0) {
        console.log('  (none)');
    } else {
        schedule.gasSwitches.forEach(sw => {
            console.log(`  ${sw.depth}m: switch to ${sw.gas}`);
        });
    }
    
    console.log('\nDeco Stops:');
    if (schedule.stops.length === 0) {
        console.log('  (none - NDL dive)');
    } else {
        schedule.stops.forEach(stop => {
            console.log(`  ${stop.depth}m: ${stop.time} min (${stop.gas})`);
        });
    }
    
    console.log(`\nTotal ascent time: ${schedule.totalAscentTime.toFixed(1)} min`);
    
    // Validate gas switch order
    const expectedSwitches = [];
    
    // EAN50 MOD = (1.6/0.5 - 1) * 10 = 22m -> switch at 21m
    // O2 MOD = (1.6/1.0 - 1) * 10 = 6m -> switch at 6m
    const ean50SwitchDepth = 21;
    const o2SwitchDepth = 6;
    
    if (maxDepth > ean50SwitchDepth) {
        expectedSwitches.push({ depth: ean50SwitchDepth, gas: 'EAN50' });
    }
    if (maxDepth > o2SwitchDepth) {
        expectedSwitches.push({ depth: o2SwitchDepth, gas: 'O2' });
    }
    
    console.log('\nExpected gas switches:');
    expectedSwitches.forEach(sw => {
        console.log(`  ${sw.depth}m: ${sw.gas}`);
    });
    
    // Check if switches are correct
    let allCorrect = true;
    for (const expected of expectedSwitches) {
        const found = schedule.gasSwitches.find(
            sw => sw.depth === expected.depth && sw.gas === expected.gas
        );
        if (!found) {
            console.log(`\n❌ MISSING: Expected ${expected.gas} switch at ${expected.depth}m`);
            allCorrect = false;
        }
    }
    
    if (allCorrect && expectedSwitches.length > 0) {
        console.log('\n✅ All expected gas switches present');
    }
    
    return schedule;
}

// Test Case 1: Shallow dive - first stop likely at 6m
// This should still switch to EAN50 at 21m during ascent!
testDive(30, 15, 1.0, 1.0, 'Shallow dive (30m/15min GF 100/100) - first stop likely at 6m');

// Test Case 2: Medium dive - first stop at deeper depth
testDive(30, 20, 1.0, 1.0, 'Medium dive (30m/20min GF 100/100) - first stop at 9m or deeper');

// Test Case 3: Deep dive with conservative GF
testDive(40, 20, 0.30, 0.70, 'Deep dive (40m/20min GF 30/70) - multiple stops');

// Test Case 4: Very shallow - maybe NDL
testDive(30, 10, 1.0, 1.0, 'Short dive (30m/10min GF 100/100) - likely NDL');

// Test Case 5: Check with conservative GF
testDive(30, 15, 0.30, 0.70, 'Shallow dive conservative (30m/15min GF 30/70)');

console.log('\n' + '='.repeat(60));
console.log('END OF TESTS');
console.log('='.repeat(60));
