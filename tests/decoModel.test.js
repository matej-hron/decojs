/**
 * Tests for decoModel.js module
 */

import {
    CALC_INTERVAL,
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
});
