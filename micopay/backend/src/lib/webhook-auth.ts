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
