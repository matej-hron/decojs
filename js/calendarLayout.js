/**
 * Pure calendar layout: turn a planTrip result into positioned blocks across
 * day columns. No DOM. Heights/positions are percentages of the visible day
 * window so the renderer can map them to pixels freely.
 */

const MIN_PER_DAY = 24 * 60;

/**
 * @param {Object} planResult - planTrip() output: { dives:[{id,startDateTime,endDateTime}], conflicts:[{diveId}] }
 * @param {Object} windowConfig - { dayStartMin, dayEndMin } minutes-of-day for the visible window
 * @returns {{ dayCount:number, baseDay:number, blocks:Array }}
 *   blocks: { diveId, dayIndex, topPct, heightPct, conflict, startMinOfDay, endMinOfDay }
 */
export function computeCalendarLayout(planResult, windowConfig) {
    const { dayStartMin, dayEndMin } = windowConfig;
    const span = dayEndMin - dayStartMin;
    const dives = planResult.dives || [];
    const conflictIds = new Set((planResult.conflicts || []).map(c => c.diveId));

    if (dives.length === 0) {
        return { dayCount: 1, baseDay: 0, blocks: [] };
    }

    const days = dives.map(d => Math.floor(d.startDateTime / MIN_PER_DAY));
    const baseDay = Math.min(...days);
    const maxDay = Math.max(...days);
    const dayCount = (maxDay - baseDay) + 1;

    const clampPct = (p) => Math.max(0, Math.min(100, p));

    const blocks = dives.map(d => {
        const dayIndex = Math.floor(d.startDateTime / MIN_PER_DAY) - baseDay;
        const startMinOfDay = d.startDateTime - (baseDay + dayIndex) * MIN_PER_DAY;
        // Clamp the end into the same day window (a dive crossing midnight is
        // clamped to the window bottom for v1 — documented limitation).
        const endMinOfDay = Math.min(d.endDateTime - (baseDay + dayIndex) * MIN_PER_DAY, dayEndMin);
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

    return { dayCount, baseDay, blocks };
}
