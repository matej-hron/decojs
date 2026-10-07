/**
 * Logbook entry form: a core section that is always visible and a collapsed
 * "More details" section. Save errors are shown inside the form and never
 * discard what was typed.
 *
 * The helpers at the top are pure (no DOM) and are covered by tests.
 */

import { normalizeEntry, nextLogNumber, parseDecimal, DETAIL_KEYS } from './entryModel.js';
import { openSitePicker } from './SitePicker.js';
import { translate } from '../i18n.js';
import { currentLang, decimalSeparator } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

const NBSP = ' ';

/** Detail keys typed as numbers (the rest are text, choices or the tag list). */
const NUMERIC_DETAILS = new Set(['surfaceTempC', 'airTempC', 'cylinderL', 'pressureStartBar', 'pressureEndBar', 'weightsKg', 'suitMm', 'avgDepthM']);

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
    surfaceTempC: 'decimal', airTempC: 'decimal', cylinderL: 'decimal', pressureStartBar: 'decimal',
    pressureEndBar: 'decimal', weightsKg: 'decimal', suitMm: 'decimal', avgDepthM: 'decimal',
});

const tf = key => translate(`diveLog.logbook.form.${key}`, key);
const tl = (key, fallback = key) => translate(`diveLog.logbook.${key}`, fallback);
const tb = key => translate(`diveLog.backend.${key}`, key);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

// ---- Pure helpers ----

/** Whole minutes with up to two decimals, so the stored seconds survive an edit. */
export function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '';
    return String(Math.round((Number(seconds) / 60) * 100) / 100);
}

/**
 * The `{o2, he}` fractions for a gas choice; null when nothing valid is chosen.
 * @param {{kind: 'air'|'ean'|'tx'|'', o2?: string, he?: string}} gas - percentages as typed
 */
export function gasFromForm({ kind, o2, he }) {
    if (kind === 'air') return { o2: 0.21, he: 0 };
    if (kind !== 'ean' && kind !== 'tx') return null;
    const o2Pct = parseDecimal(o2);
    const hePct = kind === 'tx' ? (parseDecimal(he) ?? 0) : 0;
    if (o2Pct === null || o2Pct <= 0 || o2Pct > 100 || hePct < 0 || o2Pct + hePct > 100) return null;
    const frac = pct => Math.round(pct * 100) / 10000;
    return { o2: frac(o2Pct), he: frac(hePct) };
}

/**
 * Label keys of the numeric fields whose non-blank text is not a number.
 * @param {Object} values - form values (core strings and `details`)
 */
export function invalidNumberFields(values) {
    const bad = [];
    const check = (key, labelKey) => {
        const v = key === null ? null : values[key];
        if (v === null || v === undefined || String(v).trim() === '') return;
        if (parseDecimal(v) === null) bad.push(labelKey);
    };
    const core = { log_number: 'number', duration_min: 'duration', max_depth_m: 'depth', water_temp_c: 'waterTemp', vis_shallow_m: 'visShallow', vis_deep_m: 'visDeep' };
    for (const [k, label] of Object.entries(core)) check(k, label);
    if (values.gasKind === 'ean' || values.gasKind === 'tx') check('gasO2', 'gasO2');
    if (values.gasKind === 'tx') check('gasHe', 'gasHe');
    for (const key of [...NUMERIC_DETAILS, 'rating']) {
        const v = values.details?.[key];
        if (v !== null && v !== undefined && String(v).trim() !== '' && parseDecimal(v) === null) bad.push(key);
    }
    return bad;
}

const pct = fraction => String(Math.round(fraction * 10000) / 100);

/**
 * Form values (strings) for an entry or a computer prefill; the reverse of
 * `normalizeEntry` for everything the form shows.
 * @param {Object} entry - log_entries row or partial prefill
 * @param {{comma?: boolean}} [options] - show a decimal comma
 */
export function formValuesFromEntry(entry, { comma = false } = {}) {
    const text = v => (v === null || v === undefined ? '' : String(v));
    const num = v => (v === null || v === undefined ? '' : (comma ? String(v).replace('.', ',') : String(v)));
    const gas = entry.gas;
    let gasKind = '';
    let gasO2 = '';
    let gasHe = '';
    if (gas) {
        const o2 = Math.round(gas.o2 * 100);
        const he = Math.round(gas.he * 100);
        if (he > 0) [gasKind, gasO2, gasHe] = ['tx', num(pct(gas.o2)), num(pct(gas.he))];
        else if (o2 === 21) gasKind = 'air';
        else [gasKind, gasO2] = ['ean', num(pct(gas.o2))];
    }
    return {
        log_number: text(entry.log_number),
        dive_date: text(entry.dive_date),
        entry_time: text(entry.entry_time).slice(0, 5),
        duration_min: comma ? formatDuration(entry.duration_s).replace('.', ',') : formatDuration(entry.duration_s),
        max_depth_m: num(entry.max_depth_m),
        site_id: entry.site_id ?? null,
        buddies: [...(entry.buddies ?? [])],
        gasKind, gasO2, gasHe,
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
     * @param {(entry: Object) => void} options.onSaved
     * @param {() => void} options.onCancel
     */
    constructor(container, { store, entry = null, prefill = {}, recordingId = null, onSaved, onCancel }) {
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
        this.render();
        this._loadSuggestions();
    }

    destroy() {
        this.destroyed = true;
        this._pickAbort?.abort(); // Back navigation must not leave the picker overlay behind
        this.container.innerHTML = '';
    }

    /** Re-render after a language change, keeping what was typed. */
    relabel() {
        if (this.destroyed) return;
        this._readDom();
        this.render();
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
                this.nextNumber = nextLogNumber(entries.value);
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
        const d = this.values.details;
        return Object.values(DETAIL_KEYS).flat().some(k => {
            const v = d[k];
            return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
        });
    }

    render() {
        const v = this.values;
        const d = v.details;
        const kind = v.gasKind;
        const tags = Array.isArray(d.tags) ? d.tags : [];
        const otherTags = tags.filter(t => !TAGS.includes(t)).join(', ');
        const radio = (value, key) => `<label class="lb-radio"><input type="radio" name="gasKind" value="${value}"${kind === value ? ' checked' : ''}><span>${escHtml(tf(key))}</span></label>`;
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
                        ${this._input('duration_min', 'duration', v.duration_min, { mode: 'decimal' })}
                        ${this._input('max_depth_m', 'depth', v.max_depth_m, { mode: 'decimal' })}
                        ${this._input('water_temp_c', 'waterTemp', v.water_temp_c, { mode: 'decimal' })}
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
                    <fieldset class="lb-field lb-gas">
                        <legend>${escHtml(tf('gas'))}</legend>
                        <div class="lb-radios">${radio('air', 'gasAir')}${radio('ean', 'gasEan')}${radio('tx', 'gasTx')}${radio('', 'gasNone')}</div>
                        <div class="lb-row lb-gas-mix">
                            <label class="lb-field"${kind === 'ean' || kind === 'tx' ? '' : ' hidden'} data-gas="o2"><span>${escHtml(tf('gasO2'))}</span>
                                <input type="text" name="gasO2" value="${escHtml(v.gasO2)}" inputmode="decimal" autocomplete="off"></label>
                            <label class="lb-field"${kind === 'tx' ? '' : ' hidden'} data-gas="he"><span>${escHtml(tf('gasHe'))}</span>
                                <input type="text" name="gasHe" value="${escHtml(v.gasHe)}" inputmode="decimal" autocomplete="off"></label>
                        </div>
                    </fieldset>
                    <div class="lb-row">
                        ${this._input('vis_shallow_m', 'visShallow', v.vis_shallow_m, { mode: 'decimal' })}
                        ${this._input('vis_deep_m', 'visDeep', v.vis_deep_m, { mode: 'decimal' })}
                    </div>
                    <label class="lb-field"><span>${escHtml(tf('notes'))}</span><textarea name="notes" rows="3">${escHtml(v.notes)}</textarea></label>
                </section>
                <details class="lb-more"${this._detailsOpen() ? ' open' : ''}>
                    <summary>${escHtml(tf('more'))}</summary>
                    <h3>${escHtml(tf('conditions'))}</h3>
                    <div class="lb-row">
                        ${detailNum('surfaceTempC')}${detailNum('airTempC')}
                    </div>
                    <div class="lb-row">
                        ${this._select('weather', 'weather', CHOICES.weather, d.weather)}
                        ${this._select('current', 'current', CHOICES.current, d.current)}
                        ${this._select('waves', 'waves', CHOICES.waves, d.waves)}
                    </div>
                    <h3>${escHtml(tf('equipment'))}</h3>
                    <div class="lb-row">
                        ${detailNum('cylinderL')}
                        ${this._select('cylinderMaterial', 'cylinderMaterial', CHOICES.cylinderMaterial, d.cylinderMaterial)}
                    </div>
                    <div class="lb-row">
                        ${detailNum('pressureStartBar')}${detailNum('pressureEndBar')}${detailNum('weightsKg')}
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
        for (const radio of c.querySelectorAll('[name="gasKind"]')) {
            radio.addEventListener('change', () => {
                const kind = c.querySelector('[name="gasKind"]:checked')?.value ?? '';
                c.querySelector('[data-gas="o2"]').hidden = !(kind === 'ean' || kind === 'tx');
                c.querySelector('[data-gas="he"]').hidden = kind !== 'tx';
            });
        }
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

    // ---- Reading and saving ----

    /** Copy the DOM inputs into `this.values`. */
    _readDom() {
        const c = this.container;
        const get = name => c.querySelector(`[name="${name}"]`)?.value ?? '';
        const v = this.values;
        for (const k of ['log_number', 'dive_date', 'entry_time', 'duration_min', 'max_depth_m', 'water_temp_c',
            'vis_shallow_m', 'vis_deep_m', 'notes', 'gasO2', 'gasHe']) v[k] = get(k);
        v.gasKind = c.querySelector('[name="gasKind"]:checked')?.value ?? '';
        this.siteName = get('site');
        const pending = get('buddy').trim();
        if (pending && !v.buddies.some(b => b.toLocaleLowerCase() === pending.toLocaleLowerCase())) v.buddies.push(pending);
        const buddyInput = c.querySelector('[name="buddy"]');
        if (buddyInput) buddyInput.value = '';
        const d = v.details;
        for (const key of Object.values(DETAIL_KEYS).flat()) {
            if (key === 'tags') continue;
            const el = c.querySelector(`[name="d.${key}"]`);
            if (el) d[key] = el.value;
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
            const label = key => tf(key).replace(/\u00a0\(.*\)$/, '');
            this._setError(fill(tf('invalidNumber'), label(bad[0])));
            return;
        }
        if (this.entry && !String(v.log_number).trim()) {
            this._setError(tf('numberRequired'));
            return;
        }
        const gas = gasFromForm({ kind: v.gasKind, o2: v.gasO2, he: v.gasHe });
        if ((v.gasKind === 'ean' || v.gasKind === 'tx') && !gas) {
            this._setError(tf('gasInvalid'));
            return;
        }
        this._setSaving(true);
        let number = null;
        try {
            const siteId = await this._resolveSiteId();
            this.siteId = siteId;
            const time = this.entry?.entry_time && String(this.entry.entry_time).slice(0, 5) === v.entry_time
                ? this.entry.entry_time : v.entry_time;
            const row = normalizeEntry({ ...v, entry_time: time, site_id: siteId, gas, details: this._detailsForSave() }, this.entry?.details);
            if (!this.entry && row.log_number === null) {
                row.log_number = nextLogNumber(await this.store.listEntries());
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
