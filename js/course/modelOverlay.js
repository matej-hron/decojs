/**
 * Simulátor v překryvu: model se otevírá z náhledu na svém slidu a není samostatná zastávka.
 *
 *     <button class="course-thumb" data-open-model="model-lom">…náhled…</button>
 *     <dialog class="course-sim">
 *         <div class="course-model course-slide chart-container" id="model-lom">…</div>
 *     </dialog>
 *
 * Překryv leží přesně v rámečku slidu, takže nic neuskočí (na telefonu zabere celou obrazovku,
 * to řeší CSS). Zavírá se Esc, křížkem a klikem mimo a vrací na slide. Adresa `#model-lom` otevře
 * stránku se slidem a simulátorem. Model se staví až při prvním otevření, kdy má skutečnou velikost.
 */

const DESKTOP = '(min-width: 769px)';

/**
 * @typedef {Object} ModelController
 * @property {() => void} [onOpen]  při každém otevření (první až po postavení)
 * @property {() => void} [onClose]
 */

/**
 * @param {Object<string, () => ModelController>} factories id modelu → funkce, která model postaví
 * @param {{onToggle?: (open: boolean) => void}} [options]
 * @returns {{open: (id: string) => void, openFromHash: () => void}}
 */
export function initModelOverlays(factories, { onToggle = () => {} } = {}) {
    const controllers = new Map();
    const dialogOf = (id) => document.getElementById(id)?.closest('dialog.course-sim') ?? null;
    /** Slide, ze kterého se model otevírá: ten, kde je jeho náhled. */
    const slideOf = (id) => document.querySelector(`[data-open-model="${id}"]`)?.closest('.course-slide') ?? null;
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

    function open(id) {
        const dialog = dialogOf(id);
        if (!dialog || !factories[id] || dialog.open) return;
        slideOf(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
        place(id);
        dialog.showModal();
        openId = id;
        if (!controllers.has(id)) controllers.set(id, factories[id]() ?? {});
        controllers.get(id).onOpen?.();
        setHash(id);
        onToggle(true);
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
            onToggle(false);
        });
        // Klik mimo: cíl je sám dialog (jeho backdrop), obsah má vlastní prvky.
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
        dialog.querySelector('.course-sim-close')?.addEventListener('click', () => dialog.close());
        document.querySelectorAll(`[data-open-model="${id}"]`)
            .forEach(btn => btn.addEventListener('click', () => open(id)));
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
