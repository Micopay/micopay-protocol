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

/// labs (E3): margen con el que nace el contrato (15 min), en ledgers.
const MARGIN: u32 = 15 * 12;

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
        sequence_number: current.sequence_number + 20 + MARGIN,
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
        sequence_number: current.sequence_number + 20 + MARGIN,
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
        sequence_number: current.sequence_number + 20 + MARGIN,
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
    // labs (E3): la vida cuenta el margen de 15 min.
    // labs (E4): y el plazo de disputa de 7 dias.
    let dispute = 7 * 24 * 60;
    for (min, max) in [
        (0u32, 10u32),
        (20, 10),
        (1, ttl_minutes),
        (1, ttl_minutes - 15),
        (1, ttl_minutes - 15 - dispute),
        (1, u32::MAX),
    ] {
        assert_eq!(
            escrow.try_set_timeout_bounds(&min, &max),
            Err(Ok(EscrowError::InvalidConfig)),
            "min={min} max={max}",
        );
    }
    // Lo rechazado no cambia nada.
    assert_eq!(escrow.timeout_bounds().max_minutes, 1_440);
    // Justo debajo del TTL si se acepta, y min = max tambien.
    escrow.set_timeout_bounds(&1u32, &(ttl_minutes - 15 - dispute - 1));
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
        sequence_number: current.sequence_number + 20 + MARGIN,
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
        sequence_number: current.sequence_number + 20 + MARGIN,
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

// ── labs (E8): extender el plazo ─────────────────────────────────────────────

fn extend_auths<'a>(
    env: &Env,
    contract_id: &'a Address,
    trade_id: &BytesN<32>,
    new_timeout_ledger: u32,
) -> MockAuthInvoke<'a> {
    MockAuthInvoke {
        contract: contract_id,
        fn_name: "extend",
        args: (trade_id.clone(), new_timeout_ledger).into_val(env),
        sub_invokes: &[],
    }
}

#[test]
fn test_e8_extend_needs_both_signatures() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, hash) = tagged_hash(&env, b"extender");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &120u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    let new_t = t + 60 * 12;
    let invoke = extend_auths(&env, &contract_id, &id, new_t);

    // Con una sola firma, de cualquiera de los dos, no se extiende.
    for who in [&seller, &buyer] {
        env.mock_auths(&[auth_for(who, &invoke)]);
        assert!(escrow.try_extend(&id, &new_t).is_err());
        assert_eq!(escrow.get_trade(&id).timeout_ledger, t);
    }

    env.mock_auths(&[auth_for(&seller, &invoke), auth_for(&buyer, &invoke)]);
    escrow.extend(&id, &new_t);
    assert_eq!(escrow.get_trade(&id).timeout_ledger, new_t);
}

#[test]
fn test_e8_signature_is_for_one_new_timeout() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, hash) = tagged_hash(&env, b"una-firma");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &120u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    let agreed = extend_auths(&env, &contract_id, &id, t + 100);

    // Las dos firmaron t + 100: con esas firmas no se puede pedir t + 500.
    env.mock_auths(&[auth_for(&seller, &agreed), auth_for(&buyer, &agreed)]);
    assert!(escrow.try_extend(&id, &(t + 500)).is_err());
    assert_eq!(escrow.get_trade(&id).timeout_ledger, t);
}

#[test]
fn test_e8_new_timeout_must_be_later() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, hash) = tagged_hash(&env, b"posterior");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &120u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    for new_t in [t, t - 1] {
        assert_eq!(escrow.try_extend(&id, &new_t), Err(Ok(EscrowError::InvalidExtension)));
    }
}

#[test]
fn test_e8_cap_is_counted_from_lock_and_kept_per_trade() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    escrow.set_timeout_bounds(&1u32, &180u32); // vida maxima: 180 min
    let (_, hash) = tagged_hash(&env, b"tope");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &60u32);
    let trade = escrow.get_trade(&id);
    assert_eq!(trade.max_total_ledgers, 180 * 12);
    let cap = trade.lock_ledger + 180 * 12;

    // Dos extensiones dentro del tope pasan; la ultima justo en el tope.
    escrow.extend(&id, &(trade.lock_ledger + 120 * 12));
    escrow.extend(&id, &cap);
    assert_eq!(escrow.get_trade(&id).timeout_ledger, cap);

    // Si el admin sube el maximo despues, este trade conserva su tope.
    escrow.set_timeout_bounds(&1u32, &1_440u32);
    assert_eq!(escrow.try_extend(&id, &(cap + 1)), Err(Ok(EscrowError::ExtensionAboveCap)));
}

#[test]
fn test_e8_expired_closed_or_paused_cannot_extend() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, h1) = tagged_hash(&env, b"vencido");
    let (_, h2) = tagged_hash(&env, b"cerrado");
    let (_, h3) = tagged_hash(&env, b"pausa");
    let expired = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &h1, &1u32);
    let closed = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &h2, &120u32);
    let paused = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &h3, &120u32);

    escrow.decline(&closed);
    let t_closed = escrow.get_trade(&closed).timeout_ledger;
    assert_eq!(escrow.try_extend(&closed, &(t_closed + 12)), Err(Ok(EscrowError::TradeNotLocked)));

    escrow.pause();
    let t_paused = escrow.get_trade(&paused).timeout_ledger;
    assert_eq!(escrow.try_extend(&paused, &(t_paused + 12)), Err(Ok(EscrowError::Paused)));
    escrow.unpause();
    escrow.extend(&paused, &(t_paused + 12));

    let t = escrow.get_trade(&expired).timeout_ledger;
    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        sequence_number: t,
        ..current
    });
    assert_eq!(escrow.try_extend(&expired, &(t + 12)), Err(Ok(EscrowError::TimeoutReached)));
}

#[test]
fn test_e8_extended_trade_refunds_only_at_new_timeout() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, hash) = tagged_hash(&env, b"reembolso");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &1u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    escrow.extend(&id, &(t + 120));

    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        sequence_number: t,
        ..current
    });
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::TimeoutNotReached)));
    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        sequence_number: t + 120 + MARGIN,
        ..current
    });
    escrow.refund(&id);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Refunded);
}

// ── labs (X1): trade grande con un participante con tier ─────────────────────

mod tier_mock {
    use crate::types::TierRecord;
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[contracttype]
    enum Key {
        Tier(Address),
        Calls,
    }

    /// Hace de `AgentTierRegistry`: devuelve el tier que le pongan y cuenta consultas.
    #[contract]
    pub struct MockTierRegistry;

    #[contractimpl]
    impl MockTierRegistry {
        pub fn set(env: Env, agent: Address, tier: u32, epoch: u32) {
            env.storage().instance().set(&Key::Tier(agent), &TierRecord { tier, epoch });
        }

        pub fn get_tier(env: Env, agent: Address) -> Option<TierRecord> {
            let calls: u32 = env.storage().instance().get(&Key::Calls).unwrap_or(0);
            env.storage().instance().set(&Key::Calls, &(calls + 1));
            env.storage().instance().get(&Key::Tier(agent))
        }

        pub fn calls(env: Env) -> u32 {
            env.storage().instance().get(&Key::Calls).unwrap_or(0)
        }
    }

    /// Un registro roto: cualquier consulta falla.
    #[contract]
    pub struct BrokenTierRegistry;

    #[contractimpl]
    impl BrokenTierRegistry {
        pub fn get_tier(_env: Env, _agent: Address) -> Option<TierRecord> {
            panic!("registro roto")
        }
    }
}

use tier_mock::{BrokenTierRegistry, MockTierRegistry, MockTierRegistryClient};

const BIG: i128 = 10_000_000_000; // 1,000 unidades del token
const PLATA: u32 = 2;

fn gated() -> (Env, EscrowFactoryClient<'static>, Address, Address, Address, MockTierRegistryClient<'static>) {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let registry_id = env.register(MockTierRegistry, ());
    let registry = MockTierRegistryClient::new(&env, &registry_id);
    escrow.set_tier_gate(&registry_id, &BIG, &PLATA);
    (env, escrow, contract_id, seller, buyer, registry)
}

fn lock_amount(
    env: &Env,
    escrow: &EscrowFactoryClient,
    seller: &Address,
    buyer: &Address,
    tag: &[u8],
    amount: i128,
) -> Result<BytesN<32>, EscrowError> {
    let (_, hash) = tagged_hash(env, tag);
    match escrow.try_lock(seller, buyer, &amount, &0i128, &hash, &120u32) {
        Ok(Ok(id)) => Ok(id),
        Err(Ok(e)) => Err(e),
        other => panic!("resultado inesperado: {:?}", other),
    }
}

#[test]
fn test_x1_below_threshold_does_not_ask() {
    let (env, escrow, _, seller, buyer, registry) = gated();
    lock_amount(&env, &escrow, &seller, &buyer, b"chico", BIG - 1).unwrap();
    assert_eq!(registry.calls(), 0);
}

#[test]
fn test_x1_at_threshold_without_tier_fails() {
    let (env, escrow, _, seller, buyer, registry) = gated();
    // En el umbral exacto ya se pide tier, y nadie lo tiene.
    assert_eq!(
        lock_amount(&env, &escrow, &seller, &buyer, b"justo", BIG),
        Err(EscrowError::TierRequired),
    );
    // (El conteo de consultas no sirve aqui: un lock fallido revierte todo, tambien
    // el contador del registro simulado.)
    let _ = registry;
}

#[test]
fn test_x1_seller_with_tier_passes() {
    let (env, escrow, _, seller, buyer, registry) = gated();
    registry.set(&seller, &PLATA, &1);
    lock_amount(&env, &escrow, &seller, &buyer, b"vendedor", BIG).unwrap();
    // Con el vendedor basta: no se consulta al comprador.
    assert_eq!(registry.calls(), 1);
}

#[test]
fn test_x1_low_or_expired_tier_does_not_count() {
    let (env, escrow, _, seller, buyer, registry) = gated();
    // Bronce no alcanza para Plata.
    registry.set(&seller, &1, &1);
    assert_eq!(
        lock_amount(&env, &escrow, &seller, &buyer, b"bronce", BIG),
        Err(EscrowError::TierRequired),
    );
    // Oro si alcanza.
    registry.set(&seller, &3, &1);
    lock_amount(&env, &escrow, &seller, &buyer, b"oro", BIG).unwrap();
    // Vencido: el registro real (get_tier, R4) da None, igual que un agente que
    // nunca probo; ese caso es el de test_x1_at_threshold_without_tier_fails.
}

#[test]
fn test_x1_buyer_with_tier_must_sign() {
    let (env, escrow, contract_id, seller, buyer, registry) = gated();
    registry.set(&buyer, &PLATA, &1);
    let (_, hash) = tagged_hash(&env, b"comprador");
    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "lock",
        args: (seller.clone(), buyer.clone(), BIG, 0i128, hash.clone(), 120u32).into_val(&env),
        sub_invokes: &[],
    };

    // Solo firma el vendedor: el comprador con tier tiene que firmar tambien.
    env.mock_auths(&[auth_for(&seller, &invoke)]);
    assert!(escrow.try_lock(&seller, &buyer, &BIG, &0i128, &hash, &120u32).is_err());

    env.mock_all_auths();
    escrow.lock(&seller, &buyer, &BIG, &0i128, &hash, &120u32);
    assert!(env.auths().iter().any(|(signer, _)| *signer == buyer));
}

#[test]
fn test_x1_broken_registry_fails_the_lock() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    let broken = env.register(BrokenTierRegistry, ());
    escrow.set_tier_gate(&broken, &BIG, &PLATA);
    let before = token_client.balance(&seller);
    let (_, hash) = tagged_hash(&env, b"roto");
    assert!(escrow.try_lock(&seller, &buyer, &BIG, &0i128, &hash, &120u32).is_err());
    assert_eq!(token_client.balance(&seller), before);
    // Abajo del umbral no se consulta, asi que pasa aunque el registro este roto.
    lock_amount(&env, &escrow, &seller, &buyer, b"chico-roto", BIG - 1).unwrap();
}

#[test]
fn test_x1_gate_config() {
    let (env, contract_id, admin, seller, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let registry = env.register(MockTierRegistry, ());
    assert_eq!(escrow.tier_gate(), None);
    for (threshold, tier) in [(0i128, PLATA), (-1, PLATA), (BIG, 0), (BIG, 4)] {
        assert_eq!(
            escrow.try_set_tier_gate(&registry, &threshold, &tier),
            Err(Ok(EscrowError::InvalidConfig)),
        );
    }

    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "set_tier_gate",
        args: (registry.clone(), BIG, PLATA).into_val(&env),
        sub_invokes: &[],
    };
    env.mock_auths(&[auth_for(&seller, &invoke)]);
    assert!(escrow.try_set_tier_gate(&registry, &BIG, &PLATA).is_err());
    assert_eq!(escrow.tier_gate(), None);
    env.mock_auths(&[auth_for(&admin, &invoke)]);
    escrow.set_tier_gate(&registry, &BIG, &PLATA);
    assert_eq!(escrow.tier_gate().unwrap().threshold, BIG);

    env.mock_all_auths();
    escrow.clear_tier_gate();
    assert_eq!(escrow.tier_gate(), None);
}

// ── labs (E3): margen antes del reembolso ────────────────────────────────────

fn go_to(env: &Env, sequence: u32) {
    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        sequence_number: sequence,
        ..current
    });
}

#[test]
fn test_e3_default_margin_is_15_minutes() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    assert_eq!(escrow.claim_margin(), 15);
    let (_, hash) = tagged_hash(&env, b"margen");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &1u32);
    assert_eq!(escrow.get_trade(&id).margin_ledgers, MARGIN);
}

#[test]
fn test_e3_refund_waits_until_grace() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    let before = token_client.balance(&seller);
    let (_, hash) = tagged_hash(&env, b"g");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &8i128, &hash, &1u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    let g = t + MARGIN;

    go_to(&env, t - 1);
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::TimeoutNotReached)));
    go_to(&env, t);
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::ClaimWindowOpen)));
    go_to(&env, g - 1);
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::ClaimWindowOpen)));
    go_to(&env, g);
    escrow.refund(&id);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Refunded);
    assert_eq!(token_client.balance(&seller), before);
}

#[test]
fn test_e3_release_and_decline_work_inside_the_margin() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    let (secret, hash) = tagged_hash(&env, b"cobra");
    let paid = escrow.lock(&seller, &buyer, &1_000i128, &8i128, &hash, &1u32);
    let (_, hash2) = tagged_hash(&env, b"rechaza");
    let declined = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash2, &1u32);
    let t = escrow.get_trade(&paid).timeout_ledger;

    // Ya vencio, pero sigue el margen: el comprador cobra con el secreto.
    go_to(&env, t + MARGIN - 1);
    escrow.release(&paid, &secret);
    assert_eq!(token_client.balance(&buyer), 1_000);
    escrow.decline(&declined);
    assert_eq!(escrow.get_trade(&declined).status, TradeStatus::Declined);
    // Y despues de cobrar, el reembolso ya no puede llevarse el dinero.
    go_to(&env, t + MARGIN);
    assert_eq!(escrow.try_refund(&paid), Err(Ok(EscrowError::TradeNotLocked)));
}

#[test]
fn test_e3_margin_config() {
    let (env, contract_id, admin, seller, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    // Margen 0, o tan grande que el trade viviria mas que su TTL.
    assert_eq!(escrow.try_set_claim_margin(&0), Err(Ok(EscrowError::InvalidConfig)));
    let too_long = 518_400 / 12 - 1_440 - 7 * 24 * 60; // E4: cuenta la disputa
    assert_eq!(escrow.try_set_claim_margin(&too_long), Err(Ok(EscrowError::InvalidConfig)));
    escrow.set_claim_margin(&(too_long - 1));
    // Con ese margen, un maximo mas largo ya no cabe.
    assert_eq!(
        escrow.try_set_timeout_bounds(&1, &1_441),
        Err(Ok(EscrowError::InvalidConfig)),
    );
    escrow.set_claim_margin(&30);
    assert_eq!(escrow.claim_margin(), 30);

    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "set_claim_margin",
        args: (60u32,).into_val(&env),
        sub_invokes: &[],
    };
    env.mock_auths(&[auth_for(&seller, &invoke)]);
    assert!(escrow.try_set_claim_margin(&60).is_err());
    assert_eq!(escrow.claim_margin(), 30);
    env.mock_auths(&[auth_for(&admin, &invoke)]);
    escrow.set_claim_margin(&60);
    assert_eq!(escrow.claim_margin(), 60);
}

#[test]
fn test_e3_new_margin_does_not_touch_open_trades() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, hash) = tagged_hash(&env, b"viejo");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &1u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    escrow.set_claim_margin(&60);
    assert_eq!(escrow.get_trade(&id).margin_ledgers, MARGIN);
    go_to(&env, t + MARGIN);
    escrow.refund(&id);
}

#[test]
fn test_e3_extended_trade_keeps_its_margin() {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (_, hash) = tagged_hash(&env, b"extendido");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &1u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    escrow.extend(&id, &(t + 120));
    go_to(&env, t + 120 + MARGIN - 1);
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::ClaimWindowOpen)));
    go_to(&env, t + 120 + MARGIN);
    escrow.refund(&id);
}

// ── labs (E4): "ya pague" ─────────────────────────────────────────────────────

const DISPUTE: u32 = 7 * 24 * 60 * 12;

fn trade_at_t(tag: &[u8]) -> (Env, EscrowFactoryClient<'static>, Address, Address, Address, BytesN<32>, Bytes, u32) {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (secret, hash) = tagged_hash(&env, tag);
    let id = escrow.lock(&seller, &buyer, &1_000i128, &8i128, &hash, &1u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    (env, escrow, contract_id, seller, buyer, id, secret, t)
}

#[test]
fn test_e4_default_window_is_7_days() {
    let (_, escrow, _, _, _, id, _, _) = trade_at_t(b"siete");
    assert_eq!(escrow.dispute_window(), 7 * 24 * 60);
    let trade = escrow.get_trade(&id);
    assert_eq!(trade.dispute_ledgers, DISPUTE);
    assert_eq!(trade.dispute_deadline, 0);
}

#[test]
fn test_e4_only_between_t_and_g() {
    let (env, escrow, _, _, _, id, _, t) = trade_at_t(b"ventana");
    go_to(&env, t - 1);
    assert_eq!(escrow.try_report_paid(&id), Err(Ok(EscrowError::TimeoutNotReached)));
    go_to(&env, t + MARGIN);
    assert_eq!(escrow.try_report_paid(&id), Err(Ok(EscrowError::ClaimWindowClosed)));
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Locked);
    go_to(&env, t);
    assert_eq!(escrow.report_paid(&id), t + DISPUTE);
    let trade = escrow.get_trade(&id);
    assert_eq!(trade.status, TradeStatus::Disputed);
    assert_eq!(trade.dispute_deadline, t + DISPUTE);
}

#[test]
fn test_e4_only_the_buyer_reports() {
    let (env, escrow, contract_id, seller, buyer, id, _, t) = trade_at_t(b"firma");
    go_to(&env, t);
    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "report_paid",
        args: (id.clone(),).into_val(&env),
        sub_invokes: &[],
    };
    env.mock_auths(&[auth_for(&seller, &invoke)]);
    assert!(escrow.try_report_paid(&id).is_err());
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Locked);
    env.mock_auths(&[auth_for(&buyer, &invoke)]);
    escrow.report_paid(&id);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Disputed);
}

#[test]
fn test_e4_cannot_report_twice() {
    let (env, escrow, _, _, _, id, _, t) = trade_at_t(b"dos");
    go_to(&env, t);
    escrow.report_paid(&id);
    go_to(&env, t + 1);
    assert_eq!(escrow.try_report_paid(&id), Err(Ok(EscrowError::TradeNotLocked)));
    assert_eq!(escrow.get_trade(&id).dispute_deadline, t + DISPUTE);
}

#[test]
fn test_e4_race_with_refund_at_g_minus_1() {
    // Reporte primero: el reembolso ya no puede.
    let (env, escrow, _, _, _, id, _, t) = trade_at_t(b"g1-a");
    go_to(&env, t + MARGIN - 1);
    escrow.report_paid(&id);
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::DisputeOpen)));

    // Reembolso primero: falla por el margen, y el reporte si entra.
    let (env2, escrow2, _, _, _, id2, _, t2) = trade_at_t(b"g1-b");
    go_to(&env2, t2 + MARGIN - 1);
    assert_eq!(escrow2.try_refund(&id2), Err(Ok(EscrowError::ClaimWindowOpen)));
    escrow2.report_paid(&id2);
    assert_eq!(escrow2.get_trade(&id2).status, TradeStatus::Disputed);
}

#[test]
fn test_e4_race_with_refund_at_g() {
    // En G el margen termino: el reporte llega tarde y el reembolso pasa.
    let (env, escrow, _, _, _, id, _, t) = trade_at_t(b"g-a");
    go_to(&env, t + MARGIN);
    assert_eq!(escrow.try_report_paid(&id), Err(Ok(EscrowError::ClaimWindowClosed)));
    escrow.refund(&id);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Refunded);

    let (env2, escrow2, _, _, _, id2, _, t2) = trade_at_t(b"g-b");
    go_to(&env2, t2 + MARGIN);
    escrow2.refund(&id2);
    assert_eq!(escrow2.try_report_paid(&id2), Err(Ok(EscrowError::TradeNotLocked)));
}

#[test]
fn test_e4_refund_waits_until_d() {
    let (env, escrow, _, seller, _, id, _, t) = trade_at_t(b"d");
    let token_client = token::Client::new(&env, &escrow_token(&env, &escrow, &id));
    let before = token_client.balance(&seller);
    let report = t + MARGIN - 1;
    go_to(&env, report);
    let d = escrow.report_paid(&id);
    assert_eq!(d, report + DISPUTE);
    go_to(&env, d - 1);
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::DisputeOpen)));
    // Desde D, si nadie resolvio, el vendedor recupera monto + comision.
    go_to(&env, d);
    escrow.refund(&id);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Refunded);
    assert_eq!(token_client.balance(&seller), before + 1_008);
}

#[test]
fn test_e4_deadline_never_before_g() {
    // Con un plazo de disputa mas corto que el margen, D se queda en G.
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    escrow.set_claim_margin(&60);
    escrow.set_dispute_window(&1);
    let (_, hash) = tagged_hash(&env, b"corto");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &1u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    go_to(&env, t);
    assert_eq!(escrow.report_paid(&id), t + 60 * 12);
    go_to(&env, t + 60 * 12 - 1);
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::DisputeOpen)));
}

#[test]
fn test_e4_buyer_can_still_release_or_decline_in_dispute() {
    let (env, escrow, _, _, buyer, id, secret, t) = trade_at_t(b"cobra-disputa");
    go_to(&env, t);
    escrow.report_paid(&id);
    escrow.release(&id, &secret);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Released);
    assert_eq!(token::Client::new(&env, &escrow_token(&env, &escrow, &id)).balance(&buyer), 1_000);
    assert_eq!(escrow.accrued_fees(), 8);

    let (env2, escrow2, _, _, _, id2, _, t2) = trade_at_t(b"rechaza-disputa");
    go_to(&env2, t2);
    escrow2.report_paid(&id2);
    escrow2.accept(&id2);
    escrow2.decline(&id2);
    assert_eq!(escrow2.get_trade(&id2).status, TradeStatus::Declined);
}

#[test]
fn test_e4_disputed_trade_cannot_be_extended_and_reports_in_pause() {
    let (env, escrow, _, _, _, id, _, t) = trade_at_t(b"pausa");
    escrow.pause();
    go_to(&env, t);
    escrow.report_paid(&id);
    escrow.unpause();
    assert_eq!(escrow.try_extend(&id, &(t + 120)), Err(Ok(EscrowError::TradeNotLocked)));
}

#[test]
fn test_e4_report_keeps_the_trade_alive_until_d() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let (env, escrow, contract_id, _, _, id, _, t) = trade_at_t(b"vida");
    go_to(&env, t);
    let d = escrow.report_paid(&id);
    let ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&DataKey::Trade(id.clone()))
    });
    assert!(t + ttl > d, "el trade se archivaria antes de D");
    // El reporte deja al trade con la vida completa (~30 dias), no con lo que le
    // quedaba del lock.
    assert_eq!(ttl, 518_400);
}

#[test]
fn test_e4_new_window_does_not_touch_open_trades() {
    let (env, escrow, _, _, _, id, _, t) = trade_at_t(b"plazo-viejo");
    escrow.set_dispute_window(&60);
    go_to(&env, t);
    assert_eq!(escrow.report_paid(&id), t + DISPUTE);
}

#[test]
fn test_e4_window_config() {
    let (env, contract_id, admin, seller, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    assert_eq!(escrow.try_set_dispute_window(&0), Err(Ok(EscrowError::InvalidConfig)));
    let too_long = 518_400 / 12 - 1_440 - 15;
    assert_eq!(escrow.try_set_dispute_window(&too_long), Err(Ok(EscrowError::InvalidConfig)));
    escrow.set_dispute_window(&(too_long - 1));

    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "set_dispute_window",
        args: (60u32,).into_val(&env),
        sub_invokes: &[],
    };
    env.mock_auths(&[auth_for(&seller, &invoke)]);
    assert!(escrow.try_set_dispute_window(&60).is_err());
    env.mock_auths(&[auth_for(&admin, &invoke)]);
    escrow.set_dispute_window(&60);
    assert_eq!(escrow.dispute_window(), 60);
}

fn escrow_token(env: &Env, escrow: &EscrowFactoryClient, _id: &BytesN<32>) -> Address {
    env.as_contract(&escrow.address, || {
        env.storage().instance().get::<_, Address>(&DataKey::TokenId).unwrap()
    })
}

// ── labs (E5): arbitro (experimento) ──────────────────────────────────────────

/// Trade en disputa con arbitro. Devuelve tambien el token y el D del trade.
fn disputed_with_arbiter(
    tag: &[u8],
) -> (Env, EscrowFactoryClient<'static>, Address, Address, Address, Address, BytesN<32>, Bytes, u32, Address) {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let arbiter = Address::generate(&env);
    escrow.set_arbiter(&arbiter);
    let (secret, hash) = tagged_hash(&env, tag);
    let id = escrow.lock(&seller, &buyer, &1_000i128, &8i128, &hash, &1u32);
    let t = escrow.get_trade(&id).timeout_ledger;
    go_to(&env, t);
    let d = escrow.report_paid(&id);
    (env, escrow, contract_id, seller, buyer, arbiter, id, secret, d, token_id)
}

#[test]
fn test_e5_resolve_to_buyer_and_to_seller() {
    let (env, escrow, contract_id, _, buyer, _, id, _, _, token_id) = disputed_with_arbiter(b"comprador");
    let token_client = token::Client::new(&env, &token_id);
    escrow.resolve(&id, &true);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Resolved);
    assert_eq!(token_client.balance(&buyer), 1_000);
    assert_eq!(escrow.accrued_fees(), 8);
    assert_eq!(token_client.balance(&contract_id), 8);

    let (env2, escrow2, contract_id2, seller2, buyer2, _, id2, _, _, token_id2) = disputed_with_arbiter(b"vendedor");
    let token_client2 = token::Client::new(&env2, &token_id2);
    let before = token_client2.balance(&seller2);
    escrow2.resolve(&id2, &false);
    assert_eq!(token_client2.balance(&seller2), before + 1_008);
    assert_eq!(token_client2.balance(&buyer2), 0);
    assert_eq!(escrow2.accrued_fees(), 0);
    assert_eq!(token_client2.balance(&contract_id2), 0);
}

#[test]
fn test_e5_only_the_stored_arbiter_resolves() {
    let (env, escrow, contract_id, seller, buyer, arbiter, id, _, _, _) = disputed_with_arbiter(b"firma");
    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "resolve",
        args: (id.clone(), true).into_val(&env),
        sub_invokes: &[],
    };
    for who in [&seller, &buyer] {
        env.mock_auths(&[auth_for(who, &invoke)]);
        assert!(escrow.try_resolve(&id, &true).is_err());
    }
    // Un arbitro nuevo no sirve en un trade viejo, ni el admin.
    env.mock_all_auths();
    let new_arbiter = Address::generate(&env);
    escrow.set_arbiter(&new_arbiter);
    env.mock_auths(&[auth_for(&new_arbiter, &invoke)]);
    assert!(escrow.try_resolve(&id, &true).is_err());
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Disputed);
    env.mock_auths(&[auth_for(&arbiter, &invoke)]);
    escrow.resolve(&id, &true);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Resolved);
}

#[test]
fn test_e5_only_in_dispute_and_only_once() {
    let (env, escrow, _, seller, buyer, _, id, _, _, _) = disputed_with_arbiter(b"una");
    escrow.resolve(&id, &false);
    assert_eq!(escrow.try_resolve(&id, &true), Err(Ok(EscrowError::TradeNotLocked)));
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::TradeNotLocked)));

    // Un trade sin reporte no se resuelve.
    let (_, hash) = tagged_hash(&env, b"sin-reporte");
    let locked = escrow.lock(&seller, &buyer, &1_000i128, &0i128, &hash, &1u32);
    assert_eq!(escrow.try_resolve(&locked, &true), Err(Ok(EscrowError::NotDisputed)));
}

#[test]
fn test_e5_without_arbiter_refund_at_d_is_the_exit() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    let before = token_client.balance(&seller);
    let (_, hash) = tagged_hash(&env, b"sin-arbitro");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &8i128, &hash, &1u32);
    assert_eq!(escrow.get_trade(&id).arbiter, None);
    go_to(&env, escrow.get_trade(&id).timeout_ledger);
    let d = escrow.report_paid(&id);
    assert_eq!(escrow.try_resolve(&id, &true), Err(Ok(EscrowError::NoArbiter)));
    go_to(&env, d);
    escrow.refund(&id);
    assert_eq!(token_client.balance(&seller), before);
}

#[test]
fn test_e5_arbiter_that_never_acts() {
    let (env, escrow, _, _, _, _, id, _, d, _) = disputed_with_arbiter(b"no-actua");
    go_to(&env, d - 1);
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::DisputeOpen)));
    go_to(&env, d);
    escrow.refund(&id);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Refunded);
    assert_eq!(escrow.try_resolve(&id, &true), Err(Ok(EscrowError::TradeNotLocked)));
}

#[test]
fn test_e5_races_with_release_and_refund() {
    // release primero: el arbitro ya no puede.
    let (_, escrow, _, _, _, _, id, secret, _, _) = disputed_with_arbiter(b"release-1");
    escrow.release(&id, &secret);
    assert_eq!(escrow.try_resolve(&id, &false), Err(Ok(EscrowError::TradeNotLocked)));
    // resolve primero: el comprador ya no puede cobrar con el secreto.
    let (_, escrow, _, _, _, _, id, secret, _, _) = disputed_with_arbiter(b"release-2");
    escrow.resolve(&id, &false);
    assert_eq!(escrow.try_release(&id, &secret), Err(Ok(EscrowError::TradeNotLocked)));
    // En D: refund primero y luego resolve, y al reves.
    let (env, escrow, _, _, _, _, id, _, d, _) = disputed_with_arbiter(b"refund-1");
    go_to(&env, d);
    escrow.refund(&id);
    assert_eq!(escrow.try_resolve(&id, &true), Err(Ok(EscrowError::TradeNotLocked)));
    let (env, escrow, _, _, _, _, id, _, d, _) = disputed_with_arbiter(b"refund-2");
    go_to(&env, d);
    escrow.resolve(&id, &true);
    assert_eq!(escrow.try_refund(&id), Err(Ok(EscrowError::TradeNotLocked)));
}

#[test]
fn test_e5_arbiter_cannot_be_a_party() {
    let (env, contract_id, _, seller, buyer, _, token_id) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let token_client = token::Client::new(&env, &token_id);
    let before = token_client.balance(&seller);
    for (i, party) in [&seller, &buyer].into_iter().enumerate() {
        escrow.set_arbiter(party);
        let (_, hash) = tagged_hash(&env, &[b'p', i as u8]);
        assert_eq!(
            escrow.try_lock(&seller, &buyer, &1_000i128, &0i128, &hash, &1u32),
            Err(Ok(EscrowError::ArbiterIsParty)),
        );
    }
    assert_eq!(token_client.balance(&seller), before);
}

#[test]
fn test_e5_only_admin_sets_arbiter() {
    let (env, contract_id, admin, seller, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    assert_eq!(escrow.arbiter(), None);
    let arbiter = Address::generate(&env);
    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "set_arbiter",
        args: (arbiter.clone(),).into_val(&env),
        sub_invokes: &[],
    };
    env.mock_auths(&[auth_for(&seller, &invoke)]);
    assert!(escrow.try_set_arbiter(&arbiter).is_err());
    assert_eq!(escrow.arbiter(), None);
    env.mock_auths(&[auth_for(&admin, &invoke)]);
    escrow.set_arbiter(&arbiter);
    assert_eq!(escrow.arbiter(), Some(arbiter));
}

#[test]
fn test_e5_resolve_works_in_pause() {
    let (_, escrow, _, _, _, _, id, _, _, _) = disputed_with_arbiter(b"pausa");
    escrow.pause();
    escrow.resolve(&id, &true);
    assert_eq!(escrow.get_trade(&id).status, TradeStatus::Resolved);
}

// ── labs (E6): contador de operaciones ───────────────────────────────────────

fn stats_of(c: u32, r: u32, d: u32, o: u32, l: u32) -> Stats {
    Stats {
        completed: c,
        refunded: r,
        declined: d,
        disputes_opened: o,
        disputes_lost: l,
    }
}

/// Trade aceptado (o no) con arbitro, listo para cerrarse.
fn stats_trade(
    env: &Env,
    escrow: &EscrowFactoryClient,
    seller: &Address,
    buyer: &Address,
    tag: &[u8],
    accept: bool,
) -> (BytesN<32>, Bytes) {
    let (secret, hash) = tagged_hash(env, tag);
    let id = escrow.lock(seller, buyer, &1_000i128, &8i128, &hash, &1u32);
    if accept {
        escrow.accept(&id);
    }
    (id, secret)
}

fn stats_env() -> (Env, EscrowFactoryClient<'static>, Address, Address) {
    let (env, contract_id, _, seller, buyer, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    escrow.set_arbiter(&Address::generate(&env));
    (env, escrow, seller, buyer)
}

#[test]
fn test_e6_new_address_is_zero() {
    let (env, escrow, _, _) = stats_env();
    assert_eq!(escrow.stats(&Address::generate(&env)), Stats::default());
}

#[test]
fn test_e6_each_exit_adds_what_it_should() {
    let (env, escrow, seller, buyer) = stats_env();
    let (a, sa) = stats_trade(&env, &escrow, &seller, &buyer, b"a", true);
    escrow.release(&a, &sa);
    assert_eq!(escrow.stats(&seller), stats_of(1, 0, 0, 0, 0));
    assert_eq!(escrow.stats(&buyer), stats_of(1, 0, 0, 0, 0));

    let (b, _) = stats_trade(&env, &escrow, &seller, &buyer, b"b", true);
    escrow.decline(&b);
    assert_eq!(escrow.stats(&seller), stats_of(1, 0, 1, 0, 0));

    let (c, _) = stats_trade(&env, &escrow, &seller, &buyer, b"c", true);
    go_to(&env, escrow.get_trade(&c).timeout_ledger + MARGIN);
    escrow.refund(&c);
    assert_eq!(escrow.stats(&seller), stats_of(1, 1, 1, 0, 0));
    assert_eq!(escrow.stats(&buyer), stats_of(1, 1, 1, 0, 0));
}

#[test]
fn test_e6_disputes_opened_and_lost() {
    let (env, escrow, seller, buyer) = stats_env();
    // Gana el comprador: pierde el vendedor.
    let (a, _) = stats_trade(&env, &escrow, &seller, &buyer, b"gana-comprador", true);
    let (b, _) = stats_trade(&env, &escrow, &seller, &buyer, b"gana-vendedor", true);
    let (c, _) = stats_trade(&env, &escrow, &seller, &buyer, b"nadie-resuelve", true);
    go_to(&env, escrow.get_trade(&a).timeout_ledger);
    escrow.report_paid(&a);
    escrow.report_paid(&b);
    let d = escrow.report_paid(&c);
    assert_eq!(escrow.stats(&seller), stats_of(0, 0, 0, 3, 0));
    assert_eq!(escrow.stats(&buyer), stats_of(0, 0, 0, 3, 0));

    escrow.resolve(&a, &true);
    assert_eq!(escrow.stats(&seller), stats_of(0, 0, 0, 3, 1));
    assert_eq!(escrow.stats(&buyer), stats_of(0, 0, 0, 3, 0));
    escrow.resolve(&b, &false);
    assert_eq!(escrow.stats(&buyer), stats_of(0, 0, 0, 3, 1));

    // Reembolso en D sin resolve: suma reembolso, no disputa perdida.
    go_to(&env, d);
    escrow.refund(&c);
    assert_eq!(escrow.stats(&seller), stats_of(0, 1, 0, 3, 1));
    assert_eq!(escrow.stats(&buyer), stats_of(0, 1, 0, 3, 1));
}

#[test]
fn test_e6_unaccepted_trade_does_not_count() {
    let (env, escrow, seller, buyer) = stats_env();
    let (a, sa) = stats_trade(&env, &escrow, &seller, &buyer, b"a", false);
    escrow.release(&a, &sa);
    let (b, _) = stats_trade(&env, &escrow, &seller, &buyer, b"b", false);
    escrow.decline(&b);
    let (c, _) = stats_trade(&env, &escrow, &seller, &buyer, b"c", false);
    let (e, _) = stats_trade(&env, &escrow, &seller, &buyer, b"e", false);
    go_to(&env, escrow.get_trade(&c).timeout_ledger);
    escrow.report_paid(&c);
    escrow.resolve(&c, &true);
    go_to(&env, escrow.get_trade(&e).timeout_ledger + MARGIN);
    escrow.refund(&e);
    assert_eq!(escrow.stats(&seller), Stats::default());
    assert_eq!(escrow.stats(&buyer), Stats::default());
}

#[test]
fn test_e6_rejected_close_does_not_add() {
    let (env, escrow, seller, buyer) = stats_env();
    let (a, sa) = stats_trade(&env, &escrow, &seller, &buyer, b"a", true);
    escrow.release(&a, &sa);
    let before = escrow.stats(&seller);
    // Segundo cierre, secreto malo y reembolso antes de tiempo: todos fallan.
    assert!(escrow.try_release(&a, &sa).is_err());
    assert!(escrow.try_decline(&a).is_err());
    assert!(escrow.try_refund(&a).is_err());
    let (b, _) = stats_trade(&env, &escrow, &seller, &buyer, b"b", true);
    assert!(escrow.try_release(&b, &Bytes::from_slice(&env, b"malo")).is_err());
    assert!(escrow.try_refund(&b).is_err());
    assert!(escrow.try_report_paid(&b).is_err());
    assert_eq!(escrow.stats(&seller), before);
    assert_eq!(escrow.stats(&buyer), before);
}

#[test]
fn test_e6_stats_are_per_address() {
    let (env, escrow, seller, buyer) = stats_env();
    let other_buyer = Address::generate(&env);
    let (a, sa) = stats_trade(&env, &escrow, &seller, &buyer, b"a", true);
    escrow.release(&a, &sa);
    let (b, sb) = stats_trade(&env, &escrow, &seller, &other_buyer, b"b", true);
    escrow.release(&b, &sb);
    assert_eq!(escrow.stats(&seller), stats_of(2, 0, 0, 0, 0));
    assert_eq!(escrow.stats(&buyer), stats_of(1, 0, 0, 0, 0));
    assert_eq!(escrow.stats(&other_buyer), stats_of(1, 0, 0, 0, 0));
}

// ── labs (E10): eventos de lo nuevo ──────────────────────────────────────────

/// Los eventos que emitio el escrow en la ultima llamada (sin los del token).
fn escrow_events(env: &Env, escrow: &EscrowFactoryClient) -> soroban_sdk::testutils::ContractEvents {
    use soroban_sdk::testutils::Events as _;
    env.events().all().filter_by_contract(&escrow.address)
}

fn one_event<T, D>(env: &Env, escrow: &EscrowFactoryClient, topics: T, data: D) -> soroban_sdk::Vec<(Address, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val)>
where
    T: IntoVal<Env, soroban_sdk::Vec<soroban_sdk::Val>>,
    D: IntoVal<Env, soroban_sdk::Val>,
{
    soroban_sdk::vec![env, (escrow.address.clone(), topics.into_val(env), data.into_val(env))]
}

#[test]
fn test_e10_disputed_carries_the_real_deadline() {
    let (env, escrow, _, _, buyer, id, _, t) = trade_at_t(b"ev-disputa");
    go_to(&env, t + 5);
    let d = escrow.report_paid(&id);
    assert_eq!(d, t + 5 + DISPUTE);
    assert_eq!(
        escrow_events(&env, &escrow),
        one_event(&env, &escrow, (symbol_short!("disputed"),), (id.clone(), buyer, d)),
    );
}

#[test]
fn test_e10_resolved_carries_real_recipient_and_fee() {
    let (env, escrow, _, _, buyer, arbiter, id, _, _, _) = disputed_with_arbiter(b"ev-comprador");
    escrow.resolve(&id, &true);
    assert_eq!(
        escrow_events(&env, &escrow),
        one_event(
            &env,
            &escrow,
            (symbol_short!("resolved"),),
            (id.clone(), arbiter, buyer, 1_000i128, 8i128),
        ),
    );

    let (env, escrow, _, seller, _, arbiter, id, _, _, _) = disputed_with_arbiter(b"ev-vendedor");
    escrow.resolve(&id, &false);
    assert_eq!(
        escrow_events(&env, &escrow),
        one_event(
            &env,
            &escrow,
            (symbol_short!("resolved"),),
            (id.clone(), arbiter, seller, 1_008i128, 0i128),
        ),
    );
}

#[test]
fn test_e10_admin_events() {
    let (env, contract_id, admin, _, _, _, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let unit = ();
    escrow.pause();
    assert_eq!(escrow_events(&env, &escrow), one_event(&env, &escrow, (symbol_short!("paused"),), unit));
    escrow.unpause();
    assert_eq!(escrow_events(&env, &escrow), one_event(&env, &escrow, (symbol_short!("unpaused"),), unit));

    let arbiter = Address::generate(&env);
    escrow.set_arbiter(&arbiter);
    assert_eq!(
        escrow_events(&env, &escrow),
        one_event(&env, &escrow, (symbol_short!("arbiter"),), arbiter),
    );

    let next = Address::generate(&env);
    escrow.propose_admin(&next);
    assert_eq!(
        escrow_events(&env, &escrow),
        one_event(&env, &escrow, (symbol_short!("adm_prop"),), next.clone()),
    );
    escrow.accept_admin();
    // Lleva al admin anterior real, que la llamada no recibe como argumento.
    assert_eq!(
        escrow_events(&env, &escrow),
        one_event(&env, &escrow, (symbol_short!("adm_acc"),), (admin, next)),
    );
}

#[test]
fn test_e10_trade_events() {
    let (env, contract_id, _, seller, buyer, platform_wallet, _) = setup_env();
    let escrow = EscrowFactoryClient::new(&env, &contract_id);
    let (secret, hash) = tagged_hash(&env, b"ev-trade");
    let id = escrow.lock(&seller, &buyer, &1_000i128, &8i128, &hash, &1u32);
    let t = escrow.get_trade(&id).timeout_ledger;

    escrow.accept(&id);
    assert_eq!(
        escrow_events(&env, &escrow),
        one_event(&env, &escrow, (symbol_short!("accepted"),), (id.clone(), buyer.clone())),
    );
    escrow.extend(&id, &(t + 60));
    assert_eq!(
        escrow_events(&env, &escrow),
        one_event(&env, &escrow, (symbol_short!("extended"),), (id.clone(), t, t + 60)),
    );

    escrow.release(&id, &secret);
    // Lo cobrado es lo acumulado, no un monto que mande quien llama.
    escrow.claim_fees(&platform_wallet);
    assert_eq!(
        escrow_events(&env, &escrow),
        one_event(&env, &escrow, (symbol_short!("fees"),), (platform_wallet.clone(), 8i128)),
    );
    // Sin nada que cobrar no hay evento.
    escrow.claim_fees(&platform_wallet);
    assert_eq!(escrow_events(&env, &escrow).events().len(), 0);
}

#[test]
fn test_e10_failed_call_leaves_no_event() {
    let (env, escrow, _, _, _, id, _, t) = trade_at_t(b"ev-falla");
    go_to(&env, t - 1);
    assert!(escrow.try_report_paid(&id).is_err());
    assert_eq!(escrow_events(&env, &escrow).events().len(), 0);
    assert!(escrow.try_extend(&id, &(t - 2)).is_err());
    assert_eq!(escrow_events(&env, &escrow).events().len(), 0);
    assert!(escrow.try_resolve(&id, &true).is_err());
    assert_eq!(escrow_events(&env, &escrow).events().len(), 0);
}
