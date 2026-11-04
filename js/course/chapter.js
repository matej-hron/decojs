/**
 * Chování stránky kapitoly kurzu (bez závislosti na konkrétním modelu):
 *  - lišta kurzu: kurz › kapitola a obsah sekcí (skok na sekci / model), též na rozcestníku,
 *  - přepínač „Rozbalit všechny výklady“ pro `<details class="course-more">`,
 *  - předchozí / další kapitola podle `js/course/p1Course.js`,
 *  - vložení sdílených bloků pojmů a otázek „Procvič si“,
 *  - celá obrazovka pro modely (`.chart-container` + tlačítka podle Chart Standards),
 *  - přepínání slidů šipkami a tlačítky (`js/course/slideNav.js`).
 *
 * Stránka nese `<body data-course-chapter="hustota">` a začíná rovnou prvním slidem: jeho
 * nadpis je jediné `h1`, úvod kapitoly patří do „Více“ pod ním.
 */

import { P1_CHAPTERS, chapterBySlug, chapterNeighbours } from './p1Course.js';
import { loadConcepts } from './concepts.js';
import { initPractice } from './practice.js';
import { initSlideNav } from './slideNav.js';

/**
 * Seznam sekcí pro obsah: každá `section[id]` s nadpisem `h1` nebo `h2` v `main`.
 * @param {ParentNode} root
 * @returns {{id: string, title: string}[]}
 */
export function collectSections(root) {
    return [...root.querySelectorAll('main section[id]')]
        .map(s => {
            const heading = s.querySelector('h1, h2');
            // jen vlastní text nadpisu, bez štítku „slide 8“
            const title = heading ? [...heading.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
            return { id: s.id, title };
        })
        .filter(s => s.title);
}

function renderToc() {
    const toc = document.querySelector('.course-toc');
    if (!toc) return;
    const items = collectSections(document)
        .map(s => `<li><a href="#${s.id}">${s.title}</a></li>`).join('');
    toc.innerHTML = `<ol>${items}</ol>`;
}

/**
 * Drobečky v liště: název kurzu › pořadí a název kapitoly.
 * @param {string|null} slug kapitola, `null` na rozcestníku
 * @returns {string} HTML, prázdné pro neznámou kapitolu
 */
export function breadcrumbHtml(slug) {
    if (slug === null) return 'Kurz P1 – Fyzika';
    const i = P1_CHAPTERS.findIndex(c => c.slug === slug);
    if (i < 0) return '';
    return `<a href="index.html">Kurz P1 – Fyzika</a> › ${i + 1}. ${P1_CHAPTERS[i].title}`;
}

/**
 * Lišta kurzu, stejná na rozcestníku i v kapitolách.
 * @param {string|null} slug kapitola, `null` na rozcestníku
 */
export function renderCourseBar(slug) {
    const crumb = document.querySelector('.course-bar .course-breadcrumb');
    if (crumb) crumb.innerHTML = breadcrumbHtml(slug);
    renderToc();
}

function initExpandAll() {
    const btn = document.querySelector('.course-expand-all');
    const all = () => [...document.querySelectorAll('details.course-more')];
    if (!btn || all().length === 0) return;
    const sync = () => {
        const open = all().every(d => d.open);
        btn.setAttribute('aria-pressed', String(open));
        btn.textContent = open ? 'Sbalit všechny výklady' : 'Rozbalit všechny výklady';
    };
    btn.addEventListener('click', () => {
        const open = !all().every(d => d.open);
        all().forEach(d => { d.open = open; });
        sync();
    });
    all().forEach(d => d.addEventListener('toggle', sync));
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
    renderCourseBar(slug ?? null);
    initFullscreen();
    renderPrevNext(slug);
    const landOnHash = initSlideNav(slug ?? null);
    await Promise.all([loadConcepts(document), initPractice(document)]);
    initExpandAll();
    // Po vložení bloků se stránka prodlouží — znovu skoč na kotvu z URL.
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    landOnHash();
}
