/**
 * Repetitive-engine validation: DecoJS vs decotengu 0.14.1 (ZH-L16C).
 *
 * Standalone — NOT part of `npm test`.
 *   Run:        node tests/decotengu-repetitive-comparison.test.mjs
 *   Regenerate: python3 scripts/generate_decotengu_repetitive_reference.py > tests/decotengu-repetitive-reference.json
 *
 * Three sections, each a report + gate:
 *   seamA — surface-interval off-gassing: simulateDepthTime(.,0,gap,0.79) vs decotengu model.load.
 *           Tight per-compartment N2 tolerance (0.001 bar). Compartment 1 is EXCLUDED from
 *           pass/fail: DecoJS uses the ZH-L16 "1b" first compartment (5.0 min) while decotengu
 *           uses 4.0 min — a documented model choice, not a bug. Its diff is reported separately.
 *   seamB — deco from a pre-saturated seed: generateDecoProfile(initialTissuePressures) vs
 *           decotengu seeded ascent. Tolerance max(5, 20%) min.
 *   trips — per-dive total deco for a multi-dive trip: planTrip vs decotengu run continuously.
 *           Tolerance max(5, 20%) min. Looser because dive1's ±1-min stop rounding propagates
 *           into later dives' seeds.
 *
 * Air is modelled as o2:0.21/n2:0.79 on our side to match decotengu. Safety stop disabled so
 * totals are apples-to-apples (decotengu has none). Deco calls are guarded: a profile that
 * exceeds DecoJS's 300-min/stop cap (which decotengu does not enforce) is reported as
 * beyond-range rather than crashing the run.
 */

import { readFileSync } from 'fs';
import { COMPARTMENTS, setZHL16Variant, ZHL16_VARIANTS } from '../js/tissueCompartments.js';
import { simulateDepthTime, DecoCapExceededError } from '../js/decoModel.js';
import { generateDecoProfile } from '../js/diveSetup.js';
import { planTrip } from '../js/tripPlanner.js';

setZHL16Variant(ZHL16_VARIANTS.C);

const ref = JSON.parse(readFileSync(new URL('./decotengu-repetitive-reference.json', import.meta.url)));
const AIR = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }];
const N2 = 0.79;
const TOL_OFFGAS = 0.001;                       // bar, per compartment (compartments 2..16)
const decoTol = (refMin) => Math.max(5, refMin * 0.20);

if (COMPARTMENTS.length !== 16) {
    console.error(`Expected 16 compartments, got ${COMPARTMENTS.length}`);
    process.exit(1);
}

const tissueDict = (n2Vec) => {
    const t = {};
    COMPARTMENTS.forEach((c, i) => { t[c.id] = n2Vec[i]; });
    return t;
};

const stats = (diffs) => {
    const abs = diffs.map(Math.abs).sort((a, b) => a - b);
    const mean = abs.reduce((a, b) => a + b, 0) / (abs.length || 1);
    return {
        mean, median: abs[Math.floor(abs.length / 2)] ?? 0,
        p95: abs[Math.floor(abs.length * 0.95)] ?? 0,
        max: abs[abs.length - 1] ?? 0,
        exact: diffs.filter(d => d === 0).length,
    };
};

let anyFail = false;
console.log('='.repeat(70));
console.log('DecoJS vs decotengu — REPETITIVE engine validation (ZH-L16C)');
console.log(`Reference: ${ref.generator}`);
console.log('='.repeat(70));

// ---------------------------------------------------------------------------
// Seam A — surface-interval off-gassing
// ---------------------------------------------------------------------------
{
    let fail = 0;
    let worstMax = 0;          // compartments 2..16 (index 1..15)
    let c1Max = 0;             // compartment 1 (index 0), informational only
    const worst = [];
    for (const sc of ref.seamA_offgas) {
        const out = simulateDepthTime(tissueDict(sc.startTissuesN2), 0, sc.gapMin, N2);
        let scMax = 0;
        COMPARTMENTS.forEach((c, i) => {
            const d = Math.abs(out[c.id] - sc.expectedTissuesN2[i]);
            if (i === 0) { if (d > c1Max) c1Max = d; return; }   // compartment 1: model difference, excluded
            if (d > scMax) scMax = d;
        });
        if (scMax > worstMax) worstMax = scMax;
        if (scMax > TOL_OFFGAS) { fail++; worst.push({ gap: sc.gapMin, max: scMax }); }
    }
    anyFail = anyFail || fail > 0;
    console.log(`\nSeam A (off-gas)  scenarios: ${ref.seamA_offgas.length}`);
    console.log(`  Tolerance: ${TOL_OFFGAS} bar/compartment (compartments 2..16)`);
    console.log(`  Max abs diff (comp 2..16): ${worstMax.toExponential(2)} bar`);
    console.log(`  Compartment 1 (ZH-L16 "1b" 5.0 min vs decotengu 4.0 min) max diff: ${c1Max.toExponential(2)} bar — excluded from pass/fail (documented model choice)`);
    console.log(`  ${fail === 0 ? '✅ all within tolerance' : `❌ ${fail} over tolerance`}`);
    worst.slice(0, 10).forEach(w => console.log(`    gap ${w.gap}min: max ${w.max.toExponential(2)} bar`));
}

// ---------------------------------------------------------------------------
// Seam B — deco from a pre-saturated seed
// ---------------------------------------------------------------------------
{
    let fail = 0;
    let beyond = 0;
    const diffs = [];
    const failures = [];
    for (const sc of ref.seamB_seededDeco) {
        let profile;
        try {
            profile = generateDecoProfile(
                sc.depth, sc.bottomTime, AIR, sc.gfLow, sc.gfHigh,
                { enabled: false },                              // no safety stop (match decotengu)
                { initialTissuePressures: tissueDict(sc.seedTissuesN2) }
            );
        } catch (e) {
            if (!(e instanceof DecoCapExceededError)) throw e;
            beyond++;
            console.log(`    beyond-range: ${sc.depth}m/${sc.bottomTime}min GF${sc.gfLow}/${sc.gfHigh} (decotengu ref=${sc.totalDeco}) — ${e.name}`);
            continue;
        }
        const diff = profile.totalDecoTime - sc.totalDeco;
        diffs.push(diff);
        if (Math.abs(diff) > decoTol(sc.totalDeco)) {
            fail++;
            failures.push({ d: sc.depth, bt: sc.bottomTime, gf: `${sc.gfLow}/${sc.gfHigh}`,
                            ref: sc.totalDeco, ours: profile.totalDecoTime, diff });
        }
    }
    anyFail = anyFail || fail > 0;
    const s = stats(diffs);
    console.log(`\nSeam B (seeded deco)  scenarios: ${ref.seamB_seededDeco.length}${beyond ? ` (${beyond} beyond DecoJS range)` : ''}`);
    console.log(`  Tolerance: max(5, 20%) min`);
    console.log(`  |diff| mean ${s.mean.toFixed(1)}  median ${s.median}  p95 ${s.p95}  max ${s.max}  exact ${s.exact}`);
    console.log(`  ${fail === 0 ? '✅ all within tolerance' : `❌ ${fail} over tolerance`}`);
    failures.slice(0, 10).forEach(f =>
        console.log(`    ${f.d}m/${f.bt}min GF${f.gf}: ref=${f.ref} ours=${f.ours} diff=${f.diff}`));
}

// ---------------------------------------------------------------------------
// Trips — per-dive total deco for a continuous multi-dive profile
// ---------------------------------------------------------------------------
// Note: planTrip off-gasses surface intervals at N2_FRACTION (0.7902) while the decotengu
// reference uses the air gas's 0.79. The resulting per-compartment difference over a surface
// interval is ~2e-4 bar — far inside the max(5, 20%) deco tolerance below, so this section
// stays apples-to-apples for practical purposes.
{
    let fail = 0;
    let beyond = 0;
    const diffs = [];
    const failures = [];
    for (const sc of ref.trips) {
        // Build the dive list incrementally so the surface interval before dive k equals
        // siBeforeMin: place dive k at (planTrip on dives 0..k-1).dives[k-1].endDateTime + si.
        let result;
        try {
            const dives = [];
            for (let k = 0; k < sc.dives.length; k++) {
                const def = sc.dives[k];
                let startDateTime = 0;
                if (k > 0) {
                    const partial = planTrip({ gases: AIR, gfLow: sc.gfLow, gfHigh: sc.gfHigh, dives });
                    startDateTime = partial.dives[k - 1].endDateTime + def.siBeforeMin;
                }
                dives.push({ id: `d${k + 1}`, startDateTime, maxDepth: def.depth, bottomTime: def.bottomTime });
            }
            result = planTrip({ gases: AIR, gfLow: sc.gfLow, gfHigh: sc.gfHigh, dives });
        } catch (e) {
            if (!(e instanceof DecoCapExceededError)) throw e;
            beyond++;
            console.log(`    beyond-range trip: GF${sc.gfLow}/${sc.gfHigh} ${JSON.stringify(sc.dives)} — ${e.name}`);
            continue;
        }
        result.dives.forEach((d, k) => {
            const refDeco = sc.perDiveDeco[k];
            const diff = d.profile.totalDecoTime - refDeco;
            diffs.push(diff);
            if (Math.abs(diff) > decoTol(refDeco)) {
                fail++;
                failures.push({ gf: `${sc.gfLow}/${sc.gfHigh}`, k, dive: sc.dives[k],
                                ref: refDeco, ours: d.profile.totalDecoTime, diff });
            }
        });
    }
    anyFail = anyFail || fail > 0;
    const s = stats(diffs);
    console.log(`\nTrips (end-to-end)  dive comparisons: ${diffs.length}${beyond ? ` (${beyond} trips beyond DecoJS range)` : ''}`);
    console.log(`  Tolerance: max(5, 20%) min`);
    console.log(`  |diff| mean ${s.mean.toFixed(1)}  median ${s.median}  p95 ${s.p95}  max ${s.max}  exact ${s.exact}`);
    console.log(`  ${fail === 0 ? '✅ all within tolerance' : `❌ ${fail} over tolerance`}`);
    failures.slice(0, 10).forEach(f =>
        console.log(`    GF${f.gf} dive${f.k + 1} ${f.dive.depth}m/${f.dive.bottomTime}min ` +
                    `SI${f.dive.siBeforeMin}: ref=${f.ref} ours=${f.ours} diff=${f.diff}`));
}

console.log('\n' + '='.repeat(70));
if (anyFail) {
    console.log('❌ One or more sections had scenarios outside tolerance');
    process.exit(1);
} else {
    console.log('✅ All sections within tolerance');
}
