// Demo en testnet de las 10 funciones nuevas de la fase 2 de la smart wallet de labs:
// cancel_limit, cancel_escrow, cancel_guardian_removal, cancel_unfreeze, set_signer_weight,
// rotate_signer, revoke_all_sessions, reduce_session, add_session_buyer y remove_session_buyer.
// Cada una sale con su propio hash. Lo que no depende entre si va en paralelo, cada cadena con su
// propio relayer (numeros de secuencia separados), y la espera de DELAY_LEDGERS corre mientras se
// prueban los limites y los firmantes.
//
// Cuentas nuevas cada vez (friendbot), sin secretos guardados:
//   r0..r3:  relayers; cuentas G… que mandan y pagan las transacciones de la wallet
//   g1, g2:  guardianes; cuentas G… normales. Cada uno cumple su require_auth como cuenta fuente
//   a:       llave ed25519 del dueno (telefono); no es cuenta de Stellar
//   b, c:    llaves ed25519 nuevas: b se agrega y luego se rota a c
//   s:       llave ed25519 de la sesion; no es cuenta de Stellar
//
// Pasos:
//   1. subir el WASM, crear la wallet con a como dueno y darle 5 XLM; en paralelo, con a:
//      add_guardian(g1), add_guardian(g2), add_escrow(ESCROW, XLM, 100) (corre la espera)
//   2. mientras corre la espera, en paralelo:
//      a) con a: set_limit(XLM, 10) aplica ya; set_limit(XLM, 20) queda pendiente;
//         cancel_limit(XLM) ✓ (limit() sigue en 10)
//      b) con a: set_signer_weight(id_a, 2) ✓; add_signer(b, 1); rotate_signer(id_b, c) ✓
//   3. esperar DELAY_LEDGERS = 120 una sola vez; el relayer: apply_guardian_add g1 y
//      apply_escrow en paralelo, luego apply_guardian_add g2 (para que el orden sea [g1, g2])
//   4-6. en paralelo, con a:
//      sesiones: add_session(s, ESCROW, [g1], 1 XLM, 2 XLM, 60, ultimo + 2000);
//                add_session_buyer(id, g2) ✓; remove_session_buyer(id, g2) ✓;
//                reduce_session(id, 0.5 XLM, 1 XLM, 30, ultimo + 1500) ✓; revoke_all_sessions ✓
//      escrow:   add_escrow(ESCROW, XLM, 50) (cambio de regla pendiente); cancel_escrow ✓
//      guardian: remove_guardian(g2); cancel_guardian_removal(g2) ✓
//   7. g1 solo: freeze([g1]); con a: request_unfreeze; g2: cancel_unfreeze(g2) ✓;
//      la wallet queda congelada y sin solicitud de descongelar (unfreeze falla con #16)
//
// Uso (desde labs/smart-wallet; el WASM ya compilado):
//   node scripts/demo-fase2.mjs <ruta a @stellar/stellar-sdk> [ruta del log]
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sdk = require(process.argv[2]);
const { Keypair, rpc, Networks, TransactionBuilder, Operation, Contract, Address, xdr, nativeToScVal, scValToNative, hash, Asset, SorobanDataBuilder } = sdk;

const RPC = 'https://soroban-testnet.stellar.org';
const PASS = Networks.TESTNET;
// Escrow real de XLM en testnet (micopay/contracts/TESTNET.md), sin cambios.
const ESCROW = 'CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4';
const XLM = Asset.native().contractId(PASS);
const WASM = fileURLToPath(new URL('../target/wasm32v1-none/release/micopay_labs_smart_wallet.wasm', import.meta.url));
const HASH_WALLET_ESPERADO = '5e93f00d496fc11a225bb9741273df10fec7e4673a48be587a438036db46cde6';
const LOG = process.argv[3] || 'C:\\Users\\eric\\AppData\\Local\\Temp\\claude\\C--Users-eric\\b37d6a25-1cfa-4ba5-a24d-726388900ad4\\scratchpad\\fase2.log';
const XLM1 = 10_000_000n;
const DOMAIN = Buffer.from('micopay-labs-wallet-v1');
const MODE_OWNER = 0;
const DELAY_LEDGERS = 120;

const sha = (b) => createHash('sha256').update(b).digest();
const explorer = (h) => `https://stellar.expert/explorer/testnet/tx/${h}`;
writeFileSync(LOG, '');
const log = (...a) => {
  console.log(...a);
  appendFileSync(LOG, a.map(String).join(' ') + '\n');
};
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (b) => Buffer.from(b).toString('hex');

// Id de un firmante ed25519: sha256(0x00 ‖ pubkey).
const signerId = (pub) => sha(Buffer.concat([Buffer.from([0]), pub]));
// Id de una sesion: sha256(0x02 ‖ pubkey).
const sessionId = (pub) => sha(Buffer.concat([Buffer.from([2]), pub]));
// Mensaje que firma cada llave: sha256(DOMINIO ‖ XDR(ScVal de la wallet) ‖ modo ‖ payload).
const message = (wallet, mode, payload) =>
  sha(Buffer.concat([DOMAIN, new Address(wallet).toScVal().toXDR(), Buffer.from([mode]), payload]));
// Prueba de posesion de una llave nueva: sha256(DOMINIO ‖ XDR(wallet) ‖ "add-signer" ‖ id).
// La misma que piden add_signer y rotate_signer para la llave nueva.
const possession = (wallet, kp) =>
  kp.sign(sha(Buffer.concat([DOMAIN, new Address(wallet).toScVal().toXDR(), Buffer.from('add-signer'), signerId(kp.rawPublicKey())])));

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

const latestLedger = async () => (await retry('getLatestLedger', () => server.getLatestLedger())).sequence;

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
  const until = (await latestLedger()) + 100;
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

// Firma una autorizacion de la wallet (C…) con `keys`. La de la cuenta fuente no necesita nada.
async function signEntry(entry, keys) {
  const creds = entry.credentials();
  if (creds.switch().name !== 'sorobanCredentialsAddress') return entry;
  const who = Address.fromScAddress(creds.address().address()).toString();
  if (who.startsWith('C') && keys) return signForWallet(entry, keys);
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

// Holgura de recursos para las transacciones que corren en paralelo: cada una se simula sobre el
// estado de antes, pero se aplica despues de las otras, con la instancia de la wallet un poco mas
// grande. Sin esto la segunda del ledger podria pasarse de los bytes simulados.
function holgura(sim) {
  const sd = sim.transactionData.build();
  const r = sd.resources();
  return new SorobanDataBuilder(sd)
    .setResources(Math.ceil(r.instructions() * 1.2), r.diskReadBytes() + 2048, r.writeBytes() + 2048)
    .setResourceFee(sd.resourceFee().toBigInt() + 1_000_000n)
    .build();
}

// Manda una transaccion. Si `keys` viene, firma las autorizaciones de la wallet con esas llaves.
// `fn` es el nombre de la funcion para la tabla del resumen.
async function send(label, fn, sourceKp, op, keys, { pad = true } = {}) {
  let account = await retry('getAccount', () => server.getAccount(sourceKp.publicKey()));
  const build = (o) => new TransactionBuilder(account, { fee: '1000000', networkPassphrase: PASS }).addOperation(o).setTimeout(60).build();
  let tx = build(op);
  if (keys) {
    const sim = await retry('simulate', () => server.simulateTransaction(tx));
    if (rpc.Api.isSimulationError(sim)) {
      const err = new Error(`${label}: simulacion: ` + sim.error);
      err.diag = diagErrors(sim.events);
      throw err;
    }
    const auth = [];
    for (const e of sim.result.auth) auth.push(await signEntry(e, keys));
    const f = tx.operations[0].func;
    account = await retry('getAccount', () => server.getAccount(sourceKp.publicKey()));
    tx = build(Operation.invokeHostFunction({ func: f, auth }));
  }
  // Re-simulacion con las autorizaciones firmadas: aqui corre __check_auth.
  const sim2 = await retry('simulate', () => server.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim2)) {
    const err = new Error(`${label}: simulacion: ` + sim2.error);
    err.diag = diagErrors(sim2.events);
    throw err;
  }
  const builder = rpc.assembleTransaction(tx, sim2);
  if (pad) builder.setSorobanData(holgura(sim2));
  const prepared = builder.build();
  prepared.sign(sourceKp);
  const res = await server.sendTransaction(prepared);
  if (res.status === 'ERROR') throw new Error(`${label}: envio: ` + JSON.stringify(res.errorResult));
  const final = await poll(res.hash);
  if (final.status !== 'SUCCESS') {
    const err = new Error(`${label}: tx ${res.hash} ${final.status}`);
    try { err.diag = diagErrors(final.diagnosticEventsXdr); } catch { /* sin eventos */ }
    throw err;
  }
  txs.push({ label, fn, hash: res.hash, ledger: final.ledger });
  log(`   ${label}`, explorer(res.hash));
  return { hash: res.hash, ledger: final.ledger, value: final.returnValue ? scValToNative(final.returnValue) : undefined };
}

async function simulateRead(contractId, fn, ...args) {
  const kp = Keypair.random();
  const acc = new sdk.Account(kp.publicKey(), '0');
  const tx = new TransactionBuilder(acc, { fee: '100', networkPassphrase: PASS })
    .addOperation(new Contract(contractId).call(fn, ...args)).setTimeout(30).build();
  return retry(`leer ${fn}`, () => server.simulateTransaction(tx));
}
async function readRaw(contractId, fn, ...args) {
  const sim = await simulateRead(contractId, fn, ...args);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${fn}: ${sim.error}`);
  return sim.result.retval;
}
const read = async (...a) => scValToNative(await readRaw(...a));
// Simula una llamada sin autorizaciones y devuelve el error de contrato (#n), o null si pasa.
async function contractError(contractId, fn, ...args) {
  const sim = await simulateRead(contractId, fn, ...args);
  if (!rpc.Api.isSimulationError(sim)) return null;
  const m = /Error\(Contract, #(\d+)\)/.exec([sim.error, ...diagErrors(sim.events)].join(' '));
  return m ? Number(m[1]) : sim.error;
}
// signers() como { id hex: { key hex, weight } }.
async function readSigners(wallet) {
  const v = await readRaw(wallet, 'signers');
  const out = {};
  for (const e of v.map() || []) {
    const s = scValToNative(e.val());
    out[hex(e.key().bytes())] = { key: hex(s.key), weight: s.weight };
  }
  return out;
}
const balance = async (a) => BigInt(await read(XLM, 'balance', new Address(a).toScVal()));
const fmt = (s) => (Number(s) / 1e7).toFixed(7);
const bytes = (b) => nativeToScVal(b, { type: 'bytes' });
const u32 = (n) => nativeToScVal(n, { type: 'u32' });
const i128 = (n) => nativeToScVal(n, { type: 'i128' });
const addr = (a) => new Address(a).toScVal();
const addrVec = (kps) => xdr.ScVal.scvVec(kps.map((k) => addr(k.publicKey())));

async function main() {
  const net = await retry('getNetwork', () => server.getNetwork());
  if (net.passphrase !== PASS) throw new Error('El RPC no es testnet: ' + net.passphrase);

  const wasm = readFileSync(WASM);
  const wasmHash = sha(wasm);
  log('hash wallet', wasmHash.toString('hex'));
  const hashOk = wasmHash.toString('hex') === HASH_WALLET_ESPERADO;
  check('0. sha256 del WASM == ' + HASH_WALLET_ESPERADO, hashOk, wasmHash.toString('hex'));
  if (!hashOk) throw new Error('El WASM no es el esperado; no se sigue');

  const r = [Keypair.random(), Keypair.random(), Keypair.random(), Keypair.random()];
  const g1 = Keypair.random();
  const g2 = Keypair.random();
  const a = Keypair.random(); // dueno (telefono)
  const b = Keypair.random(); // firmante que se agrega y se rota
  const c = Keypair.random(); // llave nueva de la rotacion
  const s = Keypair.random(); // llave de sesion
  const idA = signerId(a.rawPublicKey());
  const idB = signerId(b.rawPublicKey());
  const idC = signerId(c.rawPublicKey());
  const idS = sessionId(s.rawPublicKey());
  await Promise.all([...r, g1, g2].map(fund));
  r.forEach((k, i) => log(`relayer ${i} `, k.publicKey()));
  log('g1       ', g1.publicKey());
  log('g2       ', g2.publicKey());
  log('id a     ', idA.toString('hex'));
  log('id b     ', idB.toString('hex'));
  log('id c     ', idC.toString('hex'));
  log('id sesion', idS.toString('hex'));

  // 1. Wallet con a como dueno y 5 XLM; los tres pendientes van juntos.
  log('\n1. subir el WASM, crear la wallet con a y darle 5 XLM; en paralelo: add_guardian x2 y add_escrow');
  await send('upload wasm', 'uploadContractWasm', r[0], Operation.uploadContractWasm({ wasm }), undefined, { pad: false });
  const created = await send('crear wallet', 'createCustomContract (__constructor)', r[0], Operation.createCustomContract({
    address: new Address(r[0].publicKey()),
    wasmHash,
    salt: randomBytes(32),
    constructorArgs: [bytes(a.rawPublicKey())],
  }), undefined, { pad: false });
  const wallet = created.value;
  log('   wallet', wallet);
  await send('fondeo 5 XLM', 'transfer (XLM SAC)', r[0], new Contract(XLM).call('transfer', addr(r[0].publicKey()), addr(wallet), i128(5n * XLM1)));
  const saldo0 = await balance(wallet);
  check('1. wallet con 5 XLM', saldo0 === 5n * XLM1, fmt(saldo0));
  const W = new Contract(wallet);

  const pend = await Promise.all([
    send('add_guardian g1', 'add_guardian', r[1], W.call('add_guardian', addr(g1.publicKey())), [a]),
    send('add_guardian g2', 'add_guardian', r[2], W.call('add_guardian', addr(g2.publicKey())), [a]),
    send('add_escrow 100', 'add_escrow', r[3], W.call('add_escrow', addr(ESCROW), addr(XLM), u32(100)), [a]),
  ]);
  const ready = Math.max(...pend.map((p) => p.ledger)) + DELAY_LEDGERS;
  log(`   pendientes en los ledgers ${pend.map((p) => p.ledger).join(', ')}; todo listo desde el ${ready}`);

  // 2. Mientras corre la espera: limites (r1) y firmantes (r2) en paralelo.
  log('\n2. mientras corre la espera, en paralelo: limites (set_limit 10 y 20, cancel_limit) y firmantes (set_signer_weight, add_signer, rotate_signer)');
  const limites = async () => {
    const sl10 = await send('set_limit 10', 'set_limit', r[1], W.call('set_limit', addr(XLM), i128(10n * XLM1)), [a]);
    check('2a. set_limit(XLM, 10) devuelve true (aplica ya)', sl10.value === true, String(sl10.value));
    const sl20 = await send('set_limit 20', 'set_limit', r[1], W.call('set_limit', addr(XLM), i128(20n * XLM1)), [a]);
    check('2a. set_limit(XLM, 20) devuelve false (pendiente)', sl20.value === false, String(sl20.value));
    await send('cancel_limit', 'cancel_limit', r[1], W.call('cancel_limit', addr(XLM)), [a]);
    const l = await read(wallet, 'limit', addr(XLM));
    check('2a. limit() sigue en 10 XLM tras cancel_limit', l === 10n * XLM1, l == null ? 'None' : fmt(l));
    const e = await contractError(wallet, 'apply_limit', addr(XLM));
    check('2a. apply_limit(XLM) falla con #16 NothingPending (no queda subida)', e === 16, String(e));
  };
  const firmantes = async () => {
    await send('set_signer_weight a 2', 'set_signer_weight', r[2], W.call('set_signer_weight', bytes(idA), u32(2)), [a]);
    const s1 = await readSigners(wallet);
    check('2b. signers()[id_a].weight == 2', s1[idA.toString('hex')]?.weight === 2, JSON.stringify(Object.values(s1).map((x) => x.weight)));
    const thr = await read(wallet, 'threshold');
    check('2b. threshold() sigue en 1', thr === 1, String(thr));
    const ad = await send('add_signer b 1', 'add_signer', r[2], W.call('add_signer', bytes(b.rawPublicKey()), u32(1), bytes(possession(wallet, b))), [a]);
    check('2b. add_signer devuelve id_b', Buffer.from(ad.value).equals(idB), hex(ad.value));
    const rot = await send('rotate_signer b -> c', 'rotate_signer', r[2], W.call('rotate_signer', bytes(idB), bytes(c.rawPublicKey()), bytes(possession(wallet, c))), [a]);
    check('2b. rotate_signer devuelve id_c', Buffer.from(rot.value).equals(idC), hex(rot.value));
    const s2 = await readSigners(wallet);
    const ids = Object.keys(s2).sort();
    const esperado = [idA.toString('hex'), idC.toString('hex')].sort();
    check('2b. signers() == {a, c}', ids.length === 2 && ids[0] === esperado[0] && ids[1] === esperado[1], `${ids.length} firmantes`);
    check('2b. a con peso 2, c con peso 1 y la llave de c', s2[idA.toString('hex')]?.weight === 2 && s2[idC.toString('hex')]?.weight === 1 && s2[idC.toString('hex')]?.key === hex(c.rawPublicKey()),
      `a ${s2[idA.toString('hex')]?.weight}, c ${s2[idC.toString('hex')]?.weight}`);
  };
  await Promise.all([limites(), firmantes()]);

  // 3. Esperar una sola vez y aplicar lo pendiente sin firmas de la wallet.
  log(`\n3. esperar DELAY_LEDGERS hasta el ledger ${ready}; luego apply_guardian_add g1 y apply_escrow en paralelo, y apply_guardian_add g2`);
  await waitLedger(ready);
  await Promise.all([
    send('apply_guardian_add g1', 'apply_guardian_add', r[1], W.call('apply_guardian_add', addr(g1.publicKey()))),
    send('apply_escrow', 'apply_escrow', r[3], W.call('apply_escrow', addr(ESCROW))),
  ]);
  await send('apply_guardian_add g2', 'apply_guardian_add', r[2], W.call('apply_guardian_add', addr(g2.publicKey())));
  const gs3 = await read(wallet, 'guardians');
  check('3. guardians() == [g1, g2]', gs3.length === 2 && gs3[0] === g1.publicKey() && gs3[1] === g2.publicKey(), `${gs3.length} guardianes`);
  const gt3 = await read(wallet, 'guardian_threshold');
  check('3. guardian_threshold() == 1', gt3 === 1, `quorum ${gt3}`);
  const rule3 = await read(wallet, 'escrow', addr(ESCROW));
  check('3. escrow() = XLM, fee_bps_max 100', rule3?.token === XLM && rule3?.fee_bps_max === 100, JSON.stringify(rule3));

  // 4-6. Tres cadenas en paralelo: sesiones (r1), escrow (r2), guardianes (r3).
  log('\n4-6. en paralelo: sesiones, cambio de regla del escrow que se cancela, baja de guardian que se cancela');
  const sesiones = async () => {
    const latest = await latestLedger();
    const expires = latest + 2000;
    const addS = await send('add_session', 'add_session', r[1], W.call('add_session',
      bytes(s.rawPublicKey()), addr(ESCROW), addrVec([g1]),
      i128(XLM1), i128(2n * XLM1), u32(60), u32(expires)), [a]);
    check('4. add_session devuelve sha256(0x02 ‖ s)', Buffer.from(addS.value).equals(idS), hex(addS.value));
    await send('add_session_buyer g2', 'add_session_buyer', r[1], W.call('add_session_buyer', bytes(idS), addr(g2.publicKey())), [a]);
    const sa = await read(wallet, 'session', bytes(idS));
    check('4. session(id).buyers == [g1, g2]', sa?.buyers?.length === 2 && sa.buyers[0] === g1.publicKey() && sa.buyers[1] === g2.publicKey(), `${sa?.buyers?.length} comprador(es)`);
    await send('remove_session_buyer g2', 'remove_session_buyer', r[1], W.call('remove_session_buyer', bytes(idS), addr(g2.publicKey())), [a]);
    const sb = await read(wallet, 'session', bytes(idS));
    check('4. session(id).buyers == [g1]', sb?.buyers?.length === 1 && sb.buyers[0] === g1.publicKey(), `${sb?.buyers?.length} comprador(es)`);
    const expires2 = latest + 1500;
    await send('reduce_session', 'reduce_session', r[1], W.call('reduce_session', bytes(idS),
      i128(XLM1 / 2n), i128(XLM1), u32(30), u32(expires2)), [a]);
    const sc = await read(wallet, 'session', bytes(idS));
    check('4. session(id) con topes nuevos: 0.5 XLM, 1 XLM, 30 min, expira ' + expires2,
      sc?.max_per_lock === XLM1 / 2n && sc?.max_total === XLM1 && sc?.max_timeout === 30 && sc?.expires === expires2 && sc?.spent === 0n,
      sc ? `${fmt(sc.max_per_lock)} / ${fmt(sc.max_total)} / ${sc.max_timeout} / ${sc.expires}` : 'None');
    await send('revoke_all_sessions', 'revoke_all_sessions', r[1], W.call('revoke_all_sessions'), [a]);
    const sd = await read(wallet, 'session', bytes(idS));
    check('4. session(id) = None tras revoke_all_sessions', sd == null, String(sd));
  };
  const escrow = async () => {
    await send('add_escrow 50', 'add_escrow', r[2], W.call('add_escrow', addr(ESCROW), addr(XLM), u32(50)), [a]);
    const ea = await read(wallet, 'escrow', addr(ESCROW));
    check('5. escrow() sigue en 100 con el cambio pendiente', ea?.fee_bps_max === 100, JSON.stringify(ea));
    await send('cancel_escrow', 'cancel_escrow', r[2], W.call('cancel_escrow', addr(ESCROW)), [a]);
    const eb = await read(wallet, 'escrow', addr(ESCROW));
    check('5. escrow() = XLM, fee_bps_max 100 tras cancel_escrow', eb?.token === XLM && eb?.fee_bps_max === 100, JSON.stringify(eb));
    const e = await contractError(wallet, 'apply_escrow', addr(ESCROW));
    check('5. apply_escrow falla con #16 NothingPending (no queda cambio)', e === 16, String(e));
  };
  const guardian = async () => {
    await send('remove_guardian g2', 'remove_guardian', r[3], W.call('remove_guardian', addr(g2.publicKey())), [a]);
    await send('cancel_guardian_removal g2', 'cancel_guardian_removal', r[3], W.call('cancel_guardian_removal', addr(g2.publicKey())), [a]);
    const gs = await read(wallet, 'guardians');
    check('6. guardians() sigue en [g1, g2]', gs.length === 2 && gs[0] === g1.publicKey() && gs[1] === g2.publicKey(), `${gs.length} guardianes`);
    const e = await contractError(wallet, 'apply_guardian_removal', addr(g2.publicKey()));
    check('6. apply_guardian_removal(g2) falla con #16 NothingPending (no queda baja)', e === 16, String(e));
  };
  await Promise.all([sesiones(), escrow(), guardian()]);

  // 7. Congela g1 solo; el dueno pide descongelar; g2 borra esa solicitud.
  log('\n7. g1: freeze([g1]); con a: request_unfreeze; g2: cancel_unfreeze(g2)');
  const fr = await send('freeze g1', 'freeze', g1, W.call('freeze', addrVec([g1])));
  log(`   congelada en el ledger ${fr.ledger} hasta el ${fr.value}`);
  const f1 = await read(wallet, 'frozen');
  check('7. frozen() == true', f1 === true, String(f1));
  await send('request_unfreeze', 'request_unfreeze', r[0], W.call('request_unfreeze'), [a]);
  await send('cancel_unfreeze g2', 'cancel_unfreeze', g2, W.call('cancel_unfreeze', addr(g2.publicKey())));
  const f2 = await read(wallet, 'frozen');
  check('7. frozen() sigue en true tras cancel_unfreeze', f2 === true, String(f2));
  const e7 = await contractError(wallet, 'unfreeze');
  check('7. unfreeze falla con #16 NothingPending (no queda solicitud)', e7 === 16, String(e7));

  // Resumen.
  log('\n===== resumen =====');
  log('wallet     ', wallet);
  log('wasm hash  ', wasmHash.toString('hex'));
  log('saldo final', fmt(await balance(wallet)), 'XLM');
  log('estado     ', 'congelada, sin solicitud de descongelar');
  log('\ntransacciones:');
  log('| # | funcion | etiqueta | hash | explorador |');
  log('|---|---|---|---|---|');
  txs.forEach((t, i) => log(`| ${i + 1} | ${t.fn} | ${t.label} | ${t.hash} | ${explorer(t.hash)} |`));
  const nuevas = ['cancel_limit', 'cancel_escrow', 'cancel_guardian_removal', 'cancel_unfreeze', 'set_signer_weight',
    'rotate_signer', 'revoke_all_sessions', 'reduce_session', 'add_session_buyer', 'remove_session_buyer'];
  log('\nfunciones nuevas:');
  for (const f of nuevas) {
    const t = txs.find((x) => x.fn === f);
    check(`tx exitosa de ${f}`, !!t, t ? t.hash : 'sin tx');
  }
  log('\nchequeos:');
  for (const k of checks) log(`  ${k.ok ? 'OK   ' : 'FALLO'} ${k.step}`);
  const fallos = checks.filter((k) => !k.ok).length;
  log(fallos ? `\n${fallos} chequeo(s) fallaron` : `\ntodo OK (${checks.length}/${checks.length})`);
  if (fallos) process.exitCode = 1;
}

main().catch((e) => {
  log(String(e?.stack || e));
  if (e.diag?.length) log('diagnostico:', e.diag.join(' | '));
  if (txs.length) {
    log('\ntransacciones hasta el fallo:');
    txs.forEach((t, i) => log(`| ${i + 1} | ${t.fn} | ${t.label} | ${t.hash} | ${explorer(t.hash)} |`));
  }
  process.exitCode = 1;
});
