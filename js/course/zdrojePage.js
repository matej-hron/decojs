/**
 * Kurz P1, stránka Použité materiály (T18): autoři a licence převzatých obrázků.
 * Slidy na ni odkazují drobným odkazem „zdroj“ s kotvou na položku. Slidy tu nejsou,
 * obsah kurzu je v odkazu nahoře a na klávesu O jako všude v kurzu.
 */

import { registerServiceWorker } from '../swRegister.js';
import { initTocKey } from './slideNav.js';

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    initTocKey();
}
