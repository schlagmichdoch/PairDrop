self.addEventListener('message', async e => {
    try {
        switch (e.data.type) {
            case "check-support":
                await checkSupport();
                break;
            case "part":
                await onPart(e.data.name, e.data.buffer, e.data.offset);
                break;
            case "get-file":
                await onGetFile(e.data.name);
                break;
            case "delete-file":
                await onDeleteFile(e.data.name);
                break;
        }
    }
    catch (e) {
        self.postMessage({type: "error", error: e});
    }
})

async function checkSupport() {
    try {
        await getAccessHandle("test.txt");
        self.postMessage({type: "support", supported: true});
    }
    catch (e) {
        self.postMessage({type: "support", supported: false});
    }
}

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

    // Always close FileSystemSyncAccessHandle if done.
    accessHandle.close();    accessHandle.close();

    self.postMessage({type: "part", part: encodedMessage});
    encodedMessage = null;
}

async function onGetFile(fileName) {
    const fileHandle = await getFileHandle(fileName);
    let file = await fileHandle.getFile();

    self.postMessage({type: "file", file: file});
}

async function onDeleteFile(fileName) {
    const accessHandle = await getAccessHandle(fileName);

    // Truncate the file to 0 bytes
    accessHandle.truncate(0);

    // Persist changes to disk.
    accessHandle.flush();

    // Always close FileSystemSyncAccessHandle if done.
    accessHandle.close();

    self.postMessage({type: "file-deleted"});
}