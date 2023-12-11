class Localization {
    constructor() {
        Localization.defaultLocale = "en";
        Localization.supportedLocales = ["ar", "de", "en", "es", "fr", "id", "it", "ja", "nb", "nl", "ro", "ru", "tr", "zh-CN","pt-BR"];
        Localization.supportedLocalesRtl = ["ar"];

        Localization.translations = {};
        Localization.defaultTranslations = {};

        Localization.systemLocale = Localization.getSupportedOrDefault(navigator.languages);

        let storedLanguageCode = localStorage.getItem('language_code');

        Localization.initialLocale = storedLanguageCode && Localization.isSupported(storedLanguageCode)
            ? storedLanguageCode
            : Localization.systemLocale;
    }

    static isSupported(locale) {
        return Localization.supportedLocales.indexOf(locale) > -1;
    }

    static isRtlLanguage(locale) {
        return Localization.supportedLocalesRtl.indexOf(locale) > -1;
    }

    static isCurrentLocaleRtl() {
        return Localization.isRtlLanguage(Localization.locale);
    }

    static getSupportedOrDefault(locales) {
        let localesGeneric = locales
            .map(locale => locale.split("-")[0])
            .filter(locale => locales.indexOf(locale) === -1);

        return locales.find(Localization.isSupported)
            || localesGeneric.find(Localization.isSupported)
            || Localization.defaultLocale;
    }

    async setInitialTranslation() {
        await Localization.setTranslation(Localization.initialLocale)
    }

    static async setTranslation(locale) {
        if (!locale) locale = Localization.systemLocale;

        await Localization.setLocale(locale)
        await Localization.translatePage();

        const htmlRootNode = document.querySelector('html');

        if (Localization.isRtlLanguage(locale)) {
            htmlRootNode.setAttribute('dir', 'rtl');
        }
        else {
            htmlRootNode.removeAttribute('dir');
        }

        htmlRootNode.setAttribute('lang', locale);


        console.log("Page successfully translated",
            `System language: ${Localization.systemLocale}`,
            `Selected language: ${locale}`
        );

        Events.fire("translation-loaded");
    }

    static async setLocale(newLocale) {
        if (newLocale === Localization.locale) return false;

        Localization.defaultTranslations = await Localization.fetchTranslationsFor(Localization.defaultLocale);

        const newTranslations = await Localization.fetchTranslationsFor(newLocale);

        if(!newTranslations) return false;

        Localization.locale = newLocale;
        Localization.translations = newTranslations;
    }

    static getLocale() {
        return Localization.locale;
    }

    static isSystemLocale() {
        return !localStorage.getItem('language_code');
    }

    static async fetchTranslationsFor(newLocale) {
        const response = await fetch(`lang/${newLocale}.json`, {
            method: 'GET',
            credentials: 'include',
            mode: 'no-cors',
        });

        if (response.redirected === true || response.status !== 200) return false;

        return await response.json();
    }

    static async translatePage() {
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
            }
            else {
                element.setAttribute(attr, Localization.getTranslation(key, attr));
            }
        }
    }

    static getTranslation(key, attr = null, data = {}, useDefault = false) {
        const keys = key.split(".");

        let translationCandidates = useDefault
            ? Localization.defaultTranslations
            : Localization.translations;

        let translation;

        try {
            for (let i = 0; i < keys.length - 1; i++) {
                translationCandidates = translationCandidates[keys[i]]
            }

            let lastKey = keys[keys.length - 1];

            if (attr) lastKey += "_" + attr;

            translation = translationCandidates[lastKey];

            for (let j in data) {
                if (translation.includes(`{{${j}}}`)) {
                    translation = translation.replace(`{{${j}}}`, data[j]);
                } else {
                    console.warn(`Translation for your language ${Localization.locale.toUpperCase()} misses at least one data placeholder:`, key, attr, data);
                    Localization.logHelpCallKey(key);
                    Localization.logHelpCall();
                    translation = "";
                    break;
                }
            }
        } catch (e) {
            console.error(e);
            translation = "";
        }

        if (!translation) {
            if (!useDefault) {
                console.warn(`Missing translation entry for your language ${Localization.locale.toUpperCase()}. Using ${Localization.defaultLocale.toUpperCase()} instead.`, key, attr);
                Localization.logHelpCallKey(key);
                Localization.logHelpCall();
                translation = this.getTranslation(key, attr, data, true);
            }
            else {
                console.warn("Missing translation in default language:", key, attr);
                Localization.logHelpCall();
            }
        }

        return Localization.escapeHTML(translation);
    }

    static logHelpCall() {
        console.log("Help translating PairDrop: https://hosted.weblate.org/engage/pairdrop/");
    }

    static logHelpCallKey(key) {
        console.warn(`Translate this string here: https://hosted.weblate.org/browse/pairdrop/pairdrop-spa/${Localization.locale.toLowerCase()}/?q=${key}`);
    }

    static escapeHTML(unsafeText) {
        let div = document.createElement('div');
        div.innerText = unsafeText;
        return div.innerHTML;
    }
}
