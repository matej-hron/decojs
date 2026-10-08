/**
 * Cylinder data for a recorded dive's gas-consumption view.
 *
 * A recording has no tank pressure. The logbook entry may know each cylinder's volume and start/end
 * pressure; recordedGasSetup() turns that into setup gases whose modelled pressure line (the same
 * integrator the chart draws with) ends exactly at the logged end pressure. Pure: no DOM.
 */
import { computeGasConsumption } from '../diveSetup.js';

export const ASSUMED_SAC_LPM = 20;
export const ASSUMED_CYLINDER_L = 12;
export const ASSUMED_START_BAR = 200;

const sameMix = (gas, row) => Number.isFinite(row.o2)
    && Math.abs(row.o2 - gas.o2) < 0.005 && Math.abs((row.he ?? 0) - (gas.he ?? 0)) < 0.005;
const num = v => (Number.isFinite(v) ? v : null);

/**
 * Entry row for each setup gas (same order): same mix first, then rows with unknown mix in order;
 * null when none. The unknown-mix pass serves breathed gases first, so a legacy row without a mix goes
 * to the gas actually used rather than to an unused configured bottle.
 * @param {Object[]} setupGases
 * @param {Object[]} entryRows
 * @param {(gas: Object) => boolean} [breathed] - true for gases used during the dive (default: all)
 */
export function matchEntryGases(setupGases, entryRows, breathed = () => true) {
    const free = [...(entryRows ?? [])];
    const take = pred => {
        const i = free.findIndex(pred);
        return i < 0 ? null : free.splice(i, 1)[0];
    };
    const out = setupGases.map(g => take(r => sameMix(g, r)));
    const unknownMix = row => !Number.isFinite(row.o2);
    for (const pass of [true, false]) {
        setupGases.forEach((g, i) => {
            if (out[i] === null && Boolean(breathed(g)) === pass) out[i] = take(unknownMix);
        });
    }
    return out;
}

/**
 * Setup gases with cylinderVolume, startPressure and sacRate for the gas view.
 * Gases never breathed draw no consumption, so they are never reported as assumed.
 * @param {Object[]} setupGases - recording gases as in a DiveSetup
 * @param {Object[]} entryRows - gasesFromEntry() rows (may be empty)
 * @param {Object} results - calculateTissueLoading() results for the recorded profile
 * @returns {{gases: Object[], assumed: string[], assumedCylinder: string[]}} assumed: names of breathed gases
 *   using any assumed value; assumedCylinder: the subset whose cylinder volume or start pressure is assumed
 *   (the others only lack the end pressure, so only their SAC is assumed)
 */
export function recordedGasSetup(setupGases, entryRows, results) {
    const unit = computeGasConsumption(results, setupGases.map(g => ({ ...g, cylinderVolume: 0 })), 1, 1).consumedByGasId;
    const loadOf = g => unit[g.id] ?? 0;
    const rows = matchEntryGases(setupGases, entryRows, g => loadOf(g) > 0);
    const assumed = [];
    const assumedCylinder = [];
    const gases = setupGases.map((g, i) => {
        const r = rows[i];
        const volume = num(r?.volumeL) > 0 ? r.volumeL : null;
        const start = num(r?.startBar) > 0 ? r.startBar : null;
        const end = num(r?.endBar);
        const load = loadOf(g);
        const calibrated = volume !== null && start !== null && end !== null && end >= 0 && end < start && load > 0;
        if (load > 0 && !calibrated) {
            assumed.push(g.name);
            if (volume === null || start === null) assumedCylinder.push(g.name);
        }
        return {
            ...g,
            cylinderVolume: volume ?? ASSUMED_CYLINDER_L,
            startPressure: start ?? ASSUMED_START_BAR,
            sacRate: calibrated ? (start - end) * volume / load : ASSUMED_SAC_LPM,
        };
    });
    return { gases, assumed, assumedCylinder };
}
