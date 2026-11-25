// Tests of "download everything" (web/js/core/archive.js) and the zip writer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeName, csv, buildArchive, dataUrlBytes } from '../js/core/archive.js';
import { makeZip } from '../js/core/xlsx.js';
import { readZip } from './zip-helper.js';

const T0 = new Date(2026, 10, 4, 10, 5).getTime();

test('TC-ZIP-1: safe names and Excel-friendly CSV (Hebrew, commas, quotes)', () =>
{
    assert.equal(safeName('a/b:c*?'), 'a_b_c__');
    assert.equal(safeName('..secret'), '_secret');
    assert.equal(safeName(''), '_');
    const text = csv([['שם', 'הערה'], ['דנה', 'שלום, "עולם"']]);
    assert.ok(text.startsWith('﻿'));
    assert.ok(text.includes('"שלום, ""עולם"""'));
});

test('TC-ZIP-2: one folder per lecture and per assignment, with every part', () =>
{
    const files = buildArchive({
        date: '2026-11-25',
        roster: [{ first: 'Dana', last: 'Levi', id: '1', email: 'dana@x', group: '3' }],
        lectures: [{
            session: { id: 's1', title: 'Intro / week 1', startedAt: T0, summary: '# Summary' },
            attendance: { 'dana@x': { email: 'dana@x', name: 'Dana', status: 'present', scannedAt: T0, face: 2, photoV: 1 } },
            comments: [{ createdAt: T0, visibility: 'public', authorName: null, text: 'Q?' }],
            polls: [{ question: 'Ready?', options: ['yes', 'no'], counts: [3, 1] }],
            quizzes: [{ title: 'Week 1', questions: [{ q: 'Q', options: ['a', 'b'], seconds: 20 }], key: [1],
                state: { starts: [0] }, answers: [{ uid: 'u', name: 'Dana', index: 0, option: 1, at: 0 }] }],
            transcript: [{ index: 1, text: 'part two' }, { index: 0, text: 'part one' }],
            photo: { v: 1, image: 'data:image/jpeg;base64,AAEC', boxes: [{ id: 2, x: 0.1, y: 0.2, w: 0.03, h: 0.04 }] }
        }],
        assignments: [{ assignment: { title: 'Ex2', requirements: 'Do it', due: '2026-11-30' },
            submissions: [{ email: 'dana@x', repoUrl: 'https://github.com/a/b', review: 'Good', grade: 95, feedback: 'Well done',
                submittedAt: T0, files: [{ name: '../Main.java', text: 'class Main {}' }] }] }]
    });
    const paths = files.map((f) => f.path);
    const L = 'SmartClass-2026-11-25/lectures/01 2026-11-04 Intro _ week 1/';
    for (const p of ['attendance.csv', 'comments.csv', 'polls.csv', 'quiz-Week 1.csv', 'transcript.txt', 'summary.md', 'class-photo.jpg', 'faces.csv'])
    {
        assert.ok(paths.includes(L + p), 'missing ' + p);
    }
    const A = 'SmartClass-2026-11-25/assignments/Ex2/';
    for (const p of ['requirements.md', 'grades.csv', 'dana@x/link.txt', 'dana@x/review.md', 'dana@x/feedback.md', 'dana@x/files/__Main.java'])
    {
        assert.ok(paths.includes(A + p), 'missing ' + p);
    }
    const get = (p) => files.find((f) => f.path === p).data;
    assert.equal(get(L + 'transcript.txt'), 'part one\r\n\r\npart two', 'transcript in order');
    assert.match(get(L + 'attendance.csv'), /#2/);
    assert.match(get(L + 'faces.csv'), /dana@x/);
    assert.match(get(L + 'quiz-Week 1.csv'), /1,Dana,1000,1,b ✓/);
    assert.deepEqual([...get(L + 'class-photo.jpg')], [0, 1, 2]);
    assert.ok(paths.every((p) => !p.includes('..')), 'no ".." in any path');
});

test('TC-ZIP-3: the zip opens and keeps the files byte for byte', async () =>
{
    const zip = makeZip([{ path: 'a/שלום.txt', data: 'שלום' }, { path: 'b.bin', data: dataUrlBytes('data:x;base64,AAEC/w==') }]);
    const entries = await readZip(zip);
    assert.equal(new TextDecoder().decode(entries['a/שלום.txt']), 'שלום');
    assert.deepEqual([...entries['b.bin']], [0, 1, 2, 255]);
});
