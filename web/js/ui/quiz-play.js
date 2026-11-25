// =====================================================================
//  quiz-play.js - the student's side of the live quiz (Kahoot style)
// =====================================================================
// When the lecturer opens a quiz, a full-screen panel opens on every phone:
// "get ready" -> four big coloured buttons -> right / wrong with the points
// -> my place -> final place. The question text is on the projector; the
// phone repeats it small for whoever cannot see the screen.

import { el, fill, toast } from './dom.js';
import { t } from './i18n.js';
import { notify } from './polls.js';
import { QUIZ, secondsLeft, toMs } from '../core/quiz.js';

/** How long an ended quiz stays on the phone. */
const PLAY = Object.freeze({
    SHOW_END_MS: 3 * 60 * 60 * 1000,      // a finished quiz of this lecture stays until closed
    TICK_MS: 250,
    LIVE: ['lobby', 'question', 'reveal', 'board', 'end']
});

/**
 * Follows the quizzes of the open lecture and shows the active one.
 * @param {object} store - data layer
 * @param {object} user - signed-in student
 * @param {Element} panel - full-screen element
 * @returns {function(string|null):void} follow(sid) - call with the open lecture (null = none)
 */
export function setupQuizPlay(store, user, panel)
{
    let sid = null;
    let stopQuizzes = null;
    let stopMine = null;
    let quiz = null;
    let mine = [];
    let lastPhaseKey = '';
    let closedId = null;
    let prevScore = 0;
    let tick = null;

    const draw = () =>
    {
        clearInterval(tick);
        if (!quiz || quiz.id === closedId)
        {
            panel.hidden = true;
            return;
        }
        const st = quiz.state;
        panel.hidden = false;
        const me = st.scores && st.scores[user.uid] ? st.scores[user.uid] : { score: 0, rank: 0 };
        const close = el('button', { class: 'qz-close', text: '✕', onclick: () => { closedId = quiz.id; draw(); } });
        if (st.phase === 'lobby')
        {
            fill(panel, close, el('div', { class: 'qz-big', dir: 'auto', text: quiz.title }), el('p', { class: 'qz-sub', text: t('quizReady') }));
            return;
        }
        const q = quiz.questions[st.index] || null;
        const answered = mine.find((a) => a.index === st.index);
        if (st.phase === 'question' && q)
        {
            const start = toMs(st.startedAt, Date.now());
            const header = el('div', { class: 'qz-top' }, [
                el('span', { dir: 'ltr', text: (st.index + 1) + ' / ' + quiz.questions.length }),
                el('span', { class: 'qz-timer', text: String(secondsLeft(start, q.seconds, Date.now())) })
            ]);
            if (answered)
            {
                fill(panel, close, header, el('div', { class: 'qz-big', text: '✓ ' + t('quizSent') }), el('p', { class: 'qz-sub', text: t('quizWait') }));
            }
            else
            {
                fill(panel, close, header, el('p', { class: 'qz-qsmall', dir: 'auto', text: q.q }),
                    el('div', { class: 'qz-pad' }, q.options.map((o, i) => el('button', {
                        class: 'qz-btn', style: 'background:' + QUIZ.COLORS[i],
                        onclick: () => answer(st.index, i)
                    }, [el('span', { class: 'qz-shape', text: QUIZ.SHAPES[i] }), el('span', { dir: 'auto', text: o })]))));
            }
            tick = setInterval(() =>
            {
                const timerEl = panel.querySelector('.qz-timer');
                if (timerEl)
                {
                    timerEl.textContent = String(secondsLeft(start, q.seconds, Date.now()));
                }
            }, PLAY.TICK_MS);
            return;
        }
        if ((st.phase === 'reveal' || st.phase === 'board') && q)
        {
            const right = answered && answered.option === st.correct;
            const gained = Math.max(0, me.score - prevScore);
            fill(panel, close,
                el('div', { class: 'qz-result ' + (right ? 'right' : 'wrong'), text: answered ? (right ? '✓ ' + t('quizRight') : '✗ ' + t('quizWrong')) : '⏱ ' + t('quizNoAnswer') }),
                el('p', { class: 'qz-sub', dir: 'ltr', text: right ? '+' + gained : '' }),
                el('p', { class: 'qz-sub', text: t('quizScore') + ': ' + me.score + (me.rank ? ' · #' + me.rank : '') }),
                st.correct >= 0 ? el('div', { class: 'qz-btn small', style: 'background:' + QUIZ.COLORS[st.correct] },
                    [el('span', { class: 'qz-shape', text: QUIZ.SHAPES[st.correct] }), el('span', { dir: 'auto', text: q.options[st.correct] })]) : null);
            return;
        }
        if (st.phase === 'end')
        {
            fill(panel, close,
                el('div', { class: 'qz-big', text: '🏆 ' + quiz.title }),
                el('p', { class: 'qz-result right', text: me.rank ? '#' + me.rank : '' }),
                el('p', { class: 'qz-sub', text: t('quizScore') + ': ' + me.score }));
        }
    };

    /**
     * Sends an answer.
     * @param {number} index - question
     * @param {number} option - button
     */
    async function answer(index, option)
    {
        if (navigator.vibrate)
        {
            navigator.vibrate(40);
        }
        mine = mine.concat([{ index: index, option: option }]);     // show "sent" at once
        draw();
        try
        {
            await store.answerQuiz(sid, quiz.id, index, option);
        }
        catch (e)
        {
            toast(t('quizLate'), 'warn');
        }
    }

    /**
     * Picks the quiz to show: the newest one that the lecturer opened.
     * @param {object[]} list - quizzes, newest first
     */
    const choose = (list) =>
    {
        const live = list.find((q) => PLAY.LIVE.includes(q.state.phase)
            && (q.state.phase !== 'end' || Date.now() - q.createdAt < PLAY.SHOW_END_MS));
        const changed = !quiz || !live || live.id !== quiz.id;
        if (live && changed)
        {
            if (stopMine)
            {
                stopMine();
            }
            mine = [];
            prevScore = 0;
            stopMine = store.watchQuizAnswers(sid, live.id, (a) =>
            {
                mine = a;
                draw();
            });
        }
        if (live)
        {
            const key = live.id + ':' + live.state.phase + ':' + live.state.index;
            if (key !== lastPhaseKey)
            {
                if (live.state.phase === 'lobby')
                {
                    notify(t('quizStarting'));
                }
                if (live.state.phase === 'question' && quiz && quiz.state && quiz.state.scores && quiz.state.scores[user.uid])
                {
                    prevScore = quiz.state.scores[user.uid].score;      // points of this question = after - before
                }
                lastPhaseKey = key;
            }
        }
        quiz = live || null;
        draw();
    };

    return (newSid) =>
    {
        if (newSid === sid)
        {
            return;
        }
        if (stopQuizzes)
        {
            stopQuizzes();
        }
        if (stopMine)
        {
            stopMine();
        }
        stopMine = null;
        quiz = null;
        sid = newSid;
        stopQuizzes = sid ? store.watchQuizzes(sid, choose) : null;
        draw();
    };
}
