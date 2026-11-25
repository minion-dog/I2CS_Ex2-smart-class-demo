// =====================================================================
//  comments.js - the comment feed (lecturer and student pages)
// =====================================================================
// Private comments are visible only to the lecturer and the author (the
// security rules enforce it); anonymous comments store no name at all.
// Public comments get emoji reactions (👍 "me too" and a few more): everyone,
// the lecturer too, sees how many of each, never who.

import { el, fill, when, toast } from './dom.js';
import { t } from './i18n.js';
import { REACTIONS, toggleEmoji, tally } from '../core/reactions.js';

/**
 * Connects a feed, a text box and a send button to a session's comments.
 * @param {object} store - data layer
 * @param {object} user - signed-in user
 * @param {string} sid - session id
 * @param {{feed:Element, input:HTMLInputElement, send:HTMLButtonElement,
 *          visibility?:HTMLSelectElement, anonymous?:HTMLInputElement}} ui - elements
 * @returns {function():void} stop watching
 */
export function bindComments(store, user, sid, ui)
{
    const view = { comments: [], reactions: [], shown: 0 };
    const draw = () =>
    {
        const grew = view.comments.length !== view.shown;
        view.shown = view.comments.length;
        render(ui.feed, view.comments, user, tally(view.reactions, user.uid), (cid, mine, key) =>
        {
            store.react(sid, cid, toggleEmoji(mine, key)).catch((e) => toast(t('error') + ': ' + e.message, 'error'));
        }, grew);
    };
    const stopComments = store.watchComments(sid, (list) =>
    {
        view.comments = list;
        draw();
    });
    const stopReactions = store.watchReactions(sid, (list) =>
    {
        view.reactions = list;
        draw();
    });
    const unsub = () =>
    {
        stopComments();
        stopReactions();
    };
    const send = async () =>
    {
        const text = ui.input.value.trim();
        if (text === '')
        {
            return;
        }
        ui.input.value = '';
        try
        {
            await store.addComment(sid, {
                text: text.slice(0, 2000),
                visibility: ui.visibility ? ui.visibility.value : 'public',
                anonymous: ui.anonymous ? ui.anonymous.checked : false
            });
        }
        catch (e)
        {
            toast(t('error') + ': ' + e.message, 'error');
        }
    };
    ui.send.onclick = send;
    ui.input.onkeydown = (ev) =>
    {
        if (ev.key === 'Enter')
        {
            send();
        }
    };
    return unsub;
}

/**
 * Draws the comments, newest at the bottom; scrolls down only when a comment was added
 * (not when someone reacts, so the list does not jump while reading).
 * @param {Element} feed - container
 * @param {object[]} list - comments
 * @param {object} user - signed-in user
 * @param {Map<string, {counts:object, mine:string[]}>} reactions - by comment id
 * @param {function(string, string[], string):void} onReact - (comment id, my emojis, tapped key)
 * @param {boolean} scroll - scroll to the newest
 */
function render(feed, list, user, reactions, onReact, scroll)
{
    const items = [];
    for (const c of list)
    {
        let who = c.authorName || t('anonymousName');
        if (c.fromLecturer)
        {
            who = t('lecturerName');
        }
        const classes = ['comment'];
        if (c.visibility === 'private')
        {
            classes.push('private');
        }
        if (c.fromLecturer)
        {
            classes.push('lecturer');
        }
        const meta = [el('span', { text: who }), el('span', { text: when(c.createdAt) })];
        if (c.visibility === 'private')
        {
            meta.push(el('span', { text: '🔒 ' + t('private') }));
        }
        if (c.pending)
        {
            meta.push(el('span', { class: 'badge pending', text: '⏳' }));
        }
        if (c.authorUid === user.uid)
        {
            meta.push(el('span', { text: '·' }));
        }
        items.push(el('div', { class: classes.join(' ') }, [
            el('div', { class: 'meta' }, meta),
            el('p', { text: c.text, dir: 'auto' }),
            c.visibility === 'public' && !c.pending ? reactionRow(c.id, reactions.get(c.id), onReact) : null
        ]));
    }
    fill(feed, ...items);
    if (scroll)
    {
        feed.scrollTop = feed.scrollHeight;
    }
}

/**
 * The emoji buttons under a public comment: each shows its count; mine are highlighted.
 * @param {string} cid - comment id
 * @param {{counts:object, mine:string[]}|undefined} r - this comment's reactions
 * @param {function(string, string[], string):void} onReact - called on a tap
 * @returns {Element} the row
 */
function reactionRow(cid, r, onReact)
{
    const counts = r ? r.counts : {};
    const mine = r ? r.mine : [];
    return el('div', { class: 'reactions' }, REACTIONS.map((x) => el('button', {
        class: 'react' + (mine.includes(x.key) ? ' mine' : '') + (counts[x.key] ? ' used' : ''),
        type: 'button',
        title: t('react_' + x.key),
        'aria-label': t('react_' + x.key) + (counts[x.key] ? ' ' + counts[x.key] : ''),
        'aria-pressed': mine.includes(x.key) ? 'true' : 'false',
        text: x.emoji + (counts[x.key] ? ' ' + counts[x.key] : ''),
        onclick: () => onReact(cid, mine, x.key)
    })));
}
