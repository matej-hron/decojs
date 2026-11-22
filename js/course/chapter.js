/**
 * Chování stránky kapitoly kurzu (bez závislosti na konkrétním modelu):
 *  - přepínač „Rozbalit všechny výklady“ v řádku „Více“ pod slidem (též na rozcestníku),
 *  - předchozí / další kapitola podle `js/course/p1Course.js`,
 *  - vložení sdílených bloků pojmů a otázek „Procvič si“,
 *  - celá obrazovka pro modely (`.chart-container` + tlačítka podle Chart Standards),
 *  - přepínání slidů šipkami a tlačítky (`js/course/slideNav.js`),
 *  - kolikátá kapitola a její témata na titulním slidu (z `js/course/p1Course.js`).
 *
 * Stránka nese `<body data-course-chapter="hustota">` a začíná titulním slidem kapitoly: jeho
 * nadpis je jediné `h1`, úvod kapitoly patří do „Více“ pod ním.
 */

import { P1_CHAPTERS, chapterBySlug, chapterNeighbours, titleKicker } from './p1Course.js';
import { loadConcepts } from './concepts.js';
import { initPractice } from './practice.js';
import { initSlideNav } from './slideNav.js';

/**
 * Do řádku každého „Více“ přidá přepínač pro všechny výklady na stránce.
 */
export function initExpandAll() {
    const all = [...document.querySelectorAll('details.course-more')];
    const buttons = all.map((details) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'course-expand-all';
        details.before(btn);
        btn.addEventListener('click', () => {
            const open = !all.every(d => d.open);
            all.forEach(d => { d.open = open; });
            sync();
        });
        return btn;
    });
    function sync() {
        const open = all.every(d => d.open);
        buttons.forEach((btn) => {
            btn.setAttribute('aria-pressed', String(open));
            btn.textContent = open ? 'Sbalit všechny výklady' : 'Rozbalit všechny výklady';
        });
    }
    all.forEach(d => d.addEventListener('toggle', sync));
    sync();
}

/**
 * Text odkazu za poslední hotovou kapitolou: dokud některá kapitola chybí, „připravujeme“, jinak konec kurzu.
 * @param {{status: string}[]} [chapters]
 * @returns {string}
 */
export function endOfChaptersLabel(chapters = P1_CHAPTERS) {
    return chapters.some(c => c.status !== 'ready')
        ? 'Další kapitoly připravujeme — zpět na přehled kurzu →'
        : 'Konec kurzu — zpět na přehled kurzu →';
}

/**
 * Jednopísmenné předložky a spojky s nedělitelnou mezerou, jako v textech kurzu (NB1).
 * @param {string} text
 * @returns {string}
 */
export function withNbsp(text) {
    return text.replace(/(?<=^|\s)([ksvzouaiKSVZOUAI]) /g, '$1\u00a0');
}

/**
 * Řádek témat pod nadpisem titulního slidu kapitoly. Oddělovač „·“ je text (čtečka i kopírování
 * dostanou „jednotky · …“), jen obarvený.
 * @param {string[]} topics
 * @returns {string} HTML
 */
export function titleTopicsHtml(topics) {
    return topics.map(withNbsp).join('<span class="course-slide-sep"> · </span>');
}

/**
 * Titulní slide (T29, varianta B): drobně „Kapitola 2 z 9“ (na rozcestníku „9 kapitol · 81 slidů“)
 * a pod nadpisem témata kapitoly. Obojí z dat kurzu, v HTML stránky je jen nadpis.
 * Řádek s číslem kapitoly je v pořadí čtení za nadpisem, nad něj ho dá CSS.
 * @param {Element|null} slide `.course-slide[data-slide-type="title"]`, jinak nic
 * @param {string|null} slug kapitola, `null` rozcestník
 */
export function renderTitleSlide(slide, slug) {
    if (slide?.dataset.slideType !== 'title' || slide.querySelector('.course-slide-kicker')) return;
    const heading = slide.querySelector(':scope > h1, :scope > h2');
    const topics = slug === null ? [] : chapterBySlug(slug)?.topics ?? [];
    const kicker = titleKicker(slug);
    if (topics.length) heading.insertAdjacentHTML('afterend', `<p class="course-slide-topics">${titleTopicsHtml(topics)}</p>`);
    if (kicker) heading.insertAdjacentHTML('afterend', `<p class="course-slide-kicker">${kicker}</p>`);
}

function renderPrevNext(slug) {
    const host = document.querySelector('.course-prevnext');
    if (!host) return;
    const { prev, next } = chapterNeighbours(slug);
    const link = (c, dir) => c
        ? `<a class="course-prevnext-${dir}" href="${c.slug}.html">${dir === 'prev' ? '← ' : ''}${c.title}${dir === 'next' ? ' →' : ''}</a>`
        : '';
    const nextOrHub = next ? link(next, 'next')
        : `<a class="course-prevnext-next" href="index.html">${endOfChaptersLabel()}</a>`;
    host.innerHTML = `${prev ? link(prev, 'prev') : '<a class="course-prevnext-prev" href="index.html">← Přehled kurzu</a>'}${nextOrHub}`;
}

function initFullscreen() {
    document.querySelectorAll('[data-fullscreen-for]').forEach(btn => {
        const target = document.getElementById(btn.dataset.fullscreenFor);
        if (!target) return;
        const toggle = () => {
            const on = target.classList.toggle('fullscreen');
            document.body.style.overflow = on ? 'hidden' : '';
            target.dispatchEvent(new CustomEvent('fullscreenchange-model', { detail: { on } }));
        };
        btn.addEventListener('click', toggle);
        target.querySelector('.btn-fullscreen-close')?.addEventListener('click', toggle);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && target.classList.contains('fullscreen')) {
                e.preventDefault(); // Esc jen opustí celou obrazovku, simulátor zůstane otevřený
                toggle();
            }
        });
    });
}

/**
 * Inicializace stránky kapitoly. Volá stránka po načtení.
 * @returns {Promise<void>}
 */
export async function initChapter() {
    const slug = document.body.dataset.courseChapter;
    if (slug && !chapterBySlug(slug)) console.warn(`chapter: neznámá kapitola „${slug}“`);
    renderTitleSlide(document.querySelector('main .course-slide[data-slide-type="title"]'), slug ?? null);
    initExpandAll();
    initFullscreen();
    renderPrevNext(slug);
    const landOnHash = initSlideNav(slug ?? null);
    await Promise.all([loadConcepts(document), initPractice(document)]);
    // Po vložení bloků se stránka prodlouží — znovu skoč na kotvu z URL.
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    landOnHash();
}
