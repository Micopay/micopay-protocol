import { config } from '../config.js';
import type { FastifyRequest } from 'fastify';
import db from '../db/schema.js';
import { ReplayError, UpstreamError, BadRequestError } from '../utils/errors.js';

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

function getNetworkPassphrase(NetworksModule: typeof import('@stellar/stellar-sdk').Networks) {
  return config.stellarNetwork === 'TESTNET' ? NetworksModule.TESTNET : NetworksModule.PUBLIC;
}

function getHorizonUrl(): string {
  return config.stellarNetwork === 'TESTNET'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org';
}

/**
 * A client-signed XDR is an opaque blob until we look inside it — without this
 * check, a seller/buyer juggling multiple trades could sign one trade's
 * lock()/release() call and submit it against a *different* trade's endpoint
 * (same auth passes, since they own both trades), desyncing the DB's trade
 * status from what actually happened on-chain. This parses the single
 * invokeHostFunction operation out of the transaction and asserts the
 * contract id, function name, and every fund-relevant argument match what the
 * trade row expects before we ever call sendTransaction.
 */
async function assertInvocationMatches(
  tx: import('@stellar/stellar-sdk').Transaction | import('@stellar/stellar-sdk').FeeBumpTransaction,
  expected: { functionName: string; args: unknown[] },
) {
  const { Address, scValToNative, FeeBumpTransaction } = await import('@stellar/stellar-sdk');

  if (tx instanceof FeeBumpTransaction) {
    throw new BadRequestError('INVALID_TX_SHAPE', 'La transacción firmada no es válida.', 'Fee-bump transactions are not accepted for lock/release');
  }

  if (tx.operations.length !== 1 || tx.operations[0].type !== 'invokeHostFunction') {
    throw new BadRequestError('INVALID_TX_SHAPE', 'La transacción firmada no es válida.', 'Expected exactly one invokeHostFunction operation');
  }

  const op = tx.operations[0] as import('@stellar/stellar-sdk').Operation.InvokeHostFunction;
  const hostFn = op.func;
  if (hostFn.switch().name !== 'hostFunctionTypeInvokeContract') {
    throw new BadRequestError('INVALID_TX_SHAPE', 'La transacción firmada no es válida.', 'Expected an invokeContract host function');
  }

  const invocation = hostFn.invokeContract();
  const contractId = Address.fromScAddress(invocation.contractAddress()).toString();
  if (contractId !== config.escrowContractId) {
    throw new BadRequestError('TX_CONTRACT_MISMATCH', 'La transacción firmada no corresponde al contrato de escrow.', `Expected contract ${config.escrowContractId}, got ${contractId}`);
  }

  const functionName = invocation.functionName().toString();
  if (functionName !== expected.functionName) {
    throw new BadRequestError('TX_FUNCTION_MISMATCH', 'La transacción firmada no corresponde a esta operación.', `Expected function ${expected.functionName}, got ${functionName}`);
  }

  // Only the leading args we pass in `expected` are checked — trailing args
  // (e.g. lock's timeout_minutes) aren't fund-relevant and are intentionally
  // left unchecked by the caller omitting them from `expected.args`.
  const actualArgs = invocation.args().map((a) => scValToNative(a));
  if (actualArgs.length < expected.args.length) {
    throw new BadRequestError('TX_ARGS_MISMATCH', 'La transacción firmada no corresponde a este intercambio.', `Arg count mismatch: expected at least ${expected.args.length}, got ${actualArgs.length}`);
  }
  for (let i = 0; i < expected.args.length; i++) {
    const a = actualArgs[i];
    const e = expected.args[i];
    const matches = Buffer.isBuffer(e) || e instanceof Uint8Array
      ? Buffer.from(a as Uint8Array).equals(Buffer.from(e as Uint8Array))
      : String(a) === String(e);
    if (!matches) {
      throw new BadRequestError(
        'TX_ARGS_MISMATCH',
        'La transacción firmada no corresponde a este intercambio.',
        `Arg ${i} mismatch: expected ${e}, got ${a}`,
      );
    }
  }
}

/**
 * Poll Horizon for transaction confirmation.
 * Shared by every prepare/submit pair below.
 */
async function pollForConfirmation(
  request: Pick<FastifyRequest, 'log'>,
  txHash: string,
  label: string,
  failedCode: string,
  timeoutCode: string,
  failedMessage: string,
  timeoutMessage: string,
): Promise<{ txHash: string }> {
  const horizonUrl = `${getHorizonUrl()}/transactions/${txHash}`;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(horizonUrl);
      if (res.ok) {
        const data = (await res.json()) as { successful: boolean };
        if (data.successful) {
          request.log.info({ tx_hash: txHash, category: 'stellar.tx' }, `[Stellar] ${label} confirmed`);
          return { txHash };
        }
        throw new UpstreamError(failedCode, failedMessage, `${label} transaction failed on-chain: ${txHash}`);
      }
      // 404 = still pending
    } catch (err: any) {
      if (err instanceof UpstreamError) throw err;
      // network error — keep polling
    }
  }

  throw new UpstreamError(timeoutCode, timeoutMessage, `${label} tx ${txHash} not confirmed within 30s`);
}

/**
 * Build and simulate (but do not sign) the lock() invocation.
 * The seller's own key must sign the returned XDR client-side —
 * the contract enforces `seller.require_auth()`, so the backend
 * never needs (or is able) to act on the seller's behalf.
 */
export async function prepareLockTx(params: {
  request: FastifyRequest;
  sellerAddress: string;
  buyerAddress: string;
  amountStroops: bigint;
  platformFeeMxn: number;
  secretHash: string; // 64-char hex (32 bytes)
  timeoutMinutes?: number;
}): Promise<{ xdr: string; networkPassphrase: string }> {
  const {
    Contract, TransactionBuilder, Networks, nativeToScVal, Address, rpc: rpcModule,
  } = await import('@stellar/stellar-sdk');

  const {
    sellerAddress, buyerAddress, amountStroops, platformFeeMxn, secretHash,
    timeoutMinutes = DEFAULT_TIMEOUT_MINUTES,
  } = params;

  const rpc = new rpcModule.Server(config.stellarRpcUrl);
  const networkPassphrase = getNetworkPassphrase(Networks);

  const account = await rpc.getAccount(sellerAddress);
  const contract = new Contract(config.escrowContractId);

  const platformFeeStroops = BigInt(platformFeeMxn) * STROOPS_PER_MXN;
  const secretHashBytes = Buffer.from(secretHash, 'hex');

  const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase })
    .addOperation(
      contract.call(
        'lock',
        new Address(sellerAddress).toScVal(),
        new Address(buyerAddress).toScVal(),
        nativeToScVal(amountStroops, { type: 'i128' }),
        nativeToScVal(platformFeeStroops, { type: 'i128' }),
        nativeToScVal(secretHashBytes, { type: 'bytes' }),
        nativeToScVal(timeoutMinutes, { type: 'u32' }),
      ),
    )
    .setTimeout(180)
    .build();

  let prepared;
  try {
    prepared = await rpc.prepareTransaction(tx);
  } catch (err: any) {
    params.request.log.error({ err: err.message, category: 'stellar.tx' }, '[Stellar] Lock simulation failed');
    throw new Error(`Simulation failed: ${err.message}. Check if contract is deployed and parameters are correct.`);
  }

  return { xdr: prepared.toXDR(), networkPassphrase };
}

/**
 * Submit a lock() transaction that was already signed by the seller's own key.
 * Re-derives the expected contract-call arguments from the trade row and
 * verifies the signed XDR actually matches before submitting — see
 * assertInvocationMatches() for why this is required.
 */
export async function submitLockTx(params: {
  request: FastifyRequest;
  signedXdr: string;
  sellerAddress: string;
  buyerAddress: string;
  amountStroops: bigint;
  platformFeeMxn: number;
  secretHash: string;
}): Promise<{ txHash: string }> {
  const { TransactionBuilder, Networks, rpc: rpcModule } = await import('@stellar/stellar-sdk');
  const rpc = new rpcModule.Server(config.stellarRpcUrl);
  const networkPassphrase = getNetworkPassphrase(Networks);

  const tx = TransactionBuilder.fromXDR(params.signedXdr, networkPassphrase);

  await assertInvocationMatches(tx, {
    functionName: 'lock',
    args: [
      params.sellerAddress,
      params.buyerAddress,
      params.amountStroops,
      BigInt(params.platformFeeMxn) * STROOPS_PER_MXN,
      Buffer.from(params.secretHash, 'hex'),
      // timeout_minutes (6th arg) intentionally omitted — not fund-relevant.
    ],
  });

  const sendResult = await rpc.sendTransaction(tx);
  if (sendResult.status === 'ERROR') {
    params.request.log.error({ detail: sendResult.errorResult, category: 'stellar.tx' }, '[Stellar] Lock send failed');
    throw new BadRequestError('STELLAR_LOCK_SEND_FAILED', 'La transacción de bloqueo fue rechazada por la red.', `Send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  return pollForConfirmation(
    params.request,
    sendResult.hash,
    'Lock',
    'STELLAR_TRANSACTION_FAILED',
    'STELLAR_TIMEOUT',
    'La transacción de bloqueo falló en la blockchain.',
    'La transacción de bloqueo está tardando más de lo esperado.',
  );
}

/**
 * Build and simulate (but do not sign) the release() invocation.
 * The buyer's own key must sign the returned XDR client-side —
 * the contract enforces `trade.buyer.require_auth()`.
 */
export async function prepareReleaseTx(params: {
  request: FastifyRequest;
  buyerAddress: string;
  tradeIdBytes: Buffer; // 32 bytes: sha256(secret_hash_bytes)
  secretBytes: Buffer; // 32 bytes: raw HTLC preimage
}): Promise<{ xdr: string; networkPassphrase: string }> {
  const { Contract, TransactionBuilder, Networks, nativeToScVal, rpc: rpcModule } = await import('@stellar/stellar-sdk');

  const { buyerAddress, tradeIdBytes, secretBytes } = params;

  const rpc = new rpcModule.Server(config.stellarRpcUrl);
  const networkPassphrase = getNetworkPassphrase(Networks);

  const account = await rpc.getAccount(buyerAddress);
  const contract = new Contract(config.escrowContractId);

  const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase })
    .addOperation(
      contract.call(
        'release',
        nativeToScVal(tradeIdBytes, { type: 'bytes' }),
        nativeToScVal(secretBytes, { type: 'bytes' }),
      ),
    )
    .setTimeout(180)
    .build();

  let prepared;
  try {
    prepared = await rpc.prepareTransaction(tx);
  } catch (err: any) {
    params.request.log.error({ err: err.message, category: 'stellar.tx' }, '[Stellar] Release simulation failed');
    throw new Error(`Release simulation failed: ${err.message}. Check if trade exists in contract.`);
  }

  return { xdr: prepared.toXDR(), networkPassphrase };
}

/**
 * Submit a release() transaction that was already signed by the buyer's own key.
 * Re-derives the expected contract-call arguments from the trade row and
 * verifies the signed XDR actually matches before submitting — see
 * assertInvocationMatches() for why this is required.
 */
export async function submitReleaseTx(params: {
  request: FastifyRequest;
  signedXdr: string;
  tradeIdBytes: Buffer;
  secretBytes: Buffer;
}): Promise<{ txHash: string }> {
  const { TransactionBuilder, Networks, rpc: rpcModule } = await import('@stellar/stellar-sdk');
  const rpc = new rpcModule.Server(config.stellarRpcUrl);
  const networkPassphrase = getNetworkPassphrase(Networks);

  const tx = TransactionBuilder.fromXDR(params.signedXdr, networkPassphrase);

  await assertInvocationMatches(tx, {
    functionName: 'release',
    args: [params.tradeIdBytes, params.secretBytes],
  });

  const sendResult = await rpc.sendTransaction(tx);
  if (sendResult.status === 'ERROR') {
    params.request.log.error({ detail: sendResult.errorResult, category: 'stellar.tx' }, '[Stellar] Release send failed');
    throw new BadRequestError('STELLAR_RELEASE_SEND_FAILED', 'La transacción de liberación fue rechazada por la red.', `Release send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  return pollForConfirmation(
    params.request,
    sendResult.hash,
    'Release',
    'STELLAR_RELEASE_FAILED',
    'STELLAR_RELEASE_TIMEOUT',
    'La transacción de liberación falló en la blockchain.',
    'La transacción de liberación está tardando más de lo esperado.',
  );
}

/**
 * Call the escrow contract's refund() function.
 * No require_auth() in the contract for refund — anyone may call it
 * after timeout, so the platform key remains a valid signer here.
 *
 * `request` only needs `.log` — narrowed to `Pick<FastifyRequest, 'log'>` (not
 * the full `FastifyRequest`) so the background refund sweep in index.ts, which
 * has no HTTP request, can call this with a plain `{ log: app.log }` shim.
 */
export async function callRefundOnChain(params: {
  request: Pick<FastifyRequest, 'log'>;
  tradeIdBytes: Buffer;
}): Promise<{ txHash: string }> {
  const {
    Contract, TransactionBuilder, Networks, Keypair,
    nativeToScVal, rpc: rpcModule,
  } = await import('@stellar/stellar-sdk');

  const { tradeIdBytes } = params;

  const rpc = new rpcModule.Server(config.stellarRpcUrl);
  const networkPassphrase = getNetworkPassphrase(Networks);
  const keypair = Keypair.fromSecret(config.platformSecretKey);
  const platformAddress = keypair.publicKey();

  const account = await rpc.getAccount(platformAddress);
  const contract = new Contract(config.escrowContractId);

  const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase })
    .addOperation(
      contract.call('refund', nativeToScVal(tradeIdBytes, { type: 'bytes' })),
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

  return pollForConfirmation(
    params.request,
    sendResult.hash,
    'Refund',
    'STELLAR_REFUND_FAILED',
    'STELLAR_REFUND_TIMEOUT',
    'La transacción de reembolso falló en la blockchain.',
    'La transacción de reembolso está tardando más de lo esperado.',
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
