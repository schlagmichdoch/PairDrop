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
        console.log("Loading config...")
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.addEventListener("load", () => {
                if (xhr.status === 200) {
                    // Config received
                    let config = JSON.parse(xhr.responseText);
                    console.log("Config loaded:", config)
                    this._config = config;
                    Events.fire('config', config);
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
        if (this._isConnected() || this._isConnecting() || this._isOffline()) return;
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
        console.log('WS: server connected');
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
        if (messageJSON.type !== 'ping' && messageJSON.type !== 'ws-relay') console.log('WS receive:', messageJSON);
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
                    console.log("WS receive: message type is for websocket fallback only but websocket fallback is not activated on this instance.")
                }
                break;
            default:
                console.error('WS receive: unknown message type', messageJSON);
        }
    }

    send(msg) {
        if (!this._isConnected()) return;
        if (msg.type !== 'pong' && msg.type !== 'ws-relay') console.log("WS send:", msg)
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
                console.log("successfully added peerId to localStorage");

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
        let wsServerDomain = this._config.signalingServer
            ? this._config.signalingServer
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
                console.log("successfully removed peerId from localStorage");
            });

        if (!this._socket) return;

        this._socket.onclose = null;
        this._socket.close();
        this._socket = null;
        Events.fire('ws-disconnected');
        this._isReconnect = true;
    }

    _onDisconnect() {
        console.log('WS: server disconnected');
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
        console.error(e);
    }

    _reconnect() {
        this._disconnect();
        this._connect();
    }
}

class Peer {

    constructor(serverConnection, isCaller, peerId, roomType, roomId) {
        this._server = serverConnection;
        this._isCaller = isCaller;
        this._peerId = peerId;

        this._roomIds = {};
        this._updateRoomIds(roomType, roomId);

        this._filesQueue = [];
        this._busy = false;

        // evaluate auto accept
        this._evaluateAutoAccept();
    }

    // Is overwritten in expanding classes
    _onServerSignalMessage(message) {}

    // Is overwritten in expanding classes
    _refresh() {}

    _onDisconnected() {}

    _setIsCaller(isCaller) {
        this._isCaller = isCaller;
    }

    // Is overwritten in expanding classes
    _sendMessage(message) {}

    // Is overwritten in expanding classes
    _sendData(data) {}

    _sendDisplayName(displayName) {
        this._sendMessage({type: 'display-name-changed', displayName: displayName});
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
                    if (deletedRoomSecret) console.log("Successfully deleted duplicate room secret with same peer: ", deletedRoomSecret);
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
            console.log('RoomSecret is regenerated to increase security')
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
        if (this._digester) {
            // Reconnection during receiving of file. Send request for restart
            const offset = this._digester._bytesReceived;
            this._requestResendFromOffset(offset);
        }
    }

    async requestFileTransfer(files) {
        let header = [];
        let totalSize = 0;
        let imagesOnly = true
        for (let i=0; i<files.length; i++) {
            Events.fire('set-progress', {peerId: this._peerId, progress: 0.8*i/files.length, status: 'prepare'})
            header.push({
                name: files[i].name,
                mime: files[i].type,
                size: files[i].size
            });
            totalSize += files[i].size;
            if (files[i].type.split('/')[0] !== 'image') imagesOnly = false;
        }

        Events.fire('set-progress', {peerId: this._peerId, progress: 0.8, status: 'prepare'})

        let dataUrl = '';
        if (files[0].type.split('/')[0] === 'image') {
            try {
                dataUrl = await getThumbnailAsDataUrl(files[0], 400, null, 0.9);
            } catch (e) {
                console.error(e);
            }
        }

        Events.fire('set-progress', {peerId: this._peerId, progress: 1, status: 'prepare'})

        this._filesRequested = files;

        this._sendMessage({type: 'request',
            header: header,
            totalSize: totalSize,
            imagesOnly: imagesOnly,
            thumbnailDataUrl: dataUrl
        });
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'wait'})
    }

    sendFiles() {
        for (let i = 0; i < this._filesRequested.length; i++) {
            this._filesQueue.push(this._filesRequested[i]);
        }
        this._filesRequested = null
        if (this._busy) return;
        this._dequeueFile();
    }

    _dequeueFile() {
        this._busy = true;
        const file = this._filesQueue.shift();
        this._sendFile(file);
    }

    _sendHeader(file) {
        this._sendMessage({
            type: 'header',
            size: file.size,
            name: file.name,
            mime: file.type
        });
    }

    // Is overwritten in expanding classes
    _sendFile(file) {}

    _requestResendFromOffset(offset) {
        this._sendMessage({ type: 'request-resend-from-offset', offset: offset });
    }

    _onRequestResendFromOffset(offset) {
        console.log("Restart requested from offset:", offset)
        if (!this._chunker) return;
        this._chunker._restartFromOffset(offset);
    }

    _sendProgress(progress) {
        this._sendMessage({ type: 'progress', progress: progress });
    }

    _onData(data) {
        this._onChunkReceived(data);
    }

    _onMessage(message) {
        switch (message.type) {
            case 'request':
                this._onFilesTransferRequest(message);
                break;
            case 'header':
                this._onFileHeader(message);
                break;
            case 'progress':
                this._onProgress(message.progress);
                break;
            case 'bytes-received-confirmation':
                this._onBytesReceivedConfirmation(message.bytesReceived);
                break;
            case 'request-resend-from-offset':
                this._onRequestResendFromOffset(message.offset);
                break;
            case 'files-transfer-response':
                this._onFileTransferRequestResponded(message);
                break;
            case 'file-transfer-complete':
                this._onFileTransferCompleted();
                break;
            case 'message-transfer-complete':
                this._onMessageTransferCompleted();
                break;
            case 'text':
                this._onTextReceived(message);
                break;
            case 'display-name-changed':
                this._onDisplayNameChanged(message);
                break;
            default:
                console.warn('RTC: Unknown message type:', message.type);
        }
    }

    _onFilesTransferRequest(request) {
        if (this._requestPending) {
            // Only accept one request at a time per peer
            this._sendMessage({type: 'files-transfer-response', accepted: false});
            return;
        }
        if (window.iOS && request.totalSize >= 200*1024*1024) {
            // iOS Safari can only put 400MB at once to memory.
            // Request to send them in chunks of 200MB instead:
            this._sendMessage({type: 'files-transfer-response', accepted: false, reason: 'ios-memory-limit'});
            return;
        }

        this._requestPending = request;

        if (this._autoAccept) {
            // auto accept if set via Edit Paired Devices Dialog
            this._respondToFileTransferRequest(true);
            return;
        }

        // default behavior: show user transfer request
        Events.fire('files-transfer-request', {
            request: request,
            peerId: this._peerId
        });
    }

    _respondToFileTransferRequest(accepted) {
        this._sendMessage({type: 'files-transfer-response', accepted: accepted});
        if (accepted) {
            this._requestAccepted = this._requestPending;
            this._totalBytesReceived = 0;
            this._busy = true;
            this._filesReceived = [];
        }
        this._requestPending = null;
    }

    _onFileHeader(header) {
        if (this._requestAccepted && this._requestAccepted.header.length) {
            this._lastProgress = 0;
            this._addFileDigester(header);
        }
    }

    _addFileDigester(header) {}

    _sendBytesReceivedConfirmation(bytesReceived) {
        this._sendMessage({type: 'bytes-received-confirmation', bytesReceived: bytesReceived});
    }

    _abortTransfer() {
        Events.fire('set-progress', {peerId: this._peerId, progress: 1, status: 'wait'});
        Events.fire('notify-user', Localization.getTranslation("notifications.files-incorrect"));
        this._filesReceived = [];
        this._requestAccepted = null;
        this._digester = null;
        throw new Error("Received files differ from requested files. Abort!");
    }

    _onChunkReceived(chunk) {
        if(!this._digester || !(chunk.byteLength || chunk.size)) return;

        this._digester.unchunk(chunk);

        const progress = this._digester.progress;

        if (progress > 1) {
            this._abortTransfer();
            return;
        }

        if (progress === 1) {
            this._digester = null;
        }

        Events.fire('set-progress', {peerId: this._peerId, progress: progress, status: 'receive'});

        // occasionally notify sender about our progress
        if (progress - this._lastProgress >= 0.005 || progress === 1) {
            this._lastProgress = progress;
            this._sendProgress(progress);
        }
    }

    _onProgress(progress) {
        Events.fire('set-progress', {peerId: this._peerId, progress: progress, status: 'transfer'});
    }

    _onBytesReceivedConfirmation(bytesReceived) {
        if (!this._chunker) return;
        this._chunker._onBytesReceived(bytesReceived);
    }

    async _onFileReceived(fileBlob) {
        const acceptedHeader = this._requestAccepted.header.shift();
        this._totalBytesReceived += fileBlob.size;

        this._sendMessage({type: 'file-transfer-complete'});

        const sameSize = fileBlob.size === acceptedHeader.size;
        const sameName = fileBlob.name === acceptedHeader.name
        if (!sameSize || !sameName) {
            this._abortTransfer();
        }

        // include for compatibility with 'Snapdrop & PairDrop for Android' app
        Events.fire('file-received', fileBlob);

        this._filesReceived.push(fileBlob);

        if (this._requestAccepted.header.length) return;

        // We are done receiving
        this._busy = false;
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'process'});
        Events.fire('files-received', {
            peerId: this._peerId,
            files: this._filesReceived,
            imagesOnly: this._requestAccepted.imagesOnly,
            totalSize: this._requestAccepted.totalSize
        });
        this._filesReceived = [];
        this._requestAccepted = null;
    }

    _onFileTransferCompleted() {
        this._chunker = null;
        if (this._filesQueue.length) {
            this._dequeueFile();
            return;
        }

        // No more files in queue. Transfer is complete
        this._busy = false;
        Events.fire('notify-user', Localization.getTranslation("notifications.file-transfer-completed"));
        Events.fire('files-sent'); // used by 'Snapdrop & PairDrop for Android' app
    }

    _onFileTransferRequestResponded(message) {
        if (!message.accepted) {
            Events.fire('set-progress', {peerId: this._peerId, progress: 1, status: 'wait'});
            this._filesRequested = null;
            if (message.reason === 'ios-memory-limit') {
                Events.fire('notify-user', Localization.getTranslation("notifications.ios-memory-limit"));
            }
            return;
        }
        Events.fire('file-transfer-accepted');
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'transfer'});
        this.sendFiles();
    }

    _onMessageTransferCompleted() {
        Events.fire('notify-user', Localization.getTranslation("notifications.message-transfer-completed"));
    }

    sendText(text) {
        const unescaped = btoa(unescape(encodeURIComponent(text)));
        this._sendMessage({ type: 'text', text: unescaped });
    }

    _onTextReceived(message) {
        if (!message.text) return;
        const escaped = decodeURIComponent(escape(atob(message.text)));
        Events.fire('text-received', { text: escaped, peerId: this._peerId });
        this._sendMessage({ type: 'message-transfer-complete' });
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
                    console.log(`Successfully updated DisplayName for roomSecretEntry ${roomSecretEntry.key}`);
                })
        }

        Events.fire('peer-display-name-changed', {peerId: this._peerId, displayName: message.displayName});
        Events.fire('notify-peer-display-name-changed', this._peerId);
    }
}

class RTCPeer extends Peer {

    constructor(serverConnection, isCaller, peerId, roomType, roomId, rtcConfig) {
        super(serverConnection, isCaller, peerId, roomType, roomId);

        this.rtcSupported = true;
        this.rtcConfig = rtcConfig;

        this.pendingInboundMessages = [];
        this.pendingOutboundMessages = [];

        Events.on('beforeunload', e => this._onBeforeUnload(e));
        Events.on('pagehide', _ => this._onPageHide());

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

        this._evaluatePendingInboundMessages()
            .then((count) => {
                if (count) {
                    console.log("Pending inbound messages evaluated.");
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
        console.log('RTC: Negotiation needed');

        if (this._isCaller) {
            // Creating offer if required
            console.log('RTC: Creating offer');
            const description = await this._conn.createOffer();
            await this._handleLocalDescription(description);
        }
    }

    _onSignalingStateChanged() {
        console.log('RTC: Signaling state changed:', this._conn.signalingState);
    }

    _onIceConnectionStateChange() {
        console.log('RTC: ICE connection state changed:', this._conn.iceConnectionState);
    }

    _onIceGatheringStateChanged() {
        console.log('RTC: ICE gathering state changed:', this._conn.iceConnectionState);
    }

    _onConnectionStateChange() {
        console.log('RTC: Connection state changed:', this._conn.connectionState);
        switch (this._conn.connectionState) {
            case 'disconnected':
                this._refresh();
                break;
            case 'failed':
                console.warn('RTC connection failed');
                // Todo: if error is "TURN server needed" -> fallback to WS if activated
                this._refresh();
        }
    }

    _onIceCandidate(event) {
        this._handleLocalCandidate(event.candidate);
    }

    _onIceCandidateError(error) {
        console.error(error);
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
        console.log(`RTC: Channel ${e.target.label} opened with`, this._peerId);

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
        console.log(`RTC: Channel ${e.target.label} closed`, this._peerId);
        this._refresh();
    }

    _onChannelError(e) {
        console.warn(`RTC: Channel ${e.target.label} error`, this._peerId);
        console.error(e.error);
    }


    async _handleLocalDescription(localDescription) {
        await this._conn.setLocalDescription(localDescription);

        console.log("RTC: Sending local description");
        this._sendSignal({ signalType: 'description', description: localDescription });
    }

    async _handleRemoteDescription(remoteDescription) {
        console.log("RTC: Received remote description");
        await this._conn.setRemoteDescription(remoteDescription);

        if (!this._isCaller) {
            // Creating answer if required
            console.log('RTC: Creating answer');
            const localDescription = await this._conn.createAnswer();
            await this._handleLocalDescription(localDescription);
        }
    }

    _handleLocalCandidate(candidate) {
        if (this.localIceCandidatesSent) return;

        console.log("RTC: Local candidate created", candidate);

        if (candidate === null) {
            this.localIceCandidatesSent = true;
            return;
        }

        this._sendSignal({ signalType: 'candidate', candidate: candidate });
    }

    async _handleRemoteCandidate(candidate) {
        if (this.remoteIceCandidatesReceived) return;

        console.log("RTC: Received remote candidate", candidate);

        if (candidate === null) {
            this.remoteIceCandidatesReceived = true;
            return;
        }

        await this._conn.addIceCandidate(candidate);
    }

    async _evaluatePendingInboundMessages() {
        let inboundMessagesEvaluatedCount = 0;
        while (this.pendingInboundMessages.length > 0) {
            const message = this.pendingInboundMessages.shift();
            console.log("Evaluate pending inbound message:", message);
            await this._onServerSignalMessage(message);
            inboundMessagesEvaluatedCount++;
        }
        return inboundMessagesEvaluatedCount;
    }

    async _onServerSignalMessage(message) {
        if (this._conn === null) {
            this.pendingInboundMessages.push(message);
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
                console.warn('Unknown signalType:', message.signalType);
                break;
        }
    }

    _disconnect() {
        Events.fire('peer-disconnected', this._peerId);
    }

    _refresh() {
        Events.fire('peer-connecting', this._peerId);
        this._closeChannelAndConnection();

        this._connect(); // reopen the channel
    }

    _onDisconnected() {
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
        this.localIceCandidatesSent = false;
        this.remoteIceCandidatesReceived = false;
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

    _sendMessage(message) {
        if (!this._stable() || this.pendingOutboundMessages.length > 0) {
            // queue messages if not connected OR if connected AND queue is not empty
            this.pendingOutboundMessages.push(message);
            return;
        }
        this._sendViaMessageChannel(message);
    }

    _sendViaMessageChannel(message) {
        console.log('RTC Send:', message);
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
        this._sendHeader(file);
        this._chunker = new FileChunkerRTC(
            file,
            chunk => this._sendData(chunk),
            this._conn,
            this._dataChannel
        );
        this._chunker._readChunk();
    }

    _onMessage(message) {
        // Todo: Test speed increase without prints? --> print only on debug mode via URL argument `?debug_mode=true`
        console.log('RTC Receive:', JSON.parse(message));
        try {
            message = JSON.parse(message);
        } catch (e) {
            console.warn("RTCPeer: Received JSON is malformed");
            return;
        }
        super._onMessage(message);
    }

    _addFileDigester(header) {
        this._digester = new FileDigester({size: header.size, name: header.name, mime: header.mime},
            this._requestAccepted.totalSize,
            this._totalBytesReceived,
            fileBlob => this._onFileReceived(fileBlob)
        );
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

    _onMessage(message) {
        console.log('WS Receive:', message);
        super._onMessage(message);
    }

    _addFileDigester(header) {
        this._digester = new FileDigester({size: header.size, name: header.name, mime: header.mime},
            this._requestAccepted.totalSize,
            this._totalBytesReceived,
            fileBlob => this._onFileReceived(fileBlob),
            bytesReceived => this._sendBytesReceivedConfirmation(bytesReceived)
        );
    }

    _onWsRelay(message) {
        try {
            message = JSON.parse(message).message;
        }
        catch (e) {
            console.warn("WSPeer: Received JSON is malformed");
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
        this.signalSuccessful = false;
    }

    getConnectionHash() {
        // Todo: implement SubtleCrypto asymmetric encryption and create connectionHash from public keys
        return "";
    }
}

class PeersManager {

    constructor(serverConnection) {
        this.peers = {};
        this._server = serverConnection;
        Events.on('signal', e => this._onSignal(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('files-selected', e => this._onFilesSelected(e.detail));
        Events.on('respond-to-files-transfer-request', e => this._onRespondToFileTransferRequest(e.detail))
        Events.on('send-text', e => this._onSendText(e.detail));
        Events.on('peer-left', e => this._onPeerLeft(e.detail));
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('peer-connected', e => this._onPeerConnected(e.detail.peerId));
        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));

        // this device closes connection
        Events.on('room-secrets-deleted', e => this._onRoomSecretsDeleted(e.detail));
        Events.on('leave-public-room', e => this._onLeavePublicRoom(e.detail));

        // peer closes connection
        Events.on('secret-room-deleted', e => this._onSecretRoomDeleted(e.detail));

        Events.on('room-secret-regenerated', e => this._onRoomSecretRegenerated(e.detail));
        Events.on('display-name', e => this._onDisplayName(e.detail.displayName));
        Events.on('self-display-name-changed', e => this._notifyPeersDisplayNameChanged(e.detail));
        Events.on('notify-peer-display-name-changed', e => this._notifyPeerDisplayNameChanged(e.detail));
        Events.on('auto-accept-updated', e => this._onAutoAcceptUpdated(e.detail.roomSecret, e.detail.autoAccept));
        Events.on('ws-disconnected', _ => this._onWsDisconnected());
        Events.on('ws-relay', e => this._onWsRelay(e.detail.peerId, e.detail.message));
        Events.on('ws-config', e => this._onWsConfig(e.detail));
    }

    _onWsConfig(wsConfig) {
        this._wsConfig = wsConfig;
    }

    _onSignal(message) {
        const peerId = message.sender.id;
        this.peers[peerId]._onServerSignalMessage(message);
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
            this.createPeer(isCaller, peerId, roomType, roomId, rtcSupported);
        }
    }

    createPeer(isCaller, peerId, roomType, roomId, rtcSupported) {
        if (window.isRtcSupported && rtcSupported) {
            this.peers[peerId] = new RTCPeer(this._server, isCaller, peerId, roomType, roomId, this._wsConfig.rtcConfig);
        }
        else if (this._wsConfig.wsFallback) {
            this.peers[peerId] = new WSPeer(this._server, isCaller, peerId, roomType, roomId);
        }
        else {
            console.warn("Websocket fallback is not activated on this instance.\n" +
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
        this.peers[detail.to]._respondToFileTransferRequest(detail.accepted);
    }

    async _onFilesSelected(message) {
        let files = await mime.addMissingMimeTypesToFiles(message.files);
        await this.peers[message.to].requestFileTransfer(files);
    }

    _onSendText(message) {
        this.peers[message.to].sendText(message.text);
    }

    _onPeerLeft(message) {
        if (this._peerExists(message.peerId) && !this._webRtcSupported(message.peerId)) {
            console.log('WSPeer left:', message.peerId);
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
                        console.log("successfully removed other peerIds from localStorage");
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
        for (let i=0; i<roomSecrets.length; i++) {
            this._disconnectOrRemoveRoomTypeByRoomId('secret', roomSecrets[i]);
        }
    }

    _onLeavePublicRoom(publicRoomId) {
        this._disconnectOrRemoveRoomTypeByRoomId('public-id', publicRoomId);
    }

    _onSecretRoomDeleted(roomSecret) {
        this._disconnectOrRemoveRoomTypeByRoomId('secret', roomSecret);
    }

    _disconnectOrRemoveRoomTypeByRoomId(roomType, roomId) {
        const peerIds = this._getPeerIdsFromRoomId(roomId);

        if (!peerIds.length) return;

        for (let i=0; i<peerIds.length; i++) {
            this._disconnectOrRemoveRoomTypeByPeerId(peerIds[i], roomType);
        }
    }

    _disconnectOrRemoveRoomTypeByPeerId(peerId, roomType) {
        const peer = this.peers[peerId];

        if (!peer) return;

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
                console.log("successfully regenerated room secret");
                Events.fire("room-secrets", [message.newRoomSecret]);
            })
    }

    _notifyPeersDisplayNameChanged(newDisplayName) {
        this._displayName = newDisplayName ? newDisplayName : this._originalDisplayName;
        for (const peerId in this.peers) {
            this._notifyPeerDisplayNameChanged(peerId);
        }
    }

    _notifyPeerDisplayNameChanged(peerId) {
        const peer = this.peers[peerId];
        if (!peer) return;
        this.peers[peerId]._sendDisplayName(this._displayName);
    }

    _onDisplayName(displayName) {
        this._originalDisplayName = displayName;
        // if the displayName has not been changed (yet) set the displayName to the original displayName
        if (!this._displayName) this._displayName = displayName;
    }

    _onAutoAcceptUpdated(roomSecret, autoAccept) {
        const peerId = this._getPeerIdsFromRoomId(roomSecret)[0];

        if (!peerId) return;

        this.peers[peerId]._setAutoAccept(autoAccept);
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
        if (this._currentlySending) return;

        this._currentlySending = true;
        const chunk = this._file.slice(this._bytesSent, this._bytesSent + this._chunkSize);
        this._reader.readAsArrayBuffer(chunk);
    }

    _onChunkRead(chunk) {}

    _onBytesReceived(bytesReceived) {}

    _restartFromOffset(offset) {
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

        this._highWatermark = 4194304; // 4 MB
        this._lowWatermark = 1048576; // 1 MB

        // Set buffer threshold
        this._dataChannel.bufferedAmountLowThreshold = this._lowWatermark;
        this._dataChannel.addEventListener('bufferedamountlow', _ => this._readChunk());
    }

    _onChunkRead(chunk) {
        this._currentlySending = false;

        this._onChunk(chunk);
        this._bytesSent += chunk.byteLength;

        // Pause sending when reaching the high watermark or file end
        if (this._dataChannel.bufferedAmount > this._highWatermark || this._isFileEnd()) return;

        this._readChunk();
    }

    _onBytesReceived(bytesReceived) {
        this._bytesReceived = bytesReceived;
    }
}

class FileChunkerWS extends FileChunker {

    constructor(file, onChunkCallback) {
        super(file, onChunkCallback);
    }

    _onChunkRead(chunk) {
        this._currentlySending = false;

        this._onChunk(chunk);
        this._bytesSent += chunk.byteLength;

        // if too many bytes sent without confirmation by receiver or if end of file -> abort
        const bytesCurrentlySent = this._bytesSent - this._bytesReceived;
        if (bytesCurrentlySent > this._maxBytesSentWithoutConfirmation - this._chunkSize || this._isFileEnd()) return;

        this._readChunk();
    }

    _onBytesReceived(bytesReceived) {
        this._bytesReceived = bytesReceived;
        this._readChunk();
    }
}

class FileDigester {

    constructor(meta, totalSize, totalBytesReceived, fileCompleteCallback, bytesReceivedCallback = null) {
        this._buffer = [];
        this._bytesReceived = 0;
        this._bytesReceivedSinceLastTime = 0;
        this._maxBytesWithoutConfirmation = 1048576; // 1 MB
        this._bytesReceivedCallback = bytesReceivedCallback
        this._size = meta.size;
        this._name = meta.name;
        this._mime = meta.mime;
        this._totalSize = totalSize;
        this._totalBytesReceived = totalBytesReceived;
        this._onFileCompleteCallback = fileCompleteCallback;
    }

    unchunk(chunk) {
        this._buffer.push(chunk);
        this._bytesReceived += chunk.byteLength || chunk.size;
        this._bytesReceivedSinceLastTime += chunk.byteLength || chunk.size;

        // If more than half of maxBytesWithoutConfirmation received -> request more
        if (this._bytesReceivedCallback && 2 * this._bytesReceivedSinceLastTime > this._maxBytesWithoutConfirmation) {
            this._bytesReceivedCallback(this._bytesReceived);
            this._bytesReceivedSinceLastTime = 0;
        }

        this.progress = (this._totalBytesReceived + this._bytesReceived) / this._totalSize;
        if (isNaN(this.progress)) this.progress = 1

        if (this._bytesReceived < this._size) return;

        // we are done
        const blob = new Blob(this._buffer)
        this._buffer = null;
        this._onFileCompleteCallback(new File([blob], this._name, {
            type: this._mime,
            lastModified: new Date().getTime()
        }));
    }

}
