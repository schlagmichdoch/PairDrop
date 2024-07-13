import crypto from "crypto";
import parser from "ua-parser-js";
import {animals, colors, uniqueNamesGenerator} from "unique-names-generator";
import {cyrb53, hasher} from "./helper.js";

export default class Peer {

    constructor(socket, request, conf) {
        this.conf = conf

        // set socket
        this.socket = socket;

        // set remote ip
        this._setIP(request);

        // set peer id
        this._setPeerId(request);

        // is WebRTC supported
        this._setRtcSupported(request);

        // set name
        this._setName(request);

        this.requestRate = 0;

        this.roomSecrets = [];
        this.pairKey = null;

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
        }
        else if (request.headers['x-forwarded-for']) {
            this.ip = request.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
        }
        else {
            this.ip = request.socket.remoteAddress ?? '';
        }

        // remove the prefix used for IPv4-translated addresses
        if (this.ip.substring(0,7) === "::ffff:") {
            this.ip = this.ip.substring(7);
        }

        let ipv6_was_localized = false;
        if (this.conf.ipv6Localize && this.ip.includes(':')) {
            this.ip = this.ip.split(':',this.conf.ipv6Localize).join(':');
            ipv6_was_localized = true;
        }

        if (this.conf.debugMode) {
            console.debug("\n");
            console.debug("----DEBUGGING-PEER-IP-START----");
            console.debug("remoteAddress:", request.connection.remoteAddress);
            console.debug("x-forwarded-for:", request.headers['x-forwarded-for']);
            console.debug("cf-connecting-ip:", request.headers['cf-connecting-ip']);
            if (ipv6_was_localized) {
                console.debug("IPv6 client IP was localized to", this.conf.ipv6Localize, this.conf.ipv6Localize > 1 ? "segments" : "segment");
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
            return /^(10)\.(.*)\.(.*)\.(.*)$/.test(ip) || /^(172)\.(1[6-9]|2[0-9]|3[0-1])\.(.*)\.(.*)$/.test(ip) || /^(192)\.(168)\.(.*)\.(.*)$/.test(ip)
        }

        // else: ip is IPv6
        const firstWord = ip.split(":").find(el => !!el); //get first not empty word

        if (/^fe[c-f][0-f]$/.test(firstWord)) {
            // The original IPv6 Site Local addresses (fec0::/10) are deprecated. Range: fec0 - feff
            return true;
        }

        // These days Unique Local Addresses (ULA) are used in place of Site Local.
        // Range: fc00 - fcff
        else if (/^fc[0-f]{2}$/.test(firstWord)) {
            return true;
        }

        // Range: fd00 - fcff
        else if (/^fd[0-f]{2}$/.test(firstWord)) {
            return true;
        }

        // Link local addresses (prefixed with fe80) are not routable
        else if (firstWord === "fe80") {
            return true;
        }

        // Discard Prefix
        else if (firstWord === "100") {
            return true;
        }

        // Any other IP address is not Unique Local Address (ULA)
        return false;
    }

    _setPeerId(request) {
        const searchParams = new URL(request.url, "http://server").searchParams;
        let peerId = searchParams.get('peer_id');
        let peerIdHash = searchParams.get('peer_id_hash');
        if (peerId && Peer.isValidUuid(peerId) && this.isPeerIdHashValid(peerId, peerIdHash)) {
            this.id = peerId;
        } else {
            this.id = crypto.randomUUID();
        }
    }

    _setRtcSupported(request) {
        const searchParams = new URL(request.url, "http://server").searchParams;
        this.rtcSupported = searchParams.get('webrtc_supported') === "true";
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

        if (!deviceName) {
            deviceName = 'Unknown Device';
        }

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