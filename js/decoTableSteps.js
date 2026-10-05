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

// ── Emergencies ("Mimořádné situace") ─────────────────────────────────────
// Each builder returns { phases, steps }: phases are the dot groups (keys of crisis.phase.*),
// a step's `group` indexes them. Table steps keep `part: 1`; procedure steps have `part: null`
// and the narrator shows the phase name instead. Steps with an empty `hl` point at nothing
// in the table (the page then hides the paper inset).
// ctx.num(x) formats a number for the active language (decimal comma in cs/es); default String.

const inPhase = (group, steps) => steps.map(s => ({ ...s, group }));
const fmtNum = (ctx, x) => (ctx.num ?? String)(x);

/** S1 — delay during the ascent: part 1 for the plan, then the same row with time + delay. */
function delaySteps(ctx, { inputs, result: r }) {
    const { T, GROUPS } = ctx;
    const o = r.original, n = r.delayed;
    const d = o.depthIdx, g0 = o.groupIdx, g1 = n.groupIdx;
    const found = `p1:${d}:${g1}`;
    const v = { delay: r.delay, time: inputs.time, total: r.total, cellTime: n.cell.bottomTime,
                group: GROUPS[g1], oldGroup: GROUPS[g0], from: o.cell.stop5m, to: n.cell.stop5m, stop: n.cell.stop5m };
    const same = g0 === g1;
    const stopText = T(n.isDeco ? 'steps.stopDeco' : 'steps.stopNdl', v);
    return {
        phases: ['plan', 'delay'],
        steps: [
            ...inPhase(0, part1Steps(ctx, inputs, o)),
            {
                part: 1, group: 1,
                title: T('crisis.stepTitle.addDelay'),
                text: T('crisis.steps.addDelay', v) + (same ? ' ' + T('crisis.steps.sameCell', v) : ''),
                hl: same
                    ? { label: [`ld:${d}`], found: [found], focus: [found, `ld:${d}`] }
                    : { origin: [`p1:${d}:${g0}`], label: [`ld:${d}`], path: p1Keys(d, range(g0 + 1, g1)),
                        found: [found], focus: [found, `p1:${d}:${g0}`, `ld:${d}`] },
            },
            {
                part: 1, group: 1,
                title: T('crisis.stepTitle.readNew'),
                text: T('crisis.steps.readNew', { ...v, stopText }) + ' ' + T(`crisis.steps.verdict.${r.verdict}`, v),
                hl: { label: [`ld:${d}`, `lg:${g1}`], path: p1ColBelow(ctx, d, g1), found: [found], focus: [`lg:${g1}`, found] },
            },
        ],
    };
}

/** S2 — omitted decompression / too-fast ascent. `result` may be the noDecoStop refusal (it carries the lookup). */
function omittedSteps(ctx, { inputs, result: r }) {
    const { T } = ctx;
    const L = r.lookup, d = L.depthIdx, g = L.groupIdx, cell = `p1:${d}:${g}`;
    const plan = inPhase(0, part1Steps(ctx, inputs, L));
    if (r.code === 'noDecoStop') {
        return {
            phases: ['plan', 'procedure'],
            steps: [...plan, {
                part: null, group: 1,
                title: T('crisis.stepTitle.noDecoStop'),
                text: T('crisis.steps.noDecoStop'),
                hl: { label: ['note:safety'], origin: [cell], focus: ['note:safety', cell] },
            }],
        };
    }
    const v = { stop: r.stop, raw: fmtNum(ctx, r.extendedStop.raw), total: r.extendedStop.total };
    const decide = { 1: 'canReturn', 2: 'cannotReturn', symptoms: 'symptoms' }[r.branch];
    const step = (group, key, text, hl = {}) => ({ part: null, group, title: T(`crisis.stepTitle.${key}`), text, hl });
    const atCell = { origin: [cell], focus: [cell] };
    const steps = [...plan,
        step(1, 'decide', T(`crisis.steps.intro.${inputs.what}`, v) + ' ' + T(`crisis.steps.decide.${decide}`), atCell)];
    if (r.branch === 1) {
        steps.push(
            step(2, 'report', T('crisis.steps.report'), atCell),
            step(2, 'stopLonger', T('crisis.steps.stopLonger', v),
                { label: [`ld:${d}`, `lg:${g}`], found: [cell], focus: [cell, `lg:${g}`] }));
    } else if (r.branch === 2) {
        steps.push(
            step(2, 'oxygen', T('crisis.steps.oxygen')),
            step(2, 'watch', r.symptoms
                ? T('crisis.steps.watch.symptoms') + ' ' + T('crisis.steps.firstAid')
                : T('crisis.steps.watch.noSymptoms')));
    } else {
        steps.push(step(2, 'symptoms', T('crisis.steps.symptomsPath') + ' ' + T('crisis.steps.firstAid')));
    }
    const phase = { 1: 'branch1', 2: 'branch2', symptoms: 'symptoms' }[r.branch];
    return { phases: ['plan', 'procedure', phase], steps };
}

/**
 * S2 result card: the guide's whole decision tree, marked for this case. Pure, so the marking is testable.
 * Branch state: 'chosen' (applies), 'faded' (does not apply — the page adds "(does not apply here)"),
 * 'neutral' (shown normally: on the symptoms path the diver *can* return, so the "cannot return"
 * heading is not chosen, but its oxygen and transport items still apply).
 * Item state: 'chosen', 'faded' (with the note), or 'plain' (inside a faded branch, which carries the note).
 * @param {object} r — omittedDecoProcedure result with ok: true
 */
export function omittedDecisionCard(r) {
    const b = r.branch;
    const b1 = b === 1 ? 'chosen' : 'faded';
    const b2 = b === 2 ? 'chosen' : b === 'symptoms' ? 'neutral' : 'faded';
    const on = x => x ? 'chosen' : 'faded';
    const items = (state, keys) => keys.map(key => ({ key, state }));
    return {
        lead: b === 'symptoms' ? 'crisis.result.symptomsHead' : null,
        branches: [
            { n: 1, head: 'crisis.result.branch1Head', state: b1,
              items: items(b1 === 'chosen' ? 'chosen' : 'plain', ['crisis.steps.report', 'crisis.steps.stopLonger']) },
            { n: 2, head: 'crisis.result.branch2Head', state: b2,
              items: b === 1
                  ? items('plain', ['crisis.steps.oxygen', 'crisis.steps.watch.noSymptoms', 'crisis.steps.watch.symptoms'])
                  : [
                      { key: 'crisis.steps.oxygen', state: 'chosen' },   // oxygen applies on every path with branch 2 or symptoms
                      { key: 'crisis.steps.watch.noSymptoms', state: on(!r.symptoms) },
                      { key: 'crisis.steps.watch.symptoms', state: on(r.symptoms) },
                  ] },
        ],
    };
}

/** S3 — adverse circumstances: the depth row as usual, the footer note, then one row lower. */
function adverseSteps(ctx, { inputs, result: r }) {
    const { T, NG } = ctx;
    const b = r.base, a = r.adverse, d0 = b.depthIdx, d1 = a.depthIdx;
    const factors = (inputs.factors ?? []).map(i => T(`crisis.factor.${i}`));
    const [depthStep] = part1Steps(ctx, inputs, b);
    return {
        phases: ['normal', 'adverse'],
        steps: [
            { ...depthStep, group: 0 },
            {
                part: null, group: 1,
                title: T('crisis.stepTitle.noteAdverse'),
                text: T('crisis.steps.noteAdverse') + ' ' + (factors.length
                    ? T('crisis.steps.factors', { factors: factors.join(', ') })
                    : T('crisis.input.factorsNone')),
                hl: { label: ['note:adverse'], origin: [`ld:${d0}`], focus: ['note:adverse'] },
            },
            {
                part: 1, group: 1,
                title: T('crisis.stepTitle.rowBelow'),
                text: T('crisis.steps.rowBelow', { from: b.tableDepth, to: a.tableDepth }),
                hl: { origin: [`ld:${d0}`], label: [`ld:${d1}`], path: p1Keys(d1, range(0, NG)), focus: [`ld:${d1}`, `ld:${d0}`] },
            },
            ...inPhase(1, part1Steps(ctx, inputs, a).slice(1)),
        ],
    };
}

/** S4 — flying after diving: the footer note on the table. */
function flyingSteps(ctx, { inputs }) {
    const { T } = ctx;
    return {
        phases: ['flying'],
        steps: [{
            part: null, group: 0,
            title: T('crisis.stepTitle.noteFlying'),
            text: T(`crisis.steps.flying.${inputs.repetitive ? 'repeat' : 'single'}`),
            hl: { label: ['note:flying'], focus: ['note:flying'] },
        }],
    };
}

const CRISIS_BUILDERS = { delay: delaySteps, omitted: omittedSteps, adverse: adverseSteps, flying: flyingSteps };
export const CRISIS_SCENARIOS = Object.keys(CRISIS_BUILDERS);

/**
 * Steps for one emergency scenario.
 * @param {object} ctx — as for buildSteps, plus optional num(x)
 * @param {{id: string, inputs: object, result: object}} scenario — result from the matching
 *   cmasTables.js function (adverse: `{ base, adverse }`, two lookupDive results; flying: unused)
 * @returns {{groupLabels: string[], steps: object[]}}
 */
export function crisisSteps(ctx, scenario) {
    const { phases, steps } = CRISIS_BUILDERS[scenario.id](ctx, scenario);
    return { groupLabels: phases.map(p => ctx.T(`crisis.phase.${p}`)), steps };
}
