/**
 * WP1b del plan de correcciones del escrow (2026-10-29): antes de registrar
 * una entrega de efectivo, el escrow debe seguir bloqueado EN CADENA, ser de
 * esta operacion y tener margen (decision de producto: 20 minutos).
 *
 * Cubre:
 *   - evaluateEscrowCollectable: la decision pura, incluido el borde exacto
 *     del margen.
 *   - readEscrowTrade: como se traduce la respuesta de `get_trade` (RPC
 *     simulado), y que "no pude leer" nunca se confunda con "no existe".
 *   - assertEscrowCollectable: de punta a punta con MOCK_STELLAR=false, store
 *     en memoria y RPC simulado.
 *
 * Sin red: el RPC se sustituye con setRpcServerFactoryForTests.
 */

import { strictEqual, ok } from "assert";
import { Keypair, Account, Address, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { randomBytes } from "crypto";

// config se lee al importar: se fija el entorno antes de cargar los servicios.
process.env.PLATFORM_SECRET_KEY = Keypair.random().secret();
process.env.MOCK_STELLAR = "false";
process.env.ALLOW_IN_MEMORY_DB = "true";
process.env.STELLAR_NETWORK = "TESTNET";
process.env.ESCROW_CONTRACTS = `XLM=${"C".repeat(56)}`;

const { evaluateEscrowCollectable, assertEscrowCollectable } = await import("../services/escrowCollectable.service.js");
const { readEscrowTrade } = await import("../services/stellar.service.js");
const { setRpcServerFactoryForTests } = await import("../lib/stellarRpc.js");
const { AppError } = await import("../utils/errors.js");
const db = (await import("../db/schema.js")).default;

const SELLER = Keypair.random().publicKey();
const BUYER = Keypair.random().publicKey();
const CONTRACT = StrKey.encodeContract(randomBytes(32));

type OnChain = Parameters<typeof evaluateEscrowCollectable>[0]["onChain"];

function locked(overrides: Partial<NonNullable<OnChain>> = {}): NonNullable<OnChain> {
  return {
    seller: SELLER,
    buyer: BUYER,
    amount: 5_000_000_000n,
    platformFee: 40_000_000n,
    timeoutLedger: 10_000,
    status: "Locked",
    ...overrides,
  };
}

const expected = { seller: SELLER, buyer: BUYER, amountStroops: 5_000_000_000n };

// ── evaluateEscrowCollectable ──────────────────────────────────────────────

function testCollectableWithMargin() {
  const v = evaluateEscrowCollectable({ onChain: locked(), expected, latestLedger: 9_000, minMarginMinutes: 20 });
  ok(v.collectable, "1000 ledgers (~83 min) left is collectable");
  console.log("  ✓ bloqueado, de esta operacion y con margen: se puede cobrar");
}

function testMarginBoundary() {
  // 20 min = 240 ledgers de 5 s.
  const atLimit = evaluateEscrowCollectable({ onChain: locked(), expected, latestLedger: 10_000 - 240, minMarginMinutes: 20 });
  ok(atLimit.collectable, "exactly 20 min left is enough");
  const short = evaluateEscrowCollectable({ onChain: locked(), expected, latestLedger: 10_000 - 239, minMarginMinutes: 20 });
  strictEqual(short.collectable, false);
  strictEqual(!short.collectable && short.reason, "insufficient_margin");
  const past = evaluateEscrowCollectable({ onChain: locked(), expected, latestLedger: 10_500, minMarginMinutes: 20 });
  strictEqual(!past.collectable && past.reason, "insufficient_margin", "already past the timeout");
  console.log("  ✓ el margen cuenta 20 min exactos como suficiente y 19:55 como insuficiente");
}

function testNotLockedOrMissing() {
  for (const status of ["Released", "Refunded"] as const) {
    const v = evaluateEscrowCollectable({ onChain: locked({ status }), expected, latestLedger: 9_000, minMarginMinutes: 20 });
    strictEqual(!v.collectable && v.reason, "not_locked", `${status} is not collectable`);
  }
  const missing = evaluateEscrowCollectable({ onChain: null, expected, latestLedger: 9_000, minMarginMinutes: 20 });
  strictEqual(!missing.collectable && missing.reason, "not_found");
  console.log("  ✓ liberado, reembolsado o inexistente en cadena: no se cobra");
}

function testMismatch() {
  const other = Keypair.random().publicKey();
  for (const onChain of [locked({ seller: other }), locked({ buyer: other }), locked({ amount: 1n })]) {
    const v = evaluateEscrowCollectable({ onChain, expected, latestLedger: 9_000, minMarginMinutes: 20 });
    strictEqual(!v.collectable && v.reason, "mismatch");
  }
  console.log("  ✓ otro seller, otro buyer u otro monto en cadena: no se cobra");
}

// ── readEscrowTrade con RPC simulado ───────────────────────────────────────

function tradeScVal(status: string): xdr.ScVal {
  return nativeToScVal({
    amount: nativeToScVal(5_000_000_000n, { type: "i128" }),
    buyer: new Address(BUYER).toScVal(),
    platform_fee: nativeToScVal(40_000_000n, { type: "i128" }),
    secret_hash: nativeToScVal(Buffer.alloc(32), { type: "bytes" }),
    seller: new Address(SELLER).toScVal(),
    status: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(status)]),
    timeout_ledger: nativeToScVal(10_000, { type: "u32" }),
  });
}

function useSimulation(sim: unknown) {
  setRpcServerFactoryForTests(async () => ({
    getAccount: async (address: string) => new Account(address, "1"),
    simulateTransaction: async () => sim,
  }) as any);
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

async function testReadParsesTrade() {
  useSimulation({ id: "1", latestLedger: 9_000, events: [], _parsed: true, transactionData: {}, result: { auth: [], retval: tradeScVal("Locked") } });
  const { trade, latestLedger } = await readEscrowTrade({ contractId: CONTRACT, tradeIdBytes: Buffer.alloc(32) });
  strictEqual(latestLedger, 9_000);
  strictEqual(trade?.status, "Locked");
  strictEqual(trade?.seller, SELLER);
  strictEqual(trade?.buyer, BUYER);
  strictEqual(trade?.amount, 5_000_000_000n);
  strictEqual(trade?.timeoutLedger, 10_000);
  console.log("  ✓ readEscrowTrade traduce get_trade (enum como [\"Locked\"])");
}

async function testReadNotFound() {
  useSimulation({ id: "1", latestLedger: 9_001, events: [], _parsed: true, error: "HostError: Error(Contract, #3)" });
  const { trade, latestLedger } = await readEscrowTrade({ contractId: CONTRACT, tradeIdBytes: Buffer.alloc(32) });
  strictEqual(trade, null, "TradeNotFound means the contract has no such escrow");
  strictEqual(latestLedger, 9_001);
  console.log("  ✓ readEscrowTrade devuelve null solo con TradeNotFound (#3)");
}

async function testReadUnverifiable() {
  useSimulation({ id: "1", latestLedger: 9_002, events: [], _parsed: true, error: "HostError: Error(Storage, MissingValue)" });
  await expectCode(() => readEscrowTrade({ contractId: CONTRACT, tradeIdBytes: Buffer.alloc(32) }), "ESCROW_UNVERIFIABLE", "other simulation error");

  useSimulation({
    id: "1", latestLedger: 9_003, events: [], _parsed: true, transactionData: {},
    result: { auth: [], retval: tradeScVal("Locked") },
    restorePreamble: { minResourceFee: "1", transactionData: {} },
  });
  await expectCode(() => readEscrowTrade({ contractId: CONTRACT, tradeIdBytes: Buffer.alloc(32) }), "ESCROW_UNVERIFIABLE", "archived entry");

  setRpcServerFactoryForTests(async () => ({
    getAccount: async (address: string) => new Account(address, "1"),
    simulateTransaction: async () => { throw new Error("socket hang up"); },
  }) as any);
  let threw = false;
  try {
    await readEscrowTrade({ contractId: CONTRACT, tradeIdBytes: Buffer.alloc(32) });
  } catch {
    threw = true;
  }
  ok(threw, "an RPC failure is never read as 'no escrow'");
  console.log("  ✓ otro error, registro archivado o RPC caído: no verificable, nunca \"no existe\"");
}

// ── assertEscrowCollectable de punta a punta ───────────────────────────────

async function insertUser(address: string, label: string): Promise<string> {
  const row = await db.getOne<{ id: string }>(
    "INSERT INTO users (stellar_address, username) VALUES ($1, $2) RETURNING id",
    [address, `collectable_${label}_${Math.random().toString(36).slice(2, 8)}`],
  );
  if (!row?.id) throw new Error("Failed to seed user");
  return row.id;
}

async function testAssertRejectsReleasedEscrow() {
  const sellerId = await insertUser(SELLER, "s");
  const buyerId = await insertUser(BUYER, "b");
  const trade = {
    id: "trade-collectable-1",
    seller_id: sellerId,
    buyer_id: buyerId,
    amount_stroops: "5000000000",
    secret_hash: "ab".repeat(32),
    escrow_contract_id: CONTRACT,
  };

  useSimulation({ id: "1", latestLedger: 9_000, events: [], _parsed: true, transactionData: {}, result: { auth: [], retval: tradeScVal("Released") } });
  await expectCode(() => assertEscrowCollectable(trade), "ESCROW_NOT_LOCKED", "released escrow");

  useSimulation({ id: "1", latestLedger: 9_900, events: [], _parsed: true, transactionData: {}, result: { auth: [], retval: tradeScVal("Locked") } });
  await expectCode(() => assertEscrowCollectable(trade), "ESCROW_INSUFFICIENT_MARGIN", "100 ledgers left");

  useSimulation({ id: "1", latestLedger: 9_000, events: [], _parsed: true, transactionData: {}, result: { auth: [], retval: tradeScVal("Locked") } });
  await assertEscrowCollectable(trade);
  console.log("  ✓ assertEscrowCollectable rechaza liberado o sin margen y deja pasar el caso sano");
}

async function main() {
  console.log("\n  WP1b · escrow cobrable antes de entregar efectivo:\n");
  testCollectableWithMargin();
  testMarginBoundary();
  testNotLockedOrMissing();
  testMismatch();
  await testReadParsesTrade();
  await testReadNotFound();
  await testReadUnverifiable();
  await testAssertRejectsReleasedEscrow();
  setRpcServerFactoryForTests(null);
  console.log("\nAll escrow collectable tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
