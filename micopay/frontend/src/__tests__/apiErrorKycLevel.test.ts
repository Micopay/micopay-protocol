import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { mapApiError, toApiError } from '../utils/apiError';

describe('KYC required level error contract', () => {
  it('preserves the required level through normalized service errors', () => {
    const mapped = mapApiError(toApiError({
      message: 'Necesitas nivel 2',
      error: 'KYC_TIER_INSUFFICIENT',
      required_level: 2,
      current_level: 1,
    }));

    expect(mapped).toMatchObject({
      action: 'verify_identity',
      requiredLevel: 2,
      currentLevel: 1,
    });
  });

  it('preserves the required level from backend Axios responses', () => {
    const error = new axios.AxiosError('forbidden', 'ERR_BAD_REQUEST', undefined, undefined, {
      data: {
        code: 'KYC_TIER_INSUFFICIENT',
        message: 'Necesitas nivel 2',
        required_level: 2,
        current_level: 1,
      },
      status: 403,
      statusText: 'Forbidden',
      headers: {},
      config: { headers: {} } as any,
    });

    expect(mapApiError(error)).toMatchObject({
      action: 'verify_identity',
      requiredLevel: 2,
      currentLevel: 1,
      status: 403,
    });
  });
});
