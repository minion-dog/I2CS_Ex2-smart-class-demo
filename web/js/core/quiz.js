// =====================================================================
//  quiz.js - polls and quizzes in ONE feature (pure logic, no DOM)
// =====================================================================
// The Ex2 sheet asks for "on-the-spot (KISS) polls regarding the current
// learning materials"; the lecturer also talked about something interactive
// like Kahoot. Decision (ours, 25 Nov 2026): one feature, two switches:
//   - correct answer: optional. None = a POLL (only the answer bars).
//   - time: none (open until the lecturer closes it), a deadline
//     (2 / 5 / 10 minutes) or Kahoot speed (10-60 s per question).
// One question, no correct answer, no time = the KISS poll of the sheet.
// With correct answers: 500-1000 points (faster = more when timed, 1000
// when not), top 5 after each question, a podium at the end.
//
// The correct answers are NOT in the quiz document (students can read it);
// they are in a lecturer-only document and revealed one by one.

/** Quiz settings. */
export const QUIZ = Object.freeze({
    MAX_POINTS: 1000,
    MIN_POINTS: 500,            // a correct answer at the last moment still gets half
    SECONDS: [0, 10, 20, 30, 60, 120, 300, 600],   // 0 = no time limit; 120-600 = a deadline
    DEFAULT_SECONDS: 0,                           // a poll by default: open until closed
    AI_SECONDS: 20,                               // AI-written questions are a speed quiz
    NO_ANSWER: -1,                                // no correct answer (a poll question)
    MIN_OPTIONS: 2,
    MAX_OPTIONS: 6,
    MAX_QUESTIONS: 30,
    MAX_TEXT: 200,
    BOARD_SIZE: 5,
    GRACE_MS: 2000,             // network time after the timer ends
    COLORS: ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#0a8f8f'],
    SHAPES: ['▲', '◆', '●', '■', '★', '⬟'],
    PHASES: ['draft', 'lobby', 'question', 'reveal', 'board', 'end']      // students see it from 'lobby' on
});

/**
 * The state of a new quiz: waiting in the lobby.
 * @returns {{phase:string, index:number, startedAt:null, correct:number, starts:number[], top:object[], scores:object}} state
 */
export function newQuizState()
{
    return { phase: 'draft', index: -1, startedAt: null, correct: -1, starts: [], top: [], scores: {}, counts: [] };
}

/**
 * Points for one answer: correct answers get 500..1000, faster = more;
 * without a time limit a correct answer gets 1000.
 * @param {boolean} correct - right answer
 * @param {number} elapsedMs - time from the question's start to the answer
 * @param {number} limitMs - the question's time (0 = no limit)
 * @returns {number} points
 */
export function points(correct, elapsedMs, limitMs)
{
    if (!correct || (limitMs > 0 && elapsedMs > limitMs + QUIZ.GRACE_MS))
    {
        return 0;
    }
    if (limitMs <= 0)
    {
        return QUIZ.MAX_POINTS;
    }
    const part = Math.min(1, Math.max(0, elapsedMs / limitMs));
    return Math.round(QUIZ.MAX_POINTS - (QUIZ.MAX_POINTS - QUIZ.MIN_POINTS) * part);
}

/**
 * Checks and cleans a quiz written by the lecturer (or by the AI).
 * @param {{title:string, questions:{q:string, options:string[], correct:number, seconds?:number}[]}} quiz - draft
 * @returns {{ok:boolean, quiz?:object, error?:string}} clean quiz or the first problem
 */
export function validateQuiz(quiz)
{
    const title = String(quiz.title || '').trim().slice(0, QUIZ.MAX_TEXT);
    const out = [];
    for (const [i, raw] of (quiz.questions || []).entries())
    {
        const q = String(raw.q || '').trim().slice(0, QUIZ.MAX_TEXT);
        const options = (raw.options || []).map((o) => String(o || '').trim().slice(0, QUIZ.MAX_TEXT));
        const kept = options.filter((o) => o !== '');
        if (q === '' && kept.length === 0)
        {
            continue;                                   // an empty block is ignored
        }
        if (q === '')
        {
            return { ok: false, error: 'question ' + (i + 1) + ': no question' };
        }
        if (kept.length < QUIZ.MIN_OPTIONS || kept.length > QUIZ.MAX_OPTIONS)
        {
            return { ok: false, error: 'question ' + (i + 1) + ': 2-' + QUIZ.MAX_OPTIONS + ' answers' };
        }
        const correctText = Number.isInteger(raw.correct) && raw.correct >= 0 ? options[raw.correct] : '';
        const correct = correctText ? kept.indexOf(correctText) : QUIZ.NO_ANSWER;     // none = a poll question
        const seconds = QUIZ.SECONDS.includes(Number(raw.seconds)) ? Number(raw.seconds) : QUIZ.DEFAULT_SECONDS;
        out.push({ q: q, options: kept, correct: correct, seconds: seconds });
    }
    if (out.length === 0)
    {
        return { ok: false, error: 'no questions' };
    }
    const questions = out.slice(0, QUIZ.MAX_QUESTIONS);
    return { ok: true, quiz: { title: title || questions[0].q, questions: questions } };
}

/**
 * Tells whether a quiz gives points (at least one question has a correct answer).
 * @param {number[]} key - correct option per question (-1 = none)
 * @returns {boolean} scored (leaderboard and podium) or a poll (bars only)
 */
export function isScored(key)
{
    return key.some((k) => k >= 0);
}

/**
 * Tells whether the lobby can be skipped: a quick poll (one question, no correct answer)
 * opens straight on the phones.
 * @param {{questions:object[]}} quiz - the quiz
 * @param {number[]} key - answer key
 * @returns {boolean} skip the lobby
 */
export function isQuickPoll(quiz, key)
{
    return quiz.questions.length === 1 && !isScored(key);
}

/**
 * What the time setting means, for labels.
 * @param {number} seconds - 0, 10-60 (speed) or 120-600 (deadline)
 * @returns {{kind:string, minutes:number}} 'none' | 'speed' | 'deadline'
 */
export function timeKind(seconds)
{
    if (!seconds)
    {
        return { kind: 'none', minutes: 0 };
    }
    return seconds >= 120 ? { kind: 'deadline', minutes: seconds / 60 } : { kind: 'speed', minutes: 0 };
}

/**
 * Splits a quiz into what students may see and the lecturer-only answer key.
 * @param {{title:string, questions:object[]}} quiz - valid quiz
 * @returns {{public:object, key:number[]}} the quiz without answers, and the answers
 */
export function splitKey(quiz)
{
    return {
        public: { title: quiz.title, questions: quiz.questions.map((x) => ({ q: x.q, options: x.options, seconds: x.seconds })) },
        key: quiz.questions.map((x) => x.correct)
    };
}

/**
 * How many chose each answer of one question.
 * @param {{index:number, option:number}[]} answers - all answers
 * @param {number} index - question
 * @param {number} n - number of options
 * @returns {number[]} counts
 */
export function answerCounts(answers, index, n)
{
    const counts = new Array(n).fill(0);
    for (const a of answers)
    {
        if (a.index === index && a.option >= 0 && a.option < n)
        {
            counts[a.option]++;
        }
    }
    return counts;
}

/**
 * Scores of everyone over the questions revealed so far.
 * @param {{uid:string, name:string, index:number, option:number, at:number}[]} answers - all answers (at in ms)
 * @param {number[]} key - correct option per question
 * @param {number[]} starts - start time (ms) per question
 * @param {number[]} limits - time per question (ms)
 * @param {number} upTo - last revealed question
 * @returns {{uid:string, name:string, score:number, right:number, rank:number}[]} best first
 */
export function scoreboard(answers, key, starts, limits, upTo)
{
    const by = new Map();
    for (const a of answers)
    {
        if (!by.has(a.uid))
        {
            by.set(a.uid, { uid: a.uid, name: a.name || '?', score: 0, right: 0 });
        }
        if (a.index > upTo || starts[a.index] === undefined)
        {
            continue;
        }
        const p = points(a.option === key[a.index], a.at - starts[a.index], limits[a.index]);
        const row = by.get(a.uid);
        row.score += p;
        row.right += p > 0 ? 1 : 0;
    }
    const list = [...by.values()].sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
    list.forEach((row, i) =>
    {
        row.rank = i > 0 && list[i - 1].score === row.score ? list[i - 1].rank : i + 1;
    });
    return list;
}

/**
 * What everyone may see after a reveal: the top of the board (first names only) and,
 * per player, only their own score and rank.
 * @param {object[]} board - from scoreboard
 * @returns {{top:{name:string, score:number}[], scores:Object<string,{score:number, rank:number}>}} published part
 */
export function publishBoard(board)
{
    const scores = {};
    for (const r of board)
    {
        scores[r.uid] = { score: r.score, rank: r.rank };
    }
    return {
        top: board.slice(0, QUIZ.BOARD_SIZE).map((r) => ({ name: firstName(r.name), score: r.score })),
        scores: scores
    };
}

/**
 * Seconds left in the current question.
 * @param {number} startedAt - ms
 * @param {number} seconds - question time (0 = no limit)
 * @param {number} now - ms
 * @returns {number} whole seconds left (0 at the end; Infinity without a limit)
 */
export function secondsLeft(startedAt, seconds, now)
{
    if (!seconds)
    {
        return Infinity;
    }
    return Math.max(0, Math.ceil((startedAt + seconds * 1000 - now) / 1000));
}

/**
 * Reads the AI's quiz: a JSON list of {q, options[4], correct}.
 * @param {string} text - model output (may have ```json fences)
 * @returns {{q:string, options:string[], correct:number, seconds:number}[]} questions (may be empty)
 */
export function parseAiQuiz(text)
{
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start)
    {
        return [];
    }
    let list;
    try
    {
        list = JSON.parse(text.slice(start, end + 1));
    }
    catch (e)
    {
        return [];
    }
    const out = [];
    for (const item of Array.isArray(list) ? list : [])
    {
        if (!item || typeof item.q !== 'string' || !Array.isArray(item.options))
        {
            continue;
        }
        const options = item.options.slice(0, QUIZ.MAX_OPTIONS).map(String);
        const correct = Number(item.correct);
        if (options.length >= QUIZ.MIN_OPTIONS && Number.isInteger(correct) && correct >= 0 && correct < options.length)
        {
            out.push({ q: item.q, options: options, correct: correct, seconds: QUIZ.AI_SECONDS });
        }
    }
    return out;
}

/**
 * The timer text: "0:45", "4:59", or "" without a limit.
 * @param {number} left - seconds left
 * @returns {string} label
 */
export function timerLabel(left)
{
    if (left === Infinity)
    {
        return '';
    }
    return left >= 60 ? Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : String(left);
}

/**
 * Turns a Firestore Timestamp, a number or null into milliseconds.
 * @param {*} t - time
 * @param {number} fallback - when unknown (a server time not written yet)
 * @returns {number} ms
 */
export function toMs(t, fallback)
{
    if (typeof t === 'number')
    {
        return t;
    }
    if (t && typeof t.toMillis === 'function')
    {
        return t.toMillis();
    }
    return fallback;
}

/**
 * First name only (the board is shown on the projector).
 * @param {string} name - full name
 * @returns {string} first word
 */
function firstName(name)
{
    return String(name || '?').trim().split(/\s+/)[0];
}
