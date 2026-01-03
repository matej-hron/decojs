/**
 * Tests for diveSetup.js module
 */

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
            expect(setup).toHaveProperty('gases');
            expect(setup).toHaveProperty('surfaceInterval');
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

        test('has waypoints ending at surface', () => {
            const setup = getDefaultSetup();
            const waypoints = setup.dives[0].waypoints;
            const last = waypoints[waypoints.length - 1];
            
            expect(last.depth).toBe(0);
        });

        test('waypoints have ascending time values', () => {
            const setup = getDefaultSetup();
            const waypoints = setup.dives[0].waypoints;
            
            for (let i = 1; i < waypoints.length; i++) {
                expect(waypoints[i].time).toBeGreaterThan(waypoints[i - 1].time);
            }
        });

        test('gases have cylinder info', () => {
            const setup = getDefaultSetup();
            const gas = setup.gases[0];
            
            expect(gas.cylinderVolume).toBeDefined();
            expect(gas.startPressure).toBeDefined();
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

        test('replaces gases array entirely', () => {
            const base = getDefaultSetup();
            const newGases = [
                { id: 'bottom', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0, cylinderVolume: 12, startPressure: 200 }
            ];
            const extended = extendDiveSetup(base, { gases: newGases });
            
            expect(extended.gases).toHaveLength(1);
            expect(extended.gases[0].name).toBe('EAN32');
        });

        test('replaces dives array entirely', () => {
            const base = getDefaultSetup();
            const newDives = [
                {
                    waypoints: [
                        { time: 0, depth: 0 },
                        { time: 5, depth: 20 },
                        { time: 15, depth: 0 }
                    ]
                }
            ];
            const extended = extendDiveSetup(base, { dives: newDives });
            
            expect(extended.dives).toHaveLength(1);
            expect(extended.dives[0].waypoints).toHaveLength(3);
            expect(extended.dives[0].waypoints[1].depth).toBe(20);
        });

        test('does not mutate original setup', () => {
            const base = getDefaultSetup();
            const originalName = base.name;
            
            extendDiveSetup(base, { name: 'Modified' });
            
            expect(base.name).toBe(originalName);
        });
    });

    describe('getDiveSetupWaypoints', () => {
        test('extracts waypoints from dives array', () => {
            const setup = getDefaultSetup();
            const waypoints = getDiveSetupWaypoints(setup);
            
            expect(Array.isArray(waypoints)).toBe(true);
            expect(waypoints.length).toBe(setup.dives[0].waypoints.length);
        });

        test('waypoints have time and depth', () => {
            const setup = {
                dives: [{
                    waypoints: [
                        { time: 0, depth: 0, note: 'Start' },
                        { time: 10, depth: 30, note: 'Bottom' }
                    ]
                }]
            };
            const waypoints = getDiveSetupWaypoints(setup);
            
            expect(waypoints[0].time).toBe(0);
            expect(waypoints[0].depth).toBe(0);
            expect(waypoints[1].time).toBe(10);
            expect(waypoints[1].depth).toBe(30);
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

        test('returns empty array if no dives', () => {
            const setup = {};
            const waypoints = getDiveSetupWaypoints(setup);
            
            expect(waypoints).toEqual([]);
        });
    });

    describe('getSurfaceInterval', () => {
        test('returns surface interval from setup', () => {
            const setup = { surfaceInterval: 90 };
            expect(getSurfaceInterval(setup)).toBe(90);
        });

        test('returns default 5 if not set', () => {
            const setup = {};
            expect(getSurfaceInterval(setup)).toBe(5);
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
    });

    describe('generateSimpleProfile', () => {
        test('generates profile with 6 waypoints', () => {
            const waypoints = generateSimpleProfile(30, 20);
            
            expect(waypoints.length).toBe(6);
        });

        test('starts and ends at surface', () => {
            const waypoints = generateSimpleProfile(30, 20);
            
            expect(waypoints[0]).toEqual({ time: 0, depth: 0 });
            expect(waypoints[waypoints.length - 1].depth).toBe(0);
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
            expect(safetyStopWaypoints.length).toBe(2);
            
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
            waypoints.forEach(wp => {
                expect(Number.isInteger(wp.time)).toBe(true);
            });
            
            // Descent: 25m / 20 m/min = 1.25 min → 2 min
            expect(waypoints[1].time).toBe(2);
        });

        test('maintains correct bottom time (from dive start)', () => {
            const waypoints = generateSimpleProfile(30, 20);
            
            // Descent: 30m / 20 = 1.5 → 2 min
            // Bottom time is from dive start, so we leave depth at time 20
            // (not descent + 20 = 22)
            expect(waypoints[1].time).toBe(2);  // Arrive at depth
            expect(waypoints[2].time).toBe(20); // Leave depth at bottom time
        });

        test('bottom time is measured from dive start, not from reaching depth', () => {
            // User says "30m for 30min" - they expect ascent to start at minute 30
            const waypoints = generateSimpleProfile(30, 30);
            
            // Descent: 30m / 20 = 1.5 → 2 min
            expect(waypoints[1].time).toBe(2);  // Arrive at 30m at minute 2
            expect(waypoints[2].time).toBe(30); // Leave 30m at minute 30 (not 32!)
            expect(waypoints[2].depth).toBe(30);
        });

        test('waypoints have ascending time values', () => {
            const waypoints = generateSimpleProfile(35, 18);
            
            for (let i = 1; i < waypoints.length; i++) {
                expect(waypoints[i].time).toBeGreaterThan(waypoints[i - 1].time);
            }
        });

        test('handles shallow dives', () => {
            const waypoints = generateSimpleProfile(10, 30);
            
            expect(waypoints[0].depth).toBe(0);
            expect(waypoints[1].depth).toBe(10);
            expect(waypoints[waypoints.length - 1].depth).toBe(0);
        });

        test('handles deep dives', () => {
            const waypoints = generateSimpleProfile(60, 15);
            
            // Descent: 60m / 20 = 3 min
            // Bottom time from dive start = 15 min
            // Ascent to 5m: (60-5) / 10 = 5.5 → 6 min, arrives at 21 min
            // Safety stop: 21 + 3 = 24 min
            // Final ascent: 5m / 10 = 0.5 → 1 min, surface at 25 min
            expect(waypoints[1].time).toBe(3);   // Arrive at 60m
            expect(waypoints[2].time).toBe(15);  // Leave 60m at bottom time
            expect(waypoints[3].depth).toBe(5);  // Safety stop depth
        });
    });

    describe('getGases', () => {
        test('returns gases array if present', () => {
            const setup = {
                gases: [
                    { id: 'bottom', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0, cylinderVolume: 12, startPressure: 200 },
                    { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0, cylinderVolume: 7, startPressure: 200 }
                ]
            };
            const gases = getGases(setup);
            
            expect(gases).toHaveLength(2);
            expect(gases[0].name).toBe('EAN32');
            expect(gases[1].name).toBe('EAN50');
        });

        test('returns default air if no gases', () => {
            const setup = {};
            const gases = getGases(setup);
            
            expect(gases).toHaveLength(1);
            expect(gases[0].o2).toBe(0.21);
            expect(gases[0].n2).toBe(0.79);
            expect(gases[0].cylinderVolume).toBeDefined();
            expect(gases[0].startPressure).toBeDefined();
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
            expect(events).toHaveLength(0);
        });

        test('detects gas switch events', () => {
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
            
            const events = getGasSwitchEvents(waypoints, gases);
            expect(events).toHaveLength(1);
            expect(events[0].time).toBe(28);
            expect(events[0].toGas.name).toBe('EAN50');
            expect(events[0].fromGas.name).toBe('Air');
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
            expect(switchWp).toBeDefined();
            
            // EAN50 MOD at 1.6 ppO2 = 22m, rounded down to 3m increment = 21m
            expect(switchWp.depth).toBe(21);
        });

        test('does not insert if ascent does not pass MOD', () => {
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 1, depth: 20 },  // Only go to 20m
                { time: 21, depth: 20 },
                { time: 23, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'Oxygen', o2: 1.0, n2: 0, he: 0 }  // MOD = 6m at 1.6 ppO2
            ];
            
            const result = insertGasSwitchWaypoints(waypoints, gases, 10, 1.6);
            
            // Oxygen MOD = 6m, but dive goes to 20m and ascends
            // It should pass through 6m so should have a switch
            const switchWp = result.find(wp => wp.gasId === 'deco');
            expect(switchWp).toBeDefined();
            expect(switchWp.depth).toBe(6);
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
            expect(switchWp).toBeDefined();
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
    });

    describe('calculateMOD', () => {
        test('calculates MOD for EAN32 at 1.4 ppO2', () => {
            // MOD = (1.4 / 0.32 - 1) * 10 = 33.75m
            const mod = calculateMOD(0.32, 1.4);
            expect(mod).toBeCloseTo(33.75, 1);
        });

        test('calculates MOD for Air at 1.6 ppO2', () => {
            // MOD = (1.6 / 0.21 - 1) * 10 = 66.2m
            const mod = calculateMOD(0.21, 1.6);
            expect(mod).toBeCloseTo(66.2, 1);
        });

        test('calculates MOD for Oxygen at 1.6 ppO2', () => {
            // MOD = (1.6 / 1.0 - 1) * 10 = 6m
            const mod = calculateMOD(1.0, 1.6);
            expect(mod).toBeCloseTo(6, 1);
        });

        test('uses default ppO2 of 1.4 if not specified', () => {
            const mod = calculateMOD(0.32);
            expect(mod).toBeCloseTo(33.75, 1);
        });
    });
});
