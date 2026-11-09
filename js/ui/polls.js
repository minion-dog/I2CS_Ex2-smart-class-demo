// =====================================================================
//  polls.js - quick polls (KISS): lecturer sees live bars, students vote
// =====================================================================

import { el, fill, toast } from './dom.js';
import { t } from './i18n.js';

/**
 * Shows the polls of a session. Lecturer: live result bars + close/reopen.
 * Student: one vote per poll, then "voted".
 * @param {object} store - data layer
 * @param {object} user - signed-in user
 * @param {string} sid - session
 * @param {Element} box - container
 * @returns {function():void} stop watching
 */
export function bindPolls(store, user, sid, box)
{
    const voteWatchers = new Map();
    const cards = new Map();
    const unsub = store.watchPolls(sid, (polls) =>
    {
        const keep = new Set();
        const nodes = [];
        for (const p of polls)
        {
            keep.add(p.id);
            let card = cards.get(p.id);
            if (!card)
            {
                card = el('div', { class: 'comment' });
                cards.set(p.id, card);
            }
            card.poll = p;
            nodes.push(card);
            if (!voteWatchers.has(p.id))
            {
                voteWatchers.set(p.id, store.watchVotes(sid, p.id, (v) =>
                {
                    card.votes = v;
                    drawPoll(store, user, sid, card);
                }));
            }
            else
            {
                drawPoll(store, user, sid, card);
            }
        }
        for (const [id, stop] of voteWatchers)
        {
            if (!keep.has(id))
            {
                stop();
                voteWatchers.delete(id);
                cards.delete(id);
            }
        }
        fill(box, ...nodes);
    });
    return () =>
    {
        unsub();
        for (const stop of voteWatchers.values())
        {
            stop();
        }
    };
}

/**
 * Draws one poll card.
 * @param {object} store - data layer
 * @param {object} user - signed-in user
 * @param {string} sid - session
 * @param {Element} card - the card (has .poll and .votes)
 */
function drawPoll(store, user, sid, card)
{
    const p = card.poll;
    const v = card.votes || { counts: null, mine: null };
    const parts = [el('p', {}, [el('b', { text: p.question })])];
    if (user.role === 'lecturer')
    {
        const counts = v.counts || [];
        let total = 0;
        for (let i = 0; i < p.options.length; i++)
        {
            total += counts[i] || 0;
        }
        for (let i = 0; i < p.options.length; i++)
        {
            const n = counts[i] || 0;
            const pct = total === 0 ? 0 : Math.round(100 * n / total);
            parts.push(el('div', { class: 'bar' }, [
                el('span', { style: 'width:' + pct + '%' }),
                el('em', { text: p.options[i] + ' · ' + n + ' (' + pct + '%)' })
            ]));
        }
        parts.push(el('div', { class: 'row' }, [
            el('span', { class: 'grow muted', text: total + ' ' + t('votes') }),
            el('button', {
                class: 'secondary small',
                text: p.open ? t('closePoll') : t('reopenPoll'),
                onclick: () => store.setPollOpen(sid, p.id, !p.open)
            })
        ]));
    }
    else if (v.mine !== null)
    {
        parts.push(el('p', { class: 'muted', text: t('voted') + ' · ' + p.options[v.mine] }));
    }
    else if (!p.open)
    {
        parts.push(el('p', { class: 'muted', text: t('pollClosed') }));
    }
    else
    {
        const row = el('div', { class: 'row' });
        for (let i = 0; i < p.options.length; i++)
        {
            row.append(el('button', {
                class: 'secondary',
                text: p.options[i],
                onclick: async () =>
                {
                    try
                    {
                        await store.vote(sid, p.id, i);
                        card.votes = { counts: null, mine: i };
                        drawPoll(store, user, sid, card);
                    }
                    catch (e)
                    {
                        toast(t('error') + ': ' + e.message, 'error');
                    }
                }
            }));
        }
        parts.push(row);
    }
    fill(card, ...parts);
}

/**
 * Reads the "new poll" form (lecturer).
 * @param {string} question - question text
 * @param {string} optionsText - one answer per line
 * @returns {{question:string, options:string[]}|null} poll, or null when invalid
 */
export function readPollForm(question, optionsText)
{
    const q = question.trim();
    const options = optionsText.split('\n').map((s) => s.trim()).filter((s) => s !== '').slice(0, 6);
    if (q === '' || options.length < 2)
    {
        return null;
    }
    return { question: q, options: options };
}
