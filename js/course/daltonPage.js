/**
 * Kapitola P1 Složení vzduchu a Daltonův zákon (slidy 38–41). Bez modelu (rozhodnutí 2): jediná živá věc je
 * animace částic na slidu 40, kde je asi každá pátá částice kyslík (rozhodnutí 3, js/course/gasParticles.js).
 */

import { initChapter } from './chapter.js';
import { mountGasParticles } from './gasParticles.js';
import { registerServiceWorker } from '../swRegister.js';

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    document.querySelectorAll('[data-gas-particles]').forEach(g => mountGasParticles(g));
    initChapter();
}
