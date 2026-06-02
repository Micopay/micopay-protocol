import axios from 'axios';
import { resolveErrorMessage } from '../constants/errorMap';

export interface ApiErrorPayload {
  message: string;
  error?: string;
  /** Full correlation ID returned by the backend in every error response. */
  request_id?: string;
  /** Short human-friendly code (e.g. "3f2a-bc91") for support conversations. */
  support_code?: string;
}

/**
 * Normalizes Fastify `setErrorHandler` payloads (`{ error, message }`) and Axios failures
 * so UI can show a safe string + optional machine-readable `error` key (#20 error path).
 *
 * Since #81 the backend includes `request_id` and `support_code` in every error
 * response — this function now surfaces those for the UI to display.
 */
export function extractApiErrorPayload(err: unknown): ApiErrorPayload {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; error?: string } | undefined;
    const resolved = resolveErrorMessage({
      response: {
        status: err.response?.status,
        data,
      },
      message: err.message,
    });
    const message =
      typeof data?.message === 'string' && data.message.length > 0
        ? resolved.message
        : resolved.message;
    const error = typeof data?.error === 'string' ? data.error : undefined;
    const request_id = typeof data?.request_id === 'string' ? data.request_id : undefined;
    const support_code = typeof data?.support_code === 'string' ? data.support_code : undefined;

    return { message, error, request_id, support_code };
  }
  if (err instanceof Error) {
    const resolved = resolveErrorMessage(err);
    return { message: resolved.message };
  }
  return { message: resolveErrorMessage(undefined).message };
}
