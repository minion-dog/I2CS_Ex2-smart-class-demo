// Tests for the pure logic: class list, attendance sheet, QR payload, XLSX.
// Run: node --test web/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, rosterFromRows, normaliseEmail } from '../js/core/classlist.js';
import { encodePayload, decodePayload, newToken, newSessionId, isCurrentCode, CODE } from '../js/core/payload.js';
import { buildAttendanceSheet, STATUS } from '../js/core/sheet.js';
import { writeXlsx, readXlsx } from '../js/core/xlsx.js';

// ---------------------------------------------------------- class list
const MOODLE_CSV = '\ufeff"שם פרטי","שם משפחה","מספר זיהוי","דוא""ל",קבוצות  \n' +
    'גיא,אביב,111111111,Guy.Test@Gmail.com,3  \n' +
    '"דניאל שלמה",אהרן,222222222,dan@gmail.com,3  \n' +
    'בועז,"בן משה",333333333,lecturer@ariel.ac.il,  \n' +
    '\n';

test('TC-CL-1: CSV parser handles BOM, quotes, doubled quotes and trailing spaces', () =>
{
    const rows = parseCsv(MOODLE_CSV);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], ['שם פרטי', 'שם משפחה', 'מספר זיהוי', 'דוא"ל', 'קבוצות']);
    assert.equal(rows[2][0], 'דניאל שלמה');
});

test('TC-CL-2: roster rows: lower-case emails, staff = no group', () =>
{
    const roster = rosterFromRows(parseCsv(MOODLE_CSV));
    assert.equal(roster.length, 3);
    assert.equal(roster[0].email, 'guy.test@gmail.com');
    assert.equal(roster[0].staff, false);
    assert.equal(roster[2].staff, true);
    assert.equal(roster[1].first, 'דניאל שלמה');
});

test('TC-CL-3: rows without an email are skipped, duplicates kept once', () =>
{
    const rows = [['a', 'b', 'c', 'd', 'e'], ['x', 'y', '1', '', '3'], ['p', 'q', '2', 'A@b.com', '3'], ['p', 'q', '2', 'a@B.com', '3']];
    const roster = rosterFromRows(rows);
    assert.equal(roster.length, 1);
    assert.equal(normaliseEmail('  A@B.Com '), 'a@b.com');
});

// ------------------------------------------------------------- payload
test('TC-PL-1: payload round trip, capitals/digits only (QR alphanumeric mode)', () =>
{
    const sid = newSessionId();
    const text = encodePayload(sid, 'TOK123');
    assert.match(text, /^[0-9A-Z/]+$/);
    assert.deepEqual(decodePayload(text), { sessionId: sid, token: 'TOK123' });
});

test('TC-PL-2: foreign QR codes are rejected', () =>
{
    assert.equal(decodePayload('https://example.com'), null);
    assert.equal(decodePayload('SC2/ONLYTWO'), null);
    assert.equal(decodePayload('SC2/A/B/C'), null);
    assert.equal(decodePayload('SC2/abc/DEF'), null);           // lower case is not ours
    assert.equal(decodePayload('SC1|A|B'), null);              // the old format
});

test('TC-PL-3: tokens are random, 14 capitals/digits (70 bits); session ids 10', () =>
{
    const a = newToken();
    const b = newToken();
    assert.notEqual(a, b);
    assert.match(a, /^[0-9A-HJKMNP-TV-Z]{14}$/);
    assert.match(newSessionId(), /^[0-9A-HJKMNP-TV-Z]{10}$/);
    const seen = new Set();
    for (let i = 0; i < 2000; i++)
    {
        seen.add(newToken());
    }
    assert.equal(seen.size, 2000);
});

test('TC-PL-4: current and previous code are accepted, older are not', () =>
{
    const t0 = 1_000_000;
    assert.equal(isCurrentCode(t0, t0 + 5_000), true);
    assert.equal(isCurrentCode(t0, t0 + CODE.ROTATE_MS + 29_000), true);
    assert.equal(isCurrentCode(t0, t0 + 2 * CODE.ROTATE_MS + 1), false);
    assert.equal(CODE.ROTATE_MS, 30_000);
});

// --------------------------------------------------------------- sheet
test('TC-SH-1: attendance sheet has one row per student and one column per session', () =>
{
    const roster = [
        { email: 'a@x.com', first: 'א', last: 'א', id: '1', staff: false },
        { email: 'b@x.com', first: 'ב', last: 'ב', id: '2', staff: false },
        { email: 't@x.com', first: 'מ', last: 'מ', id: '3', staff: true }
    ];
    const sessions = [{ id: 's1', title: 'שיעור 1', startedAt: 1 }, { id: 's2', title: 'שיעור 2', startedAt: 2 }];
    const attendance = { s1: { 'a@x.com': { status: STATUS.PRESENT } }, s2: { 'a@x.com': { status: STATUS.ZOOM }, 'b@x.com': { status: STATUS.MANUAL } } };
    const sheet = buildAttendanceSheet(roster, sessions, attendance);
    assert.deepEqual(sheet.header.slice(-3), ['שיעור 1', 'שיעור 2', 'סה"כ']);
    assert.equal(sheet.rows.length, 2);
    assert.deepEqual(sheet.rows[0].slice(-3), ['V', 'Z', 2]);
    assert.deepEqual(sheet.rows[1].slice(-3), ['', 'M', 1]);
});

test('TC-SH-2: sessions are ordered by start time', () =>
{
    const sheet = buildAttendanceSheet([], [{ id: 'b', title: 'B', startedAt: 9 }, { id: 'a', title: 'A', startedAt: 3 }], {});
    assert.deepEqual(sheet.header.slice(-3, -1), ['A', 'B']);
});

// ---------------------------------------------------------------- xlsx
test('TC-XL-1: XLSX round trip keeps Hebrew text and numbers', async () =>
{
    const rows = [['שם', 'ציון'], ['מאור', 95], ['נועם', 100]];
    const bytes = writeXlsx('נוכחות', rows);
    assert.equal(bytes[0], 0x50);   // "PK", a zip file
    assert.equal(bytes[1], 0x4B);
    const back = await readXlsx(bytes);
    assert.deepEqual(back, [['שם', 'ציון'], ['מאור', '95'], ['נועם', '100']]);
});

test('TC-XL-2: numeric XML entities (decimal and hex) are decoded', async () =>
{
    const { zipForTest } = await import('./zip-helper.js');
    const xml = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&#1489;&#x05D5;&#1506;&#1494;</t></is></c>' +
        '<c r="C1"><v>7</v></c></row></sheetData></worksheet>';
    const back = await readXlsx(zipForTest('xl/worksheets/sheet1.xml', xml));
    assert.deepEqual(back, [['בועז', '', '7']]);
});

