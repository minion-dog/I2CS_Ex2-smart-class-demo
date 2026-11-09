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
import { el, fill, toast, when, setupTabs } from './dom.js';
import { t } from './i18n.js';
import { AveragingScanner } from './scanner.js';
import { bindComments } from './comments.js';
import { bindPolls } from './polls.js';
import { decodePayload } from '../core/payload.js';
import { STATUS } from '../core/sheet.js';

// ---------------------------------------------------------------------
//  CONSTANTS & FIELDS
// ---------------------------------------------------------------------

const MAX_UPLOAD_BYTES = 500 * 1024;

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
});

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
    zoom = 1;
    $('zoom-now').textContent = '1×';
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

// Zoom for students at the back: the + / - buttons, or pinch with two fingers.
let zoom = 1;
const ZOOM_STEP = 0.5;

/**
 * Sets the camera zoom and shows it.
 * @param {number} f - wanted zoom factor
 */
function applyZoom(f)
{
    if (!scanner)
    {
        return;
    }
    zoom = Math.min(scanner.maxZoom(), Math.max(1, f));
    $('zoom-now').textContent = (Math.round(zoom * 10) / 10) + '×';
    scanner.setZoom(zoom);
}
$('zoom-in').onclick = () => applyZoom(zoom + ZOOM_STEP);
$('zoom-out').onclick = () => applyZoom(zoom - ZOOM_STEP);

const fingers = new Map();
let pinchStart = null;
$('scanner').addEventListener('pointerdown', (ev) =>
{
    fingers.set(ev.pointerId, ev);
    if (fingers.size === 2)
    {
        const [p1, p2] = [...fingers.values()];
        pinchStart = { d: Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY), zoom: zoom };
    }
});
$('scanner').addEventListener('pointermove', (ev) =>
{
    if (!fingers.has(ev.pointerId))
    {
        return;
    }
    fingers.set(ev.pointerId, ev);
    if (fingers.size === 2 && pinchStart && pinchStart.d > 0)
    {
        const [p1, p2] = [...fingers.values()];
        const f = pinchStart.zoom * Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY) / pinchStart.d;
        if (Math.abs(f - zoom) >= 0.1)
        {
            applyZoom(f);
        }
    }
});
for (const name of ['pointerup', 'pointercancel', 'pointerleave'])
{
    $('scanner').addEventListener(name, (ev) =>
    {
        fingers.delete(ev.pointerId);
        pinchStart = null;
    });
}

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
 * Handles a decoded QR text: the flicker QR can only be filmed live in the room,
 * so a scan = IN CLASS (decision: no location needed).
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
    if (store.kind === 'demo' && !sessions.some((x) => x.id === p.sessionId))
    {
        // demo mode keeps data in each browser: the lecture is open on another device
        setResult(t('scanReadDemo'), 'warn');
        showWhere(STATUS.PRESENT);
        return;
    }
    await mark(STATUS.PRESENT, () => store.markMe(p.sessionId, { token: p.token }));
}

// Students on Zoom type the 4 digits shown under the QR (Zoom's video loses the flicker).
$('zoom-form').addEventListener('submit', async (ev) =>
{
    ev.preventDefault();
    const digits = $('zoom-digits').value.trim();
    if (!/^[0-9]{4}$/.test(digits))
    {
        setResult(t('zoomFourDigits'), 'error');
        return;
    }
    const open = sessions.find((x) => x.endedAt === null);
    if (!open)
    {
        setResult(t('noOpenLecture'), 'error');
        return;
    }
    await mark(STATUS.ZOOM, () => store.markZoom(open.id, digits));
    $('zoom-digits').value = '';
});

/**
 * Sends one attendance mark and shows the answer.
 * @param {string} status - what this mark means: STATUS.PRESENT or STATUS.ZOOM
 * @param {function():Promise<string>} send - calls the store; resolves 'present' | 'zoom' | 'pending'
 */
async function mark(status, send)
{
    try
    {
        const answer = await send();
        const waiting = answer === 'pending' || !navigator.onLine;
        setResult(t('scanOk') + (waiting ? ' · ' + t('scanPending') : ''), waiting ? 'warn' : 'ok');
        showWhere(status);
    }
    catch (e)
    {
        const known = { already: t('scanAlready'), 'bad-code': status === STATUS.ZOOM ? t('zoomBad') : t('scanBad') };
        setResult(known[e.message] || t('scanBad'), 'error');
    }
}

/**
 * Shows the big "physical / Zoom" answer under the result.
 * @param {string} status - STATUS.PRESENT or STATUS.ZOOM
 */
function showWhere(status)
{
    const present = status === STATUS.PRESENT;
    const box = $('scan-where');
    box.className = 'where ' + (present ? 'present' : 'zoom');
    fill(box,
        el('b', { text: present ? t('whereClass') : t('whereZoom') }),
        el('span', { text: present ? t('whyClass') : t('whyZoom') }));
    box.hidden = false;
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
