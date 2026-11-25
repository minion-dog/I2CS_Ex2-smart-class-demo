// =====================================================================
//  quiz-host.js - the lecturer's polls & quizzes: builder + projector stage
// =====================================================================
// One feature (decision 25 Nov 2026, see core/quiz.js): a question may have a
// correct answer or not (poll), and a time limit or not. The quick way is the
// KISS poll of the Ex2 sheet: type a question and answers, "Ask now".
// The projector shows: (lobby) -> question (timer if any, live count; live
// bars for a poll question) -> results (bars, the correct answer if any)
// -> top 5 (only when there are correct answers) -> ... -> podium / thanks.

import { el, fill, toast } from './dom.js';
import { t, lang } from './i18n.js';
import {
    QUIZ, validateQuiz, answerCounts, scoreboard, publishBoard, secondsLeft, timerLabel, parseAiQuiz, toMs,
    isScored, isQuickPoll, timeKind
} from '../core/quiz.js';
import { quizPrompt } from '../ai/prompts.js';
import { aiReady, chat } from '../ai/ai.js';

/** Builder and stage settings. */
const HOST = Object.freeze({
    AI_COUNT: 5,
    TICK_MS: 250,
    DEFAULT_OPTIONS: 4
});

/**
 * Sets up the polls & quizzes card of the live lecture.
 * @param {object} store - data layer
 * @param {function():object|null} getSession - the current session {id, title}
 * @param {function():string} getMaterial - transcript / summary text of the lecture
 * @param {function():number} getPlayers - students in class (a timed question ends when all answered)
 * @param {{blocks:Element, title:Element, add:Element, save:Element, now:Element, ai:Element, topic:Element, list:Element, stage:Element}} ui - elements
 * @returns {function(string):function():void} watch(sid) -> stop
 */
export function setupQuizHost(store, getSession, getMaterial, getPlayers, ui)
{
    let quizzes = [];
    let sidNow = null;
    resetBuilder(ui);
    ui.add.onclick = () => ui.blocks.append(questionBlock(null));

    /**
     * Saves the builder's questions.
     * @returns {Promise<{id:string, quiz:object}|null>} saved quiz, or null when incomplete
     */
    const save = async () =>
    {
        const s = getSession();
        const v = validateQuiz(readBuilder(ui));
        if (s === null || !v.ok)
        {
            toast(t('quizInvalid') + (v.error ? ': ' + v.error : ''), 'warn');
            return null;
        }
        const id = await store.createQuiz(s.id, v.quiz);
        resetBuilder(ui);
        return { id: id, quiz: v.quiz };
    };
    ui.save.onclick = async () =>
    {
        if (await save())
        {
            toast('✓ ' + t('quizSaved'));
        }
    };
    ui.now.onclick = async () =>
    {
        const saved = await save();                  // KISS: write it and ask it at once
        if (saved && sidNow)
        {
            runStage(store, sidNow, Object.assign({ id: saved.id }, saved.quiz), ui.stage,
                () => quizzes.find((x) => x.id === saved.id), getPlayers);
        }
    };
    ui.ai.onclick = async () =>
    {
        const s = getSession();
        const material = (ui.topic.value.trim() || getMaterial()).trim();
        if (!aiReady())
        {
            toast(t('aiMissing'), 'warn');
            return;
        }
        if (material === '')
        {
            toast(t('quizNeedTopic'), 'warn');
            ui.topic.focus();
            return;
        }
        ui.ai.disabled = true;
        ui.ai.textContent = t('working');
        try
        {
            const text = await chat(quizPrompt(ui.title.value || (s ? s.title : ''), material, HOST.AI_COUNT, lang()));
            const qs = parseAiQuiz(text);
            if (qs.length === 0)
            {
                throw new Error(t('quizAiEmpty'));
            }
            fill(ui.blocks, ...qs.map((q) => questionBlock(q)));
            if (!ui.title.value && s)
            {
                ui.title.value = s.title;
            }
            toast('✓ ' + qs.length + ' ' + t('quizQuestions'));
        }
        catch (e)
        {
            toast(t('error') + ': ' + e.message, 'error');
        }
        finally
        {
            ui.ai.disabled = false;
            ui.ai.textContent = t('quizAi');
        }
    };
    return (sid) =>
    {
        sidNow = sid;
        return store.watchQuizzes(sid, (list) =>
        {
            quizzes = list;
            fill(ui.list, ...list.map((q) => el('li', {}, [
                el('span', { class: 'grow', dir: 'auto', text: q.title }),
                el('span', { class: 'muted', text: q.questions.length + ' ' + t('quizQuestions') + (q.state.phase === 'end' ? ' · ' + t('quizDone') : '') }),
                el('button', { class: 'small', text: q.state.phase === 'end' ? t('quizAgain') : '▶ ' + t('quizRun'),
                    onclick: () => runStage(store, sid, q, ui.stage, () => quizzes.find((x) => x.id === q.id), getPlayers) })
            ])));
        });
    };
}

// ---------------------------------------------------------------- stage

/**
 * Runs one poll / quiz on the projector (full screen).
 * @param {object} store - data layer
 * @param {string} sid - session
 * @param {object} quiz0 - the quiz {id, title, questions}
 * @param {Element} stage - the full-screen element
 * @param {function():object} latest - the newest copy of the quiz (live)
 * @param {function():number} getPlayers - students in class
 */
async function runStage(store, sid, quiz0, stage, latest, getPlayers)
{
    const key = await store.loadQuizKey(sid, quiz0.id);
    const qs = quiz0.questions;
    const scored = isScored(key);
    const limits = qs.map((q) => q.seconds * 1000);
    const starts = [];
    let answers = [];
    let index = -1;
    let localStart = 0;
    let timer = null;
    let board = [];
    let phase = 'lobby';
    const isPoll = (i) => key[i] === QUIZ.NO_ANSWER;
    const stopAnswers = store.watchQuizAnswers(sid, quiz0.id, (list) =>
    {
        answers = list;
        if (index >= 0 && phase === 'question')
        {
            drawQuestion();
            const n = answers.filter((a) => a.index === index).length;
            if (qs[index].seconds > 0 && n > 0 && n >= getPlayers())
            {
                reveal();                         // timed and everyone answered: no need to wait
            }
        }
    });
    stage.hidden = false;
    document.body.classList.add('quiz-on');
    if (stage.requestFullscreen)
    {
        stage.requestFullscreen().catch(() => {});
    }
    const close = async () =>
    {
        clearInterval(timer);
        if (phase !== 'end')
        {
            phase = 'end';
            await state({});                      // phones close the question too
        }
        stopAnswers();
        stage.hidden = true;
        document.body.classList.remove('quiz-on');
        if (document.fullscreenElement)
        {
            document.exitFullscreen().catch(() => {});
        }
    };
    const state = (patch) =>
    {
        const pub = publishBoard(board);
        return store.setQuizState(sid, quiz0.id, Object.assign({
            phase: phase, index: index, startedAt: null, correct: -1, starts: starts,
            top: scored ? pub.top : [], scores: scored ? pub.scores : {}, counts: [], scored: scored
        }, patch));
    };

    /** Lobby: waiting for the class. */
    const drawLobby = () =>
    {
        frame([
            el('div', { class: 'qz-big', dir: 'auto', text: quiz0.title }),
            el('p', { class: 'qz-sub', text: t('quizJoin') }),
            el('p', { class: 'qz-sub', text: getPlayers() + ' ' + t('quizPlayers') }),
            el('button', { class: 'qz-go', text: '▶ ' + t('quizStart'), onclick: next })
        ]);
    };

    /** Next question (or the end after the last). */
    async function next()
    {
        index++;
        if (index >= qs.length)
        {
            phase = 'end';
            await state({});
            drawEnd();
            return;
        }
        phase = 'question';
        localStart = Date.now();
        await state({ startedAt: 'now' });
        drawQuestion();
        clearInterval(timer);
        timer = setInterval(() =>
        {
            if (phase !== 'question')
            {
                clearInterval(timer);
                return;
            }
            drawTimer();
            if (limits[index] > 0 && Date.now() - localStart >= limits[index])
            {
                reveal();
            }
        }, HOST.TICK_MS);
    }

    /** Time is up, everyone answered, or the lecturer closed it: results. */
    async function reveal()
    {
        if (phase !== 'question')
        {
            return;
        }
        phase = 'reveal';
        clearInterval(timer);
        const q = latest() || quiz0;
        starts[index] = toMs(q.state && q.state.index === index ? q.state.startedAt : null, localStart);
        if (limits[index] > 0)
        {
            await new Promise((r) => setTimeout(r, QUIZ.GRACE_MS));      // late answers still on the way
        }
        board = scoreboard(answers, key, starts, limits, index);
        const counts = answerCounts(answers, index, qs[index].options.length);
        await state({ correct: key[index], counts: counts });
        drawReveal(counts);
    }

    /** The question: timer (if any), live count, live bars for a poll question. */
    function drawQuestion()
    {
        const q = qs[index];
        const n = answers.filter((a) => a.index === index).length;
        const kind = timeKind(q.seconds);
        frame([
            el('div', { class: 'qz-top' }, [
                el('span', { dir: 'ltr', text: qs.length > 1 ? (index + 1) + ' / ' + qs.length : '' }),
                kind.kind === 'none' ? el('span', {}) : el('span', { class: 'qz-timer' + (kind.kind === 'deadline' ? ' wide' : ''), dir: 'ltr' }),
                el('span', { text: n + ' ' + t('quizAnswers') })
            ]),
            el('div', { class: 'qz-question', dir: 'auto', text: q.q }),
            isPoll(index) ? bars(answerCounts(answers, index, q.options.length), -1)
                : el('div', { class: 'qz-grid' + (q.options.length > 4 ? ' six' : '') }, q.options.map((o, i) => tile(i, o, ''))),
            el('button', { class: 'qz-skip', text: isPoll(index) ? t('quizClosePoll') : t('quizShowAnswer'), onclick: reveal })
        ]);
        drawTimer();
    }

    /** Updates only the timer number. */
    function drawTimer()
    {
        const el2 = stage.querySelector('.qz-timer');
        if (el2)
        {
            el2.textContent = timerLabel(secondsLeft(localStart, qs[index].seconds, Date.now()));
        }
    }

    /**
     * Results: bars, the correct answer (if any).
     * @param {number[]} counts - per option
     */
    function drawReveal(counts)
    {
        const q = qs[index];
        const last = index + 1 >= qs.length;
        let nextButton;
        if (scored && !isPoll(index))
        {
            nextButton = el('button', { class: 'qz-go', text: t('quizBoard'), onclick: drawBoard });
        }
        else
        {
            nextButton = el('button', { class: 'qz-go', text: last ? t('close') : t('quizNext') + ' ▶', onclick: last ? close : next });
        }
        frame([
            el('div', { class: 'qz-question', dir: 'auto', text: q.q }),
            bars(counts, key[index]),
            isPoll(index) ? null : el('div', { class: 'qz-grid small' }, q.options.map((o, i) => tile(i, o, i === key[index] ? 'right' : 'wrong'))),
            nextButton
        ]);
    }

    /**
     * Answer bars with the answer text under each.
     * @param {number[]} counts - per option
     * @param {number} right - correct option, or -1 for a poll
     * @returns {Element} bars
     */
    function bars(counts, right)
    {
        const q = qs[index];
        const max = Math.max(1, ...counts);
        const total = counts.reduce((a, b) => a + b, 0);
        return el('div', { class: 'qz-bars' }, counts.map((c, i) => el('div', { class: 'qz-bar' + (right < 0 ? '' : (i === right ? ' right' : ' wrong')) }, [
            el('div', { class: 'qz-fill', style: 'height:' + (8 + 82 * c / max) + '%;background:' + QUIZ.COLORS[i] },
                [el('b', { text: c + (right < 0 && total ? ' · ' + Math.round(100 * c / total) + '%' : '') })]),
            el('span', { class: 'qz-label', dir: 'auto', text: QUIZ.SHAPES[i] + ' ' + q.options[i] + (i === right ? ' ✓' : '') })
        ])));
    }

    /** Top 5 after a scored question. */
    async function drawBoard()
    {
        phase = 'board';
        const pub = publishBoard(board);
        await state({ correct: key[index] });
        frame([
            el('div', { class: 'qz-big', text: t('quizLeaders') }),
            el('ol', { class: 'qz-board' }, pub.top.map((r) => el('li', {}, [el('span', { text: r.name }), el('b', { text: String(r.score) })]))),
            el('button', { class: 'qz-go', text: index + 1 < qs.length ? t('quizNext') + ' ▶' : '🏆 ' + t('quizPodium'), onclick: next })
        ]);
    }

    /** Podium (scored) or thanks (poll). */
    function drawEnd()
    {
        if (!scored)
        {
            frame([el('div', { class: 'qz-big', text: '✓ ' + t('quizThanks') }), el('button', { class: 'qz-go', text: t('close'), onclick: close })]);
            return;
        }
        const top = publishBoard(board).top;
        const place = (i, cls) => el('div', { class: 'qz-place ' + cls }, top[i]
            ? [el('b', { text: top[i].name }), el('span', { text: String(top[i].score) }), el('div', { class: 'qz-step', text: String(i + 1) })]
            : [el('div', { class: 'qz-step', text: String(i + 1) })]);
        frame([
            el('div', { class: 'qz-big', dir: 'auto', text: '🏆 ' + quiz0.title }),
            el('div', { class: 'qz-podium' }, [place(1, 'second'), place(0, 'first'), place(2, 'third')]),
            el('button', { class: 'qz-go', text: t('close'), onclick: close })
        ]);
    }

    /**
     * Fills the stage, always with a close button.
     * @param {(Node|null)[]} nodes - content
     */
    function frame(nodes)
    {
        fill(stage, el('button', { class: 'qz-close', text: '✕', 'aria-label': t('close'), onclick: close }), ...nodes);
    }

    if (isQuickPoll(quiz0, key))
    {
        await next();                      // a quick poll opens straight on the phones
    }
    else
    {
        await state({});                   // lobby: phones show "get ready"
        drawLobby();
    }
}

/**
 * One coloured answer tile.
 * @param {number} i - option
 * @param {string} text - answer
 * @param {string} cls - '' | 'right' | 'wrong'
 * @returns {Element} tile
 */
function tile(i, text, cls)
{
    return el('div', { class: 'qz-tile ' + cls, style: 'background:' + QUIZ.COLORS[i] }, [
        el('span', { class: 'qz-shape', text: QUIZ.SHAPES[i] }), el('span', { dir: 'auto', text: text })
    ]);
}

// -------------------------------------------------------------- builder

/**
 * Empties the builder: one question, ready for a quick poll.
 * @param {object} ui - elements
 */
function resetBuilder(ui)
{
    ui.title.value = '';
    ui.topic.value = '';
    fill(ui.blocks, questionBlock(null));
}

/**
 * One question: text, up to 6 answers, "correct" (or none = poll), time.
 * @param {{q:string, options:string[], correct:number, seconds:number}|null} q - prefilled (AI) or null
 * @returns {Element} block
 */
function questionBlock(q)
{
    const name = 'c' + Math.random().toString(36).slice(2, 8);
    const block = el('div', { class: 'qz-block' });
    const correct = q ? q.correct : QUIZ.NO_ANSWER;
    const row = (i) => el('label', { class: 'qz-opt' }, [
        el('input', { type: 'radio', name: name, value: String(i), checked: correct === i, title: t('quizMarkCorrect') }),
        el('span', { class: 'qz-shape', style: 'background:' + QUIZ.COLORS[i], text: QUIZ.SHAPES[i] }),
        el('input', { type: 'text', class: 'grow', maxlength: '120', value: q && q.options[i] ? q.options[i] : '',
            placeholder: t('quizAnswer') + ' ' + (i + 1) })
    ]);
    const shown = Math.max(HOST.DEFAULT_OPTIONS, q ? q.options.length : 0);
    const opts = el('div', {}, Array.from({ length: shown }, (_, i) => row(i)));
    const more = el('button', { type: 'button', class: 'secondary small', text: '+ ' + t('quizAnswer'), onclick: () =>
    {
        const n = opts.children.length;
        if (n < QUIZ.MAX_OPTIONS)
        {
            opts.append(row(n));
        }
        more.hidden = opts.children.length >= QUIZ.MAX_OPTIONS;
    } });
    more.hidden = shown >= QUIZ.MAX_OPTIONS;
    const none = el('label', { class: 'qz-opt muted' }, [
        el('input', { type: 'radio', name: name, value: '-1', checked: correct === QUIZ.NO_ANSWER }),
        el('span', { text: t('quizNoCorrect') })
    ]);
    const seconds = el('select', { 'aria-label': t('quizTime') }, QUIZ.SECONDS.map((sec) => el('option', {
        value: String(sec), selected: (q ? q.seconds : QUIZ.DEFAULT_SECONDS) === sec, text: timeText(sec)
    })));
    fill(block,
        el('textarea', { rows: '2', class: 'qz-q', maxlength: '200', placeholder: t('quizQuestion') }, []),
        opts, more, none,
        el('div', { class: 'row' }, [el('span', { class: 'hint grow', text: t('quizTime') }), seconds,
            el('button', { type: 'button', class: 'secondary small', text: '🗑', onclick: () => block.remove() })]));
    block.querySelector('.qz-q').value = q ? q.q : '';
    return block;
}

/**
 * Label of a time choice.
 * @param {number} sec - seconds (0 = none)
 * @returns {string} label
 */
function timeText(sec)
{
    const k = timeKind(sec);
    if (k.kind === 'none')
    {
        return t('quizNoLimit');
    }
    if (k.kind === 'deadline')
    {
        return t('quizDeadline') + ' ' + k.minutes + ' ' + t('minutes');
    }
    return '⚡ ' + sec + ' ' + t('seconds');
}

/**
 * Reads the builder.
 * @param {object} ui - elements
 * @returns {{title:string, questions:object[]}} draft
 */
function readBuilder(ui)
{
    return {
        title: ui.title.value,
        questions: [...ui.blocks.querySelectorAll('.qz-block')].map((b) =>
        {
            const texts = [...b.querySelectorAll('.qz-opt input[type=text]')].map((i) => i.value);
            const picked = b.querySelector('input[type=radio]:checked');
            return { q: b.querySelector('.qz-q').value, options: texts, correct: picked ? Number(picked.value) : -1, seconds: Number(b.querySelector('select').value) };
        })
    };
}
