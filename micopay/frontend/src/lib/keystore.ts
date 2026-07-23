import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { readJSON, writeJSON, removeKey } from '../services/secureStorage';

const KEYPAIR_KEY = 'stellar_keypair';

interface StoredKeypair {
    publicKey: string;
    secretKey: string; // never leaves this module via HTTP
}

export async function generateAndStoreKeypair(): Promise<string> {
    const kp = Keypair.random();
    await writeJSON(KEYPAIR_KEY, {
        publicKey: kp.publicKey(),
        secretKey: kp.secret(),
    });
    return kp.publicKey();
}

export async function getPublicKey(): Promise<string | null> {
    const stored = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    return stored?.publicKey ?? null;
}

export async function keypairExists(): Promise<boolean> {
    const stored = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    return stored !== null && !!stored.secretKey;
}

export async function signChallenge(challenge: string): Promise<string> {
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
export async function signTransactionXdr(xdr: string, networkPassphrase: string): Promise<string> {
    const stored = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    if (!stored?.secretKey) throw new Error('No keypair — call generateAndStoreKeypair first');
    const kp = Keypair.fromSecret(stored.secretKey);
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    tx.sign(kp);
    return tx.toXDR();
}

export async function importKeypair(secretKey: string): Promise<string> {
    const kp = Keypair.fromSecret(secretKey); // throws on bad input
    await writeJSON(KEYPAIR_KEY, {
        publicKey: kp.publicKey(),
        secretKey: kp.secret(),
    });
    return kp.publicKey();
}

export async function exportSecretKey(): Promise<string> {
    const stored = await readJSON<StoredKeypair>(KEYPAIR_KEY);
    if (!stored?.secretKey) throw new Error('No keypair stored');
    return stored.secretKey;
}

export async function deleteKeypair(): Promise<void> {
    await removeKey(KEYPAIR_KEY);
}