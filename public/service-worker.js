const cacheVersion = 'v1.10.7';
const cacheTitle = `pairdrop-cache-${cacheVersion}`;
const forceFetch = false; // FOR DEVELOPMENT: Set to true to always update assets instead of using cached versions
const relativePathsToCache = [
    './',
    'index.html',
    'manifest.json',
    'styles/styles-main.css',
    'styles/styles-deferred.css',
    'scripts/localization.js',
    'scripts/main.js',
    'scripts/network.js',
    'scripts/no-sleep.min.js',
    'scripts/persistent-storage.js',
    'scripts/qr-code.min.js',
    'scripts/ui.js',
    'scripts/ui-main.js',
    'scripts/util.js',
    'scripts/zip.min.js',
    'sounds/blop.mp3',
    'sounds/blop.ogg',
    'images/favicon-96x96.png',
    'images/favicon-96x96-notification.png',
    'images/android-chrome-192x192.png',
    'images/android-chrome-192x192-maskable.png',
    'images/android-chrome-512x512.png',
    'images/android-chrome-512x512-maskable.png',
    'images/apple-touch-icon.png',
    'lang/ar.json',
    'lang/ca.json',
    'lang/de.json',
    'lang/en.json',
    'lang/es.json',
    'lang/fr.json',
    'lang/id.json',
    'lang/it.json',
    'lang/ja.json',
    'lang/kn.json',
    'lang/nb.json',
    'lang/nl.json',
    'lang/pt-BR.json',
    'lang/ro.json',
    'lang/ru.json',
    'lang/tr.json',
    'lang/zh-CN.json'
];
const relativePathsNotToCache = [
    'config'
]

self.addEventListener('install', function(event) {
  // Perform install steps
    event.waitUntil(
        caches.open(cacheTitle)
            .then(function(cache) {
                return cache
                    .addAll(relativePathsToCache)
                    .then(_ => {
                        console.log('All files cached.');
                    });
            })
    );
});

// fetch the resource from the network
const fromNetwork = (request, timeout) =>
    new Promise((resolve, reject) => {
        const timeoutId = setTimeout(reject, timeout);
        fetch(request)
            .then(response => {
                clearTimeout(timeoutId);
                resolve(response);

                if (doNotCacheRequest(request)) return;

                update(request)
                    .then(() => console.log("Cache successfully updated for", request.url))
                    .catch(reason => console.log("Cache could not be updated for", request.url, "Reason:", reason));
            })
            .catch(error => {
                // Handle any errors that occurred during the fetch
                console.error(`Could not fetch ${request.url}. Are you online?`);
                reject(error);
            });
    });

// fetch the resource from the browser cache
const fromCache = request =>
    caches
        .open(cacheTitle)
        .then(cache =>
            cache.match(request)
        );

const rootUrl = location.href.substring(0, location.href.length - "service-worker.js".length);
const rootUrlLength = rootUrl.length;

const doNotCacheRequest = request => {
    const requestRelativePath = request.url.substring(rootUrlLength);
    return relativePathsNotToCache.indexOf(requestRelativePath) !== -1
};

// cache the current page to make it available for offline
const update = request => new Promise((resolve, reject) => {
    if (doNotCacheRequest(request)) {
        reject("Url is specifically prevented from being cached in the serviceworker.");
        return;
    }
    caches
        .open(cacheTitle)
        .then(cache =>
            fetch(request, {cache: "no-store"})
                .then(response => {
                    cache
                        .put(request, response)
                        .then(() => resolve());
                })
                .catch(reason => reject(reason))
        );
});

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
    }
    else {
        // Regular requests not related to Web Share Target.
        if (forceFetch) {
            event.respondWith(fromNetwork(event.request, 10000));
        }
        else {
            event.respondWith(
                fromCache(event.request)
                    .then(rsp => {
                        // if fromCache resolves to undefined fetch from network instead
                        return rsp || fromNetwork(event.request, 10000);
                    })
            );
        }
    }
});


// on activation, we clean up the previously registered service workers
self.addEventListener('activate', evt => {
        return evt.waitUntil(
            caches.keys()
                .then(cacheNames => {
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
                        if (i === fileObjects.length - 1) resolve(pairDropUrl + '?share_target=files');
                    }
                }
            }
            DBOpenRequest.onerror = _ => {
                resolve(pairDropUrl);
            }
        }
        else {
            let urlArgument = '?share_target=text';

            if (title) urlArgument += `&title=${title}`;
            if (text) urlArgument += `&text=${text}`;
            if (url) urlArgument += `&url=${url}`;

            resolve(pairDropUrl + urlArgument);
        }
    });
}
