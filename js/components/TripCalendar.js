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
const DEFAULT_WINDOW = { dayStartMin: 6 * 60, dayEndMin: 20 * 60, dayCount: 3 };
const SNAP_MIN = 5;

function formatDayHeader(startDate, dayIndex) {
    const base = (startDate instanceof Date) ? startDate : new Date(startDate + 'T00:00:00');
    const d = new Date(base.getTime() + dayIndex * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export class TripCalendar extends EventTarget {
    constructor(container, config = {}) {
        super();
        this.container = container;
        this.window = config.window || DEFAULT_WINDOW;
        this.startDate = config.startDate || '2026-06-15';
        this.container.classList.add('trip-calendar');
    }

    configure({ startDate, dayCount }) {
        if (startDate !== undefined) this.startDate = startDate;
        if (dayCount !== undefined) this.window = { ...this.window, dayCount };
    }

    /** Render from a planTrip result. */
    render(planResult) {
        const layout = computeCalendarLayout(planResult, this.window);
        const { dayStartMin, dayEndMin } = this.window;
        const span = dayEndMin - dayStartMin;
        const byId = new Map((planResult.dives || []).map(d => [d.id, d]));
        this.container.innerHTML = '';

        // Left hour ruler
        const ruler = document.createElement('div');
        ruler.className = 'tc-ruler';
        const startHour = Math.floor(dayStartMin / 60);
        const endHour = Math.ceil(dayEndMin / 60);
        for (let H = startHour; H <= endHour; H++) {
            const label = document.createElement('div');
            label.className = 'tc-hour-label';
            label.style.top = ((H * 60 - dayStartMin) / span * 100) + '%';
            label.textContent = String(H).padStart(2, '0') + ':00';
            ruler.appendChild(label);
        }
        this.container.appendChild(ruler);

        // Exactly dayCount columns (no phantom column)
        const colEls = [];
        for (let c = 0; c < layout.dayCount; c++) {
            const col = document.createElement('div');
            col.className = 'tc-day';
            col.dataset.dayIndex = String(c);

            // Date header
            const header = document.createElement('div');
            header.className = 'tc-day-header';
            header.textContent = formatDayHeader(this.startDate, c);
            col.appendChild(header);

            // Hour gridlines
            for (let H = startHour; H <= endHour; H++) {
                const line = document.createElement('div');
                line.className = 'tc-hour-line';
                line.style.top = ((H * 60 - dayStartMin) / span * 100) + '%';
                col.appendChild(line);
            }

            // Click empty area → createAt(dayIndex, snapped minutesOfDay)
            col.addEventListener('click', (e) => {
                if (e.target !== col) return; // ignore clicks that bubbled from a block/header/line
                const rect = col.getBoundingClientRect();
                const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                const raw = dayStartMin + frac * span;
                const minutesOfDay = Math.round(raw / SNAP_MIN) * SNAP_MIN;
                this.dispatchEvent(new CustomEvent('createAt', { detail: { dayIndex: c, minutesOfDay } }));
            });

            this.container.appendChild(col);
            colEls.push(col);
        }

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
        return dayIndex * MIN_PER_DAY + minutesOfDay;
    }
}
