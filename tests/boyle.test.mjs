import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    boyleVolume, volumeAtDepth, volumeChange,
    consumptionAtDepth, gasUsed, usableGas, timeToReserve, sacFromPressureDrop,
} from '../js/physics/boyle.js';

const close = (actual, expected, tol, msg) =>
    assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

// ---------------------------------------------------------------- p1 · V1 = p2 · V2

test('boyleVolume: kolikrát se zvětší tlak, tolikrát se zmenší objem (slide 23: 4 bar · 1 l = 1 bar · 4 l)', () => {
    assert.equal(boyleVolume(1, 4, 1), 4);
    assert.equal(boyleVolume(4, 1, 2), 2);
    assert.equal(boyleVolume(4, 1, 4), 1);
});

test('boyleVolume: neplatný vstup vyhodí chybu', () => {
    assert.throws(() => boyleVolume(-1, 1, 2), RangeError);
    assert.throws(() => boyleVolume(1, 0, 2), RangeError);
    assert.throws(() => boyleVolume(1, 1, Number.NaN), RangeError);
});

// ---------------------------------------------------------------- slide 24: zvon

const BELL = { volume: 1000, depth: 0 };

test('slide 24: zvon s 1 000 l na hladině má v 10 m 500 l a ve 20 m 333 l (školní čísla)', () => {
    assert.equal(volumeAtDepth(0, BELL), 1000);
    assert.equal(volumeAtDepth(10, BELL), 500);
    close(volumeAtDepth(20, BELL), 1000 / 3, 1e-9, 've 20 m:');
    assert.equal(Math.round(volumeAtDepth(20, BELL)), 333);
});

test('slide 24 přesně (moře): 502 l v 10 m a 335 l ve 20 m (analýza §4)', () => {
    const opts = { mode: 'exact', water: 'salt' };
    assert.equal(Math.round(volumeAtDepth(10, { ...BELL, ...opts })), 502);
    assert.equal(Math.round(volumeAtDepth(20, { ...BELL, ...opts })), 335);
});

test('test SPČR č. 39: zvon ve 20 m se naplní vodou do 2/3', () => {
    close(1 - volumeAtDepth(20, BELL) / BELL.volume, 2 / 3, 1e-12);
});

// ---------------------------------------------------------------- slide 25: balónek

const BALLOON = { volume: 6, depth: 40 };

test('slide 25: balónek 6 l ze 40 m má 7,5 / 10 / 15 / 30 l ve 30 / 20 / 10 / 0 m', () => {
    const expected = { 40: 6, 30: 7.5, 20: 10, 10: 15, 0: 30 };
    for (const [h, litres] of Object.entries(expected)) {
        close(volumeAtDepth(Number(h), BALLOON), litres, 1e-9, `${h} m:`);
    }
});

test('slide 25 přesně (moře): na hladině 29,8 l, rozdíl proti školním číslům pod 1 %', () => {
    const v = volumeAtDepth(0, { ...BALLOON, mode: 'exact', water: 'salt' });
    close(v, 29.81, 0.01);
    assert.ok(Math.abs(v - 30) / 30 < 0.01);
});

test('test SPČR č. 35: bublina z 300 m je těsně pod hladinou 31× větší', () => {
    close(volumeAtDepth(0, { volume: 1, depth: 300 }), 31, 1e-9);
});

// ---------------------------------------------------------------- slide 26: změny mezi řádky

test('slide 26: ze 40 do 30 m jen +1,5 l (×1,25), z 10 m na hladinu ×2 (+15 l)', () => {
    const deep = volumeChange(40, 30, BALLOON);
    close(deep.from, 6, 1e-12);
    close(deep.to, 7.5, 1e-12);
    close(deep.delta, 1.5, 1e-12);
    close(deep.ratio, 1.25, 1e-12);

    const shallow = volumeChange(10, 0, BALLOON);
    close(shallow.delta, 15, 1e-12);
    close(shallow.ratio, 2, 1e-12);
});

test('změna objemu = poměr tlaků (5/4 a 2/1), nezávisí na výchozím objemu', () => {
    close(volumeChange(40, 30, { volume: 1, depth: 0 }).ratio, 5 / 4, 1e-12);
    close(volumeChange(10, 0, { volume: 123, depth: 7 }).ratio, 2, 1e-12);
});

test('zvon: z hladiny do 10 m −500 l (poloviční objem)', () => {
    const c = volumeChange(0, 10, BELL);
    assert.equal(c.delta, -500);
    assert.equal(c.ratio, 0.5);
});

// ---------------------------------------------------------------- slidy 28–30: spotřeba

test('spotřeba v hloubce = hladinová spotřeba × p (30 l/min ve 25 m → 105 l/min)', () => {
    close(consumptionAtDepth(30, 25), 105, 1e-9);
    close(consumptionAtDepth(30, 0), 30, 1e-12);
});

test('slide 28: za 20 min ve 25 m při 30 l/min spotřebuje 2 100 l (přepočteno na hladinu)', () => {
    close(gasUsed({ sac: 30, depth: 25, time: 20 }), 2100, 1e-9);
});

test('slide 29: lahev 15 l, 200 bar, rezerva 50 bar = 2 250 l použitelného vzduchu', () => {
    assert.equal(usableGas({ cylinder: 15, start: 200, reserve: 50 }), 2250);
    assert.equal(usableGas({ cylinder: 15, start: 200 }), 3000);
});

test('slide 29: při 30 l/min vydrží 37,5 min v 10 m a 18,75 min ve 30 m', () => {
    const tank = { cylinder: 15, start: 200, reserve: 50, sac: 30 };
    close(timeToReserve({ ...tank, depth: 10 }), 37.5, 1e-9);
    close(timeToReserve({ ...tank, depth: 30 }), 18.75, 1e-9);
});

test('slide 30: 100 bar z 10 l za 20 min ve 20 m → hladinová spotřeba 16,7 l/min', () => {
    close(sacFromPressureDrop({ cylinder: 10, drop: 100, time: 20, depth: 20 }), 50 / 3, 1e-9);
});

test('testy SPČR č. 61, 62 a 66 (stejné vzorce jako slidy 29 a 30)', () => {
    close(timeToReserve({ cylinder: 15, start: 200, reserve: 0, sac: 30, depth: 10 }), 50, 1e-9);
    close(timeToReserve({ cylinder: 18, start: 200, reserve: 50, sac: 30, depth: 20 }), 30, 1e-9);
    close(sacFromPressureDrop({ cylinder: 10, drop: 100, time: 20, depth: 10 }), 25, 1e-9);
});

test('spotřeba přesně: hladinová spotřeba platí pro tlak na hladině (slide 28 → 2 088 l)', () => {
    assert.equal(Math.round(gasUsed({ sac: 30, depth: 25, time: 20, mode: 'exact', water: 'salt' })), 2088);
});

test('spotřeba: neplatný vstup vyhodí chybu', () => {
    assert.throws(() => usableGas({ cylinder: 15, start: 50, reserve: 100 }), RangeError);
    assert.throws(() => timeToReserve({ cylinder: 15, start: 200, reserve: 50, sac: 0, depth: 10 }), RangeError);
    assert.throws(() => sacFromPressureDrop({ cylinder: 10, drop: 100, time: 0, depth: 20 }), RangeError);
});

test('R4-06: přesný režim, zásoba z lahve a spotřeba v hloubce mají stejné jednotky (bar · l)', async () => {
    const { pressureAt } = await import('../js/physics/pressure.js');
    const exact = { mode: 'exact', water: 'salt' };
    const p = (h) => pressureAt(h, exact).total;
    const tank = { cylinder: 15, start: 200, reserve: 50, sac: 30, ...exact };
    // čas · hladinová spotřeba · p(h) = použitelná zásoba v bar · l
    const t = timeToReserve({ ...tank, depth: 30 });
    close(t * 30 * p(30), 15 * 150, 1e-9);
    // co ubude z lahve (přepočteno na hladinu, p0) za ten čas, je zásoba / p0
    close(gasUsed({ sac: 30, depth: 30, time: t, ...exact }) * p(0), 15 * 150, 1e-9);
    // hladinová spotřeba z poklesu tlaku je inverze času do rezervy
    close(sacFromPressureDrop({ cylinder: 15, drop: 150, time: t, depth: 30, ...exact }), 30, 1e-9);
    // ve školním režimu beze změny (slide 29)
    close(timeToReserve({ cylinder: 15, start: 200, reserve: 50, sac: 30, depth: 30 }), 18.75, 1e-12);
});
