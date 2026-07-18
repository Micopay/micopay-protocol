import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";

// Stub routes for A-4 (frontend KYC screen — Drips)
// Etherfuse uses a HOSTED onboarding flow: the backend generates a presigned URL,
// the user completes KYC (identity, documents, liveness, agreements) on Etherfuse's
// own page, and the partner polls for status. We never collect KYC data ourselves.
//
// These stubs return the correct response shape without calling Etherfuse.
// Replace with real Etherfuse API calls once API key is available (A-2):
//   POST /ramp/customer        → create customer, get customerId
//   POST /ramp/onboarding-url  → generate hosted presigned_url
//   GET  /kyc/status           → poll approval

export async function kycRoutes(fastify: FastifyInstance): Promise<void> {
  // Generate the hosted onboarding URL the frontend opens in a browser/WebView.
  // The real Etherfuse URL expires in 15 minutes — generate it right before opening.
  fastify.post(
    "/defi/kyc/start",
    { preHandler: [authMiddleware] },
    async (_request, reply) => {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      return reply.send({
        onboardingUrl: "https://api.sand.etherfuse.com/onboarding?stub=true",
        expiresAt,
        note: "stub — returns a placeholder hosted URL; Etherfuse API not connected yet",
      });
    }
  );

  // Poll KYC status. In sandbox, Etherfuse auto-approves with fake data.
  // This stub mirrors that so the frontend flow can be completed end-to-end.
  fastify.get(
    "/defi/kyc/status",
    { preHandler: [authMiddleware] },
    async (_request, reply) => {
      return reply.send({
        status: "approved",
        note: "stub — always approved, mirrors Etherfuse sandbox behavior",
      });
    }
  );
}
