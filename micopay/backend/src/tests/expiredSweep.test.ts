/**
 * WP5 · #10: una operación vencida sin constancia regresa sola; una con
 * constancia o reclamo no se toca.
 *
 * Antes el barrido solo veía operaciones `cancelled`. Una `locked` o
 * `revealing` vencida se quedaba en el escrow hasta que alguien pidiera el
 * reembolso (11 h en el QA del 31 oct).
 */

import { strictEqual } from "assert";
import db from "../db/schema.js";
import { DEFAULT_DEPOSIT_GRACE_MINUTES, parseGraceMinutes } from "../config.js";
import { getTradeDetailForParticipant, openCashClaim, sweepPendingRefunds } from "../services/trade.service.js";

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
    [`G${"V".repeat(53)}${suffix}`, `wp5_${label}_${suffix}`, `h_wp5_${label}_${suffix}`, true, "online"],
  );
  if (!row?.id) throw new Error(`Failed to seed ${label}`);
  return row.id;
}

async function insertTrade(opts: {
  flow: "cashout" | "deposit";
  clientId: string;
  providerId: string;
  status: string;
  expired: boolean;
  revealed?: boolean;
  /** #514: cuantos minutos hace que vencio (por defecto 1). */
  expiredMinutesAgo?: number;
}): Promise<string> {
  seq++;
  const cashout = opts.flow === "cashout";
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO trades
       (seller_id, buyer_id, flow, provider_id, amount_mxn, amount_stroops, secret_hash,
        status, lock_tx_hash, expires_at, reveal_requested_at)
     VALUES ($1, $2, $3, $4, 500, 5000000000, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      cashout ? opts.clientId : opts.providerId,
      cashout ? opts.providerId : opts.clientId,
      opts.flow,
      opts.providerId,
      `wp5_${seq}_${Math.random()}`,
      opts.status,
      `mock_lock_${seq}`,
      new Date(Date.now() + (opts.expired ? -(opts.expiredMinutesAgo ?? 1) * 60_000 : 2 * 60 * 60 * 1000)).toISOString(),
      opts.revealed ? new Date().toISOString() : null,
    ],
  );
  if (!row?.id) throw new Error("Failed to insert trade");
  return row.id;
}

async function statusOf(id: string) {
  return (await db.getOne<{ status: string }>("SELECT status FROM trades WHERE id = $1", [id]))?.status;
}

// #514 · casilla 1. Un margen negativo adelantaria el reembolso y uno mal
// escrito ("15m") no debe leerse a medias: los dos caen al valor por defecto.
function testGraceMinutesParsing() {
  strictEqual(DEFAULT_DEPOSIT_GRACE_MINUTES, 15, "el margen por defecto es 15 minutos");
  strictEqual(parseGraceMinutes(undefined), 15, "sin variable: 15");
  strictEqual(parseGraceMinutes(""), 15, "vacia: 15");
  strictEqual(parseGraceMinutes("-5"), 15, "negativo: 15");
  strictEqual(parseGraceMinutes("abc"), 15, "no numerico: 15");
  strictEqual(parseGraceMinutes("15m"), 15, "con unidad: 15, no se lee a medias");
  strictEqual(parseGraceMinutes("2.5"), 15, "decimal: 15");
  strictEqual(parseGraceMinutes(" 30 "), 30, "entero valido: se respeta");
  strictEqual(parseGraceMinutes("0"), 0, "cero es valido: sin margen");
  console.log("  ✓ #514 margen: invalido o negativo usa 15");
}

async function main() {
  console.log("\n  WP5 barrido de vencidas:\n");
  testGraceMinutesParsing();
  const client = await createUser("cli");
  const provider = await createUser("prov");

  const lockedExpired = await insertTrade({ flow: "cashout", clientId: client, providerId: provider, status: "locked", expired: true });
  const revealingCashoutExpired = await insertTrade({ flow: "cashout", clientId: client, providerId: provider, status: "revealing", expired: true, revealed: true });
  const lockedLive = await insertTrade({ flow: "cashout", clientId: client, providerId: provider, status: "locked", expired: false });
  const depositConfirmed = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "revealing", expired: true, revealed: true });
  const depositClaimed = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked", expired: true });
  await openCashClaim(fakeRequest, depositClaimed, client);
  const cashoutHandoff = await insertTrade({ flow: "cashout", clientId: client, providerId: provider, status: "revealing", expired: true, revealed: true });
  await db.execute(
    `INSERT INTO trade_cash_handoffs (trade_id, provider_id, claim_token_hash) VALUES ($1, $2, $3)`,
    [cashoutHandoff, provider, "hash"],
  );

  // #514 · casilla 2: el deposito espera el margen; el cash-out no.
  const depositFiveMin = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked", expired: true, expiredMinutesAgo: 5 });
  const depositSixteenMin = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked", expired: true, expiredMinutesAgo: 16 });
  const depositCancelledFiveMin = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "cancelled", expired: true, expiredMinutesAgo: 5 });

  await sweepPendingRefunds(fakeRequest);

  strictEqual(await statusOf(depositFiveMin), "locked", "deposito vencido hace 5 min: el cliente aun puede reclamar");
  strictEqual(await statusOf(depositCancelledFiveMin), "cancelled", "deposito cancelado vencido hace 5 min: tambien espera");
  console.log("  ✓ #514 deposito vencido hace 5 min: no se reembolsa");
  strictEqual(await statusOf(depositSixteenMin), "refunded", "deposito vencido hace 16 min: ya paso el margen");
  console.log("  ✓ #514 deposito vencido hace 16 min: se reembolsa");

  strictEqual(await statusOf(lockedExpired), "refunded", "locked vencida sin constancia regresa sola");
  console.log("  ✓ locked vencida sin constancia: regresa sola");
  console.log("  ✓ #514 cash-out vencido hace 1 min: se reembolsa sin esperar el margen");
  strictEqual(await statusOf(revealingCashoutExpired), "refunded", "retiro con QR generado pero sin escaneo regresa solo");
  console.log("  ✓ revealing de retiro sin escaneo: regresa sola");
  strictEqual(await statusOf(lockedLive), "locked", "no vencida: no se toca");
  console.log("  ✓ no vencida: no se toca");
  strictEqual(await statusOf(depositConfirmed), "revealing", "depósito con efectivo confirmado: a soporte");
  strictEqual(await statusOf(depositClaimed), "locked", "depósito con reclamo: a soporte");
  strictEqual(await statusOf(cashoutHandoff), "revealing", "retiro con entrega registrada: a soporte");
  console.log("  ✓ con constancia o reclamo no se toca");

  // #16: el detalle distingue vencimiento de decline.
  const detail = await getTradeDetailForParticipant(lockedExpired, client);
  strictEqual(detail.refund_kind, "timeout", "el barrido es un reembolso por vencimiento");
  console.log("  ✓ el detalle marca el reembolso por vencimiento");
  console.log("\nAll WP5 expired sweep tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
