import type { FastifyRequest, FastifyReply } from "fastify";
import db from "../db/schema.js";

/**
 * JWT authentication middleware.
 * Decorates request with `user` containing { id, stellar_address }.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await request.jwtVerify();

    const { id } = request.user as { id: string; stellar_address: string };
    const activeUser = await db.getOne<{ id: string; is_admin?: boolean; is_banned?: boolean }>(
      "SELECT id, is_admin, is_banned FROM users WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );

    if (!activeUser) {
      return reply
        .status(401)
        .send({
          error: "Unauthorized",
          message: "Account not found or deleted",
        });
    }

    if (activeUser.is_banned) {
      return reply
        .status(403)
        .send({
          error: "Forbidden",
          message: "Account is banned",
        });
    }
  } catch (err) {
    return reply
      .status(401)
      .send({ error: "Unauthorized", message: "Invalid or missing JWT token" });
  }
}

/**
 * Admin authentication middleware.
 * Verifies JWT and checks that the user has admin rights.
 */
export async function adminMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  await authMiddleware(request, reply);
  if (reply.sent) return;

  const { id } = request.user;
  const user = await db.getOne<{ is_admin?: boolean }>(
    "SELECT is_admin FROM users WHERE id = $1",
    [id],
  );

  if (!user?.is_admin) {
    return reply
      .status(403)
      .send({
        error: "Forbidden",
        message: "Admin access required",
      });
  }
}

/**
 * Extend Fastify's type system to include the JWT user payload.
 */
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { id: string; stellar_address: string; is_admin?: boolean };
    user: { id: string; stellar_address: string; is_admin?: boolean };
  }
}
