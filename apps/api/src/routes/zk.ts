import type { FastifyInstance } from "fastify";
import * as StellarSdk from "@stellar/stellar-sdk";
import { requirePayment } from "../middleware/x402.js";

const RPC_URL =
  process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const NET = StellarSdk.Networks.TESTNET;

// Shape specs: number of public inputs expected per circuit
const CIRCUIT_SPECS: Record<string, { numInputs: number }> = {
  poseidon_preimage: { numInputs: 1 }, // [hash]
  reputation_v1: { numInputs: 4 }, // [merkle_root, tier_threshold, context, nullifier]
};

interface ZkVerifyBody {
  circuit_id: string;
  proof: string; // base64-encoded UltraHonk proof
  public_inputs: string[]; // BN254 field elements as decimal strings
}

// Encode decimal field element strings to concatenated 32-byte big-endian buffers.
// This matches the raw Bytes encoding expected by UltraHonkVerifier::verify().
function encodePublicInputs(inputs: string[]): Buffer {
  const bufs = inputs.map((v) => {
    const hex = BigInt(v).toString(16).padStart(64, "0");
    return Buffer.from(hex, "hex");
  });
  return Buffer.concat(bufs);
}

async function invokeVerify(
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

  // reputation_v1 → verify_unique (records nullifier to prevent replay)
  // poseidon_preimage → verify (no nullifier field)
  // NOTE: verify_unique requires a redeployed contract — see IMPLEMENTATION_PLAN.md WP4.
  const contractFn = circuitId === "reputation_v1" ? "verify_unique" : "verify";

  const circuitIdVal = StellarSdk.xdr.ScVal.scvSymbol(circuitId);
  const inputsBuf = encodePublicInputs(publicInputs);
  const inputsVal = StellarSdk.xdr.ScVal.scvBytes(inputsBuf);
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
    throw new Error(`Simulation error: ${sim.error}`);
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
    if (status.status === "SUCCESS") {
      // Contract returns Result<(), Error> — tx success = verified
      return true;
    }
    if (status.status === "FAILED") {
      // Tx failed = VerificationFailed or other contract error = not verified
      return false;
    }
    attempts++;
  } while (attempts < MAX_RETRIES);

  throw new Error(`Timeout waiting for tx: ${sent.hash}`);
}

export async function zkRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/zk/verify
   *
   * Pay-per-use ZK proof verification.
   * Client pays 0.001 USDC via x402, submits proof + public_inputs,
   * gets { verified: true/false }.
   *
   * Body:
   *   circuit_id:    "poseidon_preimage" | "reputation_v1"
   *   proof:         base64-encoded UltraHonk proof bytes
   *   public_inputs: BN254 field elements as decimal strings
   *
   * For reputation_v1, public_inputs[0] (merkle_root) is validated
   * against the current on-chain root before forwarding to the contract.
   */
  fastify.post<{ Body: ZkVerifyBody }>(
    "/api/v1/zk/verify",
    { preHandler: requirePayment({ amount: "0.001", service: "zk_verify" }) },
    async (request, reply) => {
      const { circuit_id, proof, public_inputs } = request.body ?? {};

      // 1. Validate presence
      if (!circuit_id || !proof || !Array.isArray(public_inputs)) {
        return reply.status(400).send({
          error: "Missing fields",
          required: ["circuit_id", "proof", "public_inputs"],
        });
      }

      // 2. Validate circuit_id
      const spec = CIRCUIT_SPECS[circuit_id];
      if (!spec) {
        return reply.status(400).send({
          error: "Unknown circuit_id",
          valid: Object.keys(CIRCUIT_SPECS),
        });
      }

      // 3. Validate public_inputs shape
      if (public_inputs.length !== spec.numInputs) {
        return reply.status(400).send({
          error: `circuit '${circuit_id}' expects exactly ${spec.numInputs} public_inputs`,
          received: public_inputs.length,
        });
      }

      // 4. Validate each field element is a decimal integer string
      for (const v of public_inputs) {
        if (!/^\d+$/.test(v)) {
          return reply.status(400).send({
            error: "public_inputs must be decimal integer strings",
            invalid: v,
          });
        }
      }

      // 5. Decode proof
      let proofBuf: Buffer;
      try {
        proofBuf = Buffer.from(proof, "base64");
        if (proofBuf.length === 0) throw new Error("empty");
      } catch {
        return reply.status(400).send({ error: "proof must be valid base64" });
      }

      // 6. For reputation_v1: cross-check public_inputs[0] against on-chain root
      if (circuit_id === "reputation_v1") {
        try {
          const onChainRoot = await fetchReputationRoot();
          if (onChainRoot && public_inputs[0] !== onChainRoot) {
            return reply.status(400).send({
              error: "public_inputs[0] (merkle_root) does not match on-chain root",
              on_chain_root: onChainRoot,
            });
          }
        } catch (err) {
          // Non-fatal if root unavailable — let contract decide
          fastify.log.warn({ err }, "Could not fetch on-chain reputation root");
        }
      }

      // 7. Invoke contract
      try {
        const verified = await invokeVerify(circuit_id, proofBuf, public_inputs);
        return reply.send({
          verified,
          circuit_id,
          payer: (request as typeof request & { payerAddress?: string }).payerAddress,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // NullifierAlreadyUsed (ZkError code 10) → 409 Conflict
        if (msg.includes("NullifierAlreadyUsed") || msg.includes("Error(Contract, #10)")) {
          return reply.status(409).send({
            error: "Nullifier already used — this proof has already been verified in this context",
          });
        }
        fastify.log.error({ err }, "ZK verification failed");
        return reply.status(502).send({
          error: "Verification call failed",
          detail: msg,
        });
      }
    }
  );

  /**
   * GET /api/v1/zk/circuits
   * Public. Lists available circuits and expected input shapes.
   */
  fastify.get("/api/v1/zk/circuits", async (_req, reply) => {
    return reply.send({
      circuits: Object.entries(CIRCUIT_SPECS).map(([id, spec]) => ({
        circuit_id: id,
        num_public_inputs: spec.numInputs,
      })),
      payment: {
        amount_usdc: "0.001",
        endpoint: "POST /api/v1/zk/verify",
      },
    });
  });
}

// Fetch current reputation root from ZK contract
async function fetchReputationRoot(): Promise<string | null> {
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

    const ret = (sim as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    if (!ret) return null;
    // Contract returns Result<Bytes, Error> — extract Ok(bytes) value
    // ScVal is scvVec with first element being the discriminant for Ok
    if (ret.switch().name === "scvBytes") {
      const buf = ret.bytes();
      return BigInt("0x" + Buffer.from(buf).toString("hex")).toString();
    }
    return null;
  } catch {
    return null;
  }
}
