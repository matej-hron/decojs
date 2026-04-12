"""
Generate reference deco schedules from decotengu (ZH-L16C) for comparison testing.

Dimensions:
- Depth: 15m to 60m, step 3m
- Bottom time: NDL+3 to NDL+30, step 3m (skip if within NDL)
- Gases: air, air+EAN50, air+O2, air+EAN50+O2
- GF presets: Bühlmann, Recreational, Intensive, Deep, Bailout, Deco Planner, Freedom
"""

import json
import sys
from decotengu import create
from decotengu.model import ZH_L16C_GF

GF_PRESETS = [
    {"name": "Buhlmann",     "low": 100, "high": 100},
    {"name": "Recreational", "low": 60,  "high": 90},
    {"name": "Intensive",    "low": 40,  "high": 80},
    {"name": "Deep",         "low": 50,  "high": 90},
    {"name": "Bailout",      "low": 80,  "high": 100},
    {"name": "DecoPlanner",  "low": 20,  "high": 80},
    {"name": "Freedom",      "low": 30,  "high": 80},
]

GAS_CONFIGS = [
    {"name": "air",             "gases": [(0, 21)]},
    {"name": "air+ean50",       "gases": [(0, 21), (22, 50)]},
    {"name": "air+o2",          "gases": [(0, 21), (6, 100)]},
    {"name": "air+ean50+o2",    "gases": [(0, 21), (22, 50), (6, 100)]},
]

DEPTHS = list(range(15, 63, 3))  # 15, 18, ..., 60
TIME_OFFSETS = list(range(3, 31, 3))  # 3, 6, 9, ..., 30 min past NDL


def find_ndl(depth, gf_low, gf_high, gas_config):
    """Binary search for NDL: max bottom time with 0 deco stops."""
    lo, hi = 1, 200
    ndl = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        engine = create()
        engine.model = ZH_L16C_GF()
        engine.model.gf_low = gf_low / 100.0
        engine.model.gf_high = gf_high / 100.0
        for switch_depth, o2_pct in gas_config:
            engine.add_gas(switch_depth, o2_pct)
        try:
            steps = list(engine.calculate(depth, mid))
            has_deco = any(s.phase == 'deco_stop' for s in steps)
        except Exception:
            hi = mid - 1
            continue
        if has_deco:
            hi = mid - 1
        else:
            ndl = mid
            lo = mid + 1
    return ndl


def get_deco_schedule(depth, bottom_time, gf_low, gf_high, gas_config):
    """Run decotengu and extract stop depths/times."""
    engine = create()
    engine.model = ZH_L16C_GF()
    engine.model.gf_low = gf_low / 100.0
    engine.model.gf_high = gf_high / 100.0
    for switch_depth, o2_pct in gas_config:
        engine.add_gas(switch_depth, o2_pct)

    try:
        steps = list(engine.calculate(depth, bottom_time))
    except Exception as e:
        return None

    # Extract deco stops
    stops = []
    for i, s in enumerate(steps):
        if s.phase == 'deco_stop':
            depth_m = round((s.abs_p - 1.01325) / 0.1)
            # Duration = time from previous step (arrival) to this step (end of stop)
            if i > 0:
                duration = round(s.time - steps[i - 1].time)
            else:
                duration = 0
            if duration > 0:
                stops.append({"depth": depth_m, "time": duration})

    total_deco = sum(s["time"] for s in stops)
    return {"stops": stops, "totalDeco": total_deco}


def main():
    results = []
    total_combos = 0
    deco_combos = 0

    for gf in GF_PRESETS:
        for gas_cfg in GAS_CONFIGS:
            # Find NDL for this depth/gf/gas combo at each depth
            for depth in DEPTHS:
                ndl = find_ndl(depth, gf["low"], gf["high"], gas_cfg["gases"])

                for offset in TIME_OFFSETS:
                    bt = ndl + offset
                    if bt < 3 or bt > 180:
                        continue

                    total_combos += 1
                    schedule = get_deco_schedule(
                        depth, bt, gf["low"], gf["high"], gas_cfg["gases"]
                    )

                    if schedule is None:
                        continue

                    if schedule["totalDeco"] == 0:
                        continue  # Skip NDL dives

                    deco_combos += 1
                    results.append({
                        "depth": depth,
                        "bottomTime": bt,
                        "gfLow": gf["low"],
                        "gfHigh": gf["high"],
                        "gfName": gf["name"],
                        "gasConfig": gas_cfg["name"],
                        "gases": gas_cfg["gases"],
                        "stops": schedule["stops"],
                        "totalDeco": schedule["totalDeco"],
                    })

                    sys.stderr.write(
                        f"\r  {deco_combos} deco scenarios found "
                        f"({total_combos} checked)... "
                        f"{depth}m/{bt}min {gas_cfg['name']} GF{gf['low']}/{gf['high']}"
                        + " " * 20
                    )

    sys.stderr.write(f"\n\nDone: {deco_combos} deco scenarios from {total_combos} combinations\n")

    output = {
        "generator": "decotengu 0.14.1",
        "model": "ZH-L16C",
        "surfacePressure": 1.01325,
        "note": "Reference data for comparison testing. Stops in minutes, depths in meters.",
        "scenarios": results,
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
