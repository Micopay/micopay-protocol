/**
 * WP5 del plan de correcciones del escrow: conciliacion contra la cadena.
 *
 * Con MOCK_STELLAR=false, store en memoria y RPC simulado:
 *   - un `released`/`refunded` perdido se recupera, y dos ciclos no duplican;
 *   - una fila terminal que contradice a la cadena se marca y no se reescribe;
 *   - RPC caido, archivado o escrow ajeno nunca producen un estado terminal;
 *   - nunca se envia una transaccion.
 */

import { strictEqual, ok } from "assert";
import {
  Keypair, Account, Address, StrKey, nativeToScVal, xdr,
} from "@stellar/stellar-sdk";
import { randomBytes } from "crypto";

const CONTRACT = StrKey.encodeContract(randomBytes(32));

process.env.PLATFORM_SECRET_KEY = Keypair.random().secret();
process.env.MOCK_STELLAR = "false";
process.env.ALLOW_IN_MEMORY_DB = "true";
process.env.STELLAR_NETWORK = "TESTNET";
process.env.ESCROW_CONTRACTS = `XLM=${CONTRACT}`;

const { reconcileEscrowTrades, decideReconciliation } = await import("../services/escrowReconciliation.service.js");
const { setRpcServerFactoryForTests } = await import("../lib/stellarRpc.js");
const { getTradeAuditTrail } = await import("../db/audit-log.model.js");
const db = (await import("../db/schema.js")).default;

const AMOUNT = 5_000_000_000n;

const rpc = {
  mode: "ok" as "ok" | "not_found" | "rpc_down" | "archived",
  status: "Locked" as "Locked" | "Released" | "Refunded",
  seller: "",
  buyer: "",
  amount: AMOUNT,
  sent: 0,
};

function onChainTrade(): xdr.ScVal {
  return nativeToScVal({
    amount: nativeToScVal(rpc.amount, { type: "i128" }),
    buyer: new Address(rpc.buyer).toScVal(),
    platform_fee: nativeToScVal(0n, { type: "i128" }),
    secret_hash: nativeToScVal(Buffer.alloc(32), { type: "bytes" }),
    seller: new Address(rpc.seller).toScVal(),
    status: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(rpc.status)]),
    timeout_ledger: nativeToScVal(10_000, { type: "u32" }),
  });
}

setRpcServerFactoryForTests(async () => ({
  getAccount: async (address: string) => new Account(address, "1"),
  sendTransaction: async () => { rpc.sent++; return { status: "PENDING", hash: "x" }; },
  simulateTransaction: async () => {
    if (rpc.mode === "rpc_down") throw new Error("socket hang up");
    if (rpc.mode === "not_found") {
      return { id: "1", latestLedger: 9_000, events: [], _parsed: true, error: "HostError: Error(Contract, #3)" };
    }
    if (rpc.mode === "archived") {
      return { id: "1", latestLedger: 9_000, events: [], _parsed: true, transactionData: {}, restorePreamble: { minResourceFee: "1", transactionData: {} }, result: { auth: [], retval: xdr.ScVal.scvVoid() } };
    }
    return { id: "1", latestLedger: 9_000, events: [], _parsed: true, transactionData: {}, result: { auth: [], retval: onChainTrade() } };
  },
}) as any);

async function insertUser(address: string): Promise<string> {
  const row = await db.getOne<{ id: string }>(
    "INSERT INTO users (stellar_address, username) VALUES ($1, $2) RETURNING id",
    [address, `recon_${Math.random().toString(36).slice(2, 10)}`],
  );
  if (!row?.id) throw new Error("Failed to seed user");
  return row.id;
}

async function clearTrades() {
  for (const r of await db.getMany<{ id: string }>("SELECT id FROM trades")) {
    await db.execute("UPDATE trades SET lock_tx_hash = NULL, lock_submitted_tx_hash = NULL WHERE id = $1", [r.id]);
  }
}

async function fixture(status: string, opts: { lock?: boolean; submitted?: boolean; timeout?: number | null } = {}): Promise<string> {
  await clearTrades();
  const seller = Keypair.random().publicKey();
  const buyer = Keypair.random().publicKey();
  rpc.seller = seller;
  rpc.buyer = buyer;
  rpc.amount = AMOUNT;
  rpc.mode = "ok";
  const sellerId = await insertUser(seller);
  const buyerId = await insertUser(buyer);
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO trades
       (seller_id, buyer_id, flow, provider_id, amount_mxn, amount_stroops, platform_fee_mxn, rate_mxn,
        secret_hash, status, asset_code, escrow_contract_id, expires_at, lock_tx_hash, lock_submitted_tx_hash, funds_timeout_ledger, secret_enc)
     VALUES ($1, $2, 'cashout', $2, 500, 5000000000, 0, '1', $3, $4, 'XLM', $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      sellerId, buyerId, randomBytes(32).toString("hex"), status, CONTRACT,
      new Date(Date.now() + 3_600_000).toISOString(),
      opts.lock === false ? null : `lock_${randomBytes(8).toString("hex")}`,
      opts.submitted ? `sub_${randomBytes(8).toString("hex")}` : null,
      opts.timeout === undefined ? 10_000 : opts.timeout,
      "enc",
    ],
  );
  if (!row?.id) throw new Error("Failed to seed trade");
  return row.id;
}

async function row(id: string): Promise<Record<string, any>> {
  const r = await db.getOne("SELECT * FROM trades WHERE id = $1", [id]);
  if (!r) throw new Error("trade missing");
  return r;
}

async function reconciliationEvents(id: string) {
  return (await getTradeAuditTrail(id)).filter((e) => e.actor === "system:reconciliation");
}

async function testLostReleaseIsRecovered() {
  const id = await fixture("locked");
  rpc.status = "Released";
  const first = await reconcileEscrowTrades();
  strictEqual(first.corrected, 1);
  const r = await row(id);
  strictEqual(r.status, "completed");
  ok(!r.secret_enc, "secret cleared");
  const events = await reconciliationEvents(id);
  strictEqual(events.length, 1);
  strictEqual(events[0].metadata.evidence, "reconciled");
  strictEqual(events[0].metadata.contract_id, CONTRACT);
  strictEqual(events[0].metadata.ledger, 9_000);

  const second = await reconcileEscrowTrades();
  strictEqual(second.corrected, 0, "second cycle corrects nothing");
  strictEqual((await reconciliationEvents(id)).length, 1, "second cycle adds no audit event");
  strictEqual(rpc.sent, 0, "never sends a transaction");
  console.log("  ✓ un released perdido se recupera y dos ciclos no duplican");
}

async function testLostRefundFromCancelled() {
  const id = await fixture("cancelled");
  rpc.status = "Refunded";
  await reconcileEscrowTrades();
  strictEqual((await row(id)).status, "refunded");
  console.log("  ✓ un refund perdido pasa de cancelled a refunded");
}

async function testPendingWithAttemptAdoptsItsHash() {
  const id = await fixture("pending", { lock: false, submitted: true });
  rpc.status = "Released";
  await reconcileEscrowTrades();
  const r = await row(id);
  strictEqual(r.status, "completed");
  strictEqual(r.lock_tx_hash, r.lock_submitted_tx_hash, "the attempt becomes the lock");
  console.log("  ✓ un intento pendiente ya liquidado en cadena se cierra con su hash");
}

async function testFalseRefundedIsFlaggedNotRewritten() {
  const id = await fixture("refunded");
  rpc.status = "Locked";
  const counts = await reconcileEscrowTrades();
  strictEqual(counts.review, 1);
  let r = await row(id);
  strictEqual(r.status, "refunded", "never rewritten");
  strictEqual(r.chain_review_reason, "chain_locked_db_settled");
  ok(r.chain_review_at, "review timestamp");

  await reconcileEscrowTrades();
  strictEqual((await reconciliationEvents(id)).length, 1, "the same discrepancy is logged once");

  // La siguiente lectura ya coincide (la cadena alcanzo a la base): se cierra sola.
  rpc.status = "Refunded";
  await reconcileEscrowTrades();
  r = await row(id);
  strictEqual(r.chain_review_reason, null, "review cleared when the chain agrees");
  strictEqual(r.status, "refunded");
  console.log("  ✓ un refunded falso con la cadena en Locked se marca, no se reescribe");
}

async function testConflictingSettlementIsFlagged() {
  const id = await fixture("completed");
  rpc.status = "Refunded";
  await reconcileEscrowTrades();
  const r = await row(id);
  strictEqual(r.status, "completed");
  strictEqual(r.chain_review_reason, "settlement_conflict");
  console.log("  ✓ completed contra Refunded en cadena se marca, no se reescribe");
}

async function testUnreadableChangesNothing() {
  for (const mode of ["rpc_down", "archived"] as const) {
    const id = await fixture("locked");
    rpc.mode = mode;
    const counts = await reconcileEscrowTrades();
    strictEqual(counts.unreadable, 1, `${mode}: counted`);
    const r = await row(id);
    strictEqual(r.status, "locked", `${mode}: state untouched`);
    strictEqual(r.chain_review_reason ?? null, null, `${mode}: no review`);
    strictEqual(r.chain_checked_at ?? null, null, `${mode}: not counted as checked`);
  }
  console.log("  ✓ RPC caido o registro archivado no cambian nada");
}

async function testNotFoundIsFlaggedNotSettled() {
  const id = await fixture("locked");
  rpc.mode = "not_found";
  await reconcileEscrowTrades();
  const r = await row(id);
  strictEqual(r.status, "locked");
  strictEqual(r.chain_review_reason, "escrow_not_found");

  const pending = await fixture("pending", { lock: false, submitted: true });
  rpc.mode = "not_found";
  await reconcileEscrowTrades();
  strictEqual((await row(pending)).chain_review_reason ?? null, null, "unconfirmed attempts belong to WP2");
  console.log("  ✓ con lock y sin escrow se marca como no verificable, sin estado terminal");
}

async function testForeignEscrowIsNotApplied() {
  const id = await fixture("locked");
  rpc.status = "Released";
  rpc.amount = AMOUNT + 1n;
  await reconcileEscrowTrades();
  const r = await row(id);
  strictEqual(r.status, "locked", "a mismatched escrow never settles the row");
  strictEqual(r.chain_review_reason, "escrow_mismatch");
  console.log("  ✓ un escrow que no coincide no liquida la fila");
}

async function testMissingTimeoutIsCaptured() {
  const id = await fixture("locked", { timeout: null });
  rpc.status = "Locked";
  await reconcileEscrowTrades();
  const r = await row(id);
  strictEqual(r.funds_timeout_ledger, 10_000);
  ok(r.funds_expires_at_estimate, "estimate stored");
  strictEqual(r.status, "locked");
  console.log("  ✓ Locked en cadena con fila abierta solo completa el plazo que falta");
}

async function testContractScope() {
  const id = await fixture("locked");
  rpc.status = "Released";
  const other = await reconcileEscrowTrades({ contractId: StrKey.encodeContract(randomBytes(32)) });
  strictEqual(other.checked, 0, "another contract's gap does not touch this row");
  strictEqual((await row(id)).status, "locked");
  const own = await reconcileEscrowTrades({ contractId: CONTRACT });
  strictEqual(own.corrected, 1);
  console.log("  ✓ un hueco del listener concilia solo las filas de su contrato");
}

function testDecisionTable() {
  const expected = { seller: "S", buyer: "B", amountStroops: 1n };
  const chain = (status: "Locked" | "Released" | "Refunded") => ({ seller: "S", buyer: "B", amount: 1n, platformFee: 0n, timeoutLedger: 5, status });
  const open = { status: "revealing", lock_tx_hash: "h", funds_timeout_ledger: 5 };
  strictEqual(decideReconciliation(open, chain("Locked"), expected).kind, "none");
  strictEqual(decideReconciliation({ status: "completed", lock_tx_hash: "h" }, chain("Released"), expected).kind, "none");
  strictEqual(decideReconciliation({ status: "refunded", lock_tx_hash: "h" }, chain("Refunded"), expected).kind, "none");
  strictEqual(decideReconciliation({ status: "refunded", lock_tx_hash: "h" }, null, expected).kind, "none", "settled and gone from storage");
  console.log("  ✓ las filas que coinciden con la cadena no generan accion");
}

(async () => {
  console.log("reconciliation (WP5)");
  testDecisionTable();
  await testLostReleaseIsRecovered();
  await testLostRefundFromCancelled();
  await testPendingWithAttemptAdoptsItsHash();
  await testFalseRefundedIsFlaggedNotRewritten();
  await testConflictingSettlementIsFlagged();
  await testUnreadableChangesNothing();
  await testNotFoundIsFlaggedNotSettled();
  await testForeignEscrowIsNotApplied();
  await testMissingTimeoutIsCaptured();
  await testContractScope();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
