// Shared ZK on-chain verification helpers.
// Used by routes/zk.ts (pay-per-use verify) and routes/inference.ts
// (credential-gated resource consumption).
import * as StellarSdk from "@stellar/stellar-sdk";

const RPC_URL =
  process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const NET = StellarSdk.Networks.TESTNET;

// Number of public inputs expected per circuit (shape validation).
export const CIRCUIT_SPECS: Record<string, { numInputs: number }> = {
  poseidon_preimage: { numInputs: 1 }, // [hash]
  reputation_v1: { numInputs: 4 }, // [merkle_root, tier_threshold, context, nullifier]
  access_credential_v1: { numInputs: 2 }, // [merkle_root, nullifier] — burn-once access credential
};

// Circuits whose last public input is a nullifier → routed to verify_unique
// (on-chain anti-double-spend). Others use verify.
export const NULLIFIER_CIRCUITS = new Set([
  "reputation_v1",
  "access_credential_v1",
]);

// Circuits whose public_inputs[0] is a Merkle root to cross-check on-chain.
export const ROOTED_CIRCUITS = new Set([
  "reputation_v1",
  "access_credential_v1",
]);

// Thrown when verify_unique rejects a nullifier that was already spent.
export class NullifierAlreadyUsedError extends Error {
  constructor() {
    super("Nullifier already used — this credential has already been spent");
    this.name = "NullifierAlreadyUsedError";
  }
}

// Encode decimal field element strings to concatenated 32-byte big-endian buffers.
// Matches the raw Bytes encoding expected by UltraHonkVerifier::verify().
export function encodePublicInputs(inputs: string[]): Buffer {
  const bufs = inputs.map((v) => {
    const hex = BigInt(v).toString(16).padStart(64, "0");
    return Buffer.from(hex, "hex");
  });
  return Buffer.concat(bufs);
}

/**
 * Invoke the on-chain verifier. For nullifier-bearing circuits this calls
 * verify_unique (which records the nullifier → burn-once). Returns true if the
 * proof verifies, false if the proof is invalid.
 * Throws NullifierAlreadyUsedError if the credential was already spent.
 */
export async function invokeVerify(
  circuitId: string,
  proofBuf: Buffer,
  publicInputs: string[]
): Promise<boolean> {
  const contractId = process.env.ZK_VERIFIER_CONTRACT_ID ?? "";
  if (!contractId) {
    throw new Error("ZK_VERIFIER_CONTRACT_ID env var not set");
  }

  const rpc = new StellarSdk.rpc.Server(RPC_URL);
  const signerKP = StellarSdk.Keypair.fromSecret(
    process.env.ADMIN_SECRET_KEY ?? ""
  );
  const account = await rpc.getAccount(signerKP.publicKey());
  const contract = new StellarSdk.Contract(contractId);

  const contractFn = NULLIFIER_CIRCUITS.has(circuitId)
    ? "verify_unique"
    : "verify";

  const circuitIdVal = StellarSdk.xdr.ScVal.scvSymbol(circuitId);
  const inputsVal = StellarSdk.xdr.ScVal.scvBytes(encodePublicInputs(publicInputs));
  const proofVal = StellarSdk.xdr.ScVal.scvBytes(proofBuf);

  let tx = new StellarSdk.TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: NET,
  })
    .addOperation(contract.call(contractFn, circuitIdVal, inputsVal, proofVal))
    .setTimeout(180)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    const msg = sim.error ?? "";
    // NullifierAlreadyUsed = ZkError code 10 → surfaces during simulation
    if (msg.includes("NullifierAlreadyUsed") || msg.includes("Error(Contract, #10)")) {
      throw new NullifierAlreadyUsedError();
    }
    throw new Error(`Simulation error: ${msg}`);
  }

  tx = StellarSdk.rpc.assembleTransaction(tx, sim).build();
  tx.sign(signerKP);

  const sent = await rpc.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(`Send error: ${JSON.stringify(sent.errorResult)}`);
  }

  const MAX_RETRIES = 30;
  let attempts = 0;
  do {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await rpc.getTransaction(sent.hash);
    if (status.status === "SUCCESS") return true;
    if (status.status === "FAILED") return false;
    attempts++;
  } while (attempts < MAX_RETRIES);

  throw new Error(`Timeout waiting for tx: ${sent.hash}`);
}

/**
 * Publish a Merkle root on the ZK contract (admin-only). `rootDecimal` is the
 * 32-byte field root as a decimal string. Used by the credential-issuance flow
 * to activate a freshly bought credential's tree. Returns the tx hash.
 */
export async function setReputationRoot(rootDecimal: string): Promise<string> {
  const contractId = process.env.ZK_VERIFIER_CONTRACT_ID ?? "";
  if (!contractId) throw new Error("ZK_VERIFIER_CONTRACT_ID not set");
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) throw new Error("ADMIN_SECRET_KEY not set");

  const rpc = new StellarSdk.rpc.Server(RPC_URL);
  const kp = StellarSdk.Keypair.fromSecret(secret);
  const account = await rpc.getAccount(kp.publicKey());
  const contract = new StellarSdk.Contract(contractId);

  // 32-byte big-endian encoding of the field element
  const rootHex = BigInt(rootDecimal).toString(16).padStart(64, "0");
  const rootVal = StellarSdk.xdr.ScVal.scvBytes(Buffer.from(rootHex, "hex"));

  let tx = new StellarSdk.TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: NET,
  })
    .addOperation(contract.call("set_reputation_root", rootVal))
    .setTimeout(180)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation error: ${sim.error}`);
  }
  tx = StellarSdk.rpc.assembleTransaction(tx, sim).build();
  tx.sign(kp);
  const sent = await rpc.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(`Send error: ${JSON.stringify(sent.errorResult)}`);
  }
  let attempts = 0;
  do {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await rpc.getTransaction(sent.hash);
    if (status.status === "SUCCESS") return sent.hash;
    if (status.status === "FAILED") throw new Error(`set_reputation_root failed: ${sent.hash}`);
    attempts++;
  } while (attempts < 30);
  throw new Error(`Timeout waiting for tx: ${sent.hash}`);
}

/** Fetch the current Merkle root published on the ZK contract (decimal string). */
export async function fetchReputationRoot(): Promise<string | null> {
  const contractId = process.env.ZK_VERIFIER_CONTRACT_ID ?? "";
  if (!contractId) return null;
  try {
    const rpc = new StellarSdk.rpc.Server(RPC_URL);
    const signerKP = StellarSdk.Keypair.fromSecret(
      process.env.ADMIN_SECRET_KEY ?? ""
    );
    const account = await rpc.getAccount(signerKP.publicKey());
    const contract = new StellarSdk.Contract(contractId);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: NET,
    })
      .addOperation(contract.call("get_reputation_root"))
      .setTimeout(30)
      .build();

    const sim = await rpc.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) return null;

    const ret = (sim as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;
    if (!ret) return null;
    if (ret.switch().name === "scvBytes") {
      const buf = ret.bytes();
      return BigInt("0x" + Buffer.from(buf).toString("hex")).toString();
    }
    return null;
  } catch {
    return null;
  }
}
