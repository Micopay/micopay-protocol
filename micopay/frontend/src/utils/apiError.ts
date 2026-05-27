import axios from 'axios';
import { resolveErrorMessage } from '../constants/errorMap';

/**
 * Normalizes Fastify `setErrorHandler` payloads (`{ error, message }`) and Axios failures
 * so UI can show a safe string + optional machine-readable `error` key (#20 error path).
 */
export function extractApiErrorPayload(err: unknown): { message: string; error?: string } {
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
    return { message, error };
  }
  if (err instanceof Error) {
    const resolved = resolveErrorMessage(err);
    return { message: resolved.message };
  }
  return { message: resolveErrorMessage(undefined).message };
}
