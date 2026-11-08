/**
 * Simulátor v překryvu: model se otevírá z náhledu na svém slidu a není samostatná zastávka.
 *
 *     <button class="course-thumb" data-open-model="model-lom">…náhled…</button>
 *     <dialog class="course-sim">
 *         <div class="course-model course-slide chart-container" id="model-lom">…</div>
 *     </dialog>
 *
 * Jeden model může mít náhled na víc slidech (Tlak: M1 na slidech 15 a 20). Překryv leží na slidu, odkud se
 * otevřel, a po zavření se na něj vrací.
 *
 * Překryv leží přesně v rámečku slidu, takže nic neuskočí (na telefonu zabere celou obrazovku,
 * to řeší CSS). Zavírá se Esc, křížkem a klikem mimo a vrací na slide. Adresa `#model-lom` otevře
 * stránku se slidem a simulátorem. Model se staví až při prvním otevření, kdy má skutečnou velikost.
 *
 * Náhled může nést předvolbu `data-model-params="zvon=1"`: před otevřením se zapíše do adresy, takže ji model
 * načte stejně jako předvolbu z odkazu (po zavření ji model z adresy smaže).
 */

import { withPreset } from './modelParams.js';

const DESKTOP = '(min-width: 769px)';

/**
 * @typedef {Object} ModelController
 * @property {() => void} [onOpen]  při každém otevření (první až po postavení)
 * @property {() => void} [onClose]
 */

/**
 * @param {Object<string, () => ModelController>} factories id modelu → funkce, která model postaví
 * @returns {{open: (id: string, from?: Element|null) => void, openFromHash: () => void}}
 */
export function initModelOverlays(factories) {
    const controllers = new Map();
    const dialogOf = (id) => document.getElementById(id)?.closest('dialog.course-sim') ?? null;
    /** Výchozí slide modelu: ten s jeho prvním náhledem. */
    const firstSlideOf = (id) => document.querySelector(`[data-open-model="${id}"]`)?.closest('.course-slide') ?? null;
    /** Slide, odkud se který model naposledy otevřel. */
    const openedFrom = new Map();
    const slideOf = (id) => openedFrom.get(id) ?? firstSlideOf(id);
    let openId = null;

    function place(id) {
        const dialog = dialogOf(id);
        const slide = slideOf(id);
        if (!dialog || !slide) return;
        if (!window.matchMedia(DESKTOP).matches) { dialog.removeAttribute('style'); return; }
        const r = slide.getBoundingClientRect();
        dialog.style.left = `${r.left}px`;
        dialog.style.top = `${r.top}px`;
        dialog.style.width = `${r.width}px`;
        dialog.style.height = `${r.height}px`;
    }

    function setHash(anchor) {
        const { pathname, search } = window.location;
        window.history.replaceState(null, '', `${pathname}${search}${anchor ? `#${anchor}` : ''}`);
    }

    /**
     * @param {string} id
     * @param {Element|null} [from] prvek na slidu, odkud se otevírá (náhled, odkaz); výchozí je první náhled
     */
    function open(id, from = null) {
        const dialog = dialogOf(id);
        if (!dialog || !factories[id] || dialog.open) return;
        const preset = from?.getAttribute?.('data-model-params');
        if (preset) {
            const { pathname, search, hash } = window.location;
            window.history.replaceState(null, '', `${pathname}${withPreset(search, preset)}${hash}`);
        }
        const fromSlide = from?.closest('.course-slide:not(.course-model)') ?? null;
        openedFrom.set(id, fromSlide ?? firstSlideOf(id));
        slideOf(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
        place(id);
        dialog.showModal();
        openId = id;
        if (!controllers.has(id)) controllers.set(id, factories[id]() ?? {});
        controllers.get(id).onOpen?.();
        setHash(id);
    }

    for (const id of Object.keys(factories)) {
        const dialog = dialogOf(id);
        if (!dialog) continue;
        dialog.addEventListener('close', () => {
            controllers.get(id)?.onClose?.();
            openId = null;
            const slide = slideOf(id);
            slide?.scrollIntoView({ block: 'start', behavior: 'instant' });
            setHash(slide?.closest('section[id]')?.id ?? '');
        });
        // Klik mimo: cíl je sám dialog (jeho backdrop), obsah má vlastní prvky.
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
        dialog.querySelector('.course-sim-close')?.addEventListener('click', () => dialog.close());
        document.querySelectorAll(`[data-open-model="${id}"]`)
            .forEach(btn => btn.addEventListener('click', () => open(id, btn)));
    }

    // Změna okna přeskládá stránku pod překryvem: nejdřív vrátit slide na místo, pak překryv.
    window.addEventListener('resize', () => {
        if (!openId) return;
        slideOf(openId)?.scrollIntoView({ block: 'start', behavior: 'instant' });
        place(openId);
    });

    const openFromHash = () => {
        const id = window.location.hash.slice(1);
        if (factories[id]) open(id);
    };
    window.addEventListener('hashchange', openFromHash);

    return { open, openFromHash };
}

/**
 * Odkaz „Ukaž to v modelu“ (`<a href="?mesic=2#model-lom" data-preset-link>`): zapíše předvolbu do adresy
 * a otevře simulátor bez znovunačtení, na slidu, kde odkaz je.
 * @param {{open: (id: string, from?: Element|null) => void}} overlays
 */
export function initPresetLinks(overlays) {
    document.querySelectorAll('a[data-preset-link]').forEach(a => a.addEventListener('click', (e) => {
        e.preventDefault();
        const url = new URL(a.href);
        window.history.replaceState(null, '', `${url.pathname}${url.search}${window.location.hash}`);
        overlays.open(url.hash.slice(1), a);
    }));
}
