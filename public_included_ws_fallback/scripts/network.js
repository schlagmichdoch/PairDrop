window.URL = window.URL || window.webkitURL;
window.isRtcSupported = !!(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection);

class ServerConnection {

    constructor() {
        this._connect();
        Events.on('pagehide', _ => this._disconnect());
        document.addEventListener('visibilitychange', _ => this._onVisibilityChange());
        if (navigator.connection) navigator.connection.addEventListener('change', _ => this._reconnect());
        Events.on('room-secrets', e => this._sendRoomSecrets(e.detail));
        Events.on('room-secret-deleted', e => this.send({ type: 'room-secret-deleted', roomSecret: e.detail}));
        Events.on('room-secrets-cleared', e => this.send({ type: 'room-secrets-cleared', roomSecrets: e.detail}));
        Events.on('resend-peers', _ => this.send({ type: 'resend-peers'}));
        Events.on('pair-device-initiate', _ => this._onPairDeviceInitiate());
        Events.on('pair-device-join', e => this._onPairDeviceJoin(e.detail));
        Events.on('pair-device-cancel', _ => this.send({ type: 'pair-device-cancel' }));
        Events.on('offline', _ => clearTimeout(this._reconnectTimer));
        Events.on('online', _ => this._connect());
    }

    _connect() {
        clearTimeout(this._reconnectTimer);
        if (this._isConnected() || this._isConnecting()) return;
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
        if (this._isReconnect) Events.fire('notify-user', 'Connected.');
    }

    _sendRoomSecrets(roomSecrets) {
        this.send({ type: 'room-secrets', roomSecrets: roomSecrets });
    }

    _onPairDeviceInitiate() {
        if (!this._isConnected()) {
            Events.fire('notify-user', 'You need to be online to pair devices.');
            return;
        }
        this.send({ type: 'pair-device-initiate' })
    }

    _onPairDeviceJoin(roomKey) {
        if (!this._isConnected()) {
            setTimeout(_ => this._onPairDeviceJoin(roomKey), 1000);
            return;
        }
        this.send({ type: 'pair-device-join', roomKey: roomKey })
    }

    _setRtcConfig(config) {
        window.rtcConfig = config;
    }

    _onMessage(msg) {
        msg = JSON.parse(msg);
        if (msg.type !== 'ping') console.log('WS:', msg);
        switch (msg.type) {
            case 'rtc-config':
                this._setRtcConfig(msg.config);
                break;
            case 'peers':
                Events.fire('peers', msg);
                break;
            case 'peer-joined':
                Events.fire('peer-joined', msg);
                break;
            case 'peer-left':
                Events.fire('peer-left', msg);
                break;
            case 'signal':
                Events.fire('signal', msg);
                break;
            case 'ping':
                this.send({ type: 'pong' });
                break;
            case 'display-name':
                this._onDisplayName(msg);
                break;
            case 'pair-device-initiated':
                Events.fire('pair-device-initiated', msg);
                break;
            case 'pair-device-joined':
                Events.fire('pair-device-joined', msg);
                break;
            case 'pair-device-join-key-invalid':
                Events.fire('pair-device-join-key-invalid');
                break;
            case 'pair-device-canceled':
                Events.fire('pair-device-canceled', msg.roomKey);
                break;
            case 'pair-device-join-key-rate-limit':
                Events.fire('notify-user', 'Rate limit reached. Wait 10 seconds and try again.');
                break;
            case 'secret-room-deleted':
                Events.fire('secret-room-deleted', msg.roomSecret);
                break;
            case 'request':
            case 'header':
            case 'partition':
            case 'partition-received':
            case 'progress':
            case 'files-transfer-response':
            case 'file-transfer-complete':
            case 'message-transfer-complete':
            case 'text':
            case 'display-name-changed':
            case 'ws-chunk':
                Events.fire('ws-relay', JSON.stringify(msg));
                break;
            default:
                console.error('WS: unknown message type', msg);
        }
    }

    send(msg) {
        if (!this._isConnected()) return;
        this._socket.send(JSON.stringify(msg));
    }

    _onDisplayName(msg) {
        sessionStorage.setItem("peerId", msg.message.peerId);
        sessionStorage.setItem("peerIdHash", msg.message.peerIdHash);
        Events.fire('display-name', msg);
    }

    _endpoint() {
        // hack to detect if deployment or development environment
        const protocol = location.protocol.startsWith('https') ? 'wss' : 'ws';
        const webrtc = window.isRtcSupported ? '/webrtc' : '/fallback';
        let ws_url = new URL(protocol + '://' + location.host + location.pathname + 'server' + webrtc);
        const peerId = sessionStorage.getItem("peerId");
        const peerIdHash = sessionStorage.getItem("peerIdHash");
        if (peerId && peerIdHash) {
            ws_url.searchParams.append('peer_id', peerId);
            ws_url.searchParams.append('peer_id_hash', peerIdHash);
        }
        return ws_url.toString();
    }

    _disconnect() {
        this.send({ type: 'disconnect' });
        if (this._socket) {
            this._socket.onclose = null;
            this._socket.close();
            this._socket = null;
            Events.fire('ws-disconnected');
            this._isReconnect = true;
        }
    }

    _onDisconnect() {
        console.log('WS: server disconnected');
        Events.fire('notify-user', 'Connecting..');
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(_ => this._connect(), 1000);
        Events.fire('ws-disconnected');
        this._isReconnect = true;
    }

    _onVisibilityChange() {
        if (document.hidden) return;
        this._connect();
    }

    _isConnected() {
        return this._socket && this._socket.readyState === this._socket.OPEN;
    }

    _isConnecting() {
        return this._socket && this._socket.readyState === this._socket.CONNECTING;
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

    constructor(serverConnection, peerId, roomType, roomSecret) {
        this._server = serverConnection;
        this._peerId = peerId;
        this._roomType = roomType;
        this._roomSecret = roomSecret;
        this._filesQueue = [];
        this._busy = false;
    }

    sendJSON(message) {
        this._send(JSON.stringify(message));
    }

    sendDisplayName(displayName) {
        this.sendJSON({type: 'display-name-changed', displayName: displayName});
    }

    async createHeader(file) {
        return {
            name: file.name,
            mime: file.type,
            size: file.size,
        };
    }

    getResizedImageDataUrl(file, width = undefined, height = undefined, quality = 0.7) {
        return new Promise((resolve, reject) => {
            let image = new Image();
            image.src = URL.createObjectURL(file);
            image.onload = _ => {
                let imageWidth = image.width;
                let imageHeight = image.height;
                let canvas = document.createElement('canvas');

                // resize the canvas and draw the image data into it
                if (width && height) {
                    canvas.width = width;
                    canvas.height = height;
                } else if (width) {
                    canvas.width = width;
                    canvas.height = Math.floor(imageHeight * width / imageWidth)
                } else if (height) {
                    canvas.width = Math.floor(imageWidth * height / imageHeight);
                    canvas.height = height;
                } else {
                    canvas.width = imageWidth;
                    canvas.height = imageHeight
                }

                var ctx = canvas.getContext("2d");
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

                let dataUrl = canvas.toDataURL("image/jpeg", quality);
                resolve(dataUrl);
            }
            image.onerror = _ => reject(`Could not create an image thumbnail from type ${file.type}`);
        }).then(dataUrl => {
            return dataUrl;
        }).catch(e => console.error(e));
    }

    async requestFileTransfer(files) {
        let header = [];
        let totalSize = 0;
        let imagesOnly = true
        for (let i=0; i<files.length; i++) {
            Events.fire('set-progress', {peerId: this._peerId, progress: 0.8*i/files.length, status: 'prepare'})
            header.push(await this.createHeader(files[i]));
            totalSize += files[i].size;
            if (files[i].type.split('/')[0] !== 'image') imagesOnly = false;
        }

        Events.fire('set-progress', {peerId: this._peerId, progress: 0.8, status: 'prepare'})

        let dataUrl = '';
        if (files[0].type.split('/')[0] === 'image') {
            dataUrl = await this.getResizedImageDataUrl(files[0], 400, null, 0.9);
        }

        Events.fire('set-progress', {peerId: this._peerId, progress: 1, status: 'prepare'})

        this._filesRequested = files;

        this.sendJSON({type: 'request',
            header: header,
            totalSize: totalSize,
            imagesOnly: imagesOnly,
            thumbnailDataUrl: dataUrl
        });
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'wait'})
    }

    async sendFiles() {
        for (let i=0; i<this._filesRequested.length; i++) {
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

    async _sendFile(file) {
        this.sendJSON({
            type: 'header',
            size: file.size,
            name: file.name,
            mime: file.type
        });
        this._chunker = new FileChunker(file,
            chunk => this._send(chunk),
            offset => this._onPartitionEnd(offset));
        this._chunker.nextPartition();
    }

    _onPartitionEnd(offset) {
        this.sendJSON({ type: 'partition', offset: offset });
    }

    _onReceivedPartitionEnd(offset) {
        this.sendJSON({ type: 'partition-received', offset: offset });
    }

    _sendNextPartition() {
        if (!this._chunker || this._chunker.isFileEnd()) return;
        this._chunker.nextPartition();
    }

    _sendProgress(progress) {
        this.sendJSON({ type: 'progress', progress: progress });
    }

    _onMessage(message) {
        if (typeof message !== 'string') {
            this._onChunkReceived(message);
            return;
        }
        const messageJSON = JSON.parse(message);
        switch (messageJSON.type) {
            case 'request':
                this._onFilesTransferRequest(messageJSON);
                break;
            case 'header':
                this._onFileHeader(messageJSON);
                break;
            case 'partition':
                this._onReceivedPartitionEnd(messageJSON);
                break;
            case 'partition-received':
                this._sendNextPartition();
                break;
            case 'progress':
                this._onDownloadProgress(messageJSON.progress);
                break;
            case 'files-transfer-response':
                this._onFileTransferRequestResponded(messageJSON);
                break;
            case 'file-transfer-complete':
                this._onFileTransferCompleted();
                break;
            case 'message-transfer-complete':
                this._onMessageTransferCompleted();
                break;
            case 'text':
                this._onTextReceived(messageJSON);
                break;
            case 'display-name-changed':
                this._onDisplayNameChanged(messageJSON);
                break;
        }
    }

    _onFilesTransferRequest(request) {
        if (this._requestPending) {
            // Only accept one request at a time
            this.sendJSON({type: 'files-transfer-response', accepted: false});
            return;
        }
        if (window.iOS && request.totalSize >= 200*1024*1024) {
            // iOS Safari can only put 400MB at once to memory.
            // Request to send them in chunks of 200MB instead:
            this.sendJSON({type: 'files-transfer-response', accepted: false, reason: 'ios-memory-limit'});
            return;
        }

        this._requestPending = request;
        Events.fire('files-transfer-request', {
            request: request,
            peerId: this._peerId
        });
    }

    _respondToFileTransferRequest(accepted) {
        this.sendJSON({type: 'files-transfer-response', accepted: accepted});
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
            this._digester = new FileDigester({size: header.size, name: header.name, mime: header.mime},
                this._requestAccepted.totalSize,
                this._totalBytesReceived,
                fileBlob => this._onFileReceived(fileBlob)
            );
        }
    }

    _abortTransfer() {
        Events.fire('set-progress', {peerId: this._peerId, progress: 1, status: 'wait'});
        Events.fire('notify-user', 'Files are incorrect.');
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
        }

        this._onDownloadProgress(progress);

        // occasionally notify sender about our progress
        if (progress - this._lastProgress < 0.005 && progress !== 1) return;
        this._lastProgress = progress;
        this._sendProgress(progress);
    }

    _onDownloadProgress(progress) {
        Events.fire('set-progress', {peerId: this._peerId, progress: progress, status: 'transfer'});
    }

    async _onFileReceived(fileBlob) {
        const acceptedHeader = this._requestAccepted.header.shift();
        this._totalBytesReceived += fileBlob.size;

        this.sendJSON({type: 'file-transfer-complete'});

        const sameSize = fileBlob.size === acceptedHeader.size;
        const sameName = fileBlob.name === acceptedHeader.name
        if (!sameSize || !sameName) {
            this._abortTransfer();
        }

        // include for compatibility with Snapdrop for Android app
        Events.fire('file-received', fileBlob);

        this._filesReceived.push(fileBlob);
        if (!this._requestAccepted.header.length) {
            this._busy = false;
            Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'process'});
            Events.fire('files-received', {sender: this._peerId, files: this._filesReceived, imagesOnly: this._requestAccepted.imagesOnly, totalSize: this._requestAccepted.totalSize});
            this._filesReceived = [];
            this._requestAccepted = null;
        }
    }

    _onFileTransferCompleted() {
        this._chunker = null;
        if (!this._filesQueue.length) {
            this._busy = false;
            Events.fire('notify-user', 'File transfer completed.');
        } else {
            this._dequeueFile();
        }
    }

    _onFileTransferRequestResponded(message) {
        if (!message.accepted) {
            Events.fire('set-progress', {peerId: this._peerId, progress: 1, status: 'wait'});
            this._filesRequested = null;
            if (message.reason === 'ios-memory-limit') {
                Events.fire('notify-user', "Sending files to iOS is only possible up to 200MB at once");
            }
            return;
        }
        Events.fire('file-transfer-accepted');
        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'transfer'});
        this.sendFiles();
    }

    _onMessageTransferCompleted() {
        Events.fire('notify-user', 'Message transfer completed.');
    }

    sendText(text) {
        const unescaped = btoa(unescape(encodeURIComponent(text)));
        this.sendJSON({ type: 'text', text: unescaped });
    }

    _onTextReceived(message) {
        if (!message.text) return;
        const escaped = decodeURIComponent(escape(atob(message.text)));
        Events.fire('text-received', { text: escaped, peerId: this._peerId });
        this.sendJSON({ type: 'message-transfer-complete' });
    }

    _onDisplayNameChanged(message) {
        if (!message.displayName || this._displayName === message.displayName) return;
        this._displayName = message.displayName;
        Events.fire('peer-display-name-changed', {peerId: this._peerId, displayName: message.displayName});
    }
}

class RTCPeer extends Peer {

    constructor(serverConnection, peerId, roomType, roomSecret) {
        super(serverConnection, peerId, roomType, roomSecret);
        this.rtcSupported = true;
        if (!peerId) return; // we will listen for a caller
        this._connect(peerId, true);
    }

    _connect(peerId, isCaller) {
        if (!this._conn || this._conn.signalingState === "closed") this._openConnection(peerId, isCaller);

        if (isCaller) {
            this._openChannel();
        } else {
            this._conn.ondatachannel = e => this._onChannelOpened(e);
        }
    }

    _openConnection(peerId, isCaller) {
        this._isCaller = isCaller;
        this._peerId = peerId;
        this._conn = new RTCPeerConnection(window.rtcConfig);
        this._conn.onicecandidate = e => this._onIceCandidate(e);
        this._conn.onicecandidateerror = e => this._onError(e);
        this._conn.onconnectionstatechange = _ => this._onConnectionStateChange();
        this._conn.oniceconnectionstatechange = e => this._onIceConnectionStateChange(e);
    }

    _openChannel() {
        if (!this._conn) return;
        const channel = this._conn.createDataChannel('data-channel', {
            ordered: true,
            reliable: true // Obsolete. See https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/reliable
        });
        channel.onopen = e => this._onChannelOpened(e);
        channel.onerror = e => this._onError(e);
        this._conn.createOffer().then(d => this._onDescription(d)).catch(e => this._onError(e));
    }

    _onDescription(description) {
        // description.sdp = description.sdp.replace('b=AS:30', 'b=AS:1638400');
        this._conn.setLocalDescription(description)
            .then(_ => this._sendSignal({ sdp: description }))
            .catch(e => this._onError(e));
    }

    _onIceCandidate(event) {
        if (!event.candidate) return;
        this._sendSignal({ ice: event.candidate });
    }

    onServerMessage(message) {
        if (!this._conn) this._connect(message.sender.id, false);

        if (message.sdp) {
            this._conn.setRemoteDescription(message.sdp)
                .then( _ => {
                    if (message.sdp.type === 'offer') {
                        return this._conn.createAnswer()
                            .then(d => this._onDescription(d));
                    }
                })
                .catch(e => this._onError(e));
        } else if (message.ice) {
            this._conn.addIceCandidate(new RTCIceCandidate(message.ice))
                .catch(e => this._onError(e));
        }
    }

    _onChannelOpened(event) {
        console.log('RTC: channel opened with', this._peerId);
        const channel = event.channel || event.target;
        channel.binaryType = 'arraybuffer';
        channel.onmessage = e => this._onMessage(e.data);
        channel.onclose = _ => this._onChannelClosed();
        this._channel = channel;
        Events.on('beforeunload', e => this._onBeforeUnload(e));
        Events.on('pagehide', _ => this._onPageHide());
        Events.fire('peer-connected', {peerId: this._peerId, connectionHash: this.getConnectionHash()});
    }

    _onMessage(message) {
        if (typeof message === 'string') {
            console.log('RTC:', JSON.parse(message));
        }
        super._onMessage(message);
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

    _onBeforeUnload(e) {
        if (this._busy) {
            e.preventDefault();
            return "There are unfinished transfers. Are you sure you want to close?";
        }
    }

    _onPageHide() {
        this._disconnect();
    }

    _disconnect() {
        if (this._conn && this._channel) {
            this._channel.onclose = null;
            this._channel.close();
        }
        Events.fire('peer-disconnected', this._peerId);
    }

    _onChannelClosed() {
        console.log('RTC: channel closed', this._peerId);
        Events.fire('peer-disconnected', this._peerId);
        if (!this._isCaller) return;
        this._connect(this._peerId, true); // reopen the channel
    }

    _onConnectionStateChange() {
        console.log('RTC: state changed:', this._conn.connectionState);
        switch (this._conn.connectionState) {
            case 'disconnected':
                Events.fire('peer-disconnected', this._peerId);
                this._onError('rtc connection disconnected');
                break;
            case 'failed':
                Events.fire('peer-disconnected', this._peerId);
                this._onError('rtc connection failed');
                break;
        }
    }

    _onIceConnectionStateChange() {
        switch (this._conn.iceConnectionState) {
            case 'failed':
                this._onError('ICE Gathering failed');
                break;
            default:
                console.log('ICE Gathering', this._conn.iceConnectionState);
        }
    }

    _onError(error) {
        console.error(error);
    }

    _send(message) {
        if (!this._channel) this.refresh();
        this._channel.send(message);
    }

    _sendSignal(signal) {
        signal.type = 'signal';
        signal.to = this._peerId;
        signal.roomType = this._roomType;
        signal.roomSecret = this._roomSecret;
        this._server.send(signal);
    }

    refresh() {
        // check if channel is open. otherwise create one
        if (this._isConnected() || this._isConnecting()) return;
        this._connect(this._peerId, this._isCaller);
    }

    _isConnected() {
        return this._channel && this._channel.readyState === 'open';
    }

    _isConnecting() {
        return this._channel && this._channel.readyState === 'connecting';
    }

    sendDisplayName(displayName) {
        if (!this._isConnected()) return;
        super.sendDisplayName(displayName);
    }
}

class WSPeer extends Peer {

    constructor(serverConnection, peerId, roomType, roomSecret) {
        super(serverConnection, peerId, roomType, roomSecret);
        this.rtcSupported = false;
        if (!peerId) return; // we will listen for a caller
        this._isCaller = true;
        this._sendSignal();
    }

    _send(chunk) {
        this.sendJSON({
            type: 'ws-chunk',
            chunk: arrayBufferToBase64(chunk)
        });
    }

    sendJSON(message) {
        console.debug(message)
        message.to = this._peerId;
        message.roomType = this._roomType;
        message.roomSecret = this._roomSecret;
        this._server.send(message);
    }

    _sendSignal(connected = false) {
        this.sendJSON({type: 'signal', connected: connected});
    }

    onServerMessage(message) {
        this._peerId = message.sender.id;
        Events.fire('peer-connected', {peerId: message.sender.id, connectionHash: this.getConnectionHash()})
        if (message.connected) return;
        this._sendSignal(true);
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
        Events.on('signal', e => this._onMessage(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('files-selected', e => this._onFilesSelected(e.detail));
        Events.on('respond-to-files-transfer-request', e => this._onRespondToFileTransferRequest(e.detail))
        Events.on('send-text', e => this._onSendText(e.detail));
        Events.on('peer-left', e => this._onPeerLeft(e.detail));
        Events.on('peer-connected', e => this._onPeerConnected(e.detail.peerId));
        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));
        Events.on('secret-room-deleted', e => this._onSecretRoomDeleted(e.detail));
        Events.on('display-name', e => this._onDisplayName(e.detail.message.displayName));
        Events.on('self-display-name-changed', e => this._notifyPeersDisplayNameChanged(e.detail));
        Events.on('peer-display-name-changed', e => this._notifyPeerDisplayNameChanged(e.detail.peerId));
        Events.on('ws-disconnected', _ => this._onWsDisconnected());
        Events.on('ws-relay', e => this._onWsRelay(e.detail));
    }

    _onMessage(message) {
        // if different roomType -> abort
        if (this.peers[message.sender.id] && this.peers[message.sender.id]._roomType !== message.roomType) return;
        if (!this.peers[message.sender.id]) {
            if (window.isRtcSupported && message.sender.rtcSupported) {
                this.peers[message.sender.id] = new RTCPeer(this._server, undefined, message.roomType, message.roomSecret);
            } else {
                this.peers[message.sender.id] = new WSPeer(this._server, undefined, message.roomType, message.roomSecret);
            }
        }
        this.peers[message.sender.id].onServerMessage(message);
    }

    _onWsRelay(message) {
        const messageJSON = JSON.parse(message)
        if (messageJSON.type === 'ws-chunk') message = base64ToArrayBuffer(messageJSON.chunk);
        this.peers[messageJSON.sender.id]._onMessage(message)
    }

    _onPeers(msg) {
        msg.peers.forEach(peer => {
            if (this.peers[peer.id]) {
                // if different roomType -> abort
                if (this.peers[peer.id].roomType !== msg.roomType || this.peers[peer.id].roomSecret !== msg.roomSecret) return;
                this.peers[peer.id].refresh();
                return;
            }
            if (window.isRtcSupported && peer.rtcSupported) {
                this.peers[peer.id] = new RTCPeer(this._server, peer.id, msg.roomType, msg.roomSecret);
            } else {
                this.peers[peer.id] = new WSPeer(this._server, peer.id, msg.roomType, msg.roomSecret);
            }
        })
    }

    _onRespondToFileTransferRequest(detail) {
        this.peers[detail.to]._respondToFileTransferRequest(detail.accepted);
    }

    _onFilesSelected(message) {
        let inputFiles = Array.from(message.files);
        delete message.files;
        let files = [];
        const l = inputFiles.length;
        for (let i=0; i<l; i++) {
            // when filetype is empty guess via suffix
            const inputFile = inputFiles.shift();
            const file = inputFile.type
                ? inputFile
                : new File([inputFile], inputFile.name, {type: mime.getMimeByFilename(inputFile.name)});
            files.push(file)
        }
        this.peers[message.to].requestFileTransfer(files);
    }

    _onSendText(message) {
        this.peers[message.to].sendText(message.text);
    }

    _onPeerLeft(msg) {
        if (this.peers[msg.peerId] && (!this.peers[msg.peerId].rtcSupported || !window.isRtcSupported)) {
            console.log('WSPeer left:', msg.peerId);
            Events.fire('peer-disconnected', msg.peerId);
        } else if (msg.disconnect === true) {
            // if user actively disconnected from PairDrop server, disconnect all peer to peer connections immediately
            Events.fire('peer-disconnected', msg.peerId);
        }
    }

    _onPeerConnected(peerId) {
        this._notifyPeerDisplayNameChanged(peerId);
    }

    _onWsDisconnected() {
        for (const peerId in this.peers) {
            console.debug(this.peers[peerId].rtcSupported);
            if (this.peers[peerId] && (!this.peers[peerId].rtcSupported || !window.isRtcSupported)) {
                Events.fire('peer-disconnected', peerId);
            }
        }
    }

    _onPeerDisconnected(peerId) {
        const peer = this.peers[peerId];
        delete this.peers[peerId];
        if (!peer || !peer._conn) return;
        if (peer._channel) peer._channel.onclose = null;
        peer._conn.close();
        peer._busy = false;
    }

    _onSecretRoomDeleted(roomSecret) {
        for (const peerId in this.peers) {
            const peer = this.peers[peerId];
            if (peer._roomSecret === roomSecret) {
                this._onPeerDisconnected(peerId);
            }
        }
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
        this.peers[peerId].sendDisplayName(this._displayName);
    }

    _onDisplayName(displayName) {
        this._originalDisplayName = displayName;
    }
}

class FileChunker {

    constructor(file, onChunk, onPartitionEnd) {
        this._chunkSize = 64000; // 64 KB
        this._maxPartitionSize = 1e6; // 1 MB
        this._offset = 0;
        this._partitionSize = 0;
        this._file = file;
        this._onChunk = onChunk;
        this._onPartitionEnd = onPartitionEnd;
        this._reader = new FileReader();
        this._reader.addEventListener('load', e => this._onChunkRead(e.target.result));
    }

    nextPartition() {
        this._partitionSize = 0;
        this._readChunk();
    }

    _readChunk() {
        const chunk = this._file.slice(this._offset, this._offset + this._chunkSize);
        this._reader.readAsArrayBuffer(chunk);
    }

    _onChunkRead(chunk) {
        this._offset += chunk.byteLength;
        this._partitionSize += chunk.byteLength;
        this._onChunk(chunk);
        if (this.isFileEnd()) return;
        if (this._isPartitionEnd()) {
            this._onPartitionEnd(this._offset);
            return;
        }
        this._readChunk();
    }

    repeatPartition() {
        this._offset -= this._partitionSize;
        this.nextPartition();
    }

    _isPartitionEnd() {
        return this._partitionSize >= this._maxPartitionSize;
    }

    isFileEnd() {
        return this._offset >= this._file.size;
    }
}

class FileDigester {

    constructor(meta, totalSize, totalBytesReceived, callback) {
        this._buffer = [];
        this._bytesReceived = 0;
        this._size = meta.size;
        this._name = meta.name;
        this._mime = meta.mime;
        this._totalSize = totalSize;
        this._totalBytesReceived = totalBytesReceived;
        this._callback = callback;
    }

    unchunk(chunk) {
        this._buffer.push(chunk);
        this._bytesReceived += chunk.byteLength || chunk.size;
        this.progress = (this._totalBytesReceived + this._bytesReceived) / this._totalSize;
        if (isNaN(this.progress)) this.progress = 1

        if (this._bytesReceived < this._size) return;
        // we are done
        const blob = new Blob(this._buffer)
        this._buffer = null;
        this._callback(new File([blob], this._name, {
            type: this._mime,
            lastModified: new Date().getTime()
        }));
    }

}

class Events {
    static fire(type, detail) {
        window.dispatchEvent(new CustomEvent(type, { detail: detail }));
    }

    static on(type, callback, options = false) {
        return window.addEventListener(type, callback, options);
    }

    static off(type, callback, options = false) {
        return window.removeEventListener(type, callback, options);
    }
}
