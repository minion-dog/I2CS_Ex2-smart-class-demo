// =====================================================================
//  comments.js - the comment feed (lecturer and student pages)
// =====================================================================
// Private comments are visible only to the lecturer and the author (the
// security rules enforce it); anonymous comments store no name at all.

import { el, fill, when, toast } from './dom.js';
import { t } from './i18n.js';

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
    const unsub = store.watchComments(sid, (list) => render(ui.feed, list, user));
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
 * Draws the comments, newest at the bottom, and scrolls down.
 * @param {Element} feed - container
 * @param {object[]} list - comments
 * @param {object} user - signed-in user
 */
function render(feed, list, user)
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
            el('p', { text: c.text })
        ]));
    }
    fill(feed, ...items);
    feed.scrollTop = feed.scrollHeight;
}
