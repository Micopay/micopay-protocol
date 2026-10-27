import { createHmac, timingSafeEqual } from "crypto";
import canonicalize from "canonicalize";

// Etherfuse signs webhook deliveries by canonicalizing the JSON body (RFC 8785
// JCS — deterministic key ordering, no extra whitespace), then HMAC-SHA256 over
// that string with a per-subscription secret (base64), sent as
// `X-Signature: sha256={hex}`. See docs.etherfuse.com/guides/verifying-webhooks.
export function verifyWebhookSignature(
  body: unknown,
  signatureHeader: string | undefined,
  secret: string | undefined
): { valid: boolean; error?: string } {
  if (!secret) {
    return { valid: false, error: "webhook secret not configured" };
  }
  if (!signatureHeader) {
    return { valid: false, error: "Missing X-Signature header" };
  }

  const canonicalized = canonicalize(body);
  if (canonicalized === undefined) {
    return { valid: false, error: "Unable to canonicalize webhook body" };
  }

  const key = Buffer.from(secret, "base64");
  const digest = createHmac("sha256", key).update(canonicalized).digest("hex");
  const expected = `sha256=${digest}`;

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, error: "Signature mismatch" };
  }
  if (!timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, error: "Signature mismatch" };
  }
  return { valid: true };
}

// Didit signs webhook deliveries with HMAC-SHA256 over the exact raw request
// body (hex digest, secret used directly as the HMAC key — not base64
// decoded, unlike Etherfuse above), sent as `x-signature`, alongside
// `x-timestamp` (unix seconds) for replay protection.
//
// ⚠️ UNVERIFIED AGAINST A LIVE SANDBOX — see didit.service.ts's header
// comment. Confirm header names and signing scheme against your own Didit
// sandbox before relying on this in production.
//
// Unlike verifyWebhookSignature above (which re-canonicalizes the parsed
// body — safe only because Etherfuse itself signs the JCS-canonical form),
// this needs the caller to pass the exact raw bytes Didit sent: re-stringify
// of the parsed JSON is not guaranteed byte-identical to what was signed.
export function verifyDiditWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  secret: string | undefined,
  opts: { maxAgeMs?: number; now?: number } = {},
): { valid: boolean; error?: string } {
  const { maxAgeMs = 5 * 60 * 1000, now = Date.now() } = opts;

  if (!secret) {
    return { valid: false, error: "webhook secret not configured" };
  }
  if (!signatureHeader) {
    return { valid: false, error: "Missing x-signature header" };
  }
  if (!timestampHeader) {
    return { valid: false, error: "Missing x-timestamp header" };
  }

  const timestampMs = Number(timestampHeader) * 1000;
  if (!Number.isFinite(timestampMs)) {
    return { valid: false, error: "Invalid x-timestamp header" };
  }
  if (Math.abs(now - timestampMs) > maxAgeMs) {
    return { valid: false, error: "Timestamp outside allowed window (stale or replayed delivery)" };
  }

  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(digest);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, error: "Signature mismatch" };
  }
  if (!timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, error: "Signature mismatch" };
  }
  return { valid: true };
}

export interface DiditWebhookSignatureHeaders {
  signatureV2?: string;
  signatureV2Previous?: string;
  signature?: string;
  signaturePrevious?: string;
  timestamp?: string;
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortJsonKeys((value as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }
  return value;
}

function signatureMatches(payload: string, signatures: Array<string | undefined>, secret: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(payload, "utf8").digest("hex"));
  return signatures.some((signature) => {
    if (!signature) return false;
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}

/**
 * Verifies Didit's recommended canonical JSON signature first, then falls
 * back to the exact raw-body signature for backwards compatibility. The
 * `-Previous` variants keep deliveries valid during the 24-hour secret
 * rotation window while either the old or new secret is deployed.
 */
export function verifyDiditWebhookSignatures(
  rawBody: string,
  jsonBody: unknown,
  headers: DiditWebhookSignatureHeaders,
  secret: string | undefined,
  opts: { maxAgeMs?: number; now?: number } = {},
): { valid: boolean; error?: string; variant?: "v2" | "raw" } {
  const { maxAgeMs = 5 * 60 * 1000, now = Date.now() } = opts;

  if (!secret) return { valid: false, error: "webhook secret not configured" };
  if (!headers.timestamp) return { valid: false, error: "Missing x-timestamp header" };

  const timestampMs = Number(headers.timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) return { valid: false, error: "Invalid x-timestamp header" };
  if (Math.abs(now - timestampMs) > maxAgeMs) {
    return { valid: false, error: "Timestamp outside allowed window (stale or replayed delivery)" };
  }

  const v2Signatures = [headers.signatureV2, headers.signatureV2Previous];
  const rawSignatures = [headers.signature, headers.signaturePrevious];
  if (!v2Signatures.some(Boolean) && !rawSignatures.some(Boolean)) {
    return { valid: false, error: "Missing x-signature-v2 or x-signature header" };
  }

  const canonical = JSON.stringify(sortJsonKeys(jsonBody));
  if (signatureMatches(canonical, v2Signatures, secret)) return { valid: true, variant: "v2" };
  if (signatureMatches(rawBody, rawSignatures, secret)) return { valid: true, variant: "raw" };

  return { valid: false, error: "Signature mismatch" };
}
