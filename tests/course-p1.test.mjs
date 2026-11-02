// Kurz P1 – Hustota: fyzika modelů, předvolby v URL, sdílené bloky, „Procvič si“.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
    waterDensity, densityAt, ICE_DENSITY, MAX_DENSITY_TEMPERATURE, WATER_RANGE,
} from '../js/physics/waterDensity.js';
import { lakeTemperature, lakePhase, lakeHasIce, LAKE_MONTHS } from '../js/physics/lakeProfiles.js';

const near = (actual, expected, tol, msg) =>
    assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ±${tol}, got ${actual}`);

// --- hustota vody ---------------------------------------------------------

test('hustota vody odpovídá tabulkovým hodnotám (Tanaka 2001)', () => {
    near(waterDensity(0), 999.843, 0.002, '0 °C');
    near(waterDensity(4), 999.975, 0.002, '4 °C');
    near(waterDensity(10), 999.703, 0.002, '10 °C');
    near(waterDensity(20), 998.207, 0.002, '20 °C');
    near(waterDensity(25), 997.047, 0.002, '25 °C');
});

test('maximum hustoty vody je u 4 °C (přesně 3,98 °C)', () => {
    near(MAX_DENSITY_TEMPERATURE, 3.98, 0.01);
    for (const t of [0, 2, 3, 5, 6, 10, 30]) {
        assert.ok(waterDensity(t) < waterDensity(MAX_DENSITY_TEMPERATURE), `${t} °C`);
    }
});

test('hustota mimo platnost vzorce hlásí chybu', () => {
    assert.throws(() => waterDensity(-1), RangeError);
    assert.throws(() => waterDensity(41), RangeError);
    assert.deepEqual(WATER_RANGE, [0, 40]);
});

test('pod 0 °C je led, lehčí než voda o ~8 %', () => {
    assert.deepEqual(densityAt(-2), { phase: 'ice', rho: ICE_DENSITY });
    assert.equal(ICE_DENSITY, 917);
    assert.equal(densityAt(4).phase, 'water');
    assert.equal(densityAt(0).phase, 'water');
    const drop = 1 - ICE_DENSITY / waterDensity(0);
    near(drop, 0.083, 0.003, 'pokles hustoty při zamrznutí');
});

// --- jezero / lom během roku ---------------------------------------------

const DEPTH = 40;
const profile = (m) => Array.from({ length: DEPTH + 1 }, (_, h) => lakeTemperature(m, h, DEPTH));

test('12 měsíců s fází roku', () => {
    assert.equal(LAKE_MONTHS.length, 12);
    const phases = new Set(LAKE_MONTHS.map((_, i) => lakePhase(i + 1)));
    assert.deepEqual([...phases].sort(), ['jarni-promichani', 'leto', 'podzimni-promichani', 'zima']);
    assert.throws(() => lakePhase(13), RangeError);
});

test('u dna hlubokého lomu je celý rok kolem 4 °C', () => {
    for (let m = 1; m <= 12; m++) {
        const bottom = lakeTemperature(m, DEPTH, DEPTH);
        assert.ok(bottom >= 3.9 && bottom <= 5.1, `měsíc ${m}: ${bottom}`);
    }
});

test('v zimě pod ledem: 0 °C u ledu, s hloubkou tepleji (inverzní vrstvení)', () => {
    for (const m of [1, 2]) {
        assert.equal(lakeHasIce(m), true);
        near(lakeTemperature(m, 0, DEPTH), 0, 0.05, `měsíc ${m} u ledu`);
        const p = profile(m);
        for (let h = 1; h < p.length; h++) assert.ok(p[h] >= p[h - 1] - 1e-9, `měsíc ${m}, ${h} m`);
        near(p[15], 4, 0.2, `měsíc ${m}, 15 m`);
    }
    assert.equal(lakeHasIce(8), false);
});

test('v létě teplá voda nahoře, s hloubkou monotónně chladněji (termoklina)', () => {
    const p = profile(8);
    assert.ok(p[0] > 20, `srpen hladina ${p[0]}`);
    for (let h = 1; h < p.length; h++) assert.ok(p[h] <= p[h - 1] + 1e-9, `srpen ${h} m`);
    // termoklina: největší pokles teploty na metr je pod hladinou, ne u ní
    const drops = p.slice(1).map((v, i) => p[i] - v);
    const steepest = drops.indexOf(Math.max(...drops));
    assert.ok(steepest >= 3 && steepest <= 15, `nejstrmější pokles v ${steepest} m`);
});

test('při jarním a podzimním promíchání má sloupec skoro stejnou teplotu', () => {
    for (let m = 1; m <= 12; m++) {
        if (!lakePhase(m).endsWith('promichani')) continue;
        const p = profile(m);
        assert.ok(Math.max(...p) - Math.min(...p) <= 2, `měsíc ${m}: ${Math.min(...p)}–${Math.max(...p)}`);
    }
});

test('mělčí lom: profil se přizpůsobí hloubce, dno stále studené', () => {
    const shallow = 15;
    near(lakeTemperature(8, shallow, shallow), 5, 1.5, 'dno 15m lomu v srpnu');
    assert.throws(() => lakeTemperature(8, 20, 15), RangeError);
});

// --- všechny teploty profilu jsou v rozsahu, kde platí vzorec hustoty --------

test('profily leží v rozsahu vzorce hustoty', () => {
    for (let m = 1; m <= 12; m++) {
        for (const t of profile(m)) assert.ok(t >= 0 && t <= 30, `měsíc ${m}: ${t}`);
    }
});

test('pásma profilu navazují a pokrývají celý sloupec', async () => {
    const { lakeBands } = await import('../js/physics/lakeProfiles.js');
    for (let m = 1; m <= 12; m++) {
        const b = lakeBands(m, DEPTH);
        assert.equal(b[0].from, 0);
        assert.equal(b.at(-1).to, DEPTH);
        for (let i = 1; i < b.length; i++) assert.equal(b[i].from, b[i - 1].to);
    }
    assert.deepEqual(lakeBands(8, DEPTH).map(b => b.label), ['teplá vrstva', 'termoklina', 'studená voda u dna']);
});
