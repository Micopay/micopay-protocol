import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import db from "../db/schema.js";
import { createOnboardingUrl, getKycStatus } from "../services/etherfuse.service.js";

// Etherfuse uses a HOSTED onboarding flow: we generate customerId/bankAccountId
// UUIDs and a presigned URL; the user completes identity verification, document
// upload, bank account (CLABE) linking, and agreement signing on Etherfuse's own
// page. We never collect KYC data ourselves. These IDs are permanently bound to
// the user once submitted — see docs/SPEI_ANCHOR_PLAN.md.

interface UserRow {
  id: string;
  stellar_address: string;
  username: string;
  etherfuse_customer_id: string | null;
  etherfuse_bank_account_id: string | null;
}

export async function kycRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/defi/kyc/start",
    { preHandler: [authMiddleware] },
    async (request: any, reply) => {
      if (!process.env.ETHERFUSE_API_KEY) {
        return reply.status(503).send({ error: "Etherfuse ramp not configured" });
      }

      const userId = request.user.id;
      const user = await db.getOne<UserRow>(
        "SELECT id, stellar_address, username, etherfuse_customer_id, etherfuse_bank_account_id FROM users WHERE id = $1",
        [userId]
      );
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      let { etherfuse_customer_id: customerId, etherfuse_bank_account_id: bankAccountId } = user;
      if (!customerId || !bankAccountId) {
        customerId = customerId ?? randomUUID();
        bankAccountId = bankAccountId ?? randomUUID();
        await db.execute(
          "UPDATE users SET etherfuse_customer_id = $1, etherfuse_bank_account_id = $2 WHERE id = $3",
          [customerId, bankAccountId, userId]
        );
      }

      try {
        const onboardingUrl = await createOnboardingUrl({
          customerId,
          bankAccountId,
          publicKey: user.stellar_address,
          userInfo: { displayName: user.username },
        });
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        return reply.send({ onboardingUrl, expiresAt });
      } catch (error) {
        fastify.log.error(error, "Failed to create Etherfuse onboarding URL");
        return reply.status(503).send({ error: "Etherfuse API unavailable" });
      }
    }
  );

  fastify.get(
    "/defi/kyc/status",
    { preHandler: [authMiddleware] },
    async (request: any, reply) => {
      const userId = request.user.id;
      const user = await db.getOne<UserRow>(
        "SELECT etherfuse_customer_id FROM users WHERE id = $1",
        [userId]
      );
      if (!user?.etherfuse_customer_id) {
        return reply.send({ status: "not_started" });
      }

      try {
        const kyc = await getKycStatus(user.etherfuse_customer_id);
        await db.execute("UPDATE users SET kyc_status = $1 WHERE id = $2", [kyc.status, userId]);
        return reply.send({
          status: kyc.status,
          rejectionReason: kyc.currentRejectionReason,
        });
      } catch (error) {
        fastify.log.error(error, "Failed to fetch Etherfuse KYC status");
        return reply.status(503).send({ error: "Etherfuse API unavailable" });
      }
    }
  );
}
