import { config } from '../config.js';
import type { FastifyRequest } from 'fastify';
import db from '../db/schema.js';
import { ReplayError, UpstreamError } from '../utils/errors.js';

export async function assertNotReplayed(
  txHash: string,
  route: string,
  userId: string,
): Promise<void> {
  const inserted = await db.insertUnique(
    `INSERT INTO processed_tx (tx_hash, source_route, user_id, processed_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING tx_hash`,
    [txHash, route, userId],
    'tx_hash',
  );

  if (inserted === null) {
    throw new ReplayError(txHash, route);
  }
}


const STROOPS_PER_MXN = 10_000_000n;
const DEFAULT_TIMEOUT_MINUTES = 120;

/**
 * Call the escrow contract's lock() function on testnet.
 * Platform signs as seller (for demo — platform holds MXNE).
 * Returns the real transaction hash, visible on stellar.expert.
 */
export async function callLockOnChain(params: {
  request: FastifyRequest;
  buyerStellarAddress: string;
  amountStroops: bigint;
  platformFeeMxn: number;
  secretHash: string;       // 64-char hex (32 bytes)
  timeoutMinutes?: number;
}): Promise<{ txHash: string }> {
  const {
    Contract, TransactionBuilder, Networks, Keypair,
    nativeToScVal, Address, rpc: rpcModule,
  } = await import('@stellar/stellar-sdk');

  const {
    amountStroops,
    platformFeeMxn,
    secretHash,
    timeoutMinutes = DEFAULT_TIMEOUT_MINUTES,
  } = params;

  const rpc = new rpcModule.Server(config.stellarRpcUrl);
  const keypair = Keypair.fromSecret(config.platformSecretKey);
  const platformAddress = keypair.publicKey();

  const account = await rpc.getAccount(platformAddress);
  const contract = new Contract(config.escrowContractId);

  // Platform acts as both seller and buyer for the demo.
  // In production: seller = agent's address, buyer = user's address.
  const platformFeeStroops = BigInt(platformFeeMxn) * STROOPS_PER_MXN;
  const secretHashBytes = Buffer.from(secretHash, 'hex');

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'lock',
        new Address(platformAddress).toScVal(),   // seller
        new Address(platformAddress).toScVal(),   // buyer (demo: same account)
        nativeToScVal(amountStroops, { type: 'i128' }),
        nativeToScVal(platformFeeStroops, { type: 'i128' }),
        nativeToScVal(secretHashBytes, { type: 'bytes' }),
        nativeToScVal(timeoutMinutes, { type: 'u32' }),
      ),
    )
    .setTimeout(60)
    .build();

  let prepared;
  try {
    prepared = await rpc.prepareTransaction(tx);
  } catch (err: any) {
    params.request.log.error({ err: err.message, category: 'stellar.tx' }, '[Stellar] Simulation failed');
    throw new Error(`Simulation failed: ${err.message}. Check if contract is deployed and parameters are correct.`);
  }

  prepared.sign(keypair);

  const sendResult = await rpc.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    params.request.log.error({ detail: sendResult.errorResult, category: 'stellar.tx' }, '[Stellar] Send failed');
    throw new Error(`Send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  const txHash = sendResult.hash;

  // Poll via Horizon (avoids SDK v12 XDR parsing bug in rpc.getTransaction)
  const horizonUrl = `https://horizon-testnet.stellar.org/transactions/${txHash}`;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(horizonUrl);
      if (res.ok) {
        const data = await res.json() as { successful: boolean };
        if (data.successful) {
          params.request.log.info({ tx_hash: txHash, category: 'stellar.tx' }, '[Stellar] Lock confirmed');
          return { txHash };
        }
        throw new UpstreamError(
          'STELLAR_TRANSACTION_FAILED',
          'La transacción de bloqueo falló en la blockchain.',
          `Lock transaction failed on-chain: ${txHash}`
        );
      }
      // 404 = still pending
    } catch (err: any) {
      if (err.message.includes('failed on-chain')) throw err;
      // network error — keep polling
    }
  }

  throw new UpstreamError(
    'STELLAR_TIMEOUT',
    'La transacción de bloqueo está tardando más de lo esperado.',
    `Lock tx ${txHash} not confirmed within 30s`
  );
}

/**
 * Call the escrow contract's release() function on testnet.
 * Platform signs as buyer (demo — same account as seller).
 * trade_id = sha256(secret_hash_bytes), matching compute_trade_id() in the contract.
 */
export async function callReleaseOnChain(params: {
  request: FastifyRequest;
  tradeIdBytes: Buffer;  // 32 bytes: sha256(secret_hash_bytes)
  secretBytes: Buffer;   // 32 bytes: raw HTLC preimage
}): Promise<{ txHash: string }> {
  const {
    Contract, TransactionBuilder, Networks, Keypair,
    nativeToScVal, rpc: rpcModule,
  } = await import('@stellar/stellar-sdk');

  const { tradeIdBytes, secretBytes } = params;

  const rpc = new rpcModule.Server(config.stellarRpcUrl);
  const keypair = Keypair.fromSecret(config.platformSecretKey);
  const platformAddress = keypair.publicKey();

  const account = await rpc.getAccount(platformAddress);
  const contract = new Contract(config.escrowContractId);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'release',
        nativeToScVal(tradeIdBytes, { type: 'bytes' }),
        nativeToScVal(secretBytes, { type: 'bytes' }),
      ),
    )
    .setTimeout(60)
    .build();

  let prepared;
  try {
    prepared = await rpc.prepareTransaction(tx);
  } catch (err: any) {
    params.request.log.error({ err: err.message, category: 'stellar.tx' }, '[Stellar] Release simulation failed');
    throw new Error(`Release simulation failed: ${err.message}. Check if trade exists in contract.`);
  }

  prepared.sign(keypair);

  const sendResult = await rpc.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    params.request.log.error({ detail: sendResult.errorResult, category: 'stellar.tx' }, '[Stellar] Release send failed');
    throw new Error(`Release send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  const txHash = sendResult.hash;

  // Poll via Horizon (same pattern as lock)
  const horizonUrl = `https://horizon-testnet.stellar.org/transactions/${txHash}`;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(horizonUrl);
      if (res.ok) {
        const data = await res.json() as { successful: boolean };
        if (data.successful) {
          params.request.log.info({ tx_hash: txHash, category: 'stellar.tx' }, '[Stellar] Release confirmed');
          return { txHash };
        }
        throw new UpstreamError(
          'STELLAR_RELEASE_FAILED',
          'La transacción de liberación falló en la blockchain.',
          `Release transaction failed on-chain: ${txHash}`
        );
      }
    } catch (err: any) {
      if (err.message.includes('failed on-chain')) throw err;
    }
  }

  throw new UpstreamError(
    'STELLAR_RELEASE_TIMEOUT',
    'La transacción de liberación está tardando más de lo esperado.',
    `Release tx ${txHash} not confirmed within 30s`
  );
}

/**
 * Call the escrow contract's refund() function on testnet.
 * Anyone can call after timeout. trade_id = sha256(secret_hash_bytes).
 */
export async function callRefundOnChain(params: {
  request: FastifyRequest;
  tradeIdBytes: Buffer;
}): Promise<{ txHash: string }> {
  const {
    Contract, TransactionBuilder, Networks, Keypair,
    nativeToScVal, rpc: rpcModule,
  } = await import('@stellar/stellar-sdk');

  const { tradeIdBytes } = params;

  const rpc = new rpcModule.Server(config.stellarRpcUrl);
  const keypair = Keypair.fromSecret(config.platformSecretKey);
  const platformAddress = keypair.publicKey();

  const account = await rpc.getAccount(platformAddress);
  const contract = new Contract(config.escrowContractId);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'refund',
        nativeToScVal(tradeIdBytes, { type: 'bytes' }),
      ),
    )
    .setTimeout(60)
    .build();

  let prepared;
  try {
    prepared = await rpc.prepareTransaction(tx);
  } catch (err: any) {
    params.request.log.error({ err: err.message, category: 'stellar.tx' }, '[Stellar] Refund simulation failed');
    throw new Error(`Refund simulation failed: ${err.message}. Check if trade exists in contract.`);
  }

  prepared.sign(keypair);

  const sendResult = await rpc.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    params.request.log.error({ detail: sendResult.errorResult, category: 'stellar.tx' }, '[Stellar] Refund send failed');
    throw new Error(`Refund send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  const txHash = sendResult.hash;

  const horizonUrl = `https://horizon-testnet.stellar.org/transactions/${txHash}`;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(horizonUrl);
      if (res.ok) {
        const data = await res.json() as { successful: boolean };
        if (data.successful) {
          params.request.log.info({ tx_hash: txHash, category: 'stellar.tx' }, '[Stellar] Refund confirmed');
          return { txHash };
        }
        throw new UpstreamError(
          'STELLAR_REFUND_FAILED',
          'La transacción de reembolso falló en la blockchain.',
          `Refund transaction failed on-chain: ${txHash}`
        );
      }
    } catch (err: any) {
      if (err.message.includes('failed on-chain')) throw err;
    }
  }

  throw new UpstreamError(
    'STELLAR_REFUND_TIMEOUT',
    'La transacción de reembolso está tardando más de lo esperado.',
    `Refund tx ${txHash} not confirmed within 30s`
  );
}

/**
 * Legacy mock used when MOCK_STELLAR=true.
 */
export async function verifyLockOnChain(
  request: FastifyRequest,
  stellarTradeId: string,
  _expectedSellerAddress: string,
  _expectedAmountStroops: bigint,
): Promise<boolean> {
  request.log.info({ stellar_trade_id: stellarTradeId, category: 'stellar.tx' }, '[MOCK] Verifying lock on-chain');
  return true;
}
