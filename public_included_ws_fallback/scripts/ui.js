const $ = query => document.getElementById(query);
const $$ = query => document.body.querySelector(query);
window.isProductionEnvironment = !window.location.host.startsWith('localhost');
window.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
window.android = /android/i.test(navigator.userAgent);
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
        Events.on('secret-room-deleted', e => this._onSecretRoomDeleted(e.detail));
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

        Events.on('peer-added', _ => this.evaluateOverflowing());
        Events.on('bg-resize', _ => this.evaluateOverflowing());

        this.$displayName = $('display-name');

        this.$displayName.addEventListener('keydown', e => this._onKeyDownDisplayName(e));
        this.$displayName.addEventListener('keyup', e => this._onKeyUpDisplayName(e));
        this.$displayName.addEventListener('blur', e => this._saveDisplayName(e.target.innerText));

        Events.on('self-display-name-changed', e => this._insertDisplayName(e.detail));
        Events.on('peer-display-name-changed', e => this._changePeerDisplayName(e.detail.peerId, e.detail.displayName));

        // Load saved display name on page load
        this._getSavedDisplayName().then(displayName => {
            console.log("Retrieved edited display name:", displayName)
            if (displayName) Events.fire('self-display-name-changed', displayName);
        });


        /* prevent animation on load */
        setTimeout(_ => {
            this.$xNoPeers.style.animationIterationCount = "1";
        }, 300);
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
            PersistentStorage.set('editedDisplayName', newDisplayName).then(_ => {
                Events.fire('notify-user', 'Device name is changed permanently.');
            }).catch(_ => {
                console.log("This browser does not support IndexedDB. Use localStorage instead.");
                localStorage.setItem('editedDisplayName', newDisplayName);
                Events.fire('notify-user', 'Device name is changed only for this session.');
            }).finally(_ => {
                Events.fire('self-display-name-changed', newDisplayName);
                Events.fire('broadcast-send', {type: 'self-display-name-changed', detail: newDisplayName});
            });
        } else {
            PersistentStorage.delete('editedDisplayName').catch(_ => {
                console.log("This browser does not support IndexedDB. Use localStorage instead.")
                localStorage.removeItem('editedDisplayName');
                Events.fire('notify-user', 'Random Display name is used again.');
            }).finally(_ => {
                Events.fire('notify-user', 'Device name is randomly generated again.');
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
        peer.roomTypes = [roomType];
        peer.roomSecret = roomSecret;
        if (this.peers[peer.id]) {
            if (!this.peers[peer.id].roomTypes.includes(roomType)) this.peers[peer.id].roomTypes.push(roomType);
            this._redrawPeer(this.peers[peer.id]);
            return; // peer already exists
        }
        this.peers[peer.id] = peer;
    }

    _onPeerConnected(peerId, connectionHash) {
        if(this.peers[peerId] && !$(peerId))
            new PeerUI(this.peers[peerId], connectionHash);
    }

    _redrawPeer(peer) {
        const peerNode = $(peer.id);
        if (!peerNode) return;
        peerNode.classList.remove('type-ip', 'type-secret');
        peer.roomTypes.forEach(roomType => peerNode.classList.add(`type-${roomType}`));
    }

    evaluateOverflowing() {
        if (this.$xPeers.clientHeight < this.$xPeers.scrollHeight) {
            this.$xPeers.classList.add('overflowing');
        } else {
            this.$xPeers.classList.remove('overflowing');
        }
    }

    _onPeers(msg) {
        msg.peers.forEach(peer => this._joinPeer(peer, msg.roomType, msg.roomSecret));
    }

    _onPeerDisconnected(peerId) {
        const $peer = $(peerId);
        if (!$peer) return;
        $peer.remove();
        this.evaluateOverflowing();
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
                descriptor = "shared text";
                noPeersMessage = `Open PairDrop on other devices to send<br>${descriptor}`;
            }

            this.$xInstructions.querySelector('p').innerHTML = `<i>${descriptor}</i>`;
            this.$xInstructions.querySelector('p').style.display = 'block';
            this.$xInstructions.setAttribute('desktop', `Click to send`);
            this.$xInstructions.setAttribute('mobile', `Tap to send`);

            this.$xNoPeers.querySelector('h2').innerHTML = noPeersMessage;

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
            title = `Click to send ${window.pasteMode.descriptor}`;
        } else {
            title = 'Click to send files or right click to send a message';
            input = '<input type="file" multiple>';
        }
        this.$el.innerHTML = `
            <label class="column center" title="${title}">
                ${input}
                <x-icon>
                    <div class="icon-wrapper" shadow="1">
                        <svg class="icon"><use xlink:href="#"/></svg>
                    </div>
                    <div class="highlight-wrapper center">
                        <div class="highlight" shadow="1"></div>
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
                    <span class="connection-hash font-body2" title="To verify the security of the end-to-end encryption, compare this security number on both devices"></span>
                </div>
            </label>`;

        this.$el.querySelector('svg use').setAttribute('xlink:href', this._icon());
        this.$el.querySelector('.name').textContent = this._displayName();
        this.$el.querySelector('.device-name').textContent = this._deviceName();
        this.$el.querySelector('.connection-hash').textContent = this._connectionHash;
    }

    _initDom() {
        this.$el = document.createElement('x-peer');
        this.$el.id = this._peer.id;
        this.$el.ui = this;
        this._peer.roomTypes.forEach(roomType => this.$el.classList.add(`type-${roomType}`));
        this.$el.classList.add('center');
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

    _parseFileData(displayName, connectionHash, files, imagesOnly, totalSize) {
        if (files.length > 1) {
            let fileOtherText = ` and ${files.length - 1} other `;
            if (files.length === 2) {
                fileOtherText += imagesOnly ? 'image' : 'file';
            } else {
                fileOtherText += imagesOnly ? 'images' : 'files';
            }
            this.$fileOther.innerText = fileOtherText;
        }

        const fileName = files[0].name;
        const fileNameSplit = fileName.split('.');
        const fileExtension = '.' + fileNameSplit[fileNameSplit.length - 1];
        this.$fileStem.innerText = fileName.substring(0, fileName.length - fileExtension.length);
        this.$fileExtension.innerText = fileExtension;
        this.$displayName.innerText = displayName;
        this.$displayName.title = connectionHash;
        this.$fileSize.innerText = this._formatFileSize(totalSize);
    }
}

class ReceiveFileDialog extends ReceiveDialog {

    constructor() {
        super('receive-file-dialog');

        this.$downloadBtn = this.$el.querySelector('#download-btn');
        this.$shareBtn = this.$el.querySelector('#share-btn');

        Events.on('files-received', e => this._onFilesReceived(e.detail.sender, e.detail.files, e.detail.imagesOnly, e.detail.totalSize));
        this._filesQueue = [];
    }

    _onFilesReceived(sender, files, imagesOnly, totalSize) {
        const displayName = $(sender).ui._displayName();
        const connectionHash = $(sender).ui._connectionHash;
        this._filesQueue.push({peer: sender, displayName: displayName, connectionHash: connectionHash, files: files, imagesOnly: imagesOnly, totalSize: totalSize});
        this._nextFiles();
        window.blop.play();
    }

    _nextFiles() {
        if (this._busy) return;
        this._busy = true;
        const {peer, displayName, connectionHash, files, imagesOnly, totalSize} = this._filesQueue.shift();
        this._displayFiles(peer, displayName, connectionHash, files, imagesOnly, totalSize);
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

    async _displayFiles(peerId, displayName, connectionHash, files, imagesOnly, totalSize) {
        this._parseFileData(displayName, connectionHash, files, imagesOnly, totalSize);

        let descriptor, url, filenameDownload;
        if (files.length === 1) {
            descriptor = imagesOnly ? 'Image' : 'File';
        } else {
            descriptor = imagesOnly ? 'Images' : 'Files';
        }
        this.$receiveTitle.innerText = `${descriptor} Received`;

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

        this.$downloadBtn.innerText = "Download";
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
                this.$downloadBtn.innerText = "Download again";
            }
            Events.fire('notify-user', `${descriptor} downloaded successfully`);
            this.$downloadBtn.style.pointerEvents = "none";
            setTimeout(_ => this.$downloadBtn.style.pointerEvents = "unset", 2000);
        };

        document.title = files.length === 1
            ? 'File received - PairDrop'
            : `${files.length} Files received - PairDrop`;
        document.changeFavicon("images/favicon-96x96-notification.png");
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

        const displayName = $(peerId).ui._displayName();
        const connectionHash = $(peerId).ui._connectionHash;
        this._parseFileData(displayName, connectionHash, request.header, request.imagesOnly, request.totalSize);

        if (request.thumbnailDataUrl && request.thumbnailDataUrl.substring(0, 22) === "data:image/jpeg;base64") {
            let element = document.createElement('img');
            element.src = request.thumbnailDataUrl;
            this.$previewBox.appendChild(element)
        }

        this.$receiveTitle.innerText = `${request.imagesOnly ? 'Image' : 'File'} Transfer Request`

        document.title = `${request.imagesOnly ? 'Image' : 'File'} Transfer Requested - PairDrop`;
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
        super('pair-device-dialog');
        this.$inputRoomKeyChars = this.$el.querySelectorAll('#key-input-container>input');
        this.$submitBtn = this.$el.querySelector('button[type="submit"]');
        this.$roomKey = this.$el.querySelector('#room-key');
        this.$qrCode = this.$el.querySelector('#room-key-qr-code');
        this.$pairDeviceBtn = $('pair-device');
        this.$clearSecretsBtn = $('clear-pair-devices');
        this.$footerInstructionsPairedDevices = $('and-by-paired-devices');
        this.$createJoinForm = this.$el.querySelector('form');

        this.$createJoinForm.addEventListener('submit', e => this._onSubmit(e));
        this.$pairDeviceBtn.addEventListener('click', _ => this._pairDeviceInitiate());

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
        if (this.$el.querySelectorAll('#key-input-container>input:placeholder-shown').length > 0) {
            this.$submitBtn.setAttribute("disabled", "");
        } else {
            this.inputRoomKey = "";
            this.$inputRoomKeyChars.forEach(el => {
                this.inputRoomKey += el.value;
            })
            this.$submitBtn.removeAttribute("disabled");
            if (document.activeElement === this.$inputRoomKeyChars[5]) {
                this._pairDeviceJoin(this.inputRoomKey);
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
        this.$pairDeviceBtn.removeAttribute('hidden');
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
            width: 150,
            height: 150,
            padding: 0,
            background: "transparent",
            color: `rgb(var(--text-color))`,
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

    _onSubmit(e) {
        e.preventDefault();
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
            Events.fire('bg-resize');
        }).catch(_ => PersistentStorage.logBrowserNotCapable());
    }
}

class ClearDevicesDialog extends Dialog {
    constructor() {
        super('clear-devices-dialog');
        $('clear-pair-devices').addEventListener('click', _ => this._onClearPairDevices());
        let clearDevicesForm = this.$el.querySelector('form');
        clearDevicesForm.addEventListener('submit', e => this._onSubmit(e));
    }

    _onClearPairDevices() {
        this.show();
    }

    _onSubmit(e) {
        e.preventDefault();
        this._clearRoomSecrets();
    }

    _clearRoomSecrets() {
        Events.fire('clear-room-secrets');
        this.hide();
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

    _onRecipient(peerId, deviceName) {
        this.correspondingPeerId = peerId;
        this.$peerDisplayName.innerText = deviceName;
        this.show();

        const range = document.createRange();
        const sel = window.getSelection();

        this.$text.focus();
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
        this.$text.value = "";
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

        Events.on("keydown", e => this._onKeyDown(e));

        this.$displayNameNode = this.$el.querySelector('.display-name');
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
        this._setDocumentTitleMessages();
        if (this.$el.attributes["show"]) return;
        this._dequeueRequests();
    }

    _dequeueRequests() {
        if (!this._receiveTextQueue.length) return;
        let {text, peerId} = this._receiveTextQueue.shift();
        this._showReceiveTextDialog(text, peerId);
    }

    _showReceiveTextDialog(text, peerId) {
        this.$displayNameNode.innerText = $(peerId).ui._displayName();

        this.$text.innerText = text;
        this.$text.classList.remove('text-center');

        // Beautify text if text is short
        if (text.length < 2000) {
            // replace urls with actual links
            this.$text.innerHTML = this.$text.innerHTML.replace(/((https?:\/\/|www)[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\-._~:\/?#\[\]@!$&'()*+,;=]+)/g, url => {
                return `<a href="${url}" target="_blank">${url}</a>`;
            });

            if (!/\s/.test(text)) {
                this.$text.classList.add('text-center');
            }
        }

        this._setDocumentTitleMessages();

        document.changeFavicon("images/favicon-96x96-notification.png");
        this.show();
    }

    _setDocumentTitleMessages() {
        document.title = !this._receiveTextQueue.length
            ? 'Message Received - PairDrop'
            : `${this._receiveTextQueue.length + 1} Messages Received - PairDrop`;
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
        super('base64-paste-dialog');
        const urlParams = new URL(window.location).searchParams;
        const base64Text = urlParams.get('base64text');
        const base64Zip = urlParams.get('base64zip');
        const base64Hash = window.location.hash.substring(1);

        this.$pasteBtn = this.$el.querySelector('#base64-paste-btn');
        this.$fallbackTextarea = this.$el.querySelector('.textarea');

        if (base64Text) {
            this.show();
            if (base64Text === "paste") {
                // ?base64text=paste
                // base64 encoded string is ready to be pasted from clipboard
                this.preparePasting("text");
            } else if (base64Text === "hash") {
                // ?base64text=hash#BASE64ENCODED
                // base64 encoded string is url hash which is never sent to server and faster (recommended)
                this.processBase64Text(base64Hash)
                    .catch(_ => {
                        Events.fire('notify-user', 'Text content is incorrect.');
                        console.log("Text content incorrect.");
                    }).finally(_ => {
                        this.hide();
                    });
            } else {
                // ?base64text=BASE64ENCODED
                // base64 encoded string was part of url param (not recommended)
                this.processBase64Text(base64Text)
                    .catch(_ => {
                        Events.fire('notify-user', 'Text content is incorrect.');
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
                        Events.fire('notify-user', 'File content is incorrect.');
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
        this.$pasteBtn.innerText = "Processing...";
    }

    preparePasting(type) {
        if (navigator.clipboard.readText) {
            this.$pasteBtn.innerText = `Tap here to paste ${type}`;
            this._clickCallback = _ => this.processClipboard(type);
            this.$pasteBtn.addEventListener('click', _ => this._clickCallback());
        } else {
            console.log("`navigator.clipboard.readText()` is not available on your browser.\nOn Firefox you can set `dom.events.asyncClipboard.readText` to true under `about:config` for convenience.")
            this.$pasteBtn.setAttribute('hidden', '');
            this.$fallbackTextarea.setAttribute('placeholder', `Paste here to send ${type}`);
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
            if (type === "text") {
                await this.processBase64Text(base64);
            } else {
                await this.processBase64Zip(base64);
            }
        } catch(_) {
            Events.fire('notify-user', 'Clipboard content is incorrect.');
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
        window.history.replaceState({}, "Rewrite URL", '/');
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
        Events.on('files-transfer-request', e => this._requestNotification(e.detail.request, e.detail.peerId));
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
            if (/^((https?:\/\/|www)[abcdefghijklmnopqrstuvwxyz0123456789\-._~:\/?#\[\]@!$&'()*+,;=]+)$/.test(message.toLowerCase())) {
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

    _requestNotification(request, peerId) {
        if (document.visibilityState !== 'visible') {
            let imagesOnly = true;
            for(let i=0; i<request.header.length; i++) {
                if (request.header[i].mime.split('/')[0] !== 'image') {
                    imagesOnly = false;
                    break;
                }
            }
            let descriptor;
            if (request.header.length > 1) {
                descriptor = imagesOnly ? ' images' : ' files';
            } else {
                descriptor = imagesOnly ? ' image' : ' file';
            }
            let displayName = $(peerId).querySelector('.name').textContent
            let title = `${displayName} would like to transfer ${request.header.length} ${descriptor}`;
            const notification = this._notify(title, 'Click to show');
        }
    }

    _download(notification) {
        $('download-btn').click();
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
        if (!navigator.onLine) this._showOfflineMessage();
    }

    _showOfflineMessage() {
        Events.fire('notify-user', 'You are offline');
    }

    _showOnlineMessage() {
        Events.fire('notify-user', 'You are back online');
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
        const DBOpenRequest = window.indexedDB.open('pairdrop_store', 3);
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
                if (db.objectStoreNames.contains('share_target_files')) {
                    db.deleteObjectStore('share_target_files');
                }
                db.createObjectStore('share_target_files', {autoIncrement: true});
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

class Broadcast {
    constructor() {
        this.bc = new BroadcastChannel('pairdrop');
        this.bc.addEventListener('message', e => this._onMessage(e));
        Events.on('broadcast-send', e => this._broadcastMessage(e.detail));
    }

    _broadcastMessage(message) {
        this.bc.postMessage(message);
    }

    _onMessage(e) {
        console.log('Broadcast message received:', e.data)
        Events.fire(e.data.type, e.data.detail);
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
            const broadCast = new Broadcast();
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

// Background Circles
Events.on('load', () => {
    let c = document.createElement('canvas');
    let style = c.style;
    style.width = '100%';
    style.position = 'absolute';
    style.zIndex = -1;
    style.top = 0;
    style.left = 0;
    style.animation = "fade-in 800ms";
    let cCtx = c.getContext('2d');
    let x0, y0, w, h, dw, offset;

    function init() {
        let oldW = w;
        let oldH = h;
        let oldOffset = offset
        w = document.documentElement.clientWidth;
        h = document.documentElement.clientHeight;
        offset = $$('footer').offsetHeight - 33;
        if (h > 800) offset += 16;

        if (oldW === w && oldH === h && oldOffset === offset) return; // nothing has changed

        c.width = w;
        c.height = h;
        x0 = w / 2;
        y0 = h - offset;
        dw = Math.round(Math.max(w, h, 1000) / 13);

        if (document.body.contains(c)) {
            document.body.removeChild(c);
        }
        drawCircles(cCtx, dw);
        document.body.appendChild(c);
    }

    Events.on('bg-resize', _ => init());
    window.onresize = _ => Events.fire('bg-resize');

    function drawCircle(ctx, radius) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        let opacity = 0.3 * (1 - 1.2 * radius / Math.max(w, h));
        ctx.strokeStyle = `rgba(128, 128, 128, ${opacity})`;
        ctx.arc(x0, y0, radius, 0, 2 * Math.PI);
        ctx.stroke();
    }

    function drawCircles(ctx, frame) {
        for (let i = 0; i < 13; i++) {
            drawCircle(ctx, dw * i + frame + 33);
        }
    }

    init();
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
