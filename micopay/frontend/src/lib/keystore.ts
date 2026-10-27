import { Capacitor } from '@capacitor/core';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { readJSON, writeJSON, removeKey } from '../services/secureStorage';
import { requireUserPresence, type PresenceReason } from './userPresence';
import { StellarKeyVault, type NativeVaultStatus } from './nativeKeyVault';

const KEYPAIR_KEY = 'stellar_keypair';

interface StoredKeypair {
    publicKey: string;
    secretKey: string; // never leaves this module via HTTP
}

function usesNativeVault(): boolean {
    return Capacitor.getPlatform() === 'android';
}

async function nativeStatus(): Promise<NativeVaultStatus> {
    return StellarKeyVault.status();
}

let nativeMigrationInFlight: Promise<NativeVaultStatus> | null = null;

/**
 * One-time migration for APKs that stored the seed through secureStorage.
 * The old record is removed only after native code confirms the same G address.
 */
async function performNativeMigration(): Promise<NativeVaultStatus> {
    const status = await nativeStatus();
    const legacy = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    if (!legacy?.secretKey) return status;

    if (status.exists && status.publicKey === legacy.publicKey) {
        await removeKey(KEYPAIR_KEY);
        return status;
    }

    const migrated = await StellarKeyVault.importSeed({
        secretKey: legacy.secretKey,
        expectedPublicKey: legacy.publicKey,
        replace: status.exists,
        reason: 'migration',
    });
    if (migrated.publicKey !== legacy.publicKey) {
        throw new Error('La migración de seguridad produjo una cuenta diferente. No se borró la cuenta anterior.');
    }
    await removeKey(KEYPAIR_KEY);
    return { exists: true, publicKey: migrated.publicKey, securityLevel: migrated.securityLevel };
}

async function ensureNativeMigration(): Promise<NativeVaultStatus> {
    if (!nativeMigrationInFlight) {
        nativeMigrationInFlight = performNativeMigration().finally(() => {
            nativeMigrationInFlight = null;
        });
    }
    return nativeMigrationInFlight;
}

export async function generateAndStoreKeypair(): Promise<string> {
    if (usesNativeVault()) {
        const result = await StellarKeyVault.generate({ reason: 'migration' });
        return result.publicKey;
    }
    const kp = Keypair.random();
    await writeJSON(KEYPAIR_KEY, {
        publicKey: kp.publicKey(),
        secretKey: kp.secret(),
    });
    return kp.publicKey();
}

export async function getPublicKey(): Promise<string | null> {
    if (usesNativeVault()) {
        const status = await ensureNativeMigration();
        return status.exists ? status.publicKey ?? null : null;
    }
    const stored = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    return stored?.publicKey ?? null;
}

export async function keypairExists(): Promise<boolean> {
    if (usesNativeVault()) {
        const status = await nativeStatus();
        if (status.exists) return true;
        const legacy = await readJSON<StoredKeypair>(KEYPAIR_KEY);
        return Boolean(legacy?.secretKey);
    }
    const stored = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    return stored !== null && !!stored.secretKey;
}

export async function signChallenge(challenge: string): Promise<string> {
    if (usesNativeVault()) {
        await ensureNativeMigration();
        return (await StellarKeyVault.signChallenge({ challenge, reason: 'sign_request' })).signature;
    }
    const stored = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    if (!stored?.secretKey) throw new Error('No keypair — call generateAndStoreKeypair first');
    const kp = Keypair.fromSecret(stored.secretKey);
    const sig = kp.sign(Buffer.from(challenge, 'utf8'));
    return sig.toString('base64');
}

/**
 * Sign a backend-prepared transaction XDR locally and return the signed XDR.
 * Used for Soroban contract calls (e.g. escrow lock/release) where the
 * contract's require_auth() must be satisfied by the device's own key —
 * the secret key never leaves this module.
 */
export async function signTransactionXdr(
    xdr: string,
    networkPassphrase: string,
    reason: PresenceReason = 'sign_request',
): Promise<string> {
    if (usesNativeVault()) {
        await ensureNativeMigration();
        return (await StellarKeyVault.signTransaction({ xdr, networkPassphrase, reason })).signedXdr;
    }
    // La compuerta va DENTRO, no en cada llamador: esta funcion firma
    // transacciones que mueven dinero, y un llamador nuevo que se olvide de
    // pedir confirmacion volveria a abrir el hueco en silencio.
    await requireUserPresence(reason);
    const stored = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    if (!stored?.secretKey) throw new Error('No keypair — call generateAndStoreKeypair first');
    const kp = Keypair.fromSecret(stored.secretKey);
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    tx.sign(kp);
    return tx.toXDR();
}

export async function importKeypair(secretKey: string): Promise<string> {
    if (usesNativeVault()) {
        const kp = Keypair.fromSecret(secretKey);
        const result = await StellarKeyVault.importSeed({
            secretKey,
            expectedPublicKey: kp.publicKey(),
            replace: (await nativeStatus()).exists,
            reason: 'migration',
        });
        await removeKey(KEYPAIR_KEY);
        return result.publicKey;
    }
    const kp = Keypair.fromSecret(secretKey); // throws on bad input
    await writeJSON(KEYPAIR_KEY, {
        publicKey: kp.publicKey(),
        secretKey: kp.secret(),
    });
    return kp.publicKey();
}

/**
 * Devuelve la llave secreta SIN pedir confirmacion.
 *
 * No lleva compuerta a proposito: varias rutas la usan para derivar la clave
 * publica o firmar operaciones internas, y pedir huella para consultar un saldo
 * enseñaria a la gente a confirmar sin leer.
 *
 * Para enseñarsela a la persona, usar `revealSecretKey()`.
 */
export async function exportSecretKey(): Promise<string> {
    if (usesNativeVault()) {
        throw new Error('La llave protegida no se puede exportar por una ruta de firma. Usa revealSecretKey().');
    }
    const stored = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    if (!stored?.secretKey) throw new Error('No keypair stored');
    return stored.secretKey;
}

/**
 * La llave para MOSTRARSELA a la persona (respaldo). Siempre pregunta, y sin
 * ventana de gracia: es el secreto de mayor valor del sistema y quien la ve
 * puede vaciar la cuenta desde cualquier otro dispositivo.
 */
export async function revealSecretKey(): Promise<string> {
    if (usesNativeVault()) {
        await ensureNativeMigration();
        return (await StellarKeyVault.revealSeed({ reason: 'reveal_key' })).secretKey;
    }
    await requireUserPresence('reveal_key', true);
    return exportSecretKey();
}

export async function deleteKeypair(): Promise<void> {
    if (usesNativeVault()) {
        const status = await nativeStatus();
        if (status.exists) await StellarKeyVault.deleteKey({ reason: 'migration' });
    }
    await removeKey(KEYPAIR_KEY);
}
