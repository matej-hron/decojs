/**
 * Kapitola P1 Tlak (slidy 10–22): model M1 „Tlak v hloubce“ + společné chování kapitoly.
 * M1 se otevírá z náhledů na slidech 15 a 20 (`js/course/modelOverlay.js`) a staví se až při otevření.
 * Předvolby `?hloubka=&hladina=&presne=`, kotva #model-tlak (js/course/pressureModel.js).
 */

import { initChapter } from './chapter.js';
import { initModelOverlays, initPresetLinks } from './modelOverlay.js';
import { createPressureModel, initPressureModel } from './pressureModel.js';
import { registerServiceWorker } from '../swRegister.js';

/** Náhledy na slidech: skutečný model, statický, bez ovládání. */
const THUMBS = {
    'nahled-tlak-15': { depth: 10, altitude: 0, water: 'salt', pressureMode: 'school' },
    'nahled-tlak-20': { depth: 40.5, altitude: 0, water: 'salt', pressureMode: 'school' },
};

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    for (const [id, state] of Object.entries(THUMBS)) {
        const host = document.getElementById(id);
        if (host) createPressureModel(host, { controls: false, compact: true, state });
    }
    const overlays = initModelOverlays({
        'model-tlak': () => initPressureModel({ host: 'tlak-sloupec', controls: 'tlak-ovladani' }),
    });
    initPresetLinks(overlays);
    initChapter().then(() => overlays.openFromHash());
}
