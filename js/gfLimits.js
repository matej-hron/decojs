export const MIN_GF_PERCENT = 10;
export const MAX_GF_PERCENT = 100;

export function isGradientFactorPercent(value) {
    return Number.isFinite(value) &&
        value >= MIN_GF_PERCENT &&
        value <= MAX_GF_PERCENT;
}

export function normalizeGradientFactorPercent(value, fallback = MAX_GF_PERCENT) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(MAX_GF_PERCENT, Math.max(MIN_GF_PERCENT, parsed));
}

export function parseGradientFactorPercent(value, fallback = MAX_GF_PERCENT) {
    const parsed = Number.parseInt(value, 10);
    return isGradientFactorPercent(parsed) ? parsed : fallback;
}
