import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { requirePayment } from "../middleware/x402.js";
import { setReputationRoot } from "../lib/zkVerify.js";

interface Credential {
  secret: string;
  merkle_root: string;
  nullifier: string;
  circuit_id: string;
}

// DEMO pool. Production: the client generates the secret and submits only the
// commitment H(secret) — the issuer never learns the secret (full unlinkability).
// Single-root contract -> one credential active at a time; a multi-leaf tree is
// the production upgrade (also gives a credible anonymity set).
const __filename = fileURLToPath(import.meta.url);
const POOL_PATH = join(dirname(__filename), "..", "..", "demo", "credential_pool.json");
const POOL: Credential[] = JSON.parse(readFileSync(POOL_PATH, "utf8")).credentials;
const allocated = new Set<number>();

export async function credentialRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/credentials/buy
   *
   * The BUY leg of the pipeline (x402). Pay USDC -> receive an anonymous access
   * credential. This is where money enters and it is PUBLIC (a payment has
   * nothing to hide). The credential is later SPENT privately at
   * /api/v1/inference (ZK proof + nullifier burn), and the spend is unlinkable
   * to this purchase.
   *
   * x402: 0.01 USDC per credential (mock-accepted in dev).
   */
  fastify.post(
    "/api/v1/credentials/buy",
    { preHandler: requirePayment({ amount: "0.01", service: "credential_buy" }) },
    async (request, reply) => {
      // Allocate the next unused credential from the pool.
      const idx = POOL.findIndex((_, i) => !allocated.has(i));
      if (idx === -1) {
        return reply
          .status(503)
          .send({ error: "Credential pool exhausted (demo) — regenerate the pool" });
      }
      const cred = POOL[idx];
      allocated.add(idx);

      // Activate the credential on-chain: publish its Merkle root so the spend
      // step's root cross-check passes and the membership proof verifies.
      let publishTx: string;
      try {
        publishTx = await setReputationRoot(cred.merkle_root);
      } catch (err) {
        allocated.delete(idx); // roll back the allocation if activation failed
        return reply.status(502).send({
          error: "Failed to activate credential root on-chain",
          detail: err instanceof Error ? err.message : String(err),
        });
      }

      return reply.send({
        bought: 1,
        payer: request.payerAddress,
        credential: {
          secret: cred.secret,
          circuit_id: cred.circuit_id,
          public_inputs: [cred.merkle_root, cred.nullifier],
        },
        activated_root_tx: publishTx,
        how_to_spend:
          "Generate an access_credential_v1 proof with this secret, then " +
          "POST /api/v1/inference { proof, public_inputs, prompt }. Single-use.",
        note:
          "DEMO: credential is server-minted. Production: the client generates the " +
          "secret and the issuer only ever sees the commitment H(secret) — full " +
          "unlinkability. Single-root contract => spend before buying another.",
      });
    }
  );
}
