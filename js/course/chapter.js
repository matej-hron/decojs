/**
 * Chování stránky kapitoly kurzu (bez závislosti na konkrétním modelu):
 *  - přepínač „Rozbalit všechny výklady“ v řádku „Více“ pod slidem (též na rozcestníku),
 *  - předchozí / další kapitola podle `js/course/p1Course.js`,
 *  - vložení sdílených bloků pojmů a otázek „Procvič si“,
 *  - celá obrazovka pro modely (`.chart-container` + tlačítka podle Chart Standards),
 *  - přepínání slidů šipkami a tlačítky (`js/course/slideNav.js`).
 *
 * Stránka nese `<body data-course-chapter="hustota">` a začíná rovnou prvním slidem: jeho
 * nadpis je jediné `h1`, úvod kapitoly patří do „Více“ pod ním.
 */

import { chapterBySlug, chapterNeighbours } from './p1Course.js';
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

function renderPrevNext(slug) {
    const host = document.querySelector('.course-prevnext');
    if (!host) return;
    const { prev, next } = chapterNeighbours(slug);
    const link = (c, dir) => c
        ? `<a class="course-prevnext-${dir}" href="${c.slug}.html">${dir === 'prev' ? '← ' : ''}${c.title}${dir === 'next' ? ' →' : ''}</a>`
        : '';
    const nextOrHub = next ? link(next, 'next')
        : '<a class="course-prevnext-next" href="index.html">Další kapitoly připravujeme — zpět na přehled kurzu →</a>';
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
    initExpandAll();
    initFullscreen();
    renderPrevNext(slug);
    const landOnHash = initSlideNav(slug ?? null);
    await Promise.all([loadConcepts(document), initPractice(document)]);
    // Po vložení bloků se stránka prodlouží — znovu skoč na kotvu z URL.
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    landOnHash();
}
