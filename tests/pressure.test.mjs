import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PRESSURE_MODES, SCHOOL_ALTITUDE_STEP_BAR, atmosphericPressure, hydrostaticPressure, pressureAt,
    normalizedAtmosphere,
} from '../js/physics/pressure.js';

const close = (actual, expected, tol, msg) =>
    assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

// ---------------------------------------------------------------- školní režim

test('školní režim: slide 19, v 10 m je 2 bar (1 bar + 10/10)', () => {
    const p = pressureAt(10);
    assert.equal(p.atm, 1);
    assert.equal(p.hydro, 1);
    assert.equal(p.total, 2);
});

test('školní režim je výchozí', () => {
    assert.equal(pressureAt(10).total, pressureAt(10, { mode: PRESSURE_MODES.SCHOOL }).total);
});

test('školní režim: všechny odpovědi tabulky moře ze slidu 20', () => {
    const expected = { 0: 1, 10: 2, 20: 3, 22: 3.2, 28: 3.8, 30: 4, 33: 4.3, 40.5: 5.05, 66: 7.6 };
    for (const [h, bar] of Object.entries(expected)) {
        close(pressureAt(Number(h)).total, bar, 1e-9, `moře ${h} m:`);
    }
});

test('školní režim: všechny odpovědi tabulky horského jezera 5 500 m ze slidu 20', () => {
    const expected = { 0: 0.5, 10: 1.5, 20: 2.5, 30: 3.5, 40: 4.5, 45: 5, 51: 5.6, 55.5: 6.05 };
    for (const [h, bar] of Object.entries(expected)) {
        close(pressureAt(Number(h), { altitude: 5500 }).total, bar, 1e-9, `jezero ${h} m:`);
    }
});

test('školní režim: otázka SPČR č. 54 (5 500 m, 20 m → 250 kPa)', () => {
    close(pressureAt(20, { altitude: 5500 }).total * 100, 250, 1e-9, 'kPa:');
});

test('školní režim nezávisí na typu vody (ρ = 1 000 kg/m³)', () => {
    assert.equal(hydrostaticPressure(10, { water: 'salt' }), 1);
    assert.equal(hydrostaticPressure(10, { water: 'fresh' }), 1);
});

test('školní atmosférický tlak je zaokrouhlený na 0,1 bar', () => {
    assert.equal(SCHOOL_ALTITUDE_STEP_BAR, 0.1);
    assert.equal(atmosphericPressure(0), 1);
    assert.equal(atmosphericPressure(5500), 0.5);
    assert.equal(atmosphericPressure(2000), 0.8);
});

// ---------------------------------------------------------------- přesný režim

test('přesný režim: 10 m v moři → 2,02 bar (1,013 + 10 · 1 025 · 9,81 / 10⁵)', () => {
    const p = pressureAt(10, { mode: PRESSURE_MODES.EXACT, water: 'salt' });
    close(p.atm, 1.01325, 1e-9, 'atm:');
    close(p.total, 2.02, 0.005, 'celkový:');
});

test('přesný režim: sladká voda dává 0,98 bar na 10 m', () => {
    close(hydrostaticPressure(10, { mode: PRESSURE_MODES.EXACT, water: 'fresh' }), 0.981, 0.001);
});

test('přesný režim: atmosférický tlak podle výšky z js/deco/environment.js', () => {
    close(atmosphericPressure(5500, { mode: PRESSURE_MODES.EXACT }), 0.505, 0.001);
});

test('celkový tlak je součet atmosférického a hydrostatického', () => {
    for (const mode of Object.values(PRESSURE_MODES)) {
        const p = pressureAt(33, { mode, altitude: 5500, water: 'fresh' });
        close(p.total, p.atm + p.hydro, 1e-12, mode);
    }
});

test('neplatné vstupy hlásí chybu', () => {
    assert.throws(() => pressureAt(-1), RangeError);
    assert.throws(() => pressureAt(NaN), RangeError);
    assert.throws(() => pressureAt(10, { mode: 'nonsense' }), RangeError);
    assert.throws(() => hydrostaticPressure(10, { mode: PRESSURE_MODES.EXACT, water: 'mud' }), RangeError);
});

// ---------------------------------------------------------------- slide 17

test('tabulka výšek ze slidu 17 = ISA přepočtená na 100 kPa u moře (±0,15 kPa)', () => {
    const slide17 = {
        10000: 26, 9000: 30.3, 8000: 35.1, 7000: 40.5, 6000: 46.5, 5500: 49.8, 5000: 53.3,
        4000: 60.8, 3000: 69.1, 2000: 78.4, 1000: 88.6, 500: 94.2, 200: 97.6, 100: 98.8, 0: 100,
    };
    for (const [h, kPa] of Object.entries(slide17)) {
        close(normalizedAtmosphere(Number(h)) * 100, kPa, 0.15, `${h} m:`);
    }
});
