/**
 * Tests for decoModel.js module
 */

import {
    CALC_INTERVAL,
    SURFACE_PRESSURE,
    WATER_VAPOR_PRESSURE,
    N2_FRACTION,
    PRESSURE_PER_METER,
    DEFAULT_GF_LOW,
    DEFAULT_GF_HIGH,
    getAmbientPressure,
    getAlveolarN2Pressure,
    getInitialTissueN2,
    haldaneEquation,
    schreinerEquation,
    getMValue,
    getAdjustedMValue,
    getCompartmentCeiling,
    getDiveCeiling,
    interpolateGF,
    getFirstStopDepth
} from '../js/decoModel.js';

import { COMPARTMENTS } from '../js/tissueCompartments.js';

describe('decoModel module', () => {
    
    describe('constants', () => {
        test('SURFACE_PRESSURE is 1 bar', () => {
            expect(SURFACE_PRESSURE).toBe(1.0);
        });

        test('N2_FRACTION is 0.79 for air', () => {
            expect(N2_FRACTION).toBe(0.79);
        });

        test('WATER_VAPOR_PRESSURE is approximately 0.0627 bar', () => {
            expect(WATER_VAPOR_PRESSURE).toBeCloseTo(0.0627, 4);
        });

        test('PRESSURE_PER_METER is 0.1 bar/m', () => {
            expect(PRESSURE_PER_METER).toBe(0.1);
        });
    });

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

        test('linear relationship with depth', () => {
            expect(getAmbientPressure(33)).toBeCloseTo(4.3, 5);
        });
    });

    describe('getAlveolarN2Pressure', () => {
        test('at surface, alveolar N2 is about 0.74 bar', () => {
            const alveolar = getAlveolarN2Pressure(SURFACE_PRESSURE);
            // (1.0 - 0.0627) * 0.79 = 0.7405
            expect(alveolar).toBeCloseTo(0.7405, 4);
        });

        test('increases with ambient pressure', () => {
            const atSurface = getAlveolarN2Pressure(1.0);
            const at10m = getAlveolarN2Pressure(2.0);
            const at40m = getAlveolarN2Pressure(5.0);
            
            expect(at10m).toBeGreaterThan(atSurface);
            expect(at40m).toBeGreaterThan(at10m);
        });

        test('at 40m depth', () => {
            // Ambient = 5.0 bar
            // Alveolar = (5.0 - 0.0627) * 0.79 = 3.9005
            const alveolar = getAlveolarN2Pressure(5.0);
            expect(alveolar).toBeCloseTo(3.9005, 3);
        });
    });

    describe('getInitialTissueN2', () => {
        test('returns surface equilibrium N2 pressure', () => {
            const initial = getInitialTissueN2();
            const expected = getAlveolarN2Pressure(SURFACE_PRESSURE);
            expect(initial).toBe(expected);
        });

        test('is approximately 0.74 bar', () => {
            expect(getInitialTissueN2()).toBeCloseTo(0.74, 2);
        });
    });

    describe('haldaneEquation', () => {
        test('tissue equilibrates towards alveolar pressure', () => {
            const initialPressure = 0.74;  // surface equilibrium
            const alveolarPressure = 3.9;   // at 40m
            const halfTime = 5;             // 5-minute compartment
            
            // After many half-times, should approach alveolar
            const after30min = haldaneEquation(initialPressure, alveolarPressure, 30, halfTime);
            expect(after30min).toBeCloseTo(alveolarPressure, 1);
        });

        test('at time 0, returns initial pressure', () => {
            const initial = 0.74;
            const alveolar = 3.9;
            const result = haldaneEquation(initial, alveolar, 0, 5);
            expect(result).toBeCloseTo(initial, 10);
        });

        test('after one half-time, tissue is 50% saturated', () => {
            const initial = 1.0;
            const alveolar = 3.0;
            const halfTime = 10;
            
            const result = haldaneEquation(initial, alveolar, halfTime, halfTime);
            // Should be halfway between initial and alveolar
            const expected = initial + 0.5 * (alveolar - initial);
            expect(result).toBeCloseTo(expected, 5);
        });

        test('after two half-times, tissue is 75% saturated', () => {
            const initial = 1.0;
            const alveolar = 3.0;
            const halfTime = 10;
            
            const result = haldaneEquation(initial, alveolar, halfTime * 2, halfTime);
            const expected = initial + 0.75 * (alveolar - initial);
            expect(result).toBeCloseTo(expected, 5);
        });

        test('off-gassing reduces tissue pressure', () => {
            const initial = 3.0;    // high pressure tissue
            const alveolar = 0.74;  // surface alveolar
            const halfTime = 5;
            
            const after10min = haldaneEquation(initial, alveolar, 10, halfTime);
            expect(after10min).toBeLessThan(initial);
            expect(after10min).toBeGreaterThan(alveolar);
        });

        test('fast compartment equilibrates faster than slow', () => {
            const initial = 0.74;
            const alveolar = 3.9;
            const time = 10;
            
            const fastComp = haldaneEquation(initial, alveolar, time, 5);    // 5-min half-time
            const slowComp = haldaneEquation(initial, alveolar, time, 100);  // 100-min half-time
            
            expect(fastComp).toBeGreaterThan(slowComp);  // fast absorbs more
        });
    });

    describe('schreinerEquation', () => {
        test('handles descent (positive rate)', () => {
            const initial = 0.74;
            const initialAlveolar = 0.74;
            const rate = 0.79 * 0.1 * 20;  // 20 m/min descent rate in terms of N2 pressure
            const time = 2;  // 2 minutes
            const halfTime = 5;
            
            const result = schreinerEquation(initial, initialAlveolar, rate, time, halfTime);
            expect(result).toBeGreaterThan(initial);
        });

        test('handles ascent (negative rate)', () => {
            const initial = 3.0;
            const initialAlveolar = 3.9;
            const rate = -0.79 * 0.1 * 10;  // 10 m/min ascent rate
            const time = 4;
            const halfTime = 5;
            
            const result = schreinerEquation(initial, initialAlveolar, rate, time, halfTime);
            // During ascent, tissue may still be on-gassing or off-gassing depending on gradient
            expect(typeof result).toBe('number');
            expect(result).not.toBeNaN();
        });

        test('at time 0, returns initial pressure', () => {
            const initial = 1.5;
            const initialAlveolar = 0.74;
            const rate = 0.5;
            
            const result = schreinerEquation(initial, initialAlveolar, rate, 0, 5);
            expect(result).toBeCloseTo(initial, 5);
        });

        test('with zero rate, behaves like haldane equation', () => {
            const initial = 0.74;
            const alveolar = 2.5;
            const time = 15;
            const halfTime = 10;
            
            const schreiner = schreinerEquation(initial, alveolar, 0, time, halfTime);
            const haldane = haldaneEquation(initial, alveolar, time, halfTime);
            
            expect(schreiner).toBeCloseTo(haldane, 10);
        });
    });

    describe('compartments integration', () => {
        test('all 16 Bühlmann compartments are defined', () => {
            expect(COMPARTMENTS).toHaveLength(16);
        });

        test('compartments have required properties', () => {
            COMPARTMENTS.forEach(comp => {
                expect(comp).toHaveProperty('id');
                expect(comp).toHaveProperty('halfTime');
                expect(comp).toHaveProperty('label');
                expect(comp).toHaveProperty('color');
            });
        });

        test('half-times are in ascending order', () => {
            for (let i = 1; i < COMPARTMENTS.length; i++) {
                expect(COMPARTMENTS[i].halfTime).toBeGreaterThan(COMPARTMENTS[i-1].halfTime);
            }
        });

        test('fastest compartment is about 4-5 minutes', () => {
            expect(COMPARTMENTS[0].halfTime).toBeGreaterThanOrEqual(4);
            expect(COMPARTMENTS[0].halfTime).toBeLessThanOrEqual(6);
        });

        test('slowest compartment is about 635 minutes', () => {
            const slowest = COMPARTMENTS[COMPARTMENTS.length - 1].halfTime;
            expect(slowest).toBeGreaterThanOrEqual(600);
            expect(slowest).toBeLessThanOrEqual(700);
        });

        test('all compartments have M-value coefficients (aN2, bN2)', () => {
            COMPARTMENTS.forEach(comp => {
                expect(comp).toHaveProperty('aN2');
                expect(comp).toHaveProperty('bN2');
                expect(typeof comp.aN2).toBe('number');
                expect(typeof comp.bN2).toBe('number');
                expect(comp.aN2).toBeGreaterThan(0);
                expect(comp.bN2).toBeGreaterThan(0);
                expect(comp.bN2).toBeLessThan(1);  // b values are always < 1
            });
        });

        test('faster compartments have higher a values (more supersaturation tolerance)', () => {
            // Fast compartments can tolerate more supersaturation
            const fastA = COMPARTMENTS[0].aN2;  // TC1
            const slowA = COMPARTMENTS[15].aN2; // TC16
            expect(fastA).toBeGreaterThan(slowA);
        });

        test('slower compartments have higher b values (closer to 1)', () => {
            // Slow compartments have b values closer to 1
            const fastB = COMPARTMENTS[0].bN2;  // TC1
            const slowB = COMPARTMENTS[15].bN2; // TC16
            expect(slowB).toBeGreaterThan(fastB);
        });

        test('M-value at surface (M0) is calculable for all compartments', () => {
            // M0 = a + 1/b (ambient = 1 bar at surface)
            COMPARTMENTS.forEach(comp => {
                const m0 = comp.aN2 + SURFACE_PRESSURE / comp.bN2;
                expect(m0).toBeGreaterThan(1);  // Must be > surface pressure
                expect(m0).toBeLessThan(4);     // Reasonable upper bound
            });
        });

        test('TC1 M-value coefficients match ZH-L16A', () => {
            const tc1 = COMPARTMENTS[0];
            // ZH-L16A values for 5 min half-time (variant)
            expect(tc1.aN2).toBeCloseTo(1.1696, 3);
            expect(tc1.bN2).toBeCloseTo(0.5578, 3);
        });
    });

    // ========================================================================
    // GRADIENT FACTORS TESTS
    // ========================================================================

    describe('Gradient Factor constants', () => {
        test('DEFAULT_GF_LOW is 1.0 (100%)', () => {
            expect(DEFAULT_GF_LOW).toBe(1.0);
        });

        test('DEFAULT_GF_HIGH is 1.0 (100%)', () => {
            expect(DEFAULT_GF_HIGH).toBe(1.0);
        });
    });

    describe('getMValue', () => {
        test('calculates M-value using Bühlmann formula M = a + P_amb / b', () => {
            // TC1: a = 1.1696, b = 0.5578
            // At surface (1 bar): M = 1.1696 + 1.0 / 0.5578 = 1.1696 + 1.7928 = 2.9624
            const mValue = getMValue(1.0, 1.1696, 0.5578);
            expect(mValue).toBeCloseTo(2.9624, 3);
        });

        test('M-value increases with ambient pressure', () => {
            const a = 1.1696, b = 0.5578;
            const mAtSurface = getMValue(1.0, a, b);
            const mAt10m = getMValue(2.0, a, b);
            const mAt30m = getMValue(4.0, a, b);
            
            expect(mAt10m).toBeGreaterThan(mAtSurface);
            expect(mAt30m).toBeGreaterThan(mAt10m);
        });

        test('M-value at 30m depth for TC1', () => {
            // At 30m (4 bar): M = 1.1696 + 4.0 / 0.5578 = 1.1696 + 7.1711 = 8.3407
            const mValue = getMValue(4.0, 1.1696, 0.5578);
            expect(mValue).toBeCloseTo(8.3407, 3);
        });
    });

    describe('getAdjustedMValue', () => {
        test('GF 100% returns raw M-value', () => {
            const a = 1.1696, b = 0.5578;
            const rawM = getMValue(1.0, a, b);
            const adjustedM = getAdjustedMValue(1.0, a, b, 1.0);
            expect(adjustedM).toBeCloseTo(rawM, 6);
        });

        test('GF 0% returns ambient pressure (no supersaturation allowed)', () => {
            const ambientPressure = 2.0; // 10m
            const adjustedM = getAdjustedMValue(ambientPressure, 1.1696, 0.5578, 0.0);
            expect(adjustedM).toBeCloseTo(ambientPressure, 6);
        });

        test('GF 50% returns halfway between ambient and raw M-value', () => {
            const a = 1.1696, b = 0.5578;
            const ambient = 1.0;
            const rawM = getMValue(ambient, a, b);
            const adjustedM = getAdjustedMValue(ambient, a, b, 0.5);
            const expected = ambient + 0.5 * (rawM - ambient);
            expect(adjustedM).toBeCloseTo(expected, 6);
        });

        test('GF 70/85 typical values work correctly', () => {
            const a = 1.1696, b = 0.5578;
            const ambient = 1.0;
            const rawM = getMValue(ambient, a, b);
            
            // GF 70%
            const m70 = getAdjustedMValue(ambient, a, b, 0.70);
            expect(m70).toBeCloseTo(ambient + 0.70 * (rawM - ambient), 6);
            
            // GF 85%
            const m85 = getAdjustedMValue(ambient, a, b, 0.85);
            expect(m85).toBeCloseTo(ambient + 0.85 * (rawM - ambient), 6);
            
            // 85% should allow more supersaturation than 70%
            expect(m85).toBeGreaterThan(m70);
        });
    });

    describe('getCompartmentCeiling', () => {
        test('tissue at surface equilibrium has no ceiling (can surface)', () => {
            // Surface equilibrium N2 ≈ 0.74 bar, well below any M-value
            const tissueP = 0.74;
            const ceiling = getCompartmentCeiling(tissueP, 1.1696, 0.5578, 1.0);
            expect(ceiling).toBeLessThan(SURFACE_PRESSURE);
        });

        test('higher tissue pressure requires deeper ceiling', () => {
            const a = 1.1696, b = 0.5578;
            const lowP = 1.5;
            const highP = 3.0;
            
            const ceilingLow = getCompartmentCeiling(lowP, a, b, 1.0);
            const ceilingHigh = getCompartmentCeiling(highP, a, b, 1.0);
            
            expect(ceilingHigh).toBeGreaterThan(ceilingLow);
        });

        test('lower GF requires deeper ceiling for same tissue pressure', () => {
            const tissueP = 2.5;
            const a = 1.1696, b = 0.5578;
            
            const ceiling100 = getCompartmentCeiling(tissueP, a, b, 1.0);
            const ceiling70 = getCompartmentCeiling(tissueP, a, b, 0.7);
            
            // GF 70% is more conservative, requires deeper ceiling
            expect(ceiling70).toBeGreaterThan(ceiling100);
        });

        test('ceiling formula is mathematically correct', () => {
            // Verify: P_ceiling = b × (P_tissue - GF × a) / (b × (1 - GF) + GF)
            const tissueP = 2.5;
            const a = 0.8618, b = 0.7222; // TC3
            const gf = 0.8;
            
            const ceiling = getCompartmentCeiling(tissueP, a, b, gf);
            
            // Manually calculate
            const numerator = b * (tissueP - gf * a);
            const denominator = b * (1 - gf) + gf;
            const expected = numerator / denominator;
            
            expect(ceiling).toBeCloseTo(expected, 6);
        });

        test('at GF 100%, tissue at M-value gives ceiling at that ambient', () => {
            // If tissue pressure equals M-value at a given ambient, ceiling = that ambient
            const ambient = 2.0; // 10m
            const a = 1.1696, b = 0.5578;
            const mValue = getMValue(ambient, a, b);
            
            const ceiling = getCompartmentCeiling(mValue, a, b, 1.0);
            expect(ceiling).toBeCloseTo(ambient, 4);
        });
    });

    describe('getDiveCeiling', () => {
        test('surface-saturated tissues have no ceiling requirement', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 0.74; // Surface equilibrium
            });
            
            const result = getDiveCeiling(tissuePressures, 1.0);
            
            expect(result.ceiling).toBe(SURFACE_PRESSURE);
            expect(result.ceilingDepth).toBe(0);
        });

        test('returns controlling compartment', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 0.74;
            });
            // Make TC3 have higher loading
            tissuePressures[3] = 2.5;
            
            const result = getDiveCeiling(tissuePressures, 1.0);
            
            expect(result.controllingCompartment).toBe(3);
        });

        test('ceiling depth is in meters', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5; // Moderate loading
            });
            
            const result = getDiveCeiling(tissuePressures, 0.7);
            
            // Should have a positive ceiling depth with this loading and GF
            expect(result.ceilingDepth).toBeGreaterThanOrEqual(0);
            // Ceiling depth should match ceiling pressure
            expect(result.ceilingDepth).toBeCloseTo(
                (result.ceiling - SURFACE_PRESSURE) / PRESSURE_PER_METER, 
                4
            );
        });

        test('lower GF produces deeper ceiling', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.0;
            });
            
            const result100 = getDiveCeiling(tissuePressures, 1.0);
            const result70 = getDiveCeiling(tissuePressures, 0.7);
            
            expect(result70.ceilingDepth).toBeGreaterThanOrEqual(result100.ceilingDepth);
        });
    });

    describe('interpolateGF', () => {
        test('returns GF Low at first stop depth', () => {
            const firstStopAmbient = 2.0; // 10m
            const gf = interpolateGF(2.0, firstStopAmbient, 0.7, 0.85);
            expect(gf).toBe(0.7);
        });

        test('returns GF Low below first stop depth', () => {
            const firstStopAmbient = 2.0; // 10m
            const gf = interpolateGF(3.0, firstStopAmbient, 0.7, 0.85); // 20m
            expect(gf).toBe(0.7);
        });

        test('returns GF High at surface', () => {
            const firstStopAmbient = 2.0;
            const gf = interpolateGF(1.0, firstStopAmbient, 0.7, 0.85);
            expect(gf).toBe(0.85);
        });

        test('returns GF High above surface (edge case)', () => {
            const firstStopAmbient = 2.0;
            const gf = interpolateGF(0.5, firstStopAmbient, 0.7, 0.85);
            expect(gf).toBe(0.85);
        });

        test('interpolates linearly between surface and first stop', () => {
            const firstStopAmbient = 2.0; // 10m
            const gfLow = 0.7, gfHigh = 0.85;
            
            // Midpoint: 1.5 bar (5m)
            const gfMid = interpolateGF(1.5, firstStopAmbient, gfLow, gfHigh);
            // fraction = (1.5 - 1.0) / (2.0 - 1.0) = 0.5
            // gf = 0.85 + 0.5 * (0.7 - 0.85) = 0.85 - 0.075 = 0.775
            expect(gfMid).toBeCloseTo(0.775, 6);
        });

        test('interpolation at 3m (common last stop)', () => {
            const firstStopAmbient = 2.0; // 10m first stop
            const gfLow = 0.7, gfHigh = 0.85;
            
            // 3m = 1.3 bar
            const gf3m = interpolateGF(1.3, firstStopAmbient, gfLow, gfHigh);
            // fraction = (1.3 - 1.0) / (2.0 - 1.0) = 0.3
            // gf = 0.85 + 0.3 * (0.7 - 0.85) = 0.85 - 0.045 = 0.805
            expect(gf3m).toBeCloseTo(0.805, 6);
        });

        test('handles GF Low > GF High (unusual but valid)', () => {
            const firstStopAmbient = 2.0;
            const gfLow = 0.9, gfHigh = 0.7; // Inverted
            
            expect(interpolateGF(2.0, firstStopAmbient, gfLow, gfHigh)).toBe(0.9);
            expect(interpolateGF(1.0, firstStopAmbient, gfLow, gfHigh)).toBe(0.7);
            
            // Midpoint should be 0.8
            const gfMid = interpolateGF(1.5, firstStopAmbient, gfLow, gfHigh);
            expect(gfMid).toBeCloseTo(0.8, 6);
        });
    });

    describe('getFirstStopDepth', () => {
        test('surface-saturated tissues have 0m first stop', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 0.74;
            });
            
            const result = getFirstStopDepth(tissuePressures, 0.7);
            expect(result.depth).toBe(0);
        });

        test('rounds up to 3m increments by default', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.0;
            });
            
            const result = getFirstStopDepth(tissuePressures, 0.5);
            // Should be divisible by 3
            expect(result.depth % 3).toBe(0);
        });

        test('returns ambient pressure at stop depth', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5;
            });
            
            const result = getFirstStopDepth(tissuePressures, 0.5);
            expect(result.ambient).toBeCloseTo(
                SURFACE_PRESSURE + result.depth * PRESSURE_PER_METER, 
                6
            );
        });

        test('supports custom stop increments', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5;
            });
            
            const result5m = getFirstStopDepth(tissuePressures, 0.5, 5);
            expect(result5m.depth % 5).toBe(0);
        });
    });
});

// =============================================================================
// Integration Test: Full Deco Dive
// =============================================================================

import {
    calculateTissueLoading,
    getAdjustedMValue as getAdjustedMValueFn
} from '../js/decoModel.js';

import { generateDecoProfile } from '../js/diveSetup.js';

describe('Full Deco Dive Integration', () => {
    
    describe('50m/20min with Air, EAN50, EAN100 at GF 100/100', () => {
        // Setup: 50m, 20 min bottom time, air + EAN50 + EAN100, GF 100/100
        const maxDepth = 50;
        const bottomTime = 20;
        const gases = [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
            { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 },
            { id: 'ean100', name: 'O2', o2: 1.00, n2: 0.00, he: 0 }
        ];
        const gfLow = 100;
        const gfHigh = 100;
        
        let profile;
        let results;
        
        beforeAll(() => {
            // Generate the deco profile
            profile = generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh);
            
            // Calculate tissue loading through the whole dive
            results = calculateTissueLoading(profile.waypoints, 0, { gases });
        });
        
        test('generates a valid deco profile', () => {
            expect(profile).toBeDefined();
            expect(profile.waypoints).toBeDefined();
            expect(profile.waypoints.length).toBeGreaterThan(3);
            expect(profile.requiresDeco).toBe(true);
        });
        
        test('profile starts at surface and ends at surface', () => {
            expect(profile.waypoints[0].depth).toBe(0);
            expect(profile.waypoints[profile.waypoints.length - 1].depth).toBe(0);
        });
        
        test('profile reaches max depth', () => {
            const depths = profile.waypoints.map(wp => wp.depth);
            expect(Math.max(...depths)).toBe(maxDepth);
        });
        
        test('calculates descent time correctly (20 m/min)', () => {
            const DESCENT_SPEED = 20;
            const expectedDescentTime = Math.ceil(maxDepth / DESCENT_SPEED);
            
            // First waypoint at depth should be at descent time
            const atDepthWaypoint = profile.waypoints.find(wp => wp.depth === maxDepth);
            expect(atDepthWaypoint).toBeDefined();
            expect(atDepthWaypoint.time).toBe(expectedDescentTime);
        });
        
        test('has deco stops', () => {
            expect(profile.decoStops).toBeDefined();
            expect(profile.decoStops.length).toBeGreaterThan(0);
        });
        
        test('no tissue exceeds M-value (GF High) at any point during dive', () => {
            const gfHighDec = gfHigh / 100;
            
            // Check every time point
            for (let i = 0; i < results.timePoints.length; i++) {
                const time = results.timePoints[i];
                const depth = results.depthPoints[i];
                const ambientPressure = results.ambientPressures[i];
                
                // Check each compartment
                COMPARTMENTS.forEach(comp => {
                    const tissuePressure = results.compartments[comp.id].pressures[i];
                    
                    // Calculate M-value at this ambient pressure with GF High
                    const mValue = getAdjustedMValueFn(ambientPressure, comp.aN2, comp.bN2, gfHighDec);
                    
                    // Tissue pressure should not exceed M-value
                    // Allow small tolerance for floating point
                    const exceedsMValue = tissuePressure > mValue + 0.001;
                    
                    if (exceedsMValue) {
                        console.log(`VIOLATION at t=${time.toFixed(1)}min, depth=${depth.toFixed(1)}m`);
                        console.log(`  Compartment ${comp.id}: tissue=${tissuePressure.toFixed(4)} > M-value=${mValue.toFixed(4)}`);
                    }
                    
                    expect(exceedsMValue).toBe(false);
                });
            }
        });
        
        test('uses EAN50 for shallow deco stops', () => {
            // EAN50 MOD at 1.6 ppO2 is 22m, so it should be used at 21m or shallower
            const stopsWithEan50 = profile.decoStops.filter(stop => stop.gas === 'EAN50');
            expect(stopsWithEan50.length).toBeGreaterThan(0);
            
            // All EAN50 stops should be at 21m or shallower
            stopsWithEan50.forEach(stop => {
                expect(stop.depth).toBeLessThanOrEqual(21);
            });
        });
        
        test('uses O2 for shallowest deco stops', () => {
            // O2 MOD at 1.6 ppO2 is 6m
            const stopsWithO2 = profile.decoStops.filter(stop => stop.gas === 'O2');
            expect(stopsWithO2.length).toBeGreaterThan(0);
            
            // All O2 stops should be at 6m or shallower
            stopsWithO2.forEach(stop => {
                expect(stop.depth).toBeLessThanOrEqual(6);
            });
        });
    });
});
