const cacheVersion = 'v1.9.0';
const cacheTitle = `pairdrop-cache-${cacheVersion}`;
const urlsToCache = [
    './',
    'index.html',
    'manifest.json',
    'styles.css',
    'scripts/localization.js',
    'scripts/network.js',
    'scripts/NoSleep.min.js',
    'scripts/QRCode.min.js',
    'scripts/theme.js',
    'scripts/ui.js',
    'scripts/util.js',
    'scripts/zip.min.js',
    'sounds/blop.mp3',
    'images/favicon-96x96.png',
    'images/favicon-96x96-notification.png',
    'images/android-chrome-192x192.png',
    'images/android-chrome-192x192-maskable.png',
    'images/android-chrome-512x512.png',
    'images/android-chrome-512x512-maskable.png',
    'images/apple-touch-icon.png',
    'lang/ar.json',
    'lang/de.json',
    'lang/en.json',
    'lang/es.json',
    'lang/fr.json',
    'lang/id.json',
    'lang/it.json',
    'lang/ja.json',
    'lang/nb.json',
    'lang/nl.json',
    'lang/ro.json',
    'lang/ru.json',
    'lang/zh-CN.json'
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
            update(request).then(() => console.log("Cache successfully updated for", request.url));
        }, reject);
    });

// fetch the resource from the browser cache
const fromCache = request =>
    caches
        .open(cacheTitle)
        .then(cache =>
            cache.match(request)
        );

// cache the current page to make it available for offline
const update = request =>
    caches
        .open(cacheTitle)
        .then(cache =>
            fetch(request)
                .then(async response => {
                    await cache.put(request, response);
                })
                .catch(() => console.log(`Cache could not be updated. ${request.url}`))
        );

// general strategy when making a request (eg if online try to fetch it
// from cache, if something fails fetch from network. Update cache everytime files are fetched.
// This way files should only be fetched if cacheVersion is changed
self.addEventListener('fetch', function(event) {
    if (event.request.method === "POST") {
        // Requests related to Web Share Target.
        event.respondWith((async () => {
            const share_url = await evaluateRequestData(event.request);
            return Response.redirect(encodeURI(share_url), 302);
        })());
    } else {
        // Regular requests not related to Web Share Target.

        // FOR DEVELOPMENT: Comment in next line to always update assets instead of using cached versions
        // event.respondWith(fromNetwork(event.request, 10000));return;
        event.respondWith(
            fromCache(event.request).then(rsp => {
                // if fromCache resolves to undefined fetch from network instead
                return rsp || fromNetwork(event.request, 10000);
            })
        );
    }
});


// on activation, we clean up the previously registered service workers
self.addEventListener('activate', evt => {
        return evt.waitUntil(
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
    }
);

const evaluateRequestData = function (request) {
    return new Promise(async (resolve) => {
        const formData = await request.formData();
        const title = formData.get("title");
        const text = formData.get("text");
        const url = formData.get("url");
        const files = formData.getAll("allfiles");

        const pairDropUrl = request.url;

        if (files && files.length > 0) {
            let fileObjects = [];
            for (let i=0; i<files.length; i++) {
                fileObjects.push({
                    name: files[i].name,
                    buffer: await files[i].arrayBuffer()
                });
            }

            const DBOpenRequest = indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = e => {
                const db = e.target.result;
                for (let i = 0; i < fileObjects.length; i++) {
                    const transaction = db.transaction('share_target_files', 'readwrite');
                    const objectStore = transaction.objectStore('share_target_files');

                    const objectStoreRequest = objectStore.add(fileObjects[i]);
                    objectStoreRequest.onsuccess = _ => {
                        if (i === fileObjects.length - 1) resolve(pairDropUrl + '?share-target=files');
                    }
                }
            }
            DBOpenRequest.onerror = _ => {
                resolve(pairDropUrl);
            }
        } else {
            let urlArgument = '?share-target=text';

            if (title) urlArgument += `&title=${title}`;
            if (text) urlArgument += `&text=${text}`;
            if (url) urlArgument += `&url=${url}`;

            resolve(pairDropUrl + urlArgument);
        }
    });
}
