import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Best-effort fire-and-forget error report to the backend.
 * Used by ErrorBoundary and critical catch blocks so support
 * can correlate APK crashes with backend logs.
 */
export function reportClientError(payload: {
  request_id?: string;
  error_code?: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Fire and forget — don't let a reporting failure break the UX
  axios.post(`${BASE_URL}/client-errors`, {
    ...payload,
    app_version: import.meta.env.VITE_APP_VERSION ?? 'dev',
  }, { headers }).catch(() => {});
}
