/**
 * URL Parameter Utilities for Dive Setup Sharing
 * 
 * Enables encoding dive setups into URL parameters for sharing
 * and linking from theory pages to sandbox.
 * 
 * Usage:
 *   import { encodeDiveSetup, decodeDiveSetup, getSandboxUrl } from './urlParams.js';
 *   
 *   // Encode a setup for URL
 *   const encoded = encodeDiveSetup(mySetup);
 *   
 *   // Decode from URL parameter
 *   const setup = decodeDiveSetup(urlSearchParams.get('profile'));
 *   
 *   // Get full sandbox URL
 *   const url = getSandboxUrl(mySetup);
 */

/**
 * Encode a dive setup object into a URL-safe string
 * Uses base64 encoding of JSON. If the result is too long,
 * we could add compression in the future.
 * 
 * @param {Object} diveSetup - The dive setup to encode
 * @returns {string} URL-safe encoded string
 */
export function encodeDiveSetup(diveSetup) {
    if (!diveSetup) return '';

    try {
        // Create a minimal copy without unnecessary properties
        const minimal = {
            id: diveSetup.id,
            name: diveSetup.name,
            gases: diveSetup.gases,
            gfLow: diveSetup.gfLow,
            gfHigh: diveSetup.gfHigh,
            dives: diveSetup.dives
        };

        // Only include optional properties if they have meaningful values
        if (diveSetup.description) minimal.description = diveSetup.description;
        if (diveSetup.surfaceInterval) minimal.surfaceInterval = diveSetup.surfaceInterval;

        const json = JSON.stringify(minimal);

        // Use base64 encoding (URL-safe variant)
        const base64 = btoa(unescape(encodeURIComponent(json)));

        // Make URL-safe: replace + with -, / with _, remove padding =
        const urlSafe = base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        return urlSafe;
    } catch (error) {
        console.error('Failed to encode dive setup:', error);
        return '';
    }
}

/**
 * Decode a URL parameter string back into a dive setup object
 * 
 * @param {string} encoded - The encoded string from URL
 * @returns {Object|null} Decoded dive setup, or null if invalid
 */
export function decodeDiveSetup(encoded) {
    if (!encoded) return null;
    
    try {
        // Restore base64 padding and special chars
        let base64 = encoded
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        
        // Add back padding if needed
        const padding = (4 - (base64.length % 4)) % 4;
        base64 += '='.repeat(padding);
        
        // Decode base64 to JSON
        const json = decodeURIComponent(escape(atob(base64)));
        const setup = JSON.parse(json);
        
        // Basic validation
        if (!setup.gases || !setup.dives) {
            console.warn('Invalid dive setup: missing required fields');
            return null;
        }
        
        return setup;
    } catch (error) {
        console.error('Failed to decode dive setup:', error);
        return null;
    }
}

/**
 * Generate a full sandbox URL with the dive setup encoded
 *
 * @param {Object} diveSetup - The dive setup to link to
 * @param {Object} [options] - Optional settings
 * @param {string} [options.baseUrl] - Base URL (defaults to relative path)
 * @param {string} [options.chartMode] - Chart mode to pre-select (profile, pressure, gas, pp, tissue)
 * @returns {string} Full URL to sandbox with profile parameter
 */
export function getSandboxUrl(diveSetup, options = {}) {
    const { baseUrl = null, chartMode = null } = options;

    const encoded = encodeDiveSetup(diveSetup);
    if (!encoded) return baseUrl || 'sandbox/';

    // Determine base URL
    // If we're in the root, use 'sandbox/', if we're in a subdirectory, use '../sandbox/'
    const base = baseUrl || (window.location.pathname.includes('/sandbox')
        ? './'
        : 'sandbox/');

    let url = `${base}?profile=${encoded}`;
    if (chartMode) {
        url += `&chart=${chartMode}`;
    }
    return url;
}

/**
 * Get the chart mode from current URL if present
 *
 * @returns {string|null} Chart mode from URL, or null if not present
 */
export function getChartModeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('chart');
}

/**
 * Get the encoded profile from current URL if present
 * 
 * @returns {Object|null} Decoded dive setup from URL, or null if not present
 */
export function getProfileFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('profile');
    return decodeDiveSetup(encoded);
}

/**
 * Update the current URL with a new profile without reloading
 * Useful for updating the URL as the user edits in sandbox
 * 
 * @param {Object} diveSetup - The dive setup to encode into URL
 */
export function updateUrlWithProfile(diveSetup) {
    const encoded = encodeDiveSetup(diveSetup);
    if (!encoded) return;

    const url = new URL(window.location);
    url.searchParams.set('profile', encoded);

    // Use replaceState to update URL without adding to history
    window.history.replaceState({}, '', url);
}

/**
 * Read a compact dive setup from URL search params (`?v=1&d=...&t=...&...`).
 *
 * Activates only when `v=1` is present and `profile=` is absent — the base64
 * `profile=` reader takes precedence. Builds a single-gas dive setup and
 * generates waypoints with `generateDecoProfile()`, the same call the
 * "Generate Profile" button in DiveSetupEditor uses.
 *
 * Recognized params (all optional except d, t):
 *   d    — max depth (m, required)
 *   t    — bottom time (min, required, includes descent)
 *   o2   — bottom-gas O2 percent (default 21)
 *   gfL  — GF low percent (default 100)
 *   gfH  — GF high percent (default 100)
 *   zhl  — ZH-L16 variant 'A' | 'B' | 'C' (default: leave editor's current)
 *   sac  — surface SAC L/min (default 20)
 *   cyl  — cylinder volume in liters (default 12)
 *   dg   — optional deco gases (multi-gas), each `o2:vol:reserve:start`,
 *          comma-separated, e.g. 50:11.1:30:200,100:7:20:200 (max 3)
 *
 * @returns {Promise<Object|null>} Setup compatible with DiveSetupEditor, or null
 *                                  if v!=1, profile= present, required params
 *                                  invalid, or generateDecoProfile threw.
 */
export async function getCompactProfileFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('v') !== '1') return null;
    if (params.has('profile')) return null;

    const d = parseFloat(params.get('d'));
    const t = parseFloat(params.get('t'));
    if (!Number.isFinite(d) || !Number.isFinite(t) || d < 1 || d > 100 || t < 1 || t > 120) {
        return null;
    }

    const o2Raw = parseFloat(params.get('o2'));
    const gfLRaw = parseInt(params.get('gfL'), 10);
    const gfHRaw = parseInt(params.get('gfH'), 10);
    const sacRaw = parseFloat(params.get('sac'));
    const cylRaw = parseFloat(params.get('cyl'));
    const zhlRaw = params.get('zhl');

    const o2Pct = Number.isFinite(o2Raw) && o2Raw >= 5 && o2Raw <= 100 ? o2Raw : 21;
    const gfLow = Number.isFinite(gfLRaw) && gfLRaw >= 1 && gfLRaw <= 100 ? gfLRaw : 100;
    const gfHigh = Number.isFinite(gfHRaw) && gfHRaw >= 1 && gfHRaw <= 100 ? gfHRaw : 100;
    const sacRate = Number.isFinite(sacRaw) && sacRaw > 0 ? sacRaw : 20;
    const cylinderVolume = Number.isFinite(cylRaw) && cylRaw > 0 ? cylRaw : 12;
    const algorithm = (zhlRaw === 'A' || zhlRaw === 'B' || zhlRaw === 'C') ? zhlRaw : null;

    const o2Frac = o2Pct / 100;
    const gasName = o2Pct === 21 ? 'Air' : `EAN${Math.round(o2Pct)}`;
    const gases = [{
        id: 'bottom',
        name: gasName,
        o2: o2Frac,
        n2: 1 - o2Frac,
        he: 0,
        cylinderVolume,
        startPressure: 200
    }];

    // Optional deco gases (multi-gas plans) — the DecoTheory mobile app emits a
    // `dg` param: one entry per deco cylinder as `o2:volume:reserve:start`,
    // entries comma-separated (e.g. dg=50:11.1:30:200,100:7:20:200). Older links
    // omit it (single-gas). Capped at 3 deco gases (1 bottom + 3 deco).
    const dgRaw = params.get('dg');
    if (dgRaw) {
        for (const entry of dgRaw.split(',')) {
            if (gases.length >= 4) break;
            const parts = entry.split(':');
            const gO2 = parseFloat(parts[0]);
            const gVol = parseFloat(parts[1]);
            if (!Number.isFinite(gO2) || gO2 < 18 || gO2 > 100) continue;
            if (!Number.isFinite(gVol) || gVol <= 0 || gVol > 50) continue;
            const gReserveRaw = parseFloat(parts[2]);
            const gStartRaw = parseFloat(parts[3]);
            const gStart = Number.isFinite(gStartRaw) && gStartRaw > 0 ? gStartRaw : 200;
            const gReserve = Number.isFinite(gReserveRaw) && gReserveRaw >= 0 ? Math.min(gReserveRaw, gStart) : 30;
            const gFrac = gO2 / 100;
            const gName = gO2 === 100 ? 'O₂' : gO2 === 21 ? 'Air' : `EAN${Math.round(gO2)}`;
            gases.push({
                id: `deco-${gases.length}`,
                name: gName,
                o2: gFrac,
                n2: 1 - gFrac,
                he: 0,
                cylinderVolume: gVol,
                startPressure: gStart,
                reservePressure: gReserve
            });
        }
    }

    let waypoints;
    try {
        const { generateDecoProfile } = await import('./diveSetup.js');
        const result = generateDecoProfile(d, t, gases, gfLow, gfHigh);
        waypoints = result.waypoints;
    } catch (error) {
        console.error('Failed to build compact profile:', error);
        return null;
    }

    const setup = {
        name: `${d}\u00a0m / ${t}\u00a0min ${gasName}`,
        gases,
        gfLow,
        gfHigh,
        sacRate,
        dives: [{ waypoints }]
    };
    if (algorithm) setup.algorithm = algorithm;
    return setup;
}
