// Demo en testnet de las funciones de la smart wallet de labs que aun no tenian una transaccion
// exitosa: apply_limit, remove_escrow, remove_guardian, apply_guardian_removal, request_unfreeze,
// unfreeze, guardian_unfreeze, cancel_recovery, guardian_cancel_recovery, allow_session_decline,
// disallow_session_decline y cancel_upgrade. Cada una sale con su propio hash.
//
// Cuentas nuevas cada vez (friendbot), sin secretos guardados:
//   relayer: G… que manda y paga las transacciones de la wallet
//   g1, g2:  guardianes; cuentas G… normales. El que manda la transaccion cumple su require_auth
//            con las credenciales de la cuenta fuente; el segundo firma su autorizacion con
//            authorizeEntry
//   a:       llave ed25519 del dueno (telefono); no es cuenta de Stellar
//   s:       llave ed25519 de la sesion; no es cuenta de Stellar
//   n1, n2:  llaves nuevas de las dos propuestas de recuperacion (se cancelan las dos)
//
// Pasos:
//   1. subir el WASM, crear la wallet con a como dueno y darle 5 XLM
//   2. con a: add_guardian(g1), add_guardian(g2); set_limit(XLM, 10) aplica ya; set_limit(XLM, 20)
//      queda pendiente; add_escrow(ESCROW, XLM, 100); schedule_upgrade(hash) y cancel_upgrade ✓
//   3. esperar DELAY_LEDGERS = 120 desde el ultimo pendiente
//   4. el relayer: apply_guardian_add g1 y g2, apply_limit(XLM) ✓ (limit() = 20 XLM), apply_escrow;
//      con a: set_guardian_threshold(2)
//   5. con a: add_session(s, ESCROW, [g1], 1 XLM, 2 XLM, 60, ultimo + 2000);
//      allow_session_decline(id, T) ✓; disallow_session_decline(id, T) ✓;
//      remove_escrow(ESCROW) ✓ (la sesion muere con el escrow)
//   6. con a: remove_guardian(g2) ✓, queda pendiente
//   7. g1 solo: freeze([g1]); con a: request_unfreeze ✓; g1 + g2: guardian_unfreeze([g1, g2]) ✓
//   8. g1 + g2: freeze([g1, g2]) (el quorum congela aunque corra el enfriamiento de un guardian
//      solo); con a: request_unfreeze; esperar UNFREEZE_DELAY = 120; el relayer: unfreeze ✓
//   9. el relayer: apply_guardian_removal(g2) ✓; guardians() = [g1], quorum 1
//  10. g1: start_recovery([g1], n1); con a: cancel_recovery ✓; g1: start_recovery([g1], n2);
//      g1: guardian_cancel_recovery([g1]) ✓; recovery() = None
//
// Uso (desde labs/smart-wallet; el WASM ya compilado):
//   node scripts/demo-resto.mjs <ruta a @stellar/stellar-sdk>
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sdk = require(process.argv[2]);
const { Keypair, rpc, Networks, TransactionBuilder, Operation, Contract, Address, xdr, nativeToScVal, scValToNative, hash, Asset, authorizeEntry } = sdk;

const RPC = 'https://soroban-testnet.stellar.org';
const PASS = Networks.TESTNET;
// Escrow real de XLM en testnet (micopay/contracts/TESTNET.md), sin cambios.
const ESCROW = 'CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4';
const XLM = Asset.native().contractId(PASS);
const WASM = fileURLToPath(new URL('../target/wasm32v1-none/release/micopay_labs_smart_wallet.wasm', import.meta.url));
const HASH_WALLET_ESPERADO = 'feee1519';
const XLM1 = 10_000_000n;
const DOMAIN = Buffer.from('micopay-labs-wallet-v1');
const MODE_OWNER = 0;
const DELAY_LEDGERS = 120;
const UNFREEZE_DELAY = 120;
const RECOVERY_DELAY = 240;
const RECOVERY_MARGIN = 120;

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
// Prueba de posesion de una llave nueva: sha256(DOMINIO ‖ XDR(wallet) ‖ "add-signer" ‖ id).
// La misma que pide start_recovery para la llave nueva.
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

// Firma una autorizacion: la de una cuenta G… de `accounts` (un segundo guardian) con
// authorizeEntry; la de una C… (la wallet) con `keys`. La de la cuenta fuente no necesita nada.
async function signEntry(entry, keys, accounts) {
  const creds = entry.credentials();
  if (creds.switch().name !== 'sorobanCredentialsAddress') return entry;
  const who = Address.fromScAddress(creds.address().address()).toString();
  const kp = accounts?.find((k) => k.publicKey() === who);
  if (kp) return authorizeEntry(entry, kp, (await latestLedger()) + 100, PASS);
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

// Manda una transaccion. Si `keys` viene, firma las autorizaciones de la wallet con esas llaves;
// si `accounts` viene, firma las de esas cuentas G… (guardianes que no son la fuente).
async function send(label, sourceKp, op, keys, accounts) {
  let account = await retry('getAccount', () => server.getAccount(sourceKp.publicKey()));
  const build = (o) => new TransactionBuilder(account, { fee: '1000000', networkPassphrase: PASS }).addOperation(o).setTimeout(60).build();
  let tx = build(op);
  if (keys || accounts) {
    const sim = await retry('simulate', () => server.simulateTransaction(tx));
    if (rpc.Api.isSimulationError(sim)) {
      const err = new Error(`${label}: simulacion: ` + sim.error);
      err.diag = diagErrors(sim.events);
      throw err;
    }
    const auth = [];
    for (const e of sim.result.auth) auth.push(await signEntry(e, keys, accounts));
    const fn = tx.operations[0].func;
    account = await retry('getAccount', () => server.getAccount(sourceKp.publicKey()));
    tx = build(Operation.invokeHostFunction({ func: fn, auth }));
  }
  // Re-simulacion con las autorizaciones firmadas: aqui corre __check_auth.
  const sim2 = await retry('simulate', () => server.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim2)) {
    const err = new Error(`${label}: simulacion: ` + sim2.error);
    err.diag = diagErrors(sim2.events);
    throw err;
  }
  const prepared = rpc.assembleTransaction(tx, sim2).build();
  prepared.sign(sourceKp);
  const res = await server.sendTransaction(prepared);
  if (res.status === 'ERROR') throw new Error(`${label}: envio: ` + JSON.stringify(res.errorResult));
  const final = await poll(res.hash);
  if (final.status !== 'SUCCESS') throw new Error(`${label}: tx ${res.hash} ${final.status}`);
  txs.push({ label, hash: res.hash });
  log(`   ${label}`, explorer(res.hash));
  return { hash: res.hash, ledger: final.ledger, value: final.returnValue ? scValToNative(final.returnValue) : undefined };
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
  check('0. hash del WASM empieza con ' + HASH_WALLET_ESPERADO, wasmHash.toString('hex').startsWith(HASH_WALLET_ESPERADO), wasmHash.toString('hex'));

  const relayer = Keypair.random();
  const g1 = Keypair.random();
  const g2 = Keypair.random();
  const a = Keypair.random(); // dueno (telefono)
  const s = Keypair.random(); // llave de sesion
  const n1 = Keypair.random(); // llave de la primera propuesta (la cancela el dueno)
  const n2 = Keypair.random(); // llave de la segunda propuesta (la cancelan los guardianes)
  const idS = sessionId(s.rawPublicKey());
  for (const k of [relayer, g1, g2]) await fund(k);
  log('relayer  ', relayer.publicKey());
  log('g1       ', g1.publicKey());
  log('g2       ', g2.publicKey());
  log('id a     ', signerId(a.rawPublicKey()).toString('hex'));
  log('id sesion', idS.toString('hex'));

  // 1. Wallet con a como dueno y 5 XLM.
  log('\n1. subir el WASM, crear la wallet con a y darle 5 XLM');
  await send('upload wasm', relayer, Operation.uploadContractWasm({ wasm }));
  const created = await send('crear wallet', relayer, Operation.createCustomContract({
    address: new Address(relayer.publicKey()),
    wasmHash,
    salt: randomBytes(32),
    constructorArgs: [bytes(a.rawPublicKey())],
  }));
  const wallet = created.value;
  log('   wallet', wallet);
  await send('fondeo 5 XLM', relayer, new Contract(XLM).call('transfer', addr(relayer.publicKey()), addr(wallet), i128(5n * XLM1)));
  const saldo0 = await balance(wallet);
  check('1. wallet con 5 XLM', saldo0 === 5n * XLM1, fmt(saldo0));
  const W = new Contract(wallet);

  // 2. Pendientes del dueno y un upgrade que se cancela.
  log('\n2. con a: add_guardian x2, set_limit 10 y 20, add_escrow, schedule_upgrade y cancel_upgrade');
  await send('add_guardian g1', relayer, W.call('add_guardian', addr(g1.publicKey())), [a]);
  await send('add_guardian g2', relayer, W.call('add_guardian', addr(g2.publicKey())), [a]);
  const sl10 = await send('set_limit 10', relayer, W.call('set_limit', addr(XLM), i128(10n * XLM1)), [a]);
  check('2. set_limit(XLM, 10) devuelve true (aplica ya)', sl10.value === true, String(sl10.value));
  const sl20 = await send('set_limit 20', relayer, W.call('set_limit', addr(XLM), i128(20n * XLM1)), [a]);
  check('2. set_limit(XLM, 20) devuelve false (pendiente)', sl20.value === false, String(sl20.value));
  const l2 = await read(wallet, 'limit', addr(XLM));
  check('2. limit() sigue en 10 XLM', l2 === 10n * XLM1, l2 == null ? 'None' : fmt(l2));
  const esc = await send('add_escrow', relayer, W.call('add_escrow', addr(ESCROW), addr(XLM), u32(100)), [a]);
  await send('schedule_upgrade', relayer, W.call('schedule_upgrade', bytes(wasmHash)), [a]);
  const pu = await read(wallet, 'pending_upgrade');
  check('2. pending_upgrade() con el hash', pu != null && Buffer.from(pu.hash).equals(wasmHash), pu ? `ready_ledger ${pu.ready_ledger}` : 'None');
  await send('cancel_upgrade', relayer, W.call('cancel_upgrade'), [a]);
  const pu2 = await read(wallet, 'pending_upgrade');
  check('2. pending_upgrade() = None tras cancel_upgrade', pu2 == null, String(pu2));

  // 3. Esperar a que venzan los plazos (add_escrow fue el ultimo pendiente).
  const ready3 = esc.ledger + DELAY_LEDGERS;
  log(`\n3. esperar DELAY_LEDGERS: add_escrow en el ledger ${esc.ledger}; todo listo desde el ${ready3}`);
  await waitLedger(ready3);

  // 4. Aplicar lo pendiente sin firmas de la wallet; quorum 2 con a.
  log('\n4. el relayer: apply_guardian_add x2, apply_limit, apply_escrow; con a: set_guardian_threshold(2)');
  await send('apply_guardian_add g1', relayer, W.call('apply_guardian_add', addr(g1.publicKey())));
  await send('apply_guardian_add g2', relayer, W.call('apply_guardian_add', addr(g2.publicKey())));
  await send('apply_limit', relayer, W.call('apply_limit', addr(XLM)));
  const l4 = await read(wallet, 'limit', addr(XLM));
  check('4. limit() == 20 XLM tras apply_limit', l4 === 20n * XLM1, l4 == null ? 'None' : fmt(l4));
  await send('apply_escrow', relayer, W.call('apply_escrow', addr(ESCROW)));
  const rule = await read(wallet, 'escrow', addr(ESCROW));
  check('4. escrow() = XLM, fee_bps_max 100', rule?.token === XLM && rule?.fee_bps_max === 100, JSON.stringify(rule));
  await send('set_guardian_thr 2', relayer, W.call('set_guardian_threshold', u32(2)), [a]);
  const gs4 = await read(wallet, 'guardians');
  check('4. guardians() == [g1, g2]', gs4.length === 2 && gs4[0] === g1.publicKey() && gs4[1] === g2.publicKey(), `${gs4.length} guardianes`);
  const gt4 = await read(wallet, 'guardian_threshold');
  check('4. guardian_threshold() == 2', gt4 === 2, `quorum ${gt4}`);

  // 5. Sesion: permitir y retirar un decline; quitar el escrow se lleva la sesion.
  log('\n5. con a: add_session, allow_session_decline, disallow_session_decline, remove_escrow');
  const expires5 = (await latestLedger()) + 2000;
  const addS = await send('add_session', relayer, W.call('add_session',
    bytes(s.rawPublicKey()), addr(ESCROW), addrVec([g1]),
    i128(XLM1), i128(2n * XLM1), u32(60), u32(expires5)), [a]);
  check('5. add_session devuelve sha256(0x02 ‖ s)', Buffer.from(addS.value).equals(idS), Buffer.from(addS.value).toString('hex'));
  const T = randomBytes(32); // trade cualquiera: el permiso no exige que exista
  await send('allow_session_decline', relayer, W.call('allow_session_decline', bytes(idS), bytes(T)), [a]);
  const s5a = await read(wallet, 'session', bytes(idS));
  check('5. session(id).declines == [T]', s5a?.declines?.length === 1 && Buffer.from(s5a.declines[0]).equals(T), `${s5a?.declines?.length} permiso(s)`);
  await send('disallow_session_decline', relayer, W.call('disallow_session_decline', bytes(idS), bytes(T)), [a]);
  const s5b = await read(wallet, 'session', bytes(idS));
  check('5. session(id).declines vacio', s5b != null && s5b.declines.length === 0, `${s5b?.declines?.length} permiso(s)`);
  await send('remove_escrow', relayer, W.call('remove_escrow', addr(ESCROW)), [a]);
  const s5c = await read(wallet, 'session', bytes(idS));
  check('5. session(id) = None tras remove_escrow', s5c == null, String(s5c));
  const e5 = await read(wallet, 'escrow', addr(ESCROW));
  check('5. escrow(ESCROW) = None', e5 == null, String(e5));

  // 6. Pedir la baja de g2; queda pendiente.
  log('\n6. con a: remove_guardian(g2)');
  const rg = await send('remove_guardian g2', relayer, W.call('remove_guardian', addr(g2.publicKey())), [a]);
  const removalReady = rg.ledger + DELAY_LEDGERS;
  log(`   remove_guardian en el ledger ${rg.ledger}; se aplica desde el ${removalReady}`);
  const gs6 = await read(wallet, 'guardians');
  check('6. guardians() sigue con 2 (baja pendiente)', gs6.length === 2, `${gs6.length} guardianes`);

  // 7. Congela g1 solo; el dueno pide descongelar; el quorum descongela al instante.
  log('\n7. g1: freeze([g1]); con a: request_unfreeze; g1 + g2: guardian_unfreeze([g1, g2])');
  const fr7 = await send('freeze g1', g1, W.call('freeze', addrVec([g1])));
  log(`   congelada en el ledger ${fr7.ledger} hasta el ${fr7.value}`);
  const f7a = await read(wallet, 'frozen');
  check('7. frozen() == true', f7a === true, String(f7a));
  await send('request_unfreeze 1', relayer, W.call('request_unfreeze'), [a]);
  await send('guardian_unfreeze', g1, W.call('guardian_unfreeze', addrVec([g1, g2])), undefined, [g2]);
  const f7b = await read(wallet, 'frozen');
  check('7. frozen() == false tras guardian_unfreeze', f7b === false, String(f7b));

  // 8. Congela el quorum (el enfriamiento de un guardian solo no lo frena); el dueno descongela
  //    por su cuenta despues de UNFREEZE_DELAY.
  log('\n8. g1 + g2: freeze([g1, g2]); con a: request_unfreeze; esperar; el relayer: unfreeze');
  const fr8 = await send('freeze g1+g2', g1, W.call('freeze', addrVec([g1, g2])), undefined, [g2]);
  log(`   congelada en el ledger ${fr8.ledger} hasta el ${fr8.value}`);
  const f8a = await read(wallet, 'frozen');
  check('8. frozen() == true', f8a === true, String(f8a));
  const ru = await send('request_unfreeze 2', relayer, W.call('request_unfreeze'), [a]);
  const unfreezeReady = ru.ledger + UNFREEZE_DELAY;
  log(`   request_unfreeze en el ledger ${ru.ledger}; se descongela desde el ${unfreezeReady}`);
  await waitLedger(Math.max(unfreezeReady, removalReady));
  const f8b = await read(wallet, 'frozen');
  log(`   frozen() antes de unfreeze: ${f8b}`);
  check('8. sigue congelada antes de unfreeze (FREEZE_MAX no vencio)', f8b === true, String(f8b));
  await send('unfreeze', relayer, W.call('unfreeze'));
  const f8c = await read(wallet, 'frozen');
  check('8. frozen() == false tras unfreeze', f8c === false, String(f8c));

  // 9. Aplicar la baja de g2; el quorum baja a 1.
  log('\n9. el relayer: apply_guardian_removal(g2)');
  await send('apply_guardian_removal', relayer, W.call('apply_guardian_removal', addr(g2.publicKey())));
  const gs9 = await read(wallet, 'guardians');
  check('9. guardians() == [g1]', gs9.length === 1 && gs9[0] === g1.publicKey(), `${gs9.length} guardian(es)`);
  const gt9 = await read(wallet, 'guardian_threshold');
  check('9. guardian_threshold() == 1', gt9 === 1, `quorum ${gt9}`);

  // 10. Dos recuperaciones: una la veta el dueno y otra la cancela el quorum de guardianes.
  log('\n10. g1: start_recovery(n1); con a: cancel_recovery; g1: start_recovery(n2); g1: guardian_cancel_recovery');
  const exp1 = (await latestLedger()) + RECOVERY_DELAY + RECOVERY_MARGIN + 60;
  const st1 = await send('start_recovery n1', g1, W.call('start_recovery',
    addrVec([g1]), bytes(n1.rawPublicKey()), bytes(possession(wallet, n1)), u32(exp1)));
  log(`   propuesta ${Buffer.from(st1.value).toString('hex')}`);
  const r10a = await read(wallet, 'recovery');
  check('10. recovery() con new_key = n1', r10a != null && Buffer.from(r10a.new_key).equals(n1.rawPublicKey()), r10a ? `ready_ledger ${r10a.ready_ledger}` : 'None');
  await send('cancel_recovery', relayer, W.call('cancel_recovery'), [a]);
  const r10b = await read(wallet, 'recovery');
  check('10. recovery() = None tras cancel_recovery', r10b == null, String(r10b));
  const exp2 = (await latestLedger()) + RECOVERY_DELAY + RECOVERY_MARGIN + 60;
  const st2 = await send('start_recovery n2', g1, W.call('start_recovery',
    addrVec([g1]), bytes(n2.rawPublicKey()), bytes(possession(wallet, n2)), u32(exp2)));
  log(`   propuesta ${Buffer.from(st2.value).toString('hex')}`);
  const r10c = await read(wallet, 'recovery');
  check('10. recovery() con new_key = n2', r10c != null && Buffer.from(r10c.new_key).equals(n2.rawPublicKey()), r10c ? `ready_ledger ${r10c.ready_ledger}` : 'None');
  await send('guardian_cancel_recovery', g1, W.call('guardian_cancel_recovery', addrVec([g1])));
  const r10d = await read(wallet, 'recovery');
  check('10. recovery() = None tras guardian_cancel_recovery', r10d == null, String(r10d));

  // Resumen.
  log('\n===== resumen =====');
  log('wallet     ', wallet);
  log('wasm hash  ', wasmHash.toString('hex'));
  log('saldo final', fmt(await balance(wallet)), 'XLM');
  log('\ntransacciones:');
  for (const t of txs) log(`  ${t.label.padEnd(26)} ${t.hash}  ${explorer(t.hash)}`);
  log('\nchequeos:');
  for (const c of checks) log(`  ${c.ok ? 'OK   ' : 'FALLO'} ${c.step}`);
  const fallos = checks.filter((c) => !c.ok).length;
  log(fallos ? `\n${fallos} chequeo(s) fallaron` : '\ntodo OK');
  if (fallos) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  if (e.diag?.length) console.error('diagnostico:', e.diag.join(' | '));
  process.exitCode = 1;
});
