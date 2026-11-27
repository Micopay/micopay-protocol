// Spike: el escrow real de testnet con una smart account (C…) como vendedor y como comprador.
//
// Cuentas nuevas cada vez (friendbot), sin secretos guardados:
//   relayer: G… que manda y paga todas las transacciones de la smart account
//   agente:  G… normal (como un agente de hoy)
//   dueno:   llave ed25519 que firma por la smart account; no es una cuenta de Stellar
//
// Prueba A: la C… bloquea en el escrow (lock) y el agente G… libera (release).
// Prueba B: el agente G… bloquea y la C… libera, y recibe el dinero.
// Prueba C: un lock firmado con otra llave tiene que fallar.
//
// Uso (desde labs/smart-account):
//   stellar contract build
//   node scripts/spike.mjs <ruta a @stellar/stellar-sdk>
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sdk = require(process.argv[2]);
const { Keypair, rpc, Networks, TransactionBuilder, Operation, Contract, Address, xdr, nativeToScVal, scValToNative, hash, Asset } = sdk;

const RPC = 'https://soroban-testnet.stellar.org';
const PASS = Networks.TESTNET;
// Escrow real de XLM en testnet (micopay/contracts/TESTNET.md), sin cambios.
const ESCROW = 'CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4';
const XLM = Asset.native().contractId(PASS);
const WASM = 'target/wasm32v1-none/release/micopay_labs_smart_account.wasm';
const XLM1 = 10_000_000n;

const server = new rpc.Server(RPC);
const sha = (b) => createHash('sha256').update(b).digest();
const explorer = (h) => `https://stellar.expert/explorer/testnet/tx/${h}`;
const log = (...a) => console.log(...a);

async function fund(kp) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}

// Firma la autorizacion de la smart account: ed25519 del dueno sobre el hash que arma Soroban.
async function signForSmartAccount(entry, ownerKp) {
  const creds = entry.credentials();
  if (creds.switch().name !== 'sorobanCredentialsAddress') return entry;
  const { sequence } = await server.getLatestLedger();
  const until = sequence + 100;
  const addr = creds.address();
  addr.signatureExpirationLedger(until);
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(PASS)),
      nonce: addr.nonce(),
      signatureExpirationLedger: until,
      invocation: entry.rootInvocation(),
    }),
  );
  const payload = hash(preimage.toXDR());
  addr.signature(xdr.ScVal.scvBytes(ownerKp.sign(payload)));
  return entry;
}

// Manda una transaccion con el relayer como origen. Si `smartOwner` viene, firma las
// autorizaciones de la smart account con esa llave.
async function send(sourceKp, op, smartOwner) {
  let account = await server.getAccount(sourceKp.publicKey());
  const build = (o) => new TransactionBuilder(account, { fee: '1000000', networkPassphrase: PASS }).addOperation(o).setTimeout(60).build();
  let tx = build(op);
  if (smartOwner) {
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error('simulacion: ' + sim.error);
    const auth = [];
    for (const e of sim.result.auth) auth.push(await signForSmartAccount(e, smartOwner));
    const fn = tx.operations[0].func;
    account = await server.getAccount(sourceKp.publicKey());
    tx = build(Operation.invokeHostFunction({ func: fn, auth }));
  }
  const sim2 = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim2)) throw new Error('simulacion: ' + sim2.error);
  const prepared = rpc.assembleTransaction(tx, sim2).build();
  prepared.sign(sourceKp);
  const res = await server.sendTransaction(prepared);
  if (res.status === 'ERROR') throw new Error('envio: ' + JSON.stringify(res.errorResult));
  const final = await server.pollTransaction(res.hash, { attempts: 30 });
  if (final.status !== 'SUCCESS') throw new Error(`tx ${res.hash} ${final.status}`);
  return { hash: res.hash, value: final.returnValue ? scValToNative(final.returnValue) : undefined };
}

async function read(contractId, fn, ...args) {
  const kp = Keypair.random();
  const acc = new sdk.Account(kp.publicKey(), '0');
  const tx = new TransactionBuilder(acc, { fee: '100', networkPassphrase: PASS })
    .addOperation(new Contract(contractId).call(fn, ...args)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${fn}: ${sim.error}`);
  return scValToNative(sim.result.retval);
}
const balance = async (a) => BigInt(await read(XLM, 'balance', new Address(a).toScVal()));
const fmt = (s) => (Number(s) / 1e7).toFixed(7);

const lockOp = (seller, buyer, secretHash) =>
  new Contract(ESCROW).call('lock',
    new Address(seller).toScVal(), new Address(buyer).toScVal(),
    nativeToScVal(XLM1, { type: 'i128' }), nativeToScVal(XLM1 / 100n, { type: 'i128' }),
    nativeToScVal(secretHash, { type: 'bytes' }), nativeToScVal(30, { type: 'u32' }));
const releaseOp = (tradeId, secret) =>
  new Contract(ESCROW).call('release', nativeToScVal(tradeId, { type: 'bytes' }), nativeToScVal(secret, { type: 'bytes' }));

async function main() {
  const net = await server.getNetwork();
  if (net.passphrase !== PASS) throw new Error('El RPC no es testnet: ' + net.passphrase);

  const relayer = Keypair.random();
  const agente = Keypair.random();
  const dueno = Keypair.random();
  await fund(relayer); await fund(agente);
  log('relayer', relayer.publicKey());
  log('agente ', agente.publicKey());

  // 1. Subir el WASM y crear la smart account con el dueno como firmante.
  const wasm = readFileSync(WASM);
  const up = await send(relayer, Operation.uploadContractWasm({ wasm }));
  const created = await send(relayer, Operation.createCustomContract({
    address: new Address(relayer.publicKey()),
    wasmHash: sha(wasm),
    salt: randomBytes(32),
    constructorArgs: [nativeToScVal(dueno.rawPublicKey(), { type: 'bytes' })],
  }));
  const smart = created.value;
  log('smart account', smart, explorer(created.hash));

  // 2. Darle 5 XLM a la smart account (sin trustline: guarda el saldo en el contrato del token).
  await send(relayer, new Contract(XLM).call('transfer',
    new Address(relayer.publicKey()).toScVal(), new Address(smart).toScVal(), nativeToScVal(5n * XLM1, { type: 'i128' })));
  log('saldo C… inicial', fmt(await balance(smart)));

  // A. La C… bloquea, el agente libera.
  const secretA = randomBytes(32);
  const lockA = await send(relayer, lockOp(smart, agente.publicKey(), sha(secretA)), dueno);
  const tradeA = Buffer.from(lockA.value);
  log('\nA. lock de la C…', explorer(lockA.hash));
  log('   saldo C… tras lock', fmt(await balance(smart)), '(esperado 3.9900000)');
  const agenteAntes = await balance(agente.publicKey());
  const relA = await send(agente, releaseOp(tradeA, secretA));
  log('   release del agente G…', explorer(relA.hash));
  const trade = await read(ESCROW, 'get_trade', nativeToScVal(tradeA, { type: 'bytes' }));
  log('   estado', JSON.stringify(trade.status), '· vendedor', trade.seller);
  log('   el agente recibio', fmt(await balance(agente.publicKey()) - agenteAntes), 'XLM (1 XLM menos la comision de su tx)');

  // B. El agente bloquea, la C… libera.
  const secretB = randomBytes(32);
  const lockB = await send(agente, lockOp(agente.publicKey(), smart, sha(secretB)));
  const tradeB = Buffer.from(lockB.value);
  log('\nB. lock del agente G…', explorer(lockB.hash));
  const antes = await balance(smart);
  const relB = await send(relayer, releaseOp(tradeB, secretB), dueno);
  log('   release de la C…', explorer(relB.hash));
  log('   la C… recibio', fmt(await balance(smart) - antes), 'XLM (esperado 1.0000000; la comision la pago el relayer)');

  // C. Firma con otra llave: tiene que fallar.
  const intruso = Keypair.random();
  try {
    await send(relayer, lockOp(smart, agente.publicKey(), sha(randomBytes(32))), intruso);
    log('\nC. FALLO: el escrow acepto una firma de otra llave');
    process.exitCode = 1;
  } catch (e) {
    // Solo cuenta el rechazo de la autorizacion; un fallo de red o de RPC no prueba nada.
    const msg = String(e.message);
    if (msg.includes('Error(Auth, InvalidAction)')) {
      log('\nC. lock con otra llave rechazado:', msg.slice(0, 90));
    } else {
      log('\nC. FALLO: error inesperado, no el rechazo de la firma:', msg.slice(0, 200));
      process.exitCode = 1;
    }
  }
  log('\nsaldo C… final', fmt(await balance(smart)));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
