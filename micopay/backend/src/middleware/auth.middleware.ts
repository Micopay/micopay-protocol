import type { FastifyRequest, FastifyReply } from "fastify";
import db from "../db/schema.js";
import { toSupportCode } from "./requestId.middleware.js";

/**
 * JWT authentication middleware.
 * Decorates request with `user` containing { id, stellar_address }.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const requestId: string = (request as any).requestId ?? "unknown";
  const supportCode = toSupportCode(requestId);

  try {
    await request.jwtVerify();

    const { id } = request.user as { id: string; stellar_address: string };
    const activeUser = await db.getOne<{ id: string; is_suspended: boolean | null }>(
      "SELECT id, is_suspended FROM users WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );

    if (!activeUser) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Account not found or deleted",
      });
    }

    if (activeUser.is_suspended) {
      return reply.status(403).send({
        code: "ACCOUNT_SUSPENDED",
        message:
          "Tu cuenta está suspendida. Contacta a soporte si crees que es un error.",
      });
    }
  } catch (err) {
    reply
      .status(401)
      .send({
        error: "Unauthorized",
        message: "Invalid or missing JWT token",
        request_id: requestId,
        support_code: supportCode,
      });
  }
}

/**
 * Extend Fastify's type system to include the JWT user payload.
 */
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { id: string; stellar_address: string };
    user: { id: string; stellar_address: string };
  }
}
