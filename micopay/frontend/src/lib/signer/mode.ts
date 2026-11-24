import i18n from '../../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

/**
 * `external` solo en la web: la llave vive en la billetera del usuario y esta app
 * nunca crea ni lee una. Vite reemplaza la variable al compilar, asi que en la
 * APK todo lo que depende de esto se elimina del bundle.
 */
export const IS_EXTERNAL_SIGNER = import.meta.env.VITE_SIGNER_MODE === 'external';

/**
 * Sin llave disponible: en la web la cuenta es la de la billetera, no la del telefono.
 * Funciones y no constantes: se leen al lanzar el error, asi siguen el idioma activo.
 */
export const noKeyMessage = (): string =>
  IS_EXTERNAL_SIGNER ? tr('signerErrors.noKeyWeb') : tr('signerErrors.noKeyDevice');
export const keyMismatchMessage = (): string =>
  IS_EXTERNAL_SIGNER ? tr('signerErrors.mismatchWeb') : tr('signerErrors.mismatchDevice');
