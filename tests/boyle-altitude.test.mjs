// Kurz P1, model B1 „Balónek a zvon“: nadmořská výška hladiny (U12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { SLIDE_ALTITUDE_KPA, pressureAt } from '../js/physics/pressure.js';
import { pressureReadout, layerPressure } from '../js/components/waterColumn/pressureLayer.js';
import { gasReadout, objectVolume, volumeScaleMax, volumeTicks, tickLabelBoxes } from '../js/components/waterColumn/gasVolumeLayer.js';
import {
    BOYLE_ALTITUDES, BOYLE_OBJECTS, BOYLE_PARAMS, altitudeLabel, altitudeState, boyleAtmosphere,
    initialStateFromParams, paramsFromState,
} from '../js/course/boyleModel.js';
import { readParams } from '../js/course/modelParams.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const NBSP = '\u00a0';
const { balloon: BALLOON, bell: BELL } = BOYLE_OBJECTS;
const line = (s) => `<br><var>p</var> · <var>V</var> = ${s}`;
const at = (altitude, extra = {}) => ({ pressureMode: 'school', water: 'salt', ...altitudeState(altitude), ...extra });

// ---------------------------------------------------------------- jedno místo pro tabulku slidu 17

test('SLIDE_ALTITUDE_KPA je přesně tabulka slidu 17 v p1/tlak.html', () => {
    const doc = new JSDOM(read('p1/tlak.html')).window.document;
    const cells = [...doc.querySelectorAll('.course-slide[data-slide-number="17"] table.course-table tbody td')]
        .map((td) => td.textContent.replace(/\s| /g, '').replace(',', '.'));
    const fromSlide = {};
    for (let i = 0; i < cells.length; i += 2) if (cells[i] !== '') fromSlide[Number(cells[i])] = Number(cells[i + 1]);
    assert.deepEqual({ ...SLIDE_ALTITUDE_KPA }, fromSlide);
    assert.ok(Object.isFrozen(SLIDE_ALTITUDE_KPA));
});

// ---------------------------------------------------------------- předvolby a p_atm

test('předvolby výšky: 0, 500, 1 000, 2 000, 3 000 a 5 500 m n. m.', () => {
    assert.deepEqual([...BOYLE_ALTITUDES], [0, 500, 1000, 2000, 3000, 5500]);
});

test('p_atm z tabulky slidu 17 na setiny baru, 5 500 m na 0,5 bar (počítání z hlavy)', () => {
    const expected = { 0: 1, 500: 0.94, 1000: 0.89, 2000: 0.78, 3000: 0.69, 5500: 0.5 };
    for (const h of BOYLE_ALTITUDES) {
        assert.equal(boyleAtmosphere(h), expected[h], `${h} m`);
        const tolerance = h === 5500 ? 0.05 : 0.005;
        assert.ok(Math.abs(boyleAtmosphere(h) - SLIDE_ALTITUDE_KPA[h] / 100) <= tolerance + 1e-9, `${h} m je z tabulky`);
    }
});

test('popisky předvoleb: „5 500 m (≈ 0,5 bar)“, ostatní jen výška', () => {
    assert.equal(altitudeLabel(0), `0${NBSP}m`);
    assert.equal(altitudeLabel(1000), `1${NBSP}000${NBSP}m`);
    assert.equal(altitudeLabel(5500), `5${NBSP}500${NBSP}m (≈${NBSP}0,5${NBSP}bar)`);
});

test('altitudeState: výška a p_atm jdou do stavu sloupce spolu', () => {
    assert.deepEqual(altitudeState(1000), { altitude: 1000, atm: 0.89 });
    assert.deepEqual(altitudeState(0), { altitude: 0, atm: 1 });
});

test('pressureAt: atm ze stránky nahradí p_atm z výšky, p_h zůstává 1 bar na 10 m', () => {
    assert.deepEqual(pressureAt(40, { altitude: 1000, atm: 0.89 }), { atm: 0.89, hydro: 4, total: 4.89 });
    assert.equal(pressureAt(40, { altitude: 1000 }).atm, 0.9, 'bez atm školní režim jako dosud (M1)');
    assert.throws(() => pressureAt(10, { atm: 0 }), RangeError);
});

// ---------------------------------------------------------------- odečet

test('odečet tlaku: hloubka 40 m, 1 000 m n. m.: p = 0,89 + 4 = 4,89 bar, čtverečky barev zůstávají', () => {
    const html = pressureReadout(at(1000, { depth: 40 }));
    assert.match(html, /wc-pressure-key-atm/);
    assert.match(html, /wc-pressure-key-h/);
    assert.ok(html.endsWith(' = 0,89 + 4 = 4,89&nbsp;bar'), html);
    assert.ok(pressureReadout(at(5500, { depth: 0 })).endsWith(' = 0,5 + 0 = 0,5&nbsp;bar'));
    assert.ok(pressureReadout(at(0, { depth: 40 })).endsWith(' = 1 + 4 = 5&nbsp;bar'), '0 m beze změny');
});

test('odečet objemu, balónek: p · V ve 40 m s tlakem podle výšky, objem jako podíl', () => {
    assert.equal(gasReadout(40, BALLOON, at(1000)), line('4,89 · 6 = 29,34 → <var>V</var> = 29,34 / 4,89 = 6&nbsp;l'));
    assert.equal(gasReadout(0, BALLOON, at(1000)), line('4,89 · 6 = 29,34 → <var>V</var> = 29,34 / 0,89 ≈ 33&nbsp;l'));
    assert.equal(gasReadout(10, BALLOON, at(500)), line('4,94 · 6 = 29,64 → <var>V</var> = 29,64 / 1,94 ≈ 15,3&nbsp;l'));
    assert.equal(gasReadout(0, BALLOON, at(5500)), line('4,5 · 6 = 27 → <var>V</var> = 27 / 0,5 = 54&nbsp;l'));
    assert.equal(gasReadout(0, BALLOON, at(0)), line('5 · 6 = 30 → <var>V</var> = 30 / 1 = 30&nbsp;l'), '0 m beze změny');
});

test('odečet objemu, zvon: 1 000 l u hladiny při p_atm, nad 100 l celé litry', () => {
    assert.equal(gasReadout(0, BELL, at(1000)), line('0,89 · 1&nbsp;000 = 890 → <var>V</var> = 890 / 0,89 = 1&nbsp;000&nbsp;l'));
    assert.equal(gasReadout(10, BELL, at(1000)), line('0,89 · 1&nbsp;000 = 890 → <var>V</var> = 890 / 1,89 ≈ 471&nbsp;l'));
    assert.equal(gasReadout(20, BELL, at(5500)), line('0,5 · 1&nbsp;000 = 500 → <var>V</var> = 500 / 2,5 = 200&nbsp;l'));
});

test('odečet se sečte: objem v odečtu = zobrazený součin / zobrazený tlak', () => {
    for (const h of BOYLE_ALTITUDES) {
        for (const obj of [BALLOON, BELL]) {
            for (let depth = 0; depth <= 40; depth++) {
                const html = gasReadout(depth, obj, at(h));
                const [, product, p] = html.match(/= ([\d ,&nbsp;]+) \/ ([\d,]+) /).map((s) => s.replaceAll('&nbsp;', '').replace(',', '.'));
                const v = objectVolume(depth, obj, at(h));
                assert.ok(Math.abs(Number(product) / Number(p) - v) < 1e-9, `${obj.kind} ${h} m n. m., ${depth} m`);
            }
        }
    }
});

// ---------------------------------------------------------------- graf

test('žlutý pruh p_atm se zkrátí podle výšky', () => {
    assert.equal(layerPressure(at(3000, { depth: 0 })).atm, 0.69);
    assert.equal(layerPressure(at(0, { depth: 0 })).atm, 1);
});

test('osa objemu unese balónek až do 54 l (5 500 m), končí na násobku 5 l, popisky se nepřekrývají', () => {
    assert.deepEqual(BOYLE_ALTITUDES.map((h) => volumeScaleMax(BALLOON, at(h))), [30, 35, 35, 40, 45, 55]);
    for (const h of BOYLE_ALTITUDES) {
        assert.ok(objectVolume(0, BALLOON, at(h)) <= volumeScaleMax(BALLOON, at(h)), `${h} m: balónek na hladině se vejde`);
    }
    assert.equal(volumeScaleMax(BELL, at(5500)), 1000, 'zvon má na hladině vždy 1 000 l');
    for (const h of BOYLE_ALTITUDES) {
        const vMax = volumeScaleMax(BALLOON, at(h));
        for (const [w, fs] of [[60, 14], [70, 14], [102, 14], [340, 20]]) {
            const ticks = volumeTicks(vMax, w, fs);
            const boxes = tickLabelBoxes(ticks, vMax, w, fs);
            boxes.forEach((b, i) => { if (i) assert.ok(b.left - boxes[i - 1].right >= 0.4 * fs, `${h} m, ${w} px: ${ticks}`); });
            assert.equal(ticks.at(-1), vMax, `${h} m, ${w} px končí na maximu`);
            assert.ok(ticks.every(Number.isInteger), `${h} m, ${w} px: celé litry ${ticks}`);
        }
    }
});

// ---------------------------------------------------------------- adresa

test('předvolba v adrese: ?vyska=1000, neznámá výška na nejbližší předvolbu, bez parametru 0 m', () => {
    const readQ = (q) => initialStateFromParams(readParams(q, BOYLE_PARAMS), new URLSearchParams(q));
    assert.equal(readQ('').altitude, 0);
    assert.deepEqual(readQ('?vyska=1000'), { depth: 40, gasObject: 'balloon', altitude: 1000 });
    assert.deepEqual(readQ('?zvon=1&vyska=5500'), { depth: 0, gasObject: 'bell', altitude: 5500 });
    assert.equal(readQ('?vyska=700').altitude, 500);
    assert.equal(readQ('?vyska=4500').altitude, 5500);
    assert.equal(readQ('?vyska=99999').altitude, 5500);
    assert.equal(readQ('?vyska=abc').altitude, 0);
});

test('paramsFromState: výška do adresy, jen když není 0 m', () => {
    assert.deepEqual(paramsFromState({ depth: 40, gasObject: 'balloon', altitude: 0 }), { zvon: null, hloubka: null, vyska: null });
    assert.deepEqual(paramsFromState({ depth: 40, gasObject: 'balloon', altitude: 3000 }), { zvon: null, hloubka: null, vyska: 3000 });
});

// ---------------------------------------------------------------- stránka

test('stránka: poznámka pod modelem platí i s výškou, věta o horském jezeře ve „Více“', () => {
    const html = read('p1/stlacovani-plynu.html');
    const doc = new JSDOM(html).window.document;
    const note = doc.querySelector('#model-boyle .course-simplification').innerHTML.replace(/\s+/g, ' ');
    assert.doesNotMatch(note, /u&nbsp;hladiny 1&nbsp;bar/);
    assert.match(note, /Tlak u&nbsp;hladiny podle nadmořské výšky \(tabulka na slidu <a href="tlak\.html#vyska">Atmosférický tlak<\/a>\), 1&nbsp;bar na každých 10&nbsp;m vody, teplota se nemění\./);
    assert.ok(html.includes('Na horském jezeře je u&nbsp;hladiny menší tlak, a&nbsp;proto se plyn při výstupu rozepne víc než u&nbsp;moře.'));
});
