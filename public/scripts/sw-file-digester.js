self.addEventListener('message', async e => {
    try {
        switch (e.data.type) {
            case "part":
                await this.onPart(e.data.name, e.data.buffer, e.data.offset);
                break;
            case "get-file":
                await this.onGetFile(e.data.name);
                break;
        }
    }
    catch (e) {
        self.postMessage({type: "error", error: e});
    }
})

async function getFileHandle(fileName) {
    const root = await navigator.storage.getDirectory();
    return await root.getFileHandle(fileName, {create: true});
}

async function getAccessHandle(fileName) {
    const fileHandle = await getFileHandle(fileName);

    // Create FileSystemSyncAccessHandle on the file.
    return await fileHandle.createSyncAccessHandle();
}

async function onPart(fileName, buffer, offset) {
    const accessHandle = await getAccessHandle(fileName);

    // Write the message to the end of the file.
    let encodedMessage = new DataView(buffer);
    accessHandle.write(encodedMessage, { at: offset });
    accessHandle.close();

    self.postMessage({type: "part", part: encodedMessage});
    encodedMessage = null;
}

async function onGetFile(fileName) {
    const fileHandle = await getFileHandle(fileName);
    let file = await fileHandle.getFile();

    self.postMessage({type: "file", file: file});
    file = null;
    // Todo: delete file from storage
}