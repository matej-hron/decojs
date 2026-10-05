/**
 * RecordedDive helpers.
 *
 * A RecordedDive is the brand-neutral record of a dive downloaded from a dive
 * computer (see docs/superpowers/specs/2026-10-05-divesoft-dlf-import-design.md).
 * toDiveSetup() converts it into the DiveSetup shape the rest of DecoTheory
 * already understands, so recorded dives can be replayed by the engine.
 */

/**
 * Display name for a gas mix, following DecoTheory's naming.
 *
 * @param {{o2: number, he: number}} gas - Fractions 0–1
 * @returns {string} e.g. 'Air', 'EAN32', 'O₂ 100%', 'Tx 18/45'
 */
export function gasName({ o2, he }) {
    const o2Pct = Math.round(o2 * 100);
    const hePct = Math.round(he * 100);
    if (hePct > 0) return `Tx ${o2Pct}/${hePct}`;
    if (o2Pct === 21) return 'Air';
    if (o2Pct === 100) return 'O₂ 100%';
    return `EAN${o2Pct}`;
}

/**
 * Convert a RecordedDive into a DiveSetup.
 *
 * Samples become waypoints (time in minutes). Each gas switch sets `gasId` on
 * the first waypoint at or after the switch time. A surface waypoint at time 0
 * frames the profile when the first sample is not at the surface.
 * environment.waterDensity is in kg/L for engine compatibility (getPressurePerMeter
 * computes waterDensity * 1000 * g / 1e5 to get pressure increase per meter).
 *
 * @param {Object} dive - RecordedDive
 * @returns {Object} DiveSetup with environment.waterDensity in kg/L
 */
export function toDiveSetup(dive) {
    const label = dive.source?.diveNumber != null ? `#${dive.source.diveNumber}` : 'dive';
    const date = dive.start?.local?.slice(0, 10) ?? 'unknown date';

    const waypoints = [];
    if (dive.samples.length === 0 || dive.samples[0].depth > 0) waypoints.push({ time: 0, depth: 0 });
    const gasSwitches = dive.events.filter(e => e.type === 'gasSwitch');
    let nextSwitch = 0;
    for (const sample of dive.samples) {
        const waypoint = { time: sample.t / 60, depth: sample.depth };
        while (nextSwitch < gasSwitches.length && gasSwitches[nextSwitch].t <= sample.t) {
            waypoint.gasId = gasSwitches[nextSwitch++].gasId;
        }
        waypoints.push(waypoint);
    }

    const environment = {};
    if (Number.isFinite(dive.environment?.surfacePressure)) environment.surfacePressure = dive.environment.surfacePressure;
    // RecordedDive waterDensity is kg/m³ (1028 salt, 1000 fresh); DiveSetup and
    // the engine expect kg/L (1.028, 1.0), so divide by 1000
    if (Number.isFinite(dive.environment?.waterDensity)) environment.waterDensity = dive.environment.waterDensity / 1000;

    return {
        name: `Divesoft ${label} · ${date}`,
        description: `Imported from ${dive.source?.fileName ?? 'a Divesoft dive log'}`,
        gases: dive.gases.map(g => ({ id: g.id, name: gasName(g), o2: g.o2, n2: g.n2, he: g.he })),
        gfLow: dive.deco?.gfLow ?? 100,
        gfHigh: dive.deco?.gfHigh ?? 100,
        surfaceInterval: 0,
        environment,
        dives: [{ waypoints }],
    };
}
