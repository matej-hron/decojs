/**
 * tissueEducation.js - Interactive educational components for tissue loading page
 * Handles gas pathway visualization and half-time concept charts
 */

// Constants
const WATER_VAPOR_PRESSURE = 0.0627; // bar at 37°C
const SURFACE_ALVEOLAR_N2 = (1 - WATER_VAPOR_PRESSURE) * 0.79; // ~0.74 bar

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    initGasPathway();
    initHalfTimeCharts();
});

/* ==========================================================================
   Gas Pathway Visualization - Manual Toggle Control
   ========================================================================== */

function initGasPathway() {
    const svg = document.querySelector('.gas-pathway-svg');
    const descentBtn = document.getElementById('pathway-descent-btn');
    const ascentBtn = document.getElementById('pathway-ascent-btn');
    
    if (!svg || !descentBtn || !ascentBtn) return;
    
    let currentPhase = 'descent';
    
    descentBtn.addEventListener('click', () => {
        if (currentPhase === 'descent') return;
        currentPhase = 'descent';
        descentBtn.classList.add('btn-active');
        ascentBtn.classList.remove('btn-active');
        updatePhase('descent', svg);
    });
    
    ascentBtn.addEventListener('click', () => {
        if (currentPhase === 'ascent') return;
        currentPhase = 'ascent';
        ascentBtn.classList.add('btn-active');
        descentBtn.classList.remove('btn-active');
        updatePhase('ascent', svg);
    });
    
    // Initialize in descent mode
    updatePhase('descent', svg);
}

function updatePhase(phase, svg) {
    const stageBoxes = svg.querySelectorAll('.stage-box');
    const arrowLines = svg.querySelectorAll('.arrow-line');
    const arrowHeadsRight = svg.querySelectorAll('.arrow-head-right');
    const arrowHeadsLeft = svg.querySelectorAll('.arrow-head-left');
    const particlesDescent = svg.querySelectorAll('.particle-descent');
    const particlesAscent = svg.querySelectorAll('.particle-ascent');
    const gradientBar = svg.querySelector('.gradient-bar');
    const flowDirection = document.getElementById('flow-direction');
    
    const regPressure = document.getElementById('reg-pressure');
    const alvPressure = document.getElementById('alv-pressure');
    const bloodPressure = document.getElementById('blood-pressure');
    
    const tissueFast = svg.querySelector('.tissue-fast');
    const tissueMedium = svg.querySelector('.tissue-medium');
    const tissueSlow = svg.querySelector('.tissue-slow');
    
    if (phase === 'descent') {
        // Descent: on-gassing, flow left → right
        
        // Update gradient direction (high on left)
        stageBoxes.forEach(box => {
            box.style.fill = 'url(#pressureGradientDescent)';
        });
        if (gradientBar) gradientBar.style.fill = 'url(#pressureGradientDescent)';
        
        // Show right arrows, hide left
        arrowLines.forEach(line => line.style.stroke = '#2980b9');
        arrowHeadsRight.forEach(h => { h.style.display = ''; h.style.fill = '#2980b9'; });
        arrowHeadsLeft.forEach(h => h.style.display = 'none');
        
        // Show descent particles, hide ascent
        particlesDescent.forEach(p => p.style.display = '');
        particlesAscent.forEach(p => p.style.display = 'none');
        
        // Update pressure values
        if (regPressure) regPressure.textContent = 'ppN₂ = 3.16';
        if (alvPressure) alvPressure.textContent = 'ppN₂ = 3.10';
        if (bloodPressure) bloodPressure.textContent = 'ppN₂ = 2.5';
        
        // Update legend
        if (flowDirection) flowDirection.textContent = '→ Gas flows from HIGH to LOW pressure';
        
        // Tissues filling
        animateTissueBars('descent', tissueFast, tissueMedium, tissueSlow);
        
    } else {
        // Ascent: off-gassing, flow right → left (tissues are now HIGH)
        
        // Update gradient direction (high on right)
        stageBoxes.forEach(box => {
            box.style.fill = 'url(#pressureGradientAscent)';
        });
        if (gradientBar) gradientBar.style.fill = 'url(#pressureGradientAscent)';
        
        // Show left arrows, hide right
        arrowLines.forEach(line => line.style.stroke = '#2980b9');
        arrowHeadsRight.forEach(h => h.style.display = 'none');
        arrowHeadsLeft.forEach(h => { h.style.display = ''; h.style.fill = '#2980b9'; });
        
        // Show ascent particles, hide descent
        particlesDescent.forEach(p => p.style.display = 'none');
        particlesAscent.forEach(p => p.style.display = '');
        
        // Update pressure values (tissues now higher than ambient)
        if (regPressure) regPressure.textContent = 'ppN₂ = 0.79';
        if (alvPressure) alvPressure.textContent = 'ppN₂ = 0.74';
        if (bloodPressure) bloodPressure.textContent = 'ppN₂ = 1.2';
        
        // Update legend - reversed: now tissues are HIGH
        if (flowDirection) flowDirection.textContent = '← Gas flows from HIGH to LOW pressure (tissues supersaturated)';
        
        // Tissues emptying
        animateTissueBars('ascent', tissueFast, tissueMedium, tissueSlow);
    }
}

function animateTissueBars(phase, fast, medium, slow) {
    if (!fast || !medium || !slow) return;
    
    // Colors
    fast.style.fill = '#3498db';
    medium.style.fill = '#9b59b6';
    slow.style.fill = '#e67e22';
    
    if (phase === 'descent') {
        // Reset to starting position (all same low level - surface saturation)
        fast.style.transition = 'none';
        medium.style.transition = 'none';
        slow.style.transition = 'none';
        fast.setAttribute('width', '10');
        medium.setAttribute('width', '10');
        slow.setAttribute('width', '10');
        
        // Force reflow
        fast.getBoundingClientRect();
        
        // Animate at different speeds - fast fills quickly, slow fills slowly
        setTimeout(() => {
            fast.style.transition = 'width 0.8s ease-out';    // Fast tissue - quick
            medium.style.transition = 'width 2s ease-out';    // Medium tissue - moderate
            slow.style.transition = 'width 4s ease-out';      // Slow tissue - slow
            fast.setAttribute('width', '70');
            medium.setAttribute('width', '50');
            slow.setAttribute('width', '30');
        }, 50);
    } else {
        // Ascent - reset to full (saturated at depth)
        fast.style.transition = 'none';
        medium.style.transition = 'none';
        slow.style.transition = 'none';
        fast.setAttribute('width', '70');
        medium.setAttribute('width', '70');
        slow.setAttribute('width', '70');
        
        // Force reflow
        fast.getBoundingClientRect();
        
        // Animate at different speeds - fast empties quickly, slow empties slowly
        setTimeout(() => {
            fast.style.transition = 'width 0.8s ease-out';    // Fast tissue - quick
            medium.style.transition = 'width 2s ease-out';    // Medium tissue - moderate
            slow.style.transition = 'width 4s ease-out';      // Slow tissue - slow
            fast.setAttribute('width', '10');
            medium.setAttribute('width', '40');
            slow.setAttribute('width', '60');
        }, 50);
    }
}

/* ==========================================================================
   Half-Time Charts
   ========================================================================== */

let ongassingChart = null;
let offgassingChart = null;
let currentDepth = 30; // Shared depth state

function initHalfTimeCharts() {
    initOngassingChart();
    initOffgassingChart();
    
    // Link the depth slider to both charts
    const depthSlider = document.getElementById('ongassing-depth');
    if (depthSlider) {
        depthSlider.addEventListener('input', (e) => {
            currentDepth = parseInt(e.target.value);
            updateOngassingChart();
            updateOffgassingChart();
        });
    }
}

function getSaturatedTissuePpN2(depth) {
    // Tissue fully saturated at the given depth
    const ambientPressure = 1 + depth / 10;
    return (ambientPressure - WATER_VAPOR_PRESSURE) * 0.79;
}

function initOngassingChart() {
    const canvas = document.getElementById('ongassing-chart');
    const depthSlider = document.getElementById('ongassing-depth');
    
    if (!canvas || !depthSlider) return;
    
    currentDepth = parseInt(depthSlider.value);
    const ctx = canvas.getContext('2d');
    
    const initialTarget = getSaturatedTissuePpN2(currentDepth);
    const initialData = calculateOngassing(initialTarget);
    
    ongassingChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: initialData.halfTimes.map(t => t.toFixed(1)),
            datasets: [
                {
                    label: 'Tissue ppN₂',
                    data: initialData.pressures,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Target (Alveolar)',
                    data: initialData.halfTimes.map(() => initialTarget),
                    borderColor: '#27ae60',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: 'Initial (Surface)',
                    data: initialData.halfTimes.map(() => SURFACE_ALVEOLAR_N2),
                    borderColor: '#95a5a6',
                    borderDash: [3, 3],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => `${items[0].label} half-times`,
                        label: (item) => `${item.dataset.label}: ${item.raw.toFixed(2)} bar`
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time (half-times)',
                        font: { size: 11 }
                    },
                    ticks: {
                        maxTicksLimit: 7,
                        callback: (value, index) => {
                            const t = index / 10;
                            return Number.isInteger(t) ? `${t}T` : '';
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'ppN₂ (bar)',
                        font: { size: 11 }
                    },
                    min: 0,
                    max: 4
                }
            }
        }
    });
    
    updateOngassingChart();
}

function calculateOngassing(targetPpN2, initialPpN2 = SURFACE_ALVEOLAR_N2) {
    const halfTimes = [];
    const pressures = [];
    
    for (let t = 0; t <= 6; t += 0.1) {
        halfTimes.push(t);
        const pressure = targetPpN2 + (initialPpN2 - targetPpN2) * Math.exp(-Math.LN2 * t);
        pressures.push(pressure);
    }
    
    return { halfTimes, pressures };
}

function updateOngassingChart() {
    const depthValue = document.getElementById('ongassing-depth-value');
    const ppn2Value = document.getElementById('ongassing-ppn2-value');
    
    const targetPpN2 = getSaturatedTissuePpN2(currentDepth);
    
    if (depthValue) depthValue.textContent = `${currentDepth}m`;
    if (ppn2Value) ppn2Value.textContent = `(ppN₂ = ${targetPpN2.toFixed(2)} bar)`;
    
    const data = calculateOngassing(targetPpN2);
    
    if (ongassingChart) {
        ongassingChart.data.labels = data.halfTimes.map(t => t.toFixed(1));
        ongassingChart.data.datasets[0].data = data.pressures;
        ongassingChart.data.datasets[1].data = data.halfTimes.map(() => targetPpN2);
        ongassingChart.data.datasets[2].data = data.halfTimes.map(() => SURFACE_ALVEOLAR_N2);
        ongassingChart.options.scales.y.max = Math.max(4, targetPpN2 + 0.5);
        ongassingChart.update('none');
    }
}

function initOffgassingChart() {
    const canvas = document.getElementById('offgassing-chart');
    
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const initialTissuePpN2 = getSaturatedTissuePpN2(currentDepth);
    const initialData = calculateOffgassing(initialTissuePpN2);
    
    offgassingChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: initialData.halfTimes.map(t => t.toFixed(1)),
            datasets: [
                {
                    label: 'Tissue ppN₂',
                    data: initialData.pressures,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Target (Surface)',
                    data: initialData.halfTimes.map(() => SURFACE_ALVEOLAR_N2),
                    borderColor: '#27ae60',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: `Initial (Saturated @ ${currentDepth}m)`,
                    data: initialData.halfTimes.map(() => initialTissuePpN2),
                    borderColor: '#95a5a6',
                    borderDash: [3, 3],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => `${items[0].label} half-times`,
                        label: (item) => `${item.dataset.label}: ${item.raw.toFixed(2)} bar`
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time (half-times)',
                        font: { size: 11 }
                    },
                    ticks: {
                        maxTicksLimit: 7,
                        callback: (value, index) => {
                            const t = index / 10;
                            return Number.isInteger(t) ? `${t}T` : '';
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'ppN₂ (bar)',
                        font: { size: 11 }
                    },
                    min: 0,
                    max: 3.5
                }
            }
        }
    });
    
    updateOffgassingChart();
}

function calculateOffgassing(initialTissuePpN2) {
    // Off-gassing to surface with air
    const targetPpN2 = SURFACE_ALVEOLAR_N2;
    
    const halfTimes = [];
    const pressures = [];
    
    for (let t = 0; t <= 6; t += 0.1) {
        halfTimes.push(t);
        const pressure = targetPpN2 + (initialTissuePpN2 - targetPpN2) * Math.exp(-Math.LN2 * t);
        pressures.push(pressure);
    }
    
    return { halfTimes, pressures };
}

function updateOffgassingChart() {
    const depthDisplay = document.getElementById('offgassing-depth-display');
    
    const initialTissuePpN2 = getSaturatedTissuePpN2(currentDepth);
    const data = calculateOffgassing(initialTissuePpN2);
    
    if (depthDisplay) depthDisplay.textContent = `${currentDepth}m`;
    
    if (offgassingChart) {
        offgassingChart.data.labels = data.halfTimes.map(t => t.toFixed(1));
        offgassingChart.data.datasets[0].data = data.pressures;
        offgassingChart.data.datasets[1].data = data.halfTimes.map(() => SURFACE_ALVEOLAR_N2);
        offgassingChart.data.datasets[2].data = data.halfTimes.map(() => initialTissuePpN2);
        offgassingChart.data.datasets[2].label = `Initial (Saturated @ ${currentDepth}m)`;
        offgassingChart.options.scales.y.max = Math.max(3.5, initialTissuePpN2 + 0.5);
        offgassingChart.update('none');
    }
}
