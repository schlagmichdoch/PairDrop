class ServerConnection {

    constructor() {
        Events.on('pagehide', _ => this._disconnect());
        Events.on(window.visibilityChangeEvent, _ => this._onVisibilityChange());

        if (navigator.connection) {
            navigator.connection.addEventListener('change', _ => this._reconnect());
        }

        Events.on('room-secrets', e => this.send({ type: 'room-secrets', roomSecrets: e.detail }));
        Events.on('join-ip-room', _ => this.send({ type: 'join-ip-room'}));
        Events.on('room-secrets-deleted', e => this.send({ type: 'room-secrets-deleted', roomSecrets: e.detail}));
        Events.on('regenerate-room-secret', e => this.send({ type: 'regenerate-room-secret', roomSecret: e.detail}));
        Events.on('pair-device-initiate', _ => this._onPairDeviceInitiate());
        Events.on('pair-device-join', e => this._onPairDeviceJoin(e.detail));
        Events.on('pair-device-cancel', _ => this.send({ type: 'pair-device-cancel' }));

        Events.on('create-public-room', _ => this._onCreatePublicRoom());
        Events.on('join-public-room', e => this._onJoinPublicRoom(e.detail.roomId, e.detail.createIfInvalid));
        Events.on('leave-public-room', _ => this._onLeavePublicRoom());

        Events.on('offline', _ => clearTimeout(this._reconnectTimer));
        Events.on('online', _ => this._connect());

        this._getConfig().then(() => this._connect());
    }

    _getConfig() {
        Logger.log("Loading config...")
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.addEventListener("load", () => {
                if (xhr.status === 200) {
                    // Config received
                    let config = JSON.parse(xhr.responseText);
                    Logger.log("Config loaded:", config)
                    window._config = config;
                    Events.fire('config-loaded');
                    resolve()
                } else if (xhr.status < 200 || xhr.status >= 300) {
                    retry(xhr);
                }
            })

            xhr.addEventListener("error", _ => {
                retry(xhr);
            });

            function retry(request) {
                setTimeout(function () {
                    openAndSend(request)
                }, 1000)
            }

            function openAndSend() {
                xhr.open('GET', 'config');
                xhr.send();
            }

            openAndSend(xhr);
        })
    }

    _setWsConfig(wsConfig) {
        this._wsConfig = wsConfig;
        Events.fire('ws-config', wsConfig);
    }

    _connect() {
        clearTimeout(this._reconnectTimer);
        if (this._isConnected() || this._isConnecting()) return;
        if (this._isReconnect) {
            Events.fire('notify-user', {
                message: Localization.getTranslation("notifications.connecting"),
                persistent: true
            });
        }
        const ws = new WebSocket(this._endpoint());
        ws.binaryType = 'arraybuffer';
        ws.onopen = _ => this._onOpen();
        ws.onmessage = e => this._onMessage(e.data);
        ws.onclose = _ => this._onDisconnect();
        ws.onerror = e => this._onError(e);
        this._socket = ws;
    }

    _onOpen() {
        Logger.log('WS: server connected');
        Events.fire('ws-connected');
        if (this._isReconnect) {
            Events.fire('notify-user', Localization.getTranslation("notifications.connected"));
        }
    }

    _onPairDeviceInitiate() {
        if (!this._isConnected()) {
            Events.fire('notify-user', Localization.getTranslation("notifications.online-requirement-pairing"));
            return;
        }
        this.send({ type: 'pair-device-initiate' });
    }

    _onPairDeviceJoin(pairKey) {
        if (!this._isConnected()) {
            // Todo: instead use pending outbound ws queue
            setTimeout(() => this._onPairDeviceJoin(pairKey), 1000);
            return;
        }
        this.send({ type: 'pair-device-join', pairKey: pairKey });
    }

    _onCreatePublicRoom() {
        if (!this._isConnected()) {
            Events.fire('notify-user', Localization.getTranslation("notifications.online-requirement-public-room"));
            return;
        }
        this.send({ type: 'create-public-room' });
    }

    _onJoinPublicRoom(roomId, createIfInvalid) {
        if (!this._isConnected()) {
            setTimeout(() => this._onJoinPublicRoom(roomId), 1000);
            return;
        }
        this.send({ type: 'join-public-room', publicRoomId: roomId, createIfInvalid: createIfInvalid });
    }

    _onLeavePublicRoom() {
        if (!this._isConnected()) {
            setTimeout(() => this._onLeavePublicRoom(), 1000);
            return;
        }
        this.send({ type: 'leave-public-room' });
    }

    _onMessage(message) {
        const messageJSON = JSON.parse(message);
        if (messageJSON.type !== 'ping' && messageJSON.type !== 'ws-relay') {
            Logger.debug('WS receive:', messageJSON);
        }
        switch (messageJSON.type) {
            case 'ws-config':
                this._setWsConfig(messageJSON.wsConfig);
                break;
            case 'peers':
                this._onPeers(messageJSON);
                break;
            case 'peer-joined':
                Events.fire('peer-joined', messageJSON);
                break;
            case 'peer-left':
                Events.fire('peer-left', messageJSON);
                break;
            case 'signal':
                Events.fire('signal', messageJSON);
                break;
            case 'ping':
                this.send({ type: 'pong' });
                break;
            case 'display-name':
                this._onDisplayName(messageJSON);
                break;
            case 'pair-device-initiated':
                Events.fire('pair-device-initiated', messageJSON);
                break;
            case 'pair-device-joined':
                Events.fire('pair-device-joined', messageJSON);
                break;
            case 'pair-device-join-key-invalid':
                Events.fire('pair-device-join-key-invalid');
                break;
            case 'pair-device-canceled':
                Events.fire('pair-device-canceled', messageJSON.pairKey);
                break;
            case 'join-key-rate-limit':
                Events.fire('notify-user', Localization.getTranslation("notifications.rate-limit-join-key"));
                break;
            case 'secret-room-deleted':
                Events.fire('secret-room-deleted', messageJSON.roomSecret);
                break;
            case 'room-secret-regenerated':
                Events.fire('room-secret-regenerated', messageJSON);
                break;
            case 'public-room-id-invalid':
                Events.fire('public-room-id-invalid', messageJSON.publicRoomId);
                break;
            case 'public-room-created':
                Events.fire('public-room-created', messageJSON.roomId);
                break;
            case 'public-room-left':
                Events.fire('public-room-left');
                break;
            case 'ws-relay':
                // ws-fallback
                if (this._wsConfig.wsFallback) {
                    Events.fire('ws-relay', {peerId: messageJSON.sender.id, message: message});
                }
                else {
                    Logger.warn("WS receive: message type is for websocket fallback only but websocket fallback is not activated on this instance.")
                }
                break;
            default:
                Logger.error('WS receive: unknown message type', messageJSON);
        }
    }

    send(msg) {
        if (!this._isConnected()) return;
        if (msg.type !== 'pong' && msg.type !== 'ws-relay') {
            Logger.debug("WS send:", msg)
        }
        this._socket.send(JSON.stringify(msg));
    }

    _onPeers(msg) {
        Events.fire('peers', msg);
    }

    _onDisplayName(msg) {
        // Add peerId and peerIdHash to sessionStorage to authenticate as the same device on page reload
        sessionStorage.setItem('peer_id', msg.peerId);
        sessionStorage.setItem('peer_id_hash', msg.peerIdHash);

        // Add peerId to localStorage to mark it for other PairDrop tabs on the same browser
        BrowserTabsConnector
            .addPeerIdToLocalStorage()
            .then(peerId => {
                if (!peerId) return;
                Logger.debug("successfully added peerId to localStorage");

                // Only now join rooms
                Events.fire('join-ip-room');
                PersistentStorage.getAllRoomSecrets()
                    .then(roomSecrets => {
                        Events.fire('room-secrets', roomSecrets);
                    });
            });

        Events.fire('display-name', msg);
    }

    _endpoint() {
        const protocol = location.protocol.startsWith('https') ? 'wss' : 'ws';
        // Check whether the instance specifies another signaling server otherwise use the current instance for signaling
        let wsServerDomain = window._config.signalingServer
            ? window._config.signalingServer
            : location.host + location.pathname;

        let wsUrl = new URL(protocol + '://' + wsServerDomain + 'server');

        wsUrl.searchParams.append('webrtc_supported', window.isRtcSupported ? 'true' : 'false');

        const peerId = sessionStorage.getItem('peer_id');
        const peerIdHash = sessionStorage.getItem('peer_id_hash');
        if (peerId && peerIdHash) {
            wsUrl.searchParams.append('peer_id', peerId);
            wsUrl.searchParams.append('peer_id_hash', peerIdHash);
        }

        return wsUrl.toString();
    }

    _disconnect() {
        this.send({ type: 'disconnect' });

        const peerId = sessionStorage.getItem('peer_id');
        BrowserTabsConnector
            .removePeerIdFromLocalStorage(peerId)
            .then(_ => {
                Logger.debug("successfully removed peerId from localStorage");
            });

        if (!this._socket) return;

        this._socket.onclose = null;
        this._socket.close();
        this._socket = null;
        Events.fire('ws-disconnected');
        this._isReconnect = true;
    }

    _onDisconnect() {
        Logger.log('WS: server disconnected');
        setTimeout(() => {
            this._isReconnect = true;
            Events.fire('ws-disconnected');
            this._reconnectTimer = setTimeout(() => this._connect(), 1000);
        }, 100); //delay for 100ms to prevent flickering on page reload
    }

    _onVisibilityChange() {
        if (window.hiddenProperty) return;
        this._connect();
    }

    _isConnected() {
        return this._socket && this._socket.readyState === this._socket.OPEN;
    }

    _isConnecting() {
        return this._socket && this._socket.readyState === this._socket.CONNECTING;
    }

    _isOffline() {
        return !navigator.onLine;
    }

    _onError(e) {
        Logger.error(e);
    }

    _reconnect() {
        this._disconnect();
        this._connect();
    }
}

class Peer {

    static STATE_IDLE = 'idle';
    static STATE_PREPARE = 'prepare';
    static STATE_TRANSFER_REQUEST_SENT = 'transfer-request-sent';
    static STATE_TRANSFER_REQUEST_RECEIVED = 'transfer-request-received';
    static STATE_RECEIVE_PROCEEDING = 'receive-proceeding';
    static STATE_TRANSFER_PROCEEDING = 'transfer-proceeding';
    static STATE_TEXT_SENT = 'text-sent';

    constructor(serverConnection, isCaller, peerId, roomType, roomId) {
        this._server = serverConnection;
        this._isCaller = isCaller;
        this._peerId = peerId;

        this._roomIds = {};
        this._updateRoomIds(roomType, roomId);

        this._filesQueue = [];
        this._busy = false;

        this._state = Peer.STATE_IDLE;

        // evaluate auto accept
        this._evaluateAutoAccept();

        Events.on('beforeunload', e => this._onBeforeUnload(e));
        Events.on('pagehide', _ => this._onPageHide());
    }

    _reset() {
        this._state = Peer.STATE_IDLE;
        this._busy = false;

        clearInterval(this._updateStatusTextInterval);

        this._updateStatusTextInterval = null;
        this._bytesTotal = 0;
        this._bytesReceivedFiles = 0;
        this._timeStartTransferComplete = null;
        this._timeStartTransferFile = null;
        this._byteLogs = [];

        // tidy up sender
        this._filesRequested = null;
        this._chunker = null;

        // tidy up receiver
        this._pendingRequest = null;
        this._acceptedRequest = null;
        this._filesReceived = [];

        if (this._digester) {
            this._digester.cleanUp();
            this._digester = null;
        }

        // disable NoSleep if idle
        Events.fire('evaluate-no-sleep');
    }

    _refresh() {}

    _disconnect() {
        Events.fire('peer-disconnected', this._peerId);
    }

    _onDisconnected() {
        this._reset();
    }

    _onBeforeUnload(e) {
        if (this._busy) {
            e.preventDefault();
            return Localization.getTranslation("notifications.unfinished-transfers-warning");
        }
    }

    _onPageHide() {
        this._disconnect();
    }

    _onServerSignalMessage(message) {}

    _setIsCaller(isCaller) {
        this._isCaller = isCaller;
    }

    _isSameBrowser() {
        return BrowserTabsConnector.peerIsSameBrowser(this._peerId);
    }

    _isPaired() {
        return !!this._roomIds['secret'];
    }

    _getPairSecret() {
        return this._roomIds['secret'];
    }

    _regenerationOfPairSecretNeeded() {
        return this._getPairSecret() && this._getPairSecret().length !== 256
    }

    _getRoomTypes() {
        return Object.keys(this._roomIds);
    }

    _updateRoomIds(roomType, roomId) {
        const roomTypeIsSecret = roomType === "secret";
        const roomIdIsNotPairSecret = this._getPairSecret() !== roomId;

        // if peer is another browser tab, peer is not identifiable with roomSecret as browser tabs share all roomSecrets
        // -> do not delete duplicates and do not regenerate room secrets
        if (!this._isSameBrowser()
            && roomTypeIsSecret
            && this._isPaired()
            && roomIdIsNotPairSecret) {
            // multiple roomSecrets with same peer -> delete old roomSecret
            PersistentStorage
                .deleteRoomSecret(this._getPairSecret())
                .then(deletedRoomSecret => {
                    if (deletedRoomSecret) {
                        Logger.debug("Successfully deleted duplicate room secret with same peer: ", deletedRoomSecret);
                    }
                });
        }

        this._roomIds[roomType] = roomId;

        if (!this._isSameBrowser()
            &&  roomTypeIsSecret
            &&  this._isPaired()
            &&  this._regenerationOfPairSecretNeeded()
            &&  this._isCaller) {
            // increase security by initiating the increase of the roomSecret length
            // from 64 chars (<v1.7.0) to 256 chars (v1.7.0+)
            Logger.debug('RoomSecret is regenerated to increase security')
            Events.fire('regenerate-room-secret', this._getPairSecret());
        }
    }

    _removeRoomType(roomType) {
        delete this._roomIds[roomType];

        Events.fire('room-type-removed', {
            peerId: this._peerId,
            roomType: roomType
        });
    }

    _evaluateAutoAccept() {
        if (!this._isPaired()) {
            this._setAutoAccept(false);
            return;
        }

        PersistentStorage
            .getRoomSecretEntry(this._getPairSecret())
            .then(roomSecretEntry => {
                const autoAccept = roomSecretEntry
                    ? roomSecretEntry.entry.auto_accept
                    : false;
                this._setAutoAccept(autoAccept);
            })
            .catch(_ => {
                this._setAutoAccept(false);
            });
    }

    _setAutoAccept(autoAccept) {
        this._autoAccept = !this._isSameBrowser()
            ? autoAccept
            : false;
    }

    _onPeerConnected() {
        this._sendState();
    }

    _sendMessage(message) {}

    _sendData(data) {}

    async _onMessage(message) {
        switch (message.type) {
            case 'display-name-changed':
                this._onDisplayNameChanged(message);
                break;
            case 'state':
                await this._onState(message.state);
                break;
            case 'transfer-request':
                await this._onTransferRequest(message);
                break;
            case 'transfer-request-response':
                this._onTransferRequestResponse(message);
                break;
            case 'transfer-header':
                this._onTransferHeader(message);
                break;
            case 'receive-confirmation':
                this._onReceiveConfirmation(message.bytesReceived);
                break;
            case 'resend-request':
                this._onResendRequest(message.offset);
                break;
            case 'file-receive-complete':
                this._onFileReceiveComplete(message);
                break;
            case 'text':
                this._onText(message);
                break;
            case 'text-receive-complete':
                this._onTextReceiveComplete();
                break;
            default:
                Logger.warn('RTC: Unknown message type:', message.type);
        }
    }
    
    _sendDisplayName(displayName) {
        this._sendMessage({type: 'display-name-changed', displayName: displayName});
    }

    _onDisplayNameChanged(message) {
        const displayNameHasChanged = message.displayName !== this._displayName;

        if (!message.displayName || !displayNameHasChanged) return;

        this._displayName = message.displayName;

        const roomSecret = this._getPairSecret();

        if (roomSecret) {
            PersistentStorage
                .updateRoomSecretDisplayName(roomSecret, message.displayName)
                .then(roomSecretEntry => {
                    Logger.debug(`Successfully updated DisplayName for roomSecretEntry ${roomSecretEntry.key}`);
                })
        }

        Events.fire('peer-display-name-changed', {peerId: this._peerId, displayName: message.displayName});
        Events.fire('notify-display-name-changed', { recipient: this._peerId });
    }

    _sendState() {
        this._sendMessage({type: 'state', state: this._state})
    }

    async _onState(peerState) {
        if (this._state === Peer.STATE_TRANSFER_PROCEEDING) {
            this._onStateIfSender(peerState);
        }
        else if (this._state === Peer.STATE_RECEIVE_PROCEEDING) {
            this._onStateIfReceiver(peerState);
        }
        else if (this._state === Peer.STATE_TRANSFER_REQUEST_SENT) {
            await this._onStateIfTransferRequestSent(peerState);
        }
        else if (this._state === Peer.STATE_TRANSFER_REQUEST_RECEIVED) {
            this._onStateIfTransferRequestReceived(peerState);
        }
    }

    _onStateIfSender(peerState) {
        // this peer is sender
        if (peerState !== Peer.STATE_RECEIVE_PROCEEDING) {
            this._abortTransfer();
        }
    }

    _onStateIfReceiver(peerState) {
        // this peer is receiver
        switch (peerState) {
            case Peer.STATE_TRANSFER_REQUEST_SENT:
                // Reconnection during file transfer request. Send acceptance again.
                this._sendTransferRequestResponse(true);
                break;
            case Peer.STATE_TRANSFER_PROCEEDING:
                // Reconnection during receiving of file. Send request for resending
                if (!this._digester) {
                    this._abortTransfer();
                }
                const offset = this._digester._bytesReceived;
                this._sendResendRequest(offset);
                break;
            default:
                this._abortTransfer();
        }
    }

    async _onStateIfTransferRequestSent(peerState) {
        // This peer has sent a transfer request
        // If other peer is still idle -> send request again
        if (peerState === Peer.STATE_IDLE) {
            await this._sendFileTransferRequest(this._filesRequested);
        }
    }

    _onStateIfTransferRequestReceived(peerState) {
        // This peer has received a transfer request
        // If other peer is not in "STATE_TRANSFER_REQUEST_SENT" anymore -> reset and hide request from user
        if (peerState !== Peer.STATE_TRANSFER_REQUEST_SENT) {
            this._reset();
            Events.fire('files-transfer-request-abort', {
                peerId: this._peerId
            })
        }
    }

    _abortTransfer() {
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'error'});

        if (this._digester) {
            this._digester.abort();
        }

        this._reset();
    }

    _addLog(bytesReceivedTotal) {
        const now = Date.now();

        // Add log
        this._byteLogs.push({
            time: now,
            bytesReceived: bytesReceivedTotal
        });

        // Always include at least 5 entries (2.5 MB) to increase precision
        if (this._byteLogs.length < 5) return;

        // Move running average to calculate with a window of 20s
        while (now - this._byteLogs[0].time > 20000) {
            this._byteLogs.shift();
        }
    }

    _updateStatusText() {
        const secondsSinceStart = Math.round((Date.now() - this._timeStartTransferComplete) / 1000);

        // Wait for 10s to only show info on longer transfers and to increase precision
        if (secondsSinceStart < 10) return;

        // mode: 0 -> speed, 1 -> time left, 2 -> receive/transfer (statusText = null)
        const mode = Math.round((secondsSinceStart - 10) / 5) % 3;
        let statusText = null;

        if (mode === 0) {
            statusText = this._getSpeedString();
        }
        else if (mode === 1) {
            statusText = this._getTimeString();
        }

        this._statusText = statusText;
    }

    _getSpeedKbPerSecond() {
        const timeDifferenceSeconds = (this._byteLogs[this._byteLogs.length - 1].time - this._byteLogs[0].time) / 1000;
        const bytesDifferenceKB = (this._byteLogs[this._byteLogs.length - 1].bytesReceived - this._byteLogs[0].bytesReceived) / 1000;
        return Math.round(bytesDifferenceKB / timeDifferenceSeconds);
    }

    _getBytesLeft() {
        return this._bytesTotal - this._byteLogs[this._byteLogs.length - 1].bytesReceived;
    }

    _getSecondsLeft() {
        return Math.round(this._getBytesLeft() / this._getSpeedKbPerSecond() / 1000);
    }

    _getSpeedString() {
        const speedKBs = this._getSpeedKbPerSecond();

        if (speedKBs >= 1000) {
            let speedMBs = Math.round(speedKBs / 100) / 10;
            return `${speedMBs} MB/s`; // e.g. "2.2 MB/s"
        }

        return `${speedKBs} kB/s`; // e.g. "522 kB/s"
    }

    _getTimeString() {
        const seconds = this._getSecondsLeft();
        if (seconds > 60) {
            let minutes = Math.floor(seconds / 60);
            let secondsLeft = Math.floor(seconds % 60);
            return `${minutes} min ${secondsLeft}s`; // e.g. // "1min 20s"
        }
        else {
            return `${seconds}s`; // e.g. "35s"
        }
    }

    // File Sender Only
    async _sendFileTransferRequest(files) {
        this._state = Peer.STATE_PREPARE;
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'prepare'});

        let header = [];
        let totalSize = 0;
        let imagesOnly = true;

        for (let i = 0; i < files.length; i++) {
            header.push({
                displayName: files[i].name,
                mime: files[i].type,
                size: files[i].size
            });
            totalSize += files[i].size;
            if (files[i].type.split('/')[0] !== 'image') imagesOnly = false;
        }

        let dataUrl = "";
        if (files[0].type.split('/')[0] === 'image') {
            try {
                dataUrl = await getThumbnailAsDataUrl(files[0], 400, null, 0.9);
            } catch (e) {
                Logger.error(e);
            }
        }

        this._state = Peer.STATE_TRANSFER_REQUEST_SENT;
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'wait'});

        this._filesRequested = files;
        this._bytesTotal = totalSize;

        this._sendMessage({type: 'transfer-request',
            header: header,
            totalSize: totalSize,
            imagesOnly: imagesOnly,
            thumbnailDataUrl: dataUrl
        });

    }
    
    _onTransferRequestResponse(message) {
        if (this._state !== Peer.STATE_TRANSFER_REQUEST_SENT) {
            this._sendState();
            return;
        }

        if (!message.accepted) {
            if (message.reason === 'ram-exceed-ios') {
                Events.fire('notify-user', Localization.getTranslation('notifications.ram-exceed-ios'));
            }
            Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'idle'});
            this._reset();
            return;
        }

        Events.fire('file-transfer-accepted');
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'transfer'});
        this._state = Peer.STATE_TRANSFER_PROCEEDING;
        this._sendFiles();
    }

    _sendFiles() {
        for (let i = 0; i < this._filesRequested.length; i++) {
            this._filesQueue.push(this._filesRequested[i]);
        }
        this._filesRequested = null

        if (this._busy) return;

        this._byteLogs = [];
        this._bytesReceivedFiles = 0;
        this._timeStartTransferComplete = Date.now();

        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'transfer'});

        this._statusText = null;
        this._updateStatusTextInterval = setInterval(() => this._updateStatusText(), 1000);

        this._dequeueFile();
    }

    _dequeueFile() {
        this._busy = true;
        const file = this._filesQueue.shift();
        this._sendFile(file);
    }

    _sendHeader(file) {
        this._sendMessage({
            type: 'transfer-header',
            size: file.size,
            displayName: file.name,
            mime: file.type
        });
    }

    _sendFile(file) {}

    _onResendRequest(offset) {
        if (this._state !== Peer.STATE_TRANSFER_PROCEEDING || !this._chunker) {
            this._sendTransferAbortion();
            return;
        }
        Logger.debug("Resend requested from offset:", offset)
        this._chunker._resendFromOffset(offset);
    }

    _onReceiveConfirmation(bytesReceived) {
        if (!this._chunker || this._state !== Peer.STATE_TRANSFER_PROCEEDING) {
            this._sendState();
            return;
        }
        this._chunker._onReceiveConfirmation(bytesReceived);

        const bytesReceivedTotal = this._bytesReceivedFiles + bytesReceived;
        const progress = Math.round(1e4 * bytesReceivedTotal / this._bytesTotal) / 1e4;

        this._addLog(bytesReceivedTotal);

        Events.fire('set-progress', {peerId: this._peerId, progress: progress, status: 'transfer', statusText: this._statusText});
    }

    _onFileReceiveComplete(message) {
        if (this._state !== Peer.STATE_TRANSFER_PROCEEDING) {
            this._sendState();
            return;
        }

        this._bytesReceivedFiles += this._chunker._file.size;

        this._chunker = null;

        if (!message.success) {
            Logger.warn('File could not be sent');
            Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'idle'});
            this._reset();
            return;
        }

        Logger.log(`File sent.\n\nSize: ${message.size} MB\tDuration: ${message.duration} s\tSpeed: ${message.speed} MB/s`);

        if (this._filesQueue.length) {
            this._dequeueFile();
            return;
        }

        // No more files in queue. Transfer is complete
        this._reset();
        Events.fire('set-progress', {peerId: this._peerId, progress: 1, status: 'transfer-complete'});
        Events.fire('notify-user', Localization.getTranslation("notifications.file-transfer-completed"));
        Events.fire('files-sent'); // used by 'Snapdrop & PairDrop for Android' app
    }

    // File Receiver Only
    async _onTransferRequest(request) {
        // Only accept one request at a time per peer
        if (this._pendingRequest) {
            this._sendTransferRequestResponse(false);
            return;
        }

        this.fileDigesterWorkerSupported = await SWFileDigester.isSupported();

        Logger.debug('Digesting files via service workers is', this.fileDigesterWorkerSupported ? 'supported' : 'NOT supported');

        // Check if each file must be loaded into RAM completely. This might lead to a page crash (Memory limit iOS Safari: ~380 MB)
        if (!this.fileDigesterWorkerSupported) {
            Logger.warn('Big file transfers might exceed the RAM of the receiver. Use a secure context (https) and do not use private tabs to prevent this.');

            // Check if page will crash on iOS
            if (window.iOS && await this._filesTooBigForSwOnIOS(request.header)) {
                Events.fire('notify-user', Localization.getTranslation('notifications.ram-exceed-ios'));

                // Would exceed RAM -> decline request
                this._sendTransferRequestResponse(false, 'ram-exceed-ios');
                return;
            }
        }

        this._state = Peer.STATE_TRANSFER_REQUEST_RECEIVED;
        this._pendingRequest = request;

        // Automatically accept request if auto-accept is set to true via the Edit Paired Devices Dialog
        if (this._autoAccept) {
            this._sendTransferRequestResponse(true);
            return;
        }

        // Default behavior: show transfer request to user
        Events.fire('files-transfer-request', {
            request: request,
            peerId: this._peerId
        });
    }

    async _filesTooBigForSwOnIOS(files) {
        // Files over 250 MB crash safari if not handled via a service worker
        for (let i = 0; i < files.length; i++) {
            if (files[i].size > 250000000) {
                return true;
            }
        }
        return false;
    }

    _sendTransferRequestResponse(accepted, reason = null) {
        let message = {type: 'transfer-request-response', accepted: accepted};

        if (reason) {
            message.reason = reason;
        }

        if (accepted) {
            this._state = Peer.STATE_RECEIVE_PROCEEDING;
            this._busy = true;
            this._byteLogs = [];
            this._filesReceived = [];
            this._acceptedRequest = this._pendingRequest;

            this._bytesTotal = this._acceptedRequest.totalSize;
            this._bytesReceivedFiles = 0;

            Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'receive'});

            this._timeStartTransferComplete = Date.now();
            this._statusText = null;
            this._updateStatusTextInterval = setInterval(() => this._updateStatusText(), 1000);
        }

        this._sendMessage(message);
    }

    _onTransferHeader(header) {
        if (this._state !== Peer.STATE_RECEIVE_PROCEEDING) {
            this._sendState();
            return;
        }

        if (!this._fitsAcceptedHeader(header)) {
            this._abortTransfer();
            Events.fire('notify-user', Localization.getTranslation("notifications.files-incorrect"));
            Logger.error("Received files differ from requested files. Abort!");
            return;
        }

        this._timeStartTransferFile = Date.now();

        this._addFileDigester(header);
    }

    _addFileDigester(header) {
        this._digester = this.fileDigesterWorkerSupported
            ?   new FileDigesterViaWorker(
                    {
                        size: header.size,
                        name: header.displayName,
                        mime: header.mime
                    },
                file => this._fileReceived(file),
                    bytesReceived => this._sendReceiveConfirmation(bytesReceived)
                )
            :   new FileDigesterViaBuffer(
                    {
                        size: header.size,
                        name: header.displayName,
                        mime: header.mime
                    },
                    file => this._fileReceived(file),
                    bytesReceived => this._sendReceiveConfirmation(bytesReceived)
                );
    }

    _sendReceiveConfirmation(bytesReceived) {
        this._sendMessage({type: 'receive-confirmation', bytesReceived: bytesReceived});

        const bytesReceivedTotal = this._bytesReceivedFiles + bytesReceived;
        const progress = Math.round(1e4 * bytesReceivedTotal / this._bytesTotal) / 1e4;

        this._addLog(bytesReceivedTotal);

        Events.fire('set-progress', {peerId: this._peerId, progress: progress, status: 'receive', statusText: this._statusText});
    }

    _sendResendRequest(offset) {
        this._sendMessage({ type: 'resend-request', offset: offset });
    }

    _sendTransferAbortion() {
        this._sendMessage({type: 'file-receive-complete', success: false});
    }

    _onData(data) {
        this._onChunkReceived(data);
    }

    _onChunkReceived(chunk) {
        if (this._state !== Peer.STATE_RECEIVE_PROCEEDING || !this._digester || !chunk.byteLength) {
            this._sendState();
            return;
        }

        try {
            this._digester.unchunk(chunk);
        }
        catch (e) {
            this._abortTransfer();
            Logger.error(e);
        }
    }

    _fileReceived(file) {
        // File transfer complete
        this._singleFileReceiveComplete(file);

        // If less files received than header accepted -> wait for next file
        if (this._filesReceived.length < this._acceptedRequest.header.length) return;

        // We are done receiving
        Events.fire('set-progress', {peerId: this._peerId, progress: 1, status: 'receive'});
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'process'});
        this._allFilesReceiveComplete();
    }

    _fitsAcceptedHeader(header) {
        if (!this._acceptedRequest) {
            return false;
        }

        const positionFile = this._filesReceived.length;

        if (positionFile > this._acceptedRequest.header.length - 1) {
            return false;
        }

        // Check if file header fits
        const acceptedHeader = this._acceptedRequest.header[positionFile];

        const sameSize = header.size === acceptedHeader.size;
        const sameType = header.mime === acceptedHeader.mime;
        const sameName = header.displayName === acceptedHeader.displayName;

        return sameSize && sameType && sameName;
    }

    _singleFileReceiveComplete(file) {
        this._digester._fileCompleteCallback = null;
        this._digester._sendReceiveConfimationCallback = null;
        this._digester = null;

        this._bytesReceivedFiles += file.size;

        const duration = (Date.now() - this._timeStartTransferFile) / 1000; // s
        const size = Math.round(10 * file.size / 1e6) / 10; // MB
        const speed = Math.round(100 * size / duration) / 100; // MB/s

        // Log speed from request to receive
        Logger.log(`File received.\n\nSize: ${size} MB\tDuration: ${duration} s\tSpeed: ${speed} MB/s`);

        // include for compatibility with 'Snapdrop & PairDrop for Android' app
        Events.fire('file-received', {name: file.displayName, size: file.size});

        this._filesReceived.push(file);

        this._sendMessage({type: 'file-receive-complete', success: true, duration: duration, size: size, speed: speed});
    }

    _allFilesReceiveComplete() {
        Events.fire('files-received', {
            peerId: this._peerId,
            files: this._filesReceived,
            imagesOnly: this._acceptedRequest.imagesOnly,
            totalSize: this._acceptedRequest.totalSize
        });
        this._reset();
    }

    // Message Sender Only
    _sendText(text) {
        this._state = Peer.STATE_TEXT_SENT;
        const unescaped = btoa(unescape(encodeURIComponent(text)));
        this._sendMessage({ type: 'text', text: unescaped });
    }

    _onTextReceiveComplete() {
        if (this._state !== Peer.STATE_TEXT_SENT) {
            this._sendState();
            return;
        }
        this._reset();
        Events.fire('notify-user', Localization.getTranslation("notifications.message-transfer-completed"));
    }

    // Message Receiver Only
    _onText(message) {
        if (!message.text) return;
        try {
            const escaped = decodeURIComponent(escape(atob(message.text)));
            Events.fire('text-received', { text: escaped, peerId: this._peerId });
            this._sendMessage({ type: 'text-receive-complete' });
        }
        catch (e) {
            Logger.error(e);
        }
    }
}

class RTCPeer extends Peer {

    constructor(serverConnection, isCaller, peerId, roomType, roomId, rtcConfig) {
        super(serverConnection, isCaller, peerId, roomType, roomId);

        this.rtcSupported = true;
        this.rtcConfig = rtcConfig;

        this.pendingInboundServerSignalMessages = [];
        this.pendingOutboundMessages = [];

        this._connect();
    }

    _connected() {
        return this._conn && this._conn.connectionState === 'connected';
    }

    _connecting() {
        return this._conn
            && (
                this._conn.connectionState === 'new'
                || this._conn.connectionState === 'connecting'
            );
    }

    _messageChannelOpen() {
        return this._messageChannel && this._messageChannel.readyState === 'open';
    }

    _dataChannelOpen() {
        return this._dataChannel && this._dataChannel.readyState === 'open';
    }

    _messageChannelConnecting() {
        return this._messageChannel && this._messageChannel.readyState === 'connecting';
    }

    _dataChannelConnecting() {
        return this._dataChannel && this._dataChannel.readyState === 'connecting';
    }

    _channelOpen() {
        return this._messageChannelOpen() && this._dataChannelOpen();
    }

    _channelConnecting() {
        return (this._dataChannelConnecting() || this._dataChannelOpen())
            && (this._messageChannelConnecting() || this._messageChannelOpen());
    }

    _stable() {
        return this._connected() && this._channelOpen();
    }

    _connect() {
        if (this._stable()) return;

        Events.fire('peer-connecting', this._peerId);

        this._openConnection();
        this._openMessageChannel();
        this._openDataChannel();

        this._evaluatePendingInboundServerMessages()
            .then((count) => {
                if (count) {
                    Logger.debug("Pending inbound messages evaluated.");
                }
            });
    }

    _openConnection() {
        const conn = new RTCPeerConnection(this.rtcConfig);
        conn.onnegotiationneeded = _ => this._onNegotiationNeeded();
        conn.onsignalingstatechange = _ => this._onSignalingStateChanged();
        conn.oniceconnectionstatechange = _ => this._onIceConnectionStateChange();
        conn.onicegatheringstatechange = _ => this._onIceGatheringStateChanged();
        conn.onconnectionstatechange = _ => this._onConnectionStateChange();
        conn.onicecandidate = e => this._onIceCandidate(e);
        conn.onicecandidateerror = e => this._onIceCandidateError(e);

        this._conn = conn;
    }

    async _onNegotiationNeeded() {
        Logger.debug('RTC: Negotiation needed');

        if (this._isCaller) {
            // Creating offer if required
            Logger.debug('RTC: Creating offer');
            const description = await this._conn.createOffer();
            await this._handleLocalDescription(description);
        }
    }

    _onSignalingStateChanged() {
        Logger.debug('RTC: Signaling state changed:', this._conn.signalingState);
    }

    _onIceConnectionStateChange() {
        Logger.debug('RTC: ICE connection state changed:', this._conn.iceConnectionState);
    }

    _onIceGatheringStateChanged() {
        Logger.debug('RTC: ICE gathering state changed:', this._conn.iceConnectionState);
    }

    _onConnectionStateChange() {
        Logger.debug('RTC: Connection state changed:', this._conn.connectionState);
        switch (this._conn.connectionState) {
            case 'disconnected':
                this._refresh();
                break;
            case 'failed':
                Logger.warn('RTC connection failed');
                // Todo: if error is "TURN server needed" -> fallback to WS if activated
                this._refresh();
        }
    }

    _onIceCandidate(event) {
        this._handleLocalCandidate(event.candidate);
    }

    _onIceCandidateError(error) {
        Logger.error(error);
    }

    _openMessageChannel() {
        const messageCallback = e => this._onMessage(e.data);
        this._messageChannel = this._openChannel("message-channel", 1, "json", messageCallback);
    }

    _openDataChannel() {
        const messageCallback = e => this._onData(e.data);
        this._dataChannel = this._openChannel("data-channel", 0, "raw", messageCallback);
    }

    _openChannel(label, id, protocol, messageCallback) {
        const channel = this._conn.createDataChannel(label, {
            ordered: true,
            negotiated: true,
            id: id,
            protocol: protocol
        });
        channel.binaryType = "arraybuffer";
        channel.onopen = e => this._onChannelOpened(e);
        channel.onclose = e => this._onChannelClosed(e);
        channel.onerror = e => this._onChannelError(e);
        channel.onmessage = messageCallback;

        return channel;
    }

    _onChannelOpened(e) {
        Logger.debug(`RTC: Channel ${e.target.label} opened with`, this._peerId);

        // wait until all channels are open
        if (!this._stable()) return;

        Events.fire('peer-connected', {peerId: this._peerId, connectionHash: this.getConnectionHash()});
        super._onPeerConnected();

        this._sendPendingOutboundMessaged();
    }

    _sendPendingOutboundMessaged() {
        while (this._stable() && this.pendingOutboundMessages.length > 0) {
            this._sendViaMessageChannel(this.pendingOutboundMessages.shift());
        }
    }

    _onChannelClosed(e) {
        Logger.debug(`RTC: Channel ${e.target.label} closed`, this._peerId);
        this._refresh();
    }

    _onChannelError(e) {
        Logger.warn(`RTC: Channel ${e.target.label} error`, this._peerId);
        Logger.error(e.error);
    }

    async _handleLocalDescription(localDescription) {
        await this._conn.setLocalDescription(localDescription);

        Logger.debug("RTC: Sending local description");
        this._sendSignal({ signalType: 'description', description: localDescription });
    }

    async _handleRemoteDescription(remoteDescription) {
        Logger.debug("RTC: Received remote description");
        await this._conn.setRemoteDescription(remoteDescription);

        if (!this._isCaller) {
            // Creating answer if required
            Logger.debug('RTC: Creating answer');
            const localDescription = await this._conn.createAnswer();
            await this._handleLocalDescription(localDescription);
        }
    }

    _handleLocalCandidate(candidate) {
        Logger.debug("RTC: Local candidate created", candidate);

        if (candidate === null) {
            return;
        }

        this._sendSignal({ signalType: 'candidate', candidate: candidate });
    }

    async _handleRemoteCandidate(candidate) {
        Logger.debug("RTC: Received remote candidate", candidate);

        if (candidate === null) {
            return;
        }

        await this._conn.addIceCandidate(candidate);
    }

    async _evaluatePendingInboundServerMessages() {
        let inboundMessagesEvaluatedCount = 0;
        while (this.pendingInboundServerSignalMessages.length > 0) {
            const message = this.pendingInboundServerSignalMessages.shift();

            Logger.debug("Evaluate pending inbound message:", message);

            await this._onServerSignalMessage(message);

            inboundMessagesEvaluatedCount++;
        }
        return inboundMessagesEvaluatedCount;
    }

    async _onServerSignalMessage(message) {
        if (this._conn === null) {
            this.pendingInboundServerSignalMessages.push(message);
            return;
        }

        switch (message.signalType) {
            case 'description':
                await this._handleRemoteDescription(message.description);
                break;
            case 'candidate':
                await this._handleRemoteCandidate(message.candidate);
                break;
            default:
                Logger.warn('Unknown signalType:', message.signalType);
                break;
        }
    }


    _refresh() {
        Events.fire('peer-connecting', this._peerId);
        this._closeChannelAndConnection();

        this._connect(); // reopen the channel
    }

    _onDisconnected() {
        super._onDisconnected();
        this._closeChannelAndConnection();
    }

    _closeChannelAndConnection() {
        if (this._dataChannel) {
            this._dataChannel.onopen = null;
            this._dataChannel.onclose = null;
            this._dataChannel.onerror = null;
            this._dataChannel.onmessage = null;
            this._dataChannel.close();
            this._dataChannel = null;
        }
        if (this._messageChannel) {
            this._messageChannel.onopen = null;
            this._messageChannel.onclose = null;
            this._messageChannel.onerror = null;
            this._messageChannel.onmessage = null;
            this._messageChannel.close();
            this._messageChannel = null;
        }
        if (this._conn) {
            this._conn.onnegotiationneeded = null;
            this._conn.onsignalingstatechange = null;
            this._conn.oniceconnectionstatechange = null;
            this._conn.onicegatheringstatechange = null;
            this._conn.onconnectionstatechange = null;
            this._conn.onicecandidate = null;
            this._conn.onicecandidateerror = null;
            this._conn.close();
            this._conn = null;
        }
    }

    _sendMessage(message) {
        if (!this._stable() || this.pendingOutboundMessages.length > 0) {
            // queue messages if not connected OR if connected AND queue is not empty
            this.pendingOutboundMessages.push(message);
            return;
        }
        this._sendViaMessageChannel(message);
    }

    _sendViaMessageChannel(message) {
        Logger.debug('RTC Send:', message);
        this._messageChannel.send(JSON.stringify(message));
    }

    _sendData(data) {
        this._sendViaDataChannel(data)
    }

    _sendViaDataChannel(data) {
        this._dataChannel.send(data);
    }

    _sendSignal(message) {
        message.type = 'signal';
        message.to = this._peerId;
        message.roomType = this._getRoomTypes()[0];
        message.roomId = this._roomIds[this._getRoomTypes()[0]];
        this._server.send(message);
    }

    async _sendFile(file) {
        this._chunker = new FileChunkerRTC(
            file,
            chunk => this._sendData(chunk),
            this._conn,
            this._dataChannel
        );
        this._chunker._readChunk();
        this._sendHeader(file);
        this._state = Peer.STATE_TRANSFER_PROCEEDING;
    }

    async _onMessage(message) {
        Logger.debug('RTC Receive:', JSON.parse(message));
        try {
            message = JSON.parse(message);
        } catch (e) {
            Logger.warn("RTCPeer: Received JSON is malformed");
            return;
        }
        await super._onMessage(message);
    }

    getConnectionHash() {
        const localDescriptionLines = this._conn.localDescription.sdp.split("\r\n");
        const remoteDescriptionLines = this._conn.remoteDescription.sdp.split("\r\n");
        let localConnectionFingerprint, remoteConnectionFingerprint;
        for (let i=0; i<localDescriptionLines.length; i++) {
            if (localDescriptionLines[i].startsWith("a=fingerprint:")) {
                localConnectionFingerprint = localDescriptionLines[i].substring(14);
                break;
            }
        }
        for (let i=0; i<remoteDescriptionLines.length; i++) {
            if (remoteDescriptionLines[i].startsWith("a=fingerprint:")) {
                remoteConnectionFingerprint = remoteDescriptionLines[i].substring(14);
                break;
            }
        }
        const combinedFingerprints = this._isCaller
            ? localConnectionFingerprint + remoteConnectionFingerprint
            : remoteConnectionFingerprint + localConnectionFingerprint;
        let hash = cyrb53(combinedFingerprints).toString();
        while (hash.length < 16) {
            hash = "0" + hash;
        }
        return hash;
    }
}

class WSPeer extends Peer {

    constructor(serverConnection, isCaller, peerId, roomType, roomId) {
        super(serverConnection, isCaller, peerId, roomType, roomId);

        this.rtcSupported = false;
        this.signalSuccessful = false;

        if (!this._isCaller) return; // we will listen for a caller

        this._sendSignal();
    }

    _sendFile(file) {
        this._sendHeader(file);
        this._chunker = new FileChunkerWS(
            file,
            chunk => this._sendData(chunk)
        );
        this._chunker._readChunk();
    }

    _sendData(data) {
        this._sendMessage({
            type: 'chunk',
            chunk: arrayBufferToBase64(data)
        });
    }

    _sendMessage(message) {
        message = {
            type: 'ws-relay',
            message: message
        };
        this._sendMessageViaServer(message);
    }

    _sendMessageViaServer(message) {
        message.to = this._peerId;
        message.roomType = this._getRoomTypes()[0];
        message.roomId = this._roomIds[this._getRoomTypes()[0]];
        this._server.send(message);
    }

    _sendSignal(connected = false) {
        this._sendMessageViaServer({type: 'signal', connected: connected});
    }

    _onServerSignalMessage(message) {
        this._peerId = message.sender.id;

        Events.fire('peer-connected', {peerId: this._peerId, connectionHash: this.getConnectionHash()})

        if (message.connected) {
            this.signalSuccessful = true;
            return;
        }

        this._sendSignal(true);
    }

    async _onMessage(message) {
        Logger.debug('WS Receive:', message);
        await super._onMessage(message);
    }

    _onWsRelay(message) {
        try {
            message = JSON.parse(message).message;
        }
        catch (e) {
            Logger.warn("WSPeer: Received JSON is malformed");
            return;
        }

        if (message.type === 'chunk') {
            const data = base64ToArrayBuffer(message.chunk);
            this._onData(data);
        }
        else {
            this._onMessage(message);
        }
    }

    _refresh() {
        this.signalSuccessful = true;

        if (!this._isCaller) return; // we will listen for a caller

        this._sendSignal();
    }

    _onDisconnected() {
        super._onDisconnected();
        this.signalSuccessful = false;
    }

    getConnectionHash() {
        // Todo: implement SubtleCrypto asymmetric encryption and create connectionHash from public keys
        return "";
    }
}

class PeersManager {

    constructor(serverConnection) {
        this._server = serverConnection;
        this.peers = {};
        this._device = {
            originalDisplayName: '',
            displayName: '',
            publicRoomId: null
        };

        Events.on('signal', e => this._onSignal(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('peer-left', e => this._onPeerLeft(e.detail));
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('peer-connected', e => this._onPeerConnected(e.detail.peerId));
        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));

        // ROOMS
        Events.on('join-public-room', e => this._onJoinPublicRoom(e.detail.roomId));

        // this device closes connection
        Events.on('room-secrets-deleted', e => this._onRoomSecretsDeleted(e.detail));
        Events.on('leave-public-room', _ => this._onLeavePublicRoom());

        // peer closes connection
        Events.on('secret-room-deleted', e => this._onSecretRoomDeleted(e.detail));
        Events.on('room-secret-regenerated', e => this._onRoomSecretRegenerated(e.detail));

        // peer
        Events.on('display-name', e => this._onDisplayName(e.detail.displayName));
        Events.on('self-display-name-changed', e => this._notifyPeersDisplayNameChanged(e.detail.displayName));
        Events.on('notify-display-name-changed', e => this._notifyPeerDisplayNameChanged(e.detail.recipient));
        Events.on('auto-accept-updated', e => this._onAutoAcceptUpdated(e.detail.roomSecret, e.detail.autoAccept));

        // transfer
        Events.on('send-text', e => this._onSendText(e.detail));
        Events.on('files-selected', e => this._onFilesSelected(e.detail));
        Events.on('respond-to-files-transfer-request', e => this._onRespondToFileTransferRequest(e.detail))

        // websocket connection
        Events.on('ws-disconnected', _ => this._onWsDisconnected());
        Events.on('ws-relay', e => this._onWsRelay(e.detail.peerId, e.detail.message));
        Events.on('ws-config', e => this._onWsConfig(e.detail));

        // no-sleep
        Events.on('evaluate-no-sleep', _ => this._onEvaluateNoSleep());

        // clean up on page hide
        Events.on('pagehide', _ => this._onPageHide());
    }

    _onWsConfig(wsConfig) {
        this._wsConfig = wsConfig;
    }

    _onSignal(message) {
        const peerId = message.sender.id;
        this.peers[peerId]._onServerSignalMessage(message);
    }

    _onEvaluateNoSleep() {
        // Evaluate if NoSleep should be disabled
        for (let i = 0; i < this.peers.length; i++) {
            if (this.peers[i]._busy) return;
        }

        NoSleepUI.disable();
    }

    _onPageHide() {
        // Clear OPFS directory ONLY if this is the last PairDrop Browser tab
        if (!BrowserTabsConnector.isOnlyTab()) return;

        SWFileDigester.clearDirectory();
    }

    _refreshPeer(isCaller, peerId, roomType, roomId) {
        const peer = this.peers[peerId];
        const roomTypesDiffer = Object.keys(peer._roomIds)[0] !== roomType;
        const roomIdsDiffer = peer._roomIds[roomType] !== roomId;

        // if roomType or roomId for roomType differs peer is already connected
        // -> only update roomSecret and reevaluate auto accept
        if (roomTypesDiffer || roomIdsDiffer) {
            peer._updateRoomIds(roomType, roomId);
            peer._evaluateAutoAccept();

            return true;
        }

        // reconnect peer - caller/waiter might be switched
        peer._setIsCaller(isCaller);
        peer._refresh();

        return true;
    }

    _createOrRefreshPeer(isCaller, peerId, roomType, roomId, rtcSupported) {
        if (this._peerExists(peerId)) {
            this._refreshPeer(isCaller, peerId, roomType, roomId);
        } else {
            this._createPeer(isCaller, peerId, roomType, roomId, rtcSupported);
        }
    }

    _createPeer(isCaller, peerId, roomType, roomId, rtcSupported) {
        if (window.isRtcSupported && rtcSupported) {
            this.peers[peerId] = new RTCPeer(this._server, isCaller, peerId, roomType, roomId, this._wsConfig.rtcConfig);
        }
        else if (this._wsConfig.wsFallback) {
            this.peers[peerId] = new WSPeer(this._server, isCaller, peerId, roomType, roomId);
        }
        else {
            Logger.warn("Websocket fallback is not activated on this instance.\n" +
                "Activate WebRTC in this browser or ask the admin of this instance to activate the websocket fallback.")
        }
    }

    _onPeerJoined(message) {
        this._createOrRefreshPeer(false, message.peer.id, message.roomType, message.roomId, message.peer.rtcSupported);
    }

    _onPeers(message) {
        message.peers.forEach(peer => {
            this._createOrRefreshPeer(true, peer.id, message.roomType, message.roomId, peer.rtcSupported);
        })
    }

    _onWsRelay(peerId, message) {
        if (!this._wsConfig.wsFallback) return;

        const peer = this.peers[peerId];

        if (!peer || peer.rtcSupported) return;

        peer._onWsRelay(message);
    }

    _onRespondToFileTransferRequest(detail) {
        this.peers[detail.to]._sendTransferRequestResponse(detail.accepted);
    }

    async _onFilesSelected(message) {
        let files = await mime.addMissingMimeTypesToFiles(message.files);
        await this.peers[message.to]._sendFileTransferRequest(files);
    }

    _onSendText(message) {
        this.peers[message.to]._sendText(message.text);
    }

    _onPeerLeft(message) {
        if (this._peerExists(message.peerId) && !this._webRtcSupported(message.peerId)) {
            Logger.debug('WSPeer left:', message.peerId);
        }
        if (message.disconnect === true) {
            // if user actively disconnected from PairDrop server, disconnect all peer to peer connections immediately
            this._disconnectOrRemoveRoomTypeByPeerId(message.peerId, message.roomType);

            // If no peers are connected anymore, we can safely assume that no other tab on the same browser is connected:
            // Tidy up peerIds in localStorage
            if (Object.keys(this.peers).length === 0) {
                BrowserTabsConnector
                    .removeOtherPeerIdsFromLocalStorage()
                    .then(peerIds => {
                        if (!peerIds) return;
                        Logger.debug("successfully removed other peerIds from localStorage");
                    });
            }
        }
    }

    _onPeerConnected(peerId) {
        this._notifyPeerDisplayNameChanged(peerId);
    }

    _peerExists(peerId) {
        return !!this.peers[peerId];
    }

    _webRtcSupported(peerId) {
        return this.peers[peerId].rtcSupported
    }

    _onWsDisconnected() {
        if (!this._wsConfig || !this._wsConfig.wsFallback) return;

        for (const peerId in this.peers) {
            if (!this._webRtcSupported(peerId)) {
                Events.fire('peer-disconnected', peerId);
            }
        }
    }

    _onPeerDisconnected(peerId) {
        const peer = this.peers[peerId];
        delete this.peers[peerId];

        if (!peer) return;

        peer._onDisconnected();
    }

    _onRoomSecretsDeleted(roomSecrets) {
        for (let i = 0; i < roomSecrets.length; i++) {
            this._disconnectOrRemoveRoomTypeByRoomId('secret', roomSecrets[i]);
        }
    }

    _onJoinPublicRoom(roomId) {
        if (roomId !== this._device.publicRoomId) {
            this._disconnectFromPublicRoom();
        }
        this._device.publicRoomId = roomId;
    }

    _onLeavePublicRoom() {
        this._disconnectFromPublicRoom();
    }

    _onSecretRoomDeleted(roomSecret) {
        this._disconnectOrRemoveRoomTypeByRoomId('secret', roomSecret);
    }

    _disconnectFromPublicRoom() {
        this._disconnectOrRemoveRoomTypeByRoomId('public-id', this._device.publicRoomId);
        this._device.publicRoomId = null;
    }

    _disconnectOrRemoveRoomTypeByRoomId(roomType, roomId) {
        const peerIds = this._getPeerIdsFromRoomId(roomId);

        if (!peerIds.length) return;

        for (let i = 0; i < peerIds.length; i++) {
            this._disconnectOrRemoveRoomTypeByPeerId(peerIds[i], roomType);
        }
    }

    _disconnectOrRemoveRoomTypeByPeerId(peerId, roomType) {
        const peer = this.peers[peerId];

        if (!peer || !peer._getRoomTypes().includes(roomType)) return;

        if (peer._getRoomTypes().length > 1) {
            peer._removeRoomType(roomType);
        }
        else {
            Events.fire('peer-disconnected', peerId);
        }
    }

    _onRoomSecretRegenerated(message) {
        PersistentStorage
            .updateRoomSecret(message.oldRoomSecret, message.newRoomSecret)
            .then(_ => {
                Logger.debug("successfully regenerated room secret");
                Events.fire("room-secrets", [message.newRoomSecret]);
            })
    }

    _notifyPeersDisplayNameChanged(newDisplayName) {
        this._device.displayName = newDisplayName
            ? newDisplayName
            : this._device.originalDisplayName;

        for (const peerId in this.peers) {
            this._notifyPeerDisplayNameChanged(peerId);
        }
    }

    _notifyPeerDisplayNameChanged(peerId) {
        const peer = this.peers[peerId];
        if (!peer) return;
        this.peers[peerId]._sendDisplayName(this._device.displayName);
    }

    _onDisplayName(displayName) {
        this._device.originalDisplayName = displayName;
        // if the displayName has not been changed (yet) set the displayName to the original displayName
        if (!this._device.displayName) this._device.displayName = displayName;
    }

    _onAutoAcceptUpdated(roomSecret, autoAccept) {
        let peerIds = this._getPeerIdsFromRoomId(roomSecret);
        const peerId = this._removePeerIdsSameBrowser(peerIds)[0];

        if (!peerId) return;

        this.peers[peerId]._setAutoAccept(autoAccept);
    }

    _removePeerIdsSameBrowser(peerIds) {
        let peerIdsNotSameBrowser = [];
        for (let i = 0; i < peerIds.length; i++) {
            const peer = this.peers[peerIds[i]];
            if (!peer._isSameBrowser()) {
                peerIdsNotSameBrowser.push(peerIds[i]);
            }
        }
        return peerIdsNotSameBrowser;
    }

    _getPeerIdsFromRoomId(roomId) {
        if (!roomId) return [];

        let peerIds = []
        for (const peerId in this.peers) {
            const peer = this.peers[peerId];

            // peer must have same roomId.
            if (Object.values(peer._roomIds).includes(roomId)) {
                peerIds.push(peer._peerId);
            }
        }
        return peerIds;
    }
}

class FileChunker {

    constructor(file, onChunkCallback) {
        this._chunkSize = 65536; // 64 KB
        this._maxBytesSentWithoutConfirmation = 1048576; // 1 MB

        this._bytesSent = 0;
        this._bytesReceived = 0;

        this._file = file;
        this._onChunk = onChunkCallback;

        this._reader = new FileReader();
        this._reader.addEventListener('load', e => this._onChunkRead(e.target.result));

        this._currentlySending = false;
    }

    _readChunk() {
        if (this._currentlySending || !this._bufferHasSpaceForChunk() || this._isFileEnd()) return;

        this._currentlySending = true;
        const chunk = this._file.slice(this._bytesSent, this._bytesSent + this._chunkSize);
        this._reader.readAsArrayBuffer(chunk);
    }

    _onChunkRead(chunk) {
        if (!chunk.byteLength) return;

        this._currentlySending = false;

        this._onChunk(chunk);
        this._bytesSent += chunk.byteLength;

        // Pause sending when reaching the high watermark or file end
        if (!this._bufferHasSpaceForChunk() || this._isFileEnd()) return;

        this._readChunk();
    }

    _bufferHasSpaceForChunk() {}

    _onReceiveConfirmation(bytesReceived) {}

    _resendFromOffset(offset) {
        this._bytesSent = offset;
        this._readChunk();
    }

    _isFileEnd() {
        return this._bytesSent >= this._file.size;
    }
}

class FileChunkerRTC extends FileChunker {

    constructor(file, onChunkCallback, peerConnection, dataChannel) {
        super(file, onChunkCallback);

        this._chunkSize = peerConnection && peerConnection.sctp
            ? Math.min(peerConnection.sctp.maxMessageSize, 1048576) // 1 MB max
            : 262144; // 256 KB

        this._peerConnection = peerConnection;
        this._dataChannel = dataChannel;

        this._highWatermark = 10485760; // 10 MB
        this._lowWatermark = 4194304; // 4 MB

        // Set buffer threshold
        this._dataChannel.bufferedAmountLowThreshold = this._lowWatermark;
        this._dataChannel.addEventListener('bufferedamountlow', _ => this._readChunk());
    }

    _bufferHasSpaceForChunk() {
        return this._dataChannel.bufferedAmount + this._chunkSize < this._highWatermark;
    }

    _onReceiveConfirmation(bytesReceived) {
        this._bytesReceived = bytesReceived;
    }
}

class FileChunkerWS extends FileChunker {

    constructor(file, onChunkCallback) {
        super(file, onChunkCallback);
    }

    _bytesCurrentlySent() {
        return this._bytesSent - this._bytesReceived;
    }

    _bufferHasSpaceForChunk() {
        return this._bytesCurrentlySent() + this._chunkSize <= this._maxBytesSentWithoutConfirmation;
    }

    _onReceiveConfirmation(bytesReceived) {
        this._bytesReceived = bytesReceived;
        this._readChunk();
    }
}

class FileDigester {

    constructor(meta, fileCompleteCallback, sendReceiveConfirmationCallback) {
        this._bytesReceived = 0;
        this._bytesReceivedSinceLastTime = 0;
        this._maxBytesWithoutConfirmation = 1048576; // 1 MB
        this._size = meta.size;
        this._name = meta.name;
        this._mime = meta.mime;
        this._fileCompleteCallback = fileCompleteCallback;
        this._sendReceiveConfimationCallback = sendReceiveConfirmationCallback;
    }

    unchunk(chunk) {}

    evaluateChunkSize(chunk) {
        this._bytesReceived += chunk.byteLength;
        this._bytesReceivedSinceLastTime += chunk.byteLength;

        if (this._bytesReceived > this._size) {
            throw new Error("Too many bytes received. Abort!");
        }

        // If more than half of maxBytesWithoutConfirmation received -> send confirmation
        if (2 * this._bytesReceivedSinceLastTime > this._maxBytesWithoutConfirmation) {
            this._sendReceiveConfimationCallback(this._bytesReceived);
            this._bytesReceivedSinceLastTime = 0;
        }
    }

    isFileReceivedCompletely() {
        return this._bytesReceived >= this._size;
    }

    cleanUp() {}

    abort() {}
}

class FileDigesterViaBuffer extends FileDigester {
    constructor(meta, fileCompleteCallback, sendReceiveConfirmationCallback) {
        super(meta, fileCompleteCallback, sendReceiveConfirmationCallback);
        this._buffer = [];
    }

    unchunk(chunk) {
        this._buffer.push(chunk);
        this.evaluateChunkSize(chunk);

        // If file is not completely received -> Wait for next chunk.
        if (!this.isFileReceivedCompletely()) return;

        this.processFileViaMemory();
    }

    processFileViaMemory() {
        // Loads complete file into RAM which might lead to a page crash (Memory limit iOS Safari: ~380 MB)
        const file = new File(
            this._buffer,
            this._name,
            {
                type: this._mime,
                lastModified: new Date().getTime()
            }
        );
        file.displayName = this._name

        this._fileCompleteCallback(file);
    }

    cleanUp() {
        this._buffer = [];
    }

    abort() {
        this.cleanUp();
    }
}

class FileDigesterViaWorker extends FileDigester {
    constructor(meta, fileCompleteCallback, sendReceiveConfirmationCallback) {
        super(meta, fileCompleteCallback, sendReceiveConfirmationCallback);
        this._fileDigesterWorker = new SWFileDigester();
    }

    unchunk(chunk) {
        this._fileDigesterWorker
            .nextChunk(chunk, this._bytesReceived)
            .then(_ => {
                this.evaluateChunkSize(chunk);

                // If file is not completely received -> Wait for next chunk.
                if (!this.isFileReceivedCompletely()) return;

                this.processFileViaWorker();
            });
    }

    processFileViaWorker() {
        this._fileDigesterWorker
            .getFile()
            .then(file => {
                // Save id and displayName to file to be able to truncate file later
                file.id = file.name;
                file.displayName = this._name;

                this._fileCompleteCallback(file);
            })
            .catch(e => {
                Logger.error("Error in SWFileDigester:", e);
                this.cleanUp();
            });
    }

    cleanUp() {
        this._fileDigesterWorker.cleanUp();
    }

    abort() {
        // delete and clean up (included in deletion)
        this._fileDigesterWorker.deleteFile().then((id) => {
            Logger.debug("File deleted after abort:", id);
        });
    }
}


class SWFileDigester {

    static fileWorkers = [];

    constructor(id = null) {
        // Use service worker to prevent loading the complete file into RAM
        // Uses origin private file system (OPFS) as storage endpoint

        if (!id) {
            // Generate random uuid to save file on disk
            // Create only one service worker per file to prevent problems with accessHandles
            id = generateUUID();
            SWFileDigester.fileWorkers[id] = new Worker("scripts/sw-file-digester.js");
        }

        this.id = id;
        this.fileWorker = SWFileDigester.fileWorkers[id];

        this.fileWorker.onmessage = (e) => {
            switch (e.data.type) {
                case "support":
                    this.onSupport(e.data.supported);
                    break;
                case "chunk-written":
                    this.onChunkWritten(e.data.offset);
                    break;
                case "file":
                    this.onFile(e.data.file);
                    break;
                case "file-deleted":
                    this.onFileDeleted(e.data.id);
                    break;
                case "error":
                    this.onError(e.data.error);
                    break;
                case "directory-cleared":
                    this.onDirectoryCleared();
                    break;
            }
        }
    }

    onError(error) {
        // an error occurred.
        Logger.error(error);
    }

    static isSupported() {
        // Check if web worker is supported and supports specific functions
        return new Promise(async resolve => {
            if (!window.Worker || !window.isSecureContext) {
                resolve(false);
                return;
            }

            const fileDigesterWorker = new SWFileDigester();

            resolve(await fileDigesterWorker.checkSupport());

            fileDigesterWorker.fileWorker.terminate();
        })
    }

    checkSupport() {
        return new Promise(resolve => {
            this.resolveSupport = resolve;
            this.fileWorker.postMessage({
                type: "check-support"
            });
        })
    }

    onSupport(supported) {
        if (!this.resolveSupport) return;

        this.resolveSupport(supported);
        this.resolveSupport = null;
    }

    nextChunk(chunk, offset) {
        return new Promise(resolve => {
            this.digestChunk(chunk, offset);
            resolve();
        });
    }

    digestChunk(chunk, offset) {
        this.fileWorker.postMessage({
            type: "chunk",
            id: this.id,
            chunk: chunk,
            offset: offset
        });
    }

    onChunkWritten(chunkOffset) {
        Logger.debug("Chunk written at offset", chunkOffset);
    }

    getFile() {
        return new Promise(resolve => {
            this.resolveFile = resolve;

            this.fileWorker.postMessage({
                type: "get-file",
                id: this.id,
            });
        })
    }

    async getFileById(id) {
        const swFileDigester = new SWFileDigester(id);
        return await swFileDigester.getFile();
    }

    onFile(file) {
        this.resolveFile(file);
    }

    deleteFile() {
        return new Promise(resolve => {
            this.resolveDeletion = resolve;
            this.fileWorker.postMessage({
                type: "delete-file",
                id: this.id
            });
        });
    }

    static async deleteFileById(id) {
        const swFileDigester = new SWFileDigester(id);
        return await swFileDigester.deleteFile();
    }

    cleanUp() {
        // terminate service worker
        this.fileWorker.terminate();
        delete SWFileDigester.fileWorkers[this.id];
    }

    onFileDeleted(id) {
        // File Digestion complete -> Tidy up
        Logger.debug("File deleted:", id);
        this.resolveDeletion(id);
        this.cleanUp();
    }

    static clearDirectory() {
        for (let i = 0; i < SWFileDigester.fileWorkers.length; i++) {
            SWFileDigester.fileWorkers[i].terminate();
        }
        SWFileDigester.fileWorkers = [];

        const swFileDigester = new SWFileDigester();
        swFileDigester.fileWorker.postMessage({
            type: "clear-directory",
        });
    }

    onDirectoryCleared() {
        Logger.debug("All files on OPFS truncated.");
        this.cleanUp();
    }
}