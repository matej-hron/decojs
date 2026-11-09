import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatLitres, depthLabel, nextRow, previousRow,
    gasReadout, balloonRadius, bellWaterFraction, volumeScaleMax,
} from '../js/components/waterColumn/gasVolumeLayer.js';
import {
    BOYLE_OBJECTS, BOYLE_PARAMS, MODEL_MAX_DEPTH, initialStateFromParams, paramsFromState, startDepth,
} from '../js/course/boyleModel.js';
import { readParams } from '../js/course/modelParams.js';

const NBSP = ' ';
const { balloon: BALLOON, bell: BELL } = BOYLE_OBJECTS;

// ---------------------------------------------------------------- předměty ze slidů

test('předměty: balónek 6 l ve 40 m (slide 25), zvon 1 000 l na hladině (slide 24)', () => {
    assert.deepEqual([BALLOON.volume, BALLOON.depth], [6, 40]);
    assert.deepEqual([BELL.volume, BELL.depth], [1000, 0]);
});

test('řádky tabulek ve směru slidu: balónek 40 → 0 m odspodu, zvon 0 → 20 m', () => {
    assert.deepEqual([...BALLOON.rows], [40, 30, 20, 10, 0]);
    assert.deepEqual([...BELL.rows], [0, 10, 20]);
});

test('sloupec sahá do 40 m, kde balónek začíná', () => {
    assert.equal(MODEL_MAX_DEPTH, 40);
});

// ---------------------------------------------------------------- krokování

test('nextRow: šipka → jde po řádcích ve směru slidu a na konci zůstane', () => {
    assert.equal(nextRow(40, BALLOON.rows), 30);
    assert.equal(nextRow(10, BALLOON.rows), 0);
    assert.equal(nextRow(0, BALLOON.rows), 0);
    assert.equal(nextRow(0, BELL.rows), 10);
    assert.equal(nextRow(20, BELL.rows), 20);
});

test('nextRow / previousRow mimo řádek: nejbližší řádek ve směru, resp. proti směru slidu', () => {
    assert.equal(nextRow(25, BALLOON.rows), 20);
    assert.equal(previousRow(25, BALLOON.rows), 30);
    assert.equal(nextRow(15, BELL.rows), 20);
    assert.equal(previousRow(15, BELL.rows), 10);
    assert.equal(nextRow(30, BELL.rows), 30, 'za koncem tabulky zvon dál nejde');
    assert.equal(previousRow(30, BELL.rows), 20);
});

test('previousRow: šipka ← vrací a na začátku tabulky není předchozí řádek', () => {
    assert.equal(previousRow(30, BALLOON.rows), 40);
    assert.equal(previousRow(0, BALLOON.rows), 10);
    assert.equal(previousRow(40, BALLOON.rows), null);
    assert.equal(previousRow(0, BELL.rows), null);
    assert.equal(previousRow(10, BELL.rows), 0);
});

// ---------------------------------------------------------------- formát

test('formatLitres: do 100 l na desetiny bez ,0; od 100 l celé s mezerou v tisících', () => {
    assert.equal(formatLitres(6), '6');
    assert.equal(formatLitres(7.5), '7,5');
    assert.equal(formatLitres(30), '30');
    assert.equal(formatLitres(8.5714), '8,6');
    assert.equal(formatLitres(1000 / 3), '333');
    assert.equal(formatLitres(1000), `1${NBSP}000`);
});

test('depthLabel: 0 m je „hladina“', () => {
    assert.equal(depthLabel(0), 'hladina');
    assert.equal(depthLabel(10), `10${NBSP}m`);
    assert.equal(depthLabel(12.5), `12,5${NBSP}m`);
});

// ---------------------------------------------------------------- odečet objemu (T21: p · V = konst. jako postup ve „Více“)

test('gasReadout: druhý řádek odečtu, p · V z výchozího stavu a objem jako podíl', () => {
    const line = (rest) => `<br><var>p</var> · <var>V</var> = ${rest}`;
    assert.equal(gasReadout(0, BELL), line('1 · 1&nbsp;000 = 1&nbsp;000 → <var>V</var> = 1&nbsp;000 / 1 = 1&nbsp;000&nbsp;l'));
    assert.equal(gasReadout(10, BELL), line('1 · 1&nbsp;000 = 1&nbsp;000 → <var>V</var> = 1&nbsp;000 / 2 = 500&nbsp;l'));
    assert.equal(gasReadout(20, BELL), line('1 · 1&nbsp;000 = 1&nbsp;000 → <var>V</var> = 1&nbsp;000 / 3 ≈ 333&nbsp;l'), '≈ u zaokrouhlení');
    assert.equal(gasReadout(40, BALLOON), line('5 · 6 = 30 → <var>V</var> = 30 / 5 = 6&nbsp;l'));
    assert.equal(gasReadout(30, BALLOON), line('5 · 6 = 30 → <var>V</var> = 30 / 4 = 7,5&nbsp;l'));
    assert.equal(gasReadout(10, BALLOON), line('5 · 6 = 30 → <var>V</var> = 30 / 2 = 15&nbsp;l'));
    assert.equal(gasReadout(12, BALLOON), line('5 · 6 = 30 → <var>V</var> = 30 / 2,2 ≈ 13,6&nbsp;l'), 'mezi řádky tabulky');
});

test('gasReadout: bez staré závorky se změnou proti předchozímu řádku (×2, ÷2)', () => {
    for (const [depth, obj] of [[0, BALLOON], [30, BALLOON], [10, BELL], [20, BELL]]) {
        assert.doesNotMatch(gasReadout(depth, obj), /[×÷()]|hladina/);
    }
});

// ---------------------------------------------------------------- kreslení

test('balloonRadius: poloměr úměrný třetí odmocnině objemu (30 l má 1,71× větší průměr než 6 l)', () => {
    const r6 = balloonRadius(6, 30, 100);
    const r30 = balloonRadius(30, 30, 100);
    assert.equal(r30, 100);
    assert.ok(Math.abs(r30 / r6 - Math.cbrt(5)) < 1e-12);
    assert.ok(Math.abs(Math.cbrt(5) - 1.71) < 0.01);
});

test('bellWaterFraction: zvon ve 20 m je ze 2/3 plný vody (test SPČR č. 39), na hladině prázdný', () => {
    assert.equal(bellWaterFraction(1000, 1000), 0);
    assert.equal(bellWaterFraction(500, 1000), 0.5);
    assert.ok(Math.abs(bellWaterFraction(1000 / 3, 1000) - 2 / 3) < 1e-12);
});

test('volumeScaleMax: konec osy objemu je největší objem ve sloupci (na hladině)', () => {
    assert.equal(volumeScaleMax(BALLOON), 30);
    assert.equal(volumeScaleMax(BELL), 1000);
});

// ---------------------------------------------------------------- předvolby v URL

test('startDepth: balónek začíná ve 40 m, zvon na hladině', () => {
    assert.equal(startDepth('balloon'), 40);
    assert.equal(startDepth('bell'), 0);
});

test('předvolby: bez parametrů balónek ve 40 m, ?zvon=1 zvon na hladině, hloubka se dá zadat', () => {
    const read = (q) => initialStateFromParams(readParams(q, BOYLE_PARAMS), new URLSearchParams(q));
    assert.deepEqual(read(''), { depth: 40, gasObject: 'balloon' });
    assert.deepEqual(read('?zvon=1'), { depth: 0, gasObject: 'bell' });
    assert.deepEqual(read('?zvon=1&hloubka=20'), { depth: 20, gasObject: 'bell' });
    assert.deepEqual(read('?hloubka=10'), { depth: 10, gasObject: 'balloon' });
    assert.deepEqual(read('?hloubka=99'), { depth: 40, gasObject: 'balloon' });
});

test('paramsFromState: do adresy jen to, co se liší od výchozího stavu předmětu', () => {
    assert.deepEqual(paramsFromState({ depth: 40, gasObject: 'balloon' }), { zvon: null, hloubka: null });
    assert.deepEqual(paramsFromState({ depth: 10, gasObject: 'balloon' }), { zvon: null, hloubka: 10 });
    assert.deepEqual(paramsFromState({ depth: 0, gasObject: 'bell' }), { zvon: 1, hloubka: null });
    assert.deepEqual(paramsFromState({ depth: 20, gasObject: 'bell' }), { zvon: 1, hloubka: 20 });
});

test('withPreset: předvolba náhledu se sloučí do adresy, ostatní parametry zůstanou', async () => {
    const { withPreset } = await import('../js/course/modelParams.js');
    assert.equal(withPreset('', 'zvon=1'), '?zvon=1');
    assert.equal(withPreset('?kod=x', 'zvon=0&hloubka=10'), '?kod=x&zvon=0&hloubka=10');
    assert.equal(withPreset('?zvon=1&hloubka=20', 'zvon=0'), '?zvon=0&hloubka=20');
});

test('volumeTicks: popisky osy objemu se nepřekrývají ani v úzkém panelu telefonu', async () => {
    const { volumeTicks } = await import('../js/components/waterColumn/gasVolumeLayer.js');
    assert.deepEqual(volumeTicks(1000, 70, 14), [0, 1000], 'zvon na 390 px');
    assert.deepEqual(volumeTicks(30, 340, 20), [0, 5, 10, 15, 20, 25, 30], 'balónek na desktopu');
    assert.ok(volumeTicks(1000, 340, 20).length >= 5, 'zvon na desktopu');
    const { tickLabelBoxes } = await import('../js/components/waterColumn/gasVolumeLayer.js');
    for (const [v, w, fs] of [[1000, 70, 14], [1000, 120, 14], [30, 70, 14], [30, 102, 14], [1000, 340, 20], [30, 340, 20]]) {
        const boxes = tickLabelBoxes(volumeTicks(v, w, fs), v, w, fs);
        boxes.forEach((b, i) => { if (i) assert.ok(b.left - boxes[i - 1].right >= 0.4 * fs, `${v} l, ${w} px`); });
        assert.ok(boxes.at(-1).right <= w + 0.9 * fs + 1e-9, 'maximum nepřeteče okraj SVG');
    }
});

// ---------------------------------------------------------------- R4: zvon podle plochy, poloha předmětů

test('R4-03: hladina ve zvonu podle plochy nakresleného tvaru (ve 20 m vzduch třetina plochy, v 10 m polovina)', async () => {
    const { BELL_SHAPE, bellAreaAbove, bellAirDepth } = await import('../js/components/waterColumn/gasVolumeLayer.js');
    const { height: h, dome } = BELL_SHAPE;
    const total = bellAreaAbove(h, 1, h, dome);
    // numerická kontrola uzavřeného tvaru plochy: šířka kopule w(1 − t²), t = 1 − √(u/dome)
    let num = 0; const n = 20000;
    for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n) * h;
        const t = u < dome ? 1 - Math.sqrt(u / dome) : 0;
        num += (1 - t * t) * (h / n);
    }
    assert.ok(Math.abs(num - total) < 1e-4, `${num} vs ${total}`);
    for (const [depth, share] of [[0, 1], [10, 1 / 2], [20, 1 / 3], [30, 1 / 4]]) {
        const u = bellAirDepth(share, 1, h, dome);
        assert.ok(Math.abs(bellAreaAbove(u, 1, h, dome) / total - share) < 1e-9, `${depth} m`);
    }
    assert.equal(bellAirDepth(1, 1, h, dome), h, 'na hladině je celý zvon vzduch');
    assert.equal(bellAirDepth(0, 1, h, dome), 0);
});

test('R4-01: model nechává nad hladinou místo pro zvon a balónek na hladině (headroom)', async () => {
    const { computeGeometry } = await import('../js/components/WaterColumn.js');
    const base = computeGeometry({ width: 800, height: 500, maxDepth: 40, panels: 2 });
    const roomy = computeGeometry({ width: 800, height: 500, maxDepth: 40, panels: 2, headroom: 4.8 });
    assert.equal(roomy.column.y - base.column.y, Math.round(4.8 * base.fontSize));
    assert.equal(roomy.column.y + roomy.column.h, base.column.y + base.column.h, 'dno sloupce zůstává');
});

test('R4-04: osa tlaku jen ze školního režimu, když model přepínač nemá', async () => {
    const { pressureScaleMax } = await import('../js/components/waterColumn/pressureLayer.js');
    assert.equal(pressureScaleMax(40, { exact: false }), 5);
    assert.equal(pressureScaleMax(40), 6, 'M1 s přepínačem počítá i s přesným režimem');
});

test('R4-04: úzký panel objemu má popisky 0, polovina a maximum, když se vejdou', async () => {
    const { volumeTicks } = await import('../js/components/waterColumn/gasVolumeLayer.js');
    const { tickLabelBoxes } = await import('../js/components/waterColumn/gasVolumeLayer.js');
    for (const w of [60, 70, 102, 140]) {
        const ticks = volumeTicks(30, w, 14);
        assert.equal(ticks[0], 0); assert.equal(ticks.at(-1), 30, `${w} px končí na 30`);
        const boxes = tickLabelBoxes(ticks, 30, w, 14);
        boxes.forEach((b, i) => { if (i) assert.ok(b.left - boxes[i - 1].right >= 0.4 * 14, `balónek ${w} px: ${ticks}`); });
    }
    assert.ok([[0, 15, 30], [0, 30]].some(a => JSON.stringify(a) === JSON.stringify(volumeTicks(30, 40, 14))), 'velmi úzký panel: 0, polovina, maximum, jinak 0 a maximum');
    assert.deepEqual(volumeTicks(1000, 120, 14), [0, 500, 1000], 'zvon na užším panelu');
    assert.deepEqual(volumeTicks(1000, 70, 14), [0, 1000], 'zvon na telefonu: polovina se nevejde');
});

test('R4-04: popisek pruhu nepřeleze do sousedního panelu ani přes osu', async () => {
    const { placeBarLabel } = await import('../js/components/WaterColumn.js');
    const fs = 14;
    // dost místa vpravo: za pruhem
    const a = placeBarLabel({ x0: 0, x1: 20, right: 200, fs, labels: ['2 bar', '2'] });
    assert.equal(a.anchor, 'start');
    assert.equal(a.text, '2 bar');
    // dlouhý pruh: dovnitř
    const b = placeBarLabel({ x0: 0, x1: 190, right: 200, fs, labels: ['5 bar', '5'] });
    assert.deepEqual([b.anchor, b.inside, b.text], ['end', true, '5 bar']);
    // úzký panel telefonu: plný popisek se nevejde ani za pruh, ani do něj → jen číslo
    const c = placeBarLabel({ x0: 0, x1: 28, right: 70, fs, labels: ['2 bar', '2'] });
    assert.equal(c.text, '2');
    const end = c.anchor === 'start' ? c.x + c.width : c.x;
    const start = c.anchor === 'start' ? c.x : c.x - c.width;
    assert.ok(end <= 70 && start >= 0, `${start}–${end}`);
});

test('R4-01: místo nad hladinou pojme zvon i balónek na hladině', async () => {
    const { BOYLE_HEADROOM_EM } = await import('../js/course/boyleModel.js');
    const { BELL_SHAPE, BELL_MAX_WIDTH_EM, BALLOON_MAX_RADIUS_EM } = await import('../js/components/waterColumn/gasVolumeLayer.js');
    const above = 1.7 + BOYLE_HEADROOM_EM; // em nad hladinou: okraj kostry + headroom
    assert.ok(BELL_SHAPE.height * BELL_MAX_WIDTH_EM <= above - 0.2, 'zvon');
    assert.ok(BALLOON_MAX_RADIUS_EM <= above - 0.2, 'balónek');
});

test('S5: nízký náhled na telefonu má místo nad hladinou jen 1 em, ať sloupec není jen pár pixelů', async () => {
    const { boyleHeadroom, BOYLE_HEADROOM_EM } = await import('../js/course/boyleModel.js');
    assert.equal(boyleHeadroom(true, 150), 1);
    assert.equal(boyleHeadroom(true, 320), BOYLE_HEADROOM_EM);
    assert.equal(boyleHeadroom(false, 150), BOYLE_HEADROOM_EM, 'otevřený model má plné místo');
    const { computeGeometry } = await import('../js/components/WaterColumn.js');
    const g = computeGeometry({ width: 324, height: 160, maxDepth: 40, panels: 2, headroom: boyleHeadroom(true, 150) });
    assert.ok(g.column.h >= 60, `sloupec ${g.column.h} px`);
});
