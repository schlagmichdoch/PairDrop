const $ = query => document.getElementById(query);
const $$ = query => document.body.querySelector(query);
const isURL = text => /^((https?:\/\/|www)[^\s]+)/g.test(text.toLowerCase());
window.isProductionEnvironment = !window.location.host.startsWith('localhost');
window.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
window.android = /android/i.test(navigator.userAgent);
window.pasteMode = {};
window.pasteMode.activated = false;

// set display name
Events.on('display-name', e => {
    const me = e.detail.message;
    const $displayName = $('displayName')
    $displayName.textContent = 'You are known as ' + me.displayName;
    $displayName.title = me.deviceName;
});

class PeersUI {

    constructor() {
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('peer-left', e => this._onPeerLeft(e.detail));
        Events.on('peer-connected', e => this._onPeerConnected(e.detail));
        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('set-progress', e => this._onSetProgress(e.detail));
        Events.on('paste', e => this._onPaste(e));
        Events.on('ws-disconnected', _ => this._clearPeers());
        Events.on('secret-room-deleted', _ => this._clearPeers('secret'));
        Events.on('activate-paste-mode', e => this._activatePasteMode(e.detail.files, e.detail.text));
        this.peers = {};

        this.$cancelPasteModeBtn = $('cancelPasteModeBtn');
        this.$cancelPasteModeBtn.addEventListener('click', _ => this._cancelPasteMode());

        Events.on('keydown', e => this._onKeyDown(e));
    }

    _onKeyDown(e) {
        if (document.querySelectorAll('x-dialog[show]').length === 0 && window.pasteMode.activated && e.code === "Escape") {
            Events.fire('deactivate-paste-mode');
        }
    }

    _onPeerJoined(msg) {
        this._joinPeer(msg.peer, msg.roomType, msg.roomType);
    }

    _joinPeer(peer, roomType, roomSecret) {
        peer.roomType = roomType;
        peer.roomSecret = roomSecret;
        if (this.peers[peer.id]) {
            this.peers[peer.id].roomType = peer.roomType;
            this._redrawPeer(peer);
            return; // peer already exists
        }
        this.peers[peer.id] = peer;
    }

    _onPeerConnected(peerId) {
        if(this.peers[peerId] && !$(peerId))
            new PeerUI(this.peers[peerId]);
    }

    _redrawPeer(peer) {
        const peerNode = $(peer.id);
        if (!peerNode) return;
        peerNode.classList.remove('type-ip', 'type-secret');
        peerNode.classList.add(`type-${peer.roomType}`)
    }

    _onPeers(msg) {
        msg.peers.forEach(peer => this._joinPeer(peer, msg.roomType, msg.roomSecret));
    }

    _onPeerDisconnected(peerId) {
        const $peer = $(peerId);
        if (!$peer) return;
        $peer.remove();
        setTimeout(_ => window.animateBackground(true), 1750); // Start animation again
    }

    _onPeerLeft(peerId) {
        this._onPeerDisconnected(peerId);
        delete this.peers[peerId];
    }

    _onSecretRoomDeleted(roomSecret) {
        for (const peerId in this.peers) {
            const peer = this.peers[peerId];
            if (peer.roomSecret === roomSecret) {
                this._onPeerLeft(peerId);
            }
        }
    }

    _onSetProgress(progress) {
        const $peer = $(progress.peerId);
        if (!$peer) return;
        $peer.ui.setProgress(progress.progress, progress.status)
    }

    _clearPeers(roomType = 'all') {
        for (const peerId in this.peers) {
            if (roomType === 'all' || this.peers[peerId].roomType === roomType) {
                const peerNode = $(peerId);
                if(peerNode) peerNode.remove();
                delete this.peers[peerId];
            }
        }
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
            let descriptor;
            let noPeersMessage;

            const xNoPeers = document.querySelectorAll('x-no-peers')[0];
            const xInstructions = document.querySelectorAll('x-instructions')[0];

            if (files.length === 1) {
                descriptor = files[0].name;
                noPeersMessage = `Open PairDrop on other devices to send<br><i>${descriptor}</i>`;
            } else if (files.length > 1) {
                descriptor = `${files[0].name} and ${files.length-1} other files`;
                noPeersMessage = `Open PairDrop on other devices to send<br>${descriptor}`;
            } else {
                descriptor = "pasted text";
                noPeersMessage = `Open PairDrop on other devices to send<br>${descriptor}`;
            }

            xInstructions.querySelector('p').innerHTML = `<i>${descriptor}</i>`;
            xInstructions.querySelector('p').style.display = 'block';
            xInstructions.setAttribute('desktop', `Click to send`);
            xInstructions.setAttribute('mobile', `Tap to send`);

            xNoPeers.getElementsByTagName('h2')[0].innerHTML = noPeersMessage;

            const _callback = (e) => this._sendClipboardData(e, files, text);
            Events.on('paste-pointerdown', _callback);
            Events.on('deactivate-paste-mode', _ => this._deactivatePasteMode(_callback));

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

            const xInstructions = document.querySelectorAll('x-instructions')[0];

            xInstructions.querySelector('p').innerText = '';
            xInstructions.querySelector('p').style.display = 'none';

            xInstructions.setAttribute('desktop', 'Click to send files or right click to send a message');
            xInstructions.setAttribute('mobile', 'Tap to send files or long tap to send a message');
            const xNoPeers = document.querySelectorAll('x-no-peers')[0];

            xNoPeers.getElementsByTagName('h2')[0].innerHTML = 'Open PairDrop on other devices to send files';
            const cancelPasteModeBtn = document.getElementById('cancelPasteModeBtn');

            cancelPasteModeBtn.setAttribute('hidden', "");

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

    html() {
        let title;
        let input = '';
        if (window.pasteMode.activated) {
            title = `Click to send ${window.pasteMode.descriptor}`;
        } else {
            title = 'Click to send files or right click to send a message';
            input = '<input type="file" multiple>';
        }
        this.$el.innerHTML = `
            <label class="column center" title="${title}">
                ${input}
                <x-icon shadow="1">
                    <svg class="icon"><use xlink:href="#"/></svg>
                </x-icon>
                <div class="progress">
                  <div class="circle"></div>
                  <div class="circle right"></div>
                </div>
                <div class="name font-subheading"></div>
                <div class="device-name font-body2"></div>
                <div class="status font-body2"></div>
            </label>`;

        this.$el.querySelector('svg use').setAttribute('xlink:href', this._icon());
        this.$el.querySelector('.name').textContent = this._displayName();
        this.$el.querySelector('.device-name').textContent = this._deviceName();
    }

    constructor(peer) {
        this._peer = peer;
        this._roomType = peer.roomType;
        this._roomSecret = peer.roomSecret;
        this._initDom();
        this._bindListeners();
        $$('x-peers').appendChild(this.$el);
        setTimeout(_ => window.animateBackground(false), 1750); // Stop animation
    }

    _initDom() {
        this.$el = document.createElement('x-peer');
        this.$el.id = this._peer.id;
        this.$el.ui = this;
        this.$el.classList.add(`type-${this._roomType}`);
        this.html();

        this._callbackInput = e => this._onFilesSelected(e)
        this._callbackClickSleep = _ => NoSleepUI.enable()
        this._callbackTouchStartSleep = _ => NoSleepUI.enable()
        this._callbackDrop = e => this._onDrop(e)
        this._callbackDragEnd = e => this._onDragEnd(e)
        this._callbackDragLeave = e => this._onDragEnd(e)
        this._callbackDragOver = e => this._onDragOver(e)
        this._callbackContextMenu = e => this._onRightClick(e)
        this._callbackTouchStart = _ => this._onTouchStart()
        this._callbackTouchEnd = e => this._onTouchEnd(e)
        this._callbackPointerDown = e => this._onPointerDown(e)
        // prevent browser's default file drop behavior
        Events.on('dragover', e => e.preventDefault());
        Events.on('drop', e => e.preventDefault());
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
            this.$el.setAttribute('status', status);
        } else {
            this.$el.removeAttribute('status');
            progress = 0;
        }
        const degrees = `rotate(${360 * progress}deg)`;
        $progress.style.setProperty('--progress', degrees);
    }

    _onDrop(e) {
        e.preventDefault();
        const files = e.dataTransfer.files;
        Events.fire('files-selected', {
            files: files,
            to: this._peer.id
        });
        this._onDragEnd();
    }

    _onDragOver() {
        this.$el.setAttribute('drop', 1);
    }

    _onDragEnd() {
        this.$el.removeAttribute('drop');
    }

    _onRightClick(e) {
        e.preventDefault();
        Events.fire('text-recipient', this._peer.id);
    }

    _onTouchStart() {
        this._touchStart = Date.now();
        this._touchTimer = setTimeout(_ => this._onTouchEnd(), 610);
    }

    _onTouchEnd(e) {
        if (Date.now() - this._touchStart < 500) {
            clearTimeout(this._touchTimer);
        } else { // this was a long tap
            if (e) e.preventDefault();
            Events.fire('text-recipient', this._peer.id);
        }
    }
}


class Dialog {
    constructor(id, hideOnDisconnect = true) {
        this.$el = $(id);
        this.$el.querySelectorAll('[close]').forEach(el => el.addEventListener('click', _ => this.hide()))
        this.$autoFocus = this.$el.querySelector('[autofocus]');
        if (hideOnDisconnect) Events.on('ws-disconnected', _ => this.hide());
    }

    show() {
        this.$el.setAttribute('show', 1);
        if (this.$autoFocus) this.$autoFocus.focus();
    }

    hide() {
        this.$el.removeAttribute('show');
        if (this.$autoFocus) {
            document.activeElement.blur();
            window.blur();
        }
    }
}

class ReceiveDialog extends Dialog {
    constructor(id, hideOnDisconnect = true) {
        super(id, hideOnDisconnect);

        this.$fileDescriptionNode = this.$el.querySelector('.file-description');
        this.$fileSizeNode = this.$el.querySelector('.file-size');
        this.$previewBox = this.$el.querySelector('.file-preview')
    }

    _formatFileSize(bytes) {
        if (bytes >= 1e9) {
            return (Math.round(bytes / 1e8) / 10) + ' GB';
        } else if (bytes >= 1e6) {
            return (Math.round(bytes / 1e5) / 10) + ' MB';
        } else if (bytes > 1000) {
            return Math.round(bytes / 1000) + ' KB';
        } else {
            return bytes + ' Bytes';
        }
    }
}

class ReceiveFileDialog extends ReceiveDialog {

    constructor() {
        super('receiveFileDialog', false);

        this.$shareOrDownloadBtn = this.$el.querySelector('#shareOrDownload');
        this.$receiveTitleNode = this.$el.querySelector('#receiveTitle')

        Events.on('files-received', e => this._onFilesReceived(e.detail.sender, e.detail.files));
        this._filesQueue = [];
    }

    _onFilesReceived(sender, files) {
        this._nextFiles(sender, files);
        window.blop.play();
    }

    _nextFiles(sender, nextFiles) {
        if (nextFiles) this._filesQueue.push({peerId: sender, files: nextFiles});
        if (this._busy) return;
        this._busy = true;
        const {peerId, files} = this._filesQueue.shift();
        this._displayFiles(peerId, files);
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
        return new Promise((resolve) => {
            let mime = file.type.split('/')[0]
            let previewElement = {
                image: 'img',
                audio: 'audio',
                video: 'video'
            }

            if (Object.keys(previewElement).indexOf(mime) === -1) {
                resolve(false);
            } else {
                console.log('the file is able to preview');
                let element = document.createElement(previewElement[mime]);
                element.src = URL.createObjectURL(file);
                element.controls = true;
                element.classList = 'element-preview'

                this.$previewBox.style.display = 'block';
                this.$previewBox.appendChild(element)
                element.onload = _ => resolve(true);
            }
        });
    }

    async _displayFiles(peerId, files) {
        if (this.continueCallback) this.$shareOrDownloadBtn.removeEventListener("click", this.continueCallback);

        let url;
        let description;
        let size;
        let filename;
        let title;

        if (files.length === 1) {
            title = 'PairDrop - File Received'
            description = files[0].name;
            size = this._formatFileSize(files[0].size);
            filename = files[0].name;
            url = URL.createObjectURL(files[0])
        } else {
            title = `PairDrop - ${files.length} Files Received`
            let completeSize = 0
            for (let i=0; i<files.length; i++) {
                completeSize += files[0].size;
            }
            description = `${files[0].name} and ${files.length-1} other ${files.length>2 ? "files" : "file"}`;
            size = this._formatFileSize(completeSize);

            for (let i=0; i<files.length; i++) {
                await zipper.addFile(files[i]);
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
            filename = `PairDrop_files_${year+month+date}_${hours+minutes}.zip`;
        }

        this.$receiveTitleNode.textContent = title;
        this.$fileDescriptionNode.textContent = description;
        this.$fileSizeNode.textContent = size;

        if ((window.iOS || window.android) && !!navigator.share && navigator.canShare({files})) {
            this.$shareOrDownloadBtn.innerText = "Share";
            this.continueCallback = async _ => {
                navigator.share({
                    files: files
                }).catch(err => console.error(err));
            }
            this.$shareOrDownloadBtn.addEventListener("click", this.continueCallback);
        } else {
            this.$shareOrDownloadBtn.innerText = "Download";
            this.$shareOrDownloadBtn.download = filename;
            this.$shareOrDownloadBtn.href = url;
        }

        this.createPreviewElement(files[0]).then(_ => {
            this.show()
            Events.fire('set-progress', {
                peerId: peerId,
                progress: 1,
                status: 'wait'
            })
            this.$shareOrDownloadBtn.click();
        });
    }

    hide() {
        this.$shareOrDownloadBtn.href = '';
        this.$previewBox.style.display = 'none';
        this.$previewBox.innerHTML = '';
        super.hide();
        this._dequeueFile();
    }
}

class ReceiveRequestDialog extends ReceiveDialog {

    constructor() {
        super('receiveRequestDialog', true);

        this.$acceptRequestBtn = this.$el.querySelector('#acceptRequest');
        this.$declineRequestBtn = this.$el.querySelector('#declineRequest');

        this.$acceptRequestBtn.addEventListener('click', _ => this._respondToFileTransferRequest(true));
        this.$declineRequestBtn.addEventListener('click', _ => this._respondToFileTransferRequest(false));

        Events.on('files-transfer-request', e => this._onRequestFileTransfer(e.detail.request, e.detail.peerId))
        Events.on('peer-left', e => this._onPeerDisconnectedOrLeft(e.detail))
        Events.on('peer-disconnected', e => this._onPeerDisconnectedOrLeft(e.detail))
        Events.on('keydown', e => this._onKeyDown(e));
    }

    _onKeyDown(e) {
        if (this.$el.attributes["show"] && e.code === "Escape") {
            this._respondToFileTransferRequest(false)
            setTimeout(_ => this.hide(), 500);
        }
    }

    _onPeerDisconnectedOrLeft(peerId) {
        if (peerId === this.requestingPeerId) {
            this._respondToFileTransferRequest(false)
            this.hide();
        }
    }

    _onRequestFileTransfer(request, peerId) {
        this.requestingPeerId = peerId;
        this.requestedHeader = request.header;

        const peer = $(peerId);
        let peerDisplayName = peer.ui._displayName();
        let fileDesc = request.header.length === 1
            ? "a file"
            : `${request.header.length} files`

        this.$fileDescriptionNode.innerText = `${peerDisplayName} would like to share ${fileDesc}`;
        this.$fileSizeNode.innerText = this._formatFileSize(request.size);

        if (request.thumbnailDataUrl) {
            let element = document.createElement('img');
            element.src = request.thumbnailDataUrl;
            element.classList = 'element-preview'

            this.$previewBox.style.display = 'block';
            this.$previewBox.appendChild(element)
        }

        this.show()
    }

    _respondToFileTransferRequest(accepted) {
        Events.fire('respond-to-files-transfer-request', {
            to: this.requestingPeerId,
            header: this.requestedHeader,
            accepted: accepted
        })
        this.requestingPeerId = null;
        if (accepted) {
            Events.fire('set-progress', {peerId: this._peerId, progress: 0, status: 'wait'});
            NoSleepUI.enable();
        }
    }

    hide() {
        this.$previewBox.style.display = 'none';
        this.$previewBox.innerHTML = '';
        super.hide();
    }
}

class PairDeviceDialog extends Dialog {
    constructor() {
        super('pairDeviceDialog');
        $('pair-device').addEventListener('click', _ => this._pairDeviceInitiate());
        this.$inputRoomKeyChars = this.$el.querySelectorAll('#keyInputContainer>input');
        this.$submitBtn = this.$el.querySelector('button[type="submit"]');
        this.$roomKey = this.$el.querySelector('#roomKey');
        this.$qrCode = this.$el.querySelector('#roomKeyQrCode');
        this.$clearSecretsBtn = $('clear-pair-devices');
        this.$footerInstructions = $$('footer>.font-body2');
        let createJoinForm = this.$el.querySelector('form');
        createJoinForm.addEventListener('submit', _ => this._onSubmit());

        this.$el.querySelector('[close]').addEventListener('click', _ => this._pairDeviceCancel())
        this.$inputRoomKeyChars.forEach(el => el.addEventListener('input', e => this._onCharsInput(e)));
        this.$inputRoomKeyChars.forEach(el => el.addEventListener('keydown', e => this._onCharsKeyDown(e)));
        this.$inputRoomKeyChars.forEach(el => el.addEventListener('focus', e => e.target.select()));
        this.$inputRoomKeyChars.forEach(el => el.addEventListener('click', e => e.target.select()));

        Events.on('keydown', e => this._onKeyDown(e));
        Events.on('ws-connected', _ => this._onWsConnected());
        Events.on('pair-device-initiated', e => this._pairDeviceInitiated(e.detail));
        Events.on('pair-device-joined', e => this._pairDeviceJoined(e.detail));
        Events.on('pair-device-join-key-invalid', _ => this._pairDeviceJoinKeyInvalid());
        Events.on('pair-device-canceled', e => this._pairDeviceCanceled(e.detail));
        Events.on('room-secret-delete', e => this._onRoomSecretDelete(e.detail))
        Events.on('clear-room-secrets', e => this._onClearRoomSecrets(e.detail))
        Events.on('secret-room-deleted', e => this._onSecretRoomDeleted(e.detail));
        this.$el.addEventListener('paste', e => this._onPaste(e));

        this.evaluateRoomKeyChars();
        this.evaluateUrlAttributes();
    }

    _onCharsInput(e) {
        e.target.value = e.target.value.replace(/\D/g,'');
        if (!e.target.value) return;
        this.evaluateRoomKeyChars();

        let nextSibling = e.target.nextElementSibling;
        if (nextSibling) {
            e.preventDefault();
            nextSibling.focus();
        }
    }

    _onKeyDown(e) {
        if (this.$el.attributes["show"]) {
            if (e.code === "Escape") {
                this.hide();
                this._pairDeviceCancel();
            }
            if (e.code === "keyO") {
                this._onRoomSecretDelete()
            }
        }
    }

    _onCharsKeyDown(e) {
        if (this.$el.attributes["show"] && e.code === "Escape") {
            this.hide();
            this._pairDeviceCancel();
        }
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

    _onPaste(e) {
        e.preventDefault();
        let num = e.clipboardData.getData("Text").replace(/\D/g,'').substring(0, 6);
        for (let i = 0; i < num.length; i++) {
            document.activeElement.value = num.charAt(i);
            let nextSibling = document.activeElement.nextElementSibling;
            if (!nextSibling) break;
            nextSibling.focus();
        }
    }

    evaluateRoomKeyChars() {
        if (this.$el.querySelectorAll('#keyInputContainer>input:placeholder-shown').length > 0) {
            this.$submitBtn.setAttribute("disabled", "");
        } else {
            this.inputRoomKey = "";
            this.$inputRoomKeyChars.forEach(el => {
                this.inputRoomKey += el.value;
            })
            this.$submitBtn.removeAttribute("disabled");
            if (document.activeElement === this.$inputRoomKeyChars[5]) {
                this._onSubmit();
            }
        }
    }

    evaluateUrlAttributes() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('room_key')) {
            this._pairDeviceJoin(urlParams.get('room_key'));
            window.history.replaceState({}, "title**", '/'); //remove room_key from url
        }
    }

    _onWsConnected() {
        PersistentStorage.getAllRoomSecrets().then(roomSecrets => {
            Events.fire('room-secrets', roomSecrets);
            this._evaluateNumberRoomSecrets();
        }).catch((e) => console.error(e));
    }

    _pairDeviceInitiate() {
        Events.fire('pair-device-initiate');
    }

    _pairDeviceInitiated(msg) {
        this.roomKey = msg.roomKey;
        this.roomSecret = msg.roomSecret;
        this.$roomKey.innerText = `${this.roomKey.substring(0,3)} ${this.roomKey.substring(3,6)}`
        // Display the QR code for the url
        const qr = new QRCode({
            content: this._getShareRoomURL(),
            width: 80,
            height: 80,
            padding: 0,
            background: "transparent",
            color: getComputedStyle(document.body).getPropertyValue('--text-color'),
            ecl: "L",
            join: true
        });
        this.$qrCode.innerHTML = qr.svg();
        this.$inputRoomKeyChars.forEach(el => el.removeAttribute("disabled"));
        this.show();
    }

    _getShareRoomURL() {
        let url = new URL(location.href);
        url.searchParams.append('room_key', this.roomKey)
        return url.href;
    }

    _onSubmit() {
        this._pairDeviceJoin(this.inputRoomKey);
    }

    _pairDeviceJoin(roomKey) {
        if (/^\d{6}$/g.test(roomKey)) {
            roomKey = roomKey.substring(0,6);
            Events.fire('pair-device-join', roomKey);
            let lastChar = this.$inputRoomKeyChars[5];
            lastChar.focus();
        }
    }

    _pairDeviceJoined(roomSecret) {
        this.hide();
        PersistentStorage.addRoomSecret(roomSecret).then(_ => {
            Events.fire('notify-user', 'Devices paired successfully.')
            this._evaluateNumberRoomSecrets()
        }).finally(_ => {
            this._cleanUp()
        })
        .catch((e) => console.error(e));
    }

    _pairDeviceJoinKeyInvalid() {
        Events.fire('notify-user', 'Key not valid')
    }

    _pairDeviceCancel() {
        this.hide();
        this._cleanUp();
        Events.fire('pair-device-cancel');
    }

    _pairDeviceCanceled(roomKey) {
        Events.fire('notify-user', `Key ${roomKey} invalidated.`)
    }

    _cleanUp() {
        this.roomSecret = null;
        this.roomKey = null;
        this.inputRoomKey = '';
        this.$inputRoomKeyChars.forEach(el => el.value = '');
        this.$inputRoomKeyChars.forEach(el => el.setAttribute("disabled", ""));
    }

    _onRoomSecretDelete(roomSecret) {
        PersistentStorage.deleteRoomSecret(roomSecret).then(_ => {
            Events.fire('room-secret-deleted', roomSecret)
            this._evaluateNumberRoomSecrets();
        }).catch((e) => console.error(e));
    }

    _onClearRoomSecrets() {
        PersistentStorage.getAllRoomSecrets().then(roomSecrets => {
            Events.fire('room-secrets-cleared', roomSecrets);
            PersistentStorage.clearRoomSecrets().finally(_ => {
                Events.fire('notify-user', 'All Devices unpaired.')
                this._evaluateNumberRoomSecrets();
            })
        }).catch((e) => console.error(e));
    }

    _onSecretRoomDeleted(roomSecret) {
        PersistentStorage.deleteRoomSecret(roomSecret).then(_ => {
            this._evaluateNumberRoomSecrets();
        }).catch(e => console.error(e));
    }

    _evaluateNumberRoomSecrets() {
        PersistentStorage.getAllRoomSecrets().then(roomSecrets => {
            if (roomSecrets.length > 0) {
                this.$clearSecretsBtn.removeAttribute('hidden');
                this.$footerInstructions.innerText = "You can be discovered on this network and by paired devices";
            } else {
                this.$clearSecretsBtn.setAttribute('hidden', '');
                this.$footerInstructions.innerText = "You can be discovered by everyone on this network";
            }
        }).catch((e) => console.error(e));
    }
}

class ClearDevicesDialog extends Dialog {
    constructor() {
        super('clearDevicesDialog');
        $('clear-pair-devices').addEventListener('click', _ => this._onClearPairDevices());
        let clearDevicesForm = this.$el.querySelector('form');
        clearDevicesForm.addEventListener('submit', _ => this._onSubmit());
    }

    _onClearPairDevices() {
        this.show();
    }

    _onSubmit() {
        Events.fire('clear-room-secrets');
        this.hide();
    }
}

class SendTextDialog extends Dialog {
    constructor() {
        super('sendTextDialog');
        Events.on('text-recipient', e => this._onRecipient(e.detail));
        this.$text = this.$el.querySelector('#textInput');
        const button = this.$el.querySelector('form');
        button.addEventListener('submit', _ => this._send());
        Events.on("keydown", e => this._onKeyDown(e))
    }

    async _onKeyDown(e) {
        if (this.$el.attributes["show"]) {
            if (e.code === "Escape") {
                this.hide();
            }
            if (e.code === "Enter" && (e.ctrlKey || e.metaKey)) {
                this._send();
                this.hide();
            }
        }
    }

    _onRecipient(recipient) {
        this._recipient = recipient;
        this._handleShareTargetText();
        this.show();

        const range = document.createRange();
        const sel = window.getSelection();

        this.$text.focus();
        range.selectNodeContents(this.$text);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    _handleShareTargetText() {
        if (!window.shareTargetText) return;
        this.$text.textContent = window.shareTargetText;
        window.shareTargetText = '';
    }

    _send() {
        Events.fire('send-text', {
            to: this._recipient,
            text: this.$text.innerText
        });
        this.$text.value = "";
    }
}

class ReceiveTextDialog extends Dialog {
    constructor() {
        super('receiveTextDialog', false);
        Events.on('text-received', e => this._onText(e.detail))
        this.$text = this.$el.querySelector('#text');
        const copy = this.$el.querySelector('#copy');
        copy.addEventListener('click', _ => this._onCopy());
        Events.on("keydown", e => this._onKeyDown(e))
    }

    async _onKeyDown(e) {
        if (this.$el.attributes["show"] && e.code === "KeyC" && (e.ctrlKey || e.metaKey)) {
            await this._onCopy()
            this.hide();
        }
    }

    _onText(e) {
        this.$text.innerHTML = '';
        const text = e.text;
        if (isURL(text)) {
            const $a = document.createElement('a');
            $a.href = text;
            $a.target = '_blank';
            $a.textContent = text;
            this.$text.appendChild($a);
        } else {
            this.$text.textContent = text;
        }
        this.show();
        window.blop.play();
    }

    async _onCopy() {
        await navigator.clipboard.writeText(this.$text.textContent);
        Events.fire('notify-user', 'Copied to clipboard');
    }
}

class Toast extends Dialog {
    constructor() {
        super('toast');
        Events.on('notify-user', e => this._onNotifiy(e.detail));
    }

    _onNotifiy(message) {
        this.$el.textContent = message;
        this.show();
        setTimeout(_ => this.hide(), 3000);
    }
}

class Notifications {

    constructor() {
        // Check if the browser supports notifications
        if (!('Notification' in window)) return;

        // Check whether notification permissions have already been granted
        if (Notification.permission !== 'granted') {
            this.$button = $('notification');
            this.$button.removeAttribute('hidden');
            this.$button.addEventListener('click', _ => this._requestPermission());
        }
        Events.on('text-received', e => this._messageNotification(e.detail.text));
        Events.on('files-received', _ => this._downloadNotification());
    }

    _requestPermission() {
        Notification.requestPermission(permission => {
            if (permission !== 'granted') {
                Events.fire('notify-user', Notifications.PERMISSION_ERROR || 'Error');
                return;
            }
            this._notify('Notifications enabled.');
            this.$button.setAttribute('hidden', 1);
        });
    }

    _notify(message, body) {
        const config = {
            body: body,
            icon: '/images/logo_transparent_128x128.png',
        }
        let notification;
        try {
            notification = new Notification(message, config);
        } catch (e) {
            // Android doesn't support "new Notification" if service worker is installed
            if (!serviceWorker || !serviceWorker.showNotification) return;
            notification = serviceWorker.showNotification(message, config);
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

    _messageNotification(message) {
        if (document.visibilityState !== 'visible') {
            if (isURL(message)) {
                const notification = this._notify(message, 'Click to open link');
                this._bind(notification, _ => window.open(message, '_blank', null, true));
            } else {
                const notification = this._notify(message, 'Click to copy text');
                this._bind(notification, _ => this._copyText(message, notification));
            }
        }
    }

    _downloadNotification() {
        if (document.visibilityState !== 'visible') {
            const notification = this._notify(message, 'Click to download');
            this._bind(notification, _ => this._download(notification));
        }
    }

    _download(notification) {
        $('shareOrDownload').click();
        notification.close();
    }

    _copyText(message, notification) {
        if (navigator.clipboard.writeText(message)) {
            notification.close();
            this._notify('Copied text to clipboard');
        } else {
            this._notify('Writing to clipboard failed. Copy manually!');

        }
    }

    _bind(notification, handler) {
        if (notification.then) {
            notification.then(_ => serviceWorker.getNotifications().then(notifications => {
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
        Events.on('ws-connected', _ => this._showOnlineMessage());
        Events.on('ws-disconnected', _ => window.animateBackground(false));
        if (!navigator.onLine) this._showOfflineMessage();
    }

    _showOfflineMessage() {
        Events.fire('notify-user', 'You are offline');
        window.animateBackground(false);
    }

    _showOnlineMessage() {
        if (!this.firstConnect) {
            this.firstConnect = true;
            return;
        }
        Events.fire('notify-user', 'You are back online');
        window.animateBackground(true);
    }
}

class WebShareTargetUI {
    constructor() {
        const parsedUrl = new URL(window.location);
        const title = parsedUrl.searchParams.get('title');
        const text = parsedUrl.searchParams.get('text');
        const url = parsedUrl.searchParams.get('url');

        let shareTargetText = title ? title : '';
        shareTargetText += text ? shareTargetText ? ' ' + text : text : '';

        if(url) shareTargetText = url; // We share only the Link - no text. Because link-only text becomes clickable.

        if (!shareTargetText) return;
        window.shareTargetText = shareTargetText;
        history.pushState({}, 'URL Rewrite', '/');
        console.log('Shared Target Text:', '"' + shareTargetText + '"');
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
            this.logBrowserNotCapable();
            return;
        }
        const DBOpenRequest = window.indexedDB.open('pairdrop_store');
        DBOpenRequest.onerror = (e) => {
            this.logBrowserNotCapable();
            console.log('Error initializing database: ');
            console.error(e)
        };
        DBOpenRequest.onsuccess = () => {
            console.log('Database initialised.');
        };
        DBOpenRequest.onupgradeneeded = (e) => {
            const db = e.target.result;
            db.onerror = e => console.log('Error loading database: ' + e);
            db.createObjectStore('keyval');
            const roomSecretsObjectStore = db.createObjectStore('room_secrets', {autoIncrement: true});
            roomSecretsObjectStore.createIndex('secret', 'secret', { unique: true });
        }
    }

    logBrowserNotCapable() {
        console.log("This browser does not support IndexedDB. Paired devices will be gone after closing the browser.");
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
                    resolve();
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
                const transaction = db.transaction('keyval', 'readwrite');
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

    static addRoomSecret(roomSecret) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readwrite');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequest = objectStore.add({'secret': roomSecret});
                objectStoreRequest.onsuccess = _ => {
                    console.log(`Request successful. RoomSecret added: ${roomSecret}`);
                    resolve();
                }
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        })
    }

    static getAllRoomSecrets() {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readwrite');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequest = objectStore.getAll();
                objectStoreRequest.onsuccess = e => {
                    let secrets = [];
                    for (let i=0; i<e.target.result.length; i++) {
                        secrets.push(e.target.result[i].secret);
                    }
                    console.log(`Request successful. Retrieved ${secrets.length} room_secrets`);
                    resolve(secrets);
                }
            }
            DBOpenRequest.onerror = (e) => {
                reject(e);
            }
        });
    }

    static deleteRoomSecret(room_secret) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readwrite');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequestKey = objectStore.index("secret").getKey(room_secret);
                objectStoreRequestKey.onsuccess = e => {
                    if (!e.target.result) {
                        console.log(`Nothing to delete. room_secret not existing: ${room_secret}`);
                        resolve();
                        return;
                    }
                    const objectStoreRequestDeletion = objectStore.delete(e.target.result);
                    objectStoreRequestDeletion.onsuccess = _ => {
                        console.log(`Request successful. Deleted room_secret: ${room_secret}`);
                        resolve();
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
}

class PairDrop {
    constructor() {
        Events.on('load', _ => {
            const server = new ServerConnection();
            const peers = new PeersManager(server);
            const peersUI = new PeersUI();
            const receiveFileDialog = new ReceiveFileDialog();
            const receiveRequestDialog = new ReceiveRequestDialog();
            const sendTextDialog = new SendTextDialog();
            const receiveTextDialog = new ReceiveTextDialog();
            const pairDeviceDialog = new PairDeviceDialog();
            const clearDevicesDialog = new ClearDevicesDialog();
            const toast = new Toast();
            const notifications = new Notifications();
            const networkStatusUI = new NetworkStatusUI();
            const webShareTargetUI = new WebShareTargetUI();
            const noSleepUI = new NoSleepUI();
        });
    }
}

const persistentStorage = new PersistentStorage();
const pairDrop = new PairDrop();


if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(serviceWorker => {
            console.log('Service Worker registered');
            window.serviceWorker = serviceWorker
        });
}

window.addEventListener('beforeinstallprompt', e => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        // make peerId persistent when pwa installed
        PersistentStorage.get('peerId').then(peerId => {
            sessionStorage.setItem("peerId", peerId);
        }).catch(e => console.error(e));

        // don't display install banner when installed
        return e.preventDefault();
    } else {
        const btn = document.querySelector('#install')
        btn.hidden = false;
        btn.onclick = _ => e.prompt();
        return e.preventDefault();
    }
});

// Background Animation
Events.on('load', () => {
    let c = document.createElement('canvas');
    document.body.appendChild(c);
    let style = c.style;
    style.width = '100%';
    style.position = 'absolute';
    style.zIndex = -1;
    style.top = 0;
    style.left = 0;
    let ctx = c.getContext('2d');
    let x0, y0, w, h, dw;

    function init() {
        w = window.innerWidth;
        h = window.innerHeight;
        c.width = w;
        c.height = h;
        let offset = h > 380 ? 100 : 65;
        offset = h > 800 ? 116 : offset;
        x0 = w / 2;
        y0 = h - offset;
        dw = Math.max(w, h, 1000) / 13;
        drawCircles();
    }
    window.onresize = init;

    function drawCircle(radius) {
        ctx.beginPath();
        let color = Math.round(255 * (1 - radius / Math.max(w, h)));
        ctx.strokeStyle = 'rgba(' + color + ',' + color + ',' + color + ',0.1)';
        ctx.arc(x0, y0, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.lineWidth = 2;
    }

    let step = 0;

    function drawCircles() {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) {
            drawCircle(dw * i + step % dw);
        }
        step += 1;
    }

    let loading = true;

    function animate() {
        if (loading || !finished()) {
            requestAnimationFrame(function() {
                drawCircles();
                animate();
            });
        }
    }

    function finished() {
        return step % dw >= dw - 5;
    }

    window.animateBackground = function(l) {
        if (!l) {
            loading = false;
        } else if (!loading) {
            loading = true;
            if (finished()) animate();
        }
    };
    init();
    animate();
});

// close About PairDrop page on Escape
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        window.location.hash = '#';
    }
});

Notifications.PERMISSION_ERROR = `
Notifications permission has been blocked
as the user has dismissed the permission prompt several times.
This can be reset in Page Info
which can be accessed by clicking the lock icon next to the URL.`;

document.body.onclick = _ => { // safari hack to fix audio
    document.body.onclick = null;
    if (!(/.*Version.*Safari.*/.test(navigator.userAgent))) return;
    blop.play();
}
