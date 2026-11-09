// =====================================================================
//  student.js - the student's website (phone first)
// =====================================================================
// Scan: camera -> averaged noisy QR -> location -> in class or Zoom ->
// attendance (works offline: saved on the phone, sent later).
// Lecture: comments (public/private, anonymous or not), polls, summary
// and transcript, also for past lectures.
// Assignments: submit a GitHub link and/or text files, see the review,
// the grade and the feedback.

import { startPage } from './page.js';
import { el, fill, toast, when, setupTabs, locate } from './dom.js';
import { t } from './i18n.js';
import { AveragingScanner } from './scanner.js';
import { bindComments } from './comments.js';
import { bindPolls } from './polls.js';
import { decodePayload } from '../core/payload.js';
import { flatMeters, cosLatOf, classifyDistance } from '../core/geo.js';
import { STATUS } from '../core/sheet.js';

// ---------------------------------------------------------------------
//  CONSTANTS & FIELDS
// ---------------------------------------------------------------------

const LOCATE_TIMEOUT_MS = 10000;
const PENDING_KEY = 'smartclass-pending-scans';
const MAX_UPLOAD_BYTES = 500 * 1024;
const FAR_AWAY = Object.freeze({ lat: 0, lng: 0 });   // no location = treated as Zoom

const $ = (id) => document.getElementById(id);

const { store, user } = await startPage('student');
let sessions = [];
let scanner = null;
let lectureWatchers = [];
const myRecords = new Map();     // session id -> unsubscribe

// ---------------------------------------------------------------------
//  ENTRY
// ---------------------------------------------------------------------

setupTabs($('tabs'), (name) =>
{
    if (name !== 'scan' && scanner)
    {
        scanner.stop();
        $('scanner').hidden = true;
    }
});

store.watchSessions((list) =>
{
    sessions = list;
    fillSessionPicker();
    watchMyAttendance();
    flushPendingScans();
});
window.addEventListener('online', flushPendingScans);

// ---------------------------------------------------------------------
//  SCAN
// ---------------------------------------------------------------------

$('scan-start').onclick = async () =>
{
    setResult(t('scanning'), '');
    $('scanner').hidden = false;
    scanner = new AveragingScanner($('video'), onScanned, $('sees'));
    $('scan-stop').hidden = false;
    $('scan-where').hidden = true;
    try
    {
        await scanner.start();
    }
    catch (e)
    {
        $('scanner').hidden = true;
        setResult(t('cameraDenied'), 'error');
    }
};

$('scan-stop').onclick = () =>
{
    if (scanner)
    {
        scanner.stop();
    }
    $('scanner').hidden = true;
    $('scan-stop').hidden = true;
    setResult('', '');
};

/**
 * Handles a decoded QR text.
 * @param {string} text - QR content
 */
async function onScanned(text)
{
    $('scanner').hidden = true;
    $('scan-stop').hidden = true;
    const p = decodePayload(text);
    if (p === null)
    {
        setResult(t('scanBad'), 'error');
        return;
    }
    if (navigator.vibrate)
    {
        navigator.vibrate(80);
    }
    setResult(t('locating'), '');
    const pos = (await locate(LOCATE_TIMEOUT_MS)) || FAR_AWAY;
    const scan = { sid: p.sessionId, token: p.token, lat: pos.lat, lng: pos.lng, at: Date.now() };
    const done = await sendScan(scan);
    if (!done && store.kind === 'demo')
    {
        // demo mode keeps data in each browser: the lecture is on another device, so the
        // code itself carries the lecturer's place and the phone shows the decision
        setResult(t('scanReadDemo'), 'warn');
        if (p.where)
        {
            showWhere(flatMeters(p.where.lat, p.where.lng, cosLatOf(p.where.lat), pos.lat, pos.lng), pos === FAR_AWAY);
        }
        return;
    }
    if (!done)
    {
        queueScan(scan);
        setResult(t('scanPending'), 'warn');
    }
}

/**
 * Classifies and sends one scan. Needs the session (its location); when the
 * phone has never seen the session (offline), returns false so it is queued.
 * @param {{sid:string, token:string, lat:number, lng:number}} scan - the scan
 * @returns {Promise<boolean>} true when handed to the store
 */
async function sendScan(scan)
{
    const s = sessions.find((x) => x.id === scan.sid);
    if (!s)
    {
        return false;
    }
    const meters = flatMeters(s.lat, s.lng, s.cosLat, scan.lat, scan.lng);
    const status = classifyDistance(meters) === 'inPerson' ? STATUS.PRESENT : STATUS.ZOOM;
    try
    {
        // the local server answers with its own decision ('present' / 'zoom'), or 'pending' when offline
        const answer = await store.markMe(scan.sid, { token: scan.token, lat: scan.lat, lng: scan.lng, status: status });
        const final = typeof answer === 'string' ? answer : status;
        const waiting = final === 'pending' || !navigator.onLine;
        const where = (final === 'pending' ? status : final) === STATUS.PRESENT ? t('inClass') : t('onZoom');
        setResult(t('scanOk') + ' · ' + where + (waiting ? ' · ' + t('scanPending') : ''), waiting ? 'warn' : 'ok');
        showWhere(meters, scan.lat === FAR_AWAY.lat && scan.lng === FAR_AWAY.lng, final === 'pending' ? status : final);
    }
    catch (e)
    {
        setResult(e.message === 'already' ? t('scanAlready') : t('scanBad'), 'error');
    }
    return true;
}

/**
 * Shows the big "physical / Zoom" badge under the result, with the distance.
 * @param {number} meters - distance from the lecturer
 * @param {boolean} noLocation - true when the phone gave no location (counted as Zoom)
 * @param {string} [status] - the store's decision; otherwise decided here from the distance
 */
function showWhere(meters, noLocation, status)
{
    const present = status ? status === STATUS.PRESENT : classifyDistance(meters) === 'inPerson';
    const box = $('scan-where');
    box.className = 'where ' + (present ? 'present' : 'zoom');
    const distance = noLocation ? t('noLocation') : formatDistance(meters);
    fill(box,
        el('b', { text: present ? t('whereClass') : t('whereZoom') }),
        el('span', { text: distance + ' · ' + t('radiusRule') }));
    box.hidden = false;
}

/**
 * Writes a distance for people: "120 m" or "37.4 km".
 * @param {number} meters - distance
 * @returns {string} text
 */
function formatDistance(meters)
{
    const d = meters < 1000 ? Math.round(meters) + ' ' + t('meters') : (meters / 1000).toFixed(1) + ' ' + t('km');
    return t('fromLecturer').replace('{d}', d);
}

/**
 * Remembers a scan whose lecture is not known yet (offline, first time).
 * @param {object} scan - the scan
 */
function queueScan(scan)
{
    const list = readPending();
    list.push(scan);
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

/** Sends queued scans whose lecture is now known. */
async function flushPendingScans()
{
    const list = readPending();
    if (list.length === 0)
    {
        return;
    }
    const left = [];
    for (const scan of list)
    {
        const sent = await sendScan(scan);
        if (!sent)
        {
            left.push(scan);
        }
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(left));
}

/**
 * Reads the queue of unsent scans.
 * @returns {object[]} scans
 */
function readPending()
{
    try
    {
        return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    }
    catch (e)
    {
        return [];
    }
}

/** Shows my attendance in the recent lectures (with "waiting to send"). */
function watchMyAttendance()
{
    const recent = sessions.slice(0, 5);
    const keep = new Set(recent.map((s) => s.id));
    for (const [id, stop] of myRecords)
    {
        if (!keep.has(id))
        {
            stop();
            myRecords.delete(id);
        }
    }
    const rows = new Map();
    const draw = () =>
    {
        const items = [];
        for (const s of recent)
        {
            const r = rows.get(s.id);
            let badge = el('span', { class: 'muted', text: s.endedAt === null ? '●' : t('absent') });
            if (r)
            {
                const label = { present: t('inClass'), zoom: t('onZoom'), manual: t('manual') }[r.status];
                badge = el('span', { class: 'badge ' + (r.pending ? 'pending' : r.status), text: r.pending ? '⏳ ' + label : label });
            }
            items.push(el('li', {}, [el('span', { class: 'grow', text: s.title }), el('span', { class: 'muted', text: when(s.startedAt) }), badge]));
        }
        fill($('my-attendance'), ...items);
    };
    for (const s of recent)
    {
        if (!myRecords.has(s.id))
        {
            myRecords.set(s.id, store.watchAttendance(s.id, (list) =>
            {
                rows.set(s.id, list[0]);
                draw();
            }));
        }
    }
    draw();
}

/**
 * Shows the scan result.
 * @param {string} text - message
 * @param {string} kind - '', 'ok', 'warn', 'error'
 */
function setResult(text, kind)
{
    const box = $('scan-result');
    box.textContent = text;
    box.className = 'scan-result ' + kind;
}

// ---------------------------------------------------------------------
//  LECTURE (comments, polls, summary)
// ---------------------------------------------------------------------

/** Fills the lecture picker (open lecture first). */
function fillSessionPicker()
{
    const pick = $('session-pick');
    const chosen = pick.value;
    fill(pick, el('option', { value: '', text: '—' }), ...sessions.map((s) =>
        el('option', { value: s.id, text: (s.endedAt === null ? '● ' : '') + s.title + ' · ' + when(s.startedAt) })));
    if (chosen)
    {
        pick.value = chosen;
    }
    else if (sessions.length > 0 && sessions[0].endedAt === null)
    {
        pick.value = sessions[0].id;
        openLecture(sessions[0].id);
    }
    const s = sessions.find((x) => x.id === pick.value);
    if (s)
    {
        showSummary(s.summary);
    }
}

$('session-pick').onchange = () => openLecture($('session-pick').value);

/**
 * Shows one lecture's comments, polls, summary and transcript.
 * @param {string} sid - session id
 */
function openLecture(sid)
{
    for (const stop of lectureWatchers)
    {
        stop();
    }
    lectureWatchers = [];
    $('lecture-body').hidden = sid === '';
    if (sid === '')
    {
        return;
    }
    lectureWatchers.push(bindComments(store, user, sid, {
        feed: $('comment-feed'), input: $('comment-text'), send: $('comment-send'),
        visibility: $('comment-visibility'), anonymous: $('comment-anon')
    }));
    lectureWatchers.push(bindPolls(store, user, sid, $('poll-list')));
    lectureWatchers.push(store.watchTranscript(sid, (pieces) =>
    {
        $('transcript-box').textContent = pieces.map((p) => p.text).join('\n\n');
    }));
    const s = sessions.find((x) => x.id === sid);
    showSummary(s ? s.summary : null);
}

/**
 * Shows the summary of the chosen lecture.
 * @param {string|null} summary - text
 */
function showSummary(summary)
{
    fill($('summary-box'), el('p', { class: summary ? '' : 'muted', text: summary || t('noSummary') }));
}

// ---------------------------------------------------------------------
//  ASSIGNMENTS
// ---------------------------------------------------------------------

const subWatchers = new Map();

store.watchAssignments((list) =>
{
    for (const stop of subWatchers.values())
    {
        stop();
    }
    subWatchers.clear();
    fill($('assignment-list'), ...list.map(assignmentCard));
});

/**
 * Builds the card of one assignment: requirements, submit form, my result.
 * @param {object} a - assignment
 * @returns {Element} card
 */
function assignmentCard(a)
{
    const repo = el('input', { type: 'url', placeholder: 'https://github.com/…' });
    const files = el('input', { type: 'file', multiple: true });
    const mine = el('div');
    const card = el('div', { class: 'card', style: 'margin-bottom:16px' }, [
        el('h2', { text: a.title }),
        a.due ? el('p', { class: 'muted', text: t('due') + ': ' + a.due }) : null,
        a.requirements ? el('details', {}, [el('summary', { text: t('requirements') }), el('p', { style: 'white-space:pre-wrap', text: a.requirements })]) : null,
        el('label', { text: t('repoUrl') }), repo,
        el('label', { text: t('files') }), files,
        el('p', {}, [el('button', { text: t('submit'), onclick: () => submit(a, repo, files) })]),
        mine
    ]);
    subWatchers.set(a.id, store.watchSubmissions(a.id, (list) =>
    {
        const s = list[0];
        if (!s)
        {
            fill(mine);
            return;
        }
        if (!repo.value && s.repoUrl)
        {
            repo.value = s.repoUrl;
        }
        fill(mine,
            el('p', {}, [el('span', { class: 'badge ' + (s.pending ? 'pending' : 'present'), text: t('submitted') }), ' ' + when(s.submittedAt)]),
            s.grade !== undefined && s.grade !== null ? el('p', {}, [el('b', { text: t('grade') + ': ' + s.grade })]) : null,
            s.feedback ? el('p', { text: t('feedback') + ': ' + s.feedback }) : null,
            s.review ? el('details', {}, [el('summary', { text: t('aiReview') }), el('p', { style: 'white-space:pre-wrap', text: s.review })]) : null);
    }));
    return card;
}

/**
 * Reads the form and submits.
 * @param {object} a - assignment
 * @param {HTMLInputElement} repo - URL field
 * @param {HTMLInputElement} filesInput - file picker
 */
async function submit(a, repo, filesInput)
{
    const files = [];
    let total = 0;
    for (const f of filesInput.files)
    {
        total += f.size;
        if (total > MAX_UPLOAD_BYTES)
        {
            toast(t('files'), 'warn');
            return;
        }
        files.push({ name: f.name, text: await f.text() });
    }
    const url = repo.value.trim();
    if (url === '' && files.length === 0)
    {
        return;
    }
    if (url !== '' && !/^https?:\/\/.+/i.test(url))
    {
        toast(t('repoUrl') + ': https://…', 'warn');
        return;
    }
    try
    {
        await store.submit(a.id, { repoUrl: url, files: files });
        toast('✓ ' + t('submitted'));
    }
    catch (e)
    {
        toast(t('error') + ': ' + e.message, 'error');
    }
}
