/** 64-char hex string (32 bytes) — HTLC preimage or Stellar tx hash. */
export const HEX_64_PATTERN = /^[0-9a-fA-F]{64}$/;

/** RFC 4122 UUID (trade IDs from backend). */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isHex64(value: string): boolean {
  return HEX_64_PATTERN.test(value);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
