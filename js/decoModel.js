/**
 * Decompression Model
 * 
 * Implements the Haldane equation (constant depth) and Schreiner equation
 * (linear depth change) for calculating nitrogen tissue loading.
 *
 * This module is a barrel: the implementation lives in js/deco/*.js and is
 * re-exported here unchanged so that existing importers keep working.
 */

export {
    CALC_INTERVAL,
    SURFACE_PRESSURE,
    WATER_VAPOR_PRESSURE,
    N2_FRACTION,
    STANDARD_GRAVITY,
    WATER_TYPES,
    WATER_DENSITIES,
    PRESSURE_PER_METER,
    DEFAULT_GF_LOW,
    DEFAULT_GF_HIGH,
} from './deco/constants.js';

export {
    DECO_MODES,
    DECISION_AUDIT_VERSION,
    getDecoMode,
    DECO_STOP_MAX_MINUTES,
    DecoCapExceededError,
} from './deco/config.js';

export {
    getPressureAtAltitude,
    getSurfacePressure,
    getPressurePerMeter,
    getAmbientPressure,
} from './deco/environment.js';

export {
    getAlveolarN2Pressure,
    getInitialTissueN2,
    haldaneEquation,
    schreinerEquation,
    simulateDepthTime,
    simulateDepthChange,
} from './deco/gasKinetics.js';

export {
    getMValue,
    getAdjustedMValue,
    calculateInstantGF,
    calculateMaxGF,
    getCompartmentCeiling,
    getDiveCeiling,
    interpolateGF,
} from './deco/gradients.js';

export {
    findFirstStopAtGFLow,
    getFirstStopDepth,
    calculateCeilingTimeSeries,
    calculateCeilingTimeSeriesDetailed,
} from './deco/ceiling.js';

export {
    calculateNDL,
    generateDecoSchedule,
} from './deco/schedule.js';

export {
    calculateTissueLoading,
} from './deco/profile.js';
