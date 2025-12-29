/**
 * Tests for diveProfile.js module
 */

import {
    createDefaultProfile,
    validateProfile,
    parseProfileInput,
    calculateRates,
    getDiveStats
} from '../js/diveProfile.js';

describe('diveProfile module', () => {
    
    describe('createDefaultProfile', () => {
        test('returns an array of waypoints', () => {
            const profile = createDefaultProfile();
            expect(Array.isArray(profile)).toBe(true);
            expect(profile.length).toBeGreaterThan(0);
        });

        test('each waypoint has time and depth', () => {
            const profile = createDefaultProfile();
            profile.forEach(wp => {
                expect(wp).toHaveProperty('time');
                expect(wp).toHaveProperty('depth');
                expect(typeof wp.time).toBe('number');
                expect(typeof wp.depth).toBe('number');
            });
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
        test('valid profile passes validation', () => {
            const profile = createDefaultProfile();
            const result = validateProfile(profile);
            expect(result.valid).toBe(true);
        });

        test('rejects non-array input', () => {
            const result = validateProfile('not an array');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Profile must be an array');
        });

        test('rejects profile with less than 2 waypoints', () => {
            const result = validateProfile([{ time: 0, depth: 0 }]);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Profile must have at least 2 waypoints');
        });

        test('rejects profile not starting at time 0', () => {
            const result = validateProfile([
                { time: 5, depth: 0 },
                { time: 10, depth: 20 }
            ]);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('First waypoint must be at time 0');
        });

        test('rejects profile not starting at surface', () => {
            const result = validateProfile([
                { time: 0, depth: 10 },
                { time: 10, depth: 20 }
            ]);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('First waypoint should be at surface (0m)');
        });

        test('rejects negative time values', () => {
            const result = validateProfile([
                { time: 0, depth: 0 },
                { time: -5, depth: 20 }
            ]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Time cannot be negative'))).toBe(true);
        });

        test('rejects negative depth values', () => {
            const result = validateProfile([
                { time: 0, depth: 0 },
                { time: 5, depth: -10 }
            ]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Depth cannot be negative'))).toBe(true);
        });

        test('rejects non-ascending time values', () => {
            const result = validateProfile([
                { time: 0, depth: 0 },
                { time: 10, depth: 20 },
                { time: 5, depth: 10 }  // time went backwards
            ]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Time must be greater than previous'))).toBe(true);
        });

        test('warns about depth exceeding 60m but still valid', () => {
            const result = validateProfile([
                { time: 0, depth: 0 },
                { time: 5, depth: 70 },
                { time: 15, depth: 0 }
            ]);
            expect(result.valid).toBe(true);  // Warnings don't invalidate
            expect(result.errors.some(e => e.includes('exceeds recreational limits'))).toBe(true);
        });

        test('warns about not ending at surface but still valid', () => {
            const result = validateProfile([
                { time: 0, depth: 0 },
                { time: 10, depth: 20 }  // doesn't end at surface
            ]);
            expect(result.valid).toBe(true);  // Warnings don't invalidate
            expect(result.errors.some(e => e.includes('should end at surface'))).toBe(true);
        });

        test('handles invalid time type', () => {
            const result = validateProfile([
                { time: 0, depth: 0 },
                { time: 'ten', depth: 20 }
            ]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Invalid time value'))).toBe(true);
        });

        test('handles invalid depth type', () => {
            const result = validateProfile([
                { time: 0, depth: 0 },
                { time: 10, depth: 'deep' }
            ]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Invalid depth value'))).toBe(true);
        });
    });

    describe('parseProfileInput', () => {
        test('parses string inputs to numbers', () => {
            const input = [
                { time: '0', depth: '0' },
                { time: '10', depth: '30' }
            ];
            const result = parseProfileInput(input);
            
            expect(result[0].time).toBe(0);
            expect(result[0].depth).toBe(0);
            expect(result[1].time).toBe(10);
            expect(result[1].depth).toBe(30);
        });

        test('handles invalid inputs as 0', () => {
            const input = [
                { time: '', depth: 'abc' },
                { time: null, depth: undefined }
            ];
            const result = parseProfileInput(input);
            
            expect(result[0].time).toBe(0);
            expect(result[0].depth).toBe(0);
            expect(result[1].time).toBe(0);
            expect(result[1].depth).toBe(0);
        });

        test('parses decimal values', () => {
            const input = [{ time: '5.5', depth: '22.5' }];
            const result = parseProfileInput(input);
            
            expect(result[0].time).toBe(5.5);
            expect(result[0].depth).toBe(22.5);
        });
    });

    describe('calculateRates', () => {
        test('calculates descent rate', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 2, depth: 40 }  // 40m in 2 min = 20 m/min
            ];
            const rates = calculateRates(profile);
            
            expect(rates[0].rate).toBe(20);
            expect(rates[0].type).toBe('descent');
        });

        test('calculates ascent rate', () => {
            const profile = [
                { time: 0, depth: 40 },
                { time: 4, depth: 0 }  // 40m in 4 min = 10 m/min
            ];
            const rates = calculateRates(profile);
            
            expect(rates[0].rate).toBe(10);
            expect(rates[0].type).toBe('ascent');
        });

        test('identifies level segments', () => {
            const profile = [
                { time: 0, depth: 30 },
                { time: 10, depth: 30 }  // staying at same depth
            ];
            const rates = calculateRates(profile);
            
            expect(rates[0].rate).toBe(0);
            expect(rates[0].type).toBe('level');
        });

        test('returns from/to indices', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 2, depth: 30 },
                { time: 10, depth: 30 }
            ];
            const rates = calculateRates(profile);
            
            expect(rates[0].from).toBe(0);
            expect(rates[0].to).toBe(1);
            expect(rates[1].from).toBe(1);
            expect(rates[1].to).toBe(2);
        });
    });

    describe('getDiveStats', () => {
        test('returns null for invalid profile', () => {
            expect(getDiveStats(null)).toBeNull();
            expect(getDiveStats([])).toBeNull();
            expect(getDiveStats([{ time: 0, depth: 0 }])).toBeNull();
        });

        test('calculates max depth', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 5, depth: 25 },
                { time: 10, depth: 40 },
                { time: 20, depth: 0 }
            ];
            const stats = getDiveStats(profile);
            expect(stats.maxDepth).toBe(40);
        });

        test('calculates total time', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 15, depth: 30 },
                { time: 45, depth: 0 }
            ];
            const stats = getDiveStats(profile);
            expect(stats.totalTime).toBe(45);
        });

        test('calculates max descent rate', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 2, depth: 40 },  // 20 m/min descent
                { time: 20, depth: 40 },
                { time: 25, depth: 0 }
            ];
            const stats = getDiveStats(profile);
            expect(stats.maxDescentRate).toBe(20);
        });

        test('calculates max ascent rate', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 5, depth: 30 },
                { time: 8, depth: 0 }  // 30m in 3 min = 10 m/min ascent
            ];
            const stats = getDiveStats(profile);
            expect(stats.maxAscentRate).toBe(10);
        });

        test('counts waypoints', () => {
            const profile = createDefaultProfile();
            const stats = getDiveStats(profile);
            expect(stats.waypointCount).toBe(profile.length);
        });
    });
});
