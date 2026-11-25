// =====================================================================
//  archive.js - "download everything" as one organised ZIP (pure logic)
// =====================================================================
// Our idea from the first SRS: one button that downloads all the lectures
// and all the assignments into an organised zip file. The page collects the
// data; this module decides the folders, the file names and the contents.
//
//   SmartClass-2026-11-25/
//     README.txt, class-list.csv, attendance.xlsx (added by the page)
//     lectures/01 2026-11-04 Intro/  attendance.csv comments.csv
//                                    polls-and-quizzes.csv (answer counts), quiz-<name>.csv (players)
//                                    transcript.txt summary.md
//                                    class-photo.jpg faces.csv
//     assignments/Ex2/  requirements.md grades.csv
//                       <email>/ link.txt review.md feedback.md files/...

import { scoreboard, answerCounts, isScored } from './quiz.js';
import { claimsOf } from './faces.js';

/** Limits of names in the zip. */
export const ARCHIVE = Object.freeze({
    NAME_MAX: 60,
    BOM: '﻿'                // Excel opens UTF-8 CSV with Hebrew correctly only with this mark
});

/**
 * A safe file or folder name (no slashes, no control characters, not too long).
 * @param {string} name - any text
 * @returns {string} safe name ('_' when empty)
 */
export function safeName(name)
{
    const s = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim()
        .replace(/^\.+/, '_').slice(0, ARCHIVE.NAME_MAX);
    return s || '_';
}

/**
 * CSV text for Excel (BOM, quotes where needed, CRLF).
 * @param {(string|number|null)[][]} rows - cells
 * @returns {string} csv
 */
export function csv(rows)
{
    const cell = (v) =>
    {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return ARCHIVE.BOM + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/**
 * Bytes of a "data:...;base64," URL.
 * @param {string} dataUrl - data URL
 * @returns {Uint8Array} bytes
 */
export function dataUrlBytes(dataUrl)
{
    const b64 = String(dataUrl).split(',')[1] || '';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
    {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

/**
 * Builds every file of the archive.
 * @param {object} d - collected data: {date, roster[], lectures[{session, attendance{}, comments[],
 *        quizzes[{title, questions, state, answers, key}], transcript[], photo}], assignments[{assignment, submissions[]}]}
 * @returns {{path:string, data:(string|Uint8Array)}[]} files (paths inside the zip)
 */
export function buildArchive(d)
{
    const root = 'SmartClass-' + d.date + '/';
    const files = [];
    const add = (path, data) => files.push({ path: root + path, data: data });
    add('README.txt', 'SmartClass export ' + d.date + '\r\n'
        + 'lectures/: one folder per lecture (attendance, comments, polls & quizzes, transcript, summary, class photo)\r\n'
        + 'assignments/: one folder per assignment (requirements, grades, each student\'s link, files, AI review, feedback)\r\n');
    add('class-list.csv', csv([['first', 'last', 'id', 'email', 'group', 'staff']].concat(
        d.roster.map((r) => [r.first, r.last, r.id, r.email, r.group, r.staff ? 'yes' : '']))));
    const sorted = d.lectures.slice().sort((a, b) => a.session.startedAt - b.session.startedAt);
    sorted.forEach((L, i) =>
    {
        const s = L.session;
        const dir = 'lectures/' + String(i + 1).padStart(2, '0') + ' ' + isoDate(s.startedAt) + ' ' + safeName(s.title) + '/';
        const att = Object.values(L.attendance || {});
        add(dir + 'attendance.csv', csv([['email', 'name', 'status', 'time', 'face in photo']].concat(
            att.map((r) => [r.email, r.name || '', r.status, isoTime(r.scannedAt), faceText(r, L.photo)]))));
        add(dir + 'comments.csv', csv([['time', 'visibility', 'from', 'text']].concat(
            (L.comments || []).map((c) => [isoTime(c.createdAt), c.visibility, c.fromLecturer ? 'lecturer' : (c.authorName || 'anonymous'), c.text]))));
        add(dir + 'polls-and-quizzes.csv', csv([['poll / quiz', 'question', 'answer', 'count', 'correct']].concat(
            (L.quizzes || []).flatMap((q) => q.questions.flatMap((x, i) => x.options.map((o, k) => [
                q.title, x.q, o, answerCounts(q.answers || [], i, x.options.length)[k], (q.key || [])[i] === k ? '✓' : ''
            ]))))));
        for (const q of L.quizzes || [])
        {
            if (isScored(q.key || []))
            {
                add(dir + 'quiz-' + safeName(q.title) + '.csv', quizCsv(q));     // players and points
            }
        }
        if ((L.transcript || []).length > 0)
        {
            add(dir + 'transcript.txt', L.transcript.slice().sort((a, b) => a.index - b.index).map((p) => p.text).join('\r\n\r\n'));
        }
        if (s.summary)
        {
            add(dir + 'summary.md', s.summary);
        }
        if (L.photo && L.photo.image)
        {
            add(dir + 'class-photo.jpg', dataUrlBytes(L.photo.image));
            const who = claimsOf(att, L.photo.v);
            add(dir + 'faces.csv', csv([['box', 'x', 'y', 'w', 'h', 'student']].concat(
                L.photo.boxes.map((b) => [b.id, b.x, b.y, b.w, b.h, who.get(b.id) || '']))));
        }
    });
    for (const A of d.assignments)
    {
        const a = A.assignment;
        const dir = 'assignments/' + safeName(a.title) + '/';
        add(dir + 'requirements.md', '# ' + a.title + '\r\n\r\n' + (a.due ? 'Due: ' + a.due + '\r\n\r\n' : '') + (a.requirements || ''));
        add(dir + 'grades.csv', csv([['email', 'submitted', 'grade', 'link']].concat(
            A.submissions.map((x) => [x.email, isoTime(x.submittedAt), x.grade === undefined || x.grade === null ? '' : x.grade, x.repoUrl || '']))));
        for (const x of A.submissions)
        {
            const sd = dir + safeName(x.email) + '/';
            if (x.repoUrl)
            {
                add(sd + 'link.txt', x.repoUrl);
            }
            if (x.review)
            {
                add(sd + 'review.md', x.review);
            }
            if (x.feedback)
            {
                add(sd + 'feedback.md', x.feedback);
            }
            for (const f of x.files || [])
            {
                add(sd + 'files/' + safeName(f.name), String(f.text || ''));
            }
        }
    }
    return files;
}

/**
 * One quiz as a table: player, score, right answers, and each answer.
 * @param {object} q - {questions, state, answers, key}
 * @returns {string} csv
 */
function quizCsv(q)
{
    const n = q.questions.length;
    const starts = (q.state && q.state.starts) || [];
    const last = Math.min(n - 1, starts.length - 1);
    const board = scoreboard(q.answers || [], q.key || [], starts, q.questions.map((x) => x.seconds * 1000), last);
    const head = ['rank', 'name', 'score', 'right'].concat(q.questions.map((x, i) => 'Q' + (i + 1)));
    const rows = board.map((r) => [r.rank, r.name, r.score, r.right].concat(q.questions.map((x, i) =>
    {
        const a = (q.answers || []).find((y) => y.uid === r.uid && y.index === i);
        return a ? x.options[a.option] + (a.option === (q.key || [])[i] ? ' ✓' : '') : '';
    })));
    return csv([head].concat(rows));
}

/**
 * The face column of a student.
 * @param {object} r - attendance record
 * @param {object|null} photo - the photo
 * @returns {string} '#id', 'not in photo' or ''
 */
function faceText(r, photo)
{
    if (!photo || r.photoV !== photo.v)
    {
        return '';
    }
    return r.face === -2 ? 'not in photo' : r.face > 0 ? '#' + r.face : '';
}

/**
 * yyyy-mm-dd of a time.
 * @param {number} ms - time
 * @returns {string} date
 */
function isoDate(ms)
{
    const d = new Date(ms || 0);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * yyyy-mm-dd hh:mm of a time ('' when missing).
 * @param {number} ms - time
 * @returns {string} date and time
 */
function isoTime(ms)
{
    if (!ms)
    {
        return '';
    }
    const d = new Date(ms);
    return isoDate(ms) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
