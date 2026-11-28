// Demo en testnet de la fabrica (F1–F3), las sesiones (W20) y el upgrade con espera (W21) de la
// smart wallet de labs.
//
// Cuentas nuevas cada vez (friendbot), sin secretos guardados:
//   relayer: G… que manda y paga todas las transacciones de la wallet
//   agente:  G… normal (como un agente de hoy), unico comprador de la sesion
//   a:       llave ed25519 del dueno (telefono); no es cuenta de Stellar
//   s:       llave ed25519 de la sesion; no es cuenta de Stellar
//
// Pasos:
//   1. F1–F3: subir el WASM de la wallet y desplegar la fabrica con ese hash; address_of({owner: a});
//      mandar 10 XLM a esa C… antes de que exista; create_account por el relayer devuelve la misma
//      direccion y el saldo sigue en 10 XLM
//   2. W18 add_escrow(ESCROW, XLM, 100) firmado por a (prueba que a controla la wallet); esperar
//      DELAY_LEDGERS = 120 ledgers; apply_escrow por el relayer
//   3. W20 add_session(s, ESCROW, [agente], 2 XLM, 3 XLM, 60, ultimo + 2000) firmado por a; session(id)
//   4. lock de 1 XLM + 0.01 hacia el agente firmado solo por s (Proof::Session); el agente libera;
//      session(id).spent = 1.01 XLM
//   5. mal uso de la sesion:
//      5a. lock hacia otro comprador falla con #43 (SessionDenied)
//      5b. lock de 2.5 XLM falla con #44 (SessionLimit)
//      5c. transfer directo de la wallet al agente firmado por s falla con #43
//   6. revoke_session(id) firmado por a; lock con s falla con #41 (UnknownSession)
//   7. W21: subir otra vez el mismo WASM; schedule_upgrade(hash) firmado por a; apply_upgrade al
//      instante falla con #17 (NotReady); esperar UPGRADE_DELAY = 240 ledgers; apply_upgrade pasa;
//      signers() y escrow() sin cambios; transfer de 0.5 XLM firmado por a pasa
//
// Uso (desde labs/smart-wallet):
//   node scripts/demo-sesiones.mjs <ruta a @stellar/stellar-sdk>
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sdk = require(process.argv[2]);
const { Keypair, rpc, Networks, TransactionBuilder, Operation, Contract, Address, xdr, nativeToScVal, scValToNative, hash, Asset } = sdk;

const RPC = 'https://soroban-testnet.stellar.org';
const PASS = Networks.TESTNET;
// Escrow real de XLM en testnet (micopay/contracts/TESTNET.md), sin cambios.
const ESCROW = 'CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4';
const XLM = Asset.native().contractId(PASS);
const RELEASE = fileURLToPath(new URL('../target/wasm32v1-none/release/', import.meta.url));
const WASM = RELEASE + 'micopay_labs_smart_wallet.wasm';
const WASM_FACTORY = RELEASE + 'micopay_labs_smart_wallet_factory.wasm';
const HASH_WALLET_ESPERADO = 'ee3f6a14';
const HASH_FACTORY_ESPERADO = '5a2ec709';
const XLM1 = 10_000_000n;
const DOMAIN = Buffer.from('micopay-labs-wallet-v1');
const MODE_OWNER = 0;
const MODE_SESSION = 1;
const DELAY_LEDGERS = 120;
const UPGRADE_DELAY = 240;

const sha = (b) => createHash('sha256').update(b).digest();
const explorer = (h) => `https://stellar.expert/explorer/testnet/tx/${h}`;
const log = (...a) => console.log(...a);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Id de un firmante ed25519: sha256(0x00 ‖ pubkey).
const signerId = (pub) => sha(Buffer.concat([Buffer.from([0]), pub]));
// Id de una sesion: sha256(0x02 ‖ pubkey).
const sessionId = (pub) => sha(Buffer.concat([Buffer.from([2]), pub]));
// Mensaje que firma cada llave: sha256(DOMINIO ‖ XDR(ScVal de la wallet) ‖ modo ‖ payload).
const message = (wallet, mode, payload) =>
  sha(Buffer.concat([DOMAIN, new Address(wallet).toScVal().toXDR(), Buffer.from([mode]), payload]));

const server = new rpc.Server(RPC);
const txs = [];
const checks = [];
function check(step, ok, detail = '') {
  checks.push({ step, ok, detail });
  log(`   ${ok ? 'OK   ' : 'FALLO'} ${step}${detail ? ' · ' + detail : ''}`);
}

// Reintenta una lectura del RPC si se corta (ECONNRESET, 5xx, etc.).
async function retry(what, fn, tries = 8) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      log(`   ${what} fallo (${e.code || e.message}); reintento ${i}`);
      await pausa(3000 * i);
    }
  }
}

async function fund(kp) {
  await retry('friendbot', async () => {
    const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    if (!r.ok) throw new Error(`friendbot ${r.status}`);
  });
}

const proofMap = (id, sig) => xdr.ScVal.scvMap([
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('id'), val: xdr.ScVal.scvBytes(id) }),
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('sig'), val: xdr.ScVal.scvBytes(sig) }),
]);
// Proof::Ed25519(Ed25519Proof { id, sig }) y Proof::Session(SessionProof { id, sig }) como ScVal.
const ownerProof = (id, sig) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Ed25519'), proofMap(id, sig)]);
const sessionProof = (id, sig) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Session'), proofMap(id, sig)]);

// Firma la autorizacion de la wallet. `signer` es un arreglo de llaves del dueno (modo 0) o
// { session: kp } para una sola Proof::Session (modo 1).
async function signForWallet(entry, signer) {
  const creds = entry.credentials();
  if (creds.switch().name !== 'sorobanCredentialsAddress') return entry;
  const { sequence } = await retry('getLatestLedger', () => server.getLatestLedger());
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
  if (signer.session) {
    const k = signer.session;
    const msg = message(wallet, MODE_SESSION, payload);
    addr.signature(xdr.ScVal.scvVec([sessionProof(sessionId(k.rawPublicKey()), k.sign(msg))]));
  } else {
    const msg = message(wallet, MODE_OWNER, payload);
    addr.signature(xdr.ScVal.scvVec(signer.map((k) => ownerProof(signerId(k.rawPublicKey()), k.sign(msg)))));
  }
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

// Espera el resultado de una transaccion; un corte del RPC no tira la demo.
async function poll(txHash) {
  for (let i = 0; i < 60; i++) {
    let r;
    try {
      r = await server.getTransaction(txHash);
    } catch (e) {
      log(`   getTransaction fallo (${e.code || e.message}); reintento`);
      await pausa(3000);
      continue;
    }
    if (r.status !== 'NOT_FOUND') return r;
    await pausa(2000);
  }
  throw new Error(`tx ${txHash} sin resultado`);
}

// Manda una transaccion. Si `signer` viene, firma las autorizaciones de la wallet (ver signForWallet).
async function send(label, sourceKp, op, signer) {
  let account = await retry('getAccount', () => server.getAccount(sourceKp.publicKey()));
  const build = (o) => new TransactionBuilder(account, { fee: '1000000', networkPassphrase: PASS }).addOperation(o).setTimeout(60).build();
  let tx = build(op);
  if (signer) {
    const sim = await retry('simulate', () => server.simulateTransaction(tx));
    if (rpc.Api.isSimulationError(sim)) {
      const err = new Error('simulacion: ' + sim.error);
      err.diag = diagErrors(sim.events);
      throw err;
    }
    const auth = [];
    for (const e of sim.result.auth) auth.push(await signForWallet(e, signer));
    const fn = tx.operations[0].func;
    account = await retry('getAccount', () => server.getAccount(sourceKp.publicKey()));
    tx = build(Operation.invokeHostFunction({ func: fn, auth }));
  }
  // Re-simulacion con las autorizaciones firmadas: aqui corre __check_auth.
  const sim2 = await retry('simulate', () => server.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim2)) {
    const err = new Error('simulacion: ' + sim2.error);
    err.diag = diagErrors(sim2.events);
    throw err;
  }
  const prepared = rpc.assembleTransaction(tx, sim2).build();
  prepared.sign(sourceKp);
  const res = await server.sendTransaction(prepared);
  if (res.status === 'ERROR') throw new Error('envio: ' + JSON.stringify(res.errorResult));
  const final = await poll(res.hash);
  if (final.status !== 'SUCCESS') throw new Error(`tx ${res.hash} ${final.status}`);
  txs.push({ label, hash: res.hash });
  log(`   ${label}`, explorer(res.hash));
  return { hash: res.hash, ledger: final.ledger, value: final.returnValue ? scValToNative(final.returnValue) : undefined };
}

// Tiene que fallar con `code`. Devuelve el texto del error.
const errores = [];
async function mustFail(step, code, sourceKp, op, signer) {
  try {
    const r = await send(step, sourceKp, op, signer);
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
    errores.push({ step, text: first, diag: e.diag });
    return { text, diag: e.diag };
  }
}

async function readRaw(contractId, fn, ...args) {
  const kp = Keypair.random();
  const acc = new sdk.Account(kp.publicKey(), '0');
  const tx = new TransactionBuilder(acc, { fee: '100', networkPassphrase: PASS })
    .addOperation(new Contract(contractId).call(fn, ...args)).setTimeout(30).build();
  const sim = await retry(`leer ${fn}`, () => server.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${fn}: ${sim.error}`);
  return sim.result.retval;
}
const read = async (...a) => scValToNative(await readRaw(...a));
// Ids (hex) de signers(); el Map tiene llaves Bytes, asi que se lee el ScVal crudo.
const signerIds = async (wallet) => (await readRaw(wallet, 'signers')).map().map((e) => Buffer.from(e.key().bytes()).toString('hex')).sort();
const balance = async (a) => BigInt(await read(XLM, 'balance', new Address(a).toScVal()));
const fmt = (s) => (Number(s) / 1e7).toFixed(7);
const bytes = (b) => nativeToScVal(b, { type: 'bytes' });
const u32 = (n) => nativeToScVal(n, { type: 'u32' });
const i128 = (n) => nativeToScVal(n, { type: 'i128' });
// Config { owner } de la fabrica.
const configScVal = (pub) => xdr.ScVal.scvMap([
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('owner'), val: xdr.ScVal.scvBytes(pub) }),
]);

const lockOp = (seller, buyer, secretHash, amount = XLM1, fee = XLM1 / 100n) =>
  new Contract(ESCROW).call('lock',
    new Address(seller).toScVal(), new Address(buyer).toScVal(),
    i128(amount), i128(fee),
    bytes(secretHash), u32(30));
const releaseOp = (tradeId, secret) => new Contract(ESCROW).call('release', bytes(tradeId), bytes(secret));

// Espera hasta el ledger `target`; reintenta si el RPC se corta.
async function waitLedger(target) {
  for (;;) {
    let sequence;
    try {
      ({ sequence } = await server.getLatestLedger());
    } catch (e) {
      // Un corte del RPC durante la espera no debe tirar la demo: se reintenta.
      log(`   getLatestLedger fallo (${e.code || e.message}); reintento`);
      await pausa(5000);
      continue;
    }
    if (sequence >= target) { log(`   ledger ${sequence}, listo`); return sequence; }
    log(`   ledger ${sequence}, faltan ${target - sequence}`);
    await pausa(Math.min(30, (target - sequence) * 5) * 1000);
  }
}

async function main() {
  const net = await retry('getNetwork', () => server.getNetwork());
  if (net.passphrase !== PASS) throw new Error('El RPC no es testnet: ' + net.passphrase);

  const wasm = readFileSync(WASM);
  const wasmHash = sha(wasm);
  const wasmF = readFileSync(WASM_FACTORY);
  const wasmHashF = sha(wasmF);
  log('hash wallet ', wasmHash.toString('hex'));
  log('hash fabrica', wasmHashF.toString('hex'));
  check('0. hash del WASM de la wallet empieza con ' + HASH_WALLET_ESPERADO, wasmHash.toString('hex').startsWith(HASH_WALLET_ESPERADO), wasmHash.toString('hex'));
  check('0. hash del WASM de la fabrica empieza con ' + HASH_FACTORY_ESPERADO, wasmHashF.toString('hex').startsWith(HASH_FACTORY_ESPERADO), wasmHashF.toString('hex'));

  const relayer = Keypair.random();
  const agente = Keypair.random();
  const a = Keypair.random(); // dueno (telefono)
  const s = Keypair.random(); // llave de sesion
  const idA = signerId(a.rawPublicKey());
  const idS = sessionId(s.rawPublicKey());
  await fund(relayer); await fund(agente);
  log('relayer   ', relayer.publicKey());
  log('agente    ', agente.publicKey());
  log('id a      ', idA.toString('hex'));
  log('id sesion ', idS.toString('hex'));

  // 1. F1–F3: fabrica, direccion prevista, prefondeo y creacion.
  log('\n1. F1–F3 fabrica');
  await send('upload wasm wallet', relayer, Operation.uploadContractWasm({ wasm }));
  await send('upload wasm fabrica', relayer, Operation.uploadContractWasm({ wasm: wasmF }));
  const fab = await send('crear fabrica', relayer, Operation.createCustomContract({
    address: new Address(relayer.publicKey()),
    wasmHash: wasmHashF,
    salt: randomBytes(32),
    constructorArgs: [bytes(wasmHash)],
  }));
  const factory = fab.value;
  log('   fabrica', factory);
  const fh = Buffer.from(await read(factory, 'wasm_hash'));
  check('1. wasm_hash() de la fabrica = hash de la wallet', fh.equals(wasmHash), fh.toString('hex'));

  const prevista = await read(factory, 'address_of', configScVal(a.rawPublicKey()));
  log('   address_of({owner: a})', prevista);
  await send('prefondeo 10 XLM', relayer, new Contract(XLM).call('transfer',
    new Address(relayer.publicKey()).toScVal(), new Address(prevista).toScVal(), i128(10n * XLM1)));
  const saldoPre = await balance(prevista);
  check('1. la C… prevista tiene 10 XLM antes de existir', saldoPre === 10n * XLM1, fmt(saldoPre));

  const creada = await send('create_account', relayer, new Contract(factory).call('create_account', configScVal(a.rawPublicKey())));
  const wallet = creada.value;
  log('   wallet', wallet);
  check('1. create_account devuelve la direccion prevista', wallet === prevista, wallet);
  const saldo1 = await balance(wallet);
  check('1. el saldo sigue en 10 XLM', saldo1 === 10n * XLM1, fmt(saldo1));
  const firmantes0 = await signerIds(wallet);
  check('1. signers() = solo a', firmantes0.length === 1 && firmantes0[0] === idA.toString('hex'), `${firmantes0.length} firmante(s)`);

  // 2. W18: registrar el escrow con la firma de a (prueba que a controla la wallet).
  log('\n2. W18 add_escrow(ESCROW, XLM, 100) con a');
  const addEsc = await send('add_escrow', relayer, new Contract(wallet).call('add_escrow',
    new Address(ESCROW).toScVal(), new Address(XLM).toScVal(), u32(100)), [a]);
  check('2. a firma add_escrow: a controla la wallet', true, addEsc.hash);
  const escrowReady = addEsc.ledger + DELAY_LEDGERS;
  log(`   add_escrow en el ledger ${addEsc.ledger}; se puede aplicar desde el ${escrowReady}`);
  await waitLedger(escrowReady);
  await send('apply_escrow', relayer, new Contract(wallet).call('apply_escrow', new Address(ESCROW).toScVal()));
  const rule = await read(wallet, 'escrow', new Address(ESCROW).toScVal());
  check('2. escrow() = XLM, fee_bps_max 100', rule?.token === XLM && rule?.fee_bps_max === 100, JSON.stringify(rule));

  // 3. W20: abrir la sesion.
  log('\n3. W20 add_session(s, ESCROW, [agente], 2 XLM, 3 XLM, 60, ultimo + 2000) con a');
  const { sequence: ahora } = await retry('getLatestLedger', () => server.getLatestLedger());
  const expires = ahora + 2000;
  const addS = await send('add_session', relayer, new Contract(wallet).call('add_session',
    bytes(s.rawPublicKey()), new Address(ESCROW).toScVal(),
    xdr.ScVal.scvVec([new Address(agente.publicKey()).toScVal()]),
    i128(2n * XLM1), i128(3n * XLM1), u32(60), u32(expires)), [a]);
  check('3. add_session devuelve sha256(0x02 ‖ s)', Buffer.from(addS.value).equals(idS), Buffer.from(addS.value).toString('hex'));
  const ses3 = await read(wallet, 'session', bytes(idS));
  log('   session(id)', JSON.stringify(ses3, (k, v) => (typeof v === 'bigint' ? v.toString() : v?.type === 'Buffer' ? Buffer.from(v.data).toString('hex') : v)));
  check('3. session(id) con los topes pedidos',
    ses3 && Buffer.from(ses3.key).equals(s.rawPublicKey()) && ses3.escrow === ESCROW &&
    ses3.buyers?.length === 1 && ses3.buyers[0] === agente.publicKey() &&
    ses3.max_per_lock === 2n * XLM1 && ses3.max_total === 3n * XLM1 && ses3.spent === 0n &&
    ses3.max_timeout === 60 && ses3.expires === expires,
    ses3 ? `spent ${fmt(ses3.spent)}, expira ${ses3.expires}` : 'None');

  // 4. lock firmado solo por la sesion; el agente libera.
  log('\n4. lock de 1 XLM + 0.01 hacia el agente, firmado solo por s');
  const antes4 = await balance(wallet);
  const secret = randomBytes(32);
  const lock4 = await send('lock sesion', relayer, lockOp(wallet, agente.publicKey(), sha(secret)), { session: s });
  const tradeId = Buffer.from(lock4.value);
  await send('release agente', agente, releaseOp(tradeId, secret));
  const status4 = JSON.stringify((await read(ESCROW, 'get_trade', bytes(tradeId))).status);
  check('4. trade Released', status4.includes('Released'), status4);
  const baja4 = antes4 - (await balance(wallet));
  check('4. la wallet bajo 1.01 XLM', baja4 === XLM1 + XLM1 / 100n, fmt(baja4));
  const ses4 = await read(wallet, 'session', bytes(idS));
  check('4. session(id).spent == 1.01 XLM', ses4?.spent === XLM1 + XLM1 / 100n, ses4 ? fmt(ses4.spent) : 'None');

  // 5. Mal uso de la sesion.
  log('\n5a. lock hacia otro comprador, firmado por s');
  await mustFail('5a. lock a otro comprador falla con #43', 43, relayer, lockOp(wallet, Keypair.random().publicKey(), sha(randomBytes(32))), { session: s });
  log('\n5b. lock de 2.5 XLM (tope 2 por lock), firmado por s');
  await mustFail('5b. lock de 2.5 XLM falla con #44', 44, relayer, lockOp(wallet, agente.publicKey(), sha(randomBytes(32)), 25n * XLM1 / 10n), { session: s });
  log('\n5c. transfer directo de 0.5 XLM al agente, firmado por s');
  const xferOp = (to, amt) => new Contract(XLM).call('transfer', new Address(wallet).toScVal(), new Address(to).toScVal(), i128(amt));
  await mustFail('5c. transfer firmado por la sesion falla con #43', 43, relayer, xferOp(agente.publicKey(), XLM1 / 2n), { session: s });
  const ses5 = await read(wallet, 'session', bytes(idS));
  check('5. session(id).spent sigue en 1.01 XLM', ses5?.spent === XLM1 + XLM1 / 100n, ses5 ? fmt(ses5.spent) : 'None');

  // 6. Revocar.
  log('\n6. revoke_session(id) con a; lock con s');
  await send('revoke_session', relayer, new Contract(wallet).call('revoke_session', bytes(idS)), [a]);
  const ses6 = await read(wallet, 'session', bytes(idS));
  check('6. session(id) = None', ses6 == null, String(ses6));
  await mustFail('6. lock con la sesion revocada falla con #41', 41, relayer, lockOp(wallet, agente.publicKey(), sha(randomBytes(32))), { session: s });

  // 7. W21: upgrade con espera.
  log('\n7. W21 upgrade al mismo WASM');
  const firmantesAntes = await signerIds(wallet);
  const escrowAntes = JSON.stringify(await read(wallet, 'escrow', new Address(ESCROW).toScVal()));
  await send('upload wasm otra vez', relayer, Operation.uploadContractWasm({ wasm }));
  const sch = await send('schedule_upgrade', relayer, new Contract(wallet).call('schedule_upgrade', bytes(wasmHash)), [a]);
  const pend = await read(wallet, 'pending_upgrade');
  const upgradeReady = sch.ledger + UPGRADE_DELAY;
  check('7. pending_upgrade() = hash, listo en ledger + 240',
    pend && Buffer.from(pend.hash).equals(wasmHash) && pend.ready_ledger === upgradeReady,
    pend ? `ready_ledger ${pend.ready_ledger}` : 'None');
  await mustFail('7. apply_upgrade al instante falla con #17', 17, relayer, new Contract(wallet).call('apply_upgrade', bytes(wasmHash)));
  log(`   schedule_upgrade en el ledger ${sch.ledger}; se puede aplicar desde el ${upgradeReady}`);
  await waitLedger(upgradeReady);
  await send('apply_upgrade', relayer, new Contract(wallet).call('apply_upgrade', bytes(wasmHash)));
  check('7. apply_upgrade pasa despues de 240 ledgers', true);
  const pend7 = await read(wallet, 'pending_upgrade');
  check('7. pending_upgrade() = None', pend7 == null, String(pend7));
  const firmantesDespues = await signerIds(wallet);
  check('7. signers() sin cambios', JSON.stringify(firmantesDespues) === JSON.stringify(firmantesAntes), `${firmantesDespues.length} firmante(s)`);
  const escrowDespues = JSON.stringify(await read(wallet, 'escrow', new Address(ESCROW).toScVal()));
  check('7. escrow(ESCROW) sin cambios', escrowDespues === escrowAntes, escrowDespues);
  const antes7 = await balance(agente.publicKey());
  await send('transfer 0.5 con a', relayer, xferOp(agente.publicKey(), XLM1 / 2n), [a]);
  const sube7 = (await balance(agente.publicKey())) - antes7;
  check('7. transfer de 0.5 XLM firmado por a pasa', sube7 === XLM1 / 2n, `agente +${fmt(sube7)}`);

  // Resumen.
  log('\n===== resumen =====');
  log('fabrica        ', factory);
  log('wallet         ', wallet);
  log('hash wallet    ', wasmHash.toString('hex'));
  log('hash fabrica   ', wasmHashF.toString('hex'));
  log('saldo final    ', fmt(await balance(wallet)), 'XLM');
  log('\ntransacciones:');
  for (const t of txs) log(`  ${t.label.padEnd(20)} ${t.hash}  ${explorer(t.hash)}`);
  log('\nerrores esperados:');
  for (const e of errores) {
    log(`  ${e.step}: ${e.text.slice(0, 200)}`);
    if (e.diag?.length) log(`    diagnostico: ${e.diag.join(' | ')}`);
  }
  log('\nchequeos:');
  for (const c of checks) log(`  ${c.ok ? 'OK   ' : 'FALLO'} ${c.step}`);
  const fallos = checks.filter((c) => !c.ok).length;
  log(fallos ? `\n${fallos} chequeo(s) fallaron` : '\ntodo OK');
  if (fallos) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
