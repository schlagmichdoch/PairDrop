// Map of active file handles and sync access handles keyed by file id
const accessHandles = new Map();
const fileHandles = new Map();

// Strict FIFO sequential queue ensuring all messages (init, chunks, get-file, delete)
// are executed in exact delivery order without race conditions or closed-handle errors.
let messageQueue = Promise.resolve();

self.addEventListener('message', (e) => {
    const message = e.data;
    if (!message || !message.type) return;

    messageQueue = messageQueue
        .then(() => processMessage(message))
        .catch(err => {
            self.postMessage({
                type: 'error',
                id: message.id,
                error: err ? (err.message || String(err)) : 'Unknown worker error'
            });
        });
});

async function processMessage(message) {
    switch (message.type) {
        case 'check-support':
            await checkSupport();
            break;
        case 'init-file':
            await onInitFile(message.id);
            break;
        case 'chunk':
            await onChunk(message.id, message.chunk, message.offset);
            break;
        case 'get-file':
            await onGetFile(message.id);
            break;
        case 'delete-file':
            await onDeleteFile(message.id);
            break;
        case 'clear-directory':
            await onClearDirectory();
            break;
    }
}

async function getDirHandle() {
    return await navigator.storage.getDirectory();
}

async function checkSupport() {
    try {
        if (!navigator.storage || !navigator.storage.getDirectory) {
            self.postMessage({ type: 'support', supported: false });
            return;
        }
        const dir = await getDirHandle();
        const testFileName = `__pairdrop_support_test_${Date.now()}__`;
        const testFile = await dir.getFileHandle(testFileName, { create: true });
        const access = await testFile.createSyncAccessHandle();
        access.close();
        await dir.removeEntry(testFileName);
        self.postMessage({ type: 'support', supported: true });
    } catch (e) {
        self.postMessage({ type: 'support', supported: false });
    }
}

async function onInitFile(id) {
    if (accessHandles.has(id)) {
        self.postMessage({ type: 'file-initialized', id: id });
        return;
    }
    const dir = await getDirHandle();
    const fileHandle = await dir.getFileHandle(id, { create: true });
    const accessHandle = await fileHandle.createSyncAccessHandle();
    fileHandles.set(id, fileHandle);
    accessHandles.set(id, accessHandle);
    self.postMessage({ type: 'file-initialized', id: id });
}

async function onChunk(id, chunk, offset) {
    let accessHandle = accessHandles.get(id);
    if (!accessHandle) {
        const dir = await getDirHandle();
        const fileHandle = await dir.getFileHandle(id, { create: true });
        accessHandle = await fileHandle.createSyncAccessHandle();
        fileHandles.set(id, fileHandle);
        accessHandles.set(id, accessHandle);
    }

    const buffer = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : new Uint8Array(chunk.buffer || chunk);
    accessHandle.write(buffer, { at: offset });
}

async function onGetFile(id) {
    const accessHandle = accessHandles.get(id);
    if (accessHandle) {
        accessHandle.flush();
        accessHandle.close();
        accessHandles.delete(id);
    }

    let fileHandle = fileHandles.get(id);
    if (!fileHandle) {
        const dir = await getDirHandle();
        fileHandle = await dir.getFileHandle(id);
    }

    const file = await fileHandle.getFile();
    self.postMessage({ type: 'file', id: id, file: file });
}

async function onDeleteFile(id) {
    try {
        const accessHandle = accessHandles.get(id);
        if (accessHandle) {
            try { accessHandle.close(); } catch (_) {}
            accessHandles.delete(id);
        }
        fileHandles.delete(id);

        const dir = await getDirHandle();
        await dir.removeEntry(id);
    } catch (_) {
        // File may already be removed or not found
    }
    self.postMessage({ type: 'file-deleted', id: id });
}

async function onClearDirectory() {
    try {
        for (const [id, handle] of accessHandles.entries()) {
            try { handle.close(); } catch (_) {}
        }
        accessHandles.clear();
        fileHandles.clear();

        const dir = await getDirHandle();
        for await (const [name, entry] of dir.entries()) {
            try {
                await dir.removeEntry(name, { recursive: entry.kind === 'directory' });
            } catch (_) {}
        }
    } catch (_) {}
    self.postMessage({ type: 'directory-cleared' });
}
