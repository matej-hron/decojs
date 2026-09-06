"""
Generate altitude-dive reference schedules with decotengu 0.14.1.

The output is consumed by the JavaScript test suite; decotengu is not required
when running npm test.
"""

import json
import math
import sys

from decotengu import create
from decotengu.model import ZH_L16C_GF


SEA_LEVEL_PRESSURE = 1.01325
SURFACE_PRESSURES = [
    {"altitude": 500, "pressure": 0.95461},
    {"altitude": 1000, "pressure": 0.89875},
    {"altitude": 1500, "pressure": 0.84556},
    {"altitude": 2500, "pressure": 0.74682},
]

GF_PRESETS = [
    (100, 100),
    (60, 90),
    (40, 80),
    (50, 90),
    (80, 100),
    (20, 80),
    (30, 80),
]

GAS_CONFIGS = {
    "air": [21],
    "air+ean50": [21, 50],
    "air+o2": [21, 100],
    "air+ean50+o2": [21, 50, 100],
}

DEPTHS = list(range(15, 63, 3))
TIME_OFFSETS = list(range(3, 31, 3))


def gases_for_pressure(o2_percentages, surface_pressure):
    gases = [(0, o2_percentages[0])]
    mod_surface_pressure = 1 + (surface_pressure - SEA_LEVEL_PRESSURE)
    for o2_percent in o2_percentages[1:]:
        fraction = o2_percent / 100
        mod = (1.6 / fraction - mod_surface_pressure) / 0.1
        switch_depth = max(0, math.floor(mod / 3) * 3)
        gases.append((switch_depth, o2_percent))
    return gases


def engine_for(surface_pressure, gf_low, gf_high, gases):
    engine = create()
    engine.model = ZH_L16C_GF()
    engine.model.gf_low = gf_low / 100
    engine.model.gf_high = gf_high / 100
    engine.surface_pressure = surface_pressure
    for switch_depth, o2_percent in gases:
        engine.add_gas(switch_depth, o2_percent)
    return engine


def find_ndl(depth, surface_pressure, gf_low, gf_high, gases):
    lo, hi = 1, 200
    ndl = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        engine = engine_for(surface_pressure, gf_low, gf_high, gases)
        try:
            steps = list(engine.calculate(depth, mid))
            has_deco = any(step.phase == "deco_stop" for step in steps)
        except Exception:
            hi = mid - 1
            continue
        if has_deco:
            hi = mid - 1
        else:
            ndl = mid
            lo = mid + 1
    return ndl


def get_schedule(depth, bottom_time, surface_pressure, gf_low, gf_high, gases):
    engine = engine_for(surface_pressure, gf_low, gf_high, gases)
    try:
        steps = list(engine.calculate(depth, bottom_time))
    except Exception:
        return None

    stops = []
    for index, step in enumerate(steps):
        if step.phase != "deco_stop" or index == 0:
            continue
        duration = round(step.time - steps[index - 1].time)
        if duration > 0:
            stop_depth = round((step.abs_p - surface_pressure) / 0.1)
            stops.append([stop_depth, duration])

    return {"stops": stops, "totalDeco": sum(stop[1] for stop in stops)}


def main():
    environments = []
    total = 0

    for environment in SURFACE_PRESSURES:
        pressure = environment["pressure"]
        scenarios = []
        for gf_low, gf_high in GF_PRESETS:
            for gas_name, o2_percentages in GAS_CONFIGS.items():
                gases = gases_for_pressure(o2_percentages, pressure)
                for depth in DEPTHS:
                    ndl = find_ndl(depth, pressure, gf_low, gf_high, gases)
                    for offset in TIME_OFFSETS:
                        bottom_time = ndl + offset
                        if bottom_time < 3 or bottom_time > 180:
                            continue
                        schedule = get_schedule(
                            depth, bottom_time, pressure, gf_low, gf_high, gases
                        )
                        if schedule is None or schedule["totalDeco"] == 0:
                            continue
                        scenarios.append([
                            depth,
                            bottom_time,
                            gf_low,
                            gf_high,
                            gas_name,
                            schedule["totalDeco"],
                            schedule["stops"],
                        ])
        total += len(scenarios)
        environments.append({**environment, "scenarios": scenarios})
        sys.stderr.write(
            f"{environment['altitude']} m: {len(scenarios)} scenarios\n"
        )

    output = {
        "generator": "decotengu 0.14.1",
        "model": "ZH-L16C",
        "format": ["depth", "bottomTime", "gfLow", "gfHigh", "gasConfig", "totalDeco", "stops"],
        "environments": environments,
    }
    sys.stderr.write(f"Total: {total} scenarios\n")
    print(json.dumps(output, separators=(",", ":")))


if __name__ == "__main__":
    main()
