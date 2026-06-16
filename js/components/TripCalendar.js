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
const SNAP_MIN = 60;
const DRAG_THRESHOLD = 4;   // px of movement before a press becomes a drag
const SNAP_DRAG_MIN = 15;   // drag drops snap to 15 minutes

/** Snap a minutes-of-day value to `snap` and clamp it to the visible window. Pure. */
export function snapClamp(rawMin, dayStartMin, dayEndMin, snap) {
    const snapped = Math.round(rawMin / snap) * snap;
    return Math.max(dayStartMin, Math.min(dayEndMin, snapped));
}

/**
 * Label suffix describing a planned dive's deco obligation, or '' if none.
 * @param {Object} plannedDive - a planTrip result dive (all time fields in minutes):
 *   { startDateTime, endDateTime, bottomTime, profile }
 * @returns {string} e.g. ' · stop 9m · TTS 30min', or '' for a no-deco dive
 */
export function decoLabelSuffix(plannedDive) {
    const stops = (plannedDive && plannedDive.profile && plannedDive.profile.decoStops) || [];
    if (stops.length === 0) return '';
    const deepest = Math.max(...stops.map(s => s.depth));
    const tts = Math.round((plannedDive.endDateTime - plannedDive.startDateTime) - plannedDive.bottomTime);
    return ` · stop ${deepest}m · TTS ${tts}min`;
}

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
        this.selectedDiveId = null;
        this.container.classList.add('trip-calendar');
        // Delegated click handling on the PERSISTENT container so handlers survive
        // the innerHTML rebuild on every render (fixes selection being swallowed when
        // an edit-commit rerenders the calendar mid-click).
        this.container.addEventListener('click', (e) => this._onClick(e));
        this._justDragged = false;
        this._drag = null;
        this.container.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    }

    _onClick(e) {
        if (this._justDragged) { this._justDragged = false; return; }
        const block = e.target.closest('.tc-block');
        if (block && this.container.contains(block)) {
            this.dispatchEvent(new CustomEvent('selectDive', { detail: { diveId: block.dataset.diveId } }));
            return;
        }
        const col = e.target.closest('.tc-day');
        if (col && this.container.contains(col) && !e.target.closest('.tc-day-header')) {
            const { dayStartMin, dayEndMin } = this.window;
            const span = dayEndMin - dayStartMin;
            const dayIndex = Number(col.dataset.dayIndex);
            const rect = col.getBoundingClientRect();
            const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            const minutesOfDay = Math.round((dayStartMin + frac * span) / SNAP_MIN) * SNAP_MIN;
            this.dispatchEvent(new CustomEvent('createAt', { detail: { dayIndex, minutesOfDay } }));
        }
    }

    _onPointerDown(e) {
        if (e.button !== 0) return;
        const block = e.target.closest('.tc-block');
        if (!block || !this.container.contains(block)) return;
        this._justDragged = false;
        this._drag = {
            diveId: block.dataset.diveId, block,
            startX: e.clientX, startY: e.clientY,
            moved: false, targetDayIndex: null, targetMinutes: null
        };
        this._moveHandler = (ev) => this._onPointerMove(ev);
        this._upHandler = (ev) => this._onPointerUp(ev);
        this._cancelHandler = () => this._onPointerCancel();
        document.addEventListener('pointermove', this._moveHandler);
        document.addEventListener('pointerup', this._upHandler);
        document.addEventListener('pointercancel', this._cancelHandler);
    }

    _onPointerMove(e) {
        const d = this._drag;
        if (!d) return;
        if (!d.moved) {
            if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
            d.moved = true;
            d.block.classList.add('tc-dragging');
            d.block.style.pointerEvents = 'none'; // so elementFromPoint sees the column behind
        }
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const col = el ? el.closest('.tc-day') : null;
        if (!col || !this.container.contains(col)) return; // off a column — keep last valid target
        const { dayStartMin, dayEndMin } = this.window;
        const span = dayEndMin - dayStartMin;
        const rect = col.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const minutesOfDay = snapClamp(dayStartMin + frac * span, dayStartMin, dayEndMin, SNAP_DRAG_MIN);
        d.targetDayIndex = Number(col.dataset.dayIndex);
        d.targetMinutes = minutesOfDay;
        if (d.block.parentElement !== col) col.appendChild(d.block);
        d.block.style.top = ((minutesOfDay - dayStartMin) / span * 100) + '%';
    }

    _onPointerUp() {
        const d = this._drag;
        document.removeEventListener('pointermove', this._moveHandler);
        document.removeEventListener('pointerup', this._upHandler);
        document.removeEventListener('pointercancel', this._cancelHandler);
        this._drag = null;
        if (!d) return;
        if (d.block) { d.block.classList.remove('tc-dragging'); d.block.style.pointerEvents = ''; }
        if (d.moved && Number.isFinite(d.targetDayIndex) && Number.isFinite(d.targetMinutes)) {
            this._justDragged = true; // swallow the trailing click
            const startDateTime = this.toStartDateTime(d.targetDayIndex, d.targetMinutes);
            this.dispatchEvent(new CustomEvent('reschedule', { detail: { diveId: d.diveId, startDateTime } }));
        }
    }

    _onPointerCancel() {
        const d = this._drag;
        document.removeEventListener('pointermove', this._moveHandler);
        document.removeEventListener('pointerup', this._upHandler);
        document.removeEventListener('pointercancel', this._cancelHandler);
        this._drag = null;
        if (d && d.block) { d.block.classList.remove('tc-dragging'); d.block.style.pointerEvents = ''; }
    }

    configure({ startDate, dayCount }) {
        if (startDate !== undefined) this.startDate = startDate;
        if (dayCount !== undefined) this.window = { ...this.window, dayCount };
    }

    /** Render from a planTrip result. */
    render(planResult, selectedDiveId = null) {
        this.selectedDiveId = selectedDiveId;
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

        const colEls = [];
        for (let c = 0; c < layout.dayCount; c++) {
            const col = document.createElement('div');
            col.className = 'tc-day';
            col.dataset.dayIndex = String(c);

            const header = document.createElement('div');
            header.className = 'tc-day-header';
            header.textContent = formatDayHeader(this.startDate, c);
            col.appendChild(header);

            for (let H = startHour; H <= endHour; H++) {
                const line = document.createElement('div');
                line.className = 'tc-hour-line';
                line.style.top = ((H * 60 - dayStartMin) / span * 100) + '%';
                col.appendChild(line);
            }

            this.container.appendChild(col);
            colEls.push(col);
        }

        layout.blocks.forEach(b => {
            if (b.dayIndex < 0 || b.dayIndex >= colEls.length) return;
            const d = byId.get(b.diveId);
            const block = document.createElement('div');
            block.className = 'tc-block'
                + (b.conflict ? ' tc-conflict' : '')
                + (d && d.invalid ? ' tc-invalid' : '')
                + (b.diveId === selectedDiveId ? ' tc-selected' : '');
            block.dataset.diveId = b.diveId;
            block.style.top = b.topPct + '%';
            block.style.height = Math.max(b.heightPct, 2) + '%';
            const name = (d && d.name) ? d.name : b.diveId.toUpperCase();
            const depth = d ? d.maxDepth : '?';
            if (d && d.invalid) {
                block.textContent = `${name} · ${depth}m · ⚠ no-deco N/A`;
                block.title = 'No-deco not possible here — too pre-saturated';
            } else {
                const runtime = d ? Math.round(d.endDateTime - d.startDateTime) : '?';
                block.textContent = `${name} · ${depth}m · ${runtime}min` + (d ? decoLabelSuffix(d) : '');
                block.title = b.conflict ? 'Overlaps previous dive\'s deco' : '';
            }
            colEls[b.dayIndex].appendChild(block);
        });

        this._layout = layout;
    }

    /** Convert a (dayIndex, minutesOfDay) from a createAt event into an absolute epoch-minute start. */
    toStartDateTime(dayIndex, minutesOfDay) {
        return dayIndex * MIN_PER_DAY + minutesOfDay;
    }
}
