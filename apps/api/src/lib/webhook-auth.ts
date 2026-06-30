import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config.js";

const SIGNATURE_HEADER = "x-webhook-signature";
const SIGNED_HEADERS = "x-webhook-timestamp";

export interface WebhookPayload {
  event: string;
  orderId: string;
  amount?: string;
  currency?: string;
  [key: string]: unknown;
}

function generateSignature(payload: string, timestamp: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}.${payload}`);
  return hmac.digest("hex");
}

export function verifyWebhookSignature(
  body: unknown,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
): { valid: boolean; error?: string } {
  const secret = config.webhookSecret;

  if (!secret) {
    return { valid: false, error: "WEBHOOK_SECRET not configured" };
  }

  if (!signatureHeader) {
    return { valid: false, error: `Missing ${SIGNATURE_HEADER} header` };
  }

  if (!timestampHeader) {
    return { valid: false, error: `Missing ${SIGNED_HEADERS} header` };
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid x-webhook-timestamp: must be a Unix timestamp in seconds" };
  }

  // Reject timestamps older than 5 minutes (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return { valid: false, error: "x-webhook-timestamp too old or in the future (max 5 min skew)" };
  }

  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const expectedSig = generateSignature(payload, timestampHeader, secret);

  try {
    const sigBuf = Buffer.from(signatureHeader, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length) {
      return { valid: false, error: "Invalid signature length" };
    }
    if (!timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false, error: "Signature mismatch" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid signature format" };
  }
}
