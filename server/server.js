import express from "express";
import RateLimit from "express-rate-limit";
import {fileURLToPath} from "url";
import path, {dirname} from "path";
import http from "http";

export default class PairDropServer {

    constructor(conf) {
        const app = express();

        if (conf.rateLimit) {
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

            app.set('trust proxy', conf.rateLimit);

            if (!conf.debugMode) {
                console.log("Use DEBUG_MODE=true to find correct number for RATE_LIMIT.");
            }
        }

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        const publicPathAbs = path.join(__dirname, '../public');
        app.use(express.static(publicPathAbs));

        if (conf.debugMode && conf.rateLimit) {
            console.debug("\n");
            console.debug("----DEBUG RATE_LIMIT----")
            console.debug("To find out the correct value for RATE_LIMIT go to '/ip' and ensure the returned IP-address is the IP-address of your client.")
            console.debug("See https://github.com/express-rate-limit/express-rate-limit#troubleshooting-proxy-issues for more info")
            app.get('/ip', (req, res) => {
                res.send(req.ip);
            })
        }

        // By default, clients connecting to your instance use the signaling server of your instance to connect to other devices.
        // By using `WS_SERVER`, you can host an instance that uses another signaling server.
        app.get('/config', (req, res) => {
            res.send({
                signalingServer: conf.signalingServer,
                buttons: conf.buttons
            });
        });

        app.use((req, res) => {
            res.redirect(301, '/');
        });

        app.get('/', (req, res) => {
            res.sendFile('index.html');
            console.log(`Serving client files from:\n${publicPathAbs}`)
        });

        const hostname = conf.localhostOnly ? '127.0.0.1' : null;
        const server = http.createServer(app);

        server.listen(conf.port, hostname);

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(err);
                console.info("Error EADDRINUSE received, exiting process without restarting process...");
                process.exit(1)
            }
        });

        this.server = server
    }
}