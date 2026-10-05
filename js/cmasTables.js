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

// Emergencies ("Mimořádné situace", sheet "návod k tabulkám" of the SPČR 2018 XLS)
export const OMITTED_STOP_FACTOR = 1.5;               // stay 1,5× the original stop time
export const OMITTED_RETURN_LIMIT = 5;                // min — back at the stop within 5 min (point 1)
export const SURFACE_O2_MIN = 60;                     // min — pure O₂ at the surface (point 2a)
export const NO_DIVE_AFTER_OMITTED = 12;              // h — no diving after point 2b
export const FLYING_WAIT = { single: 12, repeat: 24 }; // h — after one dive / repetitive or multi-day

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
 * `rowOffset: 1` reads the row one lower than the depth's own row — adverse circumstances,
 * "hledat v tabulce hloubku o jeden řádek nižší" (note under the paper table).
 * @param {object} table
 * @param {{depth: number, time: number, prevGroupIdx?: number|null, surfaceInterval?: number|null, rowOffset?: number}} dive
 * @returns {object} `{ ok: true, ... }` or `{ ok: false, code }` where code is one of
 *   'invalid', 'tooDeep', 'noRowBelow', 'siTooShort', 'siOver24h', 'noPenalty', 'timeOutOfRange'
 */
export function lookupDive(table, { depth, time, prevGroupIdx = null, surfaceInterval = null, rowOffset = 0 }) {
    if (!(depth > 0) || !(time > 0)) return { ok: false, code: 'invalid' };

    const found = findDepth(table, depth);
    if (!found) return { ok: false, code: 'tooDeep', maxDepth: table.depths.at(-1).depth };
    const baseDepthIdx = found.depthIdx, baseTableDepth = found.depthRow.depth;
    const depthIdx = baseDepthIdx + rowOffset;
    if (depthIdx >= table.depths.length) return { ok: false, code: 'noRowBelow', tableDepth: baseTableDepth };
    const depthRow = table.depths[depthIdx];

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
        baseDepthIdx,
        baseTableDepth,
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

/**
 * Delay during the ascent: "tato doba se přičte k době ponoru (čas na dně) a najde se nový
 * dekompresní postup". The whole delay goes to the bottom time, same row; the group comes
 * from the new cell.
 * @returns {object} `{ ok: true, original, delayed, delay, total, verdict }` where verdict is
 *   'sameProcedure' | 'sameStopNewGroup' (same decompression, later cell → new repetitive group) |
 *   'becameDeco' | 'longerStop'; or `{ ok: false, code }` with code
 *   'invalidDelay' (delay < 1 min), 'delayOutOfRange' (time + delay past the row's last cell)
 *   or any lookupDive code for the dive itself.
 */
export function lookupDelayedAscent(table, { depth, time, delay }) {
    const original = lookupDive(table, { depth, time });
    if (!original.ok) return original;
    if (!(delay >= 1)) return { ok: false, code: 'invalidDelay' };
    const total = time + delay;
    const delayed = lookupDive(table, { depth, time: total });
    if (!delayed.ok) return { ok: false, code: 'delayOutOfRange', tableDepth: original.tableDepth, total };
    const verdict = !original.isDeco && delayed.isDeco ? 'becameDeco'
        : delayed.cell.stop5m > original.cell.stop5m ? 'longerStop'
        : delayed.groupIdx !== original.groupIdx ? 'sameStopNewGroup'
        : 'sameProcedure';
    return { ok: true, original, delayed, delay, total, verdict };
}

/**
 * Omitted decompression or too-fast ascent — one procedure in the SPČR guide ("dle doporučení US Navy"):
 *   branch 1  no symptoms, back at the stop within 5 min → report it, stay 1,5× the original stop
 *   branch 2  cannot return within 5 min → ≥ 60 min O₂ at the surface; then 12 h no diving
 *             (no symptoms) or transport with O₂ (symptoms)
 *   'symptoms' symptoms although able to return → point 1 does not apply, the 2c path does
 * Only dives with a mandatory stop are covered; a no-deco cell returns code 'noDecoStop'
 * (with the lookup, so the page can still walk the table).
 * The extended stop is 1,5× the full original time, rounded up to whole minutes like the table.
 */
export function omittedDecoProcedure(table, { depth, time, canReturn, symptoms }) {
    const lookup = lookupDive(table, { depth, time });
    if (!lookup.ok) return lookup;
    const stop = lookup.cell.stop5m;
    if (stop === 0) return { ok: false, code: 'noDecoStop', lookup };
    const raw = stop * OMITTED_STOP_FACTOR;
    const branch = symptoms ? (canReturn ? 'symptoms' : 2) : (canReturn ? 1 : 2);
    return {
        ok: true,
        lookup,
        stop,
        extendedStop: { raw, total: Math.ceil(raw) },
        branch,
        symptoms: Boolean(symptoms),
        noDiveHours: branch === 2 && !symptoms ? NO_DIVE_AFTER_OMITTED : null,
    };
}

/** Flying in a pressurised cabin: hours to wait after one dive, or after repetitive / multi-day diving. */
export function flyingWaitHours({ repetitive }) {
    return repetitive ? FLYING_WAIT.repeat : FLYING_WAIT.single;
}

/** Minutes → "h:mm" (e.g. 200 → "3:20"). */
export function formatHM(minutes) {
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
