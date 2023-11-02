const process = require('process')
const crypto = require('crypto')
const {spawn} = require('child_process')
const WebSocket = require('ws');
const fs = require('fs');
const parser = require('ua-parser-js');
const { uniqueNamesGenerator, animals, colors } = require('unique-names-generator');
const express = require('express');
const RateLimit = require('express-rate-limit');
const http = require('http');

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

// Arguments for deployment with Docker and Node.js
const DEBUG_MODE = process.env.DEBUG_MODE === "true";
const PORT = process.env.PORT || 3000;
const WS_FALLBACK = process.argv.includes('--include-ws-fallback') || process.env.WS_FALLBACK === "true";
const IPV6_LOCALIZE = parseInt(process.env.IPV6_LOCALIZE) || false;
const RTC_CONFIG = process.env.RTC_CONFIG
    ? JSON.parse(fs.readFileSync(process.env.RTC_CONFIG, 'utf8'))
    : {
        "sdpSemantics": "unified-plan",
        "iceServers": [
            {
                "urls": "stun:stun.l.google.com:19302"
            }
        ]
    };

let rateLimit = false;
if (process.argv.includes('--rate-limit') || process.env.RATE_LIMIT === "true") {
    rateLimit = 5;
} else {
    let envRateLimit = parseInt(process.env.RATE_LIMIT);
    if (!isNaN(envRateLimit)) {
        rateLimit = envRateLimit;
    }
}
const RATE_LIMIT = rateLimit;

// Arguments for deployment with Node.js only
const AUTO_START = process.argv.includes('--auto-restart');
const LOCALHOST_ONLY = process.argv.includes('--localhost-only');

if (DEBUG_MODE) {
    console.log("DEBUG_MODE is active. To protect privacy, do not use in production.");
    console.debug("\n");
    console.debug("----DEBUG ENVIRONMENT VARIABLES----")
    console.debug("DEBUG_MODE", DEBUG_MODE);
    console.debug("PORT", PORT);
    console.debug("WS_FALLBACK", WS_FALLBACK);
    console.debug("IPV6_LOCALIZE", IPV6_LOCALIZE);
    console.debug("RTC_CONFIG", RTC_CONFIG);
    console.debug("RATE_LIMIT", RATE_LIMIT);
    console.debug("AUTO_START", AUTO_START);
    console.debug("LOCALHOST_ONLY", LOCALHOST_ONLY);
    console.debug("\n");
}

if (AUTO_START) {
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

const app = express();

if (RATE_LIMIT) {
    const limiter = RateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 1000, // Limit each IP to 1000 requests per `window` (here, per 5 minutes)
        message: 'Too many requests from this IP Address, please try again after 5 minutes.',
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    })

    app.use(limiter);

    // ensure correct client ip and not the ip of the reverse proxy is used for rate limiting
    // see https://express-rate-limit.mintlify.app/guides/troubleshooting-proxy-issues
    app.set('trust proxy', RATE_LIMIT);

    if (!DEBUG_MODE) {
        console.log("Use DEBUG_MODE=true to find correct number for RATE_LIMIT.");
    }
}

if (WS_FALLBACK) {
    app.use(express.static('public_included_ws_fallback'));
} else {
    app.use(express.static('public'));
}

if (IPV6_LOCALIZE) {
    if (!(0 < IPV6_LOCALIZE && IPV6_LOCALIZE < 8)) {
        console.error("IPV6_LOCALIZE must be an integer between 1 and 7");
        return;
    }

    console.log("IPv6 client IPs will be localized to", IPV6_LOCALIZE, IPV6_LOCALIZE === 1 ? "segment" : "segments");
}

app.use(function(req, res) {
    if (DEBUG_MODE && RATE_LIMIT && req.path === "/ip") {
        console.debug("----DEBUG RATE_LIMIT----")
        console.debug("To find out the correct value for RATE_LIMIT go to '/ip' and ensure the returned IP-address is the IP-address of your client.")
        console.debug("See https://github.com/express-rate-limit/express-rate-limit#troubleshooting-proxy-issues for more info")
        console.debug("\n");
        res.send(req.ip);
    }

    res.redirect('/');
});

app.get('/', (req, res) => {
    res.sendFile('index.html');
});

const server = http.createServer(app);

if (LOCALHOST_ONLY) {
    server.listen(PORT, '127.0.0.1');
} else {
    server.listen(PORT);
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(err);
        console.info("Error EADDRINUSE received, exiting process without restarting process...");
        process.exit(0)
    }
});

class PairDropServer {

    constructor() {
        this._wss = new WebSocket.Server({ server });
        this._wss.on('connection', (socket, request) => this._onConnection(new Peer(socket, request)));

        this._rooms = {}; // { roomId: peers[] }
        this._roomSecrets = {}; // { pairKey: roomSecret }

        this._keepAliveTimers = {};

        console.log('PairDrop is running on port', PORT);
    }

    _onConnection(peer) {
        peer.socket.on('message', message => this._onMessage(peer, message));
        peer.socket.onerror = e => console.error(e);

        this._keepAlive(peer);

        this._send(peer, {
            type: 'rtc-config',
            config: RTC_CONFIG
        });

        // send displayName
        this._send(peer, {
            type: 'display-name',
            displayName: peer.name.displayName,
            deviceName: peer.name.deviceName,
            peerId: peer.id,
            peerIdHash: hasher.hashCodeSalted(peer.id)
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
                this._setKeepAliveTimerToNow(sender);
                break;
            case 'join-ip-room':
                this._joinIpRoom(sender);
                break;
            case 'room-secrets':
                this._onRoomSecrets(sender, message);
                break;
            case 'room-secrets-deleted':
                this._onRoomSecretsDeleted(sender, message);
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
            case 'regenerate-room-secret':
                this._onRegenerateRoomSecret(sender, message);
                break;
            case 'create-public-room':
                this._onCreatePublicRoom(sender);
                break;
            case 'join-public-room':
                this._onJoinPublicRoom(sender, message);
                break;
            case 'leave-public-room':
                this._onLeavePublicRoom(sender);
                break;
            case 'signal':
            default:
                this._signalAndRelay(sender, message);
        }
    }

    _signalAndRelay(sender, message) {
        const room = message.roomType === 'ip'
            ? sender.ip
            : message.roomId;

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
        this._disconnect(sender);
    }

    _disconnect(sender) {
        this._removePairKey(sender.pairKey);
        sender.pairKey = null;

        this._cancelKeepAlive(sender);
        delete this._keepAliveTimers[sender.id];

        this._leaveIpRoom(sender, true);
        this._leaveAllSecretRooms(sender, true);
        this._leavePublicRoom(sender, true);

        sender.socket.terminate();
    }

    _onRoomSecrets(sender, message) {
        if (!message.roomSecrets) return;

        const roomSecrets = message.roomSecrets.filter(roomSecret => {
            return /^[\x00-\x7F]{64,256}$/.test(roomSecret);
        })

        if (!roomSecrets) return;

        this._joinSecretRooms(sender, roomSecrets);
    }

    _onRoomSecretsDeleted(sender, message) {
        for (let i = 0; i<message.roomSecrets.length; i++) {
            this._deleteSecretRoom(message.roomSecrets[i]);
        }
    }

    _deleteSecretRoom(roomSecret) {
        const room = this._rooms[roomSecret];
        if (!room) return;

        for (const peerId in room) {
            const peer = room[peerId];

            this._leaveSecretRoom(peer, roomSecret, true);

            this._send(peer, {
                type: 'secret-room-deleted',
                roomSecret: roomSecret,
            });
        }
    }

    _onPairDeviceInitiate(sender) {
        let roomSecret = randomizer.getRandomString(256);
        let pairKey = this._createPairKey(sender, roomSecret);

        if (sender.pairKey) {
            this._removePairKey(sender.pairKey);
        }
        sender.pairKey = pairKey;

        this._send(sender, {
            type: 'pair-device-initiated',
            roomSecret: roomSecret,
            pairKey: pairKey
        });
        this._joinSecretRoom(sender, roomSecret);
    }

    _onPairDeviceJoin(sender, message) {
        if (sender.rateLimitReached()) {
            this._send(sender, { type: 'join-key-rate-limit' });
            return;
        }

        if (!this._roomSecrets[message.pairKey] || sender.id === this._roomSecrets[message.pairKey].creator.id) {
            this._send(sender, { type: 'pair-device-join-key-invalid' });
            return;
        }

        const roomSecret = this._roomSecrets[message.pairKey].roomSecret;
        const creator = this._roomSecrets[message.pairKey].creator;
        this._removePairKey(message.pairKey);
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
        this._joinSecretRoom(sender, roomSecret);
        this._removePairKey(sender.pairKey);
    }

    _onPairDeviceCancel(sender) {
        const pairKey = sender.pairKey

        if (!pairKey) return;

        this._removePairKey(pairKey);
        this._send(sender, {
            type: 'pair-device-canceled',
            pairKey: pairKey,
        });
    }

    _onCreatePublicRoom(sender) {
        let publicRoomId = randomizer.getRandomString(5, true).toLowerCase();

        this._send(sender, {
            type: 'public-room-created',
            roomId: publicRoomId
        });

        this._joinPublicRoom(sender, publicRoomId);
    }

    _onJoinPublicRoom(sender, message) {
        if (sender.rateLimitReached()) {
            this._send(sender, { type: 'join-key-rate-limit' });
            return;
        }

        if (!this._rooms[message.publicRoomId] && !message.createIfInvalid) {
            this._send(sender, { type: 'public-room-id-invalid', publicRoomId: message.publicRoomId });
            return;
        }

        this._leavePublicRoom(sender);
        this._joinPublicRoom(sender, message.publicRoomId);
    }

    _onLeavePublicRoom(sender) {
        this._leavePublicRoom(sender, true);
        this._send(sender, { type: 'public-room-left' });
    }

    _onRegenerateRoomSecret(sender, message) {
        const oldRoomSecret = message.roomSecret;
        const newRoomSecret = randomizer.getRandomString(256);

        // notify all other peers
        for (const peerId in this._rooms[oldRoomSecret]) {
            const peer = this._rooms[oldRoomSecret][peerId];
            this._send(peer, {
                type: 'room-secret-regenerated',
                oldRoomSecret: oldRoomSecret,
                newRoomSecret: newRoomSecret,
            });
            peer.removeRoomSecret(oldRoomSecret);
        }
        delete this._rooms[oldRoomSecret];
    }

    _createPairKey(creator, roomSecret) {
        let pairKey;
        do {
            // get randomInt until keyRoom not occupied
            pairKey = crypto.randomInt(1000000, 1999999).toString().substring(1); // include numbers with leading 0s
        } while (pairKey in this._roomSecrets)

        this._roomSecrets[pairKey] = {
            roomSecret: roomSecret,
            creator: creator
        }

        return pairKey;
    }

    _removePairKey(roomKey) {
        if (roomKey in this._roomSecrets) {
            this._roomSecrets[roomKey].creator.roomKey = null
            delete this._roomSecrets[roomKey];
        }
    }

    _joinIpRoom(peer) {
        this._joinRoom(peer, 'ip', peer.ip);
    }

    _joinSecretRoom(peer, roomSecret) {
        this._joinRoom(peer, 'secret', roomSecret);

        // add secret to peer
        peer.addRoomSecret(roomSecret);
    }

    _joinPublicRoom(peer, publicRoomId) {
        // prevent joining of 2 public rooms simultaneously
        this._leavePublicRoom(peer);

        this._joinRoom(peer, 'public-id', publicRoomId);

        peer.publicRoomId = publicRoomId;
    }

    _joinRoom(peer, roomType, roomId) {
        // roomType: 'ip', 'secret' or 'public-id'
        if (this._rooms[roomId] && this._rooms[roomId][peer.id]) {
            // ensures that otherPeers never receive `peer-left` after `peer-joined` on reconnect.
            this._leaveRoom(peer, roomType, roomId);
        }

        // if room doesn't exist, create it
        if (!this._rooms[roomId]) {
            this._rooms[roomId] = {};
        }

        this._notifyPeers(peer, roomType, roomId);

        // add peer to room
        this._rooms[roomId][peer.id] = peer;
    }


    _leaveIpRoom(peer, disconnect = false) {
        this._leaveRoom(peer, 'ip', peer.ip, disconnect);
    }

    _leaveSecretRoom(peer, roomSecret, disconnect = false) {
        this._leaveRoom(peer, 'secret', roomSecret, disconnect)

        //remove secret from peer
        peer.removeRoomSecret(roomSecret);
    }

    _leavePublicRoom(peer, disconnect = false) {
        if (!peer.publicRoomId) return;

        this._leaveRoom(peer, 'public-id', peer.publicRoomId, disconnect);

        peer.publicRoomId = null;
    }

    _leaveRoom(peer, roomType, roomId, disconnect = false) {
        if (!this._rooms[roomId] || !this._rooms[roomId][peer.id]) return;

        // remove peer from room
        delete this._rooms[roomId][peer.id];

        // delete room if empty and abort
        if (!Object.keys(this._rooms[roomId]).length) {
            delete this._rooms[roomId];
            return;
        }

        // notify all other peers that remain in room that peer left
        for (const otherPeerId in this._rooms[roomId]) {
            const otherPeer = this._rooms[roomId][otherPeerId];

            let msg = {
                type: 'peer-left',
                peerId: peer.id,
                roomType: roomType,
                roomId: roomId,
                disconnect: disconnect
            };

            this._send(otherPeer, msg);
        }
    }

    _notifyPeers(peer, roomType, roomId) {
        if (!this._rooms[roomId]) return;

        // notify all other peers that peer joined
        for (const otherPeerId in this._rooms[roomId]) {
            if (otherPeerId === peer.id) continue;
            const otherPeer = this._rooms[roomId][otherPeerId];

            let msg = {
                type: 'peer-joined',
                peer: peer.getInfo(),
                roomType: roomType,
                roomId: roomId
            };

            this._send(otherPeer, msg);
        }

        // notify peer about peers already in the room
        const otherPeers = [];
        for (const otherPeerId in this._rooms[roomId]) {
            if (otherPeerId === peer.id) continue;
            otherPeers.push(this._rooms[roomId][otherPeerId].getInfo());
        }

        let msg = {
            type: 'peers',
            peers: otherPeers,
            roomType: roomType,
            roomId: roomId
        };

        this._send(peer, msg);
    }

    _joinSecretRooms(peer, roomSecrets) {
        for (let i=0; i<roomSecrets.length; i++) {
            this._joinSecretRoom(peer, roomSecrets[i])
        }
    }

    _leaveAllSecretRooms(peer, disconnect = false) {
        for (let i=0; i<peer.roomSecrets.length; i++) {
            this._leaveSecretRoom(peer, peer.roomSecrets[i], disconnect);
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
        let timeout = 1000;

        if (!this._keepAliveTimers[peer.id]) {
            this._keepAliveTimers[peer.id] = {
                timer: 0,
                lastBeat: Date.now()
            };
        }

        if (Date.now() - this._keepAliveTimers[peer.id].lastBeat > 5 * timeout) {
            // Disconnect peer if unresponsive for 10s
            this._disconnect(peer);
            return;
        }

        this._send(peer, { type: 'ping' });

        this._keepAliveTimers[peer.id].timer = setTimeout(() => this._keepAlive(peer), timeout);
    }

    _cancelKeepAlive(peer) {
        if (this._keepAliveTimers[peer.id]?.timer) {
            clearTimeout(this._keepAliveTimers[peer.id].timer);
        }
    }

    _setKeepAliveTimerToNow(peer) {
        if (this._keepAliveTimers[peer.id]?.lastBeat) {
            this._keepAliveTimers[peer.id].lastBeat = Date.now();
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
        this._setPeerId(request);

        // is WebRTC supported ?
        this.rtcSupported = request.url.indexOf('webrtc') > -1;

        // set name
        this._setName(request);

        this.requestRate = 0;

        this.roomSecrets = [];
        this.roomKey = null;

        this.publicRoomId = null;
    }

    rateLimitReached() {
        // rate limit implementation: max 10 attempts every 10s
        if (this.requestRate >= 10) {
            return true;
        }
        this.requestRate += 1;
        setTimeout(() => this.requestRate -= 1, 10000);
        return false;
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

        let ipv6_was_localized = false;
        if (IPV6_LOCALIZE && this.ip.includes(':')) {
            this.ip = this.ip.split(':',IPV6_LOCALIZE).join(':');
            ipv6_was_localized = true;
        }

        if (DEBUG_MODE) {
            console.debug("----DEBUGGING-PEER-IP-START----");
            console.debug("remoteAddress:", request.connection.remoteAddress);
            console.debug("x-forwarded-for:", request.headers['x-forwarded-for']);
            console.debug("cf-connecting-ip:", request.headers['cf-connecting-ip']);
            if (ipv6_was_localized) {
                console.debug("IPv6 client IP was localized to", IPV6_LOCALIZE, IPV6_LOCALIZE > 1 ? "segments" : "segment");
            }
            console.debug("PairDrop uses:", this.ip);
            console.debug("IP is private:", this.ipIsPrivate(this.ip));
            console.debug("if IP is private, '127.0.0.1' is used instead");
            console.debug("----DEBUGGING-PEER-IP-END----");
        }

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
        const searchParams = new URL(request.url, "http://server").searchParams;
        let peerId = searchParams.get("peer_id");
        let peerIdHash = searchParams.get("peer_id_hash");
        if (peerId && Peer.isValidUuid(peerId) && this.isPeerIdHashValid(peerId, peerIdHash)) {
            this.id = peerId;
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
            seed: cyrb53(this.id)
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

    isPeerIdHashValid(peerId, peerIdHash) {
        return peerIdHash === hasher.hashCodeSalted(peerId);
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

const hasher = (() => {
    let password;
    return {
        hashCodeSalted(salt) {
            if (!password) {
                // password is created on first call.
                password = randomizer.getRandomString(128);
            }

            return crypto.createHash("sha3-512")
                .update(password)
                .update(crypto.createHash("sha3-512").update(salt, "utf8").digest("hex"))
                .digest("hex");
        }
    }
})()

const randomizer = (() => {
    let charCodeLettersOnly = r => 65 <= r && r <= 90;
    let charCodeAllPrintableChars = r => r === 45 || 47 <= r && r <= 57 || 64 <= r && r <= 90 || 97 <= r && r <= 122;

    return {
        getRandomString(length, lettersOnly = false) {
            const charCodeCondition = lettersOnly
                ? charCodeLettersOnly
                : charCodeAllPrintableChars;

            let string = "";
            while (string.length < length) {
                let arr = new Uint16Array(length);
                crypto.webcrypto.getRandomValues(arr);
                arr = Array.apply([], arr); /* turn into non-typed array */
                arr = arr.map(function (r) {
                    return r % 128
                })
                arr = arr.filter(function (r) {
                    /* strip non-printables: if we transform into desirable range we have a probability bias, so I suppose we better skip this character */
                    return charCodeCondition(r);
                });
                string += String.fromCharCode.apply(String, arr);
            }
            return string.substring(0, length)
        }
    }
})()

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

new PairDropServer();
