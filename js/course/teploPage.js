/**
 * Kapitola P1 Přenos tepla (slidy 57–60, slide 60 je konec přednášky). Bez modelu (rozhodnutí 9): řezy neoprenem
 * na slidu 59 jsou statické SVG ve stránce, na modely lomu (Hustota) a vztlaku (Archimedes) vedou odkazy ve „Více“.
 */

import { initChapter } from './chapter.js';
import { registerServiceWorker } from '../swRegister.js';

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    initChapter();
}
