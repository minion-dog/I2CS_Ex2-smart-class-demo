// =====================================================================
//  theme.js - picks the look before the page paints (classic script)
// =====================================================================
// Loaded in <head> WITHOUT defer, so the theme is set before the first paint
// (no flash of the wrong colours). The topbar button switches light ("soft")
// and dark ("night"); the choice is kept per browser. With no choice the
// phone's own light/dark setting decides.
(function ()
{
    var THEMES = ['soft', 'night'];
    var NAMES = {
        he: { soft: 'בהיר', night: 'כהה' },
        en: { soft: 'Light', night: 'Dark' }
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
        return saved() || (dark ? 'night' : 'soft');
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
