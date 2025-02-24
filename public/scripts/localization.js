class Localization {
    constructor() {
        Localization.$htmlRoot = document.querySelector('html');

        Localization.defaultLocale = "en";
        Localization.supportedLocales = [
            "ar", "be", "bg", "ca", "cs", "da", "de", "en", "es", "et", "eu", "fa", "fr", "he", "hu", "id", "it", "ja",
            "kn", "ko", "nb", "nl", "nn", "pl", "pt-BR", "ro", "ru", "sk", "ta", "tr", "uk", "zh-CN", "zh-HK", "zh-TW"
        ];
        Localization.supportedLocalesRtl = ["ar", "he"];

        Localization.translations = {};
        Localization.translationsDefaultLocale = {};

        Localization.systemLocale = Localization.getSupportedOrDefaultLocales(navigator.languages);

        let storedLanguageCode = localStorage.getItem('language_code');

        Localization.initialLocale = storedLanguageCode && Localization.localeIsSupported(storedLanguageCode)
            ? storedLanguageCode
            : Localization.systemLocale;
    }

    static localeIsSupported(locale) {
        return Localization.supportedLocales.indexOf(locale) > -1;
    }

    static localeIsRtl(locale) {
        return Localization.supportedLocalesRtl.indexOf(locale) > -1;
    }

    static currentLocaleIsRtl() {
        return Localization.localeIsRtl(Localization.locale);
    }

    static currentLocaleIsDefault() {
        return Localization.locale === Localization.defaultLocale
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
            || Localization.defaultLocale;
    }

    async setInitialTranslation() {
        await Localization.fetchDefaultTranslations();
        await Localization.setTranslation(Localization.initialLocale)
    }

    static async setTranslation(locale) {
        if (!locale) locale = Localization.systemLocale;

        await Localization.fetchTranslations(locale)
        await Localization.translatePage();

        if (Localization.localeIsRtl(locale)) {
            Localization.$htmlRoot.setAttribute('dir', 'rtl');
        }
        else {
            Localization.$htmlRoot.removeAttribute('dir');
        }

        Localization.$htmlRoot.setAttribute('lang', locale);


        console.log("Page successfully translated",
            `System language: ${Localization.systemLocale}`,
            `Selected language: ${locale}`
        );

        Events.fire("translation-loaded");
    }

    static async fetchDefaultTranslations() {
        Localization.translationsDefaultLocale = await Localization.fetchTranslationsFor(Localization.defaultLocale);
    }

    static async fetchTranslations(newLocale) {
        if (newLocale === Localization.locale) return false;

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
            console.error(e);
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
            console.warn(e);
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
                console.log(`Using default language ${Localization.defaultLocale.toUpperCase()} instead.`);
                translation = this.getTranslation(key, attr, data, true);
            }
        }

        return Localization.escapeHTML(translation);
    }

    static logTranslationMissingOrBroken(key, attr, data, useDefault) {
        let usedLocale = useDefault
            ? Localization.defaultLocale.toUpperCase()
            : Localization.locale.toUpperCase();

        console.warn(`Missing or broken translation for language ${usedLocale}.\n`, 'key:', key, 'attr:', attr, 'data:', data);
    }

    static logHelpCall() {
        console.log("Help translating PairDrop: https://hosted.weblate.org/engage/pairdrop/");
    }

    static logHelpCallKey(key, attr) {
        let locale = Localization.locale.toLowerCase();

        let keyComplete = !attr || attr === "text"
            ? key
            : `${key}_${attr}`;

        console.warn(`Translate this string here: https://hosted.weblate.org/browse/pairdrop/pairdrop-spa/${locale}/?q=${keyComplete}`);
    }

    static escapeHTML(unsafeText) {
        let div = document.createElement('div');
        div.innerText = unsafeText;
        return div.innerHTML;
    }
}
