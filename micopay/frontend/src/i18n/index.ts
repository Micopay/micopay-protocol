import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './es.json';
import en from './en.json';

// Sin eleccion guardada, el idioma del navegador: quien lo tiene en ingles no
// deberia tener que encontrar el selector en espanol. Las pruebas fijan 'es'.
function initialLanguage(): 'es' | 'en' {
  const stored = localStorage.getItem('micopay_lang');
  if (stored === 'es' || stored === 'en') return stored;
  if (import.meta.env.MODE === 'test' || typeof navigator === 'undefined') return 'es';
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

const saved = initialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng: saved,
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
  });

export function setLanguage(lang: 'es' | 'en') {
  i18n.changeLanguage(lang);
  localStorage.setItem('micopay_lang', lang);
}

export default i18n;
