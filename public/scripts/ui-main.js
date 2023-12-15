// Selector shortcuts
const $ = query => document.getElementById(query);
const $$ = query => document.querySelector(query);

// Event listener shortcuts
class Events {
    static fire(type, detail = {}) {
        window.dispatchEvent(new CustomEvent(type, { detail: detail }));
    }

    static on(type, callback, options) {
        return window.addEventListener(type, callback, options);
    }

    static off(type, callback, options) {
        return window.removeEventListener(type, callback, options);
    }
}

// UIs needed on start
class ThemeUI {

    constructor() {
        this.prefersDarkTheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.prefersLightTheme = window.matchMedia('(prefers-color-scheme: light)').matches;

        this.$themeAutoBtn = document.getElementById('theme-auto');
        this.$themeLightBtn = document.getElementById('theme-light');
        this.$themeDarkBtn = document.getElementById('theme-dark');

        let currentTheme = this.getCurrentTheme();
        if (currentTheme === 'dark') {
            this.setModeToDark();
        } else if (currentTheme === 'light') {
            this.setModeToLight();
        }

        this.$themeAutoBtn.addEventListener('click', _ => this.onClickAuto());
        this.$themeLightBtn.addEventListener('click', _ => this.onClickLight());
        this.$themeDarkBtn.addEventListener('click', _ => this.onClickDark());
    }

    getCurrentTheme() {
        return localStorage.getItem('theme');
    }

    setCurrentTheme(theme) {
        localStorage.setItem('theme', theme);
    }

    onClickAuto() {
        if (this.getCurrentTheme()) {
            this.setModeToAuto();
        } else {
            this.setModeToDark();
        }
    }

    onClickLight() {
        if (this.getCurrentTheme() !== 'light') {
            this.setModeToLight();
        } else {
            this.setModeToAuto();
        }
    }

    onClickDark() {
        if (this.getCurrentTheme() !== 'dark') {
            this.setModeToDark();
        } else {
            this.setModeToLight();
        }
    }

    setModeToDark() {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');

        this.setCurrentTheme('dark');

        this.$themeAutoBtn.classList.remove("selected");
        this.$themeLightBtn.classList.remove("selected");
        this.$themeDarkBtn.classList.add("selected");
    }

    setModeToLight() {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');

        this.setCurrentTheme('light');

        this.$themeAutoBtn.classList.remove("selected");
        this.$themeLightBtn.classList.add("selected");
        this.$themeDarkBtn.classList.remove("selected");
    }

    setModeToAuto() {
        document.body.classList.remove('dark-theme');
        document.body.classList.remove('light-theme');
        if (this.prefersDarkTheme) {
            document.body.classList.add('dark-theme');
        }
        else if (this.prefersLightTheme) {
            document.body.classList.add('light-theme');
        }
        localStorage.removeItem('theme');

        this.$themeAutoBtn.classList.add("selected");
        this.$themeLightBtn.classList.remove("selected");
        this.$themeDarkBtn.classList.remove("selected");
    }
}

class HeaderUI {

    constructor() {
        this.$header = $$('header');
        this.$expandBtn = $('expand');
        Events.on("resize", _ => this.evaluateOverflowing());
        this.$expandBtn.addEventListener('click', _ => this.onExpandBtnClick());
    }

    async fadeIn() {
        this.$header.classList.remove('opacity-0');
    }

    async evaluateOverflowing() {
        // remove bracket icon before evaluating
        this.$expandBtn.setAttribute('hidden', true);
        // reset bracket icon rotation and header overflow
        this.$expandBtn.classList.add('flipped');
        this.$header.classList.remove('overflow-expanded');


        const rtlLocale = Localization.currentLocaleIsRtl();
        let icon;
        const $headerIconsShown = document.querySelectorAll('body > header:first-of-type > *:not([hidden])');

        for (let i= 1; i < $headerIconsShown.length; i++) {
            let isFurtherLeftThanLastIcon = $headerIconsShown[i].offsetLeft >= $headerIconsShown[i-1].offsetLeft;
            let isFurtherRightThanLastIcon = $headerIconsShown[i].offsetLeft <= $headerIconsShown[i-1].offsetLeft;
            if ((!rtlLocale && isFurtherLeftThanLastIcon) || (rtlLocale && isFurtherRightThanLastIcon)) {
                // we have found the first icon on second row. Use previous icon.
                icon = $headerIconsShown[i-1];
                break;
            }
        }
        if (icon) {
            // overflowing
            // add overflowing-hidden class
            this.$header.classList.add('overflow-hidden');
            // add expand btn 2 before icon
            this.$expandBtn.removeAttribute('hidden');
            icon.before(this.$expandBtn);
        }
        else {
            // no overflowing
            // remove overflowing-hidden class
            this.$header.classList.remove('overflow-hidden');
        }
    }

    onExpandBtnClick() {
        // toggle overflowing-hidden class and flip expand btn icon
        if (this.$header.classList.contains('overflow-hidden')) {
            this.$header.classList.remove('overflow-hidden');
            this.$header.classList.add('overflow-expanded');
            this.$expandBtn.classList.remove('flipped');
        }
        else {
            this.$header.classList.add('overflow-hidden');
            this.$header.classList.remove('overflow-expanded');
            this.$expandBtn.classList.add('flipped');
        }
        Events.fire('header-changed');
    }
}

class CenterUI {

    constructor() {
        this.$center = $$('#center');
        this.$xNoPeers = $$('x-no-peers');
    }

    async fadeIn() {
        this.$center.classList.remove('opacity-0');

        // Prevent flickering on load
        setTimeout(() => {
            this.$xNoPeers.classList.remove('no-animation-on-load');
        }, 600);
    }
}

class FooterUI {

    constructor() {
        this.$footer = $$('footer');
        this.$displayName = $('display-name');
        this.$discoveryWrapper = $$('footer .discovery-wrapper');

        this.$displayName.addEventListener('keydown', e => this._onKeyDownDisplayName(e));
        this.$displayName.addEventListener('keyup', e => this._onKeyUpDisplayName(e));
        this.$displayName.addEventListener('blur', e => this._saveDisplayName(e.target.innerText));

        Events.on('display-name', e => this._onDisplayName(e.detail.displayName));
        Events.on('self-display-name-changed', e => this._insertDisplayName(e.detail));

        // Load saved display name on page load
        Events.on('ws-connected', _ => this._loadSavedDisplayName());

        Events.on('evaluate-footer-badges', _ => this._evaluateFooterBadges());
    }

    async showLoading() {
        this.$displayName.setAttribute('placeholder', this.$displayName.dataset.placeholder);
    }

    async fadeIn() {
        this.$footer.classList.remove('opacity-0');
    }

    async _evaluateFooterBadges() {
        if (this.$discoveryWrapper.querySelectorAll('div:last-of-type > span[hidden]').length < 2) {
            this.$discoveryWrapper.classList.remove('row');
            this.$discoveryWrapper.classList.add('column');
        }
        else {
            this.$discoveryWrapper.classList.remove('column');
            this.$discoveryWrapper.classList.add('row');
        }
        Events.fire('redraw-canvas');
    }

    async _loadSavedDisplayName() {
        const displayName = await this._getSavedDisplayName()

        if (!displayName) return;

        console.log("Retrieved edited display name:", displayName)
        Events.fire('self-display-name-changed', displayName);
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
            PersistentStorage.set('edited_display_name', newDisplayName)
                .then(_ => {
                    Events.fire('notify-user', Localization.getTranslation("notifications.display-name-changed-permanently"));
                })
                .catch(_ => {
                    console.log("This browser does not support IndexedDB. Use localStorage instead.");
                    localStorage.setItem('edited_display_name', newDisplayName);
                    Events.fire('notify-user', Localization.getTranslation("notifications.display-name-changed-temporarily"));
                })
                .finally(() => {
                    Events.fire('self-display-name-changed', newDisplayName);
                    Events.fire('broadcast-send', {type: 'self-display-name-changed', detail: newDisplayName});
                });
        }
        else {
            PersistentStorage.delete('edited_display_name')
                .catch(_ => {
                    console.log("This browser does not support IndexedDB. Use localStorage instead.")
                    localStorage.removeItem('edited_display_name');
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
            PersistentStorage.get('edited_display_name')
                .then(displayName => {
                    if (!displayName) displayName = "";
                    resolve(displayName);
                })
                .catch(_ => {
                    let displayName = localStorage.getItem('edited_display_name');
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

        // redraw canvas
        Events.on('resize', _ => this.init());
        Events.on('redraw-canvas', _ => this.init());
        Events.on('translation-loaded', _ => this.init());

        // ShareMode
        Events.on('share-mode-changed', e => this.onShareModeChanged(e.detail.active));
    }

    async fadeIn() {
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
        this.baseColor = '165, 165, 165';
        this.baseOpacity = 0.3;

        this.drawCircles(this.cCtx);
    }

    onShareModeChanged(active) {
        this.baseColor = active ? '165, 165, 255' : '165, 165, 165';
        this.baseOpacity = active ? 0.5 : 0.3;
        this.drawCircles(this.cCtx);
    }


    drawCircle(ctx, radius) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        let opacity = Math.max(0, this.baseOpacity * (1 - 1.2 * radius / Math.max(this.w, this.h)));
        ctx.strokeStyle = `rgba(${this.baseColor}, ${opacity})`;
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