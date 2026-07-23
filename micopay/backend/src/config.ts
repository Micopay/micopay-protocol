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

  // DeFi integrations
  cetesIssuer: process.env.CETES_ISSUER || 'GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC',
  blendPoolId: process.env.BLEND_POOL_ID || 'CB5UDFTJ6VFOK63ZHQASNODV4PP2HVGPYRF754LRGO7YRG5SFCAZWTDD',

  // MVP flags
  mockStellar: process.env.MOCK_STELLAR === 'true',

  // Rate Limiting
  authRateLimitWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '600000', 10), // 10 min
  authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
  tradeRateLimitWindowMs: parseInt(process.env.TRADE_RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
  tradeRateLimitMax: parseInt(process.env.TRADE_RATE_LIMIT_MAX || '10', 10),
  disputeRateLimitWindowMs: parseInt(process.env.DISPUTE_RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
  disputeRateLimitMax: parseInt(process.env.DISPUTE_RATE_LIMIT_MAX || '5', 10),
} as const;
