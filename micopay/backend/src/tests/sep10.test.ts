/**
 * WP4 de MicoPay web: inicio de sesion SEP-10.
 *
 * Los retos falsificados se arman a mano porque el peligro es justo ese: una
 * transaccion "al estilo SEP-10" que en realidad sea ejecutable.
 *
 * Con DATABASE_URL de un PostgreSQL real, la carrera de uso unico corre contra
 * el UPDATE verdadero y no contra el shim en memoria.
 */

import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import { strictEqual, ok, rejects } from "assert";
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const server = Keypair.random();
process.env.SEP10_SIGNING_SECRET = server.secret();
process.env.STELLAR_NETWORK = "TESTNET";
process.env.MOCK_STELLAR = "true";

const { issueSep10Challenge, verifyAndConsumeSep10Challenge } = await import(
  "../services/challenge.service.js"
);
const { config } = await import("../config.js");
const { default: db } = await import("../db/schema.js");
const { authRoutes } = await import("../routes/auth.js");
const { userRoutes } = await import("../routes/users.js");
const { AppError } = await import("../utils/errors.js");

const HOME = `${config.sep10HomeDomain} auth`;
const NONCE = Buffer.alloc(48, 7).toString("base64");

function sign(xdr: string, keypair: Keypair, passphrase = Networks.TESTNET): string {
  const tx = TransactionBuilder.fromXDR(xdr, passphrase);
  tx.sign(keypair);
  return tx.toXDR();
}

/** Reto hecho a mano, firmado por el servidor, con la pieza que cada caso rompa. */
function forged(
  client: Keypair,
  { sequence = "-1", passphrase = Networks.TESTNET, signer = server }: {
    sequence?: string;
    passphrase?: string;
    signer?: Keypair;
  } = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const tx = new TransactionBuilder(new Account(signer.publicKey(), sequence), {
    fee: "100",
    networkPassphrase: passphrase,
    timebounds: { minTime: now, maxTime: now + 300 },
  })
    .addOperation(Operation.manageData({ name: HOME, value: NONCE, source: client.publicKey() }))
    .addOperation(Operation.manageData({
      name: "web_auth_domain",
      value: config.sep10WebAuthDomain,
      source: signer.publicKey(),
    }))
    .build();
  tx.sign(signer);
  return tx.toXDR();
}

const rejected = (xdr: string, code: string) =>
  rejects(() => verifyAndConsumeSep10Challenge(xdr), (err: any) => {
    strictEqual(err.code, code);
    return true;
  });

async function run(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSEP-10\n");

  await run("el reto cumple SEP-10 y una firma válida entrega la cuenta", async () => {
    const client = Keypair.random();
    const { transaction, network_passphrase } = await issueSep10Challenge(client.publicKey());
    strictEqual(network_passphrase, Networks.TESTNET);
    const tx = TransactionBuilder.fromXDR(transaction, Networks.TESTNET) as any;
    strictEqual(tx.source, server.publicKey());
    strictEqual(tx.sequence, "0");
    ok(tx.operations.every((op: any) => op.type === "manageData"));
    strictEqual(await verifyAndConsumeSep10Challenge(sign(transaction, client)), client.publicKey());
  });

  await run("otra cuenta no puede firmar el reto", async () => {
    const client = Keypair.random();
    const { transaction } = await issueSep10Challenge(client.publicKey());
    await rejected(sign(transaction, Keypair.random()), "AUTH_INVALID_CREDENTIALS");
  });

  await run("un reto sin la firma del cliente se rechaza", async () => {
    const client = Keypair.random();
    const { transaction } = await issueSep10Challenge(client.publicKey());
    await rejected(transaction, "AUTH_INVALID_CREDENTIALS");
  });

  await run("no se reutiliza", async () => {
    const client = Keypair.random();
    const { transaction } = await issueSep10Challenge(client.publicKey());
    const signed = sign(transaction, client);
    await verifyAndConsumeSep10Challenge(signed);
    await rejected(signed, "AUTH_INVALID_CHALLENGE");
  });

  await run("de varios intentos simultáneos solo uno gana", async () => {
    const client = Keypair.random();
    const { transaction } = await issueSep10Challenge(client.publicKey());
    const signed = sign(transaction, client);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => verifyAndConsumeSep10Challenge(signed)),
    );
    strictEqual(results.filter((r) => r.status === "fulfilled").length, 1);
  });

  await run("un reto vencido se rechaza", async () => {
    const client = Keypair.random();
    const { transaction } = await issueSep10Challenge(client.publicKey());
    const id = TransactionBuilder.fromXDR(transaction, Networks.TESTNET).hash().toString("hex");
    await db.execute("UPDATE auth_challenges SET expires_at = $1 WHERE challenge_id = $2", [
      new Date(Date.now() - 1000).toISOString(),
      id,
    ]);
    await rejected(sign(transaction, client), "AUTH_CHALLENGE_EXPIRED");
  });

  await run("un reto bien formado que el servidor no emitió se rechaza", async () => {
    const client = Keypair.random();
    await rejected(sign(forged(client), client), "AUTH_INVALID_CHALLENGE");
  });

  await run("una secuencia distinta de 0 se rechaza", async () => {
    const client = Keypair.random();
    await rejected(sign(forged(client, { sequence: "41" }), client), "AUTH_INVALID_CHALLENGE");
  });

  await run("una operación que no es ManageData se rechaza", async () => {
    const client = Keypair.random();
    const tx = new TransactionBuilder(new Account(server.publicKey(), "-1"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: 0, maxTime: Math.floor(Date.now() / 1000) + 300 },
    })
      .addOperation(Operation.manageData({ name: HOME, value: NONCE, source: client.publicKey() }))
      .addOperation(Operation.payment({
        destination: server.publicKey(),
        asset: Asset.native(),
        amount: "1",
        source: client.publicKey(),
      }))
      .build();
    tx.sign(server);
    await rejected(sign(tx.toXDR(), client), "AUTH_INVALID_CHALLENGE");
  });

  await run("un reto de otra red se rechaza", async () => {
    const client = Keypair.random();
    const other = forged(client, { passphrase: Networks.PUBLIC });
    await rejected(sign(other, client, Networks.PUBLIC), "AUTH_INVALID_CHALLENGE");
  });

  await run("un reto firmado por otro servidor se rechaza", async () => {
    const client = Keypair.random();
    await rejected(sign(forged(client, { signer: Keypair.random() }), client), "AUTH_INVALID_CHALLENGE");
  });

  const app = Fastify();
  await app.register(fastifyJwt, { secret: "x".repeat(32) });
  app.setErrorHandler((err, _req, reply) => {
    reply.status(err instanceof AppError ? err.httpStatus : err.statusCode ?? 500)
      .send({ code: (err as any).code, message: err.message });
  });
  await app.register(authRoutes);
  await app.register(userRoutes);

  const challengeFor = async (account: string) => {
    const res = await app.inject({ method: "GET", url: `/auth/sep10?account=${account}` });
    strictEqual(res.statusCode, 200);
    return res.json().transaction as string;
  };
  const username = () => `web_${Math.random().toString(36).slice(2, 10)}`;
  const sessionHours = (token: string) => {
    const { iat, exp } = app.jwt.decode(token) as { iat: number; exp: number };
    return (exp - iat) / 3600;
  };

  await run("una cuenta sin registrar recibe USER_NOT_FOUND", async () => {
    const client = Keypair.random();
    const res = await app.inject({
      method: "POST",
      url: "/auth/sep10",
      payload: { transaction: sign(await challengeFor(client.publicKey()), client) },
    });
    strictEqual(res.statusCode, 404);
    strictEqual(res.json().code, "USER_NOT_FOUND");
  });

  await run("la web se registra y entra con SEP-10, con sesión corta", async () => {
    const client = Keypair.random();
    const registered = await app.inject({
      method: "POST",
      url: "/users/register",
      payload: {
        stellar_address: client.publicKey(),
        username: username(),
        transaction: sign(await challengeFor(client.publicKey()), client),
      },
    });
    strictEqual(registered.statusCode, 201, registered.body);
    strictEqual(sessionHours(registered.json().token), 2);

    const login = await app.inject({
      method: "POST",
      url: "/auth/sep10",
      payload: { transaction: sign(await challengeFor(client.publicKey()), client) },
    });
    strictEqual(login.statusCode, 200, login.body);
    strictEqual(sessionHours(login.json().token), 2);
  });

  await run("un reto de otra cuenta no registra esta dirección", async () => {
    const attacker = Keypair.random();
    const res = await app.inject({
      method: "POST",
      url: "/users/register",
      payload: {
        stellar_address: Keypair.random().publicKey(),
        username: username(),
        transaction: sign(await challengeFor(attacker.publicKey()), attacker),
      },
    });
    strictEqual(res.statusCode, 400);
  });

  await run("registrar sin ninguna prueba se rechaza", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/users/register",
      payload: { stellar_address: Keypair.random().publicKey(), username: username() },
    });
    strictEqual(res.statusCode, 400);
  });

  await run("el formato de la APK sigue funcionando y conserva su sesión", async () => {
    const client = Keypair.random();
    const challenge = async () => (await app.inject({
      method: "POST",
      url: "/auth/challenge",
      payload: { stellar_address: client.publicKey() },
    })).json().challenge as string;

    const first = await challenge();
    const registered = await app.inject({
      method: "POST",
      url: "/users/register",
      payload: {
        stellar_address: client.publicKey(),
        username: username(),
        challenge: first,
        signature: client.sign(Buffer.from(first, "utf8")).toString("base64"),
      },
    });
    strictEqual(registered.statusCode, 201, registered.body);

    const second = await challenge();
    const login = await app.inject({
      method: "POST",
      url: "/auth/token",
      payload: {
        stellar_address: client.publicKey(),
        challenge: second,
        signature: client.sign(Buffer.from(second, "utf8")).toString("base64"),
      },
    });
    strictEqual(login.statusCode, 200, login.body);
    strictEqual(sessionHours(login.json().token), 24);
  });

  console.log("\nAll SEP-10 tests passed.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ SEP-10 tests failed:", err);
  process.exit(1);
});
