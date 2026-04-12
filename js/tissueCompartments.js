/**
 * Bühlmann ZH-L16 Tissue Compartments
 * 
 * Each compartment represents a theoretical tissue group with a specific
 * nitrogen half-time. Fast compartments (low half-time) represent well-perfused
 * tissues like brain and blood. Slow compartments represent tissues like fat and bone.
 * 
 * M-Value coefficients (a, b) define the maximum tolerable inert gas pressure:
 *   P_tissue_tolerated = a + P_ambient / b
 * 
 * - 'a' coefficient (bar): The y-intercept of the M-value line
 * - 'b' coefficient (dimensionless): Related to the slope of the M-value line
 * 
 * Three variants exist:
 * - ZH-L16A: Original experimental values (least conservative, 4.0 min TC1)
 * - ZH-L16B: Modified for printed dive tables (more conservative a for TC 5-8, 13)
 * - ZH-L16C: Modified for dive computers (most conservative a for TC 5-15)
 *
 * All variants share the same b coefficients.
 * Half-times are shared except compartment 1: ZH-L16A uses original 4.0 min,
 * B/C variants use modified 5.0 min.
 * 
 * Sources:
 * - Bühlmann, A.A.; Völlm, E.B.; Nussberger, P. (2002). Tauchmedizin. Springer-Verlag.
 * - https://en.wikipedia.org/wiki/Bühlmann_decompression_algorithm
 */

/**
 * Available ZH-L16 algorithm variants
 */
export const ZHL16_VARIANTS = {
    A: 'ZH-L16A',
    B: 'ZH-L16B', 
    C: 'ZH-L16C'
};

/**
 * Current active variant (can be changed at runtime)
 */
let currentVariant = ZHL16_VARIANTS.C;

/**
 * Compartment 1 half-time by variant
 * ZH-L16A uses original 4.0 min, B/C use modified 5.0 min
 */
const COMPARTMENT_1_HALFTIME = {
    [ZHL16_VARIANTS.A]: 4.0,   // Original Bühlmann specification
    [ZHL16_VARIANTS.B]: 5.0,   // Modified for printed tables
    [ZHL16_VARIANTS.C]: 5.0    // Modified for dive computers
};

/**
 * Base compartment data (half-times, b coefficients, labels, colors)
 * Note: Compartment 1 half-time is variant-specific (see COMPARTMENT_1_HALFTIME)
 */
const BASE_COMPARTMENTS = [
    // Group 1: Reds/Oranges (Fast - tissues 1-4)
    { id: 1,  halfTime: 5.0,   bN2: 0.5578, label: "1 - Brain, Spinal Cord",     color: "#e74c3c" },  // Red (half-time adjusted per variant)
    { id: 2,  halfTime: 8.0,   bN2: 0.6514, label: "2 - Brain, Spinal Cord",     color: "#c0392b" },  // Dark red
    { id: 3,  halfTime: 12.5,  bN2: 0.7222, label: "3 - Spinal Cord",            color: "#e67e22" },  // Orange
    { id: 4,  halfTime: 18.5,  bN2: 0.7825, label: "4 - Muscle, Skin",           color: "#d35400" },  // Burnt orange
    
    // Group 2: Greens (Medium-fast - tissues 5-8)
    { id: 5,  halfTime: 27.0,  bN2: 0.8126, label: "5 - Muscle, Skin",           color: "#27ae60" },  // Green
    { id: 6,  halfTime: 38.3,  bN2: 0.8434, label: "6 - Muscle",                 color: "#1e8449" },  // Dark green
    { id: 7,  halfTime: 54.3,  bN2: 0.8693, label: "7 - Muscle",                 color: "#2ecc71" },  // Light green
    { id: 8,  halfTime: 77.0,  bN2: 0.8910, label: "8 - Muscle, Tendons",        color: "#16a085" },  // Teal
    
    // Group 3: Blues (Medium-slow - tissues 9-12)
    { id: 9,  halfTime: 109.0, bN2: 0.9092, label: "9 - Tendons, Cartilage",     color: "#3498db" },  // Blue
    { id: 10, halfTime: 146.0, bN2: 0.9222, label: "10 - Tendons, Bones",        color: "#1a5276" },  // Dark blue
    { id: 11, halfTime: 187.0, bN2: 0.9319, label: "11 - Bones",                 color: "#5dade2" },  // Light blue
    { id: 12, halfTime: 239.0, bN2: 0.9403, label: "12 - Bones, Fat",            color: "#2980b9" },  // Medium blue
    
    // Group 4: Purples/Magentas (Slow - tissues 13-16)
    { id: 13, halfTime: 305.0, bN2: 0.9477, label: "13 - Fat",                   color: "#9b59b6" },  // Purple
    { id: 14, halfTime: 390.0, bN2: 0.9544, label: "14 - Fat",                   color: "#6c3483" },  // Dark purple
    { id: 15, halfTime: 498.0, bN2: 0.9602, label: "15 - Fat",                   color: "#d770ad" },  // Pink
    { id: 16, halfTime: 635.0, bN2: 0.9653, label: "16 - Fat",                   color: "#8e44ad" }   // Violet
];

/**
 * ZH-L16A 'a' coefficients (original experimental values - least conservative)
 * Used for research and comparison.
 *
 * Note: TC1 uses a=1.2599 with half-time 4.0 min (original Bühlmann specification).
 * The corresponding b coefficient should be 0.5050, but our b values are shared
 * across variants (0.5578 for TC1). This is a known limitation for the A variant.
 *
 * Sources: Bühlmann (2002) Tauchmedizin, dipplanner, decotengu
 */
const A_COEFFICIENTS_16A = {
    1:  1.2599, 2:  1.0000, 3:  0.8618, 4:  0.7562,
    5:  0.6667, 6:  0.5933, 7:  0.5282, 8:  0.4710,
    9:  0.4187, 10: 0.3798, 11: 0.3497, 12: 0.3223,
    13: 0.2971, 14: 0.2737, 15: 0.2523, 16: 0.2327
};

/**
 * ZH-L16B 'a' coefficients (for printed dive tables - more conservative)
 * Modified compartments from A: 6, 7, 8, 13 (lower 'a' = more conservative)
 *
 * Sources: Bühlmann (2002) Tauchmedizin, mvplan, decotengu
 */
const A_COEFFICIENTS_16B = {
    1:  1.1696, 2:  1.0000, 3:  0.8618, 4:  0.7562,
    5:  0.6667, 6:  0.5600, 7:  0.4947, 8:  0.4500,  // TC6-8 more conservative than A
    9:  0.4187, 10: 0.3798, 11: 0.3497, 12: 0.3223,
    13: 0.2850, 14: 0.2737, 15: 0.2523, 16: 0.2327   // TC13 more conservative than A
};

/**
 * ZH-L16C 'a' coefficients (for dive computers - most conservative)
 * Modified compartments from A: 5-15 (lower 'a' = more conservative)
 *
 * Sources: Bühlmann (2002) Tauchmedizin, Wikipedia, Subsurface, decotengu, dipplanner
 */
const A_COEFFICIENTS_16C = {
    1:  1.1696, 2:  1.0000, 3:  0.8618, 4:  0.7562,
    5:  0.6200, 6:  0.5043, 7:  0.4410, 8:  0.4000,  // TC5-8 more conservative than A
    9:  0.3750, 10: 0.3500, 11: 0.3295, 12: 0.3065,  // TC9-12 more conservative than A
    13: 0.2835, 14: 0.2610, 15: 0.2480, 16: 0.2327   // TC13-15 more conservative than A
};

/**
 * Get the 'a' coefficients for a given variant
 * @param {string} variant - One of ZHL16_VARIANTS values
 * @returns {Object} Map of compartment ID to 'a' coefficient
 */
function getACoefficients(variant) {
    switch (variant) {
        case ZHL16_VARIANTS.A:
            return A_COEFFICIENTS_16A;
        case ZHL16_VARIANTS.B:
            return A_COEFFICIENTS_16B;
        case ZHL16_VARIANTS.C:
        default:
            return A_COEFFICIENTS_16C;
    }
}

/**
 * Build compartments array for a given variant
 * @param {string} variant - One of ZHL16_VARIANTS values
 * @returns {Array} Compartments with aN2 values and variant-specific half-times
 */
function buildCompartments(variant) {
    const aCoeffs = getACoefficients(variant);
    const comp1HalfTime = COMPARTMENT_1_HALFTIME[variant] || 5.0;

    return BASE_COMPARTMENTS.map(comp => ({
        ...comp,
        halfTime: comp.id === 1 ? comp1HalfTime : comp.halfTime,
        aN2: aCoeffs[comp.id]
    }));
}

/**
 * Get the current ZH-L16 variant
 * @returns {string} Current variant name
 */
export function getZHL16Variant() {
    return currentVariant;
}

/**
 * Set the ZH-L16 variant and rebuild compartments
 * @param {string} variant - One of ZHL16_VARIANTS values
 */
export function setZHL16Variant(variant) {
    if (!Object.values(ZHL16_VARIANTS).includes(variant)) {
        console.warn(`Unknown ZH-L16 variant: ${variant}, defaulting to ZH-L16C`);
        variant = ZHL16_VARIANTS.C;
    }
    currentVariant = variant;
    // Rebuild the COMPARTMENTS array in place
    const newCompartments = buildCompartments(variant);
    COMPARTMENTS.length = 0;
    COMPARTMENTS.push(...newCompartments);
}

/**
 * Get compartments for a specific variant without changing the current setting
 * @param {string} variant - One of ZHL16_VARIANTS values
 * @returns {Array} Compartments for the specified variant
 */
export function getCompartmentsForVariant(variant) {
    return buildCompartments(variant);
}

/**
 * The active compartments array - defaults to ZH-L16C (dive computer variant)
 * This array is rebuilt when setZHL16Variant() is called.
 */
export const COMPARTMENTS = buildCompartments(currentVariant);

/**
 * Get the rate constant k for a compartment
 * k = ln(2) / halfTime
 * 
 * @param {number} halfTime - Half-time in minutes
 * @returns {number} Rate constant k (per minute)
 */
export function getRateConstant(halfTime) {
    return Math.LN2 / halfTime;
}

/**
 * Get descriptive category for a compartment based on half-time
 * @param {number} halfTime - Half-time in minutes
 * @returns {string} Category description
 */
export function getCompartmentCategory(halfTime) {
    if (halfTime <= 12.5) return "Fast";
    if (halfTime <= 54.3) return "Medium";
    if (halfTime <= 146.0) return "Medium-Slow";
    return "Slow";
}
