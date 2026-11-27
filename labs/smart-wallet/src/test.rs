#![cfg(test)]

use super::*;
use ed25519_dalek::SigningKey;
use soroban_sdk::{Address, BytesN, Env};

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
/// Prueba de posesion de `k` para agregarla a `wallet` (W3).
/// Lo que devuelve el cliente cuando falta la firma de la wallet: `Error(Auth, InvalidAction)`.
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
