import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { pauseUser, unpauseUser } from "../services/abuse.service.js";
import { AuthError, NotFoundError } from "../utils/errors.js";
import db from "../db/schema.js";

function assertAdmin(request: FastifyRequest) {
  const key =
    (request.headers["x-admin-api-key"] as string) ||
    (request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "");

  if (!config.adminApiKey || key !== config.adminApiKey) {
    throw new AuthError(
      "ADMIN_UNAUTHORIZED",
      "No autorizado para esta acción.",
      "Invalid or missing admin API key",
    );
  }
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    assertAdmin(request);
  });

  /**
   * POST /admin/users/:id/suspend
   * Deactivate a user or merchant (blocks new trades via auth + abuse checks).
   */
  app.post("/admin/users/:id/suspend", async (request) => {
    const { id } = request.params as { id: string };
    const { reason } = (request.body as { reason?: string } | undefined) ?? {};

    const user = await db.getOne("SELECT id FROM users WHERE id = $1", [id]);
    if (!user) throw new NotFoundError("USER_NOT_FOUND", "Usuario no encontrado", `User ${id}`);

    await pauseUser(id, reason || "admin_suspend", null);
    return { ok: true, user_id: id, status: "suspended" };
  });

  /**
   * GET /admin/users/by-username/:username
   * Look up a user's id by username (e.g. to set seller_id/buyer_id when
   * creating a trade on someone else's behalf in ops/demo tooling).
   */
  app.get("/admin/users/by-username/:username", async (request) => {
    const { username } = request.params as { username: string };
    const user = await db.getOne(
      "SELECT id, username, stellar_address FROM users WHERE username = $1",
      [username],
    );
    if (!user) throw new NotFoundError("USER_NOT_FOUND", "Usuario no encontrado", `User ${username}`);
    return { user };
  });

  /**
   * DELETE /admin/users/:id/suspend
   * Reactivate a suspended user.
   */
  app.delete("/admin/users/:id/suspend", async (request) => {
    const { id } = request.params as { id: string };

    const user = await db.getOne("SELECT id FROM users WHERE id = $1", [id]);
    if (!user) throw new NotFoundError("USER_NOT_FOUND", "Usuario no encontrado", `User ${id}`);

    await unpauseUser(id, null);
    return { ok: true, user_id: id, status: "active" };
  });
}
