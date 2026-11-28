// Demo en testnet de los guardianes de la smart wallet de labs (W8–W16): congelar con un
// guardian, recuperar con el quorum y cambiar de telefono.
//
// Cuentas nuevas cada vez (friendbot), sin secretos guardados:
//   relayer:    G… que manda y paga las transacciones de la wallet
//   agente:     G… normal que recibe las transferencias
//   g1, g2, g3: guardianes; cuentas G… normales. Su require_auth se cumple porque cada uno
//               manda su propia transaccion (credenciales de la cuenta fuente)
//   a:          llave ed25519 del telefono (robado)
//   n:          llave ed25519 del telefono nuevo, despues de la recuperacion
//
// Pasos:
//   1. subir el WASM, crear la wallet con a como dueno y darle 5 XLM; W8 add_guardian(g1, g2, g3)
//      firmado por a (cada alta queda pendiente DELAY_LEDGERS = 120, ~10 min); esperar una vez;
//      apply_guardian_add de los tres mandado por el relayer sin firmas de la wallet (el quorum
//      pasa a 1 con el primero); W9 set_guardian_threshold(2) firmado por a.
//      guardians() = 3, guardian_threshold() = 2
//   2. telefono robado: g1 solo llama freeze([g1]) (W15). frozen() == true
//   3. con la wallet congelada, transfer de 1 XLM al agente firmado por a falla con #30 (Frozen)
//   4. g1 abre start_recovery([g1], n, posesion de n, expires) (W10); ready_ledger == 0 (quorum 2)
//      4b. con la recuperacion abierta, request_unfreeze firmado por a falla con #35 (RecoveryActive)
//   5. g2 approve_recovery(g2, id) (W11): llega al quorum y empieza la espera (RECOVERY_DELAY = 240)
//   6. esperar ready_ledger (~20 min); el relayer llama finish_recovery(id) sin firmas de la
//      wallet (W14). frozen() == false, threshold() == 1, signers() == [id de n]
//   7. transfer de 1 XLM al agente firmado por a (telefono viejo) falla con #3 (UnknownSigner);
//      el mismo firmado por n pasa y el agente sube 1 XLM
//
// Uso (desde labs/smart-wallet; el WASM ya compilado):
//   node scripts/demo-guardianes.mjs <ruta a @stellar/stellar-sdk>
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sdk = require(process.argv[2]);
const { Keypair, rpc, Networks, TransactionBuilder, Operation, Contract, Address, xdr, nativeToScVal, scValToNative, hash, Asset, authorizeEntry } = sdk;

const RPC = 'https://soroban-testnet.stellar.org';
const PASS = Networks.TESTNET;
const XLM = Asset.native().contractId(PASS);
const WASM = 'target/wasm32v1-none/release/micopay_labs_smart_wallet.wasm';
const XLM1 = 10_000_000n;
const DOMAIN = Buffer.from('micopay-labs-wallet-v1');
const MODE_OWNER = 0;
const DELAY_LEDGERS = 120;
const RECOVERY_DELAY = 240;
const RECOVERY_MARGIN = 120;

const sha = (b) => createHash('sha256').update(b).digest();
const explorer = (h) => `https://stellar.expert/explorer/testnet/tx/${h}`;
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Id de un firmante ed25519: sha256(0x00 ‖ pubkey).
const signerId = (pub) => sha(Buffer.concat([Buffer.from([0]), pub]));
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

async function fund(kp) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}

// Ultimo ledger; reintenta si el RPC corta (ECONNRESET y similares).
async function latestLedger() {
  for (let i = 0; ; i++) {
    try {
      return (await server.getLatestLedger()).sequence;
    } catch (e) {
      if (i >= 20) throw e;
      log(`   getLatestLedger fallo (${e.code || e.message}); reintento`);
      await sleep(5000);
    }
  }
}

// Espera hasta que el ultimo ledger llegue a `target`.
async function waitLedger(target) {
  for (;;) {
    const sequence = await latestLedger();
    if (sequence >= target) { log(`   ledger ${sequence}, listo`); return; }
    log(`   ledger ${sequence}, faltan ${target - sequence}`);
    await sleep(Math.min(30, (target - sequence) * 5) * 1000);
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

// Manda una transaccion. Si `keys` viene, firma las autorizaciones de la wallet con esas llaves;
// si `accounts` viene, firma las de esas cuentas G… (guardianes que no son la fuente).
async function send(label, sourceKp, op, keys, accounts) {
  let account = await server.getAccount(sourceKp.publicKey());
  const build = (o) => new TransactionBuilder(account, { fee: '1000000', networkPassphrase: PASS }).addOperation(o).setTimeout(60).build();
  let tx = build(op);
  if (keys || accounts) {
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      const err = new Error('simulacion: ' + sim.error);
      err.diag = diagErrors(sim.events);
      throw err;
    }
    const auth = [];
    for (const e of sim.result.auth) auth.push(await signEntry(e, keys, accounts));
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
  return { hash: res.hash, ledger: final.ledger, value: final.returnValue ? scValToNative(final.returnValue) : undefined };
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
const i128 = (n) => nativeToScVal(n, { type: 'i128' });
const addr = (a) => new Address(a).toScVal();
const addrVec = (kps) => xdr.ScVal.scvVec(kps.map((k) => addr(k.publicKey())));

async function main() {
  const net = await server.getNetwork();
  if (net.passphrase !== PASS) throw new Error('El RPC no es testnet: ' + net.passphrase);

  const relayer = Keypair.random();
  const agente = Keypair.random();
  const g1 = Keypair.random();
  const g2 = Keypair.random();
  const g3 = Keypair.random();
  const a = Keypair.random(); // telefono (robado)
  const n = Keypair.random(); // telefono nuevo
  const idA = signerId(a.rawPublicKey());
  const idN = signerId(n.rawPublicKey());
  for (const k of [relayer, agente, g1, g2, g3]) await fund(k);
  log('relayer', relayer.publicKey());
  log('agente ', agente.publicKey());
  log('g1     ', g1.publicKey());
  log('g2     ', g2.publicKey());
  log('g3     ', g3.publicKey());
  log('id a   ', idA.toString('hex'));
  log('id n   ', idN.toString('hex'));

  // 1. Wallet con a como dueno, 5 XLM, tres guardianes y quorum 2.
  log('\n1. crear la wallet; W8 add_guardian x3 y W9 set_guardian_threshold(2) con a');
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
  await send('fondeo 5 XLM', relayer, new Contract(XLM).call('transfer', addr(relayer.publicKey()), addr(wallet), i128(5n * XLM1)));
  const saldo0 = await balance(wallet);
  check('1. wallet con 5 XLM', saldo0 === 5n * XLM1, fmt(saldo0));
  const W = new Contract(wallet);
  const gnames = [['g1', g1], ['g2', g2], ['g3', g3]];
  let lastAdd = 0;
  for (const [name, g] of gnames) {
    lastAdd = (await send(`add_guardian ${name}`, relayer, W.call('add_guardian', addr(g.publicKey())), [a])).ledger;
  }
  const g0 = await read(wallet, 'guardians');
  check('1. guardians() vacio mientras las altas esperan', g0.length === 0, `${g0.length} guardianes`);
  const addReady = lastAdd + DELAY_LEDGERS;
  log(`   ultima alta en el ledger ${lastAdd}; se aplican desde el ${addReady}`);
  await waitLedger(addReady);
  for (const [name, g] of gnames) {
    await send(`apply_guardian_add ${name}`, relayer, W.call('apply_guardian_add', addr(g.publicKey())));
  }
  const gt1 = await read(wallet, 'guardian_threshold');
  check('1. guardian_threshold() == 1 tras aplicar', gt1 === 1, `quorum ${gt1}`);
  await send('set_guardian_thr 2', relayer, W.call('set_guardian_threshold', u32(2)), [a]);
  const gs = await read(wallet, 'guardians');
  const want = [g1, g2, g3].map((k) => k.publicKey());
  check('1. guardians() == [g1, g2, g3]', gs.length === 3 && want.every((g, i) => gs[i] === g), `${gs.length} guardianes`);
  const gt = await read(wallet, 'guardian_threshold');
  check('1. guardian_threshold() == 2', gt === 2, `quorum ${gt}`);

  // 2. Telefono robado: g1 solo congela.
  log('\n2. W15 freeze([g1]) mandado por g1');
  const fr = await send('freeze g1', g1, W.call('freeze', addrVec([g1])));
  log(`   congelada en el ledger ${fr.ledger} hasta el ${fr.value}`);
  const f2 = await read(wallet, 'frozen');
  check('2. frozen() == true', f2 === true, String(f2));

  // 3. Congelada: a no puede mover fondos.
  const xferOp = (to, amt) => new Contract(XLM).call('transfer', addr(wallet), addr(to), i128(amt));
  log('\n3. transfer de 1 XLM al agente firmado por a, con la wallet congelada');
  const err3 = await mustFail('3. transfer congelada falla con #30', 30, relayer, xferOp(agente.publicKey(), XLM1), [a]);

  // 4. g1 abre la recuperacion hacia n; con su voto solo no llega al quorum.
  log('\n4. W10 start_recovery([g1], n) mandado por g1');
  const expires = (await latestLedger()) + RECOVERY_DELAY + RECOVERY_MARGIN + 60;
  const st = await send('start_recovery g1', g1, W.call('start_recovery',
    addrVec([g1]), bytes(n.rawPublicKey()), bytes(possession(wallet, n)), u32(expires)));
  const proposalId = Buffer.from(st.value);
  log(`   propuesta ${proposalId.toString('hex')}, caduca en el ledger ${expires}`);
  const r4 = await read(wallet, 'recovery');
  check('4. recovery().ready_ledger == 0', r4?.ready_ledger === 0, `ready_ledger ${r4?.ready_ledger}, votos ${r4?.votes?.length}`);
  check('4. recovery().new_key == n', r4 && Buffer.from(r4.new_key).equals(n.rawPublicKey()));

  // 4b. El ladron no puede pedir descongelar mientras hay una recuperacion abierta.
  log('\n4b. request_unfreeze firmado por a, con la recuperacion abierta');
  const err4b = await mustFail('4b. request_unfreeze falla con #35', 35, relayer, W.call('request_unfreeze'), [a]);

  // 5. g2 vota: quorum 2 alcanzado, empieza la espera.
  log('\n5. W11 approve_recovery(g2, id) mandado por g2');
  const ap = await send('approve_recovery g2', g2, W.call('approve_recovery', addr(g2.publicKey()), bytes(proposalId)));
  const r5 = await read(wallet, 'recovery');
  const ready = r5?.ready_ledger;
  check('5. ready_ledger == ledger del voto + 240', ready === ap.ledger + RECOVERY_DELAY, `ready_ledger ${ready} (voto en el ${ap.ledger})`);
  check('5. recovery() con 2 votos', r5?.votes?.length === 2, `${r5?.votes?.length} votos`);

  // 6. Esperar la espera de la recuperacion y terminarla sin firmas de la wallet.
  log(`\n6. esperar ready_ledger (${ready})`);
  await waitLedger(ready);
  const f6a = await read(wallet, 'frozen');
  log(`   frozen() antes de terminar: ${f6a}`);
  log('   W14 finish_recovery mandado por el relayer');
  await send('finish_recovery', relayer, W.call('finish_recovery', bytes(proposalId)));
  const f6 = await read(wallet, 'frozen');
  check('6. frozen() == false', f6 === false, String(f6));
  const t6 = await read(wallet, 'threshold');
  check('6. threshold() == 1', t6 === 1, `threshold ${t6}`);
  const s6 = await signerIds(wallet);
  check('6. signers() == [id de n]', s6.length === 1 && s6[0] === idN.toString('hex'), `${s6.length} firmante(s): ${s6.join(', ')}`);
  const r6 = await read(wallet, 'recovery');
  check('6. recovery() vacia', r6 == null, JSON.stringify(r6 ?? null));

  // 7. El telefono viejo ya no firma; el nuevo si.
  log('\n7. transfer de 1 XLM al agente firmado por a (telefono viejo)');
  const err7 = await mustFail('7. transfer con a falla con #3', 3, relayer, xferOp(agente.publicKey(), XLM1), [a]);
  log('\n7. transfer de 1 XLM al agente firmado por n (telefono nuevo)');
  const antes7 = await balance(agente.publicKey());
  await send('transfer con n', relayer, xferOp(agente.publicKey(), XLM1), [n]);
  const sube = (await balance(agente.publicKey())) - antes7;
  check('7. el agente sube 1 XLM', sube === XLM1, fmt(sube));

  // Resumen.
  log('\n===== resumen =====');
  log('wallet    ', wallet);
  log('wasm hash ', wasmHash.toString('hex'));
  log('propuesta ', proposalId.toString('hex'));
  log('saldo final', fmt(await balance(wallet)), 'XLM');
  log('\ntransacciones:');
  for (const t of txs) log(`  ${t.label.padEnd(20)} ${t.hash}  ${explorer(t.hash)}`);
  for (const [k, e] of [['3', err3], ['4b', err4b], ['7', err7]]) {
    log(`\nerror paso ${k}:`, e ? e.text.split('\n')[0] : '-');
    if (e?.diag?.length) log(`  diagnostico ${k}:`, e.diag.join(' | '));
  }
  log('\nchequeos:');
  for (const c of checks) log(`  ${c.ok ? 'OK   ' : 'FALLO'} ${c.step}`);
  const fallos = checks.filter((c) => !c.ok).length;
  log(fallos ? `\n${fallos} chequeo(s) fallaron` : '\ntodo OK');
  if (fallos) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
