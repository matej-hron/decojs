/**
 * Decompression Model — NDL and decompression schedule generation.
 *
 * Extracted verbatim from js/decoModel.js; js/decoModel.js re-exports the
 * public surface so existing importers are unaffected.
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import { ASCENT_SPEED, DESCENT_SPEED, N2_FRACTION, PRESSURE_PER_METER, STOP_INCREMENT, SURFACE_PRESSURE } from './constants.js';
import { DECISION_AUDIT_VERSION, DECO_MODES, DECO_STOP_MAX_MINUTES, DecoCapExceededError, getDecoMode } from './config.js';
import { getAmbientPressure } from './environment.js';
import { getAlveolarN2Pressure, getInitialTissueN2, haldaneEquation, schreinerEquation, simulateDepthChange, simulateDepthTime } from './gasKinetics.js';
import { getDiveCeiling, interpolateGF } from './gradients.js';
import { evaluateDirectAscent, findFirstStagedStopAtGFLow, findFirstStopAtGFLow } from './ceiling.js';

export function calculateNDL(
    depth, n2Fraction = N2_FRACTION, gfHigh = 1.0,
    initialTissuePressures = null, surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    // Very shallow depths have effectively unlimited NDL
    if (depth <= 0) {
        return {
            ndl: Infinity, ndlExact: Infinity,
            ndlAtDepth: Infinity, ndlAtDepthExact: Infinity,
            controllingCompartment: null, descentTime: 0
        };
    }
    
    const ambientPressure = getAmbientPressure(
        depth, surfacePressure, pressurePerMeter
    );
    const alveolarN2 = getAlveolarN2Pressure(ambientPressure, n2Fraction);
    
    // Initialize tissue pressures at surface saturation
    const initialN2 = getInitialTissueN2(n2Fraction, surfacePressure);
    
    // Exact descent time at ASCENT_SPEED=20 m/min (matches decotengu/divetools)
    const descentTime = depth / DESCENT_SPEED;
    const surfaceAlveolarN2 = getAlveolarN2Pressure(surfacePressure, n2Fraction);
    const descentRate = (alveolarN2 - surfaceAlveolarN2) / descentTime;
    
    // Get tissue pressures after descent
    const afterDescent = {};
    COMPARTMENTS.forEach(comp => {
        const startN2 = initialTissuePressures ? initialTissuePressures[comp.id] : initialN2;
        afterDescent[comp.id] = schreinerEquation(
            startN2,
            surfaceAlveolarN2,
            descentRate,
            descentTime,
            comp.halfTime
        );
    });
    
    // Binary search for NDL
    let minTime = 0;
    let maxTime = 300; // 5 hours max
    
    // First check whether the descent alone already prevents a direct ascent.
    const { ceilingDepth: immediateceiling, controllingCompartment } =
        evaluateDirectAscent(
            afterDescent, depth, n2Fraction, gfHigh, surfacePressure,
            pressurePerMeter
        );
    if (immediateceiling > 0) {
        return {
            ndl: 0, ndlExact: 0,
            ndlAtDepth: 0, ndlAtDepthExact: 0,
            controllingCompartment,
            descentTime
        };
    }
    
    // Check if 5 hours is still within NDL (very shallow)
    const pressuresAt5Hours = {};
    COMPARTMENTS.forEach(comp => {
        pressuresAt5Hours[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, 300, comp.halfTime);
    });
    const { ceilingDepth: ceiling5h } =
        evaluateDirectAscent(
            pressuresAt5Hours, depth, n2Fraction, gfHigh, surfacePressure,
            pressurePerMeter
        );
    if (ceiling5h === 0) {
        return {
            ndl: Infinity, ndlExact: Infinity,
            ndlAtDepth: Infinity, ndlAtDepthExact: Infinity,
            controllingCompartment: null, descentTime
        };
    }
    
    // Sub-second precision keeps the exact threshold and the schedule branch
    // consistent for callers that compare arbitrary decimal runtimes.
    while (maxTime - minTime > 0.001) {
        const testTime = (minTime + maxTime) / 2;
        
        // Simulate time at depth
        const testPressures = {};
        COMPARTMENTS.forEach(comp => {
            testPressures[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, testTime, comp.halfTime);
        });
        
        // A candidate is within NDL when the simulated direct ascent reaches
        // the surface within GF High without any mandatory stop.
        const { ceilingDepth } =
            evaluateDirectAscent(
                testPressures, depth, n2Fraction, gfHigh, surfacePressure,
                pressurePerMeter
            );
        
        if (ceilingDepth > 0) {
            maxTime = testTime; // Needs deco, reduce time
        } else {
            minTime = testTime; // No deco, can go longer
        }
    }
    
    // Get controlling compartment at NDL
    const ndlPressures = {};
    COMPARTMENTS.forEach(comp => {
        ndlPressures[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, minTime, comp.halfTime);
    });
    const ndlAscent = evaluateDirectAscent(
        ndlPressures, depth, n2Fraction, gfHigh, surfacePressure,
        pressurePerMeter
    );
    
    // NDL is reported the way dive tables report it: as the maximum bottom time
    // measured from leaving the surface, i.e. the descent is already included.
    // Floor to whole minutes for conservative display.
    const ndlExact = descentTime + minTime;
    return {
        ndl: Math.floor(ndlExact),
        ndlExact,                       // Exact total, from the start of the dive
        ndlAtDepth: Math.floor(minTime),
        ndlAtDepthExact: minTime,       // Time at depth after the descent
        controllingCompartment: ndlAscent.controllingCompartment,
        descentTime
    };
}

function calculateGasSwitchPoints(
    gases, switchPpO2, modSurfacePressure, pressurePerMeter, stopIncrement
) {
    if (!gases || gases.length <= 1) {
        return [];
    }

    const gasSwitchPoints = [];
    for (const gas of gases.slice(1)) {
        if (!gas.o2 || gas.o2 <= 0 || !Number.isFinite(gas.o2)) {
            continue;
        }
        if (!Number.isFinite(gas.n2) || gas.n2 < 0 || gas.n2 > 1) {
            continue;
        }
        if (gas.o2 + gas.n2 > 1.001) {
            continue;
        }
        const mod = (switchPpO2 / gas.o2 - modSurfacePressure)
            / pressurePerMeter;
        if (!Number.isFinite(mod)) {
            continue;
        }
        gasSwitchPoints.push({
            ...gas,
            switchDepth: Math.max(
                0, Math.floor(mod / stopIncrement) * stopIncrement
            )
        });
    }
    return gasSwitchPoints.sort((a, b) => b.switchDepth - a.switchDepth);
}

function switchToBestGas(
    context, atDepth, recordSwitch = true, phase = 'ascent'
) {
    // This N2-only selection must include helium loading before trimix can use it.
    const eligible = context.gasSwitchPoints.filter(gas =>
        atDepth <= gas.switchDepth
        && gas.n2 < context.getCurrentN2()
        && !context.usedGases.has(gas.id ?? gas.name)
    );
    if (eligible.length === 0) {
        return false;
    }

    const best = eligible.reduce(
        (a, b) => (b.switchDepth > a.switchDepth ? b : a)
    );
    const key = best.id ?? best.name;
    context.setCurrentGas(best.n2, best.name);
    context.usedGases.add(key);
    if (recordSwitch) {
        context.gasSwitches.push({
            depth: atDepth,
            gas: best.name,
            gasId: key
        });
        context.recordDecision('gas-switch', {
            depth: atDepth,
            gas: best.name,
            gasId: key,
            duration: context.gasSwitchTime,
            phase
        });
    }
    return true;
}

function createScheduleContext(
    currentDepth, n2Fraction, gfLow, gfHigh, gases, options
) {
    const { switchPpO2 = 1.6, gasSwitchTime = 0 } = options;
    const decoMode = getDecoMode(options);
    const surfacePressure = options.surfacePressure ?? SURFACE_PRESSURE;
    const pressurePerMeter =
        options.pressurePerMeter ?? PRESSURE_PER_METER;
    const modSurfacePressure = options.modSurfacePressure
        ?? 1 + (surfacePressure - SURFACE_PRESSURE);
    const continuousDeco = decoMode === DECO_MODES.CONTINUOUS;
    const stopIncrement = continuousDeco ? 0.1 : STOP_INCREMENT;
    const timeIncrement = continuousDeco ? 0.1 : 1;
    const minimumStopTime = decoMode === DECO_MODES.STANDARD ? 1 : 0;
    const alignRuntimeDepartures = decoMode === DECO_MODES.STANDARD
        && options.alignRuntimeDepartures === true
        && Number.isFinite(options.runtimeStart);
    let scheduleRuntime = Number.isFinite(options.runtimeStart)
        ? options.runtimeStart
        : null;
    let totalAscentTime = 0;
    let currentN2 = n2Fraction;
    let currentGasName = gases && gases.length > 0
        ? gases[0].name
        : 'Bottom Gas';
    const decisionAudit = options.audit ? {
        version: DECISION_AUDIT_VERSION,
        mode: decoMode,
        startDepth: currentDepth,
        ...(scheduleRuntime !== null ? { runtimeStart: scheduleRuntime } : {}),
        gfLow,
        gfHigh,
        surfacePressure,
        events: []
    } : null;

    const context = {
        decoMode,
        gasSwitchTime,
        surfacePressure,
        pressurePerMeter,
        gfLow,
        gfHigh,
        stopIncrement,
        timeIncrement,
        minimumStopTime,
        alignRuntimeDepartures,
        decisionAudit,
        stops: [],
        gasSwitches: [],
        usedGases: new Set(),
        gasSwitchPoints: calculateGasSwitchPoints(
            gases, switchPpO2, modSurfacePressure, pressurePerMeter,
            stopIncrement
        ),
        recordDecision(type, data) {
            if (decisionAudit) {
                decisionAudit.events.push({
                    type,
                    ...(scheduleRuntime !== null
                        ? { runtime: scheduleRuntime }
                        : {}),
                    ...data
                });
            }
        },
        advanceRuntime(duration) {
            if (scheduleRuntime !== null) {
                scheduleRuntime = Math.round(
                    (scheduleRuntime + duration) * 10
                ) / 10;
            }
        },
        addAscentTime(duration) {
            totalAscentTime += duration;
        },
        getTotalAscentTime() {
            return totalAscentTime;
        },
        getScheduleRuntime() {
            return scheduleRuntime;
        },
        getCurrentN2() {
            return currentN2;
        },
        getCurrentGasName() {
            return currentGasName;
        },
        setCurrentGas(n2, name) {
            currentN2 = n2;
            currentGasName = name;
        }
    };
    context.switchToBestGas = (
        atDepth, recordSwitch = true, phase = 'ascent'
    ) => switchToBestGas(context, atDepth, recordSwitch, phase);
    return context;
}

function findScheduleFirstStop(
    context, tissuePressures, currentDepth, n2Fraction
) {
    const directAscent = evaluateDirectAscent(
        tissuePressures, currentDepth, n2Fraction, context.gfHigh,
        context.surfacePressure, context.pressurePerMeter
    );
    context.recordDecision('direct-ascent', {
        gf: context.gfHigh,
        ceilingDepth: directAscent.ceilingDepth,
        controllingCompartment: directAscent.controllingCompartment,
        decision: directAscent.ceilingDepth === 0
            ? 'surface'
            : 'decompression'
    });
    if (directAscent.ceilingDepth === 0) {
        return {
            anchorDepth: 0,
            pAnchor: context.surfacePressure,
            tissuesAtAnchor: directAscent.tissues
        };
    }

    const gasSwitchPoints = context.gasSwitchPoints.length > 0
        ? context.gasSwitchPoints
        : null;
    const findFirstStop = context.decoMode === DECO_MODES.STANDARD
        ? findFirstStagedStopAtGFLow
        : findFirstStopAtGFLow;
    return findFirstStop(
        tissuePressures, currentDepth, n2Fraction, context.gfLow,
        context.stopIncrement, ASCENT_SPEED, gasSwitchPoints,
        context.surfacePressure, context.recordDecision,
        context.pressurePerMeter
    );
}

function ascendScheduleSegment(context, tissues, fromDepth, toDepth) {
    const segmentTime = (fromDepth - toDepth) / ASCENT_SPEED;
    const nextTissues = simulateDepthChange(
        tissues, fromDepth, toDepth, segmentTime, context.getCurrentN2(),
        context.surfacePressure, context.pressurePerMeter
    );
    context.addAscentTime(segmentTime);
    context.advanceRuntime(segmentTime);
    return nextTissues;
}

function holdAfterAscentSwitch(context, tissues, switchDepth, targetDepth) {
    let currentTissues = simulateDepthTime(
        tissues, switchDepth, context.gasSwitchTime, context.getCurrentN2(),
        context.surfacePressure, context.pressurePerMeter
    );
    context.advanceRuntime(context.gasSwitchTime);
    let switchHoldTime = context.gasSwitchTime;

    if (context.alignRuntimeDepartures) {
        const alignmentWait = Math.round(
            (Math.ceil(context.getScheduleRuntime() - 1e-9)
                - context.getScheduleRuntime()) * 10
        ) / 10;
        if (alignmentWait > 0) {
            currentTissues = simulateDepthTime(
                currentTissues, switchDepth, alignmentWait,
                context.getCurrentN2(), context.surfacePressure,
                context.pressurePerMeter
            );
            switchHoldTime += alignmentWait;
            context.advanceRuntime(alignmentWait);
        }

        const targetGF = interpolateGF(
            getAmbientPressure(
                targetDepth, context.surfacePressure, context.pressurePerMeter
            ),
            context.pAnchor, context.gfLow, context.gfHigh,
            context.surfacePressure
        );
        let targetCeiling = getDiveCeiling(
            currentTissues, targetGF, context.surfacePressure,
            context.pressurePerMeter
        ).ceilingDepth;
        while (targetCeiling > targetDepth) {
            currentTissues = simulateDepthTime(
                currentTissues, switchDepth, 1, context.getCurrentN2(),
                context.surfacePressure, context.pressurePerMeter
            );
            switchHoldTime += 1;
            context.advanceRuntime(1);
            if (switchHoldTime > DECO_STOP_MAX_MINUTES) {
                throw new DecoCapExceededError(
                    switchDepth, context.stops, DECO_STOP_MAX_MINUTES
                );
            }
            targetCeiling = getDiveCeiling(
                currentTissues, targetGF, context.surfacePressure,
                context.pressurePerMeter
            ).ceilingDepth;
        }
    }

    context.stops.push({
        depth: switchDepth,
        time: Math.round(switchHoldTime * 10) / 10,
        gas: context.getCurrentGasName(),
        ...(context.alignRuntimeDepartures
            ? { departureRuntime: context.getScheduleRuntime() }
            : {})
    });
    return currentTissues;
}

function buildScheduleResult(context) {
    const totalAscentTime = context.getTotalAscentTime();
    const totalTime = totalAscentTime
        + context.stops.reduce((sum, stop) => sum + stop.time, 0);
    return {
        stops: context.stops,
        gasSwitches: context.gasSwitches,
        totalTime,
        totalAscentTime,
        pAnchor: context.pAnchor,
        anchorDepth: context.anchorDepth,
        ...(context.decisionAudit
            ? { decisionAudit: context.decisionAudit }
            : {})
    };
}

function completeDirectAscent(context, tissues, startDepth) {
    const uniqueSwitchDepths = [
        ...new Set(context.gasSwitchPoints.map(gas => gas.switchDepth))
    ].sort((a, b) => b - a);

    let remainingDepth = startDepth;
    let currentTissues = { ...tissues };
    for (const switchDepth of uniqueSwitchDepths) {
        if (remainingDepth <= switchDepth) {
            continue;
        }
        currentTissues = ascendScheduleSegment(
            context, currentTissues, remainingDepth, switchDepth
        );
        remainingDepth = switchDepth;
        if (context.switchToBestGas(switchDepth) && context.gasSwitchTime > 0) {
            currentTissues = holdAfterAscentSwitch(
                context, currentTissues, switchDepth, 0
            );
        }
    }

    if (remainingDepth > 0) {
        ascendScheduleSegment(context, currentTissues, remainingDepth, 0);
    }
    return buildScheduleResult(context);
}

function ascendToFirstStop(context, tissues, startDepth, firstStopDepth) {
    const ascentSwitchDepths = [
        ...new Set(context.gasSwitchPoints.map(gas => gas.switchDepth))
    ]
        .filter(depth => depth < startDepth && depth >= firstStopDepth)
        .sort((a, b) => b - a);

    let currentDepth = startDepth;
    let currentTissues = { ...tissues };
    for (const switchDepth of ascentSwitchDepths) {
        if (currentDepth <= switchDepth) {
            continue;
        }
        currentTissues = ascendScheduleSegment(
            context, currentTissues, currentDepth, switchDepth
        );
        currentDepth = switchDepth;
        if (context.switchToBestGas(switchDepth) && context.gasSwitchTime > 0) {
            currentTissues = holdAfterAscentSwitch(
                context, currentTissues, switchDepth, firstStopDepth
            );
        }
    }

    if (currentDepth > firstStopDepth) {
        currentTissues = ascendScheduleSegment(
            context, currentTissues, currentDepth, firstStopDepth
        );
    }
    return currentTissues;
}

function appendOrMergeStop(context, depth, stopTime) {
    const roundedDepth = Math.round(depth * 10) / 10;
    const currentGasName = context.getCurrentGasName();
    const previousStop = context.stops[context.stops.length - 1];
    if (previousStop
        && previousStop.depth === roundedDepth
        && previousStop.gas === currentGasName) {
        previousStop.time = Math.round(
            (previousStop.time + stopTime) * 10
        ) / 10;
        if (context.alignRuntimeDepartures) {
            previousStop.departureRuntime = context.getScheduleRuntime();
        }
        return;
    }

    context.stops.push({
        depth: roundedDepth,
        time: Math.round(stopTime * 10) / 10,
        gas: currentGasName,
        ...(context.alignRuntimeDepartures
            ? { departureRuntime: context.getScheduleRuntime() }
            : {})
    });
}

function completeStopLevels(context, initialTissues, firstStopDepth) {
    let tissues = initialTissues;
    let depth = firstStopDepth;
    let pendingStopTime = 0;
    let levelDecision = null;

    while (depth > 0) {
        let switchTime = 0;
        if (context.switchToBestGas(depth, true, 'level')
            && context.gasSwitchTime > 0) {
            tissues = simulateDepthTime(
                tissues, depth, context.gasSwitchTime, context.getCurrentN2(),
                context.surfacePressure, context.pressurePerMeter
            );
            pendingStopTime += context.gasSwitchTime;
            context.advanceRuntime(context.gasSwitchTime);
            switchTime = context.gasSwitchTime;
        }

        if (!levelDecision) {
            levelDecision = {
                depth,
                gas: context.getCurrentGasName(),
                switchTime,
                mandatoryWait: 0,
                additionalWait: 0,
                alignmentWait: 0,
                initialCeilingDepth: null,
                initialControllingCompartment: null
            };
        } else {
            levelDecision.gas = context.getCurrentGasName();
            levelDecision.switchTime += switchTime;
        }

        if (pendingStopTime < context.minimumStopTime) {
            const mandatoryWait = context.minimumStopTime - pendingStopTime;
            tissues = simulateDepthTime(
                tissues, depth, mandatoryWait, context.getCurrentN2(),
                context.surfacePressure, context.pressurePerMeter
            );
            pendingStopTime = context.minimumStopTime;
            context.advanceRuntime(mandatoryWait);
            levelDecision.mandatoryWait += mandatoryWait;
        }

        const nextStopDepth = Math.max(
            0, Math.round((depth - context.stopIncrement) * 10) / 10
        );
        const ascentTime = (depth - nextStopDepth) / ASCENT_SPEED;
        const gfThere = interpolateGF(
            getAmbientPressure(
                nextStopDepth, context.surfacePressure, context.pressurePerMeter
            ),
            context.pAnchor, context.gfLow, context.gfHigh,
            context.surfacePressure
        );
        const { ceilingDepth, controllingCompartment } = getDiveCeiling(
            tissues, gfThere, context.surfacePressure, context.pressurePerMeter
        );
        if (levelDecision.initialCeilingDepth === null) {
            levelDecision.initialCeilingDepth = ceilingDepth;
            levelDecision.initialControllingCompartment =
                controllingCompartment;
        }

        if (ceilingDepth <= nextStopDepth) {
            if (context.alignRuntimeDepartures) {
                const alignedRuntime = Math.ceil(
                    context.getScheduleRuntime() - 1e-9
                );
                const alignmentWait = Math.round(
                    (alignedRuntime - context.getScheduleRuntime()) * 10
                ) / 10;
                if (alignmentWait > 0) {
                    tissues = simulateDepthTime(
                        tissues, depth, alignmentWait, context.getCurrentN2(),
                        context.surfacePressure, context.pressurePerMeter
                    );
                    pendingStopTime = Math.round(
                        (pendingStopTime + alignmentWait) * 10
                    ) / 10;
                    levelDecision.alignmentWait = Math.round(
                        (levelDecision.alignmentWait + alignmentWait) * 10
                    ) / 10;
                    context.advanceRuntime(alignmentWait);
                    continue;
                }
            }

            context.recordDecision('level-decision', {
                ...levelDecision,
                targetDepth: nextStopDepth,
                targetGF: gfThere,
                finalCeilingDepth: ceilingDepth,
                finalControllingCompartment: controllingCompartment,
                totalWait: pendingStopTime,
                decision: 'ascend'
            });
            if (pendingStopTime > 0) {
                appendOrMergeStop(context, depth, pendingStopTime);
                pendingStopTime = 0;
            }
            levelDecision = null;
            tissues = simulateDepthChange(
                tissues, depth, nextStopDepth, ascentTime,
                context.getCurrentN2(), context.surfacePressure,
                context.pressurePerMeter
            );
            context.addAscentTime(ascentTime);
            context.advanceRuntime(ascentTime);
            depth = nextStopDepth;
            continue;
        }

        tissues = simulateDepthTime(
            tissues, depth, context.timeIncrement, context.getCurrentN2(),
            context.surfacePressure, context.pressurePerMeter
        );
        pendingStopTime = Math.round(
            (pendingStopTime + context.timeIncrement) * 10
        ) / 10;
        context.advanceRuntime(context.timeIncrement);
        levelDecision.additionalWait = Math.round(
            (levelDecision.additionalWait + context.timeIncrement) * 10
        ) / 10;
        if (pendingStopTime > DECO_STOP_MAX_MINUTES) {
            throw new DecoCapExceededError(
                depth, context.stops, DECO_STOP_MAX_MINUTES
            );
        }
    }

    return buildScheduleResult(context);
}

/**
 * Generate a decompression schedule from current tissue state
 * Returns the stops needed to safely reach the surface.
 *
 * Gas switch convention:
 * - When deco stops are required: switches occur on arrival at a stop depth,
 *   before waiting begins. The ceiling check during ascent uses the current gas;
 *   after arrival and switch, subsequent waiting uses the new gas.
 * - When no deco stops are required (NDL dive): switches occur mid-ascent at
 *   the gas's MOD (rounded to 3m grid). This allows using richer gases during
 *   ascent even without mandatory stops.
 *
 * GF interpolation (pAnchor-based): The pAnchor is the ambient pressure during
 * ascent where GF_max first equals GF_low. The GF ramp runs from gfLow at pAnchor
 * to gfHigh at the surface. This is the correct Bühlmann + GF implementation.
 *
 * @param {Object} tissuePressures - Current tissue pressures by compartment ID
 * @param {number} currentDepth - Current depth in meters (ascent start)
 * @param {number} n2Fraction - N2 fraction in current gas
 * @param {number} gfLow - GF Low (0-1)
 * @param {number} gfHigh - GF High (0-1)
 * @param {Array} [gases] - Available gases for switching [{id, n2, o2, name, mod}]
 * @param {Object} [options] - Additional options
 * @param {number} [options.switchPpO2=1.6] - ppO2 used to calculate gas switch depths (MOD)
 * @param {boolean} [options.audit=false] - Include structured decision events
 * @param {boolean} [options.alignRuntimeDepartures=false] - Align Standard-mode departures to whole absolute runtime minutes
 * @param {number} [options.runtimeStart] - Absolute runtime at the start of the ascent
 * @returns {{stops: Array<{depth: number, time: number, gas: string, departureRuntime?: number}>, gasSwitches: Array<{depth: number, gas: string, gasId: string}>, totalTime: number, totalAscentTime: number, pAnchor: number, anchorDepth: number, decisionAudit?: Object}}
 */
export function generateDecoSchedule(
    tissuePressures, currentDepth, n2Fraction, gfLow, gfHigh,
    gases = null, options = {}
) {
    const context = createScheduleContext(
        currentDepth, n2Fraction, gfLow, gfHigh, gases, options
    );
    const { anchorDepth } = findScheduleFirstStop(
        context, tissuePressures, currentDepth, n2Fraction
    );
    context.anchorDepth = anchorDepth;
    context.pAnchor = context.surfacePressure
        + anchorDepth * context.pressurePerMeter;
    if (context.decisionAudit) {
        context.decisionAudit.anchorDepth = anchorDepth;
        context.decisionAudit.pAnchor = context.pAnchor;
    }

    const tissues = { ...tissuePressures };
    if (anchorDepth === 0) {
        return completeDirectAscent(context, tissues, currentDepth);
    }

    const tissuesAtFirstStop = ascendToFirstStop(
        context, tissues, currentDepth, anchorDepth
    );
    return completeStopLevels(context, tissuesAtFirstStop, anchorDepth);
}
