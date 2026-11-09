// =====================================================================
//  dom.js - small helpers for building the page safely
// =====================================================================
// WHY el() and never innerHTML with user text: a comment like
// "<img src=x onerror=...>" must show as text, not run as code (XSS).
// el() always puts text in with textContent.

/**
 * Creates an element.
 * @param {string} tag - e.g. 'div'
 * @param {object} [attrs] - attributes; 'class', 'text', 'on<event>' and 'dataset' are special
 * @param {(Node|string)[]} [children] - child nodes or text
 * @returns {HTMLElement} the element
 */
export function el(tag, attrs, children)
{
    const node = document.createElement(tag);
    const a = attrs || {};
    for (const key of Object.keys(a))
    {
        const v = a[key];
        if (v === null || v === undefined || v === false)
        {
            continue;
        }
        if (key === 'class')
        {
            node.className = v;
        }
        else if (key === 'text')
        {
            node.textContent = v;
        }
        else if (key === 'dataset')
        {
            Object.assign(node.dataset, v);
        }
        else if (key.startsWith('on') && typeof v === 'function')
        {
            node.addEventListener(key.slice(2), v);
        }
        else
        {
            node.setAttribute(key, v === true ? '' : String(v));
        }
    }
    for (const c of children || [])
    {
        if (c === null || c === undefined || c === false)
        {
            continue;
        }
        node.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
}

/**
 * Replaces all children of a node.
 * @param {Element} parent - container
 * @param {...(Node|string)} children - new content
 */
export function fill(parent, ...children)
{
    parent.replaceChildren(...children.filter((c) => c !== null && c !== undefined && c !== false));
}

/**
 * Shows a short message at the bottom of the screen.
 * @param {string} text - message
 * @param {string} [kind] - 'ok' | 'warn' | 'error'
 */
export function toast(text, kind)
{
    let box = document.getElementById('toast');
    if (!box)
    {
        box = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
        document.body.append(box);
    }
    box.textContent = text;
    box.className = 'show ' + (kind || 'ok');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() =>
    {
        box.className = '';
    }, 4000);
}

/**
 * Formats a time stamp for lists.
 * @param {number} ms - epoch milliseconds
 * @returns {string} local date and time
 */
export function when(ms)
{
    if (!ms)
    {
        return '';
    }
    return new Date(ms).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'he-IL',
        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Wires a tab bar: buttons with data-tab="x" show the section with id "tab-x".
 * @param {Element} bar - the tab bar
 * @param {function(string):void} [onShow] - called with the tab name
 */
export function setupTabs(bar, onShow)
{
    const buttons = bar.querySelectorAll('[data-tab]');
    const show = (name) =>
    {
        for (const b of buttons)
        {
            const on = b.dataset.tab === name;
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            document.getElementById('tab-' + b.dataset.tab).hidden = !on;
        }
        if (onShow)
        {
            onShow(name);
        }
    };
    for (const b of buttons)
    {
        b.addEventListener('click', () => show(b.dataset.tab));
    }
    show(buttons[0].dataset.tab);
}

/**
 * Shows the online/offline banner and keeps it updated.
 * @param {string} offlineText - text while offline
 */
export function watchConnection(offlineText)
{
    const banner = el('div', { class: 'offline-banner', role: 'status', hidden: true, text: offlineText });
    document.body.prepend(banner);
    let serverOk = true;                      // local server mode: can the lecturer's PC be reached?
    const update = () =>
    {
        banner.hidden = navigator.onLine && serverOk;
    };
    window.addEventListener('smartclass-server', (ev) =>
    {
        serverOk = ev.detail;
        update();
    });
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
}

/**
 * Downloads bytes as a file.
 * @param {Uint8Array|string} data - content
 * @param {string} name - file name
 * @param {string} type - MIME type
 */
export function download(data, name, type)
{
    const url = URL.createObjectURL(new Blob([data], { type: type }));
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Asks the browser for the current position.
 * @param {number} timeoutMs - give up after this long
 * @returns {Promise<{lat:number,lng:number}|null>} position or null when unavailable/denied
 */
export function locate(timeoutMs)
{
    return new Promise((resolve) =>
    {
        if (!navigator.geolocation)
        {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 });
    });
}
