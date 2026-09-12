"""
Generate EN-standard, freshwater, and seawater comparison data with
DecoTengu 0.14.1 (ZH-L16C).

DecoTengu does not expose water density publicly. This controlled reference
generator overrides the engine's copied depth-conversion fields before gases
are registered and records that private-API dependency in the output metadata.
"""

import json
from importlib.metadata import version

from decotengu import create
from decotengu.model import ZH_L16C_GF


WATER_MODES = {
    "standard": 0.1,
    "fresh": 0.0980665,
    "sea": 0.1005181625,
}

GF_PRESETS = [(100, 100), (60, 90), (40, 80)]
GAS_CONFIGS = {
    "air": [(0, 21)],
    "air+ean50": [(0, 21), (22, 50)],
}
PROFILES = [
    (24, 25),
    (30, 45),
    (40, 40),
    (40, 60),
    (50, 45),
    (50, 60),
]
SURFACE_PRESSURE = 1.01325


def calculate(depth, bottom_time, gf_low, gf_high, gases, pressure_per_meter):
    engine = create()
    engine._meter_to_bar = pressure_per_meter
    engine._p3m = 3 * pressure_per_meter
    engine.model = ZH_L16C_GF()
    engine.model.gf_low = gf_low / 100
    engine.model.gf_high = gf_high / 100
    for switch_depth, oxygen_percent in gases:
        engine.add_gas(switch_depth, oxygen_percent)

    steps = list(engine.calculate(depth, bottom_time))
    stops = []
    for index, step in enumerate(steps):
        if step.phase != "deco_stop" or index == 0:
            continue
        duration = round(step.time - steps[index - 1].time)
        if duration <= 0:
            continue
        stop_depth = round(
            (step.abs_p - SURFACE_PRESSURE) / pressure_per_meter
        )
        stops.append({"depth": stop_depth, "time": duration})

    return {
        "stops": stops,
        "totalDeco": sum(stop["time"] for stop in stops),
    }


def main():
    installed_version = version("decotengu")
    if installed_version != "0.14.1":
        raise RuntimeError(
            f"Expected decotengu 0.14.1, found {installed_version}"
        )

    scenarios = []
    skipped = []
    for water_type, pressure_per_meter in WATER_MODES.items():
        for gf_low, gf_high in GF_PRESETS:
            for gas_name, gases in GAS_CONFIGS.items():
                for depth, bottom_time in PROFILES:
                    try:
                        schedule = calculate(
                            depth,
                            bottom_time,
                            gf_low,
                            gf_high,
                            gases,
                            pressure_per_meter,
                        )
                    except AssertionError as error:
                        skipped.append({
                            "waterType": water_type,
                            "depth": depth,
                            "bottomTime": bottom_time,
                            "gfLow": gf_low,
                            "gfHigh": gf_high,
                            "gasConfig": gas_name,
                            "reason": str(error),
                        })
                        continue
                    scenarios.append({
                        "waterType": water_type,
                        "pressurePerMeter": pressure_per_meter,
                        "depth": depth,
                        "bottomTime": bottom_time,
                        "gfLow": gf_low,
                        "gfHigh": gf_high,
                        "gasConfig": gas_name,
                        **schedule,
                    })

    print(json.dumps({
        "generator": "decotengu 0.14.1",
        "model": "ZH-L16C",
        "surfacePressure": SURFACE_PRESSURE,
        "method": (
            "Controlled private override of Engine._meter_to_bar and "
            "Engine._p3m; DecoTengu has no public water-density API."
        ),
        "waterModes": WATER_MODES,
        "skipped": skipped,
        "scenarios": scenarios,
    }, indent=2))


if __name__ == "__main__":
    main()
