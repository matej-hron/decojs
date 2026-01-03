/**
 * Dive Setup Editor Component
 * 
 * A reusable, embeddable editor component for creating and editing dive profiles.
 * Follows the same pattern as DiveProfileChart and MValueChart for consistency.
 * 
 * Features:
 * - Gas management (add/edit/remove gases with cylinder info)
 * - Waypoint editor (table with add/edit/remove/reorder)
 * - Gradient Factor sliders with presets
 * - Quick Setup mode (depth + bottom time auto-generates profile)
 * - Profile presets dropdown
 * - Import/Export JSON
 * - Multi-dive support (repetitive diving)
 * - Emits 'change' events with updated DiveSetup
 * 
 * Usage:
 *   import { DiveSetupEditor } from './components/DiveSetupEditor.js';
 *   
 *   const editor = new DiveSetupEditor(containerElement, {
 *     diveSetup: initialSetup,
 *     options: { showQuickSetup: true, showProfiles: true }
 *   });
 *   
 *   // Listen for changes
 *   editor.addEventListener('change', (e) => {
 *     console.log('New setup:', e.detail.diveSetup);
 *   });
 *   
 *   // Get current setup
 *   const setup = editor.getDiveSetup();
 *   
 *   // Update setup programmatically
 *   editor.setDiveSetup(newSetup);
 *   
 *   // Destroy when done
 *   editor.destroy();
 */

import {
    BOTTOM_GASES,
    DECO_GASES,
    BOTTOM_CYLINDERS,
    STAGE_CYLINDERS,
    DEFAULT_GF_LOW,
    DEFAULT_GF_HIGH,
    DEFAULT_START_PRESSURE,
    getBottomGas,
    getDecoGas,
    getPredefinedGas,
    calculateMOD,
    generateDecoProfile,
    getNDLForDepth,
    getGases,
    insertGasSwitchWaypoints,
    getGasSwitchEvents,
    GAS_SWITCH_TIME
} from '../diveSetup.js';

import {
    validateDiveSetup,
    normalizeDiveSetup
} from '../charts/chartTypes.js';

/**
 * Default editor options
 */
const DEFAULT_EDITOR_OPTIONS = {
    showQuickSetup: true,
    showGradientFactors: true,
    showProfiles: true,
    showImportExport: true,
    showDescription: true,
    showSurfaceInterval: true,
    showMultiDive: true,
    showAutoGasSwitch: true,
    compact: false,
    maxGases: 4,
    emitOnInput: true  // Emit change events on every input (vs only on save)
};

/**
 * Merge user options with defaults
 */
function mergeOptions(defaults, userOptions) {
    if (!userOptions) return { ...defaults };
    return { ...defaults, ...userOptions };
}

/**
 * DiveSetupEditor - Embeddable dive configuration editor
 */
export class DiveSetupEditor extends EventTarget {
    /**
     * Create a new DiveSetupEditor
     * @param {HTMLElement} container - Container element for the editor
     * @param {Object} config - Configuration object
     * @param {Object} [config.diveSetup] - Initial dive setup configuration
     * @param {Array} [config.profiles] - Predefined profiles to show in dropdown
     * @param {Object} [config.options] - Editor display options
     */
    constructor(container, config = {}) {
        super();
        
        this.container = container;
        this.options = mergeOptions(DEFAULT_EDITOR_OPTIONS, config.options);
        this.profiles = config.profiles || [];
        
        // State
        this.currentGases = [];
        this.hasDive2 = false;
        this.selectedProfileId = null;
        this.currentProfileName = null; // Stores the loaded profile name
        
        // DOM references
        this.elements = {};
        
        // Initialize dive setup
        if (config.diveSetup) {
            const validation = validateDiveSetup(config.diveSetup);
            if (!validation.valid) {
                console.warn('DiveSetupEditor: Invalid initial dive setup', validation.errors);
            }
            this.diveSetup = normalizeDiveSetup(config.diveSetup);
        } else {
            this.diveSetup = this._getDefaultSetup();
        }
        
        // Build the editor UI
        this._buildDOM();
        
        // Populate with initial data
        this._populateFromSetup(this.diveSetup);
    }
    
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    /**
     * Get the current dive setup
     * @returns {Object} Current dive setup configuration
     */
    getDiveSetup() {
        return this._buildSetupFromForm();
    }
    
    /**
     * Set a new dive setup
     * @param {Object} diveSetup - New dive setup configuration
     * @param {boolean} [emitChange=false] - Whether to emit a change event
     */
    setDiveSetup(diveSetup, emitChange = false) {
        const validation = validateDiveSetup(diveSetup);
        if (!validation.valid) {
            console.warn('DiveSetupEditor: Invalid dive setup', validation.errors);
        }
        this.diveSetup = normalizeDiveSetup(diveSetup);
        this._populateFromSetup(this.diveSetup);
        
        if (emitChange) {
            this._emitChange();
        }
    }
    
    /**
     * Load predefined profiles
     * @param {Array} profiles - Array of profile objects
     */
    setProfiles(profiles) {
        this.profiles = profiles || [];
        this._renderProfileSelector();
    }
    
    /**
     * Get validation errors for current setup
     * @returns {{valid: boolean, errors: string[]}}
     */
    validate() {
        const setup = this._buildSetupFromForm();
        return this._validateSetup(setup);
    }
    
    /**
     * Export current setup as JSON
     * @returns {Object} Exportable setup object
     */
    exportSetup() {
        const setup = this._buildSetupFromForm();
        return {
            ...setup,
            exportedAt: new Date().toISOString(),
            exportVersion: '1.0'
        };
    }
    
    /**
     * Import setup from JSON object
     * @param {Object} importedSetup - Setup object to import
     */
    importSetup(importedSetup) {
        // Clean up import metadata
        const setup = { ...importedSetup };
        delete setup.exportedAt;
        delete setup.exportVersion;
        
        this.setDiveSetup(setup, true);
    }
    
    /**
     * Destroy the editor and clean up
     */
    destroy() {
        this.container.innerHTML = '';
        this.elements = {};
    }
    
    // =========================================================================
    // DOM BUILDING
    // =========================================================================
    
    /**
     * Build the editor's DOM structure
     * @private
     */
    _buildDOM() {
        this.container.innerHTML = '';
        this.container.classList.add('dive-setup-editor');
        
        const wrapper = document.createElement('div');
        wrapper.className = 'dse-wrapper';
        
        // Profile name header (auto-generated)
        wrapper.appendChild(this._buildProfileHeader());
        
        // Profile selector (if profiles provided)
        if (this.options.showProfiles && this.profiles.length > 0) {
            wrapper.appendChild(this._buildProfileSelector());
        }
        
        // Quick Setup section
        if (this.options.showQuickSetup) {
            wrapper.appendChild(this._buildQuickSetup());
        }
        
        // Gases section
        wrapper.appendChild(this._buildGasesSection());
        
        // Gradient Factors section
        if (this.options.showGradientFactors) {
            wrapper.appendChild(this._buildGradientFactors());
        }
        
        // Waypoints section (Dive 1)
        wrapper.appendChild(this._buildWaypointsSection(1));
        
        // Multi-dive support
        if (this.options.showMultiDive) {
            wrapper.appendChild(this._buildDive2Controls());
            wrapper.appendChild(this._buildWaypointsSection(2));
        }
        
        // Surface interval
        if (this.options.showSurfaceInterval) {
            wrapper.appendChild(this._buildSurfaceInterval());
        }
        
        // Description
        if (this.options.showDescription) {
            wrapper.appendChild(this._buildDescription());
        }
        
        // Import/Export buttons
        if (this.options.showImportExport) {
            wrapper.appendChild(this._buildImportExport());
        }
        
        // Validation errors display
        wrapper.appendChild(this._buildValidationErrors());
        
        this.container.appendChild(wrapper);
    }
    
    _buildProfileHeader() {
        const section = document.createElement('div');
        section.className = 'dse-profile-header';
        section.innerHTML = `
            <div class="dse-profile-name">
                <span class="dse-profile-icon">🤿</span>
                <span class="dse-profile-name-text">New Dive</span>
            </div>
            <div class="dse-profile-stats">
                <span class="dse-stat dse-stat-depth" title="Max depth">--m</span>
                <span class="dse-stat dse-stat-time" title="Total time">--min</span>
                <span class="dse-stat dse-stat-gf" title="Gradient factors">GF --/--</span>
            </div>
        `;
        
        this.elements.profileNameText = section.querySelector('.dse-profile-name-text');
        this.elements.statDepth = section.querySelector('.dse-stat-depth');
        this.elements.statTime = section.querySelector('.dse-stat-time');
        this.elements.statGF = section.querySelector('.dse-stat-gf');
        
        return section;
    }
    
    _updateProfileHeader() {
        const waypoints = this._readWaypointsFromTable(this.elements.waypointsBody);
        const waypoints2 = this.hasDive2 ? this._readWaypointsFromTable(this.elements.waypointsBody2) : [];
        const allWaypoints = [...waypoints, ...waypoints2];
        
        const maxDepth = allWaypoints.length > 0 ? Math.max(...allWaypoints.map(wp => wp.depth), 0) : 0;
        const totalTime = allWaypoints.length > 0 ? Math.max(...allWaypoints.map(wp => wp.time), 0) : 0;
        const gasNames = this.currentGases.map(g => g.name).join(' + ');
        const gfLow = this.elements.gfLowInput?.value || 100;
        const gfHigh = this.elements.gfHighInput?.value || 100;
        
        // Use saved profile name if available, otherwise generate one
        const displayName = this.currentProfileName || 
            (maxDepth > 0 ? `${maxDepth}m ${gasNames}` : 'New Dive');
        
        if (this.elements.profileNameText) {
            this.elements.profileNameText.textContent = displayName;
        }
        if (this.elements.statDepth) {
            this.elements.statDepth.textContent = `${maxDepth}m`;
        }
        if (this.elements.statTime) {
            this.elements.statTime.textContent = `${totalTime}min`;
        }
        if (this.elements.statGF) {
            this.elements.statGF.textContent = `GF ${gfLow}/${gfHigh}`;
        }
    }
    
    _buildProfileSelector() {
        const section = document.createElement('div');
        section.className = 'dse-section dse-profiles';
        section.innerHTML = `
            <label class="dse-label">Load Profile:</label>
            <select class="dse-profile-select form-select"></select>
        `;
        
        this.elements.profileSelect = section.querySelector('.dse-profile-select');
        this._renderProfileSelector();
        
        this.elements.profileSelect.addEventListener('change', () => {
            const profileId = this.elements.profileSelect.value;
            if (profileId) {
                const profile = this.profiles.find(p => p.id === profileId);
                if (profile) {
                    this.setDiveSetup(profile, true);
                    this.selectedProfileId = profileId;
                }
            }
        });
        
        return section;
    }
    
    _renderProfileSelector() {
        if (!this.elements.profileSelect) return;
        
        this.elements.profileSelect.innerHTML = `
            <option value="">-- Select Profile --</option>
            ${this.profiles.map(p => `
                <option value="${p.id}" ${this.selectedProfileId === p.id ? 'selected' : ''}>${p.name}</option>
            `).join('')}
        `;
    }
    
    _buildQuickSetup() {
        const section = document.createElement('details');
        section.className = 'dse-section dse-quick-setup';
        section.open = true;
        section.innerHTML = `
            <summary>⚡ Quick Setup</summary>
            <div class="dse-quick-inputs">
                <p class="dse-hint">Enter max depth and bottom time to auto-generate waypoints.</p>
                <div class="dse-row">
                    <div class="dse-field">
                        <label>Max Depth (m):</label>
                        <input type="number" class="dse-quick-depth form-input" value="30" min="1" max="100" step="1">
                    </div>
                    <div class="dse-field">
                        <label>Bottom Time (min):</label>
                        <input type="number" class="dse-quick-time form-input" value="20" min="1" max="120" step="1">
                    </div>
                    <button class="dse-generate-btn btn btn-secondary" title="Generate a new profile from depth and bottom time">🔄 Generate</button>
                </div>
                <div class="dse-ndl-display">
                    <span class="dse-ndl-label">NDL:</span>
                    <span class="dse-ndl-value">--</span> min
                    <span class="dse-ndl-status"></span>
                    <span class="dse-deco-info" style="display: none;">
                        <span class="dse-deco-warning">⚠️ Deco:</span>
                        <span class="dse-deco-time">--</span> min stops
                    </span>
                </div>
            </div>
        `;
        
        this.elements.quickDepth = section.querySelector('.dse-quick-depth');
        this.elements.quickTime = section.querySelector('.dse-quick-time');
        this.elements.generateBtn = section.querySelector('.dse-generate-btn');
        this.elements.ndlValue = section.querySelector('.dse-ndl-value');
        this.elements.ndlStatus = section.querySelector('.dse-ndl-status');
        this.elements.decoInfo = section.querySelector('.dse-deco-info');
        this.elements.decoTime = section.querySelector('.dse-deco-time');
        
        // Event handlers
        this.elements.quickDepth.addEventListener('input', () => this._updateNDLDisplay());
        this.elements.quickTime.addEventListener('input', () => this._updateNDLDisplay());
        this.elements.generateBtn.addEventListener('click', () => this._generateProfile());
        
        return section;
    }
    
    _buildGasesSection() {
        const section = document.createElement('details');
        section.className = 'dse-section dse-gases';
        section.open = true;
        section.innerHTML = `
            <summary>⚗️ Gases</summary>
            <div class="dse-gases-content">
                <p class="dse-hint">First gas is bottom gas. Add deco gases for multi-gas diving.</p>
                <div class="dse-gases-list"></div>
                <button class="dse-add-gas-btn btn btn-secondary btn-small">+ Add Deco Gas</button>
            </div>
        `;
        
        this.elements.gasesList = section.querySelector('.dse-gases-list');
        this.elements.addGasBtn = section.querySelector('.dse-add-gas-btn');
        
        this.elements.addGasBtn.addEventListener('click', () => this._addGas());
        
        return section;
    }
    
    _buildGradientFactors() {
        const section = document.createElement('details');
        section.className = 'dse-section dse-gf';
        section.innerHTML = `
            <summary>🎚️ Gradient Factors</summary>
            <div class="dse-gf-content">
                <p class="dse-hint">GF 100/100 = raw Bühlmann. Lower values = more conservative.</p>
                <div class="dse-gf-row">
                    <div class="dse-field">
                        <label>GF Low (%):</label>
                        <input type="range" class="dse-gf-low-slider" min="10" max="100" value="100" step="5">
                        <input type="number" class="dse-gf-low-input form-input" value="100" min="10" max="100" step="5">
                    </div>
                    <div class="dse-field">
                        <label>GF High (%):</label>
                        <input type="range" class="dse-gf-high-slider" min="10" max="100" value="100" step="5">
                        <input type="number" class="dse-gf-high-input form-input" value="100" min="10" max="100" step="5">
                    </div>
                </div>
                <div class="dse-gf-presets">
                    <span class="dse-hint">Presets:</span>
                    <button class="btn btn-small btn-secondary dse-gf-preset" data-gf-low="100" data-gf-high="100">100/100</button>
                    <button class="btn btn-small btn-secondary dse-gf-preset" data-gf-low="70" data-gf-high="85">70/85</button>
                    <button class="btn btn-small btn-secondary dse-gf-preset" data-gf-low="50" data-gf-high="80">50/80</button>
                    <button class="btn btn-small btn-secondary dse-gf-preset" data-gf-low="30" data-gf-high="85">30/85</button>
                </div>
            </div>
        `;
        
        this.elements.gfLowSlider = section.querySelector('.dse-gf-low-slider');
        this.elements.gfLowInput = section.querySelector('.dse-gf-low-input');
        this.elements.gfHighSlider = section.querySelector('.dse-gf-high-slider');
        this.elements.gfHighInput = section.querySelector('.dse-gf-high-input');
        
        // Sync sliders and inputs
        this.elements.gfLowSlider.addEventListener('input', () => {
            this.elements.gfLowInput.value = this.elements.gfLowSlider.value;
            this._onInputChange();
        });
        this.elements.gfLowInput.addEventListener('input', () => {
            this.elements.gfLowSlider.value = this.elements.gfLowInput.value;
            this._onInputChange();
        });
        this.elements.gfHighSlider.addEventListener('input', () => {
            this.elements.gfHighInput.value = this.elements.gfHighSlider.value;
            this._onInputChange();
            this._updateNDLDisplay();
        });
        this.elements.gfHighInput.addEventListener('input', () => {
            this.elements.gfHighSlider.value = this.elements.gfHighInput.value;
            this._onInputChange();
            this._updateNDLDisplay();
        });
        
        // GF presets
        section.querySelectorAll('.dse-gf-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const gfLow = btn.dataset.gfLow;
                const gfHigh = btn.dataset.gfHigh;
                this.elements.gfLowInput.value = gfLow;
                this.elements.gfLowSlider.value = gfLow;
                this.elements.gfHighInput.value = gfHigh;
                this.elements.gfHighSlider.value = gfHigh;
                this._onInputChange();
                this._updateNDLDisplay();
            });
        });
        
        return section;
    }
    
    _buildWaypointsSection(diveNumber) {
        const section = document.createElement('div');
        const isDive2 = diveNumber === 2;
        section.className = `dse-section dse-waypoints dse-dive${diveNumber}`;
        
        if (isDive2) {
            section.style.display = 'none';
        }
        
        section.innerHTML = `
            ${isDive2 ? `
                <div class="dse-dive2-header">
                    <h4>🤿 Dive 2 Waypoints</h4>
                    <button class="dse-remove-dive2-btn btn btn-danger btn-small">✕ Remove</button>
                </div>
                <div class="dse-field dse-si-between">
                    <label>Surface Interval Before (min):</label>
                    <input type="number" class="dse-dive2-si form-input" value="60" min="1" max="720" step="5">
                </div>
            ` : `<h4>🤿 Dive 1 Waypoints</h4>`}
            <table class="dse-waypoints-table">
                <thead>
                    <tr>
                        <th>Time (min)</th>
                        <th>Depth (m)</th>
                        <th>Gas</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody class="dse-waypoints-body"></tbody>
            </table>
            <div class="dse-waypoint-actions">
                <button class="dse-add-waypoint-btn btn btn-secondary btn-small">+ Add Waypoint</button>
                ${!isDive2 && this.options.showAutoGasSwitch ? `
                    <button class="dse-auto-gas-btn btn btn-secondary btn-small" title="Insert gas switch waypoints based on MOD">🔄 Auto Gas Switches</button>
                ` : ''}
            </div>
        `;
        
        const bodyKey = isDive2 ? 'waypointsBody2' : 'waypointsBody';
        this.elements[bodyKey] = section.querySelector('.dse-waypoints-body');
        
        // Add waypoint button
        section.querySelector('.dse-add-waypoint-btn').addEventListener('click', () => {
            this._addWaypointRow(this.elements[bodyKey]);
        });
        
        // Auto gas switch button (dive 1 only)
        const autoGasBtn = section.querySelector('.dse-auto-gas-btn');
        if (autoGasBtn) {
            autoGasBtn.addEventListener('click', () => this._autoGasSwitch());
        }
        
        // Dive 2 specific elements
        if (isDive2) {
            this.elements.dive2Section = section;
            this.elements.dive2SI = section.querySelector('.dse-dive2-si');
            this.elements.removeDive2Btn = section.querySelector('.dse-remove-dive2-btn');
            
            this.elements.removeDive2Btn.addEventListener('click', () => this._removeDive2());
            this.elements.dive2SI.addEventListener('input', () => this._onInputChange());
        }
        
        return section;
    }
    
    _buildDive2Controls() {
        const section = document.createElement('div');
        section.className = 'dse-section dse-add-dive';
        section.innerHTML = `
            <button class="dse-add-dive-btn btn btn-secondary">➕ Add Repetitive Dive</button>
            <span class="dse-hint">Add a second dive after a surface interval</span>
        `;
        
        this.elements.addDiveSection = section;
        this.elements.addDiveBtn = section.querySelector('.dse-add-dive-btn');
        
        this.elements.addDiveBtn.addEventListener('click', () => this._addDive2());
        
        return section;
    }
    
    _buildSurfaceInterval() {
        const section = document.createElement('div');
        section.className = 'dse-section dse-surface-interval';
        section.innerHTML = `
            <div class="dse-field">
                <label>Surface Interval After Dive (min):</label>
                <input type="number" class="dse-si-input form-input" value="60" min="0" max="720" step="10">
                <span class="dse-hint">Post-dive off-gassing display time</span>
            </div>
        `;
        
        this.elements.surfaceIntervalInput = section.querySelector('.dse-si-input');
        this.elements.surfaceIntervalInput.addEventListener('input', () => this._onInputChange());
        
        return section;
    }
    
    _buildDescription() {
        const section = document.createElement('div');
        section.className = 'dse-section dse-description';
        section.innerHTML = `
            <div class="dse-field">
                <label>Description:</label>
                <textarea class="dse-desc-input form-input form-textarea" rows="2" placeholder="Describe this dive profile..."></textarea>
            </div>
        `;
        
        this.elements.descriptionInput = section.querySelector('.dse-desc-input');
        this.elements.descriptionInput.addEventListener('input', () => this._onInputChange());
        
        return section;
    }
    
    _buildImportExport() {
        const section = document.createElement('div');
        section.className = 'dse-section dse-import-export';
        section.innerHTML = `
            <button class="dse-export-btn btn btn-secondary btn-small">📤 Export JSON</button>
            <button class="dse-import-btn btn btn-secondary btn-small">📥 Import JSON</button>
            <input type="file" class="dse-import-file" accept=".json" style="display: none;">
        `;
        
        this.elements.exportBtn = section.querySelector('.dse-export-btn');
        this.elements.importBtn = section.querySelector('.dse-import-btn');
        this.elements.importFile = section.querySelector('.dse-import-file');
        
        this.elements.exportBtn.addEventListener('click', () => this._exportToFile());
        this.elements.importBtn.addEventListener('click', () => this.elements.importFile.click());
        this.elements.importFile.addEventListener('change', (e) => this._importFromFile(e));
        
        return section;
    }
    
    _buildValidationErrors() {
        const section = document.createElement('div');
        section.className = 'dse-validation-errors';
        this.elements.validationErrors = section;
        return section;
    }
    
    // =========================================================================
    // GAS MANAGEMENT
    // =========================================================================
    
    _renderGasCards() {
        if (!this.elements.gasesList) return;
        
        this.elements.gasesList.innerHTML = '';
        
        this.currentGases.forEach((gas, index) => {
            const card = this._createGasCard(gas, index);
            this.elements.gasesList.appendChild(card);
        });
        
        this._updateWaypointGasDropdowns();
    }
    
    _createGasCard(gas, index) {
        const isBottomGas = index === 0;
        const mod14 = calculateMOD(gas.o2, 1.4);
        const mod16 = calculateMOD(gas.o2, 1.6);
        const gasOptions = isBottomGas ? BOTTOM_GASES : DECO_GASES;
        const cylinderOptions = isBottomGas ? BOTTOM_CYLINDERS : STAGE_CYLINDERS;
        
        const card = document.createElement('div');
        card.className = 'dse-gas-card';
        card.dataset.gasIndex = index;
        
        // Check if gas matches a preset
        const matchingPreset = gasOptions.find(g => 
            Math.abs(g.o2 - gas.o2) < 0.01 && Math.abs(g.he - gas.he) < 0.01
        );
        
        card.innerHTML = `
            <div class="dse-gas-header">
                <span class="dse-gas-label">${isBottomGas ? '🫧 Bottom Gas' : '🔄 Deco Gas ' + index}</span>
                ${!isBottomGas ? '<button class="dse-gas-remove btn btn-small" title="Remove">×</button>' : ''}
            </div>
            <div class="dse-gas-content">
                <div class="dse-gas-row">
                    <label>Gas:</label>
                    <select class="dse-gas-preset form-select">
                        ${gasOptions.map(g => 
                            `<option value="${g.id}" ${matchingPreset?.id === g.id ? 'selected' : ''}>${g.name}</option>`
                        ).join('')}
                        <option value="custom" ${!matchingPreset ? 'selected' : ''}>✏️ Custom...</option>
                    </select>
                </div>
                <div class="dse-gas-row dse-gas-custom" style="display: ${!matchingPreset ? 'flex' : 'none'};">
                    <label>O₂:</label>
                    <input type="number" class="dse-gas-o2" min="5" max="100" step="1" value="${Math.round(gas.o2 * 100)}">%
                    <label>He:</label>
                    <input type="number" class="dse-gas-he" min="0" max="95" step="1" value="${Math.round(gas.he * 100)}">%
                </div>
                <div class="dse-gas-row">
                    <label>Tank:</label>
                    <select class="dse-gas-cylinder form-select">
                        ${cylinderOptions.map(c => 
                            `<option value="${c.value}" ${c.value === gas.cylinderVolume ? 'selected' : ''}>${c.label}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="dse-gas-mod">
                    <span class="dse-hint">MOD: ${mod14}m (deco: ${mod16}m)</span>
                </div>
            </div>
        `;
        
        // Wire up events
        const presetSelect = card.querySelector('.dse-gas-preset');
        const customInputs = card.querySelector('.dse-gas-custom');
        const o2Input = card.querySelector('.dse-gas-o2');
        const heInput = card.querySelector('.dse-gas-he');
        const cylinderSelect = card.querySelector('.dse-gas-cylinder');
        const modDisplay = card.querySelector('.dse-gas-mod .dse-hint');
        
        presetSelect.addEventListener('change', () => {
            if (presetSelect.value === 'custom') {
                customInputs.style.display = 'flex';
            } else {
                customInputs.style.display = 'none';
                const preset = isBottomGas ? getBottomGas(presetSelect.value) : getDecoGas(presetSelect.value);
                if (preset) {
                    this.currentGases[index] = {
                        ...this.currentGases[index],
                        name: preset.name,
                        o2: preset.o2,
                        n2: preset.n2,
                        he: preset.he
                    };
                    o2Input.value = Math.round(preset.o2 * 100);
                    heInput.value = Math.round(preset.he * 100);
                    this._updateGasModDisplay(modDisplay, preset.o2);
                    this._updateWaypointGasDropdowns();
                    this._onInputChange();
                    this._updateNDLDisplay();
                }
            }
        });
        
        cylinderSelect.addEventListener('change', () => {
            this.currentGases[index].cylinderVolume = parseFloat(cylinderSelect.value);
            this.currentGases[index].startPressure = DEFAULT_START_PRESSURE;
            this._onInputChange();
        });
        
        const updateCustomGas = () => {
            const o2 = (parseFloat(o2Input.value) || 21) / 100;
            const he = (parseFloat(heInput.value) || 0) / 100;
            const n2 = Math.max(0, 1 - o2 - he);
            this.currentGases[index] = {
                ...this.currentGases[index],
                name: `Custom ${Math.round(o2 * 100)}/${Math.round(he * 100)}`,
                o2, n2, he
            };
            this._updateGasModDisplay(modDisplay, o2);
            this._updateWaypointGasDropdowns();
            this._onInputChange();
            this._updateNDLDisplay();
        };
        
        o2Input.addEventListener('input', updateCustomGas);
        heInput.addEventListener('input', updateCustomGas);
        
        // Remove button
        const removeBtn = card.querySelector('.dse-gas-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                this.currentGases.splice(index, 1);
                this._renderGasCards();
                this._onInputChange();
            });
        }
        
        return card;
    }
    
    _updateGasModDisplay(modDisplay, o2Fraction) {
        const mod14 = calculateMOD(o2Fraction, 1.4);
        const mod16 = calculateMOD(o2Fraction, 1.6);
        modDisplay.textContent = `MOD: ${mod14}m (deco: ${mod16}m)`;
    }
    
    _addGas() {
        if (this.currentGases.length >= this.options.maxGases) {
            console.warn(`Maximum ${this.options.maxGases} gases allowed`);
            return;
        }
        
        const ean50 = getDecoGas('ean50');
        const defaultCylinder = STAGE_CYLINDERS[2]; // 7L AL50
        
        this.currentGases.push({
            id: `deco${this.currentGases.length}`,
            name: ean50.name,
            o2: ean50.o2,
            n2: ean50.n2,
            he: ean50.he,
            cylinderVolume: defaultCylinder.value,
            startPressure: DEFAULT_START_PRESSURE
        });
        
        this._renderGasCards();
        this._onInputChange();
    }
    
    _updateWaypointGasDropdowns() {
        const updateDropdowns = (body) => {
            if (!body) return;
            body.querySelectorAll('.dse-wp-gas').forEach(select => {
                const currentValue = select.value;
                select.innerHTML = this.currentGases.map(gas => 
                    `<option value="${gas.id}" ${gas.id === currentValue ? 'selected' : ''}>${gas.name}</option>`
                ).join('');
            });
        };
        
        updateDropdowns(this.elements.waypointsBody);
        updateDropdowns(this.elements.waypointsBody2);
    }
    
    // =========================================================================
    // WAYPOINT MANAGEMENT
    // =========================================================================
    
    _loadWaypointsToTable(waypoints, tbody) {
        if (!tbody) return;
        tbody.innerHTML = '';
        
        // Track current gas - it persists until explicitly changed
        let currentGasId = this.currentGases[0]?.id || 'bottom';
        
        waypoints.forEach(wp => {
            // Only update currentGasId if waypoint has an explicit gasId
            if (wp.gasId) {
                currentGasId = wp.gasId;
            }
            this._addWaypointRow(tbody, wp.time, wp.depth, currentGasId);
        });
    }
    
    _addWaypointRow(tbody, time = '', depth = '', gasId = '') {
        const row = document.createElement('tr');
        const gasOptions = this.currentGases.map(gas => 
            `<option value="${gas.id}" ${gas.id === gasId ? 'selected' : ''}>${gas.name}</option>`
        ).join('');
        
        row.innerHTML = `
            <td><input type="number" class="dse-wp-time form-input" value="${time}" min="0" step="1"></td>
            <td><input type="number" class="dse-wp-depth form-input" value="${depth}" min="0" step="1"></td>
            <td><select class="dse-wp-gas form-select-small">${gasOptions}</select></td>
            <td class="dse-wp-actions">
                <button class="btn btn-icon btn-small dse-wp-time-down" title="-1 min">−</button>
                <button class="btn btn-icon btn-small dse-wp-time-up" title="+1 min">+</button>
                <button class="btn btn-icon btn-small dse-wp-insert" title="Insert after">⊕</button>
                <button class="btn btn-danger btn-small dse-wp-remove" title="Remove">×</button>
            </td>
        `;
        
        // Event handlers
        row.querySelector('.dse-wp-time').addEventListener('input', () => this._onInputChange());
        row.querySelector('.dse-wp-depth').addEventListener('input', () => this._onInputChange());
        row.querySelector('.dse-wp-gas').addEventListener('change', () => this._onInputChange());
        
        row.querySelector('.dse-wp-time-down').addEventListener('click', () => {
            this._shiftWaypointTimes(row, -1, tbody);
        });
        row.querySelector('.dse-wp-time-up').addEventListener('click', () => {
            this._shiftWaypointTimes(row, 1, tbody);
        });
        row.querySelector('.dse-wp-insert').addEventListener('click', () => {
            this._insertWaypointAfter(row, tbody);
        });
        row.querySelector('.dse-wp-remove').addEventListener('click', () => {
            if (tbody.children.length > 2) {
                row.remove();
                this._onInputChange();
            }
        });
        
        tbody.appendChild(row);
    }
    
    _readWaypointsFromTable(tbody) {
        if (!tbody) return [];
        
        const waypoints = [];
        tbody.querySelectorAll('tr').forEach(row => {
            const timeInput = row.querySelector('.dse-wp-time');
            const depthInput = row.querySelector('.dse-wp-depth');
            const gasSelect = row.querySelector('.dse-wp-gas');
            
            if (timeInput && depthInput) {
                waypoints.push({
                    time: parseFloat(timeInput.value) || 0,
                    depth: parseFloat(depthInput.value) || 0,
                    gasId: gasSelect?.value || this.currentGases[0]?.id || 'bottom'
                });
            }
        });
        
        return waypoints;
    }
    
    _shiftWaypointTimes(row, delta, tbody) {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const rowIndex = rows.indexOf(row);
        
        if (rowIndex === 0) return; // Don't shift first waypoint
        
        for (let i = rowIndex; i < rows.length; i++) {
            const timeInput = rows[i].querySelector('.dse-wp-time');
            if (timeInput) {
                const currentTime = parseFloat(timeInput.value) || 0;
                timeInput.value = Math.max(0, currentTime + delta);
            }
        }
        
        this._onInputChange();
    }
    
    _insertWaypointAfter(afterRow, tbody) {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const rowIndex = rows.indexOf(afterRow);
        
        const currentTime = parseFloat(afterRow.querySelector('.dse-wp-time').value) || 0;
        const currentDepth = parseFloat(afterRow.querySelector('.dse-wp-depth').value) || 0;
        const currentGasId = afterRow.querySelector('.dse-wp-gas')?.value || this.currentGases[0]?.id;
        
        let nextTime = currentTime + 2;
        let nextDepth = currentDepth;
        
        if (rowIndex < rows.length - 1) {
            const nextRow = rows[rowIndex + 1];
            nextTime = parseFloat(nextRow.querySelector('.dse-wp-time').value) || currentTime + 2;
            nextDepth = parseFloat(nextRow.querySelector('.dse-wp-depth').value) || currentDepth;
        }
        
        const midTime = Math.round((currentTime + nextTime) / 2);
        const midDepth = Math.round((currentDepth + nextDepth) / 2);
        
        const newRow = document.createElement('tr');
        const gasOptions = this.currentGases.map(gas => 
            `<option value="${gas.id}" ${gas.id === currentGasId ? 'selected' : ''}>${gas.name}</option>`
        ).join('');
        
        newRow.innerHTML = `
            <td><input type="number" class="dse-wp-time form-input" value="${midTime}" min="0" step="1"></td>
            <td><input type="number" class="dse-wp-depth form-input" value="${midDepth}" min="0" step="1"></td>
            <td><select class="dse-wp-gas form-select-small">${gasOptions}</select></td>
            <td class="dse-wp-actions">
                <button class="btn btn-icon btn-small dse-wp-time-down" title="-1 min">−</button>
                <button class="btn btn-icon btn-small dse-wp-time-up" title="+1 min">+</button>
                <button class="btn btn-icon btn-small dse-wp-insert" title="Insert after">⊕</button>
                <button class="btn btn-danger btn-small dse-wp-remove" title="Remove">×</button>
            </td>
        `;
        
        // Wire up events
        newRow.querySelector('.dse-wp-time').addEventListener('input', () => this._onInputChange());
        newRow.querySelector('.dse-wp-depth').addEventListener('input', () => this._onInputChange());
        newRow.querySelector('.dse-wp-gas').addEventListener('change', () => this._onInputChange());
        newRow.querySelector('.dse-wp-time-down').addEventListener('click', () => {
            this._shiftWaypointTimes(newRow, -1, tbody);
        });
        newRow.querySelector('.dse-wp-time-up').addEventListener('click', () => {
            this._shiftWaypointTimes(newRow, 1, tbody);
        });
        newRow.querySelector('.dse-wp-insert').addEventListener('click', () => {
            this._insertWaypointAfter(newRow, tbody);
        });
        newRow.querySelector('.dse-wp-remove').addEventListener('click', () => {
            if (tbody.children.length > 2) {
                newRow.remove();
                this._onInputChange();
            }
        });
        
        afterRow.after(newRow);
        this._onInputChange();
    }
    
    _autoGasSwitch() {
        if (this.currentGases.length < 2) {
            console.warn('Add at least one deco gas first');
            return;
        }
        
        const waypoints = this._readWaypointsFromTable(this.elements.waypointsBody);
        const newWaypoints = insertGasSwitchWaypoints(waypoints, this.currentGases);
        this._loadWaypointsToTable(newWaypoints, this.elements.waypointsBody);
        this._onInputChange();
    }
    
    // =========================================================================
    // MULTI-DIVE SUPPORT
    // =========================================================================
    
    _addDive2() {
        this.hasDive2 = true;
        
        if (this.elements.dive2Section) {
            this.elements.dive2Section.style.display = 'block';
        }
        if (this.elements.addDiveSection) {
            this.elements.addDiveSection.style.display = 'none';
        }
        
        // Add default dive 2 waypoints
        const defaultDive2 = [
            { time: 0, depth: 0 },
            { time: 2, depth: 18 },
            { time: 25, depth: 18 },
            { time: 28, depth: 5 },
            { time: 31, depth: 5 },
            { time: 33, depth: 0 }
        ];
        
        this._loadWaypointsToTable(defaultDive2, this.elements.waypointsBody2);
        this._onInputChange();
    }
    
    _removeDive2() {
        this.hasDive2 = false;
        
        if (this.elements.dive2Section) {
            this.elements.dive2Section.style.display = 'none';
        }
        if (this.elements.addDiveSection) {
            this.elements.addDiveSection.style.display = 'block';
        }
        if (this.elements.waypointsBody2) {
            this.elements.waypointsBody2.innerHTML = '';
        }
        
        this._onInputChange();
    }
    
    // =========================================================================
    // QUICK SETUP
    // =========================================================================
    
    _updateNDLDisplay() {
        if (!this.elements.quickDepth || !this.elements.ndlValue) return;
        
        const maxDepth = parseFloat(this.elements.quickDepth.value) || 30;
        const bottomTime = parseFloat(this.elements.quickTime.value) || 20;
        const gas = this.currentGases[0] || { n2: 0.79 };
        const gfLow = parseFloat(this.elements.gfLowInput?.value) || 100;
        const gfHigh = parseFloat(this.elements.gfHighInput?.value) || 100;
        
        // NDL uses GF Low since that determines when first stop is required
        const { ndl } = getNDLForDepth(maxDepth, gas, gfLow);
        
        if (ndl === Infinity) {
            this.elements.ndlValue.textContent = '∞';
            this.elements.ndlStatus.textContent = '✅ No limit';
            this.elements.ndlStatus.className = 'dse-ndl-status dse-ndl-ok';
        } else {
            this.elements.ndlValue.textContent = ndl;
            
            if (bottomTime <= ndl) {
                const remaining = ndl - bottomTime;
                this.elements.ndlStatus.textContent = `✅ ${remaining}min remaining`;
                this.elements.ndlStatus.className = 'dse-ndl-status dse-ndl-ok';
            } else if (bottomTime <= ndl * 1.1) {
                this.elements.ndlStatus.textContent = '⚠️ At limit';
                this.elements.ndlStatus.className = 'dse-ndl-status dse-ndl-warning';
            } else {
                this.elements.ndlStatus.textContent = '🔴 Deco dive';
                this.elements.ndlStatus.className = 'dse-ndl-status dse-ndl-deco';
            }
        }
        
        // Update deco info
        if (ndl !== Infinity && bottomTime > ndl) {
            this.elements.decoInfo.style.display = 'inline';
            const gfLow = parseFloat(this.elements.gfLowInput?.value) || 100;
            const result = generateDecoProfile(maxDepth, bottomTime, this.currentGases, gfLow, gfHigh);
            this.elements.decoTime.textContent = result.totalDecoTime;
        } else {
            this.elements.decoInfo.style.display = 'none';
        }
    }
    
    _generateProfile() {
        const maxDepth = parseFloat(this.elements.quickDepth.value) || 30;
        const bottomTime = parseFloat(this.elements.quickTime.value) || 20;
        
        if (maxDepth < 1 || maxDepth > 100) {
            console.warn('Max depth must be between 1 and 100 meters');
            return;
        }
        if (bottomTime < 1 || bottomTime > 120) {
            console.warn('Bottom time must be between 1 and 120 minutes');
            return;
        }
        
        const gfLow = parseFloat(this.elements.gfLowInput?.value) || DEFAULT_GF_LOW;
        const gfHigh = parseFloat(this.elements.gfHighInput?.value) || DEFAULT_GF_HIGH;
        
        const result = generateDecoProfile(maxDepth, bottomTime, this.currentGases, gfLow, gfHigh);
        
        this._loadWaypointsToTable(result.waypoints, this.elements.waypointsBody);
        this._onInputChange();
    }
    
    // =========================================================================
    // IMPORT/EXPORT
    // =========================================================================
    
    _exportToFile() {
        const exportData = this.exportSetup();
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = (exportData.name || 'dive-setup').replace(/[^a-z0-9]/gi, '-').toLowerCase();
        a.download = `${filename}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    _importFromFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const importedSetup = JSON.parse(evt.target.result);
                
                if (!importedSetup.dives && !importedSetup.waypoints) {
                    throw new Error('Invalid dive setup: missing dives or waypoints');
                }
                
                this.importSetup(importedSetup);
            } catch (error) {
                console.error('Import failed:', error);
            }
        };
        reader.readAsText(file);
        
        // Reset file input
        e.target.value = '';
    }
    
    // =========================================================================
    // FORM DATA
    // =========================================================================
    
    _buildSetupFromForm() {
        let dives;
        
        if (this.hasDive2 && this.elements.waypointsBody2) {
            const dive2SI = parseFloat(this.elements.dive2SI?.value) || 60;
            dives = [
                { waypoints: this._readWaypointsFromTable(this.elements.waypointsBody) },
                {
                    surfaceIntervalBefore: dive2SI,
                    waypoints: this._readWaypointsFromTable(this.elements.waypointsBody2)
                }
            ];
        } else {
            dives = [{ waypoints: this._readWaypointsFromTable(this.elements.waypointsBody) }];
        }
        
        const allWaypoints = dives.flatMap(d => d.waypoints);
        const maxDepth = Math.max(...allWaypoints.map(wp => wp.depth), 0);
        const gasNames = this.currentGases.map(g => g.name).join(' + ');
        const generatedName = `${maxDepth}m ${gasNames}`;
        
        // Use saved profile name if available, otherwise generate one
        const profileName = this.currentProfileName || generatedName;
        
        const surfaceInterval = parseFloat(this.elements.surfaceIntervalInput?.value) || 5;
        
        return {
            name: profileName,
            description: this.elements.descriptionInput?.value || '',
            gases: this.currentGases,
            dives: dives,
            gfLow: parseInt(this.elements.gfLowInput?.value) || DEFAULT_GF_LOW,
            gfHigh: parseInt(this.elements.gfHighInput?.value) || DEFAULT_GF_HIGH,
            surfaceInterval: surfaceInterval,
            units: { depth: 'meters', time: 'minutes', pressure: 'bar' }
        };
    }
    
    _populateFromSetup(setup) {
        // Store profile name
        this.currentProfileName = setup.name || null;
        
        // Load gases
        this.currentGases = getGases(setup);
        this._renderGasCards();
        
        // Surface interval
        if (this.elements.surfaceIntervalInput) {
            this.elements.surfaceIntervalInput.value = setup.surfaceInterval ?? 5;
        }
        
        // Gradient factors
        const gfLow = setup.gfLow ?? DEFAULT_GF_LOW;
        const gfHigh = setup.gfHigh ?? DEFAULT_GF_HIGH;
        if (this.elements.gfLowInput) {
            this.elements.gfLowInput.value = gfLow;
            this.elements.gfLowSlider.value = gfLow;
        }
        if (this.elements.gfHighInput) {
            this.elements.gfHighInput.value = gfHigh;
            this.elements.gfHighSlider.value = gfHigh;
        }
        
        // Description
        if (this.elements.descriptionInput) {
            this.elements.descriptionInput.value = setup.description || '';
        }
        
        // Waypoints
        if (setup.dives && setup.dives.length > 0) {
            this._loadWaypointsToTable(setup.dives[0].waypoints || [], this.elements.waypointsBody);
            
            if (setup.dives.length > 1 && this.elements.waypointsBody2) {
                const dive2 = setup.dives[1];
                if (this.elements.dive2SI) {
                    this.elements.dive2SI.value = dive2.surfaceIntervalBefore || 5;
                }
                this._loadWaypointsToTable(dive2.waypoints || [], this.elements.waypointsBody2);
                this._addDive2();
            } else {
                this._removeDive2();
            }
        }
        
        // Update displays
        this._updateNDLDisplay();
        this._updateProfileHeader();
    }
    
    _validateSetup(setup) {
        const errors = [];
        
        // Use chartTypes validation
        const baseValidation = validateDiveSetup(setup);
        if (!baseValidation.valid) {
            errors.push(...baseValidation.errors);
        }
        
        // Additional checks
        if (setup.dives) {
            setup.dives.forEach((dive, i) => {
                if (dive.waypoints?.length > 0) {
                    if (dive.waypoints[0].time !== 0) {
                        errors.push(`Dive ${i + 1}: First waypoint must be at time 0`);
                    }
                    if (dive.waypoints[0].depth !== 0) {
                        errors.push(`Dive ${i + 1}: First waypoint should be at surface (0m)`);
                    }
                }
            });
        }
        
        return { valid: errors.length === 0, errors };
    }
    
    _showValidationErrors(errors) {
        if (!this.elements.validationErrors) return;
        
        if (errors.length === 0) {
            this.elements.validationErrors.innerHTML = '';
            this.elements.validationErrors.style.display = 'none';
        } else {
            this.elements.validationErrors.innerHTML = errors.map(e => `<div class="dse-error">${e}</div>`).join('');
            this.elements.validationErrors.style.display = 'block';
        }
    }
    
    _getDefaultSetup() {
        return {
            name: 'New Dive',
            description: '',
            gases: [{
                id: 'bottom',
                name: 'Air',
                o2: 0.21,
                n2: 0.79,
                he: 0,
                cylinderVolume: 12,
                startPressure: DEFAULT_START_PRESSURE
            }],
            dives: [{
                waypoints: [
                    { time: 0, depth: 0 },
                    { time: 2, depth: 30 },
                    { time: 22, depth: 30 },
                    { time: 25, depth: 5 },
                    { time: 28, depth: 5 },
                    { time: 29, depth: 0 }
                ]
            }],
            gfLow: DEFAULT_GF_LOW,
            gfHigh: DEFAULT_GF_HIGH,
            surfaceInterval: 5,
            units: { depth: 'meters', time: 'minutes', pressure: 'bar' }
        };
    }
    
    // =========================================================================
    // EVENT HANDLING
    // =========================================================================
    
    _onInputChange() {
        // Update profile header with current values
        this._updateProfileHeader();
        
        if (this.options.emitOnInput) {
            this._emitChange();
        }
    }
    
    _emitChange() {
        const setup = this._buildSetupFromForm();
        const validation = this._validateSetup(setup);
        
        this._showValidationErrors(validation.errors);
        
        this.dispatchEvent(new CustomEvent('change', {
            detail: {
                diveSetup: setup,
                valid: validation.valid,
                errors: validation.errors
            }
        }));
    }
}

export default DiveSetupEditor;
