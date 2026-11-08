import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
    collectStops, isSliderTarget, mostVisibleIndex, nextTarget, slideFootHtml, slideKeyDirection, stopAnchor,
} from '../js/course/slideNav.js';
import { P1_CHAPTERS } from '../js/course/p1Course.js';

const ROOT = new URL('../', import.meta.url);
const pageDom = (path) => new JSDOM(readFileSync(new URL(path, ROOT), 'utf8')).window.document;

const ready = (slug) => ({ slug, status: 'ready' });
const planned = (slug) => ({ slug, status: 'planned' });
/** Kurz se dvěma hotovými kapitolami, mezi nimi nehotová. */
const COURSE = [ready('a'), planned('b'), ready('c'), planned('d')];

describe('nextTarget: uvnitř stránky', () => {
    it('jde o jednu zastávku dopředu i zpět', () => {
        assert.deepEqual(nextTarget({ slug: 'a', index: 1, count: 4, dir: 1, chapters: COURSE }), { stop: 2 });
        assert.deepEqual(nextTarget({ slug: 'a', index: 1, count: 4, dir: -1, chapters: COURSE }), { stop: 0 });
        assert.deepEqual(nextTarget({ slug: null, index: 0, count: 3, dir: 1, chapters: COURSE }), { stop: 1 });
    });
});

describe('nextTarget: přes hranice stránek', () => {
    it('Obsah na rozcestníku → první hotová kapitola', () => {
        assert.deepEqual(nextTarget({ slug: null, index: 2, count: 3, dir: 1, chapters: COURSE }), { href: 'a.html' });
        assert.deepEqual(nextTarget({ slug: null, index: 2, count: 3, dir: 1, chapters: [planned('x'), ready('y')] }),
            { href: 'y.html' }, 'nehotová se přeskočí');
    });

    it('titulní slide rozcestníku je začátek', () => {
        assert.equal(nextTarget({ slug: null, index: 0, count: 3, dir: -1, chapters: COURSE }), null);
    });

    it('rozcestník bez hotové kapitoly nemá kam pokračovat', () => {
        assert.equal(nextTarget({ slug: null, index: 2, count: 3, dir: 1, chapters: [planned('x')] }), null);
    });

    it('poslední zastávka → další hotová kapitola, nehotová se přeskočí', () => {
        assert.deepEqual(nextTarget({ slug: 'a', index: 3, count: 4, dir: 1, chapters: COURSE }), { href: 'c.html' });
    });

    it('poslední zastávka poslední hotové kapitoly → Obsah', () => {
        assert.deepEqual(nextTarget({ slug: 'c', index: 3, count: 4, dir: 1, chapters: COURSE }), { href: 'index.html#kapitoly' });
    });

    it('první zastávka → poslední zastávka předchozí hotové kapitoly', () => {
        assert.deepEqual(nextTarget({ slug: 'c', index: 0, count: 4, dir: -1, chapters: COURSE }), { href: 'a.html#procvic' });
    });

    it('první zastávka první kapitoly → Obsah', () => {
        assert.deepEqual(nextTarget({ slug: 'a', index: 0, count: 4, dir: -1, chapters: COURSE }), { href: 'index.html#kapitoly' });
    });

    it('výchozí pořadí bere ze skutečného kurzu', () => {
        assert.deepEqual(nextTarget({ slug: null, index: 2, count: 3, dir: 1 }), { href: 'hustota.html' });
        // Hustota → Tlak → Stlačování plynů a zpět; za Stlačováním plynů zatím rozcestník.
        assert.deepEqual(nextTarget({ slug: 'hustota', index: 5, count: 6, dir: 1 }), { href: 'tlak.html' });
        assert.deepEqual(nextTarget({ slug: 'tlak', index: 0, count: 14, dir: -1 }), { href: 'hustota.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'tlak', index: 13, count: 14, dir: 1 }), { href: 'stlacovani-plynu.html' });
        assert.deepEqual(nextTarget({ slug: 'stlacovani-plynu', index: 0, count: 10, dir: -1 }), { href: 'tlak.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'stlacovani-plynu', index: 9, count: 10, dir: 1 }), { href: 'index.html#kapitoly' });
    });
});

describe('mostVisibleIndex: odkud se počítá', () => {
    const TOP = 70, BOTTOM = 720;

    it('vybere zastávku, které je v okně vidět nejvíc', () => {
        const rects = [{ top: -400, bottom: 150 }, { top: 170, bottom: 700 }, { top: 716, bottom: 1300 }];
        assert.equal(mostVisibleIndex(rects, TOP, BOTTOM), 1);
    });

    it('po ručním posunu mezi dvěma slidy vyhraje ten větší kus', () => {
        const rects = [{ top: -300, bottom: 250 }, { top: 270, bottom: 820 }];
        assert.equal(mostVisibleIndex(rects, TOP, BOTTOM), 1);
    });

    it('dlouhá zastávka přes celé okno je aktuální', () => {
        const rects = [{ top: -1500, bottom: -900 }, { top: -800, bottom: 2000 }];
        assert.equal(mostVisibleIndex(rects, TOP, BOTTOM), 1);
    });

    it('v rozbaleném „Více“ se počítá zastávka nad ním, i když dole vykukuje další slide', () => {
        const rects = [{ top: -900, bottom: -350 }, { top: 680, bottom: 1230 }, { top: 1300, bottom: 1850 }];
        assert.equal(mostVisibleIndex(rects, TOP, BOTTOM), 0);
    });

    it('nad první zastávkou se počítá první', () => {
        assert.equal(mostVisibleIndex([{ top: 800, bottom: 1300 }, { top: 1400, bottom: 1900 }], TOP, BOTTOM), 0);
    });
});

describe('slideKeyDirection: kdy klávesy patří slidům', () => {
    const dom = new JSDOM(`<input id="range" type="range"><input id="text"><select id="sel"></select>
        <textarea id="area"></textarea><div contenteditable="true" id="edit"><b id="inside">x</b></div>
        <div contenteditable="false" id="readonly"></div><div role="slider" id="knob"></div>
        <button id="btn"></button><summary id="sum"></summary>`);
    const el = (id) => dom.window.document.getElementById(id);
    const key = (k, extra = {}) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
        defaultPrevented: false, target: dom.window.document.body, ...extra });

    it('← a → přepínají, ostatní klávesy ne', () => {
        assert.equal(slideKeyDirection(key('ArrowRight')), 1);
        assert.equal(slideKeyDirection(key('ArrowLeft')), -1);
        for (const k of ['ArrowUp', 'ArrowDown', 'PageDown', 'Enter', ' ']) assert.equal(slideKeyDirection(key(k)), 0, k);
    });

    it('s modifikátorem nic nedělá (Alt+← je zpět v prohlížeči)', () => {
        for (const m of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
            assert.equal(slideKeyDirection(key('ArrowLeft', { [m]: true })), 0, m);
        }
    });

    it('šipky patří posuvníkům a polím', () => {
        for (const id of ['range', 'text', 'sel', 'area', 'edit', 'inside', 'knob']) {
            assert.equal(slideKeyDirection(key('ArrowRight', { target: el(id) })), 0, id);
        }
    });

    it('na tlačítku a jiném prvku bez vlastních šipek přepínají', () => {
        for (const id of ['btn', 'sum', 'readonly']) {
            assert.equal(slideKeyDirection(key('ArrowRight', { target: el(id) })), 1, id);
        }
    });

    it('v otevřeném simulátoru a na celé obrazovce šipky nepřepínají', () => {
        assert.equal(slideKeyDirection(key('ArrowRight'), { modelOpen: true }), 0);
    });

    it('už vyřízenou klávesu nechá být', () => {
        assert.equal(slideKeyDirection(key('ArrowRight', { defaultPrevented: true })), 0);
    });

    it('Esc uvolňuje fokus jen z posuvníku', () => {
        assert.ok(isSliderTarget(el('range')));
        assert.ok(isSliderTarget(el('knob')));
        assert.ok(!isSliderTarget(el('text')));
        assert.ok(!isSliderTarget(el('btn')));
    });
});

describe('zastávky na skutečných stránkách', () => {
    it('kapitola: jeden slide přednášky je jedna zastávka, modely zastávky nejsou', () => {
        const anchors = collectStops(pageDom('p1/hustota.html')).map(stopAnchor);
        assert.deepEqual(anchors, ['definice', 'teplota', 'procvic']);
    });

    it('rozcestník: titulní slide, slidy 2 až 5, otázky, Obsah, v pořadí přednášky', () => {
        const anchors = collectStops(pageDom('p1/index.html')).map(stopAnchor);
        assert.deepEqual(anchors, ['', 'plan', 'osnova-p1', 'osnova-p2', 'literatura', 'proc', 'kapitoly']);
    });

    it('každá hotová kapitola končí zastávkou „Procvič si“', () => {
        for (const c of P1_CHAPTERS.filter(ch => ch.status === 'ready')) {
            assert.equal(stopAnchor(collectStops(pageDom(`p1/${c.slug}.html`)).at(-1)), 'procvic', c.slug);
        }
    });

    it('rozbalené „Více“ a řešený příklad zastávky nejsou', () => {
        const stops = collectStops(pageDom('p1/hustota.html'));
        assert.ok(stops.every(s => !s.closest('details') && !s.matches('.course-example')));
    });
});

describe('patička slidu', () => {
    it('vlevo jméno přednášky jako odkaz na Obsah, vpravo číslo a tlačítka', () => {
        const html = slideFootHtml('9');
        assert.match(html, /<a[^>]*href="index\.html#kapitoly"[^>]*>P1 – Fyzika<\/a>/);
        assert.match(html, /class="course-foot-number"[^>]*>9</);
        assert.match(html, /data-step="-1"/);
        assert.match(html, /data-step="1"/);
        assert.ok(html.indexOf('P1 – Fyzika') < html.indexOf('>9<'), 'jméno vlevo, číslo vpravo');
    });

    it('slide bez čísla má stejnou stavbu, jen číslo chybí', () => {
        const html = slideFootHtml(null);
        assert.doesNotMatch(html, /course-foot-number[^>]*>\d/);
        assert.match(html, /P1 – Fyzika/);
        assert.match(html, /data-step="1"/);
    });

    it('čísla slidů odpovídají přednášce, titulní slide a Procvič si číslo nemají', () => {
        const numbers = (page) => collectStops(pageDom(page)).map(s => s.dataset.slideNumber ?? null);
        assert.deepEqual(numbers('p1/index.html'), [null, '2', '3', '4', '5', '6', '7']);
        assert.deepEqual(numbers('p1/hustota.html'), ['8', '9', null]);
    });
});
