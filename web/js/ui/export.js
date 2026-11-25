// =====================================================================
//  export.js - collects everything and downloads one organised ZIP
// =====================================================================
// Our idea from the first SRS: "a button that downloads all the
// assignments and all the lectures into an organised zip file".
// The folder layout is in core/archive.js (tested); this file only reads
// the data through the store and saves the file.

import { download } from './dom.js';
import { buildArchive } from '../core/archive.js';
import { buildAttendanceSheet } from '../core/sheet.js';
import { makeZip, writeXlsx } from '../core/xlsx.js';

/** Waits this long for a live list before giving up on it. */
const ONCE_MS = 8000;

/**
 * Collects all lectures and assignments and downloads SmartClass-<date>.zip.
 * @param {object} store - data layer (lecturer)
 * @param {object[]} sessions - all lectures
 * @param {object[]} roster - the class list
 */
export async function exportEverything(store, sessions, roster)
{
    const attendance = await store.loadAttendance(sessions.map((s) => s.id));
    const lectures = [];
    for (const s of sessions)
    {
        const [comments, quizzes, transcript, photo] = await Promise.all([
            once((cb) => store.watchComments(s.id, cb)),
            once((cb) => store.watchQuizzes(s.id, cb)),
            once((cb) => store.watchTranscript(s.id, cb)),
            once((cb) => store.watchPhoto(s.id, cb))
        ]);
        for (const q of quizzes || [])
        {
            q.answers = (await once((cb) => store.watchQuizAnswers(s.id, q.id, cb))) || [];
            q.key = await store.loadQuizKey(s.id, q.id);
        }
        lectures.push({
            session: s, attendance: attendance[s.id] || {}, comments: comments || [],
            quizzes: quizzes || [], transcript: transcript || [], photo: photo || null
        });
    }
    const assignments = [];
    for (const a of (await once((cb) => store.watchAssignments(cb))) || [])
    {
        assignments.push({ assignment: a, submissions: (await once((cb) => store.watchSubmissions(a.id, cb))) || [] });
    }
    const date = new Date().toISOString().slice(0, 10);
    const files = buildArchive({ date: date, roster: roster, lectures: lectures, assignments: assignments });
    const sheet = buildAttendanceSheet(roster, sessions, attendance);
    files.push({ path: 'SmartClass-' + date + '/attendance.xlsx', data: writeXlsx('נוכחות', [sheet.header].concat(sheet.rows)) });
    download(makeZip(files), 'SmartClass-' + date + '.zip', 'application/zip');
}

/**
 * Reads a live list once: subscribes, takes the first answer, unsubscribes.
 * @param {function(function(*):void):function():void} watch - store.watchX(..., cb)
 * @returns {Promise<*>} the first value (null after ONCE_MS)
 */
function once(watch)
{
    return new Promise((resolve) =>
    {
        let stop = null;
        let done = false;
        const finish = (v) =>
        {
            if (done)
            {
                return;
            }
            done = true;
            resolve(v);
            if (stop)
            {
                setTimeout(stop, 0);
            }
        };
        stop = watch(finish);
        if (done)
        {
            setTimeout(stop, 0);
        }
        setTimeout(() => finish(null), ONCE_MS);
    });
}
