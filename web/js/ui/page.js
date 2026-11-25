// =====================================================================
//  page.js - what every signed-in page does first
// =====================================================================

import { getStore, demoMode, lanMode, modeSuffix } from '../data/store.js';
import { applyLanguage, toggleLanguage, t } from './i18n.js';
import { watchConnection } from './dom.js';

/**
 * Starts a page for one role: language, top bar, offline banner, and a
 * guard that sends anyone else back to the login page.
 * @param {string} role - 'lecturer' or 'student'
 * @returns {Promise<{store:object, user:object}>} resolved once the right user is signed in
 */
export function startPage(role)
{
    applyLanguage();
    watchConnection(t('offline'));
    const store = getStore();
    const suffix = modeSuffix();
    document.getElementById('lang').addEventListener('click', toggleLanguage);
    document.getElementById('signout').addEventListener('click', async () =>
    {
        await store.signOut();
        location.replace('index.html' + suffix);
    });
    if (demoMode())
    {
        document.getElementById('demo-banner').hidden = false;
    }
    if (lanMode())
    {
        const banner = document.getElementById('demo-banner');
        banner.dataset.i18n = 'lanBanner';
        banner.textContent = t('lanBanner');
        banner.hidden = false;
    }
    if ('serviceWorker' in navigator && location.protocol === 'https:')
    {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    return new Promise((resolve) =>
    {
        let done = false;
        store.onAuth((user) =>
        {
            if (!user || user.role !== role)
            {
                location.replace('index.html' + suffix);
                return;
            }
            document.querySelector('.who').textContent = user.name + ' · ' + user.email;
            heroUser = user;
            setHero(null);
            if (!done)
            {
                done = true;
                resolve({ store: store, user: user });
            }
        });
    });
}

let heroUser = null;

/**
 * Fills the coloured band at the top of the page: a greeting by the time of
 * day, the open lecture's title (or "no open lecture") and one detail line.
 * @param {?string} title - the open lecture's title, null when none is open
 * @param {string} [sub] - a detail line (date, room, "live now")
 */
export function setHero(title, sub)
{
    const hi = document.getElementById('hero-hi');
    if (!hi)
    {
        return;
    }
    const hour = new Date().getHours();
    const part = hour >= 5 && hour < 12 ? 'greetMorning' : hour < 17 && hour >= 12 ? 'greetNoon' : hour >= 17 && hour < 22 ? 'greetEvening' : 'greetNight';
    const first = heroUser && heroUser.name ? heroUser.name.split(' ')[0] : '';
    hi.textContent = t(part) + (first ? ', ' + first : '');
    document.getElementById('hero-title').textContent = title || t('heroIdle');
    document.getElementById('hero-sub').textContent = sub || (title ? '' : t('heroIdleSub'));
}
