// =====================================================================
//  lecturer.js - the lecturer's website
// =====================================================================
// Tabs: live lecture (QR, attendance, comments, polls & quizzes, transcript, class
// count), attendance sheet, class list, assignments, settings.
// The page only talks to the data layer (store) - never to Firebase
// directly - so the same page runs on real Firebase and in demo mode.

import { startPage } from './page.js';
import { el, fill, toast, when, setupTabs, download } from './dom.js';
import { t, lang } from './i18n.js';
import { NoisyQrDisplay } from './qr-display.js';
import { showJoinCode } from './join.js';
import { bindComments } from './comments.js';
import { LectureRecorder, transcribeUpload } from './recorder.js';
import { encodePayload, newToken, CODE } from '../core/payload.js';
import { buildAttendanceSheet, STATUS } from '../core/sheet.js';
import { parseCsv, rosterFromRows } from '../core/classlist.js';
import { writeXlsx, readXlsx } from '../core/xlsx.js';
import { initAi, aiReady, chat } from '../ai/ai.js';
import { summaryPrompt, submissionText, reviewPrompt, reviewSummaryLine } from '../ai/prompts.js';
import { fetchRepoFiles } from '../ai/github.js';
import { findFaces, checkRequest } from '../ai/facefind.js';
import { FaceView } from './faceview.js';
import { setupQuizHost } from './quiz-host.js';
import { cleanSlots, dueSlot } from '../core/schedule.js';
import { exportEverything } from './export.js';
import { FACES, claimsOf, photoStats, compareWithScans, storedSize } from '../core/faces.js';

// ---------------------------------------------------------------------
//  CONSTANTS & FIELDS
// ---------------------------------------------------------------------


const $ = (id) => document.getElementById(id);

const { store, user } = await startPage('lecturer');
let sessions = [];
let roster = [];
let current = null;          // the session shown in the live view
let stopWatchers = [];       // unsubscribe functions of the live view
let rotateTimer = null;
let countdownTimer = null;
let recorder = null;
let attendanceNow = [];
let dismissedId = null;      // an open session the lecturer closed the view of
let photo = null;            // the saved class photo of the current session {v, image, boxes, aspect}
let draft = null;            // the photo being checked {image, aspect, newVersion}
let requests = [];           // students' "no box on me" requests
const aiChecks = new Map();  // request key -> 'checking' | Gemini's answer
const editView = new FaceView($('face-edit-view'), { mode: 'edit', onChange: (b) => { $('face-count').textContent = b.length; } });
const watchView = new FaceView($('face-watch-view'), { mode: 'watch', onBox: showBoxInfo });
const watchQuizzes = setupQuizHost(store, () => current,
    () => $('transcript-box').textContent || (current && current.summary) || '',
    () => attendanceNow.filter((r) => r.status === STATUS.PRESENT || r.status === STATUS.MANUAL).length,
    { blocks: $('quiz-blocks'), title: $('quiz-name'), add: $('quiz-add'), save: $('quiz-save'), now: $('quiz-now'), ai: $('quiz-ai'),
        topic: $('quiz-topic'), list: $('quiz-list'), stage: $('quiz-stage') });
const qr = new NoisyQrDisplay($('qr'), globalThis.qrcode);
if (store.kind === 'lan')
{
    showJoin();
}

/** Local server only: a plain QR with the phones' address, so students open the site with one scan. */
async function showJoin()
{
    if (await showJoinCode($('join-qr'), $('join-url')))
    {
        $('lan-join').hidden = false;
        $('lan-join').open = true;
    }
}

// ---------------------------------------------------------------------
//  ENTRY
// ---------------------------------------------------------------------

setupTabs($('tabs'), (name) =>
{
    if (name === 'sheet')
    {
        renderSheet();
    }
    if (name === 'roster')
    {
        renderRoster();
    }
});
$('session-title').value = defaultTitle();
initAi(store);                         // the built-in key: no settings for the lecturer
roster = await store.listRoster();
fillRosterOptions();

// ------------------------------------------------ timetable (our first SRS)
let slots = cleanSlots(await store.loadSchedule());
drawSchedule();
setInterval(autoStart, 30 * 1000);

/** Opens the lecture by itself when its time comes (this page must be open). */
async function autoStart()
{
    const slot = dueSlot(slots, sessions, new Date());
    if (slot === null || current !== null && current.endedAt === null)
    {
        return;
    }
    const title = slot.title || defaultTitle();
    const id = await store.createSession(title);
    openLive({ id: id, title: title, endedAt: null, startedAt: Date.now() });
    toast('🗓 ' + t('autoStarted'));
}

/** The timetable editor: one row per weekly lecture. */
function drawSchedule()
{
    fill($('schedule-rows'), ...slots.map((s) => scheduleRow(s)));
}

/**
 * One timetable row.
 * @param {{day:number, start:string, end:string, title:string}} s - slot
 * @returns {Element} row
 */
function scheduleRow(s)
{
    const days = t('days').split(',');
    const row = el('div', { class: 'row wrap sched-row' }, [
        el('select', { class: 'sd' }, days.map((d, i) => el('option', { value: String(i), selected: i === s.day, text: d }))),
        el('input', { type: 'time', class: 'ss', value: s.start }),
        el('input', { type: 'time', class: 'se', value: s.end }),
        el('input', { type: 'text', class: 'st grow', value: s.title, placeholder: t('sessionTitle') }),
        el('button', { type: 'button', class: 'secondary small', text: '🗑', onclick: () => row.remove() })
    ]);
    return row;
}

$('schedule-add').onclick = () => $('schedule-rows').append(scheduleRow({ day: new Date().getDay(), start: '10:00', end: '12:00', title: '' }));
$('schedule-save').onclick = async () =>
{
    slots = cleanSlots([...document.querySelectorAll('.sched-row')].map((r) => ({
        day: r.querySelector('.sd').value, start: r.querySelector('.ss').value, end: r.querySelector('.se').value, title: r.querySelector('.st').value
    })));
    await store.saveSchedule(slots);
    drawSchedule();
    toast('✓ ' + t('scheduleSaved'));
};

store.watchSessions((list) =>
{
    sessions = list;
    renderPastSessions();
    const open = list.find((s) => s.endedAt === null);
    if (current === null && open && open.id !== dismissedId)
    {
        openLive(open);
    }
    else if (current !== null)
    {
        const fresh = list.find((s) => s.id === current.id);
        if (fresh)
        {
            current = fresh;
            showSummary(fresh.summary);
        }
    }
});

// ---------------------------------------------------------------------
//  LIVE LECTURE
// ---------------------------------------------------------------------

$('start-session').onclick = async () =>
{
    $('start-session').disabled = true;
    const title = $('session-title').value.trim() || defaultTitle();
    const id = await store.createSession(title);     // no location: attendance is the live scan
    $('start-session').disabled = false;
    openLive({ id: id, title: title, endedAt: null, startedAt: Date.now() });
};

$('end-session').onclick = async () =>
{
    if (current === null)
    {
        return;
    }
    if (recorder)
    {
        recorder.stop();
        recorder = null;
    }
    await store.updateSession(current.id, { endedAt: Date.now() });
    stopQr();
    $('end-session').hidden = true;
    $('fullscreen').hidden = true;
};

$('close-view').onclick = () =>
{
    dismissedId = current ? current.id : null;
    closeLive();
};

$('fullscreen').onclick = () =>
{
    const wrap = $('qr-wrap');
    wrap.classList.toggle('full');
    if (wrap.classList.contains('full'))
    {
        wrap.onclick = () =>
        {
            wrap.classList.remove('full');
            wrap.onclick = null;
        };
    }
};

/**
 * Shows a session in the live view (open: with the QR; ended: read-only).
 * @param {object} s - session
 */
function openLive(s)
{
    closeLive();
    current = s;
    $('no-session').hidden = true;
    $('live').hidden = false;
    $('live-title').textContent = s.title + ' · ' + when(s.startedAt);
    const isOpen = s.endedAt === null;
    $('end-session').hidden = !isOpen;
    $('fullscreen').hidden = !isOpen;
    $('qr-wrap').hidden = !isOpen;
    if (isOpen)
    {
        startQr();
    }
    stopWatchers.push(store.watchAttendance(s.id, renderAttendance));
    stopWatchers.push(bindComments(store, user, s.id, {
        feed: $('comment-feed'), input: $('comment-text'), send: $('comment-send')
    }));
    stopWatchers.push(store.watchTranscript(s.id, renderTranscript));
    showSummary(s.summary);
    stopWatchers.push(store.watchPhoto(s.id, showPhoto));
    stopWatchers.push(watchQuizzes(s.id));
    stopWatchers.push(store.watchBoxRequests(s.id, (list) =>
    {
        requests = list;
        drawRequests();
        autoCheckRequests();
    }));
}

/** Leaves the live view. */
function closeLive()
{
    stopQr();
    for (const stop of stopWatchers)
    {
        stop();
    }
    stopWatchers = [];
    current = null;
    $('live').hidden = true;
    $('no-session').hidden = false;
    photo = null;
    draft = null;
    $('face-edit').hidden = true;
    $('face-live').hidden = true;
    $('face-status').textContent = '';
}

/** Shows a new secret code every 5 s (decision 25 Nov: current + previous accepted = 10 s). */
function startQr()
{
    const sid = current.id;
    const rotate = async () =>
    {
        if (!current || current.id !== sid)
        {
            return;                          // the lecture was closed meanwhile
        }
        const token = newToken();
        try
        {
            await store.publishCode(current.id, token);
        }
        catch (e)
        {
            setTimeout(rotate, 3000);        // the server is not reachable: keep the old code, try again soon
            return;
        }
        qr.setText(encodePayload(current.id, token));
        rotate.at = Date.now();
    };
    rotate();
    qr.start();
    rotateTimer = setInterval(rotate, CODE.ROTATE_MS);
    countdownTimer = setInterval(() =>
    {
        const left = Math.max(0, Math.ceil((CODE.ROTATE_MS - (Date.now() - rotate.at)) / 1000));
        $('qr-timer').textContent = '⟳ ' + left;
    }, 500);
}

/** Stops the QR animation and the timers. */
function stopQr()
{
    clearInterval(rotateTimer);
    clearInterval(countdownTimer);
    qr.stop();
    $('qr-wrap').classList.remove('full');
}

/**
 * Draws the live attendance list and the counters.
 * @param {object[]} list - attendance records
 */
function renderAttendance(list)
{
    attendanceNow = list;
    const counts = { present: 0, manual: 0 };
    const items = [];
    const sorted = list.slice().sort((a, b) => (b.scannedAt || 0) - (a.scannedAt || 0));
    for (const r of sorted)
    {
        counts[r.status] = (counts[r.status] || 0) + 1;
        const label = { present: t('inClass'), zoom: t('onZoom'), manual: t('manual') }[r.status];
        items.push(el('li', {}, [
            el('span', { class: 'badge ' + r.status, text: label }),
            el('span', { class: 'grow', text: displayName(r.email) }),
            el('span', { class: 'muted', text: when(r.scannedAt) }),
            el('button', {
                class: 'secondary small', text: t('remove'),
                onclick: () => store.setAttendance(current.id, r.email, null)
            })
        ]));
    }
    fill($('attendance-list'), ...items);
    $('n-present').textContent = counts.present;
    $('n-manual').textContent = counts.manual;
    updatePhotoStats();
}

$('manual-add').onclick = async () =>
{
    const value = $('manual-search').value.trim().toLowerCase();
    const match = roster.find((r) => r.email === value || value.includes(r.email));
    if (!match || current === null)
    {
        toast(t('notOnList'), 'warn');
        return;
    }
    await store.setAttendance(current.id, match.email, STATUS.MANUAL);
    $('manual-search').value = '';
};

// -------------------------------------------------------- transcript
$('rec-start').onclick = async () =>
{
    if (!requireAi() || current === null)
    {
        return;
    }
    try
    {
        recorder = new LectureRecorder(store, current.id, (s) =>
        {
            $('rec-status').textContent = '● ' + s;
        });
        await recorder.start();
        $('rec-start').hidden = true;
        $('rec-stop').hidden = false;
        $('rec-status').textContent = '●';
    }
    catch (e)
    {
        toast(t('error') + ': ' + e.message, 'error');
    }
};

$('rec-stop').onclick = () =>
{
    if (recorder)
    {
        recorder.stop();
        recorder = null;
    }
    $('rec-start').hidden = false;
    $('rec-stop').hidden = true;
    $('rec-status').textContent = '';
};

$('rec-upload').onchange = async (ev) =>
{
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file || !requireAi() || current === null)
    {
        return;
    }
    $('rec-status').textContent = t('working');
    try
    {
        await transcribeUpload(store, current.id, file);
        $('rec-status').textContent = '✓';
    }
    catch (e)
    {
        $('rec-status').textContent = t('error') + ': ' + e.message;
    }
};

$('make-summary').onclick = async () =>
{
    if (!requireAi() || current === null)
    {
        return;
    }
    const text = $('transcript-box').textContent.trim();
    if (text === '')
    {
        toast(t('noSummary'), 'warn');
        return;
    }
    $('rec-status').textContent = t('working');
    try
    {
        const summary = await chat(summaryPrompt(current.title, text, lang()));
        await store.updateSession(current.id, { summary: summary });
        $('rec-status').textContent = '✓';
    }
    catch (e)
    {
        $('rec-status').textContent = t('error') + ': ' + e.message;
    }
};

/**
 * Shows the transcript pieces.
 * @param {object[]} pieces - in order
 */
function renderTranscript(pieces)
{
    $('transcript-box').textContent = pieces.map((p) => p.text).join('\n\n');
}

/**
 * Shows the summary or the "no summary" note.
 * @param {string|null} summary - text
 */
function showSummary(summary)
{
    if (summary)
    {
        fill($('summary-box'), el('p', { text: summary }));
    }
    else
    {
        fill($('summary-box'), el('p', { class: 'muted', text: t('noSummary') }));
    }
}

// -------------------------------------------------------- class photo
// Decision (ours, 25 Nov 2026): one photo, a box on every face, the lecturer
// fixes the boxes, then each student taps their own face after scanning.
$('photo').onchange = (ev) => takePhoto(ev);
$('photo-again').onchange = (ev) => takePhoto(ev);

/**
 * Reads a new photo, finds the faces and opens the box editor.
 * @param {Event} ev - change of a file input
 */
async function takePhoto(ev)
{
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file || current === null)
    {
        return;
    }
    $('face-status').textContent = t('findingFaces');
    $('face-live').hidden = true;
    try
    {
        const { canvas, full, dataUrl } = await shrink(file);
        draft = { image: dataUrl, aspect: canvas.width / canvas.height, newVersion: true };
        editView.setPhoto(dataUrl, [], draft.aspect);
        $('face-count').textContent = '…';
        $('face-edit').hidden = false;
        const found = await findFaces(full, dataUrl.split(',')[1], (p) => { $('face-status').textContent = t('findingFaces') + ' ' + p; });
        editView.setPhoto(dataUrl, found.boxes, draft.aspect);
        $('face-count').textContent = editView.boxes.length;
        $('face-status').textContent = t('foundWith') + ': ' + found.used.join(' + ');
    }
    catch (e)
    {
        $('face-status').textContent = t('autoFailed') + ' (' + e.message + ')';
        $('face-count').textContent = editView.boxes.length;
    }
}

$('face-undo').onclick = () => editView.undo();

$('face-reedit').onclick = () =>
{
    if (photo === null)
    {
        return;
    }
    draft = { image: photo.image, aspect: photo.aspect, newVersion: false };   // same version: choices stay
    editView.setPhoto(photo.image, photo.boxes, photo.aspect);
    $('face-count').textContent = photo.boxes.length;
    $('face-live').hidden = true;
    $('face-edit').hidden = false;
};

$('face-save').onclick = async () =>
{
    if (draft === null || current === null)
    {
        return;
    }
    $('face-save').disabled = true;
    try
    {
        const v = draft.newVersion ? (photo ? photo.v : 0) + 1 : photo.v;
        await store.savePhoto(current.id, { v: v, image: draft.image, boxes: editView.boxes, aspect: draft.aspect });
        const inPerson = attendanceNow.filter((r) => r.status === STATUS.PRESENT).length;
        await store.updateSession(current.id, { headcount: { count: editView.boxes.length, inPerson: inPerson, at: Date.now() } });
        draft = null;
        $('face-edit').hidden = true;
        $('face-status').textContent = '';
        toast(t('photoSaved'));
    }
    catch (e)
    {
        toast(t('error') + ': ' + e.message, 'error');
    }
    finally
    {
        $('face-save').disabled = false;
    }
};

/**
 * Shows the saved photo with who chose which face.
 * @param {object|null} p - photo or null
 */
function showPhoto(p)
{
    photo = p;
    if (p === null)
    {
        $('face-live').hidden = true;
        return;
    }
    if (draft === null)
    {
        $('face-live').hidden = false;
    }
    if (watchView.img.src !== p.image)
    {
        watchView.setPhoto(p.image, p.boxes, p.aspect);
    }
    updatePhotoStats();
    drawRequests();
    autoCheckRequests();
}

/** Counters, names on the boxes and the "not in the photo" list. */
function updatePhotoStats()
{
    $('n-present').textContent = attendanceNow.filter((r) => r.status === STATUS.PRESENT).length;
    if (photo === null)
    {
        $('n-head').textContent = '–';
        return;
    }
    const st = photoStats(photo.boxes, attendanceNow, photo.v);
    $('n-head').textContent = st.faces;
    $('f-faces').textContent = st.faces;
    $('f-confirmed').textContent = st.confirmed;
    $('f-waiting').textContent = st.waiting;
    $('f-notfound').textContent = st.notFound;
    const labels = new Map();
    for (const [id, email] of claimsOf(attendanceNow, photo.v))
    {
        labels.set(id, displayName(email));
    }
    watchView.setLabels(labels);
    const scans = attendanceNow.filter((r) => r.status === STATUS.PRESENT).length;
    $('head-warning').hidden = !compareWithScans(st.faces, scans).suspicious;
    const missing = attendanceNow.filter((r) => r.photoV === photo.v && r.face === FACES.NOT_FOUND);
    fill($('not-found-list'), ...missing.map((r) => el('li', {}, [el('span', { class: 'grow', text: '⚠ ' + displayName(r.email) })])));
}

/** The students' box requests: on the photo (dashed) and as a list with Approve / Reject. */
function drawRequests()
{
    const v = photo ? photo.v : -1;
    const open = requests.filter((r) => r.v === v && r.status !== 'ok');
    watchView.setExtra(open.map((r) => Object.assign({ label: displayName(r.email), state: r.status }, r.box)));
    fill($('req-list'), ...open.map((r) =>
    {
        const check = aiChecks.get(r.email + '@' + r.at);
        let state = r.status === 'no' ? (r.reason || t('reject')) : '';
        if (check === 'checking')
        {
            state = t('aiChecking');
        }
        return el('li', {}, [
            el('span', { class: 'grow', text: displayName(r.email) }),
            el('span', { class: 'muted', text: state }),
            el('button', { class: 'small', text: t('approve'), onclick: () => store.resolveBoxRequest(current.id, r, true, 'lecturer', photo) }),
            el('button', { class: 'secondary small', text: t('reject'), onclick: () => store.resolveBoxRequest(current.id, r, false, 'lecturer', photo) })
        ]);
    }));
}

/**
 * Decision (ours, 25 Nov 2026): Gemini checks a box a student placed himself. A person
 * there -> the box is added and given to the student; no person -> refused, and the
 * lecturer can still approve it. Without AI the lecturer decides.
 */
async function autoCheckRequests()
{
    if (!aiReady() || photo === null || !watchView.img.complete)
    {
        return;
    }
    for (const r of requests)
    {
        const key = r.email + '@' + r.at;
        if (r.status !== 'pending' || r.v !== photo.v || aiChecks.has(key))
        {
            continue;
        }
        aiChecks.set(key, 'checking');
        drawRequests();
        try
        {
            const answer = await checkRequest(watchView.img, r.box);
            aiChecks.set(key, answer);
            if (answer !== null)
            {
                await store.resolveBoxRequest(current.id, r, answer.person, (answer.person ? t('aiYes') : t('aiNo')) + ': ' + answer.reason, photo);
            }
        }
        catch (e)
        {
            aiChecks.set(key, null);              // left to the lecturer
        }
        drawRequests();
    }
}

/**
 * Tapping a box in the live photo: who chose it, and a button to free it.
 * @param {number} id - box id
 */
function showBoxInfo(id)
{
    const email = photo ? claimsOf(attendanceNow, photo.v).get(id) : null;
    if (!email)
    {
        $('box-info').hidden = true;
        return;
    }
    $('box-name').textContent = '#' + id + ' · ' + displayName(email);
    $('box-free').onclick = async () =>
    {
        await store.freeFace(current.id, photo.v, id, email);
        $('box-info').hidden = true;
    };
    $('box-info').hidden = false;
}

/**
 * Scales the photo down for storing (Firestore keeps documents under 1 MB); the faces are
 * searched in the full-size photo, where faces at the back still have enough pixels.
 * @param {File} file - the photo
 * @returns {Promise<{canvas:HTMLCanvasElement, full:HTMLCanvasElement, dataUrl:string}>} the photo
 */
async function shrink(file)
{
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const size = storedSize(bmp.width, bmp.height);
    const canvas = el('canvas', { width: size.w, height: size.h });
    canvas.getContext('2d').drawImage(bmp, 0, 0, size.w, size.h);
    const k = Math.min(1, FACES.DETECT_MAX_SIDE / Math.max(bmp.width, bmp.height));
    const full = el('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    full.getContext('2d').drawImage(bmp, 0, 0, full.width, full.height);
    let q = FACES.PHOTO_QUALITY;
    let dataUrl = canvas.toDataURL('image/jpeg', q);
    while (dataUrl.length > 900_000 && q > 0.35)
    {
        q -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', q);
    }
    return { canvas: canvas, full: full, dataUrl: dataUrl };
}

// ---------------------------------------------------------------------
//  ATTENDANCE SHEET
// ---------------------------------------------------------------------

let lastSheet = null;

/** Builds the sheet from all sessions and shows it. */
async function renderSheet()
{
    roster = await store.listRoster();
    const attendance = await store.loadAttendance(sessions.map((s) => s.id));
    lastSheet = buildAttendanceSheet(roster, sessions, attendance);
    const head = el('tr', {}, lastSheet.header.map((h) => el('th', { text: String(h) })));
    const rows = lastSheet.rows.map((r) => el('tr', {}, r.map((c) => el('td', { class: String(c), text: String(c) }))));
    fill($('sheet-table'), el('thead', {}, [head]), el('tbody', {}, rows));
}

$('sheet-refresh').onclick = renderSheet;
$('sheet-xlsx').onclick = async () =>
{
    if (lastSheet === null)
    {
        await renderSheet();
    }
    const bytes = writeXlsx('נוכחות', [lastSheet.header].concat(lastSheet.rows));
    download(bytes, 'attendance-' + new Date().toISOString().slice(0, 10) + '.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
};

// ---------------------------------------------------------------------
//  CLASS LIST
// ---------------------------------------------------------------------

$('roster-file').onchange = async (ev) =>
{
    const file = ev.target.files[0];
    if (!file)
    {
        return;
    }
    try
    {
        let rows;
        if (/\.xlsx$/i.test(file.name))
        {
            rows = await readXlsx(new Uint8Array(await file.arrayBuffer()));
        }
        else
        {
            rows = parseCsv(await file.text());
        }
        const entries = rosterFromRows(rows);
        await store.saveRoster(entries);
        roster = entries;
        fillRosterOptions();
        renderRoster();
        toast('✓ ' + entries.length);
    }
    catch (e)
    {
        toast(t('error') + ': ' + e.message, 'error');
    }
};

/** Shows the class list. */
async function renderRoster()
{
    roster = await store.listRoster();
    const students = roster.filter((r) => !r.staff);
    $('roster-status').textContent = students.length + ' ' + t('rosterCount') + ' · ' + (roster.length - students.length) + ' ' + t('staff');
    fill($('roster-list'), ...roster.map((r) => el('li', {}, [
        el('span', { class: 'grow', text: r.first + ' ' + r.last }),
        el('span', { class: 'muted', text: r.email }),
        r.staff ? el('span', { class: 'badge manual', text: t('staff') }) : null,
        el('button', { class: 'secondary small', text: t('remove'), onclick: () => removeFromRoster(r.email) })
    ])));
}

/**
 * Removes one student from the class list (from our first SRS).
 * @param {string} email - student
 */
async function removeFromRoster(email)
{
    if (!confirm(t('removeAsk') + '\n' + email))
    {
        return;
    }
    await store.saveRoster(roster.filter((r) => r.email !== email));
    await renderRoster();
    fillRosterOptions();
}

$('ra-add').onclick = async () =>
{
    const email = $('ra-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email) || $('ra-first').value.trim() === '')
    {
        toast(t('error'), 'warn');
        return;
    }
    const entry = { first: $('ra-first').value.trim(), last: $('ra-last').value.trim(), id: $('ra-id').value.trim(), email: email, group: '', staff: false };
    await store.saveRoster(roster.filter((r) => r.email !== email).concat([entry]));
    for (const id of ['ra-first', 'ra-last', 'ra-id', 'ra-email'])
    {
        $(id).value = '';
    }
    await renderRoster();
    fillRosterOptions();
};

$('export-zip').onclick = async () =>
{
    $('export-zip').disabled = true;
    toast(t('exporting'));
    try
    {
        await exportEverything(store, sessions, roster);
    }
    catch (e)
    {
        toast(t('error') + ': ' + e.message, 'error');
    }
    finally
    {
        $('export-zip').disabled = false;
    }
};

/** Fills the search suggestions for manual marking. */
function fillRosterOptions()
{
    fill($('roster-options'), ...roster.filter((r) => !r.staff).map((r) =>
        el('option', { value: r.email, text: r.first + ' ' + r.last })));
}

// ---------------------------------------------------------------------
//  ASSIGNMENTS
// ---------------------------------------------------------------------

let assignments = [];
let currentAssignment = null;
let stopSubs = null;
let submissions = [];

store.watchAssignments((list) =>
{
    assignments = list;
    fill($('a-list'), ...list.map((a) => el('li', {}, [
        el('span', { class: 'grow', text: a.title }),
        el('span', { class: 'muted', text: a.due || '' }),
        el('button', { class: 'secondary small', text: t('submissions'), onclick: () => openAssignment(a) })
    ])));
});

$('a-create').onclick = async () =>
{
    const title = $('a-title').value.trim();
    if (title === '')
    {
        return;
    }
    await store.createAssignment({ title: title, requirements: $('a-req').value.trim(), due: $('a-due').value });
    $('a-title').value = '';
    $('a-req').value = '';
};

/**
 * Shows the submissions of one assignment.
 * @param {object} a - assignment
 */
function openAssignment(a)
{
    currentAssignment = a;
    $('a-current').textContent = t('submissions') + ' · ' + a.title;
    $('a-review-all').hidden = false;
    if (stopSubs)
    {
        stopSubs();
    }
    stopSubs = store.watchSubmissions(a.id, (list) =>
    {
        submissions = list;
        fill($('a-subs'), ...list.map(submissionCard));
    });
}

/**
 * Builds the card of one submission: links, AI review, grade and feedback.
 * @param {object} s - submission
 * @returns {Element} card
 */
function submissionCard(s)
{
    const grade = el('input', { type: 'number', min: 0, max: 100, value: s.grade !== undefined && s.grade !== null ? s.grade : '' });
    const feedback = el('textarea', { rows: 2 });
    feedback.value = s.feedback || '';
    return el('div', { class: 'comment' }, [
        el('div', { class: 'meta' }, [el('b', { text: displayName(s.email) }), el('span', { text: when(s.submittedAt) })]),
        safeLink(s.repoUrl),
        el('p', { class: 'muted', text: (s.files || []).map((f) => f.name).join(', ') }),
        s.review ? el('details', {}, [el('summary', { text: t('aiReview') }), el('p', { text: s.review })]) : null,
        el('div', { class: 'row' }, [
            el('button', { class: 'secondary small', text: t('aiReview'), onclick: () => reviewOne(s) }),
            el('label', { class: 'check', text: t('grade') }),
            grade
        ]),
        el('label', { text: t('feedback') }),
        feedback,
        el('p', {}, [el('button', {
            class: 'small', text: t('save'),
            onclick: async () =>
            {
                await store.updateSubmission(currentAssignment.id, s.email, {
                    grade: grade.value === '' ? null : Number(grade.value), feedback: feedback.value.trim()
                });
                toast('✓');
            }
        })])
    ]);
}

/**
 * Runs the AI review of one submission, comparing it with the others.
 * @param {object} s - submission
 */
async function reviewOne(s)
{
    if (!requireAi())
    {
        return;
    }
    toast(t('working'));
    try
    {
        let files = s.files || [];
        if (s.repoUrl)
        {
            files = files.concat(await fetchRepoFiles(s.repoUrl));
        }
        const peers = submissions.filter((o) => o.email !== s.email && o.review).map((o) => reviewSummaryLine(o.review));
        const review = await chat(reviewPrompt(currentAssignment.requirements || currentAssignment.title,
            submissionText(files), peers, lang()));
        await store.updateSubmission(currentAssignment.id, s.email, { review: review });
        toast('✓');
    }
    catch (e)
    {
        toast(t('error') + ': ' + e.message, 'error');
    }
}

$('a-review-all').onclick = async () =>
{
    for (const s of submissions)
    {
        await reviewOne(s);
    }
};

// ---------------------------------------------------------------------
//  LOW-LEVEL HELPERS
// ---------------------------------------------------------------------

/** Lists past sessions to reopen. */
function renderPastSessions()
{
    fill($('past-sessions'), ...sessions.map((s) => el('li', {}, [
        el('span', { class: 'grow', text: s.title }),
        el('span', { class: 'muted', text: when(s.startedAt) + (s.endedAt === null ? ' ●' : '') }),
        el('button', { class: 'secondary small', text: '→', onclick: () => openLive(s) })
    ])));
}

/**
 * Makes a link only for http(s) URLs: a student could type "javascript:..." as the
 * repository link, and that must never become clickable code on the lecturer's page.
 * @param {string} url - submitted link
 * @returns {Element|null} a paragraph with the link (or plain text), or null when empty
 */
function safeLink(url)
{
    if (!url)
    {
        return null;
    }
    if (!/^https?:\/\//i.test(url))
    {
        return el('p', { class: 'muted', text: url });
    }
    return el('p', {}, [el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url })]);
}

/**
 * Returns "first last" for an email on the list, or the email itself.
 * @param {string} email - student email
 * @returns {string} name
 */
function displayName(email)
{
    const r = roster.find((x) => x.email === email);
    return r ? r.first + ' ' + r.last : email;
}

/**
 * Returns a default lecture title with today's date.
 * @returns {string} title
 */
function defaultTitle()
{
    return (lang() === 'en' ? 'Lecture ' : 'שיעור ') + new Date().toLocaleDateString(lang() === 'en' ? 'en-GB' : 'he-IL');
}

/**
 * Checks that the built-in AI is set up; otherwise says so (no key to type).
 * @returns {boolean} true when AI can be used
 */
function requireAi()
{
    if (!aiReady())
    {
        toast(t('aiMissing'), 'warn');
        return false;
    }
    return true;
}
