self.accessHandle = undefined;
self.messageQueue = [];
self.busy = false;


self.addEventListener('message', async e => {
    // Put message into queue if busy
    if (self.busy) {
        self.messageQueue.push(e.data);
        return;
    }

    await digestMessage(e.data);
});

async function digestMessage(message) {
    self.busy = true;
    try {
        switch (message.type) {
            case "check-support":
                await checkSupport();
                break;
            case "chunk":
                await onChunk(message.id, message.chunk, message.offset);
                break;
            case "get-file":
                await onGetFile(message.id);
                break;
            case "delete-file":
                await onDeleteFile(message.id);
                break;
            case "clear-directory":
                await onClearDirectory();
                break;
        }
    }
    catch (e) {
        self.postMessage({type: "error", error: e});
    }

    // message is digested. Digest next message.
    await messageDigested();
}

async function messageDigested() {
    if (!self.messageQueue.length) {
        // no chunk in queue -> set flag to false and stop
        this.busy = false;
        return;
    }

    // Digest next message in queue
    await this.digestMessage(self.messageQueue.pop());
}

async function checkSupport() {
    try {
        const accessHandle = await getAccessHandle("test");
        self.postMessage({type: "support", supported: true});
        accessHandle.close();
    }
    catch (e) {
        self.postMessage({type: "support", supported: false});
    }
}

async function getFileHandle(id) {
    const dirHandle = await navigator.storage.getDirectory();
    return await dirHandle.getFileHandle(id, {create: true});
}

async function getAccessHandle(id) {
    const fileHandle = await getFileHandle(id);

    if (!self.accessHandle) {
        // Create FileSystemSyncAccessHandle on the file.
        self.accessHandle = await fileHandle.createSyncAccessHandle();
    }

    return self.accessHandle;
}

async function onChunk(id, chunk, offset) {
    const accessHandle = await getAccessHandle(id);

    // Write the message to the end of the file.
    let encodedMessage = new DataView(chunk);
    accessHandle.write(encodedMessage, { at: offset });

    self.postMessage({type: "chunk-written", offset: offset});
}

async function onGetFile(id) {
    const fileHandle = await getFileHandle(id);
    let file = await fileHandle.getFile();

    self.postMessage({type: "file", file: file});
}

async function onDeleteFile(id) {
    const accessHandle = await getAccessHandle(id);

    // Truncate the file to 0 bytes
    accessHandle.truncate(0);

    // Persist changes to disk.
    accessHandle.flush();

    // Always close FileSystemSyncAccessHandle if done.
    accessHandle.close();

    self.postMessage({type: "file-deleted", id: id});
}

async function onClearDirectory() {
    const dirHandle = await navigator.storage.getDirectory();

    // Iterate through directory entries and truncate all entries to 0
    for await (const [id, fileHandle] of dirHandle.entries()) {
        const accessHandle = await fileHandle.createSyncAccessHandle();

        // Truncate the file to 0 bytes
        accessHandle.truncate(0);

        // Persist changes to disk.
        accessHandle.flush();

        // Always close FileSystemSyncAccessHandle if done.
        accessHandle.close();
    }
}