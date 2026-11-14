/**
 * Kapitola P1 Slyšení pod vodou (slidy 55–56). Bez modelu (rozhodnutí 9): obrázek slidu 55 je statické SVG ve stránce.
 */

import { initChapter } from './chapter.js';
import { registerServiceWorker } from '../swRegister.js';

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    initChapter();
}
