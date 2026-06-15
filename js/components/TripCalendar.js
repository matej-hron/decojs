/**
 * Renders a trip as duration-spanning blocks across day columns, from a planTrip
 * result via computeCalendarLayout. Emits interaction events; owns no trip state.
 *
 * Events (CustomEvent, via addEventListener on the instance which extends EventTarget):
 *   'createAt'   detail: { dayIndex, minutesOfDay }  — user clicked empty area
 *   'selectDive' detail: { diveId }                  — user clicked a block
 */
import { computeCalendarLayout } from '../calendarLayout.js';

const MIN_PER_DAY = 24 * 60;
const DEFAULT_WINDOW = { dayStartMin: 6 * 60, dayEndMin: 20 * 60 };
const SNAP_MIN = 5;

export class TripCalendar extends EventTarget {
    constructor(container, config = {}) {
        super();
        this.container = container;
        this.window = config.window || DEFAULT_WINDOW;
        this.container.classList.add('trip-calendar');
    }

    /** Render from a planTrip result. */
    render(planResult) {
        const layout = computeCalendarLayout(planResult, this.window);
        const span = this.window.dayEndMin - this.window.dayStartMin;
        const byId = new Map((planResult.dives || []).map(d => [d.id, d]));
        this.container.innerHTML = '';

        // One extra empty column to let the user create on the next day.
        const cols = layout.dayCount + 1;
        for (let c = 0; c < cols; c++) {
            const col = document.createElement('div');
            col.className = 'tc-day';
            col.dataset.dayIndex = String(c);

            // Click empty area → createAt(dayIndex, snapped minutesOfDay)
            col.addEventListener('click', (e) => {
                if (e.target !== col) return; // ignore clicks that bubbled from a block
                const rect = col.getBoundingClientRect();
                const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                const raw = this.window.dayStartMin + frac * span;
                const minutesOfDay = Math.round(raw / SNAP_MIN) * SNAP_MIN;
                this.dispatchEvent(new CustomEvent('createAt', { detail: { dayIndex: c, minutesOfDay } }));
            });
            this.container.appendChild(col);
        }

        const colEls = this.container.querySelectorAll('.tc-day');
        layout.blocks.forEach(b => {
            const d = byId.get(b.diveId);
            const block = document.createElement('div');
            block.className = 'tc-block' + (b.conflict ? ' tc-conflict' : '');
            block.style.top = b.topPct + '%';
            block.style.height = Math.max(b.heightPct, 2) + '%';
            block.textContent = `${b.diveId.toUpperCase()} · ${d ? d.maxDepth : '?'}m`;
            block.title = b.conflict ? 'Overlaps previous dive\'s deco' : '';
            block.addEventListener('click', (e) => {
                e.stopPropagation();
                this.dispatchEvent(new CustomEvent('selectDive', { detail: { diveId: b.diveId } }));
            });
            colEls[b.dayIndex].appendChild(block);
        });

        this._layout = layout;
    }

    /** Convert a (dayIndex, minutesOfDay) from a createAt event into an absolute epoch-minute start. */
    toStartDateTime(dayIndex, minutesOfDay) {
        const baseDay = this._layout ? this._layout.baseDay : 0;
        return (baseDay + dayIndex) * MIN_PER_DAY + minutesOfDay;
    }
}
