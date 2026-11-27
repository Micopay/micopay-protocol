#![no_std]

mod errors;
mod types;

use errors::EscrowError;
use types::{DataKey, Stats, TierGate, TierRecord, TimeoutBounds, TradeEscrow, TradeStatus};

use soroban_sdk::{
    contract, contractclient, contractimpl, log, symbol_short, token, Address, Bytes, BytesN, Env,
};

/// labs (X1): la unica funcion del registro de tiers que usa el escrow.
#[contractclient(name = "TierRegistryClient")]
pub trait TierRegistry {
    fn get_tier(env: Env, agent: Address) -> Option<TierRecord>;
}

/// labs (X1): true si `agent` tiene un tier vigente igual o mayor que `min_tier`.
fn has_tier(env: &Env, gate: &TierGate, agent: &Address) -> bool {
    TierRegistryClient::new(env, &gate.registry)
        .get_tier(agent)
        .map_or(false, |record| record.tier >= gate.min_tier)
}

// TTL constants (~5s per ledger on mainnet)
const TTL_MIN: u32 = 17_280; // ~1 day — extend if below this
const TTL_EXTEND: u32 = 518_400; // ~30 days — extend to this

// labs (E1): ~12 ledgers por minuto (5 s por ledger). Los plazos son en ledgers.
const LEDGERS_PER_MINUTE: u32 = 12;
// Limites con los que nace el contrato. Produccion usa 120 min.
const DEFAULT_MIN_TIMEOUT_MINUTES: u32 = 1;
const DEFAULT_MAX_TIMEOUT_MINUTES: u32 = 1_440; // 24 h
// labs (E3): margen con el que nace el contrato (decidido el 2026-11-27).
const DEFAULT_CLAIM_MARGIN_MINUTES: u32 = 15;
// labs (E4): plazo de disputa con el que nace el contrato (decidido el 2026-11-27).
const DEFAULT_DISPUTE_WINDOW_MINUTES: u32 = 7 * 24 * 60;

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
/// labs (E3, E4): la vida que cuenta es el maximo de E1 mas el margen mas el plazo
/// de disputa (regla R-4 del plan).
fn validate_timeout_bounds(
    min_minutes: u32,
    max_minutes: u32,
    margin_minutes: u32,
    dispute_minutes: u32,
) -> Result<(), EscrowError> {
    if min_minutes == 0
        || min_minutes > max_minutes
        || margin_minutes == 0
        || dispute_minutes == 0
    {
        return Err(EscrowError::InvalidConfig);
    }
    let lifetime = max_minutes
        .checked_add(margin_minutes)
        .and_then(|minutes| minutes.checked_add(dispute_minutes))
        .and_then(|minutes| minutes.checked_mul(LEDGERS_PER_MINUTE))
        .ok_or(EscrowError::InvalidConfig)?;
    if lifetime >= TTL_EXTEND {
        return Err(EscrowError::InvalidConfig);
    }
    Ok(())
}

/// labs (E3): G, el ledger desde el que `refund` funciona.
fn grace_ledger(trade: &TradeEscrow) -> Result<u32, EscrowError> {
    trade
        .timeout_ledger
        .checked_add(trade.margin_ledgers)
        .ok_or(EscrowError::LedgerOverflow)
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

/// labs (E4): un trade abierto puede cerrarse: `Locked` o `Disputed` (regla R-1).
/// Si las salidas solo aceptaran `Locked`, una disputa dejaria el dinero atorado.
fn is_open(trade: &TradeEscrow) -> bool {
    matches!(trade.status, TradeStatus::Locked | TradeStatus::Disputed)
}

/// labs (E6): suma a las estadisticas de una direccion. Nunca aborta: si un contador
/// llegara a u32::MAX, se queda ahi en vez de impedir que el trade se cierre.
fn bump_stats(env: &Env, who: &Address, add: fn(&mut Stats) -> &mut u32) {
    let key = DataKey::Stats(who.clone());
    let mut stats: Stats = env.storage().persistent().get(&key).unwrap_or_default();
    let counter = add(&mut stats);
    *counter = counter.saturating_add(1);
    env.storage().persistent().set(&key, &stats);
    env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_EXTEND);
}

/// labs (E6): suma a las dos partes, solo si el comprador acepto el trade (E12).
fn bump_both(env: &Env, trade: &TradeEscrow, add: fn(&mut Stats) -> &mut u32) {
    if trade.accepted {
        bump_stats(env, &trade.seller, add);
        bump_stats(env, &trade.buyer, add);
    }
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
        env.storage()
            .instance()
            .set(&DataKey::ClaimMargin, &DEFAULT_CLAIM_MARGIN_MINUTES);
        env.storage()
            .instance()
            .set(&DataKey::DisputeWindow, &DEFAULT_DISPUTE_WINDOW_MINUTES);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
    }

    /// labs (E3): el admin fija el margen, en minutos, entre el vencimiento y el
    /// reembolso. En ese margen el comprador todavia puede cobrar con el secreto y
    /// nadie puede reembolsar. No puede ser 0. Solo afecta a los `lock` futuros.
    pub fn set_claim_margin(env: Env, margin_minutes: u32) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        let bounds = Self::timeout_bounds(env.clone())?;
        validate_timeout_bounds(
            bounds.min_minutes,
            bounds.max_minutes,
            margin_minutes,
            Self::dispute_window(env.clone())?,
        )?;
        env.storage()
            .instance()
            .set(&DataKey::ClaimMargin, &margin_minutes);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events()
            .publish((symbol_short!("margin"),), margin_minutes);
        Ok(())
    }

    /// labs (E3): margen vigente, en minutos.
    pub fn claim_margin(env: Env) -> Result<u32, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::ClaimMargin)
            .ok_or(EscrowError::NotInitialized)
    }

    /// labs (E4): el admin fija el plazo de disputa, en minutos: cuanto espera
    /// `refund` despues de un "ya pague". No puede ser 0. Solo afecta a los `lock`
    /// futuros.
    pub fn set_dispute_window(env: Env, dispute_minutes: u32) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        let bounds = Self::timeout_bounds(env.clone())?;
        validate_timeout_bounds(
            bounds.min_minutes,
            bounds.max_minutes,
            Self::claim_margin(env.clone())?,
            dispute_minutes,
        )?;
        env.storage()
            .instance()
            .set(&DataKey::DisputeWindow, &dispute_minutes);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events()
            .publish((symbol_short!("dispwin"),), dispute_minutes);
        Ok(())
    }

    /// labs (E5, experimento: el escrow real no tendra arbitro). El admin fija el
    /// arbitro de los trades futuros. Los trades abiertos conservan el suyo.
    pub fn set_arbiter(env: Env, arbiter: Address) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events().publish((symbol_short!("arbiter"),), arbiter);
        Ok(())
    }

    /// labs (E5): arbitro vigente para los trades nuevos, si lo hay.
    pub fn arbiter(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Arbiter)
    }

    /// labs (E4): plazo de disputa vigente, en minutos.
    pub fn dispute_window(env: Env) -> Result<u32, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::DisputeWindow)
            .ok_or(EscrowError::NotInitialized)
    }

    /// labs (E11): comisiones acumuladas que todavia no se cobran.
    pub fn accrued_fees(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::AccruedFees)
            .unwrap_or(0)
    }

    /// labs (E11): el admin cobra las comisiones acumuladas y las manda a `to`.
    /// Devuelve cuanto cobro. Nunca toca el dinero de los trades abiertos.
    pub fn claim_fees(env: Env, to: Address) -> Result<i128, EscrowError> {
        read_admin(&env)?.require_auth();
        let accrued = Self::accrued_fees(env.clone());
        if accrued > 0 {
            let token_id: Address = env
                .storage()
                .instance()
                .get(&DataKey::TokenId)
                .ok_or(EscrowError::NotInitialized)?;
            env.storage().instance().set(&DataKey::AccruedFees, &0i128);
            token::Client::new(&env, &token_id).transfer(
                &env.current_contract_address(),
                &to,
                &accrued,
            );
            env.events()
                .publish((symbol_short!("fees"),), (to, accrued));
        }
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        Ok(accrued)
    }

    /// labs (E9): el admin propone a su reemplazo. El admin actual sigue con todos
    /// sus permisos hasta que el nuevo acepta. Una propuesta nueva reemplaza a la anterior.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::PendingAdmin, &new_admin);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events()
            .publish((symbol_short!("adm_prop"),), new_admin);
        Ok(())
    }

    /// labs (E9): el admin propuesto acepta con su firma y queda como admin.
    /// Asi nunca se entrega el contrato a una direccion que nadie controla.
    pub fn accept_admin(env: Env) -> Result<(), EscrowError> {
        let new_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(EscrowError::NoPendingAdmin)?;
        new_admin.require_auth();
        let old_admin = read_admin(&env)?;
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events()
            .publish((symbol_short!("adm_acc"),), (old_admin, new_admin));
        Ok(())
    }

    /// labs (E9): admin vigente.
    pub fn admin(env: Env) -> Result<Address, EscrowError> {
        read_admin(&env)
    }

    /// labs (E9): admin propuesto que todavia no acepta, si lo hay.
    pub fn pending_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    /// labs (X1): desde `threshold` (unidades del token), `lock` pide que el vendedor
    /// o el comprador tengan un tier vigente >= `min_tier` en `registry`. Solo el admin.
    pub fn set_tier_gate(
        env: Env,
        registry: Address,
        threshold: i128,
        min_tier: u32,
    ) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        if threshold <= 0 || !(1..=3).contains(&min_tier) {
            return Err(EscrowError::InvalidConfig);
        }
        let gate = TierGate {
            registry,
            threshold,
            min_tier,
        };
        env.storage().instance().set(&DataKey::TierGate, &gate);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events()
            .publish((symbol_short!("tiergate"),), (gate.registry, threshold, min_tier));
        Ok(())
    }

    /// labs (X1): quita la regla de tier. Solo el admin.
    pub fn clear_tier_gate(env: Env) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        env.storage().instance().remove(&DataKey::TierGate);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events().publish((symbol_short!("tiergate"),), ());
        Ok(())
    }

    /// labs (X1): regla de tier vigente, si la hay.
    pub fn tier_gate(env: Env) -> Option<TierGate> {
        env.storage().instance().get(&DataKey::TierGate)
    }

    /// labs (E7): pausa de emergencia. Solo bloquea `lock` (y `extend`, E8, cuando
    /// exista). Las salidas siguen: nadie queda con su dinero atrapado por una pausa.
    pub fn pause(env: Env) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events().publish((symbol_short!("paused"),), ());
        Ok(())
    }

    /// labs (E7): quita la pausa. Solo el admin.
    pub fn unpause(env: Env) -> Result<(), EscrowError> {
        read_admin(&env)?.require_auth();
        env.storage().instance().remove(&DataKey::Paused);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.events().publish((symbol_short!("unpaused"),), ());
        Ok(())
    }

    /// labs (E7): si el contrato esta en pausa.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().has(&DataKey::Paused)
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
        validate_timeout_bounds(
            min_minutes,
            max_minutes,
            Self::claim_margin(env.clone())?,
            Self::dispute_window(env.clone())?,
        )?;
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

        // labs (E7): en pausa no entran trades nuevos.
        if Self::is_paused(env.clone()) {
            return Err(EscrowError::Paused);
        }

        if amount <= 0 || platform_fee < 0 {
            return Err(EscrowError::InsufficientAmount);
        }

        // labs (X1): en un trade grande, alguno de los dos tiene que tener tier. El
        // vendedor ya firmo; si el que tiene tier es el comprador, tambien firma.
        // Abajo del umbral no se consulta el registro.
        if let Some(gate) = Self::tier_gate(env.clone()) {
            if amount >= gate.threshold && !has_tier(&env, &gate, &seller) {
                if !has_tier(&env, &gate, &buyer) {
                    return Err(EscrowError::TierRequired);
                }
                buyer.require_auth();
            }
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
        // labs (E3): el trade guarda su margen; G tambien tiene que caber en u32.
        let margin_ledgers = Self::claim_margin(env.clone())?
            .checked_mul(LEDGERS_PER_MINUTE)
            .ok_or(EscrowError::LedgerOverflow)?;
        timeout_ledger
            .checked_add(margin_ledgers)
            .ok_or(EscrowError::LedgerOverflow)?;
        // labs (E5): el trade guarda el arbitro vigente, que no puede ser una de las
        // partes: el vendedor o el comprador se darian la razon a si mismos.
        let arbiter = Self::arbiter(env.clone());
        if let Some(a) = &arbiter {
            if *a == seller || *a == buyer {
                return Err(EscrowError::ArbiterIsParty);
            }
        }

        // labs (E4): el trade guarda tambien su plazo de disputa.
        let dispute_ledgers = Self::dispute_window(env.clone())?
            .checked_mul(LEDGERS_PER_MINUTE)
            .ok_or(EscrowError::LedgerOverflow)?;

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
            accepted: false,
            lock_ledger: env.ledger().sequence(),
            max_total_ledgers: bounds
                .max_minutes
                .checked_mul(LEDGERS_PER_MINUTE)
                .ok_or(EscrowError::LedgerOverflow)?,
            margin_ledgers,
            dispute_ledgers,
            dispute_deadline: 0,
            arbiter,
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

        // labs (E4): tambien en disputa; el comprador puede cobrar hasta que se cierre.
        if !is_open(&trade) {
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

        let token_client = token::Client::new(&env, &token_id);

        // Transfer escrow amount to buyer
        token_client.transfer(&env.current_contract_address(), &trade.buyer, &trade.amount);

        // labs (E11): la comision se queda en el contrato y se cobra aparte con
        // `claim_fees`. Si la billetera de MicoPay estuviera congelada o sin
        // trustline, en produccion el `release` fallaria y el comprador no cobraria.
        if trade.platform_fee > 0 {
            let accrued = Self::accrued_fees(env.clone())
                .checked_add(trade.platform_fee)
                .ok_or(EscrowError::AmountOverflow)?;
            env.storage().instance().set(&DataKey::AccruedFees, &accrued);
        }

        // labs (E6)
        bump_both(&env, &trade, |s| &mut s.completed);

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
    /// labs (E3): solo desde G = vencimiento + margen.
    pub fn refund(env: Env, trade_id: BytesN<32>) -> Result<(), EscrowError> {
        let mut trade: TradeEscrow = env
            .storage()
            .persistent()
            .get(&DataKey::Trade(trade_id.clone()))
            .ok_or(EscrowError::TradeNotFound)?;

        if !is_open(&trade) {
            return Err(EscrowError::TradeNotLocked);
        }

        // labs (E4): en disputa, refund espera hasta D. Desde D es la salida del
        // vendedor si nadie resuelve.
        if trade.status == TradeStatus::Disputed && env.ledger().sequence() < trade.dispute_deadline {
            return Err(EscrowError::DisputeOpen);
        }

        // Check that timeout HAS been reached
        if env.ledger().sequence() < trade.timeout_ledger {
            return Err(EscrowError::TimeoutNotReached);
        }
        // labs (E3): despues de vencer, el comprador conserva un margen para cobrar.
        if env.ledger().sequence() < grace_ledger(&trade)? {
            return Err(EscrowError::ClaimWindowOpen);
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

        // labs (E6): tambien el de D sin resolve; no cuenta como disputa perdida.
        bump_both(&env, &trade, |s| &mut s.refunded);
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

        if !is_open(&trade) {
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

        bump_both(&env, &trade, |s| &mut s.declined); // labs (E6)
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

    /// labs (E8): las dos partes acuerdan un vencimiento posterior. Las dos firman
    /// la misma llamada, asi que firman el mismo `new_timeout_ledger`. Solo mientras
    /// el trade siga `Locked` y antes de vencer, y sin pasar el tope de vida que
    /// el trade guardo al bloquear. En pausa no se puede (E7).
    pub fn extend(
        env: Env,
        trade_id: BytesN<32>,
        new_timeout_ledger: u32,
    ) -> Result<(), EscrowError> {
        if Self::is_paused(env.clone()) {
            return Err(EscrowError::Paused);
        }
        let mut trade: TradeEscrow = env
            .storage()
            .persistent()
            .get(&DataKey::Trade(trade_id.clone()))
            .ok_or(EscrowError::TradeNotFound)?;
        if trade.status != TradeStatus::Locked {
            return Err(EscrowError::TradeNotLocked);
        }
        trade.seller.require_auth();
        trade.buyer.require_auth();
        if env.ledger().sequence() >= trade.timeout_ledger {
            return Err(EscrowError::TimeoutReached);
        }
        if new_timeout_ledger <= trade.timeout_ledger {
            return Err(EscrowError::InvalidExtension);
        }
        let lifetime = new_timeout_ledger
            .checked_sub(trade.lock_ledger)
            .ok_or(EscrowError::LedgerOverflow)?;
        if lifetime > trade.max_total_ledgers {
            return Err(EscrowError::ExtensionAboveCap);
        }
        new_timeout_ledger
            .checked_add(trade.margin_ledgers)
            .ok_or(EscrowError::LedgerOverflow)?;

        let old_timeout_ledger = trade.timeout_ledger;
        trade.timeout_ledger = new_timeout_ledger;
        env.storage()
            .persistent()
            .set(&DataKey::Trade(trade_id.clone()), &trade);
        // max_total_ledgers < TTL_EXTEND (E1), asi que este TTL cubre el nuevo vencimiento.
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.storage().persistent().extend_ttl(
            &DataKey::Trade(trade_id.clone()),
            TTL_MIN,
            TTL_EXTEND,
        );
        env.events().publish(
            (symbol_short!("extended"),),
            (trade_id, old_timeout_ledger, new_timeout_ledger),
        );
        Ok(())
    }

    /// labs (E4): "ya pague". El comprador dice que pago el efectivo y no tiene el
    /// secreto. Solo entre el vencimiento T y G: antes de T nadie puede reembolsar,
    /// asi que reportar no protege nada y solo congelaria el dinero del vendedor.
    /// Pasa el trade a `Disputed` y fija D = max(G, ahora + plazo de disputa): desde
    /// D, `refund` vuelve a funcionar. Reportar nunca adelanta un reembolso.
    /// Funciona en pausa, como las salidas.
    pub fn report_paid(env: Env, trade_id: BytesN<32>) -> Result<u32, EscrowError> {
        let mut trade: TradeEscrow = env
            .storage()
            .persistent()
            .get(&DataKey::Trade(trade_id.clone()))
            .ok_or(EscrowError::TradeNotFound)?;
        if trade.status != TradeStatus::Locked {
            return Err(EscrowError::TradeNotLocked);
        }
        trade.buyer.require_auth();
        let now = env.ledger().sequence();
        if now < trade.timeout_ledger {
            return Err(EscrowError::TimeoutNotReached);
        }
        let grace = grace_ledger(&trade)?;
        if now >= grace {
            return Err(EscrowError::ClaimWindowClosed);
        }
        let deadline = now
            .checked_add(trade.dispute_ledgers)
            .ok_or(EscrowError::LedgerOverflow)?
            .max(grace);

        bump_both(&env, &trade, |s| &mut s.disputes_opened); // labs (E6)
        trade.status = TradeStatus::Disputed;
        trade.dispute_deadline = deadline;
        env.storage()
            .persistent()
            .set(&DataKey::Trade(trade_id.clone()), &trade);
        // D - ahora <= margen + plazo de disputa < TTL_EXTEND (R-4), asi que el trade
        // sigue vivo hasta D con colchon.
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.storage().persistent().extend_ttl(
            &DataKey::Trade(trade_id.clone()),
            TTL_EXTEND,
            TTL_EXTEND,
        );
        env.events().publish(
            (symbol_short!("disputed"),),
            (trade_id, trade.buyer, deadline),
        );
        Ok(deadline)
    }

    /// labs (E5, experimento): el arbitro guardado en el trade cierra una disputa.
    /// `to_buyer` = true paga el monto al comprador y la comision se acumula (E11);
    /// false regresa monto + comision al vendedor. Solo paga a las direcciones del
    /// trade. Funciona antes y despues de D, y en pausa. Mientras nadie cierre el
    /// trade, desde D tambien funciona `refund`.
    pub fn resolve(env: Env, trade_id: BytesN<32>, to_buyer: bool) -> Result<(), EscrowError> {
        let mut trade: TradeEscrow = env
            .storage()
            .persistent()
            .get(&DataKey::Trade(trade_id.clone()))
            .ok_or(EscrowError::TradeNotFound)?;
        if !is_open(&trade) {
            return Err(EscrowError::TradeNotLocked);
        }
        if trade.status != TradeStatus::Disputed {
            return Err(EscrowError::NotDisputed);
        }
        let arbiter = trade.arbiter.clone().ok_or(EscrowError::NoArbiter)?;
        arbiter.require_auth();

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenId)
            .ok_or(EscrowError::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_id);
        let (recipient, paid, fee) = if to_buyer {
            token_client.transfer(&env.current_contract_address(), &trade.buyer, &trade.amount);
            if trade.platform_fee > 0 {
                let accrued = Self::accrued_fees(env.clone())
                    .checked_add(trade.platform_fee)
                    .ok_or(EscrowError::AmountOverflow)?;
                env.storage().instance().set(&DataKey::AccruedFees, &accrued);
            }
            (trade.buyer.clone(), trade.amount, trade.platform_fee)
        } else {
            let total = trade
                .amount
                .checked_add(trade.platform_fee)
                .ok_or(EscrowError::AmountOverflow)?;
            token_client.transfer(&env.current_contract_address(), &trade.seller, &total);
            (trade.seller.clone(), total, 0i128)
        };

        // labs (E6): pierde la parte contra la que se resolvio.
        if trade.accepted {
            let loser = if to_buyer { &trade.seller } else { &trade.buyer };
            bump_stats(&env, loser, |s| &mut s.disputes_lost);
        }
        trade.status = TradeStatus::Resolved;
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
            (symbol_short!("resolved"),),
            (trade_id, arbiter, recipient, paid, fee),
        );
        Ok(())
    }

    /// labs (E12): el comprador firma que el trade es suyo, mientras siga abierto.
    /// No cambia como se libera ni a quien se paga: solo marca el trade para que
    /// cuente en las estadisticas. Asi nadie infla o ensucia una reputacion con
    /// trades entre cuentas propias o con un comprador que nunca firmo.
    pub fn accept(env: Env, trade_id: BytesN<32>) -> Result<(), EscrowError> {
        let mut trade: TradeEscrow = env
            .storage()
            .persistent()
            .get(&DataKey::Trade(trade_id.clone()))
            .ok_or(EscrowError::TradeNotFound)?;
        if !is_open(&trade) {
            return Err(EscrowError::TradeNotLocked);
        }
        trade.buyer.require_auth();
        if trade.accepted {
            return Err(EscrowError::AlreadyAccepted);
        }
        trade.accepted = true;
        env.storage()
            .persistent()
            .set(&DataKey::Trade(trade_id.clone()), &trade);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        env.storage().persistent().extend_ttl(
            &DataKey::Trade(trade_id.clone()),
            TTL_MIN,
            TTL_EXTEND,
        );
        env.events()
            .publish((symbol_short!("accepted"),), (trade_id, trade.buyer));
        Ok(())
    }

    /// labs (E6): operaciones de `address` en trades aceptados. Una direccion sin
    /// trades da todo en 0.
    pub fn stats(env: Env, address: Address) -> Stats {
        env.storage()
            .persistent()
            .get(&DataKey::Stats(address))
            .unwrap_or_default()
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
