const cacheVersion = 'v10';
const cacheTitle = `pairdrop-cache-${cacheVersion}`;
const urlsToCache = [
    'index.html',
    './',
    'styles.css',
    'scripts/network.js',
    'scripts/ui.js',
    'scripts/util.js',
    'scripts/qrcode.js',
    'scripts/zip.min.js',
    'scripts/NoSleep.min.js',
    'scripts/theme.js',
    'sounds/blop.mp3',
    'images/favicon-96x96.png',
    'images/favicon-96x96-notification.png',
    'images/android-chrome-192x192.png',
    'images/android-chrome-192x192-maskable.png',
    'images/android-chrome-512x512.png',
    'images/android-chrome-512x512-maskable.png',
    'images/apple-touch-icon.png',
];

self.addEventListener('install', function(event) {
  // Perform install steps
    event.waitUntil(
        caches.open(cacheTitle)
            .then(function(cache) {
                return cache.addAll(urlsToCache).then(_ => {
                    console.log('All files cached.');
                });
            })
    );
});

// fetch the resource from the network
const fromNetwork = (request, timeout) =>
    new Promise((fulfill, reject) => {
        const timeoutId = setTimeout(reject, timeout);
        fetch(request).then(response => {
            clearTimeout(timeoutId);
            fulfill(response);
            update(request);
        }, reject);
    });

// fetch the resource from the browser cache
const fromCache = request =>
    caches
        .open(cacheTitle)
        .then(cache =>
            cache
                .match(request)
                .then(matching => matching || cache.match('/offline/'))
        );

// cache the current page to make it available for offline
const update = request =>
    caches
        .open(cacheTitle)
        .then(cache =>
            fetch(request).then(response => {
                cache.put(request, response).then(_ => {
                    console.log("Page successfully cached.")
                })
            })
        );

// general strategy when making a request (eg if online try to fetch it
// from the network with a timeout, if something fails serve from cache)
self.addEventListener('fetch', function(event) {
    if (event.request.method === "POST") {
        // Requests related to Web Share Target.
        event.respondWith(
            (async () => {
                const formData = await event.request.formData();
                const title = formData.get("title");
                const text = formData.get("text");
                const url = formData.get("url");
                const files = formData.get("files");
                let share_url = "/";
                if (files.length > 0) {
                    share_url = "/?share-target=files";
                    const db = await window.indexedDB.open('pairdrop_store');
                    const tx = db.transaction('share_target_files', 'readwrite');
                    const store = tx.objectStore('share_target_files');
                    for (let i=0; i<files.length; i++) {
                        await store.add(files[i]);
                    }
                    await tx.complete
                    db.close()
                } else if (title.length > 0 || text.length > 0 || url.length) {
                    share_url = `/?share-target=text&title=${title}&text=${text}&url=${url}`;
                }
                return Response.redirect(encodeURI(share_url), 303);
            })()
        );
    } else {
        // Regular requests not related to Web Share Target.
        event.respondWith(
            fromNetwork(event.request, 10000).catch(() => fromCache(event.request))
        );
        event.waitUntil(update(event.request));
    }
});


// on activation, we clean up the previously registered service workers
self.addEventListener('activate', evt =>
    evt.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== cacheTitle) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    )
);
