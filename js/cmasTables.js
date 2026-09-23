/**
 * SPČR/CMAS 2018 air decompression tables — pure lookup logic.
 *
 * The paper table is read clockwise in three parts (data: data/cmas-deco-tables.json):
 *   1. Dive table (top right): depth row → first time ≥ bottom time → repetitive group (column).
 *   2. Surface interval (bottom right): down the group's column → cell containing the
 *      surface interval → new repetitive group (row).
 *   3. Residual nitrogen (bottom left): left along that row → column of the next dive's
 *      depth → time penalty "+XYZ" added to the next dive's real bottom time.
 * Then back to part 1 with (next depth, real time + penalty).
 */

export const MIN_SURFACE_INTERVAL = 10;       // min — shorter intervals are one dive
export const MAX_SURFACE_INTERVAL = 24 * 60;  // min — after 24 h the dive is not repetitive

/**
 * Round a depth up to the nearest table row. Depths shallower than the first row
 * use the first row (12 m), as the table instructs ("zaokrouhluje se vždy na nejbližší větší hloubku").
 * @returns {{depthIdx: number, depthRow: object} | null} null when deeper than the table
 */
export function findDepth(table, depth) {
    const depthIdx = table.depths.findIndex(d => d.depth >= depth);
    return depthIdx === -1 ? null : { depthIdx, depthRow: table.depths[depthIdx] };
}

/** First cell in the row whose bottom time is ≥ time, or null. */
export function findCell(depthRow, time) {
    for (let i = 0; i < depthRow.cells.length; i++) {
        const c = depthRow.cells[i];
        if (c !== null && c.bottomTime >= time) return { cell: c, groupIdx: i };
    }
    return null;
}

/** Index of the last no-deco cell in a row (the circled NDL limit). */
export function ndlLimitIdx(depthRow) {
    let idx = -1;
    depthRow.cells.forEach((c, i) => { if (c !== null && c.stop5m === 0) idx = i; });
    return idx;
}

/**
 * Part 2: new repetitive group after a surface interval.
 * @returns {{groupIdx: number, min: number, max: number} | null} null when outside 10 min – 24 h
 */
export function surfaceIntervalGroup(table, exitGroupIdx, minutes) {
    const column = table.surfaceInterval[table.groups[exitGroupIdx]];
    for (const [group, [min, max]] of Object.entries(column)) {
        if (group.startsWith('_')) continue;
        if (minutes >= min && minutes <= max) {
            return { groupIdx: table.groups.indexOf(group), min, max };
        }
    }
    return null;
}

/** Part 3: time penalty (min) for a repetitive group at a table depth index, or null if not listed. */
export function residualPenalty(table, groupIdx, depthIdx) {
    return table.residualNitrogen[table.groups[groupIdx]][depthIdx] ?? null;
}

/**
 * Look up one dive. For a repetitive dive pass the previous dive's exit group and the surface interval.
 * @param {object} table
 * @param {{depth: number, time: number, prevGroupIdx?: number|null, surfaceInterval?: number|null}} dive
 * @returns {object} `{ ok: true, ... }` or `{ ok: false, code }` where code is one of
 *   'invalid', 'tooDeep', 'siTooShort', 'siOver24h', 'noPenalty', 'timeOutOfRange'
 */
export function lookupDive(table, { depth, time, prevGroupIdx = null, surfaceInterval = null }) {
    if (!(depth > 0) || !(time > 0)) return { ok: false, code: 'invalid' };

    const found = findDepth(table, depth);
    if (!found) return { ok: false, code: 'tooDeep', maxDepth: table.depths.at(-1).depth };
    const { depthIdx, depthRow } = found;

    let si = null;
    let penalty = 0;
    if (prevGroupIdx !== null) {
        if (!(surfaceInterval >= 0)) return { ok: false, code: 'invalid' };
        if (surfaceInterval < MIN_SURFACE_INTERVAL) return { ok: false, code: 'siTooShort' };
        if (surfaceInterval > MAX_SURFACE_INTERVAL) return { ok: false, code: 'siOver24h' };
        si = surfaceIntervalGroup(table, prevGroupIdx, surfaceInterval);
        penalty = residualPenalty(table, si.groupIdx, depthIdx);
        if (penalty === null) {
            return { ok: false, code: 'noPenalty', groupIdx: si.groupIdx, tableDepth: depthRow.depth };
        }
    }

    const tableTime = time + penalty;
    const hit = findCell(depthRow, tableTime);
    if (!hit) return { ok: false, code: 'timeOutOfRange', tableDepth: depthRow.depth, tableTime };

    const limitIdx = ndlLimitIdx(depthRow);
    const ndl = limitIdx >= 0 ? depthRow.cells[limitIdx].bottomTime : 0;
    return {
        ok: true,
        depthIdx,
        tableDepth: depthRow.depth,
        si,
        penalty,
        tableTime,
        groupIdx: hit.groupIdx,
        cell: hit.cell,
        isDeco: hit.cell.stop5m > 0,
        ndl,
        maxNoDecoTime: ndl - penalty,   // longest real bottom time that stays no-deco
    };
}

/** Minutes → "h:mm" (e.g. 200 → "3:20"). */
export function formatHM(minutes) {
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
