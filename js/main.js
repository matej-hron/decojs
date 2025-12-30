/**
 * Main Application Entry Point
 * 
 * Connects UI, dive profile, calculations, and visualization
 */

import { COMPARTMENTS, getCompartmentCategory } from './tissueCompartments.js';
import { calculateTissueLoading, getInitialTissueN2 } from './decoModel.js';
import { validateProfile, getDiveStats } from './diveProfile.js';
import { renderChart, toggleCompartment, showAllCompartments, hideAllCompartments, showOnlyCompartments } from './visualization.js';
import { loadDiveSetup, getDiveSetupWaypoints, getSurfaceInterval, formatDiveSetupSummary, saveDiveSetup, clearCache, getGases, getGasSwitchEvents } from './diveSetup.js';

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Debounce function - delays execution until after wait ms have elapsed
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================================================
// STATE
// ============================================================================

let currentProfile = [];
// Default: only show fastest compartment (id=1, 5-min half-time)
let visibleCompartments = new Set([1]);
// Available dive profiles (loaded from JSON)
let availableProfiles = [];

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const profileSwitcher = document.getElementById('profile-switcher');
const profileHeaderSummary = document.getElementById('profile-header-summary');
const compartmentToggles = document.getElementById('compartment-toggles');
const chartCanvas = document.getElementById('tissue-chart');

// Compartment control buttons
const showAllBtn = document.getElementById('show-all');
const hideAllBtn = document.getElementById('hide-all');
const showFastBtn = document.getElementById('show-fast');
const showMediumBtn = document.getElementById('show-medium');
const showSlowBtn = document.getElementById('show-slow');

// Fullscreen controls
const chartContainer = document.getElementById('chart-container');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');

// ============================================================================
// PROFILE LOADING & SWITCHING
// ============================================================================

/**
 * Load available dive profiles from JSON
 */
async function loadAvailableProfiles() {
    try {
        const response = await fetch('data/dive-profiles.json');
        if (!response.ok) {
            throw new Error(`Failed to load profiles: ${response.status}`);
        }
        const data = await response.json();
        availableProfiles = data.profiles || [];
        return data.defaultProfileId || 'deco-dive';
    } catch (error) {
        console.error('Error loading dive profiles:', error);
        availableProfiles = [];
        return null;
    }
}

/**
 * Initialize the profile switcher dropdown
 * @param {Object} setup - Current dive setup with id and name
 */
function initProfileSwitcher(setup) {
    if (!profileSwitcher) return;
    
    // Clear existing options
    profileSwitcher.innerHTML = '';
    
    // Check if current setup is a predefined profile
    const isPredefined = setup.id && availableProfiles.find(p => p.id === setup.id);
    
    // Add custom option - show actual name if it's a custom profile
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = isPredefined ? '✏️ Custom Profile' : `✏️ ${setup.name || 'Custom Profile'}`;
    profileSwitcher.appendChild(customOption);
    
    // Add separator
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '──────────────';
    profileSwitcher.appendChild(separator);
    
    // Add predefined profiles
    availableProfiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name;
        profileSwitcher.appendChild(option);
    });
    
    // Set current selection
    if (isPredefined) {
        profileSwitcher.value = setup.id;
    } else {
        profileSwitcher.value = 'custom';
    }
    
    // Handle profile switching
    profileSwitcher.addEventListener('change', handleProfileSwitch);
}

/**
 * Handle profile switch from dropdown
 */
async function handleProfileSwitch(event) {
    const selectedId = event.target.value;
    
    if (selectedId === 'custom') {
        // Navigate to dive setup page for custom editing
        window.location.href = 'dive-setup.html';
        return;
    }
    
    // Find the selected profile
    const profile = availableProfiles.find(p => p.id === selectedId);
    if (!profile) return;
    
    // Update current setup
    currentDiveSetup = profile;
    
    // Save to localStorage so it persists
    saveDiveSetup(profile);
    clearCache();
    
    // Update display
    displayProfileSummary(profile);
    
    // Recalculate
    runCalculation(false);
}

/**
 * Display the current dive profile summary in the header bar
 */
function displayProfileSummary(setup) {
    if (!profileHeaderSummary) return;
    
    // Use getDiveSetupWaypoints to handle both single and multi-dive formats
    const waypoints = getDiveSetupWaypoints(setup);
    const maxDepth = waypoints.length > 0 ? Math.max(...waypoints.map(wp => wp.depth)) : 0;
    const totalTime = waypoints[waypoints.length - 1]?.time || 0;
    
    // Get gases - use getGases for multi-gas support
    const gases = getGases(setup);
    const gasNames = gases.map(g => g.name).join(', ');
    
    // Check if multi-dive
    const diveCount = setup.dives?.length || 1;
    const diveInfo = diveCount > 1 ? ` (${diveCount} dives)` : '';
    
    // Update profile name label
    const profileLabel = document.querySelector('.profile-header-label');
    if (profileLabel) {
        profileLabel.textContent = setup.name || 'Profile:';
    }
    
    profileHeaderSummary.textContent = `${maxDepth}m max, ${totalTime} min, ${gasNames}${diveInfo}`;
    
    // Update switcher selection if needed
    if (profileSwitcher) {
        const matchingProfile = availableProfiles.find(p => p.id === setup.id);
        profileSwitcher.value = matchingProfile ? setup.id : 'custom';
        
        // Update custom option text if it's a custom profile
        if (!matchingProfile) {
            const customOption = profileSwitcher.querySelector('option[value="custom"]');
            if (customOption) {
                customOption.textContent = `✏️ ${setup.name || 'Custom Profile'}`;
            }
        }
    }
}

// ============================================================================
// COMPARTMENT TOGGLES
// ============================================================================

/**
 * Initialize compartment toggle checkboxes
 */
function initCompartmentToggles() {
    COMPARTMENTS.forEach(comp => {
        const isChecked = visibleCompartments.has(comp.id);
        const label = document.createElement('label');
        label.className = 'compartment-toggle';
        label.innerHTML = `
            <input type="checkbox" data-compartment="${comp.id}" ${isChecked ? 'checked' : ''}>
            <span class="color-dot" style="background-color: ${comp.color}"></span>
            <span>${comp.label}</span>
        `;
        
        label.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                visibleCompartments.add(comp.id);
            } else {
                visibleCompartments.delete(comp.id);
            }
            toggleCompartment(comp.id, e.target.checked);
        });
        
        compartmentToggles.appendChild(label);
    });
}

/**
 * Update checkbox states to match visibility set
 */
function syncCheckboxes() {
    const checkboxes = compartmentToggles.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        const id = parseInt(cb.dataset.compartment);
        cb.checked = visibleCompartments.has(id);
    });
}

// ============================================================================
// REFERENCE TABLE
// ============================================================================

/**
 * Populate the reference table with compartment data
 */
function initReferenceTable() {
    const tbody = document.getElementById('reference-body');
    
    COMPARTMENTS.forEach(comp => {
        const saturationTime = Math.round(comp.halfTime * 6); // 6 half-times ≈ 98%
        const hours = Math.floor(saturationTime / 60);
        const mins = saturationTime % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="color-dot" style="background-color: ${comp.color}; display: inline-block;"></span> ${comp.id}</td>
            <td>${comp.halfTime} min</td>
            <td>${getCompartmentCategory(comp.halfTime)}</td>
            <td>${comp.label.split(' - ')[1] || comp.label}</td>
            <td>${timeStr}</td>
        `;
        tbody.appendChild(row);
    });
}

// ============================================================================
// VALIDATION & STATS
// ============================================================================

/**
 * Show dive statistics (removed - no longer displayed separately)
 */
function showDiveStats(profile) {
    // Stats are now shown in the header summary
}

// ============================================================================
// CALCULATION & VISUALIZATION
// ============================================================================

/**
 * Run calculation and update chart
 * @param {boolean} scrollToChart - Whether to scroll to chart after calculation (default: true)
 */
function runCalculation(scrollToChart = true) {
    // Guard: need dive setup to be loaded
    if (!currentDiveSetup) {
        console.warn('Dive setup not loaded yet');
        return;
    }
    
    // Use stored profile from diveSetup
    const profile = getDiveSetupWaypoints(currentDiveSetup);
    const validation = validateProfile(profile);
    
    // Don't proceed if invalid
    if (!validation.valid) {
        console.warn('Invalid profile:', validation.errors);
        return;
    }
    
    // Get surface interval and gases from dive setup
    const surfaceInterval = getSurfaceInterval(currentDiveSetup);
    const gases = getGases(currentDiveSetup);
    
    // Run calculation with multi-gas support
    try {
        const results = calculateTissueLoading(profile, surfaceInterval, { gases });
        
        // Get gas switch events for visualization
        const gasSwitchEvents = getGasSwitchEvents(profile, gases);
        
        // Show stats
        showDiveStats(profile);
        
        // Render chart and store reference for fullscreen resize
        window.tissueChart = renderChart(chartCanvas, results, visibleCompartments, gasSwitchEvents);
        
        // Scroll to chart (only when user clicks Calculate, not on initial load)
        if (scrollToChart) {
            chartCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
    } catch (error) {
        console.error('Calculation error:', error);
    }
}

// ============================================================================
// MATH RENDERING
// ============================================================================

/**
 * Render math formulas using KaTeX
 */
function renderMathFormulas() {
    // Render block formulas
    const formulas = document.querySelectorAll('.formula');
    formulas.forEach(el => {
        try {
            katex.render(el.textContent, el, { displayMode: true });
        } catch (e) {
            console.warn('KaTeX error:', e);
        }
    });
    
    // Render inline formulas
    const inlineFormulas = document.querySelectorAll('.formula-inline');
    inlineFormulas.forEach(el => {
        try {
            katex.render(el.textContent, el, { displayMode: false });
        } catch (e) {
            console.warn('KaTeX inline error:', e);
        }
    });
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initEventListeners() {
    // Compartment visibility controls
    showAllBtn.addEventListener('click', () => {
        visibleCompartments = new Set(COMPARTMENTS.map(c => c.id));
        syncCheckboxes();
        showAllCompartments();
    });
    
    hideAllBtn.addEventListener('click', () => {
        visibleCompartments.clear();
        syncCheckboxes();
        hideAllCompartments();
    });
    
    showFastBtn.addEventListener('click', () => {
        visibleCompartments = new Set(COMPARTMENTS.filter(c => c.halfTime <= 12.5).map(c => c.id));
        syncCheckboxes();
        showOnlyCompartments(visibleCompartments);
    });
    
    showMediumBtn.addEventListener('click', () => {
        visibleCompartments = new Set(COMPARTMENTS.filter(c => c.halfTime > 12.5 && c.halfTime <= 77).map(c => c.id));
        syncCheckboxes();
        showOnlyCompartments(visibleCompartments);
    });
    
    showSlowBtn.addEventListener('click', () => {
        visibleCompartments = new Set(COMPARTMENTS.filter(c => c.halfTime > 77).map(c => c.id));
        syncCheckboxes();
        showOnlyCompartments(visibleCompartments);
    });
    
    // Listen for chart legend clicks to sync checkboxes
    chartCanvas.addEventListener('compartmentToggle', (e) => {
        const { compartmentId, visible } = e.detail;
        if (visible) {
            visibleCompartments.add(compartmentId);
        } else {
            visibleCompartments.delete(compartmentId);
        }
        syncCheckboxes();
    });
    
    // Fullscreen toggle
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    exitFullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // Exit fullscreen on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chartContainer.classList.contains('fullscreen')) {
            toggleFullscreen();
        }
    });
}

/**
 * Toggle fullscreen mode for the chart
 */
function toggleFullscreen() {
    const isFullscreen = chartContainer.classList.toggle('fullscreen');
    
    // Prevent body scroll when fullscreen
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    
    // Resize chart to fit new container size
    if (window.tissueChart) {
        setTimeout(() => {
            window.tissueChart.resize();
        }, 50);
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Store loaded dive setup for reuse
let currentDiveSetup = null;

async function init() {
    // Load available profiles for the switcher
    const defaultProfileId = await loadAvailableProfiles();
    
    // Load dive profile from shared setup (localStorage or JSON)
    currentDiveSetup = await loadDiveSetup();
    
    // Initialize the profile switcher dropdown
    initProfileSwitcher(currentDiveSetup);
    
    // Display profile summary
    displayProfileSummary(currentDiveSetup);
    
    // Initialize UI components
    initCompartmentToggles();
    initReferenceTable();
    initEventListeners();
    
    // Render math formulas
    renderMathFormulas();
    
    // Run initial calculation (without scrolling to chart)
    runCalculation(false);
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
