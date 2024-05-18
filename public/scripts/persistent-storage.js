class PersistentStorage {
    constructor() {
        if (!('indexedDB' in window)) {
            PersistentStorage.logBrowserNotCapable();
            return;
        }
        const DBOpenRequest = window.indexedDB.open('pairdrop_store', 6);
        DBOpenRequest.onerror = e => {
            PersistentStorage.logBrowserNotCapable();
            Logger.error('Error initializing database:', e);
        };
        DBOpenRequest.onsuccess = _ => {
            Logger.debug('Database initialised.');
        };
        DBOpenRequest.onupgradeneeded = async e => {
            const db = e.target.result;
            const txn = e.target.transaction;

            db.onerror = e => Logger.error('Error loading database:', e);

            Logger.debug(`Upgrading IndexedDB database from version ${e.oldVersion} to version ${e.newVersion}`);

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
            if (e.oldVersion <= 4) {
                // migrate to v5
                const editedDisplayNameOld = await PersistentStorage.get('editedDisplayName');
                if (editedDisplayNameOld) {
                    await PersistentStorage.set('edited_display_name', editedDisplayNameOld);
                    await PersistentStorage.delete('editedDisplayName');
                }
            }
            if (e.oldVersion <= 5) {
                // migrate to v6
                let roomSecretsObjectStore5 = txn.objectStore('room_secrets');
                roomSecretsObjectStore5.createIndex('ws_domain', 'ws_domain');
                // add current ws_domain to existing peer secret entries once the config has loaded
                Events.on('config-loaded', _ => PersistentStorage.addCurrentWsDomainToAllRoomSecrets(), { once: true });
            }
        }
    }

    static getCurrentWsDomain() {
        return window._config && window._config.signalingServer
            ? window._config.signalingServer
            : location.host + location.pathname;
    }

    static async addCurrentWsDomainToAllRoomSecrets() {
        const wsServerDomain = this.getCurrentWsDomain();

        const roomSecrets = await PersistentStorage.getAllRoomSecrets(false);
        for (let i = 0; i < roomSecrets.length; i++) {
            await PersistentStorage.updateRoomSecret(roomSecrets[i], null, null, null, null, wsServerDomain);
        }
    }

    static logBrowserNotCapable() {
        Logger.log("This browser does not support IndexedDB. Paired devices will be gone after the browser is closed.");
    }

    static set(key, value) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = e => {
                const db = e.target.result;
                const transaction = db.transaction('keyval', 'readwrite');
                const objectStore = transaction.objectStore('keyval');
                const objectStoreRequest = objectStore.put(value, key);
                objectStoreRequest.onsuccess = _ => {
                    Logger.debug(`Request successful. Added key-pair: ${key} - ${value}`);
                    resolve(value);
                };
            }
            DBOpenRequest.onerror = e => {
                reject(e);
            }
        })
    }

    static get(key) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = e => {
                const db = e.target.result;
                const transaction = db.transaction('keyval', 'readonly');
                const objectStore = transaction.objectStore('keyval');
                const objectStoreRequest = objectStore.get(key);
                objectStoreRequest.onsuccess = _ => {
                    Logger.debug(`Request successful. Retrieved key-pair: ${key} - ${objectStoreRequest.result}`);
                    resolve(objectStoreRequest.result);
                }
            }
            DBOpenRequest.onerror = e => {
                reject(e);
            }
        });
    }

    static delete(key) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = e => {
                const db = e.target.result;
                const transaction = db.transaction('keyval', 'readwrite');
                const objectStore = transaction.objectStore('keyval');
                const objectStoreRequest = objectStore.delete(key);
                objectStoreRequest.onsuccess = _ => {
                    Logger.debug(`Request successful. Deleted key: ${key}`);
                    resolve();
                };
            }
            DBOpenRequest.onerror = e => {
                reject(e);
            }
        })
    }

    static addRoomSecret(roomSecret, displayName, deviceName) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = e => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readwrite');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequest = objectStore.add({
                    'secret': roomSecret,
                    'display_name': displayName,
                    'device_name': deviceName,
                    'auto_accept': false,
                    'ws_domain': PersistentStorage.getCurrentWsDomain()
                });
                objectStoreRequest.onsuccess = e => {
                    Logger.debug(`Request successful. RoomSecret added: ${e.target.result}`);
                    resolve();
                }
            }
            DBOpenRequest.onerror = e => {
                reject(e);
            }
        })
    }

    static async getAllRoomSecretsCount(currentWsDomainOnly = true) {
        return (await PersistentStorage.getAllRoomSecrets(currentWsDomainOnly)).length;
    }

    static async getAllRoomSecrets(currentWsDomainOnly = true) {
        let secrets = [];
        try {
            const roomSecrets = await this.getAllRoomSecretEntries(currentWsDomainOnly);

            secrets = roomSecrets.map(roomSecret => roomSecret.secret);

            Logger.debug(`Request successful. Retrieved ${secrets.length} room_secrets`);
        }
        catch (e) {
            console.debug(e)
            this.logBrowserNotCapable();
        }

        return secrets;
    }

    static getAllRoomSecretEntries(currentWsDomainOnly = true) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = (e) => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readonly');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequest = objectStore.getAll();
                objectStoreRequest.onsuccess = e => {
                    let roomSecrets = e.target.result;
                    let roomSecretEntries = [];

                    for (let i = 0; i < roomSecrets.length; i++) {
                        const currentWsDomainDiffers = roomSecrets[i].ws_domain !== PersistentStorage.getCurrentWsDomain();

                        // if the saved ws domain differs from the current ws domain and only peers for the current ws domain should be returned -> skip this entry
                        if (currentWsDomainOnly && currentWsDomainDiffers) continue;

                        roomSecretEntries.push(roomSecrets[i]);
                    }

                    resolve(roomSecretEntries);
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
            DBOpenRequest.onsuccess = e => {
                const db = e.target.result;
                const transaction = db.transaction('room_secrets', 'readonly');
                const objectStore = transaction.objectStore('room_secrets');
                const objectStoreRequestKey = objectStore.index("secret").getKey(roomSecret);
                objectStoreRequestKey.onsuccess = e => {
                    const key = e.target.result;
                    if (!key) {
                        Logger.debug(`Nothing to retrieve. Entry for room_secret not existing: ${roomSecret}`);
                        resolve();
                        return;
                    }
                    const objectStoreRequestRetrieval = objectStore.get(key);
                    objectStoreRequestRetrieval.onsuccess = e => {
                        Logger.debug(`Request successful. Retrieved entry for room_secret: ${key}`);
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
                        Logger.debug(`Nothing to delete. room_secret not existing: ${roomSecret}`);
                        resolve();
                        return;
                    }
                    const key = e.target.result;
                    const objectStoreRequestDeletion = objectStore.delete(key);
                    objectStoreRequestDeletion.onsuccess = _ => {
                        Logger.debug(`Request successful. Deleted room_secret: ${key}`);
                        resolve(roomSecret);
                    }
                    objectStoreRequestDeletion.onerror = e => {
                        reject(e);
                    }
                };
            }
            DBOpenRequest.onerror = e => {
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
                    Logger.debug('Request successful. All room_secrets cleared');
                    resolve();
                };
            }
            DBOpenRequest.onerror = e => {
                reject(e);
            }
        })
    }

    static updateRoomSecretDisplayName(roomSecret, displayName) {
        return this.updateRoomSecret(roomSecret, null, displayName, null);
    }

    static updateRoomSecretAutoAccept(roomSecret, autoAccept) {
        return this.updateRoomSecret(roomSecret, null, null, null, autoAccept);
    }

    static updateRoomSecret(roomSecret, updatedRoomSecret = null, updatedDisplayName = null, updatedDeviceName = null, updatedAutoAccept = null, wsDomain = null) {
        return new Promise((resolve, reject) => {
            const DBOpenRequest = window.indexedDB.open('pairdrop_store');
            DBOpenRequest.onsuccess = e => {
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
                            'secret': updatedRoomSecret !== null ? updatedRoomSecret : roomSecretEntry.entry.secret,
                            'display_name': updatedDisplayName !== null ? updatedDisplayName : roomSecretEntry.entry.display_name,
                            'device_name': updatedDeviceName !== null ? updatedDeviceName : roomSecretEntry.entry.device_name,
                            'auto_accept': updatedAutoAccept !== null ? updatedAutoAccept : roomSecretEntry.entry.auto_accept,
                            'ws_domain': wsDomain !== null ? wsDomain : roomSecretEntry.entry.ws_domain
                        };

                        const objectStoreRequestUpdate = objectStore.put(updatedRoomSecretEntry, roomSecretEntry.key);

                        objectStoreRequestUpdate.onsuccess = e => {
                            Logger.debug(`Request successful. Updated room_secret: ${roomSecretEntry.key}`);
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