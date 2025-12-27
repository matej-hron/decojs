/**
 * Main Application Entry Point
 * 
 * Connects UI, dive profile, calculations, and visualization
 */

import { COMPARTMENTS, getCompartmentCategory } from './tissueCompartments.js';
import { calculateTissueLoading, getInitialTissueN2 } from './decoModel.js';
import { createDefaultProfile, validateProfile, parseProfileInput, getDiveStats } from './diveProfile.js';
import { renderChart, toggleCompartment, showAllCompartments, hideAllCompartments, showOnlyCompartments } from './visualization.js';

// ============================================================================
// STATE
// ============================================================================

let currentProfile = [];
let visibleCompartments = new Set(COMPARTMENTS.map(c => c.id));

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const profileBody = document.getElementById('profile-body');
const addWaypointBtn = document.getElementById('add-waypoint');
const loadExampleBtn = document.getElementById('load-example');
const calculateBtn = document.getElementById('calculate-btn');
const surfaceIntervalInput = document.getElementById('surface-interval');
const validationErrors = document.getElementById('validation-errors');
const diveStatsDiv = document.getElementById('dive-stats');
const compartmentToggles = document.getElementById('compartment-toggles');
const chartCanvas = document.getElementById('tissue-chart');

// Compartment control buttons
const showAllBtn = document.getElementById('show-all');
const hideAllBtn = document.getElementById('hide-all');
const showFastBtn = document.getElementById('show-fast');
const showMediumBtn = document.getElementById('show-medium');
const showSlowBtn = document.getElementById('show-slow');

// ============================================================================
// PROFILE TABLE MANAGEMENT
// ============================================================================

/**
 * Add a row to the profile table
 */
function addProfileRow(time = '', depth = '') {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="number" class="time-input" value="${time}" min="0" step="1" placeholder="0"></td>
        <td><input type="number" class="depth-input" value="${depth}" min="0" step="1" placeholder="0"></td>
        <td><button class="btn btn-danger remove-row">×</button></td>
    `;
    
    // Add remove handler
    row.querySelector('.remove-row').addEventListener('click', () => {
        if (profileBody.children.length > 2) {
            row.remove();
        } else {
            alert('Profile must have at least 2 waypoints');
        }
    });
    
    profileBody.appendChild(row);
}

/**
 * Clear and reload the profile table
 */
function loadProfileToTable(profile) {
    profileBody.innerHTML = '';
    profile.forEach(wp => {
        addProfileRow(wp.time, wp.depth);
    });
}

/**
 * Read profile from table inputs
 */
function readProfileFromTable() {
    const rows = profileBody.querySelectorAll('tr');
    const profile = [];
    
    rows.forEach(row => {
        const timeInput = row.querySelector('.time-input');
        const depthInput = row.querySelector('.depth-input');
        
        if (timeInput && depthInput) {
            profile.push({
                time: parseFloat(timeInput.value) || 0,
                depth: parseFloat(depthInput.value) || 0
            });
        }
    });
    
    return profile;
}

// ============================================================================
// COMPARTMENT TOGGLES
// ============================================================================

/**
 * Initialize compartment toggle checkboxes
 */
function initCompartmentToggles() {
    COMPARTMENTS.forEach(comp => {
        const label = document.createElement('label');
        label.className = 'compartment-toggle';
        label.innerHTML = `
            <input type="checkbox" data-compartment="${comp.id}" checked>
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
 * Validate current profile and show errors
 */
function validateAndShowErrors() {
    const profile = readProfileFromTable();
    const result = validateProfile(profile);
    
    if (result.errors.length > 0) {
        validationErrors.innerHTML = result.errors.map(e => `<div>${e}</div>`).join('');
    } else {
        validationErrors.innerHTML = '';
    }
    
    return result;
}

/**
 * Show dive statistics
 */
function showDiveStats(profile) {
    const stats = getDiveStats(profile);
    
    if (stats) {
        diveStatsDiv.innerHTML = `
            <strong>Dive Summary:</strong> 
            Max Depth: ${stats.maxDepth}m | 
            Total Time: ${stats.totalTime} min | 
            Max Descent Rate: ${stats.maxDescentRate.toFixed(1)} m/min | 
            Max Ascent Rate: ${stats.maxAscentRate.toFixed(1)} m/min
        `;
        diveStatsDiv.classList.add('visible');
    } else {
        diveStatsDiv.classList.remove('visible');
    }
}

// ============================================================================
// CALCULATION & VISUALIZATION
// ============================================================================

/**
 * Run calculation and update chart
 */
function runCalculation() {
    const profile = readProfileFromTable();
    const validation = validateProfile(profile);
    
    // Show errors
    if (validation.errors.length > 0) {
        validationErrors.innerHTML = validation.errors.map(e => `<div>${e}</div>`).join('');
    } else {
        validationErrors.innerHTML = '';
    }
    
    // Don't proceed if invalid
    if (!validation.valid) {
        return;
    }
    
    // Get surface interval
    const surfaceInterval = parseFloat(surfaceIntervalInput.value) || 60;
    
    // Run calculation
    try {
        const results = calculateTissueLoading(profile, surfaceInterval);
        
        // Show stats
        showDiveStats(profile);
        
        // Render chart
        renderChart(chartCanvas, results, visibleCompartments);
        
        // Scroll to chart
        chartCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
    } catch (error) {
        validationErrors.innerHTML = `<div>Calculation error: ${error.message}</div>`;
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
    // Add waypoint
    addWaypointBtn.addEventListener('click', () => {
        addProfileRow('', '');
    });
    
    // Load example
    loadExampleBtn.addEventListener('click', () => {
        loadProfileToTable(createDefaultProfile());
    });
    
    // Calculate
    calculateBtn.addEventListener('click', runCalculation);
    
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
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    // Load default profile
    loadProfileToTable(createDefaultProfile());
    
    // Initialize UI components
    initCompartmentToggles();
    initReferenceTable();
    initEventListeners();
    
    // Render math formulas
    renderMathFormulas();
    
    // Run initial calculation
    runCalculation();
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
