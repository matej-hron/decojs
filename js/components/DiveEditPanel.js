/**
 * Per-dive edit panel: a start date+time field plus a stripped-down DiveSetupEditor
 * (quick-setup depth/bottom-time + gas management). Emits 'apply' / 'remove'.
 *
 * Events:
 *   'apply'  detail: { id, patch: { startDateTime, maxDepth, bottomTime, gases } }
 *   'remove' detail: { id }
 */
import { DiveSetupEditor } from './DiveSetupEditor.js';
import { baseFromStartDate, epochMinToLocalInput, localInputToEpochMin } from '../tripTime.js';

// Escape user-controlled text before interpolating into innerHTML.
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

export class DiveEditPanel extends EventTarget {
    constructor(container) {
        super();
        this.container = container;
        this.dive = null;
        this.editor = null;
    }

    open(dive, startDate) {
        if (this.editor) this.close();
        this.dive = dive;

        // Compute the epoch base from the trip start date (defaults to '2026-01-01' if not provided).
        // Use UTC midnight to match the .getUTC* reads in epochMinToLocalInput, so displayed
        // times are not shifted by the user's local UTC offset.
        const base = baseFromStartDate(startDate);

        this.container.innerHTML = `
            <div class="dep-header">Editing: ${esc(dive.name || dive.id)}</div>
            <div class="dep-row">
                <label>Name <input type="text" class="dep-name" value="${esc(dive.name || '')}"></label>
                <label>Start <input type="datetime-local" class="dep-start" value="${epochMinToLocalInput(dive.startDateTime, base)}"></label>
                <button class="dep-remove">Remove dive</button>
            </div>
            <div class="dep-editor"></div>`;

        const editorSetup = {
            gases: dive.gases,
            gfLow: 100, gfHigh: 100,
            dives: [{ waypoints: [] }]
        };
        this.editor = new DiveSetupEditor(this.container.querySelector('.dep-editor'), {
            diveSetup: editorSetup,
            options: {
                showProfiles: false, showQuickSetup: true, showGradientFactors: false,
                showSacRate: false, showMultiDive: false, showSurfaceInterval: false,
                showDescription: false, showImportExport: false,
                showSafetyStop: false, showGenerateButton: false, showWaypoints: false,
                showValidation: false,
            }
        });

        // Pre-fill the quick-setup inputs with the dive's current values.
        // We do NOT use getDiveSetup().dives[0].waypoints for maxDepth/bottomTime because
        // the editor starts with an empty waypoints table (no Generate has been clicked yet),
        // so Math.max(...[]) would yield -Infinity. Reading the quick inputs directly is
        // always safe — they are DOM number inputs that always hold a parseable value.
        if (this.editor.elements && this.editor.elements.quickDepth) {
            this.editor.elements.quickDepth.value = dive.maxDepth;
            this.editor.elements.quickTime.value = dive.bottomTime;
        }

        const emitApply = () => {
            const setup = this.editor.getDiveSetup();

            // Read depth/time from the quick-setup inputs rather than deriving
            // from waypoints, because waypoints are only populated after the user
            // clicks "Generate Profile". Using the inputs ensures we never emit NaN.
            const maxDepth = parseFloat(this.editor.elements.quickDepth.value) || this.dive.maxDepth;
            const bottomTime = parseFloat(this.editor.elements.quickTime.value) || this.dive.bottomTime;

            const name = (this.container.querySelector('.dep-name').value || this.dive.name || '').trim();
            const sdt = localInputToEpochMin(this.container.querySelector('.dep-start').value, base);
            const startDateTime = Number.isFinite(sdt) ? sdt : this.dive.startDateTime;
            this.dispatchEvent(new CustomEvent('apply', {
                detail: { id: this.dive.id, patch: { startDateTime, maxDepth, bottomTime, gases: setup.gases, name } }
            }));
        };

        this.editor.addEventListener('change', emitApply);
        this.container.querySelector('.dep-start').addEventListener('change', emitApply);
        this.container.querySelector('.dep-name').addEventListener('change', emitApply);
        // quickDepth/quickTime only trigger _updateNDLDisplay on the editor, not a
        // full 'change' event. Attach a direct 'change' listener so the panel
        // re-emits 'apply' whenever the user edits depth or bottom time.
        if (this.editor.elements && this.editor.elements.quickDepth) {
            this.editor.elements.quickDepth.addEventListener('change', emitApply);
            this.editor.elements.quickTime.addEventListener('change', emitApply);
        }
        this.container.querySelector('.dep-remove').addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('remove', { detail: { id: this.dive.id } }));
        });
    }

    close() {
        if (this.editor && this.editor.destroy) this.editor.destroy();
        this.editor = null;
        this.dive = null;
        this.container.innerHTML = '';
    }
}
