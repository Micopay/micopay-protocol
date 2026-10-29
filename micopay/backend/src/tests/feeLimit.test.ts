import { ok, rejects, strictEqual } from 'node:assert';
import db, { pool } from '../db/schema.js';
import { updateMerchantConfig } from '../services/merchant.service.js';
import {
  computeTradeFees,
  isEffectiveFeeAllowed,
  isProviderRateAllowed,
  MAX_EFFECTIVE_FEE_PERCENT,
  MAX_PROVIDER_FEE_PERCENT,
  PLATFORM_FEE_PERCENT,
} from '../services/tradeFees.js';

strictEqual(MAX_EFFECTIVE_FEE_PERCENT, Number(process.env.MAX_EFFECTIVE_FEE_PERCENT || 6));
strictEqual(MAX_PROVIDER_FEE_PERCENT, MAX_EFFECTIVE_FEE_PERCENT - PLATFORM_FEE_PERCENT);
ok(isProviderRateAllowed(MAX_PROVIDER_FEE_PERCENT));
ok(!isProviderRateAllowed(MAX_PROVIDER_FEE_PERCENT + 0.0001));

const allowed = computeTradeFees(500, MAX_PROVIDER_FEE_PERCENT, 'cashout');
strictEqual(allowed.effectivePercent, MAX_EFFECTIVE_FEE_PERCENT);
ok(isEffectiveFeeAllowed(allowed));

const roundedOver = computeTradeFees(100, MAX_PROVIDER_FEE_PERCENT, 'cashout');
strictEqual(roundedOver.effectivePercent, MAX_EFFECTIVE_FEE_PERCENT + 1);
ok(!isEffectiveFeeAllowed(roundedOver));

console.log(`✓ total fee cap is configurable and blocks effective fees above ${MAX_EFFECTIVE_FEE_PERCENT}%`);

const suffix = Math.random().toString(36).slice(2, 10);
const user = await db.getOne<{ id: string }>(
  `INSERT INTO users (stellar_address, username, phone_hash)
   VALUES ($1, $2, $3)
   RETURNING id`,
  [`G${'F'.repeat(47)}${suffix}`, `fee_limit_${suffix}`, `hash_${suffix}`],
);

await updateMerchantConfig(user!.id, {
  ratePercent: MAX_PROVIDER_FEE_PERCENT,
  minTradeMxn: 100,
  maxTradeMxn: 50000,
  dailyCapMxn: 250000,
});

await rejects(
  updateMerchantConfig(user!.id, {
    ratePercent: MAX_PROVIDER_FEE_PERCENT + 0.1,
    minTradeMxn: 100,
    maxTradeMxn: 50000,
    dailyCapMxn: 250000,
  }),
  /rate_percent must be between/,
);

console.log('✓ merchant configuration rejects provider fees above the configured maximum');
await pool?.end();
