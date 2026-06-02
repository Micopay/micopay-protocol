import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import { config } from './config.js';
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

// CORS — explicit allowlist for Capacitor WebView + dev/prod web origins.
// Extra origins can be added via CORS_EXTRA_ORIGINS (comma-separated).
const DEFAULT_ALLOWED_ORIGINS = [
  'https://localhost',       // Android (capacitor.config androidScheme: 'https')
  'capacitor://localhost',   // iOS default scheme
  'http://localhost:5173',   // Vite dev server
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

// Rate limit (optional — gracefully skip if not available)
try {
  const rateLimit = await import('@fastify/rate-limit');
  app.register(rateLimit.default, { global: false });
  } catch {
    app.log.warn({ category: 'http' }, '⚠️  @fastify/rate-limit not installed, skipping rate limiting');
  }

// --- Global error handler ---
app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    if (error.httpStatus >= 500) {
      request.log.error({ err: error }, `[${error.code}] ${error.devMessage}`);
    } else {
      request.log.info({ err: error }, `[${error.code}] ${error.devMessage}`);
    }
    
    reply.status(error.httpStatus).send({
      code: error.code,
      message: error.userMessage,
    });
    return;
  }

  // Fastify validation errors
  if (error.validation) {
    request.log.warn({ err: error }, `Validation Error: ${error.message}`);
    reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: 'Por favor, verifica los datos ingresados.',
    });
    return;
  }

  // Unknown errors
  request.log.error({ err: error }, 'Unhandled Error');
  reply.status(500).send({
    code: 'INTERNAL_ERROR',
    message: 'Ocurrió un error inesperado. Por favor, intenta más tarde.',
  });
});

// --- Routes ---

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  mockStellar: config.mockStellar,
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

async function start() {
  try {
    await seedData();
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info({ category: 'http', port: config.port }, '🍄 Micopay MVP Backend running');
    app.log.info({ category: 'http', mockStellar: config.mockStellar }, `Mock Stellar: ${config.mockStellar ? 'ON (no on-chain verification)' : 'OFF (real Soroban RPC)'}`);
    app.log.info({ category: 'http', database: config.databaseUrl.replace(/\/\/.*@/, '//***@') }, 'Database connected');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
