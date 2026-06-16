"""
Generate reference data from decotengu 0.14.1 (ZH-L16C) to validate the DecoJS
repetitive-dive engine: surface-interval off-gassing, deco from a pre-saturated
state, and full multi-dive chaining.

Sections:
  seamA_offgas     - tissue N2 pressures after a surface interval (model.load at depth 0)
  seamB_seededDeco - total deco from a pre-saturated surface tissue state
  trips            - per-dive total deco for a continuous multi-dive profile

decotengu's high-level Engine.calculate() always resets to surface saturation, so the
seeded/continuous paths drive the low-level stepping (_step_start/_step_next_descent/
_step_next/_dive_ascent), which carry an arbitrary starting tissue state.

Regenerate:
  python3 scripts/generate_decotengu_repetitive_reference.py > tests/decotengu-repetitive-reference.json
"""

import json
from decotengu import create
from decotengu.model import ZH_L16C_GF, Data

AIR = [(0, 21)]            # (gas switch depth, O2 %)
DEPTHS = [30, 40, 50]
SIS = [30, 60, 120, 240]   # surface intervals (min)
GFS = [(100, 100), (40, 85)]
BT = {30: 25, 40: 18, 50: 14}   # realistic recreational/light-tech bottom times (min), keeps deco in-range


def make_engine(gf_low, gf_high, gases=AIR):
    e = create()
    e.model = ZH_L16C_GF()
    e.model.gf_low = gf_low / 100.0
    e.model.gf_high = gf_high / 100.0
    for d, o2 in gases:
        e.add_gas(d, o2)
    return e


def surface_seed(e):
    """Surface-saturated tissue tuple (((n2, he), ...))."""
    return e.model.init(e.surface_pressure).tissues


def offgas(e, tissues, minutes):
    """Load a surface segment (depth 0) for `minutes` on bottom gas; return new tissue tuple."""
    gas = e._gas_list[0]
    data = Data(tuple(tissues), e.model.gf_low)
    return e.model.load(e._to_pressure(0), minutes, gas, 0, data).tissues


def deco_from_seed(e, seed_tissues, depth, bottom_time):
    """Descend from a surface seed, hold bottom time, run the deco ascent.

    `bottom_time` is measured from the start of the dive and includes descent
    (matching DecoJS bottomTime semantics). Returns (total_deco, stops, surfacing_tissues).
    """
    gas = e._gas_list[0]
    start = e._step_start(e._to_pressure(0), gas)
    start = start._replace(data=start.data._replace(tissues=tuple(seed_tissues)))
    descent_time = depth / e.descent_rate          # descent_rate = 20 m/min
    bottom = e._step_next_descent(start, descent_time, gas)
    bottom = e._step_next(bottom, bottom_time - descent_time, gas)
    deco_gas_list = sorted(e._gas_list[1:], key=lambda g: g.depth, reverse=True)
    deco_gas_list.insert(0, gas)
    del e.deco_table[:]
    ascent = list(e._dive_ascent(bottom, deco_gas_list))
    stops = [{"depth": s.depth, "time": s.time} for s in e.deco_table]
    surfacing = ascent[-1].data.tissues
    return e.deco_table.total, stops, surfacing


def n2(tissues):
    """Per-compartment N2 partial pressures (he implied 0 for air)."""
    return [t[0] for t in tissues]


def self_check():
    """Seeded-from-surface deco MUST equal Engine.calculate at multiple GFs
    (guards against decotengu API drift in the low-level stepping)."""
    for gf_low, gf_high in ((100, 100), (40, 85)):
        e = make_engine(gf_low, gf_high)
        total, _, _ = deco_from_seed(e, surface_seed(e), 40, 30)
        e2 = make_engine(gf_low, gf_high)
        list(e2.calculate(40, 30))
        assert abs(total - e2.deco_table.total) < 1e-9, (gf_low, gf_high, total, e2.deco_table.total)


def gen_seamA():
    rows = []
    for depth in DEPTHS:
        for bt in (BT[depth], BT[depth] + 5):     # two realistic dive lengths -> realistic loaded states
            e = make_engine(100, 100)
            _, _, loaded = deco_from_seed(e, surface_seed(e), depth, bt)
            for gap in SIS:
                rows.append({
                    "startTissuesN2": n2(loaded),
                    "gapMin": gap,
                    "expectedTissuesN2": n2(offgas(e, loaded, gap)),
                })
    return rows


def gen_seamB():
    rows = []
    for gl, gh in GFS:
        for depth in DEPTHS:
            e = make_engine(gl, gh)
            bt = BT[depth]
            _, _, surf1 = deco_from_seed(e, surface_seed(e), depth, bt)
            seed = offgas(e, surf1, 60)
            total, stops, _ = deco_from_seed(e, seed, depth, bt)
            if total <= 0:
                continue
            rows.append({
                "seedTissuesN2": n2(seed),
                "depth": depth, "bottomTime": bt,
                "gfLow": gl, "gfHigh": gh,
                "totalDeco": total, "stops": stops,
            })
    return rows


def gen_trips():
    trip_defs = []
    # 2-dive trips across depth x SI x GF (same depth repeated; dive 2 is pre-saturated)
    for gl, gh in GFS:
        for depth in DEPTHS:
            for si in SIS:
                trip_defs.append((gl, gh, [(depth, BT[depth], None), (depth, BT[depth], si)]))
    # a few 3-dive trips (realistic tapering-depth day)
    for gl, gh in GFS:
        trip_defs.append((gl, gh, [(40, 18, None), (30, 22, 60), (25, 30, 90)]))

    rows = []
    for gl, gh, dives in trip_defs:
        e = make_engine(gl, gh)
        seed = surface_seed(e)
        per_dive = []
        for depth, bt, si in dives:
            if si is not None:
                seed = offgas(e, seed, si)
            total, _, surf = deco_from_seed(e, seed, depth, bt)
            per_dive.append(total)
            seed = surf
        rows.append({
            "gfLow": gl, "gfHigh": gh,
            "dives": [{"depth": d, "bottomTime": b, "siBeforeMin": s} for d, b, s in dives],
            "perDiveDeco": per_dive,
        })
    return rows


def main():
    self_check()
    output = {
        "generator": "decotengu 0.14.1",
        "model": "ZH-L16C",
        "surfacePressure": 1.01325,
        "n2Fraction": 0.79,
        "note": "Reference for DecoJS repetitive-engine validation. "
                "N2 partial pressures in bar; deco times in minutes. "
                "bottomTime includes descent (from dive start). "
                "Bottom times are realistic recreational/light-tech values that keep every "
                "scenario inside the engine's usable deco range.",
        "seamA_offgas": gen_seamA(),
        "seamB_seededDeco": gen_seamB(),
        "trips": gen_trips(),
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
