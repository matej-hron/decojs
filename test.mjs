import { calculateTissueLoading, getAlveolarN2Pressure, getAmbientPressure } from './js/decoModel.js';

const profile = [
    { time: 0, depth: 0 },
    { time: 2, depth: 40 },
    { time: 22, depth: 40 },
    { time: 26, depth: 9 },
    { time: 29, depth: 9 },
    { time: 30, depth: 6 },
    { time: 35, depth: 6 },
    { time: 36, depth: 3 },
    { time: 41, depth: 3 },
    { time: 42, depth: 0 }
];

const results = calculateTissueLoading(profile, 10);

// Find the peak for compartment 1 (5-min half-time)
const comp1 = results.compartments[1];
let maxPressure = 0;
let maxIndex = 0;

for (let i = 0; i < comp1.pressures.length; i++) {
    if (comp1.pressures[i] > maxPressure) {
        maxPressure = comp1.pressures[i];
        maxIndex = i;
    }
}

const peakTime = results.timePoints[maxIndex];
const peakDepth = results.depthPoints[maxIndex];
const ambientAtPeak = results.ambientPressures[maxIndex];
const alveolarAt40m = getAlveolarN2Pressure(getAmbientPressure(40));

console.log("=== Peak Analysis for Compartment 1 (5-min) ===");
console.log(`Peak time: ${peakTime.toFixed(2)} min`);
console.log(`Peak depth: ${peakDepth.toFixed(2)} m`);
console.log(`Peak tissue pressure: ${maxPressure.toFixed(4)} bar`);
console.log(`Ambient at peak: ${ambientAtPeak.toFixed(4)} bar`);
console.log(`Alveolar N2 at 40m: ${alveolarAt40m.toFixed(4)} bar`);
console.log("");

// Show values around time 22
console.log("=== Values around time 22 ===");
for (let i = 0; i < results.timePoints.length; i++) {
    const t = results.timePoints[i];
    if (t >= 21 && t <= 23) {
        console.log(`t=${t.toFixed(3)}, depth=${results.depthPoints[i].toFixed(2)}m, tissue=${comp1.pressures[i].toFixed(4)} bar, ambient=${results.ambientPressures[i].toFixed(4)} bar`);
    }
}
