/**
 * Step builders for the SPČR/CMAS 2018 deco-table walkthrough (sandbox/deco-table.html).
 *
 * Pure: every builder takes a context `ctx = { T, GROUPS, ND, NG }` instead of closing over
 * page globals, so the step sequences can be unit-tested with `T = key => key`.
 *   T(key, values)  translated text for `sandbox.decoTable.<key>` with {token} values filled in
 *   GROUPS          repetitive group letters (A–L), NG = their count
 *   ND              number of depth rows
 *
 * A step is `{ part, group, title, text, hl, dive? }`:
 *   part   1 | 2 | 3 — which part of the paper table the step reads
 *   group  index of the dot group in the narrator (plan: one per dive)
 *   hl     highlight spec — keys per kind (path, label, origin, found), `focus` (keys to frame
 *          and scroll to, primary first) and optionally `arrow` (return arrow of a depth column).
 *          Keys: `ld:d` depth label, `lg:g` group label, `lr:n` part 2/3 row label,
 *          `lp3:d` part 3 depth label, `p1:d:g` / `p2:n:e` / `p3:n:d` cells.
 */

export const range = (from, to) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
export const p1Keys = (d, gs) => gs.map(g => `p1:${d}:${g}`);
export const p1ColBelow = (ctx, d, g) => range(d + 1, ctx.ND).map(dd => `p1:${dd}:${g}`);

const formatHM = minutes => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** Part 1 for one dive: depth row → scan to the time → read the group (3 steps). */
export function part1Steps(ctx, dive, r) {
    const { T, GROUPS, NG } = ctx;
    const d = r.depthIdx, g = r.groupIdx, grp = GROUPS[g];
    const rowKeys = p1Keys(d, range(0, NG));
    const v = { depth: r.tableDepth, entered: dive.depth, time: dive.time, penalty: r.penalty,
                total: r.tableTime, cellTime: r.cell.bottomTime, stop: r.cell.stop5m, group: grp };
    const depthText = T(dive.depth !== r.tableDepth ? 'steps.depthRounded' : 'steps.depthRow', v);
    const timeText = T(r.penalty ? 'steps.timePenalty' : 'steps.timePlain', v);
    const stopText = T(r.isDeco ? 'steps.stopDeco' : 'steps.stopNdl', v);
    return [
        {
            part: 1,
            title: T('stepTitle.depth'),
            text: depthText,
            hl: { label: [`ld:${d}`], path: rowKeys, focus: [`ld:${d}`, ...p1Keys(d, range(0, 3))] },
        },
        {
            part: 1,
            title: T('stepTitle.scan'),
            text: T('steps.scan', { ...v, timeText }),
            hl: { label: [`ld:${d}`], path: p1Keys(d, range(0, g)), found: [`p1:${d}:${g}`], focus: [`p1:${d}:${g}`, `ld:${d}`] },
        },
        {
            part: 1,
            title: T('stepTitle.read'),
            text: T('steps.read', { ...v, stopText }),
            hl: { label: [`ld:${d}`, `lg:${g}`], path: p1ColBelow(ctx, d, g), found: [`p1:${d}:${g}`], focus: [`lg:${g}`, `p1:${d}:${g}`] },
        },
    ];
}

/** Parts 2 → 3 → back to 1 for a repetitive dive (4 steps), then part 1 scan + read. */
export function repeatSteps(ctx, prev, dive, r) {
    const { T, GROUPS, ND, NG } = ctx;
    const pg = prev.result.groupIdx, pd = prev.result.depthIdx;
    const n = r.si.groupIdx, d = r.depthIdx;
    const origin = `p1:${pd}:${pg}`;
    const colDown = p1ColBelow(ctx, pd, pg);
    const p2Col = range(0, pg + 1).map(row => `p2:${row}:${pg}`);
    const hasNdl = r.maxNoDecoTime > 0;
    const v = {
        group: GROUPS[pg], newGroup: GROUPS[n], si: formatHM(dive.si),
        from: formatHM(r.si.min), to: r.si.max === 1440 ? '24:00' : formatHM(r.si.max),
        depth: r.tableDepth, entered: dive.depth, time: dive.time, penalty: r.penalty,
        total: r.tableTime, ndl: r.ndl, max: r.maxNoDecoTime,
    };
    return [
        {
            part: 2,
            title: T('stepTitle.down'),
            text: T('steps.down', v),
            hl: { origin: [origin], label: [`lg:${pg}`], path: colDown.concat(p2Col), focus: [`lg:${pg}`, origin] },
        },
        {
            part: 2,
            title: T('stepTitle.findSi'),
            text: T('steps.findSi', v),
            hl: { origin: [`lg:${pg}`], path: range(0, n).map(row => `p2:${row}:${pg}`), found: [`p2:${n}:${pg}`], label: [`lr:${n}`], focus: [`p2:${n}:${pg}`, `lg:${pg}`, `lr:${n}`] },
        },
        {
            part: 3,
            title: T('stepTitle.left'),
            text: T('steps.left', { ...v, group: GROUPS[n], rounded: dive.depth !== r.tableDepth ? T('steps.leftRounded', v) : '' }),
            hl: {
                origin: [`p2:${n}:${pg}`],
                path: range(n, pg).map(e => `p2:${n}:${e}`).concat(range(d + 1, ND).map(dd => `p3:${n}:${dd}`)),
                label: [`lr:${n}`, `lp3:${d}`],
                found: [`p3:${n}:${d}`],
                focus: [`p3:${n}:${d}`, `lr:${n}`, `lp3:${d}`],
            },
        },
        {
            part: 1,
            title: T('stepTitle.back'),
            text: T('steps.back', v) + (hasNdl ? T('steps.backNdl', v) : ''),
            hl: { origin: [`p3:${n}:${d}`], label: [`lp3:${d}`, `ld:${d}`], path: p1Keys(d, range(0, NG)), arrow: d, focus: [`ld:${d}`, `lp3:${d}`, `p3:${n}:${d}`] },
        },
        ...part1Steps(ctx, dive, r).slice(1),
    ];
}

/** The whole plan: one dot group per dive. `dives` = [{ depth, time, si?, result }]. */
export function buildSteps(ctx, dives) {
    return dives.flatMap((dv, i) =>
        (i === 0 ? part1Steps(ctx, dv, dv.result) : repeatSteps(ctx, dives[i - 1], dv, dv.result))
            .map(s => ({ ...s, dive: i, group: i })));
}
