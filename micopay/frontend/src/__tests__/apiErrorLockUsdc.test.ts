import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { mapApiError } from '../utils/apiError';

function lockError(code: string, message: string) {
  return new axios.AxiosError('unprocessable', 'ERR_BAD_REQUEST', undefined, undefined, {
    data: { code, message },
    status: 422,
    statusText: 'Unprocessable Entity',
    headers: {},
    config: { headers: {} } as any,
  });
}

describe('WP6: errores de bloqueo en USDC', () => {
  it.each(['LOCK_TRUSTLINE_MISSING', 'LOCK_INSUFFICIENT_BALANCE'])(
    'muestra el mensaje del servidor para %s',
    (code) => {
      const message = 'Tu cuenta no tiene la línea de confianza del USDC (emisor GADK…JSHG) que usa MicoPay.';
      expect(mapApiError(lockError(code, message))).toMatchObject({ message, error: code, status: 422 });
    },
  );
});
