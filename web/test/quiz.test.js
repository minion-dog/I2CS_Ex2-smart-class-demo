// Tests of the live quiz logic (web/js/core/quiz.js) and the AI quiz prompt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ, points, validateQuiz, splitKey, answerCounts, scoreboard, publishBoard, secondsLeft, parseAiQuiz, toMs, isScored, isQuickPoll, timeKind, timerLabel } from '../js/core/quiz.js';
import { quizPrompt } from '../js/ai/prompts.js';

test('TC-QZ-1: points: correct = 500..1000, faster = more; no time limit = 1000; wrong or too late = 0', () =>
{
    assert.equal(points(true, 3_600_000, 0), 1000, 'no limit: a correct answer an hour later still counts');
    assert.equal(points(false, 0, 0), 0);
    assert.equal(points(true, 0, 20000), 1000);
    assert.equal(points(true, 10000, 20000), 750);
    assert.equal(points(true, 20000, 20000), 500);
    assert.equal(points(true, 21000, 20000), 500, 'within the network grace');
    assert.equal(points(true, 20000 + QUIZ.GRACE_MS + 1, 20000), 0);
    assert.equal(points(false, 0, 20000), 0);
});

test('TC-QZ-2: one feature: a correct answer is optional (none = poll), time is optional, 2-6 answers', () =>
{
    const ok = validateQuiz({ title: ' Week 5 ', questions: [
        { q: 'What is 2+2?', options: ['3', '', '4', '5'], correct: 2, seconds: 30 },
        { q: '', options: ['', '', '', ''], correct: 0 },
        { q: 'Which topic again?', options: ['A', 'B', 'C', 'D', 'E', 'F'], correct: -1, seconds: 300 },
        { q: 'Capital?', options: ['A', 'B'], correct: 1, seconds: 7 }
    ] });
    assert.ok(ok.ok);
    assert.equal(ok.quiz.questions.length, 3);
    assert.deepEqual(ok.quiz.questions[0], { q: 'What is 2+2?', options: ['3', '4', '5'], correct: 1, seconds: 30 });
    assert.deepEqual(ok.quiz.questions[1], { q: 'Which topic again?', options: ['A', 'B', 'C', 'D', 'E', 'F'], correct: QUIZ.NO_ANSWER, seconds: 300 });
    assert.equal(ok.quiz.questions[2].seconds, 0, 'a strange time falls back to no limit');
    const poll = validateQuiz({ title: '', questions: [{ q: 'Pizza or falafel?', options: ['pizza', 'falafel'] }] });
    assert.equal(poll.quiz.title, 'Pizza or falafel?', 'a quick poll is named after its question');
    assert.deepEqual([poll.quiz.questions[0].correct, poll.quiz.questions[0].seconds], [-1, 0]);
    assert.match(validateQuiz({ questions: [{ q: 'x', options: ['a'] }] }).error, /2-6/);
    assert.match(validateQuiz({ questions: [{ q: 'x', options: ['1', '2', '3', '4', '5', '6', '7'] }] }).error, /2-6/);
    assert.match(validateQuiz({ questions: [{ q: '', options: ['a', 'b'], correct: 0 }] }).error, /no question/);
    assert.match(validateQuiz({ questions: [] }).error, /no questions/);
});

test('TC-QZ-6: poll or quiz: scoring, quick poll without a lobby, time kinds and labels', () =>
{
    assert.equal(isScored([-1, -1]), false);
    assert.equal(isScored([-1, 2]), true);
    assert.equal(isQuickPoll({ questions: [{}] }, [-1]), true);
    assert.equal(isQuickPoll({ questions: [{}, {}] }, [-1, -1]), false);
    assert.equal(isQuickPoll({ questions: [{}] }, [0]), false);
    assert.deepEqual(timeKind(0), { kind: 'none', minutes: 0 });
    assert.deepEqual(timeKind(20), { kind: 'speed', minutes: 0 });
    assert.deepEqual(timeKind(300), { kind: 'deadline', minutes: 5 });
    assert.equal(secondsLeft(0, 0, 999999), Infinity);
    assert.equal(timerLabel(Infinity), '');
    assert.equal(timerLabel(299), '4:59');
    assert.equal(timerLabel(45), '45');
    const board = scoreboard([{ uid: 'a', name: 'A', index: 0, option: 1, at: 50 }], [-1], [0], [0], 0);
    assert.equal(board[0].score, 0, 'a poll question gives no points');
});

test('TC-QZ-3: the answer key is kept apart from what students can read', () =>
{
    const { quiz } = validateQuiz({ title: 'T', questions: [{ q: 'Q', options: ['a', 'b', 'c'], correct: 2 }] });
    const parts = splitKey(quiz);
    assert.deepEqual(parts.key, [2]);
    assert.equal(JSON.stringify(parts.public).includes('correct'), false);
});

test('TC-QZ-4: answer bars, scoreboard with speed, ties share a rank, the projector shows first names only', () =>
{
    const answers = [
        { uid: 'a', name: 'Dana Levi', index: 0, option: 1, at: 1000 },     // right, instant
        { uid: 'b', name: 'Yossi Cohen', index: 0, option: 1, at: 11000 },  // right, half time
        { uid: 'c', name: 'Avi Ben', index: 0, option: 0, at: 2000 },       // wrong
        { uid: 'a', name: 'Dana Levi', index: 1, option: 0, at: 30000 },    // question 2 not revealed yet
    ];
    assert.deepEqual(answerCounts(answers, 0, 4), [1, 2, 0, 0]);
    const board = scoreboard(answers, [1, 0], [1000, 29000], [20000, 20000], 0);
    assert.deepEqual(board.map((r) => [r.uid, r.score, r.rank]), [['a', 1000, 1], ['b', 750, 2], ['c', 0, 3]]);
    const full = scoreboard(answers, [1, 0], [1000, 29000], [20000, 20000], 1);
    assert.equal(full[0].score, 1000 + 975);
    const tie = scoreboard([{ uid: 'x', name: 'X', index: 0, option: 0, at: 0 }, { uid: 'y', name: 'Y', index: 0, option: 0, at: 0 }], [0], [0], [20000], 0);
    assert.deepEqual(tie.map((r) => r.rank), [1, 1]);
    const pub = publishBoard(board);
    assert.deepEqual(pub.top[0], { name: 'Dana', score: 1000 });
    assert.deepEqual(pub.scores.b, { score: 750, rank: 2 });
});

test('TC-QZ-5: timer, AI quiz reading, prompt, times from Firestore', () =>
{
    assert.equal(secondsLeft(0, 20, 5500), 15);
    assert.equal(secondsLeft(0, 20, 25000), 0);
    const ai = parseAiQuiz('```json\n[{"q":"Q1","options":["a","b","c","d"],"correct":2},{"q":"bad","options":["a"],"correct":0},{"q":"Q3","options":["a","b"],"correct":5}]\n```');
    assert.equal(ai.length, 1);
    assert.equal(ai[0].correct, 2);
    assert.deepEqual(parseAiQuiz('no'), []);
    const m = quizPrompt('Lecture 5', 'transcript text', 5, 'he');
    assert.match(m[0].content, /Hebrew/);
    assert.match(m[0].content, /JSON/);
    assert.match(m[1].content, /5 questions/);
    assert.equal(toMs(1234, 0), 1234);
    assert.equal(toMs({ toMillis: () => 99 }, 0), 99);
    assert.equal(toMs(null, 7), 7);
});
