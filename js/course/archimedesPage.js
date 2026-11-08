/**
 * Kapitola P1 Archimédův zákon a kontrola vztlaku (slidy 31–37): model A1 „Potápěč a vztlak“ + společné chování
 * kapitoly. A1 se otevírá z náhledu na slidu 36 (krok 2: sestup do 10 m) a z odkazů ve „Více“ a v postupu slidu 33.
 * Předvolba `?krok=`, kotva #model-vztlak (js/course/buoyancyModel.js).
 */

import { initChapter } from './chapter.js';
import { initModelOverlays, initPresetLinks } from './modelOverlay.js';
import { createBuoyancyModel, initBuoyancyModel, stepState } from './buoyancyModel.js';
import { registerServiceWorker } from '../swRegister.js';

/** Náhled na slidu 36: skutečný model, statický, bez ovládání, ve stavu kroku 2 (v 10 m chybí 4,4 kg). */
export const THUMB_STEP = 1;

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    const host = document.getElementById('nahled-vztlak');
    if (host) createBuoyancyModel(host, { controls: false, compact: true, state: stepState(THUMB_STEP) });
    const overlays = initModelOverlays({
        'model-vztlak': () => initBuoyancyModel({ host: 'vztlak-sloupec', controls: 'vztlak-ovladani' }),
    });
    initPresetLinks(overlays);
    initChapter().then(() => overlays.openFromHash());
}
