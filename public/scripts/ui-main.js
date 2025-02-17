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
        this.$displayName.addEventListener('focus', e => this._onFocusDisplayName(e));
        this.$displayName.addEventListener('blur', e => this._onBlurDisplayName(e));

        Events.on('display-name', e => this._onDisplayName(e.detail.displayName));
        Events.on('self-display-name-changed', e => this._insertDisplayName(e.detail));
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
        const displayNameSaved = await this._getSavedDisplayName()

        if (!displayNameSaved) return;

        console.log("Retrieved edited display name:", displayNameSaved)
        Events.fire('self-display-name-changed', displayNameSaved);
    }

    async _onDisplayName(displayNameServer){
        // load saved displayname first to prevent flickering
        await this._loadSavedDisplayName();

        // set original display name as placeholder
        this.$displayName.setAttribute('placeholder', displayNameServer);
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

    _onFocusDisplayName(e) {
        if (!e.target.innerText) {
            // Fix z-position of cursor when div is completely empty (Firefox only)
            e.target.innerText = "\n";

            // On Chromium based browsers the cursor position is lost when adding sth. to the focused node. This adds it back.
            let sel = window.getSelection();
            sel.collapse(e.target.lastChild);
        }
    }

    async _onBlurDisplayName(e) {
        // fix for Firefox inserting a linebreak into div on edit which prevents the placeholder from showing automatically when it is empty
        if (/^(\n|\r|\r\n)$/.test(e.target.innerText)) {
            e.target.innerText = '';
        }

        // Remove selection from text
        window.getSelection().removeAllRanges();

        await this._saveDisplayName(e.target.innerText)
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
        this.$canvas = $$('canvas');
        this.$footer = $$('footer');

        this.initAnimation();
    }

    async fadeIn() {
        this.$canvas.classList.remove('opacity-0');
    }

    initAnimation() {
        this.baseColorNormal = '168 168 168';
        this.baseColorShareMode = '168 168 255';
        this.baseOpacityNormal = 0.3;
        this.baseOpacityShareMode = 0.8;
        this.speed = 0.5;
        this.fps = 60;

        // if browser supports OffscreenCanvas
        //      -> put canvas drawing into serviceworker to unblock main thread
        // otherwise
        //      -> use main thread
        let {init, startAnimation, switchAnimation, onShareModeChange} =
            this.$canvas.transferControlToOffscreen
                ? this.initAnimationOffscreen()
                : this.initAnimationOnscreen();

        init();
        startAnimation();

        // redraw canvas
        Events.on('resize', _ => init());
        Events.on('redraw-canvas', _ => init());
        Events.on('translation-loaded', _ => init());

        // ShareMode
        Events.on('share-mode-changed', e => onShareModeChange(e.detail.active));

        // Start and stop animation
        Events.on('background-animation', e => switchAnimation(e.detail.animate))
        Events.on('offline', _ => switchAnimation(false));
        Events.on('online', _ => switchAnimation(true));
    }

    initAnimationOnscreen() {
        let $canvas = this.$canvas;
        let $footer = this.$footer;

        let baseColorNormal = this.baseColorNormal;
        let baseColorShareMode = this.baseColorShareMode;
        let baseOpacityNormal = this.baseOpacityNormal;
        let baseOpacityShareMode = this.baseOpacityShareMode;
        let speed = this.speed;
        let fps = this.fps;

        let c;
        let cCtx;

        let x0, y0, w, h, dw, offset;

        let startTime;
        let animate = true;
        let currentFrame = 0;
        let lastFrame;
        let baseColor;
        let baseOpacity;

        function createCanvas() {
            c = $canvas;
            cCtx = c.getContext('2d');

            lastFrame = fps / speed - 1;
            baseColor = baseColorNormal;
            baseOpacity = baseOpacityNormal;
        }

        function init() {
            initCanvas($footer.offsetHeight, document.documentElement.clientWidth, document.documentElement.clientHeight);
        }

        function initCanvas(footerOffsetHeight, clientWidth, clientHeight) {
            let oldW = w;
            let oldH = h;
            let oldOffset = offset;
            w = clientWidth;
            h = clientHeight;
            offset = footerOffsetHeight - 28;

            if (oldW === w && oldH === h && oldOffset === offset) return; // nothing has changed

            c.width = w;
            c.height = h;
            x0 = w / 2;
            y0 = h - offset;
            dw = Math.round(Math.min(Math.max(0.6 * w, h)) / 10);

            drawFrame(currentFrame);
        }

        function startAnimation() {
            startTime = Date.now();
            animateBg();
        }

        function switchAnimation(state) {
            if (!animate && state) {
                // animation starts again. Set startTime to specific value to prevent frame jump
                startTime = Date.now() - 1000 * currentFrame / fps;
            }
            animate = state;
            requestAnimationFrame(animateBg);
        }

        function onShareModeChange(active) {
            baseColor = active ? baseColorShareMode : baseColorNormal;
            baseOpacity = active ? baseOpacityShareMode : baseOpacityNormal;
            drawFrame(currentFrame);
        }

        function drawCircle(ctx, radius) {
            ctx.lineWidth = 2;

            let opacity = Math.max(0, baseOpacity * (1 - 1.2 * radius / Math.max(w, h)));
            if (radius > dw * 7) {
                opacity *= (8 * dw - radius) / dw
            }

            if (ctx.setStrokeColor) {
                // older blink/webkit browsers do not understand opacity in strokeStyle. Use deprecated setStrokeColor
                // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeStyle#webkitblink-specific_note
                ctx.setStrokeColor("grey", opacity);
            }
            else {
                ctx.strokeStyle = `rgb(${baseColor} / ${opacity})`;
            }
            ctx.beginPath();
            ctx.arc(x0, y0, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }

        function drawCircles(ctx, frame) {
            ctx.clearRect(0, 0, w, h);
            for (let i = 7; i >= 0; i--) {
                drawCircle(ctx, dw * i + speed * dw * frame / fps + 33);
            }
        }

        function drawFrame(frame) {
            cCtx.clearRect(0, 0, w, h);
            drawCircles(cCtx, frame);
        }

        function animateBg() {
            let now = Date.now();

            if (!animate && currentFrame === lastFrame) {
                // Animation stopped and cycle finished -> stop drawing frames
                return;
            }

            let timeSinceLastFullCycle = (now - startTime) % (1000 / speed);
            let nextFrame = Math.trunc(fps * timeSinceLastFullCycle / 1000);

            // Only draw frame if it differs from current frame
            if (nextFrame !== currentFrame) {
                drawFrame(nextFrame);
                currentFrame = nextFrame;
            }

            requestAnimationFrame(animateBg);
        }

        createCanvas();

        return {init, startAnimation, switchAnimation, onShareModeChange};
    }

    initAnimationOffscreen() {
        console.log("Use OffscreenCanvas to draw background animation.")

        let baseColorNormal = this.baseColorNormal;
        let baseColorShareMode = this.baseColorShareMode;
        let baseOpacityNormal = this.baseOpacityNormal;
        let baseOpacityShareMode = this.baseOpacityShareMode;
        let speed = this.speed;
        let fps = this.fps;
        let $canvas = this.$canvas;
        let $footer = this.$footer;

        const offscreen = $canvas.transferControlToOffscreen();
        const worker = new Worker("scripts/worker/canvas-worker.js");

        function createCanvas() {
            worker.postMessage({
                type: "createCanvas",
                canvas: offscreen,
                baseColorNormal: baseColorNormal,
                baseColorShareMode: baseColorShareMode,
                baseOpacityNormal: baseOpacityNormal,
                baseOpacityShareMode: baseOpacityShareMode,
                speed: speed,
                fps: fps
            }, [offscreen]);
        }

        function init() {
            worker.postMessage({
                type: "initCanvas",
                footerOffsetHeight: $footer.offsetHeight,
                clientWidth: document.documentElement.clientWidth,
                clientHeight: document.documentElement.clientHeight
            });
        }

        function startAnimation() {
            worker.postMessage({ type: "startAnimation" });
        }

        function onShareModeChange(active) {
            worker.postMessage({ type: "onShareModeChange", active: active });
        }

        function switchAnimation(animate) {
            worker.postMessage({ type: "switchAnimation", animate: animate });
        }

        createCanvas();

        return {init, startAnimation, switchAnimation, onShareModeChange};
    }
}