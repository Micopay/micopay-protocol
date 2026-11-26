#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Bytes, BytesN, Env};

const AMOUNT: i128 = 55_550_000_000; // 5,555 XLM

fn setup() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let claimant = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = sac.address();
    // 20,000 XLM para poder fondear dos veces.
    token::StellarAssetClient::new(&env, &token_id).mint(&admin, &200_000_000_000);

    let code = Bytes::from_slice(&env, b"Ship It");
    let code_hash: BytesN<32> = env.crypto().sha256(&code).into();

    let contract_id = env.register(
        BovedaShipIt,
        BovedaShipItArgs::__constructor(&admin, &token_id, &AMOUNT, &code_hash),
    );

    (env, contract_id, admin, claimant, token_id)
}

fn code(env: &Env) -> Bytes {
    Bytes::from_slice(env, b"Ship It")
}

#[test]
fn test_constructor_deja_estado_inicial() {
    let (env, contract_id, admin, _, token_id) = setup();
    let boveda = BovedaShipItClient::new(&env, &contract_id);

    let state = boveda.state();
    assert_eq!(state.admin, admin);
    assert_eq!(state.token, token_id);
    assert_eq!(state.amount, AMOUNT);
    assert_eq!(state.balance, 0);
    assert!(!state.claimed);
    assert_eq!(state.claimed_by, None);
}

#[test]
fn test_fund_mueve_los_xlm_a_la_boveda() {
    let (env, contract_id, admin, _, token_id) = setup();
    let boveda = BovedaShipItClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    let before = token_client.balance(&admin);
    boveda.fund(&admin);

    assert_eq!(token_client.balance(&admin), before - AMOUNT);
    assert_eq!(token_client.balance(&contract_id), AMOUNT);
    assert_eq!(boveda.state().balance, AMOUNT);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")] // InvalidCode
fn test_claim_con_codigo_incorrecto_falla() {
    let (env, contract_id, admin, claimant, token_id) = setup();
    let boveda = BovedaShipItClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    boveda.fund(&admin);
    let wrong = Bytes::from_slice(&env, b"ship it");

    assert_eq!(token_client.balance(&claimant), 0);
    assert_eq!(token_client.balance(&contract_id), AMOUNT);
    assert!(!boveda.state().claimed);

    boveda.claim(&claimant, &wrong);
}

#[test]
fn test_claim_con_codigo_correcto_libera() {
    let (env, contract_id, admin, claimant, token_id) = setup();
    let boveda = BovedaShipItClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    boveda.fund(&admin);
    let released = boveda.claim(&claimant, &code(&env));

    assert_eq!(released, AMOUNT);
    assert_eq!(token_client.balance(&claimant), AMOUNT);
    assert_eq!(token_client.balance(&contract_id), 0);

    let state = boveda.state();
    assert!(state.claimed);
    assert_eq!(state.claimed_by, Some(claimant));
    assert_eq!(state.balance, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")] // AlreadyClaimed
fn test_claim_dos_veces_falla() {
    let (env, contract_id, admin, claimant, token_id) = setup();
    let boveda = BovedaShipItClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    boveda.fund(&admin);
    boveda.claim(&claimant, &code(&env));

    assert_eq!(token_client.balance(&claimant), AMOUNT);

    boveda.claim(&claimant, &code(&env));
}

#[test]
fn test_reset_permite_reclamar_de_nuevo() {
    let (env, contract_id, admin, claimant, token_id) = setup();
    let boveda = BovedaShipItClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    let other = Address::generate(&env);

    boveda.fund(&admin);
    boveda.claim(&claimant, &code(&env));

    boveda.reset();
    assert!(!boveda.state().claimed);

    boveda.fund(&admin);
    boveda.claim(&other, &code(&env));

    assert_eq!(token_client.balance(&claimant), AMOUNT);
    assert_eq!(token_client.balance(&other), AMOUNT);
    assert_eq!(boveda.state().claimed_by, Some(other));
}

#[test]
fn test_withdraw_devuelve_el_saldo_al_admin() {
    let (env, contract_id, admin, _, token_id) = setup();
    let boveda = BovedaShipItClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    boveda.fund(&admin);
    boveda.withdraw(&admin);

    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(boveda.state().balance, 0);
}
