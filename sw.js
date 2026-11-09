// Service worker: keeps the site's own files on the phone, so the student
// page opens even with no internet (the data itself is cached by Firestore).
const CACHE = 'smartclass-v7';
const FILES = [
    'index.html', 'student.html', 'lecturer.html', 'css/app.css', 'manifest.webmanifest', 'icon.svg',
    'vendor/jsQR.js', 'vendor/qrcode.js',
    'js/firebase-config.js', 'js/data/store.js', 'js/data/fake-store.js', 'js/data/firebase-store.js', 'js/data/lan-store.js', 'js/data/sample-class.js',
    'js/core/noisyqr.js', 'js/core/geo.js', 'js/core/payload.js', 'js/core/sheet.js', 'js/core/classlist.js', 'js/core/xlsx.js',
    'js/ui/i18n.js', 'js/ui/dom.js', 'js/ui/page.js', 'js/ui/login.js', 'js/ui/student.js', 'js/ui/lecturer.js',
    'js/ui/scanner.js', 'js/ui/join.js', 'js/ui/qr-display.js', 'js/ui/comments.js', 'js/ui/polls.js', 'js/ui/recorder.js',
    'js/ai/groq.js', 'js/ai/prompts.js', 'js/ai/github.js', 'js/ai/headcount.js'
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
