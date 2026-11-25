// Service worker: keeps the site's own files on the phone, so the student
// page opens even with no internet (the data itself is cached by Firestore).
const CACHE = 'smartclass-v23';
const FILES = [
    'index.html', 'student.html', 'lecturer.html', 'css/app.css', 'css/themes.css', 'js/theme.js', 'vendor/fonts/rubik-hebrew-400.woff2', 'vendor/fonts/rubik-hebrew-600.woff2', 'vendor/fonts/rubik-hebrew-800.woff2', 'vendor/fonts/rubik-latin-400.woff2', 'vendor/fonts/rubik-latin-600.woff2', 'vendor/fonts/rubik-latin-800.woff2', 'vendor/fonts/secular-one-hebrew-400.woff2', 'vendor/fonts/secular-one-latin-400.woff2', 'vendor/fonts/heebo-hebrew-300.woff2', 'vendor/fonts/heebo-hebrew-400.woff2', 'vendor/fonts/heebo-hebrew-500.woff2', 'vendor/fonts/heebo-hebrew-700.woff2', 'vendor/fonts/heebo-latin-300.woff2', 'vendor/fonts/heebo-latin-400.woff2', 'vendor/fonts/heebo-latin-500.woff2', 'vendor/fonts/heebo-latin-700.woff2',  'vendor/fonts/plex-sans-hebrew-hebrew-400.woff2', 'vendor/fonts/plex-sans-hebrew-hebrew-500.woff2', 'vendor/fonts/plex-sans-hebrew-hebrew-600.woff2', 'vendor/fonts/plex-sans-hebrew-hebrew-700.woff2', 'vendor/fonts/plex-sans-hebrew-latin-400.woff2', 'vendor/fonts/plex-sans-hebrew-latin-500.woff2', 'vendor/fonts/plex-sans-hebrew-latin-600.woff2', 'vendor/fonts/plex-sans-hebrew-latin-700.woff2', 'vendor/fonts/plex-mono-latin-500.woff2', 'manifest.webmanifest', 'icon.svg',
    'vendor/jsQR.js', 'vendor/qrcode.js',
    'js/firebase-config.js', 'js/data/store.js', 'js/data/fake-store.js', 'js/data/firebase-store.js', 'js/data/lan-store.js', 'js/data/sample-class.js',
    'js/core/noisyqr.js', 'js/core/faces.js', 'js/core/guide.js', 'js/core/reactions.js', 'demo/class-sample.jpg', 'demo/class-sample.json', 'js/core/scan-engine.js', 'js/ui/scan-worker.js', 'js/core/quiz.js', 'js/core/schedule.js', 'js/core/archive.js', 'js/core/payload.js', 'js/core/sheet.js', 'js/core/classlist.js', 'js/core/xlsx.js',
    'js/ui/i18n.js', 'js/ui/dom.js', 'js/ui/page.js', 'js/ui/login.js', 'js/ui/student.js', 'js/ui/lecturer.js',
    'js/ui/scanner.js', 'js/ui/join.js', 'js/ui/qr-display.js', 'js/ui/comments.js', 'js/ui/polls.js', 'js/ui/recorder.js', 'js/ui/faceview.js', 'js/ui/quiz-host.js', 'js/ui/quiz-play.js', 'js/ui/export.js',
    'js/ai/ai.js', 'js/ai/gemini.js', 'js/ai/prompts.js', 'js/ai/github.js', 'js/ai/facefind.js', 'js/ai-config.js'
];

self.addEventListener('install', (ev) =>
{
    ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (ev) =>
{
    ev.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});

// Network first (so updates arrive), the cache when offline.
self.addEventListener('fetch', (ev) =>
{
    const url = new URL(ev.request.url);
    if (ev.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/'))
    {
        return;
    }
    ev.respondWith(fetch(ev.request).then((res) =>
    {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(ev.request, copy));
        return res;
    }).catch(() => caches.match(ev.request)));
});
