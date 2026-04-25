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
    getFirstStopDepth,
    findFirstStopWithRampedGF,
    generateDecoSchedule,
    calculateTissueLoading,
    DecoCapExceededError,
    DECO_STOP_MAX_MINUTES
} from '../js/decoModel.js';

import {
    COMPARTMENTS,
    ZHL16_VARIANTS,
    getZHL16Variant,
    setZHL16Variant,
    getCompartmentsForVariant
} from '../js/tissueCompartments.js';

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

        test('TC1 M-value coefficients match ZH-L16C', () => {
            const tc1 = COMPARTMENTS[0];
            // Default variant is C: TC1 uses a=1.1696, b=0.5578, ht=5.0
            expect(tc1.aN2).toBeCloseTo(1.1696, 3);
            expect(tc1.bN2).toBeCloseTo(0.5578, 3);
        });
    });

    // ========================================================================
    // ZH-L16 VARIANT TESTS
    // ========================================================================

    describe('ZH-L16 variants', () => {
        // Store original variant to restore after tests
        let originalVariant;
        
        beforeAll(() => {
            originalVariant = getZHL16Variant();
        });
        
        afterAll(() => {
            setZHL16Variant(originalVariant);
        });

        test('ZHL16_VARIANTS has A, B, C options', () => {
            expect(ZHL16_VARIANTS.A).toBe('ZH-L16A');
            expect(ZHL16_VARIANTS.B).toBe('ZH-L16B');
            expect(ZHL16_VARIANTS.C).toBe('ZH-L16C');
        });

        test('default variant is ZH-L16C', () => {
            // Reset to ensure we're testing the default
            setZHL16Variant(ZHL16_VARIANTS.C);
            expect(getZHL16Variant()).toBe('ZH-L16C');
        });

        test('setZHL16Variant changes active variant', () => {
            setZHL16Variant(ZHL16_VARIANTS.A);
            expect(getZHL16Variant()).toBe('ZH-L16A');
            
            setZHL16Variant(ZHL16_VARIANTS.B);
            expect(getZHL16Variant()).toBe('ZH-L16B');
            
            setZHL16Variant(ZHL16_VARIANTS.C);
            expect(getZHL16Variant()).toBe('ZH-L16C');
        });

        test('COMPARTMENTS array is updated when variant changes', () => {
            setZHL16Variant(ZHL16_VARIANTS.A);
            const tc5_A = COMPARTMENTS.find(c => c.id === 5).aN2;
            
            setZHL16Variant(ZHL16_VARIANTS.C);
            const tc5_C = COMPARTMENTS.find(c => c.id === 5).aN2;
            
            // ZH-L16A TC5 a = 0.6667, ZH-L16C TC5 a = 0.6200
            expect(tc5_A).toBeCloseTo(0.6667, 3);
            expect(tc5_C).toBeCloseTo(0.6200, 3);
            expect(tc5_A).toBeGreaterThan(tc5_C);  // A is less conservative
        });

        test('getCompartmentsForVariant returns correct values without changing state', () => {
            setZHL16Variant(ZHL16_VARIANTS.C);
            
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const tc5_A = variantA.find(c => c.id === 5).aN2;
            
            // Current variant should still be C
            expect(getZHL16Variant()).toBe('ZH-L16C');
            expect(tc5_A).toBeCloseTo(0.6667, 3);
        });

        test('TC2-4 have same a values across all variants, TC1 differs for A', () => {
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const variantB = getCompartmentsForVariant(ZHL16_VARIANTS.B);
            const variantC = getCompartmentsForVariant(ZHL16_VARIANTS.C);

            // TC1: A uses 1.2599 (original 4.0 min half-time), B/C use 1.1696 (5.0 min)
            expect(variantA.find(c => c.id === 1).aN2).toBeCloseTo(1.2599, 4);
            expect(variantB.find(c => c.id === 1).aN2).toBeCloseTo(1.1696, 4);
            expect(variantC.find(c => c.id === 1).aN2).toBeCloseTo(1.1696, 4);

            // TC2-4 are the same across all variants
            for (let id = 2; id <= 4; id++) {
                const a_A = variantA.find(c => c.id === id).aN2;
                const a_B = variantB.find(c => c.id === id).aN2;
                const a_C = variantC.find(c => c.id === id).aN2;
                expect(a_A).toBeCloseTo(a_B, 4);
                expect(a_B).toBeCloseTo(a_C, 4);
            }
        });

        test('TC5-8 have more conservative (lower) a values in B and C', () => {
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const variantB = getCompartmentsForVariant(ZHL16_VARIANTS.B);
            const variantC = getCompartmentsForVariant(ZHL16_VARIANTS.C);
            
            for (let id = 5; id <= 8; id++) {
                const a_A = variantA.find(c => c.id === id).aN2;
                const a_B = variantB.find(c => c.id === id).aN2;
                const a_C = variantC.find(c => c.id === id).aN2;
                
                // A >= B >= C (higher a = less conservative)
                expect(a_A).toBeGreaterThanOrEqual(a_B);
                expect(a_B).toBeGreaterThanOrEqual(a_C);
            }
        });

        test('all variants have same b values (TC1 half-time differs in variant A)', () => {
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const variantB = getCompartmentsForVariant(ZHL16_VARIANTS.B);
            const variantC = getCompartmentsForVariant(ZHL16_VARIANTS.C);

            // b values are identical across A/B/C
            for (let i = 0; i < 16; i++) {
                expect(variantA[i].bN2).toBe(variantB[i].bN2);
                expect(variantB[i].bN2).toBe(variantC[i].bN2);
            }
            // B and C are identical half-times; A differs only for TC1 (4.0 vs 5.0 min)
            for (let i = 0; i < 16; i++) {
                expect(variantB[i].halfTime).toBe(variantC[i].halfTime);
                if (i === 0) {
                    expect(variantA[i].halfTime).not.toBe(variantB[i].halfTime);
                } else {
                    expect(variantA[i].halfTime).toBe(variantB[i].halfTime);
                }
            }
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
// Bottom-Anchored GF Tests
// =============================================================================

describe('Bottom-Anchored GF', () => {
    
    describe('findFirstStopWithRampedGF', () => {
        test('surface-saturated tissues return 0m first stop', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 0.74; // Surface saturation
            });
            
            const currentDepth = 50; // 50m
            const anchorAmbient = 6.0; // 50m
            const currentN2 = 0.79; // Air
            const result = findFirstStopWithRampedGF(tissuePressures, currentDepth, anchorAmbient, currentN2, 0.7, 0.85);
            expect(result.depth).toBe(0);
        });
        
        test('uses ramped GF: shallower first stop than constant GF Low', () => {
            // Create loaded tissues that would require a deep stop
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                // Simulate tissues loaded at 40m
                tissuePressures[comp.id] = 3.5;
            });
            
            const currentDepth = 40; // 40m - bottom-anchored
            const anchorAmbient = 5.0; // 40m
            const currentN2 = 0.79; // Air
            const gfLow = 0.5;
            const gfHigh = 0.85;
            
            // Bottom-anchored first stop with ramped GF
            const rampedResult = findFirstStopWithRampedGF(tissuePressures, currentDepth, anchorAmbient, currentN2, gfLow, gfHigh);
            
            // Constant GF Low first stop (old method)
            const constantResult = getFirstStopDepth(tissuePressures, gfLow);
            
            // Ramped GF should give shallower or equal first stop
            // because GF increases (becomes less conservative) as we ascend
            expect(rampedResult.depth).toBeLessThanOrEqual(constantResult.depth);
        });
        
        test('returns stop at 3m increments', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5;
            });
            
            const currentDepth = 30; // 30m
            const anchorAmbient = 4.0; // 30m
            const currentN2 = 0.79; // Air
            const result = findFirstStopWithRampedGF(tissuePressures, currentDepth, anchorAmbient, currentN2, 0.7, 0.85);
            
            expect(result.depth % 3).toBe(0);
        });
    });
    
    describe('generateDecoSchedule bottom-anchored behavior', () => {
        test('GF at bottom depth equals GF Low', () => {
            // Use loaded tissues to ensure deco is required
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 3.0;
            });
            
            const bottomDepth = 40;
            const gfLow = 0.7;
            const gfHigh = 0.85;
            
            // At bottom depth, GF should be exactly gfLow
            const bottomAmbient = getAmbientPressure(bottomDepth);
            const gfAtBottom = interpolateGF(bottomAmbient, bottomAmbient, gfLow, gfHigh);
            
            expect(gfAtBottom).toBe(gfLow);
        });
        
        test('GF ramps from bottom (not first stop) to surface', () => {
            const bottomDepth = 50;
            const firstStopDepth = 21; // Example first stop
            const midDepth = 10;
            
            const bottomAmbient = getAmbientPressure(bottomDepth);
            const gfLow = 0.5;
            const gfHigh = 1.0;
            
            // GF at first stop should NOT be gfLow (because anchor is at bottom, not first stop)
            const firstStopAmbient = getAmbientPressure(firstStopDepth);
            const gfAtFirstStop = interpolateGF(firstStopAmbient, bottomAmbient, gfLow, gfHigh);
            
            // GF at first stop should be > gfLow (interpolated up from bottom)
            expect(gfAtFirstStop).toBeGreaterThan(gfLow);
            
            // GF at 10m should be even higher (closer to surface = closer to gfHigh)
            const midAmbient = getAmbientPressure(midDepth);
            const gfAtMid = interpolateGF(midAmbient, bottomAmbient, gfLow, gfHigh);
            
            expect(gfAtMid).toBeGreaterThan(gfAtFirstStop);
            expect(gfAtMid).toBeLessThan(gfHigh);
        });
    });
    
    describe('generateDecoSchedule pAnchor behavior', () => {
        test('GF at pAnchor equals GF Low', () => {
            // 30m/20min dive - deco required
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5; // Loaded tissues
            });
            
            const gfLow = 0.5;
            const gfHigh = 0.8;
            const bottomDepth = 30;
            
            // Generate schedule to get pAnchor
            const schedule = generateDecoSchedule(tissuePressures, bottomDepth, N2_FRACTION, gfLow, gfHigh);
            
            // GF at pAnchor should equal GF Low
            const gfAtAnchor = interpolateGF(schedule.pAnchor, schedule.pAnchor, gfLow, gfHigh);
            expect(gfAtAnchor).toBeCloseTo(gfLow, 5);
        });
        
        test('GF is gfLow when deeper than pAnchor', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5;
            });
            
            const gfLow = 0.5;
            const gfHigh = 0.8;
            const bottomDepth = 30;
            
            const schedule = generateDecoSchedule(tissuePressures, bottomDepth, N2_FRACTION, gfLow, gfHigh);
            
            // At bottom (deeper than pAnchor), GF should be gfLow
            const bottomAmbient = getAmbientPressure(bottomDepth);
            const gfAtBottom = interpolateGF(bottomAmbient, schedule.pAnchor, gfLow, gfHigh);
            
            expect(gfAtBottom).toBe(gfLow);
        });
        
        test('GF ramps from pAnchor to surface', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5;
            });
            
            const gfLow = 0.5;
            const gfHigh = 0.8;
            const bottomDepth = 30;
            
            const schedule = generateDecoSchedule(tissuePressures, bottomDepth, N2_FRACTION, gfLow, gfHigh);
            
            // At 3m (above pAnchor), GF should be interpolated toward gfHigh
            const shallowAmbient = getAmbientPressure(3);
            const gfAt3m = interpolateGF(shallowAmbient, schedule.pAnchor, gfLow, gfHigh);
            
            expect(gfAt3m).toBeGreaterThan(gfLow);
            expect(gfAt3m).toBeLessThan(gfHigh);
        });
        
        test('30m/20min air GF 50/80: GF ramp is anchored at the first stop depth', () => {
            // Per Baker convention, the GF ramp is anchored at the rounded first-stop
            // depth (the next stop-grid line at or below the unrounded GF-low ceiling).
            const initialTissues = {};
            COMPARTMENTS.forEach(comp => {
                initialTissues[comp.id] = getInitialTissueN2();
            });

            const descentTime = 30 / 20;
            const bottomDuration = 20 - descentTime;

            const startAlv = getAlveolarN2Pressure(getAmbientPressure(0), N2_FRACTION);
            const endAlv = getAlveolarN2Pressure(getAmbientPressure(30), N2_FRACTION);
            const rate = (endAlv - startAlv) / descentTime;

            const tissues = {};
            COMPARTMENTS.forEach(comp => {
                const afterDescent = schreinerEquation(initialTissues[comp.id], startAlv, rate, descentTime, comp.halfTime);
                tissues[comp.id] = haldaneEquation(afterDescent, endAlv, bottomDuration, comp.halfTime);
            });

            const schedule = generateDecoSchedule(tissues, 30, N2_FRACTION, 0.5, 0.8);

            // anchorDepth equals the first stop depth (both rounded to the 3 m grid).
            expect(schedule.anchorDepth).toBe(9);
            expect(schedule.stops[0].depth).toBe(9);
        });
    });
    
    describe('calculateTissueLoading boundary behavior', () => {
        test('tissue pressure at last waypoint equals manual simulation', () => {
            // This tests that calculateTissueLoading doesn't prematurely start surface interval
            // at the exact last waypoint time (was a bug: >= instead of >)
            const profile = [
                { time: 0, depth: 0 },
                { time: 1.5, depth: 30 }, // Descent
                { time: 20, depth: 30 }   // Bottom time ends exactly here
            ];
            
            const results = calculateTissueLoading(profile, N2_FRACTION);
            
            // Find index for t=20 (last waypoint)
            const idx20 = results.timePoints.indexOf(20);
            expect(idx20).toBeGreaterThan(0); // Should find it
            
            // At t=20, depth should still be 30m (not 0m surface interval)
            expect(results.depthPoints[idx20]).toBe(30);
            
            // Tissue 1 pressure at t=20 should match manual calculation
            const comp1 = COMPARTMENTS.find(c => c.id === 1);
            const initialN2 = getInitialTissueN2();
            const startAlv = getAlveolarN2Pressure(getAmbientPressure(0), N2_FRACTION);
            const endAlv = getAlveolarN2Pressure(getAmbientPressure(30), N2_FRACTION);
            const rate = (endAlv - startAlv) / 1.5;
            
            const afterDescent = schreinerEquation(initialN2, startAlv, rate, 1.5, comp1.halfTime);
            const bottomAlv = getAlveolarN2Pressure(getAmbientPressure(30), N2_FRACTION);
            const afterBottom = haldaneEquation(afterDescent, bottomAlv, 18.5, comp1.halfTime);
            
            expect(results.compartments[1].pressures[idx20]).toBeCloseTo(afterBottom, 4);
        });
        
        test('surface interval starts AFTER last waypoint, not AT last waypoint', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 1, depth: 10 },
                { time: 10, depth: 10 } // Last waypoint at t=10
            ];
            
            const results = calculateTissueLoading(profile, N2_FRACTION);
            
            // At t=10, should still be at 10m
            const idx10 = results.timePoints.indexOf(10);
            expect(results.depthPoints[idx10]).toBe(10);
            
            // Just after t=10, should be at surface (0m)
            const idxAfter10 = results.timePoints.findIndex(t => t > 10);
            expect(results.depthPoints[idxAfter10]).toBe(0);
        });
    });
});

// =============================================================================
// Integration Test: Full Deco Dive
// =============================================================================

// Alias for backward compatibility in tests using different import name
const getAdjustedMValueFn = getAdjustedMValue;

import { generateDecoProfile } from '../js/diveSetup.js';
import { simulateDepthChange, simulateDepthTime } from '../js/decoModel.js';

// =============================================================================
// Gas Switching Tests
// =============================================================================

describe('Gas Switching During Ascent', () => {
    // Standard deco gases
    const gases = [
        { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
        { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 },
        { id: 'o2', name: 'O2', o2: 1.00, n2: 0.00, he: 0 }
    ];
    
    // EAN50 MOD = (1.6/0.5 - 1) * 10 = 22m -> switch at 21m (rounded to 3m grid)
    // O2 MOD = (1.6/1.0 - 1) * 10 = 6m -> switch at 6m
    const EAN50_SWITCH_DEPTH = 21;
    const O2_SWITCH_DEPTH = 6;
    
    // Helper to get initial tissues saturated at surface
    const getInitialTissues = () => {
        const tissues = {};
        for (let i = 1; i <= 16; i++) {
            tissues[i] = 0.79 * (1.0 - 0.0627); // Surface saturated
        }
        return tissues;
    };
    
    // Helper to simulate dive to given depth and bottom time
    const simulateDive = (maxDepth, bottomTime) => {
        let tissues = getInitialTissues();
        const descentTime = maxDepth / 20; // 20 m/min descent
        tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, 0.79);
        const timeAtDepth = bottomTime - descentTime;
        tissues = simulateDepthTime(tissues, maxDepth, timeAtDepth, 0.79);
        return tissues;
    };
    
    describe('Shallow deco dive with first stop at 6m (30m/15min GF 30/70)', () => {
        // This dive has first stop at 6m, which is shallower than EAN50's MOD (21m)
        // The scheduler should still switch to EAN50 at 21m during ascent
        let schedule;
        
        beforeAll(() => {
            const tissues = simulateDive(30, 15);
            schedule = generateDecoSchedule(tissues, 30, 0.79, 0.30, 0.70, gases);
        });
        
        test('first stop is shallower than EAN50 MOD', () => {
            // Confirms the scenario: first stop lies above EAN50's MOD (21m) so the
            // scheduler must still schedule the EAN50 switch at 21m during ascent.
            expect(schedule.stops.length).toBeGreaterThan(0);
            expect(schedule.stops[0].depth).toBeLessThan(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to EAN50 at 21m during ascent', () => {
            // EAN50 should be switched at its MOD (21m) even when first stop is shallower
            const ean50Switch = schedule.gasSwitches.find(sw => sw.gas === 'EAN50');
            expect(ean50Switch).toBeDefined();
            expect(ean50Switch.depth).toBe(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to O2 at 6m', () => {
            const o2Switch = schedule.gasSwitches.find(sw => sw.gas === 'O2');
            expect(o2Switch).toBeDefined();
            expect(o2Switch.depth).toBe(O2_SWITCH_DEPTH);
        });
        
        test('EAN50 switch comes before O2 switch', () => {
            const ean50Index = schedule.gasSwitches.findIndex(sw => sw.gas === 'EAN50');
            const o2Index = schedule.gasSwitches.findIndex(sw => sw.gas === 'O2');
            expect(ean50Index).toBeLessThan(o2Index);
        });
    });
    
    describe('Deep deco dive with first stop at 15m (40m/20min GF 30/70)', () => {
        // This dive's first stop (15m) sits below EAN50's MOD (21m), so the
        // EAN50 switch happens during the ascent segment between bottom and
        // first stop, not at a stop depth.
        let schedule;

        beforeAll(() => {
            const tissues = simulateDive(40, 20);
            schedule = generateDecoSchedule(tissues, 40, 0.79, 0.30, 0.70, gases);
        });

        test('first stop is below EAN50 MOD (switch happens in-transit during ascent)', () => {
            expect(schedule.stops.length).toBeGreaterThan(0);
            expect(schedule.stops[0].depth).toBeLessThan(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to EAN50 at exactly 21m', () => {
            const ean50Switch = schedule.gasSwitches.find(sw => sw.gas === 'EAN50');
            expect(ean50Switch).toBeDefined();
            expect(ean50Switch.depth).toBe(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to O2 at exactly 6m', () => {
            const o2Switch = schedule.gasSwitches.find(sw => sw.gas === 'O2');
            expect(o2Switch).toBeDefined();
            expect(o2Switch.depth).toBe(O2_SWITCH_DEPTH);
        });
    });
    
    describe('NDL dive still gets gas switches during ascent (30m/10min GF 100/100)', () => {
        // NDL dives should also switch gases at MOD during ascent
        let schedule;
        
        beforeAll(() => {
            const tissues = simulateDive(30, 10);
            schedule = generateDecoSchedule(tissues, 30, 0.79, 1.0, 1.0, gases);
        });
        
        test('is an NDL dive (no stops)', () => {
            expect(schedule.stops.length).toBe(0);
        });
        
        test('switches to EAN50 at 21m during ascent', () => {
            const ean50Switch = schedule.gasSwitches.find(sw => sw.gas === 'EAN50');
            expect(ean50Switch).toBeDefined();
            expect(ean50Switch.depth).toBe(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to O2 at 6m during ascent', () => {
            const o2Switch = schedule.gasSwitches.find(sw => sw.gas === 'O2');
            expect(o2Switch).toBeDefined();
            expect(o2Switch.depth).toBe(O2_SWITCH_DEPTH);
        });
    });
    
    describe('Dive with first stop between gas MODs (35m/20min GF 50/80)', () => {
        // First stop around 9-12m: between O2 MOD (6m) and EAN50 MOD (21m)
        // EAN50 should switch at 21m, O2 should switch at 6m (at a stop)
        let schedule;
        
        beforeAll(() => {
            const tissues = simulateDive(35, 20);
            schedule = generateDecoSchedule(tissues, 35, 0.79, 0.50, 0.80, gases);
        });
        
        test('first stop is between 6m and 21m', () => {
            expect(schedule.stops.length).toBeGreaterThan(0);
            const firstStopDepth = schedule.stops[0].depth;
            expect(firstStopDepth).toBeGreaterThan(O2_SWITCH_DEPTH);
            expect(firstStopDepth).toBeLessThanOrEqual(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to EAN50 at 21m', () => {
            const ean50Switch = schedule.gasSwitches.find(sw => sw.gas === 'EAN50');
            expect(ean50Switch).toBeDefined();
            expect(ean50Switch.depth).toBe(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to O2 at 6m', () => {
            const o2Switch = schedule.gasSwitches.find(sw => sw.gas === 'O2');
            expect(o2Switch).toBeDefined();
            expect(o2Switch.depth).toBe(O2_SWITCH_DEPTH);
        });
    });
});

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

// =============================================================================
// Deco cap enforcement
// =============================================================================

describe('generateDecoSchedule cap enforcement', () => {
    // 60m / 100min on air with GF 90/90 pushes the shallowest stop past the
    // 5-hour per-stop cap. Previously the loop silently dropped the stop with a
    // console.warn; we now throw so the caller can't surface an unsafe plan.
    test('throws DecoCapExceededError when a single stop exceeds the cap', () => {
        const n2 = 0.79;
        const maxDepth = 60;
        const bottomTime = 100;
        const descentTime = maxDepth / 20;

        let tissues = {};
        COMPARTMENTS.forEach(c => {
            tissues[c.id] = getInitialTissueN2(n2);
        });
        tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, n2);
        tissues = simulateDepthTime(tissues, maxDepth, bottomTime - descentTime, n2);

        const gases = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }];

        expect(() => {
            generateDecoSchedule(tissues, maxDepth, n2, 0.9, 0.9, gases, { continuousDeco: false });
        }).toThrow(DecoCapExceededError);
    });

    test('error carries the stops completed before the cap was hit', () => {
        const n2 = 0.79;
        const maxDepth = 60;
        const bottomTime = 100;
        const descentTime = maxDepth / 20;

        let tissues = {};
        COMPARTMENTS.forEach(c => {
            tissues[c.id] = getInitialTissueN2(n2);
        });
        tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, n2);
        tissues = simulateDepthTime(tissues, maxDepth, bottomTime - descentTime, n2);

        const gases = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }];

        try {
            generateDecoSchedule(tissues, maxDepth, n2, 0.9, 0.9, gases, { continuousDeco: false });
            throw new Error('expected DecoCapExceededError to be thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(DecoCapExceededError);
            expect(err.capMinutes).toBe(DECO_STOP_MAX_MINUTES);
            expect(err.depth).toBeGreaterThan(0);
            expect(Array.isArray(err.stopsSoFar)).toBe(true);
            expect(err.stopsSoFar.length).toBeGreaterThan(0);
        }
    });

    test('normal deco profiles stay under the cap and return a plan', () => {
        // 30m / 25min on air with GF 50/80 — standard recreational deco, well
        // within the cap. Must NOT throw.
        const n2 = 0.79;
        const maxDepth = 30;
        const bottomTime = 25;
        const descentTime = maxDepth / 20;

        let tissues = {};
        COMPARTMENTS.forEach(c => {
            tissues[c.id] = getInitialTissueN2(n2);
        });
        tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, n2);
        tissues = simulateDepthTime(tissues, maxDepth, bottomTime - descentTime, n2);

        const gases = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }];

        const schedule = generateDecoSchedule(tissues, maxDepth, n2, 0.5, 0.8, gases);
        expect(schedule.stops.length).toBeGreaterThan(0);
        schedule.stops.forEach(stop => {
            expect(stop.time).toBeLessThanOrEqual(DECO_STOP_MAX_MINUTES);
        });
    });
});
