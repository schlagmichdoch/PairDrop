import {spawn} from "child_process";
import fs from "fs";

import PairDropServer from "./server.js";
import PairDropWsServer from "./ws-server.js";

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

// Evaluate arguments for deployment with Docker and Node.js
let conf = {};
conf.debugMode = process.env.DEBUG_MODE === "true";
conf.port = process.env.PORT || 3000;
conf.wsFallback = process.argv.includes('--include-ws-fallback') || process.env.WS_FALLBACK === "true";
conf.rtcConfig = process.env.RTC_CONFIG
    ? JSON.parse(fs.readFileSync(process.env.RTC_CONFIG, 'utf8'))
    : {
        "sdpSemantics": "unified-plan",
        "iceServers": [
            {
                "urls": "stun:stun.l.google.com:19302"
            }
        ]
    };

let ipv6Localize = parseInt(process.env.IPV6_LOCALIZE) || false;
if (ipv6Localize) {
    if (!(0 < ipv6Localize && ipv6Localize < 8)) {
        console.error("ipv6Localize must be an integer between 1 and 7");
        process.exit(1);
    }

    console.log("IPv6 client IPs will be localized to",
        ipv6Localize,
        ipv6Localize === 1 ? "segment" : "segments");
}
conf.ipv6Localize = ipv6Localize;

let rateLimit = false;
if (process.argv.includes('--rate-limit') || process.env.RATE_LIMIT === "true") {
    rateLimit = 5;
}
else {
    let envRateLimit = parseInt(process.env.RATE_LIMIT);
    if (!isNaN(envRateLimit)) {
        rateLimit = envRateLimit;
    }
}
conf.rateLimit = rateLimit;

// Evaluate arguments for deployment with Node.js only
conf.autoStart = process.argv.includes('--auto-restart');
conf.localhostOnly = process.argv.includes('--localhost-only');

// Logs for debugging
if (conf.debugMode) {
    console.log("DEBUG_MODE is active. To protect privacy, do not use in production.");
    console.debug("\n");
    console.debug("----DEBUG ENVIRONMENT VARIABLES----")
    console.debug(JSON.stringify(conf, null, 4));
    console.debug("\n");
}

// Start a new PairDrop instance when an uncaught exception occurs
if (conf.autoStart) {
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

// Start server to serve client files
const pairDropServer = new PairDropServer(conf);

// Start websocket Server
const pairDropWsServer = new PairDropWsServer(pairDropServer.server, conf);

