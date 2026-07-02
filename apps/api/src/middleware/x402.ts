import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { Networks, Transaction, Keypair, Horizon } from "@stellar/stellar-sdk";
import { isPaymentUsed, markPaymentUsed, initX402Tables, cleanupExpiredPayments } from "../db/x402.js";

let x402Initialized = false;

// SEC-A2: this was declared `false` and never assigned, so the durable
// Postgres replay store was dead code — every deploy silently used the
// in-memory Set, which a restart wipes clean (replay window reopens).
let useDatabase = false;

async function ensureX402Initialized() {
  if (x402Initialized) return;
  try {
    await initX402Tables();
    await cleanupExpiredPayments();
    x402Initialized = true;
    useDatabase = true;
  } catch (error) {
    console.warn('x402 DB init failed (will use in-memory fallback):', error);
    useDatabase = false;
  }
}

function getPlatformAddress(): string {
  const secret = process.env.PLATFORM_SECRET_KEY;
  if (secret) {
    try { return Keypair.fromSecret(secret).publicKey(); } catch {}
  }
  return process.env.PLATFORM_STELLAR_ADDRESS ?? "GDKKW2WSMQWZ63PIZBKDDBAAOBG5FP3TUHRYQ4U5RBKTFNESL5K5BJJK";
}

const PLATFORM_ADDRESS = getPlatformAddress();

const USDC_ASSET_CODE = "USDC";
// SEC-A1: without pinning the issuer, `op.asset.code === "USDC"` accepts an
// asset with that code minted by ANY account — a free, worthless lookalike.
const USDC_ISSUER = process.env.USDC_ISSUER ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? "TESTNET";
const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === "MAINNET" ? Networks.PUBLIC : Networks.TESTNET;
const HORIZON_URL =
  STELLAR_NETWORK === "MAINNET" ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";

export interface X402Config {
  /** Minimum amount in USDC (e.g. "0.001") */
  amount: string;
  /** Service name for the challenge */
  service: string;
}

/**
 * Factory: returns a Fastify preHandler that enforces x402 payment.
 *
 * Usage:
 *   fastify.get('/endpoint', { preHandler: requirePayment({ amount: '0.001', service: 'swap_search' }) }, handler)
 */
export function requirePayment(config: X402Config) {
  return async function x402PreHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const paymentHeader = request.headers["x-payment"] as string | undefined;

    if (!paymentHeader) {
      // No payment — return 402 challenge
      reply.status(402).send({
        status: 402,
        error: "Payment Required",
        challenge: {
          scheme: "stellar-usdc",
          amount_usdc: config.amount,
          pay_to: PLATFORM_ADDRESS,
          memo: `micopay:${config.service}`,
          expires_at: Math.floor(Date.now() / 1000) + 300, // 5 min
          service: config.service,
          network: STELLAR_NETWORK.toLowerCase(),
          instructions:
            "Send a Stellar USDC payment to pay_to with the specified memo. Include the signed XDR in X-PAYMENT header.",
        },
      });
      return;
    }

    // Verify the payment
    try {
      const payer = await verifyPayment(paymentHeader, config.amount, config.service);
      // Attach payer address to request for use in handlers
      (request as FastifyRequest & { payerAddress: string }).payerAddress = payer;
    } catch (err) {
      reply.status(402).send({
        status: 402,
        error: "Payment Invalid",
        message: err instanceof Error ? err.message : "Payment verification failed",
      });
      return;
    }
  };
}

/**
 * In-memory fallback for replay protection when DB is unavailable.
 */
const usedTxHashes = new Set<string>();

const horizonServer = new Horizon.Server(HORIZON_URL);

/**
 * Verify a payment submitted as signed XDR in the X-PAYMENT header.
 *
 * Returns the payer's Stellar address if valid.
 *
 * Checks:
 * - The XDR parses as a valid Stellar transaction
 * - The transaction has at least one payment operation of the pinned USDC
 *   asset (code + issuer) to PLATFORM_ADDRESS, meeting the minimum amount
 * - The transaction hash has not been seen before (replay protection)
 * - SEC-C1: the transaction is actually SUBMITTED to Horizon and confirmed —
 *   previously this function only parsed the XDR's *structure*; it never
 *   checked the signature was valid or that the payment was ever liquidated
 *   on-chain, so a well-formed but unsigned (or never-broadcast) XDR passed.
 *   Submitting server-side is also how we get real signature verification —
 *   Horizon rejects a badly- or un-signed envelope.
 */
async function verifyPayment(xdrBase64: string, minAmountUsdc: string, service: string): Promise<string> {
  await ensureX402Initialized();

  if (xdrBase64.startsWith("mock:")) {
    // SEC-C2: the mock bypass must never be reachable outside dev/test — gate
    // it explicitly instead of accepting "mock:" unconditionally (which meant
    // free credentials in any environment, including production). Reuses
    // X402_MOCK_MODE, which index.ts already refuses to start with in
    // production — that startup guard was previously disconnected from this
    // check, so it couldn't actually stop anything.
    if (!(process.env.X402_MOCK_MODE === "true" && process.env.NODE_ENV !== "production")) {
      throw new Error("Mock payments are disabled (set X402_MOCK_MODE=true outside production)");
    }
    return xdrBase64.replace("mock:", "").split(":")[0] ?? "GTEST_PAYER";
  }

  let tx: Transaction;
  try {
    tx = new Transaction(xdrBase64, NETWORK_PASSPHRASE);
  } catch (err) {
    throw new Error(`Invalid payment XDR: ${err}`);
  }

  const payer = tx.source;
  const txHash = Buffer.from(tx.hash()).toString("hex");

  const alreadyUsed = useDatabase ? await isPaymentUsed(txHash) : usedTxHashes.has(txHash);
  if (alreadyUsed) {
    throw new Error(`Payment already used: ${txHash.slice(0, 16)}...`);
  }

  // SEC-A1: pin the issuer too — `code === "USDC"` alone accepts a worthless
  // lookalike asset minted by any account.
  let foundPayment = false;
  for (const op of tx.operations) {
    if (
      op.type === "payment" &&
      op.destination === PLATFORM_ADDRESS &&
      op.asset.code === USDC_ASSET_CODE &&
      "issuer" in op.asset &&
      op.asset.issuer === USDC_ISSUER
    ) {
      const amount = parseFloat(op.amount);
      const minAmount = parseFloat(minAmountUsdc);
      if (amount >= minAmount) {
        foundPayment = true;
        break;
      }
    }
  }

  if (!foundPayment) {
    throw new Error(
      `No valid USDC payment of ≥ ${minAmountUsdc} found to ${PLATFORM_ADDRESS}`
    );
  }

  // Submit server-side and require confirmation. If the client already
  // broadcast this exact envelope themselves, Horizon returns tx_bad_seq (or
  // similar) on resubmission — in that case fall back to checking whether a
  // transaction with this hash already succeeded, rather than rejecting a
  // legitimately-paid request.
  try {
    await horizonServer.submitTransaction(tx);
  } catch (err) {
    const alreadySettled = await checkTransactionSucceeded(txHash);
    if (!alreadySettled) {
      const detail = (err as { response?: { data?: unknown } })?.response?.data ?? err;
      throw new Error(`Payment submission failed: ${JSON.stringify(detail)}`);
    }
  }

  if (useDatabase) {
    await markPaymentUsed(txHash, payer, minAmountUsdc, service);
  } else {
    usedTxHashes.add(txHash);
  }

  return payer;
}

/** Checks whether a transaction with this hash already succeeded on-chain. */
async function checkTransactionSucceeded(txHash: string): Promise<boolean> {
  try {
    const record = await horizonServer.transactions().transaction(txHash).call();
    return record.successful === true;
  } catch {
    return false;
  }
}

/**
 * Plugin that adds x402 utilities to Fastify instance.
 * Tracks payment totals for the Fund Micopay widget.
 */
export async function x402Plugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorate("requirePayment", requirePayment);
}

declare module "fastify" {
  interface FastifyInstance {
    requirePayment: typeof requirePayment;
  }
  interface FastifyRequest {
    payerAddress?: string;
  }
}
