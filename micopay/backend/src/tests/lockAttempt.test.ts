/**
 * WP2 del plan de correcciones del escrow (2026-10-29), hallazgo N1: un lock
 * enviado nunca queda huerfano.
 *
 * Cubre, con MOCK_STELLAR=false, store en memoria y RPC simulado:
 *   - el hash se guarda ANTES de enviar y sobrevive a una confirmacion lenta;
 *   - TRY_AGAIN_LATER y ERROR no dejan la fila marcada como enviada;
 *   - con un intento sin resolver no se envia ni se prepara otro XDR;
 *   - el ciclo de fondo resuelve por `getTransaction` y, pasada la ventana de
 *     validez, por `get_trade` (incluido el desacuerdo, que no se aplica);
 *   - un lock que entra despues de cancelar queda listo para el sweep;
 *   - el evento `locked` confirma solo si seller, buyer y monto coinciden.
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

const { lockTrade, prepareLockTrade, cancelTrade } = await import("../services/trade.service.js");
const { lockConfirmation, LOCK_TIMEOUT_MINUTES } = await import("../services/stellar.service.js");
const { resolveSubmittedLocks, lockAttemptMayHaveLanded, contractTradeIdFor } = await import("../services/lockAttempt.service.js");
const { applyEscrowEvent, parseEscrowEvent } = await import("../services/event-dispatcher.service.js");
const { scValToNative } = await import("@stellar/stellar-sdk");
const { setRpcServerFactoryForTests, StellarSubmitUncertainError } = await import("../lib/stellarRpc.js");
const { AppError } = await import("../utils/errors.js");
const db = (await import("../db/schema.js")).default;

lockConfirmation.polls = 2;
lockConfirmation.intervalMs = 1;

const AMOUNT = 5_000_000_000n;
const request = { log: { error() {}, warn() {}, info() {}, debug() {} }, headers: {} } as any;

// ── RPC simulado ───────────────────────────────────────────────────────────

interface FakeRpc {
  send: string;
  txStatus: string;
  onChain: xdr.ScVal | "not_found" | "rpc_down";
  sent: number;
}
const rpc: FakeRpc = { send: "PENDING", txStatus: "NOT_FOUND", onChain: "not_found", sent: 0 };

setRpcServerFactoryForTests(async () => ({
  getAccount: async (address: string) => new Account(address, "1"),
  sendTransaction: async (tx: any) => {
    rpc.sent++;
    return { status: rpc.send, hash: tx.hash().toString("hex") };
  },
  getTransaction: async () => ({ status: rpc.txStatus }),
  simulateTransaction: async () => {
    if (rpc.onChain === "rpc_down") throw new Error("socket hang up");
    if (rpc.onChain === "not_found") {
      return { id: "1", latestLedger: 9_000, events: [], _parsed: true, error: "HostError: Error(Contract, #3)" };
    }
    return { id: "1", latestLedger: 9_000, events: [], _parsed: true, transactionData: {}, result: { auth: [], retval: rpc.onChain } };
  },
}) as any);

function resetRpc(over: Partial<FakeRpc> = {}) {
  Object.assign(rpc, { send: "PENDING", txStatus: "NOT_FOUND", onChain: "not_found", sent: 0 }, over);
}

function onChainTrade(seller: string, buyer: string, amount = AMOUNT, status = "Locked"): xdr.ScVal {
  return nativeToScVal({
    amount: nativeToScVal(amount, { type: "i128" }),
    buyer: new Address(buyer).toScVal(),
    platform_fee: nativeToScVal(0n, { type: "i128" }),
    secret_hash: nativeToScVal(Buffer.alloc(32), { type: "bytes" }),
    seller: new Address(seller).toScVal(),
    status: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(status)]),
    timeout_ledger: nativeToScVal(10_000, { type: "u32" }),
  });
}

// ── Datos ──────────────────────────────────────────────────────────────────

interface Fixture {
  tradeId: string;
  sellerId: string;
  buyerId: string;
  seller: Keypair;
  buyer: string;
  secretHash: string;
}

async function insertUser(address: string, label: string): Promise<string> {
  const row = await db.getOne<{ id: string }>(
    "INSERT INTO users (stellar_address, username) VALUES ($1, $2) RETURNING id",
    [address, `lockattempt_${label}_${Math.random().toString(36).slice(2, 8)}`],
  );
  if (!row?.id) throw new Error("Failed to seed user");
  return row.id;
}

async function fixture(): Promise<Fixture> {
  const seller = Keypair.random();
  const buyer = Keypair.random().publicKey();
  const sellerId = await insertUser(seller.publicKey(), "s");
  const buyerId = await insertUser(buyer, "b");
  const secretHash = randomBytes(32).toString("hex");
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO trades
       (seller_id, buyer_id, flow, provider_id, amount_mxn, amount_stroops, platform_fee_mxn, rate_mxn,
        secret_hash, status, asset_code, escrow_contract_id, expires_at)
     VALUES ($1, $2, 'cashout', $2, 500, 5000000000, 0, '1', $3, 'pending', 'XLM', $4, $5)
     RETURNING id`,
    [sellerId, buyerId, secretHash, CONTRACT, new Date(Date.now() + 3_600_000).toISOString()],
  );
  if (!row?.id) throw new Error("Failed to seed trade");
  return { tradeId: row.id, sellerId, buyerId, seller, buyer, secretHash };
}

/** Un lock firmado por el vendedor, con los argumentos que el backend espera. */
function signedLock(f: Fixture, sequence = "1"): string {
  const tx = new TransactionBuilder(new Account(f.seller.publicKey(), sequence), { fee: "100", networkPassphrase: Networks.TESTNET })
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
  return tx.toXDR();
}

function hashOf(signedXdr: string): string {
  return TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET).hash().toString("hex");
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

async function ageAttempt(tradeId: string) {
  await db.execute("UPDATE trades SET lock_submitted_at = $2 WHERE id = $1", [tradeId, new Date(Date.now() - 10 * 60_000).toISOString()]);
}

// ── Pruebas ────────────────────────────────────────────────────────────────

async function testSlowConfirmationKeepsAttempt() {
  const f = await fixture();
  const signed = signedLock(f);
  resetRpc({ send: "PENDING", txStatus: "NOT_FOUND" });

  await expectCode(() => lockTrade(request, f.tradeId, f.sellerId, signed), "STELLAR_LOCK_PENDING", "slow confirmation");
  let r = await row(f.tradeId);
  strictEqual(r.status, "pending");
  strictEqual(r.lock_submitted_tx_hash, hashOf(signed), "hash stored before sending");
  ok(r.lock_submitted_at, "submission time stored");
  strictEqual(r.contract_trade_id, contractTradeIdFor(f.secretHash));

  // La transaccion entra despues: el ciclo de fondo la confirma.
  resetRpc({ txStatus: "SUCCESS" });
  const counts = await resolveSubmittedLocks();
  ok(counts.locked >= 1, "background cycle confirmed it");
  r = await row(f.tradeId);
  strictEqual(r.status, "locked");
  strictEqual(r.lock_tx_hash, hashOf(signed));
  strictEqual(r.lock_submitted_tx_hash, null, "attempt cleared once confirmed");
  console.log("  ✓ confirmacion lenta: la fila guarda el hash y termina `locked` cuando entra");
}

async function testNotAcceptedAndRejectedClearAttempt() {
  for (const [send, code] of [["TRY_AGAIN_LATER", "STELLAR_LOCK_NOT_ACCEPTED"], ["ERROR", "STELLAR_LOCK_SEND_FAILED"]] as const) {
    const f = await fixture();
    resetRpc({ send });
    await expectCode(() => lockTrade(request, f.tradeId, f.sellerId, signedLock(f)), code, send);
    const r = await row(f.tradeId);
    strictEqual(r.status, "pending");
    strictEqual(r.lock_submitted_tx_hash ?? null, null, `${send} does not leave an attempt`);
  }
  console.log("  ✓ TRY_AGAIN_LATER y ERROR no dejan la fila marcada como enviada");
}

async function testUnresolvedAttemptBlocksAnotherXdr() {
  const f = await fixture();
  const first = signedLock(f, "1");
  resetRpc();
  await expectCode(() => lockTrade(request, f.tradeId, f.sellerId, first), "STELLAR_LOCK_PENDING", "first attempt");

  // Otro XDR (otra secuencia) mientras el primero sigue sin resolver.
  resetRpc();
  await expectCode(() => lockTrade(request, f.tradeId, f.sellerId, signedLock(f, "2")), "LOCK_CONFIRMING", "second XDR");
  strictEqual(rpc.sent, 0, "nothing was sent");
  await expectCode(() => prepareLockTrade(request, f.tradeId, f.sellerId), "LOCK_CONFIRMING", "prepare");

  // El mismo XDR si se puede reenviar: la red lo aplica a lo sumo una vez.
  resetRpc();
  await expectCode(() => lockTrade(request, f.tradeId, f.sellerId, first), "STELLAR_LOCK_PENDING", "same XDR resent");
  strictEqual(rpc.sent, 1, "same envelope resent");
  strictEqual((await row(f.tradeId)).lock_submitted_tx_hash, hashOf(first), "an uncertain resend keeps the attempt");

  // Si el primero ya entro, prepare lo dice en vez de armar otro.
  resetRpc({ txStatus: "SUCCESS" });
  const prepared = await prepareLockTrade(request, f.tradeId, f.sellerId) as any;
  strictEqual(prepared.status, "locked");
  strictEqual(prepared.lock_tx_hash, hashOf(first));
  console.log("  ✓ con un intento sin resolver no se envia ni se prepara otro XDR; el mismo si");
}

async function testUncertainSubmissionKeepsAttempt() {
  ok(lockAttemptMayHaveLanded(new StellarSubmitUncertainError("h", new Error("timeout"))), "uncertain");
  ok(lockAttemptMayHaveLanded(new Error("anything else")), "unknown errors keep the attempt");
  strictEqual(lockAttemptMayHaveLanded({ code: "STELLAR_LOCK_SEND_FAILED" }), false);
  console.log("  ✓ solo una respuesta definitiva de la red descarta el intento");
}

async function testExpiredAttemptResolvedByGetTrade() {
  // No entro: paso la ventana y el contrato no lo tiene.
  const gone = await fixture();
  resetRpc();
  await expectCode(() => lockTrade(request, gone.tradeId, gone.sellerId, signedLock(gone)), "STELLAR_LOCK_PENDING", "gone");
  resetRpc({ txStatus: "NOT_FOUND", onChain: "not_found" });
  await resolveSubmittedLocks();
  strictEqual((await row(gone.tradeId)).lock_submitted_tx_hash, hashOf(signedLock(gone)), "within the validity window: still pending");
  await ageAttempt(gone.tradeId);
  await resolveSubmittedLocks();
  strictEqual((await row(gone.tradeId)).lock_submitted_tx_hash, null, "expired and not on chain: cleared");
  strictEqual((await row(gone.tradeId)).status, "pending");

  // Entro, pero el RPC ya no la conoce: get_trade lo encuentra.
  const landed = await fixture();
  resetRpc();
  await expectCode(() => lockTrade(request, landed.tradeId, landed.sellerId, signedLock(landed)), "STELLAR_LOCK_PENDING", "landed");
  await ageAttempt(landed.tradeId);
  resetRpc({ onChain: "rpc_down" });
  await resolveSubmittedLocks();
  strictEqual((await row(landed.tradeId)).status, "pending", "RPC down: nothing decided");
  ok((await row(landed.tradeId)).lock_submitted_tx_hash, "RPC down: attempt kept");
  resetRpc({ onChain: onChainTrade(landed.seller.publicKey(), landed.buyer) });
  await resolveSubmittedLocks();
  strictEqual((await row(landed.tradeId)).status, "locked", "found by get_trade");
  strictEqual((await row(landed.tradeId)).lock_tx_hash, hashOf(signedLock(landed)));

  // En cadena hay algo distinto: no se aplica.
  const other = await fixture();
  resetRpc();
  await expectCode(() => lockTrade(request, other.tradeId, other.sellerId, signedLock(other)), "STELLAR_LOCK_PENDING", "other");
  await ageAttempt(other.tradeId);
  resetRpc({ onChain: onChainTrade(other.seller.publicKey(), other.buyer, 1n) });
  await resolveSubmittedLocks();
  strictEqual((await row(other.tradeId)).status, "pending", "mismatch is not applied");
  ok((await row(other.tradeId)).lock_submitted_tx_hash, "mismatch keeps the attempt for review");
  console.log("  ✓ pasada la ventana, get_trade decide; RPC caido o desacuerdo no deciden nada");
}

async function testLockAfterCancelIsLeftForSweep() {
  const f = await fixture();
  const signed = signedLock(f);
  resetRpc();
  await expectCode(() => lockTrade(request, f.tradeId, f.sellerId, signed), "STELLAR_LOCK_PENDING", "before cancel");

  const cancelled = await cancelTrade(request, f.tradeId, f.sellerId, "test");
  strictEqual(cancelled.status, "cancelled");
  ok(cancelled.refund_expected, "an unresolved lock may hold funds");

  resetRpc({ txStatus: "SUCCESS" });
  await resolveSubmittedLocks();
  const r = await row(f.tradeId);
  strictEqual(r.status, "cancelled", "stays cancelled");
  strictEqual(r.lock_tx_hash, hashOf(signed), "but the lock is recorded, so the sweep refunds it");
  strictEqual(r.release_tx_hash ?? null, null);
  console.log("  ✓ un lock que entra despues de cancelar queda registrado para el sweep");
}

async function testLockedEvent() {
  const f = await fixture();
  resetRpc();
  await expectCode(() => lockTrade(request, f.tradeId, f.sellerId, signedLock(f)), "STELLAR_LOCK_PENDING", "event");

  const base = {
    type: "locked" as const,
    contractId: CONTRACT,
    contractTradeIdHex: contractTradeIdFor(f.secretHash),
    eventId: "0001-1",
    txHash: hashOf(signedLock(f)),
    ledger: 9_001,
  };
  await applyEscrowEvent({ ...base, lock: { seller: f.seller.publicKey(), buyer: f.buyer, amount: 1n } });
  strictEqual((await row(f.tradeId)).status, "pending", "different amount: not applied");

  await applyEscrowEvent({ ...base, contractId: StrKey.encodeContract(randomBytes(32)), lock: { seller: f.seller.publicKey(), buyer: f.buyer, amount: AMOUNT } });
  strictEqual((await row(f.tradeId)).status, "pending", "another contract: not applied");

  await applyEscrowEvent({ ...base, lock: { seller: f.seller.publicKey(), buyer: f.buyer, amount: AMOUNT } });
  const r = await row(f.tradeId);
  strictEqual(r.status, "locked");
  strictEqual(r.lock_tx_hash, base.txHash);
  console.log("  ✓ el evento `locked` confirma solo si contrato, seller, buyer y monto coinciden");
}

function testParseLockedEvent() {
  const seller = Keypair.random().publicKey();
  const buyer = Keypair.random().publicKey();
  const tradeId = randomBytes(32);
  const parsed = parseEscrowEvent({
    id: "0001-1",
    contractId: CONTRACT,
    inSuccessfulContractCall: true,
    topic: [xdr.ScVal.scvSymbol("locked")],
    value: xdr.ScVal.scvVec([
      nativeToScVal(tradeId, { type: "bytes" }),
      new Address(seller).toScVal(),
      new Address(buyer).toScVal(),
      nativeToScVal(AMOUNT, { type: "i128" }),
      nativeToScVal(10_000, { type: "u32" }),
    ]),
    txHash: "ab".repeat(32),
    ledger: 9_001,
  }, scValToNative);
  strictEqual(parsed?.type, "locked");
  strictEqual(parsed?.contractTradeIdHex, tradeId.toString("hex"));
  strictEqual(parsed?.lock?.seller, seller);
  strictEqual(parsed?.lock?.buyer, buyer);
  strictEqual(parsed?.lock?.amount, AMOUNT);
  console.log("  ✓ el evento `locked` del contrato trae seller, buyer y monto");
}

(async () => {
  console.log("lockAttempt (WP2)");
  testParseLockedEvent();
  await testSlowConfirmationKeepsAttempt();
  await testNotAcceptedAndRejectedClearAttempt();
  await testUnresolvedAttemptBlocksAnotherXdr();
  await testUncertainSubmissionKeepsAttempt();
  await testExpiredAttemptResolvedByGetTrade();
  await testLockAfterCancelIsLeftForSweep();
  await testLockedEvent();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
