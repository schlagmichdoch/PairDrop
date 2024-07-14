class BrowserTabsConnector {
    constructor() {
        this.bc = new BroadcastChannel('pairdrop');
        this.bc.addEventListener('message', e => this._onMessage(e));
        Events.on('broadcast-send', e => this._broadcastSend(e.detail.type, e.detail.data));
        Events.on('broadcast-self-display-name-changed', e => this._onBroadcastSelfDisplayNameChanged(e.detail.displayName));
    }

    _broadcastSend(type, data) {
        this.bc.postMessage({ type, data });
    }

    _onBroadcastSelfDisplayNameChanged(displayName) {
        this._broadcastSend('self-display-name-changed', { displayName: displayName });
    }

    _onMessage(e) {
        const type = e.data.type;
        const data = e.data.data;

        Logger.debug('Broadcast:', type, data);

        switch (type) {
            case 'self-display-name-changed':
                Events.fire('self-display-name-changed', data.displayName);
                break;
        }
    }

    static peerIsSameBrowser(peerId) {
        let peerIdsBrowser = JSON.parse(localStorage.getItem('peer_ids_browser'));
        return peerIdsBrowser
            ? peerIdsBrowser.indexOf(peerId) !== -1
            : false;
    }

    static isOnlyTab() {
        let peerIdsBrowser = JSON.parse(localStorage.getItem('peer_ids_browser'));
        return peerIdsBrowser.length <= 1;
    }

    static async addPeerIdToLocalStorage() {
        const peerId = sessionStorage.getItem('peer_id');
        if (!peerId) return false;

        let peerIdsBrowser = [];
        let peerIdsBrowserOld = JSON.parse(localStorage.getItem('peer_ids_browser'));

        if (peerIdsBrowserOld) peerIdsBrowser.push(...peerIdsBrowserOld);
        peerIdsBrowser.push(peerId);
        peerIdsBrowser = peerIdsBrowser.filter(onlyUnique);
        localStorage.setItem('peer_ids_browser', JSON.stringify(peerIdsBrowser));

        return peerIdsBrowser;
    }

    static async removePeerIdFromLocalStorage(peerId) {
        let peerIdsBrowser = JSON.parse(localStorage.getItem('peer_ids_browser'));
        const index = peerIdsBrowser.indexOf(peerId);
        peerIdsBrowser.splice(index, 1);
        localStorage.setItem('peer_ids_browser', JSON.stringify(peerIdsBrowser));
        return peerId;
    }


    static async removeOtherPeerIdsFromLocalStorage() {
        const peerId = sessionStorage.getItem('peer_id');
        if (!peerId) return false;

        let peerIdsBrowser = [peerId];
        localStorage.setItem('peer_ids_browser', JSON.stringify(peerIdsBrowser));
        return peerIdsBrowser;
    }
}