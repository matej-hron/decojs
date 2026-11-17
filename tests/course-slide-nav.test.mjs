import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
    TOC_HREF, collectStops, initSlideNav, isSliderTarget, isTocKey, mostVisibleIndex, nextTarget, slideFootHtml,
    slideKeyDirection, stopAnchor,
} from '../js/course/slideNav.js';
import { addTocLink } from '../js/course/modelOverlay.js';
import { P1_CHAPTERS, P1_INDEX_SLIDES, courseSlideNumbering } from '../js/course/p1Course.js';

const ROOT = new URL('../', import.meta.url);
const COURSE_PAGES = ['p1/index.html', ...P1_CHAPTERS.filter(c => c.status === 'ready').map(c => `p1/${c.slug}.html`)];
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
        // Hustota → Tlak → Stlačování plynů → Archimédův zákon → Dalton → Henry → Vidění a zpět; za Viděním zatím rozcestník.
        assert.deepEqual(nextTarget({ slug: 'hustota', index: 5, count: 6, dir: 1 }), { href: 'tlak.html' });
        assert.deepEqual(nextTarget({ slug: 'tlak', index: 0, count: 14, dir: -1 }), { href: 'hustota.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'tlak', index: 13, count: 14, dir: 1 }), { href: 'stlacovani-plynu.html' });
        assert.deepEqual(nextTarget({ slug: 'stlacovani-plynu', index: 0, count: 10, dir: -1 }), { href: 'tlak.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'stlacovani-plynu', index: 9, count: 10, dir: 1 }), { href: 'archimeduv-zakon.html' });
        assert.deepEqual(nextTarget({ slug: 'archimeduv-zakon', index: 0, count: 9, dir: -1 }), { href: 'stlacovani-plynu.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'archimeduv-zakon', index: 8, count: 9, dir: 1 }), { href: 'dalton.html' });
        assert.deepEqual(nextTarget({ slug: 'dalton', index: 0, count: 6, dir: -1 }), { href: 'archimeduv-zakon.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'dalton', index: 5, count: 6, dir: 1 }), { href: 'henry.html' });
        assert.deepEqual(nextTarget({ slug: 'henry', index: 0, count: 8, dir: -1 }), { href: 'dalton.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'henry', index: 7, count: 8, dir: 1 }), { href: 'videni.html' });
        assert.deepEqual(nextTarget({ slug: 'videni', index: 0, count: 8, dir: -1 }), { href: 'henry.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'videni', index: 7, count: 8, dir: 1 }), { href: 'slyseni.html' });
        assert.deepEqual(nextTarget({ slug: 'slyseni', index: 0, count: 2, dir: -1 }), { href: 'videni.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'slyseni', index: 1, count: 2, dir: 1 }), { href: 'teplo.html' });
        assert.deepEqual(nextTarget({ slug: 'teplo', index: 0, count: 6, dir: -1 }), { href: 'slyseni.html#procvic' });
        assert.deepEqual(nextTarget({ slug: 'teplo', index: 5, count: 6, dir: 1 }), { href: 'index.html#kapitoly' });
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
    it('kapitola: titulní slide, pak jeden slide přednášky je jedna zastávka, modely zastávky nejsou', () => {
        const anchors = collectStops(pageDom('p1/hustota.html')).map(stopAnchor);
        assert.deepEqual(anchors, ['hustota', 'definice', 'teplota', 'procvic']);
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
    it('vlevo „☰ Obsah“ a jméno přednášky, vpravo číslo a tlačítka', () => {
        const html = slideFootHtml(12, 57);
        assert.match(html, /<a class="course-toc-link" href="index\.html#kapitoly"[^>]*>.*☰.*Obsah<\/span><\/a>/);
        assert.match(html, /<span class="course-foot-title">P1 – Fyzika<\/span>/);
        assert.ok(html.indexOf('Obsah') < html.indexOf('P1 – Fyzika'), 'Obsah první');
        assert.match(html, /class="course-foot-number"[^>]*>12 \/ 57</);
        assert.match(html, /data-step="-1"/);
        assert.match(html, /data-step="1"/);
        assert.ok(html.indexOf('P1 – Fyzika') < html.indexOf('>12 / 57<'), 'jméno vlevo, číslo vpravo');
    });

    it('číslo slidu z celkového počtu, i pro čtečky', () => {
        assert.match(slideFootHtml(12, 71), /<span class="course-foot-number" aria-label="slide 12 z 71">12 \/ 71<\/span>/);
    });

    it('v kapitolách není patička ani počet natvrdo (doplní je slideNav.js)', () => {
        for (const page of COURSE_PAGES) {
            const html = readFileSync(new URL(page, ROOT), 'utf8');
            assert.doesNotMatch(html, /course-foot|data-slide-total|slide \d+ z \d+/, page);
        }
    });

    it('patička se nezalomí: číslo i jméno na jednom řádku, pravá část se nesmrští', () => {
        const css = readFileSync(new URL('css/course.css', ROOT), 'utf8');
        const rule = (sel) => css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
        assert.match(rule('.course-foot-number'), /white-space:\s*nowrap/);
        assert.match(rule('.course-foot-title'), /white-space:\s*nowrap/);
        assert.match(rule('.course-foot-right'), /flex:\s*none/);
    });

    it('slide bez čísla má stejnou stavbu, jen číslo chybí', () => {
        const html = slideFootHtml(null, null);
        assert.doesNotMatch(html, /course-foot-number[^>]*>\d/);
        assert.doesNotMatch(html, /aria-label="slide|\d \/ \d/);
        assert.match(html, /P1 – Fyzika/);
        assert.match(html, /data-step="1"/);
    });

    it('číslo z přednášky zůstává skryté v data-slide-number (dohledání v PowerPointu)', () => {
        const numbers = (page) => collectStops(pageDom(page)).map(s => s.dataset.slideNumber ?? null);
        assert.deepEqual(numbers('p1/index.html'), [null, '2', '3', '4', '5', '6', '7']);
        assert.deepEqual(numbers('p1/hustota.html'), [null, '8', '9', null], 'titulní slide kapitoly v přednášce není');
    });
});

describe('cesta na obsah kurzu (D17)', () => {
    /** Stránka po initSlideNav (patičky hotové). */
    const rendered = (page, slug) => {
        const saved = globalThis.document;
        try {
            globalThis.document = pageDom(page);
            initSlideNav(slug);
            return globalThis.document;
        } finally {
            globalThis.document = saved;
        }
    };

    it('odkaz „☰ Obsah“ s viditelným slovem, jménem pro čtečky a klávesou v nápovědě', () => {
        const a = new JSDOM(slideFootHtml(8, 57)).window.document.querySelector('a.course-toc-link');
        assert.equal(a.getAttribute('href'), TOC_HREF);
        assert.equal(TOC_HREF, 'index.html#kapitoly');
        assert.equal(a.getAttribute('aria-label'), 'Obsah kurzu');
        assert.match(a.getAttribute('title'), /klávesa O/);
        assert.equal(a.querySelector('.course-toc-word').textContent.trim(), 'Obsah');
        assert.equal(a.querySelector('[aria-hidden="true"]').textContent, '☰');
    });

    it('každý slide kapitoly má v patičce odkaz na obsah, i titulní a Procvič si', () => {
        for (const c of P1_CHAPTERS.filter(ch => ch.status === 'ready')) {
            const doc = rendered(`p1/${c.slug}.html`, c.slug);
            const feet = [...doc.querySelectorAll('.course-foot')];
            assert.equal(feet.length, c.courseSlides, c.slug);
            assert.ok(feet.every(f => f.querySelector(`a.course-toc-link[href="${TOC_HREF}"]`)), c.slug);
        }
    });

    it('na rozcestníku všude kromě slidu Obsah samotného', () => {
        const doc = rendered('p1/index.html', null);
        const withToc = collectStops(doc).map(s => [stopAnchor(s), Boolean(s.querySelector('.course-foot a.course-toc-link'))]);
        assert.deepEqual(withToc.filter(([, has]) => !has).map(([anchor]) => anchor), ['kapitoly']);
    });

    it('překryv modelu dostane „☰ Obsah“ v hlavičce před „Celá obrazovka“ (jednou)', () => {
        const pages = ['hustota', 'tlak', 'stlacovani-plynu', 'archimeduv-zakon', 'henry'];
        let dialogs = 0;
        for (const slug of pages) {
            for (const dialog of pageDom(`p1/${slug}.html`).querySelectorAll('dialog.course-sim')) {
                addTocLink(dialog);
                addTocLink(dialog);
                const actions = dialog.querySelector('.course-sim-actions');
                const links = actions.querySelectorAll('a.course-sim-toc');
                assert.equal(links.length, 1, slug);
                assert.equal(links[0].getAttribute('href'), TOC_HREF);
                assert.equal(links[0].getAttribute('aria-label'), 'Obsah kurzu');
                assert.equal(actions.firstElementChild, links[0], `${slug}: před „Celá obrazovka“`);
                assert.ok(links[0].nextElementSibling.matches('[data-fullscreen-for]'), slug);
                dialogs += 1;
            }
        }
        assert.ok(dialogs >= 7, `překryvů: ${dialogs}`);
    });

    it('stránka Použité materiály vede na obsah a zná klávesu O', () => {
        const doc = pageDom('p1/zdroje.html');
        assert.ok(doc.querySelector(`main a[href="${TOC_HREF}"]`)?.textContent.includes('Obsah kurzu'));
        assert.match(readFileSync(new URL('js/course/zdrojePage.js', ROOT), 'utf8'), /initTocKey\(\)/);
    });

    describe('klávesa O', () => {
        const dom = new JSDOM(`<input id="range" type="range"><input id="text"><input id="num" type="number">
            <input id="check" type="checkbox"><select id="sel"></select><textarea id="area"></textarea>
            <div contenteditable="true" id="edit"></div><button id="btn"></button>`);
        const el = (id) => dom.window.document.getElementById(id);
        const key = (k, extra = {}) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
            defaultPrevented: false, target: dom.window.document.body, ...extra });

        it('O i Shift+O jde na obsah, jiné klávesy ne (šipky, mezerník, Esc patří simulátorům)', () => {
            assert.ok(isTocKey(key('o')));
            assert.ok(isTocKey(key('O', { shiftKey: true })));
            for (const k of ['ArrowLeft', 'ArrowRight', ' ', 'Escape', 'Enter', 'p']) assert.ok(!isTocKey(key(k)), k);
        });

        it('Ctrl, Alt ani Cmd ne (Cmd+O otevírá soubor)', () => {
            for (const m of ['altKey', 'ctrlKey', 'metaKey']) assert.ok(!isTocKey(key('o', { [m]: true })), m);
            assert.ok(!isTocKey(key('o', { defaultPrevented: true })));
        });

        it('v textovém poli se O píše, na posuvníku, zaškrtávátku a tlačítku jde na obsah', () => {
            for (const id of ['text', 'num', 'sel', 'area', 'edit']) assert.ok(!isTocKey(key('o', { target: el(id) })), id);
            for (const id of ['range', 'check', 'btn']) assert.ok(isTocKey(key('o', { target: el(id) })), id);
        });
    });

    it('patička na telefonu: slovo „Obsah“ zmizí a zůstane ☰, nic se nezalomí', () => {
        const css = readFileSync(new URL('css/course.css', ROOT), 'utf8');
        const phone = [...css.matchAll(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
        assert.match(phone, /\.course-toc-word\s*\{\s*display:\s*none/);
        const rule = (sel) => css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
        assert.match(rule('.course-toc-link'), /white-space:\s*nowrap/);
        assert.match(rule('.course-toc-link'), /flex:\s*none/);
    });
});

describe('číslování slidů kurzu (D16)', () => {
    const COURSE_A = [
        { slug: 'a', status: 'ready', courseSlides: 3 },
        { slug: 'b', status: 'planned' },
        { slug: 'c', status: 'ready', courseSlides: 4 },
    ];

    it('pořadí v celém kurzu: rozcestník, pak hotové kapitoly; nehotové se nepočítají', () => {
        const total = P1_INDEX_SLIDES + 7;
        assert.deepEqual(courseSlideNumbering(null, COURSE_A), { first: 1, total });
        assert.deepEqual(courseSlideNumbering('a', COURSE_A), { first: P1_INDEX_SLIDES + 1, total });
        assert.deepEqual(courseSlideNumbering('c', COURSE_A), { first: P1_INDEX_SLIDES + 4, total });
        assert.equal(courseSlideNumbering('b', COURSE_A), null);
        assert.equal(courseSlideNumbering('neznama', COURSE_A), null);
    });

    it('nová hotová kapitola zvýší celkový počet sama', () => {
        const more = [...COURSE_A.slice(0, 2), { ...COURSE_A[1], status: 'ready', courseSlides: 5 }, COURSE_A[2]];
        assert.equal(courseSlideNumbering(null, more).total, P1_INDEX_SLIDES + 12);
        assert.equal(courseSlideNumbering('c', more).first, P1_INDEX_SLIDES + 9);
    });

    it('počty slidů v datech kurzu sedí se stránkami (přidáš slide → uprav courseSlides)', () => {
        assert.equal(collectStops(pageDom('p1/index.html')).length, P1_INDEX_SLIDES, 'P1_INDEX_SLIDES');
        for (const c of P1_CHAPTERS.filter(ch => ch.status === 'ready')) {
            assert.ok(Number.isInteger(c.courseSlides), `${c.slug}: chybí courseSlides v js/course/p1Course.js`);
            assert.equal(collectStops(pageDom(`p1/${c.slug}.html`)).length, c.courseSlides, `${c.slug}: courseSlides`);
        }
    });

    it('patičky na všech stránkách: 1, 2, … bez mezer, včetně titulních a Procvič si; číslo přednášky se nezobrazí', () => {
        const shown = [];
        const saved = globalThis.document;
        try {
            for (const [page, slug] of [['p1/index.html', null], ...P1_CHAPTERS.filter(c => c.status === 'ready').map(c => [`p1/${c.slug}.html`, c.slug])]) {
                globalThis.document = pageDom(page);
                initSlideNav(slug);
                for (const n of document.querySelectorAll('.course-foot-number')) shown.push([page, n.textContent, n.getAttribute('aria-label')]);
            }
        } finally {
            globalThis.document = saved;
        }
        const total = courseSlideNumbering(null).total;
        assert.deepEqual(shown.map(([, text]) => text), Array.from({ length: total }, (_, i) => `${i + 1} / ${total}`));
        assert.deepEqual(shown.map(([, , label]) => label), Array.from({ length: total }, (_, i) => `slide ${i + 1} z ${total}`));
        const hustota = shown.filter(([page]) => page === 'p1/hustota.html').map(([, text]) => text);
        assert.deepEqual(hustota, [`8 / ${total}`, `9 / ${total}`, `10 / ${total}`, `11 / ${total}`], 'Hustota: titulní 8, slidy 9, 10 a Procvič si 11');
        assert.equal(total, 82, 'T29: 74 slidů a titulní slide u 8 kapitol, které ho v přednášce nemají');
    });

    it('stránka mimo kurz (nehotová nebo neznámá kapitola) čísla nemá', () => {
        const saved = globalThis.document;
        try {
            globalThis.document = pageDom('p1/hustota.html');
            initSlideNav('neznama-kapitola');
            assert.ok([...document.querySelectorAll('.course-foot-number')].every(n => n.textContent === ''));
        } finally {
            globalThis.document = saved;
        }
    });

    it('texty neodkazují na slidy číslem, jen názvem s odkazem (p1/*.html, concepts/cs/*.html)', () => {
        const files = [
            ...readdirSync(new URL('p1/', ROOT)).filter(f => f.endsWith('.html')).map(f => `p1/${f}`),
            ...readdirSync(new URL('concepts/cs/', ROOT)).filter(f => f.endsWith('.html')).map(f => `concepts/cs/${f}`),
        ];
        const found = [];
        for (const f of files) {
            const html = readFileSync(new URL(f, ROOT), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
            for (const m of html.matchAll(/slid(?:e|u|y|ech|ů|em)?(?:&nbsp;| |\s)+\d+/gi)) found.push(`${f}: ${m[0]}`);
        }
        assert.deepEqual(found, []);
    });
});
