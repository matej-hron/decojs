/**
 * Bühlmann ZH-L16A Tissue Compartments
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
 * ZH-L16A values are for nitrogen. The half-times here use a common variant
 * where compartment 1 is 5.0 min (original Bühlmann used 4.0 min).
 */

export const COMPARTMENTS = [
    // Group 1: Reds/Oranges (Fast - tissues 1-4)
    { id: 1,  halfTime: 5.0,   aN2: 1.1696, bN2: 0.5578, label: "1 - Brain, Spinal Cord",     color: "#e74c3c" },  // Red
    { id: 2,  halfTime: 8.0,   aN2: 1.0000, bN2: 0.6514, label: "2 - Brain, Spinal Cord",     color: "#c0392b" },  // Dark red
    { id: 3,  halfTime: 12.5,  aN2: 0.8618, bN2: 0.7222, label: "3 - Spinal Cord",            color: "#e67e22" },  // Orange
    { id: 4,  halfTime: 18.5,  aN2: 0.7562, bN2: 0.7825, label: "4 - Muscle, Skin",           color: "#d35400" },  // Burnt orange
    
    // Group 2: Greens (Medium-fast - tissues 5-8)
    { id: 5,  halfTime: 27.0,  aN2: 0.6667, bN2: 0.8126, label: "5 - Muscle, Skin",           color: "#27ae60" },  // Green
    { id: 6,  halfTime: 38.3,  aN2: 0.5600, bN2: 0.8434, label: "6 - Muscle",                 color: "#1e8449" },  // Dark green
    { id: 7,  halfTime: 54.3,  aN2: 0.4947, bN2: 0.8693, label: "7 - Muscle",                 color: "#2ecc71" },  // Light green
    { id: 8,  halfTime: 77.0,  aN2: 0.4500, bN2: 0.8910, label: "8 - Muscle, Tendons",        color: "#16a085" },  // Teal
    
    // Group 3: Blues (Medium-slow - tissues 9-12)
    { id: 9,  halfTime: 109.0, aN2: 0.4187, bN2: 0.9092, label: "9 - Tendons, Cartilage",     color: "#3498db" },  // Blue
    { id: 10, halfTime: 146.0, aN2: 0.3798, bN2: 0.9222, label: "10 - Tendons, Bones",        color: "#1a5276" },  // Dark blue
    { id: 11, halfTime: 187.0, aN2: 0.3497, bN2: 0.9319, label: "11 - Bones",                 color: "#5dade2" },  // Light blue
    { id: 12, halfTime: 239.0, aN2: 0.3223, bN2: 0.9403, label: "12 - Bones, Fat",            color: "#2980b9" },  // Medium blue
    
    // Group 4: Purples/Magentas (Slow - tissues 13-16)
    { id: 13, halfTime: 305.0, aN2: 0.2971, bN2: 0.9477, label: "13 - Fat",                   color: "#9b59b6" },  // Purple
    { id: 14, halfTime: 390.0, aN2: 0.2737, bN2: 0.9544, label: "14 - Fat",                   color: "#6c3483" },  // Dark purple
    { id: 15, halfTime: 498.0, aN2: 0.2523, bN2: 0.9602, label: "15 - Fat",                   color: "#d770ad" },  // Pink
    { id: 16, halfTime: 635.0, aN2: 0.2327, bN2: 0.9653, label: "16 - Fat",                   color: "#8e44ad" }   // Violet
];

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
