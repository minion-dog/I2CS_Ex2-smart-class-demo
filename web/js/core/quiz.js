// =====================================================================
//  quiz.js - the live quiz, Kahoot style (pure logic, no DOM)
// =====================================================================
// Decision (lecturer's request in class, 25 Nov 2026): the quiz should be
// interactive like Kahoot. The projector shows the question, a timer and
// four coloured answers; phones show four big coloured buttons. A correct
// answer gives 500-1000 points: faster = more. After each question: the
// answer bars, the correct answer and the top 5; at the end a podium.
//
// The correct answers are NOT in the quiz document (students can read it);
// they are in a lecturer-only document and revealed one by one.

/** Quiz settings. */
export const QUIZ = Object.freeze({
    MAX_POINTS: 1000,
    MIN_POINTS: 500,            // a correct answer at the last moment still gets half
    SECONDS: [10, 20, 30, 60],
    DEFAULT_SECONDS: 20,
    MIN_OPTIONS: 2,
    MAX_OPTIONS: 4,
    MAX_QUESTIONS: 30,
    MAX_TEXT: 200,
    BOARD_SIZE: 5,
    GRACE_MS: 2000,             // network time after the timer ends
    COLORS: ['#e21b3c', '#1368ce', '#d89e00', '#26890c'],
    SHAPES: ['▲', '◆', '●', '■'],
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
 * Points for one answer: correct answers get 500..1000, faster = more.
 * @param {boolean} correct - right answer
 * @param {number} elapsedMs - time from the question's start to the answer
 * @param {number} limitMs - the question's time
 * @returns {number} points
 */
export function points(correct, elapsedMs, limitMs)
{
    if (!correct || elapsedMs > limitMs + QUIZ.GRACE_MS)
    {
        return 0;
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
            return { ok: false, error: 'question ' + (i + 1) + ': 2-4 answers' };
        }
        const correctText = options[raw.correct];
        if (!correctText)
        {
            return { ok: false, error: 'question ' + (i + 1) + ': mark the correct answer' };
        }
        const seconds = QUIZ.SECONDS.includes(Number(raw.seconds)) ? Number(raw.seconds) : QUIZ.DEFAULT_SECONDS;
        out.push({ q: q, options: kept, correct: kept.indexOf(correctText), seconds: seconds });
    }
    if (out.length === 0)
    {
        return { ok: false, error: 'no questions' };
    }
    return { ok: true, quiz: { title: title || 'Quiz', questions: out.slice(0, QUIZ.MAX_QUESTIONS) } };
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
 * @param {number} seconds - question time
 * @param {number} now - ms
 * @returns {number} whole seconds left (0 at the end)
 */
export function secondsLeft(startedAt, seconds, now)
{
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
            out.push({ q: item.q, options: options, correct: correct, seconds: QUIZ.DEFAULT_SECONDS });
        }
    }
    return out;
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
