/**
 * Per-dive edit panel: a start date+time field plus a stripped-down DiveSetupEditor
 * (quick-setup depth/bottom-time + gas management). Emits 'apply' / 'remove'.
 *
 * Events:
 *   'apply'  detail: { id, patch: { startDateTime, maxDepth, bottomTime, gases } }
 *   'remove' detail: { id }
 */
import { DiveSetupEditor } from './DiveSetupEditor.js';

// epoch-minutes <-> <input type="datetime-local"> helpers (treat minute 0 as a fixed base date).
const BASE = Date.UTC(2026, 0, 1, 0, 0, 0); // arbitrary trip epoch; only relative days/times matter
function epochMinToLocalInput(min) {
    const d = new Date(BASE + min * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function localInputToEpochMin(value) {
    const [datePart, timePart] = value.split('T');
    const [y, mo, da] = datePart.split('-').map(Number);
    const [h, mi] = timePart.split(':').map(Number);
    const ms = Date.UTC(y, mo - 1, da, h, mi);
    return Math.round((ms - BASE) / 60000);
}

export class DiveEditPanel extends EventTarget {
    constructor(container) {
        super();
        this.container = container;
        this.dive = null;
        this.editor = null;
    }

    open(dive) {
        this.dive = dive;
        this.container.innerHTML = `
            <div class="dep-row">
                <label>Start <input type="datetime-local" class="dep-start" value="${epochMinToLocalInput(dive.startDateTime)}"></label>
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
                showDescription: false, showImportExport: false
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
            const maxDepth = parseFloat(this.editor.elements.quickDepth.value);
            const bottomTime = parseFloat(this.editor.elements.quickTime.value);

            const startDateTime = localInputToEpochMin(this.container.querySelector('.dep-start').value);
            this.dispatchEvent(new CustomEvent('apply', {
                detail: { id: this.dive.id, patch: { startDateTime, maxDepth, bottomTime, gases: setup.gases } }
            }));
        };

        this.editor.addEventListener('change', emitApply);
        this.container.querySelector('.dep-start').addEventListener('change', emitApply);
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
