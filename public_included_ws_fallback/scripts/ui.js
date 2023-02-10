const $ = query => document.getElementById(query);
const $$ = query => document.body.querySelector(query);
const isURL = text => /^(https?:\/\/|www)[^\s]+$/g.test(text.toLowerCase());
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
        Events.on('peer-connected', e => this._onPeerConnected(e.detail));
        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('set-progress', e => this._onSetProgress(e.detail));
        Events.on('paste', e => this._onPaste(e));
        Events.on('secret-room-deleted', e => this._onSecretRoomDeleted(e.detail));
        Events.on('activate-paste-mode', e => this._activatePasteMode(e.detail.files, e.detail.text));
        this.peers = {};

        this.$cancelPasteModeBtn = $('cancelPasteModeBtn');
        this.$cancelPasteModeBtn.addEventListener('click', _ => this._cancelPasteMode());

        Events.on('dragover', e => this._onDragOver(e));
        Events.on('dragleave', _ => this._onDragEnd());
        Events.on('dragend', _ => this._onDragEnd());

        Events.on('drop', e => this._onDrop(e));
        Events.on('keydown', e => this._onKeyDown(e));

        this.$xNoPeers = $$('x-no-peers');
        this.$xInstructions = $$('x-instructions');
    }

    _onKeyDown(e) {
        if (document.querySelectorAll('x-dialog[show]').length === 0 && window.pasteMode.activated && e.code === "Escape") {
            Events.fire('deactivate-paste-mode');
        }
    }

    _onPeerJoined(msg) {
        this._joinPeer(msg.peer, msg.roomType, msg.roomSecret);
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
        if ($$('x-peers:empty')) setTimeout(_ => window.animateBackground(true), 1750); // Start animation again
    }

    _onSecretRoomDeleted(roomSecret) {
        for (const peerId in this.peers) {
            const peer = this.peers[peerId];
            if (peer.roomSecret === roomSecret) {
                this._onPeerDisconnected(peerId);
            }
        }
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
            let descriptor;
            let noPeersMessage;

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

            this.$xInstructions.querySelector('p').innerHTML = `<i>${descriptor}</i>`;
            this.$xInstructions.querySelector('p').style.display = 'block';
            this.$xInstructions.setAttribute('desktop', `Click to send`);
            this.$xInstructions.setAttribute('mobile', `Tap to send`);

            this.$xNoPeers.querySelector('h2').innerHTML = noPeersMessage;

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

            this.$xInstructions.querySelector('p').innerText = '';
            this.$xInstructions.querySelector('p').style.display = 'none';

            this.$xInstructions.setAttribute('desktop', 'Click to send files or right click to send a message');
            this.$xInstructions.setAttribute('mobile', 'Tap to send files or long tap to send a message');

            this.$xNoPeers.querySelector('h2').innerHTML = 'Open PairDrop on other devices to send files';

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
        this.$xInstructions = $$('x-instructions');
        setTimeout(_ => window.animateBackground(false), 1750); // Stop animation
    }

    _initDom() {
        this.$el = document.createElement('x-peer');
        this.$el.id = this._peer.id;
        this.$el.ui = this;
        this.$el.classList.add(`type-${this._roomType}`);
        if (!this._peer.rtcSupported) this.$el.classList.add('ws-peer')
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
    constructor(id) {
        this.$el = $(id);
        this.$el.querySelectorAll('[close]').forEach(el => el.addEventListener('click', _ => this.hide()));
        this.$autoFocus = this.$el.querySelector('[autofocus]');
        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));
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
        document.title = 'PairDrop';
        document.changeFavicon("images/favicon-96x96.png");
    }

    _onPeerDisconnected(peerId) {
        if (this.correspondingPeerId === peerId) {
            this.hide();
            Events.fire('notify-user', 'Selected peer left.')
        }
    }
}

class ReceiveDialog extends Dialog {
    constructor(id) {
        super(id);

        this.$fileDescriptionNode = this.$el.querySelector('.file-description');
        this.$fileSizeNode = this.$el.querySelector('.file-size');
        this.$previewBox = this.$el.querySelector('.file-preview')
    }

    _formatFileSize(bytes) {
        // 1 GB = 1024 MB = 1024^2 KB = 1024^3 B
        // 1024^2 = 104876; 1024^3 = 1073741824
        if (bytes >= 1073741824) {
            return Math.round(10 * bytes / 1073741824) / 10 + ' GB';
        } else if (bytes >= 1048576) {
            return Math.round(bytes / 1048576) + ' MB';
        } else if (bytes > 1024) {
            return Math.round(bytes / 1024) + ' KB';
        } else {
            return bytes + ' Bytes';
        }
    }
}

class ReceiveFileDialog extends ReceiveDialog {

    constructor() {
        super('receiveFileDialog');

        this.$shareOrDownloadBtn = this.$el.querySelector('#shareOrDownload');
        this.$receiveTitleNode = this.$el.querySelector('#receiveTitle')

        Events.on('files-received', e => this._onFilesReceived(e.detail.sender, e.detail.files, e.detail.request));
        this._filesQueue = [];
    }

    _onFilesReceived(sender, files, request) {
        this._nextFiles(sender, files, request);
        window.blop.play();
    }

    _nextFiles(sender, nextFiles, nextRequest) {
        if (nextFiles) this._filesQueue.push({peerId: sender, files: nextFiles, request: nextRequest});
        if (this._busy) return;
        this._busy = true;
        const {peerId, files, request} = this._filesQueue.shift();
        this._displayFiles(peerId, files, request);
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
                element.classList.add('element-preview');
                element.onload = _ => {
                    this.$previewBox.appendChild(element);
                    resolve(true)
                };
                element.addEventListener('loadeddata', _ => resolve(true));
                element.onerror = _ => reject(`${mime} preview could not be loaded from type ${file.type}`);
            }
        });
    }

    async _displayFiles(peerId, files, request) {
        if (this.continueCallback) this.$shareOrDownloadBtn.removeEventListener("click", this.continueCallback);

        let url;
        let title;
        let filenameDownload;

        let descriptor = request.imagesOnly ? "Image" : "File";

        let size = this._formatFileSize(request.totalSize);
        let description = files[0].name;

        let shareInsteadOfDownload = (window.iOS || window.android) && !!navigator.share && navigator.canShare({files});

        if (files.length === 1) {
            url = URL.createObjectURL(files[0])
            title = `PairDrop - ${descriptor} Received`
            filenameDownload = files[0].name;
        } else {
            title = `PairDrop - ${files.length} ${descriptor}s Received`
            description += ` and ${files.length-1} other ${descriptor.toLowerCase()}`;
            if(files.length>2) description += "s";

            if(!shareInsteadOfDownload) {
                let bytesCompleted = 0;
                zipper.createNewZipWriter();
                for (let i=0; i<files.length; i++) {
                    await zipper.addFile(files[i], {
                        onprogress: (progress) => {
                            Events.fire('set-progress', {
                                peerId: peerId,
                                progress: (bytesCompleted + progress) / request.totalSize,
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
            }
        }

        this.$receiveTitleNode.textContent = title;
        this.$fileDescriptionNode.textContent = description;
        this.$fileSizeNode.textContent = size;

        if (shareInsteadOfDownload) {
            this.$shareOrDownloadBtn.innerText = "Share";
            this.continueCallback = async _ => {
                navigator.share({
                        files: files
                    }).catch(err => console.error(err));
            }
            this.$shareOrDownloadBtn.addEventListener("click", this.continueCallback);
        } else {
            this.$shareOrDownloadBtn.innerText = "Download";
            this.$shareOrDownloadBtn.download = filenameDownload;
            this.$shareOrDownloadBtn.href = url;
        }

        this.createPreviewElement(files[0]).finally(_ => {
            document.title = `PairDrop - ${files.length} Files received`;
            document.changeFavicon("images/favicon-96x96-notification.png");
            this.show();
            Events.fire('set-progress', {peerId: peerId, progress: 1, status: 'process'})
            this.$shareOrDownloadBtn.click();
        }).catch(r => console.error(r));
    }

    hide() {
        this.$shareOrDownloadBtn.removeAttribute('href');
        this.$shareOrDownloadBtn.removeAttribute('download');
        this.$previewBox.innerHTML = '';
        super.hide();
        this._dequeueFile();
    }
}

class ReceiveRequestDialog extends ReceiveDialog {

    constructor() {
        super('receiveRequestDialog');

        this.$requestingPeerDisplayNameNode = this.$el.querySelector('#requestingPeerDisplayName');
        this.$fileStemNode = this.$el.querySelector('#fileStem');
        this.$fileExtensionNode = this.$el.querySelector('#fileExtension');
        this.$fileOtherNode = this.$el.querySelector('#fileOther');

        this.$acceptRequestBtn = this.$el.querySelector('#acceptRequest');
        this.$declineRequestBtn = this.$el.querySelector('#declineRequest');
        this.$acceptRequestBtn.addEventListener('click', _ => this._respondToFileTransferRequest(true));
        this.$declineRequestBtn.addEventListener('click', _ => this._respondToFileTransferRequest(false));

        Events.on('files-transfer-request', e => this._onRequestFileTransfer(e.detail.request, e.detail.peerId))
        Events.on('keydown', e => this._onKeyDown(e));
        this._filesTransferRequestQueue = [];
    }

    _onKeyDown(e) {
        if (this.$el.attributes["show"] && e.code === "Escape") {
            this._respondToFileTransferRequest(false);
        }
    }

    _onRequestFileTransfer(request, peerId) {
        this._filesTransferRequestQueue.push({request: request, peerId: peerId});
        if (this.$el.attributes["show"]) return;
        this._dequeueRequests();
    }

    _dequeueRequests() {
        if (!this._filesTransferRequestQueue.length) return;
        let {request, peerId} = this._filesTransferRequestQueue.shift();
        this._showRequestDialog(request, peerId)
    }

    _showRequestDialog(request, peerId) {
        this.correspondingPeerId = peerId;

        this.$requestingPeerDisplayNameNode.innerText = $(peerId).ui._displayName();

        const fileName = request.header[0].name;
        const fileNameSplit = fileName.split('.');
        const fileExtension = '.' + fileNameSplit[fileNameSplit.length - 1];
        this.$fileStemNode.innerText = fileName.substring(0, fileName.length - fileExtension.length);
        this.$fileExtensionNode.innerText = fileExtension

        if (request.header.length >= 2) {
            let fileOtherText = ` and ${request.header.length - 1} other `;
            fileOtherText += request.imagesOnly ? 'image' : 'file';
            if (request.header.length > 2) fileOtherText += "s";
            this.$fileOtherNode.innerText = fileOtherText;
        }

        this.$fileSizeNode.innerText = this._formatFileSize(request.totalSize);

        if (request.thumbnailDataUrl?.substring(0, 22) === "data:image/jpeg;base64") {
            let element = document.createElement('img');
            element.src = request.thumbnailDataUrl;
            element.classList.add('element-preview');

            this.$previewBox.appendChild(element)
        }

        document.title = 'PairDrop - File Transfer Requested';
        document.changeFavicon("images/favicon-96x96-notification.png");
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
        this.$previewBox.innerHTML = '';
        super.hide();
        setTimeout(_ => this._dequeueRequests(), 500);
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
        this.$footerInstructionsPairedDevices = $('and-by-paired-devices');
        let createJoinForm = this.$el.querySelector('form');
        createJoinForm.addEventListener('submit', _ => this._onSubmit());

        this.$el.querySelector('[close]').addEventListener('click', _ => this._pairDeviceCancel())
        this.$inputRoomKeyChars.forEach(el => el.addEventListener('input', e => this._onCharsInput(e)));
        this.$inputRoomKeyChars.forEach(el => el.addEventListener('keydown', e => this._onCharsKeyDown(e)));
        this.$inputRoomKeyChars.forEach(el => el.addEventListener('focus', e => e.target.select()));
        this.$inputRoomKeyChars.forEach(el => el.addEventListener('click', e => e.target.select()));

        Events.on('keydown', e => this._onKeyDown(e));
        Events.on('ws-connected', _ => this._onWsConnected());
        Events.on('ws-disconnected', _ => this.hide());
        Events.on('pair-device-initiated', e => this._pairDeviceInitiated(e.detail));
        Events.on('pair-device-joined', e => this._pairDeviceJoined(e.detail.peerId, e.detail.roomSecret));
        Events.on('pair-device-join-key-invalid', _ => this._pairDeviceJoinKeyInvalid());
        Events.on('pair-device-canceled', e => this._pairDeviceCanceled(e.detail));
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
        if (this.$el.attributes["show"] && e.code === "Escape") {
            // Timeout to prevent paste mode from getting cancelled simultaneously
            setTimeout(_ => this._pairDeviceCancel(), 50);
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

    _onPaste(e) {
        e.preventDefault();
        let num = e.clipboardData.getData("Text").replace(/\D/g,'').substring(0, 6);
        for (let i = 0; i < num.length; i++) {
            document.activeElement.value = num.charAt(i);
            let nextSibling = document.activeElement.nextElementSibling;
            if (!nextSibling) break;
            nextSibling.focus();
        }
        this.evaluateRoomKeyChars();
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
        }).catch(_ => PersistentStorage.logBrowserNotCapable());
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

    _pairDeviceJoined(peerId, roomSecret) {
        this.hide();
        PersistentStorage.addRoomSecret(roomSecret).then(_ => {
            Events.fire('notify-user', 'Devices paired successfully.');
            const oldRoomSecret = $(peerId).ui.roomSecret;
            if (oldRoomSecret) PersistentStorage.deleteRoomSecret(oldRoomSecret);
            $(peerId).ui.roomSecret = roomSecret;
            this._evaluateNumberRoomSecrets();
        }).finally(_ => {
            this._cleanUp();
        })
        .catch(_ => {
            Events.fire('notify-user', 'Paired devices are not persistent.');
            PersistentStorage.logBrowserNotCapable();
        });
    }

    _pairDeviceJoinKeyInvalid() {
        Events.fire('notify-user', 'Key not valid');
    }

    _pairDeviceCancel() {
        this.hide();
        this._cleanUp();
        Events.fire('pair-device-cancel');
    }

    _pairDeviceCanceled(roomKey) {
        Events.fire('notify-user', `Key ${roomKey} invalidated.`);
    }

    _cleanUp() {
        this.roomSecret = null;
        this.roomKey = null;
        this.inputRoomKey = '';
        this.$inputRoomKeyChars.forEach(el => el.value = '');
        this.$inputRoomKeyChars.forEach(el => el.setAttribute("disabled", ""));
    }

    _onClearRoomSecrets() {
        PersistentStorage.getAllRoomSecrets().then(roomSecrets => {
            Events.fire('room-secrets-cleared', roomSecrets);
            PersistentStorage.clearRoomSecrets().finally(_ => {
                Events.fire('notify-user', 'All Devices unpaired.')
                this._evaluateNumberRoomSecrets();
            })
        }).catch(_ => PersistentStorage.logBrowserNotCapable());
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
                this.$footerInstructionsPairedDevices.removeAttribute('hidden');
            } else {
                this.$clearSecretsBtn.setAttribute('hidden', '');
                this.$footerInstructionsPairedDevices.setAttribute('hidden', '');
            }
        }).catch(_ => PersistentStorage.logBrowserNotCapable());
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
        this.$form = this.$el.querySelector('form');
        this.$submit = this.$el.querySelector('button[type="submit"]');
        this.$form.addEventListener('submit', _ => this._send());
        this.$text.addEventListener('input', e => this._onChange(e));
        Events.on("keydown", e => this._onKeyDown(e));
    }

    async _onKeyDown(e) {
        if (this.$el.attributes["show"]) {
            if (e.code === "Escape") {
                this.hide();
            } else if (e.code === "Enter" && (e.ctrlKey || e.metaKey)) {
                if (this._textInputEmpty()) return;
                this._send();
            }
        }
    }

    _textInputEmpty() {
        return this.$text.innerText === "\n";
    }

    _onChange(e) {
        if (this._textInputEmpty()) {
            this.$submit.setAttribute('disabled', '');
        } else {
            this.$submit.removeAttribute('disabled');
        }
    }

    _onRecipient(peerId) {
        this.correspondingPeerId = peerId;
        this.show();

        const range = document.createRange();
        const sel = window.getSelection();

        this.$text.focus();
        range.selectNodeContents(this.$text);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    _send() {
        Events.fire('send-text', {
            to: this.correspondingPeerId,
            text: this.$text.innerText
        });
        this.$text.value = "";
        this.hide();
    }
}

class ReceiveTextDialog extends Dialog {
    constructor() {
        super('receiveTextDialog');
        Events.on('text-received', e => this._onText(e.detail.text, e.detail.peerId));
        this.$text = this.$el.querySelector('#text');
        this.$copy = this.$el.querySelector('#copy');
        this.$close = this.$el.querySelector('#close');

        this.$copy.addEventListener('click', _ => this._onCopy());
        this.$close.addEventListener('click', _ => this.hide());

        Events.on("keydown", e => this._onKeyDown(e));

        this.$receiveTextPeerDisplayNameNode = this.$el.querySelector('#receiveTextPeerDisplayName');
        this._receiveTextQueue = [];
    }

    async _onKeyDown(e) {
        if (this.$el.attributes["show"]) {
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
        if (this.$el.attributes["show"]) return;
        this._dequeueRequests();
    }

    _dequeueRequests() {
        if (!this._receiveTextQueue.length) return;
        let {text, peerId} = this._receiveTextQueue.shift();
        this._showReceiveTextDialog(text, peerId);
    }

    _showReceiveTextDialog(text, peerId) {
        this.$receiveTextPeerDisplayNameNode.innerText = $(peerId).ui._displayName();

        if (isURL(text)) {
            const $a = document.createElement('a');
            $a.href = text;
            $a.target = '_blank';
            $a.textContent = text;
            this.$text.innerHTML = '';
            this.$text.appendChild($a);
        } else {
            this.$text.textContent = text;
        }
        document.title = 'PairDrop - Message Received';
        document.changeFavicon("images/favicon-96x96-notification.png");
        this.show();
    }

    async _onCopy() {
        await navigator.clipboard.writeText(this.$text.textContent);
        Events.fire('notify-user', 'Copied to clipboard');
        this.hide();
    }

    hide() {
        super.hide();
        setTimeout(_ => this._dequeueRequests(), 500);
    }
}

class Base64ZipDialog extends Dialog {

    constructor() {
        super('base64ZipDialog');
        const urlParams = new URL(window.location).searchParams;
        const base64Zip = urlParams.get('base64zip');
        const base64Text = urlParams.get('base64text');
        this.$pasteBtn = this.$el.querySelector('#base64ZipPasteBtn')
        this.$pasteBtn.addEventListener('click', _ => this.processClipboard())

        if (base64Text) {
            this.processBase64Text(base64Text);
        } else if (base64Zip) {
            if (!navigator.clipboard.readText) {
                setTimeout(_ => Events.fire('notify-user', 'This feature is not available on your device.'), 500);
                this.clearBrowserHistory();
                return;
            }
            this.show();
        }
    }

    processBase64Text(base64Text){
        try {
            let decodedText = decodeURIComponent(escape(window.atob(base64Text)));
            Events.fire('activate-paste-mode', {files: [], text: decodedText});
        } catch (e) {
            setTimeout(_ => Events.fire('notify-user', 'Content incorrect.'), 500);
        } finally {
            this.clearBrowserHistory();
            this.hide();
        }
    }

    async processClipboard() {
        this.$pasteBtn.pointerEvents = "none";
        this.$pasteBtn.innerText = "Processing...";
        try {
            const base64zip = await navigator.clipboard.readText();
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
            Events.fire('activate-paste-mode', {files: files, text: ""})
        } catch (e) {
            Events.fire('notify-user', 'Clipboard content is incorrect.')
        } finally {
            this.clearBrowserHistory();
            this.hide();
        }
    }

    clearBrowserHistory() {
        window.history.replaceState({}, "Rewrite URL", '/');
    }
}

class Toast extends Dialog {
    constructor() {
        super('toast');
        Events.on('notify-user', e => this._onNotify(e.detail));
    }

    _onNotify(message) {
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        this.$el.textContent = message;
        this.show();
        this.hideTimeout = setTimeout(_ => this.hide(), 5000);
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
        Events.on('text-received', e => this._messageNotification(e.detail.text, e.detail.peerId));
        Events.on('files-received', e => this._downloadNotification(e.detail.files));
    }

    _requestPermission() {
        Notification.requestPermission(permission => {
            if (permission !== 'granted') {
                Events.fire('notify-user', Notifications.PERMISSION_ERROR || 'Error');
                return;
            }
            Events.fire('notify-user', 'Notifications enabled.');
            this.$button.setAttribute('hidden', 1);
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
            if (isURL(message)) {
                const notification = this._notify(`Link received by ${peerDisplayName} - Click to open`, message);
                this._bind(notification, _ => window.open(message, '_blank', null, true));
            } else {
                const notification = this._notify(`Message received by ${peerDisplayName} - Click to copy`, message);
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
            let title = files[0].name;
            if (files.length >= 2) {
                title += ` and ${files.length - 1} other `;
                title += imagesOnly ? 'image' : 'file';
                if (files.length > 2) title += "s";
            }
            const notification = this._notify(title, 'Click to download');
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
        Events.on('ws-connected', _ => this._showOnlineMessage());
        Events.on('ws-disconnected', _ => this._onWsDisconnected());
        if (!navigator.onLine) this._showOfflineMessage();
    }

    _showOfflineMessage() {
        Events.fire('notify-user', 'You are offline');
        window.animateBackground(false);
    }

    _showOnlineMessage() {
        window.animateBackground(true);
        if (!this.firstConnect) {
            this.firstConnect = true;
            return;
        }
        Events.fire('notify-user', 'You are back online');
    }

    _onWsDisconnected() {
        window.animateBackground(false);
        if (!this.firstConnect) this.firstConnect = true;
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
                    shareTargetText = url; // We share only the Link - no text. Because link-only text becomes clickable.
                } else if (title && text) {
                    shareTargetText = title + '\r\n' + text;
                } else {
                    shareTargetText = title + text;
                }

                console.log('Shared Target Text:', '"' + shareTargetText + '"');
                Events.fire('activate-paste-mode', {files: [], text: shareTargetText})
            } else if (share_target_type === "files") {
                const openRequest = window.indexedDB.open('pairdrop_store')
                openRequest.onsuccess( db => {
                    const tx = db.transaction('share_target_files', 'readwrite');
                    const store = tx.objectStore('share_target_files');
                    const request = store.getAll();
                    request.onsuccess = _ => {
                        Events.fire('activate-paste-mode', {files: request.result, text: ""})
                        const clearRequest = store.clear()
                        clearRequest.onsuccess = _ => db.close();
                    }
                })
            }
            window.history.replaceState({}, "Rewrite URL", '/');
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
            window.history.replaceState({}, "Rewrite URL", '/');
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
        const DBOpenRequest = window.indexedDB.open('pairdrop_store', 2);
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
            db.onerror = e => console.log('Error loading database: ' + e);
            try {
                db.createObjectStore('keyval');
            } catch (error) {
                console.log("Object store named 'keyval' already exists")
            }

            try {
                const roomSecretsObjectStore = db.createObjectStore('room_secrets', {autoIncrement: true});
                roomSecretsObjectStore.createIndex('secret', 'secret', { unique: true });
            } catch (error) {
                console.log("Object store named 'room_secrets' already exists")
            }

            try {
                db.createObjectStore('share_target_files');
            } catch (error) {
                console.log("Object store named 'share_target_files' already exists")
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
            const base64ZipDialog = new Base64ZipDialog();
            const toast = new Toast();
            const notifications = new Notifications();
            const networkStatusUI = new NetworkStatusUI();
            const webShareTargetUI = new WebShareTargetUI();
            const webFileHandlersUI = new WebFileHandlersUI();
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
    if (!window.matchMedia('(display-mode: minimal-ui)').matches) {
        // only display install btn when installed
        const btn = document.querySelector('#install')
        btn.hidden = false;
        btn.onclick = _ => e.prompt();
    }
    return e.preventDefault();
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
    let x0, y0, w, h, dw, offset;

    function init() {
        w = window.innerWidth;
        h = window.innerHeight;
        c.width = w;
        c.height = h;
        offset = h > 800
            ? 116
            : h > 380
                ? 100
                : 65;

        if (w < 420) offset += 20;
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

document.changeFavicon = function (src) {
    document.querySelector('[rel="icon"]').href = src;
    document.querySelector('[rel="shortcut icon"]').href = src;
}

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
