/**
 * Confirmacion de la persona antes de firmar.
 *
 * EL HUECO QUE CIERRA
 * -------------------
 * La llave vive en el almacenamiento seguro del sistema, pero `signTransactionXdr`
 * la leia y firmaba **sin preguntar nada**. Con la app abierta, cualquier toque
 * que llegara a esa ruta movia dinero: un telefono desbloqueado en manos ajenas
 * bastaba para vaciar la cuenta, y no habia ningun momento en el que la persona
 * dijera "si, esta operacion la autorizo yo".
 *
 * LO QUE ESTO ES, Y LO QUE NO
 * ---------------------------
 * En Android, la custodia real vive ahora en `StellarKeyVaultPlugin`: la seed
 * esta cifrada con una clave AES no extraible del Android Keystore y descifrarla
 * exige autenticacion del sistema. Este modulo conserva la compuerta para web y
 * para compatibilidad; no sustituye las garantias del plugin nativo.
 *
 * (La tercera via —passkeys y smart accounts, donde la llave nunca existe en
 * memoria— esta descartada para retail: una direccion `C…` no puede recibir un
 * retiro de Bitso, y en Mexico eso deja al usuario con fondos que no puede
 * sacar. Ver la nota en el commit del 2026-09-05.)
 *
 * POR QUE NO SE BLOQUEA A QUIEN NO TIENE BIOMETRIA
 * ------------------------------------------------
 * El fallback web mantiene el comportamiento historico. El plugin Android, en
 * cambio, falla cerrado si el dispositivo no tiene bloqueo seguro configurado.
 */

import { Capacitor } from '@capacitor/core';

/** Motivo que se le muestra a la persona. Concreto, nunca generico. */
export type PresenceReason =
  | 'lock'
  | 'release'
  | 'decline'
  | 'payment'
  | 'reveal_key'
  | 'sign_request'
  | 'login'
  | 'unlock';

const PROMPTS: Record<PresenceReason, string> = {
  lock: 'Confirma para bloquear tu dinero en garantía',
  release: 'Confirma para liberar el dinero',
  decline: 'Confirma para devolver los fondos',
  payment: 'Confirma para enviar el pago',
  reveal_key: 'Confirma para ver tu llave secreta',
  sign_request: 'Confirma para autorizar esta operación',
  login: 'Confirma que eres tú para entrar',
  unlock: 'Confirma que eres tú para abrir MicoPay',
};

export class PresenceDeniedError extends Error {
  constructor() {
    super('El usuario canceló la confirmación');
    this.name = 'PresenceDeniedError';
  }
}

/**
 * Ventana de gracia. Un solo gesto de la persona —"enviar pago"— puede pasar por
 * varias firmas encadenadas (crear la trustline y luego pagar, por ejemplo).
 * Pedir huella dos veces seguidas por la misma accion enseña a la gente a
 * confirmar sin leer, que es justo lo contrario de lo que se busca.
 *
 * 60 segundos: cubre un encadenamiento, no una sesion.
 */
const GRACE_MS = 60_000;
let lastConfirmedAt = 0;

/** Se invalida al salir a segundo plano: volver a la app es un contexto nuevo. */
export function resetPresence(): void {
  lastConfirmedAt = 0;
}

/**
 * Bloqueo de la app al volver de segundo plano (AUTH-2).
 *
 * EL HUECO
 * --------
 * Con la sesion abierta, cualquiera que tomara el telefono desbloqueado y
 * abriera MicoPay veia saldo, historial, chats y perfil. Las firmas ya pedian
 * huella; mirar la cuenta, no.
 *
 * LO QUE ESTO ES, Y LO QUE NO
 * ---------------------------
 * Es una compuerta para VER la cuenta, del mismo tipo que la de las firmas: no
 * cifra nada ni cierra la sesion. Un minuto fuera no bloquea, para que salir a
 * copiar una direccion no cueste una huella.
 */
export const LOCK_AFTER_MS = 60_000;
let backgroundedAt = 0;
// El PIN del sistema abre otra actividad y Android manda la app a segundo
// plano mientras se escribe. Sin esto, un PIN lento volvia a bloquear la app
// justo al desbloquearla.
let promptInFlight = false;

/** La app paso a segundo plano. Lo llama `main.tsx`. */
export function markBackgrounded(now: number = Date.now()): void {
  if (promptInFlight) return;
  backgroundedAt = now;
}

/**
 * Al volver a primer plano: ¿estuvo fuera mas de `LOCK_AFTER_MS`? Consume la
 * marca, asi que cada salida cuenta una sola vez.
 */
export function shouldLockOnResume(now: number = Date.now()): boolean {
  const since = backgroundedAt;
  backgroundedAt = 0;
  return since > 0 && now - since > LOCK_AFTER_MS;
}

/**
 * ¿Tiene sentido bloquear la app en este dispositivo? Mismas reglas que
 * `requireUserPresence`, pero sin mostrar nada: en web, o sin huella ni bloqueo
 * de pantalla, no hay con que desbloquear, y dejar a alguien fuera de su propio
 * dinero es peor.
 */
export async function canLockDevice(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  const info = await BiometricAuth.checkBiometry().catch(() => null);
  return Boolean(info?.isAvailable || info?.deviceIsSecure);
}

/**
 * Pide confirmacion. Lanza `PresenceDeniedError` si la persona cancela.
 *
 * @param reason que se va a hacer, para que el dialogo lo diga
 * @param force ignora la ventana de gracia (revelar la llave siempre pregunta)
 */
export async function requireUserPresence(
  reason: PresenceReason,
  force = false,
): Promise<void> {
  // En web no hay biometria del sistema. No se simula ni se bloquea: la
  // compuerta es una defensa del dispositivo, y fingirla en web daria una
  // falsa sensacion de proteccion.
  if (!Capacitor.isNativePlatform()) return;

  if (!force && Date.now() - lastConfirmedAt < GRACE_MS) return;

  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');

  const info = await BiometricAuth.checkBiometry().catch(() => null);
  // Ni biometria ni credencial de dispositivo: se permite seguir. Ver el
  // encabezado — dejar a alguien fuera de su propio dinero es peor.
  if (!info?.isAvailable && !info?.deviceIsSecure) return;

  promptInFlight = true;
  try {
    await BiometricAuth.authenticate({
      reason: PROMPTS[reason],
      cancelTitle: 'Cancelar',
      // El PIN o patron valen cuando la huella falla o no esta configurada:
      // lo que se busca es presencia de la persona, no un biometrico concreto.
      allowDeviceCredential: true,
      androidTitle: 'MicoPay',
      androidSubtitle: PROMPTS[reason],
      androidConfirmationRequired: false,
    });
    lastConfirmedAt = Date.now();
  } catch {
    // Cualquier fallo se trata como negativa. Interpretar un error del sistema
    // como "adelante" convertiria la compuerta en decorativa.
    throw new PresenceDeniedError();
  } finally {
    promptInFlight = false;
  }
}
