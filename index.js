const process = require('process')
const crypto = require('crypto')
const {spawn} = require('child_process')

// Handle SIGINT
process.on('SIGINT', () => {
    console.info("SIGINT Received, exiting...")
    process.exit(0)
})

// Handle SIGTERM
process.on('SIGTERM', () => {
    console.info("SIGTERM Received, exiting...")
    process.exit(0)
})

// Handle APP ERRORS
process.on('uncaughtException', (error, origin) => {
    console.log('----- Uncaught exception -----')
    console.log(error)
    console.log('----- Exception origin -----')
    console.log(origin)
})
process.on('unhandledRejection', (reason, promise) => {
    console.log('----- Unhandled Rejection at -----')
    console.log(promise)
    console.log('----- Reason -----')
    console.log(reason)
})

if (process.argv.includes('--auto-restart')) {
    process.on(
        'uncaughtException',
        () => {
            process.once(
                'exit',
                () => spawn(
                    process.argv.shift(),
                    process.argv,
                    {
                        cwd: process.cwd(),
                        detached: true,
                        stdio: 'inherit'
                    }
                )
            );
            process.exit();
        }
    );
}

const express = require('express');
const RateLimit = require('express-rate-limit');
const http = require('http');

const app = express();

if (process.argv.includes('--rate-limit')) {
    const limiter = RateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 1000, // Limit each IP to 1000 requests per `window` (here, per 5 minutes)
        message: 'Too many requests from this IP Address, please try again after 5 minutes.',
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    })

    app.use(limiter);
    // ensure correct client ip and not the ip of the reverse proxy is used for rate limiting on render.com
    // see https://github.com/express-rate-limit/express-rate-limit#troubleshooting-proxy-issues
    app.set('trust proxy', 5);
}

if (process.argv.includes('--include-ws-fallback')) {
    app.use(express.static('public_included_ws_fallback'));
} else {
    app.use(express.static('public'));
}

app.use(function(req, res) {
    res.redirect('/');
});

app.get('/', (req, res) => {
    res.sendFile('index.html');
});

const server = http.createServer(app);
const port = process.env.PORT || 3000;

if (process.argv.includes('--localhost-only')) {
    server.listen(port, '127.0.0.1');
} else {
    server.listen(port);
}

const parser = require('ua-parser-js');
const { uniqueNamesGenerator, animals, colors } = require('unique-names-generator');

class PairDropServer {

    constructor() {
        const WebSocket = require('ws');
        this._wss = new WebSocket.Server({ server });
        this._wss.on('connection', (socket, request) => this._onConnection(new Peer(socket, request)));

        this._rooms = {};
        this._roomSecrets = {};

        console.log('PairDrop is running on port', port);
    }

    _onConnection(peer) {
        this._joinRoom(peer);
        peer.socket.on('message', message => this._onMessage(peer, message));
        peer.socket.onerror = e => console.error(e);
        this._keepAlive(peer);

        // send displayName
        this._send(peer, {
            type: 'display-name',
            message: {
                displayName: peer.name.displayName,
                deviceName: peer.name.deviceName,
                peerId: peer.id
            }
        });
    }

    _onMessage(sender, message) {
        // Try to parse message
        try {
            message = JSON.parse(message);
        } catch (e) {
            return; // TODO: handle malformed JSON
        }

        switch (message.type) {
            case 'disconnect':
                this._onDisconnect(sender);
                break;
            case 'pong':
                sender.lastBeat = Date.now();
                break;
            case 'room-secrets':
                this._onRoomSecrets(sender, message);
                break;
            case 'room-secret-deleted':
                this._onRoomSecretDeleted(sender, message);
                break;
            case 'room-secrets-cleared':
                this._onRoomSecretsCleared(sender, message);
                break;
            case 'pair-device-initiate':
                this._onPairDeviceInitiate(sender);
                break;
            case 'pair-device-join':
                this._onPairDeviceJoin(sender, message);
                break;
            case 'pair-device-cancel':
                this._onPairDeviceCancel(sender);
                break;
            case 'resend-peers':
                this._notifyPeers(sender);
                break;
            case 'signal':
            default:
                this._signalAndRelay(sender, message);
        }
    }

    _signalAndRelay(sender, message) {
        const room = message.roomType === 'ip' ? sender.ip : message.roomSecret;

        // relay message to recipient
        if (message.to && Peer.isValidUuid(message.to) && this._rooms[room]) {
            const recipient = this._rooms[room][message.to];
            delete message.to;
            // add sender
            message.sender = {
                id: sender.id,
                rtcSupported: sender.rtcSupported
            };
            this._send(recipient, message);
        }
    }

    _onDisconnect(sender) {
        this._leaveRoom(sender, 'ip', '', true);
        this._leaveAllSecretRooms(sender, true);
        this._removeRoomKey(sender.roomKey);
        sender.roomKey = null;
    }

    _onRoomSecrets(sender, message) {
        const roomSecrets = message.roomSecrets.filter(roomSecret => {
            return /^[\x00-\x7F]{64}$/.test(roomSecret);
        })
        this._joinSecretRooms(sender, roomSecrets);
    }

    _onRoomSecretDeleted(sender, message) {
        this._deleteSecretRoom(sender, message.roomSecret)
    }

    _onRoomSecretsCleared(sender, message) {
        for (let i = 0; i<message.roomSecrets.length; i++) {
            this._deleteSecretRoom(sender, message.roomSecrets[i]);
        }
    }

    _deleteSecretRoom(sender, roomSecret) {
        const room = this._rooms[roomSecret];
        if (room) {
            for (const peerId in room) {
                const peer = room[peerId];
                this._leaveRoom(peer, 'secret', roomSecret);
                this._send(peer, {
                    type: 'secret-room-deleted',
                    roomSecret: roomSecret,
                });
            }
        }
        this._notifyPeers(sender);
    }

    getRandomString(length) {
        let string = "";
        while (string.length < length) {
            let arr = new Uint16Array(length);
            crypto.webcrypto.getRandomValues(arr);
            arr = Array.apply([], arr); /* turn into non-typed array */
            arr = arr.map(function (r) {
                return r % 128
            })
            arr = arr.filter(function (r) {
                /* strip non-printables: if we transform into desirable range we have a propability bias, so I suppose we better skip this character */
                return r === 45 || r >= 47 && r <= 57 || r >= 64 && r <= 90 || r >= 97 && r <= 122;
            });
            string += String.fromCharCode.apply(String, arr);
        }
        return string.substring(0, length)
    }

    _onPairDeviceInitiate(sender) {
        let roomSecret = this.getRandomString(64);
        let roomKey = this._createRoomKey(sender, roomSecret);
        if (sender.roomKey) this._removeRoomKey(sender.roomKey);
        sender.roomKey = roomKey;
        this._send(sender, {
            type: 'pair-device-initiated',
            roomSecret: roomSecret,
            roomKey: roomKey
        });
        this._joinRoom(sender, 'secret', roomSecret);
    }

    _onPairDeviceJoin(sender, message) {
        if (sender.roomKeyRate >= 10) {
            this._send(sender, { type: 'pair-device-join-key-rate-limit' });
            return;
        }
        sender.roomKeyRate += 1;
        setTimeout(_ => sender.roomKeyRate -= 1, 10000);
        if (!this._roomSecrets[message.roomKey] || sender.id === this._roomSecrets[message.roomKey].creator.id) {
            this._send(sender, { type: 'pair-device-join-key-invalid' });
            return;
        }
        const roomSecret = this._roomSecrets[message.roomKey].roomSecret;
        const creator = this._roomSecrets[message.roomKey].creator;
        this._removeRoomKey(message.roomKey);
        this._send(sender, {
            type: 'pair-device-joined',
            roomSecret: roomSecret,
            peerId: creator.id
        });
        this._send(creator, {
            type: 'pair-device-joined',
            roomSecret: roomSecret,
            peerId: sender.id
        });
        this._joinRoom(sender, 'secret', roomSecret);
        this._removeRoomKey(sender.roomKey);
    }

    _onPairDeviceCancel(sender) {
        if (sender.roomKey) {
            this._send(sender, {
                type: 'pair-device-canceled',
                roomKey: sender.roomKey,
            });
            this._removeRoomKey(sender.roomKey);
        }
    }

    _createRoomKey(creator, roomSecret) {
        let roomKey;
        do {
            // get randomInt until keyRoom not occupied
            roomKey = crypto.randomInt(1000000, 1999999).toString().substring(1); // include numbers with leading 0s
        } while (roomKey in this._roomSecrets)

        this._roomSecrets[roomKey] = {
            roomSecret: roomSecret,
            creator: creator
        }

        return roomKey;
    }

    _removeRoomKey(roomKey) {
        if (roomKey in this._roomSecrets) {
            this._roomSecrets[roomKey].creator.roomKey = null
            delete this._roomSecrets[roomKey];
        }
    }

    _joinRoom(peer, roomType = 'ip', roomSecret = '') {
        const room = roomType === 'ip' ? peer.ip : roomSecret;

        // if room doesn't exist, create it
        if (!this._rooms[room]) {
            this._rooms[room] = {};
        }

        this._notifyPeers(peer, roomType, roomSecret);

        // add peer to room
        this._rooms[room][peer.id] = peer;
        // add secret to peer
        if (roomType === 'secret') {
            peer.addRoomSecret(roomSecret);
        }
    }

    _leaveRoom(peer, roomType = 'ip', roomSecret = '', disconnect = false) {
        const room = roomType === 'ip' ? peer.ip : roomSecret;

        if (!this._rooms[room] || !this._rooms[room][peer.id]) return;
        this._cancelKeepAlive(this._rooms[room][peer.id]);

        // delete the peer
        delete this._rooms[room][peer.id];

        if (roomType === 'ip') {
            peer.socket.terminate();
        }

        //if room is empty, delete the room
        if (!Object.keys(this._rooms[room]).length) {
            delete this._rooms[room];
        } else {
            // notify all other peers
            for (const otherPeerId in this._rooms[room]) {
                const otherPeer = this._rooms[room][otherPeerId];
                this._send(otherPeer, {
                    type: 'peer-left',
                    peerId: peer.id,
                    roomType: roomType,
                    roomSecret: roomSecret,
                    disconnect: disconnect
                });
            }
        }
        //remove secret from peer
        if (roomType === 'secret') {
            peer.removeRoomSecret(roomSecret);
        }
    }

    _notifyPeers(peer, roomType = 'ip', roomSecret = '') {
        const room = roomType === 'ip' ? peer.ip : roomSecret;
        if (!this._rooms[room]) return;

        // notify all other peers
        for (const otherPeerId in this._rooms[room]) {
            if (otherPeerId === peer.id) continue;
            const otherPeer = this._rooms[room][otherPeerId];
            this._send(otherPeer, {
                type: 'peer-joined',
                peer: peer.getInfo(),
                roomType: roomType,
                roomSecret: roomSecret
            });
        }

        // notify peer about the other peers
        const otherPeers = [];
        for (const otherPeerId in this._rooms[room]) {
            if (otherPeerId === peer.id) continue;
            otherPeers.push(this._rooms[room][otherPeerId].getInfo());
        }

        this._send(peer, {
            type: 'peers',
            peers: otherPeers,
            roomType: roomType,
            roomSecret: roomSecret
        });
    }

    _joinSecretRooms(peer, roomSecrets) {
        for (let i=0; i<roomSecrets.length; i++) {
            this._joinRoom(peer, 'secret', roomSecrets[i])
        }
    }

    _leaveAllSecretRooms(peer, disconnect = false) {
        for (let i=0; i<peer.roomSecrets.length; i++) {
            this._leaveRoom(peer, 'secret', peer.roomSecrets[i], disconnect);
        }
    }

    _send(peer, message) {
        if (!peer) return;
        if (this._wss.readyState !== this._wss.OPEN) return;
        message = JSON.stringify(message);
        peer.socket.send(message);
    }

    _keepAlive(peer) {
        this._cancelKeepAlive(peer);
        let timeout = 500;
        if (!peer.lastBeat) {
            peer.lastBeat = Date.now();
        }
        if (Date.now() - peer.lastBeat > 2 * timeout) {
            this._leaveRoom(peer);
            this._leaveAllSecretRooms(peer);
            return;
        }

        this._send(peer, { type: 'ping' });

        peer.timerId = setTimeout(() => this._keepAlive(peer), timeout);
    }

    _cancelKeepAlive(peer) {
        if (peer && peer.timerId) {
            clearTimeout(peer.timerId);
        }
    }
}



class Peer {

    constructor(socket, request) {
        // set socket
        this.socket = socket;

        // set remote ip
        this._setIP(request);

        // set peer id
        this._setPeerId(request)

        // is WebRTC supported ?
        this.rtcSupported = request.url.indexOf('webrtc') > -1;

        // set name
        this._setName(request);

        // for keepalive
        this.timerId = 0;
        this.lastBeat = Date.now();

        this.roomSecrets = [];
        this.roomKey = null;
        this.roomKeyRate = 0;
    }

    _setIP(request) {
        if (request.headers['cf-connecting-ip']) {
            this.ip = request.headers['cf-connecting-ip'].split(/\s*,\s*/)[0];
        } else if (request.headers['x-forwarded-for']) {
            this.ip = request.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
        } else {
            this.ip = request.connection.remoteAddress;
        }

        // remove the prefix used for IPv4-translated addresses
        if (this.ip.substring(0,7) === "::ffff:")
            this.ip = this.ip.substring(7);

        // IPv4 and IPv6 use different values to refer to localhost
        // put all peers on the same network as the server into the same room as well
        if (this.ip === '::1' || this.ipIsPrivate(this.ip)) {
            this.ip = '127.0.0.1';
        }
    }

    ipIsPrivate(ip) {
        // if ip is IPv4
        if (!ip.includes(":")) {
            //         10.0.0.0 - 10.255.255.255        ||   172.16.0.0 - 172.31.255.255                          ||    192.168.0.0 - 192.168.255.255
            return  /^(10)\.(.*)\.(.*)\.(.*)$/.test(ip) || /^(172)\.(1[6-9]|2[0-9]|3[0-1])\.(.*)\.(.*)$/.test(ip) || /^(192)\.(168)\.(.*)\.(.*)$/.test(ip)
        }

        // else: ip is IPv6
        const firstWord = ip.split(":").find(el => !!el); //get first not empty word

        // The original IPv6 Site Local addresses (fec0::/10) are deprecated. Range: fec0 - feff
        if (/^fe[c-f][0-f]$/.test(firstWord))
            return true;

        // These days Unique Local Addresses (ULA) are used in place of Site Local.
        // Range: fc00 - fcff
        else if (/^fc[0-f]{2}$/.test(firstWord))
            return true;

        // Range: fd00 - fcff
        else if (/^fd[0-f]{2}$/.test(firstWord))
            return true;

        // Link local addresses (prefixed with fe80) are not routable
        else if (firstWord === "fe80")
            return true;

        // Discard Prefix
        else if (firstWord === "100")
            return true;

        // Any other IP address is not Unique Local Address (ULA)
        return false;
    }

    _setPeerId(request) {
        let peer_id = new URL(request.url, "http://server").searchParams.get("peer_id");
        if (peer_id && Peer.isValidUuid(peer_id)) {
            this.id = peer_id;
        } else {
            this.id = crypto.randomUUID();
        }
    }

    toString() {
        return `<Peer id=${this.id} ip=${this.ip} rtcSupported=${this.rtcSupported}>`
    }

    _setName(req) {
        let ua = parser(req.headers['user-agent']);


        let deviceName = '';

        if (ua.os && ua.os.name) {
            deviceName = ua.os.name.replace('Mac OS', 'Mac') + ' ';
        }

        if (ua.device.model) {
            deviceName += ua.device.model;
        } else {
            deviceName += ua.browser.name;
        }

        if(!deviceName)
            deviceName = 'Unknown Device';

        const displayName = uniqueNamesGenerator({
            length: 2,
            separator: ' ',
            dictionaries: [colors, animals],
            style: 'capital',
            seed: this.id.hashCode()
        })

        this.name = {
            model: ua.device.model,
            os: ua.os.name,
            browser: ua.browser.name,
            type: ua.device.type,
            deviceName,
            displayName
        };
    }

    getInfo() {
        return {
            id: this.id,
            name: this.name,
            rtcSupported: this.rtcSupported
        }
    }

    static isValidUuid(uuid) {
        return /^([0-9]|[a-f]){8}-(([0-9]|[a-f]){4}-){3}([0-9]|[a-f]){12}$/.test(uuid);
    }

    addRoomSecret(roomSecret) {
        if (!(roomSecret in this.roomSecrets)) {
            this.roomSecrets.push(roomSecret);
        }
    }

    removeRoomSecret(roomSecret) {
        if (roomSecret in this.roomSecrets) {
            delete this.roomSecrets[roomSecret];
        }
    }
}

Object.defineProperty(String.prototype, 'hashCode', {
    value: function() {
        var hash = 0, i, chr;
        for (i = 0; i < this.length; i++) {
            chr   = this.charCodeAt(i);
            hash  = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }
});

new PairDropServer();
