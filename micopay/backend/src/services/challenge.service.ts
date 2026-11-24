import { randomBytes } from 'crypto';
import { Keypair, Networks, StrKey, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { config } from '../config.js';
import db from '../db/schema.js';
import { AppError, AuthError } from '../utils/errors.js';

/**
 * Retos de prueba de posesion de llave, compartidos por /auth/token, /auth/sep10
 * y /users/register: registrar una direccion siempre exige demostrar que se
 * tiene su llave privada (docs/AUDIT_MOBILE_MAINNET.md, "Registro sin prueba de
 * posesion de llave").
 *
 * Viven en PostgreSQL: admiten varios retos por direccion, sobreviven a un
 * despliegue y solo quien gana el UPDATE de `consume` obtiene sesion.
 */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Se conservan un dia despues de vencer, por si hay que revisar un intento. */
const CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000;

type ChallengeFormat = 'apk' | 'sep10';

function invalidChallenge(devMessage: string): AuthError {
  return new AuthError(
    'AUTH_INVALID_CHALLENGE',
    'El código de verificación no es válido o ha expirado. Por favor, intenta de nuevo.',
    devMessage,
  );
}

async function storeChallenge(
  challengeId: string,
  stellarAddress: string,
  format: ChallengeFormat,
): Promise<number> {
  const now = Date.now();
  const expiresAt = now + CHALLENGE_TTL_MS;
  await db.execute('DELETE FROM auth_challenges WHERE expires_at < $1', [
    new Date(now - CHALLENGE_RETENTION_MS).toISOString(),
  ]);
  await db.execute(
    `INSERT INTO auth_challenges (challenge_id, stellar_address, format, network, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [challengeId, stellarAddress, format, config.stellarNetwork, new Date(expiresAt).toISOString()],
  );
  return expiresAt;
}

/** Rechaza antes de gastar trabajo en la firma; no sustituye a `consumeChallenge`. */
async function requirePendingChallenge(
  challengeId: string,
  stellarAddress: string,
  format: ChallengeFormat,
): Promise<void> {
  const stored = await db.getOne<{ expires_at: string | Date }>(
    `SELECT expires_at FROM auth_challenges
     WHERE challenge_id = $1 AND stellar_address = $2 AND format = $3 AND network = $4
       AND consumed_at IS NULL`,
    [challengeId, stellarAddress, format, config.stellarNetwork],
  );
  if (!stored) throw invalidChallenge('Invalid or mismatched challenge provided');
  if (Date.now() >= new Date(stored.expires_at).getTime()) {
    throw new AuthError(
      'AUTH_CHALLENGE_EXPIRED',
      'El código de verificación ha expirado. Por favor, solicita uno nuevo.',
      'Challenge expired',
    );
  }
}

/** Con dos intentos simultaneos, solo uno recibe la fila. */
async function consumeChallenge(
  challengeId: string,
  stellarAddress: string,
  format: ChallengeFormat,
): Promise<void> {
  const consumed = await db.getOne(
    `UPDATE auth_challenges SET consumed_at = $1
     WHERE challenge_id = $2 AND stellar_address = $3 AND format = $4 AND network = $5
       AND consumed_at IS NULL AND expires_at > $6
     RETURNING challenge_id`,
    [
      new Date().toISOString(),
      challengeId,
      stellarAddress,
      format,
      config.stellarNetwork,
      new Date().toISOString(),
    ],
  );
  if (!consumed) throw invalidChallenge('Challenge already consumed or expired');
}

export async function issueChallenge(
  stellarAddress: string,
): Promise<{ challenge: string; expiresAt: number }> {
  const challenge = `micopay-auth-${randomBytes(16).toString('hex')}-${Date.now()}`;
  const expiresAt = await storeChallenge(challenge, stellarAddress, 'apk');
  return { challenge, expiresAt };
}

/**
 * Verifies a previously issued challenge was signed by the holder of
 * `stellarAddress`'s private key, then consumes it (single-use). Throws
 * AuthError on any failure. Signature verification itself is skipped when
 * `MOCK_STELLAR=true` (matches the existing /auth/token behavior), but the
 * challenge must still exist and not be expired even in mock mode.
 */
export async function verifyAndConsumeChallenge(
  stellarAddress: string,
  challenge: string,
  signature: string,
): Promise<void> {
  await requirePendingChallenge(challenge, stellarAddress, 'apk');

  if (!config.mockStellar) {
    let verified = false;
    let reason = 'Invalid signature';
    try {
      verified = Keypair.fromPublicKey(stellarAddress).verify(
        Buffer.from(challenge, 'utf8'),
        Buffer.from(signature, 'base64'),
      );
    } catch (err: any) {
      reason = `Signature verification failed: ${err.message}`;
    }
    if (!verified) {
      throw new AuthError(
        'AUTH_INVALID_CREDENTIALS',
        'La firma no es válida. Por favor, intenta de nuevo.',
        reason,
      );
    }
  }

  await consumeChallenge(challenge, stellarAddress, 'apk');
}

function networkPassphrase(): string {
  return config.stellarNetwork === 'TESTNET' ? Networks.TESTNET : Networks.PUBLIC;
}

function sep10Keypair(): Keypair {
  if (!config.sep10SigningSecret) {
    throw new AppError(
      'SEP10_NOT_CONFIGURED',
      'El inicio de sesión web no está disponible por ahora.',
      'SEP10_SIGNING_SECRET is not set',
      503,
    );
  }
  return Keypair.fromSecret(config.sep10SigningSecret);
}

/** Reto SEP-10 completo: fuente del servidor, secuencia 0 y solo `ManageData`. */
export async function issueSep10Challenge(
  account: string,
): Promise<{ transaction: string; network_passphrase: string }> {
  if (!StrKey.isValidEd25519PublicKey(account)) {
    throw invalidChallenge('account is not a G address');
  }
  const passphrase = networkPassphrase();
  const transaction = WebAuth.buildChallengeTx(
    sep10Keypair(),
    account,
    config.sep10HomeDomain,
    CHALLENGE_TTL_MS / 1000,
    passphrase,
    config.sep10WebAuthDomain,
  );
  const challengeId = TransactionBuilder.fromXDR(transaction, passphrase).hash().toString('hex');
  await storeChallenge(challengeId, account, 'sep10');
  return { transaction, network_passphrase: passphrase };
}

/** Valida el reto firmado por la billetera, lo consume y devuelve su cuenta. */
export async function verifyAndConsumeSep10Challenge(signedTransaction: string): Promise<string> {
  const server = sep10Keypair().publicKey();
  const passphrase = networkPassphrase();

  let account: string;
  let challengeId: string;
  try {
    ({ clientAccountID: account } = WebAuth.readChallengeTx(
      signedTransaction,
      server,
      passphrase,
      config.sep10HomeDomain,
      config.sep10WebAuthDomain,
    ));
    if (!StrKey.isValidEd25519PublicKey(account)) throw new Error('account is not a G address');
    challengeId = TransactionBuilder.fromXDR(signedTransaction, passphrase).hash().toString('hex');
  } catch (err: any) {
    throw invalidChallenge(`SEP-10 challenge rejected: ${err.message}`);
  }

  await requirePendingChallenge(challengeId, account, 'sep10');

  try {
    WebAuth.verifyChallengeTxSigners(
      signedTransaction,
      server,
      passphrase,
      [account],
      config.sep10HomeDomain,
      config.sep10WebAuthDomain,
    );
  } catch (err: any) {
    throw new AuthError(
      'AUTH_INVALID_CREDENTIALS',
      'La firma no es válida. Por favor, intenta de nuevo.',
      `SEP-10 signature rejected: ${err.message}`,
    );
  }

  await consumeChallenge(challengeId, account, 'sep10');
  return account;
}
