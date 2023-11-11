class PairDrop {
    constructor() {
        this.$header = $$('header.opacity-0');
        this.$center = $$('#center');
        this.$footer = $$('footer');
        this.$xNoPeers = $$('x-no-peers');
        this.$headerNotificationButton = $('notification');
        this.$editPairedDevicesHeaderBtn = $('edit-paired-devices');
        this.$footerInstructionsPairedDevices = $$('.discovery-wrapper .badge-room-secret');
        this.$head = $$('head');
        this.$installBtn = $('install');

        this.registerServiceWorker();

        Events.on('beforeinstallprompt', e => this.onPwaInstallable(e));

        const persistentStorage = new PersistentStorage();
        const themeUI = new ThemeUI();
        const backgroundCanvas = new BackgroundCanvas();

        Events.on('initial-translation-loaded', _ => {
            // FooterUI needs translations
            const footerUI = new FooterUI();

            Events.on('fade-in-ui', _ => this.fadeInUI())
            Events.on('fade-in-header', _ => this.fadeInHeader())

            // Evaluate UI elements and fade in UI
            this.evaluateUI();

            // Load deferred assets
            this.loadDeferredAssets();
        });

        // Translate page -> fires 'initial-translation-loaded' on finish
        const localization = new Localization();
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/service-worker.js')
                .then(serviceWorker => {
                    console.log('Service Worker registered');
                    window.serviceWorker = serviceWorker
                });
        }
    }

    onPwaInstallable(e) {
        if (!window.matchMedia('(display-mode: minimal-ui)').matches) {
            // only display install btn when not installed
            this.$installBtn.removeAttribute('hidden');
            this.$installBtn.addEventListener('click', () => {
                this.$installBtn.setAttribute('hidden', true);
                e.prompt();
            });
        }
        return e.preventDefault();
    }

    evaluateUI() {
        // Check whether notification permissions have already been granted
        if ('Notification' in window && Notification.permission !== 'granted') {
            this.$headerNotificationButton.removeAttribute('hidden');
        }

        PersistentStorage
            .getAllRoomSecrets()
            .then(roomSecrets => {
                if (roomSecrets.length > 0) {
                    this.$editPairedDevicesHeaderBtn.removeAttribute('hidden');
                    this.$footerInstructionsPairedDevices.removeAttribute('hidden');
                }
            })
            .finally(() => {
                Events.fire('evaluate-footer-badges');
                Events.fire('fade-in-header');
            });
    }

    fadeInUI() {
        this.$center.classList.remove('opacity-0');
        this.$footer.classList.remove('opacity-0');

        // Prevent flickering on load
        setTimeout(() => {
            this.$xNoPeers.classList.remove('no-animation-on-load');
        }, 600);
    }

    fadeInHeader() {
        this.$header.classList.remove('opacity-0');
    }

    loadDeferredAssets() {
        console.log("Load deferred assets");
        this.deferredStyles = [
            "styles/deferred-styles.css"
        ];
        this.deferredScripts = [
            "scripts/util.js",
            "scripts/network.js",
            "scripts/ui.js",
            "scripts/qr-code.min.js",
            "scripts/zip.min.js",
            "scripts/no-sleep.min.js"
        ];
        this.deferredStyles.forEach(url => this.loadStyleSheet(url, _ => this.onStyleLoaded(url)))
        this.deferredScripts.forEach(url => this.loadScript(url, _ => this.onScriptLoaded(url)))
    }

    loadStyleSheet(url, callback) {
        let stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = url;
        stylesheet.type = 'text/css';
        stylesheet.onload = callback;
        this.$head.appendChild(stylesheet);
    }

    loadScript(url, callback) {
        let script = document.createElement("script");
        script.src = url;
        script.onload = callback;
        document.body.appendChild(script);
    }

    onStyleLoaded(url) {
        // remove entry from array
        const index = this.deferredStyles.indexOf(url);
        if (index !== -1) {
            this.deferredStyles.splice(index, 1);
        }
        this.onAssetLoaded();
    }

    onScriptLoaded(url) {
        // remove entry from array
        const index = this.deferredScripts.indexOf(url);
        if (index !== -1) {
            this.deferredScripts.splice(index, 1);
        }
        this.onAssetLoaded();
    }

    onAssetLoaded() {
        if (this.deferredScripts.length || this.deferredStyles.length) return;

        console.log("Loading of deferred assets completed. Start UI hydration.");

        this.hydrate();
    }

    hydrate() {
        const peersUI = new PeersUI();
        const languageSelectDialog = new LanguageSelectDialog();
        const receiveFileDialog = new ReceiveFileDialog();
        const receiveRequestDialog = new ReceiveRequestDialog();
        const sendTextDialog = new SendTextDialog();
        const receiveTextDialog = new ReceiveTextDialog();
        const pairDeviceDialog = new PairDeviceDialog();
        const clearDevicesDialog = new EditPairedDevicesDialog();
        const publicRoomDialog = new PublicRoomDialog();
        const base64ZipDialog = new Base64ZipDialog();
        const toast = new Toast();
        const notifications = new Notifications();
        const networkStatusUI = new NetworkStatusUI();
        const webShareTargetUI = new WebShareTargetUI();
        const webFileHandlersUI = new WebFileHandlersUI();
        const noSleepUI = new NoSleepUI();
        const broadCast = new BrowserTabsConnector();
        const server = new ServerConnection();
        const peers = new PeersManager(server);
        console.log("UI hydrated.")
    }
}

const pairDrop = new PairDrop();