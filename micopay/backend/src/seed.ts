import db from './db/schema.js';
import { randomUUID } from 'crypto';

async function seed() {
  console.log('🌱 Seeding trades...');
  
  // Get or create a buyer and seller
  let buyer = await db.getOne("SELECT id FROM users WHERE username = 'juan_test'");
  if (!buyer) {
    buyer = await db.getOne("INSERT INTO users (username, stellar_address) VALUES ('juan_test', 'GBUYER...') RETURNING id");
  }
  
  let seller = await db.getOne("SELECT id FROM users WHERE username = 'farmacia_test'");
  if (!seller) {
    seller = await db.getOne("INSERT INTO users (username, stellar_address) VALUES ('farmacia_test', 'GSELLER...') RETURNING id");
  }

  const userId = buyer.id;
  const sellerId = seller.id;

  const statuses = ['completed', 'cancelled', 'pending', 'locked', 'revealing'];
  const now = new Date();

  for (let i = 0; i < 15; i++) {
    const status = statuses[i % statuses.length];
    const amount = 100 + (i * 50);
    const createdAt = new Date(now.getTime() - (i * 3600000)); // Each trade 1 hour apart
    const expiresAt = new Date(createdAt.getTime() + 7200000); // 2 hours expiry
    
    // Make some expired
    let finalStatus = status;
    if (i > 10) {
      // These will be expired if status is pending/locked/revealing
    }

    await db.execute(
      // CASH-1: the demo alternates escrow direction, so the flow alternates
      // with it. `sellerId` is the merchant and therefore the Red MicoPay
      // provider in both directions — escrow seller on deposit, escrow buyer
      // on cash-out.
      `INSERT INTO trades 
       (seller_id, buyer_id, flow, provider_id, amount_mxn, amount_stroops, platform_fee_mxn, 
        secret_hash, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        i % 2 === 0 ? sellerId : userId, // alternate role
        i % 2 === 0 ? userId : sellerId,
        i % 2 === 0 ? 'deposit' : 'cashout',
        sellerId,
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

  console.log('✅ Seeding complete');
  process.exit(0);
}

seed().catch(console.error);
