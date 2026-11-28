#![cfg(test)]
extern crate std;

use super::*;
use ed25519_dalek::{Signer as _, SigningKey};
use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contractimpl, symbol_short, token,
    testutils::{Address as _, BytesN as _, Ledger},
    vec, xdr::{self, Limits, ScErrorCode, ScErrorType, WriteXdr}, Address, BytesN, Env, Error, IntoVal, InvokeError, String, Symbol, TryFromVal, Val,
};

fn key(n: u8) -> SigningKey {
    SigningKey::from_bytes(&[n; 32])
}

fn pk(env: &Env, k: &SigningKey) -> BytesN<32> {
    BytesN::from_array(env, &k.verifying_key().to_bytes())
}

fn setup<'a>(env: &'a Env, owner: &SigningKey) -> (Address, SmartWalletClient<'a>) {
    let wallet = env.register(SmartWallet, (pk(env, owner),));
    let client = SmartWalletClient::new(env, &wallet);
    (wallet, client)
}

/// Prueba de firma de `k` sobre el mensaje de la wallet para `payload`.
fn proof(env: &Env, wallet: &Address, k: &SigningKey, payload: &Hash<32>) -> Proof {
    let msg = message(env, wallet, MODE_OWNER, payload);
    Proof::Ed25519(Ed25519Proof {
        id: signer_id(env, &pk(env, k)),
        sig: BytesN::from_array(env, &k.sign(&msg.to_array()).to_bytes()),
    })
}

/// Prueba de posesion de `k` para agregarla a `wallet` (W3).
fn pop(env: &Env, wallet: &Address, k: &SigningKey) -> BytesN<64> {
    let msg = possession_message(env, wallet, &signer_id(env, &pk(env, k)));
    BytesN::from_array(env, &k.sign(&msg.to_array()).to_bytes())
}

fn check(env: &Env, wallet: &Address, payload: &Hash<32>, proofs: Vec<Proof>) -> Result<(), Result<WalletError, soroban_sdk::InvokeError>> {
    env.try_invoke_contract_check_auth::<WalletError>(wallet, &payload.to_bytes(), proofs.into_val(env), &vec![env])
}

/// Lo que devuelve el cliente cuando falta la firma de la wallet: `Error(Auth, InvalidAction)`.
fn auth_error() -> InvokeError {
    Error::from_type_and_code(ScErrorType::Auth, ScErrorCode::InvalidAction).into()
}

fn payload(env: &Env) -> Hash<32> {
    env.crypto().sha256(&BytesN::<32>::random(env).into())
}

// ---------- W1: constructor ----------

#[test]
fn w1_constructor_un_firmante_umbral_1() {
    let env = Env::default();
    let owner = key(1);
    let (_, c) = setup(&env, &owner);
    assert_eq!(c.threshold(), 1);
    let s = c.signers();
    assert_eq!(s.len(), 1);
    let only = s.get(signer_id(&env, &pk(&env, &owner))).unwrap();
    assert_eq!(only, Signer { key: pk(&env, &owner), weight: 1 });
}

// ---------- W2: __check_auth ----------

#[test]
fn w2_acepta_la_firma_del_dueno() {
    let env = Env::default();
    let owner = key(1);
    let (w, _) = setup(&env, &owner);
    let p = payload(&env);
    assert_eq!(check(&env, &w, &p, vec![&env, proof(&env, &w, &owner, &p)]), Ok(()));
}

#[test]
fn w2_sin_pruebas_falla() {
    let env = Env::default();
    let (w, _) = setup(&env, &key(1));
    let p = payload(&env);
    assert_eq!(check(&env, &w, &p, vec![&env]), Err(Ok(WalletError::NoProofs)));
}

#[test]
fn w2_llave_desconocida_falla() {
    let env = Env::default();
    let (w, _) = setup(&env, &key(1));
    let p = payload(&env);
    assert_eq!(
        check(&env, &w, &p, vec![&env, proof(&env, &w, &key(9), &p)]),
        Err(Ok(WalletError::UnknownSigner))
    );
}

#[test]
fn w2_firma_de_otro_payload_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _) = setup(&env, &owner);
    let p = payload(&env);
    let otro = payload(&env);
    let r = check(&env, &w, &p, vec![&env, proof(&env, &w, &owner, &otro)]);
    // ed25519_verify aborta (InvokeError::Abort), no devuelve un WalletError.
    assert_eq!(r, Err(Err(InvokeError::Abort)));
}

#[test]
fn w2_firma_sin_dominio_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _) = setup(&env, &owner);
    let p = payload(&env);
    // Firma directa sobre el payload de Soroban, como el spike: ya no sirve.
    let bad = Proof::Ed25519(Ed25519Proof {
        id: signer_id(&env, &pk(&env, &owner)),
        sig: BytesN::from_array(&env, &owner.sign(&p.to_array()).to_bytes()),
    });
    assert_eq!(check(&env, &w, &p, vec![&env, bad]), Err(Err(InvokeError::Abort)));
}

#[test]
fn w2_firma_para_otra_wallet_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w1, _) = setup(&env, &owner);
    let (w2, _) = setup(&env, &owner);
    let p = payload(&env);
    // Misma llave y mismo payload, pero la firma se hizo para w1.
    let para_w1 = proof(&env, &w1, &owner, &p);
    assert_eq!(check(&env, &w1, &p, vec![&env, para_w1.clone()]), Ok(()));
    assert_eq!(check(&env, &w2, &p, vec![&env, para_w1]), Err(Err(InvokeError::Abort)));
}

#[test]
fn w2_umbral_2_una_firma_falla_dos_pasan() {
    let env = Env::default();
    env.mock_all_auths();
    let (a, b) = (key(1), key(2));
    let (w, c) = setup(&env, &a);
    c.add_signer(&pk(&env, &b), &1, &pop(&env, &c.address, &b));
    c.set_threshold(&2);
    let p = payload(&env);
    assert_eq!(
        check(&env, &w, &p, vec![&env, proof(&env, &w, &a, &p)]),
        Err(Ok(WalletError::InsufficientWeight))
    );
    assert_eq!(
        check(&env, &w, &p, vec![&env, proof(&env, &w, &b, &p)]),
        Err(Ok(WalletError::InsufficientWeight))
    );
    assert_eq!(
        check(&env, &w, &p, vec![&env, proof(&env, &w, &a, &p), proof(&env, &w, &b, &p)]),
        Ok(())
    );
}

#[test]
fn w2_la_misma_firma_dos_veces_no_suma_doble() {
    let env = Env::default();
    let a = key(1);
    let (w, _) = setup(&env, &a);
    let p = payload(&env);
    let pa = proof(&env, &w, &a, &p);
    assert_eq!(check(&env, &w, &p, vec![&env, pa.clone(), pa]), Err(Ok(WalletError::DuplicateProof)));
}

#[test]
fn w2_pesos_distintos() {
    let env = Env::default();
    env.mock_all_auths();
    let (a, b) = (key(1), key(2));
    let (w, c) = setup(&env, &a);
    c.add_signer(&pk(&env, &b), &2, &pop(&env, &c.address, &b));
    c.set_threshold(&2);
    let p = payload(&env);
    // b pesa 2: basta solo; a pesa 1: no basta.
    assert_eq!(check(&env, &w, &p, vec![&env, proof(&env, &w, &b, &p)]), Ok(()));
    assert_eq!(
        check(&env, &w, &p, vec![&env, proof(&env, &w, &a, &p)]),
        Err(Ok(WalletError::InsufficientWeight))
    );
}

#[test]
fn w2_firma_en_modo_sesion_no_sirve_como_dueno() {
    let env = Env::default();
    let owner = key(1);
    let (w, _) = setup(&env, &owner);
    let p = payload(&env);
    let msg = message(&env, &w, 1, &p);
    let como_sesion = Proof::Ed25519(Ed25519Proof {
        id: signer_id(&env, &pk(&env, &owner)),
        sig: BytesN::from_array(&env, &owner.sign(&msg.to_array()).to_bytes()),
    });
    assert_eq!(check(&env, &w, &p, vec![&env, como_sesion]), Err(Err(InvokeError::Abort)));
}

#[test]
fn w2_id_inventado_para_una_llave_valida_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _) = setup(&env, &owner);
    let p = payload(&env);
    let good = proof(&env, &w, &owner, &p);
    let Proof::Ed25519(g) = good.clone() else { unreachable!() };
    // Misma llave y misma firma, otro id: el id no lo elige quien firma.
    let forged = Proof::Ed25519(Ed25519Proof { id: BytesN::from_array(&env, &[1u8; 32]), sig: g.sig });
    assert_eq!(check(&env, &w, &p, vec![&env, forged.clone()]), Err(Ok(WalletError::UnknownSigner)));
    assert_eq!(check(&env, &w, &p, vec![&env, good, forged]), Err(Ok(WalletError::UnknownSigner)));
}

#[test]
fn w2_demasiadas_pruebas_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _) = setup(&env, &owner);
    let p = payload(&env);
    let mut proofs = Vec::new(&env);
    for _ in 0..=MAX_SIGNERS {
        proofs.push_back(proof(&env, &w, &owner, &p));
    }
    assert_eq!(check(&env, &w, &p, proofs), Err(Ok(WalletError::TooManyProofs)));
}

/// Vector compartido con `scripts/demo.mjs` (`node scripts/demo.mjs --vector`):
/// los mismos bytes en Rust y en JS.
#[test]
fn w2_vector_compartido_rust_js() {
    let env = Env::default();
    let wallet = Address::from_string(&String::from_str(
        &env,
        "CBOGBTLM6PLRFCCAYI5W575J7M7IJNZLEI4N4OP6XHSKCC7J7SZH4XQB",
    ));
    let payload: Hash<32> = env.crypto().sha256(&Bytes::from_array(&env, &[1u8; 32]));
    let msg = message(&env, &wallet, MODE_OWNER, &payload);
    assert_eq!(msg.to_array(), VECTOR_MSG);
    assert_eq!(signer_id(&env, &pk(&env, &key(1))).to_array(), VECTOR_ID);
}

// Bytes calculados con scripts/demo.mjs --vector.
const VECTOR_MSG: [u8; 32] = [234, 124, 192, 223, 9, 210, 223, 21, 37, 7, 244, 101, 75, 224, 56, 160, 47, 108, 220, 24, 121, 178, 32, 152, 134, 149, 250, 143, 238, 141, 201, 135];
const VECTOR_ID: [u8; 32] = [197, 244, 45, 76, 158, 13, 224, 53, 80, 246, 173, 157, 79, 216, 2, 139, 111, 43, 80, 12, 220, 65, 190, 193, 155, 254, 17, 173, 41, 167, 11, 159];

// ---------- W3: add_signer ----------

#[test]
fn w3_agrega_y_deriva_el_id() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let id = c.add_signer(&pk(&env, &key(2)), &3, &pop(&env, &c.address, &key(2)));
    assert_eq!(id, signer_id(&env, &pk(&env, &key(2))));
    assert_eq!(c.signers().get(id).unwrap().weight, 3);
}

#[test]
fn w3_sin_firma_de_la_wallet_falla() {
    let env = Env::default();
    let (_, c) = setup(&env, &key(1));
    let r = c.try_add_signer(&pk(&env, &key(2)), &1, &pop(&env, &c.address, &key(2)));
    assert_eq!(r.err(), Some(Err(auth_error())));
    assert_eq!(c.signers().len(), 1);
}

#[test]
fn w3_sin_prueba_de_posesion_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    // Una llave que nadie tiene no puede dar la prueba: no entra y no puede bloquear la wallet.
    let fantasma = BytesN::from_array(&env, &[0xffu8; 32]);
    let firma_cualquiera = pop(&env, &c.address, &key(2));
    assert_eq!(c.try_add_signer(&fantasma, &5, &firma_cualquiera), Err(Err(InvokeError::Abort)));
    // La prueba de la llave correcta, pero hecha para otra wallet, tampoco sirve.
    let (_, otra) = setup(&env, &key(1));
    let de_otra = pop(&env, &otra.address, &key(2));
    assert_eq!(c.try_add_signer(&pk(&env, &key(2)), &1, &de_otra), Err(Err(InvokeError::Abort)));
    assert_eq!(c.signers().len(), 1);
}

#[test]
fn w3_llave_ya_usada_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    assert_eq!(c.try_add_signer(&pk(&env, &key(1)), &1, &pop(&env, &c.address, &key(1))), Err(Ok(WalletError::KeyUsed)));
}

#[test]
fn w3_peso_0_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    assert_eq!(c.try_add_signer(&pk(&env, &key(2)), &0, &pop(&env, &c.address, &key(2))), Err(Ok(WalletError::InvalidWeight)));
}

#[test]
fn w3_desbordar_el_peso_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    assert_eq!(c.try_add_signer(&pk(&env, &key(2)), &u32::MAX, &pop(&env, &c.address, &key(2))), Err(Ok(WalletError::Overflow)));
}

#[test]
fn w3_tope_de_firmantes() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    for n in 2..=(MAX_SIGNERS as u8) {
        c.add_signer(&pk(&env, &key(n)), &1, &pop(&env, &c.address, &key(n)));
    }
    assert_eq!(c.try_add_signer(&pk(&env, &key(200)), &1, &pop(&env, &c.address, &key(200))), Err(Ok(WalletError::TooManySigners)));
}

// ---------- W4: remove_signer ----------

#[test]
fn w4_quita_y_el_quitado_ya_no_firma() {
    let env = Env::default();
    env.mock_all_auths();
    let (a, b) = (key(1), key(2));
    let (w, c) = setup(&env, &a);
    let id_b = c.add_signer(&pk(&env, &b), &1, &pop(&env, &c.address, &b));
    c.remove_signer(&id_b);
    assert_eq!(c.signers().len(), 1);
    let p = payload(&env);
    assert_eq!(
        check(&env, &w, &p, vec![&env, proof(&env, &w, &b, &p)]),
        Err(Ok(WalletError::UnknownSigner))
    );
    // La llave queda libre: se puede volver a agregar.
    c.add_signer(&pk(&env, &b), &1, &pop(&env, &c.address, &b));
}

#[test]
fn w4_no_quita_el_ultimo() {
    let env = Env::default();
    env.mock_all_auths();
    let a = key(1);
    let (_, c) = setup(&env, &a);
    assert_eq!(c.try_remove_signer(&signer_id(&env, &pk(&env, &a))), Err(Ok(WalletError::LastSigner)));
}

#[test]
fn w4_no_deja_el_umbral_inalcanzable() {
    let env = Env::default();
    env.mock_all_auths();
    let (a, b) = (key(1), key(2));
    let (_, c) = setup(&env, &a);
    let id_b = c.add_signer(&pk(&env, &b), &1, &pop(&env, &c.address, &b));
    c.set_threshold(&2);
    assert_eq!(c.try_remove_signer(&id_b), Err(Ok(WalletError::ThresholdUnreachable)));
}

#[test]
fn w4_desconocido_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    assert_eq!(c.try_remove_signer(&BytesN::random(&env)), Err(Ok(WalletError::UnknownSigner)));
}

#[test]
fn w4_sin_firma_de_la_wallet_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let id_b = c.add_signer(&pk(&env, &key(2)), &1, &pop(&env, &c.address, &key(2)));
    env.set_auths(&[]);
    assert_eq!(c.try_remove_signer(&id_b).err(), Some(Err(auth_error())));
    assert_eq!(c.signers().len(), 2);
}

// ---------- W5: set_threshold ----------

#[test]
fn w5_cambia_el_umbral() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    c.add_signer(&pk(&env, &key(2)), &1, &pop(&env, &c.address, &key(2)));
    c.set_threshold(&2);
    assert_eq!(c.threshold(), 2);
}

#[test]
fn w5_cero_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    assert_eq!(c.try_set_threshold(&0), Err(Ok(WalletError::InvalidThreshold)));
}

#[test]
fn w5_mayor_que_la_suma_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    c.add_signer(&pk(&env, &key(2)), &1, &pop(&env, &c.address, &key(2)));
    assert_eq!(c.try_set_threshold(&3), Err(Ok(WalletError::ThresholdUnreachable)));
}

#[test]
fn w5_sin_firma_de_la_wallet_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    c.add_signer(&pk(&env, &key(2)), &1, &pop(&env, &c.address, &key(2)));
    env.set_auths(&[]);
    assert_eq!(c.try_set_threshold(&2).err(), Some(Err(auth_error())));
    assert_eq!(c.threshold(), 1);
}

// ---------- Autorizacion real (sin mock_all_auths) en W3 y W5 ----------

/// Entrada de autorizacion real para `wallet.fn_name(args)`, firmada por `keys`.
fn signed_entry(env: &Env, wallet: &Address, fn_name: &str, args: Vec<Val>, keys: &[&SigningKey]) -> xdr::SorobanAuthorizationEntry {
    static NONCE: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(1);
    let nonce = NONCE.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let exp = env.ledger().sequence() + 100;
    let invocation = xdr::SorobanAuthorizedInvocation {
        function: xdr::SorobanAuthorizedFunction::ContractFn(xdr::InvokeContractArgs {
            contract_address: wallet.try_into().unwrap(),
            function_name: fn_name.try_into().unwrap(),
            args: args.try_into().unwrap(),
        }),
        sub_invocations: std::vec![].try_into().unwrap(),
    };
    let pre = xdr::HashIdPreimage::SorobanAuthorization(xdr::HashIdPreimageSorobanAuthorization {
        network_id: xdr::Hash(env.ledger().network_id().to_array()),
        nonce,
        signature_expiration_ledger: exp,
        invocation: invocation.clone(),
    });
    let payload = env.crypto().sha256(&Bytes::from_slice(env, &pre.to_xdr(Limits::none()).unwrap()));
    let mut proofs: Vec<Proof> = Vec::new(env);
    for k in keys {
        proofs.push_back(proof(env, wallet, k, &payload));
    }
    let v: Val = proofs.into_val(env);
    xdr::SorobanAuthorizationEntry {
        root_invocation: invocation,
        credentials: xdr::SorobanCredentials::Address(xdr::SorobanAddressCredentials {
            address: wallet.try_into().unwrap(),
            nonce,
            signature_expiration_ledger: exp,
            signature: xdr::ScVal::try_from_val(env, &v).unwrap(),
        }),
    }
}

fn add_args(env: &Env, wallet: &Address, k: &SigningKey, weight: u32) -> Vec<Val> {
    vec![env, pk(env, k).into_val(env), weight.into_val(env), pop(env, wallet, k).into_val(env)]
}

#[test]
fn firma_real_umbral_1_y_luego_2_de_2() {
    let env = Env::default();
    let (a, b, n) = (key(1), key(2), key(3));
    let (w, c) = setup(&env, &a);

    // 1 de 1: a sola agrega a b y sube el umbral.
    env.set_auths(&[signed_entry(&env, &w, "add_signer", add_args(&env, &w, &b, 1), &[&a])]);
    c.add_signer(&pk(&env, &b), &1, &pop(&env, &w, &b));
    env.set_auths(&[signed_entry(&env, &w, "set_threshold", vec![&env, 2u32.into_val(&env)], &[&a])]);
    c.set_threshold(&2);
    assert_eq!(c.threshold(), 2);

    // 2 de 2: a sola ya no puede agregar a n.
    env.set_auths(&[signed_entry(&env, &w, "add_signer", add_args(&env, &w, &n, 5), &[&a])]);
    assert_eq!(c.try_add_signer(&pk(&env, &n), &5, &pop(&env, &w, &n)).err(), Some(Err(InvokeError::Abort)));
    // a y b firmaron otro peso (1): no sirve para agregar con peso 5.
    env.set_auths(&[signed_entry(&env, &w, "add_signer", add_args(&env, &w, &n, 1), &[&a, &b])]);
    assert!(c.try_add_signer(&pk(&env, &n), &5, &pop(&env, &w, &n)).is_err());
    assert_eq!(c.signers().len(), 2);
    // a y b sobre los argumentos correctos: pasa.
    env.set_auths(&[signed_entry(&env, &w, "add_signer", add_args(&env, &w, &n, 5), &[&a, &b])]);
    c.add_signer(&pk(&env, &n), &5, &pop(&env, &w, &n));
    assert_eq!(c.signers().len(), 3);
}

// ---------- W17: limites ----------

fn advance(env: &Env, ledgers: u32) {
    env.ledger().with_mut(|l| l.sequence_number += ledgers);
}

#[test]
fn w17_poner_y_bajar_aplica_ya() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let token = Address::generate(&env);
    assert!(c.set_limit(&token, &100));
    assert_eq!(c.limit(&token), Some(100));
    assert!(c.set_limit(&token, &50));
    assert_eq!(c.limit(&token), Some(50));
}

#[test]
fn w17_subir_espera() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let token = Address::generate(&env);
    c.set_limit(&token, &100);
    assert!(!c.set_limit(&token, &500));
    assert_eq!(c.limit(&token), Some(100));
    assert_eq!(c.try_apply_limit(&token), Err(Ok(WalletError::NotReady)));
    advance(&env, DELAY_LEDGERS);
    // Cualquiera la aplica: sin firmas.
    env.set_auths(&[]);
    c.apply_limit(&token);
    assert_eq!(c.limit(&token), Some(500));
    assert_eq!(c.try_apply_limit(&token), Err(Ok(WalletError::NothingPending)));
}

#[test]
fn w17_bajar_cancela_la_subida_pendiente() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let token = Address::generate(&env);
    c.set_limit(&token, &100);
    c.set_limit(&token, &500);
    c.set_limit(&token, &10);
    advance(&env, DELAY_LEDGERS);
    assert_eq!(c.try_apply_limit(&token), Err(Ok(WalletError::NothingPending)));
    assert_eq!(c.limit(&token), Some(10));
}

#[test]
fn w17_negativo_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    assert_eq!(c.try_set_limit(&Address::generate(&env), &-1), Err(Ok(WalletError::InvalidLimit)));
}

#[test]
fn w17_sin_firma_de_la_wallet_falla() {
    let env = Env::default();
    let (_, c) = setup(&env, &key(1));
    let token = Address::generate(&env);
    assert_eq!(c.try_set_limit(&token, &100).err(), Some(Err(auth_error())));
    assert_eq!(c.limit(&token), None);
}

// ---------- W18: escrows registrados ----------

#[test]
fn w18_registrar_espera_y_quitar_aplica_ya() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let (escrow, token) = (Address::generate(&env), Address::generate(&env));
    c.add_escrow(&escrow, &token, &100);
    assert_eq!(c.escrow(&escrow), None);
    assert_eq!(c.try_apply_escrow(&escrow), Err(Ok(WalletError::NotReady)));
    advance(&env, DELAY_LEDGERS);
    env.set_auths(&[]);
    c.apply_escrow(&escrow);
    assert_eq!(c.escrow(&escrow), Some(EscrowRule { token, fee_bps_max: 100 }));
    env.mock_all_auths();
    c.remove_escrow(&escrow);
    assert_eq!(c.escrow(&escrow), None);
    assert_eq!(c.try_remove_escrow(&escrow), Err(Ok(WalletError::UnknownEscrow)));
}

#[test]
fn w18_quitar_borra_el_registro_pendiente() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let (escrow, token) = (Address::generate(&env), Address::generate(&env));
    c.add_escrow(&escrow, &token, &100);
    c.remove_escrow(&escrow);
    advance(&env, DELAY_LEDGERS);
    assert_eq!(c.try_apply_escrow(&escrow), Err(Ok(WalletError::NothingPending)));
}

#[test]
fn w18_comision_mayor_a_100_por_ciento_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    assert_eq!(
        c.try_add_escrow(&Address::generate(&env), &Address::generate(&env), &10_001),
        Err(Ok(WalletError::InvalidFee))
    );
}

#[test]
fn w18_sin_firma_de_la_wallet_falla() {
    let env = Env::default();
    let (_, c) = setup(&env, &key(1));
    let (escrow, token) = (Address::generate(&env), Address::generate(&env));
    assert_eq!(c.try_add_escrow(&escrow, &token, &100).err(), Some(Err(auth_error())));
}

// ---------- W19: reglas de tokens y escrow en __check_auth ----------

fn call(env: &Env, contract: &Address, f: &str, args: Vec<Val>) -> Context {
    Context::Contract(ContractContext { contract: contract.clone(), fn_name: Symbol::new(env, f), args })
}

fn transfer_ctx(env: &Env, token: &Address, from: &Address, to: &Address, amount: i128) -> Context {
    call(env, token, "transfer", vec![env, from.into_val(env), to.into_val(env), amount.into_val(env)])
}

fn lock_ctx(env: &Env, escrow: &Address, seller: &Address, amount: i128, fee: i128) -> Context {
    let buyer = Address::generate(env);
    let hash = BytesN::<32>::random(env);
    call(env, escrow, "lock", vec![
        env,
        seller.into_val(env),
        buyer.into_val(env),
        amount.into_val(env),
        fee.into_val(env),
        hash.into_val(env),
        30u32.into_val(env),
    ])
}

/// Firma real del dueno sobre `contexts`.
fn check_ctx(env: &Env, w: &Address, owner: &SigningKey, contexts: Vec<Context>) -> Result<(), Result<WalletError, InvokeError>> {
    let p = payload(env);
    env.try_invoke_contract_check_auth::<WalletError>(w, &p.to_bytes(), vec![env, proof(env, w, owner, &p)].into_val(env), &contexts)
}

/// Wallet con limite en `token` y un escrow registrado con 1% de comision maxima.
fn with_rules<'a>(env: &'a Env, owner: &SigningKey, limit: Option<i128>) -> (Address, SmartWalletClient<'a>, Address, Address) {
    env.mock_all_auths();
    let (w, c) = setup(env, owner);
    let (escrow, token) = (Address::generate(env), Address::generate(env));
    if let Some(l) = limit {
        c.set_limit(&token, &l);
    }
    c.add_escrow(&escrow, &token, &100);
    advance(env, DELAY_LEDGERS);
    c.apply_escrow(&escrow);
    (w, c, escrow, token)
}

#[test]
fn w19_approve_falla_siempre() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, _, token) = with_rules(&env, &owner, None);
    let spender = Address::generate(&env);
    let ctx = call(&env, &token, "approve", vec![&env, w.into_val(&env), spender.into_val(&env), 5i128.into_val(&env), 100u32.into_val(&env)]);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, ctx]), Err(Ok(WalletError::ApproveDenied)));
}

#[test]
fn w19_transfer_suma_al_limite() {
    let env = Env::default();
    let owner = key(1);
    let (w, c, _, token) = with_rules(&env, &owner, Some(100));
    let to = Address::generate(&env);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &token, &w, &to, 60)]), Ok(()));
    assert_eq!(c.spent(&token), 60);
    assert_eq!(
        check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &token, &w, &to, 41)]),
        Err(Ok(WalletError::LimitExceeded))
    );
    // Un intento rechazado no cuenta.
    assert_eq!(c.spent(&token), 60);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &token, &w, &to, 40)]), Ok(()));
    assert_eq!(c.spent(&token), 100);
}

#[test]
fn w19_dos_transfers_en_la_misma_autorizacion_suman() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, _, token) = with_rules(&env, &owner, Some(100));
    let to = Address::generate(&env);
    let two = vec![&env, transfer_ctx(&env, &token, &w, &to, 60), transfer_ctx(&env, &token, &w, &to, 60)];
    assert_eq!(check_ctx(&env, &w, &owner, two), Err(Ok(WalletError::LimitExceeded)));
}

#[test]
fn w19_burn_suma_al_limite() {
    let env = Env::default();
    let owner = key(1);
    let (w, c, _, token) = with_rules(&env, &owner, Some(100));
    let burn = call(&env, &token, "burn", vec![&env, w.into_val(&env), 101i128.into_val(&env)]);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, burn]), Err(Ok(WalletError::LimitExceeded)));
    let burn = call(&env, &token, "burn", vec![&env, w.into_val(&env), 30i128.into_val(&env)]);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, burn]), Ok(()));
    assert_eq!(c.spent(&token), 30);
}

#[test]
fn w19_el_periodo_se_reinicia() {
    let env = Env::default();
    let owner = key(1);
    let (w, c, _, token) = with_rules(&env, &owner, Some(100));
    let to = Address::generate(&env);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &token, &w, &to, 100)]), Ok(()));
    advance(&env, PERIOD_LEDGERS);
    assert_eq!(c.spent(&token), 0);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &token, &w, &to, 100)]), Ok(()));
}

#[test]
fn w19_otro_token_sin_limite_no_cuenta() {
    let env = Env::default();
    let owner = key(1);
    let (w, c, _, token) = with_rules(&env, &owner, Some(100));
    let otro = Address::generate(&env);
    let to = Address::generate(&env);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &otro, &w, &to, 1_000)]), Ok(()));
    assert_eq!(c.spent(&token), 0);
}

#[test]
fn w19_lock_valido_en_escrow_registrado_pasa_y_cuenta() {
    let env = Env::default();
    let owner = key(1);
    let (w, c, escrow, token) = with_rules(&env, &owner, Some(1_000));
    // Lo que autoriza la wallet en un lock real: escrow.lock y, debajo, token.transfer.
    let ctxs = vec![&env, lock_ctx(&env, &escrow, &w, 100, 1), transfer_ctx(&env, &token, &w, &escrow, 101)];
    assert_eq!(check_ctx(&env, &w, &owner, ctxs), Ok(()));
    assert_eq!(c.spent(&token), 101);
}

#[test]
fn w19_transferencia_directa_al_escrow_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, escrow, token) = with_rules(&env, &owner, None);
    assert_eq!(
        check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &token, &w, &escrow, 101)]),
        Err(Ok(WalletError::EscrowTransferMismatch))
    );
}

#[test]
fn w19_lock_con_importe_distinto_al_transfer_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, escrow, token) = with_rules(&env, &owner, None);
    let ctxs = vec![&env, lock_ctx(&env, &escrow, &w, 100, 1), transfer_ctx(&env, &token, &w, &escrow, 500)];
    assert_eq!(check_ctx(&env, &w, &owner, ctxs), Err(Ok(WalletError::EscrowTransferMismatch)));
}

#[test]
fn w19_lock_sin_su_transfer_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, escrow, _) = with_rules(&env, &owner, None);
    assert_eq!(
        check_ctx(&env, &w, &owner, vec![&env, lock_ctx(&env, &escrow, &w, 100, 1)]),
        Err(Ok(WalletError::EscrowTransferMismatch))
    );
}

#[test]
fn w19_lock_con_transfer_en_otro_token_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, escrow, _) = with_rules(&env, &owner, None);
    let otro = Address::generate(&env);
    let ctxs = vec![&env, lock_ctx(&env, &escrow, &w, 100, 1), transfer_ctx(&env, &otro, &w, &escrow, 101)];
    assert_eq!(check_ctx(&env, &w, &owner, ctxs), Err(Ok(WalletError::EscrowTransferMismatch)));
}

#[test]
fn w19_lock_con_comision_sobre_el_tope_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, escrow, token) = with_rules(&env, &owner, None);
    // Tope 1%: 100 de importe admite 1 de comision, no 2.
    let ctxs = vec![&env, lock_ctx(&env, &escrow, &w, 100, 2), transfer_ctx(&env, &token, &w, &escrow, 102)];
    assert_eq!(check_ctx(&env, &w, &owner, ctxs), Err(Ok(WalletError::EscrowLockInvalid)));
}

#[test]
fn w19_lock_con_otro_vendedor_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, escrow, token) = with_rules(&env, &owner, None);
    let otro = Address::generate(&env);
    let ctxs = vec![&env, lock_ctx(&env, &escrow, &otro, 100, 1), transfer_ctx(&env, &token, &w, &escrow, 101)];
    assert_eq!(check_ctx(&env, &w, &owner, ctxs), Err(Ok(WalletError::EscrowLockInvalid)));
}

#[test]
fn w19_escrow_quitado_ya_no_aplica_reglas() {
    let env = Env::default();
    let owner = key(1);
    let (w, c, escrow, token) = with_rules(&env, &owner, None);
    c.remove_escrow(&escrow);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &token, &w, &escrow, 101)]), Ok(()));
}

fn lock_ctx_with(env: &Env, escrow: &Address, seller: &Address, buyer: &Address, timeout: u32) -> Context {
    let hash = BytesN::<32>::random(env);
    call(env, escrow, "lock", vec![
        env,
        seller.into_val(env),
        buyer.into_val(env),
        100i128.into_val(env),
        1i128.into_val(env),
        hash.into_val(env),
        timeout.into_val(env),
    ])
}

#[test]
fn w19_lock_con_contextos_extra_o_en_otro_orden_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, escrow, token) = with_rules(&env, &owner, None);
    let otro = Address::generate(&env);
    let extra = call(&env, &otro, "f", vec![&env]);
    let lock = lock_ctx(&env, &escrow, &w, 100, 1);
    let tr = transfer_ctx(&env, &token, &w, &escrow, 101);
    // Un contrato intermedio podria llamar solo al transfer y nunca al lock.
    assert_eq!(
        check_ctx(&env, &w, &owner, vec![&env, extra, lock.clone(), tr.clone()]),
        Err(Ok(WalletError::EscrowTransferMismatch))
    );
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, tr, lock]), Err(Ok(WalletError::EscrowTransferMismatch)));
}

#[test]
fn w19_lock_con_plazo_fuera_de_rango_o_comprador_propio_falla() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, escrow, token) = with_rules(&env, &owner, None);
    let buyer = Address::generate(&env);
    for (b, t) in [(&buyer, 0u32), (&buyer, MAX_LOCK_TIMEOUT_MINUTES + 1), (&w, 30)] {
        let ctxs = vec![&env, lock_ctx_with(&env, &escrow, &w, b, t), transfer_ctx(&env, &token, &w, &escrow, 101)];
        assert_eq!(check_ctx(&env, &w, &owner, ctxs), Err(Ok(WalletError::EscrowLockInvalid)));
    }
    let ctxs = vec![
        &env,
        lock_ctx_with(&env, &escrow, &w, &buyer, MAX_LOCK_TIMEOUT_MINUTES),
        transfer_ctx(&env, &token, &w, &escrow, 101),
    ];
    assert_eq!(check_ctx(&env, &w, &owner, ctxs), Ok(()));
}

#[test]
fn w19_nft_y_destino_muxed_pasan_sin_limite() {
    let env = Env::default();
    let owner = key(1);
    let (w, _, _, token) = with_rules(&env, &owner, None);
    let nft = Address::generate(&env);
    let to = Address::generate(&env);
    let nft_transfer = call(&env, &nft, "transfer", vec![&env, w.into_val(&env), to.into_val(&env), 7u32.into_val(&env)]);
    let nft_burn = call(&env, &nft, "burn", vec![&env, w.into_val(&env), 7u32.into_val(&env)]);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, nft_transfer]), Ok(()));
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, nft_burn]), Ok(()));
    let muxed = xdr::ScVal::Address(xdr::ScAddress::MuxedAccount(xdr::MuxedEd25519Account {
        id: 42,
        ed25519: xdr::Uint256([9; 32]),
    }));
    let muxed = Val::try_from_val(&env, &muxed).unwrap();
    let ctx = call(&env, &token, "transfer", vec![&env, w.into_val(&env), muxed, 5i128.into_val(&env)]);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, ctx]), Ok(()));
}

// ---------- W19 por el camino real: token SAC, escrow de prueba y autorizacion firmada ----------

/// Copia del `lock` del escrow real: pide la firma del vendedor y le cobra `amount + fee`.
/// Si el primer byte del hash es 0xFF, falla despues de cobrar (para probar el rollback).
#[contract]
pub struct MockEscrow;

#[contractimpl]
impl MockEscrow {
    pub fn init(env: Env, token: Address) {
        env.storage().instance().set(&symbol_short!("tok"), &token);
    }

    pub fn lock(env: Env, seller: Address, _buyer: Address, amount: i128, platform_fee: i128, secret_hash: BytesN<32>, _timeout_minutes: u32) {
        seller.require_auth();
        let t: Address = env.storage().instance().get(&symbol_short!("tok")).unwrap();
        token::Client::new(&env, &t).transfer(&seller, &env.current_contract_address(), &(amount + platform_fee));
        if secret_hash.to_array()[0] == 0xFF {
            panic!("falla despues de cobrar");
        }
        let n: u32 = env.storage().instance().get(&symbol_short!("n")).unwrap_or(0);
        env.storage().instance().set(&symbol_short!("n"), &(n + 1));
    }

    pub fn trades(env: Env) -> u32 {
        env.storage().instance().get(&symbol_short!("n")).unwrap_or(0)
    }
}

/// Contrato intermedio que pide la firma de la wallet y solo llama al `transfer`.
#[contract]
pub struct Evil;

#[contractimpl]
impl Evil {
    pub fn f(env: Env, wallet: Address, token: Address, escrow: Address, amount: i128) {
        wallet.require_auth();
        token::Client::new(&env, &token).transfer(&wallet, &escrow, &amount);
    }
}

fn invocation(c: &Address, f: &str, args: Vec<Val>, subs: std::vec::Vec<xdr::SorobanAuthorizedInvocation>) -> xdr::SorobanAuthorizedInvocation {
    xdr::SorobanAuthorizedInvocation {
        function: xdr::SorobanAuthorizedFunction::ContractFn(xdr::InvokeContractArgs {
            contract_address: c.try_into().unwrap(),
            function_name: f.try_into().unwrap(),
            args: args.try_into().unwrap(),
        }),
        sub_invocations: subs.try_into().unwrap(),
    }
}

fn entry_for(env: &Env, wallet: &Address, invocation: xdr::SorobanAuthorizedInvocation, k: &SigningKey) -> xdr::SorobanAuthorizationEntry {
    static NONCE: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(1_000);
    let nonce = NONCE.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let exp = env.ledger().sequence() + 100;
    let pre = xdr::HashIdPreimage::SorobanAuthorization(xdr::HashIdPreimageSorobanAuthorization {
        network_id: xdr::Hash(env.ledger().network_id().to_array()),
        nonce,
        signature_expiration_ledger: exp,
        invocation: invocation.clone(),
    });
    let payload = env.crypto().sha256(&Bytes::from_slice(env, &pre.to_xdr(Limits::none()).unwrap()));
    let proofs: Vec<Proof> = vec![env, proof(env, wallet, k, &payload)];
    let v: Val = proofs.into_val(env);
    xdr::SorobanAuthorizationEntry {
        root_invocation: invocation,
        credentials: xdr::SorobanCredentials::Address(xdr::SorobanAddressCredentials {
            address: wallet.try_into().unwrap(),
            nonce,
            signature_expiration_ledger: exp,
            signature: xdr::ScVal::try_from_val(env, &v).unwrap(),
        }),
    }
}

struct World<'a> {
    w: Address,
    c: SmartWalletClient<'a>,
    token: Address,
    escrow: MockEscrowClient<'a>,
    owner: SigningKey,
}

fn world<'a>(env: &'a Env, limit: Option<i128>) -> World<'a> {
    env.mock_all_auths();
    let owner = key(1);
    let (w, c) = setup(env, &owner);
    let token = env.register_stellar_asset_contract_v2(Address::generate(env)).address();
    token::StellarAssetClient::new(env, &token).mint(&w, &1_000_000);
    let escrow = MockEscrowClient::new(env, &env.register(MockEscrow, ()));
    escrow.init(&token);
    if let Some(l) = limit {
        c.set_limit(&token, &l);
    }
    c.add_escrow(&escrow.address, &token, &100);
    advance(env, DELAY_LEDGERS);
    c.apply_escrow(&escrow.address);
    World { w, c, token, escrow, owner }
}

/// Firma real del `lock` y su `transfer` hijo, y lo ejecuta en el escrow de prueba.
fn real_lock(env: &Env, s: &World, amount: i128, fee: i128, first: u8) -> bool {
    let buyer = Address::generate(env);
    let mut h = [7u8; 32];
    h[0] = first;
    let hash = BytesN::from_array(env, &h);
    let args = vec![
        env,
        s.w.into_val(env),
        buyer.into_val(env),
        amount.into_val(env),
        fee.into_val(env),
        hash.into_val(env),
        30u32.into_val(env),
    ];
    let child = invocation(&s.token, "transfer", vec![env, s.w.into_val(env), s.escrow.address.into_val(env), (amount + fee).into_val(env)], std::vec![]);
    let tree = invocation(&s.escrow.address, "lock", args, std::vec![child]);
    env.set_auths(&[entry_for(env, &s.w, tree, &s.owner)]);
    s.escrow.try_lock(&s.w, &buyer, &amount, &fee, &hash, &30).is_ok()
}

#[test]
fn w19_camino_real_lock_cobra_una_vez_y_el_fallido_no_cobra() {
    let env = Env::default();
    let s = world(&env, Some(1_000));
    let balance = token::Client::new(&env, &s.token);
    assert!(real_lock(&env, &s, 100, 1, 1));
    assert_eq!(s.escrow.trades(), 1);
    assert_eq!(s.c.spent(&s.token), 101);
    assert_eq!(balance.balance(&s.escrow.address), 101);
    // El escrow cobra y luego falla: todo se revierte, tambien el gasto que anoto la wallet.
    assert!(!real_lock(&env, &s, 200, 2, 0xFF));
    assert_eq!(s.c.spent(&s.token), 101);
    assert_eq!(balance.balance(&s.escrow.address), 101);
    // Sobre el limite: 101 + 900 + 9 > 1000.
    assert!(!real_lock(&env, &s, 900, 9, 1));
    assert_eq!(s.c.spent(&s.token), 101);
}

#[test]
fn w19_camino_real_contrato_intermedio_no_manda_al_escrow_sin_trade() {
    let env = Env::default();
    let s = world(&env, None);
    let evil = EvilClient::new(&env, &env.register(Evil, ()));
    let buyer = Address::generate(&env);
    let lock_args = vec![
        &env,
        s.w.into_val(&env),
        buyer.into_val(&env),
        100i128.into_val(&env),
        1i128.into_val(&env),
        BytesN::<32>::random(&env).into_val(&env),
        30u32.into_val(&env),
    ];
    let f_args = vec![&env, s.w.into_val(&env), s.token.into_val(&env), s.escrow.address.into_val(&env), 101i128.into_val(&env)];
    let tree = invocation(&evil.address, "f", f_args, std::vec![
        invocation(&s.escrow.address, "lock", lock_args, std::vec![]),
        invocation(&s.token, "transfer", vec![&env, s.w.into_val(&env), s.escrow.address.into_val(&env), 101i128.into_val(&env)], std::vec![]),
    ]);
    env.set_auths(&[entry_for(&env, &s.w, tree, &s.owner)]);
    assert!(evil.try_f(&s.w, &s.token, &s.escrow.address, &101).is_err());
    assert_eq!(token::Client::new(&env, &s.token).balance(&s.escrow.address), 0);
}

// ---------- W8–W9: guardianes ----------

/// Agrega un guardian: lo pide y lo aplica tras la espera.
fn add_g(env: &Env, c: &SmartWalletClient, g: &Address) {
    c.add_guardian(g);
    advance(env, DELAY_LEDGERS);
    c.apply_guardian_add(g);
}

#[test]
fn w8_agregar_guardian_espera_y_quorum_pasa_a_1() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let g = Address::generate(&env);
    assert_eq!(c.guardian_threshold(), 0);
    c.add_guardian(&g);
    assert_eq!(c.guardians().len(), 0);
    assert_eq!(c.try_apply_guardian_add(&g), Err(Ok(WalletError::NotReady)));
    advance(&env, DELAY_LEDGERS);
    env.set_auths(&[]);
    c.apply_guardian_add(&g);
    env.mock_all_auths();
    assert_eq!(c.guardians(), vec![&env, g.clone()]);
    assert_eq!(c.guardian_threshold(), 1);
    assert_eq!(c.try_add_guardian(&g), Err(Ok(WalletError::GuardianExists)));
}

#[test]
fn w8_la_wallet_no_es_su_propio_guardian() {
    let env = Env::default();
    env.mock_all_auths();
    let (w, c) = setup(&env, &key(1));
    assert_eq!(c.try_add_guardian(&w), Err(Ok(WalletError::InvalidGuardian)));
}

#[test]
fn w8_tope_de_guardianes() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    for _ in 0..MAX_GUARDIANS {
        add_g(&env, &c, &Address::generate(&env));
    }
    assert_eq!(c.try_add_guardian(&Address::generate(&env)), Err(Ok(WalletError::TooManyGuardians)));
}

#[test]
fn w8_quitar_guardian_espera() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let (g1, g2) = (Address::generate(&env), Address::generate(&env));
    add_g(&env, &c, &g1);
    add_g(&env, &c, &g2);
    c.set_guardian_threshold(&2);
    c.remove_guardian(&g1);
    assert_eq!(c.guardians().len(), 2);
    assert_eq!(c.try_apply_guardian_removal(&g1), Err(Ok(WalletError::NotReady)));
    advance(&env, DELAY_LEDGERS);
    // Cualquiera la aplica; el quorum baja a los guardianes que quedan.
    env.set_auths(&[]);
    c.apply_guardian_removal(&g1);
    assert_eq!(c.guardians(), vec![&env, g2]);
    assert_eq!(c.guardian_threshold(), 1);
    assert_eq!(c.try_apply_guardian_removal(&g1), Err(Ok(WalletError::NothingPending)));
}

#[test]
fn w8_quitar_desconocido_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    assert_eq!(c.try_remove_guardian(&Address::generate(&env)), Err(Ok(WalletError::UnknownGuardian)));
}

#[test]
fn w8_sin_firma_de_la_wallet_falla() {
    let env = Env::default();
    let (_, c) = setup(&env, &key(1));
    let g = Address::generate(&env);
    assert_eq!(c.try_add_guardian(&g).err(), Some(Err(auth_error())));
    assert_eq!(c.guardians().len(), 0);
}

#[test]
fn w9_quorum_entre_1_y_el_numero_de_guardianes() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    assert_eq!(c.try_set_guardian_threshold(&1), Err(Ok(WalletError::InvalidGuardianThreshold)));
    c.set_guardian_threshold(&0);
    add_g(&env, &c, &Address::generate(&env));
    add_g(&env, &c, &Address::generate(&env));
    assert_eq!(c.try_set_guardian_threshold(&0), Err(Ok(WalletError::InvalidGuardianThreshold)));
    assert_eq!(c.try_set_guardian_threshold(&3), Err(Ok(WalletError::InvalidGuardianThreshold)));
    c.set_guardian_threshold(&2);
    assert_eq!(c.guardian_threshold(), 2);
}

#[test]
fn w9_sin_firma_de_la_wallet_falla() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    add_g(&env, &c, &Address::generate(&env));
    add_g(&env, &c, &Address::generate(&env));
    env.set_auths(&[]);
    assert_eq!(c.try_set_guardian_threshold(&2).err(), Some(Err(auth_error())));
    assert_eq!(c.guardian_threshold(), 1);
}

// ---------- W15–W16: congelamiento ----------

/// Wallet con `n` guardianes y quorum `t`.
fn with_guardians<'a>(env: &'a Env, owner: &SigningKey, n: u32, t: u32) -> (Address, SmartWalletClient<'a>, std::vec::Vec<Address>) {
    env.mock_all_auths();
    let (w, c) = setup(env, owner);
    let gs: std::vec::Vec<Address> = (0..n).map(|_| Address::generate(env)).collect();
    for g in &gs {
        add_g(env, &c, g);
    }
    c.set_guardian_threshold(&t);
    (w, c, gs)
}

fn gv(env: &Env, gs: &[Address]) -> Vec<Address> {
    let mut v = Vec::new(env);
    for g in gs {
        v.push_back(g.clone());
    }
    v
}

#[test]
fn w15_congelada_el_dueno_no_mueve_fondos_ni_cambia_nada() {
    let env = Env::default();
    let owner = key(1);
    let (w, c, gs) = with_guardians(&env, &owner, 2, 2);
    c.freeze(&gv(&env, &gs[..1]));
    assert!(c.frozen());
    let token = Address::generate(&env);
    let to = Address::generate(&env);
    assert_eq!(
        check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &token, &w, &to, 1)]),
        Err(Ok(WalletError::Frozen))
    );
    let add = call(&env, &w, "add_signer", vec![&env]);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, add]), Err(Ok(WalletError::Frozen)));
    // Pedir descongelar si se puede.
    let req = call(&env, &w, "request_unfreeze", vec![&env]);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, req]), Ok(()));
}

#[test]
fn w15_solo_guardianes_de_la_wallet_y_sin_repetir() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    assert_eq!(c.try_freeze(&gv(&env, &[Address::generate(&env)])), Err(Ok(WalletError::UnknownGuardian)));
    assert_eq!(c.try_freeze(&gv(&env, &[gs[0].clone(), gs[0].clone()])), Err(Ok(WalletError::DuplicateGuardian)));
    assert_eq!(c.try_freeze(&Vec::new(&env)), Err(Ok(WalletError::NotEnoughGuardians)));
}

#[test]
fn w15_sin_firma_del_guardian_falla() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    env.set_auths(&[]);
    assert_eq!(c.try_freeze(&gv(&env, &gs)).err(), Some(Err(auth_error())));
    assert!(!c.frozen());
}

#[test]
fn w15_vence_solo() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    c.freeze(&gv(&env, &gs[..1]));
    advance(&env, FREEZE_MAX);
    assert!(!c.frozen());
}

#[test]
fn w15_un_guardian_solo_no_prolonga_el_bloqueo() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    c.freeze(&gv(&env, &gs[..1]));
    // Ni el mismo ni otro guardian sin quorum lo prolonga mientras dura.
    assert_eq!(c.try_freeze(&gv(&env, &gs[1..])), Err(Ok(WalletError::Frozen)));
    advance(&env, FREEZE_MAX);
    // Enfriamiento: hasta fin + FREEZE_WINDOW - FREEZE_MAX.
    assert_eq!(c.try_freeze(&gv(&env, &gs[1..])), Err(Ok(WalletError::FreezeCooldown)));
    advance(&env, FREEZE_WINDOW - FREEZE_MAX - 1);
    assert_eq!(c.try_freeze(&gv(&env, &gs[1..])), Err(Ok(WalletError::FreezeCooldown)));
    advance(&env, 1);
    c.freeze(&gv(&env, &gs[1..]));
    assert!(c.frozen());
}

#[test]
fn w15_el_quorum_prolonga() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    c.freeze(&gv(&env, &gs[..1]));
    advance(&env, FREEZE_MAX - 10);
    c.freeze(&gv(&env, &gs));
    advance(&env, 20);
    assert!(c.frozen());
}

#[test]
fn w15_congelada_no_se_aplica_lo_pendiente() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    let token = Address::generate(&env);
    let escrow = Address::generate(&env);
    c.set_limit(&token, &10);
    c.set_limit(&token, &1_000);
    c.add_escrow(&escrow, &token, &100);
    c.remove_guardian(&gs[1]);
    c.freeze(&gv(&env, &gs[..1]));
    advance(&env, DELAY_LEDGERS);
    assert_eq!(c.try_apply_limit(&token), Err(Ok(WalletError::Frozen)));
    assert_eq!(c.try_apply_escrow(&escrow), Err(Ok(WalletError::Frozen)));
    assert_eq!(c.try_apply_guardian_removal(&gs[1]), Err(Ok(WalletError::Frozen)));
    assert_eq!(c.limit(&token), Some(10));
}

#[test]
fn w16_el_dueno_descongela_tras_la_espera() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    c.freeze(&gv(&env, &gs[..1]));
    assert_eq!(c.try_unfreeze(), Err(Ok(WalletError::NothingPending)));
    c.request_unfreeze();
    assert_eq!(c.try_unfreeze(), Err(Ok(WalletError::NotReady)));
    advance(&env, UNFREEZE_DELAY);
    env.set_auths(&[]);
    c.unfreeze();
    assert!(!c.frozen());
}

#[test]
fn w16_el_quorum_congela_de_nuevo_y_anula_la_solicitud() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    c.freeze(&gv(&env, &gs[..1]));
    c.request_unfreeze();
    c.freeze(&gv(&env, &gs));
    advance(&env, UNFREEZE_DELAY);
    assert_eq!(c.try_unfreeze(), Err(Ok(WalletError::NothingPending)));
    assert!(c.frozen());
}

#[test]
fn w16_quorum_descongela_al_instante_y_menos_no() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    c.freeze(&gv(&env, &gs[..1]));
    assert_eq!(c.try_guardian_unfreeze(&gv(&env, &gs[..1])), Err(Ok(WalletError::NotEnoughGuardians)));
    c.guardian_unfreeze(&gv(&env, &gs));
    assert!(!c.frozen());
    assert_eq!(c.try_guardian_unfreeze(&gv(&env, &gs)), Err(Ok(WalletError::NotFrozen)));
}

#[test]
fn w16_pedir_descongelar_sin_congelamiento_falla() {
    let env = Env::default();
    let (_, c, _) = with_guardians(&env, &key(1), 1, 1);
    assert_eq!(c.try_request_unfreeze(), Err(Ok(WalletError::NotFrozen)));
}

#[test]
fn w16_vencido_cualquiera_limpia() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    c.freeze(&gv(&env, &gs));
    advance(&env, FREEZE_MAX);
    env.set_auths(&[]);
    c.unfreeze();
    assert!(!c.frozen());
}

// ---------- W10–W14: recuperacion ----------

fn expires(env: &Env) -> u32 {
    env.ledger().sequence() + RECOVERY_DELAY + RECOVERY_MARGIN
}

/// Abre una recuperacion hacia `new` con `by` guardianes.
fn start(env: &Env, c: &SmartWalletClient, by: &[Address], new: &SigningKey) -> BytesN<32> {
    c.start_recovery(&gv(env, by), &pk(env, new), &pop(env, &c.address, new), &expires(env))
}

#[test]
fn w10_a_w14_recuperacion_completa() {
    let env = Env::default();
    let (old, new) = (key(1), key(9));
    let (w, c, gs) = with_guardians(&env, &old, 3, 2);
    let id = start(&env, &c, &gs[..1], &new);
    assert_eq!(c.recovery().unwrap().ready_ledger, 0);
    c.approve_recovery(&gs[1], &id);
    let ready = c.recovery().unwrap().ready_ledger;
    assert_eq!(ready, env.ledger().sequence() + RECOVERY_DELAY);
    assert_eq!(c.try_finish_recovery(&id), Err(Ok(WalletError::NotReady)));
    // Un voto despues del quorum no reinicia la espera.
    advance(&env, 10);
    c.approve_recovery(&gs[2], &id);
    assert_eq!(c.recovery().unwrap().ready_ledger, ready);
    advance(&env, RECOVERY_DELAY - 10);
    env.set_auths(&[]);
    c.finish_recovery(&id);
    assert_eq!(c.threshold(), 1);
    assert_eq!(c.signers().len(), 1);
    let p = payload(&env);
    assert_eq!(check(&env, &w, &p, vec![&env, proof(&env, &w, &new, &p)]), Ok(()));
    // El firmante viejo ya no firma.
    assert_eq!(check(&env, &w, &p, vec![&env, proof(&env, &w, &old, &p)]), Err(Ok(WalletError::UnknownSigner)));
    assert_eq!(c.recovery(), None);
}

#[test]
fn w10_con_quorum_1_la_espera_empieza_al_abrir() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    start(&env, &c, &gs, &key(9));
    assert_eq!(c.recovery().unwrap().ready_ledger, env.ledger().sequence() + RECOVERY_DELAY);
}

#[test]
fn w10_sin_prueba_de_posesion_falla() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    let fantasma = BytesN::from_array(&env, &[0xffu8; 32]);
    let r = c.try_start_recovery(&gv(&env, &gs), &fantasma, &pop(&env, &c.address, &key(9)), &expires(&env));
    assert_eq!(r, Err(Err(InvokeError::Abort)));
}

#[test]
fn w10_caducidad_fuera_de_rango_falla() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    let new = key(9);
    let now = env.ledger().sequence();
    for e in [now + RECOVERY_DELAY, now + RECOVERY_MAX_TTL + 1] {
        assert_eq!(
            c.try_start_recovery(&gv(&env, &gs), &pk(&env, &new), &pop(&env, &c.address, &new), &e),
            Err(Ok(WalletError::InvalidExpiry))
        );
    }
}

#[test]
fn w10_solo_un_guardian_no_reemplaza_una_propuesta_vigente_y_el_quorum_si() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 3, 2);
    let id1 = start(&env, &c, &gs[..1], &key(8));
    let new = key(9);
    assert_eq!(
        c.try_start_recovery(&gv(&env, &gs[1..2]), &pk(&env, &new), &pop(&env, &c.address, &new), &expires(&env)),
        Err(Ok(WalletError::RecoveryActive))
    );
    let id2 = start(&env, &c, &gs[1..], &new);
    assert_ne!(id1, id2);
    assert_eq!(c.recovery().unwrap().new_key, pk(&env, &new));
    assert_eq!(c.try_approve_recovery(&gs[0], &id1), Err(Ok(WalletError::UnknownProposal)));
}

#[test]
fn w10_vencida_cualquiera_abre_otra() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 3, 2);
    start(&env, &c, &gs[..1], &key(8));
    advance(&env, RECOVERY_DELAY + RECOVERY_MARGIN);
    start(&env, &c, &gs[1..2], &key(9));
}

#[test]
fn w10_sin_firma_del_guardian_falla() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    let new = key(9);
    env.set_auths(&[]);
    let r = c.try_start_recovery(&gv(&env, &gs), &pk(&env, &new), &pop(&env, &c.address, &new), &expires(&env));
    assert_eq!(r.err(), Some(Err(auth_error())));
}

#[test]
fn w11_voto_repetido_ajeno_o_vencido_falla() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 3, 3);
    let id = start(&env, &c, &gs[..1], &key(9));
    assert_eq!(c.try_approve_recovery(&gs[0], &id), Err(Ok(WalletError::AlreadyVoted)));
    assert_eq!(c.try_approve_recovery(&Address::generate(&env), &id), Err(Ok(WalletError::UnknownGuardian)));
    assert_eq!(c.try_approve_recovery(&gs[1], &BytesN::random(&env)), Err(Ok(WalletError::UnknownProposal)));
    advance(&env, RECOVERY_DELAY + RECOVERY_MARGIN);
    assert_eq!(c.try_approve_recovery(&gs[1], &id), Err(Ok(WalletError::ProposalExpired)));
}

#[test]
fn w11_cambiar_guardianes_invalida_los_votos() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 3, 2);
    let id = start(&env, &c, &gs[..1], &key(9));
    c.set_guardian_threshold(&3);
    assert_eq!(c.try_approve_recovery(&gs[1], &id), Err(Ok(WalletError::Stale)));
    assert_eq!(c.try_finish_recovery(&id), Err(Ok(WalletError::Stale)));
}

#[test]
fn w12_el_dueno_cancela() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    let id = start(&env, &c, &gs, &key(9));
    c.cancel_recovery();
    advance(&env, RECOVERY_DELAY);
    assert_eq!(c.try_finish_recovery(&id), Err(Ok(WalletError::UnknownProposal)));
    assert_eq!(c.try_cancel_recovery(), Err(Ok(WalletError::UnknownProposal)));
}

#[test]
fn w12_congelada_cancelar_pide_dos_credenciales() {
    let env = Env::default();
    let (a, b) = (key(1), key(2));
    let (w, c, gs) = with_guardians(&env, &a, 2, 2);
    c.add_signer(&pk(&env, &b), &1, &pop(&env, &w, &b));
    c.freeze(&gv(&env, &gs[..1]));
    let cancel = call(&env, &w, "cancel_recovery", vec![&env]);
    let p = payload(&env);
    let una = vec![&env, proof(&env, &w, &a, &p)];
    assert_eq!(
        env.try_invoke_contract_check_auth::<WalletError>(&w, &p.to_bytes(), una.into_val(&env), &vec![&env, cancel.clone()]),
        Err(Ok(WalletError::Frozen))
    );
    let dos = vec![&env, proof(&env, &w, &a, &p), proof(&env, &w, &b, &p)];
    assert_eq!(
        env.try_invoke_contract_check_auth::<WalletError>(&w, &p.to_bytes(), dos.into_val(&env), &vec![&env, cancel]),
        Ok(())
    );
}

#[test]
fn w13_el_quorum_cancela_y_menos_no() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    start(&env, &c, &gs[..1], &key(9));
    assert_eq!(c.try_guardian_cancel_recovery(&gv(&env, &gs[..1])), Err(Ok(WalletError::NotEnoughGuardians)));
    c.guardian_cancel_recovery(&gv(&env, &gs));
    assert_eq!(c.recovery(), None);
}

#[test]
fn w14_sin_quorum_no_termina() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 2);
    let id = start(&env, &c, &gs[..1], &key(9));
    advance(&env, RECOVERY_DELAY);
    assert_eq!(c.try_finish_recovery(&id), Err(Ok(WalletError::NotReady)));
}

#[test]
fn w14_vencida_no_termina() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    let id = start(&env, &c, &gs, &key(9));
    advance(&env, RECOVERY_DELAY + RECOVERY_MARGIN);
    assert_eq!(c.try_finish_recovery(&id), Err(Ok(WalletError::ProposalExpired)));
}

#[test]
fn w14_invalida_lo_pendiente_conserva_el_gasto_y_descongela() {
    let env = Env::default();
    let owner = key(1);
    let (w, c, gs) = with_guardians(&env, &owner, 2, 1);
    let token = Address::generate(&env);
    let escrow = Address::generate(&env);
    c.set_limit(&token, &100);
    let to = Address::generate(&env);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, transfer_ctx(&env, &token, &w, &to, 60)]), Ok(()));
    // Lo que el dueno anterior (o quien robo su telefono) dejo programado.
    c.set_limit(&token, &1_000_000);
    c.add_escrow(&escrow, &token, &100);
    c.remove_guardian(&gs[1]);
    let otro = Address::generate(&env);
    c.add_guardian(&otro);
    c.freeze(&gv(&env, &gs[..1]));
    c.request_unfreeze();
    let id = start(&env, &c, &gs[..1], &key(9));
    advance(&env, RECOVERY_DELAY);
    c.finish_recovery(&id);
    assert!(!c.frozen());
    assert_eq!(c.try_apply_limit(&token), Err(Ok(WalletError::Stale)));
    assert_eq!(c.try_apply_escrow(&escrow), Err(Ok(WalletError::Stale)));
    assert_eq!(c.try_apply_guardian_removal(&gs[1]), Err(Ok(WalletError::Stale)));
    assert_eq!(c.try_apply_guardian_add(&otro), Err(Ok(WalletError::Stale)));
    assert_eq!(c.limit(&token), Some(100));
    assert_eq!(c.spent(&token), 60);
    assert_eq!(c.guardians().len(), 2);
}

// ---------- Ataques de la revision (deben fallar) ----------

#[test]
fn atk_con_recuperacion_en_curso_el_dueno_no_descongela() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    c.freeze(&gv(&env, &gs));
    start(&env, &c, &gs, &key(9));
    assert_eq!(c.try_request_unfreeze(), Err(Ok(WalletError::RecoveryActive)));
}

#[test]
fn atk_la_solicitud_previa_tampoco_descongela_durante_la_recuperacion() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    c.freeze(&gv(&env, &gs));
    c.request_unfreeze();
    let id = start(&env, &c, &gs, &key(9));
    advance(&env, UNFREEZE_DELAY);
    assert_eq!(c.try_unfreeze(), Err(Ok(WalletError::RecoveryActive)));
    assert!(c.frozen());
    advance(&env, RECOVERY_DELAY - UNFREEZE_DELAY);
    c.finish_recovery(&id);
    assert!(!c.frozen());
}

#[test]
fn atk_no_se_quitan_ni_agregan_guardianes_durante_la_recuperacion() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 3, 2);
    c.remove_guardian(&gs[0]);
    let tg = Address::generate(&env);
    c.add_guardian(&tg);
    start(&env, &c, &gs[1..2], &key(9));
    advance(&env, DELAY_LEDGERS);
    assert_eq!(c.try_apply_guardian_removal(&gs[0]), Err(Ok(WalletError::RecoveryActive)));
    assert_eq!(c.try_apply_guardian_add(&tg), Err(Ok(WalletError::RecoveryActive)));
}

#[test]
fn atk_el_guardian_del_ladron_no_vale_hasta_la_espera_y_la_recuperacion_lo_anula() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    let tg = Address::generate(&env);
    c.add_guardian(&tg);
    c.freeze(&gv(&env, &gs));
    assert_eq!(c.try_guardian_unfreeze(&gv(&env, &[tg.clone()])), Err(Ok(WalletError::UnknownGuardian)));
    let id = start(&env, &c, &gs, &key(9));
    advance(&env, RECOVERY_DELAY);
    c.finish_recovery(&id);
    assert_eq!(c.try_apply_guardian_add(&tg), Err(Ok(WalletError::Stale)));
    assert_eq!(c.guardians(), gv(&env, &gs));
}

#[test]
fn atk_con_quorum_1_un_guardian_solo_no_congela_sin_fin() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 2, 1);
    c.freeze(&gv(&env, &gs[..1]));
    assert_eq!(c.try_freeze(&gv(&env, &gs[..1])), Err(Ok(WalletError::Frozen)));
    advance(&env, FREEZE_MAX);
    assert_eq!(c.try_freeze(&gv(&env, &gs[1..])), Err(Ok(WalletError::FreezeCooldown)));
    // Los dos juntos si prolongan.
    c.freeze(&gv(&env, &gs));
    assert!(c.frozen());
}

// ---------- W20: sesiones ----------

struct Ses<'a> {
    w: Address,
    c: SmartWalletClient<'a>,
    escrow: Address,
    token: Address,
    buyer: Address,
    k: SigningKey,
    id: BytesN<32>,
}

/// Wallet con escrow registrado, limite opcional y una sesion: 100 por lock, 250 en total,
/// hasta 60 minutos, un comprador.
fn ses<'a>(env: &'a Env, limit: Option<i128>) -> Ses<'a> {
    let (w, c, escrow, token) = with_rules(env, &key(1), limit);
    let buyer = Address::generate(env);
    let k = key(5);
    let expires = env.ledger().sequence() + 1_000;
    let id = c.add_session(&pk(env, &k), &escrow, &vec![env, buyer.clone()], &100, &250, &60, &expires);
    Ses { w, c, escrow, token, buyer, k, id }
}

fn sproof(env: &Env, w: &Address, k: &SigningKey, payload: &Hash<32>, mode: u8) -> Proof {
    let msg = message(env, w, mode, payload);
    Proof::Session(SessionProof {
        id: session_id(env, &pk(env, k)),
        sig: BytesN::from_array(env, &k.sign(&msg.to_array()).to_bytes()),
    })
}

fn scheck(env: &Env, s: &Ses, contexts: Vec<Context>) -> Result<(), Result<WalletError, InvokeError>> {
    let p = payload(env);
    let proofs = vec![env, sproof(env, &s.w, &s.k, &p, MODE_SESSION)];
    env.try_invoke_contract_check_auth::<WalletError>(&s.w, &p.to_bytes(), proofs.into_val(env), &contexts)
}

/// `[lock, transfer]` de `amount + fee` hacia `buyer`.
fn slock(env: &Env, s: &Ses, buyer: &Address, amount: i128, fee: i128, timeout: u32) -> Vec<Context> {
    let lock = call(env, &s.escrow, "lock", vec![
        env,
        s.w.into_val(env),
        buyer.into_val(env),
        amount.into_val(env),
        fee.into_val(env),
        BytesN::<32>::random(env).into_val(env),
        timeout.into_val(env),
    ]);
    vec![env, lock, transfer_ctx(env, &s.token, &s.w, &s.escrow, amount + fee)]
}

fn trade_ctx(env: &Env, s: &Ses, f: &str, trade: &BytesN<32>) -> Context {
    call(env, &s.escrow, f, vec![env, trade.into_val(env), Bytes::new(env).into_val(env)])
}

#[test]
fn w20_lock_dentro_de_los_topes_pasa_y_acumula() {
    let env = Env::default();
    let s = ses(&env, None);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 100, 0, 60)), Ok(()));
    assert_eq!(s.c.session(&s.id).unwrap().spent, 100);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 100, 0, 30)), Ok(()));
    // 200 + 100 > 250.
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 100, 0, 30)), Err(Ok(WalletError::SessionLimit)));
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 49, 0, 30)), Ok(()));
    assert_eq!(s.c.session(&s.id).unwrap().spent, 249);
}

#[test]
fn w20_por_encima_del_tope_por_lock_falla_contando_la_comision() {
    let env = Env::default();
    let s = ses(&env, None);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 100, 1, 60)), Err(Ok(WalletError::SessionLimit)));
    assert_eq!(s.c.session(&s.id).unwrap().spent, 0);
}

#[test]
fn w20_comprador_ajeno_o_plazo_largo_falla() {
    let env = Env::default();
    let s = ses(&env, None);
    let otro = Address::generate(&env);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &otro, 50, 0, 60)), Err(Ok(WalletError::SessionDenied)));
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 50, 0, 61)), Err(Ok(WalletError::SessionDenied)));
}

#[test]
fn w20_las_reglas_del_escrow_siguen_aplicando() {
    let env = Env::default();
    let s = ses(&env, None);
    // 2% de comision con tope de 1%.
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 50, 2, 60)), Err(Ok(WalletError::EscrowLockInvalid)));
    // Transfer hijo con otro importe.
    let mut ctx = slock(&env, &s, &s.buyer, 50, 0, 60);
    ctx.set(1, transfer_ctx(&env, &s.token, &s.w, &s.escrow, 49));
    assert_eq!(scheck(&env, &s, ctx), Err(Ok(WalletError::EscrowTransferMismatch)));
}

#[test]
fn w20_el_lock_tambien_cuenta_en_el_limite_del_token() {
    let env = Env::default();
    let s = ses(&env, Some(80));
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 90, 0, 60)), Err(Ok(WalletError::LimitExceeded)));
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 70, 0, 60)), Ok(()));
    assert_eq!(s.c.spent(&s.token), 70);
}

#[test]
fn w20_release_pasa() {
    let env = Env::default();
    let s = ses(&env, None);
    let t = BytesN::random(&env);
    assert_eq!(scheck(&env, &s, vec![&env, trade_ctx(&env, &s, "release", &t)]), Ok(()));
}

#[test]
fn w20_decline_solo_con_permiso_y_una_vez() {
    let env = Env::default();
    let s = ses(&env, None);
    let t = BytesN::random(&env);
    let decline = || vec![&env, call(&env, &s.escrow, "decline", vec![&env, t.into_val(&env)])];
    assert_eq!(scheck(&env, &s, decline()), Err(Ok(WalletError::SessionDenied)));
    s.c.allow_session_decline(&s.id, &t);
    assert_eq!(scheck(&env, &s, decline()), Ok(()));
    assert_eq!(scheck(&env, &s, decline()), Err(Ok(WalletError::SessionDenied)));
}

#[test]
fn w20_transfer_otra_llamada_o_la_wallet_fallan() {
    let env = Env::default();
    let s = ses(&env, None);
    let to = Address::generate(&env);
    assert_eq!(scheck(&env, &s, vec![&env, transfer_ctx(&env, &s.token, &s.w, &to, 1)]), Err(Ok(WalletError::SessionDenied)));
    assert_eq!(
        scheck(&env, &s, vec![&env, transfer_ctx(&env, &s.token, &s.w, &s.escrow, 1)]),
        Err(Ok(WalletError::SessionDenied))
    );
    let w = s.w.clone();
    assert_eq!(scheck(&env, &s, vec![&env, call(&env, &w, "add_signer", vec![&env])]), Err(Ok(WalletError::SessionDenied)));
    assert_eq!(scheck(&env, &s, vec![&env, call(&env, &w, "revoke_session", vec![&env])]), Err(Ok(WalletError::SessionDenied)));
    let otro_escrow = Address::generate(&env);
    let t: BytesN<32> = BytesN::random(&env);
    assert_eq!(
        scheck(&env, &s, vec![&env, call(&env, &otro_escrow, "release", vec![&env, t.into_val(&env)])]),
        Err(Ok(WalletError::SessionDenied))
    );
}

#[test]
fn w20_vencida_o_revocada_falla() {
    let env = Env::default();
    let s = ses(&env, None);
    advance(&env, 1_000);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 50, 0, 60)), Err(Ok(WalletError::SessionExpired)));
    let env = Env::default();
    let s = ses(&env, None);
    s.c.revoke_session(&s.id);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 50, 0, 60)), Err(Ok(WalletError::UnknownSession)));
    assert_eq!(s.c.try_revoke_session(&s.id), Err(Ok(WalletError::UnknownSession)));
}

#[test]
fn w20_firma_de_sesion_en_modo_dueno_o_mezclada_falla() {
    let env = Env::default();
    let s = ses(&env, None);
    let p = payload(&env);
    let ctx = slock(&env, &s, &s.buyer, 50, 0, 60);
    // Firma de la llave de sesion con el modo del dueno.
    let mal = vec![&env, sproof(&env, &s.w, &s.k, &p, MODE_OWNER)];
    assert_eq!(
        env.try_invoke_contract_check_auth::<WalletError>(&s.w, &p.to_bytes(), mal.into_val(&env), &ctx),
        Err(Err(InvokeError::Abort))
    );
    let mezcla = vec![&env, sproof(&env, &s.w, &s.k, &p, MODE_SESSION), proof(&env, &s.w, &key(1), &p)];
    assert_eq!(
        env.try_invoke_contract_check_auth::<WalletError>(&s.w, &p.to_bytes(), mezcla.into_val(&env), &ctx),
        Err(Ok(WalletError::MixedProofs))
    );
    let mezcla = vec![&env, proof(&env, &s.w, &key(1), &p), sproof(&env, &s.w, &s.k, &p, MODE_SESSION)];
    assert_eq!(
        env.try_invoke_contract_check_auth::<WalletError>(&s.w, &p.to_bytes(), mezcla.into_val(&env), &ctx),
        Err(Ok(WalletError::MixedProofs))
    );
}

#[test]
fn w20_congelada_falla_y_el_dueno_puede_revocar() {
    let env = Env::default();
    let s = ses(&env, None);
    let g = Address::generate(&env);
    add_g(&env, &s.c, &g);
    s.c.freeze(&vec![&env, g]);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 50, 0, 60)), Err(Ok(WalletError::Frozen)));
    let w = s.w.clone();
    let revoke = call(&env, &w, "revoke_session", vec![&env, s.id.into_val(&env)]);
    assert_eq!(check_ctx(&env, &w, &key(1), vec![&env, revoke]), Ok(()));
}

#[test]
fn w20_la_recuperacion_anula_las_sesiones() {
    let env = Env::default();
    let s = ses(&env, None);
    let g = Address::generate(&env);
    add_g(&env, &s.c, &g);
    let id = start(&env, &s.c, &[g], &key(9));
    advance(&env, RECOVERY_DELAY);
    s.c.finish_recovery(&id);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 50, 0, 60)), Err(Ok(WalletError::Stale)));
}

#[test]
fn w20_quitar_el_escrow_deja_la_sesion_sin_uso() {
    let env = Env::default();
    let s = ses(&env, None);
    s.c.remove_escrow(&s.escrow);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 50, 0, 60)), Err(Ok(WalletError::UnknownSession)));
}

#[test]
fn w20_validaciones_de_add_session() {
    let env = Env::default();
    let s = ses(&env, None);
    let (c, e, b) = (&s.c, &s.escrow, vec![&env, s.buyer.clone()]);
    let k = pk(&env, &key(6));
    let exp = env.ledger().sequence() + 100;
    assert_eq!(c.try_add_session(&k, &Address::generate(&env), &b, &10, &10, &60, &exp), Err(Ok(WalletError::UnknownEscrow)));
    assert_eq!(c.try_add_session(&k, e, &vec![&env], &10, &10, &60, &exp), Err(Ok(WalletError::InvalidSession)));
    assert_eq!(c.try_add_session(&k, e, &vec![&env, s.w.clone()], &10, &10, &60, &exp), Err(Ok(WalletError::InvalidSession)));
    assert_eq!(
        c.try_add_session(&k, e, &vec![&env, s.buyer.clone(), s.buyer.clone()], &10, &10, &60, &exp),
        Err(Ok(WalletError::InvalidSession))
    );
    assert_eq!(c.try_add_session(&k, e, &b, &0, &10, &60, &exp), Err(Ok(WalletError::InvalidSession)));
    assert_eq!(c.try_add_session(&k, e, &b, &20, &10, &60, &exp), Err(Ok(WalletError::InvalidSession)));
    assert_eq!(c.try_add_session(&k, e, &b, &10, &10, &0, &exp), Err(Ok(WalletError::InvalidSession)));
    assert_eq!(
        c.try_add_session(&k, e, &b, &10, &10, &(MAX_LOCK_TIMEOUT_MINUTES + 1), &exp),
        Err(Ok(WalletError::InvalidSession))
    );
    let now = env.ledger().sequence();
    assert_eq!(c.try_add_session(&k, e, &b, &10, &10, &60, &now), Err(Ok(WalletError::InvalidExpiry)));
    assert_eq!(c.try_add_session(&k, e, &b, &10, &10, &60, &(now + SESSION_MAX_TTL + 1)), Err(Ok(WalletError::InvalidExpiry)));
    // La llave del dueno no sirve de sesion, ni la misma sesion dos veces.
    assert_eq!(c.try_add_session(&pk(&env, &key(1)), e, &b, &10, &10, &60, &exp), Err(Ok(WalletError::KeyUsed)));
    assert_eq!(c.try_add_session(&pk(&env, &s.k), e, &b, &10, &10, &60, &exp), Err(Ok(WalletError::KeyUsed)));
    for i in 0..(MAX_SESSIONS - 1) {
        c.add_session(&pk(&env, &key(20 + i as u8)), e, &b, &10, &10, &60, &exp);
    }
    assert_eq!(c.try_add_session(&k, e, &b, &10, &10, &60, &exp), Err(Ok(WalletError::TooManySessions)));
    // Las vencidas liberan su lugar.
    advance(&env, 1_000);
    let exp = env.ledger().sequence() + 100;
    c.add_session(&k, e, &b, &10, &10, &60, &exp);
}

#[test]
fn w20_sin_firma_del_dueno_falla() {
    let env = Env::default();
    let s = ses(&env, None);
    env.set_auths(&[]);
    let exp = env.ledger().sequence() + 100;
    let b = vec![&env, s.buyer.clone()];
    assert_eq!(s.c.try_add_session(&pk(&env, &key(6)), &s.escrow, &b, &10, &10, &60, &exp).err(), Some(Err(auth_error())));
    assert_eq!(s.c.try_revoke_session(&s.id).err(), Some(Err(auth_error())));
    let t = BytesN::random(&env);
    assert_eq!(s.c.try_allow_session_decline(&s.id, &t).err(), Some(Err(auth_error())));
}

// ---------- W21: upgrade con espera ----------

/// WASM de este mismo contrato (W21), fijo en `testdata/` para que `cargo test` no dependa de
/// compilar a wasm. Sirve de "v2" en la prueba de migracion.
const WASM_V2: &[u8] = include_bytes!("../testdata/smart_wallet_w21.wasm");

#[test]
fn w21_upgrade_con_espera_conserva_el_estado() {
    let env = Env::default();
    let (w, c, gs) = with_guardians(&env, &key(1), 2, 2);
    let token = Address::generate(&env);
    c.set_limit(&token, &50);
    c.add_signer(&pk(&env, &key(2)), &1, &pop(&env, &w, &key(2)));
    let hash = env.deployer().upload_contract_wasm(WASM_V2);
    c.schedule_upgrade(&hash);
    assert_eq!(c.try_apply_upgrade(&hash), Err(Ok(WalletError::NotReady)));
    advance(&env, UPGRADE_DELAY);
    let otro = BytesN::from_array(&env, &[7u8; 32]);
    assert_eq!(c.try_apply_upgrade(&otro), Err(Ok(WalletError::UpgradeMismatch)));
    env.set_auths(&[]);
    c.apply_upgrade(&hash);
    // Despues del upgrade el estado sigue igual.
    assert_eq!(c.signers().len(), 2);
    assert_eq!(c.guardians(), gv(&env, &gs));
    assert_eq!(c.guardian_threshold(), 2);
    assert_eq!(c.limit(&token), Some(50));
    assert_eq!(c.pending_upgrade(), None);
    let p = payload(&env);
    assert_eq!(check(&env, &w, &p, vec![&env, proof(&env, &w, &key(1), &p)]), Ok(()));
}

#[test]
fn w21_cancelado_no_aplica() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, c) = setup(&env, &key(1));
    let hash = env.deployer().upload_contract_wasm(WASM_V2);
    c.schedule_upgrade(&hash);
    c.cancel_upgrade();
    advance(&env, UPGRADE_DELAY);
    assert_eq!(c.try_apply_upgrade(&hash), Err(Ok(WalletError::NothingPending)));
    assert_eq!(c.try_cancel_upgrade(), Err(Ok(WalletError::NothingPending)));
}

#[test]
fn w21_congelada_no_aplica_y_el_dueno_puede_cancelar() {
    let env = Env::default();
    let owner = key(1);
    let (w, c, gs) = with_guardians(&env, &owner, 1, 1);
    let hash = env.deployer().upload_contract_wasm(WASM_V2);
    c.schedule_upgrade(&hash);
    c.freeze(&gv(&env, &gs));
    advance(&env, UPGRADE_DELAY);
    assert_eq!(c.try_apply_upgrade(&hash), Err(Ok(WalletError::Frozen)));
    let cancel = call(&env, &w, "cancel_upgrade", vec![&env]);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, cancel]), Ok(()));
    let sched = call(&env, &w, "schedule_upgrade", vec![&env, hash.into_val(&env)]);
    assert_eq!(check_ctx(&env, &w, &owner, vec![&env, sched]), Err(Ok(WalletError::Frozen)));
}

#[test]
fn w21_la_recuperacion_anula_el_upgrade_del_dueno_anterior() {
    let env = Env::default();
    let (_, c, gs) = with_guardians(&env, &key(1), 1, 1);
    let hash = env.deployer().upload_contract_wasm(WASM_V2);
    c.schedule_upgrade(&hash);
    let id = start(&env, &c, &gs, &key(9));
    advance(&env, UPGRADE_DELAY);
    assert_eq!(c.try_apply_upgrade(&hash), Err(Ok(WalletError::RecoveryActive)));
    c.finish_recovery(&id);
    assert_eq!(c.try_apply_upgrade(&hash), Err(Ok(WalletError::Stale)));
}

#[test]
fn w21_sin_firma_de_la_wallet_falla() {
    let env = Env::default();
    let (_, c) = setup(&env, &key(1));
    let hash = BytesN::from_array(&env, &[7u8; 32]);
    assert_eq!(c.try_schedule_upgrade(&hash).err(), Some(Err(auth_error())));
    assert_eq!(c.pending_upgrade(), None);
}

// ---------- W20: ataques de la revision ----------

// ---------- REVIEW4: ataques a W20 ----------

fn r4_lock_ctx(env: &Env, escrow: &Address, seller: &Address, buyer: &Address, amount: i128, fee: i128, timeout: u32) -> Context {
    call(env, escrow, "lock", vec![
        env,
        seller.into_val(env),
        buyer.into_val(env),
        amount.into_val(env),
        fee.into_val(env),
        BytesN::<32>::random(env).into_val(env),
        timeout.into_val(env),
    ])
}

#[test]
fn r4_spent_de_sesion_se_revierte_si_check_contexts_falla() {
    let env = Env::default();
    let s = ses(&env, Some(80));
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 90, 0, 60)), Err(Ok(WalletError::LimitExceeded)));
    assert_eq!(s.c.session(&s.id).unwrap().spent, 0);
    // [lock, release]: check_session pasa y anota; check_contexts rechaza.
    let mut ctx = slock(&env, &s, &s.buyer, 50, 0, 60);
    ctx.set(1, trade_ctx(&env, &s, "release", &BytesN::random(&env)));
    assert_eq!(scheck(&env, &s, ctx), Err(Ok(WalletError::EscrowTransferMismatch)));
    assert_eq!(s.c.session(&s.id).unwrap().spent, 0);
}

#[test]
fn r4_transfer_hijo_falso_o_desviado_falla() {
    let env = Env::default();
    let s = ses(&env, None);
    let attacker = Address::generate(&env);
    let fake = Address::generate(&env);
    for second in [
        transfer_ctx(&env, &s.token, &s.w, &attacker, 50),
        transfer_ctx(&env, &fake, &s.w, &s.escrow, 50),
        transfer_ctx(&env, &s.token, &attacker, &s.escrow, 50),
        call(&env, &s.token, "transfer", vec![&env, s.w.into_val(&env), 7u32.into_val(&env), 50i128.into_val(&env)]),
    ] {
        let mut ctx = slock(&env, &s, &s.buyer, 50, 0, 60);
        ctx.set(1, second);
        assert_eq!(scheck(&env, &s, ctx), Err(Ok(WalletError::EscrowTransferMismatch)));
    }
    // Tres contextos.
    let mut ctx = slock(&env, &s, &s.buyer, 50, 0, 60);
    ctx.push_back(trade_ctx(&env, &s, "release", &BytesN::random(&env)));
    assert_eq!(scheck(&env, &s, ctx), Err(Ok(WalletError::SessionDenied)));
    // transfer primero, lock despues.
    let ctx = slock(&env, &s, &s.buyer, 50, 0, 60);
    let rev = vec![&env, ctx.get(1).unwrap(), ctx.get(0).unwrap()];
    assert_eq!(scheck(&env, &s, rev), Err(Ok(WalletError::SessionDenied)));
    assert_eq!(s.c.session(&s.id).unwrap().spent, 0);
}

#[test]
fn r4_lock_en_otro_escrow_registrado_o_con_otro_vendedor_falla() {
    let env = Env::default();
    let s = ses(&env, None);
    let e2 = Address::generate(&env);
    s.c.add_escrow(&e2, &s.token, &100);
    advance(&env, DELAY_LEDGERS);
    s.c.apply_escrow(&e2);
    let ctx = vec![&env, r4_lock_ctx(&env, &e2, &s.w, &s.buyer, 50, 0, 60), transfer_ctx(&env, &s.token, &s.w, &e2, 50)];
    assert_eq!(scheck(&env, &s, ctx), Err(Ok(WalletError::SessionDenied)));
    let otro = Address::generate(&env);
    let ctx = vec![&env, r4_lock_ctx(&env, &s.escrow, &otro, &s.buyer, 50, 0, 60), transfer_ctx(&env, &s.token, &s.w, &s.escrow, 50)];
    assert_eq!(scheck(&env, &s, ctx), Err(Ok(WalletError::EscrowLockInvalid)));
}

#[test]
fn r4_importes_extremos() {
    let env = Env::default();
    let s = ses(&env, None);
    let lk = |a: i128, f: i128| vec![&env, r4_lock_ctx(&env, &s.escrow, &s.w, &s.buyer, a, f, 60), transfer_ctx(&env, &s.token, &s.w, &s.escrow, a.wrapping_add(f))];
    assert_eq!(scheck(&env, &s, lk(i128::MAX, 1)), Err(Ok(WalletError::Overflow)));
    assert_eq!(scheck(&env, &s, lk(60, -10)), Err(Ok(WalletError::EscrowLockInvalid)));
    assert_eq!(scheck(&env, &s, lk(0, 0)), Err(Ok(WalletError::EscrowLockInvalid)));
    assert_eq!(scheck(&env, &s, lk(-5, 0)), Err(Ok(WalletError::EscrowLockInvalid)));
    let ctx = vec![&env, r4_lock_ctx(&env, &s.escrow, &s.w, &s.buyer, 50, 0, 0), transfer_ctx(&env, &s.token, &s.w, &s.escrow, 50)];
    assert_eq!(scheck(&env, &s, ctx), Err(Ok(WalletError::EscrowLockInvalid)));
    assert_eq!(s.c.session(&s.id).unwrap().spent, 0);
}

#[test]
fn r4_permiso_de_decline_no_se_comparte_ni_se_duplica() {
    let env = Env::default();
    let s = ses(&env, None);
    let t = BytesN::<32>::random(&env);
    let d = call(&env, &s.escrow, "decline", vec![&env, t.into_val(&env)]);
    s.c.allow_session_decline(&s.id, &t);
    s.c.allow_session_decline(&s.id, &t);
    assert_eq!(s.c.session(&s.id).unwrap().declines.len(), 1);
    // Dos declines con un permiso: falla y el permiso sigue.
    assert_eq!(scheck(&env, &s, vec![&env, d.clone(), d.clone()]), Err(Ok(WalletError::SessionDenied)));
    assert_eq!(s.c.session(&s.id).unwrap().declines.len(), 1);
    // Otra sesion no usa el permiso de la primera.
    let k2 = key(6);
    let exp = env.ledger().sequence() + 100;
    s.c.add_session(&pk(&env, &k2), &s.escrow, &vec![&env, s.buyer.clone()], &10, &10, &60, &exp);
    let p = payload(&env);
    let proofs = vec![&env, sproof(&env, &s.w, &k2, &p, MODE_SESSION)];
    assert_eq!(
        env.try_invoke_contract_check_auth::<WalletError>(&s.w, &p.to_bytes(), proofs.into_val(&env), &vec![&env, d.clone()]),
        Err(Ok(WalletError::SessionDenied))
    );
    // Decline en otro contrato con el mismo nombre.
    let d2 = call(&env, &Address::generate(&env), "decline", vec![&env, t.into_val(&env)]);
    assert_eq!(scheck(&env, &s, vec![&env, d2]), Err(Ok(WalletError::SessionDenied)));
    assert_eq!(scheck(&env, &s, vec![&env, d]), Ok(()));
    assert_eq!(s.c.session(&s.id).unwrap().declines.len(), 0);
}

#[test]
fn r4_firma_de_sesion_para_otra_wallet_o_como_dueno_falla() {
    let env = Env::default();
    let s = ses(&env, None);
    let p = payload(&env);
    let otra = Address::generate(&env);
    let proofs = vec![&env, sproof(&env, &otra, &s.k, &p, MODE_SESSION)];
    assert_eq!(
        env.try_invoke_contract_check_auth::<WalletError>(&s.w, &p.to_bytes(), proofs.into_val(&env), &slock(&env, &s, &s.buyer, 50, 0, 60)),
        Err(Err(InvokeError::Abort))
    );
    // Prueba de dueno con el id de la sesion.
    let msg = message(&env, &s.w, MODE_OWNER, &p);
    let forged = Proof::Ed25519(Ed25519Proof { id: s.id.clone(), sig: BytesN::from_array(&env, &s.k.sign(&msg.to_array()).to_bytes()) });
    assert_eq!(
        env.try_invoke_contract_check_auth::<WalletError>(&s.w, &p.to_bytes(), vec![&env, forged].into_val(&env), &slock(&env, &s, &s.buyer, 50, 0, 60)),
        Err(Ok(WalletError::UnknownSigner))
    );
}

// Camino real con sesion.

fn r4_sentry(env: &Env, wallet: &Address, invocation: xdr::SorobanAuthorizedInvocation, k: &SigningKey) -> xdr::SorobanAuthorizationEntry {
    static NONCE: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(900_000);
    let nonce = NONCE.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let exp = env.ledger().sequence() + 100;
    let pre = xdr::HashIdPreimage::SorobanAuthorization(xdr::HashIdPreimageSorobanAuthorization {
        network_id: xdr::Hash(env.ledger().network_id().to_array()),
        nonce,
        signature_expiration_ledger: exp,
        invocation: invocation.clone(),
    });
    let payload = env.crypto().sha256(&Bytes::from_slice(env, &pre.to_xdr(Limits::none()).unwrap()));
    let proofs: Vec<Proof> = vec![env, sproof(env, wallet, k, &payload, MODE_SESSION)];
    let v: Val = proofs.into_val(env);
    xdr::SorobanAuthorizationEntry {
        root_invocation: invocation,
        credentials: xdr::SorobanCredentials::Address(xdr::SorobanAddressCredentials {
            address: wallet.try_into().unwrap(),
            nonce,
            signature_expiration_ledger: exp,
            signature: xdr::ScVal::try_from_val(env, &v).unwrap(),
        }),
    }
}

fn r4_tree(env: &Env, s: &World, buyer: &Address, amount: i128, fee: i128, hash: &BytesN<32>) -> xdr::SorobanAuthorizedInvocation {
    let args = vec![
        env,
        s.w.into_val(env),
        buyer.into_val(env),
        amount.into_val(env),
        fee.into_val(env),
        hash.into_val(env),
        30u32.into_val(env),
    ];
    let child = invocation(&s.token, "transfer", vec![env, s.w.into_val(env), s.escrow.address.into_val(env), (amount + fee).into_val(env)], std::vec![]);
    invocation(&s.escrow.address, "lock", args, std::vec![child])
}

#[contract]
pub struct R4Caller;

#[contractimpl]
impl R4Caller {
    /// Llama varias veces a `lock` y se traga los fallos.
    pub fn many(env: Env, escrow: Address, wallet: Address, buyer: Address, amount: i128, hashes: Vec<BytesN<32>>) -> u32 {
        let e = MockEscrowClient::new(&env, &escrow);
        let mut ok = 0;
        for h in hashes.iter() {
            if e.try_lock(&wallet, &buyer, &amount, &0, &h, &30).is_ok() {
                ok += 1;
            }
        }
        ok
    }
}

fn r4_world<'a>(env: &'a Env) -> (World<'a>, Address, SigningKey, BytesN<32>) {
    let s = world(env, Some(10_000));
    let buyer = Address::generate(env);
    let k = key(5);
    let exp = env.ledger().sequence() + 1_000;
    let id = s.c.add_session(&pk(env, &k), &s.escrow.address, &vec![env, buyer.clone()], &100, &250, &60, &exp);
    (s, buyer, k, id)
}

#[test]
fn r4_camino_real_sesion_lock_y_fallido_no_cobra() {
    let env = Env::default();
    let (s, buyer, k, id) = r4_world(&env);
    let h1 = BytesN::from_array(&env, &[1u8; 32]);
    env.set_auths(&[r4_sentry(&env, &s.w, r4_tree(&env, &s, &buyer, 99, 0, &h1), &k)]);
    assert!(s.escrow.try_lock(&s.w, &buyer, &99, &0, &h1, &30).is_ok());
    assert_eq!(s.c.session(&id).unwrap().spent, 99);
    assert_eq!(s.c.spent(&s.token), 99);
    let hf = BytesN::from_array(&env, &[0xFFu8; 32]);
    env.set_auths(&[r4_sentry(&env, &s.w, r4_tree(&env, &s, &buyer, 50, 0, &hf), &k)]);
    assert!(s.escrow.try_lock(&s.w, &buyer, &50, &0, &hf, &30).is_err());
    assert_eq!(s.c.session(&id).unwrap().spent, 99);
    assert_eq!(s.c.spent(&s.token), 99);
}

#[test]
fn r4_camino_real_contrato_intermedio_traga_fallos_y_varios_locks() {
    let env = Env::default();
    let (s, buyer, k, id) = r4_world(&env);
    let caller = R4CallerClient::new(&env, &env.register(R4Caller, ()));
    let hs = [1u8, 0xFF, 2, 3, 4];
    let mut hashes = vec![&env];
    let mut auths = std::vec::Vec::new();
    for b in hs {
        let h = BytesN::from_array(&env, &[b; 32]);
        auths.push(r4_sentry(&env, &s.w, r4_tree(&env, &s, &buyer, 100, 0, &h), &k));
        hashes.push_back(h);
    }
    env.set_auths(&auths);
    let ok = caller.many(&s.escrow.address, &s.w, &buyer, &100, &hashes);
    // 1 pasa, 0xFF falla tras cobrar (se revierte), 2 pasa, 3 y 4 exceden 250.
    assert_eq!(ok, 2);
    assert_eq!(s.c.session(&id).unwrap().spent, 200);
    assert_eq!(s.c.spent(&s.token), 200);
    assert_eq!(token::Client::new(&env, &s.token).balance(&s.escrow.address), 200);
}

#[test]
fn w20_cambiar_el_token_del_escrow_anula_la_sesion() {
    let env = Env::default();
    let s = ses(&env, None);
    let t2 = Address::generate(&env);
    s.c.add_escrow(&s.escrow, &t2, &100);
    advance(&env, DELAY_LEDGERS);
    s.c.apply_escrow(&s.escrow);
    let mut ctx = slock(&env, &s, &s.buyer, 100, 0, 60);
    ctx.set(1, transfer_ctx(&env, &t2, &s.w, &s.escrow, 100));
    assert_eq!(scheck(&env, &s, ctx), Err(Ok(WalletError::Stale)));
}

#[test]
fn w20_quitar_y_volver_a_registrar_el_escrow_no_revive_la_sesion() {
    let env = Env::default();
    let s = ses(&env, None);
    s.c.remove_escrow(&s.escrow);
    assert_eq!(s.c.session(&s.id), None);
    s.c.add_escrow(&s.escrow, &s.token, &100);
    advance(&env, DELAY_LEDGERS);
    s.c.apply_escrow(&s.escrow);
    assert_eq!(scheck(&env, &s, slock(&env, &s, &s.buyer, 100, 0, 60)), Err(Ok(WalletError::UnknownSession)));
}

#[test]
fn w20_retirar_un_permiso_de_decline() {
    let env = Env::default();
    let s = ses(&env, None);
    let t: BytesN<32> = BytesN::random(&env);
    for _ in 0..(MAX_SESSION_LIST - 1) {
        s.c.allow_session_decline(&s.id, &BytesN::random(&env));
    }
    s.c.allow_session_decline(&s.id, &t);
    assert_eq!(s.c.try_allow_session_decline(&s.id, &BytesN::random(&env)), Err(Ok(WalletError::InvalidSession)));
    s.c.disallow_session_decline(&s.id, &t);
    let decline = vec![&env, call(&env, &s.escrow, "decline", vec![&env, t.into_val(&env)])];
    assert_eq!(scheck(&env, &s, decline), Err(Ok(WalletError::SessionDenied)));
    s.c.allow_session_decline(&s.id, &BytesN::random(&env));
    assert_eq!(s.c.try_disallow_session_decline(&s.id, &t), Err(Ok(WalletError::NothingPending)));
    env.set_auths(&[]);
    assert_eq!(s.c.try_disallow_session_decline(&s.id, &t).err(), Some(Err(auth_error())));
}
