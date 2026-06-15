/**
 * Runtime table for a single executed dive profile.
 *
 * Splits the pure row-derivation (`buildRuntimeRows`) from DOM rendering
 * (`renderRuntimeTable`) so the logic is unit-testable without a browser.
 */

/**
 * Derive ordered runtime rows from an executed dive profile.
 *
 * @param {Object} profile - generateDecoProfile result: { waypoints, decoStops, ... }.
 *                           waypoints: [{ time, depth, gasId? }] with absolute times
 *                           (minutes from dive start); the last waypoint is the surface.
 * @param {Array}  gases   - [{ id, name, ... }]; gases[0] is the starting gas.
 * @returns {Array<{phase:string, depth:number, segmentTime:number, runTime:number, gas:string, isStop:boolean}>}
 */
export function buildRuntimeRows(profile, gases) {
    const waypoints = profile.waypoints;
    const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
    const gasName = (id) => {
        const g = (gases || []).find(x => x.id === id);
        return g ? g.name : (gases && gases[0] ? gases[0].name : 'Gas');
    };

    let currentGasId = (waypoints[0] && waypoints[0].gasId) || (gases && gases[0] && gases[0].id);
    const rows = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
        const wp1 = waypoints[i];
        const wp2 = waypoints[i + 1];

        // A gas switch is marked on the waypoint where it takes effect.
        if (wp1.gasId) currentGasId = wp1.gasId;

        const segmentTime = wp2.time - wp1.time;
        if (segmentTime <= 0) continue; // skip zero-length (e.g. in-transit gas-switch markers)

        let phase;
        let depth;
        if (wp2.depth > wp1.depth) {
            phase = 'descent';
            depth = wp2.depth;
        } else if (wp2.depth < wp1.depth) {
            phase = 'ascent';
            depth = wp2.depth;
        } else {
            phase = wp1.depth === maxDepth ? 'bottom' : 'stop';
            depth = wp1.depth;
        }

        rows.push({
            phase,
            depth,
            segmentTime,
            runTime: wp2.time,
            gas: gasName(currentGasId),
            isStop: phase === 'stop'
        });
    }

    return rows;
}

/**
 * Render rows into a <table> element. DOM-only (verified via browser smoke test).
 * @param {Array} rows - output of buildRuntimeRows
 * @returns {HTMLTableElement}
 */
export function renderRuntimeTable(rows) {
    const table = document.createElement('table');
    table.className = 'runtime-table';
    const fmt = (n) => (Math.round(n * 10) / 10);
    const phaseLabel = { descent: 'Descent', bottom: 'Bottom', ascent: 'Ascent', stop: 'Deco stop' };

    table.innerHTML = `
        <thead>
            <tr><th>Phase</th><th>Depth (m)</th><th>Seg (min)</th><th>Run (min)</th><th>Gas</th></tr>
        </thead>
        <tbody>
            ${rows.map(r => `
                <tr${r.isStop ? ' class="is-stop"' : ''}>
                    <td>${phaseLabel[r.phase] || r.phase}</td>
                    <td>${fmt(r.depth)}</td>
                    <td>${fmt(r.segmentTime)}</td>
                    <td>${fmt(r.runTime)}</td>
                    <td>${r.gas}</td>
                </tr>`).join('')}
        </tbody>`;
    return table;
}
