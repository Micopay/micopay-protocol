/**
 * WP3 · el límite de cancelaciones solo aplica con fondos bloqueados.
 *
 * Un lock que falla por un error del servidor deja la operación `pending`.
 * Cancelarla no mueve nada en cadena y no debe castigar al cliente con
 * CANCEL_COOLDOWN.
 */

import { strictEqual } from "assert";
import db, { pool } from "../db/schema.js";
import { cancelTrade } from "../services/trade.service.js";
import { AppError } from "../utils/errors.js";
import { config } from "../config.js";

const fakeRequest = {
  ip: "127.0.0.1",
  headers: {},
  log: { info: () => {}, warn: () => {}, error: () => {} },
} as any;

let seq = 0;
async function createUser(label: string): Promise<string> {
  seq++;
  const suffix = String(seq).padStart(2, "0");
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username, phone_hash, merchant_available, availability, is_suspended)
     VALUES ($1, $2, $3, $4, $5, false)
     RETURNING id`,
    [`G${"Q".repeat(53)}${suffix}`, `wp3_${label}_${suffix}`, `h_wp3_${label}_${suffix}`, true, "online"],
  );
  if (!row?.id) throw new Error(`Failed to seed ${label}`);
  return row.id;
}

async function insertTrade(clientId: string, providerId: string, locked: boolean): Promise<string> {
  seq++;
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO trades
       (seller_id, buyer_id, flow, provider_id, amount_mxn, amount_stroops, secret_hash,
        status, lock_tx_hash, expires_at)
     VALUES ($1, $2, 'cashout', $3, 500, 5000000000, $4, $5, $6, $7)
     RETURNING id`,
    [
      clientId,
      providerId,
      providerId,
      `wp3_${seq}_${Math.random()}`,
      locked ? "locked" : "pending",
      locked ? `mock_lock_${seq}` : null,
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    ],
  );
  if (!row?.id) throw new Error("Failed to insert trade");
  return row.id;
}

async function testFundedCancellationsStillHaveALimit() {
  const client = await createUser("funded");
  const provider = await createUser("prov");
  for (let i = 0; i < config.cancelCooldownThreshold; i++) {
    await cancelTrade(fakeRequest, await insertTrade(client, provider, true), client);
  }
  try {
    await cancelTrade(fakeRequest, await insertTrade(client, provider, true), client);
  } catch (err) {
    if (err instanceof AppError) {
      strictEqual(err.code, "CANCEL_COOLDOWN");
      console.log("  ✓ con fondos bloqueados el límite sigue aplicando");
      return;
    }
    throw err;
  }
  throw new Error("se esperaba CANCEL_COOLDOWN con fondos bloqueados");
}

async function testPendingCancellationsAreNeverThrottled() {
  const client = await createUser("pending");
  const provider = await createUser("prov");
  for (let i = 0; i < config.cancelCooldownThreshold + 3; i++) {
    const result = await cancelTrade(fakeRequest, await insertTrade(client, provider, false), client);
    strictEqual(result.status, "cancelled", `cancelación ${i + 1} sin fondos`);
  }
  console.log("  ✓ cancelar operaciones pending sin fondos nunca da CANCEL_COOLDOWN");
}

async function main() {
  console.log("\n  WP3 límite de cancelaciones:\n");
  // El store en memoria no evalua COUNT(*): el limite solo se comprueba con
  // PostgreSQL real. Sin el, estos casos pasarian por el motivo equivocado.
  if (!pool) {
    console.error("  ✗ Necesita PostgreSQL real (DATABASE_URL); el store en memoria no cuenta cancelaciones.\n");
    process.exit(1);
  }
  await testFundedCancellationsStillHaveALimit();
  await testPendingCancellationsAreNeverThrottled();
  console.log("\nAll WP3 cancel cooldown tests passed.\n");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
