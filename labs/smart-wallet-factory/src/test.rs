#![cfg(test)]
extern crate std;

use super::*;
use ed25519_dalek::{Signer as _, SigningKey};
use soroban_sdk::{
    testutils::Address as _,
    token, vec,
    xdr::{self, Limits, WriteXdr},
    Bytes, Env, IntoVal, TryFromVal, Val, Vec,
};

mod wallet {
    use soroban_sdk::auth::Context;
    soroban_sdk::contractimport!(file = "../smart-wallet/testdata/smart_wallet_w21.wasm");
}

fn key(n: u8) -> SigningKey {
    SigningKey::from_bytes(&[n; 32])
}

fn pk(env: &Env, k: &SigningKey) -> BytesN<32> {
    BytesN::from_array(env, &k.verifying_key().to_bytes())
}

fn config(env: &Env, k: &SigningKey) -> Config {
    Config { owner: pk(env, k) }
}

fn factory(env: &Env) -> SmartWalletFactoryClient<'_> {
    let hash = env.deployer().upload_contract_wasm(wallet::WASM);
    let id = env.register(SmartWalletFactory, (hash,));
    SmartWalletFactoryClient::new(env, &id)
}

/// Prueba del dueno como la arma la wallet: firma
/// `sha256("micopay-labs-wallet-v1" ‖ XDR de la wallet ‖ 0 ‖ payload)`.
fn owner_proof(env: &Env, w: &Address, k: &SigningKey, payload: &BytesN<32>) -> wallet::Proof {
    let mut b = Bytes::from_slice(env, b"micopay-labs-wallet-v1");
    b.append(&w.clone().to_xdr(env));
    b.push_back(0);
    b.append(&payload.clone().into());
    let msg: BytesN<32> = env.crypto().sha256(&b).into();
    let mut id = Bytes::from_array(env, &[0u8]);
    id.append(&pk(env, k).into());
    wallet::Proof::Ed25519(wallet::Ed25519Proof {
        id: env.crypto().sha256(&id).into(),
        sig: BytesN::from_array(env, &k.sign(&msg.to_array()).to_bytes()),
    })
}

/// Entrada de autorizacion firmada por `k` para `token.transfer(w, to, amount)`.
fn transfer_entry(env: &Env, w: &Address, token: &Address, to: &Address, amount: i128, k: &SigningKey) -> xdr::SorobanAuthorizationEntry {
    let args: Vec<Val> = vec![env, w.into_val(env), to.into_val(env), amount.into_val(env)];
    let invocation = xdr::SorobanAuthorizedInvocation {
        function: xdr::SorobanAuthorizedFunction::ContractFn(xdr::InvokeContractArgs {
            contract_address: token.try_into().unwrap(),
            function_name: "transfer".try_into().unwrap(),
            args: args.try_into().unwrap(),
        }),
        sub_invocations: std::vec![].try_into().unwrap(),
    };
    let nonce = 7;
    let exp = env.ledger().sequence() + 100;
    let pre = xdr::HashIdPreimage::SorobanAuthorization(xdr::HashIdPreimageSorobanAuthorization {
        network_id: xdr::Hash(env.ledger().network_id().to_array()),
        nonce,
        signature_expiration_ledger: exp,
        invocation: invocation.clone(),
    });
    let payload: BytesN<32> = env.crypto().sha256(&Bytes::from_slice(env, &pre.to_xdr(Limits::none()).unwrap())).into();
    let proofs: Vec<wallet::Proof> = vec![env, owner_proof(env, w, k, &payload)];
    let v: Val = proofs.into_val(env);
    xdr::SorobanAuthorizationEntry {
        root_invocation: invocation,
        credentials: xdr::SorobanCredentials::Address(xdr::SorobanAddressCredentials {
            address: w.try_into().unwrap(),
            nonce,
            signature_expiration_ledger: exp,
            signature: xdr::ScVal::try_from_val(env, &v).unwrap(),
        }),
    }
}

#[test]
fn f1_guarda_el_wasm() {
    let env = Env::default();
    let f = factory(&env);
    assert_eq!(f.wasm_hash(), env.deployer().upload_contract_wasm(wallet::WASM));
}

#[test]
fn f2_f3_la_direccion_coincide_y_la_wallet_firma_con_el_dueno() {
    let env = Env::default();
    let f = factory(&env);
    let cfg = config(&env, &key(1));
    let predicted = f.address_of(&cfg);
    let w = f.create_account(&cfg);
    assert_eq!(w, predicted);
    let wc = wallet::Client::new(&env, &w);
    assert_eq!(wc.threshold(), 1);
    assert_eq!(wc.signers().len(), 1);
    assert_eq!(f.try_create_account(&cfg), Err(Ok(FactoryError::AlreadyCreated)));
}

#[test]
fn f2_otra_config_otra_direccion() {
    let env = Env::default();
    let f = factory(&env);
    assert_ne!(f.address_of(&config(&env, &key(1))), f.address_of(&config(&env, &key(2))));
}

#[test]
fn f2_f3_config_invalida_falla_igual() {
    let env = Env::default();
    let f = factory(&env);
    let bad = Config { owner: BytesN::from_array(&env, &[0u8; 32]) };
    assert_eq!(f.try_address_of(&bad), Err(Ok(FactoryError::InvalidConfig)));
    assert_eq!(f.try_create_account(&bad), Err(Ok(FactoryError::InvalidConfig)));
}

#[test]
fn f3_prefondear_la_direccion_prevista() {
    let env = Env::default();
    let f = factory(&env);
    let owner = key(1);
    let cfg = config(&env, &owner);
    let predicted = f.address_of(&cfg);
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token = token::Client::new(&env, &sac.address());
    env.mock_all_auths();
    token::StellarAssetClient::new(&env, &sac.address()).mint(&predicted, &1_000);
    // 1. Hay saldo antes de que exista la wallet.
    assert_eq!(token.balance(&predicted), 1_000);
    env.set_auths(&[]);
    let w = f.create_account(&cfg);
    // 2. El saldo se conserva al desplegar.
    assert_eq!(token.balance(&w), 1_000);
    // 3. El firmante previsto lo gasta; otra llave no.
    let to = Address::generate(&env);
    env.set_auths(&[transfer_entry(&env, &w, &sac.address(), &to, 400, &key(2))]);
    assert!(token.try_transfer(&w, &to, &400).is_err());
    env.set_auths(&[transfer_entry(&env, &w, &sac.address(), &to, 400, &owner)]);
    token.transfer(&w, &to, &400);
    assert_eq!(token.balance(&w), 600);
    assert_eq!(token.balance(&to), 400);
}

#[test]
fn f2_sin_admin_cualquiera_crea_sin_firmas() {
    let env = Env::default();
    let f = factory(&env);
    env.set_auths(&[]);
    f.create_account(&config(&env, &key(3)));
}
