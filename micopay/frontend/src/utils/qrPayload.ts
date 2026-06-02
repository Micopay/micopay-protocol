/**
 * QR payload parser for MicoPay protocol QR codes.
 *
 * Supported formats:
 *   - micopay://release?trade_id=<uuid>&secret=<hex>
 *   - micopay://claim?request_id=<id>&amount_mxn=<number>&htlc=<hash>
 *   - MICOPAY:<type>:<value>  (legacy demo format)
 *
 * Returns a typed result or an error describing what went wrong.
 */

export interface QRPayloadRelease {
  type: 'release';
  tradeId: string;
  secret: string;
}

export interface QRPayloadClaim {
  type: 'claim';
  requestId: string;
  amountMxn: number;
  htlc: string;
}

export interface QRPayloadDemo {
  type: 'demo';
  subtype: string;
  value: string;
}

export type ParsedQRPayload = QRPayloadRelease | QRPayloadClaim | QRPayloadDemo;

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
      const action = url.hostname; // 'release' or 'claim'

      if (action === 'release') {
        const tradeId = url.searchParams.get('trade_id');
        const secret = url.searchParams.get('secret');

        if (!tradeId) {
          return { ok: false, error: 'El QR no contiene un ID de trade válido' };
        }
        if (!secret) {
          return { ok: false, error: 'El QR no contiene el secreto HTLC' };
        }

        return {
          ok: true,
          payload: { type: 'release', tradeId, secret },
        };
      }

      if (action === 'claim') {
        const requestId = url.searchParams.get('request_id');
        const amountMxnStr = url.searchParams.get('amount_mxn');
        const htlc = url.searchParams.get('htlc');

        if (!requestId) {
          return { ok: false, error: 'El QR de claim no contiene un ID de solicitud' };
        }

        return {
          ok: true,
          payload: {
            type: 'claim',
            requestId,
            amountMxn: amountMxnStr ? Number(amountMxnStr) : 0,
            htlc: htlc ?? '',
          },
        };
      }

      return { ok: false, error: `Acción QR no reconocida: "${action}"` };
    } catch {
      return { ok: false, error: 'No se pudo analizar el enlace del QR' };
    }
  }

  // ── MICOPAY:<subtype>:<value> legacy demo format ─────────────────────────
  if (trimmed.startsWith('MICOPAY:')) {
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
