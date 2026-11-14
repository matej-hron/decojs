/**
 * Kapitola P1 Vidění pod vodou (slidy 48–54, P★★). Bez modelu (analýza optiky, otázka 7): slidy nesou obrázky,
 * stránka jen zapne společné chování kapitoly (navigace slidů, pojmy, Procvič si).
 */

import { initChapter } from './chapter.js';
import { registerServiceWorker } from '../swRegister.js';

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    initChapter();
}
