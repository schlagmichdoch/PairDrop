class FooterUI {

    constructor() {
        this.$displayName = $('display-name');
        this.$discoveryWrapper = $$('footer .discovery-wrapper');

        // Show "Loading…"
        this.$displayName.setAttribute('placeholder', this.$displayName.dataset.placeholder);

        this.$displayName.addEventListener('keydown', e => this._onKeyDownDisplayName(e));
        this.$displayName.addEventListener('keyup', e => this._onKeyUpDisplayName(e));
        this.$displayName.addEventListener('blur', e => this._saveDisplayName(e.target.innerText));

        Events.on('display-name', e => this._onDisplayName(e.detail.displayName));
        Events.on('self-display-name-changed', e => this._insertDisplayName(e.detail));

        // Load saved display name on page load
        Events.on('ws-connected', _ => this._loadSavedDisplayName());

        Events.on('evaluate-footer-badges', _ => this._evaluateFooterBadges());
    }

    _evaluateFooterBadges() {
        if (this.$discoveryWrapper.querySelectorAll('div:last-of-type > span[hidden]').length < 2) {
            this.$discoveryWrapper.classList.remove('row');
            this.$discoveryWrapper.classList.add('column');
        }
        else {
            this.$discoveryWrapper.classList.remove('column');
            this.$discoveryWrapper.classList.add('row');
        }
        Events.fire('redraw-canvas');
        Events.fire('fade-in-ui');
    }

    _loadSavedDisplayName() {
        this._getSavedDisplayName()
            .then(displayName => {
                console.log("Retrieved edited display name:", displayName)
                if (displayName) {
                    Events.fire('self-display-name-changed', displayName);
                }
            });
    }

    _onDisplayName(displayName){
        // set display name
        this.$displayName.setAttribute('placeholder', displayName);
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
                .finally(() => {
                    Events.fire('self-display-name-changed', newDisplayName);
                    Events.fire('broadcast-send', {type: 'self-display-name-changed', detail: newDisplayName});
                });
        }
        else {
            PersistentStorage.delete('editedDisplayName')
                .catch(_ => {
                    console.log("This browser does not support IndexedDB. Use localStorage instead.")
                    localStorage.removeItem('editedDisplayName');
                })
                .finally(() => {
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
}

class BackgroundCanvas {
    constructor() {
        this.c = $$('canvas');
        this.cCtx = this.c.getContext('2d');
        this.$footer = $$('footer');

        // fade-in on load
        Events.on('fade-in-ui', _ => this._fadeIn());

        // redraw canvas
        Events.on('resize', _ => this.init());
        Events.on('redraw-canvas', _ => this.init());
        Events.on('translation-loaded', _ => this.init());
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