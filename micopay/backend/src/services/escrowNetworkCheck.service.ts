/**
 * WP1a del plan de correcciones del escrow (2026-10-29): al arrancar, cada
 * contrato configurado debe existir en la red de `STELLAR_NETWORK`.
 *
 * Un contrato de otra red (por ejemplo, un ID de mainnet con
 * STELLAR_NETWORK=TESTNET) no falla al configurarse: falla en la primera
 * operacion, con fondos de por medio. El ID de un contrato depende de la red,
 * asi que un ID de otra red no existe en esta.
 *
 * Solo una respuesta definitiva detiene el arranque (RPC de otra red o
 * instancia inexistente). Si el RPC no responde, se registra y se sigue: una
 * caida del RPC no debe dejar al backend en un ciclo de reinicios.
 */
import { config } from '../config.js';
import { rpcRead } from '../lib/stellarRpc.js';

interface CheckLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

/** Contratos que el backend puede llamar: por activo, legacy y los de decline. */
export function configuredEscrowContracts(): string[] {
  const ids = [
    ...Object.values(config.escrowContracts),
    config.escrowLegacyContractId,
    ...config.escrowDeclineContractIds,
  ].filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

export async function assertEscrowContractsOnNetwork(log: CheckLog): Promise<void> {
  if (config.mockStellar) return;

  const { Contract, Networks, xdr } = await import('@stellar/stellar-sdk');
  const expectedPassphrase = config.stellarNetwork === 'TESTNET' ? Networks.TESTNET : Networks.PUBLIC;
  const contracts = configuredEscrowContracts();
  const keys = contracts.map((id) => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: new Contract(id).address().toScAddress(),
    key: xdr.ScVal.scvLedgerKeyContractInstance(),
    durability: xdr.ContractDataDurability.persistent(),
  })));

  let passphrase: string;
  let found: Set<string>;
  try {
    passphrase = (await rpcRead(config.stellarRpcUrl, (s) => s.getNetwork())).passphrase;
    const res = await rpcRead(config.stellarRpcUrl, (s) => s.getLedgerEntries(...keys));
    found = new Set(res.entries.map((e) => e.key.toXDR('base64')));
  } catch (err) {
    log.warn(
      { err, category: 'escrow-network-check' },
      '[escrow] Could not verify escrow contracts against the network; continuing',
    );
    return;
  }

  if (passphrase !== expectedPassphrase) {
    throw new Error(
      `STELLAR_RPC_URL serves "${passphrase}", but STELLAR_NETWORK=${config.stellarNetwork} expects "${expectedPassphrase}".`,
    );
  }

  const missing = contracts.filter((_, i) => !found.has(keys[i].toXDR('base64')));
  if (missing.length > 0) {
    throw new Error(
      `Escrow contracts not found on ${config.stellarNetwork}: ${missing.join(', ')}. ` +
      'Check ESCROW_CONTRACTS, ESCROW_LEGACY_CONTRACT_ID and ESCROW_DECLINE_CONTRACT_IDS.',
    );
  }

  log.info(
    { category: 'escrow-network-check', network: config.stellarNetwork, contracts },
    '[escrow] Escrow contracts verified on network',
  );
}
