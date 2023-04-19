# Deployment Notes
The easiest way to get PairDrop up and running is by using Docker.

> <b>TURN server for Internet Transfer</b>
> 
> Beware that you have to host your own TURN server in order to enable transfers between different networks.
>
> You can follow [this guide](https://gabrieltanner.org/blog/turn-server/) to either install coturn directly on your system (Step 1) or deploy it via docker-compose (Step 5).

## Deployment with Docker

### Docker Image from Docker Hub

```bash
docker run -d --restart=unless-stopped --name=pairdrop -p 127.0.0.1:3000:3000 lscr.io/linuxserver/pairdrop
```

> You must use a server proxy to set the X-Forwarded-For to prevent all clients from discovering each other (See [#HTTP-Server](#http-server)).
>
> To prevent bypassing the proxy by reaching the docker container directly, `127.0.0.1` is specified in the run command.

#### Options / Flags
Set options by using the following flags in the `docker run` command:

##### Port
```bash
-p 127.0.0.1:8080:3000
```
> Specify the port used by the docker image 
> - 3000 -> `-p 127.0.0.1:3000:3000`
> - 8080 -> `-p 127.0.0.1:8080:3000`
##### Rate limiting requests
```
-e RATE_LIMIT=true
```
> Limits clients to 1000 requests per 5 min

##### Websocket Fallback (for VPN)
```bash
-e WS_FALLBACK=true
```
> Provides PairDrop to clients with an included websocket fallback if the peer to peer WebRTC connection is not available to the client.
>
> This is not used on the official https://pairdrop.net, but you can activate it on your self-hosted instance.
> This is especially useful if you connect to your instance via a VPN as most VPN services block WebRTC completely in order to hide your real IP address ([read more](https://privacysavvy.com/security/safe-browsing/disable-webrtc-chrome-firefox-safari-opera-edge/)).
>
> **Warning:** All traffic sent between devices using this fallback is routed through the server and therefor not peer to peer!
> Beware that the traffic routed via this fallback is readable by the server. Only ever use this on instances you can trust.
> Additionally, beware that all traffic using this fallback debits the servers data plan.

##### Specify STUN/TURN Servers
```bash
-e RTC_CONFIG="rtc_config.json"
```

> Specify the STUN/TURN servers PairDrop clients use by setting `RTC_CONFIG` to a JSON file including the configuration.
> You can use `pairdrop/rtc_config_example.json` as a starting point.
>
> To host your own TURN server you can follow this guide: https://gabrieltanner.org/blog/turn-server/
>
> Default configuration:
> ```json
> {
>   "sdpSemantics": "unified-plan",
>   "iceServers": [
>     {
>       "urls": "stun:stun.l.google.com:19302"
>     }
>   ]
> }
> ```

<br>

### Docker Image from GHCR
```bash
docker run -d --restart=unless-stopped --name=pairdrop -p 127.0.0.1:3000:3000 ghcr.io/schlagmichdoch/pairdrop npm run start:prod 
```
> You must use a server proxy to set the X-Forwarded-For to prevent all clients from discovering each other (See [#HTTP-Server](#http-server)).
>
> To prevent bypassing the proxy by reaching the docker container directly, `127.0.0.1` is specified in the run command.
>
> To specify options replace `npm run start:prod` according to [the documentation below.](#options--flags-1)

> The Docker Image includes a Healthcheck. To learn more see [Docker Swarm Usage](./docker-swarm-usage.md#docker-swarm-usage)

### Docker Image self-built
#### Build the image
```bash
docker build --pull . -f Dockerfile -t pairdrop
```
> A GitHub action is set up to do this step automatically.
>
> `--pull` ensures always the latest node image is used.

#### Run the image
```bash
docker run -d --restart=unless-stopped --name=pairdrop -p 127.0.0.1:3000:3000 -it pairdrop npm run start:prod
```
> You must use a server proxy to set the X-Forwarded-For to prevent all clients from discovering each other (See [#HTTP-Server](#http-server)).
>
> To prevent bypassing the proxy by reaching the docker container directly, `127.0.0.1` is specified in the run command.
>
> To specify options replace `npm run start:prod` according to [the documentation below.](#options--flags-1)

> The Docker Image includes a Healthcheck. To learn more see [Docker Swarm Usage](./docker-swarm-usage.md#docker-swarm-usage)

<br>

## Deployment with Docker Compose
Here's an example docker-compose file:

```yaml
version: "2"
services:
    pairdrop:
        image: lscr.io/linuxserver/pairdrop:latest
        container_name: pairdrop
        restart: unless-stopped
        environment:
            - PUID=1000 # UID to run the application as
            - PGID=1000 # GID to run the application as
            - WS_FALLBACK=false # Set to true to enable websocket fallback if the peer to peer WebRTC connection is not available to the client.
            - RATE_LIMIT=false # Set to true to limit clients to 1000 requests per 5 min.
            - TZ=Etc/UTC # Time Zone
        ports:
            - 127.0.0.1:3000:3000 # Web UI
```

Run the compose file with `docker compose up -d`.

> You must use a server proxy to set the X-Forwarded-For to prevent all clients from discovering each other (See [#HTTP-Server](#http-server)).
>
> To prevent bypassing the proxy by reaching the docker container directly, `127.0.0.1` is specified in the run command.

<br>

## Deployment with node

```bash
git clone https://github.com/schlagmichdoch/PairDrop.git && cd PairDrop
```

Install all dependencies with NPM:

```bash
npm install
```

Start the server with:

```bash
node index.js
```
or
```bash
npm start
```

> Remember to check your IP Address using your OS command to see where you can access the server.

> By default, the node server listens on port 3000.

<br>

### Environment variables
#### Port
On Unix based systems
```bash
PORT=3010 npm start
```
On Windows
```bash
$env:PORT=3010; npm start 
```
> Specify the port PairDrop is running on. (Default: 3000)

#### Specify STUN/TURN Server
On Unix based systems
```bash
RTC_CONFIG="rtc_config.json" npm start
```
On Windows
```bash
$env:RTC_CONFIG="rtc_config.json"; npm start 
```
> Specify the STUN/TURN servers PairDrop clients use by setting `RTC_CONFIG` to a JSON file including the configuration.
> You can use `pairdrop/rtc_config_example.json` as a starting point.
> 
> To host your own TURN server you can follow this guide: https://gabrieltanner.org/blog/turn-server/ 
>
> Default configuration:
> ```json
> {
>   "sdpSemantics": "unified-plan",
>   "iceServers": [
>     {
>       "urls": "stun:stun.l.google.com:19302"
>     }
>   ]
> }
> ```

### Options / Flags
#### Local Run
```bash
npm start -- --localhost-only
```
> Only allow connections from localhost.
> 
> You must use a server proxy to set the X-Forwarded-For to prevent all clients from discovering each other (See [#HTTP-Server](#http-server)).
>
> Use this when deploying PairDrop with node to prevent bypassing the proxy by reaching the docker container directly.

#### Automatic restart on error
```bash
npm start -- --auto-restart 
```
> Restarts server automatically on error

<br>

#### Rate limiting requests
```bash
npm start -- --rate-limit 
```
> Limits clients to 1000 requests per 5 min

<br>

#### Websocket Fallback (for VPN)
```bash
npm start -- --include-ws-fallback
```
> Provides PairDrop to clients with an included websocket fallback if the peer to peer WebRTC connection is not available to the client.
>
> This is not used on the official https://pairdrop.net, but you can activate it on your self-hosted instance.
> This is especially useful if you connect to your instance via a VPN as most VPN services block WebRTC completely in order to hide your real IP address ([read more](https://privacysavvy.com/security/safe-browsing/disable-webrtc-chrome-firefox-safari-opera-edge/)).
> 
> **Warning:** All traffic sent between devices using this fallback is routed through the server and therefor not peer to peer!
> Beware that the traffic routed via this fallback is readable by the server. Only ever use this on instances you can trust.
> Additionally, beware that all traffic using this fallback debits the servers data plan.

<br>

#### Production (autostart and rate-limit)
```bash
npm run start:prod
```

#### Production (autostart, rate-limit, localhost-only and websocket fallback for VPN)
```bash
npm run start:prod -- --localhost-only --include-ws-fallback
```
> To prevent connections to the node server from bypassing the proxy server you should always use "--localhost-only" on production.

## HTTP-Server
When running PairDrop, the `X-Forwarded-For` header has to be set by a proxy. Otherwise, all clients will be mutually visible.

### Using nginx
#### Allow http and https requests
```
server {
    listen       80;

    expires epoch;

    location / {
        proxy_connect_timeout 300;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Connection "upgrade";
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header X-Forwarded-for $remote_addr;
    }
}

server {
    listen       443 ssl http2;
    ssl_certificate /etc/ssl/certs/pairdrop-dev.crt;
    ssl_certificate_key /etc/ssl/certs/pairdrop-dev.key;

    expires epoch;

    location / {
        proxy_connect_timeout 300;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Connection "upgrade";
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header X-Forwarded-for $remote_addr;
    }
}
```

#### Automatic http to https redirect:
```
server {
    listen       80;

    expires epoch;

    location / {
        return 301 https://$host:3000$request_uri;
    }
}

server {
    listen       443 ssl http2;
    ssl_certificate /etc/ssl/certs/pairdrop-dev.crt;
    ssl_certificate_key /etc/ssl/certs/pairdrop-dev.key;

    expires epoch;

    location / {
        proxy_connect_timeout 300;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Connection "upgrade";
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header X-Forwarded-for $remote_addr;
    }
}
```

### Using Apache
install modules `proxy`, `proxy_http`, `mod_proxy_wstunnel`
```bash
a2enmod proxy
```
```bash
a2enmod proxy_http
```
```bash
a2enmod proxy_wstunnel
```

<br>

Create a new configuration file under `/etc/apache2/sites-available` (on debian)

**pairdrop.conf**
#### Allow http and https requests
```apacheconf
<VirtualHost *:80>	
	ProxyPass / http://127.0.0.1:3000/
	RewriteEngine on
	RewriteCond %{HTTP:Upgrade} websocket [NC]
	RewriteCond %{HTTP:Connection} upgrade [NC]
	RewriteRule ^/?(.*) "ws://127.0.0.1:3000/$1" [P,L]
</VirtualHost>
<VirtualHost *:443>	
	ProxyPass / https://127.0.0.1:3000/
	RewriteEngine on
	RewriteCond %{HTTP:Upgrade} websocket [NC]
	RewriteCond %{HTTP:Connection} upgrade [NC]
	RewriteRule ^/?(.*) "wws://127.0.0.1:3000/$1" [P,L]
</VirtualHost>
```
#### Automatic http to https redirect:
```apacheconf
<VirtualHost *:80>	
   Redirect permanent / https://127.0.0.1:3000/
</VirtualHost>
<VirtualHost *:443>	
	ProxyPass / https://127.0.0.1:3000/
	RewriteEngine on
	RewriteCond %{HTTP:Upgrade} websocket [NC]
	RewriteCond %{HTTP:Connection} upgrade [NC]
	RewriteRule ^/?(.*) "wws://127.0.0.1:3000/$1" [P,L]
</VirtualHost>
```
Activate the new virtual host and reload apache:
```bash
a2ensite pairdrop
```
```bash
service apache2 reload
```

# Local Development
## Install
All files needed for developing are available on the branch `dev`.

First, [Install docker with docker-compose.](https://docs.docker.com/compose/install/)

Then, clone the repository and run docker-compose:
```bash
    git clone https://github.com/schlagmichdoch/PairDrop.git

    cd PairDrop

    git checkout dev
    
    docker-compose up -d
```
Now point your browser to `http://localhost:8080`.

- To restart the containers run `docker-compose restart`.
- To stop the containers run `docker-compose stop`.
- To debug the NodeJS server run `docker logs pairdrop_node_1`.


<br>

## Testing PWA related features
PWAs require that the app is served under a correctly set up and trusted TLS endpoint.

The nginx container creates a CA certificate and a website certificate for you. To correctly set the common name of the certificate, you need to change the FQDN environment variable in `docker/fqdn.env` to the fully qualified domain name of your workstation.

If you want to test PWA features, you need to trust the CA of the certificate for your local deployment. For your convenience, you can download the crt file from `http://<Your FQDN>:8080/ca.crt`. Install that certificate to the trust store of your operating system.
- On Windows, make sure to install it to the `Trusted Root Certification Authorities` store.
- On macOS, double-click the installed CA certificate in `Keychain Access`, expand `Trust`, and select `Always Trust` for SSL.
- Firefox uses its own trust store. To install the CA, point Firefox at `http://<Your FQDN>:8080/ca.crt`. When prompted, select `Trust this CA to identify websites` and click OK.
- When using Chrome, you need to restart Chrome so it reloads the trust store (`chrome://restart`). Additionally, after installing a new cert, you need to clear the Storage (DevTools -> Application -> Clear storage -> Clear site data).

Please note that the certificates (CA and webserver cert) expire after a day.
Also, whenever you restart the nginx docker, container new certificates are created.

The site is served on `https://<Your FQDN>:8443`.

[< Back](/README.md)
