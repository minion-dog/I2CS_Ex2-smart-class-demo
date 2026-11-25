// =====================================================================
//  student.js - the student's website (phone first)
// =====================================================================
// Scan: camera -> flicker QR change map -> in class (physical only, no location) ->
// attendance -> last step: tap your own face in the class photo and confirm.
// Lecture: comments (public/private, anonymous or not), polls, summary
// and transcript, also for past lectures.
// Assignments: submit a GitHub link and/or text files, see the review,
// the grade and the feedback.

import { startPage } from './page.js';
import { el, fill, toast, when, setupTabs } from './dom.js';
import { t } from './i18n.js';
import { AveragingScanner } from './scanner.js';
import { bindComments } from './comments.js';
import { bindPolls, notify } from './polls.js';
import { decodePayload } from '../core/payload.js';
import { FACES, myStep, requestedBox } from '../core/faces.js';
import { FaceView } from './faceview.js';
import { setupQuizPlay } from './quiz-play.js';
import { newlyOpened } from '../core/schedule.js';

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
const face = { sid: null, photo: null, record: null, taken: new Set(), stops: [], stopTaken: null, chosen: 0, told: false, request: null, placed: null };
const seenOpen = new Set();
let firstSessions = true;
const followQuiz = setupQuizPlay(store, user, $('quiz-play'));
const pickView = new FaceView($('face-pick-view'), { mode: 'pick', onPick: askIsThisYou, onPlace: placeMyBox });

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
    for (const id of newlyOpened(seenOpen, list))
    {
        seenOpen.add(id);
        if (!firstSessions)
        {
            notify(t('lectureStarted') + ' ' + (list.find((x) => x.id === id).title || ''));   // from our first SRS
        }
    }
    firstSessions = false;
    const open = list.find((x) => x.endedAt === null);
    followQuiz(open ? open.id : null);       // a quiz of the open lecture pops up by itself
    if (open && face.sid === null)
    {
        followFaces(open.id);           // already scanned earlier? the face step comes back
    }
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
        showWhere();
        return;
    }
    await mark(() => store.markMe(p.sessionId, { token: p.token }));
    followFaces(p.sessionId);
}

/**
 * Sends the scan and shows the answer.
 * @param {function():Promise<string>} send - calls the store; resolves 'present' | 'pending'
 */
async function mark(send)
{
    try
    {
        const answer = await send();
        const waiting = answer === 'pending' || !navigator.onLine;
        setResult(t('scanOk') + (waiting ? ' · ' + t('scanPending') : ''), waiting ? 'warn' : 'ok');
        showWhere();
    }
    catch (e)
    {
        if (e.message === 'already')
        {
            setResult(t('scanAlready'), 'ok');      // scanned before: go on to the face step
            showWhere();
            return;
        }
        setResult(t('scanBad'), 'error');
    }
}

/** Shows the big "physical attendance" answer under the result. */
function showWhere()
{
    const box = $('scan-where');
    box.className = 'where present';
    fill(box, el('b', { text: t('whereClass') }), el('span', { text: t('whyClass') }));
    box.hidden = false;
}

// ---------------------------------------------------------------------
//  LAST STEP: tap your own face in the class photo
// ---------------------------------------------------------------------
// Decision (ours, 25 Nov 2026): one class photo; each student taps their own
// face and confirms. One student per face. "I can't find myself" tells the
// lecturer at once.

/**
 * Follows the photo and my record of one lecture.
 * @param {string} sid - session
 */
function followFaces(sid)
{
    if (face.sid === sid)
    {
        return;
    }
    stopFaces();
    face.sid = sid;
    face.stops.push(store.watchPhoto(sid, (p) =>
    {
        const isNew = p && (!face.photo || face.photo.v !== p.v);
        face.photo = p;
        if (isNew)
        {
            pickView.setPhoto(p.image, p.boxes, p.aspect);
            watchTaken();
            face.told = false;
        }
        drawFaceStep(isNew);
    }));
    face.stops.push(store.watchAttendance(sid, (list) =>
    {
        face.record = list[0] || null;
        drawFaceStep(false);
    }));
    face.stops.push(store.watchBoxRequests(sid, (list) =>
    {
        face.request = list[0] || null;
        drawFaceStep(false);
    }));
}

/** Watches which faces of the current photo are taken. */
function watchTaken()
{
    if (face.stopTaken)
    {
        face.stopTaken();
    }
    face.stopTaken = store.watchTakenFaces(face.sid, face.photo.v, (ids) =>
    {
        face.taken = ids;
        drawFaceStep(false);
    });
}

/** Stops following a lecture. */
function stopFaces()
{
    for (const stop of face.stops)
    {
        stop();
    }
    if (face.stopTaken)
    {
        face.stopTaken();
    }
    Object.assign(face, { sid: null, photo: null, record: null, taken: new Set(), stops: [], stopTaken: null, chosen: 0, request: null, placed: null });
}

/**
 * Shows what the student still has to do.
 * @param {boolean} newPhoto - a photo just arrived
 */
function drawFaceStep(newPhoto)
{
    const step = myStep(face.record, face.photo);
    const mine = face.record && face.photo && face.record.photoV === face.photo.v ? face.record.face : 0;
    $('face-step').hidden = step !== 'pick';
    if (step === 'pick')
    {
        pickView.setTaken(face.taken, mine > 0 ? mine : 0);
        if (newPhoto)
        {
            notify(t('newPhoto'));
        }
    }
    const msg = $('face-msg');
    if (step === 'done')
    {
        msg.textContent = t('pickDone');
        msg.className = 'scan-result ok';
    }
    else if (step === 'told')
    {
        msg.textContent = t('toldLecturer');
        msg.className = 'scan-result warn';
        $('face-step').hidden = false;            // they may still find themselves
        pickView.setTaken(face.taken, 0);
    }
    else if (step === 'nophoto')
    {
        msg.textContent = t('waitPhoto');
        msg.className = 'scan-result';
    }
    else
    {
        msg.textContent = '';
        msg.className = 'scan-result';
    }
    drawMyRequest(step);
}

/**
 * Shows my own requested box and its state.
 * @param {string} step - from myStep
 */
function drawMyRequest(step)
{
    const r = face.request && face.photo && face.request.v === face.photo.v ? face.request : null;
    const open = r && r.status === 'pending';
    $('face-place').hidden = Boolean(open) || step === 'done';
    if (face.placed)
    {
        pickView.setExtra([Object.assign({ state: 'mine' }, face.placed)]);
    }
    else if (r && r.status !== 'ok')
    {
        pickView.setExtra([Object.assign({ state: r.status }, r.box)]);
    }
    else
    {
        pickView.setExtra([]);
    }
    if (open)
    {
        $('place-status').textContent = t('reqPending');
    }
    else if (r && r.status === 'no')
    {
        $('place-status').textContent = t('reqNo') + (r.reason ? ' (' + r.reason + ')' : '') + ' · ' + t('toldLecturer');
    }
    else
    {
        $('place-status').textContent = '';
    }
}

$('face-place').onclick = () =>
{
    $('face-confirm').hidden = true;
    pickView.select(0);
    pickView.setPlacing(true);
    $('place-status').textContent = t('placeHint');
};

/**
 * "No box on me": the student tapped where he sits; show the box and ask to send it.
 * @param {number} px - tap x (fraction)
 * @param {number} py - tap y (fraction)
 */
function placeMyBox(px, py)
{
    face.placed = requestedBox(pickView.boxes, px, py, face.photo.aspect);
    pickView.setPlacing(false);
    $('place-confirm').hidden = false;
    drawFaceStep(false);
}

$('place-cancel').onclick = () =>
{
    face.placed = null;
    $('place-confirm').hidden = true;
    drawFaceStep(false);
};

$('place-send').onclick = async () =>
{
    if (!face.placed || !face.photo)
    {
        return;
    }
    try
    {
        await store.requestBox(face.sid, face.photo.v, face.placed);
    }
    catch (e)
    {
        toast(t('error') + ': ' + e.message, 'warn');
    }
    face.placed = null;
    $('place-confirm').hidden = true;
    drawFaceStep(false);
};

/**
 * A face was tapped: show it big and ask "is this you?".
 * @param {number} id - box id
 */
function askIsThisYou(id)
{
    face.chosen = id;
    pickView.select(id);
    const crop = pickView.crop(id, 280);
    fill($('face-crop'), crop);
    $('face-confirm').hidden = false;
    $('face-confirm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('face-no').onclick = () =>
{
    face.chosen = 0;
    pickView.select(0);
    $('face-confirm').hidden = true;
};

$('face-yes').onclick = () => choose(face.chosen);
$('face-none').onclick = () => choose(FACES.NOT_FOUND);

/**
 * Sends my choice.
 * @param {number} id - box id or FACES.NOT_FOUND
 */
async function choose(id)
{
    if (!face.photo || (id === 0))
    {
        return;
    }
    $('face-yes').disabled = true;
    try
    {
        await store.chooseFace(face.sid, face.photo.v, id);
        $('face-confirm').hidden = true;
        pickView.select(0);
        if (navigator.vibrate)
        {
            navigator.vibrate(id > 0 ? [60, 40, 60] : 200);
        }
    }
    catch (e)
    {
        toast(e.message === 'taken' ? t('boxTaken') : t('error') + ': ' + e.message, 'warn');
        $('face-confirm').hidden = true;
        pickView.select(0);
    }
    finally
    {
        $('face-yes').disabled = false;
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
    let lastGrade;                        // undefined until the first answer: the grade at page load is not "new"
    subWatchers.set(a.id, store.watchSubmissions(a.id, (list) =>
    {
        const s = list[0];
        const grade = s && s.grade !== undefined && s.grade !== null ? String(s.grade) : null;
        if (lastGrade !== undefined && grade !== null && grade !== lastGrade)
        {
            notify(t('newGrade') + ': ' + a.title);           // the lecturer graded while the page is open
        }
        lastGrade = grade;
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
