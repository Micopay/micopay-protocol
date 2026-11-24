/**
 * WP1a del plan de correcciones del escrow (2026-10-29): al arrancar, cada
 * contrato configurado debe existir en la red de STELLAR_NETWORK.
 *
 * Cubre: RPC de otra red, contrato inexistente (incluido el legacy), caso
 * sano, y que una caida del RPC no detenga el arranque.
 *
 * Sin red: el RPC se sustituye con setRpcServerFactoryForTests.
 */

import { strictEqual, ok } from "assert";
import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import { randomBytes } from "crypto";

const XLM = StrKey.encodeContract(randomBytes(32));
const USDC = StrKey.encodeContract(randomBytes(32));
const LEGACY = StrKey.encodeContract(randomBytes(32));

// config se lee al importar: se fija el entorno antes de cargar los servicios.
process.env.PLATFORM_SECRET_KEY = Keypair.random().secret();
process.env.MOCK_STELLAR = "false";
process.env.ALLOW_IN_MEMORY_DB = "true";
process.env.STELLAR_NETWORK = "TESTNET";
process.env.ESCROW_CONTRACTS = `XLM=${XLM},USDC=${USDC}`;
process.env.ESCROW_LEGACY_CONTRACT_ID = LEGACY;
process.env.ESCROW_DECLINE_CONTRACT_IDS = `${XLM},${USDC}`;

const { assertEscrowContractsOnNetwork, configuredEscrowContracts } = await import("../services/escrowNetworkCheck.service.js");
const { setRpcServerFactoryForTests } = await import("../lib/stellarRpc.js");

const warnings: string[] = [];
const log = { info: () => {}, warn: (_: object, msg: string) => { warnings.push(msg); } };

/** RPC simulado: `present` son los contratos cuya instancia existe. */
function useRpc(opts: { passphrase?: string; present?: string[]; down?: boolean }) {
  setRpcServerFactoryForTests(async () => ({
    getNetwork: async () => {
      if (opts.down) throw new Error("socket hang up");
      return { passphrase: opts.passphrase ?? Networks.TESTNET };
    },
    getLedgerEntries: async (...keys: any[]) => ({
      latestLedger: 1,
      entries: keys
        .filter((k) => (opts.present ?? []).includes(StrKey.encodeContract(k.contractData().contract().contractId())))
        .map((key) => ({ key })),
    }),
  }) as any);
}

async function expectFailure(what: string, includes: string) {
  try {
    await assertEscrowContractsOnNetwork(log);
  } catch (err) {
    ok(String((err as Error).message).includes(includes), `${what}: unexpected message ${(err as Error).message}`);
    return;
  }
  throw new Error(`${what}: startup should have failed`);
}

function testListsEveryContractOnce() {
  const ids = configuredEscrowContracts();
  strictEqual(ids.length, 3, "per asset + legacy, decline ids deduplicated");
  ok(ids.includes(XLM) && ids.includes(USDC) && ids.includes(LEGACY));
  console.log("  ✓ revisa los contratos por activo, el legacy y los de decline, sin repetir");
}

async function testHealthyStartup() {
  useRpc({ present: [XLM, USDC, LEGACY] });
  await assertEscrowContractsOnNetwork(log);
  console.log("  ✓ todos los contratos existen en la red: el arranque sigue");
}

async function testRpcOnOtherNetwork() {
  useRpc({ passphrase: Networks.PUBLIC, present: [XLM, USDC, LEGACY] });
  await expectFailure("rpc on mainnet", "STELLAR_NETWORK=TESTNET");
  console.log("  ✓ un RPC de otra red detiene el arranque");
}

async function testMissingContract() {
  useRpc({ present: [XLM, USDC] });
  await expectFailure("legacy missing", LEGACY);
  useRpc({ present: [XLM, LEGACY] });
  await expectFailure("usdc missing", USDC);
  console.log("  ✓ un contrato que no existe en la red (incluido el legacy) detiene el arranque");
}

async function testRpcDownDoesNotBlockStartup() {
  warnings.length = 0;
  useRpc({ down: true });
  await assertEscrowContractsOnNetwork(log);
  strictEqual(warnings.length, 1, "the outage is logged");
  console.log("  ✓ si el RPC no responde, se registra y el arranque sigue");
}

async function main() {
  console.log("\n  WP1a · contratos del escrow en la red configurada:\n");
  testListsEveryContractOnce();
  await testHealthyStartup();
  await testRpcOnOtherNetwork();
  await testMissingContract();
  await testRpcDownDoesNotBlockStartup();
  setRpcServerFactoryForTests(null);
  console.log("\nAll escrow network check tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
