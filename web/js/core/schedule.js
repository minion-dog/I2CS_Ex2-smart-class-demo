// =====================================================================
//  schedule.js - lectures start by themselves at the set times
// =====================================================================
// From our first SRS (v1): "a session starts automatically at the lecture
// times, and a notification is sent when the lecture starts". The lecturer
// types the weekly times once (no Moodle connection). The lecturer's page on
// the classroom computer opens the lecture when its time comes; students'
// phones show "the lecture started".

/** Timetable settings. */
export const SCHEDULE = Object.freeze({
    EARLY_MIN: 5,              // open the lecture up to 5 minutes before it starts
    MAX_SLOTS: 20,
    TIME: /^([01]\d|2[0-3]):([0-5]\d)$/
});

/**
 * Minutes since midnight of "HH:MM".
 * @param {string} hhmm - time
 * @returns {number} minutes, or NaN when the text is not a time
 */
export function minutes(hhmm)
{
    const m = SCHEDULE.TIME.exec(String(hhmm || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/**
 * Keeps only correct slots: a weekday 0-6 (Sunday = 0), a start before the end.
 * @param {{day:number, start:string, end:string, title:string}[]} slots - typed by the lecturer
 * @returns {{day:number, start:string, end:string, title:string}[]} clean slots
 */
export function cleanSlots(slots)
{
    return (slots || [])
        .map((s) => ({ day: Number(s.day), start: String(s.start || '').trim(), end: String(s.end || '').trim(), title: String(s.title || '').trim().slice(0, 120) }))
        .filter((s) => Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 && minutes(s.start) < minutes(s.end))
        .slice(0, SCHEDULE.MAX_SLOTS);
}

/**
 * The slot that should be running now, if any.
 * @param {object[]} slots - clean slots
 * @param {Date} now - local time
 * @returns {object|null} the slot
 */
export function slotNow(slots, now)
{
    const day = now.getDay();
    const m = now.getHours() * 60 + now.getMinutes();
    return slots.find((s) => s.day === day && m >= minutes(s.start) - SCHEDULE.EARLY_MIN && m < minutes(s.end)) || null;
}

/**
 * Decides whether to open a lecture by itself now.
 * @param {object[]} slots - clean slots
 * @param {{startedAt:number, endedAt:number|null}[]} sessions - existing lectures
 * @param {Date} now - local time
 * @returns {object|null} the slot to open, or null (nothing due, a lecture is open, or this slot already ran today)
 */
export function dueSlot(slots, sessions, now)
{
    const slot = slotNow(slots, now);
    if (slot === null || sessions.some((s) => s.endedAt === null))
    {
        return null;
    }
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const slotStart = from.getTime() + (minutes(slot.start) - SCHEDULE.EARLY_MIN) * 60000;
    const ranToday = sessions.some((s) => s.startedAt >= slotStart);
    return ranToday ? null : slot;
}

/**
 * Tells which lectures were opened since the last look (for "the lecture started").
 * @param {Set<string>} known - open lecture ids already seen
 * @param {{id:string, endedAt:number|null}[]} sessions - lectures now
 * @returns {string[]} ids of newly opened lectures
 */
export function newlyOpened(known, sessions)
{
    return sessions.filter((s) => s.endedAt === null && !known.has(s.id)).map((s) => s.id);
}
