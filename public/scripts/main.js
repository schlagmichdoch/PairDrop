class PairDrop {

    constructor() {
        this.stylesDeferred = [
            "styles/styles-deferred.css"
        ];
        this.scriptsDeferred = [
            "scripts/browser-tabs-connector.js",
            "scripts/util.js",
            "scripts/network.js",
            "scripts/ui.js",
            "scripts/qr-code.min.js",
            "scripts/zip.min.js",
            "scripts/no-sleep.min.js",
            "scripts/heic2any.min.js"
        ];

        this.initialize()
            .then(_ => {
                console.log("Initialization completed.");
            });
    }

    async initialize() {
        // Register Service Worker
        console.log('Register Service Worker...');
        await this.registerServiceWorker();

        Events.on('beforeinstallprompt', e => this.onPwaInstallable(e));

        this.$headerNotificationBtn = $('notification');
        this.$headerEditPairedDevicesBtn = $('edit-paired-devices');
        this.$footerPairedDevicesBadge = $$('.discovery-wrapper .badge-room-secret');
        this.$headerInstallBtn = $('install');

        this.themeUI = new ThemeUI();
        this.backgroundCanvas = new BackgroundCanvas();
        this.headerUI = new HeaderUI();
        this.centerUI = new CenterUI();
        this.footerUI = new FooterUI();

        // Translate page, initiate database, and evaluate what to show
        await Promise.all([
            PersistentStorage.initiate(),
            Localization.initiate(),
            this.evaluatePermissionsAndRoomSecrets()
        ]);

        // Evaluate css shifting UI elements and show loading placeholder
        await Promise.all([
            this.headerUI.evaluateOverflowing(),
            this.footerUI._evaluateFooterBadges(),
            this.footerUI.showLoading()
        ]);

        // Fade in UI elements
        await Promise.all([
            this.headerUI.fadeIn(),
            this.footerUI.fadeIn(),
            this.centerUI.fadeIn(),
            this.backgroundCanvas.fadeIn()
        ]);

        // Evaluate url params as soon as client is connected to the websocket
        console.log("Evaluate URL params as soon as websocket connection is established.");
        Events.on('ws-connected', _ => this.evaluateUrlParams(), {once: true});

        // Load deferred assets
        console.log("Load deferred assets...");
        await this.loadDeferredAssets();
        console.log("Loading of deferred assets completed.");

        // Hydrate UI
        console.log("Hydrate UI...");
        await this.hydrate();
        console.log("UI hydrated.");
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.serviceWorker = await navigator.serviceWorker.register('service-worker.js');
            console.log('Service Worker registered.');
        }
    }

    onPwaInstallable(e) {
        if (!window.matchMedia('(display-mode: minimal-ui)').matches) {
            // only display install btn when not installed
            this.$headerInstallBtn.removeAttribute('hidden');
            this.$headerInstallBtn.addEventListener('click', () => {
                this.$headerInstallBtn.setAttribute('hidden', true);
                e.prompt();
            });
        }
        return e.preventDefault();
    }

    async evaluatePermissionsAndRoomSecrets() {
        // Check whether notification permissions have already been granted
        if ('Notification' in window && Notification.permission !== 'granted') {
            this.$headerNotificationBtn.removeAttribute('hidden');
        }

        let roomSecrets = await PersistentStorage.getAllRoomSecrets();
        if (roomSecrets.length > 0) {
            this.$headerEditPairedDevicesBtn.removeAttribute('hidden');
            this.$footerPairedDevicesBadge.removeAttribute('hidden');
        }
    }

    async loadDeferredAssets() {
        const stylePromises = this.stylesDeferred.map(url => this.loadAndApplyStylesheet(url));
        const scriptPromises = this.scriptsDeferred.map(url => this.loadAndApplyScript(url));
        await Promise.all([...stylePromises, ...scriptPromises]);
    }

    loadStyleSheet(url) {
        return new Promise((resolve, reject) => {
            let stylesheet = document.createElement('link');
            stylesheet.rel = 'preload';
            stylesheet.as = 'style';
            stylesheet.href = url;
            stylesheet.onload = _ => {
                stylesheet.onload = null;
                stylesheet.rel = 'stylesheet';
                resolve();
            };
            stylesheet.onerror = reject;

            document.head.appendChild(stylesheet);
        });
    }

    loadAndApplyStylesheet(url) {
        return new Promise( async (resolve) => {
            try {
                await this.loadStyleSheet(url);
                console.log(`Stylesheet loaded successfully: ${url}`);
                resolve();
            } catch (error) {
                console.error('Error loading stylesheet:', error);
            }
        });
    }

    loadScript(url) {
        return new Promise((resolve, reject) => {
            let script = document.createElement("script");
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;

            document.body.appendChild(script);
        });
    }

    loadAndApplyScript(url) {
        return new Promise( async (resolve) => {
            try {
                await this.loadScript(url);
                console.log(`Script loaded successfully: ${url}`);
                resolve();
            } catch (error) {
                console.error('Error loading script:', error);
            }
        });
    }

    async hydrate() {
        this.aboutUI = new AboutUI();
        this.peersUI = new PeersUI();
        this.languageSelectDialog = new LanguageSelectDialog();
        this.receiveFileDialog = new ReceiveFileDialog();
        this.receiveRequestDialog = new ReceiveRequestDialog();
        this.sendTextDialog = new SendTextDialog();
        this.receiveTextDialog = new ReceiveTextDialog();
        this.pairDeviceDialog = new PairDeviceDialog();
        this.clearDevicesDialog = new EditPairedDevicesDialog();
        this.publicRoomDialog = new PublicRoomDialog();
        this.base64Dialog = new Base64Dialog();
        this.shareTextDialog = new ShareTextDialog();
        this.toast = new Toast();
        this.notifications = new Notifications();
        this.networkStatusUI = new NetworkStatusUI();
        this.webShareTargetUI = new WebShareTargetUI();
        this.webFileHandlersUI = new WebFileHandlersUI();
        this.noSleepUI = new NoSleepUI();
        this.broadCast = new BrowserTabsConnector();
        this.server = new ServerConnection();
        this.peers = new PeersManager(this.server);
    }

    async evaluateUrlParams() {
        // get url params
        const urlParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash.substring(1);

        // evaluate url params
        if (urlParams.has('pair_key')) {
            const pairKey = urlParams.get('pair_key');
            this.pairDeviceDialog._pairDeviceJoin(pairKey);
        }
        else if (urlParams.has('room_id')) {
            const roomId = urlParams.get('room_id');
            this.publicRoomDialog._joinPublicRoom(roomId);
        }
        else if (urlParams.has('base64text')) {
            const base64Text = urlParams.get('base64text');
            await this.base64Dialog.evaluateBase64Text(base64Text, hash);
        }
        else if (urlParams.has('base64zip')) {
            const base64Zip = urlParams.get('base64zip');
            await this.base64Dialog.evaluateBase64Zip(base64Zip, hash);
        }
        else if (urlParams.has("share_target")) {
            const shareTargetType = urlParams.get("share_target");
            const title = urlParams.get('title') || '';
            const text = urlParams.get('text') || '';
            const url = urlParams.get('url') || '';
            await this.webShareTargetUI.evaluateShareTarget(shareTargetType, title, text, url);
        }
        else if (urlParams.has("file_handler")) {
            await this.webFileHandlersUI.evaluateLaunchQueue();
        }
        else if (urlParams.has("init")) {
            const init = urlParams.get("init");
            if (init === "pair") {
                this.pairDeviceDialog._pairDeviceInitiate();
            }
            else if (init === "public_room") {
                this.publicRoomDialog._createPublicRoom();
            }
        }

        // remove url params from url
        const urlWithoutParams = getUrlWithoutArguments();
        window.history.replaceState({}, "Rewrite URL", urlWithoutParams);

        console.log("URL params evaluated.");
    }
}

const pairDrop = new PairDrop();