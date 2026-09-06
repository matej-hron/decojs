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
    DEFAULT_SAFETY_STOP,
    getBottomGas,
    getDecoGas,
    getPredefinedGas,
    calculateMOD,
    generateDecoProfile,
    getNDLForDepth,
    getNDLStatus,
    getGases,
    DEFAULT_GAS_SWITCH_TIME,
    renderDivePlanTableHTML
} from '../diveSetup.js';
import {
    getPressureAtAltitude,
    DECO_MODES,
    getDecoMode
} from '../decoModel.js';
import { escHtml } from '../utils/escHtml.js';

import {
    validateDiveSetup,
    normalizeDiveSetup
} from '../charts/chartTypes.js';

import { translate } from '../i18n.js';
import { fmtNum } from '../format.js';
import { GF_PRESETS } from '../gfPresets.js';

/** Helper: replace {0}, {1}, ... placeholders with the given values. */
function fmt(str, ...values) {
    return String(str).replace(/\{(\d+)\}/g, (_, i) => {
        const v = values[Number(i)];
        return v === undefined ? '' : String(v);
    });
}

import {
    ZHL16_VARIANTS,
    getZHL16Variant,
    setZHL16Variant
} from '../tissueCompartments.js';

/**
 * Default SAC rate in L/min at surface
 */
const DEFAULT_SAC_RATE = 20;
const DEFAULT_DECO_SAC_RATE = 15;

/**
 * Default editor options
 */
const DEFAULT_EDITOR_OPTIONS = {
    showQuickSetup: true,
    showGradientFactors: true,
    showStudySettings: true,
    showEnvironment: true,
    showProfiles: true,
    showImportExport: true,
    showDescription: true,
    showSurfaceInterval: true,
    showMultiDive: true,
    showSacRate: true,
    compact: false,
    maxGases: 4,
    emitOnInput: true,  // Emit change events on every input (vs only on save)
    showSafetyStop: true,
    showGenerateButton: true,
    showWaypoints: true,
    showValidation: true,
    showDivePlanPreview: true,  // Render the "Dive N Plan" table inline; set false when a host page renders its own copy elsewhere (e.g. next to a chart)
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
        this.lastDecisionAudit = null;
        
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

        // Re-render whole editor on language change so every hardcoded label
        // (section headings, form labels, button text, dropdown options, etc.)
        // picks up the new locale. We preserve the current setup from the form
        // so the user's in-progress work isn't lost.
        this._onLanguageChange = () => {
            const currentSetup = this._buildSetupFromForm();
            this._buildDOM();
            this._populateFromSetup(currentSetup);
        };
        document.addEventListener('languagechange', this._onLanguageChange);
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
        this.lastDecisionAudit = null;
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
     * Generate profile from current Quick Setup settings
     * Call this to ensure waypoints are up-to-date with current inputs
     */
    generateProfile() {
        this._generateProfile();
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
        if (this._onLanguageChange) {
            document.removeEventListener('languagechange', this._onLanguageChange);
            this._onLanguageChange = null;
        }
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

        // ===== INPUT SECTION =====

        // Profile selector (if profiles provided)
        if (this.options.showProfiles && this.profiles.length > 0) {
            wrapper.appendChild(this._buildProfileSelector());
        }

        // Quick Setup section (primary inputs)
        if (this.options.showQuickSetup) {
            wrapper.appendChild(this._buildQuickSetup());
        }

        // Gases section (collapsed by default)
        wrapper.appendChild(this._buildGasesSection());

        // Gradient Factors section (collapsed by default)
        if (this.options.showGradientFactors) {
            wrapper.appendChild(this._buildGradientFactors());
        }

        if (this.options.showEnvironment) {
            wrapper.appendChild(this._buildEnvironmentSection());
        }

        // SAC Rate section
        if (this.options.showSacRate) {
            wrapper.appendChild(this._buildSacRateSection());
        }

        // Generate button (prominent, between inputs and outputs)
        if (this.options.showQuickSetup && this.options.showGenerateButton) {
            wrapper.appendChild(this._buildGenerateButton());
        }

        // ===== OUTPUT SECTION =====

        // Keep waypoint rows mounted as internal profile state even when the
        // low-level editor is hidden from the host UI.
        const dive1Waypoints = this._buildWaypointsSection(1);
        dive1Waypoints.hidden = !this.options.showWaypoints;
        wrapper.appendChild(dive1Waypoints);

        // Multi-dive support
        if (this.options.showMultiDive) {
            wrapper.appendChild(this._buildDive2Controls());
            const dive2Waypoints = this._buildWaypointsSection(2);
            dive2Waypoints.hidden = !this.options.showWaypoints;
            wrapper.appendChild(dive2Waypoints);
        }

        // ===== SETTINGS SECTION =====

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
        if (this.options.showValidation) {
            wrapper.appendChild(this._buildValidationErrors());
        }

        // Keep experimental controls outside the normal planning flow.
        if (this.options.showStudySettings) {
            wrapper.appendChild(this._buildStudySettings());
        }

        this.container.appendChild(wrapper);
    }
    
    _buildProfileSelector() {
        const section = document.createElement('div');
        section.className = 'dse-section dse-profiles';
        section.innerHTML = `
            <label class="dse-label">${translate('diveEditor.profiles.loadProfile', 'Load Profile:')}</label>
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
            <option value="">${translate('diveEditor.profiles.selectPlaceholder', '-- Select Profile --')}</option>
            ${this.profiles.map(p => `
                <option value="${escHtml(p.id)}" ${this.selectedProfileId === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>
            `).join('')}
        `;
    }
    
    _buildQuickSetup() {
        const section = document.createElement('details');
        const bottomTimeExplanation = escHtml(translate(
            'terminology.bottomTime.text',
            'Total time from the start of descent until beginning the ascent to the deepest decompression stop, or directly to the surface on a no-decompression dive. Includes descent.'
        ));
        section.className = 'dse-section dse-quick-setup';
        section.open = true;
        section.innerHTML = `
            <summary>⚡ ${translate('diveEditor.quickSetup.title', 'Quick Setup')}</summary>
            <div class="dse-quick-inputs">
                ${this.options.showGenerateButton ? `<p class="dse-hint">${translate('diveEditor.quickSetup.hint', 'Set depth and bottom time, then click Generate below.')}</p>` : ''}
                <div class="dse-row">
                    <div class="dse-field">
                        <label>${translate('diveEditor.quickSetup.maxDepth', 'Max Depth (m):')}</label>
                        <input type="number" class="dse-quick-depth form-input" value="30" min="1" max="100" step="1">
                    </div>
                    <div class="dse-field">
                        <label>
                            ${translate('diveEditor.quickSetup.bottomTime', 'Bottom Time (min):')}
                            <span class="dse-term-tooltip" tabindex="0" role="note"
                                aria-label="${bottomTimeExplanation}"
                                data-tooltip="${bottomTimeExplanation}">?</span>
                        </label>
                        <input type="number" class="dse-quick-time form-input" value="20" min="1" max="120" step="1">
                    </div>
                </div>
                ${this.options.showSafetyStop ? `<div class="dse-row dse-safety-stop-row">
                    <label class="dse-checkbox-label">
                        <input type="checkbox" class="dse-safety-stop-enabled" checked>
                        ${translate('diveEditor.quickSetup.safetyStop', 'Safety Stop')}
                    </label>
                    <div class="dse-field dse-safety-stop-field">
                        <label>${translate('diveEditor.quickSetup.depth', 'Depth (m):')}</label>
                        <input type="number" class="dse-safety-stop-depth form-input" value="5" min="3" max="10" step="1">
                    </div>
                    <div class="dse-field dse-safety-stop-field">
                        <label>${translate('diveEditor.quickSetup.time', 'Time (min):')}</label>
                        <input type="number" class="dse-safety-stop-time form-input" value="3" min="1" max="10" step="1">
                    </div>
                </div>` : ''}
            </div>
        `;

        this.elements.quickDepth = section.querySelector('.dse-quick-depth');
        this.elements.quickTime = section.querySelector('.dse-quick-time');
        this.elements.safetyStopEnabled = section.querySelector('.dse-safety-stop-enabled');
        this.elements.safetyStopDepth = section.querySelector('.dse-safety-stop-depth');
        this.elements.safetyStopTime = section.querySelector('.dse-safety-stop-time');

        // Event handlers
        this.elements.quickDepth.addEventListener('input', () => this._updateNDLDisplay());
        this.elements.quickTime.addEventListener('input', () => this._updateNDLDisplay());

        // Safety stop toggle - update field visibility
        if (this.elements.safetyStopEnabled) {
            this.elements.safetyStopEnabled.addEventListener('change', () => {
                const enabled = this.elements.safetyStopEnabled.checked;
                section.querySelectorAll('.dse-safety-stop-field').forEach(el => {
                    el.style.opacity = enabled ? '1' : '0.5';
                });
            });
        }

        return section;
    }
    
    _buildGasesSection() {
        const section = document.createElement('details');
        section.className = 'dse-section dse-gases';
        section.open = false; // Collapsed by default
        section.innerHTML = `
            <summary>⚗️ ${translate('diveEditor.gases.title', 'Gases')} <span class="dse-summary-hint">(${translate('diveEditor.gases.airShort', 'Air')})</span></summary>
            <div class="dse-gases-content">
                <p class="dse-hint">${translate('diveEditor.gases.hint', 'First gas is bottom gas. Add deco gases for multi-gas diving.')}</p>
                <div class="dse-gases-list"></div>
                <button class="dse-add-gas-btn btn btn-secondary btn-small">+ ${translate('diveEditor.gases.addDecoGas', 'Add Deco Gas')}</button>
                <div class="dse-gas-switch-time" style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color, #ddd);">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem;">
                        ${translate('diveEditor.gases.gasSwitchStop', 'Gas switch stop:')}
                        <select class="dse-gas-switch-time-select form-input" style="width: auto;">
                            <option value="0">${translate('diveEditor.gases.switchNoStop', '0 min (no stop)')}</option>
                            <option value="1">${fmt(translate('diveEditor.gases.switchNMin', '{0}\u00a0min'), 1)}</option>
                            <option value="2">${fmt(translate('diveEditor.gases.switchNMin', '{0}\u00a0min'), 2)}</option>
                            <option value="3">${fmt(translate('diveEditor.gases.switchNMin', '{0}\u00a0min'), 3)}</option>
                            <option value="4">${fmt(translate('diveEditor.gases.switchNMin', '{0}\u00a0min'), 4)}</option>
                            <option value="5">${fmt(translate('diveEditor.gases.switchNMin', '{0}\u00a0min'), 5)}</option>
                        </select>
                    </label>
                    <p class="dse-hint">${translate('diveEditor.gases.switchHint', 'Time to verify gas, take breaths, and signal buddy at each switch depth.')}</p>
                </div>
            </div>
        `;

        this.elements.gasesSummaryHint = section.querySelector('.dse-summary-hint');

        this.elements.gasesList = section.querySelector('.dse-gases-list');
        this.elements.addGasBtn = section.querySelector('.dse-add-gas-btn');
        this.elements.gasSwitchTimeSelect = section.querySelector('.dse-gas-switch-time-select');

        this.elements.addGasBtn.addEventListener('click', () => this._addGas());
        this.elements.gasSwitchTimeSelect.addEventListener('change', () => this._onInputChange());

        return section;
    }
    
    _buildGradientFactors() {
        const section = document.createElement('details');
        section.className = 'dse-section dse-gf';
        section.open = false; // Collapsed by default
        section.innerHTML = `
            <summary>🎚️ ${translate('diveEditor.gf.title', 'Decompression Model')} <span class="dse-summary-hint">(GF 100/100)</span></summary>
            <div class="dse-gf-content">
                <div class="dse-algorithm-row">
                    <label>${translate('diveEditor.gf.algorithm', 'Algorithm:')}</label>
                    <select class="dse-algorithm-select form-input">
                        <option value="ZH-L16A">ZH-L16A (${translate('diveEditor.gf.algorithmExperimental', 'experimental')})</option>
                        <option value="ZH-L16B">ZH-L16B (${translate('diveEditor.gf.algorithmTables', 'tables')})</option>
                        <option value="ZH-L16C">ZH-L16C (${translate('diveEditor.gf.algorithmComputers', 'computers')})</option>
                    </select>
                </div>
                <p class="dse-hint">${translate('diveEditor.gf.hint', 'GF 100/100 = raw Bühlmann. Lower values = more conservative.')}</p>
                <div class="dse-gf-row">
                    <div class="dse-field">
                        <label>${translate('diveEditor.gf.low', 'GF Low (%):')}</label>
                        <input type="range" class="dse-gf-low-slider" min="10" max="100" value="100" step="5">
                        <input type="number" class="dse-gf-low-input form-input" value="100" min="10" max="100" step="5">
                    </div>
                    <div class="dse-field">
                        <label>${translate('diveEditor.gf.high', 'GF High (%):')}</label>
                        <input type="range" class="dse-gf-high-slider" min="10" max="100" value="100" step="5">
                        <input type="number" class="dse-gf-high-input form-input" value="100" min="10" max="100" step="5">
                    </div>
                </div>
                <div class="dse-gf-presets">
                    <span class="dse-hint">${translate('diveEditor.gf.presetsLabel', 'Presets:')} <span class="dse-gf-info-toggle" title="${translate('diveEditor.gf.presetGuide', 'GF preset guide')}" style="cursor:pointer; text-decoration:underline;">ℹ️</span></span>
                    ${GF_PRESETS.map(p => `<button class="btn btn-small btn-secondary dse-gf-preset" data-gf-low="${p.gfLow}" data-gf-high="${p.gfHigh}" title="${escHtml(translate(p.titleKey, p.title))}">${escHtml(translate(p.labelKey, p.label))}</button>`).join('')}
                </div>
                <div class="dse-gf-info" style="display:none; margin-top:0.5rem; font-size:0.8rem; background:var(--surface-alt, #f5f5f5); border-radius:6px; padding:0.6rem; line-height:1.5;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
                        <tr style="border-bottom:1px solid var(--border-color,#ddd);">
                            <th style="text-align:left; padding:2px 4px;">${translate('diveEditor.gf.tableScenario', 'Scenario')}</th>
                            <th style="text-align:left; padding:2px 4px;">${translate('diveEditor.gf.tableDepth', 'Depth')}</th>
                            <th style="padding:2px 4px;">${translate('diveEditor.gf.tableGfLow', 'GF Low')}</th>
                            <th style="padding:2px 4px;">${translate('diveEditor.gf.tableGfHigh', 'GF High')}</th>
                        </tr>
                        <tr><td style="padding:2px 4px;">${translate('diveEditor.gf.presetRecreational', 'Recreational')}</td><td style="padding:2px 4px;">${translate('diveEditor.gf.rowRecDepth', '≤40m, short deco')}</td><td style="text-align:center;">40–60%</td><td style="text-align:center;">80–90%</td></tr>
                        <tr><td style="padding:2px 4px;">${translate('diveEditor.gf.rowIntensive', 'Intensive / safari')}</td><td style="padding:2px 4px;">${translate('diveEditor.gf.rowIntensiveDepth', '≤40m, repeat dives')}</td><td style="text-align:center;">30–40%</td><td style="text-align:center;">70–80%</td></tr>
                        <tr><td style="padding:2px 4px;">${translate('diveEditor.gf.rowDeep', 'Deep single dive')}</td><td style="padding:2px 4px;">${translate('diveEditor.gf.rowDeepDepth', '>60m, one dive')}</td><td style="text-align:center;">0–50%</td><td style="text-align:center;">80–100%</td></tr>
                        <tr><td style="padding:2px 4px;">${translate('diveEditor.gf.rowBailout', 'Bailout / emergency')}</td><td style="padding:2px 4px;">—</td><td style="text-align:center;">60–80%</td><td style="text-align:center;">80–100%</td></tr>
                        <tr style="border-top:1px solid var(--border-color,#ddd);"><td style="padding:2px 4px;">${translate('diveEditor.gf.rowDecoPlanner', 'Deco Planner default')}</td><td></td><td style="text-align:center;">20%</td><td style="text-align:center;">80%</td></tr>
                        <tr><td style="padding:2px 4px;">${translate('diveEditor.gf.rowFreedom', 'Freedom default')}</td><td></td><td style="text-align:center;">30%</td><td style="text-align:center;">80%</td></tr>
                        <tr><td style="padding:2px 4px;">${translate('diveEditor.gf.rowBuhlmannTables', 'Bühlmann tables')}</td><td></td><td style="text-align:center;">100%</td><td style="text-align:center;">100%</td></tr>
                    </table>
                </div>
            </div>
        `;
        
        this.elements.gfLowSlider = section.querySelector('.dse-gf-low-slider');
        this.elements.gfLowInput = section.querySelector('.dse-gf-low-input');
        this.elements.gfHighSlider = section.querySelector('.dse-gf-high-slider');
        this.elements.gfHighInput = section.querySelector('.dse-gf-high-input');
        this.elements.algorithmSelect = section.querySelector('.dse-algorithm-select');
        this.elements.gfSummaryHint = section.querySelector('.dse-summary-hint');

        // GF info toggle
        const gfInfoToggle = section.querySelector('.dse-gf-info-toggle');
        const gfInfoPanel = section.querySelector('.dse-gf-info');
        if (gfInfoToggle && gfInfoPanel) {
            gfInfoToggle.addEventListener('click', () => {
                gfInfoPanel.style.display = gfInfoPanel.style.display === 'none' ? 'block' : 'none';
            });
        }

        // Set initial algorithm value
        this.elements.algorithmSelect.value = getZHL16Variant();
        
        // Algorithm change handler
        this.elements.algorithmSelect.addEventListener('change', () => {
            const variant = this.elements.algorithmSelect.value;
            setZHL16Variant(variant);
            this._onInputChange();
            this._updateNDLDisplay();
        });
        
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

    _buildStudySettings() {
        const section = document.createElement('details');
        section.className = 'dse-study-settings';
        section.open = false;
        section.innerHTML = `
            <summary class="dse-study-trigger"
                     title="${translate('diveEditor.study.title', 'Study settings')}"
                     aria-label="${translate('diveEditor.study.title', 'Study settings')}">
                <span aria-hidden="true">🧪</span>
                <span class="dse-study-active" hidden>${translate('diveEditor.study.studyShort', '(study mode)')}</span>
            </summary>
            <div class="dse-section dse-study-panel">
                <h3>${translate('diveEditor.study.title', 'Study settings')}</h3>
                <div class="dse-study-content">
                    <p class="dse-hint">
                        ${translate('diveEditor.study.intro', 'Change how decompression stops are discretized. The standard mode is recommended for conventional dive profiles.')}
                    </p>
                    <div class="dse-field">
                        <label>${translate('diveEditor.study.modeLabel', 'Decompression profile:')}</label>
                        <select class="dse-deco-mode-select form-input">
                            <option value="${DECO_MODES.STANDARD}">${translate('diveEditor.study.standard', 'Standard staged — recommended (3 m / 1 min, minimum 1 min per level)')}</option>
                            <option value="${DECO_MODES.ADAPTIVE}">${translate('diveEditor.study.adaptive', 'Adaptive staged — study only (3 m / 1 min, no forced stop)')}</option>
                            <option value="${DECO_MODES.CONTINUOUS}">${translate('diveEditor.study.continuous', 'Fine grid — study only (0.1 m / 0.1 min)')}</option>
                        </select>
                    </div>
                    <p class="dse-study-warning" hidden>
                        ${translate('diveEditor.study.warning', '⚠️ Study mode: this is not a standard operational decompression profile and may differ from dive computers. Do not use it to plan a real dive.')}
                    </p>
                </div>
            </div>
        `;

        this.elements.decoModeSelect = section.querySelector('.dse-deco-mode-select');
        this.elements.decoModeWarning = section.querySelector('.dse-study-warning');
        this.elements.decoModeActive = section.querySelector('.dse-study-active');

        const updateWarning = () => {
            const isStandard = this.elements.decoModeSelect.value === DECO_MODES.STANDARD;
            this.elements.decoModeWarning.hidden = isStandard;
            this.elements.decoModeActive.hidden = isStandard;
            section.classList.toggle('is-active', !isStandard);
        };
        this.elements.updateDecoModeWarning = updateWarning;
        this.elements.decoModeSelect.addEventListener('change', () => {
            updateWarning();
            this._onInputChange();
            this._updateNDLDisplay();
        });
        updateWarning();

        return section;
    }

    _buildSacRateSection() {
        const section = document.createElement('details');
        section.className = 'dse-section dse-sac';
        section.open = false; // Collapsed by default
        section.innerHTML = `
            <summary>⛽ ${translate('diveEditor.sac.title', 'Gas Consumption')} <span class="dse-summary-hint">(SAC ${DEFAULT_SAC_RATE}/${DEFAULT_DECO_SAC_RATE}\u00a0L/min)</span></summary>
            <div class="dse-sac-content">
                <p class="dse-hint">${translate('diveEditor.sac.hint', 'Surface Air Consumption rate for gas planning calculations.')}</p>
                <div class="dse-row">
                    <div class="dse-field">
                        <label>${translate('diveEditor.sac.bottom', 'Bottom SAC (L/min):')}</label>
                        <input type="number" class="dse-sac-input form-input" value="${DEFAULT_SAC_RATE}" min="5" max="50" step="1">
                    </div>
                    <div class="dse-field">
                        <label>${translate('diveEditor.sac.deco', 'Deco SAC (L/min):')}</label>
                        <input type="number" class="dse-deco-sac-input form-input" value="${DEFAULT_DECO_SAC_RATE}" min="5" max="50" step="1">
                    </div>
                    <div class="dse-field">
                        <label>${translate('diveEditor.sac.reserve', 'Reserve (bar):')}</label>
                        <input type="number" class="dse-reserve-input form-input" value="50" min="20" max="100" step="10">
                    </div>
                </div>
                <p class="dse-hint">${translate('diveEditor.sac.typicalHint', 'Typical SAC: 15-20 L/min (relaxed), 25-30 L/min (working).')}</p>
            </div>
        `;

        this.elements.sacInput = section.querySelector('.dse-sac-input');
        this.elements.decoSacInput = section.querySelector('.dse-deco-sac-input');
        this.elements.reserveInput = section.querySelector('.dse-reserve-input');
        this.elements.sacSummaryHint = section.querySelector('.dse-summary-hint');

        this.elements.sacInput.addEventListener('input', () => {
            this._updateSummaryHints();
            this._onInputChange();
        });
        this.elements.decoSacInput.addEventListener('input', () => {
            this._updateSummaryHints();
            this._onInputChange();
        });
        this.elements.reserveInput.addEventListener('input', () => this._onInputChange());

        return section;
    }

    _buildEnvironmentSection() {
        const section = document.createElement('details');
        section.className = 'dse-section dse-environment';
        section.open = false;
        section.innerHTML = `
            <summary>🏔️ ${translate('diveEditor.environment.title', 'Environment')} <span class="dse-summary-hint">(0\u00a0m)</span></summary>
            <div class="dse-environment-content">
                <div class="dse-field">
                    <label>${translate('diveEditor.environment.altitude', 'Altitude (m):')}</label>
                    <input type="number" class="dse-altitude-input form-input" value="0" min="0" max="5000" step="100">
                </div>
                <p class="dse-hint">
                    ${translate('diveEditor.environment.surfacePressure', 'Calculated surface pressure:')}
                    <strong class="dse-surface-pressure">${fmtNum(getPressureAtAltitude(0), 5)}\u00a0bar</strong>
                </p>
                <p class="dse-hint">${translate(
                    'diveEditor.environment.acclimatizedHint',
                    'Assumes the diver is fully acclimatized to this altitude.'
                )}</p>
            </div>
        `;

        this.elements.altitudeInput = section.querySelector('.dse-altitude-input');
        this.elements.environmentSummaryHint = section.querySelector('.dse-summary-hint');
        this.elements.surfacePressureValue = section.querySelector('.dse-surface-pressure');
        this.elements.altitudeInput.addEventListener('input', () => {
            this._updateEnvironmentDisplay();
            this._renderGasCards();
            this._updateNDLDisplay();
            this._onInputChange();
        });

        return section;
    }

    _getAltitude() {
        const altitude = Number(this.elements.altitudeInput?.value ?? 0);
        return Number.isFinite(altitude) ? Math.min(5000, Math.max(0, altitude)) : 0;
    }

    _getSurfacePressure() {
        return getPressureAtAltitude(this._getAltitude());
    }

    _getModSurfacePressure() {
        return 1 + (this._getSurfacePressure() - getPressureAtAltitude(0));
    }

    _updateEnvironmentDisplay() {
        const altitude = this._getAltitude();
        if (this.elements.environmentSummaryHint) {
            this.elements.environmentSummaryHint.textContent = `(${fmtNum(altitude, 0)}\u00a0m)`;
        }
        if (this.elements.surfacePressureValue) {
            this.elements.surfacePressureValue.textContent = `${fmtNum(getPressureAtAltitude(altitude), 5)}\u00a0bar`;
        }
    }

    _buildGenerateButton() {
        const section = document.createElement('div');
        section.className = 'dse-section dse-generate-section';
        section.innerHTML = `
            <button class="dse-generate-btn btn btn-primary btn-large">🔄 ${translate('diveEditor.generateProfile', 'Generate Profile')}</button>
            <div class="dse-ndl-display">
                <span class="dse-ndl-label">${translate('diveEditor.ndlLabel', 'NDL:')}</span>
                <span class="dse-ndl-value">--</span> ${translate('diveEditor.minUnit', 'min')}
                <span class="dse-ndl-status"></span>
                <span class="dse-deco-info" style="display: none;">
                    <span class="dse-deco-warning">${translate('diveEditor.decoLabel', '⚠️ Deco:')}</span>
                    <span class="dse-deco-time">--</span> ${translate('diveEditor.minStopsUnit', 'min stops')}
                </span>
            </div>
        `;

        this.elements.generateBtn = section.querySelector('.dse-generate-btn');
        this.elements.ndlValue = section.querySelector('.dse-ndl-value');
        this.elements.ndlStatus = section.querySelector('.dse-ndl-status');
        this.elements.decoInfo = section.querySelector('.dse-deco-info');
        this.elements.decoTime = section.querySelector('.dse-deco-time');

        this.elements.generateBtn.addEventListener('click', () => this._generateProfile());

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
                    <h4>🤿 ${translate('diveEditor.waypoints.dive2Plan', 'Dive 2 Plan')}</h4>
                    <button class="dse-remove-dive2-btn btn btn-danger btn-small">✕ ${translate('diveEditor.waypoints.remove', 'Remove')}</button>
                </div>
                <div class="dse-field dse-si-between">
                    <label>${translate('diveEditor.waypoints.surfaceIntervalBefore', 'Surface Interval Before (min):')}</label>
                    <input type="number" class="dse-dive2-si form-input" value="60" min="1" max="720" step="5">
                </div>
            ` : `<h4>🤿 ${translate('diveEditor.waypoints.dive1Plan', 'Dive 1 Plan')}</h4>`}
            <div class="dse-dive-plan"></div>
            <details class="dse-waypoints-detail">
                <summary>✏️ ${translate('diveEditor.waypoints.editWaypoints', 'Edit Waypoints')}</summary>
                <table class="dse-waypoints-table">
                    <thead>
                        <tr>
                            <th>${translate('diveEditor.waypoints.colTime', 'Time (min)')}</th>
                            <th>${translate('diveEditor.waypoints.colDepth', 'Depth (m)')}</th>
                            <th>${translate('diveEditor.waypoints.colGas', 'Gas')}</th>
                            <th>${translate('diveEditor.waypoints.colActions', 'Actions')}</th>
                        </tr>
                    </thead>
                    <tbody class="dse-waypoints-body"></tbody>
                </table>
                <div class="dse-waypoint-actions">
                    <button class="dse-add-waypoint-btn btn btn-secondary btn-small">+ ${translate('diveEditor.waypoints.addWaypoint', 'Add Waypoint')}</button>
                </div>
            </details>
        `;
        
        const bodyKey = isDive2 ? 'waypointsBody2' : 'waypointsBody';
        const planKey = isDive2 ? 'divePlan2' : 'divePlan';
        this.elements[bodyKey] = section.querySelector('.dse-waypoints-body');
        this.elements[planKey] = section.querySelector('.dse-dive-plan');
        
        // Add waypoint button
        section.querySelector('.dse-add-waypoint-btn').addEventListener('click', () => {
            this._addWaypointRow(this.elements[bodyKey]);
        });
        
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
            <button class="dse-add-dive-btn btn btn-secondary">➕ ${translate('diveEditor.waypoints.addRepetitiveDive', 'Add Repetitive Dive')}</button>
            <span class="dse-hint">${translate('diveEditor.waypoints.addRepetitiveHint', 'Add a second dive after a surface interval')}</span>
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
                <label>${translate('diveEditor.surfaceInterval.label', 'Surface Interval After Dive (min):')}</label>
                <input type="number" class="dse-si-input form-input" value="60" min="0" max="720" step="10">
                <span class="dse-hint">${translate('diveEditor.surfaceInterval.hint', 'Post-dive off-gassing display time')}</span>
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
                <label>${translate('diveEditor.description.label', 'Description:')}</label>
                <textarea class="dse-desc-input form-input form-textarea" rows="2" placeholder="${translate('diveEditor.description.placeholder', 'Describe this dive profile...')}"></textarea>
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
            <button class="dse-export-btn btn btn-secondary btn-small">📤 ${translate('diveEditor.importExport.exportJson', 'Export JSON')}</button>
            <button class="dse-import-btn btn btn-secondary btn-small">📥 ${translate('diveEditor.importExport.importJson', 'Import JSON')}</button>
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
        const modSurfacePressure = this._getModSurfacePressure?.() ?? 1;
        const mod14 = calculateMOD(gas.o2, 1.4, modSurfacePressure);
        const mod16 = calculateMOD(gas.o2, 1.6, modSurfacePressure);
        const gasOptions = isBottomGas ? BOTTOM_GASES : DECO_GASES;
        const cylinderOptions = isBottomGas ? BOTTOM_CYLINDERS : STAGE_CYLINDERS;
        
        const card = document.createElement('div');
        card.className = 'dse-gas-card';
        card.dataset.gasIndex = index;
        
        // Check if gas matches a preset
        const matchingPreset = gasOptions.find(g => 
            Math.abs(g.o2 - gas.o2) < 0.01 && Math.abs(g.he - gas.he) < 0.01
        );
        
        const gasLabel = isBottomGas
            ? `🫧 ${translate('diveEditor.gasCard.bottomGas', 'Bottom Gas')}`
            : `🔄 ${fmt(translate('diveEditor.gasCard.decoGas', 'Deco Gas {0}'), index)}`;
        const customOption = `✏️ ${translate('diveEditor.gasCard.custom', 'Custom...')}`;
        card.innerHTML = `
            <div class="dse-gas-header">
                <span class="dse-gas-label">${gasLabel}</span>
                ${!isBottomGas ? `<button class="dse-gas-remove btn btn-small" title="${translate('diveEditor.gasCard.remove', 'Remove')}">×</button>` : ''}
            </div>
            <div class="dse-gas-content">
                <div class="dse-gas-row">
                    <label>${translate('diveEditor.gasCard.gasLabel', 'Gas:')}</label>
                    <select class="dse-gas-preset form-select">
                        ${gasOptions.map(g =>
                            `<option value="${escHtml(g.id)}" ${matchingPreset?.id === g.id ? 'selected' : ''}>${escHtml(g.name)}</option>`
                        ).join('')}
                        <option value="custom" ${!matchingPreset ? 'selected' : ''}>${customOption}</option>
                    </select>
                </div>
                <div class="dse-gas-row dse-gas-custom" style="display: ${!matchingPreset ? 'flex' : 'none'};">
                    <label>${translate('diveEditor.gasCard.o2', 'O₂:')}</label>
                    <input type="number" class="dse-gas-o2" min="5" max="100" step="1" value="${Math.round(gas.o2 * 100)}">%
                    <!-- Keep helium in the data model for future support, but do not expose unsupported input. -->
                    <input type="hidden" class="dse-gas-he" value="${Math.round(gas.he * 100)}">
                </div>
                <div class="dse-gas-row">
                    <label>${translate('diveEditor.gasCard.tank', 'Tank:')}</label>
                    <select class="dse-gas-cylinder form-select">
                        ${cylinderOptions.map(c =>
                            `<option value="${c.value}" ${c.value === gas.cylinderVolume ? 'selected' : ''}>${c.label}</option>`
                        ).join('')}
                        <option value="custom" ${!cylinderOptions.find(c => c.value === gas.cylinderVolume) ? 'selected' : ''}>${customOption}</option>
                    </select>
                    <input type="number" class="dse-cylinder-custom form-input" min="1" max="50" step="0.1"
                        value="${gas.cylinderVolume}"
                        style="display: ${!cylinderOptions.find(c => c.value === gas.cylinderVolume) ? 'inline-block' : 'none'}; width: 70px; margin-left: 4px;"
                        title="${translate('diveEditor.gasCard.cylinderVolumeTitle', 'Cylinder volume in liters')}">
                    <span class="dse-cylinder-custom-unit" style="display: ${!cylinderOptions.find(c => c.value === gas.cylinderVolume) ? 'inline' : 'none'};">l</span>
                </div>
                <div class="dse-gas-mod">
                    <span class="dse-hint">${fmt(translate('diveEditor.mod', 'MOD: {0}\u00a0m (deco: {1}\u00a0m)'), mod14, mod16)}</span>
                </div>
            </div>
        `;
        
        // Wire up events
        const presetSelect = card.querySelector('.dse-gas-preset');
        const customInputs = card.querySelector('.dse-gas-custom');
        const o2Input = card.querySelector('.dse-gas-o2');
        const heInput = card.querySelector('.dse-gas-he');
        const cylinderSelect = card.querySelector('.dse-gas-cylinder');
        const cylinderCustomInput = card.querySelector('.dse-cylinder-custom');
        const cylinderCustomUnit = card.querySelector('.dse-cylinder-custom-unit');
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
            if (cylinderSelect.value === 'custom') {
                cylinderCustomInput.style.display = 'inline-block';
                cylinderCustomUnit.style.display = 'inline';
                this.currentGases[index].cylinderVolume = parseFloat(cylinderCustomInput.value) || 12;
            } else {
                cylinderCustomInput.style.display = 'none';
                cylinderCustomUnit.style.display = 'none';
                this.currentGases[index].cylinderVolume = parseFloat(cylinderSelect.value);
            }
            this.currentGases[index].startPressure = DEFAULT_START_PRESSURE;
            this._onInputChange();
        });

        cylinderCustomInput.addEventListener('input', () => {
            const vol = parseFloat(cylinderCustomInput.value);
            if (vol > 0 && vol <= 50) {
                this.currentGases[index].cylinderVolume = vol;
                this._onInputChange();
            }
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
                this._updateNDLDisplay();
            });
        }
        
        return card;
    }
    
    _updateGasModDisplay(modDisplay, o2Fraction) {
        const modSurfacePressure = this._getModSurfacePressure?.() ?? 1;
        const mod14 = calculateMOD(o2Fraction, 1.4, modSurfacePressure);
        const mod16 = calculateMOD(o2Fraction, 1.6, modSurfacePressure);
        modDisplay.textContent = fmt(translate('diveEditor.mod', 'MOD: {0}\u00a0m (deco: {1}\u00a0m)'), mod14, mod16);
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
        this._updateNDLDisplay();
    }

    _updateWaypointGasDropdowns() {
        const updateDropdowns = (body) => {
            if (!body) return;
            body.querySelectorAll('.dse-wp-gas').forEach(select => {
                const currentValue = select.value;
                select.innerHTML = this.currentGases.map(gas => 
                    `<option value="${escHtml(gas.id)}" ${gas.id === currentValue ? 'selected' : ''}>${escHtml(gas.name)}</option>`
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
        this._updateDivePlan(tbody);
    }

    _updateDivePlan(tbody) {
        if (!this.options.showDivePlanPreview) return;
        const planDiv = tbody === this.elements.waypointsBody
            ? this.elements.divePlan
            : this.elements.divePlan2;
        if (!planDiv) return;

        const waypoints = this._readWaypointsFromTable(tbody);
        const sacRate = parseFloat(this.elements.sacInput?.value) || DEFAULT_SAC_RATE;
        const decoSacRate = parseFloat(this.elements.decoSacInput?.value) || DEFAULT_DECO_SAC_RATE;
        const reserve = parseFloat(this.elements.reserveInput?.value) || 50;
        planDiv.innerHTML = renderDivePlanTableHTML(waypoints, this.currentGases, {
            sacRate, decoSacRate, reserve, surfacePressure: this._getSurfacePressure()
        });
    }

    _addWaypointRow(tbody, time = '', depth = '', gasId = '') {
        const row = document.createElement('tr');
        const gasOptions = this.currentGases.map(gas => 
            `<option value="${escHtml(gas.id)}" ${gas.id === gasId ? 'selected' : ''}>${escHtml(gas.name)}</option>`
        ).join('');
        
        row.innerHTML = `
            <td><input type="number" class="dse-wp-time form-input" value="${time}" min="0" step="0.1"></td>
            <td><input type="number" class="dse-wp-depth form-input" value="${depth}" min="0" step="1"></td>
            <td><select class="dse-wp-gas form-select-small">${gasOptions}</select></td>
            <td class="dse-wp-actions">
                <button class="btn btn-icon btn-small dse-wp-time-down" title="${translate('diveEditor.waypoints.timeDown', '-1 min')}">−</button>
                <button class="btn btn-icon btn-small dse-wp-time-up" title="${translate('diveEditor.waypoints.timeUp', '+1 min')}">+</button>
                <button class="btn btn-icon btn-small dse-wp-insert" title="${translate('diveEditor.waypoints.insertAfter', 'Insert after')}">⊕</button>
                <button class="btn btn-danger btn-small dse-wp-remove" title="${translate('diveEditor.waypoints.remove', 'Remove')}">×</button>
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
            `<option value="${escHtml(gas.id)}" ${gas.id === currentGasId ? 'selected' : ''}>${escHtml(gas.name)}</option>`
        ).join('');
        
        newRow.innerHTML = `
            <td><input type="number" class="dse-wp-time form-input" value="${midTime}" min="0" step="1"></td>
            <td><input type="number" class="dse-wp-depth form-input" value="${midDepth}" min="0" step="1"></td>
            <td><select class="dse-wp-gas form-select-small">${gasOptions}</select></td>
            <td class="dse-wp-actions">
                <button class="btn btn-icon btn-small dse-wp-time-down" title="${translate('diveEditor.waypoints.timeDown', '-1 min')}">−</button>
                <button class="btn btn-icon btn-small dse-wp-time-up" title="${translate('diveEditor.waypoints.timeUp', '+1 min')}">+</button>
                <button class="btn btn-icon btn-small dse-wp-insert" title="${translate('diveEditor.waypoints.insertAfter', 'Insert after')}">⊕</button>
                <button class="btn btn-danger btn-small dse-wp-remove" title="${translate('diveEditor.waypoints.remove', 'Remove')}">×</button>
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
        
        // Get safety stop settings
        const safetyStop = {
            enabled: this.elements.safetyStopEnabled?.checked ?? DEFAULT_SAFETY_STOP.enabled,
            depth: parseFloat(this.elements.safetyStopDepth?.value) || DEFAULT_SAFETY_STOP.depth,
            time: parseFloat(this.elements.safetyStopTime?.value) || DEFAULT_SAFETY_STOP.time
        };
        
        // NDL simulates a direct ascent and applies GF High at the surface.
        // Display whole minutes, but classify against the exact threshold.
        const surfacePressure = this._getSurfacePressure();
        const { ndl, ndlExact } = getNDLForDepth(maxDepth, gas, gfHigh, surfacePressure);
        const status = getNDLStatus(ndlExact, bottomTime);

        if (status.state === 'unlimited') {
            this.elements.ndlValue.textContent = translate('diveEditor.ndl.infinity', '∞');
            this.elements.ndlStatus.textContent = translate('diveEditor.ndl.noLimit', '✅ No limit');
            this.elements.ndlStatus.className = 'dse-ndl-status dse-ndl-ok';
        } else {
            this.elements.ndlValue.textContent = ndl;

            if (status.state === 'ok') {
                const remaining = fmtNum(Math.round(status.remaining * 10) / 10);
                this.elements.ndlStatus.textContent = fmt(translate('diveEditor.ndl.remaining', '✅ {0}\u00a0min remaining'), remaining);
                this.elements.ndlStatus.className = 'dse-ndl-status dse-ndl-ok';
            } else if (status.state === 'nearLimit') {
                this.elements.ndlStatus.textContent = translate('diveEditor.ndl.atLimit', '⚠️ At limit');
                this.elements.ndlStatus.className = 'dse-ndl-status dse-ndl-warning';
            } else {
                this.elements.ndlStatus.textContent = translate('diveEditor.ndl.decoDive', '🔴 Deco dive');
                this.elements.ndlStatus.className = 'dse-ndl-status dse-ndl-deco';
            }
        }
        
        // Update deco info
        if (status.state === 'deco') {
            this.elements.decoInfo.style.display = 'inline';
            const decoModeNDL = this.elements.decoModeSelect?.value ?? DECO_MODES.STANDARD;
            const gasSwitchTimeNDL = parseInt(this.elements.gasSwitchTimeSelect?.value) || 0;
            try {
                const result = generateDecoProfile(
                    maxDepth, bottomTime, this.currentGases, gfLow, gfHigh, safetyStop,
                    { decoMode: decoModeNDL, gasSwitchTime: gasSwitchTimeNDL, surfacePressure }
                );
                this.elements.decoTime.textContent = Math.round(result.totalDecoTime * 10) / 10;
            } catch (err) {
                if (err?.name === 'DecoCapExceededError') {
                    this.elements.decoTime.textContent = translate('diveEditor.ndl.outOfRange', '⚠ out of range');
                } else {
                    throw err;
                }
            }
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
        
        // Get safety stop settings
        const safetyStop = {
            enabled: this.elements.safetyStopEnabled?.checked ?? DEFAULT_SAFETY_STOP.enabled,
            depth: parseFloat(this.elements.safetyStopDepth?.value) || DEFAULT_SAFETY_STOP.depth,
            time: parseFloat(this.elements.safetyStopTime?.value) || DEFAULT_SAFETY_STOP.time
        };
        
        const decoMode = this.elements.decoModeSelect?.value ?? DECO_MODES.STANDARD;
        const gasSwitchTime = parseInt(this.elements.gasSwitchTimeSelect?.value) || 0;
        const surfacePressure = this._getSurfacePressure();
        let result;
        try {
            result = generateDecoProfile(
                maxDepth, bottomTime, this.currentGases, gfLow, gfHigh, safetyStop,
                { decoMode, gasSwitchTime, surfacePressure, audit: true }
            );
        } catch (err) {
            if (err?.name === 'DecoCapExceededError') {
                alert(err.message);
                return;
            }
            throw err;
        }

        this._loadWaypointsToTable(result.waypoints, this.elements.waypointsBody);
        this.lastDecisionAudit = result.decisionAudit ?? null;
        this._onInputChange(true);
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
        const generatedName = `${maxDepth}\u00a0m ${gasNames}`;
        
        // Use saved profile name if available, otherwise generate one
        const profileName = this.currentProfileName || generatedName;
        
        const surfaceInterval = parseFloat(this.elements.surfaceIntervalInput?.value) || 5;
        const sacRate = parseFloat(this.elements.sacInput?.value) || DEFAULT_SAC_RATE;
        const decoSacRate = parseFloat(this.elements.decoSacInput?.value) || DEFAULT_DECO_SAC_RATE;
        const reservePressure = parseFloat(this.elements.reserveInput?.value) || 50;

        return {
            name: profileName,
            description: this.elements.descriptionInput?.value || '',
            gases: this.currentGases,
            dives: dives,
            algorithm: this.elements.algorithmSelect?.value || getZHL16Variant(),
            gfLow: parseInt(this.elements.gfLowInput?.value) || DEFAULT_GF_LOW,
            gfHigh: parseInt(this.elements.gfHighInput?.value) || DEFAULT_GF_HIGH,
            surfaceInterval: surfaceInterval,
            sacRate: sacRate,
            decoSacRate: decoSacRate,
            reservePressure: reservePressure,
            environment: { altitude: this._getAltitude() },
            units: { depth: 'meters', time: 'minutes', pressure: 'bar' },
            decoMode: this.elements.decoModeSelect?.value ?? DECO_MODES.STANDARD,
            gasSwitchTime: parseInt(this.elements.gasSwitchTimeSelect?.value) || 0
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

        if (this.elements.altitudeInput) {
            this.elements.altitudeInput.value = setup.environment?.altitude ?? 0;
            this._updateEnvironmentDisplay();
        }

        // SAC rate and reserve
        if (this.elements.sacInput) {
            this.elements.sacInput.value = setup.sacRate ?? DEFAULT_SAC_RATE;
        }
        if (this.elements.decoSacInput) {
            this.elements.decoSacInput.value = setup.decoSacRate ?? DEFAULT_DECO_SAC_RATE;
        }
        if (this.elements.reserveInput) {
            this.elements.reserveInput.value = setup.reservePressure ?? 50;
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

        // Algorithm variant
        if (this.elements.algorithmSelect && setup.algorithm) {
            this.elements.algorithmSelect.value = setup.algorithm;
            setZHL16Variant(setup.algorithm);
        }

        if (this.elements.decoModeSelect) {
            this.elements.decoModeSelect.value = getDecoMode(setup);
            this.elements.updateDecoModeWarning();
        }

        // Gas switch time
        if (this.elements.gasSwitchTimeSelect) {
            this.elements.gasSwitchTimeSelect.value = setup.gasSwitchTime ?? DEFAULT_GAS_SWITCH_TIME;
        }

        // Description
        if (this.elements.descriptionInput) {
            this.elements.descriptionInput.value = setup.description || '';
        }

        // Waypoints
        if (setup.dives && setup.dives.length > 0) {
            this._loadWaypointsToTable(setup.dives[0].waypoints || [], this.elements.waypointsBody);

            // Update Quick Setup fields from waypoints
            const waypoints = setup.dives[0].waypoints || [];
            if (waypoints.length > 0 && this.elements.quickDepth && this.elements.quickTime) {
                const maxDepth = Math.max(...waypoints.map(wp => wp.depth), 0);
                // Estimate bottom time: time at max depth (find when descent ends and ascent begins)
                const maxDepthWaypoints = waypoints.filter(wp => wp.depth === maxDepth);
                const bottomTime = maxDepthWaypoints.length > 0
                    ? maxDepthWaypoints[maxDepthWaypoints.length - 1].time
                    : waypoints[waypoints.length - 1].time;

                this.elements.quickDepth.value = maxDepth;
                this.elements.quickTime.value = bottomTime;
            }

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
        this._updateSummaryHints();
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
                        errors.push(fmt(
                            translate('diveEditor.validation.firstWaypointTime', 'Dive {0}: First waypoint must be at time 0'),
                            i + 1
                        ));
                    }
                    if (dive.waypoints[0].depth !== 0) {
                        errors.push(fmt(
                            translate('diveEditor.validation.firstWaypointDepth', 'Dive {0}: First waypoint should be at surface (0m)'),
                            i + 1
                        ));
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
            name: translate('diveEditor.newDiveName', 'New Dive'),
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
            environment: { altitude: 0 },
            units: { depth: 'meters', time: 'minutes', pressure: 'bar' }
        };
    }
    
    // =========================================================================
    // EVENT HANDLING
    // =========================================================================
    
    _onInputChange(preserveDecisionAudit = false) {
        if (!preserveDecisionAudit) {
            this.lastDecisionAudit = null;
        }
        // Update collapsed section hints
        this._updateSummaryHints();

        // Update dive plan table
        if (this.elements.waypointsBody) {
            this._updateDivePlan(this.elements.waypointsBody);
        }

        if (this.options.emitOnInput) {
            this._emitChange();
        }
    }

    _updateSummaryHints() {
        // Update Gases summary hint
        if (this.elements.gasesSummaryHint) {
            const gasNames = this.currentGases.map(g => g.name).join(' + ');
            const fallback = translate('diveEditor.gases.airShort', 'Air');
            this.elements.gasesSummaryHint.textContent = `(${gasNames || fallback})`;
        }

        // Update GF summary hint
        if (this.elements.gfSummaryHint) {
            const gfLow = this.elements.gfLowInput?.value || 100;
            const gfHigh = this.elements.gfHighInput?.value || 100;
            this.elements.gfSummaryHint.textContent = `(GF ${gfLow}/${gfHigh})`;
        }

        // Update SAC summary hint
        if (this.elements.sacSummaryHint) {
            const sac = this.elements.sacInput?.value || DEFAULT_SAC_RATE;
            const decoSac = this.elements.decoSacInput?.value || DEFAULT_DECO_SAC_RATE;
            this.elements.sacSummaryHint.textContent = `(SAC ${sac}/${decoSac}\u00a0L/min)`;
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
                errors: validation.errors,
                decisionAudit: this.lastDecisionAudit
            }
        }));
    }
}

export default DiveSetupEditor;
