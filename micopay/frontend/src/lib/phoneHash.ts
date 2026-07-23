/**
 * phoneHash.ts
 *
 * Provides a stable, one-way SHA-256 hash of a phone number for anti-abuse
 * controls (assertNotRelatedAccounts in abuse.service.ts).
 *
 * The raw phone number is NEVER sent to the backend — only the hash is
 * transmitted, so the server cannot reverse the number.
 *
 * This uses the Web Crypto API (window.crypto.subtle) which is available in
 * modern browsers, Capacitor WebViews, and service workers.
 *
 * IMPORTANT: This hash is deterministic (same input → same output) so the
 * backend can compare phone_hash values across accounts without ever seeing
 * the raw phone number. That's intentional — it's what enables the related-
 * account abuse check.
 */

/**
 * Normalize a raw phone number to a canonical form before hashing.
 *
 * Strips all non-digit characters (spaces, dashes, parentheses, +, etc.)
 * except a leading '+' which is kept if present, because international
 * prefixes are meaningful (e.g. +521234567890 ≠ 1234567890).
 *
 * @param raw - The phone number as entered by the user.
 * @returns The normalized phone string (digits only, or leading '+' + digits).
 */
export function normalizePhone(raw: string): string {
    // Keep a leading '+' if present, remove all other non-digit characters.
    const hasPlus = raw.startsWith('+');
    const digits = raw.replace(/[^\d]/g, '');
    return hasPlus ? `+${digits}` : digits;
}

/**
 * Hash a phone number using SHA-256 via the Web Crypto API.
 *
 * The pipeline is:
 *   1. Normalize the raw input to a canonical digit string.
 *   2. Encode as UTF-8 bytes.
 *   3. SHA-256 digest via crypto.subtle.
 *   4. Hex-encode the resulting ArrayBuffer.
 *
 * @param phoneNumber - The raw phone number string from the user input.
 * @returns A promise that resolves to the hex-encoded SHA-256 hash.
 */
export async function hashPhone(phoneNumber: string): Promise<string> {
    const normalized = normalizePhone(phoneNumber);

    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);

    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert the ArrayBuffer to a hex string.
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexDigest = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    return hexDigest;
}

