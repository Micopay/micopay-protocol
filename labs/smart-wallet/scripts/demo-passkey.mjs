// Demo en testnet de los passkeys de la smart wallet de labs (W6–W7): un passkey secp256r1
// (huella o PIN) se registra con prueba de posesion y luego firma un transfer de la wallet.
//
// Tres pasos, porque un humano firma cada challenge en scripts/passkey.html (http://localhost:8080):
//   prepare <passkey.json>   cuentas nuevas (friendbot), subir el WASM, crear la wallet con a como
//                            dueno, darle 5 XLM, W6 set_webauthn(sha256("localhost"),
//                            ["http://localhost:8080"]) firmado por a. Imprime el challenge 1:
//                            possession_message(wallet, passkey_id(key)).
//   add <asercion1.json>     W6 add_passkey(key, credential_id, 1, …) firmado por a; passkeys() lo
//                            tiene. Arma el transfer de 1 XLM (wallet → agente) y su autorizacion
//                            (nonce al azar, vence en latest + 1000). Imprime el challenge 2:
//                            message(wallet, 0, payload).
//   send <asercion2.json>    W7 firma la autorizacion con Proof::Passkey, re-simula y manda; el agente
//                            sube 1 XLM exacto. La misma asercion sobre un transfer de 2 XLM tiene que
//                            fallar con #49 (WebAuthnFailed). Imprime el resumen.
//
// Cuentas (secretos de testnet) en el archivo de estado, FUERA del repo:
//   relayer: G… que manda y paga todas las transacciones
//   agente:  G… destino del transfer
//   a:       llave ed25519 del dueno (no es cuenta de Stellar)
//
// Cada asercion es la salida completa de passkey.html o un solo objeto de asercion: se toma la
// ultima de `assertions[]` cuyo `challenge` sea el esperado.
//
// --fake: el script firma los challenges con una llave P-256 propia (node:crypto) y arma
// authenticator_data y client_data_json como un navegador en http://localhost:8080. Sirve para
// probar el flujo completo sin humano. Usa su propio estado (state-fake.json) y escribe las
// aserciones a archivos en el mismo directorio, que luego lee igual que en modo real.
//
// Uso (desde labs/smart-wallet):
//   node scripts/demo-passkey.mjs <sdk> prepare <passkey.json>
//   node scripts/demo-passkey.mjs <sdk> add <asercion1.json>
//   node scripts/demo-passkey.mjs <sdk> send <asercion2.json>
//   node scripts/demo-passkey.mjs <sdk> prepare --fake      (y luego add --fake, send --fake)
//   --state <ruta> cambia el archivo de estado.
import { createRequire } from 'node:module';
import { createHash, randomBytes, generateKeyPairSync, createPrivateKey, createPublicKey, sign as ecSign, verify as ecVerify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sdk = require(process.argv[2]);
const { Keypair, rpc, Networks, TransactionBuilder, Operation, Contract, Address, xdr, nativeToScVal, scValToNative, hash, Asset } = sdk;

const RPC = 'https://soroban-testnet.stellar.org';
const PASS = Networks.TESTNET;
const XLM = Asset.native().contractId(PASS);
const HERE = dirname(fileURLToPath(import.meta.url));
const WASM = join(HERE, '..', 'target', 'wasm32v1-none', 'release', 'micopay_labs_smart_wallet.wasm');
const XLM1 = 10_000_000n;
const DOMAIN = Buffer.from('micopay-labs-wallet-v1');
const MODE_OWNER = 0;
const RP_ID = 'localhost';
const ORIGIN = 'http://localhost:8080';
// La autorizacion del transfer vence en latest + EXP_LEDGERS (~80 min): el humano necesita minutos.
const EXP_LEDGERS = 1000;
const STATE_DIR = 'C:\\Users\\eric\\AppData\\Local\\Temp\\claude\\C--Users-eric\\b37d6a25-1cfa-4ba5-a24d-726388900ad4\\scratchpad\\passkey-demo';

// ---------- argumentos ----------
const args = process.argv.slice(3);
const FAKE = args.includes('--fake');
const si = args.indexOf('--state');
const STATE = si >= 0 ? args[si + 1] : join(STATE_DIR, FAKE ? 'state-fake.json' : 'state.json');
const pos = args.filter((x, i) => !x.startsWith('--') && !(si >= 0 && i === si + 1));
const [CMD, FILE] = pos;

const sha = (b) => createHash('sha256').update(b).digest();
const explorer = (h) => `https://stellar.expert/explorer/testnet/tx/${h}`;
const log = (...a) => console.log(...a);
const hex = (b) => Buffer.from(b).toString('hex');
const unhex = (h) => Buffer.from(h, 'hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Id de un firmante ed25519: sha256(0x00 ‖ pubkey).
const signerId = (pub) => sha(Buffer.concat([Buffer.from([0]), pub]));
// Id de un passkey (W6): sha256(0x01 ‖ pubkey de 65 bytes).
const passkeyId = (key65) => sha(Buffer.concat([Buffer.from([1]), key65]));
const walletXdr = (wallet) => new Address(wallet).toScVal().toXDR();
// Mensaje que firma cada llave: sha256(DOMINIO ‖ XDR(ScVal de la wallet) ‖ modo ‖ payload).
const message = (wallet, mode, payload) => sha(Buffer.concat([DOMAIN, walletXdr(wallet), Buffer.from([mode]), payload]));
// Prueba de posesion: sha256(DOMINIO ‖ XDR(wallet) ‖ "add-signer" ‖ id).
const possessionMessage = (wallet, id) => sha(Buffer.concat([DOMAIN, walletXdr(wallet), Buffer.from('add-signer'), id]));

// ---------- estado ----------
function loadState() {
  if (!existsSync(STATE)) throw new Error(`no hay estado en ${STATE}: corre primero prepare`);
  return JSON.parse(readFileSync(STATE, 'utf8'));
}
function saveState(s) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2));
  log(`\n   estado guardado en ${STATE}`);
}

const server = new rpc.Server(RPC);
let S; // estado de la corrida
function check(step, ok, detail = '') {
  S.checks.push({ step, ok, detail });
  log(`   ${ok ? 'OK   ' : 'FALLO'} ${step}${detail ? ' · ' + detail : ''}`);
}

async function fund(kp) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}

// Ultimo ledger. Un corte del RPC no debe tirar la demo: se reintenta.
async function latest() {
  for (let i = 0; ; i++) {
    try {
      return (await server.getLatestLedger()).sequence;
    } catch (e) {
      if (i >= 10) throw e;
      log(`   getLatestLedger fallo (${e.code || e.message}); reintento`);
      await sleep(5000);
    }
  }
}

// ---------- pruebas (ScVal) ----------
// Proof::Ed25519(Ed25519Proof { id, sig }).
const ed25519Proof = (id, sig) => xdr.ScVal.scvVec([
  xdr.ScVal.scvSymbol('Ed25519'),
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('id'), val: xdr.ScVal.scvBytes(id) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('sig'), val: xdr.ScVal.scvBytes(sig) }),
  ]),
]);
// Proof::Passkey(PasskeyProof { id, authenticator_data, client_data_json, sig }). Las llaves del mapa
// van en orden: authenticator_data < client_data_json < id < sig.
const passkeyProof = (id, as) => xdr.ScVal.scvVec([
  xdr.ScVal.scvSymbol('Passkey'),
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('authenticator_data'), val: xdr.ScVal.scvBytes(unhex(as.authenticator_data)) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('client_data_json'), val: xdr.ScVal.scvBytes(unhex(as.client_data_json)) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('id'), val: xdr.ScVal.scvBytes(id) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('sig'), val: xdr.ScVal.scvBytes(unhex(as.sig)) }),
  ]),
]);

// Payload de una autorizacion: sha256(HashIdPreimage::SorobanAuthorization{networkId, nonce, exp, invocation}).
function authPayload(entry) {
  const addr = entry.credentials().address();
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(PASS)),
      nonce: addr.nonce(),
      signatureExpirationLedger: addr.signatureExpirationLedger(),
      invocation: entry.rootInvocation(),
    }),
  );
  return hash(preimage.toXDR());
}

// Firma la autorizacion de la wallet con las llaves ed25519 de `keys` (Vec<Proof>), como demo.mjs.
async function signEd25519(entry, keys) {
  const creds = entry.credentials();
  if (creds.switch().name !== 'sorobanCredentialsAddress') return entry;
  const addr = creds.address();
  addr.signatureExpirationLedger((await latest()) + 100);
  const wallet = Address.fromScAddress(addr.address()).toString();
  const msg = message(wallet, MODE_OWNER, authPayload(entry));
  addr.signature(xdr.ScVal.scvVec(keys.map((k) => ed25519Proof(signerId(k.rawPublicKey()), k.sign(msg)))));
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

const build = (account, op) => new TransactionBuilder(account, { fee: '1000000', networkPassphrase: PASS }).addOperation(op).setTimeout(60).build();

// Simula (con las autorizaciones que ya trae `tx`), arma, firma con el relayer y manda.
async function submit(label, sourceKp, tx) {
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    const err = new Error('simulacion: ' + sim.error);
    err.diag = diagErrors(sim.events);
    throw err;
  }
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(sourceKp);
  const res = await server.sendTransaction(prepared);
  if (res.status === 'ERROR') throw new Error('envio: ' + JSON.stringify(res.errorResult));
  const final = await server.pollTransaction(res.hash, { attempts: 30 });
  if (final.status !== 'SUCCESS') throw new Error(`tx ${res.hash} ${final.status}`);
  S.txs.push({ label, hash: res.hash });
  log(`   ${label}`, explorer(res.hash));
  return { hash: res.hash, ledger: final.ledger, value: final.returnValue ? scValToNative(final.returnValue) : undefined };
}

// Manda una transaccion. Si `keys` viene, firma las autorizaciones de la wallet con esas llaves
// ed25519 y re-simula con las entradas firmadas.
async function send(label, sourceKp, op, keys) {
  let account = await server.getAccount(sourceKp.publicKey());
  let tx = build(account, op);
  if (keys) {
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error('simulacion: ' + sim.error);
    const auth = [];
    for (const e of sim.result.auth) auth.push(await signEd25519(e, keys));
    account = await server.getAccount(sourceKp.publicKey());
    tx = build(account, Operation.invokeHostFunction({ func: tx.operations[0].func, auth }));
  }
  return submit(label, sourceKp, tx);
}

// Manda una funcion con autorizaciones ya firmadas (las del passkey).
async function sendSigned(label, sourceKp, func, auth) {
  const account = await server.getAccount(sourceKp.publicKey());
  return submit(label, sourceKp, build(account, Operation.invokeHostFunction({ func, auth })));
}

// Tiene que fallar con `code`. Devuelve el texto del error.
async function mustFail(step, code, fn) {
  try {
    const r = await fn();
    check(step, false, `paso y no debia (${r.hash})`);
    return null;
  } catch (e) {
    const text = String(e.message);
    const want = `Error(Contract, #${code})`;
    const inMsg = text.includes(want);
    const inDiag = (e.diag || []).some((d) => d.includes(want));
    check(step, inMsg || inDiag, `${want} ${inMsg ? 'en el error' : inDiag ? 'en los eventos de diagnostico' : 'NO aparece'}`);
    log('     error:', text.split('\n')[0].slice(0, 300));
    for (const l of text.split('\n').filter((l) => l.includes('Contract, #')).slice(0, 3)) log('     |', l.trim().slice(0, 300));
    if (e.diag?.length) log('     diagnostico:', e.diag.join(' | '));
    return { text, diag: e.diag };
  }
}

async function readRaw(contractId, fn, ...a) {
  const kp = Keypair.random();
  const acc = new sdk.Account(kp.publicKey(), '0');
  const tx = new TransactionBuilder(acc, { fee: '100', networkPassphrase: PASS })
    .addOperation(new Contract(contractId).call(fn, ...a)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${fn}: ${sim.error}`);
  return sim.result.retval;
}
const read = async (...a) => scValToNative(await readRaw(...a));
const balance = async (a) => BigInt(await read(XLM, 'balance', new Address(a).toScVal()));
const fmt = (s) => (Number(s) / 1e7).toFixed(7);
const bytes = (b) => nativeToScVal(b, { type: 'bytes' });
const u32 = (n) => nativeToScVal(n, { type: 'u32' });
const i128 = (n) => nativeToScVal(n, { type: 'i128' });
const xferOp = (from, to, amt) => new Contract(XLM).call('transfer', new Address(from).toScVal(), new Address(to).toScVal(), i128(amt));

// passkeys(): Map<BytesN<32>, Passkey> crudo → [{ id, key, credential_id, weight }].
async function passkeyList(wallet) {
  const v = await readRaw(wallet, 'passkeys');
  return (v.map() || []).map((e) => {
    const f = Object.fromEntries(e.val().map().map((m) => [m.key().sym().toString(), m.val()]));
    return {
      id: hex(e.key().bytes()),
      key: hex(f.key.bytes()),
      credential_id: hex(f.credential_id.bytes()),
      weight: f.weight.u32(),
    };
  });
}

// ---------- aserciones ----------
// Lee una asercion para `challenge` (hex): salida completa de passkey.html o un solo objeto.
function loadAssertion(file, challenge) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const list = Array.isArray(j.assertions) ? j.assertions : j.challenge ? [j] : [];
  const hits = list.filter((a) => String(a.challenge).toLowerCase() === challenge);
  if (!hits.length) {
    const seen = list.map((a) => a.challenge).join(', ') || 'ninguna';
    throw new Error(`${file} no tiene una asercion para el challenge ${challenge} (challenges en el archivo: ${seen})`);
  }
  const a = hits[hits.length - 1];
  for (const k of ['authenticator_data', 'client_data_json', 'sig']) {
    if (!/^([0-9a-f]{2})+$/i.test(String(a[k] || ''))) throw new Error(`asercion: ${k} no es hex`);
  }
  if (unhex(a.sig).length !== 64) throw new Error(`asercion: sig tiene ${unhex(a.sig).length} bytes, no 64`);
  log(`   asercion de ${file} (${hits.length} con ese challenge, se usa la ultima)`);
  log('   client_data_json:', unhex(a.client_data_json).toString('utf8'));
  return a;
}

// Verificacion local (node:crypto) de la asercion, antes de gastar una transaccion: misma formula
// que verify_passkey. Solo informa; quien decide es el contrato.
function localVerify(key65, challenge, a) {
  const ad = unhex(a.authenticator_data);
  const cdj = unhex(a.client_data_json);
  const okRp = ad.subarray(0, 32).equals(sha(Buffer.from(RP_ID)));
  const flags = ad[32];
  const okFlags = (flags & 0x05) === 0x05;
  const head = `{"type":"webauthn.get","challenge":"${unhex(challenge).toString('base64url')}","origin":"${ORIGIN}"`;
  const okCdj = cdj.toString('utf8').startsWith(head) && [',', '}'].includes(cdj.toString('utf8')[head.length]);
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: key65.subarray(1, 33).toString('base64url'), y: key65.subarray(33).toString('base64url') }, format: 'jwk' });
  const okSig = ecVerify('sha256', Buffer.concat([ad, sha(cdj)]), { key: pub, dsaEncoding: 'ieee-p1363' }, unhex(a.sig));
  const sv = BigInt('0x' + a.sig.slice(64));
  const okLow = sv <= N / 2n;
  log(`   verificacion local: rpIdHash ${okRp ? 'ok' : 'MAL'} · banderas 0x${flags.toString(16).padStart(2, '0')} ${okFlags ? 'ok' : 'MAL (falta UP o UV)'} · client_data ${okCdj ? 'ok' : 'MAL'} · firma ${okSig ? 'ok' : 'MAL'} · S ${okLow ? 'baja' : 'ALTA'}`);
  return okRp && okFlags && okCdj && okSig && okLow;
}

// --fake: firma como un navegador en http://localhost:8080.
const N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
function fakeAssert(fake, challenge) {
  fake.counter += 1;
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(fake.counter);
  // rpIdHash ‖ banderas UP|UV ‖ contador.
  const ad = Buffer.concat([sha(Buffer.from(RP_ID)), Buffer.from([0x05]), counter]);
  const cdj = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: unhex(challenge).toString('base64url'), origin: ORIGIN, crossOrigin: false }));
  const raw = ecSign('sha256', Buffer.concat([ad, sha(cdj)]), { key: createPrivateKey(fake.pem), dsaEncoding: 'ieee-p1363' });
  let s = BigInt('0x' + hex(raw.subarray(32)));
  if (s > N / 2n) s = N - s;
  return {
    challenge,
    authenticator_data: hex(ad),
    client_data_json: hex(cdj),
    client_data_json_text: cdj.toString('utf8'),
    sig: hex(raw.subarray(0, 32)) + s.toString(16).padStart(64, '0'),
  };
}
// Escribe la salida como la de passkey.html: con una asercion de otro challenge antes, para probar
// que se elige la correcta.
function fakeFile(name, fake, challenge) {
  const page = { origin: ORIGIN, rp_id: RP_ID, key: S.key, credential_id: S.credential_id, assertions: [fakeAssert(fake, '42'.repeat(32)), fakeAssert(fake, challenge)] };
  const file = join(dirname(STATE), name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(page, null, 2));
  log(`   --fake: asercion escrita en ${file}`);
  return file;
}

// ---------- prepare ----------
async function prepare() {
  S = { fake: FAKE, txs: [], checks: [] };
  if (FAKE) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    S.key = hex(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
    S.credential_id = hex(randomBytes(32));
    S.fakeKey = { pem: privateKey.export({ format: 'pem', type: 'pkcs8' }), counter: 0 };
    log('--fake: passkey P-256 generado en node:crypto');
  } else {
    if (!FILE) throw new Error('falta <passkey.json>');
    const pk = JSON.parse(readFileSync(FILE, 'utf8'));
    S.key = String(pk.key).toLowerCase();
    S.credential_id = String(pk.credential_id).toLowerCase();
  }
  const key = unhex(S.key);
  if (key.length !== 65 || key[0] !== 4) throw new Error('key tiene que ser 65 bytes sin comprimir (04 ‖ x ‖ y)');
  if (!S.credential_id || unhex(S.credential_id).length === 0) throw new Error('falta credential_id');

  const net = await server.getNetwork();
  if (net.passphrase !== PASS) throw new Error('El RPC no es testnet: ' + net.passphrase);

  const relayer = Keypair.random();
  const agente = Keypair.random();
  const a = Keypair.random(); // llave del dueno; no es cuenta de Stellar
  await fund(relayer); await fund(agente);
  Object.assign(S, { relayer: relayer.secret(), agente: agente.secret(), a: a.secret() });
  S.passkey_id = hex(passkeyId(key));
  log('relayer   ', relayer.publicKey());
  log('agente    ', agente.publicKey());
  log('id a      ', hex(signerId(a.rawPublicKey())));
  log('key       ', S.key);
  log('passkey id', S.passkey_id);

  // 1. Subir el WASM, crear la wallet con a como dueno y darle 5 XLM.
  log('\n1. crear la wallet');
  const wasm = readFileSync(WASM);
  const wasmHash = sha(wasm);
  S.wasm_hash = hex(wasmHash);
  log('   wasm hash', S.wasm_hash);
  await send('upload wasm', relayer, Operation.uploadContractWasm({ wasm }));
  const created = await send('crear wallet', relayer, Operation.createCustomContract({
    address: new Address(relayer.publicKey()),
    wasmHash,
    salt: randomBytes(32),
    constructorArgs: [bytes(a.rawPublicKey())],
  }));
  const wallet = created.value;
  S.wallet = wallet;
  log('   wallet', wallet);
  await send('fondeo 5 XLM', relayer, xferOp(relayer.publicKey(), wallet, 5n * XLM1));
  const saldo = await balance(wallet);
  check('1. wallet con 5 XLM', saldo === 5n * XLM1, fmt(saldo));

  // 2. W6 set_webauthn(sha256("localhost"), ["http://localhost:8080"]) firmado por a.
  log(`\n2. W6 set_webauthn(sha256("${RP_ID}"), ["${ORIGIN}"]) con a`);
  await send('set_webauthn', relayer, new Contract(wallet).call('set_webauthn',
    bytes(sha(Buffer.from(RP_ID))), xdr.ScVal.scvVec([bytes(Buffer.from(ORIGIN))])), [a]);
  check('2. set_webauthn', true);

  // Challenge 1: la prueba de posesion del passkey.
  S.challenge1 = hex(possessionMessage(wallet, passkeyId(key)));
  log('\n===== challenge 1 (prueba de posesion) =====');
  log(S.challenge1);
  if (FAKE) fakeFile('asercion1-fake.json', S.fakeKey, S.challenge1);
  saveState(S);
  log(`\nsiguiente: firmar el challenge 1 en ${ORIGIN}/passkey.html y correr "add <asercion1.json>"`);
}

// ---------- add ----------
async function add() {
  S = loadState();
  if (S.challenge2_done) throw new Error('add ya se corrio con este estado');
  const file = FAKE && !FILE ? join(dirname(STATE), 'asercion1-fake.json') : FILE;
  if (!file) throw new Error('falta <asercion1.json>');
  const relayer = Keypair.fromSecret(S.relayer);
  const agente = Keypair.fromSecret(S.agente);
  const a = Keypair.fromSecret(S.a);
  const key = unhex(S.key);
  const wallet = S.wallet;

  // 3. W6 add_passkey(key, credential_id, 1, …) firmado por a.
  log('\n3. W6 add_passkey(key, credential_id, 1) con a y la asercion del challenge 1');
  log('   challenge 1', S.challenge1);
  const as1 = loadAssertion(file, S.challenge1);
  localVerify(key, S.challenge1, as1);
  const r = await send('add_passkey', relayer, new Contract(wallet).call('add_passkey',
    bytes(key), bytes(unhex(S.credential_id)), u32(1),
    bytes(unhex(as1.authenticator_data)), bytes(unhex(as1.client_data_json)), bytes(unhex(as1.sig))), [a]);
  check('3. add_passkey devuelve passkey_id', hex(r.value) === S.passkey_id, hex(r.value));
  const pks = await passkeyList(wallet);
  const mine = pks.find((p) => p.id === S.passkey_id);
  check('3. passkeys() tiene el passkey (peso 1, misma llave y credential_id)',
    pks.length === 1 && !!mine && mine.weight === 1 && mine.key === S.key && mine.credential_id === S.credential_id,
    `${pks.length} passkey(s)`);

  // 4. Transfer de 1 XLM (wallet → agente) y su autorizacion: nonce al azar, vence en latest + 1000.
  log('\n4. armar el transfer de 1 XLM wallet → agente');
  const { entry, func, exp } = await buildTransfer(relayer, wallet, agente.publicKey(), XLM1);
  const payload = authPayload(entry);
  S.transfer = {
    amount: XLM1.toString(),
    func: func.toXDR('base64'),
    entry: entry.toXDR('base64'),
    nonce: entry.credentials().address().nonce().toString(),
    exp,
    payload: hex(payload),
  };
  S.agente_antes = (await balance(agente.publicKey())).toString();
  S.challenge2 = hex(message(wallet, MODE_OWNER, payload));
  S.challenge2_done = true;
  log(`   nonce ${S.transfer.nonce} · vence en el ledger ${exp}`);
  log('   payload', S.transfer.payload);
  log('\n===== challenge 2 (transfer de 1 XLM) =====');
  log(S.challenge2);
  if (FAKE) fakeFile('asercion2-fake.json', S.fakeKey, S.challenge2);
  saveState(S);
  log(`\nsiguiente: firmar el challenge 2 en ${ORIGIN}/passkey.html y correr "send <asercion2.json>" antes del ledger ${exp}`);
}

// Simula el transfer para obtener la autorizacion de la wallet; pone un nonce al azar y vence en
// latest + EXP_LEDGERS.
async function buildTransfer(relayer, wallet, to, amount) {
  const account = await server.getAccount(relayer.publicKey());
  const tx = build(account, xferOp(wallet, to, amount));
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error('simulacion: ' + sim.error);
  const entries = sim.result.auth.filter((e) => e.credentials().switch().name === 'sorobanCredentialsAddress');
  if (entries.length !== 1) throw new Error(`se esperaba 1 autorizacion de la wallet, hay ${entries.length}`);
  const entry = entries[0];
  const addr = entry.credentials().address();
  if (Address.fromScAddress(addr.address()).toString() !== wallet) throw new Error('la autorizacion no es de la wallet');
  const nonce = BigInt('0x' + hex(randomBytes(8))) & 0x7fffffffffffffffn;
  addr.nonce(xdr.Int64.fromString(nonce.toString()));
  const exp = (await latest()) + EXP_LEDGERS;
  addr.signatureExpirationLedger(exp);
  return { entry, func: tx.operations[0].func, exp };
}

// ---------- send ----------
async function sendCmd() {
  S = loadState();
  if (!S.transfer) throw new Error('falta correr add');
  if (S.sent) throw new Error('send ya se corrio con este estado');
  const file = FAKE && !FILE ? join(dirname(STATE), 'asercion2-fake.json') : FILE;
  if (!file) throw new Error('falta <asercion2.json>');
  const relayer = Keypair.fromSecret(S.relayer);
  const agente = Keypair.fromSecret(S.agente);
  const key = unhex(S.key);
  const id = unhex(S.passkey_id);

  log('\n5. W7 transfer de 1 XLM firmado solo por el passkey');
  log('   challenge 2', S.challenge2);
  const now = await latest();
  if (now >= S.transfer.exp) throw new Error(`la autorizacion vencio (ledger ${now} >= ${S.transfer.exp}): corre prepare de nuevo`);
  log(`   ledger ${now}; la autorizacion vence en el ${S.transfer.exp}`);
  const as2 = loadAssertion(file, S.challenge2);
  localVerify(key, S.challenge2, as2);
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(S.transfer.entry, 'base64');
  const func = xdr.HostFunction.fromXDR(S.transfer.func, 'base64');
  // El payload guardado tiene que ser el de la entrada guardada.
  if (hex(authPayload(entry)) !== S.transfer.payload) throw new Error('la entrada guardada no corresponde al payload');
  entry.credentials().address().signature(xdr.ScVal.scvVec([passkeyProof(id, as2)]));
  const antes = BigInt(S.agente_antes);
  await sendSigned('transfer 1 XLM (passkey)', relayer, func, [entry]);
  const despues = await balance(agente.publicKey());
  check('5. el agente subio 1 XLM exacto', despues - antes === XLM1, `${fmt(antes)} → ${fmt(despues)} (+${fmt(despues - antes)})`);
  S.sent = true;

  // 6. La misma asercion para otro payload (transfer de 2 XLM): #49 WebAuthnFailed.
  log('\n6. la misma asercion sobre un transfer de 2 XLM');
  const other = await buildTransfer(relayer, S.wallet, agente.publicKey(), 2n * XLM1);
  other.entry.credentials().address().signature(xdr.ScVal.scvVec([passkeyProof(id, as2)]));
  const err6 = await mustFail('6. asercion reusada en otro payload falla con #49', 49,
    () => sendSigned('transfer 2 XLM (asercion reusada)', relayer, other.func, [other.entry]));
  S.err6 = err6 ? err6.text.split('\n')[0] : null;
  S.diag6 = err6?.diag || [];
  saveState(S);

  // Resumen.
  log('\n===== resumen =====');
  log('modo       ', S.fake ? '--fake (llave P-256 de node:crypto)' : 'passkey real');
  log('wallet     ', S.wallet);
  log('wasm hash  ', S.wasm_hash);
  log('passkey id ', S.passkey_id);
  log('saldo final', fmt(await balance(S.wallet)), 'XLM');
  log('\ntransacciones:');
  for (const t of S.txs) log(`  ${t.label.padEnd(26)} ${t.hash}  ${explorer(t.hash)}`);
  log('\nerror paso 6:', S.err6 || '-');
  if (S.diag6.length) log('  diagnostico 6:', S.diag6.join(' | '));
  log('\nchequeos:');
  for (const c of S.checks) log(`  ${c.ok ? 'OK   ' : 'FALLO'} ${c.step}`);
  const fallos = S.checks.filter((c) => !c.ok).length;
  log(fallos ? `\n${fallos} chequeo(s) fallaron` : '\ntodo OK');
  if (fallos) process.exitCode = 1;
}

const cmds = { prepare, add, send: sendCmd };
if (!cmds[CMD]) {
  console.error('uso: node scripts/demo-passkey.mjs <sdk> prepare <passkey.json> | add <asercion1.json> | send <asercion2.json> [--fake] [--state <ruta>]');
  process.exit(2);
}
cmds[CMD]().catch((e) => {
  console.error(e);
  // Guarda lo que haya (tx y chequeos) para no perderlo.
  if (S && CMD !== 'prepare') { try { saveState(S); } catch { /* nada */ } }
  process.exitCode = 1;
});
