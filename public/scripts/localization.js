class Localization {
    constructor() {
        Localization.$htmlRoot = document.querySelector('html');

        Localization.localeDefault = "en";
        Localization.localesSupported = ["ar", "ca", "de", "en", "es", "fr", "id", "it", "ja", "kn", "nb", "nl", "pt-BR", "ro", "ru", "tr", "zh-CN"];
        Localization.localesRtl = ["ar"];

        Localization.translations = {};
        Localization.translationsDefaultLocale = {};

        Localization.localeSystem = Localization.getSupportedOrDefaultLocales(navigator.languages);

        let storedLanguageCode = localStorage.getItem('language_code');

        Localization.localeInitial = storedLanguageCode && Localization.localeIsSupported(storedLanguageCode)
            ? storedLanguageCode
            : Localization.localeSystem;
    }

    static localeIsSupported(locale) {
        return Localization.localesSupported.indexOf(locale) > -1;
    }

    static localeIsRtl(locale) {
        return Localization.localesRtl.indexOf(locale) > -1;
    }

    static currentLocaleIsRtl() {
        return Localization.localeIsRtl(Localization.locale);
    }

    static currentLocaleIsDefault() {
        return Localization.locale === Localization.localeDefault
    }

    static getSupportedOrDefaultLocales(locales) {
        // get generic locales not included in locales
        // ["en-us", "de-CH", "fr"] --> ["en", "de"]
        let localesGeneric = locales
            .map(locale => locale.split("-")[0])
            .filter(locale => locales.indexOf(locale) === -1);

        // If there is no perfect match for browser locales, try generic locales first before resorting to the default locale
        return locales.find(Localization.localeIsSupported)
            || localesGeneric.find(Localization.localeIsSupported)
            || Localization.localeDefault;
    }

    async setInitialTranslation() {
        await Localization.setTranslation(Localization.localeInitial)
    }

    static async setTranslation(locale) {
        if (!locale) locale = Localization.localeSystem;

        await Localization.setLocale(locale)
        await Localization.translatePage();

        if (Localization.localeIsRtl(locale)) {
            Localization.$htmlRoot.setAttribute('dir', 'rtl');
        }
        else {
            Localization.$htmlRoot.removeAttribute('dir');
        }

        Localization.$htmlRoot.setAttribute('lang', locale);


        Logger.debug("Page successfully translated",
            `System language: ${Localization.localeSystem}`,
            `Selected language: ${locale}`
        );

        Events.fire("translation-loaded");
    }

    static async setLocale(newLocale) {
        if (newLocale === Localization.locale) return false;

        Localization.translationsDefaultLocale = await Localization.fetchTranslationsFor(Localization.localeDefault);

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

        attrs.forEach(attr => {
            if (attr === "text") {
                element.innerText = Localization.getTranslation(key);
            }
            else {
                element.setAttribute(attr, Localization.getTranslation(key, attr));
            }
        })
    }

    static getTranslationFromTranslationsObj(translationObj, key, attr) {
        let translation;
        try {
            const keys = key.split(".");

            for (let i = 0; i < keys.length - 1; i++) {
                // iterate into translation object until last layer
                translationObj = translationObj[keys[i]]
            }

            let lastKey = keys[keys.length - 1];

            if (attr) lastKey += "_" + attr;

            translation = translationObj[lastKey];

        } catch (e) {
            Logger.error(e);
        }

        if (!translation) {
            throw new Error(`Translation misses entry. Key: ${key} Attribute: ${attr}`);
        }

        return translation;
    }

    static addDataToTranslation(translation, data) {
        for (let j in data) {
            if (!translation.includes(`{{${j}}}`)) {
                throw new Error(`Translation misses data placeholder: ${j}`);
            }
            // Add data to translation
            translation = translation.replace(`{{${j}}}`, data[j]);
        }
        return translation;
    }

    static getTranslation(key, attr = null, data = {}, useDefault = false) {
        let translationObj = useDefault
            ? Localization.translationsDefaultLocale
            : Localization.translations;

        let translation;

        try {
            translation = Localization.getTranslationFromTranslationsObj(translationObj, key, attr);
            translation = Localization.addDataToTranslation(translation, data);
        }
        catch (e) {
            // Log warnings and help calls
            Logger.warn(e);
            Localization.logTranslationMissingOrBroken(key, attr, data, useDefault);
            Localization.logHelpCallKey(key, attr);
            Localization.logHelpCall();

            if (useDefault || Localization.currentLocaleIsDefault()) {
                // Is default locale already
                // Use empty string as translation
                translation = ""
            }
            else {
                // Is not default locale yet
                // Get translation for default language with same arguments
                Logger.debug(`Using default language ${Localization.localeDefault.toUpperCase()} instead.`);
                translation = this.getTranslation(key, attr, data, true);
            }
        }

        return Localization.escapeHTML(translation);
    }

    static logTranslationMissingOrBroken(key, attr, data, useDefault) {
        let usedLocale = useDefault
            ? Localization.localeDefault.toUpperCase()
            : Localization.locale.toUpperCase();

        Logger.warn(`Missing or broken translation for language ${usedLocale}.\n`, 'key:', key, 'attr:', attr, 'data:', data);
    }

    static logHelpCall() {
        Logger.warn("Help translating PairDrop: https://hosted.weblate.org/engage/pairdrop/");
    }

    static logHelpCallKey(key, attr) {
        let locale = Localization.locale.toLowerCase();

        let keyComplete = !attr || attr === "text"
            ? key
            : `${key}_${attr}`;

        Logger.warn(`Translate this string here: https://hosted.weblate.org/browse/pairdrop/pairdrop-spa/${locale}/?q=${keyComplete}`);
    }

    static escapeHTML(unsafeText) {
        let div = document.createElement('div');
        div.innerText = unsafeText;
        return div.innerHTML;
    }
}
