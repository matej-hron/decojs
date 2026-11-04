/**
 * Přepínání slidů kurzu: klávesy ← → a nenápadná tlačítka ‹ › skočí na předchozí
 * nebo další zastávku, i přes hranici kapitoly.
 *
 * Není to prezentační engine: stránka se dál normálně posouvá, nic se neskrývá a skok
 * je okamžitý (na projektoru klidnější, a tím odpadá i prefers-reduced-motion).
 *
 * Zastávka = každý `.course-slide` (i model a „Procvič si“), v pořadí na stránce. Každá
 * kapitola končí sekcí `#procvic`, proto krok zpět z další kapitoly vede obyčejnou kotvou
 * a slide je po načtení rovnou na místě. Pozici scény určuje `scroll-margin-top` v CSS.
 * Pořadí kapitol je z `js/course/p1Course.js`, nehotové se přeskakují. Tlačítka jsou v liště kurzu.
 */

import { P1_CHAPTERS } from './p1Course.js';

/** Kotva poslední zastávky každé kapitoly (hlídá test). */
const LAST_STOP_HASH = '#procvic';
/** Prvky, kterým šipky patří. */
const OWN_ARROWS = 'input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="slider"]';
const SLIDER = 'input[type="range"], [role="slider"]';
/** Kus zastávky, který musí být vidět, aby se počítala za aktuální (kraj dalšího slidu nestačí). */
const MIN_VISIBLE = 0.25;

/**
 * @param {ParentNode} root
 * @returns {Element[]} zastávky v pořadí na stránce
 */
export function collectStops(root) {
    return [...root.querySelectorAll('main .course-slide')];
}

/**
 * Kotva zastávky pro adresu: vlastní id, jinak id sekce, kterou slide otevírá.
 * @param {Element} stop
 * @returns {string} prázdné, pokud zastávka kotvu nemá (titulní slide)
 */
export function stopAnchor(stop) {
    if (stop.id) return stop.id;
    const section = stop.parentElement?.closest('section[id]');
    return section?.querySelector('.course-slide') === stop ? section.id : '';
}

/**
 * Kam vede krok z dané zastávky.
 * @param {{slug?: string|null, index: number, count: number, dir: 1|-1, chapters?: {slug: string, status: string}[]}} p
 *   `slug` je kapitola, `null` rozcestník
 * @returns {{stop: number}|{href: string}|null} zastávka na téže stránce, jiná stránka, nebo nikam
 */
export function nextTarget({ slug = null, index, count, dir, chapters = P1_CHAPTERS }) {
    const to = index + dir;
    if (to >= 0 && to < count) return { stop: to };

    const ready = chapters.filter(c => c.status === 'ready');
    if (slug === null) return dir > 0 && ready.length ? { href: `${ready[0].slug}.html` } : null;

    const neighbour = ready[ready.findIndex(c => c.slug === slug) + dir];
    if (!neighbour) return { href: 'index.html#kapitoly' };
    return { href: `${neighbour.slug}.html${dir < 0 ? LAST_STOP_HASH : ''}` };
}

/**
 * Aktuální zastávka: ta, které je v okně vidět nejvíc. Když není vidět žádná (čte se
 * rozbalené „Více“), je to poslední zastávka nad oknem.
 * @param {{top: number, bottom: number}[]} rects
 * @param {number} top horní okraj viditelné plochy (pod hlavičkou webu)
 * @param {number} bottom dolní okraj viditelné plochy
 * @returns {number}
 */
export function mostVisibleIndex(rects, top, bottom) {
    let best = -1;
    let bestVisible = 0;
    let lastAbove = 0;
    rects.forEach((r, i) => {
        if (r.top <= top) lastAbove = i;
        const visible = Math.min(r.bottom, bottom) - Math.max(r.top, top);
        const enough = visible >= MIN_VISIBLE * Math.min(r.bottom - r.top, bottom - top);
        if (enough && visible > bestVisible) { best = i; bestVisible = visible; }
    });
    return best >= 0 ? best : lastAbove;
}

/**
 * @param {{key: string, altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean,
 *   defaultPrevented: boolean, target: EventTarget|null}} e
 * @param {{fullscreen?: boolean}} [state] model je na celé obrazovce
 * @returns {1|-1|0} směr kroku, 0 = klávesa slidům nepatří
 */
export function slideKeyDirection(e, { fullscreen = false } = {}) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return 0;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented || fullscreen) return 0;
    if (e.target?.closest?.(OWN_ARROWS)) return 0;
    return e.key === 'ArrowRight' ? 1 : -1;
}

/**
 * @param {EventTarget|null} target
 * @returns {boolean} prvek je posuvník (Esc z něj uvolní fokus, aby šipky zase přepínaly slidy)
 */
export function isSliderTarget(target) {
    return Boolean(target?.closest?.(SLIDER));
}

/** Skok na zastávku. První je začátek stránky i s lištou, adresa pak hash nepotřebuje. */
function jumpTo(stops, index) {
    const stop = stops[index];
    if (index === 0) window.scrollTo({ top: 0, behavior: 'instant' });
    else stop.scrollIntoView({ block: 'start', behavior: 'instant' });
    const anchor = index === 0 ? '' : stopAnchor(stop);
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}${anchor ? `#${anchor}` : ''}`);
}

function step(slug, dir) {
    const stops = collectStops(document);
    const stageTop = parseFloat(getComputedStyle(stops[0]).scrollMarginTop) || 0;
    const index = mostVisibleIndex(stops.map(s => s.getBoundingClientRect()), stageTop, window.innerHeight);
    const target = nextTarget({ slug, index, count: stops.length, dir });
    if (!target) return;
    if ('stop' in target) jumpTo(stops, target.stop);
    else window.location.replace(target.href); // skoky nezaplňují historii prohlížeče
}

function renderButtons(slug) {
    const nav = document.querySelector('.course-bar .course-slide-nav');
    if (!nav) return;
    for (const [dir, label, glyph] of [[-1, 'Předchozí slide', '‹'], [1, 'Další slide', '›']]) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = glyph;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', () => step(slug, dir));
        nav.appendChild(btn);
    }
}

/**
 * Zapne klávesy a tlačítka.
 * @param {string|null} slug kapitola, `null` na rozcestníku
 * @returns {() => void} doskočí na zastávku z adresy; volat, až je obsah stránky hotový
 */
export function initSlideNav(slug) {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isSliderTarget(e.target)) { e.target.blur(); return; }
        const fullscreen = Boolean(document.querySelector('.course-model.fullscreen'));
        const dir = slideKeyDirection(e, { fullscreen });
        if (!dir) return;
        e.preventDefault();
        step(slug, dir);
    });
    renderButtons(slug);

    return () => {
        const stops = collectStops(document);
        const { hash } = window.location;
        const index = stops.findIndex(s => hash === `#${stopAnchor(s)}`);
        if (index > 0) jumpTo(stops, index);
    };
}
