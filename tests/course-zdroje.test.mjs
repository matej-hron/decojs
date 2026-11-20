/**
 * Kurz P1 (T18, U1): převzaté obrázky mají na slidu jen drobný odkaz „zdroj“,
 * plná atribuce je na stránce p1/zdroje.html (kotva na každou položku).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const doc = (rel) => new JSDOM(read(rel)).window.document;

const SOURCES_PAGE = 'p1/zdroje.html';
const chapters = readdirSync(new URL('p1/', ROOT)).filter(f => f.endsWith('.html') && f !== 'zdroje.html').map(f => `p1/${f}`);
/** Soubory z tabulky v SOURCES.md (vlastní SVG jako telo-profil.svg v ní nejsou). */
const SOURCED = new Set([...read('images/course/p1/SOURCES.md').matchAll(/^\| `images\/([^`]+)`/gm)].map(m => `../images/${m[1]}`));
/** Převzatý obrázek: fotka z images/course/p1/, animace částic nebo cokoli ze SOURCES.md (i SVG vložené přes <image>, U1). */
const isBorrowed = (src) => /^\.\.\/images\/course\/p1\/[^/]+\.(jpe?g|png|gif|webp)$/.test(src) || src === '../images/gas-particles.gif' || SOURCED.has(src);
const srcOf = (el) => el.getAttribute('src') ?? el.getAttribute('href');

const borrowed = chapters.flatMap(page => [...doc(page).querySelectorAll('img, svg image')]
    .filter(img => isBorrowed(srcOf(img)))
    .map(img => ({ page, img })));

test('v kurzu je osm převzatých obrázků (manometr, Pascal, ucho, Dalton, Henry, tužka, Snellovo okno, Silfra; GIF částic od T28 ne) a všechny jsou v SOURCES.md', () => {
    assert.deepEqual(borrowed.map(b => srcOf(b.img).split('/').pop()).sort(),
        ['dalton.jpg', 'henry.jpg', 'manometr.jpg', 'pascal.jpg', 'silfra.jpg', 'snellovo-okno.jpg', 'tuzka-v-mele-vode.jpg', 'ucho-anatomie.svg']);
    for (const { img } of borrowed) assert.ok(SOURCED.has(srcOf(img)), srcOf(img));
});

for (const { page, img } of borrowed) {
    const file = srcOf(img).split('/').pop();
    test(`${page} ${file}: pod obrázkem je jen odkaz „zdroj“ na kotvu v zdroje.html`, () => {
        const figure = img.closest('figure');
        assert.ok(figure, 'obrázek je ve figure');
        const links = figure.querySelectorAll('a.course-source');
        assert.equal(links.length, 1, 'jeden odkaz zdroj');
        const a = links[0];
        assert.equal(a.textContent.trim(), 'zdroj');
        assert.ok(!a.hasAttribute('style'), 'styl jen třídou');
        const m = a.getAttribute('href').match(/^zdroje\.html#([\w-]+)$/);
        assert.ok(m, a.getAttribute('href'));
        const entry = doc(SOURCES_PAGE).getElementById(m[1]);
        assert.ok(entry, `kotva #${m[1]} v zdroje.html`);
        assert.equal(entry.querySelector('img').getAttribute('src'), srcOf(img), 'náhled je týž soubor');
        // Atribuce už na slidu není.
        assert.doesNotMatch(figure.querySelector('figcaption').innerHTML, /commons\.wikimedia|creativecommons|volné dílo|Foto:|Animace:/);
    });
}

test('zdroje.html: každá položka má použití s odkazem zpět, autora, licenci, zdroj a úpravy', () => {
    const d = doc(SOURCES_PAGE);
    assert.equal(d.getElementById('castice'), null, 'T28: GIF částic kurz nepoužívá, položka odpadla');
    const back = { manometr: 'tlak.html#jednotky', pascal: 'tlak.html#hydrostaticky', ucho: 'stlacovani-plynu.html#dutiny', dalton: 'dalton.html#zakon', henry: 'henry.html#zakon', 'tuzka-hladina': 'videni.html#tyc', 'snellovo-okno': 'videni.html#okno', silfra: 'teplo.html#procvic' };
    for (const [id, href] of Object.entries(back)) {
        const entry = d.getElementById(id);
        assert.ok(entry, id);
        const hrefs = [...entry.querySelectorAll('a')].map(a => a.getAttribute('href'));
        assert.ok(hrefs.includes(href), `${id}: odkaz zpět ${href}`);
        assert.ok(hrefs.some(h => h.startsWith('https://commons.wikimedia.org/wiki/File:')), `${id}: stránka souboru na Commons`);
        const terms = [...entry.querySelectorAll('dt')].map(dt => dt.textContent.trim());
        assert.deepEqual(terms, ['Použito', 'Autor', 'Licence', 'Zdroj', 'Úpravy', 'Ověřeno'], id);
    }
    const manometr = d.getElementById('manometr');
    assert.match(manometr.textContent, /oříznuto/);
    assert.ok(manometr.querySelector('a[href="https://creativecommons.org/licenses/by-sa/4.0/deed.cs"]'), 'text licence CC BY-SA 4.0');
    // U1: CC BY 2.5 vyžaduje všechny autory, licenci a vyznačení úprav.
    const ucho = d.getElementById('ucho');
    for (const name of ['Chittka', 'Brockmann', 'Komorniczak']) assert.match(ucho.textContent, new RegExp(name));
    assert.ok(ucho.querySelector('a[href="https://creativecommons.org/licenses/by/2.5/deed.cs"]'), 'text licence CC BY 2.5');
    assert.ok(ucho.querySelector('a[href="https://commons.wikimedia.org/wiki/File:Anatomy_of_the_Human_Ear_blank.svg"]'));
    for (const word of ['oříznuto', 'přebarveno', 'vlastní popisky']) assert.match(ucho.textContent, new RegExp(word));
});

test('zdroje.html projde šifrováním jako ostatní stránky kurzu a je offline', () => {
    const html = read(SOURCES_PAGE);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /<script type="module" src="\.\.\/js\/course\/zdrojePage\.js"><\/script>/);
    const sw = read('sw.js');
    for (const f of ['./p1/zdroje.html', './js/course/zdrojePage.js', './images/course/p1/ucho-anatomie.svg']) assert.ok(sw.includes(`'${f}'`), f);
});

test('obsah kurzu odkazuje na zdroje.html', () => {
    assert.ok(doc('p1/index.html').querySelector('a[href="zdroje.html"]'));
});

test('odkaz zdroj má jednu třídu v course.css a SOURCES.md říká, kde je atribuce', () => {
    const css = read('css/course.css');
    assert.match(css, /\.course-page a\.course-source\s*\{/);
    assert.match(read('images/course/p1/SOURCES.md'), /p1\/zdroje\.html/);
});
