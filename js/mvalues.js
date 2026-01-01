/**
 * M-Values Chart - Interactive Visualization
 * 
 * Displays the pressure-pressure diagram showing:
 * - Alveolar line (y = 0.79x): off-gassing threshold
 * - Ambient line (y = x): supersaturation boundary  
 * - M-value line (y = a + x/b): maximum tolerable tissue pressure (critical supersaturation)
 * - Surface line (x = 1): sea level reference
 * - Tissue state point with trail: current position during dive
 */

import { COMPARTMENTS } from './tissueCompartments.js';
import { calculateTissueLoading, getAmbientPressure, SURFACE_PRESSURE } from './decoModel.js';
import { loadDiveSetup, getDiveSetupWaypoints, getGases } from './diveSetup.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CHART_CONFIG = {
    // Chart appearance
    ambientLineColor: 'rgba(52, 152, 219, 0.8)',     // Blue - supersaturation threshold
    alveolarLineColor: 'rgba(155, 89, 182, 0.7)',    // Purple - off-gassing threshold
    mvalueLineColor: '#e74c3c',                       // Red (will use compartment color)
    surfaceLineColor: 'rgba(128, 128, 128, 0.6)',    // Gray
    trailColor: 'rgba(46, 204, 113, 0.6)',           // Green
    currentPointColor: '#2ecc71',                     // Green
    dangerZoneColor: 'rgba(231, 76, 60, 0.1)',       // Light red
    
    // Chart bounds
    minPressure: 0.5,   // Minimum pressure on both axes (below surface)
    maxPressure: 6,     // Will be auto-adjusted based on dive profile
    
    // Point sizes
    trailPointRadius: 3,
    currentPointRadius: 8,
    
    // Animation
    playbackSpeed: 100  // ms per frame
};

// ============================================================================
// STATE
// ============================================================================

let chart = null;
let diveResults = null;
let currentProfile = null;
let currentGases = null;
let visibleCompartments = new Set([1]);  // Start with TC1 visible
let currentTimeIndex = 0;
let isPlaying = false;
let playInterval = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await initializeProfileSelector();
    initializeCompartmentSelector();
    initializeTimelineSlider();
    initializePlaybackControls();
    initializeKeyboardControls();
    initializeFullscreen();
    populateCoefficientsTable();
    
    // Load initial profile
    await loadSelectedProfile();
});

/**
 * Initialize the profile selector dropdown
 */
async function initializeProfileSelector() {
    const selector = document.getElementById('profile-switcher');
    if (!selector) return;
    
    try {
        // Load dive profiles from JSON and current setup from localStorage/JSON
        const [profilesResponse, setupData] = await Promise.all([
            fetch('data/dive-profiles.json'),
            loadDiveSetup()  // Uses localStorage first, falls back to JSON
        ]);
        
        const profilesData = await profilesResponse.json();
        
        // Store gases from current setup
        currentGases = setupData.gases || null;
        
        // Add "Current Setup" option first (from localStorage or dive-setup.json)
        const currentOption = document.createElement('option');
        currentOption.value = 'current-setup';
        currentOption.textContent = '⚙️ ' + (setupData.name || 'Current Setup');
        selector.appendChild(currentOption);
        
        // Add separator
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────';
        selector.appendChild(separator);
        
        // Populate dropdown with preset profiles
        profilesData.profiles.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            selector.appendChild(option);
        });
        
        // Default to current setup
        selector.value = 'current-setup';
        
        // Listen for changes
        selector.addEventListener('change', async () => {
            await loadSelectedProfile();
        });
        
    } catch (error) {
        console.error('Failed to load profiles:', error);
    }
}

/**
 * Initialize the compartment checkboxes
 */
function initializeCompartmentSelector() {
    const container = document.getElementById('compartment-toggles');
    if (!container) return;
    
    // Create checkboxes for each compartment
    COMPARTMENTS.forEach(comp => {
        const label = document.createElement('label');
        label.className = 'compartment-toggle';
        label.style.borderColor = comp.color;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = comp.id;
        checkbox.checked = visibleCompartments.has(comp.id);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                visibleCompartments.add(comp.id);
            } else {
                visibleCompartments.delete(comp.id);
            }
            updateChart();
        });
        
        const colorDot = document.createElement('span');
        colorDot.className = 'compartment-color';
        colorDot.style.backgroundColor = comp.color;
        
        const text = document.createElement('span');
        text.className = 'compartment-label';
        text.textContent = `${comp.id} (${comp.halfTime}m)`;
        
        label.appendChild(checkbox);
        label.appendChild(colorDot);
        label.appendChild(text);
        container.appendChild(label);
    });
    
    // Button handlers
    document.getElementById('show-all')?.addEventListener('click', () => {
        COMPARTMENTS.forEach(c => visibleCompartments.add(c.id));
        updateCheckboxes();
        updateChart();
    });
    
    document.getElementById('hide-all')?.addEventListener('click', () => {
        visibleCompartments.clear();
        updateCheckboxes();
        updateChart();
    });
    
    document.getElementById('show-fast')?.addEventListener('click', () => {
        visibleCompartments.clear();
        COMPARTMENTS.filter(c => c.halfTime <= 12.5).forEach(c => visibleCompartments.add(c.id));
        updateCheckboxes();
        updateChart();
    });
    
    document.getElementById('show-slow')?.addEventListener('click', () => {
        visibleCompartments.clear();
        COMPARTMENTS.filter(c => c.halfTime >= 109).forEach(c => visibleCompartments.add(c.id));
        updateCheckboxes();
        updateChart();
    });
}

/**
 * Update checkbox states to match visibleCompartments
 */
function updateCheckboxes() {
    const container = document.getElementById('compartment-toggles');
    if (!container) return;
    
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = visibleCompartments.has(parseInt(cb.value));
    });
}

/**
 * Initialize the timeline slider
 */
function initializeTimelineSlider() {
    const slider = document.getElementById('timeline-slider');
    if (!slider) return;
    
    slider.addEventListener('input', () => {
        if (!diveResults) return;
        
        // Stop playback when user drags slider
        stopPlayback();
        
        const maxIndex = diveResults.timePoints.length - 1;
        currentTimeIndex = Math.round((slider.value / 100) * maxIndex);
        updateTimelineDisplay();
        updateChart();
    });
}

/**
 * Initialize play/pause and step buttons
 */
function initializePlaybackControls() {
    const playBtn = document.getElementById('play-btn');
    const stepBackBtn = document.getElementById('step-back-btn');
    const stepFwdBtn = document.getElementById('step-fwd-btn');
    const rewindBtn = document.getElementById('rewind-btn');
    const fastFwdBtn = document.getElementById('fast-fwd-btn');
    
    if (playBtn) playBtn.addEventListener('click', togglePlayback);
    if (stepBackBtn) stepBackBtn.addEventListener('click', () => stepTime(-1));
    if (stepFwdBtn) stepFwdBtn.addEventListener('click', () => stepTime(1));
    if (rewindBtn) rewindBtn.addEventListener('click', () => { stopPlayback(); jumpToPrevWaypoint(); });
    if (fastFwdBtn) fastFwdBtn.addEventListener('click', () => { stopPlayback(); jumpToNextWaypoint(); });
}

/**
 * Step time by a given number of frames
 * @param {number} steps - Number of steps (positive = forward, negative = backward)
 */
function stepTime(steps) {
    if (!diveResults) return;
    
    stopPlayback();
    const maxIndex = diveResults.timePoints.length - 1;
    currentTimeIndex = Math.max(0, Math.min(maxIndex, currentTimeIndex + steps));
    updateSliderPosition();
    updateTimelineDisplay();
    updateChart();
}

/**
 * Toggle playback on/off
 */
function togglePlayback() {
    if (isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

/**
 * Start animation playback
 */
function startPlayback() {
    if (!diveResults || isPlaying) return;
    
    isPlaying = true;
    updatePlayButton();
    
    playInterval = setInterval(() => {
        const maxIndex = diveResults.timePoints.length - 1;
        
        if (currentTimeIndex >= maxIndex) {
            // Stop at end
            stopPlayback();
            return;
        } else {
            currentTimeIndex++;
        }
        
        updateSliderPosition();
        updateTimelineDisplay();
        updateChart();
        
    }, CHART_CONFIG.playbackSpeed);
}

/**
 * Stop animation playback
 */
function stopPlayback() {
    if (!isPlaying) return;
    
    isPlaying = false;
    updatePlayButton();
    
    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }
}

/**
 * Update play button appearance
 */
function updatePlayButton() {
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        playBtn.textContent = isPlaying ? '⏸️' : '▶️';
        playBtn.title = isPlaying ? 'Pause (Space)' : 'Play (Space)';
    }
}

/**
 * Update slider position to match current time index
 */
function updateSliderPosition() {
    const slider = document.getElementById('timeline-slider');
    if (!slider || !diveResults) return;
    
    const maxIndex = diveResults.timePoints.length - 1;
    slider.value = (currentTimeIndex / maxIndex) * 100;
}

/**
 * Find waypoint indices in the dive profile
 * Waypoints are significant points: start, max depth, stops, direction changes, surface
 */
function findWaypointIndices() {
    if (!diveResults || !diveResults.depthPoints) return [0];
    
    const depths = diveResults.depthPoints;
    const waypoints = new Set([0, depths.length - 1]);  // Always include start and end
    
    // Find direction changes and significant depth points
    for (let i = 1; i < depths.length - 1; i++) {
        const prevDepth = depths[i - 1];
        const currDepth = depths[i];
        const nextDepth = depths[i + 1];
        
        // Direction change: was descending, now ascending (or vice versa)
        const wasDescending = currDepth > prevDepth;
        const wasAscending = currDepth < prevDepth;
        const wasLevel = Math.abs(currDepth - prevDepth) < 0.1;
        
        const willDescend = nextDepth > currDepth;
        const willAscend = nextDepth < currDepth;
        const willLevel = Math.abs(nextDepth - currDepth) < 0.1;
        
        // Mark transitions: descent→level, level→ascent, ascent→level (stops), level→descent
        if ((wasDescending && (willLevel || willAscend)) ||  // Reached bottom or turning
            (wasAscending && willLevel) ||                    // Start of a stop
            (wasLevel && willAscend) ||                       // End of a stop / bottom
            (wasLevel && willDescend)) {                      // Rare: level then descend
            waypoints.add(i);
        }
    }
    
    return Array.from(waypoints).sort((a, b) => a - b);
}

/**
 * Jump to the next waypoint (Shift+Right)
 */
function jumpToNextWaypoint() {
    const waypoints = findWaypointIndices();
    for (const wp of waypoints) {
        if (wp > currentTimeIndex) {
            currentTimeIndex = wp;
            updateSliderPosition();
            updateTimelineDisplay();
            updateChart();
            return;
        }
    }
    // Already at or past last waypoint, go to end
    currentTimeIndex = diveResults.timePoints.length - 1;
    updateSliderPosition();
    updateTimelineDisplay();
    updateChart();
}

/**
 * Jump to the previous waypoint (Shift+Left)
 */
function jumpToPrevWaypoint() {
    const waypoints = findWaypointIndices();
    for (let i = waypoints.length - 1; i >= 0; i--) {
        if (waypoints[i] < currentTimeIndex) {
            currentTimeIndex = waypoints[i];
            updateSliderPosition();
            updateTimelineDisplay();
            updateChart();
            return;
        }
    }
    // Already at or before first waypoint, go to start
    currentTimeIndex = 0;
    updateSliderPosition();
    updateTimelineDisplay();
    updateChart();
}

/**
 * Initialize keyboard controls
 * 
 * Timeline controls:
 *   Left/Right: step time by 1
 *   Shift+Left/Right: jump to prev/next waypoint
 *   Ctrl+Left: reset time to 0
 *   Home/End: jump to start/end
 *   Space: play/pause
 * 
 * Tissue controls:
 *   Up: move selection up (to slower tissues)
 *   Down: move selection down (to faster tissues)
 *   Shift+Up: expand selection to include one more slower tissue
 *   Shift+Down: expand selection to include one more faster tissue
 */
function initializeKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        // Don't handle if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        if (!diveResults) return;
        
        const maxIndex = diveResults.timePoints.length - 1;
        
        switch (e.key) {
            case ' ':  // Space - play/pause
                e.preventDefault();
                togglePlayback();
                break;
                
            case 'ArrowRight':
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+Right: jump to end
                    stopPlayback();
                    currentTimeIndex = maxIndex;
                    updateSliderPosition();
                    updateTimelineDisplay();
                    updateChart();
                } else if (e.shiftKey) {
                    // Shift+Right: jump to next waypoint
                    stopPlayback();
                    jumpToNextWaypoint();
                } else {
                    stepTime(1);
                }
                break;
                
            case 'ArrowLeft':
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+Left: reset time to 0
                    stopPlayback();
                    currentTimeIndex = 0;
                    updateSliderPosition();
                    updateTimelineDisplay();
                    updateChart();
                } else if (e.shiftKey) {
                    // Shift+Left: jump to previous waypoint
                    stopPlayback();
                    jumpToPrevWaypoint();
                } else {
                    stepTime(-1);
                }
                break;
                
            case 'Home':
                e.preventDefault();
                stopPlayback();
                currentTimeIndex = 0;
                updateSliderPosition();
                updateTimelineDisplay();
                updateChart();
                break;
                
            case 'End':
                e.preventDefault();
                stopPlayback();
                currentTimeIndex = maxIndex;
                updateSliderPosition();
                updateTimelineDisplay();
                updateChart();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                if (e.shiftKey) {
                    expandToSlowerCompartment();
                } else {
                    moveCompartmentsSlower();
                }
                break;
                
            case 'ArrowDown':
                e.preventDefault();
                if (e.shiftKey) {
                    removeSlowestCompartment();
                } else {
                    moveCompartmentsFaster();
                }
                break;
        }
    });
}

/**
 * Move all visible compartments up by 1 (toward slower tissues)
 * Keeps the same number of compartments selected
 */
function moveCompartmentsSlower() {
    const currentIds = Array.from(visibleCompartments).sort((a, b) => a - b);
    if (currentIds.length === 0) return;
    
    // Check if we can move up (slowest compartment not at max)
    const slowestId = currentIds[currentIds.length - 1];
    if (slowestId >= 16) return;  // Already at slowest
    
    // Shift all compartments up by 1
    visibleCompartments.clear();
    currentIds.forEach(id => visibleCompartments.add(id + 1));
    updateCheckboxes();
    updateChart();
}

/**
 * Move all visible compartments down by 1 (toward faster tissues)
 * Keeps the same number of compartments selected
 */
function moveCompartmentsFaster() {
    const currentIds = Array.from(visibleCompartments).sort((a, b) => a - b);
    if (currentIds.length === 0) return;
    
    // Check if we can move down (fastest compartment not at min)
    const fastestId = currentIds[0];
    if (fastestId <= 1) return;  // Already at fastest
    
    // Shift all compartments down by 1
    visibleCompartments.clear();
    currentIds.forEach(id => visibleCompartments.add(id - 1));
    updateCheckboxes();
    updateChart();
}

/**
 * Expand selection to include the next slower compartment
 */
function expandToSlowerCompartment() {
    const currentIds = Array.from(visibleCompartments).sort((a, b) => a - b);
    if (currentIds.length === 0) {
        visibleCompartments.add(1);  // Start with fastest if none selected
    } else {
        const slowestId = currentIds[currentIds.length - 1];
        if (slowestId < 16) {
            visibleCompartments.add(slowestId + 1);
        }
    }
    updateCheckboxes();
    updateChart();
}

/**
 * Remove the slowest compartment from selection
 */
function removeSlowestCompartment() {
    const currentIds = Array.from(visibleCompartments).sort((a, b) => a - b);
    if (currentIds.length <= 1) return;  // Keep at least one compartment
    
    const slowestId = currentIds[currentIds.length - 1];
    visibleCompartments.delete(slowestId);
    updateCheckboxes();
    updateChart();
}

/**
 * Initialize fullscreen functionality
 */
function initializeFullscreen() {
    const chartContainer = document.getElementById('chart-container');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');
    
    function toggleFullscreen() {
        const isFullscreen = chartContainer.classList.toggle('fullscreen');
        document.body.style.overflow = isFullscreen ? 'hidden' : '';
        if (chart) {
            setTimeout(() => chart.resize(), 50);
        }
    }
    
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    if (exitFullscreenBtn) {
        exitFullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chartContainer.classList.contains('fullscreen')) {
            toggleFullscreen();
        }
    });
}

/**
 * Populate the ZH-L16A coefficients reference table
 */
function populateCoefficientsTable() {
    const tbody = document.getElementById('coefficients-body');
    if (!tbody) return;
    
    COMPARTMENTS.forEach(comp => {
        const m0 = comp.aN2 + SURFACE_PRESSURE / comp.bN2;  // M-value at surface
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="color: ${comp.color}; font-weight: bold;">${comp.id}</td>
            <td>${comp.halfTime}</td>
            <td>${comp.aN2.toFixed(4)}</td>
            <td>${comp.bN2.toFixed(4)}</td>
            <td>${m0.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}

// ============================================================================
// PROFILE LOADING
// ============================================================================

/**
 * Load the currently selected dive profile and calculate tissue loading
 */
async function loadSelectedProfile() {
    const selector = document.getElementById('profile-switcher');
    if (!selector) return;
    
    try {
        const selectedId = selector.value;
        let profileData = null;
        
        if (selectedId === 'current-setup') {
            // Load from localStorage first, then fall back to JSON
            profileData = await loadDiveSetup();
        } else {
            // Load from dive-profiles.json (preset profiles)
            const profilesResponse = await fetch('data/dive-profiles.json');
            const profilesData = await profilesResponse.json();
            profileData = profilesData.profiles.find(p => p.id === selectedId);
        }
        
        if (!profileData) {
            console.error('Profile not found:', selectedId);
            return;
        }
        
        // Use getDiveSetupWaypoints for consistent waypoint extraction
        currentProfile = getDiveSetupWaypoints(profileData);
        
        console.log('Loaded profile:', selectedId, 'waypoints:', currentProfile?.length);
        
        if (!currentProfile || !Array.isArray(currentProfile) || currentProfile.length < 2) {
            console.error('Invalid profile waypoints:', currentProfile);
            return;
        }
        
        // Use gases from the profile if available
        currentGases = getGases(profileData);
        
        // Update summary
        const summary = document.getElementById('profile-header-summary');
        if (summary) {
            const maxDepth = Math.max(...currentProfile.map(wp => wp.depth));
            const duration = currentProfile[currentProfile.length - 1].time;
            summary.textContent = `${maxDepth}m / ${duration} min`;
        }
        
        // Calculate tissue loading
        const options = currentGases ? { gases: currentGases } : {};
        diveResults = calculateTissueLoading(currentProfile, 0, options);  // No surface interval for now
        
        // Reset timeline
        currentTimeIndex = 0;
        const slider = document.getElementById('timeline-slider');
        if (slider) slider.value = 0;
        
        updateTimelineDisplay();
        createChart();
        
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

// ============================================================================
// CHART CREATION & UPDATE
// ============================================================================

/**
 * Create the M-value pressure-pressure chart
 */
function createChart() {
    const canvas = document.getElementById('mvalue-chart');
    if (!canvas || !diveResults) return;
    
    // Destroy existing chart
    if (chart) {
        chart.destroy();
    }
    
    const datasets = buildDatasets();
    const { minP, maxP } = calculateAxisBounds();
    
    chart = new Chart(canvas, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                title: {
                    display: true,
                    text: getChartTitle(),
                    font: { size: 16 }
                },
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const x = context.parsed.x.toFixed(2);
                            const y = context.parsed.y.toFixed(2);
                            return `${context.dataset.label}: (${x} bar, ${y} bar)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Ambient Pressure (bar)',
                        font: { size: 14 }
                    },
                    min: minP,
                    max: maxP,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Tissue N₂ Pressure (bar)',
                        font: { size: 14 }
                    },
                    min: minP,
                    max: maxP,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            }
        }
    });
}

/**
 * Get chart title based on visible compartments
 */
function getChartTitle() {
    const count = visibleCompartments.size;
    if (count === 0) return 'M-Value Diagram - No compartments selected';
    if (count === 1) {
        const compId = Array.from(visibleCompartments)[0];
        const comp = COMPARTMENTS.find(c => c.id === compId);
        return `M-Value Diagram - TC${comp.id} (${comp.halfTime} min half-time)`;
    }
    if (count === 16) return 'M-Value Diagram - All Compartments';
    return `M-Value Diagram - ${count} Compartments`;
}

/**
 * Build chart datasets for all visible compartments
 */
function buildDatasets() {
    const { minP, maxP } = calculateAxisBounds();
    const datasets = [];
    
    // 1. Ambient Line (y = x) - diagonal reference (supersaturation threshold)
    datasets.push({
        label: 'Ambient Line (y = x)',
        data: [
            { x: minP, y: minP },
            { x: maxP, y: maxP }
        ],
        type: 'line',
        borderColor: CHART_CONFIG.ambientLineColor,
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
        order: 100
    });
    
    // 1b. Alveolar ppN2 Line (y = 0.79x) - off-gassing threshold
    // This is where tissue pressure equals alveolar ppN2 (for air: 79% N2)
    const fN2 = 0.79;  // N2 fraction in air
    datasets.push({
        label: 'Alveolar ppN₂ (y = 0.79x)',
        data: [
            { x: minP, y: minP * fN2 },
            { x: maxP, y: maxP * fN2 }
        ],
        type: 'line',
        borderColor: CHART_CONFIG.alveolarLineColor,
        borderWidth: 2,
        borderDash: [8, 4],
        pointRadius: 0,
        fill: false,
        order: 99
    });
    
    // 2. Surface Line (x = 1 bar) - vertical dotted
    datasets.push({
        label: 'Surface (1 bar)',
        data: [
            { x: SURFACE_PRESSURE, y: minP },
            { x: SURFACE_PRESSURE, y: maxP }
        ],
        type: 'line',
        borderColor: CHART_CONFIG.surfaceLineColor,
        borderWidth: 2,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false,
        order: 99
    });
    
    // 3. For each visible compartment: M-value line, trail, and current point
    let order = 50;  // M-value lines get middle priority
    
    // Get visible compartments sorted by ID
    const sortedComps = COMPARTMENTS.filter(c => visibleCompartments.has(c.id));
    
    // M-value lines for each compartment
    sortedComps.forEach(comp => {
        const mValuePoints = [];
        for (let x = minP; x <= maxP; x += 0.1) {
            const y = comp.aN2 + x / comp.bN2;
            mValuePoints.push({ x, y });
        }
        
        datasets.push({
            label: `M-Value TC${comp.id}`,
            data: mValuePoints,
            type: 'line',
            borderColor: comp.color,
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            order: order--
        });
    });
    
    // Tissue trails for each compartment
    order = 20;
    sortedComps.forEach(comp => {
        const trailData = [];
        for (let i = 0; i <= currentTimeIndex; i++) {
            const ambient = diveResults.ambientPressures[i];
            const tissueN2 = diveResults.compartments[comp.id].pressures[i];
            trailData.push({ x: ambient, y: tissueN2 });
        }
        
        datasets.push({
            label: `Trail TC${comp.id}`,
            data: trailData,
            type: 'line',
            borderColor: comp.color + '80',  // Semi-transparent
            backgroundColor: comp.color + '80',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.1,
            order: order--
        });
    });
    
    // Current position points for each compartment
    if (currentTimeIndex < diveResults.timePoints.length) {
        order = 5;
        sortedComps.forEach(comp => {
            const currentAmbient = diveResults.ambientPressures[currentTimeIndex];
            const currentTissue = diveResults.compartments[comp.id].pressures[currentTimeIndex];
            
            datasets.push({
                label: `TC${comp.id}`,
                data: [{ x: currentAmbient, y: currentTissue }],
                type: 'scatter',
                backgroundColor: comp.color,
                borderColor: '#ffffff',
                borderWidth: 2,
                pointRadius: CHART_CONFIG.currentPointRadius,
                pointHoverRadius: CHART_CONFIG.currentPointRadius + 2,
                order: order--
            });
        });
    }
    
    return datasets;
}

/**
 * Calculate appropriate axis bounds based on dive profile and visible compartments
 */
function calculateAxisBounds() {
    if (!diveResults) {
        return { minP: CHART_CONFIG.minPressure, maxP: CHART_CONFIG.maxPressure };
    }
    
    // Find max ambient pressure (from max depth)
    const maxAmbient = Math.max(...diveResults.ambientPressures);
    
    // Find max tissue pressure across ALL visible compartments
    let maxTissue = 0;
    
    COMPARTMENTS.forEach(comp => {
        if (visibleCompartments.has(comp.id)) {
            const tissueMax = Math.max(...diveResults.compartments[comp.id].pressures);
            maxTissue = Math.max(maxTissue, tissueMax);
        }
    });
    
    // Scale based on what actually happens in the dive:
    // - Must show max ambient (deepest point on X-axis)
    // - Must show max tissue pressure (highest point on Y-axis)
    // - Add 20% margin for M-value line context above tissue path
    const maxP = Math.max(maxAmbient, maxTissue) * 1.2;
    
    return {
        minP: CHART_CONFIG.minPressure,
        maxP: Math.ceil(maxP * 2) / 2  // Round to nearest 0.5
    };
}

/**
 * Update chart with current state (called when timeline or compartment changes)
 */
function updateChart() {
    if (!chart || !diveResults) return;
    
    const datasets = buildDatasets();
    const { minP, maxP } = calculateAxisBounds();
    
    chart.data.datasets = datasets;
    chart.options.plugins.title.text = getChartTitle();
    chart.options.scales.x.min = minP;
    chart.options.scales.x.max = maxP;
    chart.options.scales.y.min = minP;
    chart.options.scales.y.max = maxP;
    
    chart.update('none');  // No animation for smooth slider updates
}

/**
 * Update the timeline info display
 */
function updateTimelineDisplay() {
    if (!diveResults) return;
    
    const tissueSpan = document.getElementById('timeline-tissue');
    const overlayTime = document.getElementById('overlay-time');
    const overlayDepth = document.getElementById('overlay-depth');
    
    if (currentTimeIndex >= diveResults.timePoints.length) {
        currentTimeIndex = diveResults.timePoints.length - 1;
    }
    
    const time = diveResults.timePoints[currentTimeIndex];
    const depth = diveResults.depthPoints[currentTimeIndex];
    
    // Format time as MM:SS
    const minutes = Math.floor(time);
    const seconds = Math.round((time - minutes) * 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Update overlay on chart (prominent display)
    if (overlayTime) overlayTime.textContent = timeStr;
    if (overlayDepth) overlayDepth.textContent = `${depth.toFixed(0)}m`;
    
    // Update info bar below chart - show tissue info for visible compartments
    if (tissueSpan) {
        if (visibleCompartments.size === 0) {
            tissueSpan.textContent = 'No compartments selected';
        } else if (visibleCompartments.size === 1) {
            const compId = Array.from(visibleCompartments)[0];
            const tissueN2 = diveResults.compartments[compId].pressures[currentTimeIndex];
            tissueSpan.textContent = `TC${compId} N₂: ${tissueN2.toFixed(2)} bar`;
        } else {
            tissueSpan.textContent = `${visibleCompartments.size} compartments`;
        }
    }
}
