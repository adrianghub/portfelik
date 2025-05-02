import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import plTranslation from "./locales/pl.json";

const resources = {
  pl: {
    translation: plTranslation,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: "pl",
    fallbackLng: "pl",
    debug: import.meta.env.DEV,

    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
