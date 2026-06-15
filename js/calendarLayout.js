/**
 * Pure calendar layout: turn a planTrip result into positioned blocks across
 * day columns. No DOM. Heights/positions are percentages of the visible day
 * window so the renderer can map them to pixels freely.
 */

const MIN_PER_DAY = 24 * 60;

/**
 * @param {Object} planResult - planTrip() output: { dives:[{id,startDateTime,endDateTime}], conflicts:[{diveId}] }
 *   startDateTime is trip-relative minutes (day 0 = trip start midnight).
 * @param {Object} windowConfig - { dayStartMin, dayEndMin, dayCount }
 *   dayStartMin/dayEndMin: minutes-of-day for the visible window.
 *   dayCount: number of columns to display (comes from trip config, not derived from dives).
 * @returns {{ dayCount:number, baseDay:number, blocks:Array }}
 *   baseDay is always 0 (days are trip-relative).
 *   blocks: { diveId, dayIndex, topPct, heightPct, conflict, startMinOfDay, endMinOfDay }
 */
export function computeCalendarLayout(planResult, windowConfig) {
    const { dayStartMin, dayEndMin, dayCount } = windowConfig;
    const span = dayEndMin - dayStartMin;
    const dives = planResult.dives || [];
    const conflictIds = new Set((planResult.conflicts || []).map(c => c.diveId));
    const clampPct = (p) => Math.max(0, Math.min(100, p));

    const blocks = dives.map(d => {
        const dayIndex = Math.floor(d.startDateTime / MIN_PER_DAY);
        const startMinOfDay = d.startDateTime - dayIndex * MIN_PER_DAY;
        const endMinOfDay = Math.min(d.endDateTime - dayIndex * MIN_PER_DAY, dayEndMin);
        // Clip the visible start to the window top so an early dive doesn't inflate height.
        const visibleStart = Math.max(startMinOfDay, dayStartMin);
        const topPct = clampPct((visibleStart - dayStartMin) / span * 100);
        const heightPct = clampPct((endMinOfDay - visibleStart) / span * 100);
        return {
            diveId: d.id,
            dayIndex,
            topPct,
            heightPct,
            conflict: conflictIds.has(d.id),
            startMinOfDay,
            endMinOfDay
        };
    });

    return { dayCount, baseDay: 0, blocks };
}
