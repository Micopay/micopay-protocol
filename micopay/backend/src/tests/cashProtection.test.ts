/**
 * WP1 · Proteger el efectivo.
 *
 *   · Retiro: el cliente no cancela mientras tenga un QR vigente; al vencer el
 *     QR vuelve a poder cancelar.
 *   · Depósito: la confirmación del agente (`revealTrade`) cuenta como
 *     constancia. Con ella no se cancela, no hay decline y no se reembolsa.
 *   · D4: el reclamo "Pagué y no me confirmaron" bloquea el reembolso por la
 *     app y por el barrido.
 */

import { strictEqual, ok } from "assert";
import db from "../db/schema.js";
import {
  cancelTrade,
  refundTrade,
  getRefundEligibility,
  getTradeDetailForParticipant,
  openCashClaim,
  sweepPendingRefunds,
} from "../services/trade.service.js";
import { AppError } from "../utils/errors.js";

const fakeRequest = {
  ip: "127.0.0.1",
  headers: {},
  log: { info: () => {}, warn: () => {}, error: () => {} },
} as any;

let seq = 0;
async function createUser(label: string, available = true): Promise<string> {
  seq++;
  const suffix = String(seq).padStart(2, "0");
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username, phone_hash, merchant_available, availability, is_suspended)
     VALUES ($1, $2, $3, $4, $5, false)
     RETURNING id`,
    [
      `G${"W".repeat(53)}${suffix}`,
      `wp1_${label}_${suffix}`,
      `h_wp1_${label}_${suffix}`,
      available,
      available ? "online" : "paused",
    ],
  );
  if (!row?.id) throw new Error(`Failed to seed ${label}`);
  return row.id;
}

async function insertTrade(opts: {
  flow: "cashout" | "deposit";
  clientId: string;
  providerId: string;
  status: string;
  expired?: boolean;
  revealed?: boolean;
}): Promise<string> {
  seq++;
  const cashout = opts.flow === "cashout";
  const sellerId = cashout ? opts.clientId : opts.providerId;
  const buyerId = cashout ? opts.providerId : opts.clientId;
  const expiresAt = new Date(Date.now() + (opts.expired ? -60_000 : 2 * 60 * 60 * 1000)).toISOString();
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO trades
       (seller_id, buyer_id, flow, provider_id, amount_mxn, amount_stroops, secret_hash,
        status, lock_tx_hash, expires_at, reveal_requested_at)
     VALUES ($1, $2, $3, $4, 500, 5000000000, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      sellerId,
      buyerId,
      opts.flow,
      opts.providerId,
      `wp1_${seq}_${Math.random()}`,
      opts.status,
      `mock_lock_${seq}`,
      expiresAt,
      opts.revealed ? new Date().toISOString() : null,
    ],
  );
  if (!row?.id) throw new Error("Failed to insert trade");
  return row.id;
}

async function insertClaimToken(tradeId: string, issuedTo: string, expiresInMs: number) {
  await db.execute(
    `INSERT INTO trade_claim_tokens (token_hash, trade_id, issued_to, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [`tok_${Math.random()}`, tradeId, issuedTo, new Date(Date.now() + expiresInMs).toISOString()],
  );
}

async function expectRejected(fn: () => Promise<unknown>, code: string, what: string) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AppError) {
      strictEqual(err.code, code, `${what}: se esperaba ${code}, llegó ${err.code}`);
      return;
    }
    throw err;
  }
  throw new Error(`${what}: se esperaba ${code} y no hubo error`);
}

async function statusOf(tradeId: string) {
  const row = await db.getOne<{ status: string }>("SELECT status FROM trades WHERE id = $1", [tradeId]);
  return row?.status;
}

// ── Retiro: QR vigente ─────────────────────────────────────────────────────

async function testCashoutClientCannotCancelWithLiveQr() {
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const tradeId = await insertTrade({ flow: "cashout", clientId: client, providerId: provider, status: "revealing" });
  await insertClaimToken(tradeId, client, 10 * 60_000);

  await expectRejected(
    () => cancelTrade(fakeRequest, tradeId, client),
    "RELEASE_QR_ACTIVE",
    "cliente cancelando con QR vigente",
  );
  strictEqual(await statusOf(tradeId), "revealing", "la operación sigue viva");
  console.log("  ✓ retiro: el cliente no cancela mientras su QR está vigente");
}

async function testCashoutClientCanCancelAfterQrExpires() {
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const tradeId = await insertTrade({ flow: "cashout", clientId: client, providerId: provider, status: "revealing" });
  await insertClaimToken(tradeId, client, -60_000);

  const result = await cancelTrade(fakeRequest, tradeId, client);
  strictEqual(result.status, "cancelled", "con el QR vencido el cliente no queda atrapado");
  console.log("  ✓ retiro: con el QR vencido el cliente puede cancelar otra vez");
}

async function testDepositIgnoresQrRule() {
  // En depósito el cliente no genera QR de liberación; la regla no aplica.
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const tradeId = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked" });

  const result = await cancelTrade(fakeRequest, tradeId, client);
  strictEqual(result.status, "cancelled");
  console.log("  ✓ depósito: la regla del QR vigente no afecta al cliente");
}

// ── Depósito: confirmación del agente ──────────────────────────────────────

async function testDepositProviderWhoConfirmedCannotPauseAndCancel() {
  const client = await createUser("cli");
  const provider = await createUser("prov", false); // ya se pausó
  const tradeId = await insertTrade({
    flow: "deposit", clientId: client, providerId: provider, status: "revealing", revealed: true,
  });

  await expectRejected(
    () => cancelTrade(fakeRequest, tradeId, provider),
    "CASH_HANDOFF_CONFIRMED",
    "agente pausado cancelando tras confirmar el efectivo",
  );
  console.log("  ✓ depósito: el agente que confirmó el efectivo no puede pausarse y cancelar");
}

async function testDepositConfirmationBlocksRefundAndDecline() {
  const client = await createUser("cli");
  const provider = await createUser("prov");
  // Cancelada y vencida, pero el agente había confirmado el efectivo antes.
  const tradeId = await insertTrade({
    flow: "deposit", clientId: client, providerId: provider, status: "cancelled", expired: true, revealed: true,
  });

  const eligibility = await getRefundEligibility(tradeId, provider);
  strictEqual(eligibility.eligible, false);
  strictEqual(eligibility.reason, "cash_handoff_confirmed");

  await expectRejected(
    () => refundTrade(fakeRequest, tradeId, provider),
    "CASH_HANDOFF_CONFIRMED",
    "agente reembolsando tras confirmar",
  );

  const detail = await getTradeDetailForParticipant(tradeId, client);
  strictEqual(detail.decline_available, false, "no se ofrece decline con constancia");
  console.log("  ✓ depósito: la confirmación bloquea reembolso por la app y decline");
}

async function testCashoutRevealIsNotConfirmation() {
  // En retiro `reveal_requested_at` lo pone el cliente al generar su QR: no es
  // constancia de efectivo.
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const tradeId = await insertTrade({
    flow: "cashout", clientId: client, providerId: provider, status: "cancelled", expired: true, revealed: true,
  });

  const eligibility = await getRefundEligibility(tradeId, client);
  ok(eligibility.reason !== "cash_handoff_confirmed", "retiro sin escaneo no tiene constancia");
  console.log("  ✓ retiro: generar el QR no cuenta como constancia");
}

// ── D4: reclamo del cliente ────────────────────────────────────────────────

async function testOnlyDepositClientCanClaim() {
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const deposit = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked" });
  const cashout = await insertTrade({ flow: "cashout", clientId: client, providerId: provider, status: "locked" });

  await expectRejected(
    () => openCashClaim(fakeRequest, deposit, provider),
    "CASH_CLAIM_NOT_ALLOWED",
    "el agente reclamando",
  );
  await expectRejected(
    () => openCashClaim(fakeRequest, cashout, client),
    "CASH_CLAIM_NOT_ALLOWED",
    "reclamo en un retiro",
  );
  console.log("  ✓ D4: solo el cliente de un depósito puede reclamar");
}

async function testClaimBlocksRefundAndIsIdempotent() {
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const tradeId = await insertTrade({
    flow: "deposit", clientId: client, providerId: provider, status: "cancelled", expired: true,
  });

  const first = await openCashClaim(fakeRequest, tradeId, client, "Le di 500 en su tienda");
  const second = await openCashClaim(fakeRequest, tradeId, client);
  strictEqual(first.trade_id, second.trade_id, "repetir devuelve el mismo reclamo");
  const rows = await db.getMany("SELECT trade_id FROM trade_cash_claims WHERE trade_id = $1", [tradeId]);
  strictEqual(rows.length, 1, "un solo reclamo por operación");

  const eligibility = await getRefundEligibility(tradeId, provider);
  strictEqual(eligibility.reason, "cash_claim_open");
  await expectRejected(
    () => refundTrade(fakeRequest, tradeId, provider),
    "CASH_CLAIM_OPEN",
    "agente reembolsando con reclamo abierto",
  );
  console.log("  ✓ D4: el reclamo bloquea el reembolso por la app y no se duplica");
}

async function testSweepSkipsConfirmationAndClaim() {
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const confirmed = await insertTrade({
    flow: "deposit", clientId: client, providerId: provider, status: "cancelled", expired: true, revealed: true,
  });
  const claimed = await insertTrade({
    flow: "deposit", clientId: client, providerId: provider, status: "cancelled", expired: true,
  });
  await openCashClaim(fakeRequest, claimed, client);

  await sweepPendingRefunds(fakeRequest);

  strictEqual(await statusOf(confirmed), "cancelled", "con constancia el barrido no reembolsa");
  strictEqual(await statusOf(claimed), "cancelled", "con reclamo el barrido no reembolsa");
  console.log("  ✓ el barrido deja a soporte las operaciones con constancia o reclamo");
}

async function main() {
  console.log("\n  WP1 proteger el efectivo:\n");
  await testCashoutClientCannotCancelWithLiveQr();
  await testCashoutClientCanCancelAfterQrExpires();
  await testDepositIgnoresQrRule();
  await testDepositProviderWhoConfirmedCannotPauseAndCancel();
  await testDepositConfirmationBlocksRefundAndDecline();
  await testCashoutRevealIsNotConfirmation();
  await testOnlyDepositClientCanClaim();
  await testClaimBlocksRefundAndIsIdempotent();
  await testSweepSkipsConfirmationAndClaim();
  console.log("\nAll WP1 cash protection tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
