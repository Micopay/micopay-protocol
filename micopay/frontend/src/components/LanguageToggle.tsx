import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';

/** Cambio de idioma antes de tener cuenta: el de Perfil solo se ve con sesion. */
export default function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.language === 'en' ? 'es' : 'en';
  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      aria-label={next === 'en' ? 'Switch to English' : 'Cambiar a español'}
      className="text-xs font-bold text-tinta border-2 border-tinta rounded-sm px-2 py-1 bg-papel"
    >
      {next === 'en' ? 'EN' : 'ES'}
    </button>
  );
}
