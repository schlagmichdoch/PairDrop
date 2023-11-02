class Localization {
    constructor() {
        Localization.defaultLocale = "en";
        Localization.supportedLocales = ["ar", "de", "en", "es", "fr", "id", "it", "ja", "nb", "nl", "ro", "ru", "zh-CN"];
        Localization.supportedLocalesRTL = ["ar"];

        Localization.translations = {};
        Localization.defaultTranslations = {};

        Localization.systemLocale = Localization.getSupportedOrDefault(navigator.languages);

        let storedLanguageCode = localStorage.getItem("language-code");

        Localization.initialLocale = storedLanguageCode && Localization.isSupported(storedLanguageCode)
            ? storedLanguageCode
            : Localization.systemLocale;

        Localization
            .setTranslation(Localization.initialLocale)
            .then(_ => {
                console.log("Initial translation successful.");
                Events.fire("initial-translation-loaded");
            });
    }

    static isSupported(locale) {
        return Localization.supportedLocales.indexOf(locale) > -1;
    }

    static isRTLLanguage(locale) {
        return Localization.supportedLocalesRTL.indexOf(locale) > -1;
    }

    static getSupportedOrDefault(locales) {
        let localesGeneric = locales
            .map(locale => locale.split("-")[0])
            .filter(locale => locales.indexOf(locale) === -1);

        return locales.find(Localization.isSupported)
            || localesGeneric.find(Localization.isSupported)
            || Localization.defaultLocale;
    }

    static async setTranslation(locale) {
        if (!locale) locale = Localization.systemLocale;

        await Localization.setLocale(locale)
        await Localization.translatePage();

        const htmlRootNode = document.querySelector('html');

        if (Localization.isRTLLanguage(locale)) {
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
        return !localStorage.getItem('language-code');
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
                if (attr.startsWith("data-")) {
                    let dataAttr = attr.substring(5);
                    element.dataset.dataAttr = Localization.getTranslation(key, attr);
                } {
                    element.setAttribute(attr, Localization.getTranslation(key, attr));
                }
            }
        }
    }

    static getTranslation(key, attr=null, data={}, useDefault=false) {
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
                translation = translation.replace(`{{${j}}}`, data[j]);
            }
        } catch (e) {
            translation = "";
        }

        if (!translation) {
            if (!useDefault) {
                translation = this.getTranslation(key, attr, data, true);
                console.warn(`Missing translation entry for your language ${Localization.locale.toUpperCase()}. Using ${Localization.defaultLocale.toUpperCase()} instead.`, key, attr);
                console.warn(`Translate this string here: https://hosted.weblate.org/browse/pairdrop/pairdrop-spa/${Localization.locale.toLowerCase()}/?q=${key}`)
                console.log("Help translating PairDrop: https://hosted.weblate.org/engage/pairdrop/");
            }
            else {
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
