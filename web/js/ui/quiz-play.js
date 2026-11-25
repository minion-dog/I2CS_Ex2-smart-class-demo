// =====================================================================
//  quiz-play.js - the student's side of polls & quizzes
// =====================================================================
// When the lecturer asks a question, a full-screen panel opens on every
// phone: big coloured buttons (2-6), the timer if there is one. After the
// lecturer shows the results: a poll shows the bars; a question with a
// correct answer shows right / wrong, the points and my place. Closing the
// panel hides only this step; the next question opens it again, and the
// Lecture tab has an "answer" button while a question is open.

import { el, fill, toast, notify } from './dom.js';
import { t } from './i18n.js';
import { QUIZ, secondsLeft, timerLabel, toMs } from '../core/quiz.js';

/** Settings. */
const PLAY = Object.freeze({
    SHOW_END_MS: 3 * 60 * 60 * 1000,       // a finished quiz of this lecture stays until closed
    TICK_MS: 250,
    LIVE: ['lobby', 'question', 'reveal', 'board', 'end']
});

/**
 * Follows the polls & quizzes of the open lecture and shows the active one.
 * @param {object} store - data layer
 * @param {object} user - signed-in student
 * @param {Element} panel - full-screen element
 * @param {Element} reopen - "answer the open question" button in the Lecture tab
 * @returns {function(string|null):void} follow(sid) - call with the open lecture (null = none)
 */
export function setupQuizPlay(store, user, panel, reopen)
{
    let sid = null;
    let stopQuizzes = null;
    let stopMine = null;
    let quiz = null;
    let mine = [];
    let lastPhaseKey = '';
    let closedKey = null;
    let prevScore = 0;
    let tick = null;

    const phaseKey = () => (quiz ? quiz.id + ':' + quiz.state.phase + ':' + quiz.state.index : '');

    const draw = () =>
    {
        clearInterval(tick);
        const open = quiz && quiz.state.phase === 'question';
        reopen.hidden = !open || closedKey !== phaseKey();
        if (!quiz || closedKey === phaseKey())
        {
            panel.hidden = true;
            return;
        }
        const st = quiz.state;
        panel.hidden = false;
        const me = st.scores && st.scores[user.uid] ? st.scores[user.uid] : { score: 0, rank: 0 };
        const close = el('button', { class: 'qz-close', text: '✕', onclick: () => { closedKey = phaseKey(); draw(); } });
        if (st.phase === 'lobby')
        {
            fill(panel, close, el('div', { class: 'qz-big', dir: 'auto', text: quiz.title }), el('p', { class: 'qz-sub', text: t('quizReady') }));
            return;
        }
        if (st.phase === 'end')
        {
            fill(panel, close, el('div', { class: 'qz-big', dir: 'auto', text: (st.scored ? '🏆 ' : '✓ ') + quiz.title }),
                st.scored ? el('p', { class: 'qz-result right', text: me.rank ? '#' + me.rank : '' }) : el('p', { class: 'qz-sub', text: t('quizThanks') }),
                st.scored ? el('p', { class: 'qz-sub', text: t('quizScore') + ': ' + me.score }) : null);
            return;
        }
        const q = quiz.questions[st.index] || null;
        if (!q)
        {
            return;
        }
        const answered = mine.find((a) => a.index === st.index);
        if (st.phase === 'question')
        {
            const start = toMs(st.startedAt, Date.now());
            const header = el('div', { class: 'qz-top' }, [
                el('span', { dir: 'ltr', text: quiz.questions.length > 1 ? (st.index + 1) + ' / ' + quiz.questions.length : '' }),
                q.seconds > 0 ? el('span', { class: 'qz-timer', dir: 'ltr', text: timerLabel(secondsLeft(start, q.seconds, Date.now())) }) : el('span', {})
            ]);
            if (answered)
            {
                fill(panel, close, header, el('div', { class: 'qz-big', text: '✓ ' + t('quizSent') }), el('p', { class: 'qz-sub', text: t('quizWait') }));
            }
            else
            {
                fill(panel, close, header, el('p', { class: 'qz-qsmall', dir: 'auto', text: q.q }),
                    el('div', { class: 'qz-pad' + (q.options.length > 4 ? ' six' : '') }, q.options.map((o, i) => el('button', {
                        class: 'qz-btn', style: 'background:' + QUIZ.COLORS[i],
                        onclick: () => answer(st.index, i)
                    }, [el('span', { class: 'qz-shape', text: QUIZ.SHAPES[i] }), el('span', { dir: 'auto', text: o })]))));
            }
            if (q.seconds > 0)
            {
                tick = setInterval(() =>
                {
                    const timerEl = panel.querySelector('.qz-timer');
                    if (timerEl)
                    {
                        timerEl.textContent = timerLabel(secondsLeft(start, q.seconds, Date.now()));
                    }
                }, PLAY.TICK_MS);
            }
            return;
        }
        // results ('reveal' or 'board')
        if (st.correct < 0)
        {
            fill(panel, close, el('p', { class: 'qz-qsmall', dir: 'auto', text: q.q }), resultBars(q, st.counts || [], answered));
            return;
        }
        const right = answered && answered.option === st.correct;
        const gained = Math.max(0, me.score - prevScore);
        fill(panel, close,
            el('div', { class: 'qz-result ' + (right ? 'right' : 'wrong'), text: answered ? (right ? '✓ ' + t('quizRight') : '✗ ' + t('quizWrong')) : '⏱ ' + t('quizNoAnswer') }),
            el('p', { class: 'qz-sub', dir: 'ltr', text: right ? '+' + gained : '' }),
            el('p', { class: 'qz-sub', text: t('quizScore') + ': ' + me.score + (me.rank ? ' · #' + me.rank : '') }),
            el('div', { class: 'qz-btn small', style: 'background:' + QUIZ.COLORS[st.correct] },
                [el('span', { class: 'qz-shape', text: QUIZ.SHAPES[st.correct] }), el('span', { dir: 'auto', text: q.options[st.correct] })]));
    };

    /**
     * The poll results on the phone: bars with my choice marked.
     * @param {object} q - question
     * @param {number[]} counts - per option
     * @param {object|undefined} answered - my answer
     * @returns {Element} list
     */
    const resultBars = (q, counts, answered) =>
    {
        const total = counts.reduce((a, b) => a + b, 0) || 1;
        return el('div', { class: 'qz-phone-bars' }, q.options.map((o, i) => el('div', { class: 'qz-pbar' }, [
            el('div', { class: 'qz-pfill', style: 'width:' + Math.round(100 * (counts[i] || 0) / total) + '%;background:' + QUIZ.COLORS[i] }),
            el('span', { dir: 'auto', text: QUIZ.SHAPES[i] + ' ' + o + (answered && answered.option === i ? '  ✓ ' + t('quizMine') : '') }),
            el('b', { text: (counts[i] || 0) + ' · ' + Math.round(100 * (counts[i] || 0) / total) + '%' })
        ])));
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
     * Picks the newest poll / quiz the lecturer opened.
     * @param {object[]} list - newest first
     */
    const choose = (list) =>
    {
        const live = list.find((q) => PLAY.LIVE.includes(q.state.phase)
            && (q.state.phase !== 'end' || Date.now() - q.createdAt < PLAY.SHOW_END_MS));
        if (live && (!quiz || live.id !== quiz.id))
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
                if (live.state.phase === 'lobby' || (live.state.phase === 'question' && !lastPhaseKey.startsWith(live.id + ':question:' + live.state.index)))
                {
                    if (live.state.phase === 'lobby' || live.state.index === 0)
                    {
                        notify(t('quizStarting'));
                    }
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

    reopen.onclick = () =>
    {
        closedKey = null;
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
