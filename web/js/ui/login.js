// =====================================================================
//  login.js - the entry page: who are you?
// =====================================================================
// Students: Google with the email that is on the Moodle class list.
// Lecturer: email + password (an account made by hand in Firebase).
// After sign-in the role decides the page: lecturer.html or student.html.

import { getStore, demoMode, lanMode, modeSuffix } from '../data/store.js';
import { SAMPLE_CLASS } from '../data/sample-class.js';
import { applyLanguage, toggleLanguage, t } from './i18n.js';
import { el, fill } from './dom.js';
import { showJoinCode, onThisPc } from './join.js';

const store = getStore();
const suffix = modeSuffix();

applyLanguage();
document.getElementById('lang').addEventListener('click', toggleLanguage);

const errorBox = document.getElementById('error');

/**
 * Shows an error under the title.
 * @param {string} text - message
 */
function showError(text)
{
    errorBox.textContent = text;
    errorBox.hidden = false;
}

store.onAuth((user) =>
{
    if (!user)
    {
        return;
    }
    if (user.role === 'lecturer')
    {
        location.replace('lecturer.html' + suffix);
    }
    else if (user.role === 'student')
    {
        location.replace('student.html' + suffix);
    }
    else
    {
        showError(t('notOnList') + ' (' + user.email + ')');
        store.signOut();
    }
});

if (lanMode())
{
    startLanLogin();
    if (onThisPc())
    {
        showJoinCode(document.getElementById('join-qr'), document.getElementById('join-url')).then((ok) =>
        {
            document.getElementById('phone-join').hidden = !ok;
        });
    }
}
else if (demoMode())
{
    document.getElementById('demo-banner').hidden = false;
    // the demo server (Start Demo.bat) runs on this PC only: phones need the local server
    document.getElementById('phone-need-server').hidden = false;
    document.getElementById('real-login').hidden = true;
    document.getElementById('demo-login').hidden = false;
    refreshDemoStudents();
    document.getElementById('demo-lecturer').addEventListener('click', () => store.signInAs('lecturer'));
    document.getElementById('demo-student-go').addEventListener('click', async () =>
    {
        const email = document.getElementById('demo-student').value;
        try
        {
            await store.signInAs(email);
        }
        catch (e)
        {
            showError(t('notOnList'));
        }
    });
    document.getElementById('demo-load').addEventListener('click', async () =>
    {
        await store.saveRoster(SAMPLE_CLASS);
        refreshDemoStudents();
    });
    document.getElementById('demo-reset').addEventListener('click', async () =>
    {
        await store.resetDemo();
        refreshDemoStudents();
    });
}
else
{
    document.getElementById('google').addEventListener('click', async () =>
    {
        try
        {
            await store.signInGoogle();
        }
        catch (e)
        {
            showError(t('error') + ': ' + (e.code || e.message));
        }
    });
    document.getElementById('lecturer-form').addEventListener('submit', async (ev) =>
    {
        ev.preventDefault();
        try
        {
            await store.signInLecturer(document.getElementById('lec-email').value,
                document.getElementById('lec-pass').value);
        }
        catch (e)
        {
            showError(t('error') + ': ' + (e.code || e.message));
        }
    });
}

/** The local-server sign-in: students type their email, the lecturer the password from the server window. */
function startLanLogin()
{
    const banner = document.getElementById('demo-banner');
    banner.dataset.i18n = 'lanBanner';
    banner.textContent = t('lanBanner');
    banner.hidden = false;
    document.getElementById('real-login').hidden = true;
    document.getElementById('lan-login').hidden = false;
    const go = async (fn) =>
    {
        errorBox.hidden = true;
        try
        {
            await fn();
        }
        catch (e)
        {
            const known = { 'not-on-list': t('notOnList'), 'wrong password': t('lanWrongPassword') };
            showError(known[e.message] || (t('error') + ': ' + e.message));
        }
    };
    document.getElementById('lan-student-form').addEventListener('submit', (ev) =>
    {
        ev.preventDefault();
        go(() => store.signInStudent(document.getElementById('lan-email').value));
    });
    document.getElementById('lan-lecturer-form').addEventListener('submit', (ev) =>
    {
        ev.preventDefault();
        go(() => store.signInLecturer('', document.getElementById('lan-pass').value));
    });
    document.getElementById('lan-load').addEventListener('click', () => go(async () =>
    {
        await store.signInLecturer('', document.getElementById('lan-pass').value);
        await store.saveRoster(SAMPLE_CLASS);
    }));
}

/** Fills the demo student picker from the demo class list. */
async function refreshDemoStudents()
{
    const roster = await store.listRoster();
    const select = document.getElementById('demo-student');
    const options = [];
    for (const r of roster)
    {
        if (!r.staff)
        {
            options.push(el('option', { value: r.email, text: r.first + ' ' + r.last + ' (' + r.email + ')' }));
        }
    }
    fill(select, ...options);
}
