#![cfg(test)]

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{testutils::BytesN as _, vec, BytesN, Env, IntoVal};

fn setup(env: &Env, key: &SigningKey) -> soroban_sdk::Address {
    let owner = BytesN::from_array(env, &key.verifying_key().to_bytes());
    env.register(SmartAccount, (owner,))
}

#[test]
fn guarda_al_dueno() {
    let env = Env::default();
    let key = SigningKey::from_bytes(&[7u8; 32]);
    let account = setup(&env, &key);
    let client = SmartAccountClient::new(&env, &account);
    assert_eq!(client.owner().to_array(), key.verifying_key().to_bytes());
}

#[test]
fn acepta_la_firma_del_dueno() {
    let env = Env::default();
    let key = SigningKey::from_bytes(&[7u8; 32]);
    let account = setup(&env, &key);

    let payload = BytesN::<32>::random(&env);
    let sig = key.sign(&payload.to_array()).to_bytes();
    let sig: BytesN<64> = BytesN::from_array(&env, &sig);

    env.try_invoke_contract_check_auth::<AccountError>(
        &account,
        &payload,
        sig.into_val(&env),
        &vec![&env],
    )
    .unwrap();
}

#[test]
fn rechaza_otra_llave() {
    let env = Env::default();
    let key = SigningKey::from_bytes(&[7u8; 32]);
    let otra = SigningKey::from_bytes(&[9u8; 32]);
    let account = setup(&env, &key);

    let payload = BytesN::<32>::random(&env);
    let sig: BytesN<64> = BytesN::from_array(&env, &otra.sign(&payload.to_array()).to_bytes());

    assert!(env
        .try_invoke_contract_check_auth::<AccountError>(&account, &payload, sig.into_val(&env), &vec![&env])
        .is_err());
}

#[test]
fn rechaza_firma_de_otro_mensaje() {
    let env = Env::default();
    let key = SigningKey::from_bytes(&[7u8; 32]);
    let account = setup(&env, &key);

    let payload = BytesN::<32>::random(&env);
    let otro = BytesN::<32>::random(&env);
    let sig: BytesN<64> = BytesN::from_array(&env, &key.sign(&otro.to_array()).to_bytes());

    assert!(env
        .try_invoke_contract_check_auth::<AccountError>(&account, &payload, sig.into_val(&env), &vec![&env])
        .is_err());
}
