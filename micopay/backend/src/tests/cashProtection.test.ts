/**
 * WP1 · Proteger el efectivo.
 *
 *   · Retiro: el cliente no cancela mientras tenga un QR vigente; al vencer el
 *     QR vuelve a poder cancelar.
 *   · Depósito: la confirmación del agente (`revealTrade`) cuenta como
 *     constancia. Con ella no se cancela, no hay decline y no se reembolsa.
 *   · D4: el reclamo "Pagué y no me confirmaron" bloquea el reembolso por la
 *     app y por el barrido.
 *   · #514: reclamo y barrido deciden con la fila del trade bloqueada; si
 *     llegan juntos queda uno solo. Correr tambien contra PostgreSQL real
 *     (DATABASE_URL=... npm run test:cash-protection, con `npm run migrate`
 *     antes): en memoria no hay `FOR UPDATE`, solo el lock del proceso.
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

async function testConcurrentClaimsReturnTheSameClaim() {
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const tradeId = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked" });

  // Doble toque: varias peticiones a la vez no deben chocar con la llave primaria.
  const claims = await Promise.all(Array.from({ length: 30 }, () => openCashClaim(fakeRequest, tradeId, client)));
  ok(claims.every((c) => c.trade_id === tradeId && c.status === "open"), "todas devuelven el reclamo abierto");
  const rows = await db.getMany("SELECT trade_id FROM trade_cash_claims WHERE trade_id = $1", [tradeId]);
  strictEqual(rows.length, 1, "un solo reclamo aunque lleguen a la vez");
  console.log("  ✓ D4: reclamos simultáneos devuelven el mismo reclamo");
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

// ── #514: margen y carrera entre reclamo y barrido ─────────────────────────

async function setExpiredMinutesAgo(tradeId: string, minutes: number) {
  await db.execute("UPDATE trades SET expires_at = $2 WHERE id = $1", [
    tradeId,
    new Date(Date.now() - minutes * 60_000).toISOString(),
  ]);
}

async function testClaimWithinGraceBlocksSweepForever() {
  // El cliente reclama a los 5 minutos del vencimiento, dentro del margen.
  // Aunque despues pase el margen, el barrido no reembolsa: es de soporte.
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const tradeId = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked", expired: true });
  await setExpiredMinutesAgo(tradeId, 5);
  await openCashClaim(fakeRequest, tradeId, client);

  await setExpiredMinutesAgo(tradeId, 60);
  await sweepPendingRefunds(fakeRequest);

  strictEqual(await statusOf(tradeId), "locked", "con reclamo hecho dentro del margen el barrido no reembolsa");
  console.log("  ✓ #514 reclamo dentro del margen: el barrido no reembolsa nunca");
}

async function testClaimRejectedOnceSweepStartedRefund() {
  // La marca del barrido es la decision de reembolsar: un reclamo que llega
  // despues ya no la puede deshacer y lo dice, en vez de quedar como abierto.
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const tradeId = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked", expired: true });
  await db.execute("UPDATE trades SET refund_started_at = $2 WHERE id = $1", [tradeId, new Date().toISOString()]);

  await expectRejected(
    () => openCashClaim(fakeRequest, tradeId, client),
    "CASH_CLAIM_NOT_ALLOWED",
    "reclamo con el reembolso del barrido ya en marcha",
  );
  const rows = await db.getMany("SELECT trade_id FROM trade_cash_claims WHERE trade_id = $1", [tradeId]);
  strictEqual(rows.length, 0, "no queda un reclamo abierto sobre fondos que ya se devuelven");
  console.log("  ✓ #514 con el reembolso en marcha el reclamo se rechaza");
}

async function testClaimAndSweepRaceLeavesOnlyOne() {
  // Reclamo y barrido al mismo tiempo, con distintos desfases para cubrir los
  // huecos entre cada `await` del barrido. Nunca deben quedar las dos cosas.
  const client = await createUser("cli");
  const provider = await createUser("prov");
  let claimsWon = 0;
  let refundsWon = 0;
  // Cuanto tarda un barrido aqui (memoria o PostgreSQL): los desfases del
  // reclamo se reparten a lo largo de ese tiempo.
  const probe = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked", expired: true });
  await setExpiredMinutesAgo(probe, 30);
  const t0 = performance.now();
  await sweepPendingRefunds(fakeRequest);
  let sweepMs = Math.max(performance.now() - t0, 1);
  strictEqual(await statusOf(probe), "refunded", "sin reclamo, el barrido reembolsa");
  const TRIES = 40;
  for (let i = 0; i < TRIES; i++) {
    const tradeId = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked", expired: true });
    await setExpiredMinutesAgo(tradeId, 30);
    const claim = (async () => {
      if (i % 2 === 0) {
        // Sin PostgreSQL todo el barrido corre en microtareas: el desfase se
        // cuenta en `await`s, no en milisegundos.
        for (let k = 0; k < i * 3; k++) await Promise.resolve();
      } else {
        await new Promise((r) => setTimeout(r, (3 * sweepMs * i) / TRIES));
      }
      try {
        await openCashClaim(fakeRequest, tradeId, client);
        return true;
      } catch (err) {
        if (err instanceof AppError && err.code === "CASH_CLAIM_NOT_ALLOWED") return false;
        throw err;
      }
    })();
    const startedAt = performance.now();
    const sweep = sweepPendingRefunds(fakeRequest).then(() => {
      sweepMs = Math.max(performance.now() - startedAt, 1);
    });
    const [claimed] = await Promise.all([claim, sweep]);

    const status = await statusOf(tradeId);
    const open = await db.getMany(
      "SELECT trade_id FROM trade_cash_claims WHERE trade_id = $1 AND status = 'open'",
      [tradeId],
    );
    const refunded = status === "refunded";
    ok(!(refunded && open.length > 0), `intento ${i}: reclamo abierto Y fondos devueltos`);
    strictEqual(claimed, open.length === 1, `intento ${i}: el reclamo dice lo que quedo en la base`);
    ok(refunded || open.length === 1, `intento ${i}: alguna de las dos debe ganar`);
    if (refunded) refundsWon++;
    else claimsWon++;
  }
  console.log(`  ✓ #514 reclamo y barrido a la vez: queda una sola (reclamo ${claimsWon}, reembolso ${refundsWon}, barrido ~${sweepMs.toFixed(1)} ms)`);
}

async function testDetailTellsClientTheClaimDeadline() {
  // #514 · casilla 5: el servidor dice hasta cuando reclamar; la app no
  // repite el margen.
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const deposit = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "locked", expired: true });
  await setExpiredMinutesAgo(deposit, 5);
  const row = await db.getOne<{ expires_at: string }>("SELECT expires_at FROM trades WHERE id = $1", [deposit]);
  const expected = new Date(new Date(row!.expires_at).getTime() + 15 * 60_000).toISOString();

  const forClient = await getTradeDetailForParticipant(deposit, client);
  strictEqual(forClient.cash_claim_deadline, expected, "cliente: vencimiento + 15 min");
  const forProvider = await getTradeDetailForParticipant(deposit, provider);
  strictEqual(forProvider.cash_claim_deadline, null, "el agente no reclama");

  const cashout = await insertTrade({ flow: "cashout", clientId: client, providerId: provider, status: "locked", expired: true });
  strictEqual((await getTradeDetailForParticipant(cashout, client)).cash_claim_deadline, null, "cash-out: no hay margen");

  await openCashClaim(fakeRequest, deposit, client);
  strictEqual((await getTradeDetailForParticipant(deposit, client)).cash_claim_deadline, null, "ya reclamo: no hay cuenta regresiva");
  console.log("  ✓ #514 el detalle da al cliente del deposito su plazo para reclamar");
}

// ── #514 (revision de Eric): el boton "Recuperar fondos" ────────────────────

async function testAgentButtonWaitsForTheGrace() {
  // El agente es quien se quedaria con el efectivo y la cripto: su boton
  // espera el mismo margen que el barrido.
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const early = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "cancelled", expired: true });
  await setExpiredMinutesAgo(early, 5);

  const eligibility = await getRefundEligibility(early, provider);
  strictEqual(eligibility.eligible, false, "dentro del margen no se ofrece el boton");
  strictEqual(eligibility.reason, "cash_claim_window");
  const row = await db.getOne<{ expires_at: string }>("SELECT expires_at FROM trades WHERE id = $1", [early]);
  strictEqual(
    eligibility.refund_available_at,
    new Date(new Date(row!.expires_at).getTime() + 15 * 60_000).toISOString(),
    "el boton se habilita al terminar el margen",
  );
  ok(eligibility.seconds_remaining > 0, "con cuenta regresiva");

  await expectRejected(
    () => refundTrade(fakeRequest, early, provider),
    "CASH_CLAIM_WINDOW",
    "agente reembolsando un deposito vencido hace 5 min",
  );
  strictEqual(await statusOf(early), "cancelled");
  console.log("  ✓ #514 boton del agente, deposito vencido hace 5 min: se rechaza");

  const late = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "cancelled", expired: true });
  await setExpiredMinutesAgo(late, 16);
  strictEqual((await getRefundEligibility(late, provider)).reason, "eligible");
  strictEqual((await refundTrade(fakeRequest, late, provider)).status, "refunded");
  console.log("  ✓ #514 boton del agente, deposito vencido hace 16 min: se reembolsa");
}

async function testCashoutButtonDoesNotWait() {
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const cashout = await insertTrade({ flow: "cashout", clientId: client, providerId: provider, status: "cancelled", expired: true });
  strictEqual((await getRefundEligibility(cashout, client)).reason, "eligible", "cash-out: sin margen");
  strictEqual((await refundTrade(fakeRequest, cashout, client)).status, "refunded");
  console.log("  ✓ #514 boton en cash-out vencido: se reembolsa sin esperar");
}

async function testClaimAndAgentButtonRaceLeavesOnlyOne() {
  // Mismo patron que el barrido: reclamo y boton a la vez, con desfases.
  const client = await createUser("cli");
  const provider = await createUser("prov");
  const probe = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "cancelled", expired: true });
  await setExpiredMinutesAgo(probe, 30);
  const t0 = performance.now();
  await refundTrade(fakeRequest, probe, provider);
  let refundMs = Math.max(performance.now() - t0, 1);

  const TRIES = 40;
  let claimsWon = 0;
  let refundsWon = 0;
  for (let i = 0; i < TRIES; i++) {
    const tradeId = await insertTrade({ flow: "deposit", clientId: client, providerId: provider, status: "cancelled", expired: true });
    await setExpiredMinutesAgo(tradeId, 30);
    const claim = (async () => {
      if (i % 2 === 0) {
        for (let k = 0; k < i * 3; k++) await Promise.resolve();
      } else {
        await new Promise((r) => setTimeout(r, (3 * refundMs * i) / TRIES));
      }
      try {
        await openCashClaim(fakeRequest, tradeId, client);
        return true;
      } catch (err) {
        if (err instanceof AppError && err.code === "CASH_CLAIM_NOT_ALLOWED") return false;
        throw err;
      }
    })();
    const startedAt = performance.now();
    const button = refundTrade(fakeRequest, tradeId, provider).then(
      () => { refundMs = Math.max(performance.now() - startedAt, 1); return true; },
      (err) => {
        if (err instanceof AppError && err.code === "CASH_CLAIM_OPEN") return false;
        throw err;
      },
    );
    const [claimed, refundedByButton] = await Promise.all([claim, button]);

    const refunded = (await statusOf(tradeId)) === "refunded";
    const open = await db.getMany(
      "SELECT trade_id FROM trade_cash_claims WHERE trade_id = $1 AND status = 'open'",
      [tradeId],
    );
    ok(!(refunded && open.length > 0), `intento ${i}: reclamo abierto Y fondos devueltos`);
    strictEqual(claimed, open.length === 1, `intento ${i}: el reclamo dice lo que quedo en la base`);
    strictEqual(refundedByButton, refunded, `intento ${i}: el boton dice lo que quedo en la base`);
    ok(refunded !== (open.length === 1), `intento ${i}: gana exactamente una`);
    if (refunded) refundsWon++;
    else claimsWon++;
  }
  console.log(`  ✓ #514 reclamo y boton del agente a la vez: queda una sola (reclamo ${claimsWon}, reembolso ${refundsWon})`);
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
  await testConcurrentClaimsReturnTheSameClaim();
  await testSweepSkipsConfirmationAndClaim();
  await testClaimWithinGraceBlocksSweepForever();
  await testClaimRejectedOnceSweepStartedRefund();
  await testClaimAndSweepRaceLeavesOnlyOne();
  await testDetailTellsClientTheClaimDeadline();
  await testAgentButtonWaitsForTheGrace();
  await testCashoutButtonDoesNotWait();
  await testClaimAndAgentButtonRaceLeavesOnlyOne();
  console.log("\nAll WP1 cash protection tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
