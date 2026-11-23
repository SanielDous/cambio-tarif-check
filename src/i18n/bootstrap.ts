import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de/common.json";
import en from "./locales/en/common.json";

export const defaultNS = "common";

void i18n.use(initReactI18next).init({
  resources: { de: { common: de }, en: { common: en } },
  lng: "de",
  fallbackLng: "de",
  defaultNS,
  interpolation: { escapeValue: false },
});

function syncDocumentLang(language: string) {
  document.documentElement.lang = language;
}

syncDocumentLang(i18n.language);
i18n.on("languageChanged", syncDocumentLang);

export default i18n;
