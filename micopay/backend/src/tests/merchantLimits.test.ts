/**
 * WP4 · #7: los límites que se aplican son los del agente (`provider_id`).
 *
 * En un retiro el vendedor del escrow es el cliente. `createTrade` revisaba
 * los límites de `seller_id`, así que se aplicaban los del cliente y los del
 * agente no se aplicaban nunca.
 */

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { strictEqual } from 'assert';
import db from '../db/schema.js';
import { config } from '../config.js';
import { tradeRoutes } from '../routes/trades.js';
import { AppError } from '../utils/errors.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  app.register(fastifyJwt, { secret: config.jwtSecret });
  app.setErrorHandler((error: any, _request: any, reply: any) => {
    if (error instanceof AppError) {
      reply.status(error.httpStatus).send({ code: error.code, message: error.userMessage });
      return;
    }
    reply.status(error.statusCode ?? 500).send({ code: 'ERROR', message: error.message });
  });
  app.register(tradeRoutes);
  await app.ready();
  return app;
}

let seq = 0;
async function createUser(label: string, limits: { min: number; max: number }): Promise<string> {
  seq++;
  const suffix = String(seq).padStart(2, '0');
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username, phone_hash, merchant_available, availability, is_suspended, provider_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING id`,
    [`G${'L'.repeat(53)}${suffix}`, `lim_${label}_${suffix}`, `hash_lim_${label}_${suffix}`, true, 'online', false],
  );
  if (!row?.id) throw new Error(`Failed to seed user ${label}`);
  await db.execute(
    `INSERT INTO merchant_configs (user_id, rate_percent, min_trade_mxn, max_trade_mxn, daily_cap_mxn)
     VALUES ($1, $2, $3, $4, $5)`,
    [row.id, 1, limits.min, limits.max, 250000],
  );
  return row.id;
}

async function post(app: any, token: string, body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/trades',
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
}

/** El caso del QA: cliente con mínimo 660, agente con mínimo 100, retiro de 500. */
async function testCashoutUsesProviderLimits(app: any) {
  const client = await createUser('cli', { min: 660, max: 50000 });
  const provider = await createUser('prov', { min: 100, max: 50000 });
  const token = app.jwt.sign({ id: client, stellar_address: 'GCLIENT' });

  const res = await post(app, token, { counterparty_id: provider, amount_mxn: 500, flow: 'cashout' });
  strictEqual(res.statusCode, 201, `el retiro cabe en los límites del agente (got ${res.statusCode}: ${res.body})`);
  console.log('  ✓ retiro: no se aplican los límites del cliente');
}

async function testCashoutEnforcesProviderMax(app: any) {
  const client = await createUser('cli', { min: 100, max: 50000 });
  const provider = await createUser('prov', { min: 100, max: 400 });
  const token = app.jwt.sign({ id: client, stellar_address: 'GCLIENT' });

  const res = await post(app, token, { counterparty_id: provider, amount_mxn: 500, flow: 'cashout' });
  strictEqual(res.json().code, 'MERCHANT_LIMIT', `se aplica el máximo del agente (got ${res.statusCode}: ${res.body})`);
  console.log('  ✓ retiro: se aplica el máximo del agente');
}

async function testDepositEnforcesProviderMin(app: any) {
  const client = await createUser('cli', { min: 100, max: 50000 });
  const provider = await createUser('prov', { min: 600, max: 50000 });
  const token = app.jwt.sign({ id: client, stellar_address: 'GCLIENT' });

  const res = await post(app, token, { counterparty_id: provider, amount_mxn: 500, flow: 'deposit' });
  strictEqual(res.json().code, 'MERCHANT_LIMIT', `se aplica el mínimo del agente (got ${res.statusCode}: ${res.body})`);
  console.log('  ✓ depósito: se aplica el mínimo del agente');
}

async function main() {
  console.log('\n  WP4 #7 límites del agente:\n');
  const app = await buildTestApp();
  await testCashoutUsesProviderLimits(app);
  await testCashoutEnforcesProviderMax(app);
  await testDepositEnforcesProviderMin(app);
  await app.close();
  console.log('\nAll merchant limit tests passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
