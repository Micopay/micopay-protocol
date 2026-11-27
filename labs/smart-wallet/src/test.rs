#![cfg(test)]

use super::*;
use ed25519_dalek::{Signer as _, SigningKey};
use soroban_sdk::{
    testutils::BytesN as _, vec, xdr::{ScErrorCode, ScErrorType}, Address, BytesN, Env, Error, IntoVal, InvokeError, String,
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
fn w2_la_misma_firma_dos_veces_no_suma_doble() {
    let env = Env::default();
    let a = key(1);
    let (w, _) = setup(&env, &a);
    let p = payload(&env);
    let pa = proof(&env, &w, &a, &p);
    assert_eq!(check(&env, &w, &p, vec![&env, pa.clone(), pa]), Err(Ok(WalletError::DuplicateProof)));
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
    let Proof::Ed25519(g) = good.clone();
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
