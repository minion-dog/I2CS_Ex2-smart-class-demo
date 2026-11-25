// =====================================================================
//  theme.js - picks the look before the page paints (classic script)
// =====================================================================
// Loaded in <head> WITHOUT defer, so the theme is set before the first paint
// (no flash of the wrong colours). The topbar button cycles the four themes;
// the choice is kept per browser. With no choice: a phone in dark mode gets
// "midnight", otherwise "workshop".
(function ()
{
    var THEMES = ['workshop', 'clay', 'glass', 'midnight'];
    var NAMES = {
        he: { workshop: 'סדנה', clay: 'פלסטלינה', glass: 'זכוכית', midnight: 'חצות' },
        en: { workshop: 'Workshop', clay: 'Clay', glass: 'Glass', midnight: 'Midnight' }
    };
    var KEY = 'smartclass-theme';

    function saved()
    {
        try
        {
            var t = localStorage.getItem(KEY);
            return THEMES.indexOf(t) >= 0 ? t : null;
        }
        catch (e)
        {
            return null;
        }
    }

    function initial()
    {
        var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return saved() || (dark ? 'midnight' : 'workshop');
    }

    function apply(t)
    {
        document.documentElement.setAttribute('data-theme', t);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta)
        {
            meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff');
        }
        var label = document.getElementById('theme-name');
        if (label)
        {
            var lang = document.documentElement.lang === 'en' ? 'en' : 'he';
            label.textContent = NAMES[lang][t];
        }
    }

    apply(initial());

    document.addEventListener('DOMContentLoaded', function ()
    {
        apply(document.documentElement.getAttribute('data-theme'));
        var btn = document.getElementById('theme-btn');
        if (!btn)
        {
            return;
        }
        btn.addEventListener('click', function ()
        {
            var now = document.documentElement.getAttribute('data-theme');
            var next = THEMES[(THEMES.indexOf(now) + 1) % THEMES.length];
            try
            {
                localStorage.setItem(KEY, next);
            }
            catch (e)
            {
                // private window: the theme still changes for this page
            }
            apply(next);
        });
    });
})();
