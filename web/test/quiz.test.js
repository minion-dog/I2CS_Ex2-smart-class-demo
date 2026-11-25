// Tests of the live quiz logic (web/js/core/quiz.js) and the AI quiz prompt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ, points, validateQuiz, splitKey, answerCounts, scoreboard, publishBoard, secondsLeft, parseAiQuiz, toMs } from '../js/core/quiz.js';
import { quizPrompt } from '../js/ai/prompts.js';

test('TC-QZ-1: points: correct = 500..1000, faster = more; wrong or too late = 0', () =>
{
    assert.equal(points(true, 0, 20000), 1000);
    assert.equal(points(true, 10000, 20000), 750);
    assert.equal(points(true, 20000, 20000), 500);
    assert.equal(points(true, 21000, 20000), 500, 'within the network grace');
    assert.equal(points(true, 20000 + QUIZ.GRACE_MS + 1, 20000), 0);
    assert.equal(points(false, 0, 20000), 0);
});

test('TC-QZ-2: a quiz is checked: empty blocks ignored, 2-4 answers, a correct answer, allowed times', () =>
{
    const ok = validateQuiz({ title: ' Week 5 ', questions: [
        { q: 'What is 2+2?', options: ['3', '', '4', '5'], correct: 2, seconds: 30 },
        { q: '', options: ['', '', '', ''], correct: 0 },
        { q: 'Capital?', options: ['A', 'B'], correct: 1, seconds: 7 }
    ] });
    assert.ok(ok.ok);
    assert.equal(ok.quiz.questions.length, 2);
    assert.deepEqual(ok.quiz.questions[0], { q: 'What is 2+2?', options: ['3', '4', '5'], correct: 1, seconds: 30 });
    assert.equal(ok.quiz.questions[1].seconds, QUIZ.DEFAULT_SECONDS, 'a strange time falls back to 20 s');
    assert.match(validateQuiz({ questions: [{ q: 'x', options: ['a'], correct: 0 }] }).error, /2-4/);
    assert.match(validateQuiz({ questions: [{ q: 'x', options: ['a', 'b'], correct: 3 }] }).error, /correct/);
    assert.match(validateQuiz({ questions: [{ q: '', options: ['a', 'b'], correct: 0 }] }).error, /no question/);
    assert.match(validateQuiz({ questions: [] }).error, /no questions/);
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
