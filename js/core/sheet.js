// =====================================================================
//  sheet.js - the attendance spreadsheet (the sheet's main feature)
// =====================================================================
// One row per student, one column per lecture, a total at the end.
// V = in class, Z = Zoom, M = marked by the lecturer, empty = absent.

/** Attendance statuses as stored in Firestore. */
export const STATUS = Object.freeze({ PRESENT: 'present', ZOOM: 'zoom', MANUAL: 'manual' });

const MARK = Object.freeze({ present: 'V', zoom: 'Z', manual: 'M' });

/**
 * Builds the table.
 * @param {object[]} roster - entries from rosterFromRows (staff rows are left out)
 * @param {{id:string,title:string,startedAt:number}[]} sessions - the lectures
 * @param {Object<string, Object<string, {status:string}>>} attendance - by session id, then email
 * @returns {{header:string[], rows:(string|number)[][]}} the table
 */
export function buildAttendanceSheet(roster, sessions, attendance)
{
    const ordered = sessions.slice().sort(byStart);
    const header = ['שם פרטי', 'שם משפחה', 'ת.ז.', 'דוא"ל'];
    for (const s of ordered)
    {
        header.push(s.title);
    }
    header.push('סה"כ');
    const rows = [];
    for (const st of roster)
    {
        if (st.staff)
        {
            continue;
        }
        const row = [st.first, st.last, st.id, st.email];
        let total = 0;
        for (const s of ordered)
        {
            const bySession = attendance[s.id] || {};
            const rec = bySession[st.email];
            if (rec && MARK[rec.status])
            {
                row.push(MARK[rec.status]);
                total++;
            }
            else
            {
                row.push('');
            }
        }
        row.push(total);
        rows.push(row);
    }
    return { header: header, rows: rows };
}

/**
 * Orders sessions by start time.
 * @param {{startedAt:number}} a - first
 * @param {{startedAt:number}} b - second
 * @returns {number} negative when a is first
 */
function byStart(a, b)
{
    return a.startedAt - b.startedAt;
}
