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

/** Entry row for each setup gas (same order): same mix first, then rows with unknown mix in order; null when none. */
export function matchEntryGases(setupGases, entryRows) {
    const free = [...(entryRows ?? [])];
    const take = pred => {
        const i = free.findIndex(pred);
        return i < 0 ? null : free.splice(i, 1)[0];
    };
    const out = setupGases.map(g => take(r => sameMix(g, r)));
    return out.map(r => r ?? take(row => !Number.isFinite(row.o2)));
}

/**
 * Setup gases with cylinderVolume, startPressure and sacRate for the gas view.
 * @param {Object[]} setupGases - recording gases as in a DiveSetup
 * @param {Object[]} entryRows - gasesFromEntry() rows (may be empty)
 * @param {Object} results - calculateTissueLoading() results for the recorded profile
 * @returns {{gases: Object[], assumed: string[]}} assumed: names of gases using any assumed value
 */
export function recordedGasSetup(setupGases, entryRows, results) {
    const rows = matchEntryGases(setupGases, entryRows);
    const unit = computeGasConsumption(results, setupGases.map(g => ({ ...g, cylinderVolume: 0 })), 1, 1).consumedByGasId;
    const assumed = [];
    const gases = setupGases.map((g, i) => {
        const r = rows[i];
        const volume = num(r?.volumeL) > 0 ? r.volumeL : null;
        const start = num(r?.startBar) > 0 ? r.startBar : null;
        const end = num(r?.endBar);
        const load = unit[g.id] ?? 0;
        const calibrated = volume !== null && start !== null && end !== null && end >= 0 && end < start && load > 0;
        if (!calibrated) assumed.push(g.name);
        return {
            ...g,
            cylinderVolume: volume ?? ASSUMED_CYLINDER_L,
            startPressure: start ?? ASSUMED_START_BAR,
            sacRate: calibrated ? (start - end) * volume / load : ASSUMED_SAC_LPM,
        };
    });
    return { gases, assumed };
}
