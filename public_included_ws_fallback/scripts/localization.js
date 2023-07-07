class Localization {
    constructor() {
        Localization.defaultLocale = "en";
        Localization.supportedLocales = ["en"];
        Localization.translations = {};
        Localization.defaultTranslations = {};

        const initialLocale = Localization.supportedOrDefault(navigator.languages);

        Localization.setLocale(initialLocale)
            .then(_ => {
                Localization.translatePage();
            })
    }

    static isSupported(locale) {
        return Localization.supportedLocales.indexOf(locale) > -1;
    }

    static supportedOrDefault(locales) {
        return locales.find(Localization.isSupported) || Localization.defaultLocale;
    }

    static async setLocale(newLocale) {
        if (newLocale === Localization.locale) return false;

        const isFirstTranslation = !Localization.locale

        Localization.defaultTranslations = await Localization.fetchTranslationsFor(Localization.defaultLocale);

        const newTranslations = await Localization.fetchTranslationsFor(newLocale);

        if(!newTranslations) return false;

        Localization.locale = newLocale;
        Localization.translations = newTranslations;

        if (isFirstTranslation) {
            Events.fire("translation-loaded");
        }
    }

    static async fetchTranslationsFor(newLocale) {
        const response = await fetch(`lang/${newLocale}.json`)

        if (response.redirected === true || response.status !== 200) return false;

        return await response.json();
    }

    static translatePage() {
        document
            .querySelectorAll("[data-i18n-key]")
            .forEach(element => Localization.translateElement(element));
    }

    static async translateElement(element) {
        const key = element.getAttribute("data-i18n-key");
        const attrs = element.getAttribute("data-i18n-attrs").split(" ");

        for (let i in attrs) {
            let attr = attrs[i];
            if (attr === "text") {
                element.innerText = Localization.getTranslation(key);
            } else {
                element.attr = Localization.getTranslation(key, attr);
            }
        }

    }

    static getTranslation(key, attr, data, useDefault=false) {
        const keys = key.split(".");

        let translationCandidates = useDefault
            ? Localization.defaultTranslations
            : Localization.translations;

        for (let i=0; i<keys.length-1; i++) {
            translationCandidates = translationCandidates[keys[i]]
        }

        let lastKey = keys[keys.length-1];

        if (attr) lastKey += "_" + attr;

        let translation = translationCandidates[lastKey];

        for (let j in data) {
            translation = translation.replace(`{{${j}}}`, data[j]);
        }

        if (!translation) {
            if (!useDefault) {
                translation = this.getTranslation(key, attr, data, true);
                console.warn(`Missing translation entry for your language ${Localization.locale.toUpperCase()}. Using ${Localization.defaultLocale.toUpperCase()} instead.`, key, attr);
                console.warn("Help translating PairDrop: https://hosted.weblate.org/projects/pairdrop/pairdrop-spa/");
            } else {
                console.warn("Missing translation in default language:", key, attr);
            }
        }

        return Localization.escapeHTML(translation);
    }

    static escapeHTML(unsafeText) {
        let div = document.createElement('div');
        div.innerText = unsafeText;
        return div.innerHTML;
    }
}
