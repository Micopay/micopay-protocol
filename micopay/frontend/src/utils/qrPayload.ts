/**
 * QR payload parser for MicoPay protocol QR codes.
 *
 * Supported formats:
 *   - micopay://release?trade_id=<uuid>&claim_token=<hex64>
 *   - micopay://confirm?trade_id=<uuid>
 *   - MICOPAY:<type>:<value>  (legacy demo format — demo builds only)
 *
 * Returns a typed result or an error describing what went wrong.
 */

import { IS_DEMO_MODE } from './demoMode';
import { isHex64, isUuid } from './qrValidation';

export interface QRPayloadRelease {
  type: 'release';
  tradeId: string;
  /**
   * Token opaco de un solo uso. El preimage HTLC nunca viaja en el QR.
   */
  claimToken: string;
}

/**
 * QR del cliente en un depósito. Solo identifica la operación: no lleva
 * secreto ni token, porque confirmar el efectivo lo autoriza el servidor
 * (`POST /trades/:id/reveal` solo acepta al vendedor del escrow, con la
 * operación en `locked`). Escanearlo es la forma tangible de decir
 * "recibí el efectivo" frente al cliente.
 */
export interface QRPayloadConfirm {
  type: 'confirm';
  tradeId: string;
}

export interface QRPayloadDemo {
  type: 'demo';
  subtype: string;
  value: string;
}

export type ParsedQRPayload = QRPayloadRelease | QRPayloadConfirm | QRPayloadDemo;

export interface QRParseSuccess {
  ok: true;
  payload: ParsedQRPayload;
}

export interface QRParseError {
  ok: false;
  error: string;
}

export type QRParseResult = QRParseSuccess | QRParseError;

/**
 * Parse a raw QR string into a typed payload object.
 */
export function parseQRPayload(raw: string | null | undefined): QRParseResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, error: 'El código QR está vacío' };
  }

  const trimmed = raw.trim();

  // ── micopay:// deep-link format ──────────────────────────────────────────
  if (trimmed.startsWith('micopay://')) {
    try {
      // Replace micopay:// with https:// so URL constructor can parse it
      const url = new URL(trimmed.replace('micopay://', 'https://'));
      const action = url.hostname; // 'release' or 'confirm'

      if (action === 'release') {
        const tradeId = url.searchParams.get('trade_id');
        const claimToken = url.searchParams.get('claim_token');

        if (!tradeId) {
          return { ok: false, error: 'El QR no contiene un ID de trade válido' };
        }
        if (!isUuid(tradeId)) {
          return { ok: false, error: 'El ID de trade no tiene un formato UUID válido' };
        }
        if (!claimToken) {
          return { ok: false, error: 'El QR no contiene el código de cobro' };
        }
        if (!isHex64(claimToken)) {
          return {
            ok: false,
            error: 'El código de cobro debe ser una cadena hexadecimal de 64 caracteres',
          };
        }

        return {
          ok: true,
          payload: { type: 'release', tradeId, claimToken: claimToken.toLowerCase() },
        };
      }

      if (action === 'confirm') {
        const tradeId = url.searchParams.get('trade_id');
        if (!tradeId) {
          return { ok: false, error: 'El QR no contiene un ID de trade válido' };
        }
        if (!isUuid(tradeId)) {
          return { ok: false, error: 'El ID de trade no tiene un formato UUID válido' };
        }
        return { ok: true, payload: { type: 'confirm', tradeId } };
      }

      return { ok: false, error: `Acción QR no reconocida: "${action}"` };
    } catch {
      return { ok: false, error: 'No se pudo analizar el enlace del QR' };
    }
  }

  // ── MICOPAY:<subtype>:<value> legacy demo format (demo builds only) ───────
  if (trimmed.startsWith('MICOPAY:')) {
    if (!IS_DEMO_MODE) {
      return {
        ok: false,
        error: 'El formato legacy MICOPAY ya no es compatible. Usa un QR micopay:// válido.',
      };
    }

    const parts = trimmed.split(':');
    if (parts.length >= 3) {
      return {
        ok: true,
        payload: {
          type: 'demo',
          subtype: parts[1],
          value: parts.slice(2).join(':'),
        },
      };
    }
    return { ok: false, error: 'Formato MICOPAY incompleto' };
  }

  return { ok: false, error: 'Código QR no reconocido. Se espera un QR de MicoPay válido.' };
}
