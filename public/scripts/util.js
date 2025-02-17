// Polyfill for Navigator.clipboard.writeText
if (!navigator.clipboard) {
    navigator.clipboard = {
        writeText: text => {

            // A <span> contains the text to copy
            const span = document.createElement('span');
            span.innerText = text;
            span.style.whiteSpace = 'pre'; // Preserve consecutive spaces and newlines

            // Paint the span outside the viewport
            span.style.position = 'absolute';
            span.style.left = '-9999px';
            span.style.top = '-9999px';

            const win = window;
            const selection = win.getSelection();
            win.document.body.appendChild(span);

            const range = win.document.createRange();
            selection.removeAllRanges();
            range.selectNode(span);
            selection.addRange(range);

            let success = false;
            try {
                success = win.document.execCommand('copy');
            } catch (err) {
                return Promise.error();
            }

            selection.removeAllRanges();
            span.remove();

            return Promise.resolve();
        }
    }
}

// Polyfills
window.isRtcSupported = !!(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection);

window.hiddenProperty = 'hidden' in document
    ? 'hidden'
    : 'webkitHidden' in document
        ? 'webkitHidden'
        : 'mozHidden' in document
            ? 'mozHidden'
            : null;

window.visibilityChangeEvent = 'visibilitychange' in document
    ? 'visibilitychange'
    : 'webkitvisibilitychange' in document
        ? 'webkitvisibilitychange'
        : 'mozvisibilitychange' in document
            ? 'mozvisibilitychange'
            : null;

window.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
window.android = /android/i.test(navigator.userAgent);
window.isMobile = window.iOS || window.android;


// Helper functions
const zipper = (() => {

    let zipWriter;
    return {
        createNewZipWriter() {
            zipWriter = new zip.ZipWriter(new zip.BlobWriter("application/zip"), { bufferedWrite: true, level: 0 });
        },
        addFile(file, options) {
            return zipWriter.add(file.name, new zip.BlobReader(file), options);
        },
        async getBlobURL() {
            if (zipWriter) {
                const blobURL = URL.createObjectURL(await zipWriter.close());
                zipWriter = null;
                return blobURL;
            }
            else {
                throw new Error("Zip file closed");
            }
        },
        async getZipFile(filename = "archive.zip") {
            if (zipWriter) {
                const file = new File([await zipWriter.close()], filename, {type: "application/zip"});
                zipWriter = null;
                return file;
            }
            else {
                throw new Error("Zip file closed");
            }
        },
        async getEntries(file, options) {
            return await (new zip.ZipReader(new zip.BlobReader(file))).getEntries(options);
        },
        async getData(entry, options) {
            return await entry.getData(new zip.BlobWriter(), options);
        },
    };

})();

const mime = (() => {

    const suffixToMimeMap = {
        "cpl": "application/cpl+xml",
        "gpx": "application/gpx+xml",
        "gz": "application/gzip",
        "jar": "application/java-archive",
        "war": "application/java-archive",
        "ear": "application/java-archive",
        "class": "application/java-vm",
        "js": "application/javascript",
        "mjs": "application/javascript",
        "json": "application/json",
        "map": "application/json",
        "webmanifest": "application/manifest+json",
        "doc": "application/msword",
        "dot": "application/msword",
        "wiz": "application/msword",
        "bin": "application/octet-stream",
        "dms": "application/octet-stream",
        "lrf": "application/octet-stream",
        "mar": "application/octet-stream",
        "so": "application/octet-stream",
        "dist": "application/octet-stream",
        "distz": "application/octet-stream",
        "pkg": "application/octet-stream",
        "bpk": "application/octet-stream",
        "dump": "application/octet-stream",
        "elc": "application/octet-stream",
        "deploy": "application/octet-stream",
        "img": "application/octet-stream",
        "msp": "application/octet-stream",
        "msm": "application/octet-stream",
        "buffer": "application/octet-stream",
        "oda": "application/oda",
        "oxps": "application/oxps",
        "pdf": "application/pdf",
        "asc": "application/pgp-signature",
        "sig": "application/pgp-signature",
        "prf": "application/pics-rules",
        "p7c": "application/pkcs7-mime",
        "cer": "application/pkix-cert",
        "ai": "application/postscript",
        "eps": "application/postscript",
        "ps": "application/postscript",
        "apk": "application/vnd.android.package-archive",
        "m3u8": "application/vnd.apple.mpegurl",
        "pkpass": "application/vnd.apple.pkpass",
        "kml": "application/vnd.google-earth.kml+xml",
        "kmz": "application/vnd.google-earth.kmz",
        "cab": "application/vnd.ms-cab-compressed",
        "xls": "application/vnd.ms-excel",
        "xlm": "application/vnd.ms-excel",
        "xla": "application/vnd.ms-excel",
        "xlc": "application/vnd.ms-excel",
        "xlt": "application/vnd.ms-excel",
        "xlw": "application/vnd.ms-excel",
        "msg": "application/vnd.ms-outlook",
        "ppt": "application/vnd.ms-powerpoint",
        "pot": "application/vnd.ms-powerpoint",
        "ppa": "application/vnd.ms-powerpoint",
        "pps": "application/vnd.ms-powerpoint",
        "pwz": "application/vnd.ms-powerpoint",
        "mpp": "application/vnd.ms-project",
        "mpt": "application/vnd.ms-project",
        "xps": "application/vnd.ms-xpsdocument",
        "odb": "application/vnd.oasis.opendocument.database",
        "ods": "application/vnd.oasis.opendocument.spreadsheet",
        "odt": "application/vnd.oasis.opendocument.text",
        "osm": "application/vnd.openstreetmap.data+xml",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pcap": "application/vnd.tcpdump.pcap",
        "cap": "application/vnd.tcpdump.pcap",
        "dmp": "application/vnd.tcpdump.pcap",
        "wpd": "application/vnd.wordperfect",
        "wasm": "application/wasm",
        "7z": "application/x-7z-compressed",
        "dmg": "application/x-apple-diskimage",
        "bcpio": "application/x-bcpio",
        "torrent": "application/x-bittorrent",
        "cbr": "application/x-cbr",
        "cba": "application/x-cbr",
        "cbt": "application/x-cbr",
        "cbz": "application/x-cbr",
        "cb7": "application/x-cbr",
        "vcd": "application/x-cdlink",
        "crx": "application/x-chrome-extension",
        "cpio": "application/x-cpio",
        "csh": "application/x-csh",
        "deb": "application/x-debian-package",
        "udeb": "application/x-debian-package",
        "dvi": "application/x-dvi",
        "arc": "application/x-freearc",
        "gtar": "application/x-gtar",
        "hdf": "application/x-hdf",
        "h5": "application/x-hdf5",
        "php": "application/x-httpd-php",
        "iso": "application/x-iso9660-image",
        "key": "application/x-iwork-keynote-sffkey",
        "numbers": "application/x-iwork-numbers-sffnumbers",
        "pages": "application/x-iwork-pages-sffpages",
        "latex": "application/x-latex",
        "run": "application/x-makeself",
        "mif": "application/x-mif",
        "lnk": "application/x-ms-shortcut",
        "mdb": "application/x-msaccess",
        "exe": "application/x-msdownload",
        "dll": "application/x-msdownload",
        "com": "application/x-msdownload",
        "bat": "application/x-msdownload",
        "msi": "application/x-msdownload",
        "pub": "application/x-mspublisher",
        "cdf": "application/x-netcdf",
        "nc": "application/x-netcdf",
        "pl": "application/x-perl",
        "pm": "application/x-perl",
        "prc": "application/x-pilot",
        "pdb": "application/x-pilot",
        "p12": "application/x-pkcs12",
        "pfx": "application/x-pkcs12",
        "ram": "application/x-pn-realaudio",
        "pyc": "application/x-python-code",
        "pyo": "application/x-python-code",
        "rar": "application/x-rar-compressed",
        "rpm": "application/x-redhat-package-manager",
        "sh": "application/x-sh",
        "shar": "application/x-shar",
        "swf": "application/x-shockwave-flash",
        "sql": "application/x-sql",
        "srt": "application/x-subrip",
        "sv4cpio": "application/x-sv4cpio",
        "sv4crc": "application/x-sv4crc",
        "gam": "application/x-tads",
        "tar": "application/x-tar",
        "tcl": "application/x-tcl",
        "tex": "application/x-tex",
        "roff": "application/x-troff",
        "t": "application/x-troff",
        "tr": "application/x-troff",
        "man": "application/x-troff-man",
        "me": "application/x-troff-me",
        "ms": "application/x-troff-ms",
        "ustar": "application/x-ustar",
        "src": "application/x-wais-source",
        "xpi": "application/x-xpinstall",
        "xhtml": "application/xhtml+xml",
        "xht": "application/xhtml+xml",
        "xsl": "application/xml",
        "rdf": "application/xml",
        "wsdl": "application/xml",
        "xpdl": "application/xml",
        "zip": "application/zip",
        "3gp": "audio/3gp",
        "3gpp": "audio/3gpp",
        "3g2": "audio/3gpp2",
        "3gpp2": "audio/3gpp2",
        "aac": "audio/aac",
        "adts": "audio/aac",
        "loas": "audio/aac",
        "ass": "audio/aac",
        "au": "audio/basic",
        "snd": "audio/basic",
        "mid": "audio/midi",
        "midi": "audio/midi",
        "kar": "audio/midi",
        "rmi": "audio/midi",
        "mpga": "audio/mpeg",
        "mp2": "audio/mpeg",
        "mp2a": "audio/mpeg",
        "mp3": "audio/mpeg",
        "m2a": "audio/mpeg",
        "m3a": "audio/mpeg",
        "oga": "audio/ogg",
        "ogg": "audio/ogg",
        "spx": "audio/ogg",
        "opus": "audio/opus",
        "aif": "audio/x-aiff",
        "aifc": "audio/x-aiff",
        "aiff": "audio/x-aiff",
        "flac": "audio/x-flac",
        "m4a": "audio/x-m4a",
        "m3u": "audio/x-mpegurl",
        "wma": "audio/x-ms-wma",
        "ra": "audio/x-pn-realaudio",
        "wav": "audio/x-wav",
        "otf": "font/otf",
        "ttf": "font/ttf",
        "woff": "font/woff",
        "woff2": "font/woff2",
        "emf": "image/emf",
        "gif": "image/gif",
        "heic": "image/heic",
        "heif": "image/heif",
        "ief": "image/ief",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "pict": "image/pict",
        "pct": "image/pict",
        "pic": "image/pict",
        "png": "image/png",
        "svg": "image/svg+xml",
        "svgz": "image/svg+xml",
        "tif": "image/tiff",
        "tiff": "image/tiff",
        "psd": "image/vnd.adobe.photoshop",
        "djvu": "image/vnd.djvu",
        "djv": "image/vnd.djvu",
        "dwg": "image/vnd.dwg",
        "dxf": "image/vnd.dxf",
        "dds": "image/vnd.ms-dds",
        "webp": "image/webp",
        "3ds": "image/x-3ds",
        "ras": "image/x-cmu-raster",
        "ico": "image/x-icon",
        "bmp": "image/x-ms-bmp",
        "pnm": "image/x-portable-anymap",
        "pbm": "image/x-portable-bitmap",
        "pgm": "image/x-portable-graymap",
        "ppm": "image/x-portable-pixmap",
        "rgb": "image/x-rgb",
        "tga": "image/x-tga",
        "xbm": "image/x-xbitmap",
        "xpm": "image/x-xpixmap",
        "xwd": "image/x-xwindowdump",
        "eml": "message/rfc822",
        "mht": "message/rfc822",
        "mhtml": "message/rfc822",
        "nws": "message/rfc822",
        "obj": "model/obj",
        "stl": "model/stl",
        "dae": "model/vnd.collada+xml",
        "ics": "text/calendar",
        "ifb": "text/calendar",
        "css": "text/css",
        "csv": "text/csv",
        "html": "text/html",
        "htm": "text/html",
        "shtml": "text/html",
        "markdown": "text/markdown",
        "md": "text/markdown",
        "txt": "text/plain",
        "text": "text/plain",
        "conf": "text/plain",
        "def": "text/plain",
        "list": "text/plain",
        "log": "text/plain",
        "in": "text/plain",
        "ini": "text/plain",
        "rtx": "text/richtext",
        "rtf": "text/rtf",
        "tsv": "text/tab-separated-values",
        "c": "text/x-c",
        "cc": "text/x-c",
        "cxx": "text/x-c",
        "cpp": "text/x-c",
        "h": "text/x-c",
        "hh": "text/x-c",
        "dic": "text/x-c",
        "java": "text/x-java-source",
        "lua": "text/x-lua",
        "py": "text/x-python",
        "etx": "text/x-setext",
        "sgm": "text/x-sgml",
        "sgml": "text/x-sgml",
        "vcf": "text/x-vcard",
        "xml": "text/xml",
        "xul": "text/xul",
        "yaml": "text/yaml",
        "yml": "text/yaml",
        "ts": "video/mp2t",
        "mp4": "video/mp4",
        "mp4v": "video/mp4",
        "mpg4": "video/mp4",
        "mpeg": "video/mpeg",
        "m1v": "video/mpeg",
        "mpa": "video/mpeg",
        "mpe": "video/mpeg",
        "mpg": "video/mpeg",
        "mov": "video/quicktime",
        "qt": "video/quicktime",
        "webm": "video/webm",
        "flv": "video/x-flv",
        "m4v": "video/x-m4v",
        "asf": "video/x-ms-asf",
        "asx": "video/x-ms-asf",
        "vob": "video/x-ms-vob",
        "wmv": "video/x-ms-wmv",
        "avi": "video/x-msvideo",
        "*": "video/x-sgi-movie",
        "kdbx": "application/x-keepass2"
    }

    return {
        guessMimeByFilename(filename) {
            const split = filename.split('.');
            if (split.length === 1) {
                // Filename does not include suffix
                return false;
            }
            const suffix = split[split.length - 1].toLowerCase();
            return suffixToMimeMap[suffix];
        },
        addMissingMimeTypesToFiles(files) {
            // if filetype is empty guess via suffix otherwise leave unchanged
            for (let i = 0; i < files.length; i++) {
                if (!files[i].type) {
                    files[i] = new File([files[i]], files[i].name, {type: mime.guessMimeByFilename(files[i].name) || "application/octet-stream"});
                }
            }
            return files;
        }
    };

})();

/*
    cyrb53 (c) 2018 bryc (github.com/bryc)
    A fast and simple hash function with decent collision resistance.
    Largely inspired by MurmurHash2/3, but with a focus on speed/simplicity.
    Public domain. Attribution appreciated.
*/
const cyrb53 = function(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1>>>0);
};

function onlyUnique (value, index, array) {
    return array.indexOf(value) === index;
}

function getUrlWithoutArguments() {
    return `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
}

function changeFavicon(src) {
    document.querySelector('[rel="icon"]').href = src;
    document.querySelector('[rel="shortcut icon"]').href = src;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    let bytes = new Uint8Array(buffer);
    let len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa( binary );
}

function base64ToArrayBuffer(base64) {
    let binary_string = window.atob(base64);
    let len = binary_string.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

async function fileToBlob (file) {
    return new Blob([new Uint8Array(await file.arrayBuffer())], {type: file.type});
}

function getThumbnailAsDataUrl(file, width = undefined, height = undefined, quality = 0.7) {
    return new Promise(async (resolve, reject) => {
        try {
            if (file.type === "image/heif" || file.type === "image/heic") {
                // hotfix: Converting heic images taken on iOS 18 crashes page. Waiting for PR #350
                reject(new Error(`Hotfix: Converting of HEIC/HEIF images currently disabled.`));
                return;
                // // browsers can't show heic files --> convert to jpeg before creating thumbnail
                // let blob = await fileToBlob(file);
                // file = await heic2any({
                //     blob,
                //     toType: "image/jpeg",
                //     quality: quality
                // });
            }

            let imageUrl = URL.createObjectURL(file);

            let image = new Image();
            image.src = imageUrl;

            await waitUntilImageIsLoaded(imageUrl);

            let imageWidth = image.width;
            let imageHeight = image.height;
            let canvas = document.createElement('canvas');

            // resize the canvas and draw the image data into it
            if (width && height) {
                canvas.width = width;
                canvas.height = height;
            }
            else if (width) {
                canvas.width = width;
                canvas.height = Math.floor(imageHeight * width / imageWidth)
            }
            else if (height) {
                canvas.width = Math.floor(imageWidth * height / imageHeight);
                canvas.height = height;
            }
            else {
                canvas.width = imageWidth;
                canvas.height = imageHeight
            }

            let ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            let dataUrl = canvas.toDataURL("image/jpeg", quality);
            resolve(dataUrl);
        } catch (e) {
            console.error(e);
            reject(new Error(`Could not create an image thumbnail from type ${file.type}`));
        }
    })
}

// Resolves returned promise when image is loaded and throws error if image cannot be shown
function waitUntilImageIsLoaded(imageUrl, timeout = 10000) {
    return new Promise((resolve, reject) => {
        let image = new Image();
        image.src = imageUrl;

        const onLoad = () => {
            cleanup();
            resolve();
        };

        const onError = () => {
            cleanup();
            reject(new Error('Image failed to load.'));
        };

        const cleanup = () => {
            clearTimeout(timeoutId);
            image.onload = null;
            image.onerror = null;
            URL.revokeObjectURL(imageUrl);
        };

        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Image loading timed out.'));
        }, timeout);

        image.onload = onLoad;
        image.onerror = onError;
    });
}

async function decodeBase64Files(base64) {
    if (!base64) throw new Error('Base64 is empty');

    let bstr = atob(base64), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }

    const zipBlob = new File([u8arr], 'archive.zip');

    let files = [];
    const zipEntries = await zipper.getEntries(zipBlob);
    for (let i = 0; i < zipEntries.length; i++) {
        let fileBlob = await zipper.getData(zipEntries[i]);
        files.push(new File([fileBlob], zipEntries[i].filename));
    }
    return files
}

async function decodeBase64Text(base64) {
    if (!base64) throw new Error('Base64 is empty');

    return decodeURIComponent(escape(window.atob(base64)))
}

function isUrlValid(url) {
    try {
        new URL(url);
        return true;
    }
    catch (e) {
        return false;
    }
}