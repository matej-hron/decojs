/**
 * Decompression Model — deco mode configuration and cap errors.
 *
 * Extracted verbatim from js/decoModel.js; js/decoModel.js re-exports the
 * public surface so existing importers are unaffected.
 */

/** Supported decompression schedule policies. */
export const DECO_MODES = Object.freeze({
    STANDARD: 'standard',
    ADAPTIVE: 'adaptive',
    CONTINUOUS: 'continuous'
});

export const DECISION_AUDIT_VERSION = 2;

/** Resolve current and legacy schedule options to a supported mode. */
export function getDecoMode(options = {}) {
    if (Object.values(DECO_MODES).includes(options.decoMode)) {
        return options.decoMode;
    }
    return options.continuousDeco === true
        ? DECO_MODES.CONTINUOUS
        : DECO_MODES.STANDARD;
}

/**
 * Safety cap on a single deco stop. If waiting at one depth exceeds this, the
 * profile is outside the algorithm's usable domain (unreasonable GF for the
 * exposure, or a dive past air/diluent limits) and generateDecoSchedule throws
 * a DecoCapExceededError instead of returning a silently-truncated plan.
 */
export const DECO_STOP_MAX_MINUTES = 300;

/**
 * Thrown by generateDecoSchedule when a single stop would need to exceed
 * DECO_STOP_MAX_MINUTES. The caller is expected to surface this to the user.
 */
export class DecoCapExceededError extends Error {
    constructor(depth, stopsSoFar, capMinutes) {
        super(
            `Decompression at ${depth}\u00a0m would need more than ${capMinutes} minutes ` +
            `to clear. This profile is outside the algorithm's usable range — ` +
            `the gradient factor may be too aggressive for the exposure, or the ` +
            `dive is beyond what the configured gas can safely support.`
        );
        this.name = 'DecoCapExceededError';
        this.depth = depth;
        this.stopsSoFar = stopsSoFar;
        this.capMinutes = capMinutes;
    }
}
