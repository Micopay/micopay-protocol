import { registerPlugin } from '@capacitor/core';
import type { PresenceReason } from './userPresence';

export type NativeVaultReason = PresenceReason | 'migration';
export type NativeSecurityLevel = 'not_created' | 'strongbox' | 'tee' | 'software' | 'unknown';

export interface NativeVaultStatus {
  exists: boolean;
  publicKey?: string | null;
  securityLevel: NativeSecurityLevel;
}

interface StellarKeyVaultPlugin {
  status(): Promise<NativeVaultStatus>;
  generate(options: { reason: NativeVaultReason }): Promise<{ publicKey: string; securityLevel: NativeSecurityLevel }>;
  importSeed(options: {
    secretKey: string;
    expectedPublicKey?: string;
    replace?: boolean;
    reason: NativeVaultReason;
  }): Promise<{ publicKey: string; securityLevel: NativeSecurityLevel }>;
  getPublicKey(): Promise<{ publicKey: string; securityLevel: NativeSecurityLevel }>;
  signChallenge(options: { challenge: string; reason: NativeVaultReason }): Promise<{ signature: string }>;
  signTransaction(options: {
    xdr: string;
    networkPassphrase: string;
    reason: NativeVaultReason;
  }): Promise<{ signedXdr: string }>;
  revealSeed(options: { reason: 'reveal_key' }): Promise<{ secretKey: string }>;
  deleteKey(options: { reason: NativeVaultReason }): Promise<void>;
}

export const StellarKeyVault = registerPlugin<StellarKeyVaultPlugin>('StellarKeyVault');
