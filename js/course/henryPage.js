/**
 * Kapitola P1 Rozpouštění plynů v kapalinách (Henry, slidy 42–47). Bez vlastního modelu (rozhodnutí 2).
 */

import { initChapter } from './chapter.js';
import { registerServiceWorker } from '../swRegister.js';

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    initChapter();
}
