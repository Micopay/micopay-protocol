/**
 * WP3 del plan de correcciones del escrow (2026-10-30), hallazgo H2: un solo
 * plazo, el de la cadena.
 *
 * Cubre, con MOCK_STELLAR=false, store en memoria y RPC simulado:
 *   - el reembolso (elegibilidad, boton y sweep) lo decide el ledger del
 *     contrato, no `expires_at`; el borde exacto `sequence >= timeout_ledger`;
 *   - "no pude leer" nunca es "ya vencio";
 *   - el lock confirmado guarda `funds_timeout_ledger` y su estimacion;
 *   - un lock a menos de 30 minutos de que venza la solicitud se rechaza.
 *
 * Sin red: el RPC se sustituye con setRpcServerFactoryForTests.
 */

import { strictEqual, ok } from "assert";
import {
  Keypair, Account, Address, Contract, StrKey, TransactionBuilder, Networks, nativeToScVal, xdr,
} from "@stellar/stellar-sdk";
import { randomBytes } from "crypto";

const CONTRACT = StrKey.encodeContract(randomBytes(32));

// config se lee al importar: se fija el entorno antes de cargar los servicios.
process.env.PLATFORM_SECRET_KEY = Keypair.random().secret();
process.env.MOCK_STELLAR = "false";
process.env.ALLOW_IN_MEMORY_DB = "true";
process.env.STELLAR_NETWORK = "TESTNET";
process.env.ESCROW_CONTRACTS = `XLM=${CONTRACT}`;

const { getRefundEligibility, refundTrade, sweepPendingRefunds, prepareLockTrade, lockTrade } = await import("../services/trade.service.js");
const { tradeDeadline, estimateFromLedgers } = await import("../services/fundsDeadline.service.js");
const { lockConfirmation, LOCK_TIMEOUT_MINUTES } = await import("../services/stellar.service.js");
const { setRpcServerFactoryForTests } = await import("../lib/stellarRpc.js");
const { AppError } = await import("../utils/errors.js");
const db = (await import("../db/schema.js")).default;

lockConfirmation.polls = 2;
lockConfirmation.intervalMs = 1;

const AMOUNT = 5_000_000_000n;
const request = { log: { error() {}, warn() {}, info() {}, debug() {} }, headers: {} } as any;

// ── RPC simulado ───────────────────────────────────────────────────────────

const rpc = {
  latestLedger: 9_000 as number | "down",
  onChain: "locked" as "locked" | "not_found" | "rpc_down",
  timeoutLedger: 10_000,
  seller: "",
  buyer: "",
  sent: 0,
  txStatus: "SUCCESS",
};

function onChainTrade(): xdr.ScVal {
  return nativeToScVal({
    amount: nativeToScVal(AMOUNT, { type: "i128" }),
    buyer: new Address(rpc.buyer).toScVal(),
    platform_fee: nativeToScVal(0n, { type: "i128" }),
    secret_hash: nativeToScVal(Buffer.alloc(32), { type: "bytes" }),
    seller: new Address(rpc.seller).toScVal(),
    status: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Locked")]),
    timeout_ledger: nativeToScVal(rpc.timeoutLedger, { type: "u32" }),
  });
}

setRpcServerFactoryForTests(async () => ({
  getAccount: async (address: string) => new Account(address, "1"),
  prepareTransaction: async (tx: any) => tx,
  getLatestLedger: async () => {
    if (rpc.latestLedger === "down") throw new Error("socket hang up");
    return { sequence: rpc.latestLedger };
  },
  sendTransaction: async (tx: any) => {
    rpc.sent++;
    return { status: "PENDING", hash: tx.hash().toString("hex") };
  },
  getTransaction: async () => ({ status: rpc.txStatus }),
  simulateTransaction: async () => {
    const latest = rpc.latestLedger === "down" ? 9_000 : rpc.latestLedger;
    if (rpc.onChain === "rpc_down") throw new Error("socket hang up");
    if (rpc.onChain === "not_found") {
      return { id: "1", latestLedger: latest, events: [], _parsed: true, error: "HostError: Error(Contract, #3)" };
    }
    return { id: "1", latestLedger: latest, events: [], _parsed: true, transactionData: {}, result: { auth: [], retval: onChainTrade() } };
  },
}) as any);

// ── Datos ──────────────────────────────────────────────────────────────────

async function insertUser(address: string, label: string): Promise<string> {
  const row = await db.getOne<{ id: string }>(
    "INSERT INTO users (stellar_address, username) VALUES ($1, $2) RETURNING id",
    [address, `funds_${label}_${Math.random().toString(36).slice(2, 8)}`],
  );
  if (!row?.id) throw new Error("Failed to seed user");
  return row.id;
}

interface Fixture { tradeId: string; sellerId: string; buyerId: string; seller: Keypair; buyer: string; secretHash: string }

async function fixture(opts: {
  status?: string;
  expiresInMinutes: number;
  locked?: boolean;
  fundsTimeoutLedger?: number | null;
}): Promise<Fixture> {
  const seller = Keypair.random();
  const buyer = Keypair.random().publicKey();
  rpc.seller = seller.publicKey();
  rpc.buyer = buyer;
  const sellerId = await insertUser(seller.publicKey(), "s");
  const buyerId = await insertUser(buyer, "b");
  const secretHash = randomBytes(32).toString("hex");
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO trades
       (seller_id, buyer_id, flow, provider_id, amount_mxn, amount_stroops, platform_fee_mxn, rate_mxn,
        secret_hash, status, asset_code, escrow_contract_id, expires_at, lock_tx_hash, funds_timeout_ledger)
     VALUES ($1, $2, 'cashout', $2, 500, 5000000000, 0, '1', $3, $4, 'XLM', $5, $6, $7, $8)
     RETURNING id`,
    [
      sellerId, buyerId, secretHash, opts.status ?? "locked", CONTRACT,
      new Date(Date.now() + opts.expiresInMinutes * 60_000).toISOString(),
      opts.locked === false ? null : `lock_${randomBytes(8).toString("hex")}`,
      opts.fundsTimeoutLedger ?? null,
    ],
  );
  if (!row?.id) throw new Error("Failed to seed trade");
  return { tradeId: row.id, sellerId, buyerId, seller, buyer, secretHash };
}

async function row(tradeId: string): Promise<Record<string, any>> {
  const r = await db.getOne("SELECT * FROM trades WHERE id = $1", [tradeId]);
  if (!r) throw new Error("trade missing");
  return r;
}

async function expectCode(fn: () => Promise<unknown>, code: string, what: string) {
  try {
    await fn();
  } catch (err) {
    ok(err instanceof AppError, `${what}: expected AppError, got ${err}`);
    strictEqual((err as InstanceType<typeof AppError>).code, code, what);
    return;
  }
  throw new Error(`${what}: expected ${code} but nothing was thrown`);
}

// ── Pruebas ────────────────────────────────────────────────────────────────

async function testLedgerDecidesNotExpiresAt() {
  // Creada a las 12:00 y bloqueada a las 12:30: a las 14:05 la SOLICITUD ya
  // vencio, pero los fondos siguen bloqueados hasta las 14:30 en cadena.
  const f = await fixture({ expiresInMinutes: -5, fundsTimeoutLedger: 10_000 });
  rpc.latestLedger = 10_000 - 300; // 25 min antes del plazo

  const before = await getRefundEligibility(f.tradeId, f.sellerId);
  strictEqual(before.eligible, false);
  strictEqual(before.reason, "not_expired_yet", "expires_at passed, ledger did not");
  ok(before.seconds_remaining >= 1490 && before.seconds_remaining <= 1500, `~25 min left, got ${before.seconds_remaining}`);
  await expectCode(() => refundTrade(request, f.tradeId, f.sellerId), "TRADE_NOT_EXPIRED", "refund before the ledger");

  rpc.latestLedger = 9_999;
  strictEqual((await getRefundEligibility(f.tradeId, f.sellerId)).eligible, false, "one ledger short");
  rpc.latestLedger = 10_000;
  const at = await getRefundEligibility(f.tradeId, f.sellerId);
  strictEqual(at.eligible, true, "sequence >= timeout_ledger, like the contract");
  strictEqual(at.seconds_remaining, 0);
  console.log("  ✓ el reembolso lo decide el ledger del contrato (borde exacto incluido), no expires_at");
}

async function testUnreadableIsNeverExpired() {
  const f = await fixture({ expiresInMinutes: -60, fundsTimeoutLedger: 10_000 });
  rpc.latestLedger = "down";
  const e = await getRefundEligibility(f.tradeId, f.sellerId);
  strictEqual(e.eligible, false);
  strictEqual(e.reason, "unverifiable");
  await expectCode(() => refundTrade(request, f.tradeId, f.sellerId), "ESCROW_UNVERIFIABLE", "RPC down");

  // Sin plazo guardado y sin escrow en el contrato: tampoco se da por vencido.
  const g = await fixture({ expiresInMinutes: -60, fundsTimeoutLedger: null });
  rpc.latestLedger = 20_000;
  rpc.onChain = "not_found";
  strictEqual((await getRefundEligibility(g.tradeId, g.sellerId)).reason, "unverifiable");
  rpc.onChain = "locked";
  console.log("  ✓ RPC caido o escrow ilegible: no verificable, nunca \"ya vencio\"");
}

async function testMissingTimeoutIsReadAndStored() {
  const f = await fixture({ expiresInMinutes: -60, fundsTimeoutLedger: null });
  rpc.latestLedger = 9_000;
  rpc.timeoutLedger = 9_500;
  rpc.onChain = "locked";
  const e = await getRefundEligibility(f.tradeId, f.sellerId);
  strictEqual(e.reason, "not_expired_yet");
  const r = await row(f.tradeId);
  strictEqual(r.funds_timeout_ledger, 9_500, "read from get_trade and stored");
  ok(r.funds_expires_at_estimate, "estimate stored");
  rpc.timeoutLedger = 10_000;
  console.log("  ✓ una operacion sin plazo guardado lo lee del contrato y lo guarda");
}

async function testSweepWaitsForTheLedger() {
  const f = await fixture({ status: "cancelled", expiresInMinutes: -10, fundsTimeoutLedger: 10_000 });
  rpc.latestLedger = 9_900;
  rpc.sent = 0;
  const { swept, failed } = await sweepPendingRefunds(request);
  strictEqual(swept, 0);
  strictEqual(failed, 0, "nothing was attempted");
  strictEqual(rpc.sent, 0, "no refund transaction was sent");
  strictEqual((await row(f.tradeId)).status, "cancelled", "not refunded before the on-chain timeout");
  console.log("  ✓ el sweep no reembolsa antes del plazo en cadena");
}

async function testLockCapturesFundsTimeout() {
  const f = await fixture({ status: "pending", expiresInMinutes: 120, locked: false });
  rpc.latestLedger = 50_000;
  rpc.timeoutLedger = 50_000 + LOCK_TIMEOUT_MINUTES * 12;
  rpc.txStatus = "SUCCESS";
  const tx = new TransactionBuilder(new Account(f.seller.publicKey(), "1"), { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(CONTRACT).call(
      "lock",
      nativeToScVal(f.seller.publicKey(), { type: "address" }),
      nativeToScVal(f.buyer, { type: "address" }),
      nativeToScVal(AMOUNT, { type: "i128" }),
      nativeToScVal(0n, { type: "i128" }),
      nativeToScVal(Buffer.from(f.secretHash, "hex"), { type: "bytes" }),
      nativeToScVal(LOCK_TIMEOUT_MINUTES, { type: "u32" }),
    ))
    .setTimeout(180)
    .build();
  tx.sign(f.seller);

  const res = await lockTrade(request, f.tradeId, f.sellerId, tx.toXDR());
  strictEqual(res.status, "locked");
  const r = await row(f.tradeId);
  strictEqual(r.funds_timeout_ledger, rpc.timeoutLedger, "timeout ledger stored at lock time");
  const minutes = (new Date(r.funds_expires_at_estimate).getTime() - Date.now()) / 60_000;
  ok(minutes > LOCK_TIMEOUT_MINUTES - 1 && minutes <= LOCK_TIMEOUT_MINUTES, `estimate ~${LOCK_TIMEOUT_MINUTES} min, got ${minutes}`);
  strictEqual(tradeDeadline(r).toISOString(), new Date(r.funds_expires_at_estimate).toISOString(), "locked trades show the funds deadline");
  rpc.timeoutLedger = 10_000;
  console.log("  ✓ el lock confirmado guarda el plazo en cadena y la app muestra ese");
}

async function testLockNeedsRequestMargin() {
  const short = await fixture({ status: "pending", expiresInMinutes: 29, locked: false });
  await expectCode(() => prepareLockTrade(request, short.tradeId, short.sellerId), "TRADE_EXPIRING", "29 min left");
  const enough = await fixture({ status: "pending", expiresInMinutes: 31, locked: false });
  const prepared = await prepareLockTrade(request, enough.tradeId, enough.sellerId) as any;
  ok(prepared.xdr, "31 min left: the XDR is built");
  console.log("  ✓ con menos de 30 min de solicitud no se bloquea; con 31 si");
}

function testDeadlineAndEstimate() {
  const now = new Date("2026-10-30T12:00:00Z");
  strictEqual(estimateFromLedgers(10_120, 10_000, now).toISOString(), "2026-10-30T12:10:00.000Z", "120 ledgers = 10 min");
  strictEqual(estimateFromLedgers(9_000, 10_000, now).toISOString(), now.toISOString(), "past timeout: now");
  const expiresAt = "2026-10-30T13:00:00.000Z";
  const estimate = "2026-10-30T13:30:00.000Z";
  strictEqual(tradeDeadline({ expires_at: expiresAt, lock_tx_hash: null, funds_expires_at_estimate: null }).toISOString(), expiresAt);
  strictEqual(tradeDeadline({ expires_at: expiresAt, lock_tx_hash: "h", funds_expires_at_estimate: null }).toISOString(), expiresAt, "no data yet: request expiry");
  strictEqual(tradeDeadline({ expires_at: expiresAt, lock_tx_hash: "h", funds_expires_at_estimate: estimate }).toISOString(), estimate);
  console.log("  ✓ estimacion de 5 s por ledger; con lock manda el plazo de los fondos");
}

(async () => {
  console.log("fundsDeadline (WP3)");
  testDeadlineAndEstimate();
  await testLedgerDecidesNotExpiresAt();
  await testUnreadableIsNeverExpired();
  await testMissingTimeoutIsReadAndStored();
  await testSweepWaitsForTheLedger();
  await testLockCapturesFundsTimeout();
  await testLockNeedsRequestMargin();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
