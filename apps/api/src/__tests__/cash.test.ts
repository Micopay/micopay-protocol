import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { cashRoutes } from "../routes/cash.js";

describe("Cash Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(cashRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/v1/cash/agents", () => {
    it("should return 402 without payment", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/cash/agents",
      });

      expect(response.statusCode).toBe(402);
      const body = JSON.parse(response.body);
      expect(body.challenge.service).toBe("cash_agents");
    });
  });

  describe("POST /api/v1/cash/request", () => {
    it("should return 402 without payment", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/cash/request",
        payload: {
          amount_mxn: 500,
          agent_id: "merchant-001",
        },
      });

      expect(response.statusCode).toBe(402);
    });
  });

  describe("GET /api/v1/cash/request/:id (SEC-03)", () => {
    it("should return 402 without payment (no unauthenticated access)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/cash/request/mcr-deadbeef",
      });

      // Must NOT be a 200 leak nor a 404 enumeration oracle — payment is required first.
      expect(response.statusCode).toBe(402);
      const body = JSON.parse(response.body);
      expect(body.challenge.service).toBe("cash_request_status");
    });
  });
});
