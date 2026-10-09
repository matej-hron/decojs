/**
 * Logbook entry form: a core section that is always visible and a collapsed
 * "More details" section. Save errors are shown inside the form and never
 * discard what was typed.
 *
 * The helpers at the top are pure (no DOM) and are covered by tests.
 */

import { normalizeEntry, nextLogNumber, parseDecimal, parseDuration, formatDuration, hasUserDetails, DETAIL_KEYS } from './entryModel.js';
import { openSitePicker } from './SitePicker.js';
import { MediaSection } from './MediaSection.js';
import { translate } from '../i18n.js';
import { currentLang, decimalSeparator, fmtNum } from '../format.js';
import { escHtml } from '../utils/escHtml.js';
import { OFFERED_VISIBILITIES } from './community.js';
import { gasName } from '../import/recordedDive.js';
import {
    MIX_PRESETS, CYLINDER_GROUPS, CYLINDER_PRESETS, MATERIALS, cylinderPreset, cylinderText,
    gasesFromEntry, gasesFromRecording, primaryGas, gasUsage, formRowsFromGases, gasesFromFormRows, newGasRow,
} from './gasModel.js';

const NBSP = ' ';

/** Detail keys typed as numbers (the rest are text, choices or the tag list). */
const NUMERIC_DETAILS = new Set(['surfaceTempC', 'airTempC', 'weightsKg', 'suitMm', 'avgDepthM']);

/** Choice lists of the details section. */
export const CHOICES = Object.freeze({
    weather: ['sun', 'clouds', 'rain', 'wind'],
    current: ['none', 'light', 'moderate', 'strong'],
    waves: ['calm', 'small', 'rough'],
    cylinderMaterial: ['steel', 'aluminium'],
    suit: ['wet', 'dry'],
    entry: ['shore', 'boat'],
    stops: ['none', 'safety', 'deco'],
});
export const TAGS = Object.freeze(['night', 'wreck', 'cave', 'ice', 'training', 'deep', 'drift']);

/** Unit hints for the detail inputs (the unit is also in the label). */
const DETAIL_INPUT = Object.freeze({
    surfaceTempC: 'decimal', airTempC: 'decimal', weightsKg: 'decimal', suitMm: 'decimal', avgDepthM: 'decimal',
});

const tf = key => translate(`diveLog.logbook.form.${key}`, key);
const tl = (key, fallback = key) => translate(`diveLog.logbook.${key}`, fallback);
const tb = key => translate(`diveLog.backend.${key}`, key);
const tt = (key, fallback) => translate(`diveLog.trail.${key}`, fallback);
const VISIBILITY_TEXT = Object.freeze({
    private: ['Private', 'Only you.'],
    members: ['Members', 'Everyone invited to DecoTrail. Your notes stay private.'],
    link: ['Public link (coming soon)', 'Kept as it is: the public page does not exist yet.'],
});
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
/** A field label without its unit, for messages ("Start (bar)" → "Start"). */
const labelOf = key => tf(key).replace(/\u00a0\(.*\)$/, '');

// ---- Pure helpers ----

export { formatDuration };

/**
 * Label keys of the numeric fields whose non-blank text is not a number.
 * @param {Object} values - form values (core strings and `details`)
 */
export function invalidNumberFields(values) {
    const bad = [];
    const check = (key, labelKey) => {
        const v = key === null ? null : values[key];
        if (v === null || v === undefined || String(v).trim() === '') return;
        if ((key === 'duration_min' ? parseDuration(v) : parseDecimal(v)) === null) bad.push(labelKey);
    };
    const core = { log_number: 'number', duration_min: 'duration', max_depth_m: 'depth', water_temp_c: 'waterTemp', vis_shallow_m: 'visShallow', vis_deep_m: 'visDeep' };
    for (const [k, label] of Object.entries(core)) check(k, label);
    for (const key of [...NUMERIC_DETAILS, 'rating']) {
        const v = values.details?.[key];
        if (v !== null && v !== undefined && String(v).trim() !== '' && parseDecimal(v) === null) bad.push(key);
    }
    return bad;
}

/**
 * Form values (strings) for an entry or a computer prefill; the reverse of
 * `normalizeEntry` for everything the form shows. `gases` holds one form row per gas card.
 * @param {Object} entry - log_entries row or partial prefill
 * @param {{comma?: boolean}} [options] - show a decimal comma
 */
export function formValuesFromEntry(entry, { comma = false } = {}) {
    const text = v => (v === null || v === undefined ? '' : String(v));
    const num = v => (v === null || v === undefined ? '' : (comma ? String(v).replace('.', ',') : String(v)));
    return {
        log_number: text(entry.log_number),
        dive_date: text(entry.dive_date),
        entry_time: text(entry.entry_time).slice(0, 5),
        duration_min: formatDuration(entry.duration_s),
        max_depth_m: num(entry.max_depth_m),
        site_id: entry.site_id ?? null,
        buddies: [...(entry.buddies ?? [])],
        gases: formRowsFromGases(gasesFromEntry(entry), { comma }),
        water_temp_c: num(entry.water_temp_c),
        vis_shallow_m: num(entry.vis_shallow_m),
        vis_deep_m: num(entry.vis_deep_m),
        notes: text(entry.notes),
        details: { ...(entry.details ?? {}) },
    };
}

/**
 * Recordings from `rows` that started on `date` and have no logbook entry yet, in time order.
 * @param {Array<{id: string, startLocal: string}>} rows - recording summaries
 * @param {Array<{recording_id: ?string}>} entries
 * @param {string} date - YYYY-MM-DD
 */
export function recordingsOnDate(rows, entries, date) {
    const linked = new Set(entries.map(e => e.recording_id).filter(Boolean));
    return rows
        .filter(r => String(r.startLocal).slice(0, 10) === date && !linked.has(r.id))
        .sort((a, b) => String(a.startLocal).localeCompare(String(b.startLocal)));
}

// ---- The form ----

export class EntryForm {
    /**
     * @param {HTMLElement} container
     * @param {Object} options
     * @param {Object} options.store - dive store
     * @param {Object} [options.entry] - existing log_entries row to edit
     * @param {Object} [options.prefill] - fields for a new entry (from a recording or a date)
     * @param {string} [options.recordingId] - recording to link to a new entry
     * @param {boolean} [options.community] - the community backend exists: offer "Who can see this dive"
     * @param {string|null} [options.defaultVisibility] - the profile default for a new entry (else members)
     * @param {(entry: Object) => void} options.onSaved
     * @param {() => void} options.onCancel
     */
    constructor(container, { store, entry = null, prefill = {}, recordingId = null, community = false, defaultVisibility = null, onSaved, onCancel }) {
        this.container = container;
        this.store = store;
        this.entry = entry;
        this.recordingId = recordingId;
        this.onSaved = onSaved;
        this.onCancel = onCancel;
        this.destroyed = false;
        this.saving = false;
        this.error = '';
        this.sites = [];
        this.buddyNames = [];
        this.nextNumber = null;
        this.siteName = '';
        this.siteTouched = false; // true once the user edits the site field
        this.siteId = entry?.site_id ?? prefill.site_id ?? null;
        this.comma = decimalSeparator(currentLang()) === ',';
        this.values = formValuesFromEntry(entry ?? prefill, { comma: this.comma });
        this.gasTouched = false; // true once the user edits the gas block
        // Without the community backend nothing is shown and nothing is sent.
        this.sharing = community ? {
            visibility: entry?.visibility ?? (OFFERED_VISIBILITIES.includes(defaultVisibility) ? defaultVisibility : 'members'),
            share_location: entry?.share_location === true,
        } : null;
        // Photos need a saved entry: an existing one manages them here, a new one gets them right after the first save.
        this.media = entry ? new MediaSection({ store, entryId: entry.id }) : null;
        this.render();
        this._loadSuggestions();
        if (entry?.recording_id && !Array.isArray(entry.details?.gases)) this._prefillGasesFromRecording();
    }

    destroy() {
        this.destroyed = true;
        this.media?.destroy();
        this._pickAbort?.abort(); // Back navigation must not leave the picker overlay behind
        this.container.innerHTML = '';
    }

    /** Re-render after a language change, keeping what was typed. */
    relabel() {
        if (this.destroyed) return;
        this._readDom();
        this.render();
    }

    /** "Dives logged before DecoTrail" (0 when unavailable: numbering must never block saving). */
    async _logOffset() {
        try { return (await this.store.getLogOffset?.()) ?? 0; } catch { return 0; }
    }

    async _loadSuggestions() {
        try {
            // Independent calls: one failing must not hide the others (suggestions are a convenience).
            const [sites, buddies, entries] = await Promise.allSettled([
                this.store.listSites(), this.store.listBuddies(), this.store.listEntries(),
            ]);
            if (this.destroyed) return;
            for (const r of [sites, buddies, entries]) if (r.status === 'rejected') console.error(r.reason);
            if (sites.status === 'fulfilled') {
                this.sites = sites.value;
                const site = this.siteId ? this.sites.find(s => s.id === this.siteId) : null;
                const siteInput = this.container.querySelector('[name="site"]');
                if (site && siteInput && siteInput.value === '' && !this.siteTouched) siteInput.value = this.siteName = site.name;
                this._fillList('lb-sites', this.sites.map(s => s.name));
            }
            if (buddies.status === 'fulfilled') {
                this.buddyNames = buddies.value;
                this._fillList('lb-buddy-names', this.buddyNames);
            }
            if (entries.status === 'fulfilled') {
                this.nextNumber = nextLogNumber(entries.value, await this._logOffset());
                const numberInput = this.container.querySelector('[name="log_number"]');
                if (numberInput && !this.entry) numberInput.placeholder = String(this.nextNumber);
            }
        } catch (error) {
            console.error(error);
        }
    }

    _fillList(id, names) {
        const list = this.container.querySelector(`#${id}`);
        if (list) list.innerHTML = names.map(n => `<option value="${escHtml(n)}"></option>`).join('');
    }

    // ---- Rendering ----

    _input(name, labelKey, value, { type = 'text', mode = '', extra = '' } = {}) {
        const m = mode ? ` inputmode="${mode}"` : '';
        return `<label class="lb-field"><span>${escHtml(tf(labelKey))}</span>
            <input type="${type}" name="${name}" value="${escHtml(value ?? '')}"${m}${extra} autocomplete="off"></label>`;
    }

    _select(name, labelKey, options, value) {
        const opts = [`<option value="">${escHtml(tf('choose'))}</option>`]
            .concat(options.map(o => `<option value="${o}"${o === value ? ' selected' : ''}>${escHtml(tf(`choices.${name}.${o}`))}</option>`));
        return `<label class="lb-field"><span>${escHtml(tf(labelKey))}</span><select name="d.${name}">${opts.join('')}</select></label>`;
    }

    _ratingSelect(value) {
        const current = value === undefined || value === null ? '' : String(value);
        const opts = ['', '1', '2', '3', '4', '5'].map(o => `<option value="${o}"${o === current ? ' selected' : ''}>${o || escHtml(tf('choose'))}</option>`);
        return `<label class="lb-field"><span>${escHtml(tf('rating'))}</span><select name="d.rating">${opts.join('')}</select></label>`;
    }

    _detailNum(key) {
        const v = this.values.details[key];
        if (v === null || v === undefined || v === '') return '';
        return this.comma ? String(v).replace('.', ',') : String(v);
    }

    _detailsOpen() {
        return hasUserDetails(this.values.details);
    }

    render() {
        const v = this.values;
        const d = v.details;
        const tags = Array.isArray(d.tags) ? d.tags : [];
        const otherTags = tags.filter(t => !TAGS.includes(t)).join(', ');
        const detailText = key => this._input(`d.${key}`, key, d[key] ?? '');
        const detailNum = key => this._input(`d.${key}`, key, this._detailNum(key), { mode: DETAIL_INPUT[key] });
        const title = this.entry ? tf('editTitle') : tf('newTitle');
        this.container.innerHTML = `<form class="rda-card lb-form" novalidate>
            <h2>${escHtml(title)}</h2>
            <div class="lb-form-grid">
                <section class="lb-core">
                    <div class="lb-row">
                        ${this._input('log_number', 'number', v.log_number, { mode: 'decimal' })}
                        ${this._input('dive_date', 'date', v.dive_date, { type: 'date' })}
                        ${this._input('entry_time', 'time', v.entry_time, { type: 'time' })}
                    </div>
                    <div class="lb-row">
                        ${this._input('duration_min', 'duration', v.duration_min)}
                        ${this._input('max_depth_m', 'depth', v.max_depth_m, { mode: 'decimal' })}
                    </div>
                    <div class="lb-row">
                        ${this._input('water_temp_c', 'waterTemp', v.water_temp_c, { mode: 'decimal' })}
                        ${detailNum('surfaceTempC')}
                    </div>
                    <div class="lb-field lb-site">
                        <span>${escHtml(tf('site'))}</span>
                        <div class="lb-site-row">
                            <input type="text" name="site" value="${escHtml(this.siteName)}" list="lb-sites" autocomplete="off" aria-label="${escHtml(tf('site'))}">
                            <button type="button" class="btn btn-secondary" id="lb-pick-map">${escHtml(tf('pickOnMap'))}</button>
                        </div>
                        <datalist id="lb-sites"></datalist>
                    </div>
                    <div class="lb-field lb-buddies-field">
                        <span>${escHtml(tf('buddies'))}</span>
                        <div class="lb-chips">${v.buddies.map((b, i) => `<span class="lb-chip">${escHtml(b)}<button type="button" class="lb-chip-x" data-buddy="${i}" aria-label="${escHtml(fill(tf('buddyRemove'), b))}">×</button></span>`).join('')}</div>
                        <div class="lb-site-row">
                            <input type="text" name="buddy" list="lb-buddy-names" autocomplete="off" placeholder="${escHtml(tf('buddyAdd'))}" aria-label="${escHtml(tf('buddyAdd'))}">
                            <button type="button" class="btn btn-secondary" id="lb-add-buddy" aria-label="${escHtml(tf('buddyAdd'))}">+</button>
                        </div>
                        <datalist id="lb-buddy-names"></datalist>
                    </div>
                    ${this._gasesHtml()}
                    <div class="lb-row">
                        ${this._input('vis_shallow_m', 'visShallow', v.vis_shallow_m, { mode: 'decimal' })}
                        ${this._input('vis_deep_m', 'visDeep', v.vis_deep_m, { mode: 'decimal' })}
                    </div>
                    <label class="lb-field"><span>${escHtml(tf('notes'))}</span><textarea name="notes" rows="3">${escHtml(v.notes)}</textarea></label>
                    <div class="lb-field lb-media-field">
                        <span>${escHtml(tf('photosTitle'))}</span>
                        ${this.media ? '<div class="lb-media-host"></div>' : `<p class="lb-muted">${escHtml(tf('photosAfterSave'))}</p>`}
                    </div>
                    ${this._sharingHtml()}
                </section>
                <details class="lb-more"${this._detailsOpen() ? ' open' : ''}>
                    <summary>${escHtml(tf('more'))}</summary>
                    <h3>${escHtml(tf('conditions'))}</h3>
                    <div class="lb-row">
                        ${detailNum('airTempC')}
                    </div>
                    <div class="lb-row">
                        ${this._select('weather', 'weather', CHOICES.weather, d.weather)}
                        ${this._select('current', 'current', CHOICES.current, d.current)}
                        ${this._select('waves', 'waves', CHOICES.waves, d.waves)}
                    </div>
                    <h3>${escHtml(tf('equipment'))}</h3>
                    <div class="lb-row">
                        ${detailNum('weightsKg')}
                    </div>
                    <div class="lb-row">
                        ${this._select('suit', 'suit', CHOICES.suit, d.suit)}
                        ${detailNum('suitMm')}
                    </div>
                    ${detailText('computer')}
                    <h3>${escHtml(tf('dive'))}</h3>
                    <div class="lb-row">
                        ${this._select('entry', 'entry', CHOICES.entry, d.entry)}
                        ${detailNum('avgDepthM')}
                        ${this._select('stops', 'stops', CHOICES.stops, d.stops)}
                    </div>
                    <fieldset class="lb-field">
                        <legend>${escHtml(tf('tags'))}</legend>
                        <div class="lb-radios">${TAGS.map(t => `<label class="lb-radio"><input type="checkbox" name="tag" value="${t}"${tags.includes(t) ? ' checked' : ''}><span>${escHtml(tf(`choices.tags.${t}`))}</span></label>`).join('')}</div>
                    </fieldset>
                    ${this._input('d.tagsOther', 'tagsOther', otherTags)}
                    ${detailText('guide')}
                    ${this._ratingSelect(d.rating)}
                </details>
            </div>
            <p class="lb-form-error" role="alert"${this.error ? '' : ' hidden'}>${escHtml(this.error)}</p>
            <div class="lb-actions">
                <button type="submit" class="btn btn-primary" id="lb-save"${this.saving ? ' disabled' : ''}>${escHtml(this.saving ? tf('saving') : tf('save'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-cancel">${escHtml(tf('cancel'))}</button>
            </div>
        </form>`;
        this._wire();
        if (this.media) this.container.querySelector('.lb-media-host').appendChild(this.media.el);
        this._fillList('lb-sites', this.sites.map(s => s.name));
        this._fillList('lb-buddy-names', this.buddyNames);
        const numberInput = this.container.querySelector('[name="log_number"]');
        if (numberInput && !this.entry && this.nextNumber) numberInput.placeholder = String(this.nextNumber);
    }

    _wire() {
        const c = this.container;
        c.querySelector('[name="site"]').addEventListener('input', () => { this.siteTouched = true; });
        c.querySelector('#lb-pick-map').addEventListener('click', () => this._pickOnMap());
        c.querySelector('form').addEventListener('submit', e => {
            e.preventDefault();
            this._save();
        });
        c.querySelector('#lb-cancel').addEventListener('click', () => this.onCancel?.());
        this._wireGases();
        const buddyInput = c.querySelector('[name="buddy"]');
        c.querySelector('#lb-add-buddy').addEventListener('click', () => this._addBuddy());
        buddyInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                this._addBuddy();
            }
        });
        buddyInput.addEventListener('change', () => {
            if (buddyInput.value.trim() && this.buddyNames.includes(buddyInput.value.trim())) this._addBuddy();
        });
        for (const x of c.querySelectorAll('[data-buddy]')) {
            x.addEventListener('click', () => {
                this._readDom();
                this.values.buddies.splice(Number(x.dataset.buddy), 1);
                this.render();
                this.container.querySelector('[name="buddy"]')?.focus();
            });
        }
    }

    _addBuddy() {
        const input = this.container.querySelector('[name="buddy"]');
        const name = input.value.trim().replace(/,$/, '').trim();
        if (!name) return;
        this._readDom();
        if (!this.values.buddies.some(b => b.toLocaleLowerCase() === name.toLocaleLowerCase())) this.values.buddies.push(name);
        this.container.querySelector('[name="buddy"]').value = '';
        this.render();
        this.container.querySelector('[name="buddy"]')?.focus();
    }

    // ---- Who can see this dive ----

    /** Private / Members radios and the exact-location checkbox; an existing `link` value is shown so it is not silently changed. */
    _sharingHtml() {
        if (!this.sharing) return '';
        const { visibility, share_location: shareLocation } = this.sharing;
        const values = visibility === 'link' ? [...OFFERED_VISIBILITIES, 'link'] : OFFERED_VISIBILITIES;
        const radio = value => {
            const [label, help] = VISIBILITY_TEXT[value];
            return `<label class="lb-vis-option"><input type="radio" name="visibility" value="${value}"${value === visibility ? ' checked' : ''}>
                <span class="lb-vis-text"><span class="lb-vis-label">${escHtml(tt(`form.visibility.${value}`, label))}</span>
                <span class="lb-vis-help">${escHtml(tt(`form.visibilityHelp.${value}`, help))}</span></span></label>`;
        };
        return `<fieldset class="lb-field lb-visibility">
                        <legend>${escHtml(tt('form.whoCanSee', 'Who can see this dive'))}</legend>
                        <div class="lb-vis-options">${values.map(radio).join('')}</div>
                        <label class="lb-check lb-vis-location"><input type="checkbox" name="share_location"${shareLocation ? ' checked' : ''}>
                            <span>${escHtml(tt('form.shareLocation', 'Show the exact location to members'))}</span></label>
                    </fieldset>`;
    }

    // ---- Gases ----

    _gasesHtml() {
        const rows = this.values.gases;
        const add = rows.length ? 'gasAddDeco' : 'gasAdd';
        return `<fieldset class="lb-field lb-gases">
                        <legend>${escHtml(tf('gases'))}</legend>
                        ${rows.length ? rows.map((row, i) => this._gasCardHtml(row, i)).join('') : `<p class="lb-gases-empty">${escHtml(tf('gasesEmpty'))}</p>`}
                        <p class="lb-gas-summary" aria-live="polite" hidden></p>
                        <button type="button" class="btn btn-secondary" id="lb-add-gas">${escHtml(tf(add))}</button>
                    </fieldset>`;
    }

    _gasCardHtml(row, i) {
        const opt = (value, label, current) => `<option value="${escHtml(value)}"${value === current ? ' selected' : ''}>${escHtml(label)}</option>`;
        const field = (labelKey, control) => `<label class="lb-field"><span>${escHtml(tf(labelKey))}</span>${control}</label>`;
        const text = (name, value) => `<input type="text" name="gas.${name}" value="${escHtml(value ?? '')}" inputmode="decimal" autocomplete="off">`;
        const roles = ['bottom', 'deco'].map(r => opt(r, tf(r === 'deco' ? 'roleDeco' : 'roleBottom'), row.role)).join('');
        const mixes = [opt('', tf('choose'), row.mix), ...MIX_PRESETS.map(m => opt(m.id, gasName(m), row.mix)),
            opt('nx', tf('mixNx'), row.mix), opt('tx', tf('mixTx'), row.mix)].join('');
        const cylText = p => cylinderText({ cylinder: p.id }, { fmt: n => fmtNum(n), material: m => tf(`choices.cylinderMaterial.${m}`) });
        const groups = CYLINDER_GROUPS.map(g => `<optgroup label="${escHtml(tf(`cylinderGroups.${g}`))}">${CYLINDER_PRESETS.filter(p => p.group === g).map(p => opt(p.id, cylText(p), row.cylinder)).join('')}</optgroup>`).join('');
        const cylinders = opt('', tf('choose'), row.cylinder) + groups + opt('custom', tf('cylinderCustom'), row.cylinder);
        const materials = [opt('', tf('choose'), row.material), ...MATERIALS.map(m => opt(m, tf(`choices.cylinderMaterial.${m}`), row.material))].join('');
        const blend = row.mix === 'nx' || row.mix === 'tx'
            ? `<div class="lb-gas-pair">${field('gasO2', text('o2', row.o2))}${row.mix === 'tx' ? field('gasHe', text('he', row.he)) : ''}</div>` : '';
        const custom = row.cylinder === 'custom'
            ? `<div class="lb-gas-pair">${field('volumeL', text('volumeL', row.volumeL))}${field('material', `<select name="gas.material">${materials}</select>`)}</div>` : '';
        return `<div class="lb-gas-card${row.role === 'deco' ? ' lb-gas-card--deco' : ''}" data-gas-index="${i}">
                            <span class="lb-gas-gauge" aria-hidden="true"></span>
                            <div class="lb-gas-head">
                                <select name="gas.role" aria-label="${escHtml(tf('gasRole'))}">${roles}</select>
                                <strong class="lb-gas-name"></strong>
                                <button type="button" class="lb-gas-remove" aria-label="${escHtml(fill(tf('gasRemove'), i + 1))}">×</button>
                            </div>
                            <div class="lb-gas-pair">${field('gasMix', `<select name="gas.mix">${mixes}</select>`)}${field('cylinder', `<select name="gas.cylinder">${cylinders}</select>`)}</div>
                            ${blend}${custom}
                            <div class="lb-gas-pair">${field('startBar', text('startBar', row.startBar))}${field('endBar', text('endBar', row.endBar))}</div>
                            <p class="lb-gas-use"></p>
                        </div>`;
    }

    /** Form rows of the gas cards, in card order. */
    _gasRowsFromDom() {
        return [...this.container.querySelectorAll('.lb-gas-card')].map(card => {
            const get = name => card.querySelector(`[name="gas.${name}"]`)?.value ?? '';
            const row = {};
            for (const k of ['role', 'mix', 'o2', 'he', 'cylinder', 'volumeL', 'material', 'startBar', 'endBar']) row[k] = get(k);
            row.role = row.role === 'deco' ? 'deco' : 'bottom';
            return row;
        });
    }

    _wireGases() {
        const c = this.container;
        const block = c.querySelector('.lb-gases');
        const structural = new Set(['gas.role', 'gas.mix', 'gas.cylinder']);
        block.addEventListener('input', () => { this.gasTouched = true; });
        block.addEventListener('change', e => {
            this.gasTouched = true;
            const name = e.target.name;
            if (!structural.has(name)) return;
            const card = e.target.closest('.lb-gas-card');
            const i = Number(card.dataset.gasIndex);
            const before = this.values.gases[i];
            this._readDom();
            const row = this.values.gases[i];
            // Switching from a preset to a custom choice starts from the preset's values.
            const mixWas = MIX_PRESETS.find(m => m.id === before?.mix);
            if (name === 'gas.mix' && mixWas && (row.mix === 'nx' || row.mix === 'tx') && !row.o2) {
                row.o2 = this._num(Math.round(mixWas.o2 * 100));
                if (row.mix === 'tx' && !row.he) row.he = this._num(Math.round(mixWas.he * 100));
            }
            const cylWas = cylinderPreset(before?.cylinder);
            if (name === 'gas.cylinder' && cylWas && row.cylinder === 'custom' && !row.volumeL) {
                row.volumeL = this._num(cylWas.volumeL);
                row.material = cylWas.material;
            }
            this.render();
            this._focusGas(i, name);
        });
        c.querySelector('#lb-add-gas').addEventListener('click', () => {
            this.gasTouched = true;
            this._readDom();
            this.values.gases.push(newGasRow(this.values.gases.length ? 'deco' : 'bottom'));
            this.render();
            this._focusGas(this.values.gases.length - 1, 'gas.mix');
        });
        for (const x of c.querySelectorAll('.lb-gas-remove')) {
            x.addEventListener('click', () => {
                this.gasTouched = true;
                this._readDom();
                this.values.gases.splice(Number(x.closest('.lb-gas-card').dataset.gasIndex), 1);
                this.render();
                this.container.querySelector('#lb-add-gas')?.focus();
            });
        }
        // Gauges, usage lines and the summary follow every keystroke without re-rendering (focus stays).
        c.querySelector('form').addEventListener('input', () => this._updateGasLive());
        c.querySelector('form').addEventListener('change', () => this._updateGasLive());
        this._updateGasLive();
    }

    _num(value) {
        return this.comma ? String(value).replace('.', ',') : String(value);
    }

    _focusGas(index, name) {
        this.container.querySelectorAll('.lb-gas-card')[index]?.querySelector(`[name="${name}"]`)?.focus();
    }

    /** Update the gauges, mix names, usage lines and the summary from the inputs. */
    _updateGasLive() {
        const c = this.container;
        const cards = [...c.querySelectorAll('.lb-gas-card')];
        const summary = c.querySelector('.lb-gas-summary');
        if (!summary) return;
        const { gases } = gasesFromFormRows(this._gasRowsFromDom());
        const durationS = parseDuration(c.querySelector('[name="duration_min"]')?.value);
        const avgDepthM = parseDecimal(c.querySelector('[name="d.avgDepthM"]')?.value);
        const usage = gasUsage(gases, { durationS, avgDepthM });
        cards.forEach((card, i) => {
            const g = gases[i];
            const u = usage.rows[i];
            card.querySelector('.lb-gas-name').textContent = Number.isFinite(g.o2) ? gasName(g) : tf('choose');
            const known = g.startBar !== null && g.endBar !== null && g.startBar > 0 && g.endBar <= g.startBar;
            card.style.setProperty('--fill', known ? `${Math.round((g.endBar / g.startBar) * 100)}%` : '100%');
            card.classList.toggle('lb-gas-card--unknown', !known);
            const end = card.querySelector('[name="gas.endBar"]');
            const backwards = g.startBar !== null && g.endBar !== null && g.endBar > g.startBar;
            if (backwards) end.setAttribute('aria-invalid', 'true'); else end.removeAttribute('aria-invalid');
            const parts = [];
            if (u.usedBar !== null) parts.push(`${u.usedBar > 0 ? '−' : ''}${fmtNum(Math.round(u.usedBar * 10) / 10)}${NBSP}bar`);
            if (u.usedL !== null) parts.push(`${fmtNum(u.usedL, 0)}${NBSP}l`);
            card.querySelector('.lb-gas-use').textContent = parts.join(' · ');
        });
        if (usage.totalL === null) {
            summary.hidden = true;
            summary.textContent = '';
            return;
        }
        const used = `${tf('gasUsed')} ${fmtNum(usage.totalL, 0)}${NBSP}l`;
        summary.innerHTML = usage.sacLpm !== null
            ? escHtml(`${used} · ${tf('sac')} ${fmtNum(usage.sacLpm, 1)}${NBSP}l/min`)
            : `${escHtml(used)}<span class="lb-gas-hint">${escHtml(tf('sacNeedsAvg'))}</span>`;
        summary.hidden = false;
    }

    /**
     * Edit of a recording-linked entry saved before gas rows existed: take the gases from the
     * recording and keep the cylinder and pressures typed earlier on the bottom gas.
     * Never throws; leaves the form alone once the diver touched the gas block.
     */
    async _prefillGasesFromRecording() {
        try {
            const record = await this.store.loadDive?.(this.entry.recording_id);
            if (!record || this.destroyed || this.gasTouched) return;
            const rows = gasesFromRecording(record);
            if (!rows.length) return;
            const legacy = gasesFromEntry(this.entry)[0];
            if (legacy) {
                const bottom = rows.find(r => r.role === 'bottom') ?? rows[0];
                for (const k of ['cylinder', 'volumeL', 'material', 'startBar', 'endBar']) bottom[k] = legacy[k];
                // The diver may have corrected the mix the computer was set to: the stored mix wins.
                if (Number.isFinite(legacy.o2)) Object.assign(bottom, { o2: legacy.o2, he: legacy.he });
            }
            const el = this.container.contains(document.activeElement) ? document.activeElement : null;
            const active = el?.name ? { name: el.name, at: [...this.container.querySelectorAll(`[name="${el.name}"]`)].indexOf(el) } : null;
            // A buddy name being typed must stay text, not turn into a chip because the recording arrived.
            const buddyInput = this.container.querySelector('[name="buddy"]');
            const pendingBuddy = buddyInput?.value ?? '';
            if (buddyInput) buddyInput.value = '';
            this._readDom();
            this.values.gases = formRowsFromGases(rows, { comma: this.comma });
            this.render();
            const buddyAfter = this.container.querySelector('[name="buddy"]');
            if (buddyAfter) buddyAfter.value = pendingBuddy;
            if (active) this.container.querySelectorAll(`[name="${active.name}"]`)[Math.max(0, active.at)]?.focus();
        } catch (error) {
            console.error(error);
        }
    }

    // ---- Reading and saving ----

    /** Copy the DOM inputs into `this.values`. */
    _readDom() {
        const c = this.container;
        const get = name => c.querySelector(`[name="${name}"]`)?.value ?? '';
        const v = this.values;
        for (const k of ['log_number', 'dive_date', 'entry_time', 'duration_min', 'max_depth_m', 'water_temp_c',
            'vis_shallow_m', 'vis_deep_m', 'notes']) v[k] = get(k);
        if (c.querySelector('.lb-gases')) v.gases = this._gasRowsFromDom();
        this.siteName = get('site');
        const pending = get('buddy').trim();
        if (pending && !v.buddies.some(b => b.toLocaleLowerCase() === pending.toLocaleLowerCase())) v.buddies.push(pending);
        const buddyInput = c.querySelector('[name="buddy"]');
        if (buddyInput) buddyInput.value = '';
        const d = v.details;
        for (const key of ['surfaceTempC', ...Object.values(DETAIL_KEYS).flat()]) {
            if (key === 'tags') continue;
            const el = c.querySelector(`[name="d.${key}"]`);
            if (el) d[key] = el.value;
        }
        if (this.sharing && c.querySelector('.lb-visibility')) {
            this.sharing.visibility = c.querySelector('[name="visibility"]:checked')?.value ?? this.sharing.visibility;
            this.sharing.share_location = c.querySelector('[name="share_location"]').checked;
        }
        const other = get('d.tagsOther').split(',').map(t => t.trim()).filter(Boolean);
        d.tags = [...[...c.querySelectorAll('[name="tag"]:checked')].map(i => i.value), ...other];
    }

    /** Details with numbers parsed, ready for `normalizeEntry`. */
    _detailsForSave() {
        const out = {};
        for (const [key, value] of Object.entries(this.values.details)) {
            if (key === 'rating') {
                const r = parseDecimal(value);
                out[key] = r === null ? null : Math.min(5, Math.max(1, Math.round(r)));
            } else if (NUMERIC_DETAILS.has(key)) out[key] = parseDecimal(value);
            else out[key] = value;
        }
        return out;
    }

    /** Open the map picker; a chosen or newly saved site fills the site field. */
    async _pickOnMap() {
        const input = this.container.querySelector('[name="site"]');
        if (!input || this._picking) return;
        this._picking = true;
        try {
            this.siteName = input.value;
            const current = this.sites.find(s => s.id === this.siteId && s.name === input.value.trim());
            this._pickAbort = new AbortController();
            const site = await openSitePicker({ store: this.store, sites: this.sites, initial: current ?? null, initialName: input.value.trim(), signal: this._pickAbort.signal });
            if (!site || this.destroyed) return;
            const at = this.sites.findIndex(s => s.id === site.id);
            if (at >= 0) this.sites[at] = site; else this.sites.push(site);
            this.siteId = site.id;
            this.siteName = site.name;
            this.siteTouched = true;
            const field = this.container.querySelector('[name="site"]');
            if (field) field.value = site.name;
            this._fillList('lb-sites', this.sites.map(s => s.name));
        } finally {
            this._picking = false;
        }
    }

    async _resolveSiteId() {
        const name = this.siteName.trim();
        if (!name) return this.siteTouched ? null : this.siteId; // untouched and not loaded yet: keep the stored site
        const known = this.sites.find(s => s.id === this.siteId);
        if (known && known.name === name) return known.id;
        const match = this.sites.find(s => s.name.toLocaleLowerCase() === name.toLocaleLowerCase());
        if (match) return match.id;
        const created = await this.store.saveSite({ name });
        this.sites.push(created); // a retry after a failed save must not create it again
        return created.id;
    }

    _setError(text) {
        this.error = text;
        const p = this.container.querySelector('.lb-form-error');
        if (p) {
            p.textContent = text;
            p.hidden = !text;
        }
    }

    _setSaving(on) {
        this.saving = on;
        const b = this.container.querySelector('#lb-save');
        if (b) {
            b.disabled = on;
            b.textContent = on ? tf('saving') : tf('save');
        }
    }

    async _save() {
        if (this.saving) return;
        this._readDom();
        const v = this.values;
        this._setError('');
        if (!v.dive_date) {
            this._setError(tf('dateRequired'));
            return;
        }
        const bad = invalidNumberFields(v);
        if (bad.length) {
            this._setError(fill(tf('invalidNumber'), labelOf(bad[0])));
            return;
        }
        if (this.entry && !String(v.log_number).trim()) {
            this._setError(tf('numberRequired'));
            return;
        }
        const { gases, errors } = gasesFromFormRows(v.gases);
        if (errors.length) {
            const { field } = errors[0];
            this._setError(field === 'mix' ? tf('gasInvalid') : fill(tf('invalidNumber'), labelOf(field)));
            return;
        }
        const gas = primaryGas(gases);
        const details = {
            ...this._detailsForSave(),
            gases, // [] is kept: a cleared gas block must not be refilled from the recording on the next edit
            // Legacy single-cylinder keys: the gas rows replace them, so they are removed on save.
            cylinderL: null, cylinderMaterial: null, pressureStartBar: null, pressureEndBar: null,
        };
        this._setSaving(true);
        let number = null;
        try {
            const siteId = await this._resolveSiteId();
            this.siteId = siteId;
            const time = this.entry?.entry_time && String(this.entry.entry_time).slice(0, 5) === v.entry_time
                ? this.entry.entry_time : v.entry_time;
            const row = normalizeEntry({ ...v, ...(this.sharing ?? {}), entry_time: time, site_id: siteId, gas, details }, this.entry?.details);
            if (!this.entry && row.log_number === null) {
                row.log_number = nextLogNumber(await this.store.listEntries(), await this._logOffset());
                this.container.querySelector('[name="log_number"]').value = String(row.log_number);
            }
            number = row.log_number;
            if (!this.entry && this.recordingId) row.recording_id = this.recordingId;
            const saved = await this.store.saveEntry(row, this.entry?.id);
            if (this.destroyed) return;
            this.onSaved?.(saved);
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this._setSaving(false);
            if (error?.kind === 'recording-linked') this._setError(tf('recordingLinked'));
            else if (error?.kind === 'duplicate-number') this._setError(fill(tl('duplicateNumber', 'Number {0} is already used.'), number ?? v.log_number));
            else if (error?.kind === 'unreachable') this._setError(tb('unreachable'));
            else this._setError(tb('genericError'));
        }
    }
}
