// =====================================================================
//  quiz-host.js - the lecturer's live quiz: builder + projector stage
// =====================================================================
// Kahoot style (lecturer's request, 25 Nov 2026). The lecturer writes the
// questions (or lets Gemini write them from the lecture), then runs the quiz
// on the projector: lobby -> question (timer, live answer count) -> answer
// bars with the correct one -> top 5 -> ... -> podium.

import { el, fill, toast } from './dom.js';
import { t, lang } from './i18n.js';
import { QUIZ, validateQuiz, answerCounts, scoreboard, publishBoard, secondsLeft, parseAiQuiz, toMs } from '../core/quiz.js';
import { quizPrompt } from '../ai/prompts.js';
import { aiReady, chat } from '../ai/ai.js';

/** Builder defaults. */
const HOST = Object.freeze({
    START_BLOCKS: 1,
    AI_COUNT: 5,
    TICK_MS: 250
});

/**
 * Sets up the quiz card of the live lecture.
 * @param {object} store - data layer
 * @param {function():object|null} getSession - the current session {id, title}
 * @param {function():string} getMaterial - transcript / summary text of the lecture
 * @param {function():number} getPlayers - how many students scanned (to end a question early)
 * @param {{blocks:Element, title:Element, add:Element, save:Element, ai:Element, topic:Element, list:Element, stage:Element}} ui - elements
 * @returns {function(string):function():void} watch(sid) -> stop
 */
export function setupQuizHost(store, getSession, getMaterial, getPlayers, ui)
{
    let quizzes = [];
    resetBuilder(ui);
    ui.add.onclick = () => ui.blocks.append(questionBlock(null));
    ui.save.onclick = async () =>
    {
        const s = getSession();
        const draft = readBuilder(ui);
        const v = validateQuiz(draft);
        if (s === null || !v.ok)
        {
            toast(t('quizInvalid') + (v.error ? ': ' + v.error : ''), 'warn');
            return;
        }
        await store.createQuiz(s.id, v.quiz);
        resetBuilder(ui);
        toast('✓ ' + t('quizSaved'));
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
    return (sid) => store.watchQuizzes(sid, (list) =>
    {
        quizzes = list;
        fill(ui.list, ...list.map((q) => el('li', {}, [
            el('span', { class: 'grow', text: q.title + ' · ' + q.questions.length + ' ' + t('quizQuestions') }),
            el('span', { class: 'muted', text: q.state.phase === 'end' ? t('quizDone') : '' }),
            el('button', { class: 'small', text: q.state.phase === 'end' ? t('quizAgain') : '▶ ' + t('quizRun'),
                onclick: () => runStage(store, sid, q, ui.stage, () => quizzes.find((x) => x.id === q.id), getPlayers) })
        ])));
    });
}

// ---------------------------------------------------------------- stage

/**
 * Runs one quiz on the projector (full screen).
 * @param {object} store - data layer
 * @param {string} sid - session
 * @param {object} quiz0 - the quiz
 * @param {Element} stage - the full-screen element
 * @param {function():object} latest - the newest copy of the quiz (live)
 * @param {function():number} getPlayers - students in class
 */
async function runStage(store, sid, quiz0, stage, latest, getPlayers)
{
    const key = await store.loadQuizKey(sid, quiz0.id);
    const qs = quiz0.questions;
    const limits = qs.map((q) => q.seconds * 1000);
    const starts = [];
    let answers = [];
    let index = -1;
    let localStart = 0;
    let timer = null;
    let board = [];
    let phase = 'lobby';
    const stopAnswers = store.watchQuizAnswers(sid, quiz0.id, (list) =>
    {
        answers = list;
        if (index >= 0 && phase === 'question')
        {
            drawQuestion();
            const n = answers.filter((a) => a.index === index).length;
            if (n > 0 && n >= getPlayers())
            {
                reveal();                         // everyone answered: no need to wait
            }
        }
    });
    stage.hidden = false;
    document.body.classList.add('quiz-on');
    if (stage.requestFullscreen)
    {
        stage.requestFullscreen().catch(() => {});
    }
    const close = () =>
    {
        clearInterval(timer);
        stopAnswers();
        stage.hidden = true;
        document.body.classList.remove('quiz-on');
        if (document.fullscreenElement)
        {
            document.exitFullscreen().catch(() => {});
        }
    };
    const state = (patch) => store.setQuizState(sid, quiz0.id, Object.assign({
        phase: phase, index: index, startedAt: null, correct: -1, starts: starts, top: [], scores: {}, counts: []
    }, patch));

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

    /** Next question (or the podium after the last). */
    async function next()
    {
        index++;
        if (index >= qs.length)
        {
            phase = 'end';
            await state({ top: publishBoard(board).top, scores: publishBoard(board).scores, correct: -1 });
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
            drawQuestion();
            if (Date.now() - localStart >= limits[index])
            {
                reveal();
            }
        }, HOST.TICK_MS);
    }

    /** Time is up (or all answered): bars + correct answer + scores. */
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
        await new Promise((r) => setTimeout(r, QUIZ.GRACE_MS));      // late answers still on the way
        board = scoreboard(answers, key, starts, limits, index);
        const pub = publishBoard(board);
        const counts = answerCounts(answers, index, qs[index].options.length);
        await state({ correct: key[index], top: pub.top, scores: pub.scores, counts: counts });
        drawReveal(counts);
    }

    /** One question with the timer. */
    function drawQuestion()
    {
        const q = qs[index];
        const left = secondsLeft(localStart, q.seconds, Date.now());
        const n = answers.filter((a) => a.index === index).length;
        frame([
            el('div', { class: 'qz-top' }, [
                el('span', { dir: 'ltr', text: (index + 1) + ' / ' + qs.length }),
                el('span', { class: 'qz-timer', text: String(left) }),
                el('span', { text: n + ' ' + t('quizAnswers') })
            ]),
            el('div', { class: 'qz-question', dir: 'auto', text: q.q }),
            el('div', { class: 'qz-grid' }, q.options.map((o, i) => tile(i, o, ''))),
            el('button', { class: 'qz-skip', text: t('quizShowAnswer'), onclick: reveal })
        ]);
    }

    /**
     * Bars of answers with the correct one marked.
     * @param {number[]} counts - per option
     */
    function drawReveal(counts)
    {
        const q = qs[index];
        const max = Math.max(1, ...counts);
        frame([
            el('div', { class: 'qz-question', dir: 'auto', text: q.q }),
            el('div', { class: 'qz-bars' }, counts.map((c, i) => el('div', { class: 'qz-bar' + (i === key[index] ? ' right' : ' wrong') }, [
                el('div', { class: 'qz-fill', style: 'height:' + (12 + 88 * c / max) + '%;background:' + QUIZ.COLORS[i] }, [el('b', { text: String(c) })]),
                el('span', { text: QUIZ.SHAPES[i] + (i === key[index] ? ' ✓' : '') })
            ]))),
            el('div', { class: 'qz-grid small' }, q.options.map((o, i) => tile(i, o, i === key[index] ? 'right' : 'wrong'))),
            el('button', { class: 'qz-go', text: t('quizBoard'), onclick: drawBoard })
        ]);
    }

    /** Top 5 after a question. */
    async function drawBoard()
    {
        phase = 'board';
        const pub = publishBoard(board);
        await state({ correct: key[index], top: pub.top, scores: pub.scores });
        frame([
            el('div', { class: 'qz-big', text: t('quizLeaders') }),
            el('ol', { class: 'qz-board' }, pub.top.map((r) => el('li', {}, [el('span', { text: r.name }), el('b', { text: String(r.score) })]))),
            el('button', { class: 'qz-go', text: index + 1 < qs.length ? t('quizNext') + ' ▶' : '🏆 ' + t('quizPodium'), onclick: next })
        ]);
    }

    /** Podium. */
    function drawEnd()
    {
        const top = publishBoard(board).top;
        const place = (i, cls) => el('div', { class: 'qz-place ' + cls }, top[i]
            ? [el('b', { text: top[i].name }), el('span', { text: String(top[i].score) }), el('div', { class: 'qz-step', text: String(i + 1) })]
            : [el('div', { class: 'qz-step', text: String(i + 1) })]);
        frame([
            el('div', { class: 'qz-big', text: '🏆 ' + quiz0.title }),
            el('div', { class: 'qz-podium' }, [place(1, 'second'), place(0, 'first'), place(2, 'third')]),
            el('button', { class: 'qz-go', text: t('close'), onclick: close })
        ]);
    }

    /**
     * Fills the stage, always with a close button.
     * @param {Node[]} nodes - content
     */
    function frame(nodes)
    {
        fill(stage, el('button', { class: 'qz-close', text: '✕', 'aria-label': t('close'), onclick: close }), ...nodes);
    }

    await state({});                       // lobby: phones show "get ready"
    drawLobby();
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
 * Empties the builder and adds one empty question.
 * @param {object} ui - elements
 */
function resetBuilder(ui)
{
    ui.title.value = '';
    ui.topic.value = '';
    fill(ui.blocks, ...Array.from({ length: HOST.START_BLOCKS }, () => questionBlock(null)));
}

/**
 * One question in the builder: text, 4 answers with "correct" radio, time.
 * @param {{q:string, options:string[], correct:number, seconds:number}|null} q - prefilled (AI) or null
 * @returns {Element} block
 */
function questionBlock(q)
{
    const name = 'c' + Math.random().toString(36).slice(2, 8);
    const block = el('div', { class: 'qz-block' });
    const rows = [0, 1, 2, 3].map((i) => el('label', { class: 'qz-opt' }, [
        el('input', { type: 'radio', name: name, value: String(i), checked: q ? q.correct === i : i === 0 }),
        el('span', { class: 'qz-shape', style: 'background:' + QUIZ.COLORS[i], text: QUIZ.SHAPES[i] }),
        el('input', { type: 'text', class: 'grow', maxlength: '120', value: q && q.options[i] ? q.options[i] : '',
            placeholder: t('quizAnswer') + ' ' + (i + 1) })
    ]));
    const seconds = el('select', {}, QUIZ.SECONDS.map((sec) => el('option', { value: String(sec), selected: (q ? q.seconds : QUIZ.DEFAULT_SECONDS) === sec, text: sec + ' ' + t('seconds') })));
    fill(block,
        el('textarea', { rows: '2', class: 'qz-q', maxlength: '200', placeholder: t('quizQuestion') }, []),
        ...rows,
        el('div', { class: 'row' }, [el('span', { class: 'hint grow', text: t('quizMarkCorrect') }), seconds,
            el('button', { type: 'button', class: 'secondary small', text: '🗑', onclick: () => block.remove() })]));
    block.querySelector('.qz-q').value = q ? q.q : '';
    return block;
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
            const picked = b.querySelector('.qz-opt input[type=radio]:checked');
            return { q: b.querySelector('.qz-q').value, options: texts, correct: picked ? Number(picked.value) : -1, seconds: Number(b.querySelector('select').value) };
        })
    };
}
