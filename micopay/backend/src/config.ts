import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env file manually (no dotenv dependency needed)
function loadEnv() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = join(__dirname, '..', '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// Load .env file only in development if not in CI/Production
if (process.env.NODE_ENV !== 'production') {
  loadEnv();
}

/**
 * Parse CORS_ALLOWED_ORIGINS from environment variable.
 * Format: comma-separated list of origins (e.g., "https://example.com,https://app.example.com")
 * Defaults to localhost in development, empty array in production.
 */
function parseAllowedOrigins(originsEnv: string | undefined, nodeEnv: string | undefined): string[] {
  if (!originsEnv) {
    // Development: allow localhost
    if (nodeEnv !== 'production') {
      return ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
    }
    // Production: empty array means no CORS (must be explicitly configured)
    return [];
  }
  return originsEnv.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}

export type KycOperationType = 'p2p_transfer' | 'cash_in' | 'cash_out' | 'cetes_purchase';

export interface KycThresholdTier {
  /** Inclusive MXN ceiling for this tier; null = no ceiling (final/catch-all tier). */
  maxAmountMxn: number | null;
  requiredLevel: 0 | 1 | 2;
}

// Provisional defaults from the compliance plan's Option B tier table
// (docs/KYC_COMPLIANCE_PLAN_2026-07.md) — pending legal counsel review under
// the LFPIORPI reform. Override via KYC_OPERATION_THRESHOLDS_JSON without a
// code change (#314's "keep thresholds config-driven" requirement).
const DEFAULT_KYC_OPERATION_THRESHOLDS: Record<KycOperationType, KycThresholdTier[]> = {
  p2p_transfer: [
    { maxAmountMxn: 3000, requiredLevel: 0 },
    { maxAmountMxn: null, requiredLevel: 1 },
  ],
  cash_in: [
    { maxAmountMxn: 3000, requiredLevel: 0 },
    { maxAmountMxn: null, requiredLevel: 1 },
  ],
  cash_out: [
    { maxAmountMxn: 3000, requiredLevel: 0 },
    { maxAmountMxn: null, requiredLevel: 1 },
  ],
  cetes_purchase: [
    { maxAmountMxn: 3000, requiredLevel: 0 },
    { maxAmountMxn: null, requiredLevel: 1 },
  ],
};

function parseKycOperationThresholds(
  json: string | undefined,
): Record<KycOperationType, KycThresholdTier[]> {
  if (!json) return DEFAULT_KYC_OPERATION_THRESHOLDS;
  try {
    const parsed = JSON.parse(json);
    return { ...DEFAULT_KYC_OPERATION_THRESHOLDS, ...parsed };
  } catch {
    console.warn('[config] KYC_OPERATION_THRESHOLDS_JSON is not valid JSON — using defaults');
    return DEFAULT_KYC_OPERATION_THRESHOLDS;
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/micopay_dev',

  // Stellar
  stellarRpcUrl: process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
  stellarNetwork: process.env.STELLAR_NETWORK || 'TESTNET',
  platformSecretKey: process.env.PLATFORM_SECRET_KEY || '',
  escrowContractId: process.env.ESCROW_CONTRACT_ID || '',
  mxneContractId: process.env.MXNE_CONTRACT_ID || '',
  mxneIssuerAddress: process.env.MXNE_ISSUER_ADDRESS || '',

  // HTLC Secret Encryption
  secretEncryptionKey: process.env.SECRET_ENCRYPTION_KEY || '',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',

  // Firebase / FCM (for push notifications)
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,
  fcmServiceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON,

  // DeFi integrations
  cetesIssuer: process.env.CETES_ISSUER || 'GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC',
  blendPoolId: process.env.BLEND_POOL_ID || 'CB5UDFTJ6VFOK63ZHQASNODV4PP2HVGPYRF754LRGO7YRG5SFCAZWTDD',

  // Environment
  isProduction: process.env.NODE_ENV === 'production',

  // MVP flags
  mockStellar: process.env.MOCK_STELLAR === 'true',

  // Demo data seeding (B-4): only seed when explicitly enabled
  seedDemoData: process.env.SEED_DEMO_DATA === 'true',

  // DB fallback (B-3): the ephemeral in-memory store is an explicit opt-in only;
  // in production a missing PostgreSQL connection is fatal unless this is set.
  allowInMemoryDb: process.env.ALLOW_IN_MEMORY_DB === 'true',

  // Soroban event listener (off by default; polling fallback covers the rest)
  eventListenerEnabled: process.env.EVENT_LISTENER_ENABLED === 'true',
  eventListenerPollMs: parseInt(process.env.EVENT_LISTENER_POLL_MS || '5000', 10),
  eventListenerHealthStaleMs: parseInt(process.env.EVENT_LISTENER_HEALTH_STALE_MS || '30000', 10),

  // Rate Limiting
  authRateLimitWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '600000', 10), // 10 min
  authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
  tradeRateLimitWindowMs: parseInt(process.env.TRADE_RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
  tradeRateLimitMax: parseInt(process.env.TRADE_RATE_LIMIT_MAX || '10', 10),
  messageRateLimitWindowMs: parseInt(process.env.MESSAGE_RATE_LIMIT_WINDOW_MS || '60000', 10),
  messageRateLimitMax: parseInt(process.env.MESSAGE_RATE_LIMIT_MAX || '30', 10),
  disputeRateLimitWindowMs: parseInt(process.env.DISPUTE_RATE_LIMIT_WINDOW_MS || '3600000', 10),
  disputeRateLimitMax: parseInt(process.env.DISPUTE_RATE_LIMIT_MAX || '5', 10),
  deviceRateLimitWindowMs: parseInt(process.env.DEVICE_RATE_LIMIT_WINDOW_MS || '86400000', 10),
  deviceRateLimitMax: parseInt(process.env.DEVICE_RATE_LIMIT_MAX || '15', 10),
  ipRateLimitWindowMs: parseInt(process.env.IP_RATE_LIMIT_WINDOW_MS || '86400000', 10),
  ipRateLimitMax: parseInt(process.env.IP_RATE_LIMIT_MAX || '20', 10),

  // Abuse / safety (#82)
  buyerDailyTradeMax: parseInt(process.env.BUYER_DAILY_TRADE_MAX || '20', 10),
  buyerDailyAmountMxnMax: parseInt(process.env.BUYER_DAILY_AMOUNT_MXN_MAX || '100000', 10),
  cancelCooldownWindowMs: parseInt(process.env.CANCEL_COOLDOWN_WINDOW_MS || '3600000', 10),
  cancelCooldownThreshold: parseInt(process.env.CANCEL_COOLDOWN_THRESHOLD || '3', 10),
  cancelCooldownMs: parseInt(process.env.CANCEL_COOLDOWN_MS || '300000', 10),
  merchantCancelPauseThreshold: parseInt(process.env.MERCHANT_CANCEL_PAUSE_THRESHOLD || '5', 10),
  merchantDisputePauseThreshold: parseInt(process.env.MERCHANT_DISPUTE_PAUSE_THRESHOLD || '3', 10),
  adminApiKey: process.env.ADMIN_API_KEY || '',

  // Tiered KYC gate (#314) — audit-only (never blocks) until this is
  // explicitly enabled, since thresholds are pending legal counsel review.
  kycGateEnabled: process.env.KYC_GATE_ENABLED === 'true',
  kycLevelExpiryDays: parseInt(process.env.KYC_LEVEL_EXPIRY_DAYS || '365', 10),
  kycOperationThresholds: parseKycOperationThresholds(process.env.KYC_OPERATION_THRESHOLDS_JSON),

  // CORS & Security
  corsAllowedOrigins: parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS, process.env.NODE_ENV),
  nodeEnv: process.env.NODE_ENV || 'development',
} as const;

export function validateConfig() {
  const errors: string[] = [];

  if (!config.databaseUrl) {
    errors.push("DATABASE_URL is missing.");
  }

  if (!config.secretEncryptionKey) {
    errors.push("SECRET_ENCRYPTION_KEY is missing.");
  } else if (!/^[0-9a-fA-F]{64}$/.test(config.secretEncryptionKey)) {
    // AES-256-GCM needs a 32-byte key — 64 hex chars. An invalid key here would
    // otherwise crash at first encrypt/decrypt call instead of at boot.
    errors.push("SECRET_ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256-GCM.");
  }

  if (config.isProduction) {
    if (!process.env.JWT_SECRET || config.jwtSecret === 'dev_jwt_secret' || config.jwtSecret.length < 32) {
      errors.push("JWT_SECRET is missing or too weak (min 32 chars) — required in production.");
    }
    if (config.mockStellar) {
      errors.push("MOCK_STELLAR=true is not allowed in production (it disables on-chain verification and auth signature checks).");
    }
  }

  if (!config.mockStellar) {
    // Platform Secret Key validation
    if (!config.platformSecretKey) {
      errors.push("PLATFORM_SECRET_KEY is missing (required when MOCK_STELLAR=false).");
    } else {
      // Validate secret key format: starts with S, contains only uppercase letters/numbers 2-7, length 56
      const stellarSecretRegex = /^S[A-Z2-7]{55}$/;
      if (!stellarSecretRegex.test(config.platformSecretKey)) {
        errors.push("PLATFORM_SECRET_KEY is invalid. It must be a valid Stellar secret key (56 characters starting with 'S').");
      }
    }

    // Escrow Contract ID validation
    if (!config.escrowContractId) {
      errors.push("ESCROW_CONTRACT_ID is missing (required when MOCK_STELLAR=false).");
    } else {
      const stellarContractRegex = /^C[A-Z2-7]{55}$/;
      if (!stellarContractRegex.test(config.escrowContractId)) {
        errors.push("ESCROW_CONTRACT_ID is invalid. It must be a valid Stellar contract ID (56 characters starting with 'C').");
      }
    }

    // MXNE Contract ID validation
    if (!config.mxneContractId) {
      errors.push("MXNE_CONTRACT_ID is missing (required when MOCK_STELLAR=false).");
    } else {
      const stellarContractRegex = /^C[A-Z2-7]{55}$/;
      if (!stellarContractRegex.test(config.mxneContractId)) {
        errors.push("MXNE_CONTRACT_ID is invalid. It must be a valid Stellar contract ID (56 characters starting with 'C').");
      }
    }
  }

  if (errors.length > 0) {
    throw new Error("Configuration Validation Failed:\n" + errors.map(e => `  - ${e}`).join("\n"));
  }
}

/**
 * Configure CORS based on environment and allowed origins.
 * Development: allows localhost and 127.0.0.1
 * Production: requires explicit CORS_ALLOWED_ORIGINS configuration
 */
export function getCorsOptions() {
  const origins = config.corsAllowedOrigins;

  if (origins.length === 0) {
    // Fail-safe: if no origins configured in production, reject all CORS
    if (config.nodeEnv === 'production') {
      console.warn('[SECURITY] No CORS origins configured in production. CORS requests will be rejected.');
      return {
        origin: false,
        credentials: false,
      };
    }
    // Development with no explicit config: use defaults
    return {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    };
  }

  // Specific origins configured
  return {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // 24 hours
  };
}

