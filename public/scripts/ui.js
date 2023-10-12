const $ = query => document.getElementById(query);
const $$ = query => document.body.querySelector(query);
window.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
window.android = /android/i.test(navigator.userAgent);
window.isMobile = window.iOS || window.android;
window.pasteMode = {};
window.pasteMode.activated = false;

// set display name
Events.on('display-name', e => {
    const me = e.detail.message;
    const $displayName = $('display-name');
    $displayName.setAttribute('placeholder', me.displayName);
});

class PeersUI {

    constructor() {
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('peer-connected', e => this._onPeerConnected(e.detail.peerId, e.detail.connectionHash));
        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('set-progress', e => this._onSetProgress(e.detail));
        Events.on('paste', e => this._onPaste(e));
        Events.on('room-type-removed', e => this._onRoomTypeRemoved(e.detail.peerId, e.detail.roomType));
        Events.on('activate-paste-mode', e => this._activatePasteMode(e.detail.files, e.detail.text));
        this.peers = {};

        this.$cancelPasteModeBtn = $('cancel-paste-mode');
        this.$cancelPasteModeBtn.addEventListener('click', _ => this._cancelPasteMode());

        Events.on('dragover', e => this._onDragOver(e));
        Events.on('dragleave', _ => this._onDragEnd());
        Events.on('dragend', _ => this._onDragEnd());

        Events.on('drop', e => this._onDrop(e));
        Events.on('keydown', e => this._onKeyDown(e));

        this.$xPeers = $$('x-peers');
        this.$xNoPeers = $$('x-no-peers');
        this.$xInstructions = $$('x-instructions');
        this.$center = $$('#center');
        this.$footer = $$('footer');
        this.$discoveryWrapper = $$('footer .discovery-wrapper');

        Events.on('peer-added', _ => this._evaluateOverflowing());
        Events.on('bg-resize', _ => this._evaluateOverflowing());

        this.$displayName = $('display-name');

        this.$displayName.setAttribute("placeholder", this.$displayName.dataset.placeholder);

        this.$displayName.addEventListener('keydown', e => this._onKeyDownDisplayName(e));
        this.$displayName.addEventListener('keyup', e => this._onKeyUpDisplayName(e));
        this.$displayName.addEventListener('blur', e => this._saveDisplayName(e.target.innerText));

        Events.on('self-display-name-changed', e => this._insertDisplayName(e.detail));
        Events.on('peer-display-name-changed', e => this._onPeerDisplayNameChanged(e));

        // Load saved display name on page load
        this._getSavedDisplayName().then(displayName => {
            console.log("Retrieved edited display name:", displayName)
            if (displayName) Events.fire('self-display-name-changed', displayName);
        });

        Events.on('evaluate-footer-badges', _ => this._evaluateFooterBadges())

        this.fadedIn = false;

        this.$header = document.querySelector('header.opacity-0');
        Events.on('header-evaluated', e => this._fadeInHeader(e.detail));

        // wait for evaluation of notification, install and edit-paired-devices buttons
        this.evaluateHeaderCount = 3;
        if (!('Notification' in window)) this.evaluateHeaderCount -= 1;
        if (
            !('BeforeInstallPromptEvent' in window) ||
            ('BeforeInstallPromptEvent' in window && window.matchMedia('(display-mode: minimal-ui)').matches)
        ) {
            this.evaluateHeaderCount -= 1;
        }
    }

    _fadeInHeader(id) {
        this.evaluateHeaderCount -= 1;
        console.log(`Header btn ${id} evaluated. ${this.evaluateHeaderCount} to go.`);
        if (this.evaluateHeaderCount !== 0) return;

        this.$header.classList.remove('opacity-0');
    }

    _fadeInUI() {
        if (this.fadedIn) return;

        this.fadedIn = true;

        this.$center.classList.remove('opacity-0');
        this.$footer.classList.remove('opacity-0');

        // Prevent flickering on load
        setTimeout(_ => {
            this.$xNoPeers.classList.remove('no-animation-on-load');
        }, 600);

        Events.fire('ui-faded-in');
    }

    _evaluateFooterBadges() {
        if (this.$discoveryWrapper.querySelectorAll('div:last-of-type > span[hidden]').length < 2) {
            this.$discoveryWrapper.classList.remove('row');
            this.$discoveryWrapper.classList.add('column');
        } else {
            this.$discoveryWrapper.classList.remove('column');
            this.$discoveryWrapper.classList.add('row');
        }
        Events.fire('redraw-canvas');
        this._fadeInUI();
    }

    _insertDisplayName(displayName) {
        this.$displayName.textContent = displayName;
    }

    _onKeyDownDisplayName(e) {
        if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            e.target.blur();
        }
    }

    _onKeyUpDisplayName(e) {
        // fix for Firefox inserting a linebreak into div on edit which prevents the placeholder from showing automatically when it is empty
        if (/^(\n|\r|\r\n)$/.test(e.target.innerText)) e.target.innerText = '';
    }

    async _saveDisplayName(newDisplayName) {
        newDisplayName = newDisplayName.replace(/(\n|\r|\r\n)/, '')
        const savedDisplayName = await this._getSavedDisplayName();
        if (newDisplayName === savedDisplayName) return;

        if (newDisplayName) {
            PersistentStorage.set('editedDisplayName', newDisplayName)
                .then(_ => {
                    Events.fire('notify-user', Localization.getTranslation("notifications.display-name-changed-permanently"));
                })
                .catch(_ => {
                    console.log("This browser does not support IndexedDB. Use localStorage instead.");
                    localStorage.setItem('editedDisplayName', newDisplayName);
                    Events.fire('notify-user', Localization.getTranslation("notifications.display-name-changed-temporarily"));
                })
                .finally(_ => {
                    Events.fire('self-display-name-changed', newDisplayName);
                    Events.fire('broadcast-send', {type: 'self-display-name-changed', detail: newDisplayName});
                });
        } else {
            PersistentStorage.delete('editedDisplayName')
                .catch(_ => {
                    console.log("This browser does not support IndexedDB. Use localStorage instead.")
                    localStorage.removeItem('editedDisplayName');
                })
                .finally(_ => {
                    Events.fire('notify-user', Localization.getTranslation("notifications.display-name-random-again"));
                    Events.fire('self-display-name-changed', '');
                    Events.fire('broadcast-send', {type: 'self-display-name-changed', detail: ''});
                });
        }
    }

    _getSavedDisplayName() {
        return new Promise((resolve) => {
            PersistentStorage.get('editedDisplayName')
                .then(displayName => {
                    if (!displayName) displayName = "";
                    resolve(displayName);
                })
                .catch(_ => {
                    let displayName = localStorage.getItem('editedDisplayName');
                    if (!displayName) displayName = "";
                    resolve(displayName);
                })
        });
    }

    _changePeerDisplayName(peerId, displayName) {
        this.peers[peerId].name.displayName = displayName;
        const peerIdNode = $(peerId);
        if (peerIdNode && displayName) peerIdNode.querySelector('.name').textContent = displayName;
        this._redrawPeerRoomTypes(peerId);
    }

    _onPeerDisplayNameChanged(e) {
        if (!e.detail.displayName) return;
        this._changePeerDisplayName(e.detail.peerId, e.detail.displayName);
    }

    _onKeyDown(e) {
        if (document.querySelectorAll('x-dialog[show]').length === 0 && window.pasteMode.activated && e.code === "Escape") {
            Events.fire('deactivate-paste-mode');
        }

        // close About PairDrop page on Escape
        if (e.key === "Escape") {
            window.location.hash = '#';
        }
    }

    _onPeerJoined(msg) {
        this._joinPeer(msg.peer, msg.roomType, msg.roomId);
    }

    _joinPeer(peer, roomType, roomId) {
        const existingPeer = this.peers[peer.id];
        if (existingPeer) {
            // peer already exists. Abort but add roomType to GUI
            existingPeer._roomIds[roomType] = roomId;
            this._redrawPeerRoomTypes(peer.id);
            return;
        }

        peer._isSameBrowser = _ => BrowserTabsConnector.peerIsSameBrowser(peer.id);
        peer._roomIds = {};

        peer._roomIds[roomType] = roomId;
        this.peers[peer.id] = peer;
    }

    _onPeerConnected(peerId, connectionHash) {
        if (!this.peers[peerId] || $(peerId)) return;

        const peer = this.peers[peerId];

        new PeerUI(peer, connectionHash);
    }

    _redrawPeerRoomTypes(peerId) {
        const peer = this.peers[peerId];
        const peerNode = $(peerId);

        if (!peer || !peerNode) return;

        peerNode.classList.remove('type-ip', 'type-secret', 'type-public-id', 'type-same-browser');

        if (peer._isSameBrowser()) {
            peerNode.classList.add(`type-same-browser`);
        }

        Object.keys(peer._roomIds).forEach(roomType => peerNode.classList.add(`type-${roomType}`));
    }

    _evaluateOverflowing() {
        if (this.$xPeers.clientHeight < this.$xPeers.scrollHeight) {
            this.$xPeers.classList.add('overflowing');
        } else {
            this.$xPeers.classList.remove('overflowing');
        }
    }

    _onPeers(msg) {
        msg.peers.forEach(peer => this._joinPeer(peer, msg.roomType, msg.roomId));
    }

    _onPeerDisconnected(peerId) {
        const $peer = $(peerId);
        if (!$peer) return;
        $peer.remove();
        this._evaluateOverflowing();
    }

    _onRoomTypeRemoved(peerId, roomType) {
        const peer = this.peers[peerId];

        if (!peer) return;

        delete peer._roomIds[roomType];

        this._redrawPeerRoomTypes(peerId)
    }

    _onSetProgress(progress) {
        const $peer = $(progress.peerId);
        if (!$peer) return;
        $peer.ui.setProgress(progress.progress, progress.status)
    }

    _onDrop(e) {
        e.preventDefault();
        if (!$$('x-peer') || !$$('x-peer').contains(e.target)) {
            this._activatePasteMode(e.dataTransfer.files, '')
        }
        this._onDragEnd();
    }

    _onDragOver(e) {
        e.preventDefault();
        this.$xInstructions.setAttribute('drop-bg', 1);
        this.$xNoPeers.setAttribute('drop-bg', 1);
    }

    _onDragEnd() {
        this.$xInstructions.removeAttribute('drop-bg', 1);
        this.$xNoPeers.removeAttribute('drop-bg');
    }

    _onPaste(e) {
        if(document.querySelectorAll('x-dialog[show]').length === 0) {
            // prevent send on paste when dialog is open
            e.preventDefault()
            const files = e.clipboardData.files;
            const text = e.clipboardData.getData("Text");
            if (files.length === 0 && text.length === 0) return;
            this._activatePasteMode(files, text);
        }
    }

    _activatePasteMode(files, text) {
        if (!window.pasteMode.activated && (files.length > 0 || text.length > 0)) {
            const openPairDrop = Localization.getTranslation("instructions.activate-paste-mode-base");
            const andOtherFiles = Localization.getTranslation("instructions.activate-paste-mode-and-other-files", null, {count: files.length-1});
            const sharedText = Localization.getTranslation("instructions.activate-paste-mode-shared-text");
            const clickToSend = Localization.getTranslation("instructions.click-to-send")
            const tapToSend = Localization.getTranslation("instructions.tap-to-send")

            let descriptor;

            if (files.length === 1) {
                descriptor = `<i>${files[0].name}</i>`;
            } else if (files.length > 1) {
                descriptor = `<i>${files[0].name}</i><br>${andOtherFiles}`;
            } else {
                descriptor = sharedText;
            }

            this.$xInstructions.querySelector('p').innerHTML = `<i>${descriptor}</i>`;
            this.$xInstructions.querySelector('p').style.display = 'block';
            this.$xInstructions.setAttribute('desktop', clickToSend);
            this.$xInstructions.setAttribute('mobile', tapToSend);

            this.$xNoPeers.querySelector('h2').innerHTML = `${openPairDrop}<br>${descriptor}`;

            const _callback = (e) => this._sendClipboardData(e, files, text);
            Events.on('paste-pointerdown', _callback);
            Events.on('deactivate-paste-mode', _ => this._deactivatePasteMode(_callback), { once: true });

            this.$cancelPasteModeBtn.removeAttribute('hidden');

            window.pasteMode.descriptor = descriptor;
            window.pasteMode.activated = true;

            console.log('Paste mode activated.');
            Events.fire('paste-mode-changed');
        }
    }

    _cancelPasteMode() {
        Events.fire('deactivate-paste-mode');
    }

    _deactivatePasteMode(_callback) {
        if (window.pasteMode.activated) {
            window.pasteMode.descriptor = undefined;
            window.pasteMode.activated = false;
            Events.off('paste-pointerdown', _callback);

            this.$xInstructions.querySelector('p').innerText = '';
            this.$xInstructions.querySelector('p').style.display = 'none';

            this.$xInstructions.setAttribute('desktop', Localization.getTranslation("instructions.x-instructions", "desktop"));
            this.$xInstructions.setAttribute('mobile',  Localization.getTranslation("instructions.x-instructions", "mobile"));

            this.$xNoPeers.querySelector('h2').innerHTML =  Localization.getTranslation("instructions.no-peers-title");

            this.$cancelPasteModeBtn.setAttribute('hidden', "");

            console.log('Paste mode deactivated.')
            Events.fire('paste-mode-changed');
        }
    }

    _sendClipboardData(e, files, text) {
        // send the pasted file/text content
        const peerId = e.detail.peerId;

        if (files.length > 0) {
            Events.fire('files-selected', {
                files: files,
                to: peerId
            });
        } else if (text.length > 0) {
            Events.fire('send-text', {
                text: text,
                to: peerId
            });
        }
    }
}

class PeerUI {

    constructor(peer, connectionHash) {
        this._peer = peer;
        this._connectionHash =
            `${connectionHash.substring(0, 4)} ${connectionHash.substring(4, 8)} ${connectionHash.substring(8, 12)} ${connectionHash.substring(12, 16)}`;
        this._initDom();
        this._bindListeners();

        $$('x-peers').appendChild(this.$el)
        Events.fire('peer-added');
        this.$xInstructions = $$('x-instructions');
    }

    html() {
        let title;
        let input = '';
        if (window.pasteMode.activated) {
            title =  Localization.getTranslation("peer-ui.click-to-send-paste-mode", null, {descriptor: window.pasteMode.descriptor});
        } else {
            title = Localization.getTranslation("peer-ui.click-to-send");
            input = '<input type="file" multiple>';
        }
        this.$el.innerHTML = `
            <label class="column center pointer" title="${title}">
                ${input}
                <x-icon>
                    <div class="icon-wrapper" shadow="1">
                        <svg class="icon"><use xlink:href="#"/></svg>
                    </div>
                    <div class="highlight-wrapper center">
                        <div class="highlight highlight-room-ip" shadow="1"></div>
                        <div class="highlight highlight-room-secret" shadow="1"></div>
                        <div class="highlight highlight-room-public-id" shadow="1"></div>
                    </div>
                </x-icon>
                <div class="progress">
                  <div class="circle"></div>
                  <div class="circle right"></div>
                </div>
                <div class="device-descriptor">
                    <div class="name font-subheading"></div>
                    <div class="device-name font-body2"></div>
                    <div class="status font-body2"></div>
                    <span class="connection-hash font-body2" dir="ltr" title="${ Localization.getTranslation("peer-ui.connection-hash") }"></span>
                </div>
            </label>`;

        this.$el.querySelector('svg use').setAttribute('xlink:href', this._icon());
        this.$el.querySelector('.name').textContent = this._displayName();
        this.$el.querySelector('.device-name').textContent = this._deviceName();
        this.$el.querySelector('.connection-hash').textContent = this._connectionHash;
    }

    addTypesToClassList() {
        if (this._peer._isSameBrowser()) {
            this.$el.classList.add(`type-same-browser`);
        }

        Object.keys(this._peer._roomIds).forEach(roomType => this.$el.classList.add(`type-${roomType}`));
    }

    _initDom() {
        this.$el = document.createElement('x-peer');
        this.$el.id = this._peer.id;
        this.$el.ui = this;
        this.$el.classList.add('center');

        this.addTypesToClassList();

        this.html();

        this._callbackInput = e => this._onFilesSelected(e)
        this._callbackClickSleep = _ => NoSleepUI.enable()
        this._callbackTouchStartSleep = _ => NoSleepUI.enable()
        this._callbackDrop = e => this._onDrop(e)
        this._callbackDragEnd = e => this._onDragEnd(e)
        this._callbackDragLeave = e => this._onDragEnd(e)
        this._callbackDragOver = e => this._onDragOver(e)
        this._callbackContextMenu = e => this._onRightClick(e)
        this._callbackTouchStart = e => this._onTouchStart(e)
        this._callbackTouchEnd = e => this._onTouchEnd(e)
        this._callbackPointerDown = e => this._onPointerDown(e)

        // PasteMode
        Events.on('paste-mode-changed', _ => this._onPasteModeChanged());
    }

    _onPasteModeChanged() {
        this.html();
        this._bindListeners();
    }

    _bindListeners() {
        if(!window.pasteMode.activated) {
            // Remove Events Paste Mode
            this.$el.removeEventListener('pointerdown', this._callbackPointerDown);

            // Add Events Normal Mode
            this.$el.querySelector('input').addEventListener('change', this._callbackInput);
            this.$el.addEventListener('click', this._callbackClickSleep);
            this.$el.addEventListener('touchstart', this._callbackTouchStartSleep);
            this.$el.addEventListener('drop', this._callbackDrop);
            this.$el.addEventListener('dragend', this._callbackDragEnd);
            this.$el.addEventListener('dragleave', this._callbackDragLeave);
            this.$el.addEventListener('dragover', this._callbackDragOver);
            this.$el.addEventListener('contextmenu', this._callbackContextMenu);
            this.$el.addEventListener('touchstart', this._callbackTouchStart);
            this.$el.addEventListener('touchend', this._callbackTouchEnd);
        } else {
            // Remove Events Normal Mode
            this.$el.removeEventListener('click', this._callbackClickSleep);
            this.$el.removeEventListener('touchstart', this._callbackTouchStartSleep);
            this.$el.removeEventListener('drop', this._callbackDrop);
            this.$el.removeEventListener('dragend', this._callbackDragEnd);
            this.$el.removeEventListener('dragleave', this._callbackDragLeave);
            this.$el.removeEventListener('dragover', this._callbackDragOver);
            this.$el.removeEventListener('contextmenu', this._callbackContextMenu);
            this.$el.removeEventListener('touchstart', this._callbackTouchStart);
            this.$el.removeEventListener('touchend', this._callbackTouchEnd);

            // Add Events Paste Mode
            this.$el.addEventListener('pointerdown', this._callbackPointerDown);
        }
    }

    _onPointerDown(e) {
        // Prevents triggering of event twice on touch devices
        e.stopPropagation();
        e.preventDefault();
        Events.fire('paste-pointerdown', {
            peerId: this._peer.id
        });
    }

    _displayName() {
        return this._peer.name.displayName;
    }

    _deviceName() {
        return this._peer.name.deviceName;
    }

    _badgeClassName() {
        const roomTypes = Object.keys(this._peer._roomIds);
        return roomTypes.includes('secret')
            ? 'badge-room-secret'
            : roomTypes.includes('ip')
                ? 'badge-room-ip'
                : 'badge-room-public-id';
    }

    _icon() {
        const device = this._peer.name.device || this._peer.name;
        if (device.type === 'mobile') {
            return '#phone-iphone';
        }
        if (device.type === 'tablet') {
            return '#tablet-mac';
        }
        return '#desktop-mac';
    }

    _onFilesSelected(e) {
        const $input = e.target;
        const files = $input.files;
        Events.fire('files-selected', {
            files: files,
            to: this._peer.id
        });
        $input.files = null; // reset input
    }

    setProgress(progress, status) {
        const $progress = this.$el.querySelector('.progress');
        if (0.5 < progress && progress < 1) {
            $progress.classList.add('over50');
        } else {
            $progress.classList.remove('over50');
        }
        if (progress < 1) {
            if (status !== this.currentStatus) {
                let statusName = {
                    "prepare": Localization.getTranslation("peer-ui.preparing"),
                    "transfer": Localization.getTranslation("peer-ui.transferring"),
                    "process": Localization.getTranslation("peer-ui.processing"),
                    "wait": Localization.getTranslation("peer-ui.waiting")
                }[status];

                this.$el.setAttribute('status', status);
                this.$el.querySelector('.status').innerText = statusName;
                this.currentStatus = status;
            }
        } else {
            this.$el.removeAttribute('status');
            this.$el.querySelector('.status').innerHTML = '';
            progress = 0;
            this.currentStatus = null;
        }
        const degrees = `rotate(${360 * progress}deg)`;
        $progress.style.setProperty('--progress', degrees);
    }

    _onDrop(e) {
        e.preventDefault();
        Events.fire('files-selected', {
            files: e.dataTransfer.files,
            to: this._peer.id
        });
        this._onDragEnd();
    }

    _onDragOver() {
        this.$el.setAttribute('drop', 1);
        this.$xInstructions.setAttribute('drop-peer', 1);
    }

    _onDragEnd() {
        this.$el.removeAttribute('drop');
        this.$xInstructions.removeAttribute('drop-peer', 1);
    }

    _onRightClick(e) {
        e.preventDefault();
        Events.fire('text-recipient', {
            peerId: this._peer.id,
            deviceName: e.target.closest('x-peer').querySelector('.name').innerText
        });
    }

    _onTouchStart(e) {
        this._touchStart = Date.now();
        this._touchTimer = setTimeout(_ => this._onTouchEnd(e), 610);
    }

    _onTouchEnd(e) {
        if (Date.now() - this._touchStart < 500) {
            clearTimeout(this._touchTimer);
        } else if (this._touchTimer) { // this was a long tap
            e.preventDefault();
            Events.fire('text-recipient', {
                peerId: this._peer.id,
                deviceName: e.target.closest('x-peer').querySelector('.name').innerText
            });
        }
        this._touchTimer = null;
    }
}

class Dialog {
    constructor(id) {
        this.$el = $(id);
        this.$el.querySelectorAll('[close]').forEach(el => el.addEventListener('click', _ => this.hide()));
        this.$autoFocus = this.$el.querySelector('[autofocus]');

        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));
    }

    show() {
        this.$el.setAttribute('show', 1);
        if (!window.isMobile && this.$autoFocus) this.$autoFocus.focus();
    }

    isShown() {
        return !!this.$el.attributes["show"];
    }

    hide() {
        this.$el.removeAttribute('show');
        if (!window.isMobile && this.$autoFocus) {
            document.activeElement.blur();
            window.blur();
        }
        document.title = 'PairDrop';
        changeFavicon("images/favicon-96x96.png");
        this.correspondingPeerId = undefined;
    }

    _onPeerDisconnected(peerId) {
        if (this.isShown() && this.correspondingPeerId === peerId) {
            this.hide();
            Events.fire('notify-user', Localization.getTranslation("notifications.selected-peer-left"));
        }
    }
}

class LanguageSelectDialog extends Dialog {

    constructor() {
        super('language-select-dialog');

        this.$languageSelectBtn = $('language-selector');
        this.$languageSelectBtn.addEventListener('click', _ => this.show());

        this.$languageButtons = this.$el.querySelectorAll(".language-buttons button");
        this.$languageButtons.forEach($btn => {
            $btn.addEventListener("click", e => this.selectLanguage(e));
        })
        Events.on('keydown', e => this._onKeyDown(e));
    }

    _onKeyDown(e) {
        if (this.isShown() && e.code === "Escape") {
            this.hide();
        }
    }

    show() {
        if (Localization.isSystemLocale()) {
            this.$languageButtons[0].focus();
        } else {
            let locale = Localization.getLocale();
            for (let i=0; i<this.$languageButtons.length; i++) {
                const $btn = this.$languageButtons[i];
                if ($btn.value === locale) {
                    $btn.focus();
                    break;
                }
            }
        }
        super.show();
    }

    selectLanguage(e) {
        e.preventDefault()
        let languageCode = e.target.value;

        if (languageCode) {
            localStorage.setItem('language-code', languageCode);
        } else {
            localStorage.removeItem('language-code');
        }

        Localization.setTranslation(languageCode)
            .then(_ => this.hide());
    }
}

class ReceiveDialog extends Dialog {
    constructor(id) {
        super(id);
        this.$fileDescription = this.$el.querySelector('.file-description');
        this.$displayName = this.$el.querySelector('.display-name');
        this.$fileStem = this.$el.querySelector('.file-stem');
        this.$fileExtension = this.$el.querySelector('.file-extension');
        this.$fileOther = this.$el.querySelector('.file-other');
        this.$fileSize = this.$el.querySelector('.file-size');
        this.$previewBox = this.$el.querySelector('.file-preview');
        this.$receiveTitle = this.$el.querySelector('h2:first-of-type');
    }

    _formatFileSize(bytes) {
        // 1 GB = 1024 MB = 1024^2 KB = 1024^3 B
        // 1024^2 = 104876; 1024^3 = 1073741824
        if (bytes >= 1000000000) {
            return Math.round(10 * bytes / 1000000000) / 10 + ' GB';
        } else if (bytes >= 1000000) {
            return Math.round(10 * bytes / 1000000) / 10 + ' MB';
        } else if (bytes >= (1000)) {
            return Math.round(10 * bytes / 1000) / 10 + ' KB';
        } else {
            return bytes + ' bytes';
        }
    }

    _parseFileData(displayName, connectionHash, files, imagesOnly, totalSize, badgeClassName) {
        let fileOther = "";

        if (files.length === 2) {
            fileOther = imagesOnly
                ? Localization.getTranslation("dialogs.file-other-description-image")
                : Localization.getTranslation("dialogs.file-other-description-file");
        } else if (files.length >= 2) {
            fileOther = imagesOnly
                ? Localization.getTranslation("dialogs.file-other-description-image-plural", null, {count: files.length - 1})
                : Localization.getTranslation("dialogs.file-other-description-file-plural", null, {count: files.length - 1});
        }

        this.$fileOther.innerText = fileOther;

        const fileName = files[0].name;
        const fileNameSplit = fileName.split('.');
        const fileExtension = '.' + fileNameSplit[fileNameSplit.length - 1];
        this.$fileStem.innerText = fileName.substring(0, fileName.length - fileExtension.length);
        this.$fileExtension.innerText = fileExtension;
        this.$fileSize.innerText = this._formatFileSize(totalSize);
        this.$displayName.innerText = displayName;
        this.$displayName.title = connectionHash;
        this.$displayName.classList.remove("badge-room-ip", "badge-room-secret", "badge-room-public-id");
        this.$displayName.classList.add(badgeClassName)
    }
}

class ReceiveFileDialog extends ReceiveDialog {

    constructor() {
        super('receive-file-dialog');

        this.$downloadBtn = this.$el.querySelector('#download-btn');
        this.$shareBtn = this.$el.querySelector('#share-btn');

        Events.on('files-received', e => this._onFilesReceived(e.detail.peerId, e.detail.files, e.detail.imagesOnly, e.detail.totalSize));
        this._filesQueue = [];
    }

    _onFilesReceived(peerId, files, imagesOnly, totalSize) {
        const displayName = $(peerId).ui._displayName();
        const connectionHash = $(peerId).ui._connectionHash;
        const badgeClassName = $(peerId).ui._badgeClassName();

        this._filesQueue.push({
            peerId: peerId,
            displayName: displayName,
            connectionHash: connectionHash,
            files: files,
            imagesOnly: imagesOnly,
            totalSize: totalSize,
            badgeClassName: badgeClassName
        });

        this._nextFiles();

        window.blop.play();
    }

    _nextFiles() {
        if (this._busy) return;
        this._busy = true;
        const {peerId, displayName, connectionHash, files, imagesOnly, totalSize, badgeClassName} = this._filesQueue.shift();
        this._displayFiles(peerId, displayName, connectionHash, files, imagesOnly, totalSize, badgeClassName);
    }

    _dequeueFile() {
        if (!this._filesQueue.length) { // nothing to do
            this._busy = false;
            return;
        }
        // dequeue next file
        setTimeout(_ => {
            this._busy = false;
            this._nextFiles();
        }, 300);
    }

    createPreviewElement(file) {
        return new Promise((resolve, reject) => {
            try {
                let mime = file.type.split('/')[0]
                let previewElement = {
                    image: 'img',
                    audio: 'audio',
                    video: 'video'
                }

                if (Object.keys(previewElement).indexOf(mime) === -1) {
                    resolve(false);
                } else {
                    let element = document.createElement(previewElement[mime]);
                    element.controls = true;
                    element.onload = _ => {
                        this.$previewBox.appendChild(element);
                        resolve(true);
                    };
                    element.onloadeddata = _ => {
                        this.$previewBox.appendChild(element);
                        resolve(true);
                    };
                    element.onerror = _ => {
                        reject(`${mime} preview could not be loaded from type ${file.type}`);
                    };
                    element.src = URL.createObjectURL(file);
                }
            } catch (e) {
                reject(`preview could not be loaded from type ${file.type}`);
            }
        });
    }

    async _displayFiles(peerId, displayName, connectionHash, files, imagesOnly, totalSize, badgeClassName) {
        this._parseFileData(displayName, connectionHash, files, imagesOnly, totalSize, badgeClassName);

        let descriptor, url, filenameDownload;
        if (files.length === 1) {
            descriptor = imagesOnly
                ? Localization.getTranslation("dialogs.title-image")
                : Localization.getTranslation("dialogs.title-file");
        } else {
            descriptor = imagesOnly
                ? Localization.getTranslation("dialogs.title-image-plural")
                : Localization.getTranslation("dialogs.title-file-plural");
        }
        this.$receiveTitle.innerText = Localization.getTranslation("dialogs.receive-title", null, {descriptor: descriptor});

        const canShare = (window.iOS || window.android) && !!navigator.share && navigator.canShare({files});
        if (canShare) {
            this.$shareBtn.removeAttribute('hidden');
            this.$shareBtn.onclick = _ => {
                navigator.share({files: files})
                    .catch(err => {
                        console.error(err);
                    });
            }
        }

        let downloadZipped = false;
        if (files.length > 1) {
            downloadZipped = true;
            try {
                let bytesCompleted = 0;
                zipper.createNewZipWriter();
                for (let i=0; i<files.length; i++) {
                    await zipper.addFile(files[i], {
                        onprogress: (progress) => {
                            Events.fire('set-progress', {
                                peerId: peerId,
                                progress: (bytesCompleted + progress) / totalSize,
                                status: 'process'
                            })
                        }
                    });
                    bytesCompleted += files[i].size;
                }
                url = await zipper.getBlobURL();

                let now = new Date(Date.now());
                let year = now.getFullYear().toString();
                let month = (now.getMonth()+1).toString();
                month = month.length < 2 ? "0" + month : month;
                let date = now.getDate().toString();
                date = date.length < 2 ? "0" + date : date;
                let hours = now.getHours().toString();
                hours = hours.length < 2 ? "0" + hours : hours;
                let minutes = now.getMinutes().toString();
                minutes = minutes.length < 2 ? "0" + minutes : minutes;
                filenameDownload = `PairDrop_files_${year+month+date}_${hours+minutes}.zip`;
            } catch (e) {
                console.error(e);
                downloadZipped = false;
            }
        }

        this.$downloadBtn.innerText = Localization.getTranslation("dialogs.download");
        this.$downloadBtn.onclick = _ => {
            if (downloadZipped) {
                let tmpZipBtn = document.createElement("a");
                tmpZipBtn.download = filenameDownload;
                tmpZipBtn.href = url;
                tmpZipBtn.click();
            } else {
                this._downloadFilesIndividually(files);
            }

            if (!canShare) {
                this.$downloadBtn.innerText = Localization.getTranslation("dialogs.download-again");
            }
            Events.fire('notify-user', Localization.getTranslation("notifications.download-successful", null, {descriptor: descriptor}));
            this.$downloadBtn.style.pointerEvents = "none";
            setTimeout(_ => this.$downloadBtn.style.pointerEvents = "unset", 2000);
        };

        document.title = files.length === 1
            ? `${ Localization.getTranslation("document-titles.file-received") } - PairDrop`
            : `${ Localization.getTranslation("document-titles.file-received-plural", null, {count: files.length}) } - PairDrop`;
        changeFavicon("images/favicon-96x96-notification.png");

        Events.fire('set-progress', {peerId: peerId, progress: 1, status: 'process'})
        this.show();

        setTimeout(_ => {
            if (canShare) {
                this.$shareBtn.click();
            } else {
                this.$downloadBtn.click();
            }
        }, 500);

        this.createPreviewElement(files[0])
            .then(canPreview => {
                if (canPreview) {
                    console.log('the file is able to preview');
                } else {
                    console.log('the file is not able to preview');
                }
            })
            .catch(r => console.error(r));
    }

    _downloadFilesIndividually(files) {
        let tmpBtn = document.createElement("a");
        for (let i=0; i<files.length; i++) {
            tmpBtn.download = files[i].name;
            tmpBtn.href = URL.createObjectURL(files[i]);
            tmpBtn.click();
        }
    }

    hide() {
        this.$shareBtn.setAttribute('hidden', '');
        this.$previewBox.innerHTML = '';
        super.hide();
        this._dequeueFile();
    }
}

class ReceiveRequestDialog extends ReceiveDialog {

    constructor() {
        super('receive-request-dialog');

        this.$acceptRequestBtn = this.$el.querySelector('#accept-request');
        this.$declineRequestBtn = this.$el.querySelector('#decline-request');
        this.$acceptRequestBtn.addEventListener('click', _ => this._respondToFileTransferRequest(true));
        this.$declineRequestBtn.addEventListener('click', _ => this._respondToFileTransferRequest(false));

        Events.on('files-transfer-request', e => this._onRequestFileTransfer(e.detail.request, e.detail.peerId))
        Events.on('keydown', e => this._onKeyDown(e));
        this._filesTransferRequestQueue = [];
    }

    _onKeyDown(e) {
        if (this.isShown() && e.code === "Escape") {
            this._respondToFileTransferRequest(false);
        }
    }

    _onRequestFileTransfer(request, peerId) {
        this._filesTransferRequestQueue.push({request: request, peerId: peerId});
        if (this.isShown()) return;
        this._dequeueRequests();
    }

    _dequeueRequests() {
        if (!this._filesTransferRequestQueue.length) return;
        let {request, peerId} = this._filesTransferRequestQueue.shift();
        this._showRequestDialog(request, peerId)
    }

    _showRequestDialog(request, peerId) {
        this.correspondingPeerId = peerId;

        const displayName = $(peerId).ui._displayName();
        const connectionHash = $(peerId).ui._connectionHash;

        const badgeClassName = $(peerId).ui._badgeClassName();

        this._parseFileData(displayName, connectionHash, request.header, request.imagesOnly, request.totalSize, badgeClassName);

        if (request.thumbnailDataUrl && request.thumbnailDataUrl.substring(0, 22) === "data:image/jpeg;base64") {
            let element = document.createElement('img');
            element.src = request.thumbnailDataUrl;
            this.$previewBox.appendChild(element)
        }

        const transferRequestTitle= request.imagesOnly
            ? Localization.getTranslation('document-titles.image-transfer-requested')
            : Localization.getTranslation('document-titles.file-transfer-requested');

        this.$receiveTitle.innerText = transferRequestTitle;

        document.title =  `${transferRequestTitle} - PairDrop`;
        changeFavicon("images/favicon-96x96-notification.png");
        this.show();
    }

    _respondToFileTransferRequest(accepted) {
        Events.fire('respond-to-files-transfer-request', {
            to: this.correspondingPeerId,
            accepted: accepted
        })
        if (accepted) {
            Events.fire('set-progress', {peerId: this.correspondingPeerId, progress: 0, status: 'wait'});
            NoSleepUI.enable();
        }
        this.hide();
    }

    hide() {
        // clear previewBox after dialog is closed
        setTimeout(_ => this.$previewBox.innerHTML = '', 300);

        super.hide();

        // show next request
        setTimeout(_ => this._dequeueRequests(), 500);
    }
}

class InputKeyContainer {
    constructor(inputKeyContainer, evaluationRegex, onAllCharsFilled, onNoAllCharsFilled, onLastCharFilled) {

        this.$inputKeyContainer = inputKeyContainer;
        this.$inputKeyChars = inputKeyContainer.querySelectorAll('input');

        this.$inputKeyChars.forEach(char => char.addEventListener('input', e => this._onCharsInput(e)));
        this.$inputKeyChars.forEach(char => char.addEventListener('keydown', e => this._onCharsKeyDown(e)));
        this.$inputKeyChars.forEach(char => char.addEventListener('keyup', e => this._onCharsKeyUp(e)));
        this.$inputKeyChars.forEach(char => char.addEventListener('focus', e => e.target.select()));
        this.$inputKeyChars.forEach(char => char.addEventListener('click', e => e.target.select()));

        this.evalRgx = evaluationRegex

        this._onAllCharsFilled = onAllCharsFilled;
        this._onNotAllCharsFilled = onNoAllCharsFilled;
        this._onLastCharFilled = onLastCharFilled;
    }

    _enableChars() {
        this.$inputKeyChars.forEach(char => char.removeAttribute("disabled"));
    }

    _disableChars() {
        this.$inputKeyChars.forEach(char => char.setAttribute("disabled", ""));
    }

    _clearChars() {
        this.$inputKeyChars.forEach(char => char.value = '');
    }

    _cleanUp() {
        this._clearChars();
        this._disableChars();
    }

    _onCharsInput(e) {
        if (!e.target.value.match(this.evalRgx)) {
            e.target.value = '';
            return;
        }
        this._evaluateKeyChars();

        let nextSibling = e.target.nextElementSibling;
        if (nextSibling) {
            e.preventDefault();
            nextSibling.focus();
        }
    }

    _onCharsKeyDown(e) {
        let previousSibling = e.target.previousElementSibling;
        let nextSibling = e.target.nextElementSibling;
        if (e.key === "Backspace" && previousSibling && !e.target.value) {
            previousSibling.value = '';
            previousSibling.focus();
        } else if (e.key === "ArrowRight" && nextSibling) {
            e.preventDefault();
            nextSibling.focus();
        } else if (e.key === "ArrowLeft" && previousSibling) {
            e.preventDefault();
            previousSibling.focus();
        }
    }

    _onCharsKeyUp(e) {
        // deactivate submit btn when e.g. using backspace to clear element
        if (!e.target.value) {
            this._evaluateKeyChars();
        }
    }

    _getInputKey() {
        let key = "";
        this.$inputKeyChars.forEach(char => {
            key += char.value;
        })
        return key;
    }

    _onPaste(pastedKey) {
        let rgx = new RegExp("(?!" + this.evalRgx.source + ").", "g");
        pastedKey = pastedKey.replace(rgx,'').substring(0, this.$inputKeyChars.length)
        for (let i = 0; i < pastedKey.length; i++) {
            document.activeElement.value = pastedKey.charAt(i);
            let nextSibling = document.activeElement.nextElementSibling;
            if (!nextSibling) break;
            nextSibling.focus();
        }
        this._evaluateKeyChars();
    }

    _evaluateKeyChars() {
        if (this.$inputKeyContainer.querySelectorAll('input:placeholder-shown').length > 0) {
            this._onNotAllCharsFilled();
        } else {
            this._onAllCharsFilled();

            const lastCharFocused = document.activeElement === this.$inputKeyChars[this.$inputKeyChars.length - 1];
            if (lastCharFocused) {
                this._onLastCharFilled();
            }
        }
    }

    focusLastChar() {
        let lastChar = this.$inputKeyChars[this.$inputKeyChars.length-1];
        lastChar.focus();
    }
}

class PairDeviceDialog extends Dialog {
    constructor() {
        super('pair-device-dialog');
        this.$pairDeviceHeaderBtn = $('pair-device');
        this.$editPairedDevicesHeaderBtn = $('edit-paired-devices');
        this.$footerInstructionsPairedDevices = $$('.discovery-wrapper .badge-room-secret');

        this.$key = this.$el.querySelector('.key');
        this.$qrCode = this.$el.querySelector('.key-qr-code');
        this.$form = this.$el.querySelector('form');
        this.$closeBtn = this.$el.querySelector('[close]')
        this.$pairSubmitBtn = this.$el.querySelector('button[type="submit"]');

        this.inputKeyContainer = new InputKeyContainer(
            this.$el.querySelector('.input-key-container'),
            /\d/,
            () => this.$pairSubmitBtn.removeAttribute("disabled"),
            () => this.$pairSubmitBtn.setAttribute("disabled", ""),
            () => this._submit()
        );

        this.$pairDeviceHeaderBtn.addEventListener('click', _ => this._pairDeviceInitiate());
        this.$form.addEventListener('submit', e => this._onSubmit(e));
        this.$closeBtn.addEventListener('click', _ => this._close());

        Events.on('keydown', e => this._onKeyDown(e));
        Events.on('ws-disconnected', _ => this.hide());
        Events.on('pair-device-initiated', e => this._onPairDeviceInitiated(e.detail));
        Events.on('pair-device-joined', e => this._onPairDeviceJoined(e.detail.peerId, e.detail.roomSecret));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('pair-device-join-key-invalid', _ => this._onPublicRoomJoinKeyInvalid());
        Events.on('pair-device-canceled', e => this._onPairDeviceCanceled(e.detail));
        Events.on('evaluate-number-room-secrets', _ => this._evaluateNumberRoomSecrets())
        Events.on('secret-room-deleted', e => this._onSecretRoomDeleted(e.detail));
        this.$el.addEventListener('paste', e => this._onPaste(e));
        this.$qrCode.addEventListener('click', _ => this._copyPairUrl());

        this.evaluateUrlAttributes();

        this.pairPeer = {};

        this._evaluateNumberRoomSecrets();
    }

    _onKeyDown(e) {
        if (this.isShown() && e.code === "Escape") {
            // Timeout to prevent paste mode from getting cancelled simultaneously
            setTimeout(_ => this._close(), 50);
        }
    }

    _onPaste(e) {
        e.preventDefault();
        let pastedKey = e.clipboardData.getData("Text").replace(/\D/g,'').substring(0, 6);
        this.inputKeyContainer._onPaste(pastedKey);
    }

    evaluateUrlAttributes() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('pair_key')) {
            this._pairDeviceJoin(urlParams.get('pair_key'));
            const url = getUrlWithoutArguments();
            window.history.replaceState({}, "Rewrite URL", url); //remove pair_key from url
        }
    }

    _pairDeviceInitiate() {
        Events.fire('pair-device-initiate');
    }

    _onPairDeviceInitiated(msg) {
        this.pairKey = msg.pairKey;
        this.roomSecret = msg.roomSecret;
        this.$key.innerText = `${this.pairKey.substring(0,3)} ${this.pairKey.substring(3,6)}`
        // Display the QR code for the url
        const qr = new QRCode({
            content: this._getPairUrl(),
            width: 150,
            height: 150,
            padding: 0,
            background: "transparent",
            color: `rgb(var(--text-color))`,
            ecl: "L",
            join: true
        });
        this.$qrCode.innerHTML = qr.svg();
        this.inputKeyContainer._enableChars();
        this.show();
    }

    _getPairUrl() {
        let url = new URL(location.href);
        url.searchParams.append('pair_key', this.pairKey)
        return url.href;
    }

    _copyPairUrl() {
        navigator.clipboard.writeText(this._getPairUrl())
            .then(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.pair-url-copied-to-clipboard"));
            })
            .catch(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.copied-to-clipboard-error"));
            })
    }

    _onSubmit(e) {
        e.preventDefault();
        this._submit();
    }

    _submit() {
        let inputKey = this.inputKeyContainer._getInputKey();
        this._pairDeviceJoin(inputKey);
    }

    _pairDeviceJoin(pairKey) {
        if (/^\d{6}$/g.test(pairKey)) {
            Events.fire('pair-device-join', pairKey);
            this.inputKeyContainer.focusLastChar();
        }
    }

    _onPairDeviceJoined(peerId, roomSecret) {
        // abort if peer is another tab on the same browser and remove room-type from gui
        if (BrowserTabsConnector.peerIsSameBrowser(peerId)) {
            this._cleanUp();
            this.hide();

            Events.fire('room-secrets-deleted', [roomSecret]);

            Events.fire('notify-user', Localization.getTranslation("notifications.pairing-tabs-error"));
            return;
        }

        // save pairPeer and wait for it to connect to ensure both devices have gotten the roomSecret
        this.pairPeer = {
            "peerId": peerId,
            "roomSecret": roomSecret
        };
    }

    _onPeers(message) {
        message.peers.forEach(messagePeer => {
            this._evaluateJoinedPeer(messagePeer.id, message.roomType, message.roomId);
        });
    }

    _onPeerJoined(message) {
        this._evaluateJoinedPeer(message.peer.id, message.roomType, message.roomId);
    }

    _evaluateJoinedPeer(peerId, roomType, roomId) {
        const noPairPeerSaved = !Object.keys(this.pairPeer);

        if (!peerId || !roomType || !roomId || noPairPeerSaved) return;

        const samePeerId = peerId === this.pairPeer.peerId;
        const sameRoomSecret = roomId === this.pairPeer.roomSecret;
        const typeIsSecret = roomType === "secret";

        if (!samePeerId || !sameRoomSecret || !typeIsSecret) return;

        this._onPairPeerJoined(peerId, roomId);
        this.pairPeer = {};
    }

    _onPairPeerJoined(peerId, roomSecret) {
        // if devices are paired that are already connected we must save the names at this point
        const $peer = $(peerId);
        let displayName, deviceName;
        if ($peer) {
            displayName = $peer.ui._peer.name.displayName;
            deviceName = $peer.ui._peer.name.deviceName;
        }

        PersistentStorage.addRoomSecret(roomSecret, displayName, deviceName)
            .then(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.pairing-success"));
                this._evaluateNumberRoomSecrets();
            })
            .finally(_ => {
                this._cleanUp();
                this.hide();
            })
            .catch(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.pairing-not-persistent"));
                PersistentStorage.logBrowserNotCapable();
            });
    }

    _onPublicRoomJoinKeyInvalid() {
        Events.fire('notify-user', Localization.getTranslation("notifications.pairing-key-invalid"));
    }

    _close() {
        this._pairDeviceCancel();
    }

    _pairDeviceCancel() {
        this.hide();
        this._cleanUp();
        Events.fire('pair-device-cancel');
    }

    _onPairDeviceCanceled(pairKey) {
        Events.fire('notify-user', Localization.getTranslation("notifications.pairing-key-invalidated", null, {key: pairKey}));
    }

    _cleanUp() {
        this.roomSecret = null;
        this.pairKey = null;
        this.inputKeyContainer._cleanUp();
        this.pairPeer = {};
    }

    _onSecretRoomDeleted(roomSecret) {
        PersistentStorage.deleteRoomSecret(roomSecret).then(_ => {
            this._evaluateNumberRoomSecrets();
        });
    }

    _evaluateNumberRoomSecrets() {
        PersistentStorage.getAllRoomSecrets()
            .then(roomSecrets => {
                if (roomSecrets.length > 0) {
                    this.$editPairedDevicesHeaderBtn.removeAttribute('hidden');
                    this.$footerInstructionsPairedDevices.removeAttribute('hidden');
                } else {
                    this.$editPairedDevicesHeaderBtn.setAttribute('hidden', '');
                    this.$footerInstructionsPairedDevices.setAttribute('hidden', '');
                }
                Events.fire('evaluate-footer-badges');
                Events.fire('header-evaluated', 'edit-paired-devices');
            });
    }
}

class EditPairedDevicesDialog extends Dialog {
    constructor() {
        super('edit-paired-devices-dialog');
        this.$pairedDevicesWrapper = this.$el.querySelector('.paired-devices-wrapper');
        this.$footerBadgePairedDevices = $$('.discovery-wrapper .badge-room-secret');

        $('edit-paired-devices').addEventListener('click', _ => this._onEditPairedDevices());
        this.$footerBadgePairedDevices.addEventListener('click', _ => this._onEditPairedDevices());

        Events.on('peer-display-name-changed', e => this._onPeerDisplayNameChanged(e));
        Events.on('keydown', e => this._onKeyDown(e));
    }

    _onKeyDown(e) {
        if (this.isShown() && e.code === "Escape") {
            this.hide();
        }
    }

    async _initDOM() {
        const unpairString = Localization.getTranslation("dialogs.unpair").toUpperCase();
        const autoAcceptString = Localization.getTranslation("dialogs.auto-accept").toLowerCase();
        const roomSecretsEntries = await PersistentStorage.getAllRoomSecretEntries();

        roomSecretsEntries.forEach(roomSecretsEntry => {
            let $pairedDevice = document.createElement('div');
            $pairedDevice.classList = ["paired-device"];

            $pairedDevice.innerHTML = `
            <div class="display-name">
                <span>${roomSecretsEntry.display_name}</span>
            </div>
            <div class="device-name">
                <span>${roomSecretsEntry.device_name}</span>
            </div>
            <div class="button-wrapper">
                <label class="auto-accept pointer">${autoAcceptString}
                    <input type="checkbox" ${roomSecretsEntry.auto_accept ? "checked" : ""}>
                </label>
                <button class="button" type="button">${unpairString}</button>
            </div>`

            $pairedDevice.querySelector('input[type="checkbox"]').addEventListener('click', e => {
                PersistentStorage.updateRoomSecretAutoAccept(roomSecretsEntry.secret, e.target.checked).then(roomSecretsEntry => {
                    Events.fire('auto-accept-updated', {
                        'roomSecret': roomSecretsEntry.entry.secret,
                        'autoAccept': e.target.checked
                    });
                });
            });

            $pairedDevice.querySelector('button').addEventListener('click', e => {
                PersistentStorage.deleteRoomSecret(roomSecretsEntry.secret).then(roomSecret => {
                    Events.fire('room-secrets-deleted', [roomSecret]);
                    Events.fire('evaluate-number-room-secrets');
                    e.target.parentNode.parentNode.remove();
                });
            })

            this.$pairedDevicesWrapper.html = "";
            this.$pairedDevicesWrapper.appendChild($pairedDevice)
        })

    }

    hide() {
        super.hide();
        setTimeout(_ => {
            this.$pairedDevicesWrapper.innerHTML = ""
        }, 300);
    }

    _onEditPairedDevices() {
        this._initDOM().then(_ => this.show());
    }

    _clearRoomSecrets() {
        PersistentStorage.getAllRoomSecrets()
            .then(roomSecrets => {
                PersistentStorage.clearRoomSecrets().finally(_ => {
                    Events.fire('room-secrets-deleted', roomSecrets);
                    Events.fire('evaluate-number-room-secrets');
                    Events.fire('notify-user', Localization.getTranslation("notifications.pairing-cleared"));
                    this.hide();
                })
            });
    }

    _onPeerDisplayNameChanged(e) {
        const peerId = e.detail.peerId;
        const peerNode = $(peerId);

        if (!peerNode) return;

        const peer = peerNode.ui._peer;

        if (!peer || !peer._roomIds["secret"]) return;

        PersistentStorage.updateRoomSecretNames(peer._roomIds["secret"], peer.name.displayName, peer.name.deviceName).then(roomSecretEntry => {
            console.log(`Successfully updated DisplayName and DeviceName for roomSecretEntry ${roomSecretEntry.key}`);
        })
    }
}

class PublicRoomDialog extends Dialog {
    constructor() {
        super('public-room-dialog');

        this.$key = this.$el.querySelector('.key');
        this.$qrCode = this.$el.querySelector('.key-qr-code');
        this.$form = this.$el.querySelector('form');
        this.$closeBtn = this.$el.querySelector('[close]');
        this.$leaveBtn = this.$el.querySelector('.leave-room');
        this.$joinSubmitBtn = this.$el.querySelector('button[type="submit"]');
        this.$headerBtnJoinPublicRoom = $('join-public-room');
        this.$footerBadgePublicRoomDevices = $$('.discovery-wrapper .badge-room-public-id');


        this.$form.addEventListener('submit', e => this._onSubmit(e));
        this.$closeBtn.addEventListener('click', _ => this.hide());
        this.$leaveBtn.addEventListener('click', _ => this._leavePublicRoom())

        this.$headerBtnJoinPublicRoom.addEventListener('click', _ => this._onHeaderBtnClick());
        this.$footerBadgePublicRoomDevices.addEventListener('click', _ => this._onHeaderBtnClick());

        this.inputKeyContainer = new InputKeyContainer(
            this.$el.querySelector('.input-key-container'),
            /[a-z|A-Z]/,
            () => this.$joinSubmitBtn.removeAttribute("disabled"),
            () => this.$joinSubmitBtn.setAttribute("disabled", ""),
            () => this._submit()
        );

        Events.on('keydown', e => this._onKeyDown(e));
        Events.on('public-room-created', e => this._onPublicRoomCreated(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('public-room-id-invalid', e => this._onPublicRoomIdInvalid(e.detail));
        Events.on('public-room-left', _ => this._onPublicRoomLeft());
        this.$el.addEventListener('paste', e => this._onPaste(e));
        this.$qrCode.addEventListener('click', _ => this._copyShareRoomUrl());

        this.evaluateUrlAttributes();

        Events.on('ws-connected', _ => this._onWsConnected());
        Events.on('translation-loaded', _ => this.setFooterBadge());
    }

    _onKeyDown(e) {
        if (this.isShown() && e.code === "Escape") {
            this.hide();
        }
    }

    _onPaste(e) {
        e.preventDefault();
        let pastedKey = e.clipboardData.getData("Text");
        this.inputKeyContainer._onPaste(pastedKey);
    }

    _onHeaderBtnClick() {
        if (this.roomId) {
            this.show();
        } else {
            this._createPublicRoom();
        }
    }

    _createPublicRoom() {
        Events.fire('create-public-room');
    }

    _onPublicRoomCreated(roomId) {
        this.roomId = roomId;

        this.setIdAndQrCode();

        this.show();

        sessionStorage.setItem('public_room_id', roomId);
    }

    setIdAndQrCode() {
        if (!this.roomId) return;

        this.$key.innerText = this.roomId.toUpperCase();

        // Display the QR code for the url
        const qr = new QRCode({
            content: this._getShareRoomUrl(),
            width: 150,
            height: 150,
            padding: 0,
            background: "transparent",
            color: `rgb(var(--text-color))`,
            ecl: "L",
            join: true
        });
        this.$qrCode.innerHTML = qr.svg();

        this.setFooterBadge();
    }

    setFooterBadge() {
        if (!this.roomId) return;

        this.$footerBadgePublicRoomDevices.innerText = Localization.getTranslation("footer.public-room-devices", null, {
            roomId: this.roomId.toUpperCase()
        });
        this.$footerBadgePublicRoomDevices.removeAttribute('hidden');

        Events.fire('evaluate-footer-badges');
    }

    _getShareRoomUrl() {
        let url = new URL(location.href);
        url.searchParams.append('room_id', this.roomId)
        return url.href;
    }

    _copyShareRoomUrl() {
        navigator.clipboard.writeText(this._getShareRoomUrl())
            .then(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.room-url-copied-to-clipboard"));
            })
            .catch(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.copied-to-clipboard-error"));
            })
    }

    evaluateUrlAttributes() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('room_id')) {
            this._joinPublicRoom(urlParams.get('room_id'));
            const url = getUrlWithoutArguments();
            window.history.replaceState({}, "Rewrite URL", url); //remove pair_key from url
        }
    }

    _onWsConnected() {
        let roomId = sessionStorage.getItem('public_room_id');

        if (!roomId) return;

        this.roomId = roomId;
        this.setIdAndQrCode();

        this._joinPublicRoom(roomId, true);
    }

    _onSubmit(e) {
        e.preventDefault();
        this._submit();
    }

    _submit() {
        let inputKey = this.inputKeyContainer._getInputKey();
        this._joinPublicRoom(inputKey);
    }

    _joinPublicRoom(roomId, createIfInvalid = false) {
        roomId = roomId.toLowerCase();
        if (/^[a-z]{5}$/g.test(roomId)) {
            this.roomIdJoin = roomId;

            this.inputKeyContainer.focusLastChar();

            Events.fire('join-public-room', {
                roomId: roomId,
                createIfInvalid: createIfInvalid
            });
        }
    }

    _onPeers(message) {
        message.peers.forEach(messagePeer => {
            this._evaluateJoinedPeer(messagePeer.id, message.roomId);
        });
    }

    _onPeerJoined(message) {
        this._evaluateJoinedPeer(message.peer.id, message.roomId);
    }

    _evaluateJoinedPeer(peerId, roomId) {
        const isInitiatedRoomId = roomId === this.roomId;
        const isJoinedRoomId = roomId === this.roomIdJoin;

        if (!peerId || !roomId || !(isInitiatedRoomId || isJoinedRoomId)) return;

        this.hide();

        sessionStorage.setItem('public_room_id', roomId);

        if (isJoinedRoomId) {
            this.roomId = roomId;
            this.roomIdJoin = false;
            this.setIdAndQrCode();
        }
    }

    _onPublicRoomIdInvalid(roomId) {
        Events.fire('notify-user', Localization.getTranslation("notifications.public-room-id-invalid"));
        if (roomId === sessionStorage.getItem('public_room_id')) {
            sessionStorage.removeItem('public_room_id');
        }
    }

    _leavePublicRoom() {
        Events.fire('leave-public-room', this.roomId);
    }

    _onPublicRoomLeft() {
        let publicRoomId = this.roomId.toUpperCase();
        this.hide();
        this._cleanUp();
        Events.fire('notify-user', Localization.getTranslation("notifications.public-room-left", null, {publicRoomId: publicRoomId}));
    }

    show() {
        this.inputKeyContainer._enableChars();
        super.show();
    }

    hide() {
        this.inputKeyContainer._cleanUp();
        super.hide();
    }

    _cleanUp() {
        this.roomId = null;
        this.inputKeyContainer._cleanUp();
        sessionStorage.removeItem('public_room_id');
        this.$footerBadgePublicRoomDevices.setAttribute('hidden', '');
        Events.fire('evaluate-footer-badges');
    }
}

class SendTextDialog extends Dialog {
    constructor() {
        super('send-text-dialog');
        Events.on('text-recipient', e => this._onRecipient(e.detail.peerId, e.detail.deviceName));
        this.$text = this.$el.querySelector('#text-input');
        this.$peerDisplayName = this.$el.querySelector('.display-name');
        this.$form = this.$el.querySelector('form');
        this.$submit = this.$el.querySelector('button[type="submit"]');
        this.$form.addEventListener('submit', e => this._onSubmit(e));
        this.$text.addEventListener('input', e => this._onChange(e));
        Events.on('keydown', e => this._onKeyDown(e));
    }

    async _onKeyDown(e) {
        if (!this.isShown()) return;

        if (e.code === "Escape") {
            this.hide();
        } else if (e.code === "Enter" && (e.ctrlKey || e.metaKey)) {
            if (this._textInputEmpty()) return;
            this._send();
        }
    }

    _textInputEmpty() {
        return !this.$text.innerText || this.$text.innerText === "\n";
    }

    _onChange(e) {
        if (this._textInputEmpty()) {
            this.$submit.setAttribute('disabled', '');
        } else {
            this.$submit.removeAttribute('disabled');
        }
    }

    _onRecipient(peerId, deviceName) {
        this.correspondingPeerId = peerId;
        this.$peerDisplayName.innerText = deviceName;
        this.$peerDisplayName.classList.remove("badge-room-ip", "badge-room-secret", "badge-room-public-id");
        this.$peerDisplayName.classList.add($(peerId).ui._badgeClassName());

        this.show();

        const range = document.createRange();
        const sel = window.getSelection();

        range.selectNodeContents(this.$text);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    _onSubmit(e) {
        e.preventDefault();
        this._send();
    }

    _send() {
        Events.fire('send-text', {
            to: this.correspondingPeerId,
            text: this.$text.innerText
        });
        this.$text.innerText = "";
        this.hide();
    }
}

class ReceiveTextDialog extends Dialog {
    constructor() {
        super('receive-text-dialog');
        Events.on('text-received', e => this._onText(e.detail.text, e.detail.peerId));
        this.$text = this.$el.querySelector('#text');
        this.$copy = this.$el.querySelector('#copy');
        this.$close = this.$el.querySelector('#close');

        this.$copy.addEventListener('click', _ => this._onCopy());
        this.$close.addEventListener('click', _ => this.hide());

        Events.on('keydown', e => this._onKeyDown(e));

        this.$displayName = this.$el.querySelector('.display-name');
        this._receiveTextQueue = [];
    }

    async _onKeyDown(e) {
        if (this.isShown()) {
            if (e.code === "KeyC" && (e.ctrlKey || e.metaKey)) {
                await this._onCopy()
                this.hide();
            } else if (e.code === "Escape") {
                this.hide();
            }
        }
    }

    _onText(text, peerId) {
        window.blop.play();
        this._receiveTextQueue.push({text: text, peerId: peerId});
        this._setDocumentTitleMessages();
        if (this.isShown()) return;
        this._dequeueRequests();
    }

    _dequeueRequests() {
        if (!this._receiveTextQueue.length) return;
        let {text, peerId} = this._receiveTextQueue.shift();
        this._showReceiveTextDialog(text, peerId);
    }

    _showReceiveTextDialog(text, peerId) {
        this.$displayName.innerText = $(peerId).ui._displayName();
        this.$displayName.classList.remove("badge-room-ip", "badge-room-secret", "badge-room-public-id");
        this.$displayName.classList.add($(peerId).ui._badgeClassName());

        this.$text.innerText = text;
        this.$text.classList.remove('text-center');

        // Beautify text if text is short
        if (text.length < 2000) {
            // replace urls with actual links
            this.$text.innerHTML = this.$text.innerHTML.replace(/((https?:\/\/|www)[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\-._~:\/?#\[\]@!$&'()*+,;=]+)/g, url => {
                return `<a href="${url}" target="_blank">${url}</a>`;
            });
        }

        this._setDocumentTitleMessages();

        changeFavicon("images/favicon-96x96-notification.png");
        this.show();
    }

    _setDocumentTitleMessages() {
        document.title = !this._receiveTextQueue.length
            ? `${ Localization.getTranslation("document-titles.message-received") } - PairDrop`
            : `${ Localization.getTranslation("document-titles.message-received-plural", null, {count: this._receiveTextQueue.length + 1}) } - PairDrop`;
    }

    async _onCopy() {
        const sanitizedText = this.$text.innerText.replace(/\u00A0/gm, ' ');
        navigator.clipboard.writeText(sanitizedText)
            .then(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.copied-to-clipboard"));
                this.hide();
            })
            .catch(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.copied-to-clipboard-error"));
            });
    }

    hide() {
        super.hide();
        setTimeout(_ => this._dequeueRequests(), 500);
    }
}

class Base64ZipDialog extends Dialog {

    constructor() {
        super('base64-paste-dialog');
        const urlParams = new URL(window.location).searchParams;
        const base64Text = urlParams.get('base64text');
        const base64Zip = urlParams.get('base64zip');
        const base64Hash = window.location.hash.substring(1);

        this.$pasteBtn = this.$el.querySelector('#base64-paste-btn');
        this.$fallbackTextarea = this.$el.querySelector('.textarea');

        if (base64Text) {
            this.show();
            if (base64Text === 'paste') {
                // ?base64text=paste
                // base64 encoded string is ready to be pasted from clipboard
                this.preparePasting('text');
            } else if (base64Text === 'hash') {
                // ?base64text=hash#BASE64ENCODED
                // base64 encoded string is url hash which is never sent to server and faster (recommended)
                this.processBase64Text(base64Hash)
                    .catch(_ => {
                        Events.fire('notify-user', Localization.getTranslation("notifications.text-content-incorrect"));
                        console.log("Text content incorrect.");
                    }).finally(_ => {
                        this.hide();
                    });
            } else {
                // ?base64text=BASE64ENCODED
                // base64 encoded string was part of url param (not recommended)
                this.processBase64Text(base64Text)
                    .catch(_ => {
                        Events.fire('notify-user', Localization.getTranslation("notifications.text-content-incorrect"));
                        console.log("Text content incorrect.");
                    }).finally(_ => {
                        this.hide();
                    });
            }
        } else if (base64Zip) {
            this.show();
            if (base64Zip === "hash") {
                // ?base64zip=hash#BASE64ENCODED
                // base64 encoded zip file is url hash which is never sent to the server
                this.processBase64Zip(base64Hash)
                    .catch(_ => {
                        Events.fire('notify-user', Localization.getTranslation("notifications.file-content-incorrect"));
                        console.log("File content incorrect.");
                    }).finally(_ => {
                        this.hide();
                    });
            } else {
                // ?base64zip=paste || ?base64zip=true
                this.preparePasting('files');
            }
        }
    }

    _setPasteBtnToProcessing() {
        this.$pasteBtn.style.pointerEvents = "none";
        this.$pasteBtn.innerText = Localization.getTranslation("dialogs.base64-processing");
    }

    preparePasting(type) {
        const translateType = type === 'text'
            ? Localization.getTranslation("dialogs.base64-text")
            : Localization.getTranslation("dialogs.base64-files");

        if (navigator.clipboard.readText) {
            this.$pasteBtn.innerText = Localization.getTranslation("dialogs.base64-tap-to-paste", null, {type: translateType});
            this._clickCallback = _ => this.processClipboard(type);
            this.$pasteBtn.addEventListener('click', _ => this._clickCallback());
        } else {
            console.log("`navigator.clipboard.readText()` is not available on your browser.\nOn Firefox you can set `dom.events.asyncClipboard.readText` to true under `about:config` for convenience.")
            this.$pasteBtn.setAttribute('hidden', '');
            this.$fallbackTextarea.setAttribute('placeholder', Localization.getTranslation("dialogs.base64-paste-to-send", null, {type: translateType}));
            this.$fallbackTextarea.removeAttribute('hidden');
            this._inputCallback = _ => this.processInput(type);
            this.$fallbackTextarea.addEventListener('input', _ => this._inputCallback());
            this.$fallbackTextarea.focus();
        }
    }

    async processInput(type) {
        const base64 = this.$fallbackTextarea.textContent;
        this.$fallbackTextarea.textContent = '';
        await this.processBase64(type, base64);
    }

    async processClipboard(type) {
        const base64 = await navigator.clipboard.readText();
        await this.processBase64(type, base64);
    }

    isValidBase64(base64) {
        try {
            // check if input is base64 encoded
            window.atob(base64);
            return true;
        } catch (e) {
            // input is not base64 string.
            return false;
        }
    }

    async processBase64(type, base64) {
        if (!base64 || !this.isValidBase64(base64)) return;
        this._setPasteBtnToProcessing();
        try {
            if (type === 'text') {
                await this.processBase64Text(base64);
            } else {
                await this.processBase64Zip(base64);
            }
        } catch(_) {
            Events.fire('notify-user', Localization.getTranslation("notifications.clipboard-content-incorrect"));
            console.log("Clipboard content is incorrect.")
        }
        this.hide();
    }

    processBase64Text(base64Text){
        return new Promise((resolve) => {
            this._setPasteBtnToProcessing();
            let decodedText = decodeURIComponent(escape(window.atob(base64Text)));
            Events.fire('activate-paste-mode', {files: [], text: decodedText});
            resolve();
        });
    }

    async processBase64Zip(base64zip) {
        this._setPasteBtnToProcessing();
        let bstr = atob(base64zip), n = bstr.length, u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }

        const zipBlob = new File([u8arr], 'archive.zip');

        let files = [];
        const zipEntries = await zipper.getEntries(zipBlob);
        for (let i = 0; i < zipEntries.length; i++) {
            let fileBlob = await zipper.getData(zipEntries[i]);
            files.push(new File([fileBlob], zipEntries[i].filename));
        }
        Events.fire('activate-paste-mode', {files: files, text: ""});
    }

    clearBrowserHistory() {
        const url = getUrlWithoutArguments();
        window.history.replaceState({}, "Rewrite URL", url);
    }

    hide() {
        this.clearBrowserHistory();
        this.$pasteBtn.removeEventListener('click', _ => this._clickCallback());
        this.$fallbackTextarea.removeEventListener('input', _ => this._inputCallback());
        super.hide();
    }
}

class Toast extends Dialog {
    constructor() {
        super('toast');
        Events.on('notify-user', e => this._onNotify(e.detail));
    }

    _onNotify(message) {
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        this.$el.innerText = typeof message === "object" ? message.message : message;
        this.show();

        if (typeof message === "object" && message.persistent) return;

        this.hideTimeout = setTimeout(() => this.hide(), 5000);
    }
}

class Notifications {

    constructor() {
        // Check if the browser supports notifications
        if (!('Notification' in window)) return;

        // Check whether notification permissions have already been granted
        if (Notification.permission !== 'granted') {
            this.$headerNotificationButton = $('notification');
            this.$headerNotificationButton.removeAttribute('hidden');
            this.$headerNotificationButton.addEventListener('click', _ => this._requestPermission());
        }

        Events.fire('header-evaluated', 'notification');

        Events.on('text-received', e => this._messageNotification(e.detail.text, e.detail.peerId));
        Events.on('files-received', e => this._downloadNotification(e.detail.files));
        Events.on('files-transfer-request', e => this._requestNotification(e.detail.request, e.detail.peerId));
    }

    _requestPermission() {
        Notification.requestPermission(permission => {
            if (permission !== 'granted') {
                Events.fire('notify-user', Localization.getTranslation("notifications.notifications-permissions-error"));
                return;
            }
            Events.fire('notify-user', Localization.getTranslation("notifications.notifications-enabled"));
            this.$headerNotificationButton.setAttribute('hidden', "");
        });
    }

    _notify(title, body) {
        const config = {
            body: body,
            icon: '/images/logo_transparent_128x128.png',
        }
        let notification;
        try {
            notification = new Notification(title, config);
        } catch (e) {
            // Android doesn't support "new Notification" if service worker is installed
            if (!serviceWorker || !serviceWorker.showNotification) return;
            notification = serviceWorker.showNotification(title, config);
        }

        // Notification is persistent on Android. We have to close it manually
        const visibilitychangeHandler = () => {
            if (document.visibilityState === 'visible') {
                notification.close();
                Events.off('visibilitychange', visibilitychangeHandler);
            }
        };
        Events.on('visibilitychange', visibilitychangeHandler);

        return notification;
    }

    _messageNotification(message, peerId) {
        if (document.visibilityState !== 'visible') {
            const peerDisplayName = $(peerId).ui._displayName();
            if (/^((https?:\/\/|www)[abcdefghijklmnopqrstuvwxyz0123456789\-._~:\/?#\[\]@!$&'()*+,;=]+)$/.test(message.toLowerCase())) {
                const notification = this._notify(Localization.getTranslation("notifications.link-received", null, {name: peerDisplayName}), message);
                this._bind(notification, _ => window.open(message, '_blank', null, true));
            } else {
                const notification = this._notify(Localization.getTranslation("notifications.message-received", null, {name: peerDisplayName}), message);
                this._bind(notification, _ => this._copyText(message, notification));
            }
        }
    }

    _downloadNotification(files) {
        if (document.visibilityState !== 'visible') {
            let imagesOnly = true;
            for(let i=0; i<files.length; i++) {
                if (files[i].type.split('/')[0] !== 'image') {
                    imagesOnly = false;
                    break;
                }
            }
            let title;
            if (files.length === 1) {
                title = `${files[0].name}`;
            } else {
                let fileOther;
                if (files.length === 2) {
                    fileOther = imagesOnly
                        ? Localization.getTranslation("dialogs.file-other-description-image")
                        : Localization.getTranslation("dialogs.file-other-description-file");
                } else {
                    fileOther = imagesOnly
                        ? Localization.getTranslation("dialogs.file-other-description-image-plural", null, {count: files.length - 1})
                        : Localization.getTranslation("dialogs.file-other-description-file-plural", null, {count: files.length - 1});
                }
                title = `${files[0].name} ${fileOther}`
            }
            const notification = this._notify(title, Localization.getTranslation("notifications.click-to-download"));
            this._bind(notification, _ => this._download(notification));
        }
    }

    _requestNotification(request, peerId) {
        if (document.visibilityState !== 'visible') {
            let imagesOnly = true;
            for(let i=0; i<request.header.length; i++) {
                if (request.header[i].mime.split('/')[0] !== 'image') {
                    imagesOnly = false;
                    break;
                }
            }

            let displayName = $(peerId).querySelector('.name').textContent

            let descriptor;
            if (request.header.length === 1) {
                descriptor = imagesOnly
                    ? Localization.getTranslation("dialogs.title-image")
                    : Localization.getTranslation("dialogs.title-file");
            } else {
                descriptor = imagesOnly
                    ? Localization.getTranslation("dialogs.title-image-plural")
                    : Localization.getTranslation("dialogs.title-file-plural");
            }

            let title = Localization.getTranslation("notifications.request-title", null, {
                name: displayName,
                count: request.header.length,
                descriptor: descriptor.toLowerCase()
            });

            const notification = this._notify(title, Localization.getTranslation("notifications.click-to-show"));
        }
    }

    _download(notification) {
        $('download-btn').click();
        notification.close();
    }

    _copyText(message, notification) {
        if (navigator.clipboard.writeText(message)) {
            notification.close();
            this._notify(Localization.getTranslation("notifications.copied-text"));
        } else {
            this._notify(Localization.getTranslation("notifications.copied-text-error"));
        }
    }

    _bind(notification, handler) {
        if (notification.then) {
            notification.then(_ => serviceWorker.getNotifications().then(_ => {
                serviceWorker.addEventListener('notificationclick', handler);
            }));
        } else {
            notification.onclick = handler;
        }
    }
}

class NetworkStatusUI {

    constructor() {
        Events.on('offline', _ => this._showOfflineMessage());
        Events.on('online', _ => this._showOnlineMessage());
        if (!navigator.onLine) this._showOfflineMessage();
    }

    _showOfflineMessage() {
        Events.fire('notify-user', {
            message: Localization.getTranslation("notifications.offline"),
            persistent: true
        });
    }

    _showOnlineMessage() {
        Events.fire('notify-user', Localization.getTranslation("notifications.online"));
    }
}

class WebShareTargetUI {
    constructor() {
        const urlParams = new URL(window.location).searchParams;
        const share_target_type = urlParams.get("share-target")
        if (share_target_type) {
            if (share_target_type === "text") {
                const title = urlParams.get('title') || '';
                const text = urlParams.get('text') || '';
                const url = urlParams.get('url') || '';
                let shareTargetText;

                if (url) {
                    shareTargetText = url; // we share only the link - no text.
                } else if (title && text) {
                    shareTargetText = title + '\r\n' + text;
                } else {
                    shareTargetText = title + text;
                }

                Events.fire('activate-paste-mode', {files: [], text: shareTargetText})
            } else if (share_target_type === "files") {
                let openRequest = window.indexedDB.open('pairdrop_store')
                openRequest.onsuccess = e => {
                    const db = e.target.result;
                    const tx = db.transaction('share_target_files', 'readwrite');
                    const store = tx.objectStore('share_target_files');
                    const request = store.getAll();
                    request.onsuccess = _ => {
                        const fileObjects = request.result;
                        let filesReceived = [];
                        for (let i=0; i<fileObjects.length; i++) {
                            filesReceived.push(new File([fileObjects[i].buffer], fileObjects[i].name));
                        }
                        const clearRequest = store.clear()
                        clearRequest.onsuccess = _ => db.close();

                        Events.fire('activate-paste-mode', {files: filesReceived, text: ""})
                    }
                }
            }
            const url = getUrlWithoutArguments();
            window.history.replaceState({}, "Rewrite URL", url);
        }
    }
}

class WebFileHandlersUI {
    constructor() {
        const urlParams = new URL(window.location).searchParams;
        if (urlParams.has("file_handler")  && "launchQueue" in window) {
            launchQueue.setConsumer(async launchParams => {
                console.log("Launched with: ", launchParams);
                if (!launchParams.files.length)
                    return;
                let files = [];

                for (let i=0; i<launchParams.files.length; i++) {
                    if (i !== 0 && await launchParams.files[i].isSameEntry(launchParams.files[i-1])) continue;
                    const fileHandle = launchParams.files[i];
                    const file = await fileHandle.getFile();
                    files.push(file);
                }
                Events.fire('activate-paste-mode', {files: files, text: ""})
                launchParams = null;
            });
            const url = getUrlWithoutArguments();
            window.history.replaceState({}, "Rewrite URL", url);
        }
    }
}

class NoSleepUI {
    constructor() {
        NoSleepUI._nosleep = new NoSleep();
    }

    static enable() {
        if (!this._interval) {
            NoSleepUI._nosleep.enable();
            NoSleepUI._interval = setInterval(_ => NoSleepUI.disable(), 10000);
        }
    }

    static disable() {
        if ($$('x-peer[status]') === null) {
            clearInterval(NoSleepUI._interval);
            NoSleepUI._nosleep.disable();
        }
    }
}

class PersistentStorage {
    constructor() {
        if (!('indexedDB' in window)) {
            PersistentStorage.logBrowserNotCapable();
            return;
        }
        const DBOpenRequest = window.indexedDB.open('pairdrop_store', 4);
        DBOpenRequest.onerror = (e) => {
            PersistentStorage.logBrowserNotCapable();
            console.log('Error initializing database: ');
            console.log(e)
        };
        DBOpenRequest.onsuccess = () => {
            console.log('Database initialised.');
        };
        DBOpenRequest.onupgradeneeded = (e) => {
            const db = e.target.result;
            const txn = e.target.transaction;

            db.onerror = e => console.log('Error loading database: ' + e);

            console.log(`Upgrading IndexedDB database from version ${e.oldVersion} to version ${e.newVersion}`);

            if (e.oldVersion === 0) {
                // initiate v1
                db.createObjectStore('keyval');
                let roomSecretsObjectStore1 = db.createObjectStore('room_secrets', {autoIncrement: true});
                roomSecretsObjectStore1.createIndex('secret', 'secret', { unique: true });
            }
            if (e.oldVersion <= 1) {
                // migrate to v2
                db.createObjectStore('share_target_files');
            }
            if (e.oldVersion <= 2) {
                // migrate to v3
                db.deleteObjectStore('share_target_files');
                db.createObjectStore('share_target_files', {autoIncrement: true});
            }
            if (e.oldVersion <= 3) {
                // migrate to v4
                let roomSecretsObjectStore4 = txn.objectStore('room_secrets');
                roomSecretsObjectStore4.createIndex('display_name', 'display_name');
                roomSecretsObjectStore4.createIndex('auto_accept', 'auto_accept');
            }
        }
    }

    static logBrowserNotCapable() {
        console.log("This browser does not support IndexedDB. Paired devices will be gone after the browser is closed.");
    }

    static set(key, value) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('keyval', 'readwrite');
                const objectStore = transaction.objectStore('keyval');
                const objectStoreRequest = objectStore.put(value, key);
                objectStoreRequest.onsuccess = _ => {
                    console.log(`Request successful. Added key-pair: ${key} - ${value}`);
                    resolve(value);
                };
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        })
    }

    static get(key) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('keyval', 'readonly');
                const objectStore = transaction.objectStore('keyval');
                const objectStoreRequest = objectStore.get(key);
                objectStoreRequest.onsuccess = _ => {
                    console.log(`Request successful. Retrieved key-pair: ${key} - ${objectStoreRequest.result}`);
                    resolve(objectStoreRequest.result);
                }
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        });
    }

    static delete(key) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('keyval', 'readwrite');
                const objectStore = transaction.objectStore('keyval');
                const objectStoreRequest = objectStore.delete(key);
                objectStoreRequest.onsuccess = _ => {
                    console.log(`Request successful. Deleted key: ${key}`);
                    resolve();
                };
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        })
    }

    static addRoomSecret(roomSecret, displayName, deviceName) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readwrite');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequest = objectStore.add({
                    'secret': roomSecret,
                    'display_name': displayName,
                    'device_name': deviceName,
                    'auto_accept': false
                });
                objectStoreRequest.onsuccess = e => {
                    console.log(`Request successful. RoomSecret added: ${e.target.result}`);
                    resolve();
                }
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        })
    }

    static async getAllRoomSecrets() {
        try {
            const roomSecrets = await this.getAllRoomSecretEntries();
            let secrets = [];
            for (let i = 0; i < roomSecrets.length; i++) {
                secrets.push(roomSecrets[i].secret);
            }
            console.log(`Request successful. Retrieved ${secrets.length} room_secrets`);
            return(secrets);
        } catch (e) {
            this.logBrowserNotCapable();
            return 0;
        }
    }

    static getAllRoomSecretEntries() {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readonly');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequest = objectStore.getAll();
                objectStoreRequest.onsuccess = e => {
                    resolve(e.target.result);
                }
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        });
    }

    static getRoomSecretEntry(roomSecret) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readonly');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequestKey = objectStore.index("secret").getKey(roomSecret);
                objectStoreRequestKey.onsuccess = e => {
                    const key = e.target.result;
                    if (!key) {
                        console.log(`Nothing to retrieve. Entry for room_secret not existing: ${roomSecret}`);
                        resolve();
                        return;
                    }
                    const objectStoreRequestRetrieval = objectStore.get(key);
                    objectStoreRequestRetrieval.onsuccess = e => {
                        console.log(`Request successful. Retrieved entry for room_secret: ${key}`);
                        resolve({
                            "entry": e.target.result,
                            "key": key
                        });
                    }
                    objectStoreRequestRetrieval.onerror = (e) => {
                        reject(e);
                    }
                };
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        });
    }

    static deleteRoomSecret(roomSecret) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readwrite');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequestKey = objectStore.index("secret").getKey(roomSecret);
                objectStoreRequestKey.onsuccess = e => {
                    if (!e.target.result) {
                        console.log(`Nothing to delete. room_secret not existing: ${roomSecret}`);
                        resolve();
                        return;
                    }
                    const key = e.target.result;
                    const objectStoreRequestDeletion = objectStore.delete(key);
                    objectStoreRequestDeletion.onsuccess = _ => {
                        console.log(`Request successful. Deleted room_secret: ${key}`);
                        resolve(roomSecret);
                    }
                    objectStoreRequestDeletion.onerror = (e) => {
                        reject(e);
                    }
                };
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        })
    }

    static clearRoomSecrets() {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readwrite');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequest = objectStore.clear();
                objectStoreRequest.onsuccess = _ => {
                    console.log('Request successful. All room_secrets cleared');
                    resolve();
                };
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        })
    }

    static updateRoomSecretNames(roomSecret, displayName, deviceName) {
        return this.updateRoomSecret(roomSecret, undefined, displayName, deviceName);
    }

    static updateRoomSecretAutoAccept(roomSecret, autoAccept) {
        return this.updateRoomSecret(roomSecret, undefined, undefined, undefined, autoAccept);
    }

    static updateRoomSecret(roomSecret, updatedRoomSecret = undefined, updatedDisplayName = undefined, updatedDeviceName = undefined, updatedAutoAccept = undefined) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                this.getRoomSecretEntry(roomSecret)
                    .then(roomSecretEntry => {
                        if (!roomSecretEntry) {
                           resolve(false);
                           return;
                        }
                        const transaction = db.transaction('room_secrets', 'readwrite');
                        const objectStore = transaction.objectStore('room_secrets');
                        // Do not use `updatedRoomSecret ?? roomSecretEntry.entry.secret` to ensure compatibility with older browsers
                        const updatedRoomSecretEntry = {
                            'secret': updatedRoomSecret !== undefined ? updatedRoomSecret : roomSecretEntry.entry.secret,
                            'display_name': updatedDisplayName !== undefined ? updatedDisplayName : roomSecretEntry.entry.display_name,
                            'device_name': updatedDeviceName !== undefined ? updatedDeviceName : roomSecretEntry.entry.device_name,
                            'auto_accept': updatedAutoAccept !== undefined ? updatedAutoAccept : roomSecretEntry.entry.auto_accept
                        };

                        const objectStoreRequestUpdate = objectStore.put(updatedRoomSecretEntry, roomSecretEntry.key);

                        objectStoreRequestUpdate.onsuccess = e => {
                            console.log(`Request successful. Updated room_secret: ${roomSecretEntry.key}`);
                            resolve({
                                "entry": updatedRoomSecretEntry,
                                "key": roomSecretEntry.key
                            });
                        }

                        objectStoreRequestUpdate.onerror = (e) => {
                            reject(e);
                        }
                    })
                    .catch(e => reject(e));
            };

            DBOpenRequest.onerror = e => reject(e);
        })
    }
}

class BrowserTabsConnector {
    constructor() {
        this.bc = new BroadcastChannel('pairdrop');
        this.bc.addEventListener('message', e => this._onMessage(e));
        Events.on('broadcast-send', e => this._broadcastSend(e.detail));
    }

    _broadcastSend(message) {
        this.bc.postMessage(message);
    }

    _onMessage(e) {
        console.log('Broadcast:', e.data)
        switch (e.data.type) {
            case 'self-display-name-changed':
                Events.fire('self-display-name-changed', e.data.detail);
                break;
        }
    }

    static peerIsSameBrowser(peerId) {
        let peerIdsBrowser = JSON.parse(localStorage.getItem("peer_ids_browser"));
        return peerIdsBrowser
            ? peerIdsBrowser.indexOf(peerId) !== -1
            : false;
    }

    static async addPeerIdToLocalStorage() {
        const peerId = sessionStorage.getItem("peer_id");
        if (!peerId) return false;

        let peerIdsBrowser = [];
        let peerIdsBrowserOld = JSON.parse(localStorage.getItem("peer_ids_browser"));

        if (peerIdsBrowserOld) peerIdsBrowser.push(...peerIdsBrowserOld);
        peerIdsBrowser.push(peerId);
        peerIdsBrowser = peerIdsBrowser.filter(onlyUnique);
        localStorage.setItem("peer_ids_browser", JSON.stringify(peerIdsBrowser));

        return peerIdsBrowser;
    }

    static async removePeerIdFromLocalStorage(peerId) {
        let peerIdsBrowser = JSON.parse(localStorage.getItem("peer_ids_browser"));
        const index = peerIdsBrowser.indexOf(peerId);
        peerIdsBrowser.splice(index, 1);
        localStorage.setItem("peer_ids_browser", JSON.stringify(peerIdsBrowser));
        return peerId;
    }


    static async removeOtherPeerIdsFromLocalStorage() {
        const peerId = sessionStorage.getItem("peer_id");
        if (!peerId) return false;

        let peerIdsBrowser = [peerId];
        localStorage.setItem("peer_ids_browser", JSON.stringify(peerIdsBrowser));
        return peerIdsBrowser;
    }
}

class BackgroundCanvas {
    constructor() {
        this.c = $$('canvas');
        this.cCtx = this.c.getContext('2d');
        this.$footer = $$('footer');

        Events.on('bg-resize', _ => this.init());
        Events.on('redraw-canvas', _ => this.init());
        Events.on('translation-loaded', _ => this.init());

        //fade-in on load
        Events.on('ui-faded-in', _ => this._fadeIn());

        window.onresize = _ => Events.fire('bg-resize');
    }

    _fadeIn() {
        this.c.classList.remove('opacity-0');
    }

    init() {
        let oldW = this.w;
        let oldH = this.h;
        let oldOffset = this.offset
        this.w = document.documentElement.clientWidth;
        this.h = document.documentElement.clientHeight;
        this.offset = this.$footer.offsetHeight - 27;
        if (this.h >= 800) this.offset += 10;

        if (oldW === this.w && oldH === this.h && oldOffset === this.offset) return; // nothing has changed

        this.c.width = this.w;
        this.c.height = this.h;
        this.x0 = this.w / 2;
        this.y0 = this.h - this.offset;
        this.dw = Math.round(Math.max(this.w, this.h, 1000) / 13);

        this.drawCircles(this.cCtx);
    }


    drawCircle(ctx, radius) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        let opacity = Math.max(0, 0.3 * (1 - 1 * radius / Math.max(this.w, this.h)));
        ctx.strokeStyle = `rgba(128, 128, 128, ${opacity})`;
        ctx.arc(this.x0, this.y0, radius, 0, 2 * Math.PI);
        ctx.stroke();
    }

    drawCircles(ctx) {
        ctx.clearRect(0, 0, this.w, this.h);
        for (let i = 0; i < 13; i++) {
            this.drawCircle(ctx, this.dw * i + 33 + 66);
        }
    }
}

class PairDrop {
    constructor() {
        Events.on('initial-translation-loaded', _ => {
            const server = new ServerConnection();
            const peers = new PeersManager(server);
            const peersUI = new PeersUI();
            const backgroundCanvas = new BackgroundCanvas();
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
        });
    }
}

const persistentStorage = new PersistentStorage();
const pairDrop = new PairDrop();
const localization = new Localization();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(serviceWorker => {
            console.log('Service Worker registered');
            window.serviceWorker = serviceWorker
        });
}

window.addEventListener('beforeinstallprompt', installEvent => {
    if (!window.matchMedia('(display-mode: minimal-ui)').matches) {
        // only display install btn when not installed
        const installBtn = document.querySelector('#install')
        installBtn.removeAttribute('hidden');
        installBtn.addEventListener('click', () => {
            installBtn.setAttribute('hidden', '');
            installEvent.prompt();
        });
        Events.fire('header-evaluated', 'install');
    }
    return installEvent.preventDefault();
});