/**
 * revealTrade · carrera entre la lectura y la escritura.
 *
 * EL HUECO: revealTrade leia la fila, comprobaba `locked` y despues hacia un
 * UPDATE sin condicion de estado. Si entre ambos pasos otra peticion movia la
 * operacion a `refunded` (o `cancelled`), el UPDATE la regresaba a `revealing`
 * y la base volvia a decir que el escrow se podia cobrar.
 *
 * Fija:
 *   - el caso sano: `locked` -> `revealing`.
 *   - la carrera: si la fila cambia entre el SELECT y el UPDATE, revealTrade
 *     lanza ConflictError y el estado que escribio la otra peticion se queda.
 *
 * Base en memoria (ALLOW_IN_MEMORY_DB=true): la carrera se simula metiendo la
 * escritura concurrente justo antes del UPDATE de revealTrade.
 */

import { strictEqual, ok } from "assert";
import db from "../db/schema.js";
import { revealTrade } from "../services/trade.service.js";
import { AppError } from "../utils/errors.js";

const fakeRequest = {
  ip: "127.0.0.1",
  headers: {},
  log: { info: () => {}, warn: () => {}, error: () => {} },
} as any;

let seq = 0;

async function createUser(label: string): Promise<string> {
  seq += 1;
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username, phone_hash)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [`G${"B".repeat(50)}${String(seq).padStart(5, "0")}`, `reveal_race_${label}_${seq}`, `hash_reveal_race_${seq}`],
  );
  if (!row?.id) throw new Error(`Failed to seed user ${label}`);
  return row.id;
}

async function insertLockedTrade(sellerId: string, buyerId: string): Promise<string> {
  const { encryptSecret, generateTradeSecret } = await import("../services/secret.service.js");
  const { secret, secretHash } = generateTradeSecret();
  const { encrypted, nonce } = encryptSecret(secret);
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO trades
       (seller_id, buyer_id, flow, provider_id, amount_mxn, amount_stroops, platform_fee_mxn,
        secret_hash, secret_enc, secret_nonce, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      sellerId, buyerId, "deposit", sellerId, 500, "5000000000", 4,
      secretHash, encrypted, nonce, "locked",
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    ],
  );
  if (!row?.id) throw new Error("Failed to insert trade");
  return row.id;
}

async function statusOf(tradeId: string): Promise<string | undefined> {
  const row = await db.getOne<{ status: string }>("SELECT status FROM trades WHERE id = $1", [tradeId]);
  return row?.status;
}

async function testRevealFromLocked() {
  const sellerId = await createUser("s");
  const buyerId = await createUser("b");
  const tradeId = await insertLockedTrade(sellerId, buyerId);

  const result = await revealTrade(fakeRequest, tradeId, sellerId);
  strictEqual(result.status, "revealing");
  strictEqual(await statusOf(tradeId), "revealing");
  console.log("  ✓ locked -> revealing en el caso sano");
}

async function testConcurrentRefundWins() {
  const sellerId = await createUser("s");
  const buyerId = await createUser("b");
  const tradeId = await insertLockedTrade(sellerId, buyerId);

  // Otra peticion reembolsa la operacion justo antes del UPDATE de revealTrade.
  const realExecute = db.execute;
  let injected = false;
  db.execute = (async (text: string, params?: any[]) => {
    if (!injected && /SET status = 'revealing'/.test(text)) {
      injected = true;
      await realExecute("UPDATE trades SET status = 'refunded' WHERE id = $1", [tradeId]);
    }
    return realExecute(text, params);
  }) as typeof db.execute;

  let threw: unknown = null;
  try {
    await revealTrade(fakeRequest, tradeId, sellerId);
  } catch (err) {
    threw = err;
  } finally {
    db.execute = realExecute;
  }

  ok(injected, "the concurrent refund was injected");
  ok(threw instanceof AppError, `expected a ConflictError, got ${threw}`);
  strictEqual((threw as InstanceType<typeof AppError>).httpStatus, 409);
  strictEqual(await statusOf(tradeId), "refunded", "reveal must not overwrite a concurrent refund");
  console.log("  ✓ un reembolso concurrente gana: revealTrade lanza 409 y no pisa refunded");
}

async function main() {
  console.log("\n  revealTrade · carrera lectura/escritura:\n");
  await testRevealFromLocked();
  await testConcurrentRefundWins();
  console.log("\nAll reveal race tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
