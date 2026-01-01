/**
 * Simple Test Runner for DecoJS
 * 
 * Run with: node tests/run-tests.mjs
 * 
 * No external dependencies required - works with pure Node.js
 */

// ============================================================================
// MINI TEST FRAMEWORK
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let currentSuite = '';

function describe(name, fn) {
    const prevSuite = currentSuite;
    currentSuite = currentSuite ? `${currentSuite} > ${name}` : name;
    console.log(`\n📦 ${currentSuite}`);
    fn();
    currentSuite = prevSuite;
}

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✅ ${name}`);
    } catch (error) {
        failedTests++;
        console.log(`  ❌ ${name}`);
        console.log(`     Error: ${error.message}`);
    }
}

function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected} but got ${actual}`);
            }
        },
        toEqual(expected) {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
            }
        },
        toBeCloseTo(expected, precision = 2) {
            const factor = Math.pow(10, precision);
            if (Math.round(actual * factor) !== Math.round(expected * factor)) {
                throw new Error(`Expected ${expected} (±${1/factor}) but got ${actual}`);
            }
        },
        toBeGreaterThan(expected) {
            if (!(actual > expected)) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        toBeLessThan(expected) {
            if (!(actual < expected)) {
                throw new Error(`Expected ${actual} to be less than ${expected}`);
            }
        },
        toBeGreaterThanOrEqual(expected) {
            if (!(actual >= expected)) {
                throw new Error(`Expected ${actual} to be >= ${expected}`);
            }
        },
        toBeLessThanOrEqual(expected) {
            if (!(actual <= expected)) {
                throw new Error(`Expected ${actual} to be <= ${expected}`);
            }
        },
        toBeNull() {
            if (actual !== null) {
                throw new Error(`Expected null but got ${actual}`);
            }
        },
        not: {
            toBeNaN() {
                if (Number.isNaN(actual)) {
                    throw new Error(`Expected not NaN but got NaN`);
                }
            }
        },
        toHaveProperty(prop) {
            if (!(prop in actual)) {
                throw new Error(`Expected object to have property "${prop}"`);
            }
        },
        toHaveLength(len) {
            if (actual.length !== len) {
                throw new Error(`Expected length ${len} but got ${actual.length}`);
            }
        },
        toContain(item) {
            if (typeof actual === 'string') {
                if (!actual.includes(item)) {
                    throw new Error(`Expected "${actual}" to contain "${item}"`);
                }
            } else if (!actual.includes(item)) {
                throw new Error(`Expected array to contain ${item}`);
            }
        }
    };
}

// ============================================================================
// IMPORT MODULES
// ============================================================================

import {
    getDefaultSetup,
    extendDiveSetup,
    getDiveSetupWaypoints,
    getSurfaceInterval,
    formatDiveSetupSummary,
    generateSimpleProfile,
    clearCache,
    getGases,
    getGasAtWaypoint,
    getGasAtTime,
    getGasSwitchEvents,
    insertGasSwitchWaypoints,
    calculateMOD
} from '../js/diveSetup.js';

import {
    createDefaultProfile,
    validateProfile,
    parseProfileInput,
    calculateRates,
    getDiveStats
} from '../js/diveProfile.js';

import {
    SURFACE_PRESSURE,
    WATER_VAPOR_PRESSURE,
    N2_FRACTION,
    PRESSURE_PER_METER,
    getAmbientPressure,
    getAlveolarN2Pressure,
    getInitialTissueN2,
    haldaneEquation,
    schreinerEquation
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';

// ============================================================================
// DIVE SETUP TESTS
// ============================================================================

describe('diveSetup', () => {
    describe('getDefaultSetup', () => {
        test('returns a valid dive setup object', () => {
            const setup = getDefaultSetup();
            expect(setup).toHaveProperty('name');
            expect(setup).toHaveProperty('gases');
            expect(setup).toHaveProperty('dives');
        });

        test('has valid gas mix totaling 100%', () => {
            const setup = getDefaultSetup();
            const gas = setup.gases[0];
            const total = gas.o2 + gas.n2 + gas.he;
            expect(total).toBeCloseTo(1.0, 5);
        });

        test('has waypoints starting at surface', () => {
            const setup = getDefaultSetup();
            const waypoints = setup.dives[0].waypoints;
            expect(waypoints[0].time).toBe(0);
            expect(waypoints[0].depth).toBe(0);
        });

        test('waypoints have ascending time values', () => {
            const setup = getDefaultSetup();
            const waypoints = setup.dives[0].waypoints;
            for (let i = 1; i < waypoints.length; i++) {
                expect(waypoints[i].time).toBeGreaterThan(waypoints[i - 1].time);
            }
        });
    });

    describe('extendDiveSetup', () => {
        test('overrides simple properties', () => {
            const base = getDefaultSetup();
            const extended = extendDiveSetup(base, { name: 'Custom Dive', surfaceInterval: 120 });
            expect(extended.name).toBe('Custom Dive');
            expect(extended.surfaceInterval).toBe(120);
        });

        test('replaces gases array entirely', () => {
            const base = getDefaultSetup();
            const newGases = [{ id: 'bottom', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0, cylinderVolume: 12, startPressure: 200 }];
            const extended = extendDiveSetup(base, { gases: newGases });
            expect(extended.gases).toHaveLength(1);
            expect(extended.gases[0].name).toBe('EAN32');
        });

        test('replaces dives array entirely', () => {
            const base = getDefaultSetup();
            const newDives = [{ waypoints: [{ time: 0, depth: 0 }, { time: 5, depth: 20 }] }];
            const extended = extendDiveSetup(base, { dives: newDives });
            expect(extended.dives[0].waypoints).toHaveLength(2);
        });
    });

    describe('getDiveSetupWaypoints', () => {
        test('extracts waypoints from dives array', () => {
            const setup = {
                dives: [{ waypoints: [{ time: 0, depth: 0, note: 'Start' }] }]
            };
            const waypoints = getDiveSetupWaypoints(setup);
            expect(waypoints[0].time).toBe(0);
            expect(waypoints[0].depth).toBe(0);
        });

        test('preserves gasId in waypoints', () => {
            const setup = { 
                dives: [{
                    waypoints: [
                        { time: 0, depth: 0, gasId: 'bottom' },
                        { time: 5, depth: 30, gasId: 'bottom' },
                        { time: 25, depth: 30, gasId: 'bottom' },
                        { time: 28, depth: 6, gasId: 'deco' }
                    ] 
                }]
            };
            const waypoints = getDiveSetupWaypoints(setup);
            expect(waypoints[0].gasId).toBe('bottom');
            expect(waypoints[3].gasId).toBe('deco');
        });

        test('merges multi-dive format into timeline', () => {
            const setup = {
                dives: [
                    { waypoints: [{ time: 0, depth: 0 }, { time: 10, depth: 20 }, { time: 20, depth: 0 }] },
                    { surfaceIntervalBefore: 60, waypoints: [{ time: 0, depth: 0 }, { time: 10, depth: 15 }, { time: 20, depth: 0 }] }
                ]
            };
            const waypoints = getDiveSetupWaypoints(setup);
            expect(waypoints).toHaveLength(6);
            expect(waypoints[3].time).toBe(80); // 20 + 60 = 80
            expect(waypoints[5].time).toBe(100); // 80 + 20 = 100
        });

        test('returns empty for missing dives', () => {
            const setup = {};
            const waypoints = getDiveSetupWaypoints(setup);
            expect(waypoints).toEqual([]);
        });
    });

    describe('getSurfaceInterval', () => {
        test('returns surface interval from setup', () => {
            expect(getSurfaceInterval({ surfaceInterval: 90 })).toBe(90);
        });

        test('returns default 60 if not set', () => {
            expect(getSurfaceInterval({})).toBe(60);
        });
    });

    describe('formatDiveSetupSummary', () => {
        test('includes key dive info', () => {
            const setup = getDefaultSetup();
            const summary = formatDiveSetupSummary(setup);
            expect(summary).toContain(setup.name);
            expect(summary).toContain('40m');
        });
    });

    describe('generateSimpleProfile', () => {
        test('generates profile with 6 waypoints', () => {
            const waypoints = generateSimpleProfile(30, 20);
            expect(waypoints).toHaveLength(6);
        });

        test('starts and ends at surface', () => {
            const waypoints = generateSimpleProfile(30, 20);
            expect(waypoints[0]).toEqual({ time: 0, depth: 0 });
            expect(waypoints[5].depth).toBe(0);
        });

        test('reaches max depth', () => {
            const waypoints = generateSimpleProfile(40, 25);
            const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
            expect(maxDepth).toBe(40);
        });

        test('includes 3 min safety stop at 5m', () => {
            const waypoints = generateSimpleProfile(30, 20);
            // Find safety stop waypoints (at 5m)
            const safetyStopWaypoints = waypoints.filter(wp => wp.depth === 5);
            expect(safetyStopWaypoints).toHaveLength(2);
            // Safety stop should be 3 minutes
            const duration = safetyStopWaypoints[1].time - safetyStopWaypoints[0].time;
            expect(duration).toBe(3);
        });

        test('calculates descent time correctly (20 m/min)', () => {
            // 40m at 20 m/min = 2 min (exactly)
            const waypoints = generateSimpleProfile(40, 20);
            expect(waypoints[1].time).toBe(2);
            // 30m at 20 m/min = 1.5 min, rounded up = 2 min
            const waypoints2 = generateSimpleProfile(30, 20);
            expect(waypoints2[1].time).toBe(2);
        });

        test('rounds times up to full minutes', () => {
            // 25m at 20 m/min = 1.25 min, should round up to 2 min
            const waypoints = generateSimpleProfile(25, 15);
            // All times should be integers
            for (const wp of waypoints) {
                expect(Number.isInteger(wp.time)).toBe(true);
            }
            expect(waypoints[1].time).toBe(2);
        });

        test('maintains correct bottom time', () => {
            const waypoints = generateSimpleProfile(30, 20);
            // Descent: 30m / 20 = 1.5 → 2 min
            // Bottom time start at 2 min, end at 2 + 20 = 22 min
            expect(waypoints[1].time).toBe(2);  // Arrive at depth
            expect(waypoints[2].time).toBe(22); // Leave depth
        });

        test('waypoints have ascending time values', () => {
            const waypoints = generateSimpleProfile(35, 18);
            for (let i = 1; i < waypoints.length; i++) {
                expect(waypoints[i].time).toBeGreaterThan(waypoints[i - 1].time);
            }
        });
    });

    // Multi-gas tests
    describe('getGases', () => {
        test('returns gases array if present', () => {
            const setup = {
                gases: [
                    { id: 'bottom', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0, cylinderVolume: 12, startPressure: 200 },
                    { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0, cylinderVolume: 7, startPressure: 200 }
                ]
            };
            const gases = getGases(setup);
            expect(gases.length).toBe(2);
            expect(gases[0].name).toBe('EAN32');
            expect(gases[1].name).toBe('EAN50');
        });

        test('returns default air if no gases', () => {
            const setup = {};
            const gases = getGases(setup);
            expect(gases.length).toBe(1);
            expect(gases[0].o2).toBe(0.21);
            expect(gases[0].n2).toBe(0.79);
        });

        test('gases have cylinder info', () => {
            const setup = getDefaultSetup();
            const gases = getGases(setup);
            expect(gases[0].cylinderVolume).toBe(12);
            expect(gases[0].startPressure).toBe(200);
        });
    });

    describe('getGasAtWaypoint', () => {
        test('returns gas by gasId on waypoint', () => {
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }
            ];
            const waypoint = { time: 30, depth: 6, gasId: 'deco' };
            const gas = getGasAtWaypoint(waypoint, gases);
            expect(gas.name).toBe('EAN50');
        });

        test('returns first gas if no gasId', () => {
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }
            ];
            const waypoint = { time: 5, depth: 30 };
            const gas = getGasAtWaypoint(waypoint, gases);
            expect(gas.name).toBe('Air');
        });
    });

    describe('getGasAtTime', () => {
        test('returns gas active at given time', () => {
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 5, depth: 30 },
                { time: 25, depth: 30 },
                { time: 28, depth: 6, gasId: 'deco' },
                { time: 31, depth: 6 },
                { time: 32, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }
            ];
            // At time 10, should be on bottom gas (Air)
            expect(getGasAtTime(waypoints, gases, 10).name).toBe('Air');
            // At time 30, should be on deco gas (EAN50)
            expect(getGasAtTime(waypoints, gases, 30).name).toBe('EAN50');
        });

        test('gas changes discretely at switch time, not interpolated', () => {
            // Gas switch happens at time 49
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 48, depth: 9, gasId: 'bottom' },
                { time: 49, depth: 6, gasId: 'deco' },
                { time: 60, depth: 6, gasId: 'deco' }
            ];
            const gases = [
                { id: 'bottom', name: 'Trimix', o2: 0.18, n2: 0.37, he: 0.45 },
                { id: 'deco', name: 'Oxygen', o2: 1.0, n2: 0, he: 0 }
            ];
            
            // Just before switch time - should still be on bottom gas
            expect(getGasAtTime(waypoints, gases, 48).o2).toBe(0.18);
            expect(getGasAtTime(waypoints, gases, 48.5).o2).toBe(0.18);
            expect(getGasAtTime(waypoints, gases, 48.9).o2).toBe(0.18);
            
            // At and after switch time - should be on deco gas
            expect(getGasAtTime(waypoints, gases, 49).o2).toBe(1.0);
            expect(getGasAtTime(waypoints, gases, 49.1).o2).toBe(1.0);
            expect(getGasAtTime(waypoints, gases, 50).o2).toBe(1.0);
        });
    });

    describe('getGasSwitchEvents', () => {
        test('returns empty array for single gas', () => {
            const waypoints = [
                { time: 0, depth: 0, gasId: 'gas-1' },
                { time: 5, depth: 30 },
                { time: 25, depth: 30 },
                { time: 30, depth: 0 }
            ];
            const gases = [{ id: 'gas-1', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
            const events = getGasSwitchEvents(waypoints, gases);
            expect(events.length).toBe(0);
        });

        test('detects gas switch events', () => {
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 5, depth: 30, gasId: 'bottom' },
                { time: 25, depth: 30, gasId: 'bottom' },
                { time: 28, depth: 6, gasId: 'deco' },
                { time: 31, depth: 6, gasId: 'deco' },
                { time: 32, depth: 0, gasId: 'deco' }
            ];
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }
            ];
            const events = getGasSwitchEvents(waypoints, gases);
            expect(events.length).toBe(1);
            expect(events[0].time).toBe(28);
            expect(events[0].toGas.name).toBe('EAN50');
            expect(events[0].fromGas.name).toBe('Air');
        });
    });

    describe('calculateMOD', () => {
        test('calculates MOD for EAN32 at 1.4 ppO2', () => {
            // MOD = floor((1.4 / 0.32 - 1) * 10) = floor(33.75) = 33m
            const mod = calculateMOD(0.32, 1.4);
            expect(mod).toBe(33);
        });

        test('calculates MOD for Oxygen at 1.6 ppO2', () => {
            // MOD = floor((1.6 / 1.0 - 1) * 10) = 6m
            const mod = calculateMOD(1.0, 1.6);
            expect(mod).toBe(6);
        });
    });

    describe('insertGasSwitchWaypoints', () => {
        test('inserts deco gas switch during ascent', () => {
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 2, depth: 40 },
                { time: 22, depth: 40 },
                { time: 28, depth: 5 },
                { time: 31, depth: 5 },
                { time: 32, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }  // MOD = 22m at 1.6 ppO2
            ];
            const result = insertGasSwitchWaypoints(waypoints, gases, 10, 1.6);
            // Should have inserted a gas switch waypoint
            const switchWp = result.find(wp => wp.gasId === 'deco');
            expect(switchWp !== undefined).toBe(true);
            // EAN50 MOD at 1.6 ppO2 = 22m, rounded down to 3m increment = 21m
            expect(switchWp.depth).toBe(21);
        });

        test('merges gas switch with existing deco stop at same depth', () => {
            // Profile with an existing deco stop at 6m
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 2, depth: 40 },
                { time: 22, depth: 40 },
                { time: 26, depth: 6 },   // Arrive at 6m deco stop
                { time: 31, depth: 6 },   // End of 6m deco stop (5 min)
                { time: 32, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'Oxygen', o2: 1.0, n2: 0, he: 0 }  // MOD = 6m at 1.6 ppO2
            ];
            
            const result = insertGasSwitchWaypoints(waypoints, gases, 10, 1.6);
            
            // Should have gas switch at 6m but no extra time added (merged with existing stop)
            const switchWp = result.find(wp => wp.gasId === 'deco');
            expect(switchWp !== undefined).toBe(true);
            expect(switchWp.depth).toBe(6);
            
            // Check that total time is not increased (no extra 3 min for gas switch)
            const endTime = result[result.length - 1].time;
            expect(endTime).toBe(32); // Same as original
        });

        test('does not create duplicate waypoints when gas switch matches existing waypoint time', () => {
            // Deep technical dive profile - the 6m stop starts at time 49
            const waypoints = [
                { time: 0, depth: 0 },
                { time: 3, depth: 55 },
                { time: 18, depth: 55 },
                { time: 22, depth: 21 },
                { time: 25, depth: 21 },
                { time: 26, depth: 18 },
                { time: 29, depth: 18 },
                { time: 30, depth: 15 },
                { time: 34, depth: 15 },
                { time: 35, depth: 12 },
                { time: 40, depth: 12 },
                { time: 41, depth: 9 },
                { time: 48, depth: 9 },
                { time: 49, depth: 6 },   // Arrival at 6m - this is where O2 switch would happen
                { time: 60, depth: 6 },   // End of 6m stop
                { time: 61, depth: 3 },
                { time: 75, depth: 3 },
                { time: 78, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Trimix 18/45', o2: 0.18, n2: 0.37, he: 0.45 },
                { id: 'deco', name: 'Oxygen', o2: 1.0, n2: 0, he: 0 }  // MOD = 6m
            ];
            
            const result = insertGasSwitchWaypoints(waypoints, gases, 10, 1.6);
            
            // Should not have duplicate waypoints at same time
            const times = result.map(wp => wp.time);
            const uniqueTimes = [...new Set(times)];
            expect(times.length).toBe(uniqueTimes.length);
            
            // All waypoints should have ascending times (validation requirement)
            for (let i = 1; i < result.length; i++) {
                expect(result[i].time).toBeGreaterThan(result[i-1].time);
            }
        });

        test('gas switch events are detected when merged with existing deco stop', () => {
            // Deep technical dive profile - the 6m stop starts at time 49
            const waypoints = [
                { time: 0, depth: 0 },
                { time: 3, depth: 55 },
                { time: 18, depth: 55 },
                { time: 22, depth: 21 },
                { time: 25, depth: 21 },
                { time: 48, depth: 9 },
                { time: 49, depth: 6 },   // Arrival at 6m - this is where O2 switch would happen
                { time: 60, depth: 6 },   // End of 6m stop
                { time: 61, depth: 3 },
                { time: 75, depth: 3 },
                { time: 78, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Trimix 18/45', o2: 0.18, n2: 0.37, he: 0.45 },
                { id: 'deco', name: 'Oxygen', o2: 1.0, n2: 0, he: 0 }  // MOD = 6m
            ];
            
            const result = insertGasSwitchWaypoints(waypoints, gases, 10, 1.6);
            
            // Verify gasId is set correctly on waypoints around the switch
            const wp48 = result.find(wp => wp.time === 48);
            const wp49 = result.find(wp => wp.time === 49);
            expect(wp48.gasId).toBe('bottom');
            expect(wp49.gasId).toBe('deco');
            
            // Verify getGasSwitchEvents detects the switch
            const gasSwitchEvents = getGasSwitchEvents(result, gases);
            expect(gasSwitchEvents.length).toBe(1);
            expect(gasSwitchEvents[0].time).toBe(49);
            expect(gasSwitchEvents[0].depth).toBe(6);
            expect(gasSwitchEvents[0].toGas.id).toBe('deco');
        });
    });
});

// ============================================================================
// DIVE PROFILE TESTS
// ============================================================================

describe('diveProfile', () => {
    describe('createDefaultProfile', () => {
        test('returns an array of waypoints', () => {
            const profile = createDefaultProfile();
            expect(Array.isArray(profile)).toBe(true);
        });

        test('starts at surface', () => {
            const profile = createDefaultProfile();
            expect(profile[0].time).toBe(0);
            expect(profile[0].depth).toBe(0);
        });

        test('ends at surface', () => {
            const profile = createDefaultProfile();
            expect(profile[profile.length - 1].depth).toBe(0);
        });
    });

    describe('validateProfile', () => {
        test('valid profile passes', () => {
            const result = validateProfile(createDefaultProfile());
            expect(result.valid).toBe(true);
        });

        test('rejects non-array', () => {
            const result = validateProfile('not an array');
            expect(result.valid).toBe(false);
        });

        test('rejects less than 2 waypoints', () => {
            const result = validateProfile([{ time: 0, depth: 0 }]);
            expect(result.valid).toBe(false);
        });

        test('rejects profile not starting at time 0', () => {
            const result = validateProfile([{ time: 5, depth: 0 }, { time: 10, depth: 20 }]);
            expect(result.valid).toBe(false);
        });

        test('rejects non-ascending times', () => {
            const result = validateProfile([
                { time: 0, depth: 0 },
                { time: 10, depth: 20 },
                { time: 5, depth: 10 }
            ]);
            expect(result.valid).toBe(false);
        });
    });

    describe('calculateRates', () => {
        test('calculates descent rate', () => {
            const rates = calculateRates([{ time: 0, depth: 0 }, { time: 2, depth: 40 }]);
            expect(rates[0].rate).toBe(20);
            expect(rates[0].type).toBe('descent');
        });

        test('calculates ascent rate', () => {
            const rates = calculateRates([{ time: 0, depth: 40 }, { time: 4, depth: 0 }]);
            expect(rates[0].rate).toBe(10);
            expect(rates[0].type).toBe('ascent');
        });
    });

    describe('getDiveStats', () => {
        test('returns null for invalid profile', () => {
            expect(getDiveStats(null)).toBeNull();
            expect(getDiveStats([])).toBeNull();
        });

        test('calculates max depth', () => {
            const stats = getDiveStats([
                { time: 0, depth: 0 },
                { time: 10, depth: 40 },
                { time: 20, depth: 0 }
            ]);
            expect(stats.maxDepth).toBe(40);
        });
    });
});

// ============================================================================
// DECO MODEL TESTS
// ============================================================================

describe('decoModel', () => {
    describe('getAmbientPressure', () => {
        test('surface pressure is 1 bar', () => {
            expect(getAmbientPressure(0)).toBe(1.0);
        });

        test('10m depth adds 1 bar', () => {
            expect(getAmbientPressure(10)).toBe(2.0);
        });

        test('40m depth is 5 bar', () => {
            expect(getAmbientPressure(40)).toBe(5.0);
        });
    });

    describe('getAlveolarN2Pressure', () => {
        test('at surface is about 0.74 bar', () => {
            const alveolar = getAlveolarN2Pressure(SURFACE_PRESSURE);
            expect(alveolar).toBeCloseTo(0.7405, 2);  // 2 decimal precision
        });

        test('increases with ambient pressure', () => {
            const atSurface = getAlveolarN2Pressure(1.0);
            const at40m = getAlveolarN2Pressure(5.0);
            expect(at40m).toBeGreaterThan(atSurface);
        });
    });

    describe('haldaneEquation', () => {
        test('at time 0, returns initial pressure', () => {
            const result = haldaneEquation(0.74, 3.9, 0, 5);
            expect(result).toBeCloseTo(0.74, 5);
        });

        test('after one half-time, tissue is 50% saturated', () => {
            const result = haldaneEquation(1.0, 3.0, 10, 10);
            expect(result).toBeCloseTo(2.0, 5);  // 1.0 + 0.5 * (3.0 - 1.0)
        });

        test('fast compartment equilibrates faster', () => {
            const fast = haldaneEquation(0.74, 3.9, 10, 5);
            const slow = haldaneEquation(0.74, 3.9, 10, 100);
            expect(fast).toBeGreaterThan(slow);
        });
    });

    describe('schreinerEquation', () => {
        test('at time 0, returns initial pressure', () => {
            const result = schreinerEquation(1.5, 0.74, 0.5, 0, 5);
            expect(result).toBeCloseTo(1.5, 5);
        });

        test('with zero rate, behaves like haldane', () => {
            const schreiner = schreinerEquation(0.74, 2.5, 0, 15, 10);
            const haldane = haldaneEquation(0.74, 2.5, 15, 10);
            expect(schreiner).toBeCloseTo(haldane, 5);
        });
    });

    describe('compartments', () => {
        test('all 16 Bühlmann compartments defined', () => {
            expect(COMPARTMENTS).toHaveLength(16);
        });

        test('half-times are in ascending order', () => {
            for (let i = 1; i < COMPARTMENTS.length; i++) {
                expect(COMPARTMENTS[i].halfTime).toBeGreaterThan(COMPARTMENTS[i-1].halfTime);
            }
        });

        test('fastest compartment is 4-6 minutes', () => {
            expect(COMPARTMENTS[0].halfTime).toBeGreaterThanOrEqual(4);
            expect(COMPARTMENTS[0].halfTime).toBeLessThanOrEqual(6);
        });
    });
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(50));
console.log(`📊 Test Results: ${passedTests}/${totalTests} passed`);
if (failedTests > 0) {
    console.log(`❌ ${failedTests} test(s) failed`);
    process.exit(1);
} else {
    console.log('✅ All tests passed!');
    process.exit(0);
}
