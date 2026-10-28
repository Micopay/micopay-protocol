// Orquesta "Retirar a banco" (SPEI) usando el cliente v2 de Etherfuse.
// Este archivo pega las piezas: crea la personal org del usuario, le envia los
// datos de verificacion, registra la CLABE y la wallet como cuentas de pago,
// cotiza, crea la orden y re-lee cuando llega un webhook.
//
// Decisiones base en docs/PLAN_RETIRO_BANCO_2026-10-20.md.

import db from '../db/schema.js';
import { getEffectiveKycLevel } from './kyc-gate.service.js';
import {
  EtherfuseV2Error,
  type FundingInstructions,
  type EtherfuseKycStatus,
  type KycStatus,
  type LaunchForm,
  type Order,
  type OrderStatus,
  type PaymentAccount,
  type Quote,
  type SubmitVerificationResponse,
  buildLaunchForm,
  createOrder,
  createPersonalOrg,
  createQuote,
  getKycStatus,
  getOrganization,
  mapEtherfuseKyc,
  mapEtherfuseKycDetailed,
  getOrder,
  getPaymentAccount,
  registerPaymentAccount,
  submitVerification,
} from './etherfuseV2.service.js';
import {
  applySlippageBps,
  quoteStrictSendPath,
  type StellarAssetRef,
} from './stellarDex.service.js';

// ---- CLABE --------------------------------------------------------------

const CLABE_WEIGHTS = [3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7];

/**
 * Verifica el digito de control de una CLABE mexicana (18 digitos). La formula
 * es la publicada por el Banco de Mexico: suma ponderada mod 10, luego
 * (10 - suma_mod_10) mod 10 debe igualar el digito 18.
 */
export function validateClabe(clabe: string): boolean {
  if (!/^[0-9]{18}$/.test(clabe)) return false;
  let acc = 0;
  for (let i = 0; i < 17; i++) {
    acc += (Number(clabe[i]) * CLABE_WEIGHTS[i]) % 10;
  }
  const check = (10 - (acc % 10)) % 10;
  return check === Number(clabe[17]);
}

// ---- Status del usuario -------------------------------------------------

export type BankWithdrawStage =
  | 'needs_didit'      // falta Didit (como en P2P)
  | 'needs_kyc'        // Didit ok, falta mandar datos a Etherfuse / abrir /idv
  | 'kyc_review'       // enviado, Etherfuse esta revisando
  | 'kyc_action'       // Etherfuse espera algo del usuario en /idv (terminar o corregir)
  | 'needs_bank'       // KYC aprobado, falta registrar CLABE
  | 'ready';           // listo para cotizar y retirar

export interface BankWithdrawStatus {
  stage: BankWithdrawStage;
  /** CLABE enmascarada (xxxx-xxxx-xx-xxxx-1234). */
  clabeMasked?: string;
  /** Ultimo mensaje legible de Etherfuse si hay accion requerida. */
  kycMessage?: string | null;
}

export { mapEtherfuseKyc, type EtherfuseKycStatus };

interface UserRow {
  id: string;
  stellar_address: string | null;
  username: string | null;
  etherfuse_customer_id: string | null;
  etherfuse_bank_account_id: string | null;
  etherfuse_wallet_account_id: string | null;
  etherfuse_kyc_status: EtherfuseKycStatus;
  etherfuse_kyc_message: string | null;
  etherfuse_kyc_updated_at: string | null;
  email: string | null;
}

async function loadUser(userId: string): Promise<UserRow> {
  const user = await db.getOne<UserRow>(
    `SELECT id, stellar_address, username, email,
            etherfuse_customer_id, etherfuse_bank_account_id,
            etherfuse_wallet_account_id, etherfuse_kyc_status,
            etherfuse_kyc_message, etherfuse_kyc_updated_at
       FROM users WHERE id = $1`,
    [userId],
  );
  if (!user) throw new Error(`rampWithdraw: usuario no encontrado ${userId}`);
  return user;
}

/**
 * Re-lee el KYC desde Etherfuse y lo guarda. Lo usa el webhook y tambien la
 * pantalla mientras el usuario esta en revision, por si un webhook se perdio.
 * `userMessage` solo se sobrescribe cuando trae algo: GET /kyc no repite el
 * mensaje que llego por webhook.
 *
 * `detail` pide los requisitos (Etherfuse consulta a su proveedor: no en el
 * polling corto). Sin ellos no se distingue "en revision" de "le toca al
 * usuario", asi que un `action_required` guardado se conserva mientras el
 * estado siga en `inProgress`.
 */
async function refreshEtherfuseKyc(
  userId: string,
  customerOrgId: string,
  opts: { message?: string | null; detail?: boolean; previous?: EtherfuseKycStatus } = {},
): Promise<{ mapped: EtherfuseKycStatus; kyc: KycStatus }> {
  const kyc = await getKycStatus(customerOrgId, { requirements: opts.detail });
  let mapped = opts.detail ? mapEtherfuseKycDetailed(kyc) : mapEtherfuseKyc(kyc.status, kyc.needsWork);
  if (!opts.detail && mapped === 'review' && kyc.status === 'inProgress' && opts.previous === 'action_required') {
    mapped = 'action_required';
  }
  const newMessage = opts.message ?? kyc.userMessage;
  await db.execute(
    `UPDATE users
        SET etherfuse_kyc_status = $1,
            etherfuse_kyc_message = CASE WHEN $1 = 'approved' THEN NULL ELSE COALESCE($2, etherfuse_kyc_message) END,
            etherfuse_kyc_updated_at = NOW()
      WHERE id = $3`,
    [mapped, newMessage ?? null, userId],
  );
  return { mapped, kyc };
}

/** Columna guardada a etapa de la pantalla, mientras el KYC no este aprobado. */
function kycStage(mapped: EtherfuseKycStatus): BankWithdrawStage {
  // Un `denied` tambien se resuelve volviendo a /idv (docs de Etherfuse: "a
  // denied customer resubmits by being launched into /idv").
  return mapped === 'action_required' || mapped === 'rejected' ? 'kyc_action' : 'kyc_review';
}

export async function getBankWithdrawStatus(userId: string, opts: { detail?: boolean } = {}): Promise<BankWithdrawStatus> {
  const u = await loadUser(userId);
  // Didit es la verificacion basica que ya existe en P2P. El webhook de Didit
  // escribe kyc_level (no kyc_status), con vencimiento.
  if ((await getEffectiveKycLevel(userId)) < 1) return { stage: 'needs_didit' };
  if (!u.etherfuse_customer_id) return { stage: 'needs_kyc' };
  if (u.etherfuse_kyc_status !== 'approved') {
    try {
      const { mapped, kyc } = await refreshEtherfuseKyc(userId, u.etherfuse_customer_id, {
        detail: opts.detail,
        previous: u.etherfuse_kyc_status,
      });
      // La org existe pero los datos no llegaron (p.ej. Etherfuse rechazo el
      // POST): se vuelve a mostrar el formulario en vez de "en revision".
      if (mapped === 'not_started') return { stage: 'needs_kyc' };
      if (mapped !== 'approved') {
        return { stage: kycStage(mapped), kycMessage: kyc.userMessage ?? u.etherfuse_kyc_message };
      }
    } catch {
      // Etherfuse no responde: se muestra lo ultimo que sabemos.
      return { stage: kycStage(u.etherfuse_kyc_status), kycMessage: u.etherfuse_kyc_message };
    }
  }
  if (!u.etherfuse_bank_account_id) return { stage: 'needs_bank' };
  return {
    stage: 'ready',
    clabeMasked: await loadClabeMask(u.id),
  };
}

async function loadClabeMask(userId: string): Promise<string | undefined> {
  // Guardamos solo los ultimos 4 digitos. Si quisieramos la CLABE completa
  // habria que ir a Etherfuse (getPaymentAccount).
  const row = await db.getOne<{ clabe_last4: string | null }>(
    `SELECT clabe_last4 FROM users WHERE id = $1`,
    [userId],
  );
  if (!row?.clabe_last4) return undefined;
  return `**** **** ** **** ${row.clabe_last4}`;
}

// ---- KYC ----------------------------------------------------------------

export interface StartKycRequest {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  /** RFC. */
  taxId: string;
  /** CURP. */
  curp: string;
  /** ISO alpha-3, p.ej. "MEX". */
  country: string;
  address: {
    street: string;
    city: string;
    country: string;
    region?: string | null;
    postalCode?: string | null;
    buildingNumber?: string | null;
    flatNumber?: string | null;
  };
  email: string;
  /** Nombre para mostrar ("Nombre Apellido"). */
  displayName: string;
}

export interface StartKycResponse {
  customerOrgId: string;
  verification: SubmitVerificationResponse;
  launch: LaunchForm;
}

/**
 * Crea la personal org del usuario en Etherfuse (si no existe), manda los datos
 * de verificacion y devuelve lo necesario para abrir /idv. Guarda el customer
 * id del usuario.
 *
   * No sube documentos: manda RFC + CURP y el usuario completa en /idv los
   * pasos visuales que Etherfuse solicite, como selfie o comprobante.
 */
export async function startKyc(userId: string, req: StartKycRequest): Promise<StartKycResponse> {
  const u = await loadUser(userId);

  // 1. Crear o reusar la personal org. Pasamos el userId del backend como `id`
  // para que coincida con el sub del JWT que firmaremos despues.
  const customerOrgId = u.etherfuse_customer_id ?? userId;
  const org = await createPersonalOrg({
    accountType: 'personal',
    id: customerOrgId,
    displayName: req.displayName,
    userInfo: { email: req.email, displayName: req.displayName },
  });

  if (org.id !== u.etherfuse_customer_id) {
    await db.execute(`UPDATE users SET etherfuse_customer_id = $1 WHERE id = $2`, [org.id, userId]);
  }
  // users.email existe solo para Etherfuse; relaunchKyc lo necesita para el JWT.
  if (req.email !== u.email) {
    await db.execute(`UPDATE users SET email = $1 WHERE id = $2`, [req.email, userId]);
  }

  // 2. Enviar datos de verificacion.
  const verification = await submitVerification(org.id, {
    firstName: req.firstName,
    lastName: req.lastName,
    dateOfBirth: req.dateOfBirth,
    taxId: req.taxId,
    country: req.country,
    address: req.address,
    additionalInfo: { curp: req.curp },
  });

  // 3. El POST responde 202 (aceptado, no aplicado): el usuario queda en
  // revision hasta que kycUpdated diga otra cosa.
  await db.execute(
    `UPDATE users SET etherfuse_kyc_status = $1, etherfuse_kyc_message = NULL, etherfuse_kyc_updated_at = NOW() WHERE id = $2`,
    [mapEtherfuseKyc(verification.status, false) === 'approved' ? 'approved' : 'review', userId],
  );

  const launch = buildLaunchForm(org.id, { email: req.email, name: req.displayName });

  return { customerOrgId: org.id, verification, launch };
}

export class RelaunchKycError extends Error {
  constructor(public readonly code: 'kyc_not_started' | 'missing_email') {
    super(code === 'kyc_not_started' ? 'Primero envia tus datos' : 'Falta tu correo; vuelve a enviar tus datos');
  }
}

/**
 * Nuevo launch form de /idv para un usuario que ya tiene org en Etherfuse:
 * terminar la selfie si cerro la pestana, o corregir lo que Etherfuse marco.
 * El JWT dura 5 minutos, por eso se firma uno por cada toque del boton.
 */
export async function relaunchKyc(userId: string): Promise<LaunchForm> {
  const u = await loadUser(userId);
  if (!u.etherfuse_customer_id) throw new RelaunchKycError('kyc_not_started');
  if (!u.email) throw new RelaunchKycError('missing_email');
  const org = await getOrganization(u.etherfuse_customer_id);
  return buildLaunchForm(org.id, { email: u.email, name: org.displayName });
}

/**
 * Llamado por el webhook kycUpdated. Re-lee el estado desde Etherfuse (no
 * confiamos en el body del aviso) y actualiza la base. El `userMessage` si se
 * toma del aviso: es el unico lugar donde Etherfuse dice que corregir. Con
 * requisitos: llega una vez por cambio, no es polling.
 */
export async function applyKycUpdate(customerOrgId: string, userMessage: string | null): Promise<EtherfuseKycStatus | null> {
  const user = await db.getOne<{ id: string }>(
    `SELECT id FROM users WHERE etherfuse_customer_id = $1`,
    [customerOrgId],
  );
  if (!user) return null;

  const { mapped } = await refreshEtherfuseKyc(user.id, customerOrgId, { message: userMessage, detail: true });
  return mapped;
}

// ---- Payment accounts ---------------------------------------------------

/**
 * Registra la wallet de Stellar del usuario como cuenta de pago. Idempotente:
 * si ya hay una en la base, la devuelve. No se busca una existente en
 * Etherfuse porque la API no da endpoint de "busqueda por address".
 */
export async function registerWalletAccount(userId: string): Promise<PaymentAccount> {
  const u = await loadUser(userId);
  if (!u.stellar_address) throw new Error('rampWithdraw: usuario sin stellar_address');
  if (!u.etherfuse_customer_id) throw new Error('rampWithdraw: falta etherfuse_customer_id (startKyc primero)');

  if (u.etherfuse_wallet_account_id) {
    return getPaymentAccount(u.etherfuse_customer_id, u.etherfuse_wallet_account_id);
  }

  const pa = await registerPaymentAccount(u.etherfuse_customer_id, {
    kind: 'wallet',
    label: 'MicoPay wallet',
    accountDetails: { kind: 'address', address: u.stellar_address, chain: 'stellar' },
  });

  await db.execute(
    `UPDATE users SET etherfuse_wallet_account_id = $1 WHERE id = $2`,
    [pa.id, userId],
  );
  return pa;
}

export interface RegisterBankRequest {
  clabe: string;
  accountHolderName: string;
  taxId: string;
}

/**
 * Registra la CLABE del usuario. Guarda los ultimos 4 digitos en la base
 * para enmascarar en pantallas; la CLABE completa queda solo en Etherfuse.
 */
export async function registerBankAccount(userId: string, req: RegisterBankRequest): Promise<PaymentAccount> {
  if (!validateClabe(req.clabe)) {
    throw new EtherfuseV2Error(400, 'invalid-clabe', 'La CLABE no es valida (digito de control)');
  }
  const u = await loadUser(userId);
  if (!u.etherfuse_customer_id) throw new Error('rampWithdraw: falta etherfuse_customer_id');

  const pa = await registerPaymentAccount(u.etherfuse_customer_id, {
    kind: 'bank',
    label: 'Mi cuenta MXN',
    country: 'MX',
    currency: 'MXN',
    accountDetails: { kind: 'clabe', clabe: req.clabe },
    registrationInfo: {
      accountHolderName: req.accountHolderName,
      taxId: req.taxId,
    },
  });

  const last4 = req.clabe.slice(-4);
  await db.execute(
    `UPDATE users SET etherfuse_bank_account_id = $1, clabe_last4 = $2 WHERE id = $3`,
    [pa.id, last4, userId],
  );
  return pa;
}

/**
 * Llamado por el webhook paymentAccountUpdated. Re-lee la cuenta de Etherfuse
 * (no confiamos en el body) y, por ahora, solo loguea. El estado por rail
 * (p.ej. 'ready' vs 'pending') lo veremos cuando el usuario intente cotizar.
 */
export async function applyPaymentAccountUpdate(customerOrgId: string, paymentAccountId: string): Promise<PaymentAccount | null> {
  const user = await db.getOne<{ id: string }>(
    `SELECT id FROM users WHERE etherfuse_customer_id = $1`,
    [customerOrgId],
  );
  if (!user) return null;
  return getPaymentAccount(customerOrgId, paymentAccountId);
}

// ---- Quotes y orders ----------------------------------------------------

export type WithdrawAsset = 'USDC';
// La app convierte este USDC a CETES con un path payment atomico; Etherfuse
// recibe CETES y liquida MXN por SPEI. XLM puede añadirse después con la misma ruta.

export interface CreateWithdrawQuoteRequest {
  asset: WithdrawAsset;
  /** Monto que sale de la cuenta del usuario, en el activo (USDC) a 7 decimales. */
  amount: string;
}

export interface WithdrawQuote {
  quoteId: string;
  sourceAmount: string;
  sourceAsset: string;
  /** Activo exacto que Etherfuse recibira despues del path payment. */
  fundingAmount: string;
  fundingAsset: string;
  /** Activos intermedios elegidos por Horizon. */
  dexPath: StellarAssetRef[];
  destinationAmount: string;
  destinationAsset: 'MXN';
  feeBps: number;
  feeAmount: string;
  feeAsset: string;
  expiresAt: string;
  /** CLABE enmascarada que va a recibir. */
  clabeMasked: string;
}

function isEtherfuseSandbox(): boolean {
  const url = process.env.ETHERFUSE_V2_API_URL ?? process.env.ETHERFUSE_API_URL ?? 'https://api.sand.etherfuse.com';
  return url.includes('.sand.') || url.includes('sandbox');
}

function etherfuseUsdcAsset(): string {
  if (process.env.ETHERFUSE_USDC_ASSET) return process.env.ETHERFUSE_USDC_ASSET;
  if (isEtherfuseSandbox()) return 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  return 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
}

function etherfuseFundingAsset(): string {
  if (process.env.ETHERFUSE_WITHDRAW_FUNDING_ASSET) return process.env.ETHERFUSE_WITHDRAW_FUNDING_ASSET;
  if (isEtherfuseSandbox()) return 'CETES:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
  throw new Error('ETHERFUSE_WITHDRAW_FUNDING_ASSET debe configurarse en produccion');
}

function parseAsset(value: string): StellarAssetRef {
  if (value === 'XLM') return { code: 'XLM' };
  const [code, issuer] = value.split(':');
  if (!code || !issuer) throw new Error(`rampWithdraw: activo invalido ${value}`);
  return { code, issuer };
}

function dexSlippageBps(): number {
  const value = Number(process.env.BANK_WITHDRAW_DEX_SLIPPAGE_BPS ?? '100');
  if (!Number.isInteger(value) || value < 0 || value > 500) {
    throw new Error('BANK_WITHDRAW_DEX_SLIPPAGE_BPS debe estar entre 0 y 500');
  }
  return value;
}

/**
 * Cotiza un retiro de USDC a MXN. Guarda la cotizacion en ramp_quotes para que
 * la orden posterior (confirmWithdrawOrder) use el mismo quoteId sin que el
 * cliente pueda alterar lo cotizado.
 *
 * Precondiciones: etherfuse_customer_id, etherfuse_wallet_account_id y
 * etherfuse_bank_account_id poblados (ver getBankWithdrawStatus === 'ready').
 */
export async function createWithdrawQuote(userId: string, req: CreateWithdrawQuoteRequest): Promise<WithdrawQuote> {
  if (req.asset !== 'USDC') {
    throw new EtherfuseV2Error(400, 'unsupported-asset', `asset ${req.asset} no esta disponible todavia`);
  }
  const u = await loadUser(userId);
  if (!u.etherfuse_customer_id || !u.etherfuse_wallet_account_id || !u.etherfuse_bank_account_id) {
    throw new EtherfuseV2Error(409, 'not-ready', 'faltan pasos previos (KYC o CLABE)');
  }

  const sourceAsset = etherfuseUsdcAsset();
  const fundingAsset = etherfuseFundingAsset();
  let dex;
  try {
    dex = await quoteStrictSendPath(parseAsset(sourceAsset), req.amount, parseAsset(fundingAsset));
  } catch (err) {
    throw new EtherfuseV2Error(503, 'dex-route-unavailable', (err as Error).message);
  }
  const fundingAmount = applySlippageBps(dex.destinationAmount, dexSlippageBps());
  const q: Quote = await createQuote(u.etherfuse_customer_id, {
    source: { type: 'stored', id: u.etherfuse_wallet_account_id },
    destination: { type: 'stored', id: u.etherfuse_bank_account_id },
    sourceAmount: fundingAmount,
    sourceAsset: fundingAsset,
    destinationAsset: 'MXN',
  });

  await db.execute(
    `INSERT INTO ramp_quotes
       (quote_id, user_id, asset, send_code, send_issuer, send_max, dex_path,
        pay_code, pay_issuer, pay_amount, destination_mxn, fee_amount, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (quote_id) DO NOTHING`,
    [
      q.quoteId,
      userId,
      'USDC',
      'USDC',
      sourceAsset.split(':')[1] ?? '',
      req.amount,
      JSON.stringify(dex.path),
      parseAsset(fundingAsset).code,
      parseAsset(fundingAsset).issuer ?? '',
      q.sourceAmount,
      q.destinationAmount,
      q.feeAmount,
      q.expiresAt,
    ],
  );

  return {
    quoteId: q.quoteId,
    sourceAmount: req.amount,
    sourceAsset,
    fundingAmount: q.sourceAmount,
    fundingAsset: q.sourceAsset,
    dexPath: dex.path,
    destinationAmount: q.destinationAmount,
    destinationAsset: 'MXN',
    feeBps: q.feeBps,
    feeAmount: q.feeAmount,
    feeAsset: q.fees[0]?.asset ?? q.sourceAsset,
    expiresAt: q.expiresAt,
    clabeMasked: (await loadClabeMask(userId)) ?? '',
  };
}

export interface WithdrawOrderResult {
  orderId: string;
  status: OrderStatus;
  fundingInstructions?: FundingInstructions;
  /** XDR sin firmar que arma Etherfuse; la app la revisa (decisión 7) antes de firmarla. */
  preparedTransaction?: string;
  swap: {
    sendAsset: StellarAssetRef;
    sendMax: string;
    destinationAsset: StellarAssetRef;
    destinationAmount: string;
    path: StellarAssetRef[];
  };
}

/**
 * Convierte un quote en una orden. Idempotente: Etherfuse responde 200 con la
 * misma orden si se reenvia el mismo quoteId.
 */
export async function confirmWithdrawOrder(userId: string, quoteId: string): Promise<WithdrawOrderResult> {
  const u = await loadUser(userId);
  if (!u.etherfuse_customer_id) throw new EtherfuseV2Error(409, 'not-ready', 'falta etherfuse_customer_id');

  const q = await db.getOne<{
    user_id: string;
    expires_at: string | null;
    send_code: string;
    send_issuer: string | null;
    send_max: string;
    dex_path: StellarAssetRef[] | string;
    pay_code: string;
    pay_issuer: string;
    pay_amount: string;
  }>(
    `SELECT user_id, expires_at, send_code, send_issuer, send_max, dex_path,
            pay_code, pay_issuer, pay_amount
       FROM ramp_quotes WHERE quote_id = $1`,
    [quoteId],
  );
  if (!q || q.user_id !== userId) {
    throw new EtherfuseV2Error(404, 'quote-not-found', 'la cotizacion no es tuya o no existe');
  }
  if (q.expires_at && new Date(q.expires_at).getTime() < Date.now()) {
    throw new EtherfuseV2Error(409, 'quote-expired', 'la cotizacion vencio; pide una nueva');
  }

  const order: Order = await createOrder(u.etherfuse_customer_id, { quoteId });
  if (
    order.source.asset !== `${q.pay_code}:${q.pay_issuer}`
    || Number(order.source.amount).toFixed(7) !== Number(q.pay_amount).toFixed(7)
  ) {
    throw new EtherfuseV2Error(502, 'order-funding-mismatch', 'Etherfuse devolvio una orden distinta de la cotizacion');
  }

  await db.execute(
    `INSERT INTO ramp_orders (order_id, user_id, quote_id, status, status_updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (order_id) DO UPDATE
       SET status = EXCLUDED.status,
           status_updated_at = EXCLUDED.status_updated_at`,
    [order.id, userId, quoteId, order.status],
  );

  return {
    orderId: order.id,
    status: order.status,
    fundingInstructions: order.fundingInstructions,
    // En rails de wallet Etherfuse arma la transaccion en
    // fundingInstructions.destination.preparedTransaction (XDR en Stellar).
    // La app la valida (decision 7) antes de firmarla.
    preparedTransaction: order.fundingInstructions?.destination?.preparedTransaction?.transaction,
    swap: {
      sendAsset: { code: q.send_code, issuer: q.send_issuer ?? undefined },
      sendMax: q.send_max,
      destinationAsset: { code: q.pay_code, issuer: q.pay_issuer },
      destinationAmount: q.pay_amount,
      path: typeof q.dex_path === 'string' ? JSON.parse(q.dex_path) as StellarAssetRef[] : q.dex_path,
    },
  };
}

/**
 * Llamado por el webhook orderUpdated. Re-lee la orden desde Etherfuse (no
 * confia en el body) y actualiza el estado. Devuelve la orden actualizada
 * para que el handler del webhook decida si mandar push ("Tu retiro llegó").
 */
export async function applyOrderUpdate(customerOrgId: string, orderId: string): Promise<{ order: Order; userId: string; previousStatus: OrderStatus | null } | null> {
  const row = await db.getOne<{ user_id: string; status: OrderStatus | null }>(
    `SELECT user_id, status FROM ramp_orders WHERE order_id = $1`,
    [orderId],
  );
  if (!row) return null;

  const order = await getOrder(customerOrgId, orderId);
  await db.execute(
    `UPDATE ramp_orders SET status = $1, status_updated_at = NOW() WHERE order_id = $2`,
    [order.status, orderId],
  );
  return { order, userId: row.user_id, previousStatus: row.status };
}

export interface UserWithdrawOrderSummary {
  orderId: string;
  status: OrderStatus;
  destinationMxn: string | null;
  createdAt: string;
  statusUpdatedAt: string | null;
}

/**
 * Lista los retiros del usuario (los ultimos 50). Solo mira la base; el estado
 * puede estar atrasado respecto a Etherfuse hasta que llegue el webhook.
 */
export async function listUserWithdrawOrders(userId: string): Promise<UserWithdrawOrderSummary[]> {
  const rows = await db.getMany<{
    order_id: string;
    status: OrderStatus;
    destination_mxn: string | null;
    created_at: string;
    status_updated_at: string | null;
  }>(
    `SELECT o.order_id, o.status, q.destination_mxn, o.created_at, o.status_updated_at
       FROM ramp_orders o
       LEFT JOIN ramp_quotes q ON q.quote_id = o.quote_id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT 50`,
    [userId],
  );
  return rows.map((r) => ({
    orderId: r.order_id,
    status: r.status,
    destinationMxn: r.destination_mxn,
    createdAt: r.created_at,
    statusUpdatedAt: r.status_updated_at,
  }));
}
