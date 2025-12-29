/**
 * Tests for diveSetup.js module
 */

import {
    getDefaultSetup,
    extendDiveSetup,
    getDiveSetupWaypoints,
    getSurfaceInterval,
    getN2Fraction,
    formatDiveSetupSummary,
    clearCache
} from '../js/diveSetup.js';

describe('diveSetup module', () => {
    beforeEach(() => {
        // Clear cache before each test
        clearCache();
        // Clear localStorage
        localStorage.clear();
    });

    describe('getDefaultSetup', () => {
        test('returns a valid dive setup object', () => {
            const setup = getDefaultSetup();
            
            expect(setup).toHaveProperty('name');
            expect(setup).toHaveProperty('description');
            expect(setup).toHaveProperty('gasMix');
            expect(setup).toHaveProperty('surfaceInterval');
            expect(setup).toHaveProperty('waypoints');
        });

        test('has valid gas mix totaling 100%', () => {
            const setup = getDefaultSetup();
            const total = setup.gasMix.o2 + setup.gasMix.n2 + setup.gasMix.he;
            
            expect(total).toBeCloseTo(1.0, 5);
        });

        test('has waypoints starting at surface', () => {
            const setup = getDefaultSetup();
            
            expect(setup.waypoints[0].time).toBe(0);
            expect(setup.waypoints[0].depth).toBe(0);
        });

        test('has waypoints ending at surface', () => {
            const setup = getDefaultSetup();
            const last = setup.waypoints[setup.waypoints.length - 1];
            
            expect(last.depth).toBe(0);
        });

        test('waypoints have ascending time values', () => {
            const setup = getDefaultSetup();
            
            for (let i = 1; i < setup.waypoints.length; i++) {
                expect(setup.waypoints[i].time).toBeGreaterThan(setup.waypoints[i - 1].time);
            }
        });
    });

    describe('extendDiveSetup', () => {
        test('overrides simple properties', () => {
            const base = getDefaultSetup();
            const extended = extendDiveSetup(base, {
                name: 'Custom Dive',
                surfaceInterval: 120
            });
            
            expect(extended.name).toBe('Custom Dive');
            expect(extended.surfaceInterval).toBe(120);
            // Original should be unchanged
            expect(base.name).toBe('Example Decompression Dive');
        });

        test('deep merges gasMix', () => {
            const base = getDefaultSetup();
            const extended = extendDiveSetup(base, {
                gasMix: { name: 'Nitrox 32', o2: 0.32 }
            });
            
            expect(extended.gasMix.name).toBe('Nitrox 32');
            expect(extended.gasMix.o2).toBe(0.32);
            // Original n2 should be preserved from merge
            expect(extended.gasMix.n2).toBe(0.79);
        });

        test('replaces waypoints entirely', () => {
            const base = getDefaultSetup();
            const newWaypoints = [
                { time: 0, depth: 0 },
                { time: 5, depth: 20 },
                { time: 15, depth: 0 }
            ];
            const extended = extendDiveSetup(base, { waypoints: newWaypoints });
            
            expect(extended.waypoints).toHaveLength(3);
            expect(extended.waypoints[1].depth).toBe(20);
        });

        test('does not mutate original setup', () => {
            const base = getDefaultSetup();
            const originalName = base.name;
            
            extendDiveSetup(base, { name: 'Modified' });
            
            expect(base.name).toBe(originalName);
        });
    });

    describe('getDiveSetupWaypoints', () => {
        test('extracts waypoints array', () => {
            const setup = getDefaultSetup();
            const waypoints = getDiveSetupWaypoints(setup);
            
            expect(Array.isArray(waypoints)).toBe(true);
            expect(waypoints.length).toBe(setup.waypoints.length);
        });

        test('waypoints have only time and depth', () => {
            const setup = {
                waypoints: [
                    { time: 0, depth: 0, note: 'Start' },
                    { time: 10, depth: 30, note: 'Bottom' }
                ]
            };
            const waypoints = getDiveSetupWaypoints(setup);
            
            expect(waypoints[0]).toEqual({ time: 0, depth: 0 });
            expect(waypoints[1]).toEqual({ time: 10, depth: 30 });
            expect(waypoints[0]).not.toHaveProperty('note');
        });
    });

    describe('getSurfaceInterval', () => {
        test('returns surface interval from setup', () => {
            const setup = { surfaceInterval: 90 };
            expect(getSurfaceInterval(setup)).toBe(90);
        });

        test('returns default 60 if not set', () => {
            const setup = {};
            expect(getSurfaceInterval(setup)).toBe(60);
        });
    });

    describe('getN2Fraction', () => {
        test('returns N2 fraction from gas mix', () => {
            const setup = { gasMix: { n2: 0.68 } };
            expect(getN2Fraction(setup)).toBe(0.68);
        });

        test('returns default 0.79 if not set', () => {
            const setup = {};
            expect(getN2Fraction(setup)).toBe(0.79);
        });

        test('handles missing gasMix gracefully', () => {
            const setup = { gasMix: null };
            expect(getN2Fraction(setup)).toBe(0.79);
        });
    });

    describe('formatDiveSetupSummary', () => {
        test('includes dive name', () => {
            const setup = getDefaultSetup();
            const summary = formatDiveSetupSummary(setup);
            
            expect(summary).toContain(setup.name);
        });

        test('includes max depth', () => {
            const setup = getDefaultSetup();
            const summary = formatDiveSetupSummary(setup);
            
            expect(summary).toContain('40m');
        });

        test('includes total time', () => {
            const setup = getDefaultSetup();
            const summary = formatDiveSetupSummary(setup);
            
            expect(summary).toContain('42 min');
        });

        test('includes gas name', () => {
            const setup = getDefaultSetup();
            const summary = formatDiveSetupSummary(setup);
            
            expect(summary).toContain('Air');
        });
    });

    describe('getDiveSetupWaypoints (multi-dive)', () => {
        test('merges multiple dives into single timeline', () => {
            const setup = {
                dives: [
                    {
                        waypoints: [
                            { time: 0, depth: 0 },
                            { time: 10, depth: 20 },
                            { time: 20, depth: 0 }
                        ]
                    },
                    {
                        surfaceIntervalBefore: 60,
                        waypoints: [
                            { time: 0, depth: 0 },
                            { time: 10, depth: 15 },
                            { time: 20, depth: 0 }
                        ]
                    }
                ]
            };
            
            const waypoints = getDiveSetupWaypoints(setup);
            
            // First dive: 0-20, surface interval: 60, second dive: 80-100
            expect(waypoints.length).toBe(6);
            expect(waypoints[0].time).toBe(0);
            expect(waypoints[2].time).toBe(20); // End of dive 1
            expect(waypoints[3].time).toBe(80); // Start of dive 2 (20 + 60)
            expect(waypoints[5].time).toBe(100); // End of dive 2
        });

        test('handles single dive in dives array', () => {
            const setup = {
                dives: [
                    {
                        waypoints: [
                            { time: 0, depth: 0 },
                            { time: 10, depth: 20 },
                            { time: 20, depth: 0 }
                        ]
                    }
                ]
            };
            
            const waypoints = getDiveSetupWaypoints(setup);
            
            expect(waypoints.length).toBe(3);
            expect(waypoints[2].time).toBe(20);
        });

        test('prefers dives array over legacy waypoints', () => {
            const setup = {
                waypoints: [{ time: 0, depth: 0 }, { time: 5, depth: 10 }],
                dives: [
                    {
                        waypoints: [
                            { time: 0, depth: 0 },
                            { time: 10, depth: 20 },
                            { time: 20, depth: 0 }
                        ]
                    }
                ]
            };
            
            const waypoints = getDiveSetupWaypoints(setup);
            
            expect(waypoints.length).toBe(3);
            expect(waypoints[1].depth).toBe(20);
        });
    });
});
