import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buoyancyKg, buoyantForce, floatState, submergedFraction, apparentMass,
    weightsForSuit, airMass, suitVolume, bcVolume, bcAmount, diverState, netBuoyancy, balancedAmount,
    buildScenario, A1_DIVER, A1_ROUTE, SLIDE_33_SUIT, RUBBER_DENSITY,
} from '../js/physics/buoyancy.js';

const close = (actual, expected, tol, msg) =>
    assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);
const round1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- slidy 31–32: Archimédův zákon

test('slide 31: vztlak = hmotnost vytlačené vody (1 l → 1 kg, mořská voda 1,03 kg/l)', () => {
    assert.equal(buoyancyKg(12), 12);
    close(buoyancyKg(10, 1.03), 10.3, 1e-12);
    assert.throws(() => buoyancyKg(-1), RangeError);
});

test('slide 31: plave, vznáší se, klesá podle hustoty', () => {
    assert.equal(floatState(0.33, 1), 'plave');
    assert.equal(floatState(1, 1), 'vznáší se');
    assert.equal(floatState(11.34, 1), 'klesá');
});

test('test SPČR č. 49: 250 kg / 245 l v moři 1 030 kg/m³ plave téměř celé ponořené', () => {
    const density = 250 / 245; // kg/l
    close(density * 1000, 1020, 1, 'hustota tělesa:');
    assert.equal(floatState(density, 1.03), 'plave');
    assert.ok(submergedFraction(density, 1.03) > 0.98);
});

test('slide 32 a test SPČR č. 46: litina 10 l je nadlehčována 100 N v jakékoli hloubce', () => {
    assert.equal(buoyantForce(10), 100);
});

test('test SPČR č. 47: ocelová kostka 160 kg má pod vodou 140 kg, vak z lahve 10 l / 180 bar v 10 m zvedne 6', () => {
    assert.equal(apparentMass(160, 8), 140);
    const lift = buoyancyKg(bcVolume(10, 10 * 180)); // 1 800 bar · l ve 2 bar = 900 l
    assert.equal(lift, 900);
    assert.equal(Math.floor(lift / apparentMass(160, 8)), 6);
});

// ---------------------------------------------------------------- slidy 33 a 37: zátěž a vzduch v lahvi

test('slide 33: oblek 4 kg / 12 l potřebuje 8 kg zátěže; test SPČR č. 34: 2 kg / 10 l → 8 kg', () => {
    assert.equal(weightsForSuit(SLIDE_33_SUIT), 8);
    assert.equal(weightsForSuit({ mass: 2, volume: 10 }), 8);
    assert.equal(A1_DIVER.weights, 8);
});

test('slide 37: vzduch v plné 12l lahvi na 200 bar váží 3 kg, z 200 na 50 bar se vydýchá 2,25 kg', () => {
    close(airMass(12, 200), 3, 1e-12);
    close(airMass(12, 200) - airMass(12, 50), 2.25, 1e-12);
});

test('test SPČR č. 45: 20 l na 200 bar, po vydýchání 3/4 lehčí asi o 3,7 kg', () => {
    close(airMass(20, 200) * 0.75, 3.75, 1e-12);
});

// ---------------------------------------------------------------- slide 36: oblek a BCD v hloubce

test('oblek „pryž + bublinky“: 12 l → 7,6 l v 10 m → 6,2 l ve 20 m (rozhodnutí 3)', () => {
    assert.equal(RUBBER_DENSITY, 1.23);
    close(suitVolume(0), 12, 1e-12);
    assert.equal(round1(suitVolume(10)), 7.6);
    assert.equal(round1(suitVolume(20)), 6.2);
    assert.equal(round1(suitVolume(30)), 5.4);
    // pryž se nestlačuje: objem nikdy neklesne pod 4 / 1,23 = 3,25 l
    assert.ok(suitVolume(1000) > 4 / 1.23);
});

test('test SPČR č. 37: BCD se 6 l z hladiny do 20 m má 2 l, chybí 4 kg', () => {
    const amount = bcAmount(0, 6);
    assert.equal(bcVolume(20, amount), 2);
    assert.equal(buoyancyKg(6) - buoyancyKg(bcVolume(20, amount)), 4);
});

test('A1: na hladině s vypuštěným BCD je potápěč vyvážený (rozhodnutí 5)', () => {
    close(netBuoyancy(0, 0), 0, 1e-12);
    assert.equal(balancedAmount(0), 0);
});

test('A1: bez přifouknutí v 10 m chybí 4,4 kg, ve 20 m 5,8 kg', () => {
    assert.equal(round1(netBuoyancy(10, 0)), -4.4);
    assert.equal(round1(netBuoyancy(20, 0)), -5.8);
});

test('A1: vztlak navíc při stálém vzduchu v BCD s hloubkou klesá a u hladiny nejrychleji', () => {
    const amount = balancedAmount(10);
    let prev = Infinity;
    for (let d = 0; d <= 30; d += 5) {
        const net = netBuoyancy(d, amount);
        assert.ok(net < prev, `v ${d} m`);
        prev = net;
    }
    const top = netBuoyancy(0, amount) - netBuoyancy(5, amount);
    const deep = netBuoyancy(25, amount) - netBuoyancy(30, amount);
    assert.ok(top > 3 * deep);
});

// ---------------------------------------------------------------- scénář A1 (analýza §3, rozhodnutí 1 a 4)

test('A1 scénář: 10 kroků z pravidel „přesun“ a „vyvážit“, jako tabulka v analýze', () => {
    const steps = buildScenario();
    const rows = steps.map((s) => {
        const st = diverState(s.depth, s.amount);
        return [s.kind, s.depth, round1(st.suit), round1(st.bc), round1(st.net)];
    });
    assert.deepEqual(rows, [
        ['start', 0, 12, 0, 0],
        ['move', 10, 7.6, 0, -4.4],
        ['balance', 10, 7.6, 4.4, 0],
        ['move', 20, 6.2, 2.9, -2.9],
        ['balance', 20, 6.2, 5.8, 0],
        ['move', 10, 7.6, 8.7, 4.4],
        ['balance', 10, 7.6, 4.4, 0],
        ['move', 5, 9.1, 5.8, 2.9],
        ['balance', 5, 9.1, 2.9, 0],
        ['move', 0, 12, 4.4, 4.4],
    ]);
    assert.deepEqual(steps.map((s) => s.bcChange), [null, null, 'inflate', null, 'inflate', null, 'deflate', null, 'deflate', null]);
});

test('A1 scénář: každý krok je jedna změna (hloubka, nebo vzduch v BCD) a po vyvážení je vztlak navíc 0', () => {
    const steps = buildScenario();
    for (let i = 1; i < steps.length; i++) {
        const a = steps[i - 1];
        const b = steps[i];
        const depthChanged = a.depth !== b.depth;
        const airChanged = a.amount !== b.amount;
        assert.ok(depthChanged !== airChanged, `krok ${i + 1}`);
        assert.equal(b.kind, depthChanged ? 'move' : 'balance');
        if (b.kind === 'balance') close(netBuoyancy(b.depth, b.amount), 0, 1e-9, `krok ${i + 1}`);
    }
});

test('A1 scénář: výstup 20 → 10 m přidá víc vztlaku (4,4 kg), než sestup 10 → 20 m ubral (2,9 kg)', () => {
    const steps = buildScenario();
    assert.ok(diverState(steps[5].depth, steps[5].amount).net > -diverState(steps[3].depth, steps[3].amount).net);
});

test('buildScenario: jiná cesta, na hladině se nevyvažuje, prázdná cesta je chyba', () => {
    const steps = buildScenario([0, 10, 0]);
    assert.deepEqual(steps.map((s) => s.kind), ['start', 'move', 'balance', 'move']);
    assert.throws(() => buildScenario([]), RangeError);
    assert.deepEqual(A1_ROUTE, [0, 10, 20, 10, 5, 0]);
});
