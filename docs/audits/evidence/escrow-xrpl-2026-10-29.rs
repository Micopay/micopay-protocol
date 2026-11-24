use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

fn fixture() -> (Env, Address, Address, Address, Address, Bytes, BytesN<32>) {
    let env = Env::default();
    env.mock_all_auths();
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    token::StellarAssetClient::new(&env, &token).mint(&seller, &1000);
    let contract = env.register(EscrowFactory, EscrowFactoryArgs::__constructor(&admin, &token, &admin));
    let secret = Bytes::from_slice(&env, b"audit-secret");
    let hash = env.crypto().sha256(&secret).into();
    (env, contract, seller, buyer, token, secret, hash)
}

#[test]
fn audit_release_succeeds_after_refund_deadline() {
    let (env, contract, seller, buyer, token, secret, hash) = fixture();
    let c = EscrowFactoryClient::new(&env, &contract);
    let id = c.lock(&seller, &buyer, &100, &1, &hash, &1);
    env.ledger().with_mut(|l| l.sequence_number += 13);
    c.release(&id, &secret);
    assert_eq!(token::Client::new(&env, &token).balance(&buyer), 100);
    assert_eq!(c.try_refund(&id), Err(Ok(EscrowError::TradeNotLocked)));
}

#[test]
fn audit_refund_wins_at_exact_deadline() {
    let (env, contract, seller, buyer, token, secret, hash) = fixture();
    let c = EscrowFactoryClient::new(&env, &contract);
    let id = c.lock(&seller, &buyer, &100, &1, &hash, &1);
    env.ledger().with_mut(|l| l.sequence_number += 12);
    c.refund(&id);
    assert_eq!(token::Client::new(&env, &token).balance(&seller), 1000);
    assert_eq!(c.try_release(&id, &secret), Err(Ok(EscrowError::TradeNotLocked)));
}

#[test]
fn audit_zero_timeout_refunds_immediately() {
    let (env, contract, seller, buyer, token, _, hash) = fixture();
    let c = EscrowFactoryClient::new(&env, &contract);
    let id = c.lock(&seller, &buyer, &100, &1, &hash, &0);
    c.refund(&id);
    assert_eq!(token::Client::new(&env, &token).balance(&seller), 1000);
}

#[test]
fn audit_same_hash_has_same_id_across_instances() {
    let (env, contract, seller, buyer, token, _, hash) = fixture();
    let c = EscrowFactoryClient::new(&env, &contract);
    let second = env.register(EscrowFactory, EscrowFactoryArgs::__constructor(&seller, &token, &seller));
    let d = EscrowFactoryClient::new(&env, &second);
    let id = c.lock(&seller, &buyer, &100, &1, &hash, &120);
    let other_id = d.lock(&seller, &seller, &1, &0, &hash, &0);
    assert_eq!(id, other_id);
    d.refund(&other_id);
    assert_eq!(c.get_trade(&id).status, TradeStatus::Locked);
    assert_eq!(d.get_trade(&id).status, TradeStatus::Refunded);
}
