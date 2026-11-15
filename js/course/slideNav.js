/**
 * Přepínání slidů kurzu: klávesy ← → a nenápadná tlačítka ‹ › skočí na předchozí
 * nebo další zastávku, i přes hranici kapitoly.
 *
 * Není to prezentační engine: stránka se dál normálně posouvá, nic se neskrývá a skok
 * je okamžitý (na projektoru klidnější, a tím odpadá i prefers-reduced-motion).
 *
 * Zastávka = každý `.course-slide` kromě modelů (ty se otevírají z náhledu), včetně „Procvič si“. Každá
 * kapitola končí sekcí `#procvic`, proto krok zpět z další kapitoly vede obyčejnou kotvou
 * a slide je po načtení rovnou na místě. Pozici scény určuje `scroll-margin-top` v CSS.
 * Pořadí kapitol je z `js/course/p1Course.js`, nehotové se přeskakují. Tlačítka jsou v patičce
 * každého slidu, vedle čísla slidu v kurzu z celkového počtu („12 / 74“, viz `courseSlideNumbering`).
 * Číslo slidu z přednášky (`data-slide-number`) zůstává skryté, slouží k dohledání.
 *
 * Na obsah kurzu se dá jít vždycky: odkaz „☰ Obsah“ vlevo v patičce (kromě slidu Obsah samotného),
 * v hlavičce překryvu modelu (`modelOverlay.js`) a klávesa O (i z překryvu a celé obrazovky).
 */

import { P1_CHAPTERS, courseSlideNumbering } from './p1Course.js';

/** Kotva poslední zastávky každé kapitoly (hlídá test). */
const LAST_STOP_HASH = '#procvic';
/** Kotva slidu Obsah na rozcestníku. */
export const TOC_ANCHOR = 'kapitoly';
/** Obsah kurzu z libovolné stránky v `p1/`. */
export const TOC_HREF = `index.html#${TOC_ANCHOR}`;
/** Prvky, kam se píše text: tam O patří psaní. Posuvník, zaškrtávátko ani tlačítko text neberou. */
const TEXT_ENTRY = 'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]), '
    + 'select, textarea, [contenteditable]:not([contenteditable="false"])';
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
    return [...root.querySelectorAll('main .course-slide:not(.course-model)')];
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
 * @param {{modelOpen?: boolean}} [state] je otevřený simulátor nebo model na celé obrazovce
 * @returns {1|-1|0} směr kroku, 0 = klávesa slidům nepatří
 */
export function slideKeyDirection(e, { modelOpen = false } = {}) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return 0;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented || modelOpen) return 0;
    if (e.target?.closest?.(OWN_ARROWS)) return 0;
    return e.key === 'ArrowRight' ? 1 : -1;
}

/**
 * Klávesa O = obsah kurzu. Nekoliduje se šipkami, mezerníkem ani Esc v simulátorech.
 * @param {{key: string, altKey: boolean, ctrlKey: boolean, metaKey: boolean,
 *   defaultPrevented: boolean, target: EventTarget|null}} e
 * @returns {boolean}
 */
export function isTocKey(e) {
    if (e.key !== 'o' && e.key !== 'O') return false;
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return false;
    return !e.target?.closest?.(TEXT_ENTRY);
}

/**
 * Klávesa O mimo slidy (stránka Použité materiály). Na stránkách se slidy ji obsluhuje `initSlideNav`.
 */
export function initTocKey() {
    document.addEventListener('keydown', (e) => {
        if (!isTocKey(e)) return;
        e.preventDefault();
        window.location.assign(TOC_HREF);
    });
}

/**
 * @param {EventTarget|null} target
 * @returns {boolean} prvek je posuvník (Esc z něj uvolní fokus, aby šipky zase přepínaly slidy)
 */
export function isSliderTarget(target) {
    return Boolean(target?.closest?.(SLIDER));
}

/** Skok na zastávku. První je začátek stránky, adresa pak hash nepotřebuje. */
function jumpTo(stops, index) {
    const stop = stops[index];
    if (index === 0) window.scrollTo({ top: 0, behavior: 'instant' });
    else stop.scrollIntoView({ block: 'start', behavior: 'instant' });
    const anchor = index === 0 ? '' : stopAnchor(stop);
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}${anchor ? `#${anchor}` : ''}`);
}

function step(slug, dir, from = null) {
    const stops = collectStops(document);
    const stageTop = parseFloat(getComputedStyle(stops[0]).scrollMarginTop) || 0;
    const index = from ? stops.indexOf(from)
        : mostVisibleIndex(stops.map(s => s.getBoundingClientRect()), stageTop, window.innerHeight);
    const target = nextTarget({ slug, index, count: stops.length, dir });
    if (!target) return;
    if ('stop' in target) jumpTo(stops, target.stop);
    else window.location.replace(target.href); // skoky nezaplňují historii prohlížeče
}

/** Odkaz na obsah kurzu; slovo „Obsah“ na telefonu mizí a zbude ☰ (jméno pro čtečky nese aria-label). */
export const TOC_LINK_HTML = `<a class="course-toc-link" href="${TOC_HREF}" aria-label="Obsah kurzu" title="Obsah kurzu (klávesa O)">`
    + '<span aria-hidden="true">☰</span><span class="course-toc-word"> Obsah</span></a>';

/**
 * Patička slidu: vlevo „☰ Obsah“ a jméno přednášky, vpravo číslo slidu z celkového počtu („12 / 74“) a ‹ ›.
 * @param {number|null} number pořadí slidu v kurzu; `null` = bez čísla (stránka, která se nečísluje)
 * @param {number|null} total počet slidů kurzu
 * @param {{toc?: boolean}} [opts] `toc: false` na slidu Obsah samotném
 * @returns {string} HTML
 */
export function slideFootHtml(number, total, { toc = true } = {}) {
    const label = number ? ` aria-label="slide ${number} z ${total}"` : '';
    const text = number ? `${number} / ${total}` : '';
    return `<span class="course-foot-left">${toc ? TOC_LINK_HTML : ''}<span class="course-foot-title">P1 – Fyzika</span></span>
        <span class="course-foot-right">
            <span class="course-foot-number"${label}>${text}</span>
            <span class="course-slide-nav" role="group" aria-label="Přepínání slidů">
                <button type="button" data-step="-1" title="Předchozí slide" aria-label="Předchozí slide">‹</button>
                <button type="button" data-step="1" title="Další slide" aria-label="Další slide">›</button>
            </span>
        </span>`;
}

/** Obsah kurzu: na rozcestníku skok na slide Obsah, jinak přechod na rozcestník (Zpět vrátí na slide). */
function goToToc(slug) {
    const stops = collectStops(document);
    const index = slug === null ? stops.findIndex(s => stopAnchor(s) === TOC_ANCHOR) : -1;
    if (index >= 0 && !document.querySelector('dialog.course-sim[open]')) jumpTo(stops, index);
    else window.location.assign(TOC_HREF);
}

function renderFeet(slug) {
    const numbering = courseSlideNumbering(slug);
    collectStops(document).forEach((stop, i) => {
        const foot = document.createElement('div');
        foot.className = 'course-foot';
        const toc = !(slug === null && stopAnchor(stop) === TOC_ANCHOR);
        foot.innerHTML = numbering ? slideFootHtml(numbering.first + i, numbering.total, { toc }) : slideFootHtml(null, null, { toc });
        foot.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => {
            step(slug, Number(btn.dataset.step), stop);
        }));
        stop.appendChild(foot);
    });
}

/**
 * Zapne klávesy a tlačítka.
 * @param {string|null} slug kapitola, `null` na rozcestníku
 * @returns {() => void} doskočí na zastávku z adresy; volat, až je obsah stránky hotový
 */
export function initSlideNav(slug) {
    document.addEventListener('keydown', (e) => {
        const modelOpen = Boolean(document.querySelector('dialog.course-sim[open], .course-model.fullscreen'));
        if (e.key === 'Escape' && isSliderTarget(e.target) && !modelOpen) { e.target.blur(); return; }
        if (isTocKey(e)) { e.preventDefault(); goToToc(slug); return; }
        const dir = slideKeyDirection(e, { modelOpen });
        if (!dir) return;
        e.preventDefault();
        step(slug, dir);
    });
    renderFeet(slug);

    return () => {
        const stops = collectStops(document);
        const { hash } = window.location;
        const index = stops.findIndex(s => hash === `#${stopAnchor(s)}`);
        if (index > 0) jumpTo(stops, index);
    };
}
