use super::*;
use soroban_sdk::testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::IntoVal;

fn base(
    mock: bool,
) -> (
    Env,
    Address,
    Address,
    Address,
    Address,
    Address,
    Bytes,
    BytesN<32>,
) {
    let env = Env::default();
    if mock {
        env.mock_all_auths();
    }
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();
    env.mock_all_auths();
    token::StellarAssetClient::new(&env, &token).mint(&seller, &1000);
    let contract = env.register(
        EscrowFactory,
        EscrowFactoryArgs::__constructor(&admin, &token, &admin),
    );
    let secret = Bytes::from_slice(&env, b"claude-audit-secret");
    let hash: BytesN<32> = env.crypto().sha256(&secret).into();
    (env, contract, admin, seller, buyer, token, secret, hash)
}

/// Sin mock_all_auths: un tercero con el secreto no puede liberar; solo el buyer.
#[test]
fn claude_release_requires_real_buyer_auth() {
    let (env, contract, _a, seller, buyer, _t, secret, hash) = base(true);
    let c = EscrowFactoryClient::new(&env, &contract);
    let id = c.lock(&seller, &buyer, &100, &1, &hash, &120);
    let intruder = Address::generate(&env);
    // Solo firma el intruso: el require_auth del buyer debe fallar.
    env.mock_auths(&[MockAuth {
        address: &intruder,
        invoke: &MockAuthInvoke {
            contract: &contract,
            fn_name: "release",
            args: (id.clone(), secret.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    // Err(Err(_)) = fallo del host (autorizacion), no un EscrowError del contrato.
    assert!(matches!(c.try_release(&id, &secret), Err(Err(_))));
    assert_eq!(c.get_trade(&id).status, TradeStatus::Locked);
    // Con la firma del buyer, pasa.
    env.mock_auths(&[MockAuth {
        address: &buyer,
        invoke: &MockAuthInvoke {
            contract: &contract,
            fn_name: "release",
            args: (id.clone(), secret.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    c.release(&id, &secret);
}

/// Sin mock_all_auths: el seller no puede hacer decline por su cuenta.
#[test]
fn claude_decline_rejects_seller_auth() {
    let (env, contract, _a, seller, buyer, _t, _s, hash) = base(true);
    let c = EscrowFactoryClient::new(&env, &contract);
    let id = c.lock(&seller, &buyer, &100, &1, &hash, &120);
    env.mock_auths(&[MockAuth {
        address: &seller,
        invoke: &MockAuthInvoke {
            contract: &contract,
            fn_name: "decline",
            args: (id.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(matches!(c.try_decline(&id), Err(Err(_))));
    env.mock_all_auths();
    assert_eq!(c.get_trade(&id).status, TradeStatus::Locked);
}

/// Ocupacion previa del hash: quien conozca secret_hash antes del lock legitimo
/// lo bloquea con 1 unidad y el lock real falla con TradeAlreadyExists.
#[test]
fn claude_hash_squatting_blocks_legit_lock() {
    let (env, contract, _a, seller, buyer, token, _s, hash) = base(true);
    let c = EscrowFactoryClient::new(&env, &contract);
    let attacker = Address::generate(&env);
    token::StellarAssetClient::new(&env, &token).mint(&attacker, &1);
    c.lock(&attacker, &attacker, &1, &0, &hash, &0);
    assert_eq!(
        c.try_lock(&seller, &buyer, &100, &1, &hash, &120),
        Err(Ok(EscrowError::TradeAlreadyExists))
    );
}

/// Si el emisor congela al buyer (o, en la red real, le falta trustline),
/// release es imposible y al vencer el seller recupera todo.
#[test]
fn claude_frozen_buyer_cannot_release_seller_refunds() {
    use soroban_sdk::testutils::IssuerFlags;
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    sac.issuer().set_flag(IssuerFlags::RevocableFlag);
    let token = sac.address();
    let st = token::StellarAssetClient::new(&env, &token);
    st.mint(&seller, &1000);
    let contract = env.register(
        EscrowFactory,
        EscrowFactoryArgs::__constructor(&admin, &token, &admin),
    );
    let c = EscrowFactoryClient::new(&env, &contract);
    let secret = Bytes::from_slice(&env, b"claude-audit-secret");
    let hash: BytesN<32> = env.crypto().sha256(&secret).into();
    let id = c.lock(&seller, &buyer, &100, &1, &hash, &1);
    st.mint(&buyer, &1);
    st.set_authorized(&buyer, &false);
    // El fallo viene del SAC (BalanceDeauthorizedError = Error(Contract, #11)),
    // pero el cliente del escrow lo decodifica como su propio codigo 11.
    // No deja liquidacion parcial: la operacion sigue bloqueada.
    assert_eq!(
        c.try_release(&id, &secret),
        Err(Ok(EscrowError::AmountOverflow))
    );
    assert_eq!(c.get_trade(&id).status, TradeStatus::Locked);
    assert_eq!(token::Client::new(&env, &token).balance(&buyer), 1);
    env.ledger().with_mut(|l| l.sequence_number += 12);
    c.refund(&id);
    assert_eq!(token::Client::new(&env, &token).balance(&seller), 1000);
}

/// Los codigos del SAC (1-13) chocan con EscrowError (1-11): un lock sin saldo
/// suficiente falla en el token con BalanceError = Error(Contract, #10), que se
/// lee como TradeAlreadyExists. Nada se escribe en el escrow.
#[test]
fn claude_token_error_codes_collide_with_escrow_errors() {
    let (env, contract, _a, seller, buyer, _t, _s, hash) = base(true);
    let c = EscrowFactoryClient::new(&env, &contract);
    let trade_id: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, &hash.to_array()))
        .into();
    assert_eq!(
        c.try_lock(&seller, &buyer, &5000, &0, &hash, &120),
        Err(Ok(EscrowError::TradeAlreadyExists))
    );
    assert_eq!(c.try_get_trade(&trade_id), Err(Ok(EscrowError::TradeNotFound)));
}
