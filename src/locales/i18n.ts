import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './en.json';
import bnTranslation from './bn.json';

const savedLanguage = typeof window !== 'undefined' ? localStorage.getItem('bd_legal_lang') : null;

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      bn: { translation: bnTranslation },
    },
    lng: savedLanguage || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('bd_legal_lang', lng);
    document.documentElement.lang = lng;
  }
});

export default i18n;
