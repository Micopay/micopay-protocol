import {
  Address,
  FeeBumpTransaction,
  Transaction,
  TransactionBuilder,
  WebAuth,
  scValToNative,
  type Operation,
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import type { EscrowAction } from './escrowTxValidation';

/**
 * Puerta de entrada de las firmas que pide una web a la APK. Todo lo que llega
 * aqui se trata como hostil: nada se muestra ni se firma hasta pasar estas
 * revisiones, y la pantalla sale del XDR analizado, nunca de texto de la web.
 */

export const WALLET_SIGN_METHOD = 'stellar_signXDR';

export class WalletRequestRejected extends Error {
  constructor(detail: string) {
    super(`Solicitud rechazada: ${detail}`);
    this.name = 'WalletRequestRejected';
  }
}

export interface WalletRequest {
  id: number;
  topic: string;
  /** Dominio que confirmo el servicio de verificacion, no el que dice la web. */
  verifiedOrigin: string;
  validation: 'VALID' | 'INVALID' | 'UNKNOWN';
  isScam?: boolean;
  chainId: string;
  method: string;
  /** Segundos Unix. */
  expiry: number;
  xdr: unknown;
}

export interface WalletPolicy {
  officialOrigin: string;
  chainId: string;
  networkPassphrase: string;
  /** Cuenta de esta APK. */
  account: string;
  allowedContracts: readonly string[];
  now: number;
  /** Fijados en el build. Sin llave, la APK no firma retos de inicio de sesion. */
  sep10SigningKey?: string;
  sep10HomeDomain?: string;
  sep10WebAuthDomain?: string;
}

export interface EscrowRequestSummary {
  action: EscrowAction;
  contractId: string;
  /** Hex de 32 bytes: `lock` lleva el hash del secreto; las demas, el trade_id. */
  tradeKey: string;
  kind: 'secret_hash' | 'trade_id';
}

const EXPECTED_ARGS: Record<EscrowAction, number> = { lock: 6, release: 2, decline: 1 };

export function chainIdForPassphrase(isPublic: boolean): string {
  return isPublic ? 'stellar:pubnet' : 'stellar:testnet';
}

export interface WalletProposal {
  verifiedOrigin: string;
  validation: 'VALID' | 'INVALID' | 'UNKNOWN';
  isScam?: boolean;
  requiredMethods: readonly string[];
  requiredChains: readonly string[];
}

/** Una conexion solo se ofrece si viene del dominio oficial y pide lo nuestro. */
export function assertWalletProposal(
  proposal: WalletProposal,
  policy: Pick<WalletPolicy, 'officialOrigin' | 'chainId'>,
): void {
  if (proposal.isScam) throw new WalletRequestRejected('dominio marcado como fraude');
  if (proposal.validation !== 'VALID') throw new WalletRequestRejected('dominio sin verificar');
  if (proposal.verifiedOrigin !== policy.officialOrigin) throw new WalletRequestRejected('dominio no autorizado');
  if (proposal.requiredMethods.some((method) => method !== WALLET_SIGN_METHOD)) {
    throw new WalletRequestRejected('método no permitido');
  }
  if (proposal.requiredChains.some((chain) => chain !== policy.chainId)) {
    throw new WalletRequestRejected('red distinta a la de esta app');
  }
}

/** Revisa de quien viene la solicitud, sin mirar todavia que pide firmar. */
export function assertWalletRequestOrigin(
  request: WalletRequest,
  policy: WalletPolicy,
  seen: Set<string>,
): void {
  if (request.isScam) throw new WalletRequestRejected('dominio marcado como fraude');
  if (request.validation !== 'VALID') throw new WalletRequestRejected('dominio sin verificar');
  if (request.verifiedOrigin !== policy.officialOrigin) throw new WalletRequestRejected('dominio no autorizado');
  if (request.chainId !== policy.chainId) throw new WalletRequestRejected('red distinta a la de esta app');
  if (request.method !== WALLET_SIGN_METHOD) throw new WalletRequestRejected('método no permitido');
  if (request.expiry <= policy.now) throw new WalletRequestRejected('solicitud vencida');

  const key = `${request.topic}:${request.id}`;
  if (seen.has(key)) throw new WalletRequestRejected('solicitud repetida');
  seen.add(key);
}

/** Un reto lo emite el servidor: la fuente de la transaccion es su llave. */
export function isSep10Challenge(xdr: unknown, policy: WalletPolicy): boolean {
  if (typeof xdr !== 'string' || !policy.sep10SigningKey) return false;
  try {
    const parsed = TransactionBuilder.fromXDR(xdr, policy.networkPassphrase);
    return !(parsed instanceof FeeBumpTransaction) && parsed.source === policy.sep10SigningKey;
  } catch {
    return false;
  }
}

/** Valida el reto con las reglas de SEP-10; nunca como transaccion ejecutable. */
export function parseSep10Request(xdr: string, policy: WalletPolicy): { homeDomain: string } {
  if (!policy.sep10SigningKey || !policy.sep10HomeDomain || !policy.sep10WebAuthDomain) {
    throw new WalletRequestRejected('inicio de sesión web sin configurar');
  }
  let challenge: ReturnType<typeof WebAuth.readChallengeTx>;
  try {
    challenge = WebAuth.readChallengeTx(
      xdr,
      policy.sep10SigningKey,
      policy.networkPassphrase,
      policy.sep10HomeDomain,
      policy.sep10WebAuthDomain,
    );
  } catch {
    throw new WalletRequestRejected('reto de inicio de sesión inválido');
  }
  if (challenge.clientAccountID !== policy.account) {
    throw new WalletRequestRejected('el reto es de otra cuenta');
  }
  return { homeDomain: challenge.matchedHomeDomain };
}

/** Decodifica el XDR y exige una llamada a un escrow de MicoPay de esta cuenta. */
export function parseEscrowRequest(xdr: unknown, policy: WalletPolicy): EscrowRequestSummary {
  if (typeof xdr !== 'string' || xdr.length === 0) throw new WalletRequestRejected('transacción vacía');

  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(xdr, policy.networkPassphrase);
  } catch {
    throw new WalletRequestRejected('no se pudo decodificar la transacción');
  }
  if (parsed instanceof FeeBumpTransaction) throw new WalletRequestRejected('no se admiten fee-bump');
  if (parsed.source !== policy.account) throw new WalletRequestRejected('la transacción es de otra cuenta');
  if (parsed.signatures.length !== 0) throw new WalletRequestRejected('la transacción ya contiene firmas');
  if (parsed.operations.length !== 1 || parsed.operations[0].type !== 'invokeHostFunction') {
    throw new WalletRequestRejected('se esperaba una sola llamada de contrato');
  }

  const operation = parsed.operations[0] as Operation.InvokeHostFunction;
  if (operation.source && operation.source !== policy.account) {
    throw new WalletRequestRejected('la operación usa otra cuenta');
  }
  if (operation.func.switch().name !== 'hostFunctionTypeInvokeContract') {
    throw new WalletRequestRejected('la operación no llama un contrato');
  }

  const invocation = operation.func.invokeContract();
  const contractId = Address.fromScAddress(invocation.contractAddress()).toString();
  if (!policy.allowedContracts.includes(contractId)) throw new WalletRequestRejected('contrato no autorizado');

  const action = invocation.functionName().toString() as EscrowAction;
  if (!(action in EXPECTED_ARGS)) throw new WalletRequestRejected('función no permitida');
  const args = invocation.args();
  if (args.length !== EXPECTED_ARGS[action]) throw new WalletRequestRejected('argumentos inesperados');

  const key = scValToNative(action === 'lock' ? args[4] : args[0]);
  if (!(key instanceof Uint8Array) || key.length !== 32) {
    throw new WalletRequestRejected('identificador de operación inválido');
  }
  return {
    action,
    contractId,
    tradeKey: Buffer.from(key).toString('hex'),
    kind: action === 'lock' ? 'secret_hash' : 'trade_id',
  };
}
