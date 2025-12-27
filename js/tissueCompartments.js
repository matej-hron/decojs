/**
 * Bühlmann ZH-L16A Tissue Compartments
 * 
 * Each compartment represents a theoretical tissue group with a specific
 * nitrogen half-time. Fast compartments (low half-time) represent well-perfused
 * tissues like brain and blood. Slow compartments represent tissues like fat and bone.
 */

export const COMPARTMENTS = [
    { id: 1,  halfTime: 5.0,   label: "1 - Brain, Spinal Cord",     color: "#e74c3c" },
    { id: 2,  halfTime: 8.0,   label: "2 - Brain, Spinal Cord",     color: "#e67e22" },
    { id: 3,  halfTime: 12.5,  label: "3 - Spinal Cord",            color: "#f39c12" },
    { id: 4,  halfTime: 18.5,  label: "4 - Muscle, Skin",           color: "#f1c40f" },
    { id: 5,  halfTime: 27.0,  label: "5 - Muscle, Skin",           color: "#d4ac0d" },
    { id: 6,  halfTime: 38.3,  label: "6 - Muscle",                 color: "#27ae60" },
    { id: 7,  halfTime: 54.3,  label: "7 - Muscle",                 color: "#2ecc71" },
    { id: 8,  halfTime: 77.0,  label: "8 - Muscle, Tendons",        color: "#1abc9c" },
    { id: 9,  halfTime: 109.0, label: "9 - Tendons, Cartilage",     color: "#16a085" },
    { id: 10, halfTime: 146.0, label: "10 - Tendons, Bones",        color: "#3498db" },
    { id: 11, halfTime: 187.0, label: "11 - Bones",                 color: "#2980b9" },
    { id: 12, halfTime: 239.0, label: "12 - Bones, Fat",            color: "#9b59b6" },
    { id: 13, halfTime: 305.0, label: "13 - Fat",                   color: "#8e44ad" },
    { id: 14, halfTime: 390.0, label: "14 - Fat",                   color: "#6c3483" },
    { id: 15, halfTime: 498.0, label: "15 - Fat",                   color: "#5b2c6f" },
    { id: 16, halfTime: 635.0, label: "16 - Fat",                   color: "#4a235a" }
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
