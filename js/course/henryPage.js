/**
 * Kapitola P1 Rozpouštění plynů v kapalinách (Henry, slidy 42–47). Bez vlastního modelu (rozhodnutí 2): simulátor
 * sycení tkání (slide 46) je komponenta Deco Theory z Pískoviště (`js/components/TissueSaturationSim.js`), jedna
 * definice. V kurzu běží v překryvu na slidu, vždy česky (pevný překladač, nezávisle na jazyku webu), s předvolbou
 * hloubky z náhledu (`data-model-params="hloubka=30"`) a s klávesami jen v otevřeném překryvu.
 */

import { initChapter } from './chapter.js';
import { initModelOverlays, initPresetLinks } from './modelOverlay.js';
import { readParams, syncUrl } from './modelParams.js';
import { createTranslator } from '../i18n.js';
import { TissueSaturationSim, renderTissueSimMarkup } from '../components/TissueSaturationSim.js';
import { registerServiceWorker } from '../swRegister.js';

/** Předvolba simulátoru v adrese: `?hloubka=30` (m, jako posuvník simulátoru 0–40 m). */
export const SATURATION_PARAMS = Object.freeze({ hloubka: { min: 0, max: 40, step: 1, default: 0 } });

/**
 * Simulátor sycení v překryvu. Postaví se při prvním otevření (Chart.js potřebuje skutečnou velikost plátna).
 * @param {{host: HTMLElement, dialog: HTMLDialogElement, translator: Promise<Function>}} deps
 * @returns {{onOpen: () => void, onClose: () => void}}
 */
export function initSaturationOverlay({ host, dialog, translator }) {
    let sim = null;
    let building = null;
    const presetDepth = () => {
        const has = new URLSearchParams(window.location.search).has('hloubka');
        return has ? readParams(window.location.search, SATURATION_PARAMS).hloubka : null;
    };
    const build = async () => {
        const t = await translator;
        renderTissueSimMarkup(host, { t, i18n: false });
        sim = new TissueSaturationSim(host, {
            t, lang: 'cs', depth: presetDepth() ?? 0, keyboardActive: () => dialog.open,
        });
    };
    return {
        onOpen() {
            if (!sim) {
                building ??= build().then(() => syncUrl({ hloubka: null }));
                return;
            }
            const depth = presetDepth();
            if (depth !== null) sim.setDepth(depth);
            syncUrl({ hloubka: null });
            sim.start();
        },
        onClose() {
            sim?.stop();
        },
    };
}

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    const translator = createTranslator('cs');
    const host = document.getElementById('syceni-sim');
    const overlays = initModelOverlays({
        'model-syceni': () => initSaturationOverlay({ host, dialog: host.closest('dialog'), translator }),
    });
    initPresetLinks(overlays);
    initChapter().then(() => overlays.openFromHash());
}
