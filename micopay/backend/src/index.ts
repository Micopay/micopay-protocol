import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import { config, validateConfig } from './config.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { tradeRoutes } from './routes/trades.js';
import { stellarRoutes } from './routes/stellar.js';
import { defiRoutes } from './routes/defi.js';
import { merchantRoutes } from './routes/merchants.js';
import { adminRoutes } from './routes/admin.js';
import { tradeSafetyRoutes } from './routes/trade-safety.js';
import { AppError } from './utils/errors.js';
import { Keypair } from '@stellar/stellar-sdk';
import fastifyStatic from '@fastify/static';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerRequestId, toSupportCode } from './middleware/requestId.middleware.js';
import { createProductionListener } from './services/event-listener.service.js';
import type { EscrowEventListener } from './services/event-listener.service.js';

// Resolve the absolute path to the public/ directory next to src/
const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const app = Fastify({
  logger: process.env.NODE_ENV === 'development' ? {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss Z' },
    },
  } : {
    level: 'info',
    formatters: {
      bindings: (o) => ({ ...o, service: 'micopay-backend' }),
    },
  },
});

// --- Plugins ---

// Serve files in public/ as static assets (e.g. .well-known/assetlinks.json).
// decorateReply:false avoids conflicts if another plugin adds sendFile.
app.register(fastifyStatic, {
  root: PUBLIC_DIR,
  prefix: '/',
  decorateReply: false,
});

// --- Android Digital Asset Links ---
// Explicit route for /.well-known/assetlinks.json.
// Android's App Links verifier calls this URL and:
//   1. Requires HTTP 200 — it does NOT follow redirects.
//   2. Requires Content-Type: application/json.
//   3. Caches the response (we set 1 hour).
// The fastify-static plugin alone might redirect if the path ends without
// the extension, so this explicit route is the authoritative handler.
app.get('/.well-known/assetlinks.json', async (_request, reply) => {
  const fs = await import('node:fs/promises');
  const filePath = join(PUBLIC_DIR, '.well-known', 'assetlinks.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    reply
      .status(200)
      .header('Content-Type', 'application/json')
      .header('Cache-Control', 'public, max-age=3600')
      .send(content);
  } catch (err) {
    reply.status(404).send({ error: 'assetlinks.json not found' });
  }
});

// CORS — explicit allowlist for Capacitor WebView + dev/prod web origins.
// Extra origins can be added via CORS_EXTRA_ORIGINS (comma-separated).
const DEFAULT_ALLOWED_ORIGINS = [
  'https://localhost',       // Android (capacitor.config androidScheme: 'https')
  'capacitor://localhost',   // iOS default scheme
  'ionic://localhost',       // iOS alternate scheme
  'http://localhost',        // Android/Capacitor localhost fallback
  'http://localhost:5173',   // Vite dev server default
  'http://localhost:5181',   // micopay frontend dev server
  'http://localhost:3000',   // same-origin requests during dev
];
const EXTRA = (process.env.CORS_EXTRA_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [...DEFAULT_ALLOWED_ORIGINS, ...EXTRA];

app.register(fastifyCors, {
  // Allow requests with no Origin header (curl, native HTTP clients) and any
  // entry in the allowlist. Reject anything else.
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`Origin not allowed: ${origin}`), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
});

// JWT
app.register(fastifyJwt, {
  secret: config.jwtSecret,
});

// Correlation ID — must be registered before any route / error handler reads request.log
registerRequestId(app);

// Rate limit (optional — gracefully skip if not available)
try {
  const rateLimit = await import('@fastify/rate-limit');
  app.register(rateLimit.default, { global: false });
  } catch {
    app.log.warn({ category: 'http' }, '⚠️  @fastify/rate-limit not installed, skipping rate limiting');
  }

// --- Global error handler ---
app.setErrorHandler((error, request, reply) => {
  const requestId: string = (request as any).requestId ?? reply.getHeader('x-request-id') ?? 'unknown';
  const supportCode = toSupportCode(requestId);

  if (error instanceof AppError) {
    if (error.httpStatus >= 500) {
      request.log.error({ err: error }, `[${error.code}] ${error.devMessage}`);
    } else {
      request.log.info({ err: error }, `[${error.code}] ${error.devMessage}`);
    }

    reply.status(error.httpStatus).send({
      code: error.code,
      message: error.userMessage,
      request_id: requestId,
      support_code: supportCode,
    });
    return;
  }

  // Fastify validation errors
  if (error.validation) {
    request.log.warn({ err: error }, `Validation Error: ${error.message}`);
    reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: 'Por favor, verifica los datos ingresados.',
      request_id: requestId,
      support_code: supportCode,
    });
    return;
  }

  // Unknown errors
  request.log.error({ err: error }, 'Unhandled Error');
  reply.status(500).send({
    code: 'INTERNAL_ERROR',
    message: 'Ocurrió un error inesperado. Por favor, intenta más tarde.',
    request_id: requestId,
    support_code: supportCode,
  });
});

// --- Routes ---

// Holds the singleton event listener (null when disabled or mock mode).
let eventListener: EscrowEventListener | null = null;

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  mockStellar: config.mockStellar,
  eventListenerHealthy: eventListener?.isHealthy() ?? false,
  eventListenerState: eventListener?.currentState() ?? 'disabled',
  configCheck: {
    hasPlatformKey: !!config.platformSecretKey,
    hasContractId: !!config.escrowContractId,
    hasDbUrl: !!config.databaseUrl,
    hasSecretKey: !!config.secretEncryptionKey,
  }
}));

// Platform account balance from Horizon (public, no auth needed)
app.get('/account/balance', async (request) => {
  try {
    if (!config.platformSecretKey) {
      return { xlm: '0', address: 'Billetera no configurada', status: 'setup_required' };
    }
    const keypair = Keypair.fromSecret(config.platformSecretKey);
    const address = keypair.publicKey();
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
    if (!res.ok) return { xlm: '0', address, status: 'not_found_on_chain' };
    const data = await res.json() as { balances: { asset_type: string; balance: string }[] };
    const xlm = data.balances.find((b) => b.asset_type === 'native')?.balance ?? '0';
    return { xlm, address, status: 'ok' };
  } catch (err: any) {
    request.log.error({ err: err.message, category: 'stellar.balance' }, '[Stellar] Balance error');
    return { xlm: '0', address: 'Error', error: err.message };
  }
});

app.register(authRoutes, { prefix: '' });
app.register(userRoutes, { prefix: '' });
app.register(tradeRoutes, { prefix: '' });
app.register(stellarRoutes, { prefix: '' });
app.register(defiRoutes, { prefix: '' });
app.register(merchantRoutes, { prefix: '' });
app.register(tradeSafetyRoutes, { prefix: '' });
app.register(adminRoutes, { prefix: '' });

// --- Start server ---

async function seedData() {
  const db = (await import('./db/schema.js')).default;
  const existing = await db.getMany('SELECT id FROM trades LIMIT 1');
  if (existing.length > 0) return;

  app.log.info({ category: 'seed' }, '🌱 Seeding demo trades...');
  const users = await db.getMany('SELECT id FROM users');
  if (users.length < 2) {
    await db.execute("INSERT INTO users (username, stellar_address) VALUES ('juan_test', 'GBUYER...')");
    await db.execute("INSERT INTO users (username, stellar_address) VALUES ('farmacia_test', 'GSELLER...')");
  }
  const allUsers = await db.getMany('SELECT id FROM users');
  const userId = allUsers[0].id;
  const sellerId = allUsers[1].id;

  const statuses = ['completed', 'cancelled', 'pending', 'locked', 'revealing'];
  const now = new Date();

  for (let i = 0; i < 20; i++) {
    const status = statuses[i % statuses.length];
    const amount = 150 + (i * 75);
    const createdAt = new Date(now.getTime() - (i * 3600000 * 2));
    const expiresAt = new Date(createdAt.getTime() + 7200000);
    
    await db.execute(
      `INSERT INTO trades 
       (seller_id, buyer_id, amount_mxn, amount_stroops, platform_fee_mxn, 
        secret_hash, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        i % 2 === 0 ? sellerId : userId,
        i % 2 === 0 ? userId : sellerId,
        amount,
        (amount * 10000000).toString(),
        Math.ceil(amount * 0.008),
        `hash_${i}`,
        status,
        createdAt,
        expiresAt
      ]
    );
  }
  app.log.info({ category: 'seed' }, '✅ Seeding complete');
}

async function startEventListener(): Promise<void> {
  if (!config.eventListenerEnabled || config.mockStellar || !config.escrowContractId) {
    app.log.info(
      { category: 'event-listener', enabled: config.eventListenerEnabled, mock: config.mockStellar },
      '[event-listener] Skipped (disabled, mock mode, or no contract ID configured)',
    );
    return;
  }

  try {
    eventListener = createProductionListener(
      config.escrowContractId,
      config.stellarRpcUrl,
      {
        pollIntervalMs: config.eventListenerPollMs,
        healthStaleMs: config.eventListenerHealthStaleMs,
      },
    );
    await eventListener.start();
    app.log.info(
      { contract_id: config.escrowContractId, poll_ms: config.eventListenerPollMs, category: 'event-listener' },
      '[event-listener] Soroban event listener active',
    );
  } catch (err) {
    // Non-fatal: polling fallback remains active.
    app.log.error({ err, category: 'event-listener' }, '[event-listener] Failed to start — polling fallback is active');
  }
}

async function start() {
  try {
    // Validate config at startup. Will throw and crash if critical config is missing.
    validateConfig();
    
    await seedData();
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info({ category: 'http', port: config.port }, '🍄 Micopay MVP Backend running');
    app.log.info({ category: 'http', mockStellar: config.mockStellar }, `Mock Stellar: ${config.mockStellar ? 'ON (no on-chain verification)' : 'OFF (real Soroban RPC)'}`);
    app.log.info({ category: 'http', database: config.databaseUrl.replace(/\/\/.*@/, '//***@') }, 'Database connected');
    await startEventListener();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown: stop the listener loop before the process exits.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    eventListener?.stop();
    process.exit(0);
  });
}

start();
