// =====================================================================
//  lecturer.js - the lecturer's website
// =====================================================================
// Tabs: live lecture (QR, attendance, comments, polls, transcript, head
// count), attendance sheet, class list, assignments, settings.
// The page only talks to the data layer (store) - never to Firebase
// directly - so the same page runs on real Firebase and in demo mode.

import { startPage } from './page.js';
import { el, fill, toast, when, setupTabs, download, locate } from './dom.js';
import { t, lang } from './i18n.js';
import { NoisyQrDisplay } from './qr-display.js';
import { showJoinCode } from './join.js';
import { bindComments } from './comments.js';
import { bindPolls, readPollForm } from './polls.js';
import { LectureRecorder, transcribeUpload } from './recorder.js';
import { cosLatOf, GEO } from '../core/geo.js';
import { encodePayload, newToken, zoomDigits, CODE } from '../core/payload.js';
import { buildAttendanceSheet, STATUS } from '../core/sheet.js';
import { parseCsv, rosterFromRows } from '../core/classlist.js';
import { writeXlsx, readXlsx } from '../core/xlsx.js';
import { groqKey, saveGroqKey, chat } from '../ai/groq.js';
import { summaryPrompt, submissionText, reviewPrompt, reviewSummaryLine } from '../ai/prompts.js';
import { fetchRepoFiles } from '../ai/github.js';
import { detectPeople, compareWithScans } from '../ai/headcount.js';

// ---------------------------------------------------------------------
//  CONSTANTS & FIELDS
// ---------------------------------------------------------------------

const ARIEL_UNIVERSITY = Object.freeze({ lat: 32.1036, lng: 35.2079 });  // fallback when no location
const LOCATE_TIMEOUT_MS = 8000;

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
$('groq-key').value = groqKey();
$('groq-save').onclick = () =>
{
    saveGroqKey($('groq-key').value);
    toast('✓');
};
roster = await store.listRoster();
fillRosterOptions();

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
            showHeadcount(fresh.headcount);
        }
    }
});

// ---------------------------------------------------------------------
//  LIVE LECTURE
// ---------------------------------------------------------------------

$('start-session').onclick = async () =>
{
    $('start-session').disabled = true;
    $('locate-status').textContent = t('locating');
    let pos = await locate(LOCATE_TIMEOUT_MS);
    if (pos === null)
    {
        pos = ARIEL_UNIVERSITY;
        toast(t('noLocation'), 'warn');
    }
    $('locate-status').textContent = '';
    const title = $('session-title').value.trim() || defaultTitle();
    const id = await store.createSession(title, {
        lat: pos.lat, lng: pos.lng, cosLat: cosLatOf(pos.lat), radiusM: GEO.RADIUS_METERS
    });
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
    stopWatchers.push(bindPolls(store, user, s.id, $('poll-list')));
    stopWatchers.push(store.watchTranscript(s.id, renderTranscript));
    showSummary(s.summary);
    showHeadcount(s.headcount);
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
    fill($('photo-box'));
    $('head-result').hidden = true;
}

/** Shows a new secret code every 30 s (decision: 30 s, current + previous accepted). */
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
        $('zoom-code').textContent = zoomDigits(token);
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
    const counts = { present: 0, zoom: 0, manual: 0 };
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
    $('n-zoom').textContent = counts.zoom;
    $('n-manual').textContent = counts.manual;
    $('head-scans').textContent = counts.present;
    updateHeadWarning();
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

// ------------------------------------------------------------- polls
$('poll-create').onclick = async () =>
{
    const poll = readPollForm($('poll-q').value, $('poll-opts').value);
    if (poll === null || current === null)
    {
        toast(t('pollOptions'), 'warn');
        return;
    }
    await store.createPoll(current.id, poll.question, poll.options);
    $('poll-q').value = '';
    $('poll-opts').value = '';
};

// -------------------------------------------------------- transcript
$('rec-start').onclick = async () =>
{
    if (!requireGroq() || current === null)
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
    if (!file || !requireGroq() || current === null)
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
    if (!requireGroq() || current === null)
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

// --------------------------------------------------------- head count
$('photo').onchange = async (ev) =>
{
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file || current === null)
    {
        return;
    }
    $('head-status').textContent = t('working');
    const img = el('img', { alt: '' });
    img.src = URL.createObjectURL(file);
    await img.decode();
    fill($('photo-box'), img);
    try
    {
        const people = await detectPeople(img);
        const scale = img.clientWidth / img.naturalWidth;
        for (const p of people)
        {
            const [x, y, w, h] = p.bbox;
            $('photo-box').append(el('div', {
                class: 'box',
                style: 'left:' + (x * scale) + 'px;top:' + (y * scale) + 'px;width:' + (w * scale) + 'px;height:' + (h * scale) + 'px'
            }));
        }
        $('head-count').textContent = people.length;
        $('head-fix').value = people.length;
        $('head-result').hidden = false;
        $('head-status').textContent = '';
        updateHeadWarning();
    }
    catch (e)
    {
        $('head-status').textContent = t('error') + ': ' + e.message;
    }
};

$('head-save').onclick = async () =>
{
    const count = Number($('head-fix').value);
    if (!Number.isFinite(count) || count < 0 || current === null)
    {
        return;
    }
    const inPerson = attendanceNow.filter((r) => r.status === STATUS.PRESENT).length;
    await store.updateSession(current.id, { headcount: { count: count, inPerson: inPerson, at: Date.now() } });
    $('head-count').textContent = count;
    updateHeadWarning();
    toast('✓');
};

/**
 * Shows a saved head count.
 * @param {object|null} h - {count, inPerson}
 */
function showHeadcount(h)
{
    $('n-head').textContent = h ? h.count : '–';
}

/** Warns when there are more in-class scans than people in the photo. */
function updateHeadWarning()
{
    if ($('head-result').hidden)
    {
        return;
    }
    const people = Number($('head-fix').value || $('head-count').textContent);
    const scans = Number($('head-scans').textContent);
    $('head-warning').hidden = !compareWithScans(people, scans).suspicious;
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
        r.staff ? el('span', { class: 'badge manual', text: t('staff') }) : null
    ])));
}

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
    if (!requireGroq())
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
 * Checks that a Groq key exists; otherwise explains where to put it.
 * @returns {boolean} true when AI can be used
 */
function requireGroq()
{
    if (groqKey() === '')
    {
        toast(t('groqMissing'), 'warn');
        return false;
    }
    return true;
}
