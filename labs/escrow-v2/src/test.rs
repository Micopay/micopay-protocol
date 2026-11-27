#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, IssuerFlags, Ledger, LedgerInfo, MockAuth, MockAuthInvoke},
    token, Address, Bytes, BytesN, Env, IntoVal,
};

fn setup_env() -> (
    Env,
    Address, // contract_id
    Address, // admin
    Address, // seller
    Address, // buyer
    Address, // platform_wallet
    Address, // token_id
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let platform_wallet = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = sac.address();

    // Mint tokens to seller: 10,000 MXNe (7 decimals = 100_000_000_000 stroops)
    token::StellarAssetClient::new(&env, &token_id).mint(&seller, &100_000_000_000);

    // Register and initialize atomically through the constructor.
    let contract_id = env.register(
        EscrowFactory,
        EscrowFactoryArgs::__constructor(&admin, &token_id, &platform_wallet),
    );

    (
        env,
        contract_id,
        admin,
        seller,
        buyer,
        platform_wallet,
        token_id,
    )
}

fn make_secret(env: &Env) -> (Bytes, BytesN<32>) {
    let secret = Bytes::from_slice(env, b"test_secret_32_bytes_long_pad__!!");
    let hash: BytesN<32> = env.crypto().sha256(&secret).into();
    (secret, hash)
}

#[test]
fn test_lock_and_release() {
    let (env, contract_id, _, seller, buyer, platform_wallet, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    let (secret, secret_hash) = make_secret(&env);
    let amount: i128 = 1_500_000_000; // 150 MXNe
    let platform_fee: i128 = 12_000_000; // 1.2 MXNe

    let seller_balance_before = token_client.balance(&seller);

    // Lock
    let trade_id = escrow.lock(
        &seller,
        &buyer,
        &amount,
        &platform_fee,
        &secret_hash,
        &30u32,
    );

    // Verify seller balance decreased by amount + platform_fee
    assert_eq!(
        token_client.balance(&seller),
        seller_balance_before - amount - platform_fee
    );

    // Verify trade state
    let trade = escrow.get_trade(&trade_id);
    assert_eq!(trade.status, TradeStatus::Locked);
    assert_eq!(trade.amount, amount);
    assert_eq!(trade.seller, seller);
    assert_eq!(trade.buyer, buyer);

    // Release with correct secret
    escrow.release(&trade_id, &secret);

    // Verify buyer received the escrowed amount
    assert_eq!(token_client.balance(&buyer), amount);

    // labs (E11): la comision se acumula en el contrato y se cobra aparte.
    assert_eq!(token_client.balance(&platform_wallet), 0);
    assert_eq!(escrow.accrued_fees(), platform_fee);
    assert_eq!(escrow.claim_fees(&platform_wallet), platform_fee);
    assert_eq!(token_client.balance(&platform_wallet), platform_fee);

    // Verify trade is now Released
    let trade_after = escrow.get_trade(&trade_id);
    assert_eq!(trade_after.status, TradeStatus::Released);
}

#[test]
fn test_refund_after_timeout() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    let (_, secret_hash) = make_secret(&env);
    let amount: i128 = 1_500_000_000;
    let platform_fee: i128 = 12_000_000;

    let seller_balance_before = token_client.balance(&seller);

    let trade_id = escrow.lock(
        &seller,
        &buyer,
        &amount,
        &platform_fee,
        &secret_hash,
        &1u32, // 1 minute timeout
    );

    // Advance ledger past timeout (1 minute = ~12 ledgers, advance 20 to be safe)
    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        timestamp: current.timestamp + 120,
        sequence_number: current.sequence_number + 20,
        ..current
    });

    // Refund should succeed now
    escrow.refund(&trade_id);

    // Seller should get everything back (amount + platform_fee)
    assert_eq!(token_client.balance(&seller), seller_balance_before);

    let trade = escrow.get_trade(&trade_id);
    assert_eq!(trade.status, TradeStatus::Refunded);
}

#[test]
fn test_decline_returns_total_to_seller_before_timeout() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    let (_, secret_hash) = make_secret(&env);
    let amount: i128 = 1_500_000_000;
    let platform_fee: i128 = 12_000_000;
    let seller_balance_before = token_client.balance(&seller);

    let trade_id = escrow.lock(
        &seller,
        &buyer,
        &amount,
        &platform_fee,
        &secret_hash,
        &120u32,
    );

    escrow.decline(&trade_id);
    assert_eq!(env.auths()[0].0, buyer);

    assert_eq!(token_client.balance(&seller), seller_balance_before);
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(escrow.get_trade(&trade_id).status, TradeStatus::Declined);
}

#[test]
fn test_decline_after_timeout_still_requires_buyer_and_succeeds() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    let (_, secret_hash) = make_secret(&env);
    let seller_balance_before = token_client.balance(&seller);
    let trade_id = escrow.lock(
        &seller,
        &buyer,
        &1_000_000_000i128,
        &10_000_000i128,
        &secret_hash,
        &1u32,
    );

    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        timestamp: current.timestamp + 120,
        sequence_number: current.sequence_number + 20,
        ..current
    });

    escrow.decline(&trade_id);

    assert_eq!(token_client.balance(&seller), seller_balance_before);
    assert_eq!(escrow.get_trade(&trade_id).status, TradeStatus::Declined);
}

#[test]
fn test_decline_is_terminal_against_release_and_refund() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);

    let (secret, secret_hash) = make_secret(&env);
    let trade_id = escrow.lock(
        &seller,
        &buyer,
        &1_000_000_000i128,
        &0i128,
        &secret_hash,
        &1u32,
    );

    escrow.decline(&trade_id);

    assert_eq!(
        escrow.try_release(&trade_id, &secret),
        Err(Ok(EscrowError::TradeNotLocked)),
    );
    assert_eq!(
        escrow.try_refund(&trade_id),
        Err(Ok(EscrowError::TradeNotLocked)),
    );
    assert_eq!(
        escrow.try_decline(&trade_id),
        Err(Ok(EscrowError::TradeNotLocked)),
    );
}

#[test]
fn test_lock_rejects_amount_overflow() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, secret_hash) = make_secret(&env);

    assert_eq!(
        escrow.try_lock(&seller, &buyer, &i128::MAX, &1i128, &secret_hash, &30u32,),
        Err(Ok(EscrowError::AmountOverflow)),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")] // InvalidSecret
fn test_release_wrong_secret() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);

    let (_, secret_hash) = make_secret(&env);
    let trade_id = escrow.lock(
        &seller,
        &buyer,
        &1_000_000_000i128,
        &0i128,
        &secret_hash,
        &30u32,
    );

    let wrong_secret = Bytes::from_slice(&env, b"wrong_secret_not_matching_hash!!");
    escrow.release(&trade_id, &wrong_secret);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")] // TimeoutNotReached
fn test_refund_before_timeout() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);

    let (_, secret_hash) = make_secret(&env);
    let trade_id = escrow.lock(
        &seller,
        &buyer,
        &1_000_000_000i128,
        &0i128,
        &secret_hash,
        &30u32,
    );

    // Try refund before timeout — should panic
    escrow.refund(&trade_id);
}

#[test]
fn test_lock_rejects_reused_secret_hash() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    let attacker = Address::generate(&env);
    token::StellarAssetClient::new(&env, &token_id).mint(&attacker, &10);

    let (secret, secret_hash) = make_secret(&env);
    let amount: i128 = 1_000_000_000;
    let trade_id = escrow.lock(&seller, &buyer, &amount, &0i128, &secret_hash, &30u32);

    // El secret_hash es publico: repetirlo con 1 stroop no debe pisar la operacion.
    let result = escrow.try_lock(&attacker, &attacker, &1i128, &0i128, &secret_hash, &1u32);
    assert_eq!(result, Err(Ok(EscrowError::TradeAlreadyExists)));
    assert_eq!(token_client.balance(&attacker), 10);

    let trade = escrow.get_trade(&trade_id);
    assert_eq!(trade.seller, seller);
    assert_eq!(trade.amount, amount);

    // La operacion original se sigue liberando con normalidad.
    escrow.release(&trade_id, &secret);
    assert_eq!(token_client.balance(&buyer), amount);
    assert_eq!(token_client.balance(&contract_id), 0);
}

// ── labs (L1): firmas reales, sin mock_all_auths ─────────────────────────────

#[test]
#[should_panic]
fn test_constructor_requires_admin_signature() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token_id = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let platform_wallet = Address::generate(&env);

    // Sin la firma del admin, el despliegue falla.
    env.register(
        EscrowFactory,
        EscrowFactoryArgs::__constructor(&admin, &token_id, &platform_wallet),
    );
}

#[test]
fn test_constructor_records_admin_signature() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let token_id = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let platform_wallet = Address::generate(&env);

    env.register(
        EscrowFactory,
        EscrowFactoryArgs::__constructor(&admin, &token_id, &platform_wallet),
    );
    assert!(env.auths().iter().any(|(signer, _)| *signer == admin));
}

#[test]
fn test_decline_fails_without_buyer_signature() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    let (_, secret_hash) = make_secret(&env);
    let amount: i128 = 1_000_000_000;
    let trade_id = escrow.lock(&seller, &buyer, &amount, &0i128, &secret_hash, &120u32);

    // Solo firma el vendedor: no basta.
    env.mock_auths(&[MockAuth {
        address: &seller,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "decline",
            args: (trade_id.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(escrow.try_decline(&trade_id).is_err());
    assert_eq!(token_client.balance(&contract_id), amount);
    assert_eq!(escrow.get_trade(&trade_id).status, TradeStatus::Locked);

    // Con la firma del comprador, si.
    env.mock_auths(&[MockAuth {
        address: &buyer,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "decline",
            args: (trade_id.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    escrow.decline(&trade_id);
    assert_eq!(escrow.get_trade(&trade_id).status, TradeStatus::Declined);
}

#[test]
fn test_release_fails_without_buyer_signature() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    let (secret, secret_hash) = make_secret(&env);
    let amount: i128 = 1_000_000_000;
    let trade_id = escrow.lock(&seller, &buyer, &amount, &0i128, &secret_hash, &120u32);

    // El vendedor tiene el secreto pero no es el comprador: no cobra.
    env.mock_auths(&[MockAuth {
        address: &seller,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "release",
            args: (trade_id.clone(), secret.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(escrow.try_release(&trade_id, &secret).is_err());
    assert_eq!(token_client.balance(&buyer), 0);
    assert_eq!(escrow.get_trade(&trade_id).status, TradeStatus::Locked);
}

#[test]
fn test_refund_and_decline_end_in_different_states() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);

    let refunded_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, b"refunded"))
        .into();
    let declined_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, b"declined"))
        .into();
    let refunded = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &refunded_hash, &1u32);
    let declined = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &declined_hash, &1u32);

    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        sequence_number: current.sequence_number + 20,
        ..current
    });

    escrow.refund(&refunded);
    escrow.decline(&declined);
    assert_eq!(escrow.get_trade(&refunded).status, TradeStatus::Refunded);
    assert_eq!(escrow.get_trade(&declined).status, TradeStatus::Declined);
}

// ── labs (E1): limites del tiempo de bloqueo ─────────────────────────────────

fn lock_with_timeout(
    env: &Env,
    escrow: &EscrowFactoryClient,
    seller: &Address,
    buyer: &Address,
    tag: &[u8],
    timeout_minutes: u32,
) -> Result<BytesN<32>, EscrowError> {
    let hash: BytesN<32> = env.crypto().sha256(&Bytes::from_slice(env, tag)).into();
    match escrow.try_lock(seller, buyer, &1_000i128, &0i128, &hash, &timeout_minutes) {
        Ok(Ok(id)) => Ok(id),
        Err(Ok(e)) => Err(e),
        other => panic!("resultado inesperado: {:?}", other),
    }
}

#[test]
fn test_e1_default_bounds() {
    let (env, contract_id, _, _, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let bounds = escrow.timeout_bounds();
    assert_eq!(bounds.min_minutes, 1);
    assert_eq!(bounds.max_minutes, 1_440);
}

#[test]
fn test_e1_lock_respects_bounds() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    escrow.set_timeout_bounds(&30u32, &180u32);
    let before = token_client.balance(&seller);

    for (tag, minutes) in [(b"cero".as_slice(), 0u32), (b"min-1", 29), (b"max+1", 181)] {
        assert_eq!(
            lock_with_timeout(&env, &escrow, &seller, &buyer, tag, minutes),
            Err(EscrowError::TimeoutOutOfRange),
        );
    }
    // Un rechazo no mueve dinero.
    assert_eq!(token_client.balance(&seller), before);

    let start = env.ledger().sequence();
    let at_min = lock_with_timeout(&env, &escrow, &seller, &buyer, b"min", 30).unwrap();
    let at_max = lock_with_timeout(&env, &escrow, &seller, &buyer, b"max", 180).unwrap();
    assert_eq!(escrow.get_trade(&at_min).timeout_ledger, start + 30 * 12);
    assert_eq!(escrow.get_trade(&at_max).timeout_ledger, start + 180 * 12);
}

#[test]
fn test_e1_huge_timeout_is_an_error_not_an_abort() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    // En produccion, u32::MAX * 12 desborda y aborta. Aqui es un error normal.
    assert_eq!(
        lock_with_timeout(&env, &escrow, &seller, &buyer, b"enorme", u32::MAX),
        Err(EscrowError::TimeoutOutOfRange),
    );
}

// El host de Soroban no deja llegar a un ledger tan alto (su propio TTL
// desborda antes), asi que el calculo se prueba directo.
#[test]
fn test_e1_ledger_overflow_is_an_error() {
    assert_eq!(timeout_ledger_for(100, 30), Ok(100 + 30 * 12));
    assert_eq!(timeout_ledger_for(u32::MAX - 10, 1), Err(EscrowError::LedgerOverflow));
    assert_eq!(timeout_ledger_for(0, u32::MAX), Err(EscrowError::LedgerOverflow));
}

#[test]
fn test_e1_invalid_config_is_rejected() {
    let (env, contract_id, _, _, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let ttl_minutes = 518_400 / 12; // un trade no puede vivir mas que su TTL
    for (min, max) in [(0u32, 10u32), (20, 10), (1, ttl_minutes), (1, u32::MAX)] {
        assert_eq!(
            escrow.try_set_timeout_bounds(&min, &max),
            Err(Ok(EscrowError::InvalidConfig)),
            "min={min} max={max}",
        );
    }
    // Lo rechazado no cambia nada.
    assert_eq!(escrow.timeout_bounds().max_minutes, 1_440);
    // Justo debajo del TTL si se acepta, y min = max tambien.
    escrow.set_timeout_bounds(&1u32, &(ttl_minutes - 1));
    escrow.set_timeout_bounds(&60u32, &60u32);
}

#[test]
fn test_e1_only_admin_sets_bounds() {
    let (env, contract_id, admin, seller, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "set_timeout_bounds",
        args: (10u32, 20u32).into_val(&env),
        sub_invokes: &[],
    };

    env.mock_auths(&[MockAuth { address: &seller, invoke: &invoke }]);
    assert!(escrow.try_set_timeout_bounds(&10u32, &20u32).is_err());
    assert_eq!(escrow.timeout_bounds().min_minutes, 1);

    env.mock_auths(&[MockAuth { address: &admin, invoke: &invoke }]);
    escrow.set_timeout_bounds(&10u32, &20u32);
    assert_eq!(escrow.timeout_bounds().min_minutes, 10);
}

#[test]
fn test_e1_new_bounds_do_not_touch_open_trades() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (secret, _) = make_secret(&env);
    let hash: BytesN<32> = env.crypto().sha256(&secret).into();
    let trade_id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &120u32);
    let timeout_ledger = escrow.get_trade(&trade_id).timeout_ledger;

    escrow.set_timeout_bounds(&200u32, &300u32);
    assert_eq!(escrow.get_trade(&trade_id).timeout_ledger, timeout_ledger);
    escrow.release(&trade_id, &secret);
    assert_eq!(escrow.get_trade(&trade_id).status, TradeStatus::Released);
}

// ── labs (E2): tope de la comision de MicoPay ────────────────────────────────

fn lock_with_fee(
    env: &Env,
    escrow: &EscrowFactoryClient,
    seller: &Address,
    buyer: &Address,
    tag: &[u8],
    amount: i128,
    fee: i128,
) -> Result<BytesN<32>, EscrowError> {
    let hash: BytesN<32> = env.crypto().sha256(&Bytes::from_slice(env, tag)).into();
    match escrow.try_lock(seller, buyer, &amount, &fee, &hash, &120u32) {
        Ok(Ok(id)) => Ok(id),
        Err(Ok(e)) => Err(e),
        other => panic!("resultado inesperado: {:?}", other),
    }
}

#[test]
fn test_e2_default_cap() {
    let (env, contract_id, _, _, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    assert_eq!(escrow.fee_cap(), 100);
}

#[test]
fn test_e2_fee_at_cap_passes_and_above_fails() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    escrow.set_fee_cap(&80u32); // 0.8 %, la comision de produccion
    let amount: i128 = 1_500_000_000;
    let cap = amount * 80 / 10_000; // 12_000_000

    let before = token_client.balance(&seller);
    assert_eq!(
        lock_with_fee(&env, &escrow, &seller, &buyer, b"tope+1", amount, cap + 1),
        Err(EscrowError::FeeAboveCap),
    );
    assert_eq!(token_client.balance(&seller), before);

    lock_with_fee(&env, &escrow, &seller, &buyer, b"tope", amount, cap).unwrap();
    lock_with_fee(&env, &escrow, &seller, &buyer, b"cero", amount, 0).unwrap();
    assert_eq!(token_client.balance(&seller), before - (amount + cap) - amount);
}

#[test]
fn test_e2_small_amount_rounds_cap_down() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    // 1 % de 99 stroops es 0.99: el tope redondea hacia abajo, a 0.
    assert_eq!(
        lock_with_fee(&env, &escrow, &seller, &buyer, b"chico", 99, 1),
        Err(EscrowError::FeeAboveCap),
    );
    lock_with_fee(&env, &escrow, &seller, &buyer, b"chico-0", 99, 0).unwrap();
    // 100 stroops ya permiten 1.
    lock_with_fee(&env, &escrow, &seller, &buyer, b"cien", 100, 1).unwrap();
}

#[test]
fn test_e2_max_fee_never_overflows() {
    assert_eq!(max_platform_fee(0, 10_000), Ok(0));
    assert_eq!(max_platform_fee(12_345, 0), Ok(0));
    assert_eq!(max_platform_fee(1_500_000_000, 80), Ok(12_000_000));
    assert_eq!(max_platform_fee(19_999, 1), Ok(1));
    // El monto mas grande posible, con el tope mas alto: exacto, sin desbordar.
    assert_eq!(max_platform_fee(i128::MAX, 10_000), Ok(i128::MAX));
    assert_eq!(max_platform_fee(i128::MAX, 5_000), Ok(i128::MAX / 2));
}

#[test]
fn test_e2_invalid_cap_is_rejected() {
    let (env, contract_id, _, _, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    assert_eq!(
        escrow.try_set_fee_cap(&10_001u32),
        Err(Ok(EscrowError::InvalidConfig)),
    );
    assert_eq!(escrow.fee_cap(), 100);
    escrow.set_fee_cap(&10_000u32);
    escrow.set_fee_cap(&0u32);
    assert_eq!(escrow.fee_cap(), 0);
}

#[test]
fn test_e2_only_admin_sets_cap() {
    let (env, contract_id, admin, seller, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "set_fee_cap",
        args: (500u32,).into_val(&env),
        sub_invokes: &[],
    };

    env.mock_auths(&[MockAuth { address: &seller, invoke: &invoke }]);
    assert!(escrow.try_set_fee_cap(&500u32).is_err());
    assert_eq!(escrow.fee_cap(), 100);

    env.mock_auths(&[MockAuth { address: &admin, invoke: &invoke }]);
    escrow.set_fee_cap(&500u32);
    assert_eq!(escrow.fee_cap(), 500);
}

#[test]
fn test_e2_new_cap_does_not_touch_open_trades() {
    let (env, contract_id, _, seller, buyer, platform_wallet, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    let (secret, secret_hash) = make_secret(&env);
    let trade_id = escrow.lock(&seller, &buyer, &1_000_000i128, &10_000i128, &secret_hash, &120u32);

    // Bajar el tope a 0 no le quita la comision a un trade ya bloqueado.
    escrow.set_fee_cap(&0u32);
    escrow.release(&trade_id, &secret);
    assert_eq!(escrow.accrued_fees(), 10_000);
    escrow.claim_fees(&platform_wallet);
    assert_eq!(token_client.balance(&platform_wallet), 10_000);
}

// ── labs (E7): pausa de emergencia ───────────────────────────────────────────

fn tagged_hash(env: &Env, tag: &[u8]) -> (Bytes, BytesN<32>) {
    let secret = Bytes::from_slice(env, tag);
    let hash: BytesN<32> = env.crypto().sha256(&secret).into();
    (secret, hash)
}

#[test]
fn test_e7_pause_blocks_lock_only() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    // Tres trades abiertos antes de la pausa.
    let (secret_a, hash_a) = tagged_hash(&env, b"a");
    let (_, hash_b) = tagged_hash(&env, b"b");
    let (_, hash_c) = tagged_hash(&env, b"c");
    let a = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash_a, &1u32);
    let b = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash_b, &1u32);
    let c = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash_c, &1u32);

    escrow.pause();
    assert!(escrow.is_paused());

    // No entra un trade nuevo, y no se mueve dinero.
    let before = token_client.balance(&seller);
    let (_, hash_d) = tagged_hash(&env, b"d");
    assert_eq!(
        escrow.try_lock(&seller, &buyer, &1_000i128, &0i128, &hash_d, &1u32),
        Err(Ok(EscrowError::Paused)),
    );
    assert_eq!(token_client.balance(&seller), before);

    // Las tres salidas siguen funcionando en pausa.
    escrow.release(&a, &secret_a);
    escrow.decline(&b);
    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        sequence_number: current.sequence_number + 20,
        ..current
    });
    escrow.refund(&c);
    assert_eq!(escrow.get_trade(&a).status, TradeStatus::Released);
    assert_eq!(escrow.get_trade(&b).status, TradeStatus::Declined);
    assert_eq!(escrow.get_trade(&c).status, TradeStatus::Refunded);
    assert_eq!(token_client.balance(&contract_id), 0);
}

#[test]
fn test_e7_unpause_reopens_lock() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    assert!(!escrow.is_paused());
    escrow.pause();
    escrow.unpause();
    assert!(!escrow.is_paused());
    let (_, hash) = tagged_hash(&env, b"despues");
    escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &1u32);
}

#[test]
fn test_e7_only_admin_pauses_and_unpauses() {
    let (env, contract_id, admin, seller, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let pause = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "pause",
        args: ().into_val(&env),
        sub_invokes: &[],
    };
    let unpause = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "unpause",
        args: ().into_val(&env),
        sub_invokes: &[],
    };

    env.mock_auths(&[MockAuth { address: &seller, invoke: &pause }]);
    assert!(escrow.try_pause().is_err());
    assert!(!escrow.is_paused());

    env.mock_auths(&[MockAuth { address: &admin, invoke: &pause }]);
    escrow.pause();

    env.mock_auths(&[MockAuth { address: &seller, invoke: &unpause }]);
    assert!(escrow.try_unpause().is_err());
    assert!(escrow.is_paused());

    env.mock_auths(&[MockAuth { address: &admin, invoke: &unpause }]);
    escrow.unpause();
    assert!(!escrow.is_paused());
}

// ── labs (E9): cambio de admin en dos pasos ──────────────────────────────────

fn auth_for<'a>(
    who: &'a Address,
    invoke: &'a MockAuthInvoke<'a>,
) -> MockAuth<'a> {
    MockAuth { address: who, invoke }
}

#[test]
fn test_e9_admin_changes_only_after_accept() {
    let (env, contract_id, admin, _, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let new_admin = Address::generate(&env);

    escrow.propose_admin(&new_admin);
    // Mientras no acepta, el admin sigue siendo el de antes y puede actuar.
    assert_eq!(escrow.admin(), admin);
    assert_eq!(escrow.pending_admin(), Some(new_admin.clone()));
    escrow.set_fee_cap(&200u32);

    escrow.accept_admin();
    assert_eq!(escrow.admin(), new_admin);
    assert_eq!(escrow.pending_admin(), None);
    // Ya no hay nada que aceptar.
    assert_eq!(escrow.try_accept_admin(), Err(Ok(EscrowError::NoPendingAdmin)));
}

#[test]
fn test_e9_accept_without_proposal_fails() {
    let (env, contract_id, _, _, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    assert_eq!(escrow.try_accept_admin(), Err(Ok(EscrowError::NoPendingAdmin)));
}

#[test]
fn test_e9_only_admin_proposes() {
    let (env, contract_id, admin, seller, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let candidate = Address::generate(&env);
    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "propose_admin",
        args: (candidate.clone(),).into_val(&env),
        sub_invokes: &[],
    };

    env.mock_auths(&[auth_for(&seller, &invoke)]);
    assert!(escrow.try_propose_admin(&candidate).is_err());
    assert_eq!(escrow.pending_admin(), None);

    env.mock_auths(&[auth_for(&admin, &invoke)]);
    escrow.propose_admin(&candidate);
    assert_eq!(escrow.pending_admin(), Some(candidate));
}

#[test]
fn test_e9_wrong_candidate_cannot_accept_and_new_proposal_replaces() {
    let (env, contract_id, admin, _, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    escrow.propose_admin(&first);
    escrow.propose_admin(&second);
    assert_eq!(escrow.pending_admin(), Some(second.clone()));

    let accept = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "accept_admin",
        args: ().into_val(&env),
        sub_invokes: &[],
    };
    // El primero ya no fue el elegido, y el admin actual tampoco puede aceptar por el.
    for wrong in [&first, &admin] {
        env.mock_auths(&[auth_for(wrong, &accept)]);
        assert!(escrow.try_accept_admin().is_err());
        assert_eq!(escrow.admin(), admin);
    }

    env.mock_auths(&[auth_for(&second, &accept)]);
    escrow.accept_admin();
    assert_eq!(escrow.admin(), second);
}

#[test]
fn test_e9_old_admin_loses_permissions() {
    let (env, contract_id, admin, _, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let new_admin = Address::generate(&env);
    escrow.propose_admin(&new_admin);
    escrow.accept_admin();

    let pause = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "pause",
        args: ().into_val(&env),
        sub_invokes: &[],
    };
    env.mock_auths(&[auth_for(&admin, &pause)]);
    assert!(escrow.try_pause().is_err());
    assert!(!escrow.is_paused());

    env.mock_auths(&[auth_for(&new_admin, &pause)]);
    escrow.pause();
    assert!(escrow.is_paused());
}

// ── labs (E11): comisiones acumuladas ────────────────────────────────────────

#[test]
fn test_e11_release_pays_buyer_even_if_platform_wallet_is_frozen() {
    // Mismo arranque que setup_env, pero con un token que el emisor puede congelar.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let platform_wallet = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(admin.clone());
    asset.issuer().set_flag(IssuerFlags::RevocableFlag);
    let token_id = asset.address();
    let sac = token::StellarAssetClient::new(&env, &token_id);
    sac.mint(&seller, &100_000_000i128);
    let contract_id = env.register(
        EscrowFactory,
        EscrowFactoryArgs::__constructor(&admin, &token_id, &platform_wallet),
    );
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    // La billetera de MicoPay queda congelada: no puede recibir.
    sac.set_authorized(&platform_wallet, &false);
    assert!(!sac.authorized(&platform_wallet));

    let (secret, hash) = tagged_hash(&env, b"congelada");
    let trade_id = escrow.lock(&seller, &buyer, &1_000_000i128, &8_000i128, &hash, &120u32);
    escrow.release(&trade_id, &secret);

    assert_eq!(token_client.balance(&buyer), 1_000_000);
    assert_eq!(escrow.accrued_fees(), 8_000);
    // Cobrar a la billetera congelada falla y no pierde lo acumulado.
    assert!(escrow.try_claim_fees(&platform_wallet).is_err());
    assert_eq!(escrow.accrued_fees(), 8_000);
    // Se puede cobrar en otra direccion.
    let other = Address::generate(&env);
    assert_eq!(escrow.claim_fees(&other), 8_000);
    assert_eq!(token_client.balance(&other), 8_000);
}

#[test]
fn test_e11_claim_pays_accrued_once() {
    let (env, contract_id, _, seller, buyer, platform_wallet, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    for (tag, fee) in [(b"uno".as_slice(), 3_000i128), (b"dos", 5_000)] {
        let (secret, hash) = tagged_hash(&env, tag);
        let id = escrow.lock(&seller, &buyer, &1_000_000i128, &fee, &hash, &120u32);
        escrow.release(&id, &secret);
    }
    assert_eq!(escrow.claim_fees(&platform_wallet), 8_000);
    assert_eq!(escrow.accrued_fees(), 0);
    // Un segundo cobro no paga nada.
    assert_eq!(escrow.claim_fees(&platform_wallet), 0);
    assert_eq!(token_client.balance(&platform_wallet), 8_000);
}

#[test]
fn test_e11_only_admin_claims() {
    let (env, contract_id, admin, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    let (secret, hash) = tagged_hash(&env, b"admin");
    let id = escrow.lock(&seller, &buyer, &1_000_000i128, &8_000i128, &hash, &120u32);
    escrow.release(&id, &secret);

    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "claim_fees",
        args: (seller.clone(),).into_val(&env),
        sub_invokes: &[],
    };
    env.mock_auths(&[auth_for(&seller, &invoke)]);
    assert!(escrow.try_claim_fees(&seller).is_err());
    assert_eq!(escrow.accrued_fees(), 8_000);

    env.mock_auths(&[auth_for(&admin, &invoke)]);
    let before = token_client.balance(&seller);
    escrow.claim_fees(&seller);
    assert_eq!(token_client.balance(&seller), before + 8_000);
}

#[test]
fn test_e11_contract_balance_matches_open_trades_plus_fees() {
    let (env, contract_id, _, seller, buyer, platform_wallet, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);

    let (s1, h1) = tagged_hash(&env, b"t1");
    let (_, h2) = tagged_hash(&env, b"t2");
    let (_, h3) = tagged_hash(&env, b"t3");
    let t1 = escrow.lock(&seller, &buyer, &1_000_000i128, &8_000i128, &h1, &1u32);
    let t2 = escrow.lock(&seller, &buyer, &2_000_000i128, &16_000i128, &h2, &1u32);
    let t3 = escrow.lock(&seller, &buyer, &500_000i128, &4_000i128, &h3, &1u32);

    // saldo del contrato = suma de (monto + comision) de los abiertos + acumuladas
    let check = |open: &[&BytesN<32>]| {
        let locked: i128 = open
            .iter()
            .map(|id| {
                let t = escrow.get_trade(id);
                t.amount + t.platform_fee
            })
            .sum();
        assert_eq!(token_client.balance(&contract_id), locked + escrow.accrued_fees());
    };
    check(&[&t1, &t2, &t3]);
    escrow.release(&t1, &s1);
    check(&[&t2, &t3]);
    escrow.decline(&t2);
    check(&[&t3]);
    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        sequence_number: current.sequence_number + 20,
        ..current
    });
    escrow.refund(&t3);
    check(&[]);
    escrow.claim_fees(&platform_wallet);
    check(&[]);
    assert_eq!(token_client.balance(&contract_id), 0);
}

// ── labs (E12): el comprador acepta ──────────────────────────────────────────

#[test]
fn test_e12_buyer_accepts_once() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, hash) = tagged_hash(&env, b"acepta");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &120u32);
    assert!(!escrow.get_trade(&id).accepted);

    escrow.accept(&id);
    assert_eq!(env.auths()[0].0, buyer);
    assert!(escrow.get_trade(&id).accepted);
    assert_eq!(escrow.try_accept(&id), Err(Ok(EscrowError::AlreadyAccepted)));
}

#[test]
fn test_e12_only_buyer_accepts() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, hash) = tagged_hash(&env, b"solo-comprador");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &120u32);
    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "accept",
        args: (id.clone(),).into_val(&env),
        sub_invokes: &[],
    };

    // El vendedor no puede aceptar por el comprador (asi se inflaria su propia reputacion).
    env.mock_auths(&[auth_for(&seller, &invoke)]);
    assert!(escrow.try_accept(&id).is_err());
    assert!(!escrow.get_trade(&id).accepted);

    env.mock_auths(&[auth_for(&buyer, &invoke)]);
    escrow.accept(&id);
    assert!(escrow.get_trade(&id).accepted);
}

#[test]
fn test_e12_unaccepted_trade_works_the_same() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    let (secret, hash) = tagged_hash(&env, b"sin-aceptar");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &120u32);
    escrow.release(&id, &secret);
    assert_eq!(token_client.balance(&buyer), 1_000);
    assert!(!escrow.get_trade(&id).accepted);
}

#[test]
fn test_e12_closed_trade_cannot_be_accepted() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, hash) = tagged_hash(&env, b"cerrado");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &120u32);
    escrow.decline(&id);
    assert_eq!(escrow.try_accept(&id), Err(Ok(EscrowError::TradeNotLocked)));
    assert!(!escrow.get_trade(&id).accepted);
}
