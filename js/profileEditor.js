/**
 * Visual Profile Editor
 * 
 * Allows users to drag waypoints on a chart to define their dive profile.
 * Integrates with decoModel.js for real-time calculation.
 */

import { calculateTissueLoading, getAmbientPressure } from './decoModel.js';
import { COMPARTMENTS } from './tissueCompartments.js';
import { loadDiveSetup, saveDiveSetup, getDiveSetupWaypoints, getGases } from './diveSetup.js';

// ============================================================================
// STATE
// ============================================================================

let editorChart = null;
let resultsChart = null;
let currentProfile = [];   // Waypoints: {time, depth}
let currentGases = [];     // Available gases
let calculationResults = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Load existing setup
    const setup = await loadDiveSetup();
    currentProfile = getDiveSetupWaypoints(setup);
    currentGases = getGases(setup);

    console.log('Editor initialized with profile:', currentProfile);

    initCharts();
    renderWaypointList();
    updateStats();

    // Wire up buttons
    document.getElementById('add-wp-btn').addEventListener('click', addWaypoint);
    document.getElementById('save-editor-btn').addEventListener('click', saveToSharedSetup);
});

/**
 * Initialize Chart.js instances
 */
function initCharts() {
    const editorCtx = document.getElementById('profile-editor-chart').getContext('2d');
    const resultsCtx = document.getElementById('loading-results-chart').getContext('2d');

    // Editor Chart (Dive Profile)
    editorChart = new Chart(editorCtx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Dive Profile (Depth vs Time)',
                data: currentProfile.map(wp => ({ x: wp.time, y: wp.depth })),
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                fill: true,
                tension: 0,
                pointRadius: 6,
                pointHoverRadius: 10,
                pointBackgroundColor: '#3498db',
                pointHitRadius: 25
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Time (min)' },
                    min: 0
                },
                y: {
                    title: { display: true, text: 'Depth (m)' },
                    reverse: true,
                    min: 0
                }
            },
            plugins: {
                dragData: {
                    dragX: true,
                    dragY: true,
                    onDragStart: (e, datasetIndex, index, value) => {
                        // Don't drag the first point (it must be 0,0)
                        if (index === 0) return false;

                        // Don't drag X for the last point if it's the surface (must be end of dive)
                        // Actually, we can drag it, but maybe restrict it
                    },
                    onDrag: (e, datasetIndex, index, value) => {
                        // Enforce logic: depth >= 0
                        if (value.y < 0) value.y = 0;
                        if (value.x < 0) value.x = 0;

                        // Sort protection: prevent crossing other points in time
                        const data = editorChart.data.datasets[0].data;
                        if (index > 0 && value.x <= data[index - 1].x) {
                            value.x = data[index - 1].x + 0.1;
                        }
                        if (index < data.length - 1 && value.x >= data[index + 1].x) {
                            value.x = data[index + 1].x - 0.1;
                        }
                    },
                    onDragEnd: (e, datasetIndex, index, value) => {
                        updateProfileFromChart();
                        recalculate();
                        renderWaypointList();
                    },
                    magnet: {
                        to: (value) => ({
                            x: Math.round(value.x),
                            y: Math.max(0, Math.round(value.y))
                        })
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Time: ${ctx.parsed.x} min, Depth: ${ctx.parsed.y}m`
                    }
                }
            },
            // Custom click to add waypoint
            onClick: (e) => {
                // If we didn't hit a point, maybe add one? 
                // chartjs-plugin-dragdata might interfere, or we can use double click
            }
        }
    });

    // Results Chart (Tissue Loading)
    resultsChart = new Chart(resultsCtx, {
        type: 'line',
        data: {
            datasets: [] // Populated by recalculate()
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Time (min)' } },
                y: { title: { display: true, text: 'N₂ Pressure (bar)' } }
            },
            plugins: {
                legend: { display: false }
            },
            elements: {
                point: { radius: 0 }
            }
        }
    });

    recalculate();
}

/**
 * Sync the currentProfile state with the chart data
 */
function updateProfileFromChart() {
    const data = editorChart.data.datasets[0].data;
    currentProfile = data.map((d, i) => ({
        time: d.x,
        depth: d.y,
        gasId: currentProfile[i]?.gasId || currentGases[0]?.id || 'bottom'
    }));
    updateStats();
}

/**
 * Add a new waypoint at the end
 */
function addWaypoint() {
    const last = currentProfile[currentProfile.length - 1];
    currentProfile.push({
        time: last.time + 5,
        depth: last.depth,
        gasId: last.gasId
    });

    editorChart.data.datasets[0].data = currentProfile.map(wp => ({ x: wp.time, y: wp.depth }));
    editorChart.update();
    recalculate();
    renderWaypointList();
}

/**
 * Perform decompression calculations and update the results chart
 */
function recalculate() {
    try {
        const options = { gases: currentGases };
        calculationResults = calculateTissueLoading(currentProfile, 60, options);

        // Update results chart
        const datasets = [];

        // Add only a few representative compartments to keep it clean
        const selectedIds = [1, 4, 8, 12, 16]; // Fast to slow
        selectedIds.forEach(id => {
            const comp = COMPARTMENTS.find(c => c.id === id);
            const compData = calculationResults.compartments[id];
            datasets.push({
                label: comp.label,
                data: calculationResults.timePoints.map((t, i) => ({
                    x: t,
                    y: compData.pressures[i]
                })),
                borderColor: comp.color,
                borderWidth: 2,
                fill: false,
                tension: 0.1
            });
        });

        // Add ambient pressure
        datasets.push({
            label: 'Ambient',
            data: calculationResults.timePoints.map((t, i) => ({
                x: t,
                y: calculationResults.ambientPressures[i]
            })),
            borderColor: 'rgba(231, 76, 60, 0.5)',
            borderDash: [5, 5],
            borderWidth: 1,
            fill: false
        });

        resultsChart.data.datasets = datasets;
        resultsChart.update();

        updateStats();
    } catch (e) {
        console.error('Recalculation failed:', e);
    }
}

/**
 * Render the sidebar list of waypoints
 */
function renderWaypointList() {
    const list = document.getElementById('waypoint-list');
    list.innerHTML = '';

    currentProfile.forEach((wp, i) => {
        const item = document.createElement('div');
        item.className = 'waypoint-item';

        const gas = currentGases.find(g => g.id === wp.gasId) || currentGases[0];

        item.innerHTML = `
            <span class="time">${wp.time}m</span>
            <span class="depth">${wp.depth}m</span>
            <span class="gas">${gas?.name || 'Air'}</span>
            <button class="remove-wp" data-index="${i}" ${i === 0 ? 'disabled' : ''}>×</button>
        `;

        const deleteBtn = item.querySelector('.remove-wp');
        deleteBtn.addEventListener('click', (e) => {
            if (i === 0) return;
            currentProfile.splice(i, 1);
            editorChart.data.datasets[0].data = currentProfile.map(wp => ({ x: wp.time, y: wp.depth }));
            editorChart.update();
            recalculate();
            renderWaypointList();
        });

        list.appendChild(item);
    });
}

/**
 * Update stats text
 */
function updateStats() {
    const maxDepth = Math.max(...currentProfile.map(wp => wp.depth));
    const duration = currentProfile[currentProfile.length - 1].time;

    document.getElementById('stat-max-depth').textContent = `${maxDepth}m`;
    document.getElementById('stat-duration').textContent = `${duration} min`;
}

/**
 * Save the modified profile back to the shared dive setup
 */
async function saveToSharedSetup() {
    const status = document.getElementById('save-status');
    status.textContent = 'Saving...';

    try {
        // Load original setup to preserve other fields (gases, etc)
        const setup = await loadDiveSetup();

        // Update just the first dive waypoints
        setup.dives[0].waypoints = currentProfile;

        // Update name based on new depth
        const maxDepth = Math.max(...currentProfile.map(wp => wp.depth));
        const gasNames = currentGases.map(g => g.name).join(' + ');
        setup.name = `${maxDepth}m ${gasNames} (Visual)`;
        setup.id = 'custom';

        await saveDiveSetup(setup);

        status.textContent = '✓ Saved successfully!';
        status.style.color = '#2ecc71';
        setTimeout(() => { status.textContent = ''; }, 3000);
    } catch (e) {
        status.textContent = '❌ Error saving';
        status.style.color = '#e74c3c';
        console.error(e);
    }
}
