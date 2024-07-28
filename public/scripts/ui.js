class PeersUI {

    constructor() {
        this.$xPeers = $$('x-peers');
        this.$xNoPeers = $$('x-no-peers');
        this.$xInstructions = $$('x-instructions');
        this.$wsFallbackWarning = $('websocket-fallback');

        this.$sharePanel = $$('.shr-panel');
        this.$shareModeImageThumb = $$('.shr-panel .image-thumb');
        this.$shareModeTextThumb = $$('.shr-panel .text-thumb');
        this.$shareModeFileThumb = $$('.shr-panel .file-thumb');
        this.$shareModeDescriptor = $$('.shr-panel .share-descriptor');
        this.$shareModeDescriptorItem = $$('.shr-panel .descriptor-item');
        this.$shareModeDescriptorOther = $$('.shr-panel .descriptor-other');
        this.$shareModeCancelBtn = $$('.shr-panel .cancel-btn');
        this.$shareModeEditBtn = $$('.shr-panel .edit-btn');

        this.peerUIs = {};

        this.shareMode = {};
        this.shareMode.active = false;
        this.shareMode.descriptor = "";
        this.shareMode.files = [];
        this.shareMode.text = "";

        Events.on('peer-joined', e => this._onPeerJoined(e.detail.peer, e.detail.roomType, e.detail.roomId));
        Events.on('peer-connected', e => this._onPeerConnected(e.detail.peerId, e.detail.connectionHash));
        Events.on('peer-connecting', e => this._onPeerConnecting(e.detail));
        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('set-progress', e => this._onSetProgress(e.detail.peerId, e.detail.progress, e.detail.status, e.detail.statusText));

        Events.on('drop', e => this._onDrop(e));
        Events.on('keydown', e => this._onKeyDown(e));
        Events.on('dragover', e => this._onDragOver(e));
        Events.on('dragleave', _ => this._onDragEnd());
        Events.on('dragend', _ => this._onDragEnd());
        Events.on('resize', _ => this._evaluateOverflowingPeers());
        Events.on('header-changed', _ => this._evaluateOverflowingPeers());

        Events.on('paste', e => this._onPaste(e));
        Events.on('activate-share-mode', e => this._activateShareMode(e.detail.files, e.detail.text));
        Events.on('translation-loaded', _ => this._reloadShareMode());
        Events.on('room-type-removed', e => this._onRoomTypeRemoved(e.detail.peerId, e.detail.roomType));
        Events.on('room-secret-added', e => this._onRoomSecretAdded(e.detail.peerId, e.detail.roomSecret));

        this.$shareModeCancelBtn.addEventListener('click', _ => this._deactivateShareMode());

        Events.on('peer-display-name-changed', e => this._onPeerDisplayNameChanged(e.detail.peerId, e.detail.displayName));

        Events.on('ws-config', e => this._evaluateRtcSupport(e.detail))
    }

    _evaluateRtcSupport(wsConfig) {
        if (wsConfig.wsFallback) {
            this.$wsFallbackWarning.removeAttribute("hidden");
        }
        else {
            this.$wsFallbackWarning.setAttribute("hidden", true);
            if (!window.isRtcSupported) {
                alert(Localization.getTranslation("instructions.webrtc-requirement"));
            }
        }
    }

    _changePeerDisplayName(peerId, displayName) {
        const peerUI = this.peerUIs[peerId];

        if (!peerUI) return;

        peerUI._setDisplayName(displayName);
    }

    _onPeerDisplayNameChanged(peerId, displayName) {
        if (!peerId || !displayName) return;

        this._changePeerDisplayName(peerId, displayName);
    }

    async _onKeyDown(e) {
        if (!this.shareMode.active || Dialog.anyDialogShown()) return;

        if (e.key === "Escape") {
            await this._deactivateShareMode();
        }

        // close About PairDrop page on Escape
        if (e.key === "Escape") {
            window.location.hash = '#';
        }
    }

    _onPeerJoined(peer, roomType, roomId) {
        this._joinPeer(peer, roomType, roomId);
    }

    _joinPeer(peer, roomType, roomId) {
        const existingPeerUI = this.peerUIs[peer.id];
        if (existingPeerUI) {
            // peerUI already exists. Abort but add roomType to GUI
            existingPeerUI._addRoomId(roomType, roomId);
            return;
        }

        const peerUI = new PeerUI(peer, roomType, roomId, {
            active: this.shareMode.active,
            descriptor: this.shareMode.descriptor,
        });
        this.peerUIs[peer.id] = peerUI;
    }

    _onPeerConnected(peerId, connectionHash) {
        const peerUI = this.peerUIs[peerId];

        if (!peerUI) return;

        peerUI._peerConnected(true, connectionHash);

        this._addPeerUIIfMissing(peerUI);
    }

    _addPeerUIIfMissing(peerUI) {
        if (this.$xPeers.contains(peerUI.$el)) return;

        this.$xPeers.appendChild(peerUI.$el);
        this._evaluateOverflowingPeers();
    }

    _onPeerConnecting(peerId) {
        const peerUI = this.peerUIs[peerId];

        if (!peerUI) return;

        peerUI._peerConnected(false);
    }

    _evaluateOverflowingPeers() {
        if (this.$xPeers.clientHeight < this.$xPeers.scrollHeight) {
            this.$xPeers.classList.add('overflowing');
        }
        else {
            this.$xPeers.classList.remove('overflowing');
        }
    }

    _onPeers(msg) {
        msg.peers.forEach(peer => this._joinPeer(peer, msg.roomType, msg.roomId));
    }

    _onPeerDisconnected(peerId) {
        const peerUI = this.peerUIs[peerId];

        if (!peerUI) return;

        peerUI._removeDom();

        delete this.peerUIs[peerId];

        this._evaluateOverflowingPeers();
    }

    _onRoomTypeRemoved(peerId, roomType) {
        const peerUI = this.peerUIs[peerId];

        if (!peerUI) return;

        peerUI._removeRoomId(roomType);
    }


    _onRoomSecretAdded(peerId, roomSecret) {
        // If a device is paired that is already connected we must update the displayName saved for the roomSecret
        // here as the "display-name-changed" message has already been received
        const peerUI = this.peerUIs[peerId];

        if (!peerUI || !peerUI._connected) return;

        const displayName = peerUI._displayName();

        PersistentStorage
            .updateRoomSecretDisplayName(roomSecret, displayName)
            .then(roomSecretEntry => {
                Logger.debug(`Successfully updated DisplayName for roomSecretEntry ${roomSecretEntry.key}`);
            })
    }

    _onSetProgress(peerId, progress, status, statusText) {
        const peerUI = this.peerUIs[peerId];

        if (!peerUI) return;

        peerUI.queueProgressStatus(progress, status, statusText);
    }

    _onDrop(e) {
        if (this.shareMode.active || Dialog.anyDialogShown()) return;

        e.preventDefault();

        this._onDragEnd();

        if ($$('x-peer') || !$$('x-peer').contains(e.target)) return; // dropped on peer

        const files = e.dataTransfer.files;
        const text = e.dataTransfer.getData("text");

        if (files.length > 0) {
            Events.fire('activate-share-mode', {
                files: files
            });
        }
        else if(text.length > 0) {
            Events.fire('activate-share-mode', {
                text: text
            });
        }
    }

    _onDragOver(e) {
        if (this.shareMode.active || Dialog.anyDialogShown()) return;

        e.preventDefault();

        this.$xInstructions.setAttribute('drop-bg', true);
        this.$xNoPeers.setAttribute('drop-bg', true);
    }

    _onDragEnd() {
        this.$xInstructions.removeAttribute('drop-bg');
        this.$xNoPeers.removeAttribute('drop-bg');
    }

    _onPaste(e) {
        // prevent send on paste when dialog is open
        if (this.shareMode.active || Dialog.anyDialogShown()) return;

        e.preventDefault()
        const files = e.clipboardData.files;
        const text = e.clipboardData.getData("Text");

        if (files.length > 0) {
            Events.fire('activate-share-mode', {files: files});
        } else if (text.length > 0) {
            if (ShareTextDialog.isApproveShareTextSet()) {
                Events.fire('share-text-dialog', text);
            } else {
                Events.fire('activate-share-mode', {text: text});
            }
        }
    }

    async _activateShareMode(files = [], text = "") {
        if (this.shareMode.active || (files.length === 0 && text.length === 0)) return;

        this._activateCallback = e => this._sendShareData(e);
        this._editShareTextCallback = _ => {
            this._deactivateShareMode();
            Events.fire('share-text-dialog', text);
        };

        Events.on('share-mode-pointerdown', this._activateCallback);

        const sharedText = Localization.getTranslation("instructions.activate-share-mode-shared-text");
        const andOtherFilesPlural = Localization.getTranslation("instructions.activate-share-mode-and-other-files-plural", null, {count: files.length-1});
        const andOtherFiles = Localization.getTranslation("instructions.activate-share-mode-and-other-file");

        let descriptorComplete, descriptorItem, descriptorOther, descriptorInstructions;

        if (files.length > 2) {
            // files shared
            descriptorItem = files[0].name;
            descriptorOther = andOtherFilesPlural;
            descriptorComplete = `${descriptorItem} ${descriptorOther}`;
        }
        else if (files.length === 2) {
            descriptorItem = files[0].name;
            descriptorOther = andOtherFiles;
            descriptorComplete = `${descriptorItem} ${descriptorOther}`;
        } else if (files.length === 1) {
            descriptorItem = files[0].name;
            descriptorComplete = descriptorItem;
        }
        else {
            // text shared
            descriptorItem = text.replace(/\s/g," ");
            descriptorComplete = sharedText;
        }

        if (files.length > 0) {
            if (descriptorOther) {
                this.$shareModeDescriptorOther.innerText = descriptorOther;
                this.$shareModeDescriptorOther.removeAttribute('hidden');
            }
            if (files.length > 1) {
                descriptorInstructions = Localization.getTranslation("instructions.activate-share-mode-shared-files-plural", null, {count: files.length});
            }
            else {
                descriptorInstructions = Localization.getTranslation("instructions.activate-share-mode-shared-file");
            }

            files = await mime.addMissingMimeTypesToFiles(files);

            if (files[0].type.split('/')[0] === 'image') {
                try {
                    let imageUrl = await getThumbnailAsDataUrl(files[0], 80, null, 0.9);

                    this.$shareModeImageThumb.style.backgroundImage = `url(${imageUrl})`;

                    this.$shareModeImageThumb.removeAttribute('hidden');
                } catch (e) {
                    Logger.error(e);
                    this.$shareModeFileThumb.removeAttribute('hidden');
                }
            } else {
                this.$shareModeFileThumb.removeAttribute('hidden');
            }
        }
        else {
            this.$shareModeTextThumb.removeAttribute('hidden');

            this.$shareModeEditBtn.addEventListener('click', this._editShareTextCallback);
            this.$shareModeEditBtn.removeAttribute('hidden');

            descriptorInstructions = Localization.getTranslation("instructions.activate-share-mode-shared-text");
        }

        const desktop = Localization.getTranslation("instructions.x-instructions-share-mode_desktop", null, {descriptor: descriptorInstructions});
        const mobile = Localization.getTranslation("instructions.x-instructions-share-mode_mobile", null, {descriptor: descriptorInstructions});

        this.$xInstructions.setAttribute('desktop', desktop);
        this.$xInstructions.setAttribute('mobile', mobile);

        this.$sharePanel.removeAttribute('hidden');

        this.$shareModeDescriptor.removeAttribute('hidden');
        this.$shareModeDescriptorItem.innerText = descriptorItem;

        this.shareMode.active = true;
        this.shareMode.descriptor = descriptorComplete;
        this.shareMode.files = files;
        this.shareMode.text = text;

        Logger.debug('Share mode activated.');

        Events.fire('share-mode-changed', {
            active: true,
            descriptor: descriptorComplete
        });
    }

    async _reloadShareMode() {
        // If shareMode is active only
        if (!this.shareMode.active) return;

        let files = this.shareMode.files;
        let text = this.shareMode.text;

        await this._deactivateShareMode();
        await this._activateShareMode(files, text);
    }

    async _deactivateShareMode() {
        if (!this.shareMode.active) return;

        this.shareMode.active = false;
        this.shareMode.descriptor = "";
        this.shareMode.files = [];
        this.shareMode.text = "";

        Events.off('share-mode-pointerdown', this._activateCallback);

        const desktop = Localization.getTranslation("instructions.x-instructions_desktop");
        const mobile = Localization.getTranslation("instructions.x-instructions_mobile");

        this.$xInstructions.setAttribute('desktop', desktop);
        this.$xInstructions.setAttribute('mobile', mobile);

        this.$sharePanel.setAttribute('hidden', true);

        this.$shareModeImageThumb.setAttribute('hidden', true);
        this.$shareModeFileThumb.setAttribute('hidden', true);
        this.$shareModeTextThumb.setAttribute('hidden', true);

        this.$shareModeDescriptorItem.innerHTML = "";
        this.$shareModeDescriptorItem.classList.remove('cursive');
        this.$shareModeDescriptorOther.innerHTML = "";
        this.$shareModeDescriptorOther.setAttribute('hidden', true);
        this.$shareModeEditBtn.removeEventListener('click', this._editShareTextCallback);
        this.$shareModeEditBtn.setAttribute('hidden', true);

        Logger.debug('Share mode deactivated.')
        Events.fire('share-mode-changed', { active: false });
    }

    _sendShareData(e) {
        // send the shared file/text content
        const peerId = e.detail.peerId;
        const files = this.shareMode.files;
        const text = this.shareMode.text;

        if (files.length > 0) {
            Events.fire('files-selected', {
                files: files,
                to: peerId
            });
        }
        else if (text.length > 0) {
            Events.fire('send-text', {
                text: text,
                to: peerId
            });
        }
    }
}

class PeerUI {

    static _badgeClassNames = ["badge-room-ip", "badge-room-secret", "badge-room-public-id"];

    constructor(peer, roomType, roomId, shareMode = {active: false, descriptor: ""}) {
        this.$xInstructions = $$('x-instructions');

        this._peer = peer;
        this._connectionHash = "";
        this._connected = false;

        this._currentProgress = 0;
        this._currentStatus = 'idle';
        this._oldStatus = 'idle';

        this._progressQueue = [];

        this._roomIds = {}
        this._roomIds[roomType] = roomId;

        this._shareMode = shareMode;

        this._createCallbacks();
        this._initDom();

        // ShareMode
        Events.on('share-mode-changed', e => this._onShareModeChanged(e.detail.active, e.detail.descriptor));
    }

    _initDom() {
        this.$el = document.createElement('x-peer');
        this.$el.id = this._peer.id;
        this.$el.ui = this;
        this.$el.classList.add('center');

        this.html();

        this.$icon = this.$el.querySelector('svg use');
        this.$displayName = this.$el.querySelector('.name');
        this.$deviceName = this.$el.querySelector('.device-name');
        this.$label = this.$el.querySelector('label');
        this.$input = this.$el.querySelector('input');
        this.$progress = this.$el.querySelector('.progress');

        this.$icon.setAttribute('xlink:href', this._icon());
        this.$displayName.textContent = this._displayName();
        this.$deviceName.textContent = this._deviceName();

        this.updateTypesClassList();

        this._evaluateShareMode();
        this._bindListeners();
    }

    _removeDom() {
        this.$el.remove();
    }

    html() {
        let title= Localization.getTranslation("peer-ui.click-to-send");

        this.$el.innerHTML = `
            <label class="column center pointer" title="${title}">
                <input type="file" multiple/>
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
                </div>
            </label>`;
    }

    updateTypesClassList() {
        // Remove all classes
        this.$el.classList.remove('type-ip', 'type-secret', 'type-public-id', 'type-same-browser', 'ws-peer');

        // Add classes accordingly
        Object.keys(this._roomIds).forEach(roomType => this.$el.classList.add(`type-${roomType}`));

        if (BrowserTabsConnector.peerIsSameBrowser(this._peer.id)) {
            this.$el.classList.add(`type-same-browser`);
        }

        if (!this._peer.rtcSupported || !window.isRtcSupported) {
            this.$el.classList.add('ws-peer');
        }
    }

    _addRoomId(roomType, roomId) {
        this._roomIds[roomType] = roomId;
        this.updateTypesClassList();
    }

    _removeRoomId(roomType) {
        delete this._roomIds[roomType];
        this.updateTypesClassList();
    }

    _onShareModeChanged(active = false, descriptor = "") {
        this._shareMode.active = active;
        this._shareMode.descriptor = descriptor;

        this._evaluateShareMode();
        this._bindListeners();
    }

    _evaluateShareMode() {
        let title;
        if (!this._shareMode.active) {
            title = Localization.getTranslation("peer-ui.click-to-send");
            this.$input.removeAttribute('disabled');
        }
        else {
            title =  Localization.getTranslation("peer-ui.click-to-send-share-mode", null, {descriptor: this._shareMode.descriptor});
            this.$input.setAttribute('disabled', true);
        }
        this.$label.setAttribute('title', title);
    }

    _createCallbacks() {
        this._callbackInput = e => this._onFilesSelected(e);
        this._callbackDrop = e => this._onDrop(e);
        this._callbackDragEnd = e => this._onDragEnd(e);
        this._callbackDragLeave = e => this._onDragEnd(e);
        this._callbackDragOver = e => this._onDragOver(e);
        this._callbackContextMenu = e => this._onRightClick(e);
        this._callbackTouchStart = e => this._onTouchStart(e);
        this._callbackTouchEnd = e => this._onTouchEnd(e);
        this._callbackPointerDown = e => this._onPointerDown(e);
    }

    _bindListeners() {
        if(!this._shareMode.active) {
            // Remove Events Share mode
            this.$el.removeEventListener('pointerdown', this._callbackPointerDown);

            // Add Events Normal Mode
            this.$input.addEventListener('change', this._callbackInput);
            this.$el.addEventListener('drop', this._callbackDrop);
            this.$el.addEventListener('dragend', this._callbackDragEnd);
            this.$el.addEventListener('dragleave', this._callbackDragLeave);
            this.$el.addEventListener('dragover', this._callbackDragOver);
            this.$el.addEventListener('contextmenu', this._callbackContextMenu);
            this.$el.addEventListener('touchstart', this._callbackTouchStart);
            this.$el.addEventListener('touchend', this._callbackTouchEnd);
        }
        else {
            // Remove Events Normal Mode
            this.$input.removeEventListener('change', this._callbackInput);
            this.$el.removeEventListener('drop', this._callbackDrop);
            this.$el.removeEventListener('dragend', this._callbackDragEnd);
            this.$el.removeEventListener('dragleave', this._callbackDragLeave);
            this.$el.removeEventListener('dragover', this._callbackDragOver);
            this.$el.removeEventListener('contextmenu', this._callbackContextMenu);
            this.$el.removeEventListener('touchstart', this._callbackTouchStart);
            this.$el.removeEventListener('touchend', this._callbackTouchEnd);

            // Add Events Share mode
            this.$el.addEventListener('pointerdown', this._callbackPointerDown);
        }
    }

    _onPointerDown(e) {
        // Prevents triggering of event twice on touch devices
        e.stopPropagation();
        e.preventDefault();
        Events.fire('share-mode-pointerdown', {
            peerId: this._peer.id
        });
    }

    _peerConnected(connected = true, connectionHash = "") {
        if (connected) {
            this._connected = true;

            // on reconnect: reset status to saved status
            this.queueProgressStatus(null, this._oldStatus);
            this._oldStatus = 'idle';

            this._connectionHash = connectionHash;
        }
        else {
            this._connected = false;

            // when connecting: / connection is lost during transfer: save old status
            if (this._isTransferringStatus(this._currentStatus)) {
                this._oldStatus = this._currentStatus;
            }
            this.queueProgressStatus(null, "connect");

            this._connectionHash = "";
        }
    }

    getConnectionHashWithSpaces()  {
        if (this._connectionHash.length !== 16) {
            return ""
        }

        return `${this._connectionHash.substring(0, 4)} ${this._connectionHash.substring(4, 8)} ${this._connectionHash.substring(8, 12)} ${this._connectionHash.substring(12, 16)}`;
    }

    _displayName() {
        return this._peer.name.displayName;
    }

    _deviceName() {
        return this._peer.name.deviceName;
    }

    _setDisplayName(displayName) {
        this._peer.name.displayName = displayName;
        this.$displayName.textContent = displayName;
    }

    _roomTypes() {
        return Object.keys(this._roomIds);
    }

    _badgeClassName() {
        const roomTypes = this._roomTypes();
        if (roomTypes.includes('secret')) {
            return 'badge-room-secret';
        }
        else if (roomTypes.includes('ip')) {
            return 'badge-room-ip';
        }
        else {
            return 'badge-room-public-id';
        }
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

        if (files.length === 0) return;

        let totalSize = 0;
        for (let i = 0; i < files.length; i++) {
            totalSize += files[i].size;
        }
        // Prevent device from sleeping
        NoSleepUI.enable();

        Events.fire('files-selected', {
            files: files,
            to: this._peer.id
        });
        $input.files = null; // reset input
    }

    queueProgressStatus(progress = null, status = null, statusText = null) {
        clearTimeout(this._progressIdleTimeout);

        // if progress is higher than progress in queue -> overwrite in queue and cut queue at this position
        for (let i = 0; i < this._progressQueue.length; i++) {
            if (this._progressQueue[i].progress <= progress && this._progressQueue[i].status === status) {
                this._progressQueue[i] = {progress, status, statusText};
                this._progressQueue.splice(i + 1);
                return;
            }
        }
        this._progressQueue.push({progress, status, statusText});

        // only dequeue if not already dequeuing
        if (this._progressAnimatingTimeout) return;

        this.dequeueProgressStatus();
    }

    setNextProgressStatus() {
        if (!this._progressQueue.length) {
            // Queue is empty
            this._progressAnimatingTimeout = null;
            return;
        }

        // Queue is not empty -> set next progress
        this.dequeueProgressStatus();
    }

    dequeueProgressStatus() {
        clearTimeout(this._progressAnimatingTimeout);

        let {progress, status, statusText} = this._progressQueue.shift();

        // On complete status: set progress to 0 after 250ms and status to idle after 10s
        if (this._isCompletedStatus(status)) {
            this._progressQueue.unshift({progress: 0});
            this._progressIdleTimeout = setTimeout(() => this.setStatus("idle"), 10000);
        }

        // After animation has finished -> set next progress in queue
        this._progressAnimatingTimeout = setTimeout(() => this.setNextProgressStatus(), 250); // 200 ms animation + buffer


        // Only change status if explicitly set
        if (status) {
            this.setStatus(status, statusText);
        }

        // Only change progress if explicitly set and differs from current
        if (progress === null || progress === this._currentProgress) return;

        const progressSpillsOverHalf = this._currentProgress < 0.5 && 0.5 < progress; // 0.5 slips through
        const progressSpillsOverFull = progress <= 0.5 && 0.5 <= this._currentProgress && this._currentProgress < 1;

        // If spills over half: go to 0.5 first
        // If spills over full: go to 1 first
        if (progressSpillsOverHalf) {
            this._progressQueue.unshift({progress: 0.5}, {progress: progress});
            this.dequeueProgressStatus();
            return;
        }
        else if (progressSpillsOverFull) {
            this._progressQueue.unshift({progress: 1}, {progress: progress});
            this.dequeueProgressStatus();
            return;
        }

        // Clear progress after setting it to 1
        if (progress === 1) {
            this._progressQueue.unshift({progress: 0});
        }

        // Set progress to 1 before setting to 0 if not error
        if (progress === 0 && this._currentProgress !== 1 && status !== 'error') {
            this._progressQueue.unshift({progress: 1});
            this.dequeueProgressStatus();
            return;
        }

        // under 0.5 -> remove second circle
        // over 0.5 -> add second circle
        if (progress < 0.5) {
            this.$progress.classList.remove('animate');
            this.$progress.classList.remove('over50');
            this.$progress.classList.add('animate');
        }
        else if (progress > 0.5 && this._currentProgress === 0.5) {
            this.$progress.classList.remove('animate');
            this.$progress.classList.add('over50');
            this.$progress.classList.add('animate');
        }

        // Do not animate when setting progress to lower value
        if (progress < this._currentProgress && this._currentProgress === 1) {
            this.$progress.classList.remove('animate');
        }

        // If document is in background do not animate to prevent flickering on focus
        if (!document.hasFocus()) {
            this.$progress.classList.remove('animate');
        }

        this._currentProgress = progress;
        this.$progress.style.setProperty('--progress', `rotate(${360 * progress}deg)`);
    }

    setStatus(status, statusText = null) {
        this._currentStatus = status;

        if (status === 'idle') {
            this.$el.removeAttribute('status');
            this.$el.querySelector('.status').innerText = '';
            return;
        }

        if (!statusText) {
            statusText = {
                "connect": Localization.getTranslation("peer-ui.connecting"),
                "prepare": Localization.getTranslation("peer-ui.preparing"),
                "transfer": Localization.getTranslation("peer-ui.transferring"),
                "receive": Localization.getTranslation("peer-ui.receiving"),
                "process": Localization.getTranslation("peer-ui.processing"),
                "wait": Localization.getTranslation("peer-ui.waiting"),
                "transfer-complete": Localization.getTranslation("peer-ui.transfer-complete"),
                "receive-complete": Localization.getTranslation("peer-ui.receive-complete"),
                "error": Localization.getTranslation("peer-ui.error")
            }[status];
        }

        this.$el.setAttribute('status', status);
        this.$el.querySelector('.status').innerText = statusText;
    }

    _isCompletedStatus(status) {
        return status && (status.endsWith("-complete") || status === "error")
    }

    _isTransferringStatus(status) {
        return status !== "connect" && !this._isCompletedStatus(status);
    }

    _onDrop(e) {
        if (this._shareMode.active || Dialog.anyDialogShown()) return;

        e.preventDefault();

        this._onDragEnd();

        const peerId = this._peer.id;
        const files = e.dataTransfer.files;
        const text = e.dataTransfer.getData("text");

        if (files.length > 0) {
            Events.fire('files-selected', {
                files: files,
                to: peerId
            });
        }
        else if (text.length > 0) {
            Events.fire('send-text', {
                text: text,
                to: peerId
            });
        }
    }

    _onDragOver() {
        this.$el.setAttribute('drop', true);
        this.$xInstructions.setAttribute('drop-peer', true);
    }

    _onDragEnd() {
        this.$el.removeAttribute('drop');
        this.$xInstructions.removeAttribute('drop-peer');
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
        this._touchTimer = setTimeout(() => this._onTouchEnd(e), 610);
    }

    _onTouchEnd(e) {
        if (Date.now() - this._touchStart < 500) {
            clearTimeout(this._touchTimer);
        }
        else if (this._touchTimer) { // this was a long tap
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
        this.$autoFocus = this.$el.querySelector('[autofocus]');
        this.$xBackground = this.$el.querySelector('x-background');
        this.$closeBtns = this.$el.querySelectorAll('[close]');

        this.$closeBtns.forEach(el => {
            el.addEventListener('click', _ => this.hide())
        });

        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));
    }

    static anyDialogShown() {
        return document.querySelectorAll('x-dialog[show]').length > 0;
    }

    show() {
        if (this.$xBackground) {
            this.$xBackground.scrollTop = 0;
        }

        this.$el.setAttribute('show', true);

        if (!window.isMobile && this.$autoFocus) {
            this.$autoFocus.focus();
        }
    }

    isShown() {
        return !!this.$el.attributes["show"];
    }

    hide() {
        this.$el.removeAttribute('show');
        if (!window.isMobile) {
            document.activeElement.blur();
            window.blur();
        }
        document.title = 'PairDrop | Transfer Files Cross-Platform. No Setup, No Signup.';
        changeFavicon("images/favicon-96x96.png");
        this.correspondingPeerId = undefined;
    }

    _onPeerDisconnected(peerId) {
        if (this.isShown() && this.correspondingPeerId === peerId) {
            this.hide();
            Events.fire('notify-user', Localization.getTranslation("notifications.selected-peer-left"));
        }
    }

    _evaluateOverflowing(element) {
        if (element.clientHeight < element.scrollHeight) {
            element.classList.add('overflowing');
        }
        else {
            element.classList.remove('overflowing');
        }
    }
}

class LanguageSelectDialog extends Dialog {

    constructor() {
        super('language-select-dialog');

        this.$languageSelectBtn = $('language-selector');
        this.$languageSelectBtn.addEventListener('click', _ => this.show());

        this.$languageButtons = this.$el.querySelectorAll(".language-buttons .btn");
        this.$languageButtons.forEach($btn => {
            $btn.addEventListener("click", e => this.selectLanguage(e));
        })
        Events.on('keydown', e => this._onKeyDown(e));
    }

    _onKeyDown(e) {
        if (!this.isShown()) return;

        if (e.code === "Escape") {
            this.hide();
        }
    }

    show() {
        let locale = Localization.getLocale();
        this.currentLanguageBtn = Localization.isSystemLocale()
            ? this.$languageButtons[0]
            : this.$el.querySelector(`.btn[value="${locale}"]`);

        this.currentLanguageBtn.classList.add("current");

        super.show();
    }

    hide() {
        this.currentLanguageBtn.classList.remove("current");

        super.hide();
    }

    selectLanguage(e) {
        e.preventDefault()
        let languageCode = e.target.value;

        if (languageCode) {
            localStorage.setItem('language_code', languageCode);
        }
        else {
            localStorage.removeItem('language_code');
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
        // 1 GB = 1e3 MB = 1e6 KB = 1e9 B
        if (bytes >= 1e9) {
            const rndGigabytes = Math.round(10 * bytes / 1e9) / 10;
            return `${rndGigabytes} GB`;
        }
        else if (bytes >= 1e6) {
            const rndMegabytes = Math.round(10 * bytes / 1e6) / 10;
            return `${rndMegabytes} MB`;
        }
        else if (bytes >= (1e3)) {
            const rndKilobytes = Math.round(10 * bytes / 1e3) / 10;
            return `${rndKilobytes} KB`;
        }
        else {
            return `${bytes} bytes`;
        }
    }

    _parseFileData(displayName, connectionHash, files, imagesOnly, totalSize, badgeClassName) {
        let fileOther = "";
        if (files.length === 2) {
            fileOther = imagesOnly
                ? Localization.getTranslation("dialogs.file-other-description-image")
                : Localization.getTranslation("dialogs.file-other-description-file");
        }
        else if (files.length > 2) {
            fileOther = imagesOnly
                ? Localization.getTranslation("dialogs.file-other-description-image-plural", null, {count: files.length - 1})
                : Localization.getTranslation("dialogs.file-other-description-file-plural", null, {count: files.length - 1});
        }

        const fileName = files[0].displayName;
        const fileNameSplit = fileName.split('.');
        const fileExtension = '.' + fileNameSplit[fileNameSplit.length - 1];
        const fileStem = fileName.substring(0, fileName.length - fileExtension.length);

        const fileSize = this._formatFileSize(totalSize);

        this.$fileOther.innerText = fileOther;
        this.$fileStem.innerText = fileStem;
        this.$fileExtension.innerText = fileExtension;
        this.$fileSize.innerText = fileSize;
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
        this._filesDataQueue = [];
    }

    async _onFilesReceived(peerId, files, imagesOnly, totalSize) {
        const descriptor = this._getDescriptor(files, imagesOnly);
        const displayName = $(peerId).ui._displayName();
        const connectionHash = $(peerId).ui._connectionHash;
        const badgeClassName = $(peerId).ui._badgeClassName();

        this._filesDataQueue.push({
            peerId: peerId,
            files: files,
            imagesOnly: imagesOnly,
            totalSize: totalSize,
            descriptor: descriptor,
            displayName: displayName,
            connectionHash: connectionHash,
            badgeClassName: badgeClassName
        });

        audioPlayer.playBlop();

        await this._processFiles();
    }

    canShareFilesViaMenu(files) {
        return window.isMobile && !!navigator.share && navigator.canShare({files});
    }

    async _processFiles() {
        if (this._busy || !this._filesDataQueue.length) return;

        this._busy = true;

        Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'process'});

        this._data = this._filesDataQueue.shift();

        const documentTitleTranslation = this._data.files.length === 1
            ? `${ Localization.getTranslation("document-titles.file-received") } - PairDrop`
            : `${ Localization.getTranslation("document-titles.file-received-plural", null, {count: this._data.files.length}) } - PairDrop`;

        // If possible, share via menu - else download files
        let shareViaMenu = this.canShareFilesViaMenu(this._data.files);

        if (shareViaMenu && this._filesTooBigForRam()) {
            // Files too big to share on iOS -> Download instead
            shareViaMenu = false;
            Events.fire('notify-user', Localization.getTranslation("notifications.error-sharing-size"));
        }

        this._parseFileData(
            this._data.displayName,
            this._data.connectionHash,
            this._data.files,
            this._data.imagesOnly,
            this._data.totalSize,
            this._data.badgeClassName
        );
        this._setTitle(this._data.descriptor);

        await this._addFileToPreviewBox(this._data.files[0]);

        document.title = documentTitleTranslation;
        changeFavicon("images/favicon-96x96-notification.png");

        if (shareViaMenu) {
            await this._setupShareMenu();
        }
        else {
            await this._setupDownload();
        }

        Events.fire('set-progress', {peerId: this._data.peerId, progress: 0, status: "receive-complete"});
    }

    _filesTooBigForRam() {
        // Pages crash on iOS if RAM exceeds 250 MB
        return window.iOS && this._data.totalSize > 250000000;
    }

    _getDescriptor(files, imagesOnly) {
        let descriptor;
        if (files.length === 1) {
            descriptor = imagesOnly
                ? Localization.getTranslation("dialogs.title-image")
                : Localization.getTranslation("dialogs.title-file");
        }
        else {
            descriptor = imagesOnly
                ? Localization.getTranslation("dialogs.title-image-plural")
                : Localization.getTranslation("dialogs.title-file-plural");
        }
        return descriptor;
    }

    _setTitle(descriptor) {
        this.$receiveTitle.innerText = Localization.getTranslation("dialogs.receive-title", null, {descriptor: descriptor});
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
                    reject('Preview is only supported for images, audio and video');
                    return;
                }

                let element = document.createElement(previewElement[mime]);
                let timeout = setTimeout(_ => {
                    reject('Preview could not be loaded: timeout', file.type);
                }, 1000);

                element.controls = true;
                element.onload = _ => {
                    clearTimeout(timeout);
                    resolve(element);
                };
                element.onloadeddata = _ => {
                    clearTimeout(timeout);
                    resolve(element);
                };
                element.onerror = _ => {
                    clearTimeout(timeout);
                    reject('Preview could not be loaded from type', file.type);
                };
                element.src = URL.createObjectURL(file);
            } catch (e) {
                reject('Preview could not be loaded from type', file.type);
            }
        });
    }

    _disableButton($button, duration) {
        $button.style.pointerEvents = "none";

        setTimeout(() => {
            $button.style.pointerEvents = "unset";
        }, duration);
    }

    async _setShareButton() {
        this.$shareBtn.onclick = _ => {
            navigator.share({files: this._data.files})
                .catch(async err => {
                    Logger.error(err);

                    if (err.name === 'AbortError' && err.message === 'Abort due to cancellation of share.') {
                        return;
                    }
                    else if (err.name === 'NotAllowedError' && err.message === 'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.') {
                        return;
                    }

                    // Fallback to download
                    if (err.name === 'AbortError' && err.message === 'Abort due to error while reading files.') {
                        Events.fire('notify-user', Localization.getTranslation("notifications.error-sharing-size"));
                    }
                    else {
                        Events.fire('notify-user', Localization.getTranslation("notifications.error-sharing-default"));
                    }

                    this._tidyUpButtons();
                    await this._setupDownload()
                });

            // Prevent clicking the button multiple times
            this._disableButton(this.$shareBtn, 2000);
        }
        this.$shareBtn.removeAttribute('disabled');
        this.$shareBtn.removeAttribute('hidden');
    }

    async _processDataAsZip() {
        let zipObjectUrl = "";
        let zipName = "";
        let sendAsZip = false;

        if (this._data.files.length > 1 && !this._filesTooBigForRam()) {
            Events.fire('set-progress', {
                peerId: this._data.peerId,
                progress: 0,
                status: 'process'
            });

            zipObjectUrl = await zipper.getObjectUrlOfZipFile(this._data.files,zipProgress => {
                    Events.fire('set-progress', {
                        peerId: this._data.peerId,
                        progress: zipProgress / this._data.totalSize,
                        status: 'process'
                    });
                });
            zipName = this._createZipFilename();

            sendAsZip = !!zipObjectUrl;
        }
        return {sendAsZip, zipObjectUrl, zipName};
    }

    _setDownloadButtonToZip(zipFileUrl, zipFileName) {
        const downloadSuccessfulTranslation = Localization.getTranslation("notifications.download-successful", null, {descriptor: this._data.descriptor});
        this.downloadSuccessful = false;
        this.$downloadBtn.onclick = _ => {
            this._downloadFileFromUrl(zipFileUrl, zipFileName)

            Events.fire('notify-user', downloadSuccessfulTranslation);
            this.downloadSuccessful = true;

            this.hide();
        };
    }

    _setDownloadButtonToFiles(files) {
        const downloadTranslation = Localization.getTranslation("dialogs.download");
        const downloadSuccessfulTranslation = Localization.getTranslation("notifications.download-successful", null, {descriptor: this._data.descriptor});

        this.$downloadBtn.innerText = files.length === 1
            ? downloadTranslation
            : `${downloadTranslation} 1/${files.length}`;

        this.downloadSuccessful = false;
        let i = 0;

        this.$downloadBtn.onclick = _ => {
            this._disableButton(this.$shareBtn, 2000);

            this._downloadFiles([files[i]]);

            if (i < files.length - 1) {
                i++;
                this.$downloadBtn.innerText = `${downloadTranslation} ${i + 1}/${files.length}`;
                return
            }

            Events.fire('notify-user', downloadSuccessfulTranslation);
            this.downloadSuccessful = true;

            this.hide();
        };
    }

    async _addFileToPreviewBox(file) {
        try {
            const previewElement = await this.createPreviewElement(file)
            this.$previewBox.appendChild(previewElement);
        }
        catch (e) {
            Logger.log(e);
        }
    }

    _downloadFileFromUrl(url, name) {
        let tmpZipBtn = document.createElement("a");
        tmpZipBtn.download = name;
        tmpZipBtn.href = url;
        tmpZipBtn.click();
    }

    _downloadFiles(files) {
        let tmpBtn = document.createElement("a");
        for (let i = 0; i < files.length; i++) {
            tmpBtn.download = files[i].displayName;
            tmpBtn.href = URL.createObjectURL(files[i]);
            tmpBtn.click();
        }
    }

    _createZipFilename() {
        let now = new Date(Date.now());
        let year = now.getFullYear().toString();
        let month = (now.getMonth()+1).toString();
        let date = now.getDate().toString();
        let hours = now.getHours().toString();
        let minutes = now.getMinutes().toString();

        // Pad single letter strings with preceding "0"
        month = month.length < 2 ? "0" + month : month;
        date = date.length < 2 ? "0" + date : date;
        hours = hours.length < 2 ? "0" + hours : hours;
        minutes = minutes.length < 2 ? "0" + minutes : minutes;

        return `PairDrop_files_${year}${month}${date}_${hours}${minutes}.zip`;
    }

    async _setupShareMenu() {
        await this._setShareButton();

        // always show dialog
        this.show();

        // open share menu automatically
        setTimeout(() => {
            this.$shareBtn.click();
        }, 500);
    }

    async _setupDownload() {
        this.$downloadBtn.innerText = Localization.getTranslation("dialogs.download");
        this.$downloadBtn.removeAttribute('disabled');
        this.$downloadBtn.removeAttribute('hidden');

        let {sendAsZip, zipObjectUrl, zipName} = await this._processDataAsZip();

        // If single file or zipping failed or file size exceeds memory -> download files individually -> else download zip
        if (sendAsZip) {
            this._setDownloadButtonToZip(zipObjectUrl, zipName);
        } else {
            this._setDownloadButtonToFiles(this._data.files);
        }

        if (!sendAsZip) {
            this.show();
            return;
        }

        // download automatically if zipped or if only one file is received
        this.$downloadBtn.click();

        // if automatic download fails -> show dialog after 1 s
        setTimeout(() => {
            if (!this.downloadSuccessful) {
                this.show();
            }
        }, 1000);
    }

    _tidyUpButtons() {
        this.$shareBtn.setAttribute('disabled', true);
        this.$shareBtn.setAttribute('hidden', true);
        this.$shareBtn.onclick = null;
        this.$downloadBtn.setAttribute('disabled', true);
        this.$downloadBtn.setAttribute('hidden', true);
        this.$downloadBtn.onclick = null;
    }

    _tidyUpPreviewBox() {
        this.$previewBox.innerHTML = '';
    }

    hide() {
        super.hide();

        setTimeout(async () => {
            this._tidyUpButtons();
            this._tidyUpPreviewBox();

            this._busy = false;

            await this._processFiles();
        }, 300);
    }
}

class ReceiveRequestDialog extends ReceiveDialog {

    constructor() {
        super('receive-request-dialog');

        this.$acceptRequestBtn = this.$el.querySelector('#accept-request');
        this.$declineRequestBtn = this.$el.querySelector('#decline-request');
        this.$acceptRequestBtn.addEventListener('click', _ => this._respondToFileTransferRequest(true));
        this.$declineRequestBtn.addEventListener('click', _ => this._respondToFileTransferRequest(false));

        this._filesTransferRequestQueue = [];
        this._currentRequest = null;

        Events.on('files-transfer-request', e => this._onRequestFileTransfer(e.detail.request, e.detail.peerId))
        Events.on('files-transfer-request-abort', e => this._onRequestFileTransferAbort(e.detail.peerId));
        Events.on('keydown', e => this._onKeyDown(e));
    }

    _onKeyDown(e) {
        if (!this.isShown()) return;

        if (e.code === "Escape") {
            this._respondToFileTransferRequest(false);
        }
    }

    _onRequestFileTransfer(request, peerId) {
        this._filesTransferRequestQueue.push({request: request, peerId: peerId});
        if (this.isShown()) return;
        this._dequeueRequests();
    }

    _onRequestFileTransferAbort(peerId) {
        // Remove file transfer request from this peer from queue
        for (let i = 0; i < this._filesTransferRequestQueue.length; i++) {
            if (this._filesTransferRequestQueue[i].peerId === peerId) {
                this._filesTransferRequestQueue.splice(i, 1);
                break;
            }
        }

        // Hide dialog if the currently open transfer request is from this peer
        if (this.isShown() && this.correspondingPeerId === peerId) {
            this.hide();
            Events.fire('notify-user', Localization.getTranslation("notifications.selected-peer-left"));
        }
    }

    _dequeueRequests() {
        if (!this._filesTransferRequestQueue.length) {
            this._currentRequest = null;
            return;
        }
        let {request, peerId} = this._filesTransferRequestQueue.shift();
        this._currentRequest = request;
        this._showRequestDialog(request, peerId);
    }

    _addThumbnailToPreviewBox(thumbnailData) {
        if (thumbnailData && thumbnailData.substring(0, 22) === "data:image/jpeg;base64") {
            let element = document.createElement('img');
            element.src = thumbnailData;
            this.$previewBox.appendChild(element)
        }
    }

    _showRequestDialog(request, peerId) {
        this.correspondingPeerId = peerId;

        const transferRequestTitleTranslation = request.imagesOnly
            ? Localization.getTranslation('document-titles.image-transfer-requested')
            : Localization.getTranslation('document-titles.file-transfer-requested');

        const displayName = $(peerId).ui._displayName();
        const connectionHash = $(peerId).ui._connectionHash;
        const badgeClassName = $(peerId).ui._badgeClassName();

        this._parseFileData(displayName, connectionHash, request.header, request.imagesOnly, request.totalSize, badgeClassName);
        this._addThumbnailToPreviewBox(request.thumbnailDataUrl);

        this.$receiveTitle.innerText = transferRequestTitleTranslation;

        document.title =  `${transferRequestTitleTranslation} - PairDrop`;
        changeFavicon("images/favicon-96x96-notification.png");

        this.$acceptRequestBtn.removeAttribute('disabled');
        this.show();
    }

    _respondToFileTransferRequest(accepted) {
        Events.fire('respond-to-files-transfer-request', {
            to: this.correspondingPeerId,
            accepted: accepted
        })
        if (accepted) {
            Events.fire('set-progress', {peerId: this.correspondingPeerId, progress: 0, status: 'wait'});

            // Prevent device from sleeping
            NoSleepUI.enable();
        }
        this.hide();
    }

    hide() {
        // clear previewBox after dialog is closed
        setTimeout(() => {
            this.$previewBox.innerHTML = '';
            this.$acceptRequestBtn.setAttribute('disabled', true);
        }, 300);

        super.hide();

        // show next request
        setTimeout(() => this._dequeueRequests(), 300);
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
        this.$inputKeyChars.forEach(char => char.removeAttribute('disabled'));
    }

    _disableChars() {
        this.$inputKeyChars.forEach(char => char.setAttribute('disabled', true));
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
        }
        else if (e.key === "ArrowRight" && nextSibling) {
            e.preventDefault();
            nextSibling.focus();
        }
        else if (e.key === "ArrowLeft" && previousSibling) {
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
        }
        else {
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
            () => this.$pairSubmitBtn.removeAttribute('disabled'),
            () => this.$pairSubmitBtn.setAttribute('disabled', true),
            () => this._submit()
        );

        this.$pairDeviceHeaderBtn.addEventListener('click', _ => this._pairDeviceInitiate());
        this.$form.addEventListener('submit', e => this._onSubmit(e));
        this.$closeBtn.addEventListener('click', _ => this._close());

        Events.on('keydown', e => this._onKeyDown(e));
        Events.on('ws-disconnected', _ => this.hide());
        Events.on('pair-device-initiated', e => this._onPairDeviceInitiated(e.detail));
        Events.on('pair-device-joined', e => this._onPairDeviceJoined(e.detail.peerId, e.detail.roomSecret));
        Events.on('peers', e => this._onPeers(e.detail.peers, e.detail.roomType, e.detail.roomId));
        Events.on('peer-joined', e => this._onPeerJoined(e.detail.peer, e.detail.roomType, e.detail.roomId));
        Events.on('pair-device-join-key-invalid', _ => this._onPublicRoomJoinKeyInvalid());
        Events.on('pair-device-canceled', e => this._onPairDeviceCanceled(e.detail));
        Events.on('evaluate-number-room-secrets', _ => this._evaluateNumberRoomSecrets())
        Events.on('secret-room-deleted', e => this._onSecretRoomDeleted(e.detail));
        this.$el.addEventListener('paste', e => this._onPaste(e));
        this.$qrCode.addEventListener('click', _ => this._copyPairUrl());

        this.pairPeer = {};
    }

    _onKeyDown(e) {
        if (!this.isShown()) return;

        if (e.code === "Escape") {
            // Timeout to prevent share mode from getting cancelled simultaneously
            setTimeout(() => this._close(), 50);
        }
    }

    _onPaste(e) {
        e.preventDefault();
        let pastedKey = e.clipboardData
            .getData("Text")
            .replace(/\D/g,'')
            .substring(0, 6);
        this.inputKeyContainer._onPaste(pastedKey);
    }

    _pairDeviceInitiate() {
        Events.fire('pair-device-initiate');
    }

    _onPairDeviceInitiated(msg) {
        this.pairKey = msg.pairKey;
        this.roomSecret = msg.roomSecret;
        this._setKeyAndQRCode();
        this.inputKeyContainer._enableChars();
        this.show();
    }

    _setKeyAndQRCode() {
        this.$key.innerText = `${this.pairKey.substring(0,3)} ${this.pairKey.substring(3,6)}`

        // Display the QR code for the url
        const qr = new QRCode({
            content: this._getPairUrl(),
            width: 130,
            height: 130,
            padding: 1,
            background: 'white',
            color: 'rgb(18, 18, 18)',
            ecl: "L",
            join: true
        });
        this.$qrCode.innerHTML = qr.svg();
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

    _onPeers(peers, roomType, roomId) {
        peers.forEach(messagePeer => {
            this._evaluateJoinedPeer(messagePeer, roomType, roomId);
        });
    }

    _onPeerJoined(peer, roomType, roomId) {
        this._evaluateJoinedPeer(peer, roomType, roomId);
    }

    _evaluateJoinedPeer(peer, roomType, roomId) {
        const noPairPeerSaved = !Object.keys(this.pairPeer);
        const peerId = peer.id;

        if (!peerId || !roomType || !roomId || noPairPeerSaved) return;

        const samePeerId = peerId === this.pairPeer.peerId;
        const sameRoomSecret = roomId === this.pairPeer.roomSecret;
        const typeIsSecret = roomType === "secret";

        if (!samePeerId || !sameRoomSecret || !typeIsSecret) return;

        this._onPairPeerJoined(peer, roomId);
        this.pairPeer = {};
    }

    _onPairPeerJoined(peer, roomSecret) {
        const displayName = peer.name.displayName;
        const deviceName = peer.name.deviceName;

        PersistentStorage
            .addRoomSecret(roomSecret, displayName, deviceName)
            .then(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.pairing-success"));
                this._evaluateNumberRoomSecrets();
            })
            .finally(() => {
                this._cleanUp();
                this.hide();
            })
            .catch(_ => {
                Events.fire('notify-user', Localization.getTranslation("notifications.pairing-not-persistent"));
                PersistentStorage.logBrowserNotCapable();
            });
        Events.fire('room-secret-added', {peerId: peer.id, roomSecret: roomSecret})
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
        PersistentStorage
            .deleteRoomSecret(roomSecret)
            .then(_ => {
                this._evaluateNumberRoomSecrets();
            });
    }

    _evaluateNumberRoomSecrets() {
        PersistentStorage
            .getAllRoomSecrets()
            .then(roomSecrets => {
                if (roomSecrets.length > 0) {
                    this.$editPairedDevicesHeaderBtn.removeAttribute('hidden');
                    this.$footerInstructionsPairedDevices.removeAttribute('hidden');
                }
                else {
                    this.$editPairedDevicesHeaderBtn.setAttribute('hidden', true);
                    this.$footerInstructionsPairedDevices.setAttribute('hidden', true);
                }
                Events.fire('evaluate-footer-badges');
            });
    }
}

class EditPairedDevicesDialog extends Dialog {
    constructor() {
        super('edit-paired-devices-dialog');
        this.$pairedDevicesWrapper = this.$el.querySelector('.paired-devices-wrapper');
        this.$footerBadgePairedDevices = $$('.discovery-wrapper .badge-room-secret');
        this.$editPairedDevices = $('edit-paired-devices');

        this.$editPairedDevices.addEventListener('click', _ => this._onEditPairedDevices());
        this.$footerBadgePairedDevices.addEventListener('click', _ => this._onEditPairedDevices());

        Events.on('keydown', e => this._onKeyDown(e));
    }

    _onKeyDown(e) {
        if (!this.isShown()) return;

        if (e.code === "Escape") {
            this.hide();
        }
    }

    async _initDOM() {
        const pairedDeviceRemovedString = Localization.getTranslation("dialogs.paired-device-removed");
        const unpairString = Localization.getTranslation("dialogs.unpair").toUpperCase();
        const autoAcceptString = Localization.getTranslation("dialogs.auto-accept").toLowerCase();
        const roomSecretsEntries = await PersistentStorage.getAllRoomSecretEntries();

        roomSecretsEntries
            .forEach(roomSecretsEntry => {
                let $pairedDevice = document.createElement('div');
                $pairedDevice.classList.add("paired-device");
                $pairedDevice.setAttribute('placeholder', pairedDeviceRemovedString);

                $pairedDevice.innerHTML = `
                    <div class="display-name">
                        <span class="fw">
                            ${roomSecretsEntry.display_name}
                        </span>
                    </div>
                    <div class="device-name">
                        <span class="fw">
                            ${roomSecretsEntry.device_name}
                        </span>
                    </div>
                    <div class="button-wrapper row fw center wrap">
                        <div class="center grow">
                            <span class="center wrap">
                                ${autoAcceptString}
                            </span>
                            <label class="auto-accept switch pointer m-1">
                                <input type="checkbox" ${roomSecretsEntry.auto_accept ? "checked" : ""}>
                                <div class="slider round"></div>
                            </label>
                        </div>
                        <button class="btn grow" type="button">${unpairString}</button>
                    </div>`

                $pairedDevice
                    .querySelector('input[type="checkbox"]')
                    .addEventListener('click', e => {
                        PersistentStorage
                            .updateRoomSecretAutoAccept(roomSecretsEntry.secret, e.target.checked)
                            .then(roomSecretsEntry => {
                                Events.fire('auto-accept-updated', {
                                    'roomSecret': roomSecretsEntry.entry.secret,
                                    'autoAccept': e.target.checked
                                });
                            });
                    });

                $pairedDevice
                    .querySelector('button')
                    .addEventListener('click', e => {
                        PersistentStorage
                            .deleteRoomSecret(roomSecretsEntry.secret)
                            .then(roomSecret => {
                                Events.fire('room-secrets-deleted', [roomSecret]);
                                Events.fire('evaluate-number-room-secrets');
                                $pairedDevice.innerText = "";
                            });
                    })

                this.$pairedDevicesWrapper.appendChild($pairedDevice)
            })
    }

    hide() {
        super.hide();
        setTimeout(() => {
            this.$pairedDevicesWrapper.innerHTML = ""
        }, 300);
    }

    _onEditPairedDevices() {
        this._initDOM()
            .then(_ => {
                this._evaluateOverflowing(this.$pairedDevicesWrapper);
                this.show();
            });
    }

    _clearRoomSecrets() {
        PersistentStorage
            .getAllRoomSecrets()
            .then(roomSecrets => {
                PersistentStorage
                    .clearRoomSecrets()
                    .finally(() => {
                        Events.fire('room-secrets-deleted', roomSecrets);
                        Events.fire('evaluate-number-room-secrets');
                        Events.fire('notify-user', Localization.getTranslation("notifications.pairing-cleared"));
                        this.hide();
                    })
            });
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
            () => this.$joinSubmitBtn.removeAttribute('disabled'),
            () => this.$joinSubmitBtn.setAttribute('disabled', true),
            () => this._submit()
        );

        Events.on('keydown', e => this._onKeyDown(e));
        Events.on('public-room-created', e => this._onPublicRoomCreated(e.detail));
        Events.on('peers', e => this._onPeers(e.detail.peers, e.detail.roomId));
        Events.on('peer-joined', e => this._onPeerJoined(e.detail.roomId));
        Events.on('public-room-id-invalid', e => this._onPublicRoomIdInvalid(e.detail));
        Events.on('public-room-left', _ => this._onPublicRoomLeft());
        this.$el.addEventListener('paste', e => this._onPaste(e));
        this.$qrCode.addEventListener('click', _ => this._copyShareRoomUrl());

        Events.on('ws-connected', _ => this._onWsConnected());
        Events.on('translation-loaded', _ => this.setFooterBadge());
    }

    _onKeyDown(e) {
        if (!this.isShown()) return;

        if (e.code === "Escape") {
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
        }
        else {
            this._createPublicRoom();
        }
    }

    _createPublicRoom() {
        Events.fire('create-public-room');
    }

    _onPublicRoomCreated(roomId) {
        this.roomId = roomId;

        this._setKeyAndQrCode();

        this.show();

        sessionStorage.setItem('public_room_id', roomId);
    }

    _setKeyAndQrCode() {
        if (!this.roomId) return;

        this.$key.innerText = this.roomId.toUpperCase();

        // Display the QR code for the url
        const qr = new QRCode({
            content: this._getShareRoomUrl(),
            width: 130,
            height: 130,
            padding: 1,
            background: 'white',
            color: 'rgb(18, 18, 18)',
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

    _onWsConnected() {
        let roomId = sessionStorage.getItem('public_room_id');

        if (!roomId) return;

        this.roomId = roomId;
        this._setKeyAndQrCode();

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

    _onPeers(peers, roomId) {
        // Do not evaluate if creating new room
        if (this.roomId && !peers.length) return;

        this._evaluateJoinedPeer(roomId);
    }

    _onPeerJoined(roomId) {
        this._evaluateJoinedPeer(roomId);
    }

    _evaluateJoinedPeer(roomId) {
        const peerJoinedThisRoom = roomId === this.roomId;
        const switchedToOtherRoom = roomId === this.roomIdJoin;

        if (!roomId || (!peerJoinedThisRoom && !switchedToOtherRoom)) return;

        this.hide();

        sessionStorage.setItem('public_room_id', roomId);

        if (switchedToOtherRoom) {
            this.roomIdJoin = null;
            this.roomId = roomId;
            this._setKeyAndQrCode();
        }
    }

    _onPublicRoomIdInvalid(roomId) {
        Events.fire('notify-user', Localization.getTranslation("notifications.public-room-id-invalid"));
        if (roomId === sessionStorage.getItem('public_room_id')) {
            sessionStorage.removeItem('public_room_id');
        }
    }

    _leavePublicRoom() {
        Events.fire('leave-public-room');
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
        this.$footerBadgePublicRoomDevices.setAttribute('hidden', true);
        Events.fire('evaluate-footer-badges');
    }
}

class SendTextDialog extends Dialog {
    constructor() {
        super('send-text-dialog');

        this.$text = this.$el.querySelector('.textarea');
        this.$peerDisplayName = this.$el.querySelector('.display-name');
        this.$form = this.$el.querySelector('form');
        this.$submit = this.$el.querySelector('button[type="submit"]');
        this.$form.addEventListener('submit', e => this._onSubmit(e));
        this.$text.addEventListener('input', _ => this._onInput());
        this.$text.addEventListener('paste', e => this._onPaste(e));
        this.$text.addEventListener('drop', e => this._onDrop(e));

        Events.on('text-recipient', e => this._onRecipient(e.detail.peerId, e.detail.deviceName));
        Events.on('keydown', e => this._onKeyDown(e));
    }

    _onKeyDown(e) {
        if (!this.isShown()) return;

        if (e.code === "Escape") {
            this.hide();
        }
        else if (e.code === "Enter" && (e.ctrlKey || e.metaKey)) {
            if (this._textEmpty()) return;

            this._send();
        }
    }

    async _onDrop(e) {
        e.preventDefault()

        const text = e.dataTransfer.getData("text");
        const selection = window.getSelection();

        if (selection.rangeCount) {
            selection.deleteFromDocument();
            selection.getRangeAt(0).insertNode(document.createTextNode(text));
        }

        this._onInput();
    }

    async _onPaste(e) {
        e.preventDefault()

        const text = (e.clipboardData || window.clipboardData).getData('text');
        const selection = window.getSelection();

        if (selection.rangeCount) {
            selection.deleteFromDocument();
            const textNode = document.createTextNode(text);
            const range = document.createRange();
            range.setStart(textNode, textNode.length);
            range.collapse(true);
            selection.getRangeAt(0).insertNode(textNode);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        this._onInput();
    }

    _textEmpty() {
        return !this.$text.innerText || this.$text.innerText === "\n";
    }

    _onInput() {
        if (this._textEmpty()) {
            this.$submit.setAttribute('disabled', true);
            // remove remaining whitespace on Firefox on text deletion
            this.$text.innerText = "";
        }
        else {
            this.$submit.removeAttribute('disabled');
        }
        this._evaluateOverflowing(this.$text);
    }

    _onRecipient(peerId, deviceName) {
        this.correspondingPeerId = peerId;
        this.$peerDisplayName.innerText = deviceName;
        this.$peerDisplayName.classList.remove(...PeerUI._badgeClassNames);
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
        this.hide();
        setTimeout(() => this.$text.innerText = "", 300);
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
        this._hideTimeout = null;
    }

    selectionEmpty() {
        return !window.getSelection().toString()
    }

    async _onKeyDown(e) {
        if (!this.isShown()) return

        if (e.code === "KeyC" && (e.ctrlKey || e.metaKey) && this.selectionEmpty()) {
            await this._onCopy()
        }
        else if (e.code === "Escape") {
            this.hide();
        }
    }

    _onText(text, peerId) {
        audioPlayer.playBlop();
        this._receiveTextQueue.push({text: text, peerId: peerId});
        this._setDocumentTitleMessages();
        changeFavicon("images/favicon-96x96-notification.png");

        if (this.isShown() || this._hideTimeout) return;

        this._dequeueRequests();
    }

    _dequeueRequests() {
        this._setDocumentTitleMessages();
        changeFavicon("images/favicon-96x96-notification.png");

        let {text, peerId} = this._receiveTextQueue.shift();
        this._showReceiveTextDialog(text, peerId);
    }

    _showReceiveTextDialog(text, peerId) {
        this.$displayName.innerText = $(peerId).ui._displayName();
        this.$displayName.classList.remove(...PeerUI._badgeClassNames);
        this.$displayName.classList.add($(peerId).ui._badgeClassName());

        this.$text.innerText = text;

        // Beautify text if text is not too long
        if (this.$text.innerText.length <= 300000) {
            // Hacky workaround to replace URLs with link nodes in all cases
            // 1. Use text variable, find all valid URLs via regex and replace URLs with placeholder
            // 2. Use html variable, find placeholders with regex and replace them with link nodes

            let $textShadow = document.createElement('div');
            $textShadow.innerText = text;

            let linkNodes = {};
            let searchHTML = $textShadow.innerHTML;
            const p = "@";
            const pRgx = new RegExp(`${p}\\d+`, 'g');
            let occP = searchHTML.match(pRgx) || [];

            let m = 0;

            const allowedDomainChars = "a-zA-Z0-9áàäčçđéèêŋńñóòôöšŧüžæøåëìíîïðùúýþćěłřśţźǎǐǒǔǥǧǩǯəʒâûœÿãõāēīōūăąĉċďĕėęĝğġģĥħĩĭįıĵķĸĺļľņňŏőŕŗŝşťũŭůűųŵŷżאבגדהוזחטיךכלםמןנסעףפץצקרשתװױײ";
            const urlRgx = new RegExp(`(^|\\n|\\s|["><\\-_~:\\/?#\\[\\]@!$&'()*+,;=%.])(((https?:\\/\\/)?(?:[${allowedDomainChars}](?:[${allowedDomainChars}-]{0,61}[${allowedDomainChars}])?\\.)+[${allowedDomainChars}][${allowedDomainChars}-]{0,61}[${allowedDomainChars}])(:?\\d*)\\/?([${allowedDomainChars}_\\/\\-#.]*)(\\?([${allowedDomainChars}\\-_~:\\/?#\\[\\]@!$&'()*+,;=%.]*))?)`, 'g');

            $textShadow.innerText = text.replace(urlRgx,
                (match, whitespaceOrSpecial, url, g3, scheme) => {
                    let link = url;

                    // prefix www.example.com with http protocol to prevent it from being a relative link
                    if (!scheme && link.startsWith('www')) {
                        link = "http://" + link
                    }

                    if (isUrlValid(link)) {
                        // link is valid -> replace with link node placeholder

                        // find linkNodePlaceholder that is not yet present in text node
                        m++;
                        while (occP.includes(`${p}${m}`)) {
                            m++;
                        }
                        let linkNodePlaceholder = `${p}${m}`;

                        // add linkNodePlaceholder to text node and save a reference to linkNodes object
                        linkNodes[linkNodePlaceholder] = `<a href="${link}" target="_blank">${url}</a>`;
                        return `${whitespaceOrSpecial}${linkNodePlaceholder}`;
                    }
                    // link is not valid -> do not replace
                    return match;
                });


            this.$text.innerHTML = $textShadow.innerHTML.replace(pRgx,
                (m) => {
                    let urlNode = linkNodes[m];
                    return urlNode ? urlNode : m;
                });
        }

        this._evaluateOverflowing(this.$text);
        this.show();
    }

    _setDocumentTitleMessages() {
        document.title = this._receiveTextQueue.length <= 1
            ? `${ Localization.getTranslation("document-titles.message-received") } - PairDrop`
            : `${ Localization.getTranslation("document-titles.message-received-plural", null, {count: this._receiveTextQueue.length + 1}) } - PairDrop`;
    }

    async _onCopy() {
        const sanitizedText = this.$text.innerText.replace(/\u00A0/gm, ' ');
        navigator.clipboard
            .writeText(sanitizedText)
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

        // If queue is empty -> clear text field | else -> open next message
        this._hideTimeout = setTimeout(() => {
            if (!this._receiveTextQueue.length) {
                this.$text.innerHTML = "";
            }
            else {
                this._dequeueRequests();
            }
            this._hideTimeout = null;
        }, 500);
    }
}

class ShareTextDialog extends Dialog {
    constructor() {
        super('share-text-dialog');

        this.$text = this.$el.querySelector('.textarea');
        this.$approveMsgBtn = this.$el.querySelector('button[type="submit"]');
        this.$checkbox = this.$el.querySelector('input[type="checkbox"]')

        this.$approveMsgBtn.addEventListener('click', _ => this._approveShareText());

        // Only show this per default if user sets checkmark
        this.$checkbox.checked = localStorage.getItem('approve-share-text')
            ? ShareTextDialog.isApproveShareTextSet()
            : false;

        this._setCheckboxValueToLocalStorage();

        this.$checkbox.addEventListener('change', _ => this._setCheckboxValueToLocalStorage());
        Events.on('share-text-dialog', e => this._onShareText(e.detail));
        Events.on('keydown', e => this._onKeyDown(e));
        this.$text.addEventListener('input', _ => this._evaluateEmptyText());
    }

    static isApproveShareTextSet() {
        return localStorage.getItem('approve-share-text') === "true";
    }

    _setCheckboxValueToLocalStorage() {
        localStorage.setItem('approve-share-text', this.$checkbox.checked ? "true" : "false");
    }

    _onKeyDown(e) {
        if (!this.isShown()) return;

        if (e.code === "Escape") {
            this._approveShareText();
        }
        else if (e.code === "Enter" && (e.ctrlKey || e.metaKey)) {
            if (this._textEmpty()) return;

            this._approveShareText();
        }
    }

    _textEmpty() {
        return !this.$text.innerText || this.$text.innerText === "\n";
    }

    _evaluateEmptyText() {
        if (this._textEmpty()) {
            this.$approveMsgBtn.setAttribute('disabled', true);
            // remove remaining whitespace on Firefox on text deletion
            this.$text.innerText = "";
        }
        else {
            this.$approveMsgBtn.removeAttribute('disabled');
        }
        this._evaluateOverflowing(this.$text);
    }

    _onShareText(text) {
        this.$text.innerText = text;
        this._evaluateEmptyText();
        this.show();
    }

    _approveShareText() {
        Events.fire('activate-share-mode', {text: this.$text.innerText});
        this.hide();
    }

    hide() {
        super.hide();
        setTimeout(() => this.$text.innerText = "", 500);
    }
}

class Base64Dialog extends Dialog {

    constructor() {
        super('base64-paste-dialog');

        this.$title = this.$el.querySelector('.dialog-title');
        this.$pasteBtn = this.$el.querySelector('#base64-paste-btn');
        this.$fallbackTextarea = this.$el.querySelector('.textarea');
    }

    async evaluateBase64Text(base64Text, hash) {
        this.$title.innerText = Localization.getTranslation('dialogs.base64-title-text');

        if (base64Text === 'paste') {
            // ?base64text=paste
            // base64 encoded string is ready to be pasted from clipboard
            this.preparePasting('text');
            this.show();
        }
        else if (base64Text === 'hash') {
            // ?base64text=hash#BASE64ENCODED
            // base64 encoded text is url hash which cannot be seen by the server and is faster (recommended)
            this.show();
            await this.processBase64Text(hash);
        }
        else {
            // ?base64text=BASE64ENCODED
            // base64 encoded text is part of the url param. Seen by server and slow (not recommended)
            this.show();
            await this.processBase64Text(base64Text);
        }
    }

    async evaluateBase64Zip(base64Zip, hash) {
        this.$title.innerText = Localization.getTranslation('dialogs.base64-title-files');

        if (base64Zip === 'paste') {
            // ?base64zip=paste || ?base64zip=true
            this.preparePasting('files');
            this.show();
        }
        else if (base64Zip === 'hash') {
            // ?base64zip=hash#BASE64ENCODED
            // base64 encoded zip file is url hash which cannot be seen by the server
            await this.processBase64Zip(hash);
        }
    }

    _setPasteBtnToProcessing() {
        this.$pasteBtn.style.pointerEvents = "none";
        this.$pasteBtn.innerText = Localization.getTranslation("dialogs.base64-processing");
    }

    preparePasting(type, useFallback = false) {
        const translateType = type === 'text'
            ? Localization.getTranslation("dialogs.base64-text")
            : Localization.getTranslation("dialogs.base64-files");

        if (navigator.clipboard.readText && !useFallback) {
            this.$pasteBtn.innerText = Localization.getTranslation("dialogs.base64-tap-to-paste", null, {type: translateType});
            this._clickCallback = _ => this.processClipboard(type);
            this.$pasteBtn.addEventListener('click', _ => {
                this._clickCallback()
                    .catch(_ => {
                        this.preparePasting(type, true);
                    })
            });
        }
        else {
            Logger.log("`navigator.clipboard.readText()` is not available on your browser.\nOn Firefox you can set `dom.events.asyncClipboard.readText` to true under `about:config` for convenience.")
            this.$pasteBtn.setAttribute('hidden', true);
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
        await this.processPastedBase64(type, base64);
    }

    async processClipboard(type) {
        const base64 = await navigator.clipboard.readText();
        await this.processPastedBase64(type, base64);
    }

    async processPastedBase64(type, base64) {
        try {
            if (type === 'text') {
                await this.processBase64Text(base64);
            }
            else {
                await this.processBase64Zip(base64);
            }
        }
        catch(e) {
            Events.fire('notify-user', Localization.getTranslation("notifications.clipboard-content-incorrect"));
            Logger.warn("Clipboard content is incorrect.")
        }
        this.hide();
    }

    async processBase64Text(base64){
        this._setPasteBtnToProcessing();

        try {
            const decodedText = await decodeBase64Text(base64);
            if (ShareTextDialog.isApproveShareTextSet()) {
                Events.fire('share-text-dialog', decodedText);
            }
            else {
                Events.fire('activate-share-mode', {text: decodedText});
            }
        }
        catch (e) {
            Events.fire('notify-user', Localization.getTranslation("notifications.text-content-incorrect"));
            Logger.warn("Text content incorrect.");
        }

        this.hide();
    }

    async processBase64Zip(base64) {
        this._setPasteBtnToProcessing();

        try {
            const decodedFiles = await decodeBase64Files(base64);
            Events.fire('activate-share-mode', {files: decodedFiles});
        }
        catch (e) {
            Events.fire('notify-user', Localization.getTranslation("notifications.file-content-incorrect"));
            Logger.warn("File content incorrect.");
        }

        this.hide();
    }

    hide() {
        this.$pasteBtn.removeEventListener('click', _ => this._clickCallback());
        this.$fallbackTextarea.removeEventListener('input', _ => this._inputCallback());
        this.$fallbackTextarea.setAttribute('disabled', true);
        this.$fallbackTextarea.blur();
        super.hide();
    }
}

class AboutUI {
    constructor() {
        this.$donationBtn = $('donation-btn');
        this.$twitterBtn = $('twitter-btn');
        this.$mastodonBtn = $('mastodon-btn');
        this.$blueskyBtn = $('bluesky-btn');
        this.$customBtn = $('custom-btn');
        this.$privacypolicyBtn = $('privacypolicy-btn');
        Events.on('config-loaded', _ => this._onConfigLoaded());
    }

    async _onConfigLoaded() {
        const btnConfig = window._config.buttons
        await this._evaluateBtnConfig(this.$donationBtn, btnConfig.donation_button);
        await this._evaluateBtnConfig(this.$twitterBtn, btnConfig.twitter_button);
        await this._evaluateBtnConfig(this.$mastodonBtn, btnConfig.mastodon_button);
        await this._evaluateBtnConfig(this.$blueskyBtn, btnConfig.bluesky_button);
        await this._evaluateBtnConfig(this.$customBtn, btnConfig.custom_button);
        await this._evaluateBtnConfig(this.$privacypolicyBtn, btnConfig.privacypolicy_button);
    }

    async _evaluateBtnConfig($btn, config) {
        // if config is not set leave everything as default
        if (!Object.keys(config).length) return;

        if (config.active === "false") {
            $btn.setAttribute('hidden', true);
        } else {
            if (config.link) {
                $btn.setAttribute('href', config.link);
            }
            if (config.title) {
                $btn.setAttribute('title', config.title);
                // prevent overwriting of custom title when setting different language
                $btn.removeAttribute('data-i18n-key');
                $btn.removeAttribute('data-i18n-attrs');
            }
            if (config.icon) {
                $btn.setAttribute('title', config.title);
                // prevent overwriting of custom title when setting different language
                $btn.removeAttribute('data-i18n-key');
                $btn.removeAttribute('data-i18n-attrs');
            }
            $btn.removeAttribute('hidden');
        }
    }
}

class Toast extends Dialog {
    constructor() {
        super('toast');
        this.$closeBtn = this.$el.querySelector('.icon-button');
        this.$text = this.$el.querySelector('span');

        this.$closeBtn.addEventListener('click', _ => this.hide());
        Events.on('notify-user', e => this._onNotify(e.detail));
        Events.on('share-mode-changed', _ => this.hide());
    }

    _onNotify(message) {
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        this.$text.innerText = typeof message === "object" ? message.message : message;
        this.show();

        if (typeof message === "object" && message.persistent) return;

        this.hideTimeout = setTimeout(() => this.hide(), 5000);
    }

    hide() {
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        super.hide();
    }
}

class Notifications {

    constructor() {
        // Check if the browser supports notifications
        if (!('Notification' in window)) return;

        this.$headerNotificationButton = $('notification');
        this.$downloadBtn = $('download-btn');

        this.$headerNotificationButton.addEventListener('click', _ => this._requestPermission());


        Events.on('text-received', e => this._messageNotification(e.detail.text, e.detail.peerId));
        Events.on('files-received', e => this._downloadNotification(e.detail.files, e.detail.imagesOnly));
        Events.on('files-transfer-request', e => this._requestNotification(e.detail.request, e.detail.peerId));
        // Todo on 'files-transfer-request-abort' remove notification
    }

    async _requestPermission() {
        await Notification.
            requestPermission(permission => {
                if (permission !== 'granted') {
                    Events.fire('notify-user', Localization.getTranslation("notifications.notifications-permissions-error"));
                    return;
                }
                Events.fire('notify-user', Localization.getTranslation("notifications.notifications-enabled"));
                this.$headerNotificationButton.setAttribute('hidden', true);
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
                this._bind(notification, _ => window.open(message, '_blank', "noreferrer"));
            }
            else {
                const notification = this._notify(Localization.getTranslation("notifications.message-received", null, {name: peerDisplayName}), message);
                this._bind(notification, _ => this._copyText(message, notification));
            }
        }
    }

    _downloadNotification(files, imagesOnly) {
        if (document.visibilityState === 'visible') return;

        let title, fileOther;
        const fileName = files[0].name;

        if (files.length === 1) {
            title = `${fileName}`;
        }
        else {
            if (files.length === 2) {
                fileOther = imagesOnly
                    ? Localization.getTranslation("dialogs.file-other-description-image")
                    : Localization.getTranslation("dialogs.file-other-description-file");
            }
            else {
                fileOther = imagesOnly
                    ? Localization.getTranslation("dialogs.file-other-description-image-plural", null, {count: files.length - 1})
                    : Localization.getTranslation("dialogs.file-other-description-file-plural", null, {count: files.length - 1});
            }
            title = `${fileName} ${fileOther}`
        }
        const notification = this._notify(title, Localization.getTranslation("notifications.click-to-download"));
        this._bind(notification, _ => this._download(notification));
    }

    _requestNotification(request, peerId) {
        if (document.visibilityState !== 'visible') {
            let imagesOnly = request.header.every(header => header.mime.split('/')[0] === 'image');
            let displayName = $(peerId).querySelector('.name').textContent;

            let descriptor;
            if (request.header.length === 1) {
                descriptor = imagesOnly
                    ? Localization.getTranslation("dialogs.title-image")
                    : Localization.getTranslation("dialogs.title-file");
            }
            else {
                descriptor = imagesOnly
                    ? Localization.getTranslation("dialogs.title-image-plural")
                    : Localization.getTranslation("dialogs.title-file-plural");
            }

            let title = Localization
                .getTranslation("notifications.request-title", null, {
                    name: displayName,
                    count: request.header.length,
                    descriptor: descriptor.toLowerCase()
                });

            const notification = this._notify(title, Localization.getTranslation("notifications.click-to-show"));
        }
    }

    _download(notification) {
        this.$downloadBtn.click();
        notification.close();
    }

    async _copyText(message, notification) {
        if (await navigator.clipboard.writeText(message)) {
            notification.close();
            this._notify(Localization.getTranslation("notifications.copied-text"));
        }
        else {
            this._notify(Localization.getTranslation("notifications.copied-text-error"));
        }
    }

    _bind(notification, handler) {
        if (notification.then) {
            notification.then(_ => {
                serviceWorker
                    .getNotifications()
                    .then(_ => {
                        serviceWorker.addEventListener('notificationclick', handler);
                    })
            });
        }
        else {
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

    async evaluateShareTarget(shareTargetType, title, text, url) {
        if (shareTargetType === "text") {
            let shareTargetText;
            if (url) {
                shareTargetText = url; // we share only the link - no text.
            }
            else if (title && text) {
                shareTargetText = title + '\r\n' + text;
            }
            else {
                shareTargetText = title + text;
            }

            if (ShareTextDialog.isApproveShareTextSet()) {
                Events.fire('share-text-dialog', shareTargetText);
            }
            else {
                Events.fire('activate-share-mode', {text: shareTargetText});
            }
        }
        else if (shareTargetType === "files") {
            let openRequest = window.indexedDB.open('pairdrop_store')
            openRequest.onsuccess = e => {
                const db = e.target.result;
                const tx = db.transaction('share_target_files', 'readwrite');
                const store = tx.objectStore('share_target_files');
                const request = store.getAll();
                request.onsuccess = _ => {
                    const fileObjects = request.result;

                    let filesReceived = [];
                    for (let i = 0; i < fileObjects.length; i++) {
                        filesReceived.push(new File([fileObjects[i].buffer], fileObjects[i].name));
                    }

                    const clearRequest = store.clear()
                    clearRequest.onsuccess = _ => db.close();

                    Events.fire('activate-share-mode', {files: filesReceived})
                }
            }
        }
    }
}

// Keep for legacy reasons even though this is removed from new PWA installations
class WebFileHandlersUI {
    async evaluateLaunchQueue() {
        if (!"launchQueue" in window) return;

        launchQueue.setConsumer(async launchParams => {
            Logger.log("Launched with: ", launchParams);

            if (!launchParams.files.length) return;

            let files = [];

            for (let i = 0; i < launchParams.files.length; i++) {
                if (i !== 0 && await launchParams.files[i].isSameEntry(launchParams.files[i-1])) continue;

                const file = await launchParams.files[i].getFile();
                files.push(file);
            }

            Events.fire('activate-share-mode', {files: files})
        });
    }
}

class NoSleepUI {
    constructor() {
        NoSleepUI._nosleep = new NoSleep();
        NoSleepUI._active = false;
    }

    static enable() {
        if (NoSleepUI._active) return;

        NoSleepUI._nosleep.enable();
        NoSleepUI._active = true;
    }

    static disable() {
        NoSleepUI._nosleep.disable();
        NoSleepUI._active = false;
    }
}
