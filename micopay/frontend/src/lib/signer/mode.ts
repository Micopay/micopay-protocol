/**
 * `external` solo en la web: la llave vive en la billetera del usuario y esta app
 * nunca crea ni lee una. Vite reemplaza la variable al compilar, asi que en la
 * APK todo lo que depende de esto se elimina del bundle.
 */
export const IS_EXTERNAL_SIGNER = import.meta.env.VITE_SIGNER_MODE === 'external';

/** Sin llave disponible: en la web la cuenta es la de la billetera, no la del telefono. */
export const NO_KEY_MESSAGE = IS_EXTERNAL_SIGNER
  ? 'Conecta tu billetera para continuar.'
  : 'No se encontró la llave de tu dispositivo.';
export const KEY_MISMATCH_MESSAGE = IS_EXTERNAL_SIGNER
  ? 'la billetera conectada no coincide con la cuenta del retiro'
  : 'la llave del dispositivo no coincide con la cuenta del retiro';
