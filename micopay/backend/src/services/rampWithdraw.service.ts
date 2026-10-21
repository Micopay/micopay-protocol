// Orquesta "Retirar a banco" (SPEI) usando el cliente v2 de Etherfuse.
// Este archivo pega las piezas: crea la personal org del usuario, le envia los
// datos de verificacion, registra la CLABE y la wallet como cuentas de pago,
// y re-lee de Etherfuse cuando llega un webhook. No cotiza ni crea ordenes;
// eso llega en el siguiente slice.
//
// Decisiones base en docs/PLAN_RETIRO_BANCO_2026-10-20.md.

import db from '../db/schema.js';
import {
  EtherfuseV2Error,
  type LaunchForm,
  type PaymentAccount,
  type VerificationStatus,
  buildLaunchForm,
  createPersonalOrg,
  getPaymentAccount,
  getVerificationStatus,
  registerPaymentAccount,
  submitVerification,
} from './etherfuseV2.service.js';

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
  | 'needs_bank'       // KYC aprobado, falta registrar CLABE
  | 'ready';           // listo para cotizar y retirar

export interface BankWithdrawStatus {
  stage: BankWithdrawStage;
  /** CLABE enmascarada (xxxx-xxxx-xx-xxxx-1234). */
  clabeMasked?: string;
  /** Ultimo mensaje legible de Etherfuse si hay accion requerida. */
  kycMessage?: string | null;
}

export type EtherfuseKycStatus = 'not_started' | 'review' | 'approved' | 'action_required' | 'rejected';

interface UserRow {
  id: string;
  stellar_address: string | null;
  username: string | null;
  kyc_status: string;
  etherfuse_customer_id: string | null;
  etherfuse_bank_account_id: string | null;
  etherfuse_wallet_account_id: string | null;
  etherfuse_kyc_status: EtherfuseKycStatus;
  etherfuse_kyc_updated_at: string | null;
}

async function loadUser(userId: string): Promise<UserRow> {
  const user = await db.getOne<UserRow>(
    `SELECT id, stellar_address, username, kyc_status,
            etherfuse_customer_id, etherfuse_bank_account_id,
            etherfuse_wallet_account_id, etherfuse_kyc_status,
            etherfuse_kyc_updated_at
       FROM users WHERE id = $1`,
    [userId],
  );
  if (!user) throw new Error(`rampWithdraw: usuario no encontrado ${userId}`);
  return user;
}

export async function getBankWithdrawStatus(userId: string): Promise<BankWithdrawStatus> {
  const u = await loadUser(userId);
  // Didit es la verificacion basica que ya existe en P2P.
  if (u.kyc_status !== 'approved') return { stage: 'needs_didit' };
  if (!u.etherfuse_customer_id) return { stage: 'needs_kyc' };
  if (u.etherfuse_kyc_status !== 'approved') return { stage: 'kyc_review' };
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
  verification: VerificationStatus;
  launch: LaunchForm;
}

/**
 * Crea la personal org del usuario en Etherfuse (si no existe), manda los datos
 * de verificacion y devuelve lo necesario para abrir /idv. Guarda el customer
 * id del usuario.
 *
 * No sube documentos: en el modelo de hoy el INE sale de Didit (futuro slice
 * mapea los binarios) y la constancia y la ocupacion las sube el usuario en
 * su propia pantalla, igual que la selfie.
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

  // 2. Enviar datos de verificacion.
  const verification = await submitVerification(org.id, {
    firstName: req.firstName,
    lastName: req.lastName,
    dateOfBirth: req.dateOfBirth,
    taxId: req.taxId,
    country: req.country,
    address: req.address,
  });

  // 3. Dejar al usuario pasar a 'review' en Etherfuse. Si Etherfuse ya responde
  // 'approved', el webhook kycUpdated nos lo movera a 'approved'.
  const initialEtherfuseKyc: EtherfuseKycStatus = verification.overall === 'approved' ? 'approved' : 'review';
  await db.execute(
    `UPDATE users SET etherfuse_kyc_status = $1, etherfuse_kyc_updated_at = NOW() WHERE id = $2`,
    [initialEtherfuseKyc, userId],
  );

  const launch = buildLaunchForm(
    org.id,
    { email: req.email, name: req.displayName },
    '/kyc',
    undefined,
  );

  return { customerOrgId: org.id, verification, launch };
}

/**
 * Llamado por el webhook kycUpdated. Re-lee el estado desde Etherfuse (no
 * confiamos en el body del aviso) y actualiza la base.
 */
export async function applyKycUpdate(customerOrgId: string): Promise<VerificationStatus | null> {
  const user = await db.getOne<{ id: string }>(
    `SELECT id FROM users WHERE etherfuse_customer_id = $1`,
    [customerOrgId],
  );
  if (!user) return null;

  const status = await getVerificationStatus(customerOrgId);
  const mapped: EtherfuseKycStatus =
    status.overall === 'approved' ? 'approved' :
    status.overall === 'rejected' ? 'rejected' :
    status.overall === 'actionRequired' ? 'action_required' :
    status.overall === 'notStarted' ? 'not_started' :
    'review';
  await db.execute(
    `UPDATE users SET etherfuse_kyc_status = $1, etherfuse_kyc_updated_at = NOW() WHERE id = $2`,
    [mapped, user.id],
  );
  return status;
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
