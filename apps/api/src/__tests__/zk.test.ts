import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { zkRoutes } from "../routes/zk.js";

// Stub all Soroban/network calls so tests run offline
vi.mock("@stellar/stellar-sdk", async (importOriginal: () => Promise<typeof import("@stellar/stellar-sdk")>) => {
  const actual = await importOriginal();

  const fakeTx = { sign: vi.fn() };
  const fakeBuilder = {
    build: vi.fn().mockReturnValue(fakeTx),
  };

  return {
    ...actual,
    Networks: actual.Networks,
    nativeToScVal: actual.nativeToScVal,
    xdr: actual.xdr,
    Address: actual.Address,
    Keypair: {
      fromSecret: vi.fn().mockReturnValue({
        publicKey: () => "GBTESTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      }),
    },
    Contract: class {
      call = vi.fn().mockReturnValue({});
    },
    TransactionBuilder: class {
      addOperation = vi.fn().mockReturnThis();
      setTimeout = vi.fn().mockReturnThis();
      build = vi.fn().mockReturnValue(fakeTx);
    },
    rpc: {
      ...actual.rpc,
      assembleTransaction: vi.fn().mockReturnValue(fakeBuilder),
      Server: class {
        getAccount = vi.fn().mockResolvedValue({ accountId: () => "GTEST", incrementSequenceNumber: vi.fn() });
        simulateTransaction = vi.fn().mockResolvedValue({ result: null });
        sendTransaction = vi.fn().mockResolvedValue({ status: "PENDING", hash: "aabbcc" });
        getTransaction = vi.fn().mockResolvedValue({
          status: "SUCCESS",
          returnValue: actual.xdr.ScVal.scvBool(true),
        });
      },
      Api: {
        ...actual.rpc?.Api,
        isSimulationError: () => false,
      },
    },
  };
});

const MOCK_PAYMENT_HEADER = "mock:GPAYER000000000000000000000000000000000000000000000000000:0.001";
const VALID_PROOF_B64 = Buffer.alloc(64).toString("base64");

describe("ZK Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.ZK_VERIFIER_CONTRACT_ID = "CA000000000000000000000000000000000000000000000000000000";
    process.env.ADMIN_SECRET_KEY = "SCZANGBA5AKIA4HF6DVRZ53VBZ7GVMQXMKKFZWQ5MEBOU2CTKXEJC4";
    app = Fastify({ logger: false });
    await app.register(zkRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/v1/zk/circuits", () => {
    it("returns circuit list without payment", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/zk/circuits" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.circuits).toHaveLength(2);
      const ids = body.circuits.map((c: { circuit_id: string }) => c.circuit_id);
      expect(ids).toContain("poseidon_preimage");
      expect(ids).toContain("reputation_v1");
    });

    it("includes payment info", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/zk/circuits" });
      const body = JSON.parse(res.body);
      expect(body.payment.amount_usdc).toBe("0.001");
    });
  });

  describe("POST /api/v1/zk/verify", () => {
    it("returns 402 without payment header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/zk/verify",
        payload: { circuit_id: "poseidon_preimage", proof: VALID_PROOF_B64, public_inputs: ["1234"] },
      });
      expect(res.statusCode).toBe(402);
    });

    it("returns 400 for unknown circuit_id", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload: { circuit_id: "unknown_circuit", proof: VALID_PROOF_B64, public_inputs: ["1"] },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/Unknown circuit_id/);
    });

    it("returns 400 for wrong number of public_inputs (poseidon_preimage needs 1)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload: {
          circuit_id: "poseidon_preimage",
          proof: VALID_PROOF_B64,
          public_inputs: ["1", "2"], // too many
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/exactly 1/);
    });

    it("returns 400 for wrong number of public_inputs (reputation_v1 needs 4)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload: {
          circuit_id: "reputation_v1",
          proof: VALID_PROOF_B64,
          public_inputs: ["1", "2"], // too few
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/exactly 4/);
    });

    it("returns 400 for non-decimal public_input", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload: {
          circuit_id: "poseidon_preimage",
          proof: VALID_PROOF_B64,
          public_inputs: ["0xdeadbeef"], // hex not allowed
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/decimal/);
    });

    it("returns 400 for empty proof", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload: {
          circuit_id: "poseidon_preimage",
          proof: "", // empty string → zero-length buffer → rejected
          public_inputs: ["1234"],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns verified result for poseidon_preimage with mock payment", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload: {
          circuit_id: "poseidon_preimage",
          proof: VALID_PROOF_B64,
          public_inputs: ["9876543210123456789"],
        },
      });
      if (res.statusCode !== 200) console.error("ZK 502 detail:", res.body);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.verified).toBe("boolean");
      expect(body.circuit_id).toBe("poseidon_preimage");
    });

    it("returns verified result for reputation_v1 with 4 inputs and mock payment", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload: {
          circuit_id: "reputation_v1",
          proof: VALID_PROOF_B64,
          public_inputs: [
            "111111111111111111111111",
            "2",
            "333333333333333333333333",
            "444444444444444444444444",
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.verified).toBe("boolean");
      expect(body.circuit_id).toBe("reputation_v1");
    });

    it("returns 400 when reputation_v1 merkle_root does not match on-chain root", async () => {
      // Override the simulateTransaction mock for this test only so that
      // fetchReputationRoot returns a specific known on-chain root,
      // then submit a proof whose public_inputs[0] differs from that root.
      //
      // The top-level vi.mock already stubs rpc.Server; we override getTransaction
      // globally to return FAILED for the root-fetch call by making simulateTransaction
      // return a scvBytes value that represents root "99999999999999999999999999999".
      //
      // Simplest approach: use the route's own stale-root guard by providing a
      // root that can never match (the global mock returns null for root fetch,
      // so the guard is non-fatal). We test the guard logic by temporarily
      // making fetchReputationRoot return a concrete value via module-level mock override.

      // The existing global mock makes simulateTransaction return { result: null },
      // so fetchReputationRoot returns null and the guard is skipped (non-fatal per spec).
      // To test the guard: override to return a specific on-chain root.

      // We use vi.doMock to change the rpc.Server behavior for this call:
      // Temporarily patch the module-level rpc.Server mock to return a root value.
      const StellarModule = await import("@stellar/stellar-sdk");
      const originalSimulate = StellarModule.rpc.Server.prototype.simulateTransaction;

      const onChainRootDec = "99999999999999999999999999999";
      const onChainRootHex = BigInt(onChainRootDec).toString(16).padStart(64, "0");
      const onChainRootBuf = Buffer.from(onChainRootHex, "hex");

      // Patch: first call to simulateTransaction returns the on-chain root
      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (StellarModule.rpc.Server.prototype as any).simulateTransaction = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // root fetch call
          return {
            result: { retval: StellarModule.xdr.ScVal.scvBytes(onChainRootBuf) },
          };
        }
        // verify call — return a normal success
        return { result: null };
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload: {
          circuit_id: "reputation_v1",
          proof: VALID_PROOF_B64,
          public_inputs: [
            "12345", // stale/wrong root — does not match onChainRootDec
            "2",
            "333333333333333333333333",
            "444444444444444444444444",
          ],
        },
      });

      // Restore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (StellarModule.rpc.Server.prototype as any).simulateTransaction = originalSimulate;

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/merkle_root/);
    });

    // Replay attack: same proof submitted twice → second must be rejected (409).
    // Requires ZkVerifierRegistry.verify_unique deployed on-chain (WP4 redeploy).
    // Skipped until the redeployed contract is live; the 409 mapping in zk.ts is ready.
    it.skip("returns 409 on replay — same reputation_v1 proof submitted twice (requires WP4 redeploy)", async () => {
      // After WP4 redeploy: the contract's verify_unique returns Error(Contract, #10)
      // on the second call with the same nullifier. The API maps this to HTTP 409.
      // To activate: remove .skip, redeploy ZkVerifierRegistry, update ZK_VERIFIER_CONTRACT_ID.
      const payload = {
        circuit_id: "reputation_v1",
        proof: VALID_PROOF_B64,
        public_inputs: [
          "111111111111111111111111",
          "2",
          "333333333333333333333333",
          "444444444444444444444444",
        ],
      };

      const first = await app.inject({
        method: "POST", url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload,
      });
      expect(first.statusCode).toBe(200);

      // Second submission — contract rejects; getTransaction returns FAILED
      // with error detail "Error(Contract, #10)" in the result XDR
      const StellarModule = await import("@stellar/stellar-sdk");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const origGetTx = (StellarModule.rpc.Server.prototype as any).getTransaction;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (StellarModule.rpc.Server.prototype as any).getTransaction = vi.fn().mockResolvedValueOnce({
        status: "FAILED",
        resultMetaXdr: "Error(Contract, #10)",
      });

      const second = await app.inject({
        method: "POST", url: "/api/v1/zk/verify",
        headers: { "x-payment": MOCK_PAYMENT_HEADER },
        payload,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (StellarModule.rpc.Server.prototype as any).getTransaction = origGetTx;

      expect(second.statusCode).toBe(409);
      expect(JSON.parse(second.body).error).toMatch(/Nullifier already used/);
    });
  });
});
