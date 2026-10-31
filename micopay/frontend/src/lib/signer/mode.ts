/**
 * `external` solo en la web: la llave vive en la billetera del usuario y esta app
 * nunca crea ni lee una. Vite reemplaza la variable al compilar, asi que en la
 * APK todo lo que depende de esto se elimina del bundle.
 */
export const IS_EXTERNAL_SIGNER = import.meta.env.VITE_SIGNER_MODE === 'external';
