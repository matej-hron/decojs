/**
 * Kapitola P1 Stlačování plynů (slidy 23–30): model B1 „Balónek a zvon“ + společné chování kapitoly.
 * B1 se otevírá z náhledů na slidech 24 (zvon), 25 (balónek ve 40 m) a 26 (balónek u hladiny); každý náhled nese
 * svou předvolbu (`data-model-params`). Předvolby `?zvon=&hloubka=`, kotva #model-boyle (js/course/boyleModel.js).
 */

import { initChapter } from './chapter.js';
import { initModelOverlays, initPresetLinks } from './modelOverlay.js';
import { createBoyleModel, initBoyleModel } from './boyleModel.js';
import { registerServiceWorker } from '../swRegister.js';

/** Náhledy na slidech: skutečný model, statický, bez ovládání. */
const THUMBS = {
    'nahled-zvon': { gasObject: 'bell', depth: 20 },
    'nahled-balonek': { gasObject: 'balloon', depth: 0 },
    'nahled-male-hloubky': { gasObject: 'balloon', depth: 10 },
};

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    for (const [id, state] of Object.entries(THUMBS)) {
        const host = document.getElementById(id);
        if (host) createBoyleModel(host, { controls: false, compact: true, state });
    }
    const overlays = initModelOverlays({
        'model-boyle': () => initBoyleModel({ host: 'boyle-sloupec', controls: 'boyle-ovladani' }),
    });
    initPresetLinks(overlays);
    initChapter().then(() => overlays.openFromHash());
}
