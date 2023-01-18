var CACHE_NAME = 'pairdrop-cache-v3';
var urlsToCache = [
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
  'images/favicon-96x96.png'
];

self.addEventListener('install', function(event) {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});


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
                console.debug(title)
                console.debug(text)
                console.debug(url)
                console.debug(files)
                let share_url = "/";
                if (files.length > 0) {
                    // Save to Cache?
                    caches.open("share_target_files")
                        .then(cache => {
                            cache.addAll(files)
                            console.debug("files added to cache")
                        });
                    share_url = "/?share-target=files";
                } else if (title.length > 0 || text.length > 0 || url.length) {
                    share_url = `/?share-target=text&title=${title}&text=${text}&url=${url}`;
                }
                return Response.redirect(encodeURI(share_url), 303);
            })()
        );
    } else {
        // Regular requests not related to Web Share Target.
        event.respondWith(
            caches.match(event.request)
                .then(function (response) {
                        // Cache hit - return response
                        if (response) {
                            return response;
                        }
                        return fetch(event.request);
                    }
                )
        );
    }
});


self.addEventListener('activate', function(event) {
  console.log('Updating Service Worker...')
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          // Return true if you want to remove this cache,
          // but remember that caches are shared across
          // the whole origin
          return true
        }).map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    })
  );
});
