// Polyfill for Navigator.clipboard.writeText
if (!navigator.clipboard) {
    navigator.clipboard = {
        writeText: text => {

            // A <span> contains the text to copy
            const span = document.createElement('span');
            span.textContent = text;
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

const zipper = (() => {

    let zipWriter;
    return {
        addFile(file, options) {
            if (!zipWriter) {
                zipWriter = new zip.ZipWriter(new zip.BlobWriter("application/zip"), { bufferedWrite: true, level: 0 });
            }
            return zipWriter.add(file.name, new zip.BlobReader(file), options);
        },
        async getBlobURL() {
            if (zipWriter) {
                const blobURL = URL.createObjectURL(await zipWriter.close());
                zipWriter = null;
                return blobURL;
            } else {
                throw new Error("Zip file closed");
            }
        },
        async getZipFile(filename = "archive.zip") {
            if (zipWriter) {
                const file = new File([await zipWriter.close()], filename, {type: "application/zip"});
                zipWriter = null;
                return file;
            } else {
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
