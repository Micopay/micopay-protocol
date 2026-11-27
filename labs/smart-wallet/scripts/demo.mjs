// Demo en testnet de la smart wallet de labs (W1–W5): varios firmantes ed25519 con peso y umbral.
//
// Cuentas nuevas cada vez (friendbot), sin secretos guardados:
//   relayer: G… que manda y paga todas las transacciones de la wallet
//   agente:  G… normal (como un agente de hoy)
//   a, b:    llaves ed25519 (telefono y respaldo); no son cuentas de Stellar
//
// Pasos:
//   1. subir el WASM, crear la wallet con a como dueno y darle 5 XLM
//   2. W3: add_signer(b, 1) firmado por a, con la prueba de posesion de b
//   3. W5: set_threshold(2) firmado por a
//   4. lock firmado solo por a: tiene que fallar con #5 (InsufficientWeight)
//   5. lock firmado por a y b pasa; el agente libera
//   6. set_threshold(1) con a y b; remove_signer(b) con a; lock solo con b falla con #3 (UnknownSigner)
//
// Uso (desde labs/smart-wallet):
//   stellar contract build
//   node scripts/demo.mjs <ruta a @stellar/stellar-sdk>            demo en testnet
//   node scripts/demo.mjs <ruta a @stellar/stellar-sdk> --vector   vector compartido con src/test.rs, sin red
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
const WASM = 'target/wasm32v1-none/release/micopay_labs_smart_wallet.wasm';
const XLM1 = 10_000_000n;
const DOMAIN = Buffer.from('micopay-labs-wallet-v1');
const MODE_OWNER = 0;

const sha = (b) => createHash('sha256').update(b).digest();
const explorer = (h) => `https://stellar.expert/explorer/testnet/tx/${h}`;
const log = (...a) => console.log(...a);
const rustArr = (b) => `[${[...b].join(', ')}]`;

// Id de un firmante ed25519: sha256(0x00 ‖ pubkey).
const signerId = (pub) => sha(Buffer.concat([Buffer.from([0]), pub]));
// Mensaje que firma cada llave: sha256(DOMINIO ‖ XDR(ScVal de la wallet) ‖ modo ‖ payload).
const message = (wallet, mode, payload) =>
  sha(Buffer.concat([DOMAIN, new Address(wallet).toScVal().toXDR(), Buffer.from([mode]), payload]));

// Prueba de posesion de una llave nueva (W3): sha256(DOMINIO ‖ XDR(wallet) ‖ "add-signer" ‖ id).
const possession = (wallet, kp) =>
  kp.sign(sha(Buffer.concat([DOMAIN, new Address(wallet).toScVal().toXDR(), Buffer.from('add-signer'), signerId(kp.rawPublicKey())])));

// ---------- --vector: sin red ----------
if (process.argv.includes('--vector')) {
  const wallet = 'CBOGBTLM6PLRFCCAYI5W575J7M7IJNZLEI4N4OP6XHSKCC7J7SZH4XQB';
  const msg = message(wallet, MODE_OWNER, sha(Buffer.alloc(32, 1)));
  const id = signerId(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).rawPublicKey());
  log('msg', msg.toString('hex'));
  log(`const VECTOR_MSG: [u8; 32] = ${rustArr(msg)};`);
  log('id ', id.toString('hex'));
  log(`const VECTOR_ID: [u8; 32] = ${rustArr(id)};`);
  process.exit(0);
}

const server = new rpc.Server(RPC);
const txs = [];
const checks = [];
function check(step, ok, detail = '') {
  checks.push({ step, ok, detail });
  log(`   ${ok ? 'OK   ' : 'FALLO'} ${step}${detail ? ' · ' + detail : ''}`);
}

async function fund(kp) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}

// Una prueba Ed25519 como ScVal: Proof::Ed25519(Ed25519Proof { id, sig }).
const proofScVal = (id, sig) => xdr.ScVal.scvVec([
  xdr.ScVal.scvSymbol('Ed25519'),
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('id'), val: xdr.ScVal.scvBytes(id) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('sig'), val: xdr.ScVal.scvBytes(sig) }),
  ]),
]);

// Firma la autorizacion de la wallet con cada llave de `keys` (Vec<Proof>).
async function signForWallet(entry, keys) {
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
  const wallet = Address.fromScAddress(addr.address()).toString();
  const msg = message(wallet, MODE_OWNER, payload);
  addr.signature(xdr.ScVal.scvVec(keys.map((k) => proofScVal(signerId(k.rawPublicKey()), k.sign(msg)))));
  return entry;
}

// Errores de los eventos de diagnostico, como texto.
function diagErrors(events) {
  const out = [];
  for (const ev of events || []) {
    try {
      const body = ev.event().body().v0();
      const vals = [...body.topics(), body.data()];
      const parts = [];
      const walk = (v) => {
        if (v.switch().name === 'scvError') {
          const e = v.error();
          parts.push(e.switch().name === 'sceContract' ? `Error(Contract, #${e.contractCode()})` : `Error(${e.switch().name}, ${e.code().name})`);
        } else if (v.switch().name === 'scvVec' && v.vec()) v.vec().forEach(walk);
      };
      vals.forEach(walk);
      if (parts.length) out.push(parts.join(' '));
    } catch { /* evento sin v0 */ }
  }
  return out;
}

// Manda una transaccion. Si `keys` viene, firma las autorizaciones de la wallet con esas llaves.
async function send(label, sourceKp, op, keys) {
  let account = await server.getAccount(sourceKp.publicKey());
  const build = (o) => new TransactionBuilder(account, { fee: '1000000', networkPassphrase: PASS }).addOperation(o).setTimeout(60).build();
  let tx = build(op);
  if (keys) {
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error('simulacion: ' + sim.error);
    const auth = [];
    for (const e of sim.result.auth) auth.push(await signForWallet(e, keys));
    const fn = tx.operations[0].func;
    account = await server.getAccount(sourceKp.publicKey());
    tx = build(Operation.invokeHostFunction({ func: fn, auth }));
  }
  const sim2 = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim2)) {
    const err = new Error('simulacion: ' + sim2.error);
    err.diag = diagErrors(sim2.events);
    throw err;
  }
  const prepared = rpc.assembleTransaction(tx, sim2).build();
  prepared.sign(sourceKp);
  const res = await server.sendTransaction(prepared);
  if (res.status === 'ERROR') throw new Error('envio: ' + JSON.stringify(res.errorResult));
  const final = await server.pollTransaction(res.hash, { attempts: 30 });
  if (final.status !== 'SUCCESS') throw new Error(`tx ${res.hash} ${final.status}`);
  txs.push({ label, hash: res.hash });
  log(`   ${label}`, explorer(res.hash));
  return { hash: res.hash, value: final.returnValue ? scValToNative(final.returnValue) : undefined };
}

// Tiene que fallar con `code`. Devuelve el texto del error.
async function mustFail(step, code, sourceKp, op, keys) {
  try {
    const r = await send(step, sourceKp, op, keys);
    check(step, false, `paso y no debia (${r.hash})`);
    return null;
  } catch (e) {
    const text = String(e.message);
    const want = `Error(Contract, #${code})`;
    const inMsg = text.includes(want);
    const inDiag = (e.diag || []).some((d) => d.includes(want));
    const first = text.split('\n')[0];
    check(step, inMsg || inDiag, `${want} ${inMsg ? 'en el error' : inDiag ? 'en los eventos de diagnostico' : 'NO aparece'}`);
    log('     error:', first.slice(0, 300));
    for (const l of text.split('\n').filter((l) => l.includes('Contract, #')).slice(0, 3)) log('     |', l.trim().slice(0, 300));
    if (e.diag?.length) log('     diagnostico:', e.diag.join(' | '));
    return { text, diag: e.diag };
  }
}

async function readRaw(contractId, fn, ...args) {
  const kp = Keypair.random();
  const acc = new sdk.Account(kp.publicKey(), '0');
  const tx = new TransactionBuilder(acc, { fee: '100', networkPassphrase: PASS })
    .addOperation(new Contract(contractId).call(fn, ...args)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${fn}: ${sim.error}`);
  return sim.result.retval;
}
const read = async (...a) => scValToNative(await readRaw(...a));
// Ids (hex) de signers(); el Map tiene llaves Bytes, asi que se lee el ScVal crudo.
const signerIds = async (wallet) => (await readRaw(wallet, 'signers')).map().map((e) => Buffer.from(e.key().bytes()).toString('hex'));
const balance = async (a) => BigInt(await read(XLM, 'balance', new Address(a).toScVal()));
const fmt = (s) => (Number(s) / 1e7).toFixed(7);
const bytes = (b) => nativeToScVal(b, { type: 'bytes' });
const u32 = (n) => nativeToScVal(n, { type: 'u32' });

const lockOp = (seller, buyer, secretHash) =>
  new Contract(ESCROW).call('lock',
    new Address(seller).toScVal(), new Address(buyer).toScVal(),
    nativeToScVal(XLM1, { type: 'i128' }), nativeToScVal(XLM1 / 100n, { type: 'i128' }),
    bytes(secretHash), u32(30));
const releaseOp = (tradeId, secret) => new Contract(ESCROW).call('release', bytes(tradeId), bytes(secret));

async function main() {
  const net = await server.getNetwork();
  if (net.passphrase !== PASS) throw new Error('El RPC no es testnet: ' + net.passphrase);

  const relayer = Keypair.random();
  const agente = Keypair.random();
  const a = Keypair.random(); // telefono
  const b = Keypair.random(); // respaldo
  const idA = signerId(a.rawPublicKey());
  const idB = signerId(b.rawPublicKey());
  await fund(relayer); await fund(agente);
  log('relayer', relayer.publicKey());
  log('agente ', agente.publicKey());
  log('id a   ', idA.toString('hex'));
  log('id b   ', idB.toString('hex'));

  // 1. Subir el WASM y crear la wallet con a como dueno; darle 5 XLM.
  log('\n1. crear la wallet');
  const wasm = readFileSync(WASM);
  const wasmHash = sha(wasm);
  await send('upload wasm', relayer, Operation.uploadContractWasm({ wasm }));
  const created = await send('crear wallet', relayer, Operation.createCustomContract({
    address: new Address(relayer.publicKey()),
    wasmHash,
    salt: randomBytes(32),
    constructorArgs: [bytes(a.rawPublicKey())],
  }));
  const wallet = created.value;
  log('   wallet', wallet);
  await send('fondeo 5 XLM', relayer, new Contract(XLM).call('transfer',
    new Address(relayer.publicKey()).toScVal(), new Address(wallet).toScVal(), nativeToScVal(5n * XLM1, { type: 'i128' })));
  const saldo0 = await balance(wallet);
  check('1. wallet con 5 XLM', saldo0 === 5n * XLM1, fmt(saldo0));

  // 2. W3: add_signer(b, 1) firmado solo por a (umbral 1).
  log('\n2. W3 add_signer(b, 1) con a');
  const add = await send('add_signer b', relayer, new Contract(wallet).call('add_signer', bytes(b.rawPublicKey()), u32(1), bytes(possession(wallet, b))), [a]);
  const s2 = await signerIds(wallet);
  check('2. signers() tiene 2 (a y b)', s2.length === 2 && s2.includes(idA.toString('hex')) && s2.includes(idB.toString('hex')), `${s2.length} firmantes`);
  check('2. add_signer devuelve id de b', Buffer.from(add.value).equals(idB));

  // 3. W5: set_threshold(2) firmado solo por a.
  log('\n3. W5 set_threshold(2) con a');
  await send('set_threshold 2', relayer, new Contract(wallet).call('set_threshold', u32(2)), [a]);
  const t3 = await read(wallet, 'threshold');
  check('3. threshold() == 2', t3 === 2, `threshold ${t3}`);

  // 4. lock firmado solo por a: tiene que fallar con InsufficientWeight.
  log('\n4. lock solo con a (umbral 2)');
  const err4 = await mustFail('4. lock solo con a falla con #5', 5, relayer, lockOp(wallet, agente.publicKey(), sha(randomBytes(32))), [a]);

  // 5. lock con a y b pasa; el agente libera.
  log('\n5. lock con a y b; release del agente');
  const antes5 = await balance(wallet);
  const secret = randomBytes(32);
  const lock = await send('lock a+b', relayer, lockOp(wallet, agente.publicKey(), sha(secret)), [a, b]);
  const tradeId = Buffer.from(lock.value);
  await send('release agente', agente, releaseOp(tradeId, secret));
  const trade = await read(ESCROW, 'get_trade', bytes(tradeId));
  const status = JSON.stringify(trade.status);
  check('5. trade Released', status.includes('Released'), status);
  const baja = antes5 - (await balance(wallet));
  check('5. la wallet bajo 1.01 XLM', baja === XLM1 + XLM1 / 100n, fmt(baja));

  // 6. W5 de vuelta a 1 (a y b); W4 quitar b (a); lock solo con b falla con UnknownSigner.
  log('\n6. W5 set_threshold(1) con a y b; W4 remove_signer(b) con a');
  await send('set_threshold 1', relayer, new Contract(wallet).call('set_threshold', u32(1)), [a, b]);
  const t6 = await read(wallet, 'threshold');
  check('6. threshold() == 1', t6 === 1, `threshold ${t6}`);
  await send('remove_signer b', relayer, new Contract(wallet).call('remove_signer', bytes(idB)), [a]);
  const s6 = await signerIds(wallet);
  check('6. signers() tiene 1 (solo a)', s6.length === 1 && s6[0] === idA.toString('hex'), `${s6.length} firmante(s)`);
  const err6 = await mustFail('6. lock solo con b falla con #3', 3, relayer, lockOp(wallet, agente.publicKey(), sha(randomBytes(32))), [b]);

  // 7. Resumen.
  log('\n===== resumen =====');
  log('wallet    ', wallet);
  log('wasm hash ', wasmHash.toString('hex'));
  log('saldo final', fmt(await balance(wallet)), 'XLM');
  log('\ntransacciones:');
  for (const t of txs) log(`  ${t.label.padEnd(16)} ${t.hash}  ${explorer(t.hash)}`);
  log('\nerror paso 4:', err4 ? err4.text.split('\n')[0] : '-');
  log('error paso 6:', err6 ? err6.text.split('\n')[0] : '-');
  log('\nchequeos:');
  for (const c of checks) log(`  ${c.ok ? 'OK   ' : 'FALLO'} ${c.step}`);
  const fallos = checks.filter((c) => !c.ok).length;
  log(fallos ? `\n${fallos} chequeo(s) fallaron` : '\ntodo OK');
  if (fallos) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
