/**
 * Evidencia H1 en testnet (2026-10-29). Mismo secret_hash en el contrato XLM
 * (operacion A) y en el legacy (B); B se reembolsa y los dos listeners
 * procesan los eventos reales del RPC.
 *
 * Uso: copiar a micopay/backend/src/ y correr `npx tsx src/<archivo>.ts`.
 * Necesita red (friendbot y soroban-testnet). Gasta 2 stroops de testnet.
 *
 * Resultado:
 *   - main (55da2f3): A queda `refunded` por el evento de B, y su propio
 *     release ya no la corrige (sigue `refunded`, en cadena `Released`).
 *   - WP1 (92651ac + 38681e4): A sigue `revealing` tras el refund de B y pasa
 *     a `completed` con su release. En cadena: A Released, B Refunded.
 *   - Transacciones de la corrida con WP1: lock B add59a92…, refund B
 *     d7eb8fb1…, release A 65559cc9… (ledgers 5461311-5461313).
 */
const sdk = await import('@stellar/stellar-sdk');
const { Keypair, rpc, Contract, TransactionBuilder, Networks, Address, nativeToScVal } = sdk;
const { createHash, randomBytes, randomUUID } = await import('crypto');
const RPC = 'https://soroban-testnet.stellar.org';
const XLM = 'CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4';
const LEGACY = 'CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ';
const kp = Keypair.random();
await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
Object.assign(process.env, {
  PLATFORM_SECRET_KEY: kp.secret(), MOCK_STELLAR: 'false', STELLAR_NETWORK: 'TESTNET', STELLAR_RPC_URL: RPC,
  ALLOW_IN_MEMORY_DB: 'true', ESCROW_CONTRACTS: `XLM=${XLM}`, ESCROW_LEGACY_CONTRACT_ID: LEGACY,
});
const server = new rpc.Server(RPC);
const db = (await import('./db/schema.js')).default;
const { createProductionListener } = await import('./services/event-listener.service.js');
const { setEventCursor } = await import('./db/event-cursor.model.js');
const { readEscrowTrade } = await import('./services/stellar.service.js');

async function invoke(contract: string, fn: string, args: any[]) {
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(contract).call(fn, ...args)).setTimeout(60).build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(kp);
  const sent = await server.sendTransaction(prepared);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res: any = await server.getTransaction(sent.hash);
    if (res.status !== 'NOT_FOUND') return { status: res.status, hash: sent.hash, ledger: res.ledger };
  }
  throw new Error(`timeout ${sent.hash}`);
}

const secret = randomBytes(32);
const secretHash = createHash('sha256').update(secret).digest();
const tradeIdBytes = createHash('sha256').update(secretHash).digest();
const me = new Address(kp.publicKey()).toScVal();
const lockArgs = (timeout: number) => [me, me, nativeToScVal(1n, { type: 'i128' }), nativeToScVal(0n, { type: 'i128' }),
  nativeToScVal(secretHash, { type: 'bytes' }), nativeToScVal(timeout, { type: 'u32' })];

const startLedger = (await server.getLatestLedger()).sequence;
console.log('lock A (XLM):', await invoke(XLM, 'lock', lockArgs(1000)));
console.log('lock B (legacy, mismo hash):', await invoke(LEGACY, 'lock', lockArgs(0)));
console.log('refund B (legacy):', await invoke(LEGACY, 'refund', [nativeToScVal(tradeIdBytes, { type: 'bytes' })]));

// Fila A como la deja lockTrade: revealing, en el contrato XLM.
const user = async (l: string) => (await db.getOne<{ id: string }>(
  'INSERT INTO users (stellar_address, username) VALUES ($1, $2) RETURNING id',
  [kp.publicKey(), `h1_${l}_${randomUUID().slice(0, 8)}`]))!.id;
const sellerId = await user('s'); const buyerId = await user('b');
const tradeA = randomUUID();
await db.execute(
  `INSERT INTO trades (id, status, contract_trade_id, seller_id, buyer_id, flow, provider_id,
     amount_mxn, amount_stroops, platform_fee_mxn, secret_hash, escrow_contract_id)
   VALUES ($1, 'revealing', $2, $3, $4, 'deposit', $3, 1, 1, 0, $5, $6)`,
  [tradeA, tradeIdBytes.toString('hex'), sellerId, buyerId, secretHash.toString('hex'), XLM]);
const statusA = async () => (await db.getOne<{ status: string }>('SELECT status FROM trades WHERE id = $1', [tradeA]))!.status;

// Los dos listeners, como en produccion si el legacy tambien se escuchara.
const poll = async (contract: string) => {
  await setEventCursor(contract, startLedger - 1);
  await (createProductionListener(contract, RPC) as any).pollOnce();
};
await poll(LEGACY);
await poll(XLM);
console.log('A tras el refund real de B en legacy:', await statusA(), '(esperado: revealing)');

// Control: un evento correcto de A si se aplica.
const before = (await server.getLatestLedger()).sequence;
console.log('release A (XLM):', await invoke(XLM, 'release', [nativeToScVal(tradeIdBytes, { type: 'bytes' }), nativeToScVal(secret, { type: 'bytes' })]));
await setEventCursor(XLM, before - 1);
await (createProductionListener(XLM, RPC) as any).pollOnce();
console.log('A tras su propio release:', await statusA(), '(esperado: completed)');
console.log('en cadena:', 'A', (await readEscrowTrade({ contractId: XLM, tradeIdBytes })).trade?.status,
  '| B', (await readEscrowTrade({ contractId: LEGACY, tradeIdBytes })).trade?.status);
process.exit(0);
