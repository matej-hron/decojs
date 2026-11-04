import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    LAKE_PHASES, PHASE_MS, isSinkingTransition, lakeFrame, lakeTemperatureColor, lakeTextColor, playPosition,
} from '../js/physics/lakeCycle.js';

const luminance = (hex) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

test('fáze přesně podle GIFu z přednášky: teploty, vítr, strom, led', () => {
    assert.deepEqual(LAKE_PHASES.map(p => [p.temps, p.wind, p.tree]), [
        [[14, 10, 8, 6, 4], 'warm', 'full'],
        [[10, 8, 6, 4, 4], 'cold', 'falling'],
        [[6, 6, 4, 4, 4], 'cold', 'bareLeaves'],
        [[4, 4, 4, 4, 4], 'cold', 'bare'],
        [[2, 3, 4, 4, 4], 'cold', 'bare'],
        [[0, 1, 2, 3, 4], 'cold', 'snow'],
        [[2, 3, 4, 4, 4], 'warm', 'bare'],
        [[4, 4, 4, 4, 4], 'warm', 'buds'],
        [[10, 8, 6, 4, 4], 'warm', 'leaves'],
    ]);
    assert.deepEqual(LAKE_PHASES.map((p, i) => (p.ice ? i + 1 : null)).filter(Boolean), [6], 'led jen ve fázi 6');
    assert.deepEqual(LAKE_PHASES.map(p => p.label), ['konec léta', 'podzim', 'podzim', 'pozdní podzim',
        'začátek zimy', 'zima', 'jaro', 'jaro', 'začátek léta']);
});

test('v modelu nejsou čísla bez zdroje: u dna vždy 4 °C, teplota jen z GIFu', () => {
    for (const p of LAKE_PHASES) assert.equal(p.temps.at(-1), 4);
    assert.ok(Math.max(...LAKE_PHASES.flatMap(p => p.temps)) === 14);
});

test('celá fáze: snímek odpovídá tabulce, nic neklesá', () => {
    LAKE_PHASES.forEach((p, i) => {
        const f = lakeFrame(i);
        assert.deepEqual(f.temps, p.temps);
        assert.equal(f.phase, i);
        assert.equal(f.ice, p.ice ? 1 : 0);
        assert.equal(f.warm, p.wind === 'warm' ? 1 : 0);
        assert.equal(f.sinking, 0);
    });
});

test('přechod je plynulý: teploty i led se mění postupně', () => {
    assert.deepEqual(lakeFrame(0.5).temps, [12, 9, 7, 5, 4]);
    assert.equal(lakeFrame(0.25).phase, 0);
    assert.equal(lakeFrame(0.75).phase, 1);
    assert.equal(lakeFrame(4.5).ice, 0.5, 'led přirůstá');
    assert.equal(lakeFrame(5.25).ice, 0.75, 'led mizí');
    assert.equal(lakeFrame(0.5).warm, 0.5);
    assert.equal(lakeFrame(0.5).tree.crown, 0.85);
});

test('po fázi 9 cyklus pokračuje fází 1', () => {
    assert.deepEqual(lakeFrame(8.5).temps, [12, 9, 7, 5, 4]);
    assert.equal(lakeFrame(8.75).phase, 0);
    assert.deepEqual(lakeFrame(9).temps, LAKE_PHASES[0].temps);
});

test('klesání vody jen při přechodech 1→2, 2→3, 3→4, 6→7, 7→8', () => {
    const sinking = LAKE_PHASES.map((_, i) => isSinkingTransition(i));
    assert.deepEqual(sinking, [true, true, true, false, false, true, true, false, false]);
    assert.ok(lakeFrame(0.5).sinking > 0.9, 'uprostřed přechodu naplno');
    assert.equal(lakeFrame(3.5).sinking, 0);
    assert.equal(lakeFrame(4.5).sinking, 0);
    assert.equal(lakeFrame(8.5).sinking, 0);
});

test('tempo: 2 s na fázi, začátek stojí, konec přechází', () => {
    assert.equal(PHASE_MS, 2000);
    assert.equal(playPosition(0, 3), 3);
    assert.equal(playPosition(900, 3), 3, 'fáze chvíli stojí, ať se dá přečíst');
    assert.equal(playPosition(2000, 3), 4);
    assert.equal(playPosition(4000, 3), 5);
    const mid = playPosition(1500, 3);
    assert.ok(mid > 3 && mid < 4, `uprostřed přechodu ${mid}`);
    assert.equal(playPosition(2000, 8), 0, 'po fázi 9 zase fáze 1');
    assert.equal(playPosition(18000, 0), 0, 'celý cyklus za 18 s');
});

test('barvy: teplé červené, 4 °C světlá, pod 4 °C modré, stejná logika jako v GIFu', () => {
    const [r4, g4, b4] = rgb(lakeTemperatureColor(4));
    assert.ok(Math.min(r4, g4, b4) > 180, '4 °C je světlá');
    for (const t of [6, 8, 10, 14]) {
        const [r, , b] = rgb(lakeTemperatureColor(t));
        assert.ok(r > b + 30, `${t} °C je červená`);
    }
    for (const t of [0, 1, 2, 3]) {
        const [r, , b] = rgb(lakeTemperatureColor(t));
        assert.ok(b > r + 30, `${t} °C je modrá`);
    }
    assert.ok(luminance(lakeTemperatureColor(14)) < luminance(lakeTemperatureColor(8)), 'čím tepleji, tím sytější');
    assert.ok(luminance(lakeTemperatureColor(0)) < luminance(lakeTemperatureColor(3)), 'čím chladněji, tím sytější');
});

test('text ve vrstvě má kontrast aspoň 4,5:1 v každé teplotě přechodu', () => {
    for (let t = 0; t <= 14; t += 0.25) {
        const bg = lakeTemperatureColor(t);
        const fg = lakeTextColor(bg);
        assert.ok(contrast(fg, bg) >= 4.5, `${t} °C: ${fg} na ${bg} = ${contrast(fg, bg).toFixed(2)}`);
    }
});
