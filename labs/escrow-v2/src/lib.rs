#![no_std]

mod errors;
mod types;

use errors::EscrowError;
use types::{DataKey, TimeoutBounds, TradeEscrow, TradeStatus};

use soroban_sdk::{contract, contractimpl, log, symbol_short, token, Address, Bytes, BytesN, Env};

// TTL constants (~5s per ledger on mainnet)
const TTL_MIN: u32 = 17_280; // ~1 day — extend if below this
const TTL_EXTEND: u32 = 518_400; // ~30 days — extend to this

// labs (E1): ~12 ledgers por minuto (5 s por ledger). Los plazos son en ledgers.
const LEDGERS_PER_MINUTE: u32 = 12;
// Limites con los que nace el contrato. Produccion usa 120 min.
const DEFAULT_MIN_TIMEOUT_MINUTES: u32 = 1;
const DEFAULT_MAX_TIMEOUT_MINUTES: u32 = 1_440; // 24 h

// labs (E2): tope de la comision de MicoPay, en puntos base (100 = 1 %).
// Produccion cobra 0.8 % fijo, que el backend calcula. La comision del agente va
// dentro del precio y el contrato no la ve: este tope no la toca.
const BPS_DENOMINATOR: i128 = 10_000;
const DEFAULT_FEE_CAP_BPS: u32 = 100;

/// Comision maxima para un monto: piso de amount * bps / 10000. Se parte en
/// cociente y resto para que ningun monto valido desborde.
fn max_platform_fee(amount: i128, fee_cap_bps: u32) -> Result<i128, EscrowError> {
    let bps = fee_cap_bps as i128;
    let whole = (amount / BPS_DENOMINATOR)
        .checked_mul(bps)
        .ok_or(EscrowError::AmountOverflow)?;
    let rest = (amount % BPS_DENOMINATOR)
        .checked_mul(bps)
        .ok_or(EscrowError::AmountOverflow)?
        / BPS_DENOMINATOR;
    whole.checked_add(rest).ok_or(EscrowError::AmountOverflow)
}

/// Un trade no puede vivir mas que el TTL que el contrato le extiende: si no, se
/// archivaria con el dinero adentro antes de vencer.
fn validate_timeout_bounds(min_minutes: u32, max_minutes: u32) -> Result<(), EscrowError> {
    if min_minutes == 0 || min_minutes > max_minutes {
        return Err(EscrowError::InvalidConfig);
    }
    let max_ledgers = max_minutes
        .checked_mul(LEDGERS_PER_MINUTE)
        .ok_or(EscrowError::InvalidConfig)?;
    if max_ledgers >= TTL_EXTEND {
        return Err(EscrowError::InvalidConfig);
    }
    Ok(())
}

/// Ledger de vencimiento con aritmetica comprobada: nunca aborta.
fn timeout_ledger_for(sequence: u32, timeout_minutes: u32) -> Result<u32, EscrowError> {
    timeout_minutes
        .checked_mul(LEDGERS_PER_MINUTE)
        .and_then(|ledgers| sequence.checked_add(ledgers))
        .ok_or(EscrowError::LedgerOverflow)
}

fn read_admin(env: &Env) -> Result<Address, EscrowError> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(EscrowError::NotInitialized)
}

fn compute_trade_id(
    env: &Env,
    _seller: &Address,
    _buyer: &Address,
    secret_hash: &BytesN<32>,
) -> BytesN<32> {
    // Deterministic: only use secret_hash (no ledger sequence).
    // This ensures simulation and real execution produce the same footprint key.
    // secret_hash = sha256(random_secret), so this = sha256(sha256(secret)) = unique.
    let seed = Bytes::from_slice(env, &secret_hash.to_array());
    env.crypto().sha256(&seed).into()
}

#[contract]
pub struct EscrowFactory;

#[contractimpl]
impl EscrowFactory {
    /// Atomically configure the contract during deployment.
    /// labs (L1): el admin firma su propio nombramiento. En produccion se guarda sin firma.
    pub fn __constructor(env: Env, admin: Address, token_id: Address, platform_wallet: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TokenId, &token_id);
        env.storage()
            .instance()
            .set(&DataKey::PlatformWallet, &platform_wallet);
        env.storage().instance().set(
            &DataKey::TimeoutBounds,
            &TimeoutBounds {
                min_minutes: DEFAULT_MIN_TIMEOUT_MINUTES,
                max_minutes: DEFAULT_MAX_TIMEOUT_MINUTES,
            },
        );
        env.storage()
            .instance()
            .set(&DataKey::FeeCapBps, &DEFAULT_FEE_CAP_BPS);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
    }

    /// labs (E2): el admin fija el tope de la comision de MicoPay, en puntos base
    /// del monto (0 a 10000). Solo afecta a los `lock` futuros.
    pub fn set_fee_cap(env: Env, fee_cap_bps: u32) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        if fee_cap_bps as i128 > BPS_DENOMINATOR {
            return Err(EscrowError::InvalidConfig);
        }
        env.storage().instance().set(&DataKey::FeeCapBps, &fee_cap_bps);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events()
            .publish((symbol_short!("feecap"),), fee_cap_bps);
        Ok(())
    }

    /// labs (E2): tope vigente de la comision de MicoPay, en puntos base.
    pub fn fee_cap(env: Env) -> Result<u32, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::FeeCapBps)
            .ok_or(EscrowError::NotInitialized)
    }

    /// labs (E1): el admin fija el minimo y el maximo de `timeout_minutes`.
    /// Exige 0 < minimo <= maximo, y que el maximo quepa en el TTL de un trade.
    /// Solo afecta a los `lock` futuros.
    pub fn set_timeout_bounds(
        env: Env,
        min_minutes: u32,
        max_minutes: u32,
    ) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        validate_timeout_bounds(min_minutes, max_minutes)?;
        env.storage().instance().set(
            &DataKey::TimeoutBounds,
            &TimeoutBounds {
                min_minutes,
                max_minutes,
            },
        );
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events().publish(
            (symbol_short!("tbounds"),),
            (min_minutes, max_minutes),
        );
        Ok(())
    }

    /// labs (E1): limites vigentes de `timeout_minutes`.
    pub fn timeout_bounds(env: Env) -> Result<TimeoutBounds, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::TimeoutBounds)
            .ok_or(EscrowError::NotInitialized)
    }

    /// Lock funds in escrow. Called by the SELLER.
    /// Returns trade_id (32-byte hash).
    pub fn lock(
        env: Env,
        seller: Address,
        buyer: Address,
        amount: i128,
        platform_fee: i128,
        secret_hash: BytesN<32>,
        timeout_minutes: u32,
    ) -> Result<BytesN<32>, EscrowError> {
        // Require seller authorization
        seller.require_auth();

        if amount <= 0 || platform_fee < 0 {
            return Err(EscrowError::InsufficientAmount);
        }

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenId)
            .ok_or(EscrowError::NotInitialized)?;

        // trade_id depende solo de secret_hash, que es publico en cadena. Sin esta
        // revision, cualquiera podia repetir el hash con 1 stroop y sobrescribir
        // una operacion bloqueada: los fondos originales quedaban atrapados.
        let trade_id = compute_trade_id(&env, &seller, &buyer, &secret_hash);
        if env
            .storage()
            .persistent()
            .has(&DataKey::Trade(trade_id.clone()))
        {
            return Err(EscrowError::TradeAlreadyExists);
        }

        // labs (E1): el tiempo tiene que estar dentro de los limites del admin, y el
        // ledger de vencimiento se calcula con aritmetica comprobada (nunca aborta).
        let bounds = Self::timeout_bounds(env.clone())?;
        if timeout_minutes < bounds.min_minutes || timeout_minutes > bounds.max_minutes {
            return Err(EscrowError::TimeoutOutOfRange);
        }
        let timeout_ledger = timeout_ledger_for(env.ledger().sequence(), timeout_minutes)?;

        // labs (E2): la comision de MicoPay no pasa el tope vigente.
        if platform_fee > max_platform_fee(amount, Self::fee_cap(env.clone())?)? {
            return Err(EscrowError::FeeAboveCap);
        }

        // Transfer total (amount + platform_fee) from seller to this contract
        let total = amount
            .checked_add(platform_fee)
            .ok_or(EscrowError::AmountOverflow)?;
        let token_client = token::Client::new(&env, &token_id);
        token_client.transfer(&seller, &env.current_contract_address(), &total);

        let trade = TradeEscrow {
            seller: seller.clone(),
            buyer: buyer.clone(),
            amount,
            platform_fee,
            secret_hash,
            timeout_ledger,
            status: TradeStatus::Locked,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Trade(trade_id.clone()), &trade);

        // Extend TTL so the trade doesn't get archived (skill: security.md #7)
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.storage().persistent().extend_ttl(
            &DataKey::Trade(trade_id.clone()),
            TTL_MIN,
            TTL_EXTEND,
        );

        // Emit event
        env.events().publish(
            (symbol_short!("locked"),),
            (trade_id.clone(), seller, buyer, amount, timeout_ledger),
        );

        log!(
            &env,
            "Trade locked: amount={}, timeout_ledger={}",
            amount,
            timeout_ledger
        );

        Ok(trade_id)
    }

    /// Release funds to buyer by presenting the secret (preimage).
    /// Called by the BUYER.
    pub fn release(env: Env, trade_id: BytesN<32>, secret: Bytes) -> Result<(), EscrowError> {
        let mut trade: TradeEscrow = env
            .storage()
            .persistent()
            .get(&DataKey::Trade(trade_id.clone()))
            .ok_or(EscrowError::TradeNotFound)?;

        if trade.status != TradeStatus::Locked {
            return Err(EscrowError::TradeNotLocked);
        }

        // Require buyer authorization FIRST (skill: security.md best practice)
        trade.buyer.require_auth();

        // Verify secret: sha256(secret) must equal secret_hash
        let computed_hash: BytesN<32> = env.crypto().sha256(&secret).into();
        if computed_hash != trade.secret_hash {
            return Err(EscrowError::InvalidSecret);
        }

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenId)
            .ok_or(EscrowError::NotInitialized)?;

        let platform_wallet: Address = env
            .storage()
            .instance()
            .get(&DataKey::PlatformWallet)
            .ok_or(EscrowError::NotInitialized)?;

        let token_client = token::Client::new(&env, &token_id);

        // Transfer escrow amount to buyer
        token_client.transfer(&env.current_contract_address(), &trade.buyer, &trade.amount);

        // Transfer platform fee
        if trade.platform_fee > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &platform_wallet,
                &trade.platform_fee,
            );
        }

        // Update status
        trade.status = TradeStatus::Released;
        env.storage()
            .persistent()
            .set(&DataKey::Trade(trade_id.clone()), &trade);

        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.storage().persistent().extend_ttl(
            &DataKey::Trade(trade_id.clone()),
            TTL_MIN,
            TTL_EXTEND,
        );

        env.events().publish(
            (symbol_short!("released"),),
            (trade_id, trade.seller, trade.buyer),
        );

        Ok(())
    }

    /// Refund seller after timeout. Can be called by anyone.
    pub fn refund(env: Env, trade_id: BytesN<32>) -> Result<(), EscrowError> {
        let mut trade: TradeEscrow = env
            .storage()
            .persistent()
            .get(&DataKey::Trade(trade_id.clone()))
            .ok_or(EscrowError::TradeNotFound)?;

        if trade.status != TradeStatus::Locked {
            return Err(EscrowError::TradeNotLocked);
        }

        // Check that timeout HAS been reached
        if env.ledger().sequence() < trade.timeout_ledger {
            return Err(EscrowError::TimeoutNotReached);
        }

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenId)
            .ok_or(EscrowError::NotInitialized)?;

        let token_client = token::Client::new(&env, &token_id);

        // Refund total (amount + platform_fee) to seller
        let total = trade
            .amount
            .checked_add(trade.platform_fee)
            .ok_or(EscrowError::AmountOverflow)?;
        token_client.transfer(&env.current_contract_address(), &trade.seller, &total);

        trade.status = TradeStatus::Refunded;
        env.storage()
            .persistent()
            .set(&DataKey::Trade(trade_id.clone()), &trade);

        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.storage().persistent().extend_ttl(
            &DataKey::Trade(trade_id.clone()),
            TTL_MIN,
            TTL_EXTEND,
        );

        env.events().publish(
            (symbol_short!("refunded"),),
            (trade_id, trade.seller.clone()),
        );

        Ok(())
    }

    /// Return locked funds to the seller. Works before and after the timeout,
    /// while the trade is still Locked. Only the buyer stored in the trade may sign.
    /// labs (L1): deja el estado en `Declined`, no en `Refunded`.
    pub fn decline(env: Env, trade_id: BytesN<32>) -> Result<(), EscrowError> {
        let mut trade: TradeEscrow = env
            .storage()
            .persistent()
            .get(&DataKey::Trade(trade_id.clone()))
            .ok_or(EscrowError::TradeNotFound)?;

        if trade.status != TradeStatus::Locked {
            return Err(EscrowError::TradeNotLocked);
        }

        trade.buyer.require_auth();

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenId)
            .ok_or(EscrowError::NotInitialized)?;

        let total = trade
            .amount
            .checked_add(trade.platform_fee)
            .ok_or(EscrowError::AmountOverflow)?;
        let token_client = token::Client::new(&env, &token_id);
        token_client.transfer(&env.current_contract_address(), &trade.seller, &total);

        trade.status = TradeStatus::Declined;
        env.storage()
            .persistent()
            .set(&DataKey::Trade(trade_id.clone()), &trade);

        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.storage().persistent().extend_ttl(
            &DataKey::Trade(trade_id.clone()),
            TTL_MIN,
            TTL_EXTEND,
        );

        env.events().publish(
            (symbol_short!("declined"),),
            (trade_id, trade.seller.clone()),
        );

        Ok(())
    }

    /// Read trade state (view function).
    pub fn get_trade(env: Env, trade_id: BytesN<32>) -> Result<TradeEscrow, EscrowError> {
        let trade: TradeEscrow = env
            .storage()
            .persistent()
            .get(&DataKey::Trade(trade_id.clone()))
            .ok_or(EscrowError::TradeNotFound)?;

        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Trade(trade_id), TTL_MIN, TTL_EXTEND);

        Ok(trade)
    }
}

#[cfg(test)]
mod test;
